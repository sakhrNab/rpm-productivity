// Browser speech helpers for the voice ("Jarvis") assistant.
// STT via SpeechRecognition, TTS via speechSynthesis. All no-op-safe if unsupported.

export function sttSupported() {
  return typeof window !== 'undefined' && !!(window.SpeechRecognition || window.webkitSpeechRecognition);
}
export function ttsSupported() {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

let recognition = null;

// ---- Language ----
// Recognition must run in the language you SPEAK — a German browser locale would
// otherwise transcribe English as German gibberish. Saved per device; Auto = browser.
const LANG_KEY = 'speech.lang';
export function getSpeechLang() {
  try { return localStorage.getItem(LANG_KEY) || navigator.language || 'en-US'; } catch { return 'en-US'; }
}
export function getSpeechLangSetting() { try { return localStorage.getItem(LANG_KEY) || ''; } catch { return ''; } }
export function setSpeechLang(lang) { try { localStorage.setItem(LANG_KEY, lang || ''); } catch { /* noop */ } }

// Android Chrome repeats results in continuous mode, so it gets one-shot recognition.
const ANDROID = typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent || '');

// Listen for one utterance. onInterim(text) streams the live transcript; onFinal(text)
// fires ONCE with the settled transcript. Unlike the browser default (which cuts you off
// at the first breath), it keeps listening until `silenceMs` of quiet after you spoke,
// gives up after `startTimeoutMs` if you never start, and caps at `maxMs`.
export function startListening({ onStart, onInterim, onFinal, onEnd, onError, silenceMs = 1600, startTimeoutMs = 8000, maxMs = 60000 } = {}) {
  const SR = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition);
  if (!SR) { onError && onError('unsupported'); onFinal && onFinal(''); return null; }
  abortListening();
  let rec;
  try { rec = new SR(); } catch (e) { onError && onError(e.message || 'error'); onFinal && onFinal(''); return null; }
  rec.lang = getSpeechLang();
  rec.interimResults = true;
  rec.continuous = !ANDROID;
  let text = '', settled = false, silence = null;
  const clear = () => { clearTimeout(silence); clearTimeout(startTimer); clearTimeout(maxTimer); };
  const stopSoon = (ms) => { clearTimeout(silence); silence = setTimeout(() => { try { rec.stop(); } catch { /* noop */ } }, ms); };
  const startTimer = setTimeout(() => { if (!text) { try { rec.stop(); } catch { /* noop */ } } }, startTimeoutMs);
  const maxTimer = setTimeout(() => { try { rec.stop(); } catch { /* noop */ } }, maxMs);
  rec.onaudiostart = () => { onStart && onStart(); };
  rec.onresult = (e) => {
    let fin = '', interim = '';
    for (let i = 0; i < e.results.length; i++) {
      const t = e.results[i][0].transcript;
      if (e.results[i].isFinal) fin += t; else interim += t;
    }
    text = `${fin} ${interim}`.replace(/\s+/g, ' ').trim();
    if (onInterim) onInterim(text);
    // A settled phrase ends sooner than a half-heard one.
    stopSoon(interim ? silenceMs + 900 : silenceMs);
  };
  rec.onerror = (e) => { if (e.error !== 'no-speech' && e.error !== 'aborted') onError && onError(e.error || 'error'); };
  rec.onend = () => {
    clear();
    if (recognition === rec) recognition = null;
    if (settled) return;
    settled = true;
    onFinal && onFinal(text);
    onEnd && onEnd();
  };
  recognition = rec;
  try { rec.start(); } catch (e) {
    clear(); recognition = null; settled = true;
    onError && onError(e.message || 'error'); onFinal && onFinal('');
    return null;
  }
  return rec;
}

// Stop and keep what was heard (→ onFinal with the text). Also ends a barge-in that has
// turned into your next request.
export function stopListening() {
  try { recognition && recognition.stop(); } catch { /* noop */ }
  try { if (bargeCommitted && bargeRec) bargeRec.stop(); } catch { /* noop */ }
}
// Stop and throw it away (onFinal still fires, but callers use this when they don't care).
export function abortListening() { try { recognition && recognition.abort(); } catch { /* noop */ } recognition = null; }
export function isListening() { return !!recognition; }

