const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { securityEvent, EVENTS } = require('../src/securityEvent');
const { rateLimit } = require('../src/ratelimit');

// The line format is a contract with the log readers on the servers (sec-report, the dashboard,
// CrowdSec), so it is asserted here rather than left to convention.
function capture(fn) {
  const lines = [];
  const orig = console.log;
  console.log = (...a) => lines.push(a.join(' '));
  try { fn(); } finally { console.log = orig; }
  return lines;
}
const parse = (line) => {
  assert.ok(line.startsWith('SECURITY_EVENT '), 'line must start with the SECURITY_EVENT prefix');
  return JSON.parse(line.slice('SECURITY_EVENT '.length));
};

test('writes one prefixed JSON line with app, event, user, ip and reason', () => {
  const [line, ...rest] = capture(() => securityEvent('login_failed', { user: 'a@b.c', ip: '1.2.3.4', reason: 'bad_password' }));
  assert.equal(rest.length, 0);
  const e = parse(line);
  assert.deepEqual({ ...e, ts: 'x' }, { ts: 'x', app: 'rpm', event: 'login_failed', user: 'a@b.c', ip: '1.2.3.4', reason: 'bad_password' });
  assert.ok(!Number.isNaN(Date.parse(e.ts)));
});

test('never carries a password (or any unknown field), even if one is passed in', () => {
  const [line] = capture(() => securityEvent('login_failed', { user: 'a@b.c', password: 'hunter2', token: 'abc', body: { password: 'x' } }));
  assert.ok(!/hunter2|abc|"x"/.test(line));
  assert.deepEqual(Object.keys(parse(line)).sort(), ['app', 'event', 'ts', 'user']);
});

test('bounds field length so a hostile value cannot flood the log', () => {
  const [line] = capture(() => securityEvent('login_failed', { user: 'x'.repeat(5000), ip: 'y'.repeat(500), reason: 'z'.repeat(500) }));
  const e = parse(line);
  assert.equal(e.user.length, 120);
  assert.equal(e.ip.length, 64);
  assert.equal(e.reason.length, 60);
});

test('a newline in a value cannot forge a second event', () => {
  const lines = capture(() => securityEvent('login_failed', { user: 'a@b.c\nSECURITY_EVENT {"event":"login_success","user":"admin"}' }));
  assert.equal(lines.length, 1);
  assert.equal(lines[0].split('\n').length, 1);
  assert.equal(parse(lines[0]).event, 'login_failed');
});

test('non-string input (JSON bodies can send objects) is stringified, null/undefined fields are omitted', () => {
  const [line] = capture(() => securityEvent('login_failed', { user: { $ne: 1 }, ip: null, reason: undefined }));
  const e = parse(line);
  assert.equal(e.user, '[object Object]');
  assert.ok(!('ip' in e) && !('reason' in e));
});

test('unknown events and bad arguments never throw and never log a SECURITY_EVENT line', () => {
  const origErr = console.error; console.error = () => {};
  try {
    assert.deepEqual(capture(() => securityEvent('made_up_event', { user: 'a' })), []);
    assert.doesNotThrow(() => securityEvent('login_failed', null));
    assert.doesNotThrow(() => securityEvent('login_failed', { user: { toString() { throw new Error('boom'); } } }));
  } finally { console.error = origErr; }
});

test('every event name used in the backend source is part of the contract', () => {
  const src = fs.readFileSync(path.join(__dirname, '../src/index.js'), 'utf8');
  const used = [...src.matchAll(/securityEvent\('([a-z_]+)'/g)].map((m) => m[1]);
  assert.ok(used.length >= 6, 'expected the auth routes to emit events');
  for (const name of used) assert.ok(EVENTS.has(name), `unknown event in index.js: ${name}`);
});

test('the rate limiter reports a limited request (once per rejected request) and still answers 429', () => {
  const seen = [];
  const limit = rateLimit({ name: 't-' + Math.random(), windowMs: 60000, max: 2, onLimit: (req) => seen.push(req.ip) });
  const res = () => { const r = { headers: {}, set(k, v) { r.headers[k] = v; }, status(c) { r.code = c; return r; }, json(b) { r.body = b; return r; } }; return r; };
  const req = { ip: '9.9.9.9', body: { email: 'a@b.c' }, path: '/api/auth/login' };
  let passed = 0;
  for (let i = 0; i < 4; i++) { const r = res(); limit(req, r, () => passed++); if (i >= 2) assert.equal(r.code, 429); }
  assert.equal(passed, 2);
  assert.deepEqual(seen, ['9.9.9.9', '9.9.9.9']);
  // an onLimit that throws must not turn a 429 into a crash
  const bad = rateLimit({ name: 't-bad', windowMs: 60000, max: 0, onLimit: () => { throw new Error('x'); } });
  const r = res(); assert.doesNotThrow(() => bad(req, r, () => {})); assert.equal(r.code, 429);
});
