// Foreign-id guard: every id a client sends to link rows (category, project, block, key result, person)
// must belong to the same user. Without it, a user could attach their own row to another user's project
// and read its name back through the joined views (v_actions_full, v_rpm_blocks_stats).

const CHECKS = {
  category_id: 'SELECT 1 FROM categories WHERE id = $1 AND user_id = $2',
  project_id: 'SELECT 1 FROM projects WHERE id = $1 AND user_id = $2',
  block_id: 'SELECT 1 FROM rpm_blocks WHERE id = $1 AND user_id = $2',
  key_result_id: 'SELECT 1 FROM key_results kr JOIN projects p ON p.id = kr.project_id WHERE kr.id = $1 AND p.user_id = $2',
  leverage_person_id: 'SELECT 1 FROM persons WHERE id = $1 AND user_id = $2',
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Returns null when every provided id is owned (or empty/absent), else the name of the first bad field. */
async function firstForeignId(pool, userId, fields) {
  for (const [field, sql] of Object.entries(CHECKS)) {
    const v = fields[field];
    if (v === undefined || v === null || v === '') continue;
    if (typeof v !== 'string' || !UUID.test(v)) return field;
    const { rows } = await pool.query(sql, [v, userId]);
    if (!rows.length) return field;
  }
  return null;
}

module.exports = { firstForeignId, OWNED_FIELDS: Object.keys(CHECKS) };