// ---- Talking over the orb (barge-in) ----
// While the orb speaks, a second recognizer listens. Each phrase goes through isGenuine()
// (is it you, or the orb's own voice leaking into the mic?). The first genuine phrase fires
// onBarge — the caller stops the speech — and from then on this same recognizer is simply
// your next request: interim text streams to onInterim, and after `silenceMs` of quiet it
// ends with onFinal(text). Browsers end recognition every so often, so until you interrupt
// it re-arms itself. Android's continuous mode repeats results, so it isn't offered there.
let bargeRec = null;
let bargeCommitted = false;
let bargeStop = null;
export function bargeSupported() { return sttSupported() && !ANDROID; }

export function startBargeIn({ isGenuine, onBarge, onInterim, onFinal, silenceMs = 1600, maxMs = 60000 } = {}) {
  const SR = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition);
  if (!SR || ANDROID) return false;
  stopBargeIn();
  let armed = true, committed = false, settled = false, from = 0, text = '', silence = null, maxTimer = null;
  bargeCommitted = false;
  const run = () => {
    if (!armed) return;
    let rec;
    try { rec = new SR(); } catch { return; }
    rec.lang = getSpeechLang();
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (e) => {
      if (!committed) {
        for (let i = e.resultIndex; i < e.results.length; i++) {
          if (isGenuine && isGenuine(e.results[i][0].transcript)) {
            committed = true; bargeCommitted = true; from = i;
            maxTimer = setTimeout(() => { try { rec.stop(); } catch { /* noop */ } }, maxMs);
            onBarge && onBarge();
            break;
          }
        }
        if (!committed) return;
      }
      let t = '';
      for (let i = from; i < e.results.length; i++) t += `${e.results[i][0].transcript} `;
      text = t.replace(/\s+/g, ' ').trim();
      onInterim && onInterim(text);
      clearTimeout(silence);
      silence = setTimeout(() => { try { rec.stop(); } catch { /* noop */ } }, silenceMs);
    };
    rec.onerror = (e) => { if (e.error === 'not-allowed' || e.error === 'service-not-allowed') armed = false; };
    rec.onend = () => {
      clearTimeout(silence); clearTimeout(maxTimer);
      if (bargeRec === rec) bargeRec = null;
      if (committed) {
        bargeCommitted = false;
        if (!settled) { settled = true; onFinal && onFinal(text); }
        return;
      }
      if (armed) setTimeout(run, 250);
    };
    bargeRec = rec;
    try { rec.start(); } catch { bargeRec = null; if (armed) setTimeout(run, 800); }
  };
  // Stop listening for interruptions (the reply finished) — only while you haven't interrupted.
  bargeStop = () => {
    if (committed) return;
    armed = false;
    try { bargeRec && bargeRec.abort(); } catch { /* noop */ }
    bargeRec = null;
  };
  run();
  return true;
}
export function stopBargeIn() { if (bargeStop) { bargeStop(); bargeStop = null; } }
// Throw away an interruption in progress (orb closed / stopped).
export function abortBargeIn() {
  if (bargeStop) bargeStop();
  bargeStop = null;
  try { bargeRec && bargeRec.abort(); } catch { /* noop */ }
  bargeRec = null; bargeCommitted = false;
}

// ---- Wake word ("Hey RPM") ----
// A separate always-on recognizer. Browsers only allow one active recognition at a
// time, so the caller must stop this before startListening() and restart it after.
// Chrome also ends recognition periodically, hence the auto-restart loop.
let wakeRec = null;
let wakeWanted = false;

// Loose patterns — STT mangles "RPM" ("r p m", "are p m", "arpm"…).
const WAKE_PATTERNS = [
  /\bhey[,\s]*r\.?\s?p\.?\s?m\.?\b/i,
  /\bhey[,\s]*(are|a)\s?p\.?\s?m\.?\b/i,
  /\bhey[,\s]*rpm\b/i,
  /\bokay[,\s]*rpm\b/i,
];

export function wakeWordActive() { return wakeWanted; }

