// Next best moves + link matching (pure functions behind /api/business/summary).
const test = require('node:test');
const assert = require('node:assert/strict');
const { computeMoves, buildLinks, matchChannel, suggestOffers, matchModel } = require('../src/businessMoves');

const TODAY = '2026-10-08';
const lead = (o) => ({ id: o.name, fit: 2, stage: 'contacted', next_contact: null, stage_changed_at: '2026-10-07T10:00:00Z', created_at: '2026-10-01T10:00:00Z', ...o });
const kinds = (moves) => moves.map((m) => m.id);

test('overdue follow-ups rank first and offer a one-click follow-up for today', () => {
  const moves = computeMoves({ today: TODAY, leads: [lead({ name: 'A', next_contact: '2026-10-05', fit: 3 }), lead({ name: 'B', next_contact: TODAY })] });
  assert.equal(moves[0].id, 'overdue:A');
  assert.equal(moves[0].tone, 'bad');
  assert.match(moves[0].detail, /3 days overdue/);
  assert.deepEqual(moves[0].action, { type: 'follow_up', label: 'Put on Today', lead_id: 'A', date: TODAY });
  assert.ok(kinds(moves).includes('due:B'));
});

test('more than three overdue leads collapse into one grouped move', () => {
  const leads = ['A', 'B', 'C', 'D'].map((n) => lead({ name: n, next_contact: '2026-10-01' }));
  const moves = computeMoves({ today: TODAY, leads });
  assert.equal(moves.filter((m) => m.kind === 'overdue').length, 1);
  assert.equal(moves[0].id, 'overdue:group');
  assert.equal(moves[0].action.filter, 'attention');
});

test('stuck leads use the per-stage threshold; paid and lost leads never produce moves', () => {
  const moves = computeMoves({
    today: TODAY, leads: [
      lead({ name: 'Replied4d', stage: 'replied', next_contact: '2026-10-20', stage_changed_at: '2026-10-04T09:00:00Z' }),
      lead({ name: 'Contacted2d', stage: 'contacted', next_contact: '2026-10-20', stage_changed_at: '2026-10-06T09:00:00Z' }),
      lead({ name: 'Paid', stage: 'paid', next_contact: '2026-09-01' }),
      lead({ name: 'Lost', stage: 'lost', next_contact: '2026-09-01' }),
    ],
  });
  assert.deepEqual(kinds(moves), ['stuck:Replied4d']);
});

test('active leads without a next contact get a +2 days move; identified ones do not', () => {
  const moves = computeMoves({ today: TODAY, leads: [lead({ name: 'C', stage: 'call' }), lead({ name: 'I', stage: 'identified', next_contact: '2026-10-30' })] });
  const m = moves.find((x) => x.id === 'nodate:C');
  assert.equal(m.action.type, 'set_next_contact');
  assert.equal(m.action.date, '2026-10-10');
  assert.ok(!moves.some((x) => x.id === 'nodate:I'));
});

test('an untouched pipeline asks to start with the strongest fits', () => {
  const leads = [lead({ name: 'x', stage: 'identified', fit: 1 }), lead({ name: 'y', stage: 'identified', fit: 3 }), lead({ name: 'z', stage: 'identified' })];
  const m = computeMoves({ today: TODAY, leads }).find((x) => x.id === 'pipeline:start');
  assert.ok(m);
  assert.match(m.detail, /^Start with the strongest fits: y, z, x\.$/);
  assert.equal(computeMoves({ today: TODAY, leads: [], fixes: [] })[0].action.type, 'queue_agent', 'empty pipeline → queue a prospect list');
});

