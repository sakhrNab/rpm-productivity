// A short "Done" cue when an action is completed.
// Uses the built-in speech synthesizer (no audio asset needed); falls back to a
// quick two-tone chime via the Web Audio API if speech isn't available.

let audioCtx = null;

function chime() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    audioCtx = audioCtx || new Ctx();
    const now = audioCtx.currentTime;
    [660, 990].forEach((freq, i) => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const t = now + i * 0.09;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.18, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start(t);
      osc.stop(t + 0.2);
    });
  } catch { /* no-op */ }
}

export function playDone() {
  try {
    if (typeof window === 'undefined') return;
    if ('speechSynthesis' in window) {
      const u = new SpeechSynthesisUtterance('Done');
      u.rate = 1.15;
      u.pitch = 1.05;
      u.volume = 0.9;
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(u);
      // A subtle chime alongside the word for a satisfying cue.
      chime();
      return;
    }
    chime();
  } catch { /* no-op */ }
}