export function startWakeWord({ onWake, onError } = {}) {
  const SR = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition);
  if (!SR) { onError && onError('unsupported'); return false; }
  wakeWanted = true;
  const run = () => {
    if (!wakeWanted) return;
    try {
      const rec = new SR();
      rec.lang = getSpeechLang();
      rec.continuous = true;
      rec.interimResults = true;
      rec.onresult = (e) => {
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const t = e.results[i][0].transcript || '';
          if (WAKE_PATTERNS.some(p => p.test(t))) { stopWakeWord(); onWake && onWake(); return; }
        }
      };
      rec.onerror = (e) => {
        const err = e.error || 'error';
        // Permission denied → give up entirely; transient errors just restart via onend.
        if (err === 'not-allowed' || err === 'service-not-allowed') { wakeWanted = false; onError && onError(err); }
      };
      rec.onend = () => { if (wakeRec === rec) wakeRec = null; const w = wakeWaiters.splice(0); w.forEach(f => f()); if (wakeWanted) setTimeout(run, 400); };
      wakeRec = rec;
      rec.start();
    } catch { if (wakeWanted) setTimeout(run, 1200); }
  };
  run();
  return true;
}

// Resolves once the wake recognizer has really let go of the mic (browsers allow one
// recognizer at a time — starting the next one early makes it fail with "aborted").
const wakeWaiters = [];
export function stopWakeWord() {
  wakeWanted = false;
  const rec = wakeRec;
  if (!rec) return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => { clearTimeout(t); resolve(); };
    const t = setTimeout(() => { const i = wakeWaiters.indexOf(done); if (i >= 0) wakeWaiters.splice(i, 1); if (wakeRec === rec) wakeRec = null; resolve(); }, 700);
    wakeWaiters.push(done);
    try { rec.abort(); } catch { done(); }
  });
}
export function wakeListening() { return !!wakeRec; }

