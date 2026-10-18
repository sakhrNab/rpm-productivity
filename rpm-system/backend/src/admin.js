// Admin dashboard API, mounted at /api/admin behind authenticateToken + requireAdmin.
// Who gets in (access requests, invites, registration codes), who is in (members: role, disable), and
// what happened (the security log). Admin = users.role 'admin' in the database.
//
// createInvite is also used by "add a person" in index.js, so every invite — from a contact, the admin,
// or an approved request — is the same row, the same link (/register?invite=…) and the same email.

const express = require('express');
const { sendInvitation } = require('./email');
const { isAdmin, makeCode, makeInviteToken, norm, EMAIL_RE, INVITE_DAYS } = require('./access');
const { securityEvent } = require('./securityEvent');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Issue (and email) an invite. → { status: sent | send_failed | already_invited | already_member, id?, joinUrl? } */
async function createInvite(pool, { email, name = '', inviterId = null, source = 'person', frontendUrl }) {
  const e = norm(email);
  const member = await pool.query('SELECT id FROM users WHERE LOWER(email) = $1', [e]);
  if (member.rows.length) return { status: 'already_member', userId: member.rows[0].id };
  // An expired invite must not block a fresh one (one pending invite per email).
  await pool.query(`UPDATE invitations SET status = 'expired' WHERE status = 'pending' AND expires_at <= NOW() AND LOWER(email) = $1`, [e]);
  const ins = await pool.query(
    `INSERT INTO invitations (inviter_user_id, email, name, token, source, status, expires_at)
     VALUES ($1, $2, $3, $4, $5, 'pending', NOW() + make_interval(days => $6))
     ON CONFLICT (LOWER(email)) WHERE status = 'pending' DO NOTHING RETURNING id, token`,
    [inviterId, e, String(name || '').slice(0, 100), makeInviteToken(), source, INVITE_DAYS]
  );
  if (!ins.rows.length) return { status: 'already_invited' };
  const { id, token } = ins.rows[0];
  return { ...(await sendInviteEmail(pool, id, frontendUrl)), id };
}

async function sendInviteEmail(pool, invitationId, frontendUrl) {
  const { rows } = await pool.query(
    `SELECT i.email, i.name, i.token, i.source, u.name AS inviter_name FROM invitations i
       LEFT JOIN users u ON u.id = i.inviter_user_id WHERE i.id = $1`, [invitationId]);
  const inv = rows[0];
  const joinUrl = `${frontendUrl}/register?invite=${inv.token}`;
  // sendInvitation never throws — it returns { sent: boolean }.
  const result = await sendInvitation({ to: inv.email, recipientName: inv.name, inviterName: inv.inviter_name, joinUrl, source: inv.source });
  if (result?.sent) await pool.query('UPDATE invitations SET sent_at = NOW() WHERE id = $1', [invitationId]);
  return { status: result?.sent ? 'sent' : 'send_failed', joinUrl };
}

const requireAdmin = (pool) => async (req, res, next) => {
  if (req.patScopes) return res.status(403).json({ error: 'This route is not available to access tokens' });
  try {
    if (await isAdmin(pool, req.userId)) return next();
    securityEvent('access_denied', { user: req.userId, ip: req.ip, reason: 'admin_route' });
    return res.status(403).json({ error: 'Admins only' });
  } catch (e) { return res.status(500).json({ error: 'Failed' }); }
};

