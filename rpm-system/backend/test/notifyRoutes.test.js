const test = require('node:test');
const assert = require('node:assert/strict');
const { channelsFor, cleanRoutes, resolvedRoutes, typeEnabled, TYPES } = require('../src/notifyRoutes');

const prefs = (over = {}) => ({ email_enabled: true, telegram_enabled: true, telegram_chat_id: '123', webpush_enabled: true, routes: {}, ...over });

test('defaults: every type goes to every enabled channel (unchanged behaviour)', () => {
  for (const t of TYPES) assert.deepEqual(channelsFor(prefs({ chief_enabled: true, digest_enabled: true, task_time_enabled: true }), t), { email: true, telegram: true, push: true }, t);
});

test('a master switch off silences that channel for every type', () => {
  assert.deepEqual(channelsFor(prefs({ email_enabled: false }), 'coach_checkin'), { email: false, telegram: true, push: true });
  assert.equal(channelsFor(prefs({ telegram_chat_id: null }), 'reminder').telegram, false);   // not linked = no Telegram
  assert.equal(channelsFor(prefs(), 'digest', { hasEmail: false }).email, false);
});

test('per-type route: e.g. coach follow-ups only on Telegram', () => {
  const p = prefs({ routes: { coach_followup: { email: false, push: false } } });
  assert.deepEqual(channelsFor(p, 'coach_followup'), { email: false, telegram: true, push: false });
  assert.deepEqual(channelsFor(p, 'coach_checkin'), { email: true, telegram: true, push: true });   // other types untouched
});

test('a type switched off goes nowhere; custom reminders cannot be switched off here', () => {
  assert.deepEqual(channelsFor(prefs({ coach_alerts_enabled: false }), 'coach_alert'), { email: false, telegram: false, push: false });
  assert.equal(typeEnabled(prefs({ chief_enabled: false }), 'briefing'), false);
  assert.equal(typeEnabled(prefs(), 'reminder'), true);
  assert.deepEqual(channelsFor(null, 'reminder'), { email: false, telegram: false, push: false });   // no settings row = in-app only
});

test('routes are cleaned: unknown types/channels and non-booleans dropped; resolved fills defaults', () => {
  assert.deepEqual(cleanRoutes({ digest: { email: false, sms: true }, hack: { email: true }, coach_alert: { push: 'yes' } }), { digest: { email: false } });
  const r = resolvedRoutes({ digest: { email: false } });
  assert.deepEqual(r.digest, { email: false, telegram: true, push: true });
  assert.equal(Object.keys(r).length, TYPES.length);
});
