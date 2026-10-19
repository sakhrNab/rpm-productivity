// What RPM sends, and on which channel. One place decides it for every sender (notifications.js and the
// coach engine), so Settings can show — and control — exactly what goes where.
//
//   master switches  notification_prefs.email_enabled / telegram_enabled (+ a linked chat) / webpush_enabled
//   per type on/off  TYPE_ENABLED columns (custom reminders are always on: you create and delete them)
//   per type × channel  notification_prefs.routes = { [type]: { email, telegram, push } }; a missing entry
//                       means "on" (DEFAULT_ROUTES), so a new type never goes silent by accident
//
// A message goes to a channel only if the master switch AND that type's route are on.

const TYPES = ['briefing', 'digest', 'task_time', 'reminder', 'coach_checkin', 'coach_followup', 'coach_alert'];
const CHANNELS = ['email', 'telegram', 'push'];

const DEFAULT_ROUTES = Object.fromEntries(TYPES.map(t => [t, { email: true, telegram: true, push: true }]));

// The on/off column for each type (null = always on).
const TYPE_ENABLED = {
  briefing: 'chief_enabled', digest: 'digest_enabled', task_time: 'task_time_enabled', reminder: null,
  coach_checkin: 'coach_checkins_enabled', coach_followup: 'coach_followups_enabled', coach_alert: 'coach_alerts_enabled',
};

/** Keep only known types/channels with boolean values. */
function cleanRoutes(input) {
  const out = {};
  if (!input || typeof input !== 'object') return out;
  for (const t of TYPES) {
    const r = input[t];
    if (!r || typeof r !== 'object') continue;
    const c = {};
    for (const ch of CHANNELS) if (typeof r[ch] === 'boolean') c[ch] = r[ch];
    if (Object.keys(c).length) out[t] = c;
  }
  return out;
}

/** Full routes with defaults filled in (what Settings shows). */
function resolvedRoutes(routes) {
  const r = cleanRoutes(routes);
  return Object.fromEntries(TYPES.map(t => [t, { ...DEFAULT_ROUTES[t], ...(r[t] || {}) }]));
}

/** Is this type switched on at all? */
function typeEnabled(prefs, type) {
  const col = TYPE_ENABLED[type];
  return !col || !prefs || prefs[col] !== false;
}

/** Which channels this message type goes to for this user right now. */
function channelsFor(prefs, type, { hasEmail = true } = {}) {
  if (!prefs || !typeEnabled(prefs, type)) return { email: false, telegram: false, push: false };
  const route = resolvedRoutes(prefs.routes)[type] || DEFAULT_ROUTES.reminder;
  return {
    email: !!(prefs.email_enabled && hasEmail && route.email),
    telegram: !!(prefs.telegram_enabled && prefs.telegram_chat_id && route.telegram),
    push: !!(prefs.webpush_enabled && route.push),
  };
}

module.exports = { TYPES, CHANNELS, DEFAULT_ROUTES, TYPE_ENABLED, cleanRoutes, resolvedRoutes, typeEnabled, channelsFor };
