// Brain Dump → Plan engine.
//
// Takes a free-form "brain dump" (voice or text) and asks the model to convert it
// into a STRUCTURED RPM plan: a list of operations (create category / project /
// key result / action, or update an existing action) with temp ids so children can
// reference new parents. Nothing is written here — generatePlan() only proposes.
// applyPlan() performs the approved subset inside a transaction, resolving temp ids
// to real ids and honouring ownership.

const { runChat, AiError } = require('./service');

const CAT_COLORS = ['#FF6B6B', '#4ECDC4', '#FFD166', '#A78BFA', '#F472B6', '#60A5FA', '#34D399', '#FB923C', '#F87171', '#22D3EE'];

async function loadExisting(pool, userId) {
  const [cats, projs] = await Promise.all([
    pool.query('SELECT id, name FROM categories WHERE user_id = $1 AND is_active = true ORDER BY sort_order', [userId]),
    pool.query('SELECT id, name, category_id FROM projects WHERE user_id = $1 AND is_archived = false ORDER BY sort_order', [userId]),
  ]);
  return { categories: cats.rows, projects: projs.rows };
}

function planSystemPrompt(today, existing) {
  const catLines = existing.categories.length
    ? existing.categories.map(c => `  - ${c.id} · ${c.name}`).join('\n')
    : '  (none yet)';
  const projLines = existing.projects.length
    ? existing.projects.map(p => `  - ${p.id} · ${p.name}`).join('\n')
    : '  (none yet)';

  return `You are the RPM planning engine. RPM = Result, Purpose, Massive Action Plan.
Convert the user's brain dump into a structured plan that fits the RPM method: life Categories
contain Projects (each with a Result + Purpose), Projects have Key Results (measurable) and
Actions (concrete tasks). Be decisive but faithful — only include what the dump actually implies.

Today is ${today}.

The user's EXISTING categories (id · name):
${catLines}

The user's EXISTING projects (id · name):
${projLines}

Output ONLY a single JSON object — no markdown fences, no prose before or after. Shape:
{
  "summary": "one short sentence describing the plan",
  "operations": [
    { "op": "create_category", "tempId": "c1", "name": "Health & Energy" },
    { "op": "create_project", "tempId": "p1", "parentTempId": "c1", "name": "Get fit by Q3", "result": "...", "purpose": "..." },
    { "op": "create_project", "tempId": "p2", "categoryId": "<existing category id>", "name": "Investor deck", "purpose": "..." },
    { "op": "create_key_result", "parentTempId": "p1", "title": "Work out 4x per week", "target_value": 4, "unit": "sessions/wk", "target_date": "YYYY-MM-DD" },
    { "op": "create_action", "parentTempId": "p1", "title": "Book gym induction", "priority": 3, "scheduled_date": "YYYY-MM-DD", "duration_minutes": 60 },
    { "op": "create_action", "projectId": "<existing project id>", "title": "Draft slide 1", "priority": 2 },
    { "op": "create_action", "categoryId": "<existing category id>", "title": "Buy mom a gift", "priority": 2, "scheduled_date": "YYYY-MM-DD" },
    { "op": "update_action", "actionId": "<existing action id>", "priority": 3, "reason": "deadline is near" }
  ]
}

Rules:
- REUSE existing categories/projects by their id (categoryId / projectId) whenever the item clearly fits one.
  Only emit create_category / create_project when nothing existing fits.
- Every project MUST land in a category: use parentTempId (a new category in this plan) OR categoryId (existing).
- Key results and project actions attach via parentTempId (a new project here) OR projectId (existing).
  An action with no project may use categoryId (existing) to sit under a category, or omit both to be unassigned.
- priority: 0 none, 1 low, 2 medium, 3 high. Dates are "YYYY-MM-DD". duration_minutes is a number.
- tempId: a short unique string per NEW item; children reference it via parentTempId.
- Category names must be at most 50 characters.
- Prefer 3-8 actions for "today/this week" items; don't invent goals the user didn't imply.
- Do NOT include any operation type other than the five above. Never invent ids — only use ids listed above.`;
}

