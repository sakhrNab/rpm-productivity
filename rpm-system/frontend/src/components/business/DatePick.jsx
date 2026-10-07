import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CalendarDays, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { addDaysStr, daysBetween, fmtDate, todayStr } from './bizConfig';

// The Business date field: a chip-style trigger + an in-app popover (quick picks and a month grid).
// Replaces the OS date input. value/onChange speak YYYY-MM-DD (or '' / null for none).
const MON = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const p2 = (n) => String(n).padStart(2, '0');
const iso = (y, m, d) => `${y}-${p2(m + 1)}-${p2(d)}`;

export function relDay(v, today = todayStr()) {
  if (!v) return '';
  const d = daysBetween(today, v);
  if (d === 0) return 'Today';
  if (d === 1) return 'Tomorrow';
  if (d === -1) return 'Yesterday';
  if (d < 0) return `${fmtDate(v)} · ${-d}d late`;
  return fmtDate(v);
}

export default function DatePick({ value, onChange, placeholder = 'No date', label, allowClear = true, compact = false, tone, id, className = '' }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const today = todayStr();
  const start = value || today;
  const [view, setView] = useState({ y: +start.slice(0, 4), m: +start.slice(5, 7) - 1 });
  const btn = useRef(null);
  const menu = useRef(null);

  const place = () => {
    const r = btn.current?.getBoundingClientRect();
    if (!r) return;
    const w = 288; const h = 372;
    const left = Math.min(Math.max(8, r.left), window.innerWidth - w - 8);
    const below = window.innerHeight - r.bottom;
    setPos(below < h + 12 && r.top > below ? { left, bottom: window.innerHeight - r.top + 6 } : { left, top: r.bottom + 6 });
  };
  useLayoutEffect(() => { if (open) { place(); const s = value || today; setView({ y: +s.slice(0, 4), m: +s.slice(5, 7) - 1 }); } }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!open) return undefined;
    const down = (e) => { if (!btn.current?.contains(e.target) && !menu.current?.contains(e.target)) setOpen(false); };
    const key = (e) => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); btn.current?.focus(); } };
    const mv = () => place();
    document.addEventListener('mousedown', down);
    document.addEventListener('keydown', key, true);
    window.addEventListener('resize', mv);
    window.addEventListener('scroll', mv, true);
    requestAnimationFrame(() => menu.current?.querySelector('[aria-selected="true"], .dp-quick button')?.focus());
    return () => { document.removeEventListener('mousedown', down); document.removeEventListener('keydown', key, true); window.removeEventListener('resize', mv); window.removeEventListener('scroll', mv, true); };
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const pick = (v) => { setOpen(false); if ((v || null) !== (value || null)) onChange(v || null); btn.current?.focus(); };
  const dow = new Date(Date.UTC(view.y, view.m, 1)).getUTCDay();
  const lead = (dow + 6) % 7; // Monday first
  const days = new Date(Date.UTC(view.y, view.m + 1, 0)).getUTCDate();
  const cells = [...Array(lead).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  const shift = (n) => setView(({ y, m }) => { const t = m + n; return { y: y + Math.floor(t / 12), m: ((t % 12) + 12) % 12 }; });
  const nextMon = addDaysStr(today, ((8 - new Date(`${today}T12:00:00Z`).getUTCDay()) % 7) || 7);
  const quick = [['Today', today], ['Tomorrow', addDaysStr(today, 1)], ['+2 days', addDaysStr(today, 2)], ['Next Mon', nextMon], ['+1 week', addDaysStr(today, 7)], ['+2 weeks', addDaysStr(today, 14)]];
  const late = value && value < today;

  return (
    <>
      <button ref={btn} id={id} type="button" aria-haspopup="dialog" aria-expanded={open} aria-label={label ? `${label}: ${value ? fmtDate(value) : placeholder}` : undefined}
        className={`dp-trigger ${compact ? 'compact' : ''} ${open ? 'open' : ''} ${value ? '' : 'empty'} ${tone || (late ? 'late' : '')} ${className}`}
        onClick={() => setOpen((o) => !o)}>
        <CalendarDays size={compact ? 13 : 15} aria-hidden="true" />
        <span>{value ? relDay(value, today) : placeholder}</span>
      </button>
      {open && pos && createPortal(
        <div ref={menu} className="dp-menu" role="dialog" aria-label={label || 'Pick a date'} style={pos}>
          <div className="dp-quick">
            {quick.map(([l, v]) => <button key={l} type="button" className={v === value ? 'on' : ''} onClick={() => pick(v)}>{l}</button>)}
          </div>
          <div className="dp-head">
            <button type="button" className="dp-nav" aria-label="Previous month" onClick={() => shift(-1)}><ChevronLeft size={16} /></button>
            <b>{MON[view.m]} {view.y}</b>
            <button type="button" className="dp-nav" aria-label="Next month" onClick={() => shift(1)}><ChevronRight size={16} /></button>
          </div>
          <div className="dp-grid" role="grid">
            {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => <span key={`h${i}`} className="dp-dow">{d}</span>)}
            {cells.map((d, i) => {
              if (!d) return <span key={`e${i}`} />;
              const v = iso(view.y, view.m, d);
              return (
                <button key={v} type="button" role="gridcell" aria-selected={v === value} aria-label={fmtDate(v)}
                  className={`dp-day ${v === today ? 'today' : ''} ${v === value ? 'on' : ''} ${v < today ? 'past' : ''}`} onClick={() => pick(v)}>{d}</button>
              );
            })}
          </div>
          {allowClear && value && <button type="button" className="dp-clear" onClick={() => pick(null)}><X size={14} /> Clear date</button>}
        </div>,
        document.body,
      )}
    </>
  );
}
