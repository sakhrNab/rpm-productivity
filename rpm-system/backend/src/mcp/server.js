// The hosted MCP endpoint's JSON-RPC handling — pure (I/O comes in through ctx), so it is tested
// without HTTP. Stateless Streamable HTTP: no Mcp-Session-Id, every answer is one JSON object.
const { TOOLS, toolByName } = require('./tools');
const { hasScope } = require('./scopes');

const SUPPORTED_VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26'];
const SERVER_INFO = { name: 'rpm', title: 'RPM', version: '1.0.0' };

const err = (id, code, message) => ({ jsonrpc: '2.0', id: id ?? null, error: { code, message } });
const ok = (id, result) => ({ jsonrpc: '2.0', id, result });
const text = (id, t, isError) => ({ kind: 'reply', body: ok(id, { content: [{ type: 'text', text: t }], ...(isError ? { isError: true } : {}) }) });
const negotiate = (asked) => (SUPPORTED_VERSIONS.includes(asked) ? asked : SUPPORTED_VERSIONS[0]);

/**
 * ctx: { scopes, tz, api(method, path, body) → parsed JSON (throws Error with .status on HTTP errors) }
 * → { kind: 'reply', body } | { kind: 'accepted' } | { kind: 'insufficient_scope', needed, id }
 */
async function handle(msg, ctx) {
  if (!msg || typeof msg !== 'object' || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') return { kind: 'reply', body: err(msg?.id, -32600, 'Invalid Request') };
  const { id, method, params } = msg;
  if (id === undefined) return { kind: 'accepted' };
  switch (method) {
    case 'initialize':
      return { kind: 'reply', body: ok(id, { protocolVersion: negotiate(params?.protocolVersion), capabilities: { tools: { listChanged: false } }, serverInfo: SERVER_INFO,
        instructions: 'RPM: outcomes, key results, RPM blocks, actions and the Business area. Writing needs the mcp:write permission; delete_action also needs confirm:true.' }) };
    case 'ping':
      return { kind: 'reply', body: ok(id, {}) };
    case 'tools/list':
      return { kind: 'reply', body: ok(id, { tools: TOOLS.map((t) => ({ name: t.name, title: t.title, description: t.description, inputSchema: t.inputSchema, annotations: t.annotations })) }) };
    case 'tools/call': {
      const t = toolByName(String(params?.name ?? ''));
      if (!t) return { kind: 'reply', body: err(id, -32602, `Unknown tool: ${String(params?.name ?? '').slice(0, 80)}`) };
      if (!hasScope(ctx.scopes, t.scope)) return { kind: 'insufficient_scope', needed: t.scope, id };
      const args = params?.arguments && typeof params.arguments === 'object' && !Array.isArray(params.arguments) ? params.arguments : {};
      const missing = (t.inputSchema.required || []).filter((k) => k !== 'confirm' && (args[k] === undefined || args[k] === null || args[k] === ''));
      if (missing.length) return text(id, `Missing: ${missing.join(', ')}`, true);
      if (t.confirm && args.confirm !== true) return text(id, `${t.name} needs confirm:true — and only after the user explicitly agreed to this exact action.`, true);
      try {
        return text(id, JSON.stringify(await t.run(args, ctx.api, ctx), null, 2));
      } catch (e) {
        return text(id, e && e.status ? `[${e.status}] ${e.message}` : `Failed: ${e?.message || e}`, true);
      }
    }
    default:
      return { kind: 'reply', body: err(id, -32601, 'Method not found') };
  }
}

module.exports = { handle, negotiate, SUPPORTED_VERSIONS, SERVER_INFO };
