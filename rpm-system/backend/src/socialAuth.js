// Google / Microsoft sign-in, the same way reply.aiwaverider.com and lead-outbound do it: our own
// OAuth apps, server-side code flow, no Firebase.
//
//   GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET        a Google OAuth web client; redirect URI
//                                                  ${BACKEND_URL}/api/auth/google/callback
//   MICROSOFT_CLIENT_ID / MICROSOFT_CLIENT_SECRET  an Entra app registration (any account type);
//   MICROSOFT_AUTHORITY (default "common")         redirect URI ${BACKEND_URL}/api/auth/microsoft/callback
//
// A provider with no id/secret is simply hidden (GET /api/auth/providers). Rules, as in reply's lib/auth.ts:
//   - a Google account whose email Google hasn't verified never signs in;
//   - Microsoft's "common" authority lets any tenant claim any email, so a Microsoft sign-in never opens
//     an existing account by email and can only create one with an invite link or a registration code;
//   - Google-verified email may open the existing RPM account with that email (Google owns that check).
// New accounts go through access.createAccount, so invites/codes/approval apply exactly as for the form.

const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const MicrosoftStrategy = require('passport-microsoft').Strategy;
const { createAccount, AdmissionDenied, normCode } = require('./access');
const { securityEvent } = require('./securityEvent');

const configured = (env = process.env) => ({
  google: !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET),
  microsoft: !!(env.MICROSOFT_CLIENT_ID && env.MICROSOFT_CLIENT_SECRET),
});

/** The invite/code a sign-up carries through the provider round-trip (OAuth `state`). */
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

/** What to do with a provider identity, given the account it matched (if any). Pure, for tests.
 *  → { action: 'login' | 'link' | 'create', trustEmail? } | { action: 'deny', reason } */
function decide({ provider, providerId, email, emailVerified, existing }) {
  if (!email) return { action: 'deny', reason: 'no_email' };
  if (provider === 'google' && emailVerified === false) return { action: 'deny', reason: 'email_unverified' };
  if (existing) {
    if (existing.provider === provider && existing.provider_id === providerId) return { action: 'login' };
    if (provider === 'google' && emailVerified === true) return { action: 'link' };
    return { action: 'deny', reason: 'existing_account' };
  }
  return { action: 'create', trustEmail: provider === 'google' && emailVerified === true };
}

// Where a failed sign-in lands, and why (the page shows the message for that code).
const FAIL_PAGE = { invite_required: 'register', invite_invalid: 'register', code_invalid: 'register' };

function mountSocialAuth(app, { pool, frontendUrl, backendUrl, issueSession, sendWelcome }) {
  const on = configured();

  const verify = (provider) => async (req, accessToken, refreshToken, profile, done) => {
    try {
      const email = String(profile.emails?.[0]?.value || '').trim();
      const emailVerified = provider === 'google' ? profile.emails?.[0]?.verified === true || profile.emails?.[0]?.verified === 'true' : false;
      const { rows } = await pool.query(
        `SELECT * FROM users WHERE (provider = $1 AND provider_id = $2) OR ($3 <> '' AND LOWER(email) = LOWER($3))
          ORDER BY (provider = $1 AND provider_id = $2) DESC LIMIT 1`, [provider, profile.id, email]);
      const existing = rows[0];
      const d = decide({ provider, providerId: profile.id, email, emailVerified, existing });

      if (d.action === 'deny') {
        securityEvent('login_failed', { user: email || null, ip: req.ip, reason: `${provider}_${d.reason}` });
        return done(null, false, { message: d.reason });
      }
      if (d.action === 'login' || d.action === 'link') {
        if (existing.disabled_at) return done(null, false, { message: 'disabled' });
        if (d.action === 'link') await pool.query('UPDATE users SET provider = $1, provider_id = $2 WHERE id = $3', [provider, profile.id, existing.id]);
        return done(null, existing);
      }
      try {
        const { user } = await createAccount(pool, {
          email, name: (profile.displayName || email.split('@')[0]).slice(0, 100),
          avatar: provider === 'google' ? (profile.photos?.[0]?.value || '') : '',
          provider, providerId: profile.id, emailVerified, trustEmail: d.trustEmail, ...decodeSignupState(req.query.state),
        });
        securityEvent('signup', { user: user.email, ip: req.ip, reason: 'created' });
        sendWelcome({ to: user.email, name: user.name, appUrl: frontendUrl }).catch(e => console.error('welcome email:', e));
        return done(null, user);
      } catch (err) {
        if (!(err instanceof AdmissionDenied)) throw err;
        securityEvent('signup', { user: email, ip: req.ip, reason: err.reason });
        return done(null, false, { message: err.reason });
      }
    } catch (error) { return done(error); }
  };

  if (on.google) {
    passport.use(new GoogleStrategy({
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: `${backendUrl}/api/auth/google/callback`,
      passReqToCallback: true,
    }, verify('google')));
  }
  if (on.microsoft) {
    passport.use(new MicrosoftStrategy({
      clientID: process.env.MICROSOFT_CLIENT_ID,
      clientSecret: process.env.MICROSOFT_CLIENT_SECRET,
      callbackURL: `${backendUrl}/api/auth/microsoft/callback`,
      tenant: process.env.MICROSOFT_AUTHORITY || 'common',
      scope: ['openid', 'profile', 'email', 'User.Read'],
      passReqToCallback: true,
    }, verify('microsoft')));
  }
  app.use(passport.initialize());

  app.get('/api/auth/providers', (req, res) => res.json(on));

  const SCOPES = { google: ['profile', 'email'], microsoft: ['openid', 'profile', 'email', 'User.Read'] };
  for (const provider of ['google', 'microsoft']) {
    app.get(`/api/auth/${provider}`, (req, res, next) => {
      if (!on[provider]) return res.redirect(`${frontendUrl}/login?error=not_configured`);
      // `regcode`, not `code`: passport-oauth2 reads ?code= as the provider's authorization code.
      const state = encodeSignupState({ invite: req.query.invite, code: req.query.regcode });
      passport.authenticate(provider, {
        scope: SCOPES[provider], session: false, state, prompt: 'select_account',
      })(req, res, next);
    });

    app.get(`/api/auth/${provider}/callback`, (req, res, next) => {
      if (!on[provider]) return res.redirect(`${frontendUrl}/login?error=not_configured`);
      passport.authenticate(provider, { session: false }, async (err, user, info) => {
        const fail = (reason) => {
          const page = FAIL_PAGE[reason] || 'login';
          const st = page === 'register' ? decodeSignupState(req.query.state) : {};
          res.redirect(`${frontendUrl}/${page}?error=${encodeURIComponent(reason)}&via=${provider}${st.invite ? `&invite=${encodeURIComponent(st.invite)}` : ''}`);
        };
        if (err) { console.error(`[auth] ${provider} callback:`, err.message || err); return fail('provider_failed'); }
        if (!user) return fail(typeof info?.message === 'string' ? info.message : 'provider_failed');
        try {
          const { accessToken, refreshToken } = await issueSession(user);
          securityEvent('login_success', { user: user.email, ip: req.ip, reason: provider });
          res.redirect(`${frontendUrl}/auth/callback?accessToken=${accessToken}&refreshToken=${refreshToken}`);
        } catch (e) { fail('provider_failed'); }
      })(req, res, next);
    });
  }
}

module.exports = { mountSocialAuth, decide, configured, encodeSignupState, decodeSignupState };
