// Pure helpers for the coach UI (no React, no I/O).

export const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
// Mon-first order for the day chips (values are 0=Sun … 6=Sat, as the API stores them).
export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

export const BRIEF_ME = 'Brief me on this area — what should I do right now, given today\'s tasks and anything slipping?';

// "1,5" | [1,5] | null → sorted unique [1,5] (null/undefined → the API default Mon & Fri).
export function parseDays(v) {
  if (v === null || v === undefined) return [1, 5];
  const raw = Array.isArray(v) ? v : String(v).split(',');
  const out = [];
  for (const x of raw) {
    if (String(x).trim() === '') continue;
    const n = Number(x);
    if (Number.isInteger(n) && n >= 0 && n <= 6 && !out.includes(n)) out.push(n);
  }
  return out.sort((a, b) => WEEK_ORDER.indexOf(a) - WEEK_ORDER.indexOf(b));
}

function joinAnd(list) {
  if (list.length <= 1) return list.join('');
  return `${list.slice(0, -1).join(', ')} & ${list[list.length - 1]}`;
}

// "Checks in Mon & Fri · 08:30" / "Checks in daily · 08:30" / "Check-ins off".
export function scheduleLabel(coach) {
  if (!coach || coach.proactive === false) return 'Check-ins off';
  const days = parseDays(coach.checkin_days);
  const time = coach.checkin_time || '08:30';
  if (!days.length) return `Follow-ups · ${coach.followup_time || '18:00'}`;
  let when;
  if (days.length === 7) when = 'daily';
  else if (days.length === 5 && [1, 2, 3, 4, 5].every(d => days.includes(d))) when = 'weekdays';
  else when = joinAnd(days.map(d => DAY_SHORT[d]));
  return `Checks in ${when} · ${time}`;
}

export const CHECKIN_LABEL = { plan: 'Weekly plan', review: 'Weekly review', nudge: 'Check-in' };
export const FOLLOWUP_OUTCOME = { d: 'Done', t: 'Moved to tomorrow', x: 'Dropped' };

// Compact relative time: "just now", "5m", "3h", "yesterday", "Sep 21".
export function relTime(iso, now = Date.now()) {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 2 * 86400) return 'yesterday';
  if (s < 7 * 86400) return `${Math.floor(s / 86400)}d ago`;
  return new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// Day divider label for the thread.
export function dayLabel(iso, now = new Date()) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const key = (x) => `${x.getFullYear()}-${x.getMonth()}-${x.getDate()}`;
  if (key(d) === key(now)) return 'Today';
  const y = new Date(now); y.setDate(y.getDate() - 1);
  if (key(d) === key(y)) return 'Yesterday';
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

// One-line plain-text preview of a (markdown) message.
export function previewText(s, max = 140) {
  const flat = String(s || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[*_`#>]+/g, '')
    .replace(/\[(.*?)\]\(.*?\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
  return flat.length > max ? `${flat.slice(0, max - 1).trimEnd()}…` : flat;
}

// Lines of a structured message's text that aren't the bullet list the structured
// part (follow-up rows / alert items) already renders.
export function proseLines(content) {
  return String(content || '').split('\n').filter(l => !/^\s*[•\-*]\s+/.test(l)).join('\n').trim();
}

export const localToday = () => {
  const n = new Date(); const p = (x) => String(x).padStart(2, '0');
  return `${n.getFullYear()}-${p(n.getMonth() + 1)}-${p(n.getDate())}`;
};

// The message sent when the user asks the coach to fix a list of problems.
export const fixPrompt = (lines) => `Help me fix these:\n${lines.map(l => `- ${l}`).join('\n')}\n\nSuggest concrete changes I can approve.`;
