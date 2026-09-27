const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { buildCapacity } = require('../src/capacity');
const { worst } = require('../src/roadmap');

const load = () => import(path.join(__dirname, '../../frontend/src/utils/capacity.js'));

// 2026-10-02 is a Friday, 10-03 Sat, 10-04 Sun.
test('buildCapacity: weekday/weekend hours, planned vs done, multi-day spread', () => {
  const days = buildCapacity([
    { id: 'a', title: 'A', scheduled_date: '2026-10-02', minutes: 120 },
    { id: 'b', title: 'B', scheduled_date: '2026-10-02', minutes: 60, is_completed: true },
    { id: 'c', title: 'C', scheduled_date: '2026-10-01', end_date: '2026-10-03', minutes: 360 },   // starts before the window
  ], '2026-10-02', '2026-10-04', { weekday: 6, weekend: 2 });
  assert.deepEqual(days.map(d => d.capacity_minutes), [360, 120, 120]);
  assert.equal(days[0].planned_minutes, 120 + 120);
  assert.equal(days[0].done_minutes, 60);
  assert.equal(days[1].planned_minutes, 120);
  assert.equal(days[1].overloaded, false);
  assert.equal(days[2].tasks.length, 0);
  assert.equal(days[0].tasks.find(t => t.id === 'c').multi_day, true);
});

test('buildCapacity: overload flag and 62-day cap', () => {
  const [d] = buildCapacity([{ id: 'a', scheduled_date: '2026-10-05', minutes: 400 }], '2026-10-05', '2026-10-05', { weekday: 6, weekend: 2 });
  assert.equal(d.overloaded, true);
  assert.equal(buildCapacity([], '2026-01-01', '2026-12-31').length, 62);
});

test('suggestRebalance: moves the least important movable task to the roomiest day', async () => {
  const { suggestRebalance } = await load();
  const t = (id, minutes, extra = {}) => ({ id, title: id, minutes, priority: 0, is_starred: false, is_completed: false, multi_day: false, blocks_count: 0, prereq_end: null, ...extra });
  const days = [
    { date: '2026-10-05', capacity_minutes: 360, planned_minutes: 480, tasks: [t('star', 120, { is_starred: true }), t('hi', 120, { priority: 3 }), t('gate', 120, { blocks_count: 1 }), t('low', 120)] },
    { date: '2026-10-06', capacity_minutes: 360, planned_minutes: 300, tasks: [] },
    { date: '2026-10-07', capacity_minutes: 360, planned_minutes: 0, tasks: [] },
  ];
  const moves = suggestRebalance(days, '2026-10-05');
  assert.deepEqual(moves.map(m => [m.id, m.scheduled_date]), [['low', '2026-10-07']]);
});

test('suggestRebalance: never before prerequisites, never into the past, nothing when it fits', async () => {
  const { suggestRebalance } = await load();
  const task = { id: 'x', title: 'x', minutes: 120, priority: 0, blocks_count: 0, prereq_end: '2026-10-06' };
  const days = [
    { date: '2026-10-04', capacity_minutes: 600, planned_minutes: 0, tasks: [] },
    { date: '2026-10-05', capacity_minutes: 60, planned_minutes: 120, tasks: [task] },
    { date: '2026-10-06', capacity_minutes: 600, planned_minutes: 0, tasks: [] },
    { date: '2026-10-07', capacity_minutes: 300, planned_minutes: 0, tasks: [] },
  ];
  assert.deepEqual(suggestRebalance(days, '2026-10-05').map(m => m.scheduled_date), ['2026-10-07']);
  assert.deepEqual(suggestRebalance(days.map(d => ({ ...d, planned_minutes: 0 })), '2026-10-05'), []);
});

test('roadmap worst(): the weakest key result sets the project risk', () => {
  assert.equal(worst(['on_track', 'at_risk', 'done']), 'at_risk');
  assert.equal(worst(['no_deadline', 'overdue']), 'overdue');
  assert.equal(worst([]), null);
});
