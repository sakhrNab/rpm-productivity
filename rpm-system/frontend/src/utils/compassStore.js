// Module-level store for the Daily Compass so its state survives page navigation.
// The route component unmounts when you leave /compass, but this store does not —
// so an in-flight AI request keeps running and its result is shown when you return.
// The read is one person's plan: it is cached per user (userScope) and dropped when the user changes.
import { scoped, onUserChange, currentUserId } from './userScope';

const CACHE_KEY = 'compass.cache.v1';

function loadCache() {
  if (!currentUserId()) return null;
  try { const c = JSON.parse(localStorage.getItem(scoped(CACHE_KEY))); return c && c.text != null ? c : null; }
  catch { return null; }
}
function todayStr() {
  const d = new Date(); const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const fromCache = () => { const c = loadCache(); return c ? { status: 'ready', ...c } : { status: 'idle' }; };
let state = fromCache();
const listeners = new Set();
let inflight = false;

function emit() { for (const fn of listeners) fn(state); }
// A different person signed in (or out): forget the read in memory and load theirs, if any.
onUserChange(() => { inflight = false; state = fromCache(); emit(); });
function set(patch) { state = { ...state, ...patch }; emit(); }

export function getCompassState() { return state; }
export function subscribeCompass(fn) { listeners.add(fn); return () => listeners.delete(fn); }

// Kick off the compass read. No-op if one is already loading (so returning to the
// page while it loads doesn't start a second request).
export async function runCompassRequest(api) {
  if (inflight) return;
  const modelKey = localStorage.getItem('ai.modelKey');
  if (!modelKey) { set({ status: 'no-model' }); return; }
  inflight = true;
  const startedFor = currentUserId();
  set({ status: 'loading', error: null });
  try {
    const res = await api.aiCoachCompass({ modelKey });
    if (currentUserId() !== startedFor) return;   // someone else signed in meanwhile: this read isn't theirs
    if (res.error) throw new Error(res.error);
    const payload = {
      text: res.text, context: res.context, sources: res.sources || [], usage: res.usage || null,
      generatedAt: new Date().toISOString(), dateStr: todayStr(),
    };
    try { localStorage.setItem(scoped(CACHE_KEY), JSON.stringify(payload)); } catch { /* quota */ }
    set({ status: 'ready', ...payload, error: null });
  } catch (e) {
    if (currentUserId() !== startedFor) return;
    const msg = e.message || 'Failed to read your compass';
    if (/no longer available|unknown model/i.test(msg)) { localStorage.removeItem('ai.modelKey'); set({ status: 'no-model' }); }
    else set({ status: 'error', error: msg });
  } finally { inflight = false; }
}

// Optimistically reflect a completed/updated action in the cached context so the
// Compass "today" list stays in sync after the user acts on it.
export function patchCompassAction(actionId, patch) {
  if (!state.context || !Array.isArray(state.context.actions)) return;
  const actions = state.context.actions.map(a => (a.id === actionId ? { ...a, ...patch } : a));
  const context = { ...state.context, actions };
  set({ context });
  try {
    const c = loadCache();
    if (c) localStorage.setItem(scoped(CACHE_KEY), JSON.stringify({ ...c, context }));
  } catch { /* ignore */ }
}
