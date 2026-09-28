// Builds a compact snapshot of the user's ENTIRE RPM hierarchy to inject as
// system context — categories and their horizon goals (ultimate vision, 1-year,
// 90-day/quarterly), projects (result + purpose + dates), key results, blocks,
// and actions — all with IDs the tools can act on. This is read live per request,
// so the assistant works from the user's real data, never a static template.

const { ymd } = require('./dates');

function clip(s, n) { return s ? String(s).replace(/\s+/g, ' ').trim().slice(0, n) : ''; }

// YYYY-MM-DD in an IANA timezone ("today" must be the USER's date, not the server's UTC).
function todayInTz(tz) {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: tz || 'UTC', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  } catch { return new Date().toISOString().slice(0, 10); }
}
function isValidTz(tz) {
  if (!tz || typeof tz !== 'string' || tz.length > 64) return false;
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true; } catch { return false; }
}
// Browser-reported timezone first, then the one saved in reminder prefs, else UTC.
async function resolveTimezone(pool, userId, clientTz) {
  if (isValidTz(clientTz)) return clientTz;
  try {
    const r = await pool.query('SELECT timezone FROM notification_prefs WHERE user_id = $1', [userId]);
    if (isValidTz(r.rows[0]?.timezone)) return r.rows[0].timezone;
  } catch { /* prefs optional */ }
  return 'UTC';
}
const PRIO = { 1: 'low', 2: 'med', 3: 'HIGH' };
const weekday = (d) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' });

