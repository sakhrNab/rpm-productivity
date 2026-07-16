// Per-category (and optional per-project) AI coaches. Each coach has an AI-drafted
// persona and a memory that accumulates durable facts over conversations — so it
// specializes to one life area and "learns" you without any model training.

const { runChat } = require('./service');
const { recordUsage } = require('./usage');

// ---- readiness: a category is "ready" for a coach once it has real substance ----
async function categoryReadiness(pool, userId, categoryId) {
  const c = (await pool.query(
    `SELECT c.id, c.name, d.ultimate_vision, d.ultimate_purpose, d.one_year_goals, d.ninety_day_goals, d.roles
       FROM categories c LEFT JOIN category_details d ON d.category_id = c.id
      WHERE c.id = $1 AND c.user_id = $2`, [categoryId, userId])).rows[0];
  if (!c) return { ready: false, missing: ['category not found'], cat: null };
  const has = (v) => v && String(v).trim().length > 2;
  // A coach needs a "why" (vision OR purpose) and a "what" (a goal horizon).
  const hasWhy = has(c.ultimate_vision) || has(c.ultimate_purpose);
  const hasGoal = has(c.one_year_goals) || has(c.ninety_day_goals);
  const missing = [];
  if (!hasWhy) missing.push('a vision or purpose');
  if (!hasGoal) missing.push('a 1-year or 90-day goal');
  return { ready: hasWhy && hasGoal, missing, cat: c };
}

// ---- scoped context: only this coach's slice of the RPM hierarchy ----
function clip(s, n) { return s ? String(s).replace(/\s+/g, ' ').trim().slice(0, n) : ''; }

async function scopedContext(pool, userId, coach) {
  const L = [`Today: ${new Date().toISOString().slice(0, 10)}`];
  let projFilter, projParams;
  if (coach.scope === 'project') {
    projFilter = 'p.id = $2'; projParams = [userId, coach.project_id];
    L.push('\nThis coach is focused on ONE project.');
  } else {
    projFilter = 'p.category_id = $2'; projParams = [userId, coach.category_id];
    const cat = (await pool.query(
      `SELECT c.name, d.ultimate_vision, d.ultimate_purpose, d.one_year_goals, d.ninety_day_goals, d.roles
         FROM categories c LEFT JOIN category_details d ON d.category_id = c.id WHERE c.id = $1`, [coach.category_id])).rows[0];
    if (cat) {
      L.push(`\n=== CATEGORY: ${cat.name} ===`);
      if (cat.ultimate_vision) L.push(`Vision: ${clip(cat.ultimate_vision, 400)}`);
      if (cat.one_year_goals) L.push(`1-year goals: ${clip(cat.one_year_goals, 400)}`);
      if (cat.ninety_day_goals) L.push(`90-day goals: ${clip(cat.ninety_day_goals, 400)}`);
      if (cat.ultimate_purpose) L.push(`Purpose: ${clip(cat.ultimate_purpose, 300)}`);
      if (cat.roles) L.push(`Roles: ${clip(cat.roles, 200)}`);
    }
  }

  const projects = (await pool.query(
    `SELECT p.id, p.name, p.ultimate_result, p.ultimate_purpose, p.end_date, p.is_completed
       FROM projects p WHERE p.user_id = $1 AND ${projFilter} ORDER BY p.sort_order`, projParams)).rows;
  L.push('\n=== PROJECTS (id · name · result | purpose) ===');
  if (!projects.length) L.push('  (none yet)');
  const projIds = projects.map(p => p.id);
  for (const p of projects) {
    L.push(`• ${p.id} · ${p.name}${p.is_completed ? ' [done]' : ''}`);
    const bits = [];
    if (p.ultimate_result) bits.push(`result: ${clip(p.ultimate_result, 120)}`);
    if (p.ultimate_purpose) bits.push(`purpose: ${clip(p.ultimate_purpose, 100)}`);
    if (bits.length) L.push('    ' + bits.join(' | '));
  }

  if (projIds.length) {
    const krs = (await pool.query(
      `SELECT kr.title, kr.current_value, kr.target_value, kr.unit, kr.target_date, kr.project_id
         FROM key_results kr WHERE kr.project_id = ANY($1) AND kr.is_completed IS NOT TRUE
        ORDER BY kr.target_date NULLS LAST LIMIT 30`, [projIds])).rows;
    L.push('\n=== KEY RESULTS (title · progress · due · projectId) ===');
    if (!krs.length) L.push('  (none)');
    for (const k of krs) L.push(`• ${clip(k.title, 70)} · ${k.current_value ?? 0}/${k.target_value ?? '?'} ${k.unit || ''} · ${k.target_date ? String(k.target_date).slice(0, 10) : 'no date'} · ${k.project_id}`);

    const actions = (await pool.query(
      `SELECT id, title, scheduled_date, is_completed, project_id FROM actions
        WHERE user_id = $1 AND project_id = ANY($2) AND is_cancelled = false
        ORDER BY scheduled_date NULLS LAST LIMIT 40`, [userId, projIds])).rows;
    L.push('\n=== ACTIONS (id · [x/ ] · title · date · projectId) ===');
    if (!actions.length) L.push('  (none)');
    for (const a of actions) L.push(`• ${a.id} · [${a.is_completed ? 'x' : ' '}] · ${clip(a.title, 60)} · ${a.scheduled_date ? String(a.scheduled_date).slice(0, 10) : 'unscheduled'} · ${a.project_id}`);
  }

  return L.join('\n');
}

