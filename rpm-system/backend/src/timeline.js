// Project timeline data (real tasks, blocks as phases, dependencies, next reminders)
// and a safe batch reschedule used by timeline drags, "fix conflicts" and undo.

const { ymd } = require('./ai/dates');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const isDate = (d) => typeof d === 'string' && DATE_RE.test(d) && !Number.isNaN(Date.parse(`${d}T00:00:00Z`)) && new Date(`${d}T00:00:00Z`).toISOString().slice(0, 10) === d;

async function projectTimeline(pool, userId, projectId) {
  if (!UUID_RE.test(String(projectId))) return null;
  const proj = (await pool.query(
    `SELECT p.id, p.name, p.start_date, p.end_date, p.category_id, c.name AS category_name, c.color AS category_color
       FROM projects p LEFT JOIN categories c ON c.id = p.category_id
      WHERE p.id = $1 AND p.user_id = $2`, [projectId, userId])).rows[0];
  if (!proj) return null;

  const [blocks, actions, krs] = await Promise.all([
    pool.query(
      `SELECT id, result_title, purpose, target_date, is_completed FROM rpm_blocks
        WHERE project_id = $1 AND user_id = $2 ORDER BY sort_order`, [projectId, userId]),
    pool.query(
      `SELECT id, title, notes, priority, scheduled_date, end_date, duration_hours, duration_minutes,
              is_completed, is_starred, block_id
         FROM actions WHERE project_id = $1 AND user_id = $2 AND is_cancelled = false
        ORDER BY scheduled_date NULLS LAST, sort_order`, [projectId, userId]),
    pool.query(
      `SELECT id, title, current_value, target_value, unit, target_date, is_completed
         FROM key_results WHERE project_id = $1 ORDER BY target_date NULLS LAST`, [projectId]),
  ]);
  const ids = actions.rows.map(a => a.id);
  const [deps, rems] = ids.length ? await Promise.all([
    pool.query('SELECT action_id, depends_on_action_id FROM action_dependencies WHERE action_id = ANY($1)', [ids]),
    pool.query(
      `SELECT DISTINCT ON (action_id) action_id, remind_at, timezone FROM reminders
        WHERE action_id = ANY($1) AND is_done = false AND kind = 'once' AND remind_at > NOW()
        ORDER BY action_id, remind_at`, [ids]),
  ]) : [{ rows: [] }, { rows: [] }];

  const depsBy = {};
  for (const d of deps.rows) (depsBy[d.action_id] = depsBy[d.action_id] || []).push(d.depends_on_action_id);
  const remBy = Object.fromEntries(rems.rows.map(r => [r.action_id, r.remind_at]));

  return {
    project: { ...proj, start_date: ymd(proj.start_date) || null, end_date: ymd(proj.end_date) || null },
    phases: blocks.rows.map(b => ({ id: b.id, title: b.result_title, purpose: b.purpose, target_date: ymd(b.target_date) || null, is_completed: b.is_completed })),
    tasks: actions.rows.map(a => ({
      id: a.id, title: a.title, notes: a.notes, priority: a.priority || 0, block_id: a.block_id,
      scheduled_date: ymd(a.scheduled_date) || null, end_date: ymd(a.end_date) || null,
      effort_minutes: (a.duration_hours || 0) * 60 + (a.duration_minutes || 0),
      is_completed: a.is_completed, is_starred: a.is_starred,
      depends_on: depsBy[a.id] || [],
      next_reminder_at: remBy[a.id] ? new Date(remBy[a.id]).toISOString() : null,
    })),
    key_results: krs.rows.map(k => ({ ...k, target_date: ymd(k.target_date) || null })),
  };
}

// changes: [{ id, scheduled_date, end_date }] — all must be the user's own actions.
// Runs in one transaction; returns the previous values so the client can undo.
async function rescheduleActions(pool, userId, changes) {
  if (!Array.isArray(changes) || !changes.length) return { ok: false, error: 'no changes' };
  if (changes.length > 200) return { ok: false, error: 'too many changes' };
  for (const c of changes) {
    if (!UUID_RE.test(String(c?.id))) return { ok: false, error: 'invalid action id' };
    if (!isDate(c.scheduled_date)) return { ok: false, error: `invalid date "${c.scheduled_date}"` };
    if (c.end_date != null && c.end_date !== '' && (!isDate(c.end_date) || c.end_date < c.scheduled_date)) return { ok: false, error: `invalid end date "${c.end_date}"` };
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const ids = changes.map(c => c.id);
    const before = (await client.query(
      'SELECT id, scheduled_date, end_date FROM actions WHERE id = ANY($1) AND user_id = $2 FOR UPDATE', [ids, userId])).rows;
    if (before.length !== new Set(ids).size) { await client.query('ROLLBACK'); return { ok: false, error: 'action not found' }; }
    for (const c of changes) {
      await client.query(
        // Moving a task re-arms its "task time" reminder, like the normal edit does.
        'UPDATE actions SET scheduled_date = $1, end_date = $2, reminded_at = NULL WHERE id = $3 AND user_id = $4',
        [c.scheduled_date, c.end_date || null, c.id, userId]);
    }
    await client.query('COMMIT');
    return {
      ok: true,
      updated: changes.length,
      previous: before.map(b => ({ id: b.id, scheduled_date: ymd(b.scheduled_date) || null, end_date: ymd(b.end_date) || null })),
    };
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[timeline] reschedule:', e.message);
    return { ok: false, error: 'could not reschedule' };
  } finally {
    client.release();
  }
}

module.exports = { projectTimeline, rescheduleActions };
