// Tiny in-memory fixed-window rate limiter (single backend instance). Keys by the
// authenticated user when present, else by client IP (app sets trust proxy).
// `onLimit(req)` (optional) is told about every rejected request, e.g. to write a security event.
function rateLimit({ windowMs, max, name, message = 'Too many requests — slow down and try again shortly.', onLimit }) {
  const hits = new Map();
  setInterval(() => {
    const now = Date.now();
    for (const [k, v] of hits) if (v.reset <= now) hits.delete(k);
  }, Math.max(windowMs, 60000)).unref();
  return (req, res, next) => {
    const key = `${name}:${req.userId || req.ip}`;
    const now = Date.now();
    let h = hits.get(key);
    if (!h || h.reset <= now) { h = { count: 0, reset: now + windowMs }; hits.set(key, h); }
    h.count++;
    if (h.count > max) {
      if (onLimit) { try { onLimit(req); } catch { /* reporting must never break the 429 */ } }
      res.set('Retry-After', String(Math.ceil((h.reset - now) / 1000)));
      return res.status(429).json({ error: message });
    }
    next();
  };
}
module.exports = { rateLimit };