// ---- draft a persona (proposal — not saved) ----
async function draftCoach({ pool, userId, modelKey, categoryId, projectId }) {
  let subject, area;
  if (projectId) {
    const p = (await pool.query('SELECT name, ultimate_result, ultimate_purpose FROM projects WHERE id = $1 AND user_id = $2', [projectId, userId])).rows[0];
    if (!p) throw new Error('Project not found');
    subject = `project "${p.name}"`; area = `Result: ${p.ultimate_result || '—'}\nPurpose: ${p.ultimate_purpose || '—'}`;
  } else {
    const r = await categoryReadiness(pool, userId, categoryId);
    if (!r.cat) throw new Error('Category not found');
    subject = `life category "${r.cat.name}"`;
    area = `Vision: ${r.cat.ultimate_vision || '—'}\n1-year: ${r.cat.one_year_goals || '—'}\n90-day: ${r.cat.ninety_day_goals || '—'}\nPurpose: ${r.cat.ultimate_purpose || '—'}\nRoles: ${r.cat.roles || '—'}`;
  }

  const system = `You design a specialized AI coach dedicated to ONE area of a person's life, inside an RPM app (Result, Purpose, Massive Action Plan).
Return ONLY JSON: { "name": "<= 3 words, e.g. 'Wealth Coach'", "emoji": "one emoji that fits this area", "color": "#RRGGBB accent hex", "responsibilities": "one sentence: what this coach owns/holds them accountable for", "persona": "the coach's system prompt, 120-220 words" }.
The persona must:
- Establish a specific coaching identity fit for THIS area (a finance coach ≠ a relationship coach — different frameworks, questions, tone).
- Reference the person's real vision/goals for this area (below) so it's grounded, not generic.
- Tell the coach to be warm, direct, and to connect advice to their goals and the RPM method; to ask clarifying questions when unsure; and that it can create/schedule/complete actions in this area via tools.
- NOT invent facts beyond what's given.`;
  const user = `Write the coach for the ${subject}.\n\n${area}`;

  let raw = '', rawUsage = null;
  for await (const ev of runChat({ pool, userId, modelKey, messages: [{ role: 'system', content: system }, { role: 'user', content: user }], webSearch: false, rpm: false, autoMode: false })) {
    if (ev.type === 'text') raw += ev.text;
    else if (ev.type === 'usage') rawUsage = ev.usage;
    else if (ev.type === 'error') throw new Error(ev.message || 'AI request failed');
  }
  const usage = rawUsage ? await recordUsage(pool, { userId, modelKey, feature: 'coach_draft', usage: rawUsage }) : null;
  let parsed;
  try {
    let s = raw.trim(); const f = s.match(/```(?:json)?\s*([\s\S]*?)```/i); if (f) s = f[1];
    const a = s.indexOf('{'), b = s.lastIndexOf('}'); if (a >= 0 && b > a) s = s.slice(a, b + 1);
    parsed = JSON.parse(s);
  } catch { throw new Error('The model returned an unreadable persona — try again.'); }
  return {
    name: (parsed.name || 'Coach').slice(0, 80),
    emoji: (parsed.emoji || '🧭').slice(0, 16),
    color: /^#[0-9a-f]{6}$/i.test(parsed.color || '') ? parsed.color : '#4ECDC4',
    responsibilities: String(parsed.responsibilities || '').trim().slice(0, 300),
    persona: String(parsed.persona || '').trim(),
    usage,
  };
}

