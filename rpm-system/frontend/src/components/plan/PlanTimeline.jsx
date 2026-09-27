import { useMemo, useRef, useState, useEffect } from 'react';
import { Bell, Flag, Sparkles, Pin, ChevronDown, ChevronRight, Diamond } from 'lucide-react';
import { addDays, diffDays } from '../../utils/planSchedule';
import { fmtDay, MONTHS, reminderUpcoming } from '../../utils/planFormat';
import './PlanTimeline.css';

// Interactive Gantt for a scheduled plan. Pure presentation: it receives scheduled
// tasks (start/end/critical/…) and reports edits via onPin / onOpen.
const DAY_W = { day: 46, week: 20, month: 7 };
const ROW_H = 46;
const PHASE_H = 40;
const HEADER_H = 74;           // month tier · tick tier · today tier
const PRIORITY = ['none', 'low', 'medium', 'high'];
const WD = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const dow = (d) => new Date(`${d}T00:00:00Z`).getUTCDay();

function chainOf(key, tasks) {
  const byKey = new Map(tasks.map(t => [t.key, t]));
  const succ = new Map(tasks.map(t => [t.key, []]));
  for (const t of tasks) for (const d of t.depends_on) succ.get(d)?.push(t.key);
  const seen = new Set([key]);
  const up = [key], down = [key];
  while (up.length) for (const d of byKey.get(up.pop())?.depends_on || []) if (!seen.has(d)) { seen.add(d); up.push(d); }
  while (down.length) for (const s of succ.get(down.pop()) || []) if (!seen.has(s)) { seen.add(s); down.push(s); }
  return seen;
}

