// Mission capabilities: what a mission step may be. A COPY of the owner's local runner catalogue
// (aiwaverider-plan/dashboard/lib/agents/capabilities.ts) so RPM can validate a plan before anything is queued.
// Keep both files identical in content; the dashboard test compares them when RPM_MISSIONS_CAPS points here.
//
//   risk:  read | draft | paid | outward-read   (a step with `paid` or `outward-read` needs confirmed:true at approval)
//   confirm: { when: {input: value} } narrows a confirmation to one input combination (Google Places only)
//   needsApps: apps the owner's runner must report as connected: leadwave | raven | rpm | browser
//   job: the runner job that executes the step
// Inputs: { key, label, type: 'choice' | 'text', options?, default, max?, pattern? }. Invalid values are REJECTED,
// a missing value takes the default.

const APPS = ['leadwave', 'raven', 'rpm', 'browser'];
const APP_LABEL = { leadwave: 'LeadWave', raven: 'Raven', rpm: 'RPM', browser: 'Browser' };
const RISKS = ['read', 'draft', 'paid', 'outward-read'];
const CITY_PATTERN = "^[\\p{L}\\p{N} .,'-]*$";

const CAPABILITIES = [
  {
    id: 'morning-brief', title: 'Morning brief', job: 'morning-brief', needsApps: ['rpm'], risk: 'read', producesFiles: ['brief.md'],
    what: "Reads today's and this week's RPM actions plus the leads that need a next step, and writes a one-page brief with a suggested top 3.",
    inputs: [],
  },
  {
    id: 'upwork-scout', title: 'Upwork scout', job: 'upwork-scout', needsApps: ['browser'], risk: 'outward-read', producesFiles: ['jobs.md', 'proposal-1..5.md'],
    what: "Reads Upwork 'Best matches' and one search in your logged-in browser, scores each job against your offers and drafts 5 proposals as files. Never submits.",
    inputs: [{ key: 'search', label: 'Search', type: 'choice', default: 'email automation', options: ['best-matches', 'email automation', 'support inbox AI', 'n8n', 'EmailBison'] }],
  },
  {
    id: 'prospect-list', title: 'Prospect list', job: 'prospect-list', needsApps: ['leadwave'], risk: 'draft', producesFiles: ['cost-estimate.md', 'prospects.csv', 'first-lines.md'],
    what: 'Finds businesses for a sector and city with LeadWave, researches the top 10, saves a segment and writes first lines.',
    inputs: [
      { key: 'sector', label: 'Sector', type: 'choice', default: 'support', options: ['bison', 'support', 'realestate', 'dental', 'agencies', 'local'] },
      { key: 'city', label: 'City', type: 'text', default: 'Berlin', max: 60, pattern: CITY_PATTERN },
      { key: 'source', label: 'Source', type: 'choice', default: 'osm', options: ['osm', 'google_places'] },
    ],
    confirm: { when: { source: 'google_places' }, risk: 'paid', text: 'Google Places costs money beyond the free tier ($0.035 per 20 results after 1,000 free searches a month).' },
  },
  {
    id: 'skool-digest', title: 'Skool digest', job: 'skool-digest', needsApps: ['browser'], risk: 'outward-read', producesFiles: ['digest.md', 'reply-drafts.md'],
    what: 'Reads new posts and DMs in your Skool community and Maker School in your logged-in browser, then writes a digest and reply drafts.',
    inputs: [{ key: 'communities', label: 'Communities', type: 'choice', default: 'both', options: ['both', 'awr', 'maker'] }],
  },
  {
    id: 'reply-review', title: 'Reply drafts review', job: 'reply-review', needsApps: ['raven'], risk: 'read', producesFiles: ['reply-quality.md'],
    what: 'Reads Reply Autopilot inboxes, pending drafts and recent emails and writes a quality report. Nothing is sent or edited.',
    inputs: [],
  },
  {
    id: 'rpm-sync', title: 'RPM sync', job: 'rpm-sync', needsApps: ['rpm'], risk: 'draft', producesFiles: ['rpm-drift.md'],
    what: "Compares the plan's fastest path and fix list with your RPM actions, adds the missing ones and writes a drift report.",
    inputs: [],
  },
  {
    id: 'weekly-review', title: 'Weekly review', job: 'weekly-review', needsApps: ['rpm'], risk: 'read', producesFiles: ['weekly-review.md'],
    what: 'Combines the RPM weekly review and goal forecast with the revenue model into a review and a suggested plan for next week.',
    inputs: [],
  },
  {
    id: 'draft-emails', title: 'Draft emails', job: 'draft-emails', needsApps: [], risk: 'draft', producesFiles: ['email-drafts.md', 'first-lines.md'],
    what: 'Turns a lead list (from an earlier step) or your open RPM leads into a first line and a short email draft per lead, as files. Has no tools; nothing is sent.',
    inputs: [
      { key: 'offer', label: 'Offer', type: 'choice', default: 'reply-autopilot', options: ['reply-autopilot', 'leadwave'] },
      { key: 'count', label: 'How many', type: 'choice', default: '5', options: ['3', '5', '10'] },
    ],
  },
  {
    id: 'draft-posts', title: 'Draft posts', job: 'draft-posts', needsApps: [], risk: 'draft', producesFiles: ['post-drafts.md'],
    what: 'Drafts Instagram, TikTok and Skool posts as files from your RPM context and the digest or brief of an earlier step. Has no tools; nothing is posted.',
    inputs: [
      { key: 'platform', label: 'Platform', type: 'choice', default: 'all', options: ['all', 'instagram', 'tiktok', 'skool'] },
      { key: 'topic', label: 'Topic', type: 'text', default: '', max: 60, pattern: CITY_PATTERN },
    ],
  },
];
const CAP = Object.fromEntries(CAPABILITIES.map((c) => [c.id, c]));
const MAX_STEPS = 8;
const KEY_RE = /^[a-z][a-z0-9-]{0,23}$/;

