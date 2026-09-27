const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const load = () => import(path.join(__dirname, '../../frontend/src/utils/projectTimeline.js'));
const B = 'b1';
const data = {
  phases: [{ id: B, title: 'Build', target_date: '2026-10-10' }],
  tasks: [
    { id: 'a', title: 'Past done', scheduled_date: '2026-09-01', end_date: null, is_completed: true, block_id: B, depends_on: [], effort_minutes: 30 },
    { id: 'b', title: 'Design', scheduled_date: '2026-10-01', end_date: '2026-10-03', block_id: B, depends_on: [], effort_minutes: 300 },
    { id: 'c', title: 'Build', scheduled_date: '2026-10-02', end_date: null, block_id: B, depends_on: ['b'], effort_minutes: 120 },
    { id: 'd', title: 'Ship', scheduled_date: '2026-10-09', end_date: null, block_id: null, depends_on: ['c'], effort_minutes: 60 },
    { id: 'u', title: 'Undated', scheduled_date: null, depends_on: ['c'], effort_minutes: 60 },
  ],
};

test('real tasks keep their saved dates; only real dependency clashes are conflicts', async () => {
  const { buildProjectTimeline, computeProjectSchedule } = await load();
  const tl = buildProjectTimeline(data);
  assert.deepEqual(tl.unscheduled.map(u => u.id), ['u']);
  assert.deepEqual(tl.phases.map(p => p.key), [B, '_other']);
  const s = computeProjectSchedule(tl.tasks);
  const k = Object.fromEntries(s.tasks.map(t => [t.key, t]));
  assert.equal(k.a.start, '2026-09-01', 'a past, done task is not moved to today');
  assert.equal(k.a.conflict, false);
  assert.equal(k.b.span_days, 3); assert.equal(k.b.size, 'big');
  assert.equal(k.c.start, '2026-10-02', 'shown at its saved date…');
  assert.equal(k.c.conflict, true, '…but flagged: it starts before Design ends');
  assert.equal(k.c.suggested_start, '2026-10-04');
  assert.equal(k.d.conflict, false);
  assert.equal(k.b.deadline, '2026-10-10', 'the block due date is the deadline');
});

test('dragging a task moves unfinished dependents that would now clash, preserving spans', async () => {
  const { buildProjectTimeline, cascadeMove } = await load();
  const tl = buildProjectTimeline(data);
  const changes = cascadeMove(tl.tasks, 'b', '2026-10-08');           // Design now ends Oct 10
  assert.deepEqual(changes, [
    { id: 'b', scheduled_date: '2026-10-08', end_date: '2026-10-10' },
    { id: 'c', scheduled_date: '2026-10-11', end_date: null },
    { id: 'd', scheduled_date: '2026-10-12', end_date: null },
  ]);
  assert.deepEqual(cascadeMove(tl.tasks, 'a', '2026-09-05'), [], 'completed tasks do not move');
  assert.deepEqual(cascadeMove(tl.tasks, 'b', '2026-10-01'), [], 'no-op when the date is unchanged');
});

test('fix conflicts and auto-schedule produce minimal, valid changes', async () => {
  const { buildProjectTimeline, computeProjectSchedule, fixConflicts, autoSchedule } = await load();
  const tl = buildProjectTimeline(data);
  const s = computeProjectSchedule(tl.tasks);
  assert.deepEqual(fixConflicts(s.tasks, tl.tasks), [{ id: 'c', scheduled_date: '2026-10-04', end_date: null }]);
  // 'u' waits for Build, which can't really start before Oct 4 (its own conflict) → Oct 5, not Oct 3.
  assert.deepEqual(autoSchedule(tl.unscheduled, tl.tasks, '2026-09-27'), [{ id: 'u', scheduled_date: '2026-10-05', end_date: null }]);
  assert.deepEqual(autoSchedule([{ id: 'x', depends_on: [] }], tl.tasks, '2026-09-27'), [{ id: 'x', scheduled_date: '2026-09-27', end_date: null }], 'never before today');
});

test('reschedule rejects bad input before touching the database', async () => {
  const { rescheduleActions } = require('../src/timeline');
  const pool = { connect() { throw new Error('should not connect'); } };
  assert.equal((await rescheduleActions(pool, 'u', [])).ok, false);
  assert.match((await rescheduleActions(pool, 'u', [{ id: 'nope', scheduled_date: '2026-10-01' }])).error, /invalid action id/);
  assert.match((await rescheduleActions(pool, 'u', [{ id: '11111111-1111-4111-8111-111111111111', scheduled_date: '2026-02-30' }])).error, /invalid date/);
  assert.match((await rescheduleActions(pool, 'u', [{ id: '11111111-1111-4111-8111-111111111111', scheduled_date: '2026-10-05', end_date: '2026-10-01' }])).error, /invalid end date/);
});
