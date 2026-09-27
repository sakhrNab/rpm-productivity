// RPM action tools for the assistant. Every tool is scoped to the user (writes
// only touch their own rows).
//
// Two modes:
//   - propose (default): write tools return a { proposed, kind, payload, label, link }
//     object and DO NOT touch the DB. The UI shows Approve/Dismiss.
//   - auto: write tools execute immediately via applyProposal().
// The frontend "Approve" button POSTs the proposal to /api/ai/apply, which calls
// applyProposal() — so the write logic lives in exactly one place.
//
// Every write is VALIDATED first (id shape, ownership, date format) in both modes,
// so a hallucinated id comes back to the model as a clear error it can correct,
// instead of a DB exception or a proposal that fails only when the user approves it.

const { ymd } = require('./dates');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const PRIORITY_LABEL = { 0: 'none', 1: 'low', 2: 'medium', 3: 'high' };

const isUuid = (v) => typeof v === 'string' && UUID_RE.test(v);
function isDate(v) {
  if (typeof v !== 'string' || !DATE_RE.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}
const fail = (error) => ({ ok: false, error });

// Tool outputs must be plain JSON: pg returns DATE/TIMESTAMP columns as JS Date
// objects, which fail the AI SDK's message schema ("Invalid prompt: The messages do
// not match the ModelMessage[] schema") and kill the step after every auto write.
function toJson(value) {
  return JSON.parse(JSON.stringify(value ?? null, function replacer(key, v) {
    const raw = this[key];
    if (raw instanceof Date) return /_date$/.test(key) ? ymd(raw) : raw.toISOString();
    return v;
  }));
}

async function ownProject(pool, userId, id) {
  if (!isUuid(id)) return null;
  const r = await pool.query('SELECT id, name, category_id FROM projects WHERE id = $1 AND user_id = $2', [id, userId]);
  return r.rows[0] || null;
}
async function ownAction(pool, userId, id) {
  if (!isUuid(id)) return null;
  const r = await pool.query('SELECT id, title, project_id FROM actions WHERE id = $1 AND user_id = $2', [id, userId]);
  return r.rows[0] || null;
}
async function ownKeyResult(pool, userId, id) {
  if (!isUuid(id)) return null;
  const r = await pool.query(
    'SELECT kr.id, kr.title, kr.project_id FROM key_results kr JOIN projects p ON p.id = kr.project_id WHERE kr.id = $1 AND p.user_id = $2',
    [id, userId]);
  return r.rows[0] || null;
}

function linkForProject(projectId, fallback = '/my-day') {
  return projectId ? `/projects/${projectId}` : fallback;
}

// Check a write's payload against the user's real data. Returns
// { ok:true, target } (target = the row it touches, for labels/links) or { ok:false, error }.
async function validateWrite(pool, userId, kind, p = {}) {
  const dateErr = (field) => (p[field] != null && p[field] !== '' && !isDate(p[field])
    ? `${field} must be a real date in YYYY-MM-DD format (got "${p[field]}")` : null);
  switch (kind) {
    case 'create_action': {
      if (!p.title || !String(p.title).trim()) return fail('title is required');
      const e = dateErr('scheduled_date'); if (e) return fail(e);
      if (p.duration_minutes != null && !(Number(p.duration_minutes) > 0 && Number(p.duration_minutes) <= 1440)) return fail('duration_minutes must be between 1 and 1440');
      if (p.priority != null && ![0, 1, 2, 3].includes(Number(p.priority))) return fail('priority must be 0 (none), 1 (low), 2 (medium) or 3 (high)');
      if (p.project_id) {
        const proj = await ownProject(pool, userId, p.project_id);
        if (!proj) return fail(`project_id "${p.project_id}" is not one of the user's projects — use an id from the PROJECTS list, or omit it`);
        return { ok: true, target: { project: proj } };
      }
      return { ok: true, target: {} };
    }
    case 'schedule_action': {
      const a = await ownAction(pool, userId, p.action_id);
      if (!a) return fail(`action_id "${p.action_id}" was not found — use an id from the ACTIONS list or find_actions`);
      if (!p.scheduled_date) return fail('scheduled_date is required');
      const e = dateErr('scheduled_date'); if (e) return fail(e);
      return { ok: true, target: { action: a } };
    }
    case 'complete_action':
    case 'delete_action': {
      const a = await ownAction(pool, userId, p.action_id);
      if (!a) return fail(`action_id "${p.action_id}" was not found — use an id from the ACTIONS list or find_actions`);
      return { ok: true, target: { action: a } };
    }
    case 'update_action': {
      const a = await ownAction(pool, userId, p.action_id);
      if (!a) return fail(`action_id "${p.action_id}" was not found — use an id from the ACTIONS list or find_actions`);
      const e = dateErr('scheduled_date'); if (e) return fail(e);
      if (p.priority != null && ![0, 1, 2, 3].includes(Number(p.priority))) return fail('priority must be 0 (none), 1 (low), 2 (medium) or 3 (high)');
      if (p.duration_minutes != null && !(Number(p.duration_minutes) > 0 && Number(p.duration_minutes) <= 1440)) return fail('duration_minutes must be between 1 and 1440');
      const fields = ['title', 'notes', 'scheduled_date', 'duration_minutes', 'is_starred', 'priority'];
      if (!fields.some(f => p[f] !== undefined)) return fail('nothing to change — pass at least one field to update');
      return { ok: true, target: { action: a } };
    }
    case 'create_rpm_block': {
      const proj = await ownProject(pool, userId, p.project_id);
      if (!proj) return fail(`project_id "${p.project_id}" is not one of the user's projects`);
      if (!p.result_title || !String(p.result_title).trim()) return fail('result_title is required');
      return { ok: true, target: { project: proj } };
    }
    case 'update_key_result': {
      const kr = await ownKeyResult(pool, userId, p.key_result_id);
      if (!kr) return fail(`key_result_id "${p.key_result_id}" was not found — use an id from the KEY RESULTS list`);
      if (p.current_value == null || !Number.isFinite(Number(p.current_value))) return fail('current_value must be a number');
      return { ok: true, target: { keyResult: kr } };
    }
    default:
      return fail(`unknown proposal kind: ${kind}`);
  }
}

// Perform a write. Validates first (the /api/ai/apply payload comes from the client).
async function applyProposal(pool, userId, kind, payload = {}) {
  const v = await validateWrite(pool, userId, kind, payload);
  if (!v.ok) return v;
  switch (kind) {
    case 'create_action': {
      const { title, scheduled_date, duration_minutes, is_starred, priority } = payload;
      const proj = v.target.project || null;
      // Derive the category from the chosen project so the action lands in the right
      // category (and gets its colour on the calendar).
      const r = await pool.query(
        `INSERT INTO actions (user_id, category_id, project_id, title, duration_minutes, scheduled_date, is_starred, priority, sort_order)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, (SELECT COALESCE(MAX(sort_order),0)+1 FROM actions WHERE user_id=$1))
         RETURNING id, title, scheduled_date, project_id`,
        [userId, proj?.category_id || null, proj?.id || null, String(title).trim(), Math.round(Number(duration_minutes)) || 5,
          scheduled_date || null, !!is_starred, priority != null ? Number(priority) : 0]
      );
      return { ok: true, ...r.rows[0], link: linkForProject(r.rows[0].project_id) };
    }
    case 'schedule_action': {
      const r = await pool.query(
        'UPDATE actions SET scheduled_date = $1 WHERE id = $2 AND user_id = $3 RETURNING id, title, scheduled_date, project_id',
        [payload.scheduled_date, payload.action_id, userId]
      );
      return { ok: true, ...r.rows[0], link: linkForProject(r.rows[0].project_id) };
    }
    case 'complete_action': {
      const done = payload.completed !== false;
      const r = await pool.query(
        'UPDATE actions SET is_completed = $1 WHERE id = $2 AND user_id = $3 RETURNING id, title, is_completed, project_id',
        [done, payload.action_id, userId]
      );
      return { ok: true, ...r.rows[0], link: linkForProject(r.rows[0].project_id) };
    }
    case 'create_rpm_block': {
      const proj = v.target.project;
      const r = await pool.query(
        `INSERT INTO rpm_blocks (user_id, category_id, project_id, result_title, purpose, sort_order)
         VALUES ($1, $2, $3, $4, $5, (SELECT COALESCE(MAX(sort_order),0)+1 FROM rpm_blocks WHERE user_id=$1))
         RETURNING id, result_title, project_id`,
        [userId, proj.category_id || null, proj.id, String(payload.result_title).trim(), payload.purpose || '']
      );
      return { ok: true, ...r.rows[0], link: linkForProject(r.rows[0].project_id) };
    }
    case 'update_action': {
      const { action_id, title, notes, scheduled_date, duration_minutes, is_starred, priority } = payload;
      const r = await pool.query(
        `UPDATE actions SET
            title = COALESCE($1, title),
            notes = COALESCE($2, notes),
            scheduled_date = COALESCE($3, scheduled_date),
            duration_minutes = COALESCE($4, duration_minutes),
            is_starred = COALESCE($5, is_starred),
            priority = COALESCE($6, priority)
          WHERE id = $7 AND user_id = $8
          RETURNING id, title, scheduled_date, priority, project_id`,
        [
          title != null && String(title).trim() ? String(title).trim() : null,
          notes ?? null, scheduled_date || null,
          duration_minutes == null ? null : Math.round(Number(duration_minutes)),
          is_starred == null ? null : !!is_starred,
          priority == null ? null : Number(priority),
          action_id, userId,
        ]
      );
      return { ok: true, ...r.rows[0], link: linkForProject(r.rows[0].project_id) };
    }
    case 'delete_action': {
      const r = await pool.query('DELETE FROM actions WHERE id = $1 AND user_id = $2 RETURNING id, title', [payload.action_id, userId]);
      return { ok: true, deleted: true, ...r.rows[0] };
    }
    case 'update_key_result': {
      const value = Number(payload.current_value);
      const r = await pool.query(
        `UPDATE key_results kr
            SET current_value = $1,
                is_completed = (kr.target_value IS NOT NULL AND $1 >= kr.target_value)
          FROM projects p
         WHERE kr.id = $2 AND kr.project_id = p.id AND p.user_id = $3
         RETURNING kr.id, kr.title, kr.current_value, kr.target_value, kr.is_completed, kr.project_id`,
        [value, payload.key_result_id, userId]
      );
      // Keep the forecast's progress log in step with chat-driven updates.
      try { await pool.query('INSERT INTO kr_progress_log (key_result_id, value) VALUES ($1, $2)', [r.rows[0].id, value]); } catch { /* log optional */ }
      return { ok: true, ...r.rows[0], link: linkForProject(r.rows[0].project_id) };
    }
    default:
      return fail(`unknown proposal kind: ${kind}`);
  }
}

// Approval-card label. Names the actual task so the user knows what they approve.
function proposalLabel(kind, p, target = {}) {
  const t = target.action ? `“${target.action.title}”` : 'an action';
  switch (kind) {
    case 'create_action': return `Create action “${p.title || ''}”${target.project ? ` in ${target.project.name}` : ''}${p.scheduled_date ? ` · ${p.scheduled_date}` : ''}`;
    case 'schedule_action': return `Schedule ${t} → ${p.scheduled_date}`;
    case 'complete_action': return p.completed === false ? `Reopen ${t}` : `Complete ${t}`;
    case 'create_rpm_block': return `Create RPM block “${p.result_title || ''}”${target.project ? ` in ${target.project.name}` : ''}`;
    case 'update_key_result': return `Update “${target.keyResult?.title || 'key result'}” → ${p.current_value}`;
    case 'update_action': {
      const changes = [];
      if (p.title) changes.push(`rename to “${p.title}”`);
      if (p.scheduled_date) changes.push(`date ${p.scheduled_date}`);
      if (p.priority != null) changes.push(`priority ${PRIORITY_LABEL[Number(p.priority)] || p.priority}`);
      if (p.duration_minutes != null) changes.push(`${p.duration_minutes} min`);
      if (p.is_starred != null) changes.push(p.is_starred ? 'star' : 'unstar');
      if (p.notes != null) changes.push('notes');
      return `Edit ${t}${changes.length ? ': ' + changes.join(', ') : ''}`;
    }
    case 'delete_action': return `Delete ${t}`;
    default: return kind;
  }
}

function proposalLink(kind, payload, target = {}) {
  if (kind === 'create_action' || kind === 'create_rpm_block') return linkForProject(payload.project_id);
  if (target.action?.project_id) return linkForProject(target.action.project_id);
  if (target.keyResult?.project_id) return linkForProject(target.keyResult.project_id);
  return '/my-day';
}

function buildTools(ai, pool, userId, autoMode = false) {
  const { tool, jsonSchema } = ai;

  // A write tool: validated in both modes; executes in auto mode, otherwise proposes.
  const writeTool = (kind, description, schema) => tool({
    description: autoMode
      ? description
      : `${description} This is PROPOSED for the user to approve — do not claim it is done; say you've suggested it.`,
    inputSchema: jsonSchema(schema),
    execute: async (input) => {
      if (autoMode) return toJson(await applyProposal(pool, userId, kind, input));
      const v = await validateWrite(pool, userId, kind, input || {});
      if (!v.ok) return v;
      return { proposed: true, kind, payload: input, label: proposalLabel(kind, input, v.target), link: proposalLink(kind, input, v.target) };
    },
  });

  const DATE = { type: 'string', description: 'YYYY-MM-DD' };
  const PRIORITY = { type: 'integer', enum: [0, 1, 2, 3], description: '0 none, 1 low, 2 medium, 3 high' };

  const tools = {
    list_projects: tool({
      description: "List the user's projects with their ids.",
      inputSchema: jsonSchema({ type: 'object', properties: {}, additionalProperties: false }),
      execute: async () => {
        const r = await pool.query('SELECT id, name, ultimate_result, is_completed FROM projects WHERE user_id = $1 ORDER BY sort_order', [userId]);
        return toJson({ projects: r.rows });
      },
    }),

    find_actions: tool({
      description: 'Search the user\'s actions beyond the snapshot in context — past or completed ones, a date range, or by text. Read-only.',
      inputSchema: jsonSchema({
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Text to match in the title (optional).' },
          from: DATE, to: DATE,
          include_completed: { type: 'boolean' },
          project_id: { type: 'string' },
        },
        additionalProperties: false,
      }),
      execute: async (input = {}) => {
        const where = ['a.user_id = $1', 'a.is_cancelled = false'];
        const vals = [userId];
        if (input.query && String(input.query).trim()) { vals.push(`%${String(input.query).trim().slice(0, 100)}%`); where.push(`a.title ILIKE $${vals.length}`); }
        if (isDate(input.from)) { vals.push(input.from); where.push(`a.scheduled_date >= $${vals.length}`); }
        if (isDate(input.to)) { vals.push(input.to); where.push(`a.scheduled_date <= $${vals.length}`); }
        if (!input.include_completed) where.push('a.is_completed = false');
        if (isUuid(input.project_id)) { vals.push(input.project_id); where.push(`a.project_id = $${vals.length}`); }
        const r = await pool.query(
          `SELECT a.id, a.title, a.scheduled_date, a.is_completed, a.priority, a.project_id, p.name AS project
             FROM actions a LEFT JOIN projects p ON p.id = a.project_id
            WHERE ${where.join(' AND ')}
            ORDER BY a.scheduled_date DESC NULLS LAST LIMIT 25`, vals);
        return toJson({ count: r.rows.length, actions: r.rows });
      },
    }),

    create_action: writeTool('create_action', 'Create a new action (task), optionally attached to a project and scheduled.', {
      type: 'object',
      properties: {
        title: { type: 'string' },
        project_id: { type: 'string', description: 'An id from the PROJECTS list. Omit if none fits.' },
        scheduled_date: DATE,
        duration_minutes: { type: 'number' },
        priority: PRIORITY,
        is_starred: { type: 'boolean' },
      },
      required: ['title'],
      additionalProperties: false,
    }),

    schedule_action: writeTool('schedule_action', 'Set or change the scheduled date of an existing action.', {
      type: 'object',
      properties: { action_id: { type: 'string' }, scheduled_date: DATE },
      required: ['action_id', 'scheduled_date'],
      additionalProperties: false,
    }),

    complete_action: writeTool('complete_action', 'Mark an action completed (or reopen it with completed:false).', {
      type: 'object',
      properties: { action_id: { type: 'string' }, completed: { type: 'boolean' } },
      required: ['action_id'],
      additionalProperties: false,
    }),

    create_rpm_block: writeTool('create_rpm_block', 'Create an RPM block (Result/Purpose/Massive-Action-Plan) under a project.', {
      type: 'object',
      properties: { project_id: { type: 'string' }, result_title: { type: 'string' }, purpose: { type: 'string' } },
      required: ['project_id', 'result_title'],
      additionalProperties: false,
    }),

    update_key_result: writeTool('update_key_result', "Update a key result's current progress value (the new absolute value, not a delta).", {
      type: 'object',
      properties: { key_result_id: { type: 'string' }, current_value: { type: 'number' } },
      required: ['key_result_id', 'current_value'],
      additionalProperties: false,
    }),
  };

  // Editing and deleting actions are only offered when NOT in auto mode — they
  // always require the user's explicit approval, never silent execution.
  if (!autoMode) {
    tools.update_action = writeTool('update_action', 'Edit an existing action (title, notes, date, duration, priority, star).', {
      type: 'object',
      properties: {
        action_id: { type: 'string' },
        title: { type: 'string' },
        notes: { type: 'string' },
        scheduled_date: DATE,
        duration_minutes: { type: 'number' },
        priority: PRIORITY,
        is_starred: { type: 'boolean' },
      },
      required: ['action_id'],
      additionalProperties: false,
    });
    tools.delete_action = writeTool('delete_action', 'Delete an action permanently. Always requires approval.', {
      type: 'object',
      properties: { action_id: { type: 'string' } },
      required: ['action_id'],
      additionalProperties: false,
    });
  }

  return tools;
}

module.exports = { buildTools, applyProposal, validateWrite, proposalLabel, isDate, isUuid, toJson };
