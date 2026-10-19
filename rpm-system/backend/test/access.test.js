const test = require('node:test');
const assert = require('node:assert/strict');
const { canUseServerKeys, registrationAllowed, makeCode, normCode, findAdmission } = require('../src/access');
const { decide, configured, encodeSignupState, decodeSignupState } = require('../src/socialAuth');
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

// Fake db for findAdmission: an invite exists for invited@x.io; one user exists (no bootstrap).
const admissionDb = { query: async (sql, params) => {
  if (/FROM invitations WHERE LOWER\(email\)/.test(sql)) return { rows: params[0] === 'invited@x.io' ? [{ id: 'inv1' }] : [] };
  if (/FROM users LIMIT 1/.test(sql)) return { rows: [{}] };
  return { rows: [] };
} };

test('an unverified social email cannot claim an invite meant for that email', () => withEnv({}, async () => {
  assert.deepEqual(await findAdmission(admissionDb, { email: 'invited@x.io' }), { ok: true, via: 'invite', invitationId: 'inv1' });
  assert.deepEqual(await findAdmission(admissionDb, { email: 'invited@x.io', trustEmail: false }), { ok: false, reason: 'invite_required' });
}));

const acct = (over = {}) => ({ id: 'u1', provider: 'local', provider_id: null, ...over });

test('social: a Google email Google did not verify never signs in', () => {
  assert.deepEqual(decide({ provider: 'google', providerId: 'g1', email: 'a@b.co', emailVerified: false }), { action: 'deny', reason: 'email_unverified' });
});

test('social: Google-verified email opens the existing account; Microsoft never does by email', () => {
  assert.deepEqual(decide({ provider: 'google', providerId: 'g1', email: 'a@b.co', emailVerified: true, existing: acct() }), { action: 'link' });
  assert.deepEqual(decide({ provider: 'microsoft', providerId: 'm1', email: 'a@b.co', emailVerified: false, existing: acct() }), { action: 'deny', reason: 'existing_account' });
  assert.deepEqual(decide({ provider: 'microsoft', providerId: 'm1', email: 'a@b.co', emailVerified: false, existing: acct({ provider: 'microsoft', provider_id: 'm1' }) }), { action: 'login' });
});

test('social: new accounts — only Google-verified email may use an emailed invite; no email = no account', () => {
  assert.deepEqual(decide({ provider: 'google', providerId: 'g1', email: 'a@b.co', emailVerified: true }), { action: 'create', trustEmail: true });
  assert.deepEqual(decide({ provider: 'microsoft', providerId: 'm1', email: 'a@b.co', emailVerified: false }), { action: 'create', trustEmail: false });
  assert.deepEqual(decide({ provider: 'microsoft', providerId: 'm1', email: '', emailVerified: false }), { action: 'deny', reason: 'no_email' });
});

test('social: an invite/code survives the OAuth round-trip; junk state decodes to nothing; unset provider hidden', () => {
  assert.deepEqual(decodeSignupState(encodeSignupState({ invite: 'abc123', code: 'rpm-aaaa-bbbb' })), { invite: 'abc123', code: 'RPM-AAAA-BBBB' });
  assert.equal(encodeSignupState({}), undefined);
  assert.deepEqual(decodeSignupState('not-base64-json'), {});
  assert.deepEqual(configured({ GOOGLE_CLIENT_ID: 'x', GOOGLE_CLIENT_SECRET: 'y' }), { google: true, microsoft: false });
});
