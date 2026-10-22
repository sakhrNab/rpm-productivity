// The browser's sign-in session: which tokens to send, when to refresh, when we are signed out.
//
// 2026-10-22: a real user coming back to rpm after the access token had expired produced bursts of 401s
// (5 GETs in one second, refresh ×4, logout ×3–6) and CrowdSec's 401 brute-force rule banned them for 7 days.
// The rules here, each one a cause of those bursts:
//   - Refresh BEFORE sending when the access token expires within a minute (read from the JWT `exp`), not after
//     every request has already come back 401.
//   - One refresh at a time ACROSS TABS (Web Locks). Tokens live in localStorage, shared by every tab; refresh
//     tokens rotate, so a tab refreshing with a token another tab already used got a 401 and signed everyone out.
//     Inside the lock we re-read storage: if another tab already stored a newer token, we use it.
//   - Once a refresh has definitively failed we are signed out until the next sign-in: later requests are not
//     sent, and no further refreshes or logouts start. Logout needs only the refresh token, runs once, and is
//     skipped when there is none.
//   - Other tabs follow along through the `storage` event (see AuthProvider in App.jsx).
//
// Everything is injected (fetch, storage, locks, clock), so it runs under `node --test` with two "tabs" sharing
// one storage and one lock manager.

export const ACCESS_KEY = 'accessToken';
export const REFRESH_KEY = 'refreshToken';
const SKEW_KEY = 'authClockSkewMs';
export const LOCK_NAME = 'rpm-auth-refresh';
export const REFRESH_AHEAD_MS = 60 * 1000;

/** The JWT payload, without verifying it (only the server can). null when it isn't a JWT. */
export function decodeJwt(token) {
  if (typeof token !== 'string') return null;
  const part = token.split('.')[1];
  if (!part) return null;
  try {
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((part.length + 3) % 4);
    return JSON.parse(atob(b64));
  } catch { return null; }
}

/** A lock manager for the fallback case (no Web Locks): serialises within this tab only. */
export function localLocks() {
  const tails = new Map();
  return {
    request(name, fn) {
      const prev = tails.get(name) || Promise.resolve();
      const run = prev.then(() => fn());
      tails.set(name, run.catch(() => {}));
      return run;
    },
  };
}

export class SessionExpiredError extends Error {
  constructor(message = 'Session expired') { super(message); this.name = 'SessionExpiredError'; this.code = 'SESSION_EXPIRED'; }
}

