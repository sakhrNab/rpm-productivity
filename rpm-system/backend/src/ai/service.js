// Unified chat entry point. runChat() yields { type:'text', text } chunks and a
// final { type:'sources', sources } event, regardless of provider.

const { loadSdk } = require('./esm');
const { getModelEntry, providerLabel } = require('./registry');
const { resolveKey } = require('./keys');
const { streamZai } = require('./zai');
const { buildRpmContext, todayInTz } = require('./context');
const { buildTools } = require('./tools');
const { listMemory, renderMemory, buildMemoryTools, MEMORY_GUIDE } = require('./memory');

class AiError extends Error {
  constructor(code, message) { super(message); this.code = code; this.name = 'AiError'; }
}

const RPM_SYSTEM = `You are the user's RPM assistant and coach (RPM = Result, Purpose, Massive Action Plan).
You can SEE their live data (projects, key results, RPM blocks, actions — with ids) in the context below,
and you can ACT using tools: create/schedule/complete actions, create RPM blocks, update key-result progress.

Everything below the context marker is THIS user's real data — read it, never assume a generic structure.
Every user is different: their categories, goal horizons, projects and naming are their own.

Be action-driven, not just conversational:
- When the user asks you to plan, capture, or change something, USE the tools to do it — don't just describe it.
- Targeting: attach each new action to the most relevant PROJECT by matching the user's request to the real
  projects in the context (by name/result/purpose). The project determines the category automatically — you do
  not set a category directly. Only use project ids that appear in the context.
- ASK, don't guess: if you can't confidently tell which project (or category) something belongs to, or the
  timeframe is unclear, ask ONE short clarifying question first instead of guessing or dumping it unassigned.
- Anchor plans to the user's ACTUAL goal horizons from the context: 1-year goals and 90-day (quarterly) goals per
  category, key-result due dates, and block deadlines. "This week" = actions dated within the next 7 days.
  Monthly/quarterly framing should map to those real goals, not invented ones.
- If asked "what should I focus on", look at behind-pace key results, upcoming deadlines, and the relevant 90-day
  goals, then give a concrete must-win plus 1-3 specific next actions (propose them).
- You can create, schedule, complete, edit, and (when the user is reviewing suggestions) delete actions, plus
  create RPM blocks and update key results. Editing and deleting always require the user's explicit approval.
- Be concise. Never invent ids — only use ids from the context (or returned by find_actions). If a tool returns
  "ok": false, read the error, fix the call (e.g. use the right id) and retry once, or tell the user plainly.
- Resolve relative dates ("tomorrow", "next Friday") from the Today line in the context, always as YYYY-MM-DD.
- "What you did earlier in this conversation" (below, when present) is the record of your real tool calls, with ids
  and whether the user approved each suggestion — use those ids when the user refers back ("move that one").
- Use plain, motivating language. It's fine to push back if the user's plan won't move any key result.
- IMPORTANT: a change tool may be applied directly OR proposed for the user's approval (their choice).
  If a tool result contains "proposed": true, DO NOT say you created/changed it — say you've *suggested* it and
  they can approve it below. Don't re-list every item in prose; the UI already shows each suggestion with a button.
- Format answers in clean Markdown (headings, tables, bold, short lists) — it is rendered, not shown as raw text.`;

const GENERAL_SYSTEM = `You are the user's personal assistant inside their RPM productivity app. Answer helpfully and concisely.
Format answers in clean Markdown — it is rendered, not shown as raw text.`;

// Anthropic-protocol models (Claude + DeepSeek) default to a 4096-token output cap
// for ids the SDK doesn't recognise, which truncates long plans mid-sentence.
const MAX_OUTPUT_TOKENS = 16000;

// Compact what a provider-executed web search returns: the raw result carries large
// encrypted page blobs that are useless to the UI and bloat the saved message.
function searchResultSources(result) {
  const arr = Array.isArray(result) ? result : Array.isArray(result?.results) ? result.results : Array.isArray(result?.sources) ? result.sources : [];
  return arr.filter(r => r && (r.url || r.link)).map(r => ({ url: r.url || r.link, title: r.title || r.url || r.link }));
}

// Split a leading system message out of the array (AI SDK prefers `system`).
function splitSystem(messages) {
  if (messages[0]?.role === 'system') {
    return { system: messages[0].content, rest: messages.slice(1) };
  }
  return { system: undefined, rest: messages };
}

