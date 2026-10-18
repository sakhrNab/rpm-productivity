// Who may spend the owner's money / create accounts. Both are closed unless named, so a stranger who
// finds the sign-up form can't burn the server-side AI keys or relay email.
//
//   SERVER_KEY_EMAILS     comma list of accounts allowed to fall back to the server's ANTHROPIC/OPENAI/
//                         DEEPSEEK/ZHIPU keys. Unset = nobody (everyone brings their own key in Settings).
//   REGISTRATION_EMAILS   comma list of emails that may create an account (legacy; invites replace it).
//   REGISTRATION_OPEN     "true" re-opens public sign-up (not recommended while server keys/SMTP exist).
//
// Beyond the env, an account can be created through the database (see findAdmission):
//   an invite link (token) · a pending invite for that email · a registration code · the very first account.
// An access request the admin approves becomes an invite. Existing accounts are never affected.

const crypto = require('crypto');

const parse = (v) => String(v || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
const norm = (e) => String(e || '').trim().toLowerCase();

const canUseServerKeys = (email) => parse(process.env.SERVER_KEY_EMAILS).includes(norm(email));
const registrationAllowed = (email) =>
  String(process.env.REGISTRATION_OPEN || '').toLowerCase() === 'true' || parse(process.env.REGISTRATION_EMAILS).includes(norm(email));

const INVITE_DAYS = 30;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

// RPM-7K4Q-M2XD: no 0/O/1/I/L, so a code read aloud or retyped from a screenshot still works.
const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
function makeCode() {
  const pick = () => Array.from(crypto.randomBytes(4), b => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
  return `RPM-${pick()}-${pick()}`;
}
const normCode = (c) => String(c || '').trim().toUpperCase().replace(/\s+/g, '');
const makeInviteToken = () => crypto.randomBytes(24).toString('hex');

const LIVE_INVITE = `status = 'pending' AND (expires_at IS NULL OR expires_at > NOW())`;
const LIVE_CODE = `revoked_at IS NULL AND uses < max_uses AND (expires_at IS NULL OR expires_at > NOW())`;

/** The invite behind a link, if it can still be used. */
async function inviteByToken(db, token) {
  if (!token || typeof token !== 'string' || !/^[0-9a-f]{16,64}$/i.test(token)) return null;
  const { rows } = await db.query(
    `SELECT i.id, i.email, i.name, u.name AS inviter_name FROM invitations i
       LEFT JOIN users u ON u.id = i.inviter_user_id
      WHERE i.token = $1 AND i.status = 'pending' AND (i.expires_at IS NULL OR i.expires_at > NOW())`, [token]);
  return rows[0] || null;
}

async function codeByValue(db, code) {
  const c = normCode(code);
  if (!c || c.length > 40) return null;
  const { rows } = await db.query(`SELECT id FROM registration_codes WHERE UPPER(code) = $1 AND ${LIVE_CODE}`, [c]);
  return rows[0] || null;
}

/** May this email create an account? → { ok: true, via, invitationId?, codeId? } | { ok: false, reason }.
 *  reason: invite_invalid | code_invalid | invite_required. Reads only; createAccount claims. */
async function findAdmission(db, { email, invite, code }) {
  const e = norm(email);
  if (invite) {
    const inv = await inviteByToken(db, invite);
    if (inv) return { ok: true, via: 'invite', invitationId: inv.id };
  }
  if (code) {
    const c = await codeByValue(db, code);
    if (c) return { ok: true, via: 'code', codeId: c.id };
  }
  const pending = await db.query(`SELECT id FROM invitations WHERE LOWER(email) = $1 AND ${LIVE_INVITE} LIMIT 1`, [e]);
  if (pending.rows[0]) return { ok: true, via: 'invite', invitationId: pending.rows[0].id };
  if (registrationAllowed(e)) return { ok: true, via: 'allowlist' };
  const any = await db.query('SELECT 1 FROM users LIMIT 1');
  if (!any.rows.length) return { ok: true, via: 'bootstrap' };
  if (invite) return { ok: false, reason: 'invite_invalid' };
  if (code) return { ok: false, reason: 'code_invalid' };
  return { ok: false, reason: 'invite_required' };
}

const DENIED_MESSAGES = {
  invite_invalid: 'This invite link has expired or was already used. Ask for a new one, or request access below.',
  code_invalid: "That registration code isn't valid — it may be used up, expired or revoked.",
  invite_required: 'RPM is invite-only. Enter a registration code, use your invite link, or request access.',
};

class AdmissionDenied extends Error {
  constructor(reason) { super(DENIED_MESSAGES[reason] || DENIED_MESSAGES.invite_required); this.reason = reason; }
}

/** Create an account if admission allows it, all in one transaction: the user row, the claimed invite/code,
 *  the default categories, and links from contacts that already have this email ("own account + linked").
 *  Throws AdmissionDenied when not allowed. Returns the new user row. */
async function createAccount(pool, { email, name, passwordHash = null, provider = 'local', providerId = null, avatar = '', emailVerified = false, invite, code }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const adm = await findAdmission(client, { email, invite, code });
    if (!adm.ok) throw new AdmissionDenied(adm.reason);

    if (adm.via === 'code') {
      const claimed = await client.query(`UPDATE registration_codes SET uses = uses + 1 WHERE id = $1 AND ${LIVE_CODE} RETURNING id`, [adm.codeId]);
      if (!claimed.rows.length) throw new AdmissionDenied('code_invalid');   // used up between check and claim
    }
    const role = adm.via === 'bootstrap' ? 'admin' : 'member';
    const { rows } = await client.query(
      `INSERT INTO users (email, password_hash, name, avatar, provider, provider_id, email_verified, role, joined_via, registration_code_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id, email, name, avatar, role`,
      [String(email).trim(), passwordHash, name, avatar || '', provider, providerId, emailVerified, role, adm.via, adm.codeId || null]
    );
    const user = rows[0];

    // Every pending invite for this email is now spent — including the one the link pointed at.
    await client.query(
      `UPDATE invitations SET status = 'accepted', accepted_at = NOW(), accepted_user_id = $1
        WHERE status = 'pending' AND (id = $2 OR LOWER(email) = $3)`,
      [user.id, adm.invitationId || null, norm(email)]
    );
    await client.query(`UPDATE access_requests SET status = 'approved', reviewed_at = COALESCE(reviewed_at, NOW())
                         WHERE status = 'pending' AND LOWER(email) = $1`, [norm(email)]);
    await client.query(`UPDATE persons SET member_user_id = $1 WHERE member_user_id IS NULL AND LOWER(email) = $2`, [user.id, norm(email)]);
    await client.query('SELECT create_default_categories_for_user($1)', [user.id]);
    await client.query('COMMIT');
    return { user, via: adm.via };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/** The invite/code a social sign-up carries through the provider round-trip (OAuth `state`). */
const encodeSignupState = ({ invite, code } = {}) => {
  const s = {};
  if (invite) s.i = String(invite).slice(0, 64);
  if (code) s.c = normCode(code).slice(0, 40);
  return Object.keys(s).length ? Buffer.from(JSON.stringify(s)).toString('base64url') : undefined;
};
const decodeSignupState = (state) => {
  try {
    const s = JSON.parse(Buffer.from(String(state || ''), 'base64url').toString('utf8'));
    return { invite: typeof s.i === 'string' ? s.i : undefined, code: typeof s.c === 'string' ? s.c : undefined };
  } catch { return {}; }
};

async function isAdmin(db, userId) {
  const { rows } = await db.query('SELECT role, disabled_at FROM users WHERE id = $1', [userId]);
  return rows[0]?.role === 'admin' && !rows[0].disabled_at;
}

module.exports = {
  canUseServerKeys, registrationAllowed, findAdmission, createAccount, AdmissionDenied, inviteByToken, isAdmin,
  makeCode, normCode, makeInviteToken, encodeSignupState, decodeSignupState, INVITE_DAYS, EMAIL_RE, norm,
};
