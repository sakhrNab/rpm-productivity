// Business module: section list, field specs for the shared editor, and small pure helpers.

export const STAGES = [
  { value: 'identified', label: 'Identified' },
  { value: 'contacted', label: 'Contacted' },
  { value: 'replied', label: 'Replied' },
  { value: 'call', label: 'Call' },
  { value: 'pilot', label: 'Pilot' },
  { value: 'paid', label: 'Paid' },
  { value: 'lost', label: 'Lost' },
];
export const stageLabel = (v) => STAGES.find((s) => s.value === v)?.label || v;

export const RESULT_TYPES = [
  { value: 'dm_sent', label: 'Message sent', countable: true },
  { value: 'proposal', label: 'Proposal sent', countable: true },
  { value: 'reply', label: 'Reply', countable: true },
  { value: 'call', label: 'Call booked', countable: true },
  { value: 'delivered', label: 'Pilot delivered', countable: true },
  { value: 'case_study', label: 'Case study', countable: true },
  { value: 'won', label: 'Deal won' },
  { value: 'lost', label: 'Lost', countable: true },
  { value: 'content', label: 'Content posted' },
  { value: 'note', label: 'Note' },
];
export const resultLabel = (v) => RESULT_TYPES.find((t) => t.value === v)?.label || v;

const TONE_OPTS = [
  { value: 'ok', label: 'Good' }, { value: 'warn', label: 'Needs work' }, { value: 'bad', label: 'Blocked' }, { value: 'info', label: 'Info' },
];
export const TONE_CHIP = { ok: 'good', warn: 'warn', bad: 'bad', info: 'info' };
export const toneLabel = (v) => TONE_OPTS.find((t) => t.value === v)?.label || v;

// Field specs: { k, label, type, options?, keys?, hint?, wide? }
// types: text | textarea | date | number | enum | bool | list (one per line) | rows (a | b | c per line) | pairs (object)
export const FIELDS = {
  leads: [
    { k: 'name', label: 'Name', type: 'text', required: true, hero: true, wide: true },
    { k: 'stage', label: 'Stage', type: 'enum', options: STAGES },
    { k: 'fit', label: 'Fit', type: 'enum', options: [{ value: 3, label: 'Strong fit' }, { value: 2, label: 'Maybe' }, { value: 1, label: 'Long shot' }] },
    { k: 'source', label: 'Source', type: 'text' },
    { k: 'offer', label: 'Offer', type: 'text' },
    { k: 'next_contact', label: 'Next contact', type: 'date' },
    { k: 'next_step', label: 'Next step', type: 'textarea', wide: true, group: 'Next move' },
    { k: 'why', label: 'Why them', type: 'textarea', wide: true, group: 'Context' },
    { k: 'notes', label: 'Notes', type: 'textarea', wide: true, group: 'Context' },
  ],
  offers: [
    { k: 'name', label: 'Name', type: 'text', required: true, hero: true, wide: true },
    { k: 'readiness', label: 'Readiness', type: 'enum', options: TONE_OPTS },
    { k: 'product', label: 'Product', type: 'text' },
    { k: 'for_who', label: 'For who', type: 'text' },
    { k: 'tagline', label: 'Promise', type: 'textarea', wide: true },
    { k: 'readiness_note', label: 'Readiness note', type: 'text', wide: true },
    { k: 'value', group: 'The offer', label: 'Value equation', type: 'pairs', keys: [['dream', 'Dream outcome'], ['likelihood', 'Likelihood'], ['time', 'Time to result'], ['effort', 'Effort for them']], wide: true },
    { k: 'ladder', label: 'Price ladder', type: 'rows', keys: ['step', 'price', 'note'], hint: 'One step per line: step | price | note', wide: true },
    { k: 'guarantee', group: 'Risk reversal', label: 'Guarantee', type: 'textarea', wide: true },
    { k: 'bonuses', label: 'Bonuses', type: 'list', hint: 'One per line', wide: true },
    { k: 'scarcity', label: 'Scarcity', type: 'text', wide: true },
    { k: 'deliverables', label: 'Deliverables', type: 'rows', keys: ['when', 'what', 'form'], hint: 'One per line: when | what | form', wide: true },
    { k: 'first_line', group: 'Selling it', label: 'First line', type: 'textarea', wide: true },
    { k: 'qualify', label: 'Qualify question', type: 'text', wide: true },
    { k: 'weak_spots', label: 'Weak spots', type: 'list', hint: 'One per line', wide: true },
  ],
  products: [
    { k: 'name', label: 'Name', type: 'text', required: true, hero: true, wide: true },
    { k: 'role', label: 'Role', type: 'enum', options: ['paid', 'gift', 'service', 'open-source', 'park'].map((v) => ({ value: v, label: v })) },
    { k: 'what', label: 'What it does', type: 'textarea', wide: true },
    { k: 'status', label: 'Status', type: 'text', wide: true },
    { k: 'price', label: 'Price', type: 'text' },
    { k: 'promised', label: 'Promised to someone', type: 'bool' },
    { k: 'blocker', label: 'Blocker', type: 'textarea', wide: true, group: 'Moving it' },
    { k: 'next_step', label: 'Next step', type: 'text', wide: true },
    { k: 'next_date', label: 'Next step date', type: 'date' },
    { k: 'repo', label: 'Repo / link', type: 'text' },
  ],
  channels: [
    { k: 'name', label: 'Name', type: 'text', required: true, hero: true, wide: true },
    { k: 'tone', label: 'Verdict colour', type: 'enum', options: TONE_OPTS },
    { k: 'stat', label: 'Numbers today', type: 'text', wide: true },
    { k: 'audience', label: 'Audience', type: 'text', wide: true },
    { k: 'verdict', label: 'Verdict', type: 'text', wide: true },
    { k: 'gaps', group: 'Gaps & moves', label: 'Gaps', type: 'list', hint: 'One per line', wide: true },
    { k: 'moves', label: 'Moves', type: 'list', hint: 'One per line', wide: true },
  ],
  fixes: [
    { k: 'text', label: 'Fix', type: 'text', required: true, wide: true, hero: true },
    { k: 'severity', label: 'Severity', type: 'enum', options: [{ value: 'P0', label: 'P0 · blocks money' }, { value: 'P1', label: 'P1 · soon' }, { value: 'P2', label: 'P2 · later' }] },
    { k: 'effort', label: 'Effort', type: 'text' },
    { k: 'offer_id', label: 'Blocks offer', type: 'enum', optionsFrom: 'offers' },
    { k: 'detail', label: 'Detail', type: 'textarea', wide: true },
  ],
  docs: [
    { k: 'path', label: 'Path or URL', type: 'text', required: true, wide: true, hero: true },
    { k: 'status', label: 'Status', type: 'enum', options: ['current', 'superseded', 'obsolete', 'archive'].map((v) => ({ value: v, label: v })) },
    { k: 'date', label: 'Date', type: 'date' },
    { k: 'note', label: 'Note', type: 'textarea', wide: true },
  ],
  content: [
    { k: 'title', label: 'Post idea', type: 'text', required: true, wide: true, hero: true },
    { k: 'date', label: 'Date', type: 'date' },
    { k: 'platform', label: 'Platform', type: 'text' },
    { k: 'status', label: 'Status', type: 'enum', options: ['idea', 'draft', 'ready', 'published'].map((v) => ({ value: v, label: v })) },
    { k: 'goal', label: 'Goal', type: 'enum', options: [{ value: '', label: '—' }, { value: 'proof', label: 'Proof' }, { value: 'community', label: 'Community' }, { value: 'sales', label: 'Sales' }] },
    { k: 'hook', label: 'Hook / angle', type: 'textarea', wide: true },
  ],
};

