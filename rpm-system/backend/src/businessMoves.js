// Business intelligence, pure functions (no I/O): how rows link to each other (lead source → channel,
// fix → offer, result channel → revenue-model channel) and the ranked "next best moves" computed from a
// user's business data. /api/business/summary calls these; the tests call them directly.

const DAY = 86400000;
const dayNum = (iso) => Math.floor(Date.parse(`${String(iso).slice(0, 10)}T12:00:00Z`) / DAY);
const addDays = (iso, n) => new Date((dayNum(iso) + n) * DAY + 12 * 3600000).toISOString().slice(0, 10);
const isoOf = (v) => {
  if (!v) return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.toISOString().slice(0, 10);
  const s = String(v);
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null;
};

const OPEN = new Set(['identified', 'contacted', 'replied', 'call', 'pilot']);
// Days a lead may sit in a stage before it counts as stuck.
const STUCK_DAYS = { identified: 7, contacted: 5, replied: 3, call: 4, pilot: 14 };
const STAGE_LABEL = { identified: 'Identified', contacted: 'Contacted', replied: 'Replied', call: 'Call', pilot: 'Pilot' };
const ROLE = { dm_sent: 'sent', proposal: 'sent', reply: 'reply', call: 'call', delivered: 'proof', case_study: 'proof', won: 'won', lost: 'lost', content: 'content', note: 'note' };

// ───────── matching ─────────
const STOP = new Set(['your', 'the', 'and', 'for', 'with', 'from', 'community', 'members', 'group', 'page', 'live', 'real', 'one',
  'service', 'services', 'free', 'install', 'partner', 'partners', 'after', 'that', 'this', 'into', 'ai', 'app', 'auto']);
