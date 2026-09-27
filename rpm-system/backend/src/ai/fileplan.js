// File → Plan. An uploaded document (brief, notes, spreadsheet, syllabus…) becomes a
// scheduled RPM plan: where it belongs (existing project, or a proposed new one),
// phases (→ RPM blocks), tasks with size / effort / span / priority / dependencies /
// reminders, plus the gaps the document didn't cover.
//
// generateFilePlan() only proposes. normalizePlan() treats every model field as
// untrusted and is re-run on the client-edited plan at apply time. applyFilePlan()
// writes the approved plan in one transaction.

const { runChat, AiError } = require('./service');
const { buildRpmContext, todayInTz } = require('./context');
const { recordUsage } = require('./usage');
const { schedulePlan, addDays, isDate } = require('./planSchedule');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (v) => typeof v === 'string' && UUID_RE.test(v);
const str = (v, n) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const longStr = (v, n) => String(v ?? '').trim().slice(0, n);
const clampInt = (v, lo, hi, dflt) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : dflt; };
const SIZES = ['small', 'medium', 'big'];
const MAX_TASKS = 80;
const CAT_COLORS = ['#FF6B6B', '#4ECDC4', '#FFD166', '#A78BFA', '#F472B6', '#60A5FA', '#34D399', '#FB923C'];

// An included task no longer waits for a prerequisite the user deselected (that
// prerequisite won't be created). The frontend applies the same rule.
function schedulingDeps(t, tasks) {
  if (!t.include) return t.depends_on;
  const included = new Set(tasks.filter(x => x.include).map(x => x.key));
  return t.depends_on.filter(d => included.has(d));
}

async function loadExisting(pool, userId) {
  const [cats, projs] = await Promise.all([
    pool.query('SELECT id, name, color FROM categories WHERE user_id = $1 AND is_active = true ORDER BY sort_order', [userId]),
    pool.query('SELECT id, name, category_id, ultimate_result FROM projects WHERE user_id = $1 AND is_archived = false AND is_completed = false ORDER BY sort_order', [userId]),
  ]);
  return { categories: cats.rows, projects: projs.rows };
}

function systemPrompt(today, contextText) {
  return `You are the RPM planning engine (RPM = Result, Purpose, Massive Action Plan). The user uploaded a
document. Understand what it is, decide where it belongs in THEIR life plan, and turn it into a realistic,
scheduled plan of work. Today is ${today}.

=== USER'S RPM DATA (categories → projects, key results, actions — with ids) ===
${contextText}
=== END DATA ===

Output ONLY one JSON object (no markdown fences, no prose):
{
  "title": "short name for this plan (<= 60 chars)",
  "summary": "1-2 sentences: what the document is and what the plan achieves",
  "doc_type": "e.g. project brief, meeting notes, course syllabus, event checklist",
  "placement": {
    "decision": "existing_project" | "new_project",
    "project_id": "<existing project id, only for existing_project>",
    "category_id": "<existing category id this belongs to>",
    "confidence": 0-100,
    "reason": "one sentence, specific to their data",
    "alternatives": [ { "project_id": "<existing id>", "reason": "short" } ],
    "new_project": { "name": "<= 60 chars", "result": "the measurable outcome", "purpose": "why it matters to them" },
    "new_category_name": null
  },
  "phases": [ { "key": "ph1", "title": "short", "description": "one sentence" } ],
  "tasks": [ {
    "key": "t1", "phase": "ph1",
    "title": "verb-first, specific, <= 80 chars",
    "description": "what done looks like; include concrete details from the document",
    "size": "small" | "medium" | "big",
    "priority": 0-3,
    "effort_minutes": 30,
    "span_days": 1,
    "start": "YYYY-MM-DD or null",
    "deadline": "YYYY-MM-DD or null",
    "depends_on": ["t0"],
    "reminder": { "days_before": 0, "time": "09:00" } | null,
    "source": "document" | "initiative",
    "why": "only for initiative tasks: why you added it"
  } ],
  "key_results": [ { "title": "measurable", "target_value": 10, "unit": "customers", "target_date": "YYYY-MM-DD" } ],
  "insights": [ { "type": "gap" | "risk" | "question", "text": "<= 30 words" } ]
}

Placement rules:
- Prefer an EXISTING project when the document clearly advances its result — use its real id. Otherwise
  "new_project" in the best-fitting existing category. Only set new_category_name when no category fits at all.
- ALWAYS fill new_project (it is the fallback if the user prefers a new project) and category_id.
- confidence reflects how sure you are; list up to 2 alternatives when it is not obvious.

Planning rules:
- Extract every real piece of work in the document. Split big fuzzy work into concrete tasks; group into 2-6 phases.
- size: small (< 1h), medium (1-4h), big (> 4h, usually multi-day). effort_minutes = hands-on time;
  span_days = calendar days it realistically occupies (big tasks span several days, small ones 1).
- depends_on: only real prerequisites ("can't do X until Y is done"). No cycles. Parallel work has no dependency.
- start/deadline: ONLY when the document states or clearly implies a date; resolve relative dates from today.
  Otherwise null — the scheduler places tasks after their dependencies.
- priority: 3 = on the critical path or has a hard deadline, 2 = important, 1 = nice to have, 0 = someday.
- reminder: for tasks with a deadline or that must not slip (days_before 0-7, a sensible time); null otherwise.
- TAKE INITIATIVE: add up to 5 tasks the document forgot but the outcome clearly needs (prep, reviews,
  follow-ups, a buffer before a deadline). Mark them "source": "initiative" with a one-line "why".
- insights: gaps in the document, risks to the timeline, and questions the user should answer. Max 6.
- key_results: 0-3 measurable key results that prove the document's goal is met. Skip ones the chosen project
  already tracks (see KEY RESULTS in the data).
- Max ${MAX_TASKS} tasks. Match the document's language. Never invent ids.`;
}