class PlanError extends Error {}

/** Strict: unknown keys and bad values are rejected; a missing/empty value takes the default. */
function cleanCapInputs(cap, raw) {
  if (raw !== undefined && raw !== null && (typeof raw !== 'object' || Array.isArray(raw))) throw new PlanError('inputs must be an object');
  const src = raw || {};
  const known = new Set(cap.inputs.map((f) => f.key));
  for (const k of Object.keys(src)) if (!known.has(k)) throw new PlanError(`${cap.id}: unknown input "${String(k).slice(0, 40)}"`);
  const out = {};
  for (const f of cap.inputs) {
    let v = src[f.key];
    if (v === undefined || v === null || v === '') v = f.default;
    if (typeof v !== 'string') throw new PlanError(`${cap.id}: ${f.label} must be text`);
    v = v.trim();
    if (f.type === 'choice' && !f.options.includes(v)) throw new PlanError(`${cap.id}: ${f.label} must be one of: ${f.options.join(', ')}`);
    if (f.type === 'text') {
      if (v.length > (f.max || 200)) throw new PlanError(`${cap.id}: ${f.label} is too long (max ${f.max || 200})`);
      if (f.pattern && !new RegExp(f.pattern, 'u').test(v)) throw new PlanError(`${cap.id}: ${f.label} has characters that are not allowed`);
    }
    out[f.key] = v;
  }
  return out;
}

/** The risk this step really carries (Google Places turns a draft step into a paid one). */
function effectiveRisk(cap, inputs) {
  if (cap.confirm && Object.entries(cap.confirm.when).every(([k, v]) => inputs[k] === v)) return cap.confirm.risk || 'paid';
  return cap.risk;
}
/** Paid and outward-reading steps need the owner's explicit confirmation. */
function stepNeedsConfirm(cap, inputs) {
  const r = effectiveRisk(cap, inputs);
  return r === 'paid' || r === 'outward-read';
}
const missingApps = (cap, apps) => cap.needsApps.filter((a) => !(apps && apps[a] === true));
/** Capabilities that cannot be handed out given the available apps. */
const blockedCapabilities = (apps, busy = []) => CAPABILITIES
  .filter((c) => c.needsApps.some((a) => !(apps && apps[a] === true) || busy.includes(a))).map((c) => c.id);

/** Validates a plan strictly. Throws PlanError. Returns the cleaned plan. */
function validatePlan(plan) {
  if (!plan || typeof plan !== 'object' || Array.isArray(plan)) throw new PlanError('plan must be an object');
  const summary = typeof plan.summary === 'string' ? plan.summary.trim().slice(0, 800) : '';
  if (!summary) throw new PlanError('plan.summary is required');
  if (!Array.isArray(plan.steps)) throw new PlanError('plan.steps must be a list');
  if (plan.steps.length > MAX_STEPS) throw new PlanError(`a plan has at most ${MAX_STEPS} steps`);
  const keys = new Set();
  const steps = plan.steps.map((s) => {
    if (!s || typeof s !== 'object' || Array.isArray(s)) throw new PlanError('every step must be an object');
    if (typeof s.key !== 'string' || !KEY_RE.test(s.key)) throw new PlanError('step key must be lowercase letters, digits and dashes (max 24)');
    if (keys.has(s.key)) throw new PlanError(`duplicate step key "${s.key}"`);
    keys.add(s.key);
    if (typeof s.capability !== 'string' || !Object.prototype.hasOwnProperty.call(CAP, s.capability)) throw new PlanError(`unknown capability "${String(s.capability).slice(0, 40)}"`);
    const why = typeof s.why === 'string' ? s.why.trim().slice(0, 400) : '';
    if (!why) throw new PlanError(`step "${s.key}" needs a "why"`);
    const deps = s.depends_on === undefined ? [] : s.depends_on;
    if (!Array.isArray(deps) || deps.some((d) => typeof d !== 'string')) throw new PlanError(`step "${s.key}": depends_on must be a list of step keys`);
    return { key: s.key, capability: s.capability, inputs: cleanCapInputs(CAP[s.capability], s.inputs), why, depends_on: [...new Set(deps)] };
  });
  for (const s of steps) for (const d of s.depends_on) {
    if (!keys.has(d)) throw new PlanError(`step "${s.key}" depends on unknown step "${d}"`);
    if (d === s.key) throw new PlanError(`step "${s.key}" depends on itself`);
  }
  // acyclic (Kahn)
  const left = new Map(steps.map((s) => [s.key, new Set(s.depends_on)]));
  for (let progress = true; left.size && progress;) {
    progress = false;
    for (const [k, d] of [...left]) if (d.size === 0) { left.delete(k); for (const o of left.values()) o.delete(k); progress = true; }
  }
  if (left.size) throw new PlanError('the plan has a dependency cycle');
  return { summary, steps };
}

const publicCatalogue = () => CAPABILITIES.map((c) => ({ ...c }));

module.exports = { CAPABILITIES, CAP, APPS, APP_LABEL, RISKS, MAX_STEPS, KEY_RE, PlanError, cleanCapInputs, effectiveRisk, stepNeedsConfirm, missingApps, blockedCapabilities, validatePlan, publicCatalogue };
