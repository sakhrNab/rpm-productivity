// RPM action tools for the assistant. Every tool is scoped to the user (writes
// only touch their own rows) and there are NO destructive/delete tools.
// buildTools receives the ESM `ai` namespace (for tool()/jsonSchema()).

function buildTools(ai, pool, userId) {
  const { tool, jsonSchema } = ai;

  // Confirm a project belongs to this user; returns id or null.
  const ownProject = async (id) => {
    if (!id) return null;
    const r = await pool.query('SELECT id FROM projects WHERE id = $1 AND user_id = $2', [id, userId]);
    return r.rows[0]?.id || null;
  };

  return {
    list_projects: tool({
      description: "List the user's projects with their ids, so you can reference them in other tools.",
      inputSchema: jsonSchema({ type: 'object', properties: {}, additionalProperties: false }),
      execute: async () => {
        const r = await pool.query('SELECT id, name, ultimate_result FROM projects WHERE user_id = $1 ORDER BY sort_order', [userId]);
        return { projects: r.rows };
      },
    }),

    create_action: tool({
      description: 'Create a new action (task). Optionally attach it to a project and schedule it.',
      inputSchema: jsonSchema({
        type: 'object',
        properties: {
          title: { type: 'string', description: 'The action title' },
          project_id: { type: 'string', description: 'Project id to attach to (optional)' },
          scheduled_date: { type: 'string', description: 'YYYY-MM-DD (optional)' },
          duration_minutes: { type: 'number', description: 'Estimated minutes (optional)' },
          is_starred: { type: 'boolean', description: 'Mark as a priority (optional)' },
        },
        required: ['title'],
        additionalProperties: false,
      }),
      execute: async ({ title, project_id, scheduled_date, duration_minutes, is_starred }) => {
        if (!title || !title.trim()) return { ok: false, error: 'title is required' };
        const proj = await ownProject(project_id);
        const r = await pool.query(
          `INSERT INTO actions (user_id, project_id, title, duration_minutes, scheduled_date, is_starred, sort_order)
           VALUES ($1, $2, $3, $4, $5, $6, (SELECT COALESCE(MAX(sort_order),0)+1 FROM actions WHERE user_id=$1))
           RETURNING id, title, scheduled_date`,
          [userId, proj, title.trim(), duration_minutes || 5, scheduled_date || null, !!is_starred]
        );
        return { ok: true, ...r.rows[0] };
      },
    }),

    schedule_action: tool({
      description: 'Set or change the scheduled date of an existing action.',
      inputSchema: jsonSchema({
        type: 'object',
        properties: {
          action_id: { type: 'string' },
          scheduled_date: { type: 'string', description: 'YYYY-MM-DD' },
        },
        required: ['action_id', 'scheduled_date'],
        additionalProperties: false,
      }),
      execute: async ({ action_id, scheduled_date }) => {
        const r = await pool.query(
          'UPDATE actions SET scheduled_date = $1 WHERE id = $2 AND user_id = $3 RETURNING id, title, scheduled_date',
          [scheduled_date || null, action_id, userId]
        );
        if (!r.rows[0]) return { ok: false, error: 'action not found' };
        return { ok: true, ...r.rows[0] };
      },
    }),

    complete_action: tool({
      description: 'Mark an action as completed (or uncompleted).',
      inputSchema: jsonSchema({
        type: 'object',
        properties: {
          action_id: { type: 'string' },
          completed: { type: 'boolean', description: 'true to complete (default), false to reopen' },
        },
        required: ['action_id'],
        additionalProperties: false,
      }),
      execute: async ({ action_id, completed }) => {
        const done = completed !== false;
        const r = await pool.query(
          'UPDATE actions SET is_completed = $1 WHERE id = $2 AND user_id = $3 RETURNING id, title, is_completed',
          [done, action_id, userId]
        );
        if (!r.rows[0]) return { ok: false, error: 'action not found' };
        return { ok: true, ...r.rows[0] };
      },
    }),

    create_rpm_block: tool({
      description: 'Create an RPM block (a Result/Purpose/Massive-Action-Plan unit) under a project.',
      inputSchema: jsonSchema({
        type: 'object',
        properties: {
          project_id: { type: 'string' },
          result_title: { type: 'string', description: 'The result this block drives toward' },
          purpose: { type: 'string', description: 'Why it matters (optional)' },
        },
        required: ['project_id', 'result_title'],
        additionalProperties: false,
      }),
      execute: async ({ project_id, result_title, purpose }) => {
        const proj = await ownProject(project_id);
        if (!proj) return { ok: false, error: 'project not found' };
        const cat = await pool.query('SELECT category_id FROM projects WHERE id = $1', [proj]);
        const r = await pool.query(
          `INSERT INTO rpm_blocks (user_id, category_id, project_id, result_title, purpose, sort_order)
           VALUES ($1, $2, $3, $4, $5, (SELECT COALESCE(MAX(sort_order),0)+1 FROM rpm_blocks WHERE user_id=$1))
           RETURNING id, result_title`,
          [userId, cat.rows[0]?.category_id || null, proj, result_title.trim(), purpose || '']
        );
        return { ok: true, ...r.rows[0] };
      },
    }),

    update_key_result: tool({
      description: "Update a key result's current progress value.",
      inputSchema: jsonSchema({
        type: 'object',
        properties: {
          key_result_id: { type: 'string' },
          current_value: { type: 'number' },
        },
        required: ['key_result_id', 'current_value'],
        additionalProperties: false,
      }),
      execute: async ({ key_result_id, current_value }) => {
        const r = await pool.query(
          `UPDATE key_results kr
              SET current_value = $1,
                  is_completed = (kr.target_value IS NOT NULL AND $1 >= kr.target_value)
            FROM projects p
           WHERE kr.id = $2 AND kr.project_id = p.id AND p.user_id = $3
           RETURNING kr.id, kr.title, kr.current_value, kr.target_value, kr.is_completed`,
          [current_value, key_result_id, userId]
        );
        if (!r.rows[0]) return { ok: false, error: 'key result not found' };
        return { ok: true, ...r.rows[0] };
      },
    }),
  };
}

module.exports = { buildTools };
