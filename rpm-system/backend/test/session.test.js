// Refresh rotation with a reuse grace, and logout with only a refresh token (src/session.js).
// The fake pool implements EXACTLY the statements in session.SQL (anything else throws), each atomically.
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const express = require('express');
const jwt = require('jsonwebtoken');
const { createSessionRouter, SQL } = require('../src/session');

const ACCESS = 'test-access-secret';
const REFRESH = 'test-refresh-secret';
const generateTokens = (user) => ({
  accessToken: jwt.sign({ userId: user.id, email: user.email }, ACCESS, { expiresIn: '1h' }),
  refreshToken: jwt.sign({ userId: user.id, jti: crypto.randomUUID() }, REFRESH, { expiresIn: '7d' }),
});

function fakePool({ legacy = false } = {}) {
  let now = Date.UTC(2026, 9, 22, 9, 0, 0);
  const rows = [];
  const users = [{ id: 'u1', email: 'a@x.io', disabled_at: null }];
  const graceOk = (r, sec) => r.rotated_at != null && r.rotated_at > now - sec * 1000;
  const live = (tok, u) => rows.filter((r) => r.token === tok && r.user_id === u && r.expires_at > now);
  const byKey = Object.fromEntries(Object.entries(SQL).map(([k, v]) => [v, k]));
  const h = {
    find: ([tok, u, sec]) => live(tok, u).map((r) => ({ ...r, in_grace: graceOk(r, sec) })),
    user: ([id]) => users.filter((x) => x.id === id),
    insert: ([u, tok, exp]) => { rows.push({ id: crypto.randomUUID(), user_id: u, token: tok, expires_at: exp.getTime(), rotated_at: null, successor_token: null }); return []; },
    rotate: ([id, succ]) => rows.filter((r) => r.id === id && r.rotated_at == null).map((r) => Object.assign(r, { rotated_at: now, successor_token: succ })).map((r) => ({ id: r.id })),
    dropToken: ([tok]) => { for (let i = rows.length - 1; i >= 0; i--) if (rows[i].token === tok) rows.splice(i, 1); return []; },
    prune: ([u, sec]) => { for (let i = rows.length - 1; i >= 0; i--) if (rows[i].user_id === u && rows[i].rotated_at != null && rows[i].rotated_at < now - sec * 1000) rows.splice(i, 1); return []; },
    logout: ([tok, u]) => { const out = []; for (let i = rows.length - 1; i >= 0; i--) if (rows[i].token === tok && rows[i].user_id === u) out.push({ successor_token: rows.splice(i, 1)[0].successor_token }); return out; },
    logoutSuccessor: ([tok, u]) => { for (let i = rows.length - 1; i >= 0; i--) if (rows[i].token === tok && rows[i].user_id === u) rows.splice(i, 1); return []; },
    legacyFind: ([tok, u]) => live(tok, u).map((r) => ({ id: r.id })),
    legacyLogout: ([tok, u]) => h.logoutSuccessor([tok, u]),
  };
  const NEEDS_COLUMNS = ['find', 'rotate', 'prune', 'logout'];
  const pool = {
    queries: [],
    async query(sql, params) {
      const key = byKey[sql];
      if (!key) throw new Error(`unexpected SQL: ${sql}`);
      pool.queries.push(key);
      if (legacy && NEEDS_COLUMNS.includes(key)) { const e = new Error('column "rotated_at" does not exist'); e.code = '42703'; throw e; }
      return { rows: h[key](params) };
    },
  };
  return { pool, rows, users, advance: (ms) => { now += ms; } };
}

