const test = require('node:test');
const assert = require('node:assert/strict');
const { generatePat, hashPat, isPat, patRouteAllowed, verifyPat } = require('../src/pat');

test('tokens have the prefix and hash deterministically', () => {
  const t = generatePat();
  assert.ok(isPat(t));
  assert.equal(hashPat(t), hashPat(t));
  assert.equal(hashPat(t).length, 64);
  assert.ok(!isPat('eyJhbGciOi.jwt'));
});

test('read scope can GET allowed routes but not write', () => {
  assert.ok(patRouteAllowed('GET', '/api/actions?this_week=true', ['read']));
  assert.ok(patRouteAllowed('GET', '/api/auth/me', ['read']));
  assert.ok(!patRouteAllowed('POST', '/api/actions', ['read']));
  assert.ok(patRouteAllowed('POST', '/api/actions', ['write']));
  assert.ok(patRouteAllowed('PUT', '/api/key-results/abc', ['read', 'write']));
});

test('denied areas stay denied even with write', () => {
  for (const p of ['/api/ai/chat', '/api/coaches', '/api/persons', '/api/settings', '/api/pat', '/api/telegram/link', '/api/upload', '/api/auth/login']) {
    assert.ok(!patRouteAllowed('GET', p, ['read', 'write']), p);
    assert.ok(!patRouteAllowed('POST', p, ['read', 'write']), p);
  }
  assert.ok(!patRouteAllowed('GET', '/api/aiwhatever', ['read']), 'unknown prefix');
  assert.ok(!patRouteAllowed('DELETE', '/api/projects/123', ['write']));
  assert.ok(!patRouteAllowed('DELETE', '/api/categories/123', ['write']));
  assert.ok(!patRouteAllowed('POST', '/api/categories', ['write']));
  assert.ok(patRouteAllowed('DELETE', '/api/actions/123', ['write']));
});

test('verifyPat looks up by hash and returns scopes', async () => {
  const t = generatePat();
  let sql = '';
  const pool = { query: async (q, args) => { sql += q; return /SELECT/.test(q) && args[0] === hashPat(t) ? { rows: [{ id: 'p1', user_id: 'u1', scopes: ['read'] }] } : { rows: [] }; } };
  assert.deepEqual(await verifyPat(pool, t), { id: 'p1', userId: 'u1', scopes: ['read'] });
  assert.match(sql, /revoked_at IS NULL/);
  assert.equal(await verifyPat(pool, generatePat()), null);
  assert.equal(await verifyPat(pool, 'not-a-pat'), null);
});

test('business routes: read scope reads, write scope writes', () => {
  assert.ok(patRouteAllowed('GET', '/api/business/summary', ['read']));
  assert.ok(patRouteAllowed('GET', '/api/business/leads', ['read']));
  assert.ok(!patRouteAllowed('POST', '/api/business/leads', ['read']));
  assert.ok(!patRouteAllowed('PUT', '/api/business/settings', ['read']));
  assert.ok(patRouteAllowed('POST', '/api/business/leads', ['write']));
  assert.ok(patRouteAllowed('DELETE', '/api/business/leads/abc', ['write']));
  assert.ok(!patRouteAllowed('GET', '/api/businessx', ['read']), 'prefix must match a whole segment');
});

test('AI-spending routes under allowed prefixes are refused', () => {
  assert.ok(!patRouteAllowed('POST', '/api/actions/triage', ['write']));
  assert.ok(!patRouteAllowed('POST', '/api/forecast/fix', ['write']));
  assert.ok(patRouteAllowed('GET', '/api/forecast', ['read']));
  assert.ok(patRouteAllowed('POST', '/api/actions', ['write']));
});
