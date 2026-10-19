const test = require('node:test');
const assert = require('node:assert/strict');
const { passwordProblem, tokenStillValid, sha256 } = require('../src/passwordReset');
const { rateLimit } = require('../src/ratelimit');

test('password rules: length, bcrypt byte cap, not one repeated char, not the email', () => {
  assert.match(passwordProblem('short7!'), /at least 8/);
  assert.match(passwordProblem('a'.repeat(73)), /72 bytes/);
  assert.match(passwordProblem('ü'.repeat(37)), /72 bytes/);            // 74 bytes, 37 characters
  assert.match(passwordProblem('aaaaaaaaaa'), /repeated/);
  assert.match(passwordProblem('Me@Example.com', 'me@example.com'), /email/);
  assert.equal(passwordProblem('correct horse battery', 'me@example.com'), null);
  assert.match(passwordProblem(undefined), /at least 8/);
});

test('tokens are stored only as their SHA-256', () => {
  assert.equal(sha256('abc').length, 64);
  assert.notEqual(sha256('abc'), 'abc');
});

test('access tokens issued before a password change are refused; after it they pass', async () => {
  const changed = new Date('2026-10-19T10:00:00.500Z');
  const pool = { query: async () => ({ rows: [{ password_changed_at: changed }] }) };
  const at = Math.floor(changed.getTime() / 1000);
  assert.equal(await tokenStillValid(pool, 'u-changed', at - 3600), false);
  assert.equal(await tokenStillValid(pool, 'u-changed', at), true);       // same second (the new session)
  assert.equal(await tokenStillValid(pool, 'u-changed', at + 5), true);
  const never = { query: async () => ({ rows: [{ password_changed_at: null }] }) };
  assert.equal(await tokenStillValid(never, 'u-never', 1), true);
});

test('rate limit keyFn: per IP + account, so one account cannot be locked out from another IP', () => {
  const lim = rateLimit({ name: 't', windowMs: 60000, max: 1, keyFn: (req) => `${req.ip}:${req.body.email}` });
  const run = (ip, email) => { let status = 200; lim({ ip, body: { email } }, { set() {}, status(s) { status = s; return { json() {} }; } }, () => {}); return status; };
  assert.equal(run('1.1.1.1', 'v@x.io'), 200);
  assert.equal(run('1.1.1.1', 'v@x.io'), 429);   // same client, same account: limited
  assert.equal(run('2.2.2.2', 'v@x.io'), 200);   // the victim on their own IP is not
});