async function server(pool) {
  const app = express();
  app.use(express.json());
  app.use('/api/auth', createSessionRouter({ pool, generateTokens, refreshSecret: REFRESH, graceSec: 60 }));
  const srv = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const base = `http://127.0.0.1:${srv.address().port}/api/auth`;
  const post = async (path, body, headers = {}) => {
    const r = await fetch(`${base}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
    const text = await r.text();
    return { status: r.status, body: text ? JSON.parse(text) : null };
  };
  return { post, close: () => new Promise((r) => srv.close(r)) };
}

const signIn = (f) => { const t = generateTokens(f.users[0]); f.pool.query(SQL.insert, ['u1', t.refreshToken, new Date(Date.now() + 7 * 864e5)]); return t; };

test('refresh tokens for the same user in the same second are distinct (jti)', () => {
  const u = { id: 'u1', email: 'a@x.io' };
  assert.notEqual(generateTokens(u).refreshToken, generateTokens(u).refreshToken);
});

test('logout with an EXPIRED access token: 204 and the refresh token is deleted', async () => {
  const f = fakePool();
  const s = await server(f.pool);
  try {
    const t = signIn(f);
    const expiredAccess = jwt.sign({ userId: 'u1', exp: Math.floor(Date.now() / 1000) - 60 }, ACCESS);
    const r = await s.post('/logout', { refreshToken: t.refreshToken }, { Authorization: `Bearer ${expiredAccess}` });
    assert.equal(r.status, 204);
    assert.equal(f.rows.length, 0);
    // No access token at all: still 204. Garbage / foreign tokens: 204 and the database is never touched.
    assert.equal((await s.post('/logout', { refreshToken: t.refreshToken })).status, 204);
    const before = f.pool.queries.length;
    assert.equal((await s.post('/logout', { refreshToken: 'not-a-jwt' })).status, 204);
    assert.equal((await s.post('/logout', { refreshToken: jwt.sign({ userId: 'u1' }, 'someone-elses-secret') })).status, 204);
    assert.equal((await s.post('/logout', {})).status, 204);
    assert.equal(f.pool.queries.length, before);
  } finally { await s.close(); }
});

test('refresh: a just-rotated token within the grace window gets the SAME successor refresh token', async () => {
  const f = fakePool();
  const s = await server(f.pool);
  try {
    const t = signIn(f);
    const a = await s.post('/refresh', { refreshToken: t.refreshToken });
    assert.equal(a.status, 200);
    assert.notEqual(a.body.refreshToken, t.refreshToken);
    f.advance(20 * 1000);
    const b = await s.post('/refresh', { refreshToken: t.refreshToken });   // the second tab, 20 s later
    assert.equal(b.status, 200);
    assert.equal(b.body.refreshToken, a.body.refreshToken);
    assert.equal(jwt.verify(b.body.accessToken, ACCESS).userId, 'u1');
    // Only one live (un-rotated) token exists, and it is the successor.
    assert.deepEqual(f.rows.filter((r) => !r.rotated_at).map((r) => r.token), [a.body.refreshToken]);
    // The successor itself works normally.
    assert.equal((await s.post('/refresh', { refreshToken: a.body.refreshToken })).status, 200);
  } finally { await s.close(); }
});

test('refresh: two concurrent refreshes of one token both succeed with one successor', async () => {
  const f = fakePool();
  const s = await server(f.pool);
  try {
    const t = signIn(f);
    const [a, b] = await Promise.all([s.post('/refresh', { refreshToken: t.refreshToken }), s.post('/refresh', { refreshToken: t.refreshToken })]);
    assert.equal(a.status, 200);
    assert.equal(b.status, 200);
    assert.equal(a.body.refreshToken, b.body.refreshToken);
    assert.equal(f.rows.filter((r) => !r.rotated_at).length, 1);
  } finally { await s.close(); }
});

test('refresh: reusing a rotated token AFTER the grace window is a 401', async () => {
  const f = fakePool();
  const s = await server(f.pool);
  try {
    const t = signIn(f);
    assert.equal((await s.post('/refresh', { refreshToken: t.refreshToken })).status, 200);
    f.advance(61 * 1000);
    assert.equal((await s.post('/refresh', { refreshToken: t.refreshToken })).status, 401);
  } finally { await s.close(); }
});

test('revocation still wins: password change (all rows deleted), logout, disabled account', async () => {
  const f = fakePool();
  const s = await server(f.pool);
  try {
    // Password change/reset deletes every refresh token of the user (passwordReset.js) — rotated ones included.
    let t = signIn(f);
    let a = await s.post('/refresh', { refreshToken: t.refreshToken });
    f.rows.splice(0, f.rows.length);
    assert.equal((await s.post('/refresh', { refreshToken: t.refreshToken })).status, 401);
    assert.equal((await s.post('/refresh', { refreshToken: a.body.refreshToken })).status, 401);

    // Logout with the successor: the rotated predecessor can no longer fetch it within the grace window.
    t = signIn(f);
    a = await s.post('/refresh', { refreshToken: t.refreshToken });
    assert.equal((await s.post('/logout', { refreshToken: a.body.refreshToken })).status, 204);
    assert.equal((await s.post('/refresh', { refreshToken: t.refreshToken })).status, 401);

    // Logout with the rotated token takes its successor with it.
    t = signIn(f);
    a = await s.post('/refresh', { refreshToken: t.refreshToken });
    assert.equal((await s.post('/logout', { refreshToken: t.refreshToken })).status, 204);
    assert.equal((await s.post('/refresh', { refreshToken: a.body.refreshToken })).status, 401);

    // A disabled account cannot refresh, grace or not.
    t = signIn(f);
    a = await s.post('/refresh', { refreshToken: t.refreshToken });
    f.users[0].disabled_at = new Date();
    assert.equal((await s.post('/refresh', { refreshToken: t.refreshToken })).status, 401);
    assert.equal((await s.post('/refresh', { refreshToken: a.body.refreshToken })).status, 401);
  } finally { await s.close(); }
});

test('before the migration: falls back to plain rotation, logout still 204', async () => {
  const f = fakePool({ legacy: true });
  const s = await server(f.pool);
  try {
    const t = signIn(f);
    const a = await s.post('/refresh', { refreshToken: t.refreshToken });
    assert.equal(a.status, 200);
    assert.equal(f.rows.length, 1);
    assert.equal(f.rows[0].token, a.body.refreshToken);
    assert.equal((await s.post('/refresh', { refreshToken: t.refreshToken })).status, 401);   // no grace without the columns
    assert.equal((await s.post('/logout', { refreshToken: a.body.refreshToken })).status, 204);
    assert.equal(f.rows.length, 0);
  } finally { await s.close(); }
});