function parsePlan(text) {
  let s = String(text || '').trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();
  const a = s.indexOf('{');
  const b = s.lastIndexOf('}');
  if (a >= 0 && b > a) s = s.slice(a, b + 1);
  return JSON.parse(s);
}

const ALLOWED_OPS = new Set(['create_category', 'create_project', 'create_key_result', 'create_action', 'update_action']);

// Generate a proposed plan (no writes).
async function generatePlan({ pool, userId, modelKey, text }) {
  if (!text || !String(text).trim()) throw new AiError('empty', 'Say or type something first.');
  const today = new Date().toISOString().slice(0, 10);
  const existing = await loadExisting(pool, userId);
  const messages = [
    { role: 'system', content: planSystemPrompt(today, existing) },
    { role: 'user', content: `Brain dump:\n"""\n${String(text).trim().slice(0, 6000)}\n"""` },
  ];

  let raw = '';
  for await (const ev of runChat({ pool, userId, modelKey, messages, webSearch: false, rpm: false, autoMode: false })) {
    if (ev.type === 'text') raw += ev.text;
    else if (ev.type === 'error') throw new AiError('ai_error', ev.message || 'AI request failed');
  }

  let plan;
  try { plan = parsePlan(raw); }
  catch { throw new AiError('bad_plan', 'The model returned an unreadable plan — try again, or pick a different model in Settings.'); }

  const operations = Array.isArray(plan.operations) ? plan.operations.filter(o => o && ALLOWED_OPS.has(o.op)).slice(0, 200) : [];
  return { summary: plan.summary || '', operations, existing, today };
}

function within7Days(dateStr, today) {
  if (!dateStr) return false;
  try {
    const d = new Date(dateStr + 'T00:00:00Z').getTime();
    const t = new Date(today + 'T00:00:00Z').getTime();
    return d >= t && d <= t + 7 * 86400000;
  } catch { return false; }
}

