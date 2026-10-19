// Password reset (emailed link) and password change (Settings). Security rules, shared with the
// other apps (reply's auth-rate-limit + the SECURITY_EVENT convention) and tightened past Omni's OTP flow:
//
//   - The request answers the SAME way whether or not the email has an account (no account discovery).
//   - The token is 32 random bytes; only its SHA-256 is stored. Single use, 30 minutes, and asking again
//     voids the earlier links.
//   - Rate limits per IP and per IP + hashed account — never per account alone, so nobody can lock a
//     victim out (or spam their inbox from many IPs past the IP limit) just by naming their email.
//   - A reset or change signs out every device: refresh tokens are deleted and access tokens issued
//     before the change are refused by authenticateToken (tokenStillValid) — not left alive for an hour.
//   - The owner gets a "your password was changed" email. Security events never carry a password.
//   - Changing the password in Settings needs the current one; a stolen session alone can't set one.

const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const express = require('express');
const { rateLimit } = require('./ratelimit');
const { securityEvent } = require('./securityEvent');
const { sendPasswordReset, sendPasswordChanged } = require('./email');
const { EMAIL_RE, norm } = require('./access');

const RESET_MINUTES = 30;
const MIN_PASSWORD = 8;
const MAX_PASSWORD_BYTES = 72;   // bcrypt ignores everything past 72 bytes — refuse rather than silently truncate

const sha256 = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
const makeResetToken = () => crypto.randomBytes(32).toString('base64url');
const TOKEN_RE = /^[A-Za-z0-9_-]{40,64}$/;

/** null when acceptable, else the message to show. */
function passwordProblem(password, email = '') {
  if (typeof password !== 'string' || password.length < MIN_PASSWORD) return `Use at least ${MIN_PASSWORD} characters.`;
  if (Buffer.byteLength(password, 'utf8') > MAX_PASSWORD_BYTES) return 'That password is too long (72 bytes at most).';
  if (/^(.)\1*$/.test(password)) return 'Use more than one repeated character.';
  if (email && password.trim().toLowerCase() === String(email).trim().toLowerCase()) return "Don't use your email address as the password.";
  return null;
}

// userId → { at: ms | null, fetched: ms }. Refetched every 30 s; set at once by this module on a change.
const changedAt = new Map();
const CACHE_MS = 30 * 1000;

/** Was this access token issued after the account's last password change? (iat is in seconds.) */
async function tokenStillValid(pool, userId, iatSec) {
  let c = changedAt.get(userId);
  if (!c || Date.now() - c.fetched > CACHE_MS) {
    const { rows } = await pool.query('SELECT password_changed_at FROM users WHERE id = $1', [userId]);
    c = { at: rows[0]?.password_changed_at ? new Date(rows[0].password_changed_at).getTime() : null, fetched: Date.now() };
    changedAt.set(userId, c);
  }
  return !c.at || typeof iatSec !== 'number' || iatSec >= Math.floor(c.at / 1000);
}
const markChanged = (userId, at) => changedAt.set(userId, { at: at.getTime(), fetched: Date.now() });

const GENERIC = `If an account exists for that email, we've sent a link to reset the password. It works once and expires in ${RESET_MINUTES} minutes.`;

