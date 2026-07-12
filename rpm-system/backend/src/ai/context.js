// Builds a compact snapshot of the user's ENTIRE RPM hierarchy to inject as
// system context — categories and their horizon goals (ultimate vision, 1-year,
// 90-day/quarterly), projects (result + purpose + dates), key results, blocks,
// and actions — all with IDs the tools can act on. This is read live per request,
// so the assistant works from the user's real data, never a static template.

function clip(s, n) { return s ? String(s).replace(/\s+/g, ' ').trim().slice(0, n) : ''; }

async function buildRpmContext(pool, userId) {
  const today = new Date().toISOString().slice(0, 10);

  const [cats, projects, krs, actions, blocks] = await Promise.all([
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
      `SELECT id, title, scheduled_date, is_completed, project_id
         FROM actions
        WHERE user_id = $1 AND is_cancelled = false
          AND (scheduled_date IS NULL OR scheduled_date >= $2)
        ORDER BY scheduled_date NULLS LAST LIMIT 80`, [userId, today]),
    pool.query('SELECT id, result_title, project_id, target_date FROM rpm_blocks WHERE user_id = $1 ORDER BY sort_order LIMIT 50', [userId]),
  ]);

  const catName = Object.fromEntries(cats.rows.map(c => [c.id, c.name]));
  const L = [`Today: ${today}`];

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
    const dates = [p.start_date, p.end_date].filter(Boolean).map(d => String(d).slice(0, 10)).join(' → ');
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
    const due = k.target_date ? String(k.target_date).slice(0, 10) : 'no date';
    L.push(`• ${k.id} · ${clip(k.title, 70)} · ${k.current_value ?? 0}/${k.target_value ?? '?'} ${k.unit || ''}${k.is_completed ? ' [done]' : ''} · ${due} · ${k.project_id}`);
  }

  L.push('\n=== RPM BLOCKS (id · result · due · projectId) ===');
  if (!blocks.rows.length) L.push('  (none)');
  for (const b of blocks.rows) {
    const due = b.target_date ? ' · due ' + String(b.target_date).slice(0, 10) : '';
    L.push(`• ${b.id} · ${clip(b.result_title, 60)}${due} · ${b.project_id}`);
  }

  L.push('\n=== ACTIONS (id · [x/ ] · title · date · projectId) ===');
  if (!actions.rows.length) L.push('  (none upcoming/unscheduled)');
  for (const a of actions.rows) {
    const d = a.scheduled_date ? String(a.scheduled_date).slice(0, 10) : 'unscheduled';
    L.push(`• ${a.id} · [${a.is_completed ? 'x' : ' '}] · ${clip(a.title, 60)} · ${d} · ${a.project_id || '—'}`);
  }

  return {
    today,
    text: L.join('\n'),
    counts: {
      categories: cats.rows.length, projects: projects.rows.length,
      keyResults: krs.rows.length, actions: actions.rows.length, blocks: blocks.rows.length,
    },
  };
}

module.exports = { buildRpmContext };
