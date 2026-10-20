// The hosted MCP endpoint (/mcp) runs each tool by calling RPM's own REST routes over loopback, so
// ownership checks and the PAT route allowlist apply unchanged. It never forwards the caller's OAuth
// token (its audience is /mcp; the MCP authorization spec forbids token passthrough) — it signs a
// 60-second delegation instead:
//   x-rpm-mcp-delegation: v1.<userId>.<scopes "+"-joined>.<expiresAtMs>.<hmac>
// HMAC-SHA256 under a key derived from JWT_SECRET. authenticateToken accepts it and treats the
// request exactly like a personal access token with the matching scopes.
const crypto = require('crypto');
const { parseScopes } = require('./scopes');

const DELEGATION_HEADER = 'x-rpm-mcp-delegation';
const TTL_MS = 60_000;

const keyFrom = (secret) => crypto.createHmac('sha256', String(secret)).update('rpm-mcp-delegation/v1').digest();
const safe = (v) => /^[A-Za-z0-9_-]{1,128}$/.test(v);
const mac = (body, key) => crypto.createHmac('sha256', key).update(body).digest('base64url');

function signDelegation(secret, userId, scopes, now = Date.now()) {
  if (!safe(userId)) throw new Error('bad delegation subject');
  const body = ['v1', userId, scopes.map((s) => s.replace(':', '-')).join('+') || 'none', String(now + TTL_MS)].join('.');
  return `${body}.${mac(body, keyFrom(secret))}`;
}

/** null for anything not signed by us, expired, or malformed. Constant-time signature compare. */
function verifyDelegation(secret, value, now = Date.now()) {
  if (!value || typeof value !== 'string' || value.length > 600) return null;
  const parts = value.split('.');
  if (parts.length !== 5 || parts[0] !== 'v1') return null;
  const [, userId, scopes, exp, sig] = parts;
  const want = Buffer.from(mac(parts.slice(0, 4).join('.'), keyFrom(secret)));
  const got = Buffer.from(sig);
  if (want.length !== got.length || !crypto.timingSafeEqual(want, got)) return null;
  const e = Number(exp);
  if (!Number.isFinite(e) || e < now || e > now + TTL_MS + 5_000) return null;
  if (!safe(userId)) return null;
  return { userId, scopes: parseScopes(scopes.split('+').map((s) => s.replace('-', ':')).join(' ')) };
}

module.exports = { DELEGATION_HEADER, signDelegation, verifyDelegation };
