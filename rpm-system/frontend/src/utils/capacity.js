// Capacity helpers — pure, unit-tested from the backend suite.

const addDays = (d, n) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
export const fmtHours = (min) => { const h = min / 60; return `${Number.isInteger(h) ? h : h.toFixed(1)}h`; };

// For each overloaded day (today or later), move the least important single-day tasks to
// the day with the most room, until it fits. Never touches: finished, starred, high-priority
// or multi-day tasks, anything other tasks depend on, or dates before a task's prerequisites.
export function suggestRebalance(days, today) {
  const free = new Map(days.map(d => [d.date, d.capacity_minutes - d.planned_minutes]));
  const moves = [];
  for (const day of days) {
    if (day.date < today || free.get(day.date) >= 0) continue;
    const candidates = day.tasks
      .filter(t => !t.is_completed && !t.is_starred && !t.multi_day && t.priority < 3 && !t.blocks_count && t.minutes > 0)
      .sort((a, b) => a.priority - b.priority || b.minutes - a.minutes);
    for (const t of candidates) {
      if (free.get(day.date) >= 0) break;
      const targets = days
        .filter(d => d.date !== day.date && d.date >= today && (!t.prereq_end || d.date > t.prereq_end) && free.get(d.date) >= t.minutes)
        .sort((a, b) => free.get(b.date) - free.get(a.date) || (a.date < b.date ? -1 : 1));
      const to = targets[0];
      if (!to) continue;
      free.set(day.date, free.get(day.date) + t.minutes);
      free.set(to.date, free.get(to.date) - t.minutes);
      moves.push({ id: t.id, title: t.title, from: day.date, scheduled_date: to.date, end_date: null, minutes: t.minutes });
    }
  }
  return moves;
}

export { addDays };
