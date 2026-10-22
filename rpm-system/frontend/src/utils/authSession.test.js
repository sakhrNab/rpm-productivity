// node --test src/utils/authSession.test.js
// The sign-in session against a fake server that behaves like the real one: access tokens expire (401
// TOKEN_EXPIRED), refresh tokens rotate (optionally with the 60 s reuse grace), logout needs only the refresh token.
// "Tabs" are separate sessions sharing one localStorage and one lock manager, as in a browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createAuthSession, localLocks, decodeJwt, SessionExpiredError } from './authSession.js';

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwtLike = (payload) => `${b64({ alg: 'HS256' })}.${b64(payload)}.sig`;

function memoryStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}

function fakeServer({ grace = true, refreshStatus = null } = {}) {
  let now = Date.UTC(2026, 9, 22, 9, 0, 0);
  let n = 0;
  const live = new Set();
  const rotated = new Map();   // old refresh token -> successor
  const log = [];
  const issue = () => {
    n += 1;
    const iat = Math.floor(now / 1000);
    const pair = { accessToken: jwtLike({ userId: 'u1', iat, exp: iat + 3600, n }), refreshToken: jwtLike({ userId: 'u1', iat, exp: iat + 7 * 86400, n }) };
    live.add(pair.refreshToken);
    return pair;
  };
  const json = (status, body) => ({ status, ok: status >= 200 && status < 300, json: async () => body, clone() { return this; } });
  const fetchFn = async (url, opts = {}) => {
    await new Promise((r) => setTimeout(r, 1));   // let parallel callers interleave like real requests
    const path = url.replace('/api', '');
    const body = opts.body ? JSON.parse(opts.body) : {};
    const auth = (opts.headers?.Authorization || '').replace('Bearer ', '');
    let res;
    if (path === '/auth/refresh') {
      if (refreshStatus) res = json(refreshStatus, { error: 'nope' });
      else if (live.has(body.refreshToken)) {
        live.delete(body.refreshToken);
        const pair = issue();
        rotated.set(body.refreshToken, pair.refreshToken);
        res = json(200, pair);
      } else if (grace && rotated.has(body.refreshToken) && live.has(rotated.get(body.refreshToken))) {
        const fresh = issue(); live.delete(fresh.refreshToken);   // only the access token is new
        res = json(200, { accessToken: fresh.accessToken, refreshToken: rotated.get(body.refreshToken) });
      } else res = json(401, { error: 'Refresh token expired or invalid' });
    } else if (path === '/auth/logout') {
      live.delete(body.refreshToken);
      res = json(204, null);
    } else {
      const p = decodeJwt(auth);
      if (!p) res = json(401, { error: 'Access token required' });
      else if (p.exp * 1000 <= now) res = json(401, { error: 'Token expired', code: 'TOKEN_EXPIRED' });
      else res = json(200, { ok: true, path });
    }
    log.push(`${opts.method || 'GET'} ${path} ${res.status}`);
    return res;
  };
  return { fetchFn, log, issue, advance: (ms) => { now += ms; }, now: () => now, live };
}

function tab(server, storage, locks, extra = {}) {
  let signedOutCalls = 0;
  const s = createAuthSession({ apiBase: '/api', fetchFn: server.fetchFn, storage, locks, now: server.now, onSignedOut: () => { signedOutCalls += 1; }, ...extra });
  const get = (path) => s.authed((token) => server.fetchFn(`/api${path}`, { headers: { Authorization: `Bearer ${token}` } }));
  return { s, get, signedOutCalls: () => signedOutCalls };
}

const count = (log, re) => log.filter((l) => re.test(l)).length;