// Strip markdown (and emoji) so the spoken version sounds natural — no reading
// out "dash dash dash", "hash", pipes, or emoji names.
function stripForSpeech(md) {
  return String(md || '')
    .replace(/```[\s\S]*?```/g, ' (code) ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')                 // links → link text
    .replace(/^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/gm, ' ') // table delimiter rows
    .replace(/^\s{0,3}([-*_])\1{2,}\s*$/gm, ' ')             // horizontal rules --- *** ___
    .replace(/^[ \t]*([-*+]|\d+[.)])\s+/gm, '')              // list bullets / numbers at line start
    .replace(/\s*\|\s*/g, ', ')                              // remaining table pipes → comma pause
    .replace(/[*_#>~]/g, ' ')                                // emphasis / heading / quote marks
    .replace(/\p{Extended_Pictographic}️?/gu, ' ')      // emoji (👋, ✅, …) — don't read their names
    .replace(/(^|\s)[-–—]+(?=\s|$)/g, '$1 ')                 // standalone dash runs between words
    .replace(/\n{2,}/g, '. ')
    .replace(/\n/g, ' ')
    .replace(/\s+([.,!?;:])/g, '$1')                         // tidy space before punctuation
    .replace(/([.,])\1+/g, '$1')                             // collapse ".." / ",,"
    .replace(/\s{2,}/g, ' ')
    .trim();
}

// ---- Voice selection ----
// The browser default is usually the most robotic one available. Prefer the
// higher-quality neural/premium voices most systems ship with.
const VOICE_KEY = 'tts.voice';
const PREFERRED = [
  /google\s+(uk|us)?\s*english/i, /natural/i, /premium/i, /enhanced/i,
  /samantha/i, /ava/i, /allison/i, /aria/i, /jenny/i, /guy/i, /siri/i, /alex/i,
];

export function listVoices() {
  if (!ttsSupported()) return [];
  try { return window.speechSynthesis.getVoices() || []; } catch { return []; }
}
// getVoices() populates asynchronously in Chrome — call back when ready.
export function onVoicesReady(cb) {
  if (!ttsSupported()) return () => {};
  if (listVoices().length) { cb(listVoices()); return () => {}; }
  const h = () => cb(listVoices());
  window.speechSynthesis.addEventListener('voiceschanged', h);
  return () => window.speechSynthesis.removeEventListener('voiceschanged', h);
}
export function getVoiceName() { try { return localStorage.getItem(VOICE_KEY) || ''; } catch { return ''; } }
export function setVoiceName(name) { try { localStorage.setItem(VOICE_KEY, name || ''); } catch { /* noop */ } }

export function pickVoice() {
  const voices = listVoices();
  if (!voices.length) return null;
  const saved = getVoiceName();
  if (saved) { const v = voices.find(x => x.name === saved); if (v) return v; }
  const lang = getSpeechLang().slice(0, 2).toLowerCase();
  const mine = voices.filter(v => (v.lang || '').toLowerCase().startsWith(lang));
  const pool = mine.length ? mine : voices;
  for (const p of PREFERRED) { const v = pool.find(x => p.test(x.name)); if (v) return v; }
  return pool.find(v => v.default) || pool[0] || null;
}

function makeUtterance(text) {
  const u = new SpeechSynthesisUtterance(text.slice(0, 4000));
  const v = pickVoice();
  if (v) { u.voice = v; u.lang = v.lang || getSpeechLang(); }
  else u.lang = getSpeechLang();
  u.rate = 1.05; u.pitch = 1.02;
  return u;
}

// Chrome drops utterances that nothing references (their onend never fires), sometimes
// never fires onend at all, and can sit "paused" after the tab was in the background.
// So: hold a reference until it ends, resume before speaking, and a watchdog calls onEnd
// if the browser never does — otherwise the orb would wait forever and never listen.
const live = new Set();
let queuedMs = 0;   // rough length of what's already queued, so later watchdogs wait their turn
const estimateMs = (t) => 1200 + t.length * 85;

// Queue a chunk WITHOUT cancelling what's already speaking — lets us start talking
// on the first sentence while the rest of the reply is still streaming in.
export function speakChunk(text, { onEnd } = {}) {
  if (!ttsSupported()) { onEnd && onEnd(); return; }
  const clean = stripForSpeech(text);
  if (!clean) { onEnd && onEnd(); return; }
  let ended = false, dog = null;
  const est = estimateMs(clean);
  const finish = () => {
    if (ended) return; ended = true;
    clearTimeout(dog); live.delete(u);
    queuedMs = Math.max(0, queuedMs - est);
    onEnd && onEnd();
  };
  let u;
  try {
    u = makeUtterance(clean);
    u.onend = finish;
    u.onerror = finish;
    live.add(u);
    dog = setTimeout(finish, queuedMs + est + 4000);
    queuedMs += est;
    const ss = window.speechSynthesis;
    if (ss.paused) ss.resume();
    ss.speak(u);
  } catch { finish(); }
}

// One-shot: cancel anything queued, then speak.
export function speak(text, { onEnd } = {}) {
  if (!ttsSupported()) { onEnd && onEnd(); return; }
  const clean = stripForSpeech(text);
  if (!clean) { onEnd && onEnd(); return; }
  try { window.speechSynthesis.cancel(); } catch { /* noop */ }
  speakChunk(clean, { onEnd });
}

export function cancelSpeak() {
  try { if (ttsSupported()) window.speechSynthesis.cancel(); } catch { /* noop */ }
  queuedMs = 0;
}
export function isSpeaking() { try { return ttsSupported() && window.speechSynthesis.speaking; } catch { return false; } }

// A short two-note "I'm listening" cue (Web Audio — instant, unlike speech).
let cueCtx = null;
export function listenCue(up = true) {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    cueCtx = cueCtx || new Ctx();
    if (cueCtx.state === 'suspended') cueCtx.resume();
    const now = cueCtx.currentTime;
    (up ? [587, 880] : [880, 587]).forEach((f, i) => {
      const o = cueCtx.createOscillator(), g = cueCtx.createGain();
      o.type = 'sine'; o.frequency.value = f;
      const t = now + i * 0.08;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.12, t + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
      o.connect(g).connect(cueCtx.destination);
      o.start(t); o.stop(t + 0.16);
    });
  } catch { /* no-op */ }
}