function createPasswordRouter({ pool, frontendUrl, authenticateToken, issueSession }) {
  const r = express.Router();
  const acctKey = (req) => `${req.ip}:${sha256(norm(req.body?.email)).slice(0, 32)}`;
  const tooMany = (name) => (req) => securityEvent('login_rate_limited', { user: req.body?.email, ip: req.ip, reason: name });
  const forgotIp = rateLimit({ name: 'pwreset-ip', windowMs: 15 * 60 * 1000, max: 10, onLimit: tooMany('password_reset') });
  const forgotAcct = rateLimit({ name: 'pwreset-acct', windowMs: 60 * 60 * 1000, max: 3, keyFn: acctKey, onLimit: tooMany('password_reset'),
    message: 'Too many reset requests for this email — check your inbox (and spam), or try again in an hour.' });
  const resetIp = rateLimit({ name: 'pwreset-use', windowMs: 15 * 60 * 1000, max: 20, onLimit: tooMany('password_reset_use') });
  const changeLimit = rateLimit({ name: 'pwchange', windowMs: 15 * 60 * 1000, max: 10, onLimit: tooMany('password_change') });

  // Ask for a link. Same answer for every email; the work (and the email) only happens for a real account.
  r.post('/forgot-password', forgotIp, forgotAcct, async (req, res) => {
    try {
      const email = norm(req.body?.email);
      if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'Enter a valid email' });
      const { rows } = await pool.query('SELECT id, email, name, disabled_at FROM users WHERE LOWER(email) = $1', [email]);
      const user = rows[0];
      if (!user || user.disabled_at) {
        securityEvent('password_reset_requested', { user: email, ip: req.ip, reason: user ? 'disabled' : 'unknown_user' });
        return res.json({ message: GENERIC });
      }
      const token = makeResetToken();
      await pool.query(`UPDATE password_resets SET used_at = NOW() WHERE user_id = $1 AND used_at IS NULL`, [user.id]);
      await pool.query(
        `INSERT INTO password_resets (user_id, token_hash, expires_at, ip) VALUES ($1, $2, NOW() + make_interval(mins => $3), $4)`,
        [user.id, sha256(token), RESET_MINUTES, String(req.ip || '').slice(0, 64)]);
      securityEvent('password_reset_requested', { user: user.email, ip: req.ip, reason: 'sent' });
      // Not awaited: the answer must not take longer (or differ) for a real account.
      sendPasswordReset({ to: user.email, name: user.name, resetUrl: `${frontendUrl}/reset-password?token=${token}`, minutes: RESET_MINUTES })
        .catch(e => console.error('reset email:', e));
      res.json({ message: GENERIC });
    } catch (error) {
      console.error('forgot-password:', error);
      res.status(500).json({ error: 'Could not start the reset — try again' });
    }
  });

  // Is this link still usable? (So the page can say so before you type a new password.)
  r.post('/reset-password/check', resetIp, async (req, res) => {
    try {
      const token = String(req.body?.token || '');
      if (!TOKEN_RE.test(token)) return res.json({ valid: false });
      const { rows } = await pool.query(
        `SELECT 1 FROM password_resets pr JOIN users u ON u.id = pr.user_id
          WHERE pr.token_hash = $1 AND pr.used_at IS NULL AND pr.expires_at > NOW() AND u.disabled_at IS NULL`, [sha256(token)]);
      res.json({ valid: rows.length > 0 });
    } catch (error) { res.status(500).json({ error: 'Failed' }); }
  });

  // Use the link: set the password, spend every open link, sign out every device.
  r.post('/reset-password', resetIp, async (req, res) => {
    const token = String(req.body?.token || '');
    const password = req.body?.password;
    const dead = () => res.status(400).json({ error: 'This reset link has expired or was already used. Ask for a new one.', code: 'invalid_token' });
    if (!TOKEN_RE.test(token)) return dead();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query(
        `SELECT pr.id, u.id AS user_id, u.email, u.name FROM password_resets pr JOIN users u ON u.id = pr.user_id
          WHERE pr.token_hash = $1 AND pr.used_at IS NULL AND pr.expires_at > NOW() AND u.disabled_at IS NULL
          FOR UPDATE OF pr`, [sha256(token)]);
      const row = rows[0];
      if (!row) { await client.query('ROLLBACK'); securityEvent('access_denied', { ip: req.ip, reason: 'reset_token_invalid' }); return dead(); }
      const problem = passwordProblem(password, row.email);
      if (problem) { await client.query('ROLLBACK'); return res.status(400).json({ error: problem, code: 'weak_password' }); }

      const hash = await bcrypt.hash(password, 12);
      const changed = await client.query(
        'UPDATE users SET password_hash = $1, password_changed_at = NOW() WHERE id = $2 RETURNING password_changed_at', [hash, row.user_id]);
      await client.query('UPDATE password_resets SET used_at = NOW() WHERE user_id = $1 AND used_at IS NULL', [row.user_id]);
      await client.query('DELETE FROM refresh_tokens WHERE user_id = $1', [row.user_id]);
      await client.query('COMMIT');
      markChanged(row.user_id, new Date(changed.rows[0].password_changed_at));

      securityEvent('password_reset_completed', { user: row.email, ip: req.ip });
      sendPasswordChanged({ to: row.email, name: row.name, appUrl: frontendUrl, how: 'reset' }).catch(e => console.error('changed email:', e));
      res.json({ success: true });
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      console.error('reset-password:', error);
      res.status(500).json({ error: 'Could not reset the password — try again' });
    } finally {
      client.release();
    }
  });

  // Change it from Settings: needs the current password; this device stays signed in, every other one is out.
  r.post('/change-password', authenticateToken, changeLimit, async (req, res) => {
    try {
      if (req.patScopes) return res.status(403).json({ error: 'This route is not available to access tokens' });
      const { currentPassword, newPassword } = req.body || {};
      const { rows } = await pool.query('SELECT id, email, name, role, avatar, password_hash FROM users WHERE id = $1', [req.userId]);
      const user = rows[0];
      if (!user) return res.status(404).json({ error: 'User not found' });
      if (!user.password_hash) {
        return res.status(400).json({ error: 'This account signs in with Google or Microsoft and has no password yet. Use “Forgot password” on the sign-in page to set one by email.', code: 'no_password' });
      }
      if (typeof currentPassword !== 'string' || !(await bcrypt.compare(currentPassword, user.password_hash))) {
        securityEvent('login_failed', { user: user.email, ip: req.ip, reason: 'change_password_bad_current' });
        return res.status(400).json({ error: 'Your current password is not right.', code: 'bad_current' });
      }
      const problem = passwordProblem(newPassword, user.email) || (newPassword === currentPassword ? 'Pick a password different from the current one.' : null);
      if (problem) return res.status(400).json({ error: problem, code: 'weak_password' });

      const hash = await bcrypt.hash(newPassword, 12);
      const changed = await pool.query(
        'UPDATE users SET password_hash = $1, password_changed_at = NOW() WHERE id = $2 RETURNING password_changed_at', [hash, user.id]);
      await pool.query('DELETE FROM refresh_tokens WHERE user_id = $1', [user.id]);
      await pool.query('UPDATE password_resets SET used_at = NOW() WHERE user_id = $1 AND used_at IS NULL', [user.id]);
      markChanged(user.id, new Date(changed.rows[0].password_changed_at));
      const tokens = await issueSession(user);   // issued after the change, so this device keeps working

      securityEvent('password_changed', { user: user.email, ip: req.ip });
      sendPasswordChanged({ to: user.email, name: user.name, appUrl: frontendUrl, how: 'settings' }).catch(e => console.error('changed email:', e));
      res.json({ success: true, ...tokens });
    } catch (error) {
      console.error('change-password:', error);
      res.status(500).json({ error: 'Could not change the password — try again' });
    }
  });

  return r;
}

module.exports = { createPasswordRouter, tokenStillValid, passwordProblem, sha256, MIN_PASSWORD, RESET_MINUTES };
