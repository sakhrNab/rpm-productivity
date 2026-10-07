// /api/business/agent-runs: user scoping, PAT-only claim/report, atomic claim. Runs the real router over
// HTTP against a fake pool that implements exactly the statements in agentRuns.SQL (anything else throws),
// executing each one atomically — as Postgres does for a single UPDATE … FOR UPDATE SKIP LOCKED.
const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const crypto = require('crypto');
const { createAgentRunsRouter, SQL, JOBS } = require('../src/agentRuns');

const U1 = 'aaaaaaaa-0000-4000-8000-000000000001';
const U2 = 'aaaaaaaa-0000-4000-8000-000000000002';
const norm = (s) => s.replace(/\s+/g, ' ').trim();
const S = Object.fromEntries(Object.entries(SQL).map(([k, v]) => [norm(v), k]));

function fakePool() {
  const runs = [];
  const runner = {};
  let clock = 0;
  const tick = () => new Date(Date.UTC(2026, 9, 8, 9, 0, clock++));
  const handlers = {
    list: ([u]) => runs.filter((r) => r.user_id === u).sort((a, b) => b.created_at - a.created_at).slice(0, 30),
    get: ([id, u]) => runs.filter((r) => r.id === id && r.user_id === u),
    countQueued: ([u]) => [{ c: runs.filter((r) => r.user_id === u && r.status === 'queued').length }],
    insert: ([u, job, inputs]) => {
      const r = { id: crypto.randomUUID(), user_id: u, job_id: job, inputs: JSON.parse(inputs), status: 'queued', runner: '', summary: '', outbox: [], cost_usd: null, created_at: tick(), started_at: null, finished_at: null };
      runs.push(r); return [r];
    },
    cancel: ([id, u]) => runs.filter((r) => r.id === id && r.user_id === u && ['queued', 'running'].includes(r.status))
      .map((r) => Object.assign(r, { status: 'cancelled', finished_at: tick() })),
    runner: ([u]) => (runner[u] ? [runner[u]] : []),
    heartbeat: ([u, name]) => { runner[u] = { runner: name, last_claim_at: tick() }; return []; },
    claim: ([u, name]) => {
      const next = runs.filter((r) => r.user_id === u && r.status === 'queued').sort((a, b) => a.created_at - b.created_at)[0];
      if (!next) return [];
      return [Object.assign(next, { status: 'running', started_at: tick(), runner: name })];
    },
    report: ([id, u, status, summary, outbox, cost]) => runs.filter((r) => r.id === id && r.user_id === u && r.status === 'running')
      .map((r) => Object.assign(r, {
        status, summary: summary ?? r.summary, outbox: outbox ? JSON.parse(outbox) : r.outbox, cost_usd: cost ?? r.cost_usd,
        finished_at: ['done', 'failed'].includes(status) ? tick() : r.finished_at,
      })),
  };
  return {
    runs, runner, statements: [],
    async query(sql, params = []) {
      const key = S[norm(sql)];
      if (!key) throw new Error(`fake pool: unsupported SQL ${norm(sql)}`);
      this.statements.push(key);
      await new Promise((r) => setImmediate(r)); // let other requests interleave between statements
      return { rows: handlers[key](params) };
    },
  };
}

// x-user = user id; x-auth = 'jwt' | 'pat:read' | 'pat:write' (what authenticateToken would have set).
async function server(pool) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.userId = req.headers['x-user'];
    const a = req.headers['x-auth'] || 'jwt';
    if (a.startsWith('pat:')) { req.authKind = 'pat'; req.patScopes = a === 'pat:write' ? ['read', 'write'] : ['read']; }
    next();
  });
  app.use('/api/business/agent-runs', createAgentRunsRouter({ pool }));
  const srv = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const base = `http://127.0.0.1:${srv.address().port}/api/business/agent-runs`;
  const call = async (user, method, path, body, auth = 'jwt') => {
    const r = await fetch(base + path, { method, headers: { 'content-type': 'application/json', 'x-user': user, 'x-auth': auth }, body: body ? JSON.stringify(body) : undefined });
    return { status: r.status, body: await r.json().catch(() => null) };
  };
  return { call, close: () => new Promise((r) => srv.close(r)) };
}

