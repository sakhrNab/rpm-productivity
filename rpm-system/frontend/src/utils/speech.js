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

// Strip markdown so the spoken version sounds natural.
function stripForSpeech(md) {
  return String(md || '')
    .replace(/```[\s\S]*?```/g, ' (code) ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[*_#>|]/g, ' ')
    .replace(/\n{2,}/g, '. ')
    .replace(/\n/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

export function speak(text, { onEnd } = {}) {
  if (!ttsSupported()) { onEnd && onEnd(); return; }
  const clean = stripForSpeech(text);
  if (!clean) { onEnd && onEnd(); return; }
  try {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(clean.slice(0, 4000));
    u.rate = 1.03; u.pitch = 1; u.lang = navigator.language || 'en-US';
    u.onend = () => onEnd && onEnd();
    u.onerror = () => onEnd && onEnd();
    window.speechSynthesis.speak(u);
  } catch { onEnd && onEnd(); }
}

export function cancelSpeak() { try { if (ttsSupported()) window.speechSynthesis.cancel(); } catch { /* noop */ } }
