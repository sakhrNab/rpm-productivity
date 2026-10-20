// What a hosted-MCP credential may do. The connector's two scopes map onto the personal-access-token
// scopes RPM already enforces (pat.js patRouteAllowed — an allowlist, deny by default):
//   mcp:read  → read          outcomes, actions, blocks, key results, forecast, Business tables
//   mcp:write → read + write  add/edit/complete/delete actions, outcomes, key results, Business rows
// AI, email, notifications, settings and token routes stay unreachable whatever is granted.
const MCP_SCOPES = ['mcp:read', 'mcp:write'];
const RANK = { 'mcp:read': 1, 'mcp:write': 2 };

const isScope = (s) => MCP_SCOPES.includes(s);
const parseScopes = (s) => {
  const got = new Set(String(s || '').split(/\s+/).filter(isScope));
  return MCP_SCOPES.filter((x) => got.has(x));
};
const hasScope = (granted, needed) => granted.some((g) => RANK[g] >= RANK[needed]);

/** The PAT scopes a delegated request carries into pat.patRouteAllowed. */
const patScopesOf = (scopes) => (hasScope(scopes, 'mcp:write') ? ['read', 'write'] : hasScope(scopes, 'mcp:read') ? ['read'] : []);
/** A personal access token used at /mcp: its read/write scopes as connector scopes. */
const mcpScopesOfPat = (patScopes = []) => (patScopes.includes('write') ? ['mcp:read', 'mcp:write'] : patScopes.includes('read') ? ['mcp:read'] : []);

module.exports = { MCP_SCOPES, isScope, parseScopes, hasScope, patScopesOf, mcpScopesOfPat };
