// Builds a compact snapshot of the user's RPM world to inject as system context,
// so the assistant references real projects/key-results/actions (with IDs the
// tools can act on). Kept terse to control token cost.

async function buildRpmContext(pool, userId) {
  const today = new Date().toISOString().slice(0, 10);

  const [cats, projects, krs, actions, blocks] = await Promise.all([
    pool.query('SELECT id, name FROM categories WHERE user_id = $1 AND is_active = true ORDER BY sort_order', [userId]),
    pool.query('SELECT id, name, category_id, ultimate_result FROM projects WHERE user_id = $1 ORDER BY sort_order', [userId]),
    pool.query(
      `SELECT kr.id, kr.title, kr.current_value, kr.target_value, kr.unit, kr.target_date, kr.project_id
         FROM key_results kr JOIN projects p ON kr.project_id = p.id
        WHERE p.user_id = $1 AND kr.is_completed IS NOT TRUE
        ORDER BY kr.target_date NULLS LAST LIMIT 40`, [userId]),
    pool.query(
      `SELECT id, title, scheduled_date, is_completed, project_id
         FROM actions
        WHERE user_id = $1 AND is_cancelled = false
          AND (scheduled_date IS NULL OR scheduled_date >= $2)
        ORDER BY scheduled_date NULLS LAST LIMIT 60`, [userId, today]),
    pool.query('SELECT id, result_title, project_id FROM rpm_blocks WHERE user_id = $1 ORDER BY sort_order LIMIT 40', [userId]),
  ]);

  const catName = Object.fromEntries(cats.rows.map(c => [c.id, c.name]));
  const line = [];
  line.push(`Today: ${today}`);

  line.push('\nPROJECTS (id · name · category · ultimate result):');
  if (!projects.rows.length) line.push('  (none)');
  for (const p of projects.rows) {
    line.push(`  ${p.id} · ${p.name} · ${catName[p.category_id] || '—'}${p.ultimate_result ? ' · ' + String(p.ultimate_result).slice(0, 80) : ''}`);
  }

  line.push('\nKEY RESULTS (id · title · progress · due · projectId):');
  if (!krs.rows.length) line.push('  (none)');
  for (const k of krs.rows) {
    const due = k.target_date ? String(k.target_date).slice(0, 10) : 'no date';
    line.push(`  ${k.id} · ${k.title} · ${k.current_value ?? 0}/${k.target_value ?? '?'} ${k.unit || ''} · ${due} · ${k.project_id}`);
  }

  line.push('\nRPM BLOCKS (id · result · projectId):');
  if (!blocks.rows.length) line.push('  (none)');
  for (const b of blocks.rows) line.push(`  ${b.id} · ${String(b.result_title || '').slice(0, 60)} · ${b.project_id}`);

  line.push('\nACTIONS (id · [x/ ] · title · date · projectId):');
  if (!actions.rows.length) line.push('  (none)');
  for (const a of actions.rows) {
    const d = a.scheduled_date ? String(a.scheduled_date).slice(0, 10) : 'unscheduled';
    line.push(`  ${a.id} · [${a.is_completed ? 'x' : ' '}] · ${String(a.title).slice(0, 60)} · ${d} · ${a.project_id || '—'}`);
  }

  return {
    today,
    text: line.join('\n'),
    counts: { projects: projects.rows.length, keyResults: krs.rows.length, actions: actions.rows.length, blocks: blocks.rows.length },
  };
}

module.exports = { buildRpmContext };
