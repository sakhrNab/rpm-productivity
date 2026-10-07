// Cross-user isolation for /api/business/*. Runs the real router over HTTP against an in-memory fake
// pool that honours the WHERE clauses the router sends: if a handler forgets `user_id = $n`, the fake
// returns the other user's row and these tests fail.
const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const crypto = require('crypto');
const { createBusinessRouter, TABLES } = require('../src/business');

const U1 = 'aaaaaaaa-0000-4000-8000-000000000001';
const U2 = 'aaaaaaaa-0000-4000-8000-000000000002';

function fakePool() {
  const db = {}; // table -> rows
  const rowsOf = (t) => (db[t] ||= []);
  const cond = (where, params) => where.split(/\s+AND\s+/i).map((c) => {
    const m = /^(?:\w+\.)?(\w+)\s*=\s*\$(\d+)$/.exec(c.trim());
    if (!m) throw new Error(`fake pool: unsupported condition "${c}"`);
    return [m[1], params[Number(m[2]) - 1]];
  });
  const match = (row, conds) => conds.every(([col, v]) => String(row[col]) === String(v));
  return {
    db,
    query: async (sql, params = []) => {
      const q = sql.replace(/\s+/g, ' ').trim();
      let m;
      if ((m = /^INSERT INTO (\w+) \(([^)]+)\) VALUES \(([^)]+)\) RETURNING \*$/.exec(q))) {
        const cols = m[2].split(',').map((s) => s.trim());
        const row = { id: crypto.randomUUID(), created_at: new Date() };
        cols.forEach((c, i) => { row[c] = params[i]; });
        rowsOf(m[1]).push(row);
        return { rows: [row] };
      }
      if ((m = /^UPDATE (\w+) SET (.+) WHERE (.+) RETURNING \*$/.exec(q))) {
        const conds = cond(m[3], params);
        const hit = rowsOf(m[1]).filter((r) => match(r, conds));
        for (const r of hit) for (const a of m[2].split(',')) {
          const [, c, i] = /(\w+) = \$(\d+)/.exec(a.trim());
          r[c] = params[Number(i) - 1];
        }
        return { rows: hit };
      }
      if ((m = /^DELETE FROM (\w+) WHERE (.+) RETURNING id$/.exec(q))) {
        const conds = cond(m[2], params);
        const keep = [], gone = [];
        for (const r of rowsOf(m[1])) (match(r, conds) ? gone : keep).push(r);
        db[m[1]] = keep;
        return { rows: gone.map((r) => ({ id: r.id })) };
      }
      // SELECT …: one table (joins are flattened: fake key_results rows carry user_id themselves).
      if ((m = /^SELECT (.+?) FROM (\w+)(?: \w+)?(?: JOIN \w+ \w+ ON [\w.]+ = [\w.]+)? WHERE (.+?)(?: ORDER BY .+)?$/.exec(q))) {
        const conds = cond(m[3], params);
        const hit = rowsOf(m[2]).filter((r) => match(r, conds));
        if (/COUNT\(\*\)/.test(m[1])) return { rows: [{ c: hit.length }] };
        return { rows: hit };
      }
      throw new Error(`fake pool: unsupported SQL ${q}`);
    },
  };
}

async function server(pool) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.userId = req.headers['x-user']; next(); });
  app.use('/api/business', createBusinessRouter({ pool }));
  const srv = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const base = `http://127.0.0.1:${srv.address().port}/api/business`;
  const call = async (user, method, path, body) => {
    const r = await fetch(base + path, { method, headers: { 'content-type': 'application/json', 'x-user': user }, body: body ? JSON.stringify(body) : undefined });
    return { status: r.status, body: await r.json().catch(() => null) };
  };
  return { call, close: () => new Promise((r) => srv.close(r)) };
}

// A minimal valid body per section.
const SAMPLE = {
  leads: { name: 'Lead A', stage: 'contacted', fit: 3, next_contact: '2026-10-10' },
  results: { type: 'dm_sent', channel: 'upwork', count: 3, date: '2026-10-07' },
  offers: { name: 'Offer A', ladder: [{ step: 'Pilot', price: '€0', note: '' }], bonuses: ['x'] },
  products: { name: 'Product A', promised: true },
  channels: { name: 'Channel A', tone: 'ok', gaps: ['g'] },
  fixes: { text: 'Fix A', severity: 'P0' },
  docs: { path: 'docs/a.md', status: 'current' },
  content: { title: 'Post A', date: '2026-10-09', status: 'idea' },
};