export function createAuthSession({
  apiBase,
  fetchFn = (...a) => fetch(...a),
  storage = globalThis.localStorage,
  locks = globalThis.navigator?.locks || localLocks(),
  now = () => Date.now(),
  onSignedOut = () => {},
  timeoutMs = 15000,
}) {
  let signedOut = false;
  let refreshInFlight = null;
  let logoutInFlight = null;

  const read = (k) => { try { return storage.getItem(k); } catch { return null; } };
  const tokens = () => ({ accessToken: read(ACCESS_KEY), refreshToken: read(REFRESH_KEY) });
  const signal = () => (typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? AbortSignal.timeout(timeoutMs) : undefined);

  // Our clock vs the server's, learned from each new token's `iat`, so a wrong laptop clock neither refreshes on
  // every request nor sends expired tokens.
  const skew = () => Number(read(SKEW_KEY)) || 0;
  const msLeft = (token) => {
    const exp = decodeJwt(token)?.exp;
    return typeof exp === 'number' ? exp * 1000 - (now() - skew()) : -Infinity;
  };
  const fresh = (token) => !!token && msLeft(token) > REFRESH_AHEAD_MS;

  function setTokens(accessToken, refreshToken) {
    storage.setItem(ACCESS_KEY, accessToken);
    storage.setItem(REFRESH_KEY, refreshToken);
    const iat = decodeJwt(accessToken)?.iat;
    if (typeof iat === 'number') storage.setItem(SKEW_KEY, String(now() - iat * 1000));
    signedOut = false;
  }

  function clearTokens() {
    storage.removeItem(ACCESS_KEY);
    storage.removeItem(REFRESH_KEY);
  }

  /**
   * A new access token, refreshing at most once across all tabs. `rejected` is the token we already know is
   * no good (expired, or just answered 401): another tab's newer token is used only if it differs from it.
   * Returns the token, or null when the session is over (the caller signs out). Throws on a network error or
   * a 5xx — those are not a reason to sign anyone out.
   */
  function refresh(rejected) {
    if (signedOut) return Promise.resolve(null);
    if (refreshInFlight) return refreshInFlight;
    refreshInFlight = Promise.resolve(locks.request(LOCK_NAME, async () => {
      const cur = tokens();
      if (cur.accessToken && cur.accessToken !== rejected && fresh(cur.accessToken)) return cur.accessToken;   // another tab did it
      if (!cur.refreshToken) return null;
      // A refresh token past its own expiry would only earn a 401: don't send it.
      const rexp = decodeJwt(cur.refreshToken)?.exp;
      if (typeof rexp === 'number' && rexp * 1000 <= now() - skew()) return null;
      const res = await fetchFn(`${apiBase}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: cur.refreshToken }),
        signal: signal(),
      });
      if (res.status >= 500 || res.status === 429) throw new Error('Could not reach the server — try again');
      if (!res.ok) return null;
      const data = await res.json();
      setTokens(data.accessToken, data.refreshToken);
      return data.accessToken;
    })).finally(() => { refreshInFlight = null; });
    return refreshInFlight;
  }

  /** The access token to send right now (refreshing first if it is about to expire), or null if signed out. */
  async function getValidToken() {
    if (signedOut) return null;
    const { accessToken, refreshToken } = tokens();
    if (fresh(accessToken)) return accessToken;
    if (!refreshToken) return null;
    return refresh(accessToken);
  }

  /** Sign out once. The server call carries only the refresh token, and is skipped when there is none. */
  function logout() {
    if (logoutInFlight) return logoutInFlight;
    signedOut = true;
    logoutInFlight = Promise.resolve(locks.request(LOCK_NAME, async () => {
      const { refreshToken } = tokens();
      clearTokens();
      if (refreshToken) {
        try {
          await fetchFn(`${apiBase}/auth/logout`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refreshToken }),
            signal: signal(),
          });
        } catch { /* the tokens are gone from this browser either way */ }
      }
    })).catch(() => {}).finally(() => { logoutInFlight = null; onSignedOut(); });
    return logoutInFlight;
  }

  /**
   * fetch with the session's token. `send(token)` makes the request. Refreshes before sending when needed and
   * once more on a TOKEN_EXPIRED 401; a revoked or unrecoverable session signs out (once) and throws
   * SessionExpiredError — and while signed out, nothing is sent at all.
   */
  async function authed(send) {
    if (signedOut) throw new SessionExpiredError();
    let token = await getValidToken();
    if (!token) { logout(); throw new SessionExpiredError(); }
    let res = await send(token);
    if (res.status !== 401) return res;
    const data = await res.clone().json().catch(() => ({}));
    if (data.code === 'SESSION_REVOKED') { logout(); throw new SessionExpiredError(data.error || 'Please sign in again'); }
    if (data.code !== 'TOKEN_EXPIRED') return res;
    token = await refresh(token);   // e.g. the server's clock is ahead of ours
    if (!token) { logout(); throw new SessionExpiredError(); }
    res = await send(token);
    return res;
  }

  /** Another tab changed the stored tokens. Returns 'signed-out', 'signed-in' or null (nothing to do). */
  function syncFromStorage() {
    const { accessToken, refreshToken } = tokens();
    if (!accessToken && !refreshToken) {
      if (signedOut) return null;
      signedOut = true;
      return 'signed-out';
    }
    if (accessToken && refreshToken && signedOut) { signedOut = false; return 'signed-in'; }
    return null;
  }

  return {
    authed, getValidToken, refresh, logout, setTokens, clearTokens, syncFromStorage, tokens,
    isSignedOut: () => signedOut,
    markSignedOut: () => { signedOut = true; },
  };
}