function parseJson(text) {
  let s = String(text || '').trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();
  const a = s.indexOf('{'), b = s.lastIndexOf('}');
  if (a >= 0 && b > a) s = s.slice(a, b + 1);
  return JSON.parse(s);
}

// Make a model (or client-edited) plan safe and consistent. Pure except for `existing`.
function normalizePlan(raw, existing, today) {
  const p = raw && typeof raw === 'object' ? raw : {};
  const projById = new Map(existing.projects.map(x => [x.id, x]));
  const catIds = new Set(existing.categories.map(c => c.id));

  // Placement
  const pl = p.placement || {};
  let decision = pl.decision === 'existing_project' ? 'existing_project' : 'new_project';
  let projectId = isUuid(pl.project_id) && projById.has(pl.project_id) ? pl.project_id : null;
  if (decision === 'existing_project' && !projectId) decision = 'new_project';
  let categoryId = projectId ? projById.get(projectId).category_id : (isUuid(pl.category_id) && catIds.has(pl.category_id) ? pl.category_id : null);
  const np = pl.new_project || {};
  const placement = {
    decision,
    project_id: projectId,
    category_id: categoryId,
    confidence: clampInt(pl.confidence, 0, 100, 60),
    reason: str(pl.reason, 300),
    alternatives: (Array.isArray(pl.alternatives) ? pl.alternatives : [])
      .filter(a => a && isUuid(a.project_id) && projById.has(a.project_id) && a.project_id !== projectId)
      .slice(0, 2).map(a => ({ project_id: a.project_id, reason: str(a.reason, 200) })),
    new_project: { name: str(np.name || p.title, 60) || 'New project', result: longStr(np.result, 500), purpose: longStr(np.purpose, 500) },
    new_category_name: !categoryId && pl.new_category_name ? str(pl.new_category_name, 50) : null,
  };
  if (!placement.category_id && !placement.new_category_name && existing.categories[0]) placement.category_id = existing.categories[0].id;

  // Phases
  const phases = [];
  const phaseKeys = new Set();
  for (const ph of (Array.isArray(p.phases) ? p.phases : []).slice(0, 8)) {
    const key = str(ph?.key, 20) || `ph${phases.length + 1}`;
    if (phaseKeys.has(key)) continue;
    phaseKeys.add(key);
    phases.push({ key, title: str(ph.title, 80) || `Phase ${phases.length + 1}`, description: longStr(ph.description, 400) });
  }
  if (!phases.length) { phases.push({ key: 'ph1', title: 'Plan', description: '' }); phaseKeys.add('ph1'); }

  // Tasks
  const tasks = [];
  const taskKeys = new Set();
  for (const t of (Array.isArray(p.tasks) ? p.tasks : []).slice(0, MAX_TASKS)) {
    const title = str(t?.title, 200);
    if (!title) continue;
    let key = str(t.key, 20) || `t${tasks.length + 1}`;
    while (taskKeys.has(key)) key = `${key}_`;
    taskKeys.add(key);
    const size = SIZES.includes(t.size) ? t.size : 'medium';
    const reminder = t.reminder && typeof t.reminder === 'object'
      ? { days_before: clampInt(t.reminder.days_before, 0, 30, 0), time: /^([01]\d|2[0-3]):[0-5]\d$/.test(t.reminder.time) ? t.reminder.time : '09:00' }
      : null;
    tasks.push({
      key,
      phase: phaseKeys.has(t.phase) ? t.phase : phases[0].key,
      title,
      description: longStr(t.description, 2000),
      size,
      priority: clampInt(t.priority, 0, 3, 2),
      effort_minutes: clampInt(t.effort_minutes, 5, 60 * 200, size === 'small' ? 30 : size === 'big' ? 480 : 120),
      span_days: clampInt(t.span_days, 1, 120, size === 'big' ? 3 : 1),
      // `pin` = a date the document (or the user, by dragging) fixed. Computed dates live in
      // `start`/`end` and are never treated as pins, so upstream changes still re-flow.
      start: 'pin' in t ? (isDate(t.pin) ? t.pin : null) : (isDate(t.start) ? t.start : null),
      deadline: isDate(t.deadline) ? t.deadline : null,
      depends_on: Array.isArray(t.depends_on) ? t.depends_on.map(d => str(d, 20)).filter(Boolean) : [],
      reminder,
      source: t.source === 'initiative' ? 'initiative' : 'document',
      why: t.source === 'initiative' ? str(t.why, 200) : '',
      include: t.include !== false,
    });
  }
  for (const t of tasks) t.depends_on = t.depends_on.filter(d => taskKeys.has(d) && d !== t.key);

  const pins = new Map(tasks.map(t => [t.key, t.start]));
  const deps = new Map(tasks.map(t => [t.key, t.depends_on]));
  const sched = schedulePlan(tasks.map(t => ({ ...t, depends_on: schedulingDeps(t, tasks) })), { today });
  const scheduled = sched.tasks;
  for (const t of scheduled) { t.pin = pins.get(t.key); t.depends_on = deps.get(t.key); }

  // Phase date ranges (from included tasks) for the timeline and RPM block target dates.
  for (const ph of phases) {
    const mine = scheduled.filter(t => t.phase === ph.key);
    ph.start = mine.length ? mine.reduce((m, t) => (t.start < m ? t.start : m), mine[0].start) : null;
    ph.end = mine.length ? mine.reduce((m, t) => (t.end > m ? t.end : m), mine[0].end) : null;
  }

  return {
    title: str(p.title, 80) || placement.new_project.name,
    summary: longStr(p.summary, 600),
    doc_type: str(p.doc_type, 60),
    placement,
    phases: phases.filter(ph => ph.start),
    tasks: scheduled,
    key_results: (Array.isArray(p.key_results) ? p.key_results : []).slice(0, 3).map(k => ({
      title: str(k?.title, 200), target_value: Number.isFinite(Number(k?.target_value)) ? Number(k.target_value) : null,
      unit: str(k?.unit, 40) || null, target_date: isDate(k?.target_date) ? k.target_date : null, include: k?.include !== false,
    })).filter(k => k.title),
    insights: (Array.isArray(p.insights) ? p.insights : []).slice(0, 6).map(i => ({
      type: ['gap', 'risk', 'question'].includes(i?.type) ? i.type : 'gap', text: str(i?.text, 240),
    })).filter(i => i.text),
    schedule: { start: sched.start, end: sched.end, span_days: sched.span_days, critical_keys: sched.critical_keys, late_keys: sched.late_keys, broken_edges: sched.broken_edges },
    today,
  };
}