async function buildAiSdkModel(entry, apiKey) {
  const { anthropic, openai } = await loadSdk();
  switch (entry.provider) {
    case 'anthropic': {
      const p = anthropic.createAnthropic({ apiKey });
      return { model: p(entry.model), sdk: 'anthropic' };
    }
    case 'deepseek': {
      // DeepSeek's native web search lives on its Anthropic-compatible endpoint.
      const p = anthropic.createAnthropic({ apiKey, baseURL: 'https://api.deepseek.com/anthropic' });
      return { model: p(entry.model), sdk: 'anthropic' };
    }
    case 'openai': {
      const p = openai.createOpenAI({ apiKey });
      return { model: p.responses(entry.model), sdk: 'openai' };
    }
    default:
      throw new AiError('unknown_provider', `No AI SDK path for ${entry.provider}`);
  }
}

async function searchTools(sdk) {
  const { anthropic, openai } = await loadSdk();
  if (sdk === 'anthropic') return { web_search: anthropic.anthropic.tools.webSearch_20250305({ maxUses: 5 }) };
  if (sdk === 'openai') return { web_search: openai.openai.tools.webSearch({}) };
  return undefined;
}

// rpm=true injects the user's RPM context and enables action tools ("agent mode").
// autoMode=true executes writes immediately; otherwise writes are proposed for approval.
// memory=true injects the user's long-term memory and the remember/forget tools.
// abortSignal stops generation (and billing) when the client disconnects.
async function* runChat({ pool, userId, modelKey, messages, webSearch, rpm, autoMode, systemOverride, contextText, memory, timezone, abortSignal, actionLog }) {
  const entry = getModelEntry(modelKey);
  if (!entry) throw new AiError('unknown_model', 'That model is no longer available — pick a new default model in Settings.');

  const apiKey = await resolveKey(pool, userId, entry.provider);
  if (!apiKey) {
    throw new AiError('no_key', `Add your ${providerLabel(entry.provider)} API key in Settings to use this model.`);
  }

  const useSearch = !!webSearch && !!entry.webSearch;

  // Build the system prompt. RPM mode carries the live data snapshot; a coach passes
  // systemOverride (persona+memory) and contextText (its scoped slice) to reuse the
  // same tool-calling agent. Memory mode appends what the assistant knows about the user.
  let msgs = messages;
  if (rpm || memory || actionLog) {
    const parts = [];
    if (rpm) {
      const ctxText = contextText != null ? contextText : (await buildRpmContext(pool, userId, { timezone })).text;
      parts.push(systemOverride || RPM_SYSTEM, `=== YOUR RPM DATA ===\n${ctxText}`);
    } else {
      parts.push(systemOverride || GENERAL_SYSTEM, `Today: ${todayInTz(timezone)}${timezone ? ` (timezone ${timezone})` : ''}`);
    }
    if (memory) {
      let rows = [];
      try { rows = await listMemory(pool, userId); } catch (e) { console.error('[ai] memory load:', e.message); }
      parts.push(MEMORY_GUIDE, renderMemory(rows));
    }
    if (actionLog) {
      parts.push(`=== WHAT YOU DID EARLIER IN THIS CONVERSATION (tool calls, ids, and whether the user approved) ===\n${actionLog}\n(Reference only — trust this over your memory of the prose, and never copy this log into a reply.)`);
    }
    msgs = [
      { role: 'system', content: parts.join('\n\n') },
      ...messages.filter(m => m.role !== 'system'),
    ];
  }

  const { ai } = await loadSdk();
  const tools = {};
  if (rpm) Object.assign(tools, buildTools(ai, pool, userId, !!autoMode));
  if (memory) Object.assign(tools, buildMemoryTools(ai, pool, userId));

  // z.ai goes through the direct client (GLM's built-in web_search can't pass through
  // the SDK). It runs the same function tools via its own tool loop.
  if (entry.provider === 'zhipu') {
    yield* streamZai({ apiKey, model: entry.model, messages: msgs, webSearch: useSearch, tools, abortSignal });
    return;
  }

  const { model, sdk } = await buildAiSdkModel(entry, apiKey);
  const { system, rest } = splitSystem(msgs);
  if (useSearch) Object.assign(tools, await searchTools(sdk));
  const hasTools = Object.keys(tools).length > 0;

  let streamError = null;
  const result = ai.streamText({
    model,
    ...(system ? { system } : {}),
    messages: rest,
    ...(hasTools ? { tools } : {}),
    ...(sdk === 'anthropic' ? { maxOutputTokens: MAX_OUTPUT_TOKENS } : {}),
    // Let the model call tools, read the results, then answer (multi-step).
    ...(hasTools ? { stopWhen: ai.stepCountIs(8) } : {}),
    ...(abortSignal ? { abortSignal } : {}),
    onError: ({ error }) => { streamError = error; },
  });

  const sources = [];
  const seen = new Set();
  const MAX_SOURCES = 10;
  const addSource = (s) => { if (s?.url && !seen.has(s.url) && sources.length < MAX_SOURCES) { seen.add(s.url); sources.push(s); } };
  let textSoFar = '';
  let toolSinceText = false;

  // fullStream surfaces text + tool activity so the UI can show what the agent did.
  for await (const part of result.fullStream) {
    switch (part.type) {
      case 'text-delta': {
        let t = part.text ?? part.textDelta ?? '';
        if (!t) break;
        // Text resuming after a tool step: separate it from the pre-tool sentence
        // (otherwise "I'll search the web.## Results" renders as one broken line).
        if (toolSinceText && textSoFar && !/\n\s*$/.test(textSoFar)) t = `\n\n${t.replace(/^\s+/, '')}`;
        toolSinceText = false;
        textSoFar += t;
        yield { type: 'text', text: t };
        break;
      }
      case 'tool-call':
        toolSinceText = true;
        yield { type: 'tool_call', name: part.toolName, args: part.input ?? part.args ?? {} };
        break;
      case 'tool-result': {
        toolSinceText = true;
        let output = part.output ?? part.result ?? null;
        if (part.providerExecuted || part.toolName === 'web_search') {
          const found = searchResultSources(output);
          found.forEach(addSource);
          output = { ok: true, searched: true, results: found.length };
        }
        yield { type: 'tool_result', name: part.toolName, result: output };
        break;
      }
      case 'tool-error': {
        // A tool threw (e.g. a DB error) — report it as a failed result so the UI
        // chip resolves instead of spinning forever.
        toolSinceText = true;
        const msg = String(part.error?.message || part.error || 'tool failed').slice(0, 300);
        console.error('[ai] tool error:', part.toolName, msg);
        yield { type: 'tool_result', name: part.toolName, result: { ok: false, error: msg } };
        break;
      }
      case 'source':
        addSource({ url: part.url || part.source?.url, title: part.title || part.source?.title || part.url });
        break;
      case 'error':
        yield { type: 'error', message: friendlyError(part.error) };
        break;
      default:
        break;
    }
  }
  if (abortSignal?.aborted) return;

  try {
    const s = await result.sources;
    if (Array.isArray(s)) for (const x of s) addSource({ url: x.url, title: x.title || x.url });
  } catch { /* no sources */ }

  // Token usage for cost tracking (best-effort; field names vary by SDK version).
  try {
    const u = await result.usage;   // v7: summed across all steps
    if (u) {
      const usage = {
        input: u.inputTokens ?? u.promptTokens ?? 0,
        output: u.outputTokens ?? u.completionTokens ?? 0,
        cached: u.cachedInputTokens ?? u.cacheReadTokens ?? u.inputTokenDetails?.cacheReadTokens ?? 0,
      };
      try {
        const pm = await result.providerMetadata;
        const c = pm?.anthropic?.cacheReadInputTokens ?? pm?.openai?.cachedPromptTokens;
        if (c != null && !usage.cached) usage.cached = c;
      } catch { /* no provider metadata */ }
      yield { type: 'usage', usage };
    }
  } catch { /* usage unavailable */ }

  if (streamError && !textSoFar) console.error('[ai] stream error:', streamError?.message || streamError);
  yield { type: 'sources', sources };
}

// Provider errors → a message the user can act on (never echoes request bodies).
function friendlyError(err) {
  const status = err?.statusCode ?? err?.status;
  const raw = String(err?.message || err || 'AI request failed');
  if (status === 401 || status === 403 || /invalid.*(api[_ ]?key|x-api-key)|authentication/i.test(raw)) return 'The provider rejected the API key — check it in Settings.';
  if (status === 402 || /insufficient|balance|quota|billing|credit/i.test(raw)) return 'The provider says the account is out of credit or over quota.';
  if (status === 429) return 'The provider is rate-limiting requests — wait a moment and try again.';
  if (status === 404 || /model.*(not.*found|does not exist)/i.test(raw)) return 'The provider did not recognise this model — pick another one.';
  if (status >= 500) return 'The provider had a temporary error — try again.';
  return raw.slice(0, 300);
}

module.exports = { runChat, AiError, friendlyError, searchResultSources };