// Apply the approved subset of a plan. Resolves temp ids and checks ownership.
async function applyPlan({ pool, userId, operations }) {
  if (!Array.isArray(operations) || !operations.length) return { applied: {}, errors: ['No changes selected.'] };
  const today = new Date().toISOString().slice(0, 10);
  const ops = operations.filter(o => o && ALLOWED_OPS.has(o.op));

  const client = await pool.connect();
  const catMap = {};                 // tempId -> real category id
  const projMap = {};                // tempId -> real project id
  const projCat = {};                // real project id -> its category id
  const applied = { categories: 0, projects: 0, key_results: 0, actions: 0, updates: 0 };
  const errors = [];
  let catColorIx = 0;

  const ownsCategory = async (id) => id && (await client.query('SELECT 1 FROM categories WHERE id = $1 AND user_id = $2', [id, userId])).rowCount > 0;
  const projectCategory = async (id) => {
    if (projCat[id]) return projCat[id];
    const r = await client.query('SELECT category_id FROM projects WHERE id = $1 AND user_id = $2', [id, userId]);
    if (!r.rows[0]) return null;
    projCat[id] = r.rows[0].category_id;
    return projCat[id];
  };

  try {
    await client.query('BEGIN');

    // 1) Categories
    for (const o of ops.filter(o => o.op === 'create_category')) {
      const name = String(o.name || '').trim().slice(0, 50);
      if (!name) { errors.push('Skipped a category with no name.'); continue; }
      const color = CAT_COLORS[catColorIx++ % CAT_COLORS.length];
      const r = await client.query(
        `INSERT INTO categories (user_id, name, color, icon, sort_order)
         VALUES ($1, $2, $3, 'target', (SELECT COALESCE(MAX(sort_order),0)+1 FROM categories WHERE user_id=$1))
         RETURNING id`, [userId, name, color]);
      if (o.tempId) catMap[o.tempId] = r.rows[0].id;
      applied.categories++;
    }

    // 2) Projects (need a category)
    for (const o of ops.filter(o => o.op === 'create_project')) {
      const name = String(o.name || '').trim().slice(0, 200);
      if (!name) { errors.push('Skipped a project with no name.'); continue; }
      let categoryId = o.parentTempId ? catMap[o.parentTempId] : null;
      if (!categoryId && o.categoryId && await ownsCategory(o.categoryId)) categoryId = o.categoryId;
      if (!categoryId) { errors.push(`Skipped project "${name}" — no valid category.`); continue; }
      const r = await client.query(
        `INSERT INTO projects (user_id, category_id, name, ultimate_result, ultimate_purpose, sort_order)
         VALUES ($1, $2, $3, $4, $5, (SELECT COALESCE(MAX(sort_order),0)+1 FROM projects WHERE user_id=$1))
         RETURNING id`, [userId, categoryId, name, o.result || null, o.purpose || null]);
      const pid = r.rows[0].id;
      if (o.tempId) projMap[o.tempId] = pid;
      projCat[pid] = categoryId;
      applied.projects++;
    }

    // helper: resolve a project id from an op (new tempId or existing)
    const resolveProject = async (o) => {
      if (o.parentTempId && projMap[o.parentTempId]) return projMap[o.parentTempId];
      if (o.projectId) {
        const cat = await projectCategory(o.projectId);
        if (cat !== null) return o.projectId;
      }
      return null;
    };

    // 3) Key results + actions + updates
    for (const o of ops) {
      if (o.op === 'create_key_result') {
        const projectId = await resolveProject(o);
        const title = String(o.title || '').trim().slice(0, 300);
        if (!projectId || !title) { errors.push(`Skipped a key result${title ? ` "${title}"` : ''} — needs a project.`); continue; }
        await client.query(
          `INSERT INTO key_results (project_id, title, target_value, unit, target_date, sort_order)
           VALUES ($1, $2, $3, $4, $5, (SELECT COALESCE(MAX(sort_order),0)+1 FROM key_results WHERE project_id=$1))`,
          [projectId, title, (o.target_value ?? null), o.unit || null, o.target_date || null]);
        applied.key_results++;
      } else if (o.op === 'create_action') {
        const title = String(o.title || '').trim();
        if (!title) { errors.push('Skipped an action with no title.'); continue; }
        const projectId = await resolveProject(o);
        let categoryId = projectId ? await projectCategory(projectId) : null;
        if (!categoryId && o.categoryId && await ownsCategory(o.categoryId)) categoryId = o.categoryId;
        const sched = o.scheduled_date || null;
        await client.query(
          `INSERT INTO actions (user_id, category_id, project_id, title, priority, scheduled_date, duration_minutes, is_this_week, sort_order)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, (SELECT COALESCE(MAX(sort_order),0)+1 FROM actions WHERE user_id=$1))`,
          [userId, categoryId, projectId, title.slice(0, 500), Number(o.priority) || 0, sched, Number(o.duration_minutes) || 5, within7Days(sched, today)]);
        applied.actions++;
      } else if (o.op === 'update_action') {
        if (!o.actionId) { errors.push('Skipped an update with no action id.'); continue; }
        const r = await client.query(
          `UPDATE actions SET
             title = COALESCE($1, title),
             notes = COALESCE($2, notes),
             scheduled_date = COALESCE($3, scheduled_date),
             duration_minutes = COALESCE($4, duration_minutes),
             priority = COALESCE($5, priority),
             reminded_at = CASE WHEN $3 IS NOT NULL THEN NULL ELSE reminded_at END
           WHERE id = $6 AND user_id = $7 RETURNING id`,
          [o.title ?? null, o.notes ?? null, o.scheduled_date || null,
           (o.duration_minutes === undefined ? null : o.duration_minutes),
           (o.priority === undefined ? null : o.priority), o.actionId, userId]);
        if (r.rows[0]) applied.updates++;
        else errors.push('Skipped an update — action not found.');
      }
    }

    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw new AiError('apply_failed', 'Could not save the plan: ' + (e.message || 'unknown error'));
  } finally {
    client.release();
  }

  return { applied, errors };
}

module.exports = { generatePlan, applyPlan };
