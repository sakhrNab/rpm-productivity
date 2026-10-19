// Which social sign-ins the backend has set up ({ google, microsoft }); cached for the session.
// The buttons send the whole page to the backend, which runs the OAuth flow and comes back to
// /auth/callback (or to /login or /register with ?error=<reason>).
let providers = null;
export function getProviders(apiBase) {
  if (!providers) {
    providers = fetch(`${apiBase}/auth/providers`)
      .then(r => (r.ok ? r.json() : {}))
      .catch(() => ({}));
  }
  return providers;
}

export function startSocial(apiBase, provider, { invite, code } = {}) {
  const q = new URLSearchParams();
  if (invite) q.set('invite', invite);
  if (code) q.set('regcode', code);   // not `code`: that name is the OAuth authorization code
  const qs = q.toString();
  window.location.href = `${apiBase}/auth/${provider}${qs ? `?${qs}` : ''}`;
}

// What ?error=<reason> from a Google/Microsoft round-trip means, in words.
export const SOCIAL_ERRORS = {
  invite_required: 'No RPM account for that email yet, and RPM is invite-only. Enter a registration code and press Google/Microsoft again, or request access.',
  invite_invalid: 'This invite link has expired or was already used. Use a code or request access.',
  code_invalid: "That registration code isn't valid — it may be used up, expired or revoked.",
  existing_account: 'An RPM account with this email already exists. Sign in with your password (or Google) — Microsoft can only open accounts it created.',
  email_unverified: "Google hasn't verified this account's email, so it can't be used to sign in.",
  no_email: "Your account didn't share an email address, so we can't sign you in with it.",
  disabled: 'This account has been disabled. Contact the admin if you think this is a mistake.',
  not_configured: 'That sign-in method is not set up yet.',
  provider_failed: 'Sign-in with that provider failed. Please try again.',
};