export const SINGULAR = { leads: 'lead', offers: 'offer', products: 'product', channels: 'channel', fixes: 'fix', docs: 'document', content: 'post', results: 'result' };

// ───── helpers ─────
export const todayStr = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};
export const daysBetween = (from, to) => Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86400000);
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const fmtDate = (iso) => {
  if (!iso) return '';
  const d = new Date(`${String(iso).slice(0, 10)}T12:00:00Z`);
  return Number.isNaN(d.getTime()) ? iso : `${DOW[d.getUTCDay()]} ${d.getUTCDate()} ${MON[d.getUTCMonth()]}`;
};
export const money = (v, currency = 'EUR') => {
  const n = Number(v) || 0;
  try { return new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 0 }).format(n); }
  catch { return `€${Math.round(n).toLocaleString()}`; }
};

export const SCENARIOS = { low: 0.4, base: 1, high: 2.2 };
/** Expected cash per model channel: volume × convert% × ticket. */
export const channelCash = (c) => (Number(c.volume) || 0) * ((Number(c.convert) || 0) / 100) * (Number(c.ticket) || 0);
export const modelTotal = (model, mult = 1) => (model || []).reduce((s, c) => s + channelCash(c) * mult, 0);

// ───── flow helpers (Business "mission flow") ─────
export const OPEN_STAGES = ['identified', 'contacted', 'replied', 'call', 'pilot'];
export const LANES = ['identified', 'contacted', 'replied', 'call', 'pilot', 'paid'];
export const STUCK_DAYS = { identified: 7, contacted: 5, replied: 3, call: 4, pilot: 14 };
export const FIT = { 3: { label: 'Strong fit', tone: 'good', c: '#4ecdc4' }, 2: { label: 'Maybe', tone: 'warn', c: '#ffb74d' }, 1: { label: 'Long shot', tone: 'info', c: '#9575cd' } };
/** Days since the lead entered its stage (stage_changed_at, else created_at). */
export const stageAge = (l, today = todayStr()) => {
  const since = String(l.stage_changed_at || l.created_at || '').slice(0, 10);
  return since ? daysBetween(since, today) : 0;
};
/** Signals for one lead: overdue | today | stuck | nodate (only for open leads). */
export function leadSignals(l, today = todayStr()) {
  const s = {};
  if (!OPEN_STAGES.includes(l.stage)) return s;
  if (l.next_contact) {
    const d = daysBetween(today, l.next_contact);
    if (d < 0) s.overdue = -d; else if (d === 0) s.today = true;
  } else if (l.stage !== 'identified') s.nodate = true;
  const age = stageAge(l, today);
  if (age > (STUCK_DAYS[l.stage] ?? 7)) s.stuck = age;
  return s;
}
export const needsAttention = (l, today) => { const s = leadSignals(l, today); return !!(s.overdue || s.today || s.stuck || s.nodate); };
export const addDaysStr = (iso, n) => {
  const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10);
};
export const READINESS_PCT = { ok: 100, info: 70, warn: 55, bad: 20 };
