// Curated model registry — the single source of truth for the model picker.
// Edit here as providers ship new models. `key` is the stable id the frontend
// sends; `model` is the provider's real API model id; `family` groups models in
// the collapsible picker; `webSearch` marks whether native web search is wired.
//
// Current as of 2026-07-15. Model lineups move fast — update the ids here.

const PROVIDERS = {
  anthropic: { label: 'Claude (Anthropic)' },
  openai:    { label: 'OpenAI' },
  zhipu:     { label: 'z.ai (GLM)' },
  deepseek:  { label: 'DeepSeek' },
};

const MODELS = [
  // ---------- Anthropic (native web search) ----------
  { key: 'anthropic/claude-opus-4-8',   provider: 'anthropic', family: 'Opus',   model: 'claude-opus-4-8',           label: 'Claude Opus 4.8',  webSearch: true, reasoning: true },
  { key: 'anthropic/claude-sonnet-5',   provider: 'anthropic', family: 'Sonnet', model: 'claude-sonnet-5',           label: 'Claude Sonnet 5',  webSearch: true, reasoning: true },
  { key: 'anthropic/claude-haiku-4-5',  provider: 'anthropic', family: 'Haiku',  model: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5', webSearch: true, reasoning: false },
  { key: 'anthropic/claude-fable-5',    provider: 'anthropic', family: 'Fable',  model: 'claude-fable-5',            label: 'Claude Fable 5',   webSearch: true, reasoning: false },

  // ---------- OpenAI (native web search via Responses API) ----------
  { key: 'openai/gpt-5.6',        provider: 'openai', family: 'GPT-5.6', model: 'gpt-5.6',        label: 'GPT-5.6 (Sol)',   webSearch: true, reasoning: true },
  { key: 'openai/gpt-5.6-terra',  provider: 'openai', family: 'GPT-5.6', model: 'gpt-5.6-terra',  label: 'GPT-5.6 Terra',   webSearch: true, reasoning: true },
  { key: 'openai/gpt-5.6-luna',   provider: 'openai', family: 'GPT-5.6', model: 'gpt-5.6-luna',   label: 'GPT-5.6 Luna',    webSearch: true, reasoning: false },
  { key: 'openai/gpt-5.5',        provider: 'openai', family: 'GPT-5.5', model: 'gpt-5.5',        label: 'GPT-5.5',         webSearch: true, reasoning: true },
  { key: 'openai/gpt-5.4',        provider: 'openai', family: 'GPT-5.4', model: 'gpt-5.4',        label: 'GPT-5.4',         webSearch: true, reasoning: true },
  { key: 'openai/gpt-5',          provider: 'openai', family: 'GPT-5',   model: 'gpt-5',          label: 'GPT-5',           webSearch: true, reasoning: true },
  { key: 'openai/gpt-5-mini',     provider: 'openai', family: 'GPT-5',   model: 'gpt-5-mini',     label: 'GPT-5 mini',      webSearch: true, reasoning: false },
  { key: 'openai/gpt-4o-mini',    provider: 'openai', family: 'GPT-4o',  model: 'gpt-4o-mini',    label: 'GPT-4o mini',     webSearch: true, reasoning: false },

  // ---------- z.ai / GLM (native web_search via direct client) ----------
  { key: 'zhipu/glm-5.2',      provider: 'zhipu', family: 'GLM-5', model: 'glm-5.2',     label: 'GLM-5.2',      webSearch: true, reasoning: true },
  { key: 'zhipu/glm-5',        provider: 'zhipu', family: 'GLM-5', model: 'glm-5',       label: 'GLM-5',        webSearch: true, reasoning: true },
  { key: 'zhipu/glm-4.6',      provider: 'zhipu', family: 'GLM-4', model: 'glm-4.6',     label: 'GLM-4.6',      webSearch: true, reasoning: true },
  { key: 'zhipu/glm-4.5-air',  provider: 'zhipu', family: 'GLM-4', model: 'glm-4.5-air', label: 'GLM-4.5 Air',  webSearch: true, reasoning: false },

  // ---------- DeepSeek (native web search via Anthropic-compatible endpoint) ----------
  { key: 'deepseek/deepseek-v4-pro',   provider: 'deepseek', family: 'DeepSeek V4', model: 'deepseek-v4-pro',   label: 'DeepSeek V4 Pro',   webSearch: true, reasoning: true },
  { key: 'deepseek/deepseek-v4-flash', provider: 'deepseek', family: 'DeepSeek V4', model: 'deepseek-v4-flash', label: 'DeepSeek V4 Flash', webSearch: true, reasoning: false },
];

const BY_KEY = Object.fromEntries(MODELS.map(m => [m.key, m]));

// ESTIMATED prices in USD per 1,000,000 tokens: { in, out, cache }.
// `cache` = price for cached-input (prompt-cache read) tokens. These are best-effort
// public estimates and can drift — update as providers change pricing. Cost shown in
// the app is labelled "estimated". Unknown models fall back to DEFAULT_PRICE.
const DEFAULT_PRICE = { in: 1, out: 5, cache: 0.5 };
const PRICING = {
  'anthropic/claude-opus-4-8':  { in: 15,   out: 75,  cache: 1.5 },
  'anthropic/claude-sonnet-5':  { in: 3,    out: 15,  cache: 0.3 },
  'anthropic/claude-haiku-4-5': { in: 0.8,  out: 4,   cache: 0.08 },
  'anthropic/claude-fable-5':   { in: 1,    out: 5,   cache: 0.1 },
  'openai/gpt-5.6':             { in: 1.25, out: 10,  cache: 0.125 },
  'openai/gpt-5.6-terra':       { in: 1.25, out: 10,  cache: 0.125 },
  'openai/gpt-5.6-luna':        { in: 0.6,  out: 5,   cache: 0.06 },
  'openai/gpt-5.5':             { in: 1.25, out: 10,  cache: 0.125 },
  'openai/gpt-5.4':             { in: 1.25, out: 10,  cache: 0.125 },
  'openai/gpt-5':               { in: 1.25, out: 10,  cache: 0.125 },
  'openai/gpt-5-mini':          { in: 0.25, out: 2,   cache: 0.025 },
  'openai/gpt-4o-mini':         { in: 0.15, out: 0.6, cache: 0.075 },
  'zhipu/glm-5.2':              { in: 0.6,  out: 2.2, cache: 0.11 },
  'zhipu/glm-5':                { in: 0.6,  out: 2.2, cache: 0.11 },
  'zhipu/glm-4.6':              { in: 0.6,  out: 2.2, cache: 0.11 },
  'zhipu/glm-4.5-air':          { in: 0.2,  out: 1.1, cache: 0.03 },
  'deepseek/deepseek-v4-pro':   { in: 0.28, out: 0.42, cache: 0.028 },
  'deepseek/deepseek-v4-flash': { in: 0.14, out: 0.28, cache: 0.014 },
};

function priceFor(key) { return PRICING[key] || DEFAULT_PRICE; }

// Estimate USD cost from a usage object { input, output, cached }. Cached tokens are
// a subset of input priced at the cache rate; the rest of input is at the full rate.
function estimateCost(key, usage = {}) {
  const p = priceFor(key);
  const input = Math.max(0, Number(usage.input) || 0);
  const output = Math.max(0, Number(usage.output) || 0);
  const cached = Math.min(input, Math.max(0, Number(usage.cached) || 0));
  const nonCached = Math.max(0, input - cached);
  return (nonCached * p.in + cached * p.cache + output * p.out) / 1e6;
}

function getModelEntry(key) { return BY_KEY[key] || null; }
function providerLabel(provider) { return PROVIDERS[provider]?.label || provider; }
function allProviders() { return Object.keys(PROVIDERS); }

module.exports = { MODELS, PROVIDERS, getModelEntry, providerLabel, allProviders, priceFor, estimateCost };
