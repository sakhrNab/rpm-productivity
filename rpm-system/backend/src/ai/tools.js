// RPM action tools for the assistant. Every tool is scoped to the user (writes
// only touch their own rows) and there are NO destructive/delete tools.
//
// Two modes:
//   - propose (default): write tools return a { proposed, kind, payload, label, link }
//     object and DO NOT touch the DB. The UI shows Approve/Dismiss.
//   - auto: write tools execute immediately via applyProposal().
// The frontend "Approve" button POSTs the proposal to /api/ai/apply, which calls
// applyProposal() — so the write logic lives in exactly one place.

async function ownProject(pool, userId, id) {
  if (!id) return null;
  const r = await pool.query('SELECT id, category_id FROM projects WHERE id = $1 AND user_id = $2', [id, userId]);
  return r.rows[0] || null;
}

function linkForProject(projectId, fallback = '/my-day') {
  return projectId ? `/projects/${projectId}` : fallback;
}

// Perform a proposed write. Returns { ok, link, ... } or throws.
async function applyProposal(pool, userId, kind, payload = {}) {
  switch (kind) {
    case 'create_action': {
      const { title, project_id, scheduled_date, duration_minutes, is_starred } = payload;
      if (!title || !String(title).trim()) return { ok: false, error: 'title is required' };
      const proj = project_id ? await ownProject(pool, userId, project_id) : null;
      const r = await pool.query(
        `INSERT INTO actions (user_id, project_id, title, duration_minutes, scheduled_date, is_starred, sort_order)
         VALUES ($1, $2, $3, $4, $5, $6, (SELECT COALESCE(MAX(sort_order),0)+1 FROM actions WHERE user_id=$1))
         RETURNING id, title, scheduled_date, project_id`,
        [userId, proj?.id || null, String(title).trim(), duration_minutes || 5, scheduled_date || null, !!is_starred]
      );
      return { ok: true, ...r.rows[0], link: linkForProject(r.rows[0].project_id) };
    }
    case 'schedule_action': {
      const { action_id, scheduled_date } = payload;
      const r = await pool.query(
        'UPDATE actions SET scheduled_date = $1 WHERE id = $2 AND user_id = $3 RETURNING id, title, scheduled_date, project_id',
        [scheduled_date || null, action_id, userId]
      );
      if (!r.rows[0]) return { ok: false, error: 'action not found' };
      return { ok: true, ...r.rows[0], link: linkForProject(r.rows[0].project_id) };
    }
    case 'complete_action': {
      const { action_id, completed } = payload;
      const done = completed !== false;
      const r = await pool.query(
        'UPDATE actions SET is_completed = $1 WHERE id = $2 AND user_id = $3 RETURNING id, title, is_completed, project_id',
        [done, action_id, userId]
      );
      if (!r.rows[0]) return { ok: false, error: 'action not found' };
      return { ok: true, ...r.rows[0], link: linkForProject(r.rows[0].project_id) };
    }
    case 'create_rpm_block': {
      const { project_id, result_title, purpose } = payload;
      const proj = await ownProject(pool, userId, project_id);
      if (!proj) return { ok: false, error: 'project not found' };
      const r = await pool.query(
        `INSERT INTO rpm_blocks (user_id, category_id, project_id, result_title, purpose, sort_order)
         VALUES ($1, $2, $3, $4, $5, (SELECT COALESCE(MAX(sort_order),0)+1 FROM rpm_blocks WHERE user_id=$1))
         RETURNING id, result_title, project_id`,
        [userId, proj.category_id || null, proj.id, String(result_title || '').trim(), purpose || '']
      );
      return { ok: true, ...r.rows[0], link: linkForProject(r.rows[0].project_id) };
    }
    case 'update_key_result': {
      const { key_result_id, current_value } = payload;
      const r = await pool.query(
        `UPDATE key_results kr
            SET current_value = $1,
                is_completed = (kr.target_value IS NOT NULL AND $1 >= kr.target_value)
          FROM projects p
         WHERE kr.id = $2 AND kr.project_id = p.id AND p.user_id = $3
         RETURNING kr.id, kr.title, kr.current_value, kr.target_value, kr.is_completed, kr.project_id`,
        [current_value, key_result_id, userId]
      );
      if (!r.rows[0]) return { ok: false, error: 'key result not found' };
      return { ok: true, ...r.rows[0], link: linkForProject(r.rows[0].project_id) };
    }
    default:
      return { ok: false, error: `unknown proposal kind: ${kind}` };
  }
}

const KIND_LABEL = {
  create_action: (p) => `Create action “${p.title || ''}”`,
  schedule_action: (p) => `Schedule action → ${p.scheduled_date || '?'}`,
  complete_action: (p) => (p.completed === false ? 'Reopen an action' : 'Complete an action'),
  create_rpm_block: (p) => `Create RPM block “${p.result_title || ''}”`,
  update_key_result: (p) => `Update key result → ${p.current_value}`,
};

function proposalLink(kind, payload) {
  if (kind === 'create_action') return linkForProject(payload.project_id);
  if (kind === 'create_rpm_block') return linkForProject(payload.project_id);
  return '/my-day';
}

function buildTools(ai, pool, userId, autoMode = false) {
  const { tool, jsonSchema } = ai;

  // A write tool: executes immediately in auto mode, otherwise returns a proposal.
  const writeTool = (kind, description, schema) => tool({
    description: autoMode
      ? description
      : `${description} This is PROPOSED for the user to approve — do not claim it is done; say you've suggested it.`,
    inputSchema: jsonSchema(schema),
    execute: async (input) => {
      if (autoMode) return applyProposal(pool, userId, kind, input);
      return { proposed: true, kind, payload: input, label: (KIND_LABEL[kind] || (() => kind))(input), link: proposalLink(kind, input) };
    },
  });

  return {
    list_projects: tool({
      description: "List the user's projects with their ids.",
      inputSchema: jsonSchema({ type: 'object', properties: {}, additionalProperties: false }),
      execute: async () => {
        const r = await pool.query('SELECT id, name, ultimate_result FROM projects WHERE user_id = $1 ORDER BY sort_order', [userId]);
        return { projects: r.rows };
      },
    }),

    create_action: writeTool('create_action', 'Create a new action (task), optionally attached to a project and scheduled.', {
      type: 'object',
      properties: {
        title: { type: 'string' },
        project_id: { type: 'string' },
        scheduled_date: { type: 'string', description: 'YYYY-MM-DD' },
        duration_minutes: { type: 'number' },
        is_starred: { type: 'boolean' },
      },
      required: ['title'],
      additionalProperties: false,
    }),

    schedule_action: writeTool('schedule_action', 'Set or change the scheduled date of an existing action.', {
      type: 'object',
      properties: { action_id: { type: 'string' }, scheduled_date: { type: 'string', description: 'YYYY-MM-DD' } },
      required: ['action_id', 'scheduled_date'],
      additionalProperties: false,
    }),

    complete_action: writeTool('complete_action', 'Mark an action completed (or reopen it).', {
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

    update_key_result: writeTool('update_key_result', "Update a key result's current progress value.", {
      type: 'object',
      properties: { key_result_id: { type: 'string' }, current_value: { type: 'number' } },
      required: ['key_result_id', 'current_value'],
      additionalProperties: false,
    }),
  };
}

module.exports = { buildTools, applyProposal };