test('P0 fixes wire to the offers they block (explicit link or shared product word)', () => {
  const offers = [{ id: 'o1', name: 'Prospect List Pack', product: 'LeadWave (as a service)' }, { id: 'o2', name: '2-Minute Inbox', product: 'Reply Autopilot' }];
  const fixes = [
    { id: 'f1', severity: 'P0', done: false, text: "Remove AGP section from the live LeadWave page" },
    { id: 'f2', severity: 'P0', done: false, text: 'One real €1 Stripe charge', offer_id: 'o2' },
    { id: 'f3', severity: 'P0', done: true, text: 'LeadWave done already' },
    { id: 'f4', severity: 'P1', done: false, text: 'LeadWave tenant hole' },
    { id: 'f5', severity: 'P0', done: false, text: 'Something unrelated' },
  ];
  assert.deepEqual(suggestOffers(fixes[0], offers), ['o1']);
  assert.deepEqual(suggestOffers(fixes[1], offers), ['o2'], 'explicit wins');
  const moves = computeMoves({ today: TODAY, offers, fixes });
  assert.deepEqual(moves.filter((m) => m.kind === 'blocker').map((m) => m.id), ['p0:f1', 'p0:f2', 'p0:rest']);
  assert.equal(moves.find((m) => m.id === 'p0:f1').title, 'P0 blocks Prospect List Pack');
  assert.equal(moves.find((m) => m.id === 'p0:f1').action.type, 'fix_to_rpm');
  assert.match(moves.find((m) => m.id === 'p0:rest').title, /^1 more P0 fix open$/);
  const links = buildLinks({ fixes, offers });
  assert.deepEqual(links.fixOffers.f2, { offers: ['o2'], explicit: true });
});

test('cash pace: behind a straight line from start to deadline is flagged with the weekly need', () => {
  const base = { today: TODAY, start: '2026-10-01', deadline: '2026-11-29', cash: { title: 'Cash', current_value: 0, target_value: 1500 } };
  const behind = computeMoves(base).find((m) => m.id === 'cash:pace');
  assert.equal(behind.tone, 'warn');
  assert.match(behind.title, /behind pace/);
  assert.match(behind.detail, /needs €\d+\/week/);
  const ahead = computeMoves({ ...base, cash: { ...base.cash, current_value: 600 } }).find((m) => m.id === 'cash:pace');
  assert.equal(ahead.tone, 'info');
  const late = computeMoves({ ...base, today: '2026-12-01' }).find((m) => m.id === 'cash:pace');
  assert.equal(late.tone, 'bad'); assert.match(late.title, /Deadline passed/);
  assert.equal(computeMoves({ ...base, cash: { ...base.cash, current_value: 1500 } }).find((m) => m.id === 'cash:pace'), undefined, 'goal reached → silent');
});

test('funnel bottleneck vs the revenue model points at the agent that fills it', () => {
  const model = [
    { id: 'upwork', name: 'Upwork proposals', unit: 'proposals', volume: 25, convert: 3, ticket: 600, startsWeek: 1 },
    { id: 'social', name: 'Social keyword funnel', unit: 'DMs', volume: 40, convert: 0.5, ticket: 290, startsWeek: 9 },
  ];
  const data = { today: '2026-10-22', start: '2026-10-01', deadline: '2026-11-29', model, results: [{ type: 'proposal', channel: 'Upwork', n: 1 }] };
  const m = computeMoves(data).find((x) => x.kind === 'bottleneck');
  assert.equal(m.id, 'model:upwork');
  assert.equal(m.action.type, 'queue_agent');
  assert.equal(m.action.job_id, 'upwork-scout');
  // on pace → silent
  assert.equal(computeMoves({ ...data, results: [{ type: 'proposal', channel: 'upwork', n: 12 }] }).find((x) => x.kind === 'bottleneck'), undefined);
});

test('matching: lead source → channel, result channel → model channel', () => {
  const channels = [{ id: 'c1', name: 'Skool AI Waverider Community' }, { id: 'c2', name: 'Maker School' }, { id: 'c3', name: 'Upwork' }];
  assert.equal(matchChannel('Your Skool', channels), 'c1');
  assert.equal(matchChannel('Maker School', channels), 'c2');
  assert.equal(matchChannel('upwork', channels), 'c3');
  assert.equal(matchChannel('LinkedIn', channels), null);
  assert.equal(matchChannel('', channels), null);
  const model = [{ id: 'cold', name: 'Cold email (after warmup)' }, { id: 'upwork', name: 'Upwork proposals' }];
  assert.equal(matchModel('cold', model), 'cold');
  assert.equal(matchModel('Upwork', model), 'upwork');
  assert.equal(matchModel('email', model), 'cold');
  assert.equal(matchModel('', model), null);
});