// ---- CRUD ----
async function listCoaches(pool, userId) {
  return (await pool.query(
    `SELECT co.id, co.scope, co.category_id, co.project_id, co.name, co.model, co.updated_at,
            co.avatar_emoji, co.avatar_image, co.color, co.responsibilities,
            c.name AS category_name, p.name AS project_name,
            (SELECT count(*)::int FROM coach_memory m WHERE m.coach_id = co.id) AS memory_count
       FROM coaches co
       LEFT JOIN categories c ON c.id = co.category_id
       LEFT JOIN projects p ON p.id = co.project_id
      WHERE co.user_id = $1 AND co.is_active = true ORDER BY co.updated_at DESC`, [userId])).rows;
}
async function getCoach(pool, userId, id) {
  return (await pool.query('SELECT * FROM coaches WHERE id = $1 AND user_id = $2 AND is_active = true', [id, userId])).rows[0] || null;
}
async function createCoach(pool, userId, { scope, categoryId, projectId, name, persona, model, avatar_emoji, avatar_image, color, responsibilities }) {
  const sc = scope === 'project' ? 'project' : 'category';
  if (sc === 'category' && !categoryId) throw new Error('categoryId required');
  if (sc === 'project' && !projectId) throw new Error('projectId required');
  if (!name || !persona) throw new Error('name and persona are required');
  const r = await pool.query(
    `INSERT INTO coaches (user_id, scope, category_id, project_id, name, persona, model, avatar_emoji, avatar_image, color, responsibilities)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     ON CONFLICT (${sc === 'project' ? 'project_id) WHERE scope = \'project\'' : 'category_id) WHERE scope = \'category\''}
       DO UPDATE SET name = EXCLUDED.name, persona = EXCLUDED.persona, model = EXCLUDED.model,
         avatar_emoji = EXCLUDED.avatar_emoji, avatar_image = EXCLUDED.avatar_image, color = EXCLUDED.color,
         responsibilities = EXCLUDED.responsibilities, is_active = true, updated_at = now()
     RETURNING *`,
    [userId, sc, sc === 'category' ? categoryId : null, sc === 'project' ? projectId : null, String(name).slice(0, 80), persona, model || null,
     (avatar_emoji || '🧭').slice(0, 16), avatar_image || null, (/^#[0-9a-f]{6}$/i.test(color || '') ? color : '#4ECDC4'), (responsibilities || '').slice(0, 300)]
  );
  return r.rows[0];
}
async function updateCoach(pool, userId, id, patch) {
  const sets = [], vals = []; let i = 1;
  for (const k of ['name', 'persona', 'model', 'avatar_emoji', 'avatar_image', 'color', 'responsibilities']) {
    if (k in patch) { sets.push(`${k} = $${i++}`); vals.push(patch[k]); }
  }
  if (!sets.length) return getCoach(pool, userId, id);
  sets.push('updated_at = now()');
  vals.push(id, userId);
  const r = await pool.query(`UPDATE coaches SET ${sets.join(', ')} WHERE id = $${i++} AND user_id = $${i} RETURNING *`, vals);
  return r.rows[0] || null;
}
async function deleteCoach(pool, userId, id) {
  await pool.query('UPDATE coaches SET is_active = false, updated_at = now() WHERE id = $1 AND user_id = $2', [id, userId]);
}

// ---- structured memory (atomic rows, salience×recency retrieval) ----
const MEMORY_CAP = 40;   // hard cap per coach; prune lowest salience×recency over this
const RETRIEVE_K = 12;   // inject at most this many into a chat (Letta-style "core in context")

// Retrieve the most relevant memories (pinned first, then salience, then recency) and
// reinforce them (use_count / last_used_at) so what gets used stays alive.
async function retrieveMemory(pool, coachId) {
  const { rows } = await pool.query(
    `SELECT id, kind, content, salience, pinned FROM coach_memory
      WHERE coach_id = $1 ORDER BY pinned DESC, salience DESC, last_used_at DESC LIMIT $2`,
    [coachId, RETRIEVE_K]);
  if (rows.length) {
    await pool.query('UPDATE coach_memory SET use_count = use_count + 1, last_used_at = now() WHERE id = ANY($1)', [rows.map(r => r.id)]);
  }
  return rows;
}
async function listMemory(pool, userId, coachId) {
  return (await pool.query(
    `SELECT id, kind, content, salience, pinned, created_at, last_used_at, use_count FROM coach_memory
      WHERE coach_id = $1 AND user_id = $2 ORDER BY pinned DESC, salience DESC, last_used_at DESC`,
    [coachId, userId])).rows;
}
async function deleteMemory(pool, userId, memId) {
  await pool.query('DELETE FROM coach_memory WHERE id = $1 AND user_id = $2', [memId, userId]);
}
async function pinMemory(pool, userId, memId, pinned) {
  await pool.query('UPDATE coach_memory SET pinned = $3 WHERE id = $1 AND user_id = $2', [memId, userId, !!pinned]);
}
const clampS = (n) => Math.max(1, Math.min(5, Math.round(Number(n) || 3)));

// Reconcile: extract durable facts from a recent exchange and apply ADD/UPDATE/DELETE
// ops against existing memory (the Mem0 anti-bloat move) — batched, not per message.
async function reconcileMemory({ pool, userId, coach, transcript, modelKey: mk }) {
  const modelKey = coach.model || mk || null;
  if (!modelKey) return; // no model available — skip silently
  const existing = (await pool.query(
    'SELECT id, kind, content, salience FROM coach_memory WHERE coach_id = $1 ORDER BY salience DESC, last_used_at DESC LIMIT 60', [coach.id])).rows;
  const existingText = existing.length
    ? existing.map((m, i) => `[${i + 1}] id=${m.id} (${m.kind}, s${m.salience}) ${m.content}`).join('\n')
    : '(empty)';

  const system = `You maintain a coach's long-term memory about ONE person for ONE life area. From the latest conversation, decide what durable facts are worth remembering and RECONCILE them with the existing memory below. Output ONLY JSON:
{ "ops": [ {"op":"ADD","kind":"preference|fact|constraint|goal|blocker|style|other","content":"short","salience":1-5},
           {"op":"UPDATE","id":"<existing id>","content":"short","salience":1-5},
           {"op":"DELETE","id":"<existing id>"} ] }
Rules: keep ONLY things worth remembering long-term (stable preferences, constraints, names, recurring blockers, working style, meaningful goals). Drop transient chatter and one-off task details. If a new fact supersedes an existing one, UPDATE it (don't ADD a duplicate). If an existing memory is now wrong, DELETE it. If nothing is worth changing, return {"ops":[]}. Each content <= 140 chars. Max 6 ops.`;
  const user = `Existing memory:\n${existingText}\n\nLatest conversation:\n${String(transcript).slice(0, 6000)}`;

  let raw = '', rawUsage = null;
  try {
    for await (const ev of runChat({ pool, userId, modelKey, messages: [{ role: 'system', content: system }, { role: 'user', content: user }], webSearch: false, rpm: false, autoMode: false })) {
      if (ev.type === 'text') raw += ev.text;
      else if (ev.type === 'usage') rawUsage = ev.usage;
    }
    if (rawUsage) await recordUsage(pool, { userId, modelKey, feature: 'coach_memory', usage: rawUsage });
    let parsed; { let s = raw.trim(); const f = s.match(/```(?:json)?\s*([\s\S]*?)```/i); if (f) s = f[1]; const a = s.indexOf('{'), b = s.lastIndexOf('}'); if (a >= 0 && b > a) s = s.slice(a, b + 1); parsed = JSON.parse(s); }
    const ops = Array.isArray(parsed.ops) ? parsed.ops.slice(0, 6) : [];
    const validId = new Set(existing.map(m => m.id));
    for (const o of ops) {
      if (o.op === 'ADD' && o.content) {
        await pool.query('INSERT INTO coach_memory (coach_id, user_id, kind, content, salience) VALUES ($1,$2,$3,$4,$5)',
          [coach.id, userId, String(o.kind || 'fact').slice(0, 24), String(o.content).slice(0, 300), clampS(o.salience)]);
      } else if (o.op === 'UPDATE' && validId.has(o.id) && o.content) {
        await pool.query('UPDATE coach_memory SET content = $3, salience = $4, last_used_at = now() WHERE id = $1 AND coach_id = $2',
          [o.id, coach.id, String(o.content).slice(0, 300), clampS(o.salience)]);
      } else if (o.op === 'DELETE' && validId.has(o.id)) {
        await pool.query('DELETE FROM coach_memory WHERE id = $1 AND coach_id = $2 AND pinned = false', [o.id, coach.id]);
      }
    }
    // Enforce cap: drop the lowest-value un-pinned memories over the limit.
    await pool.query(
      `DELETE FROM coach_memory WHERE id IN (
         SELECT id FROM coach_memory WHERE coach_id = $1 AND pinned = false
          ORDER BY salience DESC, last_used_at DESC OFFSET $2)`,
      [coach.id, MEMORY_CAP]);
  } catch (e) { console.error('[coach] reconcile:', e.message); }
}

// ---- chat with a coach (persona + scoped context + retrieved memory + tools) ----
async function* chatCoach({ pool, userId, coach, messages, autoMode = true, modelKey }) {
  const [ctx, mems] = await Promise.all([scopedContext(pool, userId, coach), retrieveMemory(pool, coach.id)]);
  const memText = mems.length ? `\n\nWhat you know about them (long-term memory — use it, don't re-ask):\n${mems.map(m => `- ${m.content}`).join('\n')}` : '';
  const persona = `${coach.persona}${memText}\n\nYou can create, schedule and complete actions in this area via tools. Ask a clarifying question if unsure. Format answers in clean Markdown.`;
  // Coach's own model if set, else the user's current default (passed by the client).
  yield* runChat({ pool, userId, modelKey: coach.model || modelKey || null, messages, webSearch: false, rpm: true, autoMode, systemOverride: persona, contextText: ctx });
}

module.exports = {
  categoryReadiness, draftCoach, listCoaches, getCoach, createCoach, updateCoach, deleteCoach,
  chatCoach, reconcileMemory, retrieveMemory, listMemory, deleteMemory, pinMemory,
};
