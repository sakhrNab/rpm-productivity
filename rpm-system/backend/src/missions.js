// Missions: /api/business/missions. The owner types a task in plain words; a tool-less PLANNER run (job 'mission-plan',
// executed by the owner's local runner) turns it into a plan of steps (capabilities); the owner approves; one queued
// run per approved step is created and the local runner works them (in parallel where independent) once their
// dependencies are done and the apps they need are connected. RPM never executes anything.
// Every statement is scoped by user_id. Claim / report / heartbeat stay in agentRuns.js (write-scope token only).

const express = require('express');
const { Invalid, shape, MAX_QUEUED, SQL: RUN_SQL } = require('./agentRuns');
const caps = require('./missionCapabilities');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const OPEN = ['planning', 'awaiting_approval', 'running'];
const MAX_OPEN_MISSIONS = 5;
const TEXT_MIN = 5;
const TEXT_MAX = 2000;
const PLAN_STEP = '_plan';

const SQL = {
  list: 'SELECT * FROM biz_agent_missions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20',
  get: 'SELECT * FROM biz_agent_missions WHERE id = $1 AND user_id = $2',
  countOpen: "SELECT COUNT(*)::int AS c FROM biz_agent_missions WHERE user_id = $1 AND status IN ('planning', 'awaiting_approval', 'running')",
  insert: "INSERT INTO biz_agent_missions (user_id, text, status) VALUES ($1, $2, 'planning') RETURNING *",
  // from-status guard ($5): a mission only moves along planning -> awaiting_approval -> running -> done|failed|cancelled
  transition: `UPDATE biz_agent_missions SET status = $3::varchar, plan = COALESCE($4::jsonb, plan),
                 finished_at = CASE WHEN $3::varchar IN ('done', 'failed', 'cancelled') THEN NOW() ELSE finished_at END
               WHERE id = $1 AND user_id = $2 AND status = $5::varchar RETURNING *`,
  cancel: `UPDATE biz_agent_missions SET status = 'cancelled', finished_at = NOW()
            WHERE id = $1 AND user_id = $2 AND status IN ('planning', 'awaiting_approval', 'running') RETURNING *`,
  runsFull: 'SELECT * FROM biz_agent_runs WHERE mission_id = $1 AND user_id = $2 ORDER BY created_at ASC, step_key ASC',
  runsLite: `SELECT id, mission_id, step_key, capability, job_id, status, depends_on, cost_usd, started_at, finished_at, created_at,
                    jsonb_array_length(outbox)::int AS files
               FROM biz_agent_runs WHERE user_id = $1 AND mission_id = ANY($2::uuid[]) ORDER BY created_at ASC, step_key ASC`,
  insertPlanRun: "INSERT INTO biz_agent_runs (user_id, job_id, inputs, status, mission_id, step_key) VALUES ($1, 'mission-plan', $2, 'queued', $3, '_plan') RETURNING *",
  insertStep: `INSERT INTO biz_agent_runs (user_id, job_id, inputs, status, mission_id, step_key, depends_on, capability)
               VALUES ($1, $2, $3, 'queued', $4, $5, $6::text[], $7) RETURNING *`,
  cancelRuns: "UPDATE biz_agent_runs SET status = 'cancelled', finished_at = NOW() WHERE mission_id = $1 AND user_id = $2 AND status IN ('queued', 'running') RETURNING id",
  // A queued step whose dependency failed or was cancelled can never run: it is failed ("skipped") here.
  skipBlocked: `UPDATE biz_agent_runs r SET status = 'failed', summary = 'Skipped: a step this one needs failed or was cancelled.', finished_at = NOW()
                 WHERE r.user_id = $1 AND r.status = 'queued' AND r.mission_id IS NOT NULL AND EXISTS (
                   SELECT 1 FROM unnest(r.depends_on) AS k JOIN biz_agent_runs d ON d.mission_id = r.mission_id AND d.step_key = k
                    WHERE d.status IN ('failed', 'cancelled'))
                 RETURNING r.mission_id`,
};

const TERMINAL = ['done', 'failed', 'cancelled'];

/** Mission status from its step runs (the planner run is not a step). null = still going. */
function rollupStatus(steps) {
  if (!steps.length || steps.some((s) => !TERMINAL.includes(s.status))) return null;
  if (steps.every((s) => s.status === 'done')) return 'done';
  return steps.some((s) => s.status === 'failed') ? 'failed' : 'cancelled';
}

