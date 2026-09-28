// Roadmap: every active project on one timeline — dates, progress, risk, milestones.

const { ymd } = require('./ai/dates');
const { computeForecasts } = require('./forecast');

// Worst key-result status wins (the project is only as healthy as its weakest goal).
const RISK_ORDER = ['overdue', 'off_track', 'stalled', 'at_risk', 'on_track', 'no_deadline', 'no_target', 'unknown', 'done'];
const worst = (statuses) => statuses.sort((a, b) => RISK_ORDER.indexOf(a) - RISK_ORDER.indexOf(b))[0] || null;

async function getRoadmap(pool, userId, today) {
  const [projects, stats, fc] = await Promise.all([
    pool.query(
      `SELECT p.id, p.name, p.ultimate_result, p.start_date, p.end_date, p.is_starred, p.category_id,
              c.name AS category_name, c.color AS category_color, c.sort_order AS category_order
         FROM projects p LEFT JOIN categories c ON c.id = p.category_id
        WHERE p.user_id = $1 AND p.is_archived = false AND p.is_completed = false
        ORDER BY c.sort_order NULLS LAST, p.sort_order`, [userId]),
    pool.query(
      `SELECT project_id,
              count(*)::int AS total,
              count(*) FILTER (WHERE is_completed)::int AS done,
              count(*) FILTER (WHERE NOT is_completed AND scheduled_date < $2::date)::int AS overdue,
              min(scheduled_date) AS first_date,
              max(COALESCE(end_date, scheduled_date)) AS last_date,
              min(scheduled_date) FILTER (WHERE NOT is_completed AND scheduled_date >= $2::date) AS next_date
         FROM actions WHERE user_id = $1 AND is_cancelled = false AND project_id IS NOT NULL
        GROUP BY project_id`, [userId, today]),
    computeForecasts(pool, userId).catch(() => ({ keyResults: [] })),
  ]);
  const statBy = Object.fromEntries(stats.rows.map(s => [s.project_id, s]));
  const krBy = {};
  for (const k of fc.keyResults || []) (krBy[k.project_id] = krBy[k.project_id] || []).push(k);

  return projects.rows.map(p => {
    const s = statBy[p.id] || { total: 0, done: 0, overdue: 0 };
    const krs = krBy[p.id] || [];
    const start = ymd(p.start_date) || ymd(s.first_date) || null;
    const end = ymd(p.end_date) || ymd(s.last_date) || null;
    return {
      id: p.id, name: p.name, result: p.ultimate_result, is_starred: p.is_starred,
      category_id: p.category_id, category_name: p.category_name || 'No category', category_color: p.category_color || '#4ecdc4',
      start, end: end && start && end < start ? start : end,
      dates_from: p.start_date || p.end_date ? 'project' : (s.first_date ? 'tasks' : null),
      tasks_total: s.total, tasks_done: s.done, overdue: s.overdue,
      progress: s.total ? s.done / s.total : 0,
      next_date: ymd(s.next_date) || null,
      risk: worst(krs.map(k => k.status)),
      // The whole forecast per key result, so a diamond can open its card (pace, need, finish).
      milestones: krs.filter(k => k.target_date).map(k => ({ ...k, date: k.target_date })),
    };
  });
}

module.exports = { getRoadmap, worst };
