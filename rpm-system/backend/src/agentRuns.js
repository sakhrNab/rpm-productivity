// Agents control centre: /api/business/agent-runs. RPM never executes a job. It QUEUES runs and DISPLAYS
// what the owner's local runner reports back. The runner authenticates with a personal access token (write
// scope) and is the only caller allowed to claim and report; the browser can list, queue and cancel.
// Every statement is scoped by user_id.

const express = require('express');
const { APPS, blockedCapabilities } = require('./missionCapabilities');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STATUSES = ['queued', 'running', 'done', 'failed', 'cancelled'];
const TERMINAL = ['done', 'failed', 'cancelled'];
const MAX_QUEUED = 20;

// Mirrors the local Revenue Agents jobs (cx app "revenue-agents", skills revenue-agents-<id>).
// inputs: { key, label, type: 'choice' | 'text', options?, default, max?, pattern? }
const JOBS = [
  {
    id: 'morning-brief', title: 'Morning brief', icon: 'sunrise', outputs: ['brief.md'],
    what: "Reads today's and this week's RPM actions plus the leads that need a next step, and writes a one-page brief with a suggested top 3.",
    inputs: [],
  },
  {
    id: 'upwork-scout', title: 'Upwork scout', icon: 'search', outputs: ['jobs.md', 'proposal-1..5.md'],
    what: "Reads Upwork 'Best matches' and one search, scores each job against your offers and drafts 5 proposals as files. Never submits.",
    inputs: [{ key: 'search', label: 'Search', type: 'choice', default: 'email automation',
      options: ['best-matches', 'email automation', 'support inbox AI', 'n8n', 'EmailBison'] }],
  },
  {
    id: 'prospect-list', title: 'Prospect list', icon: 'users', outputs: ['cost-estimate.md', 'prospects.csv', 'first-lines.md'],
    what: 'Finds businesses for a sector and city with LeadWave, researches the top 10, saves a segment and writes first lines.',
    inputs: [
      { key: 'sector', label: 'Sector', type: 'choice', default: 'support', options: ['bison', 'support', 'realestate', 'dental', 'agencies', 'local'] },
      { key: 'city', label: 'City', type: 'text', default: 'Berlin', max: 60, pattern: "^[\\p{L}\\p{N} .,'-]*$" },
      { key: 'source', label: 'Source', type: 'choice', default: 'osm', options: ['osm', 'google_places'] },
    ],
    // Google Places costs money: queueing it needs an explicit confirmation, and the runner asks again per search.
    confirm: { when: { source: 'google_places' }, text: 'Google Places costs money beyond the free tier ($0.035 per 20 results after 1,000 free searches a month). The runner still asks before every search.' },
  },
  {
    id: 'skool-digest', title: 'Skool digest', icon: 'messages', outputs: ['digest.md', 'reply-drafts.md'],
    what: 'Reads new posts and DMs in your Skool community and Maker School, then writes a digest and reply drafts.',
    inputs: [{ key: 'communities', label: 'Communities', type: 'choice', default: 'both', options: ['both', 'awr', 'maker'] }],
  },
  {
    id: 'reply-review', title: 'Reply drafts review', icon: 'inbox', outputs: ['reply-quality.md'],
    what: 'Reads Reply Autopilot inboxes, pending drafts and recent emails and writes a quality report. Nothing is sent or edited.',
    inputs: [],
  },
  {
    id: 'rpm-sync', title: 'RPM sync', icon: 'refresh', outputs: ['rpm-drift.md'],
    what: "Compares the plan's fastest path and fix list with your RPM actions, adds the missing ones and writes a drift report.",
    inputs: [],
  },
  {
    id: 'weekly-review', title: 'Weekly review', icon: 'calendar', outputs: ['weekly-review.md'],
    what: 'Combines the RPM weekly review and goal forecast with the revenue model into a review and a suggested plan for next week.',
    inputs: [],
  },
];
const JOB = Object.fromEntries(JOBS.map((j) => [j.id, j]));

class Invalid extends Error {}