function createAdminRouter({ pool, frontendUrl }) {
  const r = express.Router();
  const audit = (req, target, reason) => securityEvent('admin_action', { user: target, ip: req.ip, reason });
  const wrap = (fn) => async (req, res) => {
    try { await fn(req, res); }
    catch (e) { console.error('[admin]', req.method, req.path, e); res.status(500).json({ error: 'Something went wrong' }); }
  };
  const idOk = (req, res) => { if (UUID.test(req.params.id)) return true; res.status(404).json({ error: 'Not found' }); return false; };

  // ───────── overview ─────────
  r.get('/overview', wrap(async (req, res) => {
    const [m, q, sec, signups, activity] = await Promise.all([
      pool.query(`SELECT COUNT(*)::int AS members,
                         COUNT(*) FILTER (WHERE role = 'admin')::int AS admins,
                         COUNT(*) FILTER (WHERE disabled_at IS NOT NULL)::int AS disabled,
                         COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days')::int AS new_7d,
                         (SELECT COUNT(DISTINCT user_id)::int FROM refresh_tokens WHERE created_at > NOW() - INTERVAL '7 days') AS active_7d
                    FROM users`),
      pool.query(`SELECT (SELECT COUNT(*)::int FROM access_requests WHERE status = 'pending') AS requests,
                         (SELECT COUNT(*)::int FROM invitations WHERE status = 'pending' AND (expires_at IS NULL OR expires_at > NOW())) AS invites,
                         (SELECT COUNT(*)::int FROM registration_codes WHERE revoked_at IS NULL AND uses < max_uses AND (expires_at IS NULL OR expires_at > NOW())) AS codes`),
      pool.query(`SELECT COUNT(*) FILTER (WHERE event = 'login_failed')::int AS failed_logins,
                         COUNT(*) FILTER (WHERE event = 'login_rate_limited')::int AS rate_limited,
                         COUNT(*) FILTER (WHERE event = 'signup' AND reason <> 'created')::int AS blocked_signups,
                         COUNT(*) FILTER (WHERE event = 'access_denied')::int AS access_denied,
                         COUNT(DISTINCT ip) FILTER (WHERE event IN ('login_failed', 'login_rate_limited'))::int AS hostile_ips
                    FROM security_events WHERE ts > NOW() - INTERVAL '24 hours'`),
      pool.query(`SELECT to_char(d, 'YYYY-MM-DD') AS day, COUNT(u.id)::int AS n
                    FROM generate_series(CURRENT_DATE - 29, CURRENT_DATE, INTERVAL '1 day') d
                    LEFT JOIN users u ON u.created_at::date = d::date GROUP BY d ORDER BY d`),
      pool.query(`SELECT ts, event, user_email, reason FROM security_events
                   WHERE event IN ('signup', 'access_requested', 'admin_action') ORDER BY ts DESC LIMIT 12`),
    ]);
    res.json({ members: m.rows[0], queue: q.rows[0], security24h: sec.rows[0], signups30d: signups.rows, activity: activity.rows });
  }));

  // ───────── members ─────────
  r.get('/members', wrap(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT u.id, u.email, u.name, u.avatar, u.role, u.provider, u.created_at, u.disabled_at, u.joined_via,
              rc.code AS joined_code,
              (SELECT MAX(created_at) FROM refresh_tokens t WHERE t.user_id = u.id) AS last_active,
              (SELECT COUNT(*)::int FROM actions a WHERE a.user_id = u.id) AS actions,
              inv.inviter_name
         FROM users u
         LEFT JOIN registration_codes rc ON rc.id = u.registration_code_id
         LEFT JOIN LATERAL (SELECT iu.name AS inviter_name FROM invitations i JOIN users iu ON iu.id = i.inviter_user_id
                             WHERE i.accepted_user_id = u.id ORDER BY i.accepted_at DESC NULLS LAST LIMIT 1) inv ON true
        ORDER BY u.created_at DESC`);
    res.json(rows);
  }));

  r.patch('/members/:id', wrap(async (req, res) => {
    if (!idOk(req, res)) return;
    if (req.params.id === req.userId) return res.status(400).json({ error: "You can't change your own role or access." });
    const { role, disabled } = req.body || {};
    if (role !== undefined && !['admin', 'member'].includes(role)) return res.status(400).json({ error: 'Role must be admin or member' });
    const cur = await pool.query('SELECT id, email, role, disabled_at FROM users WHERE id = $1', [req.params.id]);
    const target = cur.rows[0];
    if (!target) return res.status(404).json({ error: 'Member not found' });

    const losesAdmin = target.role === 'admin' && !target.disabled_at && (role === 'member' || disabled === true);
    if (losesAdmin) {
      const others = await pool.query(`SELECT COUNT(*)::int AS n FROM users WHERE role = 'admin' AND disabled_at IS NULL AND id <> $1`, [target.id]);
      if (!others.rows[0].n) return res.status(400).json({ error: 'There must always be at least one active admin.' });
    }
    const { rows } = await pool.query(
      `UPDATE users SET role = COALESCE($2, role),
              disabled_at = CASE WHEN $3::boolean IS NULL THEN disabled_at WHEN $3 THEN COALESCE(disabled_at, NOW()) ELSE NULL END
        WHERE id = $1 RETURNING id, email, role, disabled_at`,
      [target.id, role ?? null, typeof disabled === 'boolean' ? disabled : null]);
    // A disabled account loses its sessions now; its last access token dies within the hour.
    if (disabled === true) await pool.query('DELETE FROM refresh_tokens WHERE user_id = $1', [target.id]);
    if (role && role !== target.role) audit(req, target.email, `role_${role}`);
    if (typeof disabled === 'boolean' && disabled !== !!target.disabled_at) audit(req, target.email, disabled ? 'disabled' : 'enabled');
    res.json(rows[0]);
  }));

  // ───────── invitations ─────────
  r.get('/invitations', wrap(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT i.id, i.email, i.name, i.source, i.created_at, i.sent_at, i.expires_at, i.accepted_at, i.token,
              CASE WHEN i.status = 'pending' AND i.expires_at <= NOW() THEN 'expired' ELSE i.status END AS status,
              u.name AS inviter_name, au.name AS accepted_name
         FROM invitations i
         LEFT JOIN users u ON u.id = i.inviter_user_id
         LEFT JOIN users au ON au.id = i.accepted_user_id
        ORDER BY i.created_at DESC LIMIT 300`);
    res.json(rows.map(({ token, ...row }) => ({ ...row, joinUrl: row.status === 'pending' ? `${frontendUrl}/register?invite=${token}` : null })));
  }));

  r.post('/invitations', wrap(async (req, res) => {
    const email = norm(req.body?.email);
    if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'Enter a valid email' });
    const out = await createInvite(pool, { email, name: req.body?.name, inviterId: req.userId, source: 'admin', frontendUrl });
    if (out.status === 'already_member') return res.status(409).json({ error: 'That email already has an account.' });
    if (out.status === 'already_invited') return res.status(409).json({ error: 'That email already has a pending invite — resend it from the list.' });
    audit(req, email, 'invited');
    res.status(201).json(out);
  }));

  r.post('/invitations/:id/resend', wrap(async (req, res) => {
    if (!idOk(req, res)) return;
    const { rows } = await pool.query(
      `UPDATE invitations SET status = 'pending', expires_at = NOW() + make_interval(days => $2)
        WHERE id = $1 AND (status = 'pending' OR (status = 'expired'))
          AND NOT EXISTS (SELECT 1 FROM invitations o WHERE o.status = 'pending' AND LOWER(o.email) = LOWER(invitations.email) AND o.id <> invitations.id)
        RETURNING id, email`, [req.params.id, INVITE_DAYS]);
    if (!rows.length) return res.status(409).json({ error: 'Only a pending or expired invite can be resent.' });
    const out = await sendInviteEmail(pool, rows[0].id, frontendUrl);
    audit(req, rows[0].email, 'invite_resent');
    res.json(out);
  }));

  r.post('/invitations/:id/revoke', wrap(async (req, res) => {
    if (!idOk(req, res)) return;
    const { rows } = await pool.query(`UPDATE invitations SET status = 'revoked' WHERE id = $1 AND status = 'pending' RETURNING email`, [req.params.id]);
    if (!rows.length) return res.status(409).json({ error: 'Only a pending invite can be revoked.' });
    audit(req, rows[0].email, 'invite_revoked');
    res.json({ success: true });
  }));

  // ───────── access requests ─────────
  r.get('/requests', wrap(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT ar.id, ar.email, ar.name, ar.message, ar.status, ar.created_at, ar.reviewed_at, ru.name AS reviewed_by_name,
              EXISTS (SELECT 1 FROM users u WHERE LOWER(u.email) = LOWER(ar.email)) AS is_member
         FROM access_requests ar LEFT JOIN users ru ON ru.id = ar.reviewed_by
        ORDER BY (ar.status = 'pending') DESC, ar.created_at DESC LIMIT 300`);
    res.json(rows);
  }));

  r.post('/requests/:id/approve', wrap(async (req, res) => {
    if (!idOk(req, res)) return;
    const cur = await pool.query(`SELECT id, email, name FROM access_requests WHERE id = $1 AND status = 'pending'`, [req.params.id]);
    if (!cur.rows.length) return res.status(409).json({ error: 'This request was already handled.' });
    const ar = cur.rows[0];
    let out = await createInvite(pool, { email: ar.email, name: ar.name, inviterId: req.userId, source: 'request', frontendUrl });
    // Already invited (e.g. added as a contact): re-send that invite rather than leave them waiting.
    if (out.status === 'already_invited') {
      const inv = await pool.query(`SELECT id FROM invitations WHERE status = 'pending' AND LOWER(email) = LOWER($1)`, [ar.email]);
      out = { ...(await sendInviteEmail(pool, inv.rows[0].id, frontendUrl)), id: inv.rows[0].id };
    }
    await pool.query(`UPDATE access_requests SET status = 'approved', reviewed_by = $2, reviewed_at = NOW() WHERE id = $1`, [ar.id, req.userId]);
    audit(req, ar.email, 'request_approved');
    res.json(out);
  }));

  r.post('/requests/:id/deny', wrap(async (req, res) => {
    if (!idOk(req, res)) return;
    const { rows } = await pool.query(
      `UPDATE access_requests SET status = 'denied', reviewed_by = $2, reviewed_at = NOW() WHERE id = $1 AND status = 'pending' RETURNING email`,
      [req.params.id, req.userId]);
    if (!rows.length) return res.status(409).json({ error: 'This request was already handled.' });
    audit(req, rows[0].email, 'request_denied');
    res.json({ success: true });
  }));

  // ───────── registration codes ─────────
  r.get('/codes', wrap(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT c.id, c.code, c.label, c.max_uses, c.uses, c.expires_at, c.revoked_at, c.created_at, cu.name AS created_by_name,
              CASE WHEN c.revoked_at IS NOT NULL THEN 'revoked'
                   WHEN c.uses >= c.max_uses THEN 'used_up'
                   WHEN c.expires_at IS NOT NULL AND c.expires_at <= NOW() THEN 'expired'
                   ELSE 'active' END AS status,
              COALESCE((SELECT json_agg(json_build_object('name', u.name, 'email', u.email, 'at', u.created_at) ORDER BY u.created_at)
                          FROM users u WHERE u.registration_code_id = c.id), '[]') AS used_by
         FROM registration_codes c LEFT JOIN users cu ON cu.id = c.created_by
        ORDER BY c.created_at DESC LIMIT 300`);
    res.json(rows);
  }));

  r.post('/codes', wrap(async (req, res) => {
    const label = String(req.body?.label || '').trim().slice(0, 120);
    const maxUses = Number.parseInt(req.body?.max_uses ?? 1, 10);
    const days = req.body?.expires_days == null || req.body.expires_days === '' ? null : Number.parseInt(req.body.expires_days, 10);
    if (!Number.isInteger(maxUses) || maxUses < 1 || maxUses > 1000) return res.status(400).json({ error: 'Uses must be between 1 and 1000' });
    if (days !== null && (!Number.isInteger(days) || days < 1 || days > 365)) return res.status(400).json({ error: 'Expiry must be 1–365 days' });
    for (let attempt = 0; attempt < 5; attempt++) {
      const ins = await pool.query(
        `INSERT INTO registration_codes (code, label, max_uses, expires_at, created_by)
         VALUES ($1, $2, $3, CASE WHEN $4::int IS NULL THEN NULL ELSE NOW() + make_interval(days => $4::int) END, $5)
         ON CONFLICT (UPPER(code)) DO NOTHING RETURNING id, code`,
        [makeCode(), label || null, maxUses, days, req.userId]);
      if (ins.rows.length) {
        audit(req, ins.rows[0].code, 'code_created');
        return res.status(201).json(ins.rows[0]);
      }
    }
    res.status(500).json({ error: 'Could not generate a unique code — try again' });
  }));

  r.post('/codes/:id/revoke', wrap(async (req, res) => {
    if (!idOk(req, res)) return;
    const { rows } = await pool.query('UPDATE registration_codes SET revoked_at = NOW() WHERE id = $1 AND revoked_at IS NULL RETURNING code', [req.params.id]);
    if (!rows.length) return res.status(409).json({ error: 'Already revoked' });
    audit(req, rows[0].code, 'code_revoked');
    res.json({ success: true });
  }));

  // ───────── security log ─────────
  r.get('/security', wrap(async (req, res) => {
    const event = typeof req.query.event === 'string' && req.query.event ? req.query.event : null;
    const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 120) : '';
    const days = [1, 7, 30, 90].includes(Number(req.query.days)) ? Number(req.query.days) : 7;
    const where = [`ts > NOW() - make_interval(days => $1)`];
    const params = [days];
    if (event) { params.push(event); where.push(`event = $${params.length}`); }
    if (q) { params.push(`%${q.toLowerCase()}%`); where.push(`(LOWER(user_email) LIKE $${params.length} OR ip LIKE $${params.length})`); }
    const w = where.join(' AND ');
    const [events, counts, ips] = await Promise.all([
      pool.query(`SELECT id, ts, event, user_email, ip, reason FROM security_events WHERE ${w} ORDER BY ts DESC LIMIT 300`, params),
      pool.query(`SELECT event, COUNT(*)::int AS n FROM security_events WHERE ts > NOW() - make_interval(days => $1) GROUP BY event ORDER BY n DESC`, [days]),
      pool.query(`SELECT ip, COUNT(*)::int AS n, MAX(ts) AS last, COUNT(DISTINCT user_email)::int AS accounts
                    FROM security_events WHERE ts > NOW() - make_interval(days => $1) AND event IN ('login_failed', 'login_rate_limited', 'access_denied') AND ip IS NOT NULL
                   GROUP BY ip ORDER BY n DESC LIMIT 8`, [days]),
    ]);
    res.json({ days, events: events.rows, counts: counts.rows, topIps: ips.rows });
  }));

  return r;
}

module.exports = { createAdminRouter, requireAdmin, createInvite };
