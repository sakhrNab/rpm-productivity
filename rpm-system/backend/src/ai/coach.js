// RPM Coach — scaffolded. Assembles the user's RPM context (today's actions,
// off-pace key results) and asks the model for a focused "must-win" for today.
// Reuses the unified runChat layer.

const { runChat } = require('./service');

async function buildContext(pool, userId, today) {
  const actions = (await pool.query(
    `SELECT title, is_completed FROM actions
      WHERE user_id = $1 AND scheduled_date = $2 AND is_cancelled = false
      ORDER BY sort_order`,
    [userId, today]
  )).rows;

  const keyResults = (await pool.query(
    `SELECT kr.title, kr.current_value, kr.target_value, kr.unit, kr.target_date
       FROM key_results kr
       JOIN projects p ON kr.project_id = p.id
      WHERE p.user_id = $1 AND kr.is_completed IS NOT TRUE
      ORDER BY kr.target_date NULLS LAST
      LIMIT 20`,
    [userId]
  )).rows;

  return { today, actions, keyResults };
}

function renderContext(ctx) {
  const actionsText = ctx.actions.length
    ? ctx.actions.map(a => `- [${a.is_completed ? 'x' : ' '}] ${a.title}`).join('\n')
    : '(nothing scheduled today)';
  const krText = ctx.keyResults.length
    ? ctx.keyResults.map(k => {
        const cur = k.current_value ?? 0;
        const tgt = k.target_value ?? '?';
        const due = k.target_date ? ` (due ${String(k.target_date).slice(0, 10)})` : '';
        return `- ${k.title}: ${cur}/${tgt} ${k.unit || ''}${due}`;
      }).join('\n')
    : '(no active key results)';
  return `Today is ${ctx.today}.\n\nToday's scheduled actions:\n${actionsText}\n\nActive key results:\n${krText}`;
}

const SYSTEM = `You are the user's RPM coach (Result, Purpose, Massive Action Plan).
Be warm, direct, and specific. Connect today's actions to the key results they move.
If today's actions don't advance any behind-pace key result, say so plainly and suggest
one concrete swap. Keep it under 150 words. End with one clear "Must-win for today: …".`;

async function runCompass({ pool, userId, modelKey, webSearch = false }) {
  const ctx = await buildContext(pool, userId, new Date().toISOString().slice(0, 10));
  const messages = [
    { role: 'system', content: SYSTEM },
    { role: 'user', content: renderContext(ctx) },
  ];
  let text = '';
  const sources = [];
  for await (const ev of runChat({ pool, userId, modelKey, messages, webSearch })) {
    if (ev.type === 'text') text += ev.text;
    else if (ev.type === 'sources') sources.push(...ev.sources);
  }
  return { context: ctx, text, sources };
}

const PRIO = { 0: '—', 1: 'Low', 2: 'Med', 3: 'High' };

// Review the tasks in a window: how to tackle them + do the priorities make sense.
async function runPlanSuggestions({ pool, userId, modelKey, startDate, endDate }) {
  const actions = (await pool.query(
    `SELECT title, priority, scheduled_date, duration_hours, duration_minutes,
            category_name, project_name, is_completed
       FROM v_actions_full
      WHERE user_id = $1 AND scheduled_date >= $2 AND scheduled_date <= $3
      ORDER BY sort_order`,
    [userId, startDate, endDate]
  )).rows;

  const krs = (await pool.query(
    `SELECT kr.title, kr.current_value, kr.target_value, kr.target_date
       FROM key_results kr JOIN projects p ON kr.project_id = p.id
      WHERE p.user_id = $1 AND kr.is_completed IS NOT TRUE
      ORDER BY kr.target_date NULLS LAST LIMIT 15`,
    [userId]
  )).rows;

  if (!actions.length) return { text: 'You have no tasks scheduled in this window yet — add a few and I can help you plan them.' };

  const taskLines = actions.map(a => {
    const dur = `${a.duration_hours ? a.duration_hours + 'h ' : ''}${a.duration_minutes || 0}m`;
    return `- [${a.is_completed ? 'x' : ' '}] "${a.title}" · priority ${PRIO[a.priority] || '—'} · ${a.category_name || 'no category'} / ${a.project_name || 'no project'} · ${String(a.scheduled_date).slice(0, 10)} · ${dur}`;
  }).join('\n');
  const krLines = krs.length
    ? krs.map(k => `- ${k.title}: ${k.current_value ?? 0}/${k.target_value ?? '?'}${k.target_date ? ' (due ' + String(k.target_date).slice(0, 10) + ')' : ''}`).join('\n')
    : '(no active key results)';

  const system = `You are the user's RPM coach. Review the task list below and give a short, practical plan.
Cover, in clean Markdown with brief sections:
1. **How to tackle it** — a sensible order/approach, what to do first, batching or quick wins, and anything to defer.
2. **Do the priorities make sense?** — if a High-priority task doesn't move a key result, or a Low/none one is actually urgent (near a deadline or blocking others), call it out and suggest the change (e.g. "bump X to High").
Reference tasks by name. Be concise and motivating. Don't restate the whole list.`;
  const user = `Tasks (${startDate}${endDate !== startDate ? ' → ' + endDate : ''}):\n${taskLines}\n\nActive key results:\n${krLines}`;

  let text = '';
  for await (const ev of runChat({ pool, userId, modelKey, messages: [{ role: 'system', content: system }, { role: 'user', content: user }], webSearch: false, rpm: false })) {
    if (ev.type === 'text') text += ev.text;
    else if (ev.type === 'error') throw new Error(ev.message || 'AI request failed');
  }
  return { text };
}

module.exports = { runCompass, runPlanSuggestions };
