// pg returns DATE columns as JS Date objects (built at local midnight), so
// String(date).slice(0, 10) yields "Sat Jul 25" — no year, not ISO. Anything that
// shows a date to a model (or a person) must go through ymd().
function ymd(d) {
  if (d == null || d === '') return '';
  if (d instanceof Date) {
    if (Number.isNaN(d.getTime())) return '';
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }
  return String(d).slice(0, 10);
}

// A wall-clock time in an IANA timezone ("2026-09-29T09:00" in Europe/Berlin) → UTC ISO.
// null when the input isn't a real local date-time.
function zonedToUtc(local, tz) {
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})$/.exec(String(local || ''));
  if (!m || +m[4] > 23 || +m[5] > 59) return null;
  const asUtc = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  if (new Date(asUtc).toISOString().slice(0, 10) !== `${m[1]}-${m[2]}-${m[3]}`) return null;
  let fmt;
  try { fmt = new Intl.DateTimeFormat('en-US', { timeZone: tz || 'UTC', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }); }
  catch { fmt = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }); }
  const offset = (t) => {
    const p = Object.fromEntries(fmt.formatToParts(new Date(t)).map(x => [x.type, x.value]));
    return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute) - t;
  };
  // Two passes settle the offset across a DST change.
  let t = asUtc - offset(asUtc);
  t = asUtc - offset(t);
  return new Date(t).toISOString();
}

module.exports = { ymd, zonedToUtc };
