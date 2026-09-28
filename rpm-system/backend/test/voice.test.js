const test = require('node:test');
const assert = require('node:assert/strict');

const { validateWrite, proposalLabel, isPage, buildTools } = require('../src/ai/tools');
const { zonedToUtc } = require('../src/ai/dates');

const U = '11111111-1111-4111-8111-111111111111';
const P = '22222222-2222-4222-8222-222222222222';
const C = '44444444-4444-4444-8444-444444444444';

function pool({ projects = [], coaches = [] } = {}) {
  return {
    async query(sql, vals) {
      if (/FROM projects WHERE id = \$1 AND user_id = \$2/.test(sql)) return { rows: projects.filter(p => p.id === vals[0] && p.user_id === vals[1]) };
      if (/FROM coaches WHERE id = \$1 AND user_id = \$2/.test(sql)) return { rows: coaches.filter(c => c.id === vals[0] && c.user_id === vals[1]) };
      throw new Error('unexpected query: ' + sql.slice(0, 60));
    },
  };
}

test('zonedToUtc turns a local wall-clock time into UTC, across DST, and rejects nonsense', () => {
  assert.equal(zonedToUtc('2026-09-29T09:00', 'Europe/Berlin'), '2026-09-29T07:00:00.000Z');  // CEST
  assert.equal(zonedToUtc('2026-12-01T09:00', 'Europe/Berlin'), '2026-12-01T08:00:00.000Z');  // CET
  assert.equal(zonedToUtc('2026-02-30T09:00', 'UTC'), null);
  assert.equal(zonedToUtc('tomorrow at 9', 'UTC'), null);
  assert.equal(zonedToUtc('2026-09-29T24:00', 'UTC'), null);
});

test('open_page only accepts the app’s own routes', () => {
  for (const ok of ['/today', '/week?view=month', '/plan?view=roadmap', `/projects/${P}?view=timeline`, `/categories/${P}`, `/coach?c=${C}`]) assert.ok(isPage(ok), ok);
  for (const bad of ['https://evil.example', '//evil.example', '/today?x=1', '/admin', '/projects/abc', 'javascript:alert(1)']) assert.ok(!isPage(bad), bad);
});

test('create_reminder validates by kind and refuses times in the past', async () => {
  const p = pool();
  assert.equal((await validateWrite(p, U, 'create_reminder', { title: 'x', kind: 'once', at: '2099-01-01T09:00', timezone: 'Europe/Berlin' })).ok, true);
  assert.match((await validateWrite(p, U, 'create_reminder', { title: 'x', kind: 'once', at: '2020-01-01T09:00', timezone: 'UTC' })).error, /past/);
  assert.match((await validateWrite(p, U, 'create_reminder', { title: 'x', kind: 'once', at: 'tomorrow' })).error, /YYYY-MM-DDTHH:MM/);
  assert.match((await validateWrite(p, U, 'create_reminder', { title: 'x', kind: 'daily', time: '25:00' })).error, /HH:MM/);
  assert.match((await validateWrite(p, U, 'create_reminder', { title: 'x', kind: 'weekly', time: '08:00', dow: 9 })).error, /dow/);
  assert.equal((await validateWrite(p, U, 'create_reminder', { title: 'x', kind: 'weekly', time: '08:00', dow: 1 })).ok, true);
  assert.equal(proposalLabel('create_reminder', { title: 'Plan the week', kind: 'weekly', time: '08:00', dow: 1 }), 'Remind me “Plan the week” · every Mon 08:00');
});

test('capture_idea needs one of the user’s projects; note_to_coach one of their coaches', async () => {
  const p = pool({ projects: [{ id: P, user_id: U, name: 'Launch' }], coaches: [{ id: C, user_id: U, name: 'Launch Coach' }] });
  assert.equal((await validateWrite(p, U, 'capture_idea', { title: 'Referral idea', project_id: P })).ok, true);
  assert.match((await validateWrite(p, U, 'capture_idea', { title: 'Referral idea' })).error, /project/);
  const v = await validateWrite(p, U, 'note_to_coach', { coach_id: C, note: 'Ran 10k today' });
  assert.equal(v.ok, true);
  assert.equal(proposalLabel('note_to_coach', { note: 'Ran 10k today' }, v.target), 'Tell Launch Coach: “Ran 10k today”');
  assert.match((await validateWrite(p, 'someone-else', 'note_to_coach', { coach_id: C, note: 'x' })).error, /coaches/);
});

test('voice mode: edits and deletes stay approval-only even in auto mode; pages only when the client can open them', async () => {
  const ai = { tool: (def) => def, jsonSchema: (s) => s };
  const plain = buildTools(ai, pool(), U, true);
  assert.ok(!plain.update_action && !plain.delete_action && !plain.open_page);
  const voice = buildTools(ai, pool(), U, true, { proposeEdits: true, canNavigate: true });
  assert.ok(voice.update_action && voice.delete_action && voice.open_page);
  assert.match(voice.delete_action.description, /PROPOSED/);
  assert.doesNotMatch(voice.create_action.description, /PROPOSED/);   // creating still acts directly
  // delete never touches the DB here — it validates, then returns a proposal
  const p = { async query(sql, vals) { if (/FROM actions WHERE id/.test(sql)) return { rows: [{ id: vals[0], title: 'Old task', project_id: null }] }; throw new Error('write attempted: ' + sql); } };
  const r = await buildTools(ai, p, U, true, { proposeEdits: true }).delete_action.execute({ action_id: '33333333-3333-4333-8333-333333333333' });
  assert.equal(r.proposed, true);
  assert.equal(r.label, 'Delete “Old task”');
  assert.deepEqual(await voice.open_page.execute({ path: '/plan?view=roadmap' }), { ok: true, navigate: '/plan?view=roadmap' });
  assert.equal((await voice.open_page.execute({ path: 'https://evil.example' })).ok, false);
});
