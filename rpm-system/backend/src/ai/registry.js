// Curated model registry — the single source of truth for the model picker.
// Edit here as providers ship new models. `key` is the stable id the frontend
// sends; `model` is the provider's real API model id; `webSearch` marks whether
// native web search is wired for it.

const PROVIDERS = {
  anthropic: { label: 'Claude (Anthropic)' },
  openai:    { label: 'OpenAI' },
  zhipu:     { label: 'z.ai (GLM)' },
  deepseek:  { label: 'DeepSeek' },
};

const MODELS = [
  // Anthropic — native server-side web search
  { key: 'anthropic/claude-opus-4-8',        provider: 'anthropic', model: 'claude-opus-4-8',            label: 'Claude Opus 4.8',   webSearch: true, reasoning: true },
  { key: 'anthropic/claude-sonnet-5',        provider: 'anthropic', model: 'claude-sonnet-5',            label: 'Claude Sonnet 5',   webSearch: true, reasoning: true },
  { key: 'anthropic/claude-haiku-4-5',       provider: 'anthropic', model: 'claude-haiku-4-5-20251001',  label: 'Claude Haiku 4.5',  webSearch: true, reasoning: false },

  // OpenAI — native web search via the Responses API
  { key: 'openai/gpt-5',                     provider: 'openai',    model: 'gpt-5',                       label: 'GPT-5',             webSearch: true, reasoning: true },
  { key: 'openai/gpt-5-mini',                provider: 'openai',    model: 'gpt-5-mini',                  label: 'GPT-5 mini',        webSearch: true, reasoning: false },
  { key: 'openai/gpt-4o-mini',               provider: 'openai',    model: 'gpt-4o-mini',                 label: 'GPT-4o mini',       webSearch: true, reasoning: false },

  // z.ai / GLM — native web_search tool (via direct OpenAI-compatible client)
  { key: 'zhipu/glm-4.6',                    provider: 'zhipu',     model: 'glm-4.6',                     label: 'GLM-4.6',           webSearch: true, reasoning: true },
  { key: 'zhipu/glm-4.5-air',                provider: 'zhipu',     model: 'glm-4.5-air',                 label: 'GLM-4.5 Air',       webSearch: true, reasoning: false },

  // DeepSeek — native web search via its Anthropic-compatible endpoint
  { key: 'deepseek/deepseek-chat',           provider: 'deepseek',  model: 'deepseek-chat',               label: 'DeepSeek V3',       webSearch: true, reasoning: false },
  { key: 'deepseek/deepseek-reasoner',       provider: 'deepseek',  model: 'deepseek-reasoner',           label: 'DeepSeek R1',       webSearch: true, reasoning: true },
];

const BY_KEY = Object.fromEntries(MODELS.map(m => [m.key, m]));

function getModelEntry(key) { return BY_KEY[key] || null; }
function providerLabel(provider) { return PROVIDERS[provider]?.label || provider; }
function allProviders() { return Object.keys(PROVIDERS); }

module.exports = { MODELS, PROVIDERS, getModelEntry, providerLabel, allProviders };
