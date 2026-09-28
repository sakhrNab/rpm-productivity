// The header bell: what wants your attention right now, across the app —
// unread coach messages, reminders due in the next 24h, and carried-over tasks.

async function getInbox(pool, userId, today) {
  const [coachMsgs, reminders, overdue] = await Promise.all([
    pool.query(
      `SELECT m.id, m.kind, left(m.content, 180) AS preview, m.created_at, m.read_at,
              c.id AS coach_id, c.name AS coach_name, c.avatar_emoji, c.scope, c.project_id, c.category_id
         FROM coach_messages m JOIN coaches c ON c.id = m.coach_id
        WHERE m.user_id = $1 AND m.role = 'assistant' AND c.is_active = true
        ORDER BY m.created_at DESC LIMIT 12`, [userId]),
    pool.query(
      `SELECT r.id, r.title, r.kind, r.remind_at, r.remind_time, r.remind_dow, r.action_id
         FROM reminders r
        WHERE r.user_id = $1 AND r.is_done = false
          AND ((r.kind = 'once' AND r.remind_at BETWEEN NOW() AND NOW() + INTERVAL '24 hours')
               OR r.kind = 'daily'
               OR (r.kind = 'weekly' AND r.remind_dow IN (EXTRACT(DOW FROM $2::date)::int, (EXTRACT(DOW FROM $2::date)::int + 1) % 7)))
        ORDER BY r.remind_at NULLS LAST, r.remind_time LIMIT 8`, [userId, today]),
    pool.query(
      `SELECT count(*)::int AS n FROM actions
        WHERE user_id = $1 AND is_completed = false AND is_cancelled = false AND scheduled_date < $2::date`, [userId, today]),
  ]);
  const coach = coachMsgs.rows.map(m => ({
    type: 'coach', id: m.id, kind: m.kind, preview: m.preview, at: m.created_at, unread: !m.read_at,
    coach: { id: m.coach_id, name: m.coach_name, emoji: m.avatar_emoji || '🧭' },
    link: (m.scope === 'project' ? `/projects/${m.project_id}` : `/categories/${m.category_id}`) + '?coach=open',
  }));
  return {
    coach,
    reminders: reminders.rows.map(r => ({ type: 'reminder', ...r })),
    overdue: overdue.rows[0].n,
    unread: coach.filter(c => c.unread).length,
  };
}

async function markAllRead(pool, userId) {
  await pool.query('UPDATE coach_messages SET read_at = NOW() WHERE user_id = $1 AND read_at IS NULL', [userId]);
}

module.exports = { getInbox, markAllRead };
