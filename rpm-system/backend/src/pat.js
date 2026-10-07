// Personal access tokens (PATs): let Claude (rpm-mcp) and the revenue dashboard call the API
// without a browser session. Only the sha256 of a token is stored; the plaintext is shown once.
//
// A PAT can reach a fixed allowlist of routes. Anything that spends AI credit, sends email or
// messages, changes settings, or manages tokens is refused even with the `write` scope.

const crypto = require('crypto');

const PREFIX = 'rpm_pat_';

const generatePat = () => PREFIX + crypto.randomBytes(32).toString('base64url');
const hashPat = (token) => crypto.createHash('sha256').update(String(token)).digest('hex');
const isPat = (token) => typeof token === 'string' && token.startsWith(PREFIX);

// Path prefixes a PAT may use. Writes additionally need the `write` scope.
const ALLOWED = [
  '/api/projects', '/api/actions', '/api/blocks', '/api/key-results', '/api/capture-items',
  '/api/categories', '/api/planner', '/api/forecast', '/api/roadmap', '/api/capacity',
];
// Never reachable with a PAT (checked before ALLOWED).
const DENIED = [
  '/api/ai', '/api/coaches', '/api/persons', '/api/leverage-requests', '/api/telegram',
  '/api/notifications', '/api/push', '/api/settings', '/api/upload', '/api/pat',
];

const startsWithSegment = (path, prefix) => path === prefix || path.startsWith(prefix + '/');

function patRouteAllowed(method, path, scopes = []) {
  const p = String(path || '').split('?')[0].replace(/\/+$/, '') || '/';
  const m = String(method || 'GET').toUpperCase();
  if (p === '/api/auth/me') return m === 'GET';
  if (DENIED.some((d) => startsWithSegment(p, d))) return false;
  if (!ALLOWED.some((a) => startsWithSegment(p, a))) return false;
  // Cascade deletes stay browser-only.
  if (m === 'DELETE' && (/^\/api\/categories\/[^/]+$/.test(p) || /^\/api\/projects\/[^/]+$/.test(p))) return false;
  if (startsWithSegment(p, '/api/categories') && m !== 'GET') return false;
  if (m === 'GET' || m === 'HEAD') return scopes.includes('read') || scopes.includes('write');
  return scopes.includes('write');
}

// Returns { userId, scopes, id } or null.
async function verifyPat(pool, token) {
  if (!isPat(token)) return null;
  const { rows } = await pool.query(
    `SELECT id, user_id, scopes FROM personal_access_tokens
      WHERE token_hash = $1 AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at > NOW())`,
    [hashPat(token)]
  );
  if (!rows.length) return null;
  pool.query('UPDATE personal_access_tokens SET last_used_at = NOW() WHERE id = $1', [rows[0].id]).catch(() => {});
  return { id: rows[0].id, userId: rows[0].user_id, scopes: rows[0].scopes || [] };
}

module.exports = { PREFIX, generatePat, hashPat, isPat, patRouteAllowed, verifyPat };
