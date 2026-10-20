// The OAuth server's state (database/migrations/2026-10-20-mcp-oauth.sql). Only hashes are stored.
const { parseScopes } = require('../mcp/scopes');
const { sha256hex, mintToken, CODE_TTL_MS, ACCESS_TTL_MS, REFRESH_TTL_MS } = require('./core');

function createStore(pool) {
  const issueTokens = async ({ clientId, userId, scope, resource }) => {
    const access = mintToken('rpm_oat'), refresh = mintToken('rpm_ort'), now = Date.now();
    await pool.query(
      `INSERT INTO oauth_tokens (access_hash, refresh_hash, client_id, user_id, scope, resource, access_expires_at, refresh_expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [sha256hex(access), sha256hex(refresh), clientId, userId, scope, resource, new Date(now + ACCESS_TTL_MS), new Date(now + REFRESH_TTL_MS)]);
    return { access_token: access, token_type: 'Bearer', expires_in: Math.floor(ACCESS_TTL_MS / 1000), refresh_token: refresh, scope };
  };
  return {
    async registerClient(name, redirectUris) {
      const clientId = mintToken('rpm_client').slice(0, 48);
      await pool.query('INSERT INTO oauth_clients (client_id, name, redirect_uris) VALUES ($1, $2, $3)', [clientId, String(name).slice(0, 80), redirectUris]);
      return clientId;
    },
    async findClient(clientId) {
      if (!clientId) return null;
      const { rows } = await pool.query('SELECT client_id, name, redirect_uris FROM oauth_clients WHERE client_id = $1', [clientId]);
      return rows[0] ? { clientId: rows[0].client_id, name: rows[0].name, redirectUris: rows[0].redirect_uris } : null;
    },
    async issueCode({ clientId, userId, redirectUri, challenge, scopes, resource }) {
      const code = mintToken('rpm_oac');
      await pool.query(
        `INSERT INTO oauth_codes (code_hash, client_id, user_id, redirect_uri, challenge, scope, resource, expires_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [sha256hex(code), clientId, userId, redirectUri, challenge, scopes.join(' '), resource, new Date(Date.now() + CODE_TTL_MS)]);
      return code;
    },
    /** Redeem a code exactly once (atomic used_at flip). A replayed code revokes what it issued. */
    async redeemCode(code) {
      const h = sha256hex(code);
      const { rows } = await pool.query(
        `UPDATE oauth_codes SET used_at = NOW() WHERE code_hash = $1 AND used_at IS NULL AND expires_at > NOW()
         RETURNING client_id, user_id, redirect_uri, challenge, scope, resource`, [h]);
      if (rows.length !== 1) {
        const { rows: used } = await pool.query('SELECT client_id, user_id, created_at FROM oauth_codes WHERE code_hash = $1 AND used_at IS NOT NULL', [h]);
        if (used[0]) await pool.query('UPDATE oauth_tokens SET revoked_at = NOW() WHERE client_id = $1 AND user_id = $2 AND created_at >= $3 AND revoked_at IS NULL', [used[0].client_id, used[0].user_id, used[0].created_at]);
        return null;
      }
      const r = rows[0];
      return { clientId: r.client_id, userId: r.user_id, redirectUri: r.redirect_uri, challenge: r.challenge, scope: r.scope, resource: r.resource };
    },
    issueTokens,
    /** Refresh-token rotation: the old grant is revoked (atomically, once) and a new one issued. */
    async rotate(refresh, clientId, resource) {
      const { rows } = await pool.query(
        `UPDATE oauth_tokens SET revoked_at = NOW()
         WHERE refresh_hash = $1 AND client_id = $2 AND resource = $3 AND revoked_at IS NULL AND refresh_expires_at > NOW()
         RETURNING user_id, scope, resource`, [sha256hex(refresh), clientId, resource]);
      return rows.length === 1 ? issueTokens({ clientId, userId: rows[0].user_id, scope: rows[0].scope, resource: rows[0].resource }) : null;
    },
    async resolveAccess(token) {
      if (typeof token !== 'string' || !token.startsWith('rpm_oat_')) return null;
      const { rows } = await pool.query('SELECT id, user_id, scope, resource FROM oauth_tokens WHERE access_hash = $1 AND revoked_at IS NULL AND access_expires_at > NOW()', [sha256hex(token)]);
      if (!rows[0]) return null;
      pool.query('UPDATE oauth_tokens SET last_used_at = NOW() WHERE id = $1', [rows[0].id]).catch(() => {});
      return { userId: rows[0].user_id, scopes: parseScopes(rows[0].scope), resource: rows[0].resource };
    },
    async revokeToken(token) {
      const h = sha256hex(token);
      await pool.query('UPDATE oauth_tokens SET revoked_at = NOW() WHERE (access_hash = $1 OR refresh_hash = $1) AND revoked_at IS NULL', [h]);
    },
    async grantsOf(userId) {
      const { rows } = await pool.query(
        `SELECT t.id, COALESCE(c.name, 'An app') AS app, t.scope, t.created_at, t.last_used_at
           FROM oauth_tokens t LEFT JOIN oauth_clients c ON c.client_id = t.client_id
          WHERE t.user_id = $1 AND t.revoked_at IS NULL AND t.refresh_expires_at > NOW() ORDER BY t.created_at DESC LIMIT 200`, [userId]);
      return rows;
    },
    async revokeGrant(userId, id) {
      const { rowCount } = await pool.query('UPDATE oauth_tokens SET revoked_at = NOW() WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL', [id, userId]);
      return rowCount > 0;
    },
  };
}

module.exports = { createStore };