export default function PlanTimeline({ tasks, phases, today, zoom, spotlight, onPin, onOpen, selectedKey }) {
  const dw = DAY_W[zoom] || DAY_W.week;
  const [collapsed, setCollapsed] = useState({});
  const [hoverKey, setHoverKey] = useState(null);
  const [drag, setDrag] = useState(null);           // { key, x0, dx }
  const scrollRef = useRef(null);

  // Visible range: a little air before the first task (and today) and after the last date.
  const range = useMemo(() => {
    let lo = today, hi = today;
    for (const t of tasks) {
      if (t.start < lo) lo = t.start;
      const last = [t.end, t.deadline].filter(Boolean).sort().pop();
      if (last > hi) hi = last;
    }
    const pad = zoom === 'day' ? 2 : zoom === 'week' ? 4 : 10;
    const start = addDays(lo, -pad);
    const days = diffDays(start, addDays(hi, pad + (zoom === 'month' ? 20 : 6))) + 1;
    return { start, days };
  }, [tasks, today, zoom]);
  const x = (d) => diffDays(range.start, d) * dw;

  // Rows: each phase, then its tasks by start date.
  const rows = useMemo(() => {
    const out = [];
    let y = 0;
    for (const ph of phases) {
      const mine = tasks.filter(t => t.phase === ph.key).sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : a.key < b.key ? -1 : 1));
      if (!mine.length) continue;
      const incl = mine.filter(t => t.include);
      const pStart = (incl.length ? incl : mine).reduce((m, t) => (t.start < m ? t.start : m), mine[0].start);
      const pEnd = (incl.length ? incl : mine).reduce((m, t) => (t.end > m ? t.end : m), mine[0].end);
      out.push({ type: 'phase', ph, y, h: PHASE_H, start: pStart, end: pEnd, count: mine.length });
      y += PHASE_H;
      if (!collapsed[ph.key]) for (const t of mine) { out.push({ type: 'task', t, y, h: ROW_H }); y += ROW_H; }
    }
    return { list: out, height: y };
  }, [tasks, phases, collapsed]);
  const rowOf = useMemo(() => new Map(rows.list.filter(r => r.type === 'task').map(r => [r.t.key, r])), [rows]);

  const chain = useMemo(() => (hoverKey ? chainOf(hoverKey, tasks) : null), [hoverKey, tasks]);

  // Header tiers.
  const header = useMemo(() => {
    const months = [];
    const ticks = [];
    for (let i = 0; i < range.days; i++) {
      const d = addDays(range.start, i);
      const ym = d.slice(0, 7);
      if (!months.length || months[months.length - 1].ym !== ym) months.push({ ym, i, n: 0, label: `${MONTHS[Number(d.slice(5, 7)) - 1]} ${d.slice(0, 4)}` });
      months[months.length - 1].n++;
      if (zoom === 'day') ticks.push({ i, top: Number(d.slice(8)), sub: WD[dow(d)], weekend: [0, 6].includes(dow(d)) });
      else if (zoom === 'week' && dow(d) === 1) ticks.push({ i, top: fmtDay(d) });
      else if (zoom === 'month' && [1, 15].includes(Number(d.slice(8)))) ticks.push({ i, top: Number(d.slice(8)) });
    }
    return { months, ticks };
  }, [range, zoom]);

  // Scroll so today (or the plan start) is in view when the zoom changes.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollLeft = Math.max(0, x(today) - 120);
  }, [zoom]); // eslint-disable-line react-hooks/exhaustive-deps

  const width = range.days * dw;
  const todayX = x(today);

  // Drag to reschedule (pins the task's start; dependents re-flow upstream of this component).
  const onPointerDown = (e, t) => {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag({ key: t.key, x0: e.clientX, dx: 0 });
  };
  const onPointerMove = (e) => { if (drag) setDrag(d => ({ ...d, dx: e.clientX - d.x0 })); };
  const onPointerUp = (e, t) => {
    if (!drag) return;
    const days = Math.round(drag.dx / dw);
    setDrag(null);
    if (Math.abs(drag.dx) < 4) onOpen(t.key);
    else if (days) onPin(t.key, addDays(t.start, days));
  };
  const onKey = (e, t) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); onPin(t.key, addDays(t.start, e.key === 'ArrowRight' ? 1 : -1)); }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(t.key); }
  };

  // Dependency curves.
  const edges = [];
  for (const t of tasks) {
    const to = rowOf.get(t.key);
    if (!to) continue;
    for (const d of t.depends_on) {
      const fromRow = rowOf.get(d);
      if (!fromRow) continue;
      const from = fromRow.t;
      const x1 = x(from.end) + dw - 3, y1 = fromRow.y + ROW_H / 2;
      const x2 = x(t.start) + 1, y2 = to.y + ROW_H / 2;
      const k = Math.max(16, Math.abs(x2 - x1) / 2);
      const hot = chain ? chain.has(t.key) && chain.has(d) : false;
      const crit = from.critical && t.critical && from.include && t.include;
      edges.push({ id: `${d}>${t.key}`, path: `M${x1},${y1} C${x1 + k},${y1} ${x2 - k},${y2} ${x2},${y2}`, hot, crit, off: !from.include || !t.include });
    }
  }

  return (
    <div className={`ptl ptl-z-${zoom} ${spotlight ? 'spotlight' : ''} ${chain ? 'has-hover' : ''}`}>
      <div className="ptl-scroll" ref={scrollRef} onPointerMove={onPointerMove}>
        <div className="ptl-inner" style={{ width: `calc(var(--ptl-label) + ${width}px)`, '--dw': `${dw}px` }}>
          {/* Header */}
          <div className="ptl-header" style={{ height: HEADER_H }}>
            <div className="ptl-corner">
              <span>Phase · task</span>
            </div>
            <div className="ptl-scale" style={{ width }}>
              {header.months.map(m => (
                <div key={m.ym} className="ptl-month" style={{ left: m.i * dw, width: m.n * dw }}><span>{m.label}</span></div>
              ))}
              {header.ticks.map(tk => (
                <div key={tk.i} className={`ptl-tick ${tk.weekend ? 'weekend' : ''}`} style={{ left: tk.i * dw, width: zoom === 'day' ? dw : undefined }}>
                  <b>{tk.top}</b>{tk.sub && <i>{tk.sub}</i>}
                </div>
              ))}
              {todayX >= 0 && todayX <= width && <div className="ptl-today-chip" style={{ left: todayX + dw / 2 }}>Today</div>}
            </div>
          </div>

          {/* Body */}
          <div className="ptl-body" style={{ height: rows.height }}>
            <svg className="ptl-bg" width={width} height={rows.height} style={{ left: 'var(--ptl-label)' }} aria-hidden="true">
              {zoom === 'day' && Array.from({ length: range.days }, (_, i) => i).filter(i => [0, 6].includes(dow(addDays(range.start, i)))).map(i => (
                <rect key={i} x={i * dw} y={0} width={dw} height={rows.height} className="ptl-weekend" />
              ))}
            </svg>

            {rows.list.map(r => (r.type === 'phase' ? (
              <div key={`ph-${r.ph.key}`} className="ptl-row ptl-phase-row" style={{ top: r.y, height: r.h }}>
                <button type="button" className="ptl-label ptl-phase-label" onClick={() => setCollapsed(c => ({ ...c, [r.ph.key]: !c[r.ph.key] }))}
                  aria-expanded={!collapsed[r.ph.key]}>
                  {collapsed[r.ph.key] ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                  <span className="ptl-phase-name">{r.ph.title}</span>
                  <span className="ptl-phase-count">{r.count}</span>
                </button>
                <div className="ptl-phase-band" style={{ left: `calc(var(--ptl-label) + ${x(r.start)}px)`, width: Math.max(dw, (diffDays(r.start, r.end) + 1) * dw - 4) }}>
                  <span>{fmtDay(r.start)} → {fmtDay(r.end)}</span>
                </div>
                <div className="ptl-milestone" style={{ left: `calc(var(--ptl-label) + ${x(r.end) + dw - 8}px)` }} title={`${r.ph.title} complete · ${fmtDay(r.end)}`}>
                  <Diamond size={14} />
                </div>
              </div>
            ) : (
              <TaskRow key={r.t.key} r={r} x={x} dw={dw} drag={drag} selected={selectedKey === r.t.key}
                dim={chain ? !chain.has(r.t.key) : false}
                onHover={setHoverKey} onPointerDown={onPointerDown} onPointerUp={onPointerUp} onKey={onKey} onOpen={onOpen} />
            )))}

            <svg className="ptl-edges" width={width} height={rows.height} style={{ left: 'var(--ptl-label)' }} aria-hidden="true">
              <defs>
                <marker id="ptl-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                  <path d="M0,0 L8,4 L0,8 z" className="ptl-arrowhead" />
                </marker>
                <linearGradient id="ptl-crit" x1="0" x2="1" y1="0" y2="0">
                  <stop offset="0" stopColor="#ff69b4" /><stop offset="1" stopColor="#4ecdc4" />
                </linearGradient>
              </defs>
              {edges.map(e => (
                <path key={e.id} d={e.path} markerEnd="url(#ptl-arrow)"
                  className={`ptl-edge ${e.crit ? 'crit' : ''} ${e.hot ? 'hot' : ''} ${e.off ? 'off' : ''}`} />
              ))}
            </svg>

            {todayX >= 0 && todayX <= width && <div className="ptl-today" style={{ left: `calc(var(--ptl-label) + ${todayX + dw / 2}px)` }} />}
          </div>
        </div>
      </div>
    </div>
  );
}