/** Validated inputs for a job (unknown keys dropped, defaults filled). Throws Invalid. */
function cleanInputs(job, raw) {
  const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const out = {};
  for (const f of job.inputs) {
    let v = src[f.key];
    if (v === undefined || v === null || v === '') v = f.default;
    if (typeof v !== 'string') throw new Invalid(`${f.label} must be text`);
    v = v.trim();
    if (f.type === 'choice' && !f.options.includes(v)) throw new Invalid(`${f.label} must be one of: ${f.options.join(', ')}`);
    if (f.type === 'text') {
      if (v.length > (f.max || 200)) throw new Invalid(`${f.label} is too long (max ${f.max || 200} characters)`);
      if (f.pattern && !new RegExp(f.pattern, 'u').test(v)) throw new Invalid(`${f.label} has characters that are not allowed`);
    }
    out[f.key] = v;
  }
  return out;
}
const needsConfirm = (job, inputs) => !!job.confirm && Object.entries(job.confirm.when).every(([k, v]) => inputs[k] === v);

const OUTBOX_KINDS = ['markdown', 'csv', 'text', 'json', 'leads', 'proposal', 'report'];
function cleanOutbox(v) {
  if (v === undefined) return undefined;
  if (!Array.isArray(v) || v.length > 50) throw new Invalid('outbox must be a list of at most 50 items');
  return v.map((o) => {
    if (!o || typeof o !== 'object' || Array.isArray(o)) throw new Invalid('outbox items must be objects');
    const name = typeof o.name === 'string' ? o.name.trim().slice(0, 200) : '';
    if (!name) throw new Invalid('outbox item name is required');
    const kind = OUTBOX_KINDS.includes(o.kind) ? o.kind : 'text';
    const preview = typeof o.preview === 'string' ? o.preview.slice(0, 20000) : '';
    return { name, kind, preview };
  });
}

// ───────── SQL (exported so the tests' fake pool can implement exactly these) ─────────
const SQL = {
  // The planner's own runs are internal to a mission and not listed.
  list: "SELECT * FROM biz_agent_runs WHERE user_id = $1 AND job_id <> 'mission-plan' ORDER BY created_at DESC LIMIT 30",
  get: 'SELECT * FROM biz_agent_runs WHERE id = $1 AND user_id = $2',
  countQueued: "SELECT COUNT(*)::int AS c FROM biz_agent_runs WHERE user_id = $1 AND status = 'queued'",
  insert: "INSERT INTO biz_agent_runs (user_id, job_id, inputs, status) VALUES ($1, $2, $3, 'queued') RETURNING *",
  cancel: `UPDATE biz_agent_runs SET status = 'cancelled', finished_at = NOW()
            WHERE id = $1 AND user_id = $2 AND status IN ('queued', 'running') RETURNING *`,
  runner: 'SELECT runner, last_claim_at, apps FROM biz_agent_runner WHERE user_id = $1',
  // $3 = apps (jsonb) or NULL (an old runner that sends none: keep what is stored).
  heartbeat: `INSERT INTO biz_agent_runner (user_id, runner, last_claim_at, apps) VALUES ($1, $2, NOW(), COALESCE($3::jsonb, '{}'::jsonb))
               ON CONFLICT (user_id) DO UPDATE SET runner = EXCLUDED.runner, last_claim_at = NOW(), apps = COALESCE($3::jsonb, biz_agent_runner.apps)`,
  // One statement: pick the oldest queued run of this user that may start, lock it, skip rows another claimer holds,
  // flip it. Two runners polling at once can never both get the same run.
  // May start = every step it depends on (same mission, step_key in depends_on) is done, and its capability is not
  // in $3 (capabilities whose apps are not connected, or busy, right now).
  claim: `UPDATE biz_agent_runs SET status = 'running', started_at = NOW(), runner = $2
           WHERE user_id = $1 AND status = 'queued' AND id = (
             SELECT r.id FROM biz_agent_runs r WHERE r.user_id = $1 AND r.status = 'queued'
                AND (r.capability IS NULL OR r.capability <> ALL($3::text[]))
                AND NOT EXISTS (SELECT 1 FROM unnest(r.depends_on) AS k WHERE NOT EXISTS (
                      SELECT 1 FROM biz_agent_runs d WHERE d.mission_id = r.mission_id AND d.step_key = k AND d.status = 'done'))
              ORDER BY r.created_at ASC LIMIT 1 FOR UPDATE OF r SKIP LOCKED)
           RETURNING *`,
  // Finished steps whose output the claimed step may read (the runner copies those files into its run folder).
  upstream: "SELECT step_key, id, capability, outbox FROM biz_agent_runs WHERE mission_id = $1 AND user_id = $2 AND status = 'done' AND step_key = ANY($3::text[])",
  report: `UPDATE biz_agent_runs SET status = $3::varchar, summary = COALESCE($4::text, summary), outbox = COALESCE($5::jsonb, outbox),
             cost_usd = COALESCE($6::numeric, cost_usd), finished_at = CASE WHEN $3::varchar IN ('done', 'failed') THEN NOW() ELSE finished_at END
           WHERE id = $1 AND user_id = $2 AND status = 'running' RETURNING *`,
};

