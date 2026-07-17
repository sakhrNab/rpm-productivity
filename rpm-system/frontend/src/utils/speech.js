// Browser speech helpers for the voice ("Jarvis") assistant.
// STT via SpeechRecognition, TTS via speechSynthesis. All no-op-safe if unsupported.

export function sttSupported() {
  return typeof window !== 'undefined' && !!(window.SpeechRecognition || window.webkitSpeechRecognition);
}
export function ttsSupported() {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

let recognition = null;

// Listen for one utterance. onInterim(text) streams the live transcript;
// onFinal(text) fires with the settled transcript when speech ends.
export function startListening({ onInterim, onFinal, onEnd, onError } = {}) {
  const SR = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition);
  if (!SR) { onError && onError('unsupported'); return null; }
  try {
    const rec = new SR();
    rec.lang = navigator.language || 'en-US';
    rec.interimResults = true;
    rec.continuous = false;
    let finalText = '';
    rec.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) finalText += t; else interim += t;
      }
      if (onInterim) onInterim((finalText + ' ' + interim).trim());
    };
    rec.onerror = (e) => { onError && onError(e.error || 'error'); };
    rec.onend = () => { onFinal && onFinal(finalText.trim()); onEnd && onEnd(); };
    recognition = rec;
    rec.start();
    return rec;
  } catch (e) { onError && onError(e.message || 'error'); return null; }
}

export function stopListening() { try { recognition && recognition.stop(); } catch { /* noop */ } }

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
      rec.lang = navigator.language || 'en-US';
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
      rec.onend = () => { wakeRec = null; if (wakeWanted) setTimeout(run, 400); };
      wakeRec = rec;
      rec.start();
    } catch { if (wakeWanted) setTimeout(run, 1200); }
  };
  run();
  return true;
}

export function stopWakeWord() {
  wakeWanted = false;
  try { wakeRec && wakeRec.stop(); } catch { /* noop */ }
  wakeRec = null;
}

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
  const lang = (navigator.language || 'en-US').slice(0, 2).toLowerCase();
  const mine = voices.filter(v => (v.lang || '').toLowerCase().startsWith(lang));
  const pool = mine.length ? mine : voices;
  for (const p of PREFERRED) { const v = pool.find(x => p.test(x.name)); if (v) return v; }
  return pool.find(v => v.default) || pool[0] || null;
}

function makeUtterance(text) {
  const u = new SpeechSynthesisUtterance(text.slice(0, 4000));
  const v = pickVoice();
  if (v) { u.voice = v; u.lang = v.lang || navigator.language || 'en-US'; }
  else u.lang = navigator.language || 'en-US';
  u.rate = 1.05; u.pitch = 1.02;
  return u;
}

// Queue a chunk WITHOUT cancelling what's already speaking — lets us start talking
// on the first sentence while the rest of the reply is still streaming in.
export function speakChunk(text, { onEnd } = {}) {
  if (!ttsSupported()) { onEnd && onEnd(); return; }
  const clean = stripForSpeech(text);
  if (!clean) { onEnd && onEnd(); return; }
  try {
    const u = makeUtterance(clean);
    u.onend = () => onEnd && onEnd();
    u.onerror = () => onEnd && onEnd();
    window.speechSynthesis.speak(u);
  } catch { onEnd && onEnd(); }
}

// One-shot: cancel anything queued, then speak.
export function speak(text, { onEnd } = {}) {
  if (!ttsSupported()) { onEnd && onEnd(); return; }
  const clean = stripForSpeech(text);
  if (!clean) { onEnd && onEnd(); return; }
  try { window.speechSynthesis.cancel(); } catch { /* noop */ }
  speakChunk(clean, { onEnd });
}

export function cancelSpeak() { try { if (ttsSupported()) window.speechSynthesis.cancel(); } catch { /* noop */ } }
