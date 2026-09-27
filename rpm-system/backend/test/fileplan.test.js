const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const { extractText } = require('../src/ai/extract');
const { schedulePlan } = require('../src/ai/planSchedule');
const { normalizePlan, zonedToUtc, parseJson } = require('../src/ai/fileplan');

const fx = (f) => fs.readFileSync(path.join(__dirname, 'fixtures', f));

// ---------- extraction (real files) ----------
test('extracts text from real docx / pdf / xlsx / pptx / html / txt', async () => {
  assert.match((await extractText(fx('plan.docx'), 'plan.docx')).text, /Phase 1: Research competitors by Oct 10\./);
  const pdf = await extractText(fx('plan.pdf'), 'plan.pdf');
  assert.equal(pdf.kind, 'pdf'); assert.equal(pdf.meta.pages, 1); assert.match(pdf.text, /Build landing page/);
  const xlsx = (await extractText(fx('plan.xlsx'), 'plan.xlsx')).text;
  assert.match(xlsx, /## Sheet: Tasks/); assert.match(xlsx, /Write copy & headlines\tSara\t6/);
  const pptx = (await extractText(fx('plan.pptx'), 'plan.pptx')).text;
  assert.ok(pptx.indexOf('Slide 1') < pptx.indexOf('Hire designer'));
  const html = (await extractText(fx('plan.html'), 'plan.html')).text;
  assert.match(html, /# Wedding & Venue/); assert.doesNotMatch(html, /alert|\.x\{/);
  assert.match((await extractText(fx('plan.txt'), 'plan.txt')).text, /^Launch Plan/);
});

test('rejects binary junk and legacy Office formats with a helpful message', async () => {
  await assert.rejects(extractText(Buffer.from([0, 1, 2, 250, 251]), 'x.bin'), /Can't read \.bin/);
  await assert.rejects(extractText(Buffer.from('x'), 'old.xls'), /save it as \.xlsx/);
  await assert.rejects(extractText(Buffer.alloc(0), 'a.txt'), /empty/);
  assert.equal((await extractText(Buffer.from('plain words\n'), 'README')).kind, 'text');
});

test('a fake zip that claims huge sizes is refused (zip-bomb guard)', async () => {
  const buf = Buffer.alloc(22 + 46 + 5);
  buf.writeUInt32LE(0x02014b50, 0); buf.writeUInt32LE(100 * 1024 * 1024, 24); buf.writeUInt16LE(5, 28); buf.write('a.xml', 46);
  const e = 46 + 5; buf.writeUInt32LE(0x06054b50, e); buf.writeUInt16LE(1, e + 10); buf.writeUInt32LE(0, e + 16);
  await assert.rejects(extractText(buf, 'x.docx'), /too large/);
});

// ---------- scheduler ----------
const T = '2026-09-28';
test('dependencies start the day after their prerequisites finish', () => {
  const r = schedulePlan([
    { key: 'a', span_days: 2 }, { key: 'b', span_days: 3, depends_on: ['a'] },
    { key: 'c', span_days: 1, depends_on: ['a'] }, { key: 'd', span_days: 1, depends_on: ['b', 'c'] },
  ], { today: T });
  const k = Object.fromEntries(r.tasks.map(t => [t.key, t]));
  assert.deepEqual([k.a.start, k.a.end, k.b.start, k.b.end, k.c.start, k.d.start], ['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-02', '2026-09-30', '2026-10-03']);
  assert.deepEqual(r.critical_keys.sort(), ['a', 'b', 'd']);
  assert.equal(k.c.slack_days, 2);
  assert.equal(r.span_days, 6);
});

test('pins are honoured unless a dependency forbids it; deadlines flag lateness; cycles break', () => {
  const r = schedulePlan([
    { key: 'a', span_days: 5 },
    { key: 'b', span_days: 1, depends_on: ['a'], start: '2026-09-29', deadline: '2026-10-01' },
    { key: 'p', span_days: 1, start: '2026-10-10' },
    { key: 'x', span_days: 1, depends_on: ['y'] }, { key: 'y', span_days: 1, depends_on: ['x'] },
  ], { today: T });
  const k = Object.fromEntries(r.tasks.map(t => [t.key, t]));
  assert.equal(k.b.start, '2026-10-03'); assert.equal(k.b.shifted, true); assert.equal(k.b.late, true);
  assert.equal(k.p.start, '2026-10-10'); assert.equal(k.p.shifted, false);
  assert.equal(r.broken_edges.length, 1);
  assert.deepEqual(r.late_keys, ['b']);
});

test('frontend and backend schedulers are identical', async () => {
  const { schedulePlan: fe } = await import(path.join(__dirname, '../../frontend/src/utils/planSchedule.js'));
  const input = () => [
    { key: 'a', span_days: 2 }, { key: 'b', span_days: 4, depends_on: ['a'], deadline: '2026-10-01' },
    { key: 'c', span_days: 1, start: '2026-10-12' }, { key: 'd', span_days: 2, depends_on: ['b', 'c', 'zz'] },
    { key: 'e', span_days: 1, depends_on: ['f'] }, { key: 'f', span_days: 1, depends_on: ['e'] },
  ];
  assert.deepEqual(fe(input(), { today: T }), schedulePlan(input(), { today: T }));
});

// ---------- normalizer ----------
const CAT = '11111111-1111-4111-8111-111111111111';
const PROJ = '22222222-2222-4222-8222-222222222222';
const FOREIGN = '33333333-3333-4333-8333-333333333333';
const existing = { categories: [{ id: CAT, name: 'Business' }], projects: [{ id: PROJ, name: 'Launch', category_id: CAT }] };

test('normalizePlan keeps a valid existing placement and derives its category', () => {
  const p = normalizePlan({ placement: { decision: 'existing_project', project_id: PROJ, category_id: FOREIGN, confidence: 140, alternatives: [{ project_id: FOREIGN }] }, tasks: [{ key: 't1', title: 'Do it' }] }, existing, T);
  assert.equal(p.placement.decision, 'existing_project');
  assert.equal(p.placement.category_id, CAT);
  assert.equal(p.placement.confidence, 100);
  assert.deepEqual(p.placement.alternatives, []);
});

test('normalizePlan downgrades a hallucinated project to a new project', () => {
  const p = normalizePlan({ title: 'Wedding', placement: { decision: 'existing_project', project_id: FOREIGN, category_id: CAT }, tasks: [{ title: 'Book venue' }] }, existing, T);
  assert.equal(p.placement.decision, 'new_project');
  assert.equal(p.placement.project_id, null);
  assert.equal(p.placement.new_project.name, 'Wedding');
});

test('normalizePlan sanitises tasks, drops bad deps, schedules, and tracks pins separately', () => {
  const p = normalizePlan({
    phases: [{ key: 'ph1', title: 'Prep' }, { key: 'ph2', title: 'Unused' }],
    tasks: [
      { key: 't1', phase: 'ph1', title: 'Research', size: 'huge', priority: 9, span_days: 2, depends_on: ['nope', 't1'] },
      { key: 't2', phase: 'ghost', title: 'Write', span_days: 1, depends_on: ['t1'], start: '2026-02-30', reminder: { days_before: 99, time: '25:00' } },
      { key: 't3', title: 'Launch', start: '2026-10-20', source: 'initiative', why: 'buffer' },
      { key: 't1', title: 'duplicate key' }, { title: '' },
    ],
  }, existing, T);
  const k = Object.fromEntries(p.tasks.map(t => [t.key, t]));
  assert.equal(p.tasks.length, 4);
  assert.equal(k.t1.size, 'medium'); assert.equal(k.t1.priority, 3); assert.deepEqual(k.t1.depends_on, []);
  assert.equal(k.t2.phase, 'ph1'); assert.equal(k.t2.start, '2026-09-30'); assert.equal(k.t2.pin, null);
  assert.deepEqual(k.t2.reminder, { days_before: 30, time: '09:00' });
  assert.equal(k.t3.pin, '2026-10-20'); assert.equal(k.t3.source, 'initiative');
  assert.ok(k.t1_, 'duplicate keys are made unique');
  assert.deepEqual(p.phases.map(ph => ph.key), ['ph1'], 'phases without tasks are dropped');
});

test('a client round-trip keeps computed dates unpinned so edits still re-flow', () => {
  const first = normalizePlan({ tasks: [{ key: 'a', title: 'A', span_days: 3 }, { key: 'b', title: 'B', depends_on: ['a'] }] }, existing, T);
  first.tasks[0].pin = '2026-10-05';                                    // user drags A later
  const again = normalizePlan(first, existing, T);
  const k = Object.fromEntries(again.tasks.map(t => [t.key, t]));
  assert.equal(k.a.start, '2026-10-05');
  assert.equal(k.b.start, '2026-10-08');
  assert.equal(k.b.pin, null);
});

// ---------- misc ----------
test('zonedToUtc converts local reminder times, including DST', () => {
  assert.equal(zonedToUtc('2026-09-28', '09:00', 'Europe/Berlin').toISOString(), '2026-09-28T07:00:00.000Z');
  assert.equal(zonedToUtc('2026-12-01', '09:00', 'Europe/Berlin').toISOString(), '2026-12-01T08:00:00.000Z');
  assert.equal(zonedToUtc('2026-09-28', '09:00', 'America/New_York').toISOString(), '2026-09-28T13:00:00.000Z');
  assert.equal(zonedToUtc('2026-09-28', '09:00', 'UTC').toISOString(), '2026-09-28T09:00:00.000Z');
});

test('parseJson tolerates fences and prose', () => {
  assert.deepEqual(parseJson('Sure!\n```json\n{"a":1}\n```'), { a: 1 });
  assert.deepEqual(parseJson('noise {"b":[1,2]} trailing'), { b: [1, 2] });
});

test('deselecting a prerequisite frees its dependents in the schedule', () => {
  const first = normalizePlan({ tasks: [{ key: 'a', title: 'A', span_days: 5 }, { key: 'b', title: 'B', depends_on: ['a'] }] }, existing, T);
  first.tasks[0].include = false;
  const again = normalizePlan(first, existing, T);
  const b = again.tasks.find(t => t.key === 'b');
  assert.equal(b.start, T);
  assert.deepEqual(b.depends_on, ['a'], 'the dependency itself is kept so re-including restores it');
});

test('a chain that ends exactly on its deadline is critical even when it is not the plan end', () => {
  const r = schedulePlan([
    { key: 'copy', span_days: 2 }, { key: 'launch', span_days: 1, depends_on: ['copy'], deadline: '2026-09-30' },
    { key: 'retro', span_days: 1, start: '2026-10-20' },
  ], { today: T });
  assert.deepEqual(r.critical_keys.sort(), ['copy', 'launch', 'retro']);
});

test('the driving chain is highlighted even when pins give it slack', () => {
  const r = schedulePlan([
    { key: 'a', span_days: 2 }, { key: 'b', span_days: 2, depends_on: ['a'] }, { key: 'side', span_days: 1 },
    { key: 'launch', span_days: 1, depends_on: ['b', 'side'], start: '2026-10-15' },
    { key: 'off', span_days: 1, start: '2026-12-01', include: false },
  ], { today: T });
  assert.deepEqual(r.critical_keys.sort(), ['a', 'b', 'launch']);
  assert.ok(r.tasks.find(t => t.key === 'b').slack_days > 0, 'slack is still reported honestly');
});

test('reminders already in the past are not counted (matches the server rule)', async () => {
  const { reminderUpcoming } = await import(path.join(__dirname, '../../frontend/src/utils/planFormat.js'));
  const now = new Date(2026, 8, 27, 15, 45);                             // Sep 27 15:45 local
  assert.equal(reminderUpcoming('2026-09-27', { days_before: 0, time: '09:00' }, now), false);
  assert.equal(reminderUpcoming('2026-09-27', { days_before: 0, time: '18:00' }, now), true);
  assert.equal(reminderUpcoming('2026-09-29', { days_before: 3, time: '09:00' }, now), false);
  assert.equal(reminderUpcoming('2026-09-29', { days_before: 1, time: '09:00' }, now), true);
  assert.equal(reminderUpcoming('2026-09-29', null, now), false);
});

// ---------- category-level placement ----------
test('normalizePlan: a new life area comes back as a full, clean category draft', () => {
  const p = normalizePlan({ placement: {
    decision: 'new_category', category_id: CAT, confidence: 82,
    category_alternatives: [{ category_id: CAT, reason: 'loosely' }, { category_id: FOREIGN }],
    new_category: { name: 'Health & Fitness', vision: 'I am strong at 60.', purpose: 'Energy for my family', roles: 'Athlete',
      one_year_goals: ['- Run a marathon', '10 kg lighter', ''], ninety_day_goals: '1. Run 5k three times a week\n2) Sleep 7h' },
  }, tasks: [{ title: 'Buy shoes' }] }, existing, T);
  assert.equal(p.placement.decision, 'new_category');
  assert.equal(p.placement.category_id, null);                    // a new area never keeps an existing category
  assert.equal(p.placement.new_category.name, 'Health & Fitness');
  assert.deepEqual(p.placement.new_category.one_year_goals, ['Run a marathon', '10 kg lighter']);   // leading numbers in a goal survive
  assert.deepEqual(p.placement.new_category.ninety_day_goals, ['Run 5k three times a week', 'Sleep 7h']);
  assert.deepEqual(p.placement.category_alternatives, [{ category_id: CAT, reason: 'loosely' }]);    // unknown ids dropped
  assert.equal(p.placement.new_category_name, 'Health & Fitness');
});

test('normalizePlan: a "new" category that already exists becomes that category', () => {
  const p = normalizePlan({ placement: { decision: 'new_category', new_category: { name: '  business ' } }, tasks: [{ title: 'X' }] }, existing, T);
  assert.equal(p.placement.decision, 'new_project');
  assert.equal(p.placement.category_id, CAT);
  assert.equal(p.placement.new_category, null);
});

test('normalizePlan: new_category without a name falls back to a new project in a real category', () => {
  const p = normalizePlan({ placement: { decision: 'new_category', new_category: { vision: 'x' } }, tasks: [{ title: 'X' }] }, existing, T);
  assert.equal(p.placement.decision, 'new_project');
  assert.equal(p.placement.category_id, CAT);
});

test('normalizePlan: with no categories at all, the drafted area is the placement', () => {
  const p = normalizePlan({ placement: { decision: 'new_project', new_category: { name: 'Home' } }, tasks: [{ title: 'X' }] }, { categories: [], projects: [] }, T);
  assert.equal(p.placement.decision, 'new_category');
  assert.equal(p.placement.new_category.name, 'Home');
});

test('normalizePlan: a weak existing fit keeps the drafted area as an option; plans saved before stay readable', () => {
  const weak = normalizePlan({ placement: { decision: 'new_project', category_id: CAT, confidence: 40, new_category: { name: 'Side quests' } }, tasks: [{ title: 'X' }] }, existing, T);
  assert.equal(weak.placement.category_id, CAT);
  assert.equal(weak.placement.new_category.name, 'Side quests');
  const legacy = normalizePlan({ placement: { decision: 'new_project', new_category_name: 'Travel' }, tasks: [{ title: 'X' }] }, existing, T);
  assert.equal(legacy.placement.new_category.name, 'Travel');
  assert.deepEqual(legacy.placement.new_category.one_year_goals, []);
});