test('expired access token: exactly one refresh, before sending; the original requests succeed with zero 401s', async () => {
  const srv = fakeServer();
  const storage = memoryStorage();
  const t = tab(srv, storage, localLocks());
  const pair = srv.issue();
  t.s.setTokens(pair.accessToken, pair.refreshToken);
  srv.advance(10 * 3600 * 1000);   // away for 10 hours

  const res = await Promise.all(['/inbox', '/persons', '/projects', '/categories', '/auth/me'].map(t.get));
  assert.deepEqual(res.map((r) => r.status), [200, 200, 200, 200, 200]);
  assert.equal(count(srv.log, /auth\/refresh/), 1);
  assert.equal(count(srv.log, / 401$/), 0);
  assert.equal(srv.log[0], 'POST /auth/refresh 200');   // the refresh went out before any request
});

test('refresh fails: exactly one logout call (2xx), signed out, and no further calls', async () => {
  const srv = fakeServer({ refreshStatus: 401 });
  const storage = memoryStorage();
  const t = tab(srv, storage, localLocks());
  const pair = srv.issue();
  t.s.setTokens(pair.accessToken, pair.refreshToken);
  srv.advance(10 * 3600 * 1000);

  const out = await Promise.allSettled(['/inbox', '/persons', '/projects'].map(t.get));
  assert.ok(out.every((o) => o.status === 'rejected' && o.reason instanceof SessionExpiredError));
  await new Promise((r) => setTimeout(r, 10));
  assert.deepEqual(srv.log, ['POST /auth/refresh 401', 'POST /auth/logout 204']);
  assert.equal(t.signedOutCalls(), 1);
  assert.equal(storage.getItem('accessToken'), null);
  assert.equal(storage.getItem('refreshToken'), null);

  // Later polls and clicks send nothing.
  await assert.rejects(t.get('/inbox'), SessionExpiredError);
  await t.s.logout();
  assert.equal(srv.log.length, 2);
});

test('page load on a stale session whose refresh fails: one refresh, one logout, /auth/me never sent', async () => {
  const srv = fakeServer({ refreshStatus: 401 });
  const storage = memoryStorage();
  const pair = srv.issue();
  storage.setItem('accessToken', pair.accessToken);
  storage.setItem('refreshToken', pair.refreshToken);
  srv.advance(10 * 3600 * 1000);
  const t = tab(srv, storage, localLocks());   // a fresh page load
  await assert.rejects(t.get('/auth/me'), SessionExpiredError);
  await new Promise((r) => setTimeout(r, 10));
  assert.deepEqual(srv.log, ['POST /auth/refresh 401', 'POST /auth/logout 204']);
});

test('a refresh token past its own expiry is never sent; no logout call without a refresh token', async () => {
  const srv = fakeServer();
  const storage = memoryStorage();
  const t = tab(srv, storage, localLocks());
  const pair = srv.issue();
  t.s.setTokens(pair.accessToken, pair.refreshToken);
  srv.advance(8 * 86400 * 1000);   // away for 8 days
  await assert.rejects(t.get('/inbox'), SessionExpiredError);
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(count(srv.log, /auth\/refresh/), 0);
  assert.equal(count(srv.log, / 401$/), 0);

  const empty = tab(srv, memoryStorage(), localLocks());
  srv.log.length = 0;
  await empty.s.logout();
  assert.deepEqual(srv.log, []);
});

test('two tabs sharing localStorage + a lock: one refresh in total, every request succeeds', async () => {
  const srv = fakeServer({ grace: false });   // prove the client alone avoids the rotation race
  const storage = memoryStorage();
  const locks = localLocks();   // one lock manager shared by both tabs = navigator.locks
  const a = tab(srv, storage, locks);
  const b = tab(srv, storage, locks);
  const c = tab(srv, storage, locks);
  const pair = srv.issue();
  a.s.setTokens(pair.accessToken, pair.refreshToken);
  srv.advance(2 * 3600 * 1000);

  const res = await Promise.all([a.get('/inbox'), b.get('/inbox'), c.get('/inbox'), a.get('/persons'), b.get('/projects'), c.get('/categories')]);
  assert.ok(res.every((r) => r.status === 200));
  assert.equal(count(srv.log, /auth\/refresh/), 1);
  assert.equal(count(srv.log, / 401$/), 0);
  assert.equal(count(srv.log, /logout/), 0);
});

