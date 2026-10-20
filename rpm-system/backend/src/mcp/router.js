// The hosted MCP connector: /mcp (Streamable HTTP, stateless) plus the OAuth 2.1 authorization
// server it needs (MCP authorization spec): RFC 9728 + 8414 discovery, Dynamic Client Registration,
// PKCE S256, RFC 8707 audience, refresh rotation, revocation. RPM's browser session is a bearer JWT
// (no cookie), so consent is a frontend page (/oauth/authorize) that judges the request and posts
// the decision with that JWT — no other site can forge it.
//
// Each tool runs through RPM's own REST routes over loopback with a signed 60-second delegation
// (./delegation.js); authenticateToken checks it against the PAT allowlist like any access token.
const express = require('express');
const { handle } = require('./server');
const { MCP_SCOPES, hasScope, parseScopes, mcpScopesOfPat } = require('./scopes');
const { DELEGATION_HEADER, signDelegation } = require('./delegation');
const core = require('../oauth/core');
const { createStore } = require('../oauth/store');

function createMcpRouter({ pool, port, jwtSecret, frontendUrl, authenticateToken, verifyPat, resolveTimezone, rateLimit, securityEvent = () => {} }) {
  const store = createStore(pool);
  const r = express.Router();
  const form = express.urlencoded({ extended: false, limit: '16kb' });
  const mcpLimit = rateLimit({ name: 'mcp', windowMs: 60 * 1000, max: 120 });
  // consent and Connected apps: a signed-in browser only — never an access token or a delegation
  const browserOnly = (req, res, next) => (req.patScopes ? res.status(403).json({ error: 'This needs a signed-in browser' }) : next());

  // ── discovery ──
  const prm = () => ({ resource: core.mcpResource(), authorization_servers: [core.issuer()], scopes_supported: ['mcp:read'], bearer_methods_supported: ['header'], resource_name: 'RPM' });
  r.get(['/.well-known/oauth-protected-resource', '/.well-known/oauth-protected-resource/mcp'], (req, res) => res.json(prm()));
  r.get('/.well-known/oauth-authorization-server', (req, res) => {
    const iss = core.issuer();
    res.json({
      issuer: iss, authorization_endpoint: `${iss}/oauth/authorize`, token_endpoint: `${iss}/oauth/token`,
      registration_endpoint: `${iss}/oauth/register`, revocation_endpoint: `${iss}/oauth/revoke`,
      response_types_supported: ['code'], grant_types_supported: ['authorization_code', 'refresh_token'], code_challenge_methods_supported: ['S256'],
      token_endpoint_auth_methods_supported: ['none'], revocation_endpoint_auth_methods_supported: ['none'], scopes_supported: [...MCP_SCOPES],
      authorization_response_iss_parameter_supported: true,
    });
  });

  // ── Dynamic Client Registration (RFC 7591): public clients only, https or loopback redirects ──
  r.post('/oauth/register', async (req, res) => {
    const bad = (d) => res.status(400).json({ error: 'invalid_client_metadata', error_description: d });
    const m = req.body || {};
    const uris = m.redirect_uris;
    if (!Array.isArray(uris) || uris.length < 1 || uris.length > 10) return bad('redirect_uris: 1–10 URIs');
    if (!uris.every((u) => core.redirectUriOk(u))) return bad('redirect_uris must be https, or http to 127.0.0.1 / localhost');
    if (m.token_endpoint_auth_method && m.token_endpoint_auth_method !== 'none') return bad('only public clients (token_endpoint_auth_method "none")');
    const grants = m.grant_types ?? ['authorization_code'];
    if (!Array.isArray(grants) || !grants.every((g) => g === 'authorization_code' || g === 'refresh_token')) return bad('grant_types: authorization_code, refresh_token');
    const name = typeof m.client_name === 'string' && m.client_name.trim() ? m.client_name.trim().slice(0, 80) : 'An MCP client';
    try {
      const clientId = await store.registerClient(name, uris);
      res.status(201).json({ client_id: clientId, client_name: name, redirect_uris: uris, grant_types: grants, response_types: ['code'], token_endpoint_auth_method: 'none' });
    } catch (e) { console.error('[oauth] register:', e.message); res.status(500).json({ error: 'server_error' }); }
  });

  // ── the authorization endpoint: judged here, consent happens on the frontend ──
  r.get('/oauth/authorize', async (req, res) => {
    const p = Object.fromEntries(Object.entries(req.query).map(([k, v]) => [k, Array.isArray(v) ? '' : String(v)]));
    const j = core.judge(p, await store.findClient(p.client_id).catch(() => null));
    if (!j.ok && j.redirectable) return res.redirect(303, core.redirectWith(j.redirectUri, { error: j.error, state: j.state }));
    const q = new URLSearchParams(p).toString();
    res.redirect(303, `${frontendUrl}/oauth/authorize?${q}`);
  });
  // the consent page asks what it is showing (re-judged on the decision)
  r.get('/api/oauth/request', authenticateToken, browserOnly, async (req, res) => {
    const p = Object.fromEntries(Object.entries(req.query).map(([k, v]) => [k, String(v)]));
    const j = core.judge(p, await store.findClient(p.client_id));
    if (!j.ok) return res.status(400).json({ error: j.error, message: j.message });
    res.json({ clientName: j.req.clientName, scopes: j.req.scopes, redirectHost: new URL(j.req.redirectUri).host });
  });
  r.post('/api/oauth/consent', authenticateToken, browserOnly, async (req, res) => {
    const p = req.body?.request && typeof req.body.request === 'object' ? Object.fromEntries(Object.entries(req.body.request).map(([k, v]) => [k, String(v)])) : {};
    const j = core.judge(p, await store.findClient(p.client_id));
    if (!j.ok) return j.redirectable ? res.json({ redirect: core.redirectWith(j.redirectUri, { error: j.error, state: j.state }) }) : res.status(400).json({ error: j.error, message: j.message });
    const denied = () => res.json({ redirect: core.redirectWith(j.req.redirectUri, { error: 'access_denied', state: j.req.state }) });
    if (req.body.decision !== 'allow') return denied();
    const granted = parseScopes((Array.isArray(req.body.granted) ? req.body.granted : []).join(' ')).filter((s) => hasScope(j.req.scopes, s));
    if (!granted.length) return denied();
    const code = await store.issueCode({ clientId: j.req.clientId, userId: req.userId, redirectUri: j.req.redirectUri, challenge: j.req.challenge, scopes: granted, resource: j.req.resource });
    securityEvent('oauth_grant', { user: req.userId, ip: req.ip, reason: `${j.req.clientName}: ${granted.join(' ')}` });
    res.json({ redirect: core.redirectWith(j.req.redirectUri, { code, state: j.req.state }) });
  });

  // ── token + revoke (form-encoded, OAuth 2.1) ──
  r.post('/oauth/token', form, async (req, res) => {
    res.set('Cache-Control', 'no-store');
    const fail = (error, error_description) => res.status(400).json({ error, error_description });
    const f = req.body || {};
    const resource = f.resource;
    if (resource && resource !== core.mcpResource()) return fail('invalid_target', 'this server only issues tokens for its MCP endpoint');
    try {
      if (f.grant_type === 'authorization_code') {
        const code = await store.redeemCode(String(f.code || ''));
        if (!code || code.clientId !== f.client_id) return fail('invalid_grant', 'the code is unknown, used or expired');
        if (code.redirectUri !== f.redirect_uri) return fail('invalid_grant', 'redirect_uri does not match the authorization request');
        if (!core.pkceOk(f.code_verifier, code.challenge)) return fail('invalid_grant', 'PKCE verification failed');
        if (resource && resource !== code.resource) return fail('invalid_target', 'resource does not match the authorization request');
        return res.json(await store.issueTokens({ clientId: code.clientId, userId: code.userId, scope: code.scope, resource: code.resource }));
      }
      if (f.grant_type === 'refresh_token') {
        const t = await store.rotate(String(f.refresh_token || ''), String(f.client_id || ''), resource || core.mcpResource());
        return t ? res.json(t) : fail('invalid_grant', 'the refresh token is unknown, used, revoked or expired');
      }
      return fail('unsupported_grant_type', 'authorization_code or refresh_token');
    } catch (e) { console.error('[oauth] token:', e.message); res.status(500).json({ error: 'server_error' }); }
  });
  r.post('/oauth/revoke', form, async (req, res) => {
    try { if (req.body?.token) await store.revokeToken(String(req.body.token)); } catch (e) { console.error('[oauth] revoke:', e.message); }
    res.status(200).end();
  });

  // ── Connected apps (Settings) ──
  r.get('/api/oauth/grants', authenticateToken, browserOnly, async (req, res) => res.json({ grants: await store.grantsOf(req.userId) }));
  r.delete('/api/oauth/grants/:id', authenticateToken, browserOnly, async (req, res) =>
    (await store.revokeGrant(req.userId, req.params.id).catch(() => false)) ? res.json({ ok: true }) : res.status(404).json({ error: 'not found' }));

  // ── the MCP endpoint ──
  const challenge = (scope, error) => `Bearer resource_metadata="${core.issuer()}/.well-known/oauth-protected-resource/mcp", scope="${scope}"${error ? `, error="${error}"` : ''}`;
  async function caller(req) {
    const m = /^Bearer\s+(\S+)$/i.exec(String(req.headers.authorization || '').trim());
    if (!m) return null;
    if (m[1].startsWith('rpm_oat_')) {
      const t = await store.resolveAccess(m[1]);
      return t && t.resource === core.mcpResource() ? { userId: t.userId, scopes: t.scopes } : null;   // RFC 8707 audience
    }
    const p = await verifyPat(pool, m[1]);
    return p ? { userId: p.userId, scopes: mcpScopesOfPat(p.scopes) } : null;
  }
  r.all('/mcp', async (req, res, next) => {
    if (req.method !== 'POST') return res.set('Allow', 'POST').status(405).end();
    const origin = req.headers.origin;
    if (origin && origin !== core.issuer()) return res.status(403).json({ error: 'origin not allowed' });
    const accept = String(req.headers.accept || '');
    if (!accept.includes('application/json') || !accept.includes('text/event-stream')) {
      return res.status(406).json({ jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Accept must list application/json and text/event-stream' } });
    }
    let who = null;
    try { who = await caller(req); } catch (e) { console.error('[mcp] auth:', e.message); }
    if (!who) {
      securityEvent('access_denied', { ip: req.ip, reason: 'mcp_unauthenticated' });
      return res.status(401).set('WWW-Authenticate', challenge('mcp:read')).json({ jsonrpc: '2.0', id: null, error: { code: -32001, message: 'Sign in to RPM to use this connector' } });
    }
    req.userId = who.userId;
    next();
  }, mcpLimit, async (req, res) => {
    const msg = req.body;
    if (Array.isArray(msg)) return res.status(400).json({ jsonrpc: '2.0', id: null, error: { code: -32600, message: 'batches are not supported' } });
    const who = await caller(req);
    const tz = await resolveTimezone(pool, who.userId, msg?.params?.arguments?.timezone).catch(() => 'UTC');
    const api = async (method, path, body) => {
      const r2 = await fetch(`http://127.0.0.1:${port}${path}`, {
        method, redirect: 'manual',
        headers: { 'content-type': 'application/json', [DELEGATION_HEADER]: signDelegation(jwtSecret, who.userId, who.scopes) },
        body: body === undefined || method === 'GET' ? undefined : JSON.stringify(body),
      });
      const text = await r2.text();
      let data; try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
      if (!r2.ok) { const e = new Error(data && data.error ? String(data.error) : `HTTP ${r2.status}`); e.status = r2.status; throw e; }
      return data;
    };
    try {
      const out = await handle(msg, { scopes: who.scopes, tz, api });
      if (out.kind === 'accepted') return res.status(202).end();
      if (out.kind === 'insufficient_scope') {
        return res.status(403).set('WWW-Authenticate', challenge(out.needed, 'insufficient_scope'))
          .json({ jsonrpc: '2.0', id: out.id ?? null, error: { code: -32003, message: `This needs the ${out.needed} permission — sign in again and grant it` } });
      }
      res.json(out.body);
    } catch (e) {
      console.error('[mcp] request failed:', e.message);
      res.status(500).json({ jsonrpc: '2.0', id: msg?.id ?? null, error: { code: -32603, message: 'Internal error' } });
    }
  });
  return r;
}

module.exports = { createMcpRouter };
