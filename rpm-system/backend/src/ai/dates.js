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
module.exports = { ymd };