function TaskRow({ r, x, dw, drag, selected, dim, onHover, onPointerDown, onPointerUp, onKey, onOpen }) {
  const t = r.t;
  const dragging = drag && drag.key === t.key;
  const left = x(t.start);
  const w = Math.max(10, t.span_days * dw - 6);
  const inside = w > 110;
  const preview = dragging ? addDays(t.start, Math.round(drag.dx / dw)) : null;
  // A reminder that would already be in the past is not created — don't draw it.
  const reminderDay = reminderUpcoming(t.start, t.reminder) ? addDays(t.start, -t.reminder.days_before) : null;
  const cls = [
    'ptl-bar', `p${t.priority}`, `s-${t.size}`,
    t.critical && t.include ? 'critical' : '', t.source === 'initiative' ? 'initiative' : '',
    t.late ? 'late' : '', !t.include ? 'excluded' : '', dragging ? 'dragging' : '', selected ? 'selected' : '',
  ].join(' ');
  return (
    <div className={`ptl-row ptl-task-row ${dim ? 'dim' : ''}`} style={{ top: r.y, height: r.h }}
      onMouseEnter={() => onHover(t.key)} onMouseLeave={() => onHover(null)}>
      <button type="button" className={`ptl-label ptl-task-label ${!t.include ? 'excluded' : ''}`} onClick={() => onOpen(t.key)} title={t.title}>
        <span className={`ptl-dot p${t.priority}`} />
        <span className="ptl-task-name">{t.title}</span>
        {t.source === 'initiative' && <Sparkles size={12} className="ptl-ai" />}
      </button>
      <div className="ptl-track" style={{ left: 'var(--ptl-label)' }}>
        {reminderDay && t.include && (
          <span className="ptl-bell" style={{ left: x(reminderDay) + dw / 2 - 7 }} title={`Reminder ${fmtDay(reminderDay)} at ${t.reminder.time}`}><Bell size={11} /></span>
        )}
        {t.deadline && t.include && t.deadline > t.end && (
          <span className="ptl-runway" style={{ left: left + w, width: Math.max(0, x(t.deadline) + dw - 2 - (left + w)) }} title={`${t.slack_days ?? ''}d before the deadline`} />
        )}
        {t.deadline && (
          <span className={`ptl-deadline ${t.late ? 'late' : ''}`} style={{ left: x(t.deadline) + dw - 2 }} title={`Deadline ${fmtDay(t.deadline)}`}><Flag size={11} /></span>
        )}
        <button
          type="button"
          className={cls}
          style={{ left, width: w, transform: dragging ? `translateX(${drag.dx}px)` : undefined }}
          onPointerDown={(e) => onPointerDown(e, t)}
          onPointerUp={(e) => onPointerUp(e, t)}
          onKeyDown={(e) => onKey(e, t)}
          aria-label={`${t.title}: ${fmtDay(t.start)} to ${fmtDay(t.end)}, ${PRIORITY[t.priority]} priority${t.critical ? ', on the critical path' : ''}. Arrow keys move it a day; Enter edits.`}
        >
          {t.pin && <Pin size={10} className="ptl-pin" />}
          {inside && <span className="ptl-bar-title">{t.title}</span>}
          {dragging && <span className="ptl-drag-date">{fmtDay(preview)}</span>}
        </button>
        {!inside && <span className="ptl-bar-outside" style={{ left: left + w + 8 }} onClick={() => onOpen(t.key)}>{t.title}</span>}
      </div>
    </div>
  );
}
