// Plan scheduler — pure. MIRROR of frontend/src/utils/planSchedule.js (ESM source);
// backend/test/fileplan.test.js asserts both copies produce identical output.
//
// tasks: [{ key, span_days, start?, deadline?, depends_on: [key] }]  (dates "YYYY-MM-DD")
// Forward pass: a task starts on the later of today, its pinned `start`, and the day
// after its last dependency ends. Backward pass (CPM): a task must finish by the plan
// end, by its own deadline, and in time for its successors; slack = that latest finish
// − its end. Zero-slack tasks form the critical path — any delay there moves the end
// date or breaks a deadline.

const DAY = 86400000;
const toMs = (d) => Date.parse(`${d}T00:00:00Z`);
const toDate = (ms) => new Date(ms).toISOString().slice(0, 10);
const isDate = (d) => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(toMs(d)) && toDate(toMs(d)) === d;
const addDays = (d, n) => toDate(toMs(d) + n * DAY);
const diffDays = (a, b) => Math.round((toMs(b) - toMs(a)) / DAY);

function schedulePlan(inputTasks, { today }) {
  const tasks = inputTasks.map(t => ({
    ...t,
    span_days: Math.max(1, Math.min(365, Math.round(Number(t.span_days) || 1))),
    depends_on: [...new Set((t.depends_on || []).filter(d => d !== t.key))],
  }));
  const byKey = new Map(tasks.map(t => [t.key, t]));
  for (const t of tasks) t.depends_on = t.depends_on.filter(d => byKey.has(d));

  // Break dependency cycles (drop the edge that closes each loop).
  const brokenEdges = [];
  const state = new Map();                        // 1 = visiting, 2 = done
  const visit = (t) => {
    state.set(t.key, 1);
    for (const d of [...t.depends_on]) {
      const s = state.get(d);
      if (s === 1) { t.depends_on = t.depends_on.filter(x => x !== d); brokenEdges.push([t.key, d]); }
      else if (!s) visit(byKey.get(d));
    }
    state.set(t.key, 2);
  };
  for (const t of tasks) if (!state.get(t.key)) visit(t);

  // Topological order (dependencies first), stable w.r.t. input order.
  const order = [];
  const placed = new Set();
  while (order.length < tasks.length) {
    const before = order.length;
    for (const t of tasks) {
      if (!placed.has(t.key) && t.depends_on.every(d => placed.has(d))) { order.push(t); placed.add(t.key); }
    }
    if (order.length === before) {                 // defensive: never loop forever
      for (const t of tasks) if (!placed.has(t.key)) { t.depends_on = []; order.push(t); placed.add(t.key); }
    }
  }

  // Forward pass.
  for (const t of order) {
    let earliest = today;
    for (const d of t.depends_on) {
      const after = addDays(byKey.get(d).end, 1);
      if (after > earliest) earliest = after;
    }
    const pinned = isDate(t.start) ? t.start : null;
    t.start = pinned && pinned >= earliest ? pinned : earliest;
    t.shifted = !!pinned && pinned < earliest;       // wanted earlier than its dependencies allow
    t.end = addDays(t.start, t.span_days - 1);
    t.late = isDate(t.deadline) && t.end > t.deadline;
  }

  // Backward pass (critical path).
  const planEnd = tasks.reduce((m, t) => (t.end > m ? t.end : m), today);
  const successors = new Map(tasks.map(t => [t.key, []]));
  for (const t of tasks) for (const d of t.depends_on) successors.get(d).push(t);
  const latestFinish = new Map();
  for (const t of [...order].reverse()) {
    let lf = planEnd;
    if (isDate(t.deadline) && t.deadline < lf) lf = t.deadline < t.end ? t.end : t.deadline;
    for (const s of successors.get(t.key)) {
      const ls = addDays(latestFinish.get(s.key), -(s.span_days - 1));
      const bound = addDays(ls, -1);
      if (bound < lf) lf = bound;
    }
    latestFinish.set(t.key, lf);
    t.slack_days = Math.max(0, diffDays(t.end, lf));
  }

  // Driving chain: from the last-finishing (included) task, follow the prerequisite that
  // finishes last — the "this before that" backbone that sets the end date. Pinned dates
  // can give it slack, so it is highlighted together with every zero-slack task.
  const live = tasks.filter(t => t.include !== false);
  const chain = new Set();
  let cur = [...live].sort((a, b) => (a.end !== b.end ? (a.end < b.end ? 1 : -1) : b.depends_on.length - a.depends_on.length))[0];
  while (cur && !chain.has(cur.key)) {
    chain.add(cur.key);
    cur = cur.depends_on.map(d => byKey.get(d)).filter(p => p.include !== false).sort((a, b) => (a.end < b.end ? 1 : a.end > b.end ? -1 : 0))[0];
  }
  for (const t of tasks) t.critical = t.include !== false && (t.slack_days === 0 || chain.has(t.key));

  const planStart = tasks.reduce((m, t) => (!m || t.start < m ? t.start : m), null) || today;
  return {
    tasks,
    start: planStart,
    end: planEnd,
    span_days: diffDays(planStart, planEnd) + 1,
    critical_keys: tasks.filter(t => t.critical).map(t => t.key),
    late_keys: tasks.filter(t => t.late).map(t => t.key),
    broken_edges: brokenEdges,
  };
}

module.exports = { schedulePlan, addDays, diffDays, isDate };