test('runs are user-scoped: list, get and cancel never reach another user\'s run', async () => {
  const pool = fakePool();
  const { call, close } = await server(pool);
  try {
    const mine = await call(U1, 'POST', '/', { job_id: 'morning-brief' });
    assert.equal(mine.status, 201);
    assert.equal(mine.body.status, 'queued');
    assert.equal(mine.body.user_id, U1);
    assert.deepEqual((await call(U2, 'GET', '/')).body.runs, [], 'foreign list is empty');
    assert.equal((await call(U2, 'GET', `/${mine.body.id}`)).status, 404);
    assert.equal((await call(U2, 'POST', `/${mine.body.id}/cancel`)).status, 404);
    assert.equal(pool.runs[0].status, 'queued', 'untouched by the foreign cancel');
    assert.equal((await call(U1, 'GET', '/')).body.runs.length, 1);
    const c = await call(U1, 'POST', `/${mine.body.id}/cancel`);
    assert.equal(c.status, 200); assert.equal(c.body.status, 'cancelled');
    assert.equal((await call(U1, 'POST', `/${mine.body.id}/cancel`)).status, 409, 'cannot cancel twice');
    // user_id in the body is ignored
    const r = await call(U1, 'POST', '/', { job_id: 'rpm-sync', user_id: U2 });
    assert.equal(r.body.user_id, U1);
  } finally { await close(); }
});

test('claim and report are PAT-write only: a browser session or a read-only token gets 403', async () => {
  const pool = fakePool();
  const { call, close } = await server(pool);
  try {
    const run = (await call(U1, 'POST', '/', { job_id: 'weekly-review' })).body;
    assert.equal((await call(U1, 'POST', '/claim', {}, 'jwt')).status, 403);
    assert.equal((await call(U1, 'POST', '/claim', {}, 'pat:read')).status, 403);
    assert.equal((await call(U1, 'POST', `/${run.id}/report`, { status: 'done' }, 'jwt')).status, 403);
    assert.equal(pool.runs[0].status, 'queued', 'nothing claimed by the refused calls');
    assert.equal(pool.runner[U1], undefined, 'no heartbeat from refused calls');

    const got = await call(U1, 'POST', '/claim', { runner: 'mac' }, 'pat:write');
    assert.equal(got.status, 200);
    assert.equal(got.body.run.id, run.id);
    assert.equal(got.body.run.status, 'running');
    assert.equal(pool.runner[U1].runner, 'mac', 'claim records the heartbeat');
    assert.equal((await call(U1, 'GET', '/')).body.runner.runner, 'mac', 'list exposes the heartbeat');

    // another user's token cannot claim or report my run
    assert.deepEqual((await call(U2, 'POST', '/claim', {}, 'pat:write')).body, { run: null });
    assert.equal((await call(U2, 'POST', `/${run.id}/report`, { status: 'done' }, 'pat:write')).status, 404);

    const rep = await call(U1, 'POST', `/${run.id}/report`, {
      status: 'done', summary: '# ok', cost_usd: 0.12, outbox: [{ name: 'weekly-review.md', kind: 'markdown', preview: 'hi', extra: 'dropped' }],
    }, 'pat:write');
    assert.equal(rep.status, 200);
    assert.equal(rep.body.status, 'done');
    assert.deepEqual(rep.body.outbox, [{ name: 'weekly-review.md', kind: 'markdown', preview: 'hi' }]);
    assert.ok(rep.body.finished_at);
    assert.equal((await call(U1, 'POST', `/${run.id}/report`, { status: 'running' }, 'pat:write')).status, 409, 'finished run is closed');
  } finally { await close(); }
});

