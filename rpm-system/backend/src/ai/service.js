// Unified chat entry point. runChat() yields { type:'text', text } chunks and a
// final { type:'sources', sources } event, regardless of provider.

const { loadSdk } = require('./esm');
const { getModelEntry, providerLabel } = require('./registry');
const { resolveKey } = require('./keys');
const { streamZai } = require('./zai');
const { buildRpmContext } = require('./context');
const { buildTools } = require('./tools');

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
- Be concise. Never invent ids — only use ids from the context.
- Use plain, motivating language. It's fine to push back if the user's plan won't move any key result.
- IMPORTANT: a change tool may be applied directly OR proposed for the user's approval (their choice).
  If a tool result contains "proposed": true, DO NOT say you created/changed it — say you've *suggested* it and
  they can approve it below. Don't re-list every item in prose; the UI already shows each suggestion with a button.
- Format answers in clean Markdown (headings, tables, bold, short lists) — it is rendered, not shown as raw text.`;

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
async function* runChat({ pool, userId, modelKey, messages, webSearch, rpm, autoMode }) {
  const entry = getModelEntry(modelKey);
  if (!entry) throw new AiError('unknown_model', `Unknown model: ${modelKey}`);

  const apiKey = await resolveKey(pool, userId, entry.provider);
  if (!apiKey) {
    throw new AiError('no_key', `Add your ${providerLabel(entry.provider)} API key in Settings to use this model.`);
  }

  const useSearch = !!webSearch && !!entry.webSearch;

  // In RPM mode, prepend a fresh system message carrying the live context.
  let msgs = messages;
  if (rpm) {
    const ctx = await buildRpmContext(pool, userId);
    msgs = [
      { role: 'system', content: `${RPM_SYSTEM}\n\n=== YOUR RPM DATA ===\n${ctx.text}` },
      ...messages.filter(m => m.role !== 'system'),
    ];
  }

  // z.ai goes through the direct client (GLM web_search). It gets context but not
  // the action tools (the direct client doesn't run function tools here).
  if (entry.provider === 'zhipu') {
    yield* streamZai({ apiKey, model: entry.model, messages: msgs, webSearch: useSearch });
    return;
  }

  const { ai } = await loadSdk();
  const { model, sdk } = await buildAiSdkModel(entry, apiKey);
  const { system, rest } = splitSystem(msgs);

  const tools = {};
  if (useSearch) Object.assign(tools, await searchTools(sdk));
  if (rpm) Object.assign(tools, buildTools(ai, pool, userId, !!autoMode));
  const hasTools = Object.keys(tools).length > 0;

  const result = ai.streamText({
    model,
    ...(system ? { system } : {}),
    messages: rest,
    ...(hasTools ? { tools } : {}),
    // Allow the model to call tools then respond (multi-step) in RPM mode.
    ...(rpm ? { stopWhen: ai.stepCountIs(6) } : {}),
  });

  const sources = [];
  // fullStream surfaces text + tool activity so the UI can show what the agent did.
  for await (const part of result.fullStream) {
    switch (part.type) {
      case 'text-delta': {
        const t = part.text ?? part.textDelta ?? '';
        if (t) yield { type: 'text', text: t };
        break;
      }
      case 'tool-call':
        yield { type: 'tool_call', name: part.toolName, args: part.input ?? part.args ?? {} };
        break;
      case 'tool-result':
        yield { type: 'tool_result', name: part.toolName, result: part.output ?? part.result ?? null };
        break;
      case 'source':
        if (part.url || part.source?.url) sources.push({ url: part.url || part.source.url, title: part.title || part.source?.title || part.url });
        break;
      case 'error':
        yield { type: 'error', message: String(part.error?.message || part.error || 'stream error') };
        break;
      default:
        break;
    }
  }

  if (!sources.length) {
    try {
      const s = await result.sources;
      if (Array.isArray(s)) for (const x of s) if (x.url) sources.push({ url: x.url, title: x.title || x.url });
    } catch { /* no sources */ }
  }
  yield { type: 'sources', sources };
}

module.exports = { runChat, AiError };
