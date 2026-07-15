// Notifications — Phase 1: daily email digest + overdue reminders, on a simple
// in-process scheduler. Opt-in: only users with a notification_prefs row get sent to.

const { sendDigest } = require('./email');

const DEFAULT_PREFS = {
  email_enabled: true, telegram_enabled: false, webpush_enabled: false,
  digest_enabled: true, digest_time: '08:00', overdue_enabled: true, timezone: 'UTC',
};

function nowInTz(tz) {
  try {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat('en-CA', {
        timeZone: tz || 'UTC', year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', hour12: false,
      }).formatToParts(new Date()).map(p => [p.type, p.value])
    );
    return { dateStr: `${parts.year}-${parts.month}-${parts.day}`, hhmm: `${parts.hour}:${parts.minute}` };
  } catch {
    const d = new Date();
    return { dateStr: d.toISOString().slice(0, 10), hhmm: d.toISOString().slice(11, 16) };
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
    `INSERT INTO notification_prefs (user_id, email_enabled, telegram_enabled, webpush_enabled, digest_enabled, digest_time, overdue_enabled, timezone, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW())
     ON CONFLICT (user_id) DO UPDATE SET
       email_enabled=$2, telegram_enabled=$3, webpush_enabled=$4, digest_enabled=$5,
       digest_time=$6, overdue_enabled=$7, timezone=$8, updated_at=NOW()`,
    [userId, v.email_enabled, v.telegram_enabled, v.webpush_enabled, v.digest_enabled, v.digest_time, v.overdue_enabled, v.timezone]
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

async function sendUserDigest(pool, user, prefs) {
  const { today, todayTasks, overdue } = await buildDigest(pool, user.id, prefs.timezone, prefs.overdue_enabled);
  const todayLabel = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: prefs.timezone || 'UTC' }).format(new Date());
  return sendDigest({
    to: user.email, name: user.name,
    appUrl: (process.env.FRONTEND_URL || 'https://rpm.aiwaverider.com') + '/my-day',
    todayLabel, today: todayTasks, overdue,
  });
}

// One scheduler tick: send digests that are due and not yet sent today.
async function tick(pool) {
  const { rows } = await pool.query(
    `SELECT p.*, u.email, u.name FROM notification_prefs p
       JOIN users u ON u.id = p.user_id
      WHERE p.digest_enabled = true AND p.email_enabled = true AND u.email IS NOT NULL`
  );
  for (const p of rows) {
    try {
      const { dateStr, hhmm } = nowInTz(p.timezone);
      const alreadySent = p.last_digest_date && String(p.last_digest_date).slice(0, 10) === dateStr;
      if (alreadySent) continue;
      if (hhmm < (p.digest_time || '08:00')) continue; // not yet the digest time in their tz
      await sendUserDigest(pool, { id: p.user_id, email: p.email, name: p.name }, p);
      await pool.query('UPDATE notification_prefs SET last_digest_date = $2 WHERE user_id = $1', [p.user_id, dateStr]);
    } catch (err) {
      console.error('[notifications] digest error for', p.user_id, err.message);
    }
  }
}

function startScheduler(pool) {
  const INTERVAL = 5 * 60 * 1000; // every 5 minutes
  const run = () => tick(pool).catch(e => console.error('[notifications] tick error:', e.message));
  setTimeout(run, 30 * 1000);     // first run 30s after boot
  setInterval(run, INTERVAL);
  console.log('[notifications] scheduler started (5-min ticks)');
}

module.exports = { getPrefs, upsertPrefs, sendUserDigest, startScheduler, DEFAULT_PREFS };