function createHooks(pool) {
  const transition = async (id, userId, to, from, plan = null) =>
    (await pool.query(SQL.transition, [id, userId, to, plan ? JSON.stringify(plan) : null, from])).rows[0] || null;

  async function rollup(userId, missionId) {
    const { rows: m } = await pool.query(SQL.get, [missionId, userId]);
    if (!m[0] || m[0].status !== 'running') return;
    const { rows } = await pool.query(SQL.runsFull, [missionId, userId]);
    const to = rollupStatus(rows.filter((r) => r.step_key !== PLAN_STEP));
    if (to) await transition(missionId, userId, to, 'running');
  }

  /** Fails queued steps behind a failed / cancelled step (repeats for chains), then rolls the missions up. */
  async function settle(userId) {
    const touched = new Set();
    for (let i = 0; i < caps.MAX_STEPS + 1; i++) {
      const { rows } = await pool.query(SQL.skipBlocked, [userId]);
      if (!rows.length) break;
      rows.forEach((r) => touched.add(r.mission_id));
    }
    for (const id of touched) await rollup(userId, id);
  }

  return {
    settle,
    transition,
    /** { ok, plan } | { ok:false, error } — strict validation against the capability list shipped here. */
    checkPlan(raw) {
      try { return { ok: true, plan: caps.validatePlan(raw) }; } catch (e) {
        if (e instanceof caps.PlanError) return { ok: false, error: e.message };
        throw e;
      }
    },
    /** A run of a mission changed (report / cancel). `plan` = the validated plan the planner reported, if any. */
    async afterChange(run, plan = null) {
      if (!run.mission_id) return;
      if (run.job_id === 'mission-plan') {
        if (run.status === 'done' && plan) {
          if (plan.steps.length === 0) await transition(run.mission_id, run.user_id, 'failed', 'planning', { ...plan, error: 'The planner found nothing among the available capabilities that does this.' });
          else await transition(run.mission_id, run.user_id, 'awaiting_approval', 'planning', plan);
        } else if (run.status === 'done') {
          await transition(run.mission_id, run.user_id, 'failed', 'planning', { summary: '', steps: [], error: 'The planner finished without a plan.' });
        } else if (run.status === 'failed') {
          await transition(run.mission_id, run.user_id, 'failed', 'planning', { summary: '', steps: [], error: String(run.summary || 'The planner failed.').slice(0, 500) });
        } else if (run.status === 'cancelled') {
          await pool.query(SQL.cancel, [run.mission_id, run.user_id]);
        }
        return;
      }
      await settle(run.user_id);
      await rollup(run.user_id, run.mission_id);
    },
  };
}

const publicSteps = (rows) => rows.filter((r) => r.step_key !== PLAN_STEP).map(shape);