test('every section: another user cannot GET, PUT or DELETE my row (404), nor see it in their list', async () => {
  const pool = fakePool();
  const { call, close } = await server(pool);
  try {
    assert.deepEqual(Object.keys(SAMPLE).sort(), Object.keys(TABLES).sort(), 'a sample per table');
    for (const [section, body] of Object.entries(SAMPLE)) {
      const made = await call(U1, 'POST', `/${section}`, body);
      assert.equal(made.status, 201, `${section} create: ${JSON.stringify(made.body)}`);
      const id = made.body.id;
      assert.equal(made.body.user_id, U1);

      assert.equal((await call(U1, 'GET', `/${section}/${id}`)).status, 200, `${section} owner GET`);
      assert.equal((await call(U2, 'GET', `/${section}/${id}`)).status, 404, `${section} foreign GET`);
      assert.equal((await call(U2, 'PUT', `/${section}/${id}`, body)).status, 404, `${section} foreign PUT`);
      assert.equal((await call(U2, 'DELETE', `/${section}/${id}`)).status, 404, `${section} foreign DELETE`);
      assert.deepEqual((await call(U2, 'GET', `/${section}`)).body, [], `${section} foreign list`);

      // Untouched by the attempts above.
      const still = await call(U1, 'GET', `/${section}/${id}`);
      assert.equal(still.status, 200);
      assert.equal(still.body.user_id, U1);
      assert.equal((await call(U1, 'GET', `/${section}`)).body.length, 1);
      assert.equal((await call(U1, 'DELETE', `/${section}/${id}`)).status, 200, `${section} owner DELETE`);
    }
  } finally { await close(); }
});

test('a foreign lead_id / action_id / project / key result is refused with 400', async () => {
  const pool = fakePool();
  const { call, close } = await server(pool);
  try {
    const theirLead = (await call(U2, 'POST', '/leads', { name: 'Theirs' })).body.id;
    const myLead = (await call(U1, 'POST', '/leads', { name: 'Mine' })).body.id;
    pool.db.actions = [{ id: crypto.randomUUID(), user_id: U2 }];
    pool.db.projects = [{ id: crypto.randomUUID(), user_id: U2 }];
    pool.db.key_results = [{ id: crypto.randomUUID(), user_id: U2 }];
    const [theirAction, theirProject, theirKr] = [pool.db.actions[0].id, pool.db.projects[0].id, pool.db.key_results[0].id];

    let r = await call(U1, 'POST', '/results', { type: 'reply', lead_id: theirLead });
    assert.equal(r.status, 400); assert.match(r.body.error, /lead_id/);
    r = await call(U1, 'POST', '/results', { type: 'reply', lead_id: myLead });
    assert.equal(r.status, 201, 'own lead is fine');
    r = await call(U1, 'PUT', `/results/${r.body.id}`, { lead_id: theirLead });
    assert.equal(r.status, 400, 'cannot re-point to a foreign lead');

    r = await call(U1, 'PUT', `/leads/${myLead}`, { action_id: theirAction });
    assert.equal(r.status, 400); assert.match(r.body.error, /action_id/);
    r = await call(U1, 'POST', '/fixes', { text: 'x', action_id: theirAction });
    assert.equal(r.status, 400);
    r = await call(U1, 'PUT', '/settings', { goal_project_id: theirProject });
    assert.equal(r.status, 400); assert.match(r.body.error, /goal_project_id/);
    r = await call(U1, 'PUT', '/settings', { cash_kr_id: theirKr });
    assert.equal(r.status, 400); assert.match(r.body.error, /cash_kr_id/);
    r = await call(U1, 'POST', '/results', { type: 'reply', lead_id: "x' OR 1=1 --" });
    assert.equal(r.status, 400, 'malformed id');
  } finally { await close(); }
});

test('follow-up and fix→action endpoints 404 on another user\'s row', async () => {
  const pool = fakePool();
  const { call, close } = await server(pool);
  try {
    const lead = (await call(U1, 'POST', '/leads', { name: 'Mine' })).body.id;
    const fix = (await call(U1, 'POST', '/fixes', { text: 'Mine' })).body.id;
    assert.equal((await call(U2, 'POST', `/leads/${lead}/follow-up`, {})).status, 404);
    assert.equal((await call(U2, 'POST', `/fixes/${fix}/action`, {})).status, 404);
    assert.equal((pool.db.actions || []).length, 0, 'no action created for the intruder');
  } finally { await close(); }
});

test('input validation: required fields, enums, length caps, bad ids, unknown sections', async () => {
  const { call, close } = await server(fakePool());
  try {
    assert.equal((await call(U1, 'POST', '/leads', {})).status, 400);
    assert.equal((await call(U1, 'POST', '/leads', { name: 'x'.repeat(201) })).status, 400);
    assert.equal((await call(U1, 'POST', '/leads', { name: 'a', stage: 'won' })).status, 400);
    assert.equal((await call(U1, 'POST', '/leads', { name: 'a', fit: 4 })).status, 400);
    assert.equal((await call(U1, 'POST', '/leads', { name: 'a', next_contact: '10/10/2026' })).status, 400);
    assert.equal((await call(U1, 'POST', '/results', { type: 'hacked' })).status, 400);
    assert.equal((await call(U1, 'POST', '/channels', { name: 'a', gaps: Array(41).fill('g') })).status, 400);
    assert.equal((await call(U1, 'PUT', '/settings', { revenue_model: [{ name: 'a', convert: 400 }] })).status, 400);
    assert.equal((await call(U1, 'GET', '/leads/not-a-uuid')).status, 404);
    assert.equal((await call(U1, 'GET', '/users')).status, 404);
    assert.equal((await call(U1, 'GET', '/__proto__')).status, 404);
    // user_id in the body is ignored, the row is still mine.
    const r = await call(U1, 'POST', '/docs', { path: 'p', user_id: U2 });
    assert.equal(r.status, 201); assert.equal(r.body.user_id, U1);
  } finally { await close(); }
});
