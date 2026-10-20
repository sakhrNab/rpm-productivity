// The hosted MCP connector's pure parts: scopes, the signed delegation, PKCE / redirect rules, the
// authorization-request judge, and the JSON-RPC handler — plus the invariant that every tool only
// calls routes the access-token allowlist grants to the scope the tool declares.
const test = require('node:test');
const assert = require('node:assert/strict');
const { hasScope, parseScopes, patScopesOf, mcpScopesOfPat } = require('../src/mcp/scopes');
const { signDelegation, verifyDelegation } = require('../src/mcp/delegation');
const core = require('../src/oauth/core');
const { handle } = require('../src/mcp/server');
const { TOOLS } = require('../src/mcp/tools');
const { patRouteAllowed } = require('../src/pat');

const KEY = 'k'.repeat(32);
const U = '11111111-1111-4111-8111-111111111111';

test('scopes: write implies read, never the reverse; they map onto PAT scopes', () => {
  assert.ok(hasScope(['mcp:write'], 'mcp:read'));
  assert.ok(!hasScope(['mcp:read'], 'mcp:write'));
  assert.deepEqual(parseScopes('mcp:write junk mcp:read'), ['mcp:read', 'mcp:write']);
  assert.deepEqual(patScopesOf(['mcp:read']), ['read']);
  assert.deepEqual(patScopesOf(['mcp:write']), ['read', 'write']);
  assert.deepEqual(patScopesOf([]), []);
  assert.deepEqual(mcpScopesOfPat(['read']), ['mcp:read']);
  assert.deepEqual(mcpScopesOfPat(['read', 'write']), ['mcp:read', 'mcp:write']);
});

test('delegation round-trips and refuses forged, altered or expired values', () => {
  const now = Date.now();
  const d = signDelegation(KEY, U, ['mcp:read'], now);
  assert.deepEqual(verifyDelegation(KEY, d, now), { userId: U, scopes: ['mcp:read'] });
  assert.equal(verifyDelegation('x'.repeat(32), d, now), null);
  assert.equal(verifyDelegation(KEY, d.replace('mcp-read', 'mcp-write'), now), null);
  assert.equal(verifyDelegation(KEY, d, now + 120_000), null);
  assert.equal(verifyDelegation(KEY, undefined, now), null);
});

test('PKCE S256 per RFC 7636 appendix B', () => {
  assert.ok(core.pkceOk('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk', 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM'));
  assert.ok(!core.pkceOk('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXX', 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM'));
  assert.ok(!core.pkceOk('short', 'x'));
});

test('redirects: https or loopback only; a loopback one may change only its port', () => {
  assert.ok(core.redirectUriOk('https://a.example/cb'));
  assert.ok(core.redirectUriOk('http://127.0.0.1:5000/callback'));
  assert.ok(!core.redirectUriOk('http://evil.example/cb'));
  assert.ok(!core.redirectUriOk('https://a.example/cb#x'));
  const reg = ['http://127.0.0.1:5000/callback'];
  assert.ok(core.redirectMatches(reg, 'http://127.0.0.1:61234/callback'));
  assert.ok(!core.redirectMatches(reg, 'http://127.0.0.1:61234/other'));
  assert.ok(!core.redirectMatches(reg, 'http://localhost:61234/callback'));
});

test('judge: an unknown client or unregistered redirect is never redirected; the rest go back', () => {
  process.env.OAUTH_ISSUER = 'https://api.rpm.example';
  const client = { clientId: 'c1', name: 'Wavecode', redirectUris: ['http://127.0.0.1:5000/callback'] };
  const base = { client_id: 'c1', redirect_uri: 'http://127.0.0.1:7777/callback', response_type: 'code', state: 's', code_challenge_method: 'S256', code_challenge: 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM', scope: 'mcp:write' };
  assert.equal(core.judge(base, null).redirectable, false);
  assert.equal(core.judge({ ...base, redirect_uri: 'https://evil.example/cb' }, client).redirectable, false);
  assert.equal(core.judge({ ...base, code_challenge_method: 'plain' }, client).redirectable, true);
  assert.equal(core.judge({ ...base, resource: 'https://other.example/mcp' }, client).error, 'invalid_target');
  const ok = core.judge(base, client);
  assert.ok(ok.ok);
  assert.deepEqual(ok.req.scopes, ['mcp:write']);
  assert.equal(ok.req.resource, 'https://api.rpm.example/mcp');
});

test('every tool calls only routes the token allowlist grants to its declared scope', async () => {
  const sample = { project_id: U, action_id: U, key_result_id: U, lead_id: U, block_id: U, category_id: U, depends_on_action_id: U,
    table: 'leads', fields: { name: 'x' }, title: 't', name: 'n', result: 'r', purpose: 'p', target_value: 1, type: 'note', confirm: true, text: 'x', ref: 'r1' };
  for (const t of TOOLS) {
    const calls = [];
    const api = async (method, path) => { calls.push([method, path]); return []; };
    await t.run(sample, api, { tz: 'Europe/Berlin' });
    assert.ok(calls.length > 0, t.name);
    const pats = patScopesOf([t.scope]);
    for (const [m, p] of calls) assert.ok(patRouteAllowed(m, p, pats), `${t.name}: ${m} ${p} with ${pats}`);
    if (t.scope === 'mcp:write') assert.ok(calls.some(([m, p]) => !patRouteAllowed(m, p, ['read'])), `${t.name} is declared write but only reads`);
  }
});

test('the handler: read-only cannot write, delete needs confirm, tool errors carry the status', async () => {
  const seen = [];
  const ctx = (scopes) => ({ scopes, tz: 'UTC', api: async (m, p) => { seen.push([m, p]); return { ok: true }; } });
  const list = await handle({ jsonrpc: '2.0', id: 1, method: 'tools/list' }, ctx(['mcp:read']));
  assert.equal(list.body.result.tools.length, TOOLS.length);
  assert.deepEqual(await handle({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'add_action', arguments: { title: 'x' } } }, ctx(['mcp:read'])),
    { kind: 'insufficient_scope', needed: 'mcp:write', id: 2 });
  const noConfirm = await handle({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'delete_action', arguments: { action_id: U } } }, ctx(['mcp:write']));
  assert.equal(noConfirm.body.result.isError, true);
  assert.equal(seen.length, 0);
  const failing = { scopes: ['mcp:read'], tz: 'UTC', api: async () => { const e = new Error('nope'); e.status = 403; throw e; } };
  const r = await handle({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'goal_forecast' } }, failing);
  assert.equal(r.body.result.isError, true);
  assert.match(r.body.result.content[0].text, /^\[403\]/);
  assert.deepEqual(await handle({ jsonrpc: '2.0', method: 'notifications/initialized' }, ctx([])), { kind: 'accepted' });
});
