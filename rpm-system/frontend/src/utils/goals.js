// An area's goals field is plain text, one goal per line. A goal is ticked off with a
// markdown-task prefix — "[x] Launch the waitlist" — so the text stays readable everywhere
// it's shown as-is (the editor, the AI context, the coaches).

const TASK = /^\s*(?:[•\-*]+\s*)?\[( |x|X)\]\s*/;
const BULLET = /^\s*(?:[•\-*]+|\d+[.)])\s*/;

// → [{ text, done, line }] — `line` is the goal's index among the raw lines, for toggling.
export function parseGoals(text) {
  const out = [];
  String(text || '').split('\n').forEach((raw, line) => {
    const m = raw.match(TASK);
    const body = (m ? raw.slice(m[0].length) : raw.replace(BULLET, '')).trim();
    if (body) out.push({ text: body, done: !!m && m[1] !== ' ', line });
  });
  return out;
}

// Flip one goal (by raw line index); every other line is kept byte for byte.
export function toggleGoal(text, line) {
  const lines = String(text || '').split('\n');
  const raw = lines[line];
  if (raw == null) return String(text || '');
  const m = raw.match(TASK);
  const done = !!m && m[1] !== ' ';
  const body = (m ? raw.slice(m[0].length) : raw.replace(BULLET, '')).trim();
  if (!body) return lines.join('\n');
  lines[line] = done ? body : `[x] ${body}`;
  return lines.join('\n');
}
