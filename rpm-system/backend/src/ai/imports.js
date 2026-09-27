// Saved "Plan from a file" uploads. Every analysis becomes a draft the user can leave
// and reopen (their edits autosave into `draft`); applying it marks it `applied` and
// links the project it landed in.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (v) => typeof v === 'string' && UUID_RE.test(v);
const KEEP_PER_USER = 50;
const MAX_DRAFT_BYTES = 1.5 * 1024 * 1024;

async function createImport(pool, userId, { fileName, fileKind, plan }) {
  const r = await pool.query(
    `INSERT INTO plan_imports (user_id, file_name, file_kind, plan) VALUES ($1, $2, $3, $4) RETURNING id`,
    [userId, String(fileName || 'file').slice(0, 200), fileKind || null, JSON.stringify(plan)]);
  await pool.query(
    `DELETE FROM plan_imports WHERE id IN (
       SELECT id FROM plan_imports WHERE user_id = $1 ORDER BY updated_at DESC OFFSET $2)`, [userId, KEEP_PER_USER]);
  return r.rows[0].id;
}

async function listImports(pool, userId) {
  return (await pool.query(
    `SELECT i.id, i.file_name, i.file_kind, i.status, i.project_id, p.name AS project_name,
            COALESCE(i.draft->>'title', i.plan->>'title') AS title,
            jsonb_array_length(COALESCE(i.draft->'tasks', i.plan->'tasks', '[]'::jsonb)) AS task_count,
            i.result, i.created_at, i.updated_at
       FROM plan_imports i LEFT JOIN projects p ON p.id = i.project_id
      WHERE i.user_id = $1 ORDER BY i.updated_at DESC LIMIT 30`, [userId])).rows;
}

async function getImport(pool, userId, id) {
  if (!isUuid(id)) return null;
  return (await pool.query(
    `SELECT i.*, p.name AS project_name FROM plan_imports i LEFT JOIN projects p ON p.id = i.project_id
      WHERE i.id = $1 AND i.user_id = $2`, [id, userId])).rows[0] || null;
}

// Autosave the user's edits. Applied plans are frozen (their truth is now the project).
async function saveDraft(pool, userId, id, draft) {
  if (!isUuid(id)) return { ok: false, error: 'not found' };
  const json = JSON.stringify(draft ?? null);
  if (json.length > MAX_DRAFT_BYTES) return { ok: false, error: 'draft too large' };
  const r = await pool.query(
    `UPDATE plan_imports SET draft = $3, updated_at = NOW() WHERE id = $1 AND user_id = $2 AND status = 'draft' RETURNING id`,
    [id, userId, json]);
  return r.rows[0] ? { ok: true } : { ok: false, error: 'not found or already created' };
}

async function markApplied(pool, userId, id, { projectId, result }) {
  if (!isUuid(id)) return;
  await pool.query(
    `UPDATE plan_imports SET status = 'applied', project_id = $3, result = $4, updated_at = NOW() WHERE id = $1 AND user_id = $2`,
    [id, userId, projectId, JSON.stringify(result || null)]);
}

async function deleteImport(pool, userId, id) {
  if (!isUuid(id)) return;
  await pool.query('DELETE FROM plan_imports WHERE id = $1 AND user_id = $2', [id, userId]);
}

module.exports = { createImport, listImports, getImport, saveDraft, markApplied, deleteImport, isUuid };
