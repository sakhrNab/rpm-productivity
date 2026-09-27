// Real-project timeline logic — pure, no DOM, unit-tested from the backend suite.
// Turns saved actions into timeline rows, finds dependency conflicts, and computes
// the date changes for a drag (with cascade), "fix conflicts" and auto-scheduling.
// Dates on screen are ALWAYS the saved ones; nothing moves unless the user acts.

import { schedulePlan, addDays, diffDays } from './planSchedule.js';

const NO_PHASE = '_other';

const localDay = (iso) => {
  if (!iso) return null;
  const d = new Date(iso);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};
const sizeFor = (minutes) => (minutes && minutes < 60 ? 'small' : minutes > 240 ? 'big' : 'medium');
const spanOf = (t) => (t.end_date && t.end_date >= t.scheduled_date ? diffDays(t.scheduled_date, t.end_date) + 1 : 1);

export function buildProjectTimeline(data) {
  const blockDue = Object.fromEntries((data.phases || []).map(p => [p.id, p.target_date]));
  const known = new Set((data.phases || []).map(p => p.id));
  const scheduled = [], unscheduled = [];
  for (const t of data.tasks || []) {
    if (!t.scheduled_date) { unscheduled.push(t); continue; }
    scheduled.push({
      key: t.id,
      phase: known.has(t.block_id) ? t.block_id : NO_PHASE,
      title: t.title,
      description: t.notes || '',
      priority: t.priority || 0,
      size: sizeFor(t.effort_minutes),
      effort_minutes: t.effort_minutes || 0,
      span_days: spanOf(t),
      pin: t.scheduled_date,
      deadline: t.block_id && blockDue[t.block_id] ? blockDue[t.block_id] : null,
      depends_on: t.depends_on || [],
      reminder_on: localDay(t.next_reminder_at),
      done: !!t.is_completed,
      include: true,
      source: 'document',
    });
  }
  const phases = (data.phases || []).map(p => ({ key: p.id, title: p.title }));
  if (scheduled.some(t => t.phase === NO_PHASE)) phases.push({ key: NO_PHASE, title: 'Other tasks' });
  return { tasks: scheduled, phases, unscheduled };
}

// Schedule with every task pinned to its saved date. The floor is the earliest saved
// date (not today) so past/overdue tasks are not "moved"; a task the scheduler would
// have to push later starts before its prerequisite ends → a conflict to show.
export function computeProjectSchedule(tasks) {
  if (!tasks.length) return { tasks: [], conflicts: [] };
  const floor = tasks.reduce((m, t) => (t.pin < m ? t.pin : m), tasks[0].pin);
  const keys = new Set(tasks.map(t => t.key));
  const r = schedulePlan(tasks.map(t => ({ ...t, start: t.pin, depends_on: t.depends_on.filter(d => keys.has(d)) })), { today: floor });
  const byKey = new Map(tasks.map(t => [t.key, t]));
  const out = r.tasks.map(s => {
    const orig = byKey.get(s.key);
    const conflict = !orig.done && s.start !== orig.pin;
    return {
      ...s,
      depends_on: orig.depends_on,
      start: orig.pin,                                   // show the SAVED dates
      end: addDays(orig.pin, orig.span_days - 1),
      pin: null,                                         // every real task is pinned; don't draw pin icons
      suggested_start: conflict ? s.start : null,
      conflict,
      shifted: false,
      late: !!orig.deadline && addDays(orig.pin, orig.span_days - 1) > orig.deadline && !orig.done,
    };
  });
  return { tasks: out, conflicts: out.filter(t => t.conflict) };
}

const change = (t, start) => ({ id: t.key, scheduled_date: start, end_date: t.span_days > 1 ? addDays(start, t.span_days - 1) : null });

// Move one task; unfinished dependents that would now start too early move with it.
export function cascadeMove(tasks, key, newStart) {
  const moved = tasks.find(t => t.key === key);
  if (!moved || moved.done || newStart === moved.pin) return [];
  const pinned = tasks.map(t => (t.key === key ? { ...t, pin: newStart } : t));
  const floor = pinned.reduce((m, t) => (t.pin < m ? t.pin : m), pinned[0].pin);
  const keys = new Set(tasks.map(t => t.key));
  const r = schedulePlan(pinned.map(t => ({ ...t, start: t.pin, depends_on: t.depends_on.filter(d => keys.has(d)) })), { today: floor });
  const out = [change(moved, newStart)];
  for (const s of r.tasks) {
    if (s.key === key) continue;
    const orig = tasks.find(t => t.key === s.key);
    if (!orig.done && s.start !== orig.pin && s.start > orig.pin) out.push(change(orig, s.start));
  }
  return out;
}

// Move every conflicting task to the first day its prerequisites allow.
export function fixConflicts(scheduleTasks, rawTasks) {
  const raw = new Map(rawTasks.map(t => [t.key, t]));
  return scheduleTasks.filter(t => t.conflict && t.suggested_start).map(t => change(raw.get(t.key), t.suggested_start));
}

// Give undated tasks a date: after their (dated) prerequisites, never before today.
export function autoSchedule(unscheduled, tasks, today) {
  if (!unscheduled.length) return [];
  const rows = [
    ...tasks.map(t => ({ ...t, start: t.pin })),
    ...unscheduled.map(u => ({ key: u.id, span_days: spanOf({ ...u, scheduled_date: today }), depends_on: u.depends_on || [], start: null })),
  ];
  const keys = new Set(rows.map(t => t.key));
  const floor = rows.reduce((m, t) => (t.start && t.start < m ? t.start : m), today);
  const r = schedulePlan(rows.map(t => ({ ...t, depends_on: t.depends_on.filter(d => keys.has(d)) })), { today: floor });
  const ids = new Set(unscheduled.map(u => u.id));
  return r.tasks.filter(t => ids.has(t.key)).map(t => {
    const start = t.start < today ? today : t.start;
    return { id: t.key, scheduled_date: start, end_date: t.span_days > 1 ? addDays(start, t.span_days - 1) : null };
  });
}
