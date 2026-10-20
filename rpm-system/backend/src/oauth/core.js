// The pure parts of RPM's OAuth 2.1 authorization server (for the hosted MCP endpoint /mcp):
// issuer/resource names, PKCE S256, redirect-URI rules, judging an authorization request, and
// opaque-token minting + hashing (tokens are random and stored only as sha256 hashes).
const crypto = require('crypto');
const { parseScopes } = require('../mcp/scopes');

/** The public API origin, from OAUTH_ISSUER or BACKEND_URL — never from a request's Host header. */
const issuer = () => new URL(process.env.OAUTH_ISSUER || process.env.BACKEND_URL || 'http://localhost:3013').origin;
/** The MCP endpoint — the RFC 8707 resource every token is bound to. */
const mcpResource = (iss = issuer()) => `${iss}/mcp`;

const sha256hex = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
const mintToken = (prefix) => `${prefix}_${crypto.randomBytes(32).toString('base64url')}`;
const CODE_TTL_MS = 5 * 60_000, ACCESS_TTL_MS = 60 * 60_000, REFRESH_TTL_MS = 60 * 24 * 60 * 60_000;

/** PKCE S256 (RFC 7636): BASE64URL(SHA256(verifier)) === challenge; verifier 43–128 unreserved chars. */
function pkceOk(verifier, challenge) {
  if (!verifier || !/^[A-Za-z0-9\-._~]{43,128}$/.test(verifier)) return false;
  const want = Buffer.from(crypto.createHash('sha256').update(verifier).digest('base64url'));
  const got = Buffer.from(String(challenge || ''));
  return want.length === got.length && crypto.timingSafeEqual(want, got);
}

const LOOPBACK = ['127.0.0.1', '[::1]', 'localhost'];
/** A redirect a client may register: https, or http to loopback only (RFC 8252 §7.3). */
function redirectUriOk(uri) {
  if (typeof uri !== 'string' || uri.length > 512) return false;
  let u; try { u = new URL(uri); } catch { return false; }
  if (u.hash || u.username || u.password) return false;
  return u.protocol === 'https:' || (u.protocol === 'http:' && LOOPBACK.includes(u.hostname));
}
/** Exact match, except a loopback redirect may use any port (path and query still exact). */
function redirectMatches(registered, asked) {
  if (registered.includes(asked)) return true;
  let a; try { a = new URL(asked); } catch { return false; }
  if (a.protocol !== 'http:' || !LOOPBACK.includes(a.hostname)) return false;
  return registered.some((r) => { try { const u = new URL(r); return u.protocol === 'http:' && u.hostname === a.hostname && u.pathname === a.pathname && u.search === a.search; } catch { return false; } });
}

/**
 * Judge an authorization request (the consent page shows it, the decision re-checks it). Errors that
 * make the redirect itself untrustworthy (unknown client, unregistered redirect) are never redirected.
 */
function judge(p, client) {
  if (!client) return { ok: false, redirectable: false, error: 'invalid_client', message: 'This app is not registered with RPM.' };
  const redirectUri = p.redirect_uri || '';
  if (!redirectUri || !redirectMatches(client.redirectUris, redirectUri)) return { ok: false, redirectable: false, error: 'invalid_request', message: 'This app asked to send you to an address it never registered.' };
  const back = (error, message) => ({ ok: false, redirectable: true, error, message, redirectUri, state: p.state });
  if (p.response_type !== 'code') return back('unsupported_response_type', 'Only response_type=code is supported.');
  if (!p.state || p.state.length > 512) return back('invalid_request', 'The request carries no state.');
  if (p.code_challenge_method !== 'S256' || !/^[A-Za-z0-9_-]{43}$/.test(p.code_challenge || '')) return back('invalid_request', 'PKCE with S256 is required.');
  const resource = p.resource || mcpResource();
  if (resource !== mcpResource()) return back('invalid_target', 'This server only grants access to its MCP endpoint.');
  const asked = parseScopes(p.scope);
  return { ok: true, req: { clientId: client.clientId, clientName: client.name, redirectUri, state: p.state, challenge: p.code_challenge, scopes: asked.length ? asked : ['mcp:read'], resource } };
}

/** redirect_uri + code/error + state + iss (RFC 9207). */
function redirectWith(redirectUri, params, iss = issuer()) {
  const u = new URL(redirectUri);
  for (const [k, v] of Object.entries({ ...params, iss })) if (v !== undefined) u.searchParams.set(k, v);
  return u.toString();
}

module.exports = { issuer, mcpResource, sha256hex, mintToken, pkceOk, redirectUriOk, redirectMatches, judge, redirectWith, CODE_TTL_MS, ACCESS_TTL_MS, REFRESH_TTL_MS };
