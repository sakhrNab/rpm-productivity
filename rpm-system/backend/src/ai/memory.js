// Long-term memory for the main assistant (and the voice orb, which shares its
// chat endpoint). Durable facts the user tells it — preferences, constraints,
// people, routines — survive across conversations. The model writes them through
// the `remember` / `forget` tools; every chat injects them into the system prompt.
// Users can review and delete them in Settings → Assistant memory.

const MEMORY_CAP = 200;        // per user; oldest un-pinned rows pruned past this
const INJECT_LIMIT = 60;       // most relevant rows sent to the model each turn
const MAX_CONTENT = 300;
const KINDS = ['preference', 'fact', 'person', 'constraint', 'goal', 'routine', 'other'];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const normKind = (k) => (KINDS.includes(k) ? k : 'fact');
const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, MAX_CONTENT);

async function listMemory(pool, userId, limit = INJECT_LIMIT) {
  return (await pool.query(
    `SELECT id, kind, content, pinned, created_at, updated_at FROM ai_memory
      WHERE user_id = $1 ORDER BY pinned DESC, updated_at DESC LIMIT $2`,
    [userId, limit])).rows;
}

async function addMemory(pool, userId, { content, kind, replaces_id }) {
  const text = clean(content);
  if (text.length < 3) return { ok: false, error: 'memory content is empty' };
  if (replaces_id) {
    if (!UUID_RE.test(replaces_id)) return { ok: false, error: 'replaces_id is not a valid memory id' };
    const r = await pool.query(
      'UPDATE ai_memory SET content = $1, kind = $2, updated_at = NOW() WHERE id = $3 AND user_id = $4 RETURNING id, kind, content',
      [text, normKind(kind), replaces_id, userId]);
    if (r.rows[0]) return { ok: true, updated: true, ...r.rows[0] };
    // Unknown id — fall through and store it as new rather than lose the fact.
  }
  const dup = await pool.query('SELECT id FROM ai_memory WHERE user_id = $1 AND lower(content) = lower($2)', [userId, text]);
  if (dup.rows[0]) {
    await pool.query('UPDATE ai_memory SET updated_at = NOW() WHERE id = $1', [dup.rows[0].id]);
    return { ok: true, duplicate: true, id: dup.rows[0].id, content: text };
  }
  const r = await pool.query(
    'INSERT INTO ai_memory (user_id, kind, content) VALUES ($1, $2, $3) RETURNING id, kind, content',
    [userId, normKind(kind), text]);
  await pool.query(
    `DELETE FROM ai_memory WHERE id IN (
       SELECT id FROM ai_memory WHERE user_id = $1 AND pinned = false
        ORDER BY updated_at DESC OFFSET $2)`, [userId, MEMORY_CAP]);
  return { ok: true, ...r.rows[0] };
}

async function deleteMemory(pool, userId, id) {
  if (!UUID_RE.test(String(id || ''))) return { ok: false, error: 'not a valid memory id' };
  const r = await pool.query('DELETE FROM ai_memory WHERE id = $1 AND user_id = $2 RETURNING id', [id, userId]);
  return r.rows[0] ? { ok: true, id } : { ok: false, error: 'memory not found' };
}

async function setPinned(pool, userId, id, pinned) {
  if (!UUID_RE.test(String(id || ''))) return { ok: false };
  const r = await pool.query('UPDATE ai_memory SET pinned = $3 WHERE id = $1 AND user_id = $2 RETURNING id', [id, userId, !!pinned]);
  return { ok: !!r.rows[0] };
}

// System-prompt block. Ids are included so the model can update/forget precisely.
function renderMemory(rows) {
  const head = `=== WHAT YOU REMEMBER ABOUT THE USER (long-term memory, id · kind · fact) ===`;
  if (!rows.length) return `${head}\n  (nothing yet)`;
  return `${head}\n${rows.map(m => `• ${m.id} · ${m.kind} · ${m.content}`).join('\n')}`;
}

const MEMORY_GUIDE = `Long-term memory: you remember the user across conversations via the "remember" and "forget" tools.
- When the user tells you something durable about themselves — preferences, constraints, routines, people in their
  life, how they like to work, facts they'd expect you to know next time — call "remember" right away with a short,
  self-contained sentence (e.g. "Prefers deep work before noon"). Do this without being asked; if they say
  "remember…", always do it.
- Don't store one-off task details (those belong in actions) or secrets such as passwords or API keys.
- If a new fact changes an existing memory, pass its id as replaces_id instead of adding a duplicate. If the user says
  something is no longer true or asks you to forget it, call "forget".
- Use what you remember naturally; never re-ask for something already in memory.`;

function buildMemoryTools(ai, pool, userId) {
  const { tool, jsonSchema } = ai;
  return {
    remember: tool({
      description: 'Save a durable fact about the user to long-term memory so you remember it in future conversations. Applied immediately.',
      inputSchema: jsonSchema({
        type: 'object',
        properties: {
          content: { type: 'string', description: 'One short, self-contained sentence.' },
          kind: { type: 'string', enum: KINDS },
          replaces_id: { type: 'string', description: 'Id of an existing memory this corrects/updates.' },
        },
        required: ['content'],
        additionalProperties: false,
      }),
      execute: async (input) => JSON.parse(JSON.stringify(await addMemory(pool, userId, input || {}))),
    }),
    forget: tool({
      description: 'Delete a long-term memory by its id (when it is wrong or the user asks you to forget it).',
      inputSchema: jsonSchema({
        type: 'object',
        properties: { memory_id: { type: 'string' } },
        required: ['memory_id'],
        additionalProperties: false,
      }),
      execute: async ({ memory_id } = {}) => deleteMemory(pool, userId, memory_id),
    }),
  };
}

module.exports = { listMemory, addMemory, deleteMemory, setPinned, renderMemory, buildMemoryTools, MEMORY_GUIDE, KINDS };
