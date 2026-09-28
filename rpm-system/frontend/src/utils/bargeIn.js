// Talking over the orb ("barge-in"). While it speaks, the mic also hears the orb's OWN
// voice (no headphones → the speakers leak into the mic), so every phrase the recognizer
// hears is checked against what the orb is saying: only speech that isn't its own echo
// counts as you interrupting. Pure — unit-tested in bargeIn.test.js.

// Said on its own, these always mean "stop talking" — unless the orb itself is saying them.
const KEYWORDS = ['stop', 'wait', 'hold on', 'hang on', 'pause', 'jarvis', 'cancel', 'enough', 'quiet', 'shut up', 'actually', 'no no', 'excuse me'];

const norm = (s) => String(s || '')
  .toLowerCase()
  .normalize('NFKD').replace(/[̀-ͯ]/g, '')
  .replace(/[^\p{L}\p{N}\s']/gu, ' ')
  .replace(/\s+/g, ' ')
  .trim();

// heard: one phrase from the recognizer. spoken: everything the orb has said aloud this reply.
export function isBargeIn(heard, spoken) {
  const h = norm(heard);
  if (!h) return false;
  const sp = ` ${norm(spoken)} `;
  const padded = ` ${h} `;
  if (KEYWORDS.some(k => padded.includes(` ${k} `) && !sp.includes(` ${k} `))) return true;
  const words = h.split(' ');
  if (words.length < 3) return false;                 // too short to tell apart from noise or echo
  const said = new Set(sp.trim().split(' '));
  const novel = words.filter(w => !said.has(w)).length;
  return novel / words.length >= 0.5;                 // mostly words the orb isn't saying → it's you
}

// Just "stop" / "wait" — an interruption with nothing to act on.
export function isOnlyStop(text) {
  const h = norm(text);
  return !!h && /^((please|ok|okay|jarvis|no)\s+)*(stop|wait|hold on|hang on|pause|cancel|enough|quiet|shut up|be quiet|stop talking|that's enough)(\s+(please|jarvis|now|it|a second|a sec))*$/.test(h);
}