// Stream progress while the model plans; resolve with the normalized plan.
async function* generateFilePlan({ pool, userId, modelKey, text, fileName, kind, truncated, note, timezone, abortSignal }) {
  const today = todayInTz(timezone);
  const [existing, ctx] = await Promise.all([loadExisting(pool, userId), buildRpmContext(pool, userId, { timezone })]);
  const user = `File: ${fileName} (${kind})${truncated ? ' — NOTE: long document, only the first part is included' : ''}
${note ? `The user adds: "${String(note).slice(0, 1000)}"\n` : ''}
"""
${text}
"""`;
  let raw = '', rawUsage = null, found = 0;
  yield { type: 'stage', stage: 'thinking' };
  for await (const ev of runChat({
    pool, userId, modelKey, abortSignal,
    messages: [{ role: 'system', content: systemPrompt(today, ctx.text) }, { role: 'user', content: user }],
  })) {
    if (ev.type === 'text') {
      if (!raw) yield { type: 'stage', stage: 'structuring' };
      raw += ev.text;
      const n = (raw.match(/"span_days"\s*:/g) || []).length;       // one per task — a live counter
      if (n !== found) { found = n; yield { type: 'progress', tasks: n }; }
    } else if (ev.type === 'usage') rawUsage = ev.usage;
    else if (ev.type === 'error') throw new AiError('ai_error', ev.message || 'AI request failed');
  }
  const usage = rawUsage ? await recordUsage(pool, { userId, modelKey, feature: 'file_plan', usage: rawUsage }) : null;
  let parsed;
  try { parsed = parseJson(raw); } catch { throw new AiError('bad_plan', 'The model returned an unreadable plan — try again or pick a different model.'); }
  yield { type: 'stage', stage: 'scheduling' };
  let plan = normalizePlan(parsed, existing, today);
  // Models over-pin: a "start" of today (or earlier) carries no information, and a start
  // before the task's own prerequisites finish contradicts the plan. Drop those pins so the
  // scheduler places the task and later edits still re-flow; keep dates the document set.
  const noisy = new Set(plan.tasks.filter(t => t.pin && (t.pin <= today || t.shifted)).map(t => t.key));
  if (noisy.size) {
    parsed.tasks = (parsed.tasks || []).map(t => (noisy.has(String(t?.key)) ? { ...t, start: null } : t));
    plan = normalizePlan(parsed, existing, today);
  }
  if (!plan.tasks.length) throw new AiError('empty_plan', 'I couldn\'t find any work to plan in this file.');
  yield { type: 'plan', plan, existing, usage };
}