test('no Web Locks (each tab locks alone): the server grace still gives every tab the same successor, 0 401s', async () => {
  const srv = fakeServer({ grace: true });
  const storage = memoryStorage();
  const a = tab(srv, storage, localLocks());
  const b = tab(srv, storage, localLocks());
  const pair = srv.issue();
  a.s.setTokens(pair.accessToken, pair.refreshToken);
  srv.advance(2 * 3600 * 1000);
  const res = await Promise.all([a.get('/inbox'), b.get('/inbox')]);
  assert.ok(res.every((r) => r.status === 200));
  assert.equal(count(srv.log, / 401$/), 0);
  assert.equal(srv.live.size, 1);   // one session left, not two
});

test('server says TOKEN_EXPIRED for a token our clock thinks is fresh: one refresh, retry succeeds, no loop', async () => {
  const srv = fakeServer();
  const storage = memoryStorage();
  let skewMs = 0;
  const t = tab(srv, storage, localLocks(), { now: () => srv.now() - skewMs });
  const pair = srv.issue();
  t.s.setTokens(pair.accessToken, pair.refreshToken);
  skewMs = 3600 * 1000 - 5 * 60 * 1000;   // our clock now runs ~55 min behind the server's
  srv.advance(3600 * 1000);
  const r = await t.get('/inbox');
  assert.equal(r.status, 200);
  assert.equal(count(srv.log, /auth\/refresh/), 1);
  assert.equal(count(srv.log, / 401$/), 1);   // the one request that discovered it
});

test('another tab signed out: this tab follows without calling the server; signing in again resumes', async () => {
  const srv = fakeServer();
  const storage = memoryStorage();
  const locks = localLocks();
  const a = tab(srv, storage, locks);
  const b = tab(srv, storage, locks);
  const pair = srv.issue();
  a.s.setTokens(pair.accessToken, pair.refreshToken);
  await a.s.logout();
  srv.log.length = 0;
  assert.equal(b.s.syncFromStorage(), 'signed-out');
  await assert.rejects(b.get('/inbox'), SessionExpiredError);
  assert.deepEqual(srv.log, []);

  const again = srv.issue();
  a.s.setTokens(again.accessToken, again.refreshToken);
  assert.equal(b.s.syncFromStorage(), 'signed-in');
  assert.equal((await b.get('/inbox')).status, 200);
});

test('a 5xx or network failure while refreshing does not sign anyone out', async () => {
  const srv = fakeServer({ refreshStatus: 502 });
  const storage = memoryStorage();
  const t = tab(srv, storage, localLocks());
  const pair = srv.issue();
  t.s.setTokens(pair.accessToken, pair.refreshToken);
  srv.advance(2 * 3600 * 1000);
  await assert.rejects(t.get('/inbox'), (e) => !(e instanceof SessionExpiredError));
  assert.equal(t.signedOutCalls(), 0);
  assert.equal(storage.getItem('refreshToken'), pair.refreshToken);
  assert.equal(count(srv.log, /logout/), 0);
});

test('SESSION_REVOKED (password changed elsewhere): one logout, signed out', async () => {
  const srv = fakeServer();
  const storage = memoryStorage();
  const t = tab(srv, storage, localLocks());
  const pair = srv.issue();
  t.s.setTokens(pair.accessToken, pair.refreshToken);
  const revoked = { status: 401, ok: false, json: async () => ({ code: 'SESSION_REVOKED', error: 'Your password was changed' }), clone() { return this; } };
  await Promise.allSettled([1, 2, 3].map(() => t.s.authed(async () => revoked)));
  await new Promise((r) => setTimeout(r, 10));
  assert.deepEqual(srv.log, ['POST /auth/logout 204']);
  assert.equal(t.signedOutCalls(), 1);
  assert.equal(t.s.isSignedOut(), true);
});
