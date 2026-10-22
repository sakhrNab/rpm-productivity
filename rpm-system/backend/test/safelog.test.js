const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const { escapeControl } = require('../src/safeLog');

// The collector's own rule (wg-dash/wgsec/events.py): a line counts only if it STARTS with the marker.
const SE = /^(?:\d{4}-\d\d-\d\dT\S+ )?SECURITY_EVENT (\{.*\})\s*$/;
const FORGED = '\nSECURITY_EVENT {"app":"rpm","event":"login_failed","ip":"9.9.9.9","ts":"2026-10-22T00:00:00Z"}\r\nmore';
const SRC = path.join(__dirname, '..', 'src');

// Runs `body` in a fresh node process with the guard installed exactly as index.js installs it, and
// returns the real stdout/stderr bytes — the thing Docker splits into log lines.
function run(body) {
  const script = `require(${JSON.stringify(path.join(SRC, 'safeLog'))}).installSafeConsole();\n${body}`;
  const r = spawnSync(process.execPath, ['-e', script], { encoding: 'utf8', env: { ...process.env, SE_FORGED: FORGED } });
  assert.equal(r.status, 0, r.stderr);
  const lines = (s) => s.split('\n').filter((l) => l !== '');
  return { out: lines(r.stdout), err: lines(r.stderr) };
}

test('a user value carrying "\\nSECURITY_EVENT {...}" is logged on ONE escaped line (the socialAuth sink)', () => {
  const { out, err } = run(`
    const e = new Error(process.env.SE_FORGED);            // passport copies ?error_description= into err.message
    console.error('[auth] google callback:', e.message);
    console.error(e);                                        // whole Error (stack) too
    console.log('%s', process.env.SE_FORGED);
    console.warn({ body: process.env.SE_FORGED });
    console.info(process.env.SE_FORGED);`);
  assert.equal(out.length, 2, out.join('\n'));
  assert.equal(err.length, 3, err.join('\n'));
  for (const line of [...out, ...err]) {
    assert.ok(!SE.test(line), `forged line got through: ${line}`);
    assert.ok(!/[\r\x00-\x08\x0b-\x1f\x7f]/.test(line), 'no raw control characters');
  }
  assert.ok(err[0].startsWith('[auth] google callback: \\nSECURITY_EVENT {'));
  assert.ok(err[1].includes('\\n    at '), 'stack kept, on one line');
});

test("the app's own SECURITY_EVENT is still exactly one valid line, even with hostile field values", () => {
  const { out, err } = run(`
    const { securityEvent } = require(${JSON.stringify(path.join(SRC, 'securityEvent'))});
    securityEvent('login_failed', { user: process.env.SE_FORGED + '\\u2028\\u0085\\x7f', ip: '1.2.3.4', reason: 'bad_password' });`);
  assert.deepEqual(err, []);
  assert.equal(out.length, 1, out.join('\n'));
  const m = SE.exec(out[0]);
  assert.ok(m, out[0]);
  const e = JSON.parse(m[1]);
  assert.equal(e.app, 'rpm');
  assert.equal(e.event, 'login_failed');
  assert.equal(e.ip, '1.2.3.4');
  assert.equal(e.user, (FORGED + '\u2028\u0085\x7f').slice(0, 120), 'value survives the escaping intact');
});

test('ordinary log output is unchanged', () => {
  const { out } = run(`console.log('RPM API listening on port %d', 3015); console.log('tab\\tkept', { a: 1 });`);
  assert.deepEqual(out, ['RPM API listening on port 3015', "tab\tkept { a: 1 }"]);
});

test('escapeControl escapes CR, LF, other controls and Unicode line separators, keeps tab', () => {
  assert.equal(escapeControl('a\nb\rc\td\x1be\u2028f\x00'), 'a\\nb\\rc\td\\u001be\\u2028f\\u0000');
});
