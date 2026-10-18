// Google / Microsoft sign-in through Firebase Auth — the same Firebase project ("aiwaverider") the
// website uses. The browser does the provider popup and hands us a Firebase ID token; we verify it
// against Google's published keys (no secret needed) and then treat it like any other sign-in.
//
//   FIREBASE_PROJECT_ID      e.g. aiwaverider (verification: token audience + issuer)
//   FIREBASE_WEB_API_KEY     public web config the sign-in page needs (it ships in every Firebase site)
//   FIREBASE_AUTH_DOMAIN     e.g. aiwaverider.firebaseapp.com
//   FIREBASE_APP_ID          web app id
// Unset project or key = social sign-in hidden. The RPM domain must be an authorized domain in Firebase.

const JWKS_URL = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';
const PROVIDERS = { 'google.com': 'google', 'microsoft.com': 'microsoft' };

let jwks = null;
const jose = () => import('jose');   // jose is ESM

/** The public config the sign-in page uses, or null when social sign-in isn't set up. */
function webConfig(env = process.env) {
  const projectId = env.FIREBASE_PROJECT_ID;
  if (!projectId || !env.FIREBASE_WEB_API_KEY) return null;
  return {
    apiKey: env.FIREBASE_WEB_API_KEY,
    authDomain: env.FIREBASE_AUTH_DOMAIN || `${projectId}.firebaseapp.com`,
    projectId,
    ...(env.FIREBASE_APP_ID && { appId: env.FIREBASE_APP_ID }),
  };
}

class FirebaseTokenError extends Error {}

/** Check the claims of an already signature-verified token → the identity we act on. Pure, for tests. */
function identityFromClaims(p, projectId, nowSec = Math.floor(Date.now() / 1000)) {
  if (!p || p.aud !== projectId || p.iss !== `https://securetoken.google.com/${projectId}`) throw new FirebaseTokenError('wrong project');
  if (!p.sub || typeof p.sub !== 'string') throw new FirebaseTokenError('no subject');
  if (typeof p.auth_time === 'number' && p.auth_time > nowSec + 60) throw new FirebaseTokenError('auth_time in the future');
  const provider = PROVIDERS[p.firebase?.sign_in_provider];
  if (!provider) throw new FirebaseTokenError('unsupported provider');
  return {
    uid: p.sub,
    provider,
    email: typeof p.email === 'string' ? p.email.trim() : '',
    emailVerified: p.email_verified === true,
    name: typeof p.name === 'string' ? p.name.slice(0, 100) : '',
    picture: typeof p.picture === 'string' ? p.picture.slice(0, 500) : '',
  };
}

/** Verify a Firebase ID token's signature + claims. Throws FirebaseTokenError when it isn't valid. */
async function verifyIdToken(idToken, projectId = process.env.FIREBASE_PROJECT_ID) {
  if (!projectId) throw new FirebaseTokenError('social sign-in is not configured');
  if (typeof idToken !== 'string' || idToken.length > 4096) throw new FirebaseTokenError('bad token');
  const { createRemoteJWKSet, jwtVerify } = await jose();
  if (!jwks) jwks = createRemoteJWKSet(new URL(JWKS_URL));
  let payload;
  try {
    ({ payload } = await jwtVerify(idToken, jwks, {
      algorithms: ['RS256'], audience: projectId, issuer: `https://securetoken.google.com/${projectId}`,
    }));
  } catch (e) { throw new FirebaseTokenError(e.code || 'invalid token'); }
  return identityFromClaims(payload, projectId);
}

module.exports = { webConfig, verifyIdToken, identityFromClaims, FirebaseTokenError };
