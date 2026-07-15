// Notifications — Phase 1: daily email digest + overdue reminders, on a simple
// in-process scheduler. Opt-in: only users with a notification_prefs row get sent to.

const { sendDigest, sendReminder } = require('./email');
const telegram = require('./telegram');
const push = require('./push');
const { pruneOldUsage } = require('./ai/usage');

const APP_URL = () => process.env.FRONTEND_URL || 'https://rpm.aiwaverider.com';
const DOW = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

const DEFAULT_PREFS = {
  email_enabled: true, telegram_enabled: false, webpush_enabled: false,
  digest_enabled: true, digest_time: '08:00', overdue_enabled: true,
  task_time_enabled: false, timezone: 'UTC',
};

// "HH:MM" -> minutes since midnight (null-safe).
function hhmmToMin(s) {
  if (!s) return null;
  const m = String(s).match(/^(\d{1,2}):(\d{2})/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

function nowInTz(tz) {
  try {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat('en-CA', {
        timeZone: tz || 'UTC', year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', hour12: false, weekday: 'short',
      }).formatToParts(new Date()).map(p => [p.type, p.value])
    );
    return { dateStr: `${parts.year}-${parts.month}-${parts.day}`, hhmm: `${parts.hour}:${parts.minute}`, dow: DOW[parts.weekday] };
  } catch {
    const d = new Date();
    return { dateStr: d.toISOString().slice(0, 10), hhmm: d.toISOString().slice(11, 16), dow: d.getUTCDay() };
  }
}

async function getPrefs(pool, userId) {
  const { rows } = await pool.query('SELECT * FROM notification_prefs WHERE user_id = $1', [userId]);
  return rows[0] || { user_id: userId, ...DEFAULT_PREFS, last_digest_date: null };
}

async function upsertPrefs(pool, userId, patch) {
  const cur = await getPrefs(pool, userId);
  const v = { ...DEFAULT_PREFS, ...cur, ...patch };
  await pool.query(
    `INSERT INTO notification_prefs (user_id, email_enabled, telegram_enabled, webpush_enabled, digest_enabled, digest_time, overdue_enabled, task_time_enabled, timezone, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW())
     ON CONFLICT (user_id) DO UPDATE SET
       email_enabled=$2, telegram_enabled=$3, webpush_enabled=$4, digest_enabled=$5,
       digest_time=$6, overdue_enabled=$7, task_time_enabled=$8, timezone=$9, updated_at=NOW()`,
    [userId, v.email_enabled, v.telegram_enabled, v.webpush_enabled, v.digest_enabled, v.digest_time, v.overdue_enabled, v.task_time_enabled, v.timezone]
  );
  return getPrefs(pool, userId);
}

// Gather the digest data for a user in their timezone.
async function buildDigest(pool, userId, tz, includeOverdue) {
  const today = nowInTz(tz).dateStr;
  const todayTasks = (await pool.query(
    `SELECT title, priority, project_name, category_name, scheduled_time
       FROM v_actions_full
      WHERE user_id = $1 AND scheduled_date = $2 AND is_cancelled = false AND is_completed = false
      ORDER BY priority DESC, sort_order`,
    [userId, today]
  )).rows;
  let overdue = [];
  if (includeOverdue) {
    overdue = (await pool.query(
      `SELECT title, scheduled_date FROM v_actions_full
        WHERE user_id = $1 AND scheduled_date < $2 AND is_cancelled = false AND is_completed = false
        ORDER BY scheduled_date DESC LIMIT 25`,
      [userId, today]
    )).rows;
  }
  return { today, todayTasks, overdue };
}

// Send the digest via every channel the user has enabled (email + telegram).
async function sendUserDigest(pool, user, prefs) {
  const { todayTasks, overdue } = await buildDigest(pool, user.id, prefs.timezone, prefs.overdue_enabled);
  const todayLabel = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: prefs.timezone || 'UTC' }).format(new Date());
  const out = {};
  if (prefs.email_enabled && user.email) {
    out.email = await sendDigest({
      to: user.email, name: user.name,
      appUrl: (process.env.FRONTEND_URL || 'https://rpm.aiwaverider.com') + '/my-day',
      todayLabel, today: todayTasks, overdue,
    });
  }
  if (prefs.telegram_enabled && prefs.telegram_chat_id) {
    try { out.telegram = await telegram.sendDigestTelegram(pool, prefs.telegram_chat_id, { todayLabel, today: todayTasks, overdue }); }
    catch (e) { console.error('[notifications] telegram digest error:', e.message); out.telegram = { sent: false }; }
  }
  if (prefs.webpush_enabled) {
    try {
      out.push = await push.sendToUser(pool, user.id, {
        title: '📋 Your RPM day',
        body: `${todayTasks.length} today${overdue.length ? `, ${overdue.length} overdue` : ''}`,
        url: APP_URL() + '/my-day',
      });
    } catch (e) { console.error('[notifications] push digest error:', e.message); }
  }
  return out;
}

