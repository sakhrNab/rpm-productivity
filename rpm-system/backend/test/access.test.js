const test = require('node:test');
const assert = require('node:assert/strict');
const { canUseServerKeys, registrationAllowed, makeCode, normCode, encodeSignupState, decodeSignupState } = require('../src/access');
const keys = require('../src/ai/keys');

const withEnv = async (env, fn) => {
  const saved = { ...process.env };
  for (const k of ['SERVER_KEY_EMAILS', 'REGISTRATION_EMAILS', 'REGISTRATION_OPEN', 'DEEPSEEK_API_KEY', 'ANTHROPIC_API_KEY']) delete process.env[k];
  Object.assign(process.env, env);
  try { return await fn(); } finally { process.env = saved; }
};
// A pool that answers the two queries keys.js makes.
const pool = (email, storedKeys = []) => ({
  query: async (sql) => {
    if (/FROM users/.test(sql)) return { rows: email ? [{ email }] : [] };
    if (/FROM user_api_keys/.test(sql)) return { rows: storedKeys };
    return { rows: [] };
  },
});

test('closed by default: nobody uses server keys, nobody may register', () => withEnv({}, () => {
  assert.equal(canUseServerKeys('anyone@example.com'), false);
  assert.equal(registrationAllowed('anyone@example.com'), false);
}));

test('allow-lists are case-insensitive and exact', () => withEnv({ SERVER_KEY_EMAILS: ' Owner@Example.com , b@x.io', REGISTRATION_EMAILS: 'friend@x.io' }, () => {
  assert.equal(canUseServerKeys('owner@example.com'), true);
  assert.equal(canUseServerKeys('B@X.IO'), true);
  assert.equal(canUseServerKeys('owner@example.com.evil.io'), false);
  assert.equal(registrationAllowed('Friend@X.io'), true);
  assert.equal(registrationAllowed('stranger@x.io'), false);
}));

test('REGISTRATION_OPEN=true re-opens public sign-up', () => withEnv({ REGISTRATION_OPEN: 'true' }, () => {
  assert.equal(registrationAllowed('anyone@example.com'), true);
}));

test('a stranger never gets the server key; an allow-listed account does; the UI never claims "server default" for strangers', () => withEnv({ DEEPSEEK_API_KEY: 'server-key', SERVER_KEY_EMAILS: 'owner@example.com' }, async () => {
  assert.equal(await keys.resolveKey(pool('stranger@example.com'), 'u1', 'deepseek'), null);
  assert.equal(await keys.resolveKey(pool('owner@example.com'), 'u2', 'deepseek'), 'server-key');
  assert.equal(await keys.resolveKey(pool(null), 'ghost', 'deepseek'), null);          // unknown user id
  const stranger = (await keys.listKeysMasked(pool('stranger@example.com'), 'u1')).find(p => p.provider === 'deepseek');
  assert.deepEqual([stranger.configured, stranger.source], [false, 'none']);
  const owner = (await keys.listKeysMasked(pool('owner@example.com'), 'u2')).find(p => p.provider === 'deepseek');
  assert.deepEqual([owner.configured, owner.source], [true, 'env']);
}));

test('registration codes avoid look-alike characters and normalise what people type', () => {
  for (let i = 0; i < 200; i++) assert.match(makeCode(), /^RPM-[2-9A-HJKMNP-Z]{4}-[2-9A-HJKMNP-Z]{4}$/);
  assert.equal(normCode(' rpm-7k4q - m2xd '), 'RPM-7K4Q-M2XD');
});

test('an invite/code survives the OAuth round-trip; junk state decodes to nothing', () => {
  assert.deepEqual(decodeSignupState(encodeSignupState({ invite: 'abc123', code: 'rpm-aaaa-bbbb' })), { invite: 'abc123', code: 'RPM-AAAA-BBBB' });
  assert.equal(encodeSignupState({}), undefined);
  assert.deepEqual(decodeSignupState('not-base64-json'), {});
  assert.deepEqual(decodeSignupState(undefined), {});
});