// "YYYY-MM-DD" + "HH:MM" in an IANA zone → UTC Date.
function zonedToUtc(date, time, tz) {
  const [y, mo, d] = date.split('-').map(Number);
  const [h, mi] = time.split(':').map(Number);
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  const offsetAt = (ms) => {
    try {
      const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz || 'UTC', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
        .formatToParts(new Date(ms)).map(x => [x.type, x.value]));
      return Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute) - ms;
    } catch { return 0; }
  };
  let ms = guess - offsetAt(guess);
  ms = guess - offsetAt(ms);                                   // second pass settles DST edges
  return new Date(ms);
}

// Write the approved plan. `placement` is the user's final choice:
//   { mode: 'existing', project_id } | { mode: 'new', category_id | new_category_name, name, result, purpose }
async function applyFilePlan({ pool, userId, plan: rawPlan, placement, options = {}, timezone }) {
  const existing = await loadExisting(pool, userId);
  const today = todayInTz(timezone);
  const plan = normalizePlan(rawPlan, existing, today);
  const tasks = plan.tasks.filter(t => t.include);
  if (!tasks.length) throw new AiError('nothing', 'Select at least one task to create.');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    let projectId, categoryId, createdProject = false;
    if (placement?.mode === 'existing') {
      const own = existing.projects.find(p => p.id === placement.project_id);
      if (!own) throw new AiError('bad_project', 'That project was not found.');
      projectId = own.id; categoryId = own.category_id;
    } else {
      const name = str(placement?.name, 200);
      if (!name) throw new AiError('bad_project', 'Give the new project a name.');
      if (isUuid(placement?.category_id) && existing.categories.some(c => c.id === placement.category_id)) {
        categoryId = placement.category_id;
      } else if (str(placement?.new_category_name, 50)) {
        const r = await client.query(
          `INSERT INTO categories (user_id, name, color, icon, sort_order)
           VALUES ($1, $2, $3, 'target', (SELECT COALESCE(MAX(sort_order),0)+1 FROM categories WHERE user_id=$1)) RETURNING id`,
          [userId, str(placement.new_category_name, 50), CAT_COLORS[existing.categories.length % CAT_COLORS.length]]);
        categoryId = r.rows[0].id;
      } else throw new AiError('bad_category', 'Pick a category for the new project.');
      const r = await client.query(
        `INSERT INTO projects (user_id, category_id, name, ultimate_result, ultimate_purpose, start_date, end_date, sort_order)
         VALUES ($1, $2, $3, $4, $5, $6, $7, (SELECT COALESCE(MAX(sort_order),0)+1 FROM projects WHERE user_id=$1)) RETURNING id`,
        [userId, categoryId, name, longStr(placement.result, 1000) || null, longStr(placement.purpose, 1000) || null,
          tasks.reduce((m, t) => (t.start < m ? t.start : m), tasks[0].start), tasks.reduce((m, t) => (t.end > m ? t.end : m), tasks[0].end)]);
      projectId = r.rows[0].id; createdProject = true;
    }

    // Phases → RPM blocks (Result = phase, Massive Action Plan = its tasks).
    const blockByPhase = {};
    if (options.create_blocks !== false) {
      for (const ph of plan.phases) {
        const mine = tasks.filter(t => t.phase === ph.key);
        if (!mine.length) continue;
        const end = mine.reduce((m, t) => (t.end > m ? t.end : m), mine[0].end);
        const r = await client.query(
          `INSERT INTO rpm_blocks (user_id, category_id, project_id, result_title, purpose, target_date, sort_order)
           VALUES ($1, $2, $3, $4, $5, $6, (SELECT COALESCE(MAX(sort_order),0)+1 FROM rpm_blocks WHERE user_id=$1)) RETURNING id`,
          [userId, categoryId, projectId, ph.title.slice(0, 300), ph.description || null, end]);
        blockByPhase[ph.key] = r.rows[0].id;
      }
    }

    const idByKey = {};
    const weekEnd = addDays(today, 6);
    let sort = (await client.query('SELECT COALESCE(MAX(sort_order),0) m FROM actions WHERE user_id=$1', [userId])).rows[0].m;
    for (const t of tasks) {
      const notes = [t.description, t.source === 'initiative' && t.why ? `✨ Added by AI: ${t.why}` : '', t.deadline ? `Deadline: ${t.deadline}` : '']
        .filter(Boolean).join('\n\n');
      const r = await client.query(
        `INSERT INTO actions (user_id, category_id, project_id, block_id, title, notes, priority, scheduled_date, end_date,
                              duration_hours, duration_minutes, is_this_week, sort_order)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id`,
        [userId, categoryId, projectId, blockByPhase[t.phase] || null, t.title.slice(0, 300), notes || null, t.priority,
          t.start, t.span_days > 1 ? t.end : null, Math.floor(t.effort_minutes / 60), t.effort_minutes % 60,
          t.start <= weekEnd, ++sort]);
      idByKey[t.key] = r.rows[0].id;
    }

    let deps = 0;
    for (const t of tasks) {
      for (const d of t.depends_on) {
        if (!idByKey[d]) continue;                       // prerequisite was deselected
        await client.query('INSERT INTO action_dependencies (action_id, depends_on_action_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [idByKey[t.key], idByKey[d]]);
        deps++;
      }
    }

    let reminders = 0;
    const now = Date.now();
    for (const t of tasks) {
      if (!t.reminder) continue;
      const at = zonedToUtc(addDays(t.start, -t.reminder.days_before), t.reminder.time, timezone);
      if (at.getTime() <= now) continue;                 // never create a reminder in the past
      await client.query(
        `INSERT INTO reminders (user_id, action_id, title, kind, remind_at, timezone) VALUES ($1, $2, $3, 'once', $4, $5)`,
        [userId, idByKey[t.key], t.title.slice(0, 300), at.toISOString(), timezone || 'UTC']);
      reminders++;
    }

    let keyResults = 0;
    {
      for (const k of plan.key_results.filter(k => k.include)) {
        await client.query(
          `INSERT INTO key_results (project_id, title, target_value, unit, target_date, sort_order)
           VALUES ($1, $2, $3, $4, $5, (SELECT COALESCE(MAX(sort_order),0)+1 FROM key_results WHERE project_id=$1))`,
          [projectId, k.title, k.target_value, k.unit, k.target_date]);
        keyResults++;
      }
    }

    await client.query('COMMIT');
    return {
      ok: true, project_id: projectId, created_project: createdProject, link: `/projects/${projectId}`,
      counts: { actions: tasks.length, blocks: Object.keys(blockByPhase).length, dependencies: deps, reminders, key_results: keyResults },
    };
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    if (e instanceof AiError) throw e;
    console.error('[fileplan] apply:', e.message);
    throw new AiError('apply_failed', 'Could not save the plan — nothing was changed.');
  } finally {
    client.release();
  }
}

module.exports = { generateFilePlan, applyFilePlan, normalizePlan, zonedToUtc, loadExisting, parseJson };