/** Lower-case word tokens of length ≥ 3 that carry meaning (brand / channel words). */
function tokens(s) {
  return String(s || '').toLowerCase().replace(/[@#]/g, ' ').split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 3 && !STOP.has(w));
}
const overlap = (a, b) => { const B = new Set(b); return a.filter((w) => B.has(w)).length; };

/** The channel a lead came from: the channel sharing the most words with the lead's source. */
function matchChannel(source, channels) {
  const t = tokens(source);
  if (!t.length) return null;
  let best = null; let bestN = 0;
  for (const c of channels || []) {
    const n = overlap(t, tokens(c.name));
    if (n > bestN) { best = c; bestN = n; }
  }
  return best ? best.id : null;
}

/** Offers a fix probably blocks: an explicit offer_id wins; otherwise offers whose product (or name)
 *  shares a distinctive word with the fix text, e.g. "LeadWave" in both. Returns offer ids. */
function suggestOffers(fix, offers) {
  if (fix.offer_id) return [fix.offer_id];
  const t = tokens(`${fix.text} ${fix.detail || ''}`);
  if (!t.length) return [];
  return (offers || []).filter((o) => overlap(t, tokens(`${o.product} ${o.name}`)) > 0).map((o) => o.id);
}

/** Revenue-model channel a result belongs to: same id, same name, or a shared word. */
function matchModel(channel, model) {
  const c = String(channel || '').trim().toLowerCase();
  if (!c) return null;
  const direct = (model || []).find((m) => String(m.id).toLowerCase() === c || String(m.name).toLowerCase() === c);
  if (direct) return direct.id;
  const t = tokens(c);
  let best = null; let bestN = 0;
  for (const m of model || []) {
    const n = overlap(t, tokens(`${m.id} ${m.name}`));
    if (n > bestN) { best = m; bestN = n; }
  }
  return best ? best.id : null;
}

/**
 * THE source of truth for "which offers does each fix block" (a fix may block many offers). Overview,
 * Offers, Fixes and the next best moves all read this, so every page states the same counts.
 * Returns { fixOffers: {fixId: {offers, explicit}}, offerBlockers: {offerId: {fixIds, P0, P1, P2}},
 *           stats: {openFixes, p0Fixes, p0Linked, offersBlocked, offersBlockedByP0} } — open fixes only
 * count as blockers; fixOffers also covers done fixes so their history still reads.
 */
function fixBlocks(fixes = [], offers = []) {
  const known = new Set(offers.map((o) => o.id));
  const fixOffers = {}; const offerBlockers = {};
  const stats = { openFixes: 0, p0Fixes: 0, p0Linked: 0, offersBlocked: 0, offersBlockedByP0: 0 };
  for (const f of fixes) {
    const ids = suggestOffers(f, offers).filter((id) => known.has(id));
    if (ids.length) fixOffers[f.id] = { offers: ids, explicit: !!f.offer_id };
    if (f.done) continue;
    stats.openFixes += 1;
    if (f.severity === 'P0') { stats.p0Fixes += 1; if (ids.length) stats.p0Linked += 1; }
    for (const id of ids) {
      const b = (offerBlockers[id] ||= { fixIds: [], P0: 0, P1: 0, P2: 0 });
      b.fixIds.push(f.id); b[f.severity] = (b[f.severity] || 0) + 1;
    }
  }
  stats.offersBlocked = Object.keys(offerBlockers).length;
  stats.offersBlockedByP0 = Object.values(offerBlockers).filter((b) => b.P0 > 0).length;
  // Readiness the pages show: an offer with any open P0 blocker is never ready, whatever was typed in.
  // effective: 'bad' when a P0 blocks it, else the stored readiness. ready = effective === 'ok'.
  const offerReadiness = {};
  for (const o of offers) {
    const p0 = offerBlockers[o.id]?.P0 || 0;
    offerReadiness[o.id] = { stored: o.readiness || 'warn', effective: p0 ? 'bad' : (o.readiness || 'warn'), p0Blocked: p0 > 0 };
  }
  stats.offers = offers.length;
  stats.offersReady = Object.values(offerReadiness).filter((r) => r.effective === 'ok').length;
  return { fixOffers, offerBlockers, offerReadiness, stats };
}

/** All link maps the flow canvas needs. */
function buildLinks({ leads = [], channels = [], fixes = [], offers = [], model = [], resultChannels = [] }) {
  // A lead whose source IS a channel's name is linked; any other word match is only a guess the owner confirms.
  const leadChannel = {}; const leadChannelGuess = {};
  const norm = (s) => String(s || '').trim().toLowerCase();
  for (const l of leads) {
    const c = matchChannel(l.source, channels);
    if (!c) continue;
    leadChannel[l.id] = c;
    if (norm(l.source) !== norm(channels.find((x) => x.id === c)?.name)) leadChannelGuess[l.id] = true;
  }
  const { fixOffers, offerBlockers, offerReadiness, stats: blockStats } = fixBlocks(fixes, offers);
  const resultModel = {};
  for (const ch of resultChannels) { const m = matchModel(ch, model); if (m) resultModel[ch] = m; }
  return { leadChannel, leadChannelGuess, fixOffers, offerBlockers, offerReadiness, blockStats, resultModel };
}

// ───────── next best moves ─────────
const AGENT_FOR = [[/upwork/i, 'upwork-scout', {}], [/cold|email|outbound|prospect/i, 'prospect-list', {}], [/skool|maker|community/i, 'skool-digest', {}]];
const agentFor = (text) => { const hit = AGENT_FOR.find(([re]) => re.test(text)); return hit ? { job_id: hit[1], inputs: hit[2] } : null; };

/**
 * data: { today, leads, fixes, offers, model, results: [{type, channel, n, cash}], cash: {current_value,
 *   target_value, title} | null, deadline, start, currency }
 * Returns moves sorted by score (highest first): { id, kind, tone, score, title, detail, entity, action }.
 */
function computeMoves(data) {
  const today = data.today;
  const moves = [];
  const leads = (data.leads || []).filter((l) => OPEN.has(l.stage));
  const cur = data.currency || 'EUR';
  const money = (v) => `${cur === 'EUR' ? '€' : `${cur} `}${Math.round(v).toLocaleString('en-US')}`;

  // 1 · follow-ups that are overdue or due today
  const overdue = [];
  for (const l of leads) {
    const nc = isoOf(l.next_contact);
    if (!nc) continue;
    const late = dayNum(today) - dayNum(nc);
    if (late > 0) overdue.push({ l, late });
    else if (late === 0) {
      moves.push({
        id: `due:${l.id}`, kind: 'due_today', tone: 'warn', score: 70 + (l.fit || 2) * 3,
        title: `Contact ${l.name} today`, detail: l.next_step || `${STAGE_LABEL[l.stage]} · next contact is today`,
        entity: { type: 'lead', id: l.id },
        action: l.action_id ? { type: 'open', label: 'Open lead', view: 'leads', id: l.id } : { type: 'follow_up', label: 'Put on Today', lead_id: l.id, date: today },
      });
    }
  }
  overdue.sort((a, b) => b.late - a.late || (b.l.fit || 2) - (a.l.fit || 2));
  if (overdue.length > 3) {
    moves.push({
      id: 'overdue:group', kind: 'overdue', tone: 'bad', score: 92,
      title: `${overdue.length} follow-ups are overdue`, detail: overdue.slice(0, 3).map((o) => `${o.l.name} (${o.late}d)`).join(' · '),
      entity: { type: 'leads', ids: overdue.map((o) => o.l.id) }, action: { type: 'open', label: 'Show overdue', view: 'leads', filter: 'attention' },
    });
  } else {
    for (const { l, late } of overdue) {
      moves.push({
        id: `overdue:${l.id}`, kind: 'overdue', tone: 'bad', score: 85 + Math.min(late, 10) + (l.fit || 2),
        title: `Follow up with ${l.name}`, detail: `${late} day${late === 1 ? '' : 's'} overdue${l.next_step ? ` · ${l.next_step}` : ''}`,
        entity: { type: 'lead', id: l.id }, action: { type: 'follow_up', label: 'Put on Today', lead_id: l.id, date: today },
      });
    }
  }

  // 2 · leads stuck in a stage
  const stuck = [];
  for (const l of leads) {
    const since = isoOf(l.stage_changed_at) || isoOf(l.created_at);
    if (!since) continue;
    const age = dayNum(today) - dayNum(since);
    if (age > (STUCK_DAYS[l.stage] ?? 7)) stuck.push({ l, age });
  }
  stuck.sort((a, b) => b.age - a.age);
  if (stuck.length > 2) {
    const stage = stuck[0].l.stage;
    moves.push({
      id: 'stuck:group', kind: 'stuck', tone: 'warn', score: 66,
      title: `${stuck.length} leads stuck — oldest ${stuck[0].age} days in ${STAGE_LABEL[stage]}`,
      detail: stuck.slice(0, 3).map((s) => s.l.name).join(' · '),
      entity: { type: 'leads', ids: stuck.map((s) => s.l.id) }, action: { type: 'open', label: 'Show stuck leads', view: 'leads', filter: 'attention' },
    });
  } else {
    for (const { l, age } of stuck) {
      moves.push({
        id: `stuck:${l.id}`, kind: 'stuck', tone: 'warn', score: 60 + Math.min(age, 20) / 2,
        title: `${l.name} has sat in ${STAGE_LABEL[l.stage]} for ${age} days`, detail: l.next_step || 'Move it forward or mark it lost.',
        entity: { type: 'lead', id: l.id }, action: { type: 'follow_up', label: 'Nudge today', lead_id: l.id, date: today },
      });
    }
  }

  // 3 · active leads without a next contact date
  for (const l of leads.filter((x) => x.stage !== 'identified' && !x.next_contact)) {
    moves.push({
      id: `nodate:${l.id}`, kind: 'no_date', tone: 'info', score: 50 + (l.fit || 2) * 2,
      title: `${l.name} has no next contact`, detail: `${STAGE_LABEL[l.stage]} — set a date so it can't go cold.`,
      entity: { type: 'lead', id: l.id }, action: { type: 'set_next_contact', label: 'Set for +2 days', lead_id: l.id, date: addDays(today, 2) },
    });
  }

  // 4 · pipeline never started
  const identified = leads.filter((l) => l.stage === 'identified');
  if (identified.length >= 3 && identified.length === leads.length) {
    const top = [...identified].sort((a, b) => (b.fit || 2) - (a.fit || 2)).slice(0, 3);
    moves.push({
      id: 'pipeline:start', kind: 'pipeline', tone: 'warn', score: 80,
      title: `${identified.length} leads identified, none contacted yet`,
      detail: `Start with the strongest fits: ${top.map((l) => l.name).join(', ')}.`,
      entity: { type: 'leads', ids: top.map((l) => l.id) }, action: { type: 'open', label: 'Open the board', view: 'leads', filter: 'identified' },
    });
  }
  if (!leads.length && !(data.leads || []).length) {
    moves.push({
      id: 'pipeline:empty', kind: 'pipeline', tone: 'warn', score: 78, title: 'No leads in the pipeline',
      detail: 'Queue a prospect list or add the people you already know.', entity: null,
      action: { type: 'queue_agent', label: 'Queue a prospect list', job_id: 'prospect-list', inputs: {} },
    });
  }

  // 5 · P0 fixes blocking an offer
  const offersById = Object.fromEntries((data.offers || []).map((o) => [o.id, o]));
  const p0 = (data.fixes || []).filter((f) => !f.done && f.severity === 'P0');
  const p0Linked = [];
  const { fixOffers } = fixBlocks(data.fixes || [], data.offers || []);
  for (const f of p0) {
    const offerIds = fixOffers[f.id]?.offers || [];
    if (offerIds.length) p0Linked.push({ f, offers: offerIds.map((id) => offersById[id]) });
  }
  for (const { f, offers } of p0Linked.slice(0, 3)) {
    moves.push({
      id: `p0:${f.id}`, kind: 'blocker', tone: 'bad', score: 88,
      title: `P0 blocks ${offers.map((o) => o.name).join(' + ')}`, detail: f.text,
      entity: { type: 'fix', id: f.id, offers: offers.map((o) => o.id) },
      action: f.action_id ? { type: 'open', label: 'Open fixes', view: 'fixes', id: f.id } : { type: 'fix_to_rpm', label: 'Put on Today', fix_id: f.id, date: today },
    });
  }
  const unlinked = p0.length - p0Linked.length;
  if (unlinked > 0) {
    moves.push({
      id: 'p0:rest', kind: 'blocker', tone: 'warn', score: 64,
      title: `${unlinked} more P0 fix${unlinked === 1 ? '' : 'es'} open`, detail: 'P0 means it blocks money. Link each one to the offer it blocks.',
      entity: { type: 'fixes' }, action: { type: 'open', label: 'Open fixes', view: 'fixes', filter: 'P0' },
    });
  }

  // 6 · cash pace vs deadline (straight line from start to deadline)
  const cash = data.cash;
  if (cash && cash.target_value > 0 && data.deadline && data.start) {
    const total = Math.max(1, dayNum(data.deadline) - dayNum(data.start));
    const elapsed = Math.min(total, Math.max(0, dayNum(today) - dayNum(data.start)));
    const left = dayNum(data.deadline) - dayNum(today);
    const expected = cash.target_value * (elapsed / total);
    const gap = cash.target_value - cash.current_value;
    if (gap > 0) {
      const weeksLeft = Math.max(1, left / 7);
      const behind = expected - cash.current_value;
      const tone = left < 0 ? 'bad' : behind > cash.target_value * 0.15 ? 'bad' : behind > 0 ? 'warn' : 'info';
      moves.push({
        id: 'cash:pace', kind: 'cash', tone, score: tone === 'bad' ? 90 : tone === 'warn' ? 72 : 40,
        title: left < 0 ? `Deadline passed — ${money(gap)} still missing`
          : behind > 0 ? `Cash is ${money(behind)} behind pace` : `Cash is on pace — ${money(gap)} to go`,
        detail: left < 0 ? `${cash.title || 'Cash'} ${money(cash.current_value)} of ${money(cash.target_value)}.`
          : `${money(cash.current_value)} of ${money(cash.target_value)} · needs ${money(gap / weeksLeft)}/week for ${Math.ceil(left / 7)} weeks.`,
        entity: { type: 'cash' }, action: { type: 'open', label: 'Open revenue model', view: 'revenue' },
      });
    }
  }

  // 7 · funnel bottleneck vs the revenue model (attempts per model channel vs a straight-line pace)
  const model = data.model || [];
  if (model.length && data.deadline && data.start) {
    const totalWeeks = Math.max(1, Math.ceil((dayNum(data.deadline) - dayNum(data.start)) / 7));
    const weekNow = Math.max(1, Math.floor((dayNum(today) - dayNum(data.start)) / 7) + 1);
    const sentBy = {};
    for (const r of data.results || []) {
      if (ROLE[r.type] !== 'sent') continue;
      const m = matchModel(r.channel, model);
      if (m) sentBy[m] = (sentBy[m] || 0) + Number(r.n || 0);
    }
    let worst = null;
    for (const m of model) {
      const sw = Number(m.startsWeek) || 1;
      const active = weekNow - sw + 1;
      if (active <= 0 || !(Number(m.volume) > 0)) continue;
      const expected = Number(m.volume) * Math.min(1, active / Math.max(1, totalWeeks - sw + 1));
      const actual = sentBy[m.id] || 0;
      if (expected >= 2 && actual < expected * 0.5) {
        const ratio = actual / expected;
        if (!worst || ratio < worst.ratio) worst = { m, expected, actual, ratio };
      }
    }
    if (worst) {
      const agent = agentFor(`${worst.m.id} ${worst.m.name}`);
      moves.push({
        id: `model:${worst.m.id}`, kind: 'bottleneck', tone: 'warn', score: 76,
        title: `Bottleneck: ${worst.m.name}`, detail: `${worst.actual} of ~${Math.round(worst.expected)} ${worst.m.unit || 'attempts'} expected by now in the revenue model.`,
        entity: { type: 'model', id: worst.m.id },
        action: agent ? { type: 'queue_agent', label: 'Queue the agent', ...agent } : { type: 'log_result', label: 'Log attempts', prefill: { type: 'dm_sent', channel: worst.m.id } },
      });
    }
  }

  // 8 · reply rate far below a sane floor once there is volume
  const tot = { sent: 0, reply: 0 };
  for (const r of data.results || []) { const role = ROLE[r.type]; if (role === 'sent' || role === 'reply') tot[role] += Number(r.n || 0); }
  if (tot.sent >= 15 && tot.reply / tot.sent < 0.05) {
    moves.push({
      id: 'funnel:reply', kind: 'bottleneck', tone: 'warn', score: 68,
      title: `Reply rate ${Math.round((tot.reply / tot.sent) * 100)}% on ${tot.sent} messages`, detail: 'The first line is the bottleneck — rewrite it in your offer.',
      entity: { type: 'funnel', step: 'reply' }, action: { type: 'open', label: 'Open offers', view: 'offers' },
    });
  }

  const seen = new Set();
  return moves.filter((m) => (seen.has(m.id) ? false : seen.add(m.id))).sort((a, b) => b.score - a.score);
}

module.exports = { computeMoves, buildLinks, fixBlocks, matchChannel, suggestOffers, matchModel, tokens, addDays, STUCK_DAYS };
