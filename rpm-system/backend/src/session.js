// Browser sign-in sessions: refresh-token rotation and logout (POST /api/auth/refresh, /api/auth/logout).
//
// Why this is its own module (2026-10-22): a real user's expired session produced bursts of 401s and CrowdSec's
// 401 brute-force rule banned them for 7 days. Two server-side causes, both fixed here:
//   1. logout demanded a valid ACCESS token, but the app logs out exactly when its access token has expired, so
//      every such logout was a 401. Logout now needs only the refresh token and always answers 204.
//   2. refresh rotates (old refresh token out, new one in). Two tabs share one stored token; the second tab to
//      present it got a 401 and signed the user out everywhere. A rotated token now stays usable for a short grace
//      window and answers with the SAME successor refresh token (plus a freshly signed access token) instead.
//
// Revocation is unchanged: a password change/reset, an admin disable and a logout DELETE the rows, rotated ones
// included, so nothing in the grace window survives them. A rotated token presented after the window gets a plain
// 401 (there is no token-family concept to revoke).
//
// Works before the 2026-10-22 migration too: if the new columns are missing it falls back to the old
// delete-and-insert rotation (no grace window) instead of failing every refresh.

const express = require('express');
const jwt = require('jsonwebtoken');

const REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const REUSE_GRACE_SEC = 60;

const SQL = {
  find: `SELECT id, token, rotated_at, successor_token,
           (rotated_at IS NOT NULL AND rotated_at > NOW() - make_interval(secs => $3)) AS in_grace
         FROM refresh_tokens WHERE token = $1 AND user_id = $2 AND expires_at > NOW()`,
  user: 'SELECT * FROM users WHERE id = $1',
  insert: 'INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)',
  // Only one concurrent refresh of the same token may win; the loser takes the grace path.
  rotate: 'UPDATE refresh_tokens SET rotated_at = NOW(), successor_token = $2 WHERE id = $1 AND rotated_at IS NULL RETURNING id',
  dropToken: 'DELETE FROM refresh_tokens WHERE token = $1',
  // Rotated rows are only needed for the grace window; tidy this user's old ones on each rotation.
  prune: 'DELETE FROM refresh_tokens WHERE user_id = $1 AND rotated_at < NOW() - make_interval(secs => $2)',
  logout: 'DELETE FROM refresh_tokens WHERE token = $1 AND user_id = $2 RETURNING successor_token',
  logoutSuccessor: 'DELETE FROM refresh_tokens WHERE token = $1 AND user_id = $2',
  // Before the migration (no rotated_at / successor_token columns).
  legacyFind: 'SELECT id FROM refresh_tokens WHERE token = $1 AND user_id = $2 AND expires_at > NOW()',
  legacyLogout: 'DELETE FROM refresh_tokens WHERE token = $1 AND user_id = $2',
};

const UNDEFINED_COLUMN = '42703';

