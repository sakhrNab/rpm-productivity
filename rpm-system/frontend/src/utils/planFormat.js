const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
// "2026-10-05" → "Oct 5"
export const fmtDay = (d) => { if (!d) return ''; const [, m, dd] = d.split('-'); return `${MONTHS[Number(m) - 1]} ${Number(dd)}`; };
export { MONTHS };

// A task reminder fires at (start − days_before) at HH:MM local time. The server skips
// ones already in the past, so the UI must use the same full date-time rule.
export function reminderUpcoming(start, reminder, now = new Date()) {
  if (!start || !reminder) return false;
  const [y, m, d] = start.split('-').map(Number);
  const [hh, mm] = String(reminder.time || '09:00').split(':').map(Number);
  const at = new Date(y, m - 1, d - (reminder.days_before || 0), hh, mm);
  return at.getTime() > now.getTime();
}
