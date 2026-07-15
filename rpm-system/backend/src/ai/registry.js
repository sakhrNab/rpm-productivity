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

function getModelEntry(key) { return BY_KEY[key] || null; }
function providerLabel(provider) { return PROVIDERS[provider]?.label || provider; }
function allProviders() { return Object.keys(PROVIDERS); }

module.exports = { MODELS, PROVIDERS, getModelEntry, providerLabel, allProviders };
