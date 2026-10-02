// Which model will read an attached photo? Mirrors the server (backend/src/ai/vision.js pickReader):
// the chosen model if it can see, else the first vision model in the server's fallback order whose
// provider has a key. `photoReaders` comes from GET /api/ai/models, so the order is never duplicated.
export function photoReader(models, configured, modelKey, photoReaders = []) {
  const byKey = Object.fromEntries(models.map(m => [m.key, m]));
  const order = [modelKey, ...photoReaders, ...models.filter(m => m.vision).map(m => m.key)];
  for (const key of order) {
    const m = byKey[key];
    if (m && m.vision && configured.has(m.provider)) return m;
  }
  return null;
}
