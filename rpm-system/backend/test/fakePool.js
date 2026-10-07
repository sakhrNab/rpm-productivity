// Shared test double for agentRuns.js + missions.js. Implements EXACTLY the statements in both SQL objects (anything
// else throws) and runs each one atomically, as Postgres does for a single statement. The real statements are
// exercised against a real Postgres in the live e2e; this keeps the unit tests fast and the semantics honest.
const express = require('express');
const crypto = require('crypto');
const { createAgentRunsRouter, SQL: RUN_SQL } = require('../src/agentRuns');
const { createMissionsRouter, createHooks, SQL: M_SQL } = require('../src/missions');

const norm = (s) => s.replace(/\s+/g, ' ').trim();
const table = {};
for (const [k, v] of Object.entries(RUN_SQL)) table[norm(v)] = `run.${k}`;
for (const [k, v] of Object.entries(M_SQL)) table[norm(v)] = `mission.${k}`;

const TERMINAL = ['done', 'failed', 'cancelled'];

function fakePool() {
  const runs = [];
  const missions = [];
  const runner = {};
  let clock = 0;
  const tick = () => new Date(Date.UTC(2026, 9, 9, 9, 0, clock++));
  const newRun = (o) => {
    const r = { id: crypto.randomUUID(), user_id: o.user_id, job_id: o.job_id, inputs: o.inputs, status: 'queued', runner: '', summary: '', outbox: [], cost_usd: null,
      created_at: tick(), started_at: null, finished_at: null, mission_id: o.mission_id || null, step_key: o.step_key || null, depends_on: o.depends_on || [], capability: o.capability || null };
    runs.push(r); return r;
  };
  const depDone = (r) => r.depends_on.every((k) => runs.some((d) => d.mission_id === r.mission_id && d.step_key === k && d.status === 'done'));
  const h = {
    'run.list': ([u]) => runs.filter((r) => r.user_id === u && r.job_id !== 'mission-plan').sort((a, b) => b.created_at - a.created_at).slice(0, 30),
    'run.get': ([id, u]) => runs.filter((r) => r.id === id && r.user_id === u),
    'run.countQueued': ([u]) => [{ c: runs.filter((r) => r.user_id === u && r.status === 'queued').length }],
    'run.insert': ([u, job, inputs]) => [newRun({ user_id: u, job_id: job, inputs: JSON.parse(inputs) })],
    'run.cancel': ([id, u]) => runs.filter((r) => r.id === id && r.user_id === u && ['queued', 'running'].includes(r.status)).map((r) => Object.assign(r, { status: 'cancelled', finished_at: tick() })),
    'run.runner': ([u]) => (runner[u] ? [runner[u]] : []),
    'run.heartbeat': ([u, name, apps]) => { runner[u] = { runner: name, last_claim_at: tick(), apps: apps ? JSON.parse(apps) : runner[u]?.apps || {} }; return []; },
    'run.claim': ([u, name, blocked]) => {
      const next = runs.filter((r) => r.user_id === u && r.status === 'queued' && (!r.capability || !blocked.includes(r.capability)) && depDone(r))
        .sort((a, b) => a.created_at - b.created_at)[0];
      if (!next) return [];
      return [Object.assign(next, { status: 'running', started_at: tick(), runner: name })];
    },
    'run.upstream': ([mid, u, keys]) => runs.filter((r) => r.mission_id === mid && r.user_id === u && r.status === 'done' && keys.includes(r.step_key)),
    'run.report': ([id, u, status, summary, outbox, cost]) => runs.filter((r) => r.id === id && r.user_id === u && r.status === 'running')
      .map((r) => Object.assign(r, { status, summary: summary ?? r.summary, outbox: outbox ? JSON.parse(outbox) : r.outbox, cost_usd: cost ?? r.cost_usd,
        finished_at: ['done', 'failed'].includes(status) ? tick() : r.finished_at })),
    'mission.list': ([u]) => missions.filter((m) => m.user_id === u).sort((a, b) => b.created_at - a.created_at).slice(0, 20),
    'mission.get': ([id, u]) => missions.filter((m) => m.id === id && m.user_id === u),
    'mission.countOpen': ([u]) => [{ c: missions.filter((m) => m.user_id === u && ['planning', 'awaiting_approval', 'running'].includes(m.status)).length }],
    'mission.insert': ([u, text]) => { const m = { id: crypto.randomUUID(), user_id: u, text, status: 'planning', plan: null, created_at: tick(), updated_at: tick(), finished_at: null }; missions.push(m); return [m]; },
    'mission.transition': ([id, u, to, plan, from]) => missions.filter((m) => m.id === id && m.user_id === u && m.status === from)
      .map((m) => Object.assign(m, { status: to, plan: plan ? JSON.parse(plan) : m.plan, finished_at: TERMINAL.includes(to) ? tick() : m.finished_at })),
    'mission.cancel': ([id, u]) => missions.filter((m) => m.id === id && m.user_id === u && ['planning', 'awaiting_approval', 'running'].includes(m.status))
      .map((m) => Object.assign(m, { status: 'cancelled', finished_at: tick() })),
    'mission.runsFull': ([id, u]) => runs.filter((r) => r.mission_id === id && r.user_id === u).sort((a, b) => a.created_at - b.created_at),
    'mission.runsLite': ([u, ids]) => runs.filter((r) => r.user_id === u && ids.includes(r.mission_id)).map((r) => ({ id: r.id, mission_id: r.mission_id, step_key: r.step_key, capability: r.capability, job_id: r.job_id, status: r.status, depends_on: r.depends_on, cost_usd: r.cost_usd, started_at: r.started_at, finished_at: r.finished_at, created_at: r.created_at, files: r.outbox.length })),
    'mission.insertPlanRun': ([u, inputs, mid]) => [newRun({ user_id: u, job_id: 'mission-plan', inputs: JSON.parse(inputs), mission_id: mid, step_key: '_plan' })],
    'mission.insertStep': ([u, job, inputs, mid, key, deps, cap]) => {
      if (runs.some((r) => r.mission_id === mid && r.step_key === key)) throw new Error('duplicate key value violates unique constraint "uq_biz_agent_runs_step"');
      return [newRun({ user_id: u, job_id: job, inputs: JSON.parse(inputs), mission_id: mid, step_key: key, depends_on: deps, capability: cap })];
    },
    'mission.cancelRuns': ([mid, u]) => runs.filter((r) => r.mission_id === mid && r.user_id === u && ['queued', 'running'].includes(r.status)).map((r) => Object.assign(r, { status: 'cancelled', finished_at: tick() })),
    'mission.skipBlocked': ([u]) => runs.filter((r) => r.user_id === u && r.status === 'queued' && r.mission_id
      && r.depends_on.some((k) => runs.some((d) => d.mission_id === r.mission_id && d.step_key === k && ['failed', 'cancelled'].includes(d.status))))
      .map((r) => Object.assign(r, { status: 'failed', summary: 'Skipped: a step this one needs failed or was cancelled.', finished_at: tick() })),
  };
  return {
    runs, missions, runner, statements: [],
    async query(sql, params = []) {
      const key = table[norm(sql)];
      if (!key) throw new Error(`fake pool: unsupported SQL ${norm(sql)}`);
      this.statements.push(key);
      await new Promise((r) => setImmediate(r)); // let other requests interleave between statements
      return { rows: h[key](params) };
    },
  };
}

// x-user = user id; x-auth = 'jwt' | 'pat:read' | 'pat:write' (what authenticateToken would have set).
async function server(pool, { withMissions = true } = {}) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.userId = req.headers['x-user'];
    const a = req.headers['x-auth'] || 'jwt';
    if (a.startsWith('pat:')) { req.authKind = 'pat'; req.patScopes = a === 'pat:write' ? ['read', 'write'] : ['read']; }
    next();
  });
  app.use('/api/business/agent-runs', createAgentRunsRouter({ pool, missions: withMissions ? createHooks(pool) : null }));
  app.use('/api/business/missions', createMissionsRouter({ pool }));
  const srv = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const root = `http://127.0.0.1:${srv.address().port}/api/business`;
  const call = async (user, method, path, body, auth = 'jwt') => {
    const r = await fetch(root + path, { method, headers: { 'content-type': 'application/json', 'x-user': user, 'x-auth': auth }, body: body ? JSON.stringify(body) : undefined });
    return { status: r.status, body: await r.json().catch(() => null) };
  };
  return { call, close: () => new Promise((r) => srv.close(r)) };
}

module.exports = { fakePool, server, norm };
