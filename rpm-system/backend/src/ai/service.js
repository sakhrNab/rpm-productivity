// Unified chat entry point. runChat() yields { type:'text', text } chunks and a
// final { type:'sources', sources } event, regardless of provider.

const { loadSdk } = require('./esm');
const { getModelEntry, providerLabel } = require('./registry');
const { resolveKey } = require('./keys');
const { streamZai } = require('./zai');

class AiError extends Error {
  constructor(code, message) { super(message); this.code = code; this.name = 'AiError'; }
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

async function* runChat({ pool, userId, modelKey, messages, webSearch }) {
  const entry = getModelEntry(modelKey);
  if (!entry) throw new AiError('unknown_model', `Unknown model: ${modelKey}`);

  const apiKey = await resolveKey(pool, userId, entry.provider);
  if (!apiKey) {
    throw new AiError('no_key', `Add your ${providerLabel(entry.provider)} API key in Settings to use this model.`);
  }

  const useSearch = !!webSearch && !!entry.webSearch;

  // z.ai goes through the direct client so we can pass GLM's web_search tool.
  if (entry.provider === 'zhipu') {
    yield* streamZai({ apiKey, model: entry.model, messages, webSearch: useSearch });
    return;
  }

  const { ai } = await loadSdk();
  const { model, sdk } = await buildAiSdkModel(entry, apiKey);
  const { system, rest } = splitSystem(messages);
  const tools = useSearch ? await searchTools(sdk) : undefined;

  const result = ai.streamText({
    model,
    ...(system ? { system } : {}),
    messages: rest,
    ...(tools ? { tools } : {}),
  });

  for await (const chunk of result.textStream) {
    if (chunk) yield { type: 'text', text: chunk };
  }

  let sources = [];
  try {
    const s = await result.sources;
    if (Array.isArray(s)) {
      sources = s.map(x => ({ url: x.url, title: x.title || x.url })).filter(x => x.url);
    }
  } catch { /* provider returned no sources */ }
  yield { type: 'sources', sources };
}

module.exports = { runChat, AiError };
