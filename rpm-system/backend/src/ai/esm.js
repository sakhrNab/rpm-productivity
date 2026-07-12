// The Vercel AI SDK v7 packages are ESM-only; this backend is CommonJS.
// Load them once via dynamic import() and cache the module namespaces.

let cache = null;

async function loadSdk() {
  if (!cache) {
    const [ai, anthropic, openai] = await Promise.all([
      import('ai'),
      import('@ai-sdk/anthropic'),
      import('@ai-sdk/openai'),
    ]);
    cache = { ai, anthropic, openai };
  }
  return cache;
}

module.exports = { loadSdk };
