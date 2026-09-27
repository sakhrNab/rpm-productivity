// Capacity: how much of each day is already planned vs how much time the user has.
// A multi-day task spreads its effort evenly over its days (a 3-day, 6h task = 2h/day).

const { ymd } = require('./ai/dates');

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const isDate = (d) => typeof d === 'string' && DATE_RE.test(d) && new Date(`${d}T00:00:00Z`).toISOString().slice(0, 10) === d;
const addDays = (d, n) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
const dow = (d) => new Date(`${d}T00:00:00Z`).getUTCDay();          // 0 Sun … 6 Sat

// Pure. actions: [{ id, title, priority, is_starred, is_completed, scheduled_date, end_date, minutes }]
function buildCapacity(actions, start, end, { weekday = 6, weekend = 2 } = {}) {
  const days = [];
  for (let d = start; d <= end && days.length < 62; d = addDays(d, 1)) {
    const cap = [0, 6].includes(dow(d)) ? weekend : weekday;
    days.push({ date: d, capacity_minutes: Math.round(cap * 60), planned_minutes: 0, done_minutes: 0, tasks: [] });
  }
  const byDate = new Map(days.map(x => [x.date, x]));
  for (const a of actions) {
    if (!a.scheduled_date) continue;
    const last = a.end_date && a.end_date > a.scheduled_date ? a.end_date : a.scheduled_date;
    const span = Math.round((Date.parse(last) - Date.parse(a.scheduled_date)) / 86400000) + 1;
    const per = Math.round((a.minutes || 0) / span);
    for (let i = 0; i < span; i++) {
      const day = byDate.get(addDays(a.scheduled_date, i));
      if (!day) continue;
      if (a.is_completed) day.done_minutes += per; else day.planned_minutes += per;
      day.tasks.push({ id: a.id, title: a.title, priority: a.priority || 0, is_starred: !!a.is_starred, is_completed: !!a.is_completed, minutes: per, multi_day: span > 1, scheduled_date: a.scheduled_date, end_date: a.end_date || null, blocks_count: a.blocks_count || 0, prereq_end: a.prereq_end || null });
    }
  }
  for (const d of days) d.overloaded = d.planned_minutes > d.capacity_minutes;
  return days;
}

async function getSettings(pool, userId) {
  const r = await pool.query('SELECT capacity_hours, weekend_capacity_hours FROM users WHERE id = $1', [userId]);
  const row = r.rows[0] || {};
  return { weekday: Number(row.capacity_hours ?? 6), weekend: Number(row.weekend_capacity_hours ?? 2) };
}

async function saveSettings(pool, userId, { weekday, weekend }) {
  const clamp = (v) => Math.max(0, Math.min(16, Math.round(Number(v) * 2) / 2));   // half-hour steps, 0–16h
  if (!Number.isFinite(Number(weekday)) || !Number.isFinite(Number(weekend))) return { ok: false, error: 'hours must be numbers' };
  await pool.query('UPDATE users SET capacity_hours = $2, weekend_capacity_hours = $3 WHERE id = $1', [userId, clamp(weekday), clamp(weekend)]);
  return { ok: true, weekday: clamp(weekday), weekend: clamp(weekend) };
}

async function getCapacity(pool, userId, start, end) {
  if (!isDate(start) || !isDate(end) || end < start) return null;
  const settings = await getSettings(pool, userId);
  // Include tasks that START before the window but still span into it.
  const r = await pool.query(
    `SELECT a.id, a.title, a.priority, a.is_starred, a.is_completed, a.scheduled_date, a.end_date,
            COALESCE(a.duration_hours, 0) * 60 + COALESCE(a.duration_minutes, 0) AS minutes,
            (SELECT count(*)::int FROM action_dependencies d JOIN actions x ON x.id = d.action_id
              WHERE d.depends_on_action_id = a.id AND x.is_completed = false) AS blocks_count,
            (SELECT max(COALESCE(p.end_date, p.scheduled_date)) FROM action_dependencies d JOIN actions p ON p.id = d.depends_on_action_id
              WHERE d.action_id = a.id AND p.is_completed = false) AS prereq_end
       FROM actions a
      WHERE a.user_id = $1 AND a.is_cancelled = false AND a.scheduled_date IS NOT NULL
        AND a.scheduled_date <= $3 AND COALESCE(a.end_date, a.scheduled_date) >= $2`, [userId, start, end]);
  const actions = r.rows.map(a => ({ ...a, scheduled_date: ymd(a.scheduled_date), end_date: ymd(a.end_date) || null, prereq_end: ymd(a.prereq_end) || null, minutes: Number(a.minutes) || 0 }));
  return { settings, days: buildCapacity(actions, start, end, settings) };
}

module.exports = { buildCapacity, getCapacity, getSettings, saveSettings };