// ---- Custom reminders (Phase 4) ----
async function listReminders(pool, userId) {
  const { rows } = await pool.query(
    `SELECT r.*, a.title AS action_title FROM reminders r
       LEFT JOIN actions a ON a.id = r.action_id
      WHERE r.user_id = $1 AND r.is_done = false
      ORDER BY COALESCE(r.remind_at, NOW()), r.created_at`,
    [userId]
  );
  return rows;
}
async function createReminder(pool, userId, data) {
  const { title, kind = 'once', remind_at, remind_time, remind_dow, action_id, timezone } = data;
  if (!title || !String(title).trim()) throw new Error('Title is required');
  const r = await pool.query(
    `INSERT INTO reminders (user_id, action_id, title, kind, remind_at, remind_time, remind_dow, timezone)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [userId, action_id || null, String(title).trim(), kind, remind_at || null, remind_time || null,
     (remind_dow === undefined || remind_dow === null || remind_dow === '') ? null : remind_dow, timezone || 'UTC']
  );
  return r.rows[0];
}
async function deleteReminder(pool, userId, id) {
  await pool.query('DELETE FROM reminders WHERE id = $1 AND user_id = $2', [id, userId]);
}

async function deliverReminder(pool, r) {
  const prefs = await getPrefs(pool, r.user_id);
  const url = APP_URL() + '/my-day';
  if (prefs.email_enabled && r.email) {
    try { await sendReminder({ to: r.email, name: r.name, title: r.title, appUrl: url }); } catch (e) { console.error('[reminders] email:', e.message); }
  }
  if (prefs.telegram_enabled && prefs.telegram_chat_id) {
    try { await telegram.notify(pool, prefs.telegram_chat_id, `⏰ <b>Reminder:</b> ${String(r.title).replace(/[<>&]/g, '')}`); } catch (e) { console.error('[reminders] tg:', e.message); }
  }
  if (prefs.webpush_enabled) {
    try { await push.sendToUser(pool, r.user_id, { title: '⏰ RPM Reminder', body: r.title, url }); } catch (e) { console.error('[reminders] push:', e.message); }
  }
}

async function fireDueReminders(pool) {
  // One-off reminders whose time has passed.
  const once = await pool.query(
    `SELECT r.*, u.email, u.name FROM reminders r JOIN users u ON u.id = r.user_id
      WHERE r.kind = 'once' AND r.is_done = false AND r.remind_at IS NOT NULL AND r.remind_at <= NOW()`);
  for (const r of once.rows) {
    try { await deliverReminder(pool, r); await pool.query('UPDATE reminders SET is_done = true WHERE id = $1', [r.id]); }
    catch (e) { console.error('[reminders] once fire:', e.message); }
  }
  // Recurring reminders (daily / weekly) at their local time, once per day.
  const rec = await pool.query(
    `SELECT r.*, to_char(r.last_fired_date, 'YYYY-MM-DD') AS last_fired_ymd, u.email, u.name
       FROM reminders r JOIN users u ON u.id = r.user_id
      WHERE r.kind IN ('daily','weekly') AND r.is_done = false`);
  for (const r of rec.rows) {
    try {
      const { dateStr, hhmm, dow } = nowInTz(r.timezone);
      if (r.last_fired_ymd && r.last_fired_ymd === dateStr) continue;
      if (hhmm < (r.remind_time || '09:00')) continue;
      if (r.kind === 'weekly' && Number(r.remind_dow) !== dow) continue;
      await deliverReminder(pool, r);
      await pool.query('UPDATE reminders SET last_fired_date = $2 WHERE id = $1', [r.id, dateStr]);
    } catch (e) { console.error('[reminders] rec fire:', e.message); }
  }
}

// Per-task reminders: ping the user at each task's scheduled time (opt-in).
// Fires once per action, within a 20-min window after its scheduled_time, in the
// user's timezone. reminded_at de-dupes; it's cleared when a task is rescheduled.
const TASK_WINDOW_MIN = 20;
async function fireTaskTimeReminders(pool) {
  const { rows: users } = await pool.query(
    `SELECT p.*, u.email, u.name FROM notification_prefs p
       JOIN users u ON u.id = p.user_id
      WHERE p.task_time_enabled = true
        AND (p.email_enabled = true OR p.telegram_enabled = true OR p.webpush_enabled = true)`
  );
  for (const p of users) {
    try {
      const { dateStr, hhmm } = nowInTz(p.timezone);
      const nowMin = hhmmToMin(hhmm);
      if (nowMin === null) continue;
      const { rows: due } = await pool.query(
        `SELECT id, title, scheduled_time FROM actions
          WHERE user_id = $1 AND scheduled_date = $2 AND is_completed = false
            AND is_cancelled = false AND scheduled_time IS NOT NULL AND reminded_at IS NULL`,
        [p.user_id, dateStr]
      );
      for (const a of due) {
        const taskMin = hhmmToMin(a.scheduled_time);
        if (taskMin === null) continue;
        const diff = nowMin - taskMin;
        if (diff < 0 || diff > TASK_WINDOW_MIN) continue; // not in the fire window
        await deliverReminder(pool, {
          user_id: p.user_id, email: p.email, name: p.name,
          title: `${a.title} — scheduled for ${String(a.scheduled_time).slice(0, 5)}`,
        });
        await pool.query('UPDATE actions SET reminded_at = NOW() WHERE id = $1', [a.id]);
      }
    } catch (e) { console.error('[reminders] task-time fire:', e.message); }
  }
}

// One scheduler tick: send digests that are due and not yet sent today.
async function tick(pool) {
  const { rows } = await pool.query(
    `SELECT p.*, to_char(p.last_digest_date, 'YYYY-MM-DD') AS last_digest_ymd, u.email, u.name
       FROM notification_prefs p
       JOIN users u ON u.id = p.user_id
      WHERE p.digest_enabled = true
        AND ((p.email_enabled = true AND u.email IS NOT NULL)
             OR (p.telegram_enabled = true AND p.telegram_chat_id IS NOT NULL)
             OR (p.webpush_enabled = true))`
  );
  for (const p of rows) {
    try {
      const { dateStr, hhmm } = nowInTz(p.timezone);
      // pg returns DATE as a JS Date; compare on the to_char string, not String(Date).
      const alreadySent = p.last_digest_ymd && p.last_digest_ymd === dateStr;
      if (alreadySent) continue;
      if (hhmm < (p.digest_time || '08:00')) continue; // not yet the digest time in their tz
      await sendUserDigest(pool, { id: p.user_id, email: p.email, name: p.name }, p);
      await pool.query('UPDATE notification_prefs SET last_digest_date = $2 WHERE user_id = $1', [p.user_id, dateStr]);
    } catch (err) {
      console.error('[notifications] digest error for', p.user_id, err.message);
    }
  }
  await fireDueReminders(pool);
  await fireTaskTimeReminders(pool);
  await maybePruneUsage(pool);
}

// Prune the AI usage log at most once per calendar day.
let lastUsagePruneDate = null;
async function maybePruneUsage(pool) {
  const today = new Date().toISOString().slice(0, 10);
  if (lastUsagePruneDate === today) return;
  lastUsagePruneDate = today;
  await pruneOldUsage(pool);
}

function startScheduler(pool) {
  const INTERVAL = 5 * 60 * 1000; // every 5 minutes
  const run = () => tick(pool).catch(e => console.error('[notifications] tick error:', e.message));
  setTimeout(run, 30 * 1000);     // first run 30s after boot
  setInterval(run, INTERVAL);
  console.log('[notifications] scheduler started (5-min ticks)');
}

module.exports = {
  getPrefs, upsertPrefs, sendUserDigest, startScheduler, DEFAULT_PREFS,
  listReminders, createReminder, deleteReminder,
};
