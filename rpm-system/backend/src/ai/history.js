// Turns stored conversation rows into the message list sent to the model, and
// sanitizes client-supplied message arrays. Pure functions — unit tested.
//
// Why this exists: the model only "remembers" what we send back each turn. Stored
// assistant text alone loses everything the agent DID (tool calls, created ids,
// proposals and whether the user approved them), and a tool-only turn is stored as
// '' — so the next turn either confuses the model or is rejected by providers that
// forbid empty messages. Empty turns are dropped, and buildActionLog() gives the
// system prompt a compact record of every action with ids and approval status.

const { ymd } = require('./dates');

const MAX_HISTORY_MESSAGES = 40;      // most recent turns kept verbatim
const MAX_HISTORY_CHARS = 60000;      // ~15k tokens of history, oldest dropped first
const MAX_MESSAGE_CHARS = 20000;      // hard cap on any single message

const clip = (s, n) => {
  const t = String(s ?? '');
  return t.length > n ? `${t.slice(0, n)}…` : t;
};

// Provider-executed tools (web search) carry bulky payloads with no memory value.
const SKIP_IN_LOG = new Set(['web_search', 'list_projects', 'find_actions']);

// One line per tool event: what was done / suggested, with the ids the model will
// need to refer back to ("move that task to Friday").
function summarizeTool(t) {
  if (!t || !t.name || SKIP_IN_LOG.has(t.name)) return null;
  const r = t.result || {};
  if (r.proposed) {
    const status = t.status === 'applied' ? 'user APPROVED it — applied'
      : t.status === 'dismissed' ? 'user DISMISSED it — not applied'
        : 'awaiting the user\'s approval — not applied yet';
    const id = t.applied && t.applied.id ? ` (id ${t.applied.id})` : '';
    return `- suggested ${r.label || r.kind || t.name}${id} → ${status}`;
  }
  if (r.ok === false) return `- ${t.name} FAILED: ${clip(r.error || 'error', 120)}`;
  if (t.name === 'remember') return r.id ? `- saved to long-term memory (id ${r.id})` : null;
  if (t.name === 'forget') return '- removed a long-term memory';
  const bits = [];
  if (r.id) bits.push(`id ${r.id}`);
  if (r.title || r.result_title) bits.push(`"${clip(r.title || r.result_title, 80)}"`);
  if (r.scheduled_date) bits.push(`date ${ymd(r.scheduled_date)}`);
  if (r.is_completed !== undefined) bits.push(r.is_completed ? 'completed' : 'reopened');
  if (r.current_value !== undefined) bits.push(`value ${r.current_value}`);
  if (!t.done && !t.result) return `- ${t.name} (did not finish)`;
  return `- ${t.name}${bits.length ? ': ' + bits.join(', ') : ''}`;
}

function toolLog(tools) {
  if (!Array.isArray(tools) || !tools.length) return '';
  return tools.map(summarizeTool).filter(Boolean).join('\n');
}

// A log of what the agent did earlier in this conversation, for the SYSTEM prompt.
// (Kept out of the assistant turns themselves: models imitate their own earlier
// replies, and started echoing an embedded log back to the user.)
function buildActionLog(rows, { maxTurns = 15 } = {}) {
  const turns = [];
  let lastUser = '';
  for (const row of rows || []) {
    if (row.role === 'user') { lastUser = String(row.content || ''); continue; }
    if (row.role !== 'assistant') continue;
    const log = toolLog(typeof row.tools === 'string' ? safeJson(row.tools) : row.tools);
    if (log) turns.push(`When the user said "${clip(lastUser.replace(/\s+/g, ' '), 80)}":\n${log}`);
  }
  return turns.slice(-maxTurns).join('\n');
}

// rows: [{ role, content, tools }] oldest→newest (as stored in ai_messages).
// Returns a valid alternating user/assistant list that starts with a user turn.
function buildHistory(rows, { maxMessages = MAX_HISTORY_MESSAGES, maxChars = MAX_HISTORY_CHARS } = {}) {
  const out = [];
  for (const row of rows || []) {
    if (row.role !== 'user' && row.role !== 'assistant') continue;
    let content = clip(String(row.content || '').trim(), MAX_MESSAGE_CHARS);
    if (row.role === 'assistant' && content.startsWith('⚠️')) content = '';   // a failed turn
    if (!content) continue;
    const prev = out[out.length - 1];
    if (prev && prev.role === row.role) prev.content += `\n\n${content}`;   // merge same-role runs
    else out.push({ role: row.role, content });
  }

  // Window: keep the newest turns within both budgets.
  let kept = out.slice(-maxMessages);
  let total = kept.reduce((n, m) => n + m.content.length, 0);
  while (kept.length > 1 && total > maxChars) { total -= kept[0].content.length; kept = kept.slice(1); }
  while (kept.length && kept[0].role !== 'user') kept = kept.slice(1);      // must open with the user
  if (kept.length < out.length && kept.length) {
    kept = [{ role: kept[0].role, content: `(Earlier messages in this conversation were omitted for length.)\n\n${kept[0].content}` }, ...kept.slice(1)];
  }
  return kept;
}

function safeJson(s) { try { return JSON.parse(s); } catch { return null; } }

// Client-supplied message arrays (coach chat) — accept only plain user/assistant
// text. Drops system/tool roles and structured parts (images, files, tool calls)
// that could smuggle instructions or make the provider fetch arbitrary URLs.
function sanitizeClientMessages(messages, { max = 24 } = {}) {
  if (!Array.isArray(messages)) return [];
  const rows = messages
    .filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .map(m => ({ role: m.role, content: m.content }));
  const built = buildHistory(rows, { maxMessages: max });
  return built.length && built[built.length - 1].role === 'user' ? built : [];
}

module.exports = { buildHistory, buildActionLog, sanitizeClientMessages, toolLog, summarizeTool, MAX_MESSAGE_CHARS };