function createMissionsRouter({ pool }) {
  const router = express.Router();
  const hooks = createHooks(pool);
  const wrap = (fn) => async (req, res) => {
    try { await fn(req, res); } catch (e) {
      if (e instanceof Invalid || e instanceof caps.PlanError) return res.status(400).json({ error: e.message });
      console.error(`[missions] ${req.method} ${req.path}:`, e.message);
      res.status(500).json({ error: 'Missions request failed' });
    }
  };
  const runnerApps = async (userId) => {
    const { rows } = await pool.query(RUN_SQL.runner, [userId]);
    return { runner: rows[0] || null, apps: rows[0]?.apps || {} };
  };
  const detail = async (m, userId) => {
    const { rows } = await pool.query(SQL.runsFull, [m.id, userId]);
    const planRun = rows.find((r) => r.step_key === PLAN_STEP);
    return { ...m, steps: publicSteps(rows), plan_run: planRun ? { id: planRun.id, status: planRun.status, summary: planRun.summary, cost_usd: shape(planRun).cost_usd } : null };
  };
  const loadDetail = async (id, userId) => {
    const { rows } = await pool.query(SQL.get, [id, userId]);
    return rows[0] ? detail(rows[0], userId) : null;
  };

  router.get('/capabilities', wrap(async (req, res) => {
    const { runner } = await runnerApps(req.userId);
    res.json({ capabilities: caps.publicCatalogue(), runner });
  }));

  router.get('/', wrap(async (req, res) => {
    await hooks.settle(req.userId);
    const { rows } = await pool.query(SQL.list, [req.userId]);
    const steps = rows.length ? (await pool.query(SQL.runsLite, [req.userId, rows.map((m) => m.id)])).rows : [];
    const { runner } = await runnerApps(req.userId);
    res.json({
      missions: rows.map((m) => ({ ...m, steps: steps.filter((s) => s.mission_id === m.id && s.step_key !== PLAN_STEP).map((s) => ({ ...s, cost_usd: s.cost_usd == null ? null : Number(s.cost_usd) })) })),
      runner,
    });
  }));

  router.post('/', wrap(async (req, res) => {
    const text = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
    if (text.length < TEXT_MIN || text.length > TEXT_MAX) throw new Invalid(`Describe the task in ${TEXT_MIN} to ${TEXT_MAX} characters`);
    const open = (await pool.query(SQL.countOpen, [req.userId])).rows[0]?.c || 0;
    if (open >= MAX_OPEN_MISSIONS) throw new Invalid(`At most ${MAX_OPEN_MISSIONS} missions can be open at once. Finish or cancel one first.`);
    const queued = (await pool.query(RUN_SQL.countQueued, [req.userId])).rows[0]?.c || 0;
    if (queued >= MAX_QUEUED) throw new Invalid(`At most ${MAX_QUEUED} runs can wait in the queue`);
    const m = (await pool.query(SQL.insert, [req.userId, text])).rows[0];
    try {
      await pool.query(SQL.insertPlanRun, [req.userId, JSON.stringify({ text }), m.id]);
    } catch (e) {
      await pool.query(SQL.cancel, [m.id, req.userId]);
      throw e;
    }
    res.status(201).json(await detail(m, req.userId));
  }));

  router.get('/:id', wrap(async (req, res) => {
    if (!UUID.test(req.params.id)) return res.status(404).json({ error: 'Not found' });
    await hooks.settle(req.userId);
    const m = await loadDetail(req.params.id, req.userId);
    if (!m) return res.status(404).json({ error: 'Not found' });
    res.json(m);
  }));

  router.post('/:id/approve', wrap(async (req, res) => {
    if (!UUID.test(req.params.id)) return res.status(404).json({ error: 'Not found' });
    const { rows } = await pool.query(SQL.get, [req.params.id, req.userId]);
    const m = rows[0];
    if (!m) return res.status(404).json({ error: 'Not found' });
    if (m.status !== 'awaiting_approval') return res.status(409).json({ error: `This mission is ${m.status}, not waiting for approval`, status: m.status });
    const plan = caps.validatePlan(m.plan); // the stored plan is re-checked against today's capability list
    const asked = req.body?.steps;
    if (!Array.isArray(asked) || asked.length < 1 || asked.length > caps.MAX_STEPS) throw new Invalid('steps must list the steps to run (1 to 8)');
    const chosen = new Map();
    for (const a of asked) {
      if (!a || typeof a !== 'object' || typeof a.key !== 'string') throw new Invalid('every step needs a key');
      if (a.confirmed !== undefined && typeof a.confirmed !== 'boolean') throw new Invalid('confirmed must be true or false');
      if (chosen.has(a.key)) throw new Invalid(`step "${a.key}" is listed twice`);
      if (!plan.steps.some((s) => s.key === a.key)) throw new Invalid(`step "${String(a.key).slice(0, 30)}" is not in the plan`);
      chosen.set(a.key, a.confirmed === true);
    }
    const steps = plan.steps.filter((s) => chosen.has(s.key));
    for (const s of steps) for (const d of s.depends_on) {
      if (!chosen.has(d)) throw new Invalid(`step "${s.key}" needs "${d}", which is not approved`);
    }
    // 1) apps: a step whose apps are not connected is never queued
    const { apps } = await runnerApps(req.userId);
    const blocked = steps.map((s) => ({ key: s.key, missing: caps.missingApps(caps.CAP[s.capability], apps) })).filter((b) => b.missing.length);
    if (blocked.length) {
      return res.status(409).json({
        error: `Connect first: ${blocked.map((b) => `${b.key} needs ${b.missing.map((a) => caps.APP_LABEL[a]).join(', ')}`).join('; ')}`,
        blocked,
      });
    }
    // 2) paid / outward steps need the owner's explicit confirmation
    const unconfirmed = steps.filter((s) => caps.stepNeedsConfirm(caps.CAP[s.capability], s.inputs) && !chosen.get(s.key)).map((s) => s.key);
    if (unconfirmed.length) {
      return res.status(409).json({ error: `Confirm first: ${unconfirmed.join(', ')} costs money or reads outside sites in your browser.`, needs_confirmation: true, keys: unconfirmed });
    }
    const queued = (await pool.query(RUN_SQL.countQueued, [req.userId])).rows[0]?.c || 0;
    if (queued + steps.length > MAX_QUEUED) throw new Invalid(`At most ${MAX_QUEUED} runs can wait in the queue`);
    // 3) flip first: of two simultaneous approvals only one gets the mission
    const running = await hooks.transition(m.id, req.userId, 'running', 'awaiting_approval');
    if (!running) return res.status(409).json({ error: 'This mission was already approved or cancelled' });
    try {
      for (const s of steps) {
        await pool.query(SQL.insertStep, [req.userId, caps.CAP[s.capability].job, JSON.stringify(s.inputs), m.id, s.key, s.depends_on, s.capability]);
      }
    } catch (e) {
      await pool.query(SQL.cancelRuns, [m.id, req.userId]);
      await hooks.transition(m.id, req.userId, 'failed', 'running');
      throw e;
    }
    res.json(await loadDetail(m.id, req.userId));
  }));

  router.post('/:id/cancel', wrap(async (req, res) => {
    if (!UUID.test(req.params.id)) return res.status(404).json({ error: 'Not found' });
    const { rows } = await pool.query(SQL.cancel, [req.params.id, req.userId]);
    if (!rows[0]) {
      const cur = (await pool.query(SQL.get, [req.params.id, req.userId])).rows[0];
      if (!cur) return res.status(404).json({ error: 'Not found' });
      return res.status(409).json({ error: `This mission is already ${cur.status}` });
    }
    await pool.query(SQL.cancelRuns, [req.params.id, req.userId]); // the runner stops on its next report (409 cancelled)
    res.json(await loadDetail(req.params.id, req.userId));
  }));

  return router;
}

module.exports = { createMissionsRouter, createHooks, SQL, rollupStatus, OPEN, TERMINAL, MAX_OPEN_MISSIONS, TEXT_MIN, TEXT_MAX, PLAN_STEP };