function createSessionRouter({ pool, generateTokens, refreshSecret, graceSec = REUSE_GRACE_SEC }) {
  const r = express.Router();
  let legacy = false;   // set once the new columns turn out to be missing

  const deny = (res, error) => res.status(401).json({ error });

  async function refreshNew(res, token, userId, user, attempt = 0) {
    const { rows } = await pool.query(SQL.find, [token, userId, graceSec]);
    const row = rows[0];
    if (!row) return deny(res, 'Refresh token expired or invalid');

    if (row.rotated_at) {
      if (!row.in_grace) return deny(res, 'Refresh token expired or invalid');
      // Another tab (or a parallel request) rotated it moments ago: hand back the same successor.
      let next = row.successor_token;
      for (let hop = 0; next && hop < 5; hop++) {
        const s = (await pool.query(SQL.find, [next, userId, graceSec])).rows[0];
        if (!s) break;
        if (!s.rotated_at) return res.json({ accessToken: generateTokens(user).accessToken, refreshToken: s.token });
        if (!s.in_grace) break;
        next = s.successor_token;
      }
      return deny(res, 'Refresh token expired or invalid');
    }

    const tokens = generateTokens(user);
    await pool.query(SQL.insert, [userId, tokens.refreshToken, new Date(Date.now() + REFRESH_TTL_MS)]);
    const won = await pool.query(SQL.rotate, [row.id, tokens.refreshToken]);
    if (won.rows.length === 0) {
      // Lost the race to a concurrent refresh of the same token: drop ours, answer with the winner's.
      await pool.query(SQL.dropToken, [tokens.refreshToken]);
      if (attempt > 0) return deny(res, 'Refresh token expired or invalid');
      return refreshNew(res, token, userId, user, attempt + 1);
    }
    await pool.query(SQL.prune, [userId, graceSec]).catch((e) => console.error('refresh prune:', e.message));
    return res.json(tokens);
  }

  async function refreshLegacy(res, token, userId, user) {
    const { rows } = await pool.query(SQL.legacyFind, [token, userId]);
    if (rows.length === 0) return deny(res, 'Refresh token expired or invalid');
    const tokens = generateTokens(user);
    await pool.query(SQL.dropToken, [token]);
    await pool.query(SQL.insert, [userId, tokens.refreshToken, new Date(Date.now() + REFRESH_TTL_MS)]);
    return res.json(tokens);
  }

  r.post('/refresh', async (req, res) => {
    try {
      const token = req.body?.refreshToken;
      if (!token || typeof token !== 'string') return res.status(400).json({ error: 'Refresh token required' });
      let decoded;
      try { decoded = jwt.verify(token, refreshSecret); } catch { return deny(res, 'Invalid refresh token'); }

      const userResult = await pool.query(SQL.user, [decoded.userId]);
      const user = userResult.rows[0];
      if (!user) return deny(res, 'User not found');
      if (user.disabled_at) return deny(res, 'Account disabled');

      if (!legacy) {
        try { return await refreshNew(res, token, decoded.userId, user); }
        catch (e) {
          if (e.code !== UNDEFINED_COLUMN) throw e;
          legacy = true;
          console.error('refresh: refresh_tokens has no rotated_at/successor_token yet (run 2026-10-22-refresh-grace.sql); no reuse grace until then');
        }
      }
      return await refreshLegacy(res, token, decoded.userId, user);
    } catch (error) {
      console.error('Refresh error:', error);
      res.status(500).json({ error: 'Token refresh failed' });
    }
  });

  // Logout needs only the refresh token being given up (the access token has usually expired by now).
  // Always 204: it reveals nothing about whether the token existed, and deleting a token you hold is harmless.
  // A token that isn't ours (bad signature) never reaches the database.
  r.post('/logout', async (req, res) => {
    const token = req.body?.refreshToken;
    let decoded = null;
    if (token && typeof token === 'string') {
      try { decoded = jwt.verify(token, refreshSecret, { ignoreExpiration: true }); } catch { decoded = null; }
    }
    if (decoded?.userId) {
      try {
        if (!legacy) {
          try {
            const { rows } = await pool.query(SQL.logout, [token, decoded.userId]);
            // A rotated token still in its grace window could fetch its successor: that goes too.
            for (const { successor_token: s } of rows) if (s) await pool.query(SQL.logoutSuccessor, [s, decoded.userId]);
          } catch (e) {
            if (e.code !== UNDEFINED_COLUMN) throw e;
            legacy = true;
            await pool.query(SQL.legacyLogout, [token, decoded.userId]);
          }
        } else {
          await pool.query(SQL.legacyLogout, [token, decoded.userId]);
        }
      } catch (e) { console.error('Logout error:', e.message); }
    }
    res.status(204).end();
  });

  return r;
}

module.exports = { createSessionRouter, SQL, REUSE_GRACE_SEC, REFRESH_TTL_MS };