test('claim is atomic: parallel claims hand out each queued run exactly once, oldest first', async () => {
  const pool = fakePool();
  const { call, close } = await server(pool);
  try {
    const ids = [];
    for (const job of ['morning-brief', 'rpm-sync', 'reply-review']) ids.push((await call(U1, 'POST', '/', { job_id: job })).body.id);
    await call(U2, 'POST', '/', { job_id: 'weekly-review' }); // another user's run is never claimed by U1
    const claims = await Promise.all(Array.from({ length: 8 }, (_, i) => call(U1, 'POST', '/claim', { runner: `r${i}` }, 'pat:write')));
    const got = claims.map((c) => c.body.run?.id).filter(Boolean);
    assert.equal(got.length, 3, 'three runs, three successful claims');
    assert.equal(new Set(got).size, 3, 'no run handed out twice');
    assert.deepEqual([...got].sort(), [...ids].sort());
    assert.equal(pool.runs.find((r) => r.user_id === U2).status, 'queued');
    // the claim is ONE statement (lock + flip together), never a SELECT followed by an UPDATE
    assert.match(norm(SQL.claim), /FOR UPDATE SKIP LOCKED/);
    assert.match(norm(SQL.claim), /^UPDATE .* WHERE user_id = \$1 AND status = 'queued' AND id = \(/);
    // oldest first
    const pool2 = fakePool();
    const s2 = await server(pool2);
    try {
      const a = (await s2.call(U1, 'POST', '/', { job_id: 'rpm-sync' })).body.id;
      await s2.call(U1, 'POST', '/', { job_id: 'reply-review' });
      assert.equal((await s2.call(U1, 'POST', '/claim', {}, 'pat:write')).body.run.id, a);
    } finally { await s2.close(); }
  } finally { await close(); }
});

test('a cancelled run tells the runner to stop (409) and cannot be reopened', async () => {
  const pool = fakePool();
  const { call, close } = await server(pool);
  try {
    const run = (await call(U1, 'POST', '/', { job_id: 'rpm-sync' })).body;
    await call(U1, 'POST', '/claim', {}, 'pat:write');
    assert.equal((await call(U1, 'POST', `/${run.id}/cancel`)).status, 200);
    const r = await call(U1, 'POST', `/${run.id}/report`, { status: 'done', summary: 'late' }, 'pat:write');
    assert.equal(r.status, 409); assert.equal(r.body.status, 'cancelled');
    assert.equal(pool.runs[0].summary, '', 'late report did not write');
  } finally { await close(); }
});

test('job catalog and input validation; Google Places needs explicit confirmation', async () => {
  const pool = fakePool();
  const { call, close } = await server(pool);
  try {
    const cat = await call(U1, 'GET', '/jobs');
    assert.deepEqual(cat.body.jobs.map((j) => j.id), ['morning-brief', 'upwork-scout', 'prospect-list', 'skool-digest', 'reply-review', 'rpm-sync', 'weekly-review']);
    assert.equal(JOBS.find((j) => j.id === 'prospect-list').confirm.when.source, 'google_places');
    assert.equal((await call(U1, 'POST', '/', { job_id: 'rm -rf' })).status, 400);
    assert.equal((await call(U1, 'POST', '/', { job_id: '__proto__' })).status, 400);
    assert.equal((await call(U1, 'POST', '/', { job_id: 'upwork-scout', inputs: { search: 'anything' } })).status, 400);
    assert.equal((await call(U1, 'POST', '/', { job_id: 'prospect-list', inputs: { city: 'Berlin; DROP TABLE' } })).status, 400);
    assert.equal((await call(U1, 'POST', '/', { job_id: 'prospect-list', inputs: { city: 'x'.repeat(61) } })).status, 400);
    const ok = await call(U1, 'POST', '/', { job_id: 'prospect-list', inputs: { city: 'München', extra: 'ignored' } });
    assert.equal(ok.status, 201);
    assert.deepEqual(ok.body.inputs, { sector: 'support', city: 'München', source: 'osm' }, 'defaults filled, unknown keys dropped');
    const paid = await call(U1, 'POST', '/', { job_id: 'prospect-list', inputs: { source: 'google_places' } });
    assert.equal(paid.status, 409); assert.equal(paid.body.needs_confirmation, true);
    assert.equal(pool.runs.length, 1, 'nothing queued without confirmation');
    assert.equal((await call(U1, 'POST', '/', { job_id: 'prospect-list', inputs: { source: 'google_places' }, confirmed: true })).status, 201);
    // report validation
    const run = (await call(U1, 'POST', '/claim', {}, 'pat:write')).body.run;
    assert.equal((await call(U1, 'POST', `/${run.id}/report`, { status: 'cancelled' }, 'pat:write')).status, 400);
    assert.equal((await call(U1, 'POST', `/${run.id}/report`, { status: 'done', cost_usd: -1 }, 'pat:write')).status, 400);
    assert.equal((await call(U1, 'POST', `/${run.id}/report`, { status: 'done', outbox: 'x' }, 'pat:write')).status, 400);
    assert.equal((await call(U1, 'GET', '/not-a-uuid')).status, 404);
  } finally { await close(); }
});

test('queue is capped per user', async () => {
  const pool = fakePool();
  const { call, close } = await server(pool);
  try {
    for (let i = 0; i < 20; i++) assert.equal((await call(U1, 'POST', '/', { job_id: 'rpm-sync' })).status, 201);
    assert.equal((await call(U1, 'POST', '/', { job_id: 'rpm-sync' })).status, 400);
    assert.equal((await call(U2, 'POST', '/', { job_id: 'rpm-sync' })).status, 201, 'other users unaffected');
  } finally { await close(); }
});