const num = (v) => (v === null || v === undefined ? null : Number(v));
const shape = (r) => (r ? { ...r, cost_usd: num(r.cost_usd), inputs: r.inputs || {}, outbox: r.outbox || [] } : r);

/** apps from a runner request: undefined/null = not sent; otherwise every known app as a strict boolean. */
function cleanApps(v) {
  if (v === undefined || v === null) return null;
  if (typeof v !== 'object' || Array.isArray(v)) throw new Invalid('apps must be an object of booleans');
  const out = {};
  for (const a of APPS) {
    if (v[a] !== undefined && typeof v[a] !== 'boolean') throw new Invalid(`apps.${a} must be true or false`);
    out[a] = v[a] === true;
  }
  return out;
}

// `missions` = hooks from missions.js createHooks(pool) (settle / prepareReport / afterChange); null = no missions.
function createAgentRunsRouter({ pool, missions = null }) {
  const router = express.Router();
  const wrap = (fn) => async (req, res) => {
    try { await fn(req, res); } catch (e) {
      if (e instanceof Invalid) return res.status(400).json({ error: e.message });
      console.error(`[agent-runs] ${req.method} ${req.path}:`, e.message);
      res.status(500).json({ error: 'Agent runs request failed' });
    }
  };
  // claim / report: only the local runner, i.e. a personal access token with the write scope.
  const runnerOnly = (req, res) => {
    if (req.authKind === 'pat' && (req.patScopes || []).includes('write')) return true;
    res.status(403).json({ error: 'Only the local runner (an access token with write scope) can do this' });
    return false;
  };
  const runnerOf = async (userId) => (await pool.query(SQL.runner, [userId])).rows[0] || null;

  router.get('/jobs', wrap(async (req, res) => res.json({ jobs: JOBS, runner: await runnerOf(req.userId) })));

  router.get('/', wrap(async (req, res) => {
    const { rows } = await pool.query(SQL.list, [req.userId]);
    res.json({ runs: rows.map(shape), runner: await runnerOf(req.userId) });
  }));

  // Heartbeat: "I am here and these apps are connected" — does NOT claim anything (the runner calls it every 30 s,
  // also while it is busy, so a long run no longer looks offline).
  router.post('/heartbeat', wrap(async (req, res) => {
    if (!runnerOnly(req, res)) return;
    const runner = typeof req.body?.runner === 'string' ? req.body.runner.trim().slice(0, 120) : '';
    const apps = cleanApps(req.body?.apps);
    await pool.query(SQL.heartbeat, [req.userId, runner, apps ? JSON.stringify(apps) : null]);
    res.json({ ok: true });
  }));

  router.post('/claim', wrap(async (req, res) => {
    if (!runnerOnly(req, res)) return;
    const runner = typeof req.body?.runner === 'string' ? req.body.runner.trim().slice(0, 120) : '';
    const apps = cleanApps(req.body?.apps);
    // busy_apps: apps this runner cannot use right now although connected (e.g. the browser is held by a running step).
    const busy = Array.isArray(req.body?.busy_apps) ? req.body.busy_apps.filter((a) => APPS.includes(a)) : [];
    await pool.query(SQL.heartbeat, [req.userId, runner, apps ? JSON.stringify(apps) : null]);
    if (missions) await missions.settle(req.userId);
    // A step is only ever handed out when its apps are reported connected. A runner that sends no apps (older
    // version) is never given a step that needs one: its stored apps (or none) decide.
    const known = apps || (await runnerOf(req.userId))?.apps || {};
    const blocked = blockedCapabilities(known, busy);
    const { rows } = await pool.query(SQL.claim, [req.userId, runner, blocked]);
    const run = shape(rows[0]) || null;
    if (run && run.mission_id && (run.depends_on || []).length) {
      run.upstream = (await pool.query(SQL.upstream, [run.mission_id, req.userId, run.depends_on])).rows
        .map((u) => ({ step_key: u.step_key, run_id: u.id, capability: u.capability, outbox: u.outbox || [] }));
    }
    res.json({ run });
  }));

  router.get('/:id', wrap(async (req, res) => {
    if (!UUID.test(req.params.id)) return res.status(404).json({ error: 'Not found' });
    const { rows } = await pool.query(SQL.get, [req.params.id, req.userId]);
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json(shape(rows[0]));
  }));

  router.post('/', wrap(async (req, res) => {
    const job = Object.prototype.hasOwnProperty.call(JOB, req.body?.job_id) ? JOB[req.body.job_id] : null;
    if (!job) throw new Invalid(`job_id must be one of: ${JOBS.map((j) => j.id).join(', ')}`);
    const inputs = cleanInputs(job, req.body.inputs);
    if (needsConfirm(job, inputs) && req.body.confirmed !== true) {
      return res.status(409).json({ error: job.confirm.text, needs_confirmation: true });
    }
    const { rows: c } = await pool.query(SQL.countQueued, [req.userId]);
    if ((c[0]?.c || 0) >= MAX_QUEUED) throw new Invalid(`At most ${MAX_QUEUED} runs can wait in the queue`);
    const { rows } = await pool.query(SQL.insert, [req.userId, job.id, JSON.stringify(inputs)]);
    res.status(201).json(shape(rows[0]));
  }));

  router.post('/:id/cancel', wrap(async (req, res) => {
    if (!UUID.test(req.params.id)) return res.status(404).json({ error: 'Not found' });
    const { rows } = await pool.query(SQL.cancel, [req.params.id, req.userId]);
    if (rows[0]) {
      if (missions && rows[0].mission_id) await missions.afterChange(rows[0]);
      return res.json(shape(rows[0]));
    }
    const { rows: cur } = await pool.query(SQL.get, [req.params.id, req.userId]);
    if (!cur[0]) return res.status(404).json({ error: 'Not found' });
    res.status(409).json({ error: `This run is already ${cur[0].status}` });
  }));

  router.post('/:id/report', wrap(async (req, res) => {
    if (!runnerOnly(req, res)) return;
    if (!UUID.test(req.params.id)) return res.status(404).json({ error: 'Not found' });
    const b = req.body || {};
    if (!['running', 'done', 'failed'].includes(b.status)) throw new Invalid('status must be one of: running, done, failed');
    const summary = b.summary === undefined ? null : typeof b.summary === 'string' ? b.summary.slice(0, 50000) : (() => { throw new Invalid('summary must be text'); })();
    const outbox = cleanOutbox(b.outbox);
    let cost = null;
    if (b.cost_usd !== undefined && b.cost_usd !== null) {
      cost = Number(b.cost_usd);
      if (!Number.isFinite(cost) || cost < 0 || cost > 10000) throw new Invalid('cost_usd must be a number from 0 to 10000');
    }
    const { rows: before } = await pool.query(SQL.get, [req.params.id, req.userId]);
    if (!before[0]) return res.status(404).json({ error: 'Not found' });
    // The planner's report may carry a plan: validated here, before anything is stored (a bad plan fails the mission).
    let status = b.status;
    let finalSummary = summary;
    let plan = null;
    if (b.plan !== undefined && before[0].job_id !== 'mission-plan') throw new Invalid('plan is only accepted from the mission planner');
    if (missions && before[0].job_id === 'mission-plan' && status === 'done') {
      const checked = missions.checkPlan(b.plan);
      if (checked.ok) plan = checked.plan;
      else { status = 'failed'; finalSummary = `Plan rejected: ${checked.error}`; }
    }
    const { rows } = await pool.query(SQL.report, [req.params.id, req.userId, status, finalSummary, outbox === undefined ? null : JSON.stringify(outbox), cost]);
    if (rows[0]) {
      if (missions && rows[0].mission_id && status !== 'running') await missions.afterChange(rows[0], plan);
      return res.json(shape(rows[0]));
    }
    const cur = before;
    // Cancelled (or already finished) in RPM: tell the runner to stop.
    res.status(409).json({ error: `This run is ${cur[0].status}`, status: cur[0].status });
  }));

  return router;
}

module.exports = { createAgentRunsRouter, shape, cleanApps, MAX_QUEUED, JOBS, SQL, cleanInputs, cleanOutbox, needsConfirm, STATUSES, TERMINAL, Invalid };