async function buildRpmContext(pool, userId, { timezone } = {}) {
  const tz = timezone || 'UTC';
  const today = todayInTz(tz);

  const [cats, projects, krs, actions, blocks, overdue, coachRows] = await Promise.all([
    pool.query(
      `SELECT c.id, c.name,
              d.ultimate_vision, d.roles, d.ultimate_purpose, d.one_year_goals, d.ninety_day_goals
         FROM categories c
         LEFT JOIN category_details d ON d.category_id = c.id
        WHERE c.user_id = $1 AND c.is_active = true
        ORDER BY c.sort_order`, [userId]),
    pool.query(
      `SELECT id, name, category_id, ultimate_result, ultimate_purpose, start_date, end_date, is_completed
         FROM projects WHERE user_id = $1 ORDER BY sort_order`, [userId]),
    pool.query(
      `SELECT kr.id, kr.title, kr.current_value, kr.target_value, kr.unit, kr.target_date, kr.project_id, kr.is_completed
         FROM key_results kr JOIN projects p ON kr.project_id = p.id
        WHERE p.user_id = $1 ORDER BY kr.target_date NULLS LAST LIMIT 60`, [userId]),
    pool.query(
      `SELECT id, title, scheduled_date, is_completed, project_id, priority
         FROM actions
        WHERE user_id = $1 AND is_cancelled = false
          AND (scheduled_date IS NULL OR scheduled_date >= $2)
        ORDER BY scheduled_date NULLS LAST LIMIT 80`, [userId, today]),
    pool.query('SELECT id, result_title, project_id, target_date FROM rpm_blocks WHERE user_id = $1 ORDER BY sort_order LIMIT 50', [userId]),
    pool.query(
      `SELECT id, title, scheduled_date, project_id, priority, ($2::date - scheduled_date) AS days_late
         FROM actions
        WHERE user_id = $1 AND is_cancelled = false AND is_completed = false
          AND scheduled_date < $2::date
        ORDER BY scheduled_date DESC LIMIT 30`, [userId, today]),
    pool.query(
      `SELECT co.id, co.name, co.scope, COALESCE(p.name, c.name) AS area
         FROM coaches co
         LEFT JOIN projects p ON p.id = co.project_id
         LEFT JOIN categories c ON c.id = co.category_id
        WHERE co.user_id = $1 AND co.is_active = true
        ORDER BY co.created_at`, [userId]).catch(() => ({ rows: [] })),
  ]);

  const catName = Object.fromEntries(cats.rows.map(c => [c.id, c.name]));
  const L = [`Today: ${today} (${weekday(today)}), timezone ${tz}`];

  L.push('\n=== CATEGORIES & HORIZON GOALS (id · name) ===');
  if (!cats.rows.length) L.push('  (none yet)');
  for (const c of cats.rows) {
    L.push(`• ${c.id} · ${c.name}`);
    if (c.ultimate_vision) L.push(`    vision: ${clip(c.ultimate_vision, 160)}`);
    if (c.one_year_goals) L.push(`    1-year: ${clip(c.one_year_goals, 200)}`);
    if (c.ninety_day_goals) L.push(`    90-day (quarter): ${clip(c.ninety_day_goals, 200)}`);
    if (c.ultimate_purpose) L.push(`    purpose: ${clip(c.ultimate_purpose, 140)}`);
  }

  L.push('\n=== PROJECTS (id · name · category · result | purpose | dates) ===');
  if (!projects.rows.length) L.push('  (none)');
  for (const p of projects.rows) {
    const dates = [p.start_date, p.end_date].filter(Boolean).map(ymd).join(' → ');
    L.push(`• ${p.id} · ${p.name} · ${catName[p.category_id] || '—'}${p.is_completed ? ' [done]' : ''}`);
    const bits = [];
    if (p.ultimate_result) bits.push(`result: ${clip(p.ultimate_result, 120)}`);
    if (p.ultimate_purpose) bits.push(`purpose: ${clip(p.ultimate_purpose, 100)}`);
    if (dates) bits.push(`dates: ${dates}`);
    if (bits.length) L.push('    ' + bits.join(' | '));
  }

  L.push('\n=== KEY RESULTS (id · title · progress · due · projectId) ===');
  if (!krs.rows.length) L.push('  (none)');
  for (const k of krs.rows) {
    const due = k.target_date ? ymd(k.target_date) : 'no date';
    L.push(`• ${k.id} · ${clip(k.title, 70)} · ${k.current_value ?? 0}/${k.target_value ?? '?'} ${k.unit || ''}${k.is_completed ? ' [done]' : ''} · ${due} · ${k.project_id}`);
  }

  L.push('\n=== RPM BLOCKS (id · result · due · projectId) ===');
  if (!blocks.rows.length) L.push('  (none)');
  for (const b of blocks.rows) {
    const due = b.target_date ? ' · due ' + ymd(b.target_date) : '';
    L.push(`• ${b.id} · ${clip(b.result_title, 60)}${due} · ${b.project_id}`);
  }

  L.push('\n=== OVERDUE — still open from earlier days (id · title · planned date · days late · priority · projectId) ===');
  if (!overdue.rows.length) L.push('  (none)');
  for (const a of overdue.rows) {
    L.push(`• ${a.id} · ${clip(a.title, 60)} · ${ymd(a.scheduled_date)} · ${a.days_late}d late · ${PRIO[a.priority] || '—'} · ${a.project_id || '—'}`);
  }

  L.push('\n=== ACTIONS today & upcoming & unscheduled (id · [x/ ] · title · date · priority · projectId) ===');
  if (!actions.rows.length) L.push('  (none upcoming/unscheduled)');
  for (const a of actions.rows) {
    const d = a.scheduled_date ? ymd(a.scheduled_date) : 'unscheduled';
    L.push(`• ${a.id} · [${a.is_completed ? 'x' : ' '}] · ${clip(a.title, 60)} · ${d} · ${PRIO[a.priority] || '—'} · ${a.project_id || '—'}`);
  }
  L.push('(Older or completed actions are not listed — use find_actions to look them up.)');

  if (coachRows.rows.length) {
    L.push('\n=== COACHES (id · name · the area they coach) ===');
    for (const c of coachRows.rows) L.push(`• ${c.id} · ${c.name} · ${c.scope === 'project' ? 'project' : 'area'}: ${c.area || '—'}`);
  }

  return {
    today,
    text: L.join('\n'),
    counts: {
      categories: cats.rows.length, projects: projects.rows.length,
      keyResults: krs.rows.length, actions: actions.rows.length, blocks: blocks.rows.length, overdue: overdue.rows.length, coaches: coachRows.rows.length,
    },
  };
}

module.exports = { buildRpmContext, todayInTz, resolveTimezone, isValidTz };
