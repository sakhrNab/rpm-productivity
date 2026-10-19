// Per-user browser storage. Anything that holds one person's data (a cached Compass read, the last voice
// conversation, what they hid today) is stored under `<key>:<userId>`, and a sign-in by someone else — or a
// logout — removes it. Without this, the next person on the same browser saw the previous person's
// must-win read (incident 2026-10-19). Device preferences (model choice, voice, speech language) stay
// unscoped on purpose: they hold no personal data.
//
// AuthProvider calls switchUser() synchronously before it sets the user, so a page that reads a scoped key
// while rendering already gets the right one.

export const USER_KEYS = ['compass.cache.v1', 'orb.conv', 'today.catchup', 'biz.moves.hidden'];

let current = null;
const listeners = new Set();

export const currentUserId = () => current;
export const scoped = (key) => `${key}:${current || 'anon'}`;
/** Run fn(userId) whenever the signed-in user changes (in-memory stores reset themselves here). */
export function onUserChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }

function removeWhere(test) {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k && test(k)) localStorage.removeItem(k);
    }
  } catch { /* storage blocked */ }
}
const isUserKey = (k) => USER_KEYS.some(base => k === base || k.startsWith(`${base}:`));

/** Signed-in user changed (id) or signed out (null): keep only this user's data and tell the stores. */
export function switchUser(userId) {
  const id = userId || null;
  // Unscoped legacy keys and every other user's scoped keys go, whoever is signing in.
  removeWhere(k => isUserKey(k) && (!id || !k.endsWith(`:${id}`)));
  if (id === current) return;
  current = id;
  for (const fn of listeners) { try { fn(id); } catch { /* a store must not break sign-in */ } }
}
