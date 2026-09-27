// The coach accountability loop — what makes a coach COACH instead of wait:
//   • check-ins on the days/time the user picks (Mon = plan the week, Fri = review, else a nudge)
//   • follow-ups at day's end on today's important tasks: Done / Tomorrow / Drop
//   • slip alerts (overdue, goals behind pace, deadlines closing in) — pure data, no AI cost
// Every message is saved to the coach's thread and delivered on the user's channels.
// Pure helpers at the top are unit-tested; the DB/AI parts follow.

const crypto = require('crypto');
const { ymd } = require('./dates');

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

// "1,5" → [1, 5] (0 = Sun … 6 = Sat)
function parseDays(s) {
  return [...new Set(String(s ?? '').split(',').map(x => Number(x.trim())).filter(n => Number.isInteger(n) && n >= 0 && n <= 6))].sort();
}
function cleanSchedule(patch = {}) {
  const out = {};
  if ('proactive' in patch) out.proactive = !!patch.proactive;
  if ('checkin_days' in patch) out.checkin_days = parseDays(Array.isArray(patch.checkin_days) ? patch.checkin_days.join(',') : patch.checkin_days).join(',');
  if ('checkin_time' in patch && HHMM.test(patch.checkin_time)) out.checkin_time = patch.checkin_time;
  if ('followup_time' in patch && HHMM.test(patch.followup_time)) out.followup_time = patch.followup_time;
  return out;
}

// What is due for this coach at `now` = { dateStr, hhmm, dow } in the user's timezone?
function dueWork(coach, now) {
  if (!coach || coach.proactive === false || coach.is_active === false) return [];
  const out = [];
  const days = parseDays(coach.checkin_days ?? '1,5');
  if (days.includes(now.dow) && now.hhmm >= (coach.checkin_time || '08:30') && ymd(coach.last_checkin_date) !== now.dateStr) out.push('checkin');
  if (now.hhmm >= (coach.followup_time || '18:00') && ymd(coach.last_followup_date) !== now.dateStr) out.push('followup');
  if (now.hhmm >= '09:00' && now.hhmm < '21:00') out.push('alerts');
  return out;
}
const checkinKind = (dow) => (dow === 1 ? 'plan' : dow === 5 ? 'review' : 'nudge');

// Today's tasks worth asking about: important ones first, at most 3.
function pickFollowups(tasks = []) {
  return tasks
    .filter(t => !t.is_completed && !t.is_cancelled && (Number(t.priority) >= 2 || t.is_starred))
    .sort((a, b) => Number(b.priority) - Number(a.priority) || Number(!!b.is_starred) - Number(!!a.is_starred))
    .slice(0, 3);
}

// Things worth interrupting someone for. `sig` changes only when the situation changes,
// so the same problem is never alerted twice.
function detectAlerts({ overdue = [], at_risk = [], deadlines = [] } = {}) {
  const alerts = [];
  const stale = overdue.filter(o => Number(o.days_late) >= 2);
  if (stale.length) {
    const names = stale.slice(0, 3).map(o => `“${o.title}” (${o.days_late}d)`).join(', ');
    alerts.push({ type: 'overdue', text: `${plural(stale.length, 'task')} overdue: ${names}${stale.length > 3 ? '…' : ''}`, key: `overdue:${stale.length}` });
  }
  for (const k of at_risk.filter(k => ['off_track', 'overdue', 'stalled'].includes(k.status))) {
    const pace = k.required_per_week != null ? ` — needs ${k.required_per_week}/wk, you're at ${k.rate_per_week ?? 0}/wk` : '';
    alerts.push({ type: 'goal', text: `“${k.title}” is ${String(k.status).replace('_', ' ')}${pace}`, key: `goal:${k.title}:${k.status}` });
  }
  for (const d of deadlines) {
    if (!(d.open > 0) || d.days_left > 7) continue;
    const when = d.days_left < 0 ? `passed ${-d.days_left}d ago` : d.days_left === 0 ? 'is today' : `is in ${plural(d.days_left, 'day')}`;
    alerts.push({ type: 'deadline', text: `“${d.name}” deadline ${when} with ${plural(d.open, 'open task')}`, key: `deadline:${d.name}:${d.days_left < 0 ? 'past' : d.days_left <= 2 ? 'close' : 'soon'}` });
  }
  return { alerts, sig: alerts.map(a => a.key).sort().join('|') };
}

// Signed, expiring links for follow-up buttons in email (no login needed, one purpose only).
const b64 = (s) => Buffer.from(s).toString('base64url');
const hmacKey = (secret) => crypto.createHash('sha256').update(`coach-act:${secret}`).digest();
function signAction(payload, secret, ttlDays = 7) {
  const body = b64(JSON.stringify({ ...payload, exp: Date.now() + ttlDays * 86400000 }));
  const sig = crypto.createHmac('sha256', hmacKey(secret)).update(body).digest('base64url');
  return `${body}.${sig}`;
}
function verifyAction(token, secret) {
  const [body, sig] = String(token || '').split('.');
  if (!body || !sig) return null;
  const want = crypto.createHmac('sha256', hmacKey(secret)).update(body).digest('base64url');
  if (want.length !== sig.length || !crypto.timingSafeEqual(Buffer.from(want), Buffer.from(sig))) return null;
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString());
    return p.exp > Date.now() && ['d', 't', 'x'].includes(p.op) ? p : null;
  } catch { return null; }
}

const addDaysStr = (d, n) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);

module.exports = { parseDays, cleanSchedule, dueWork, checkinKind, pickFollowups, detectAlerts, signAction, verifyAction, addDaysStr, DOW };
