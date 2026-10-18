// Google / Microsoft sign-in via Firebase Auth (the same Firebase project as the website).
// The popup proves who you are; the RPM backend verifies the Firebase ID token and answers with
// RPM's own tokens — Firebase's session is dropped right after. Firebase loads only on click.

let providersPromise = null;

/** { firebase: config | null } from the backend; cached. Social buttons hide when firebase is null. */
export function getProviders(apiBase) {
  if (!providersPromise) {
    providersPromise = fetch(`${apiBase}/auth/providers`)
      .then(r => (r.ok ? r.json() : { firebase: null }))
      .catch(() => ({ firebase: null }));
  }
  return providersPromise;
}

const POPUP_ERRORS = {
  'auth/popup-closed-by-user': 'The sign-in window was closed before finishing.',
  'auth/cancelled-popup-request': 'The sign-in window was closed before finishing.',
  'auth/popup-blocked': 'Your browser blocked the sign-in window — allow pop-ups for this site and try again.',
  'auth/unauthorized-domain': 'This site is not yet allowed to use Google/Microsoft sign-in. Contact the admin.',
  'auth/operation-not-allowed': 'This sign-in method is turned off. Contact the admin.',
  'auth/account-exists-with-different-credential': 'This email already signs in with a different provider — use that one (or your password).',
  'auth/network-request-failed': 'Network problem — check your connection and try again.',
};

/** provider: 'google' | 'microsoft'. extra: { invite, code } for a first sign-up.
 *  → { user, accessToken, refreshToken }. Throws Error with .code on failure. */
export async function socialSignIn(apiBase, provider, extra = {}) {
  const { firebase: config } = await getProviders(apiBase);
  if (!config) throw Object.assign(new Error('Google/Microsoft sign-in is not set up yet.'), { code: 'not_configured' });

  const [{ initializeApp, getApps }, authMod] = await Promise.all([import('firebase/app'), import('firebase/auth')]);
  const { getAuth, signInWithPopup, signOut, GoogleAuthProvider, OAuthProvider, browserPopupRedirectResolver } = authMod;
  const app = getApps().find(a => a.name === 'rpm') || initializeApp(config, 'rpm');
  const auth = getAuth(app);

  const p = provider === 'microsoft' ? new OAuthProvider('microsoft.com') : new GoogleAuthProvider();
  p.addScope('email');
  p.addScope('profile');
  p.setCustomParameters({ prompt: 'select_account' });

  let idToken;
  try {
    const result = await signInWithPopup(auth, p, browserPopupRedirectResolver);
    idToken = await result.user.getIdToken();
  } catch (err) {
    throw Object.assign(new Error(POPUP_ERRORS[err.code] || 'Sign-in failed — please try again.'), { code: err.code || 'popup_failed' });
  } finally {
    signOut(auth).catch(() => {});   // RPM keeps its own session; don't leave a Firebase one behind
  }

  const res = await fetch(`${apiBase}/auth/firebase`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken, invite: extra.invite || undefined, code: extra.code || undefined }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || 'Sign-in failed'), { code: data.code });
  return data;
}
