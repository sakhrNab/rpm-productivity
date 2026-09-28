import { useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { AlertTriangle, ArrowRight, CalendarClock, CalendarPlus, Diamond, Flag, Flame, Gauge, Loader2, Star, Wand2, X } from 'lucide-react';
import { AuthContext } from '../../App';
import { fmtDay, MONTHS } from '../../utils/planFormat';
import { FORECAST_STATUS, SLIPPING, Trajectory, fmtDate, fmtNum, line } from '../ForecastPanel';
import useGoalFix from '../GoalFix';
import '../ForecastPanel.css';
import './ProjectTimeline.css';
import './Roadmap.css';

const DAY = 86400000;
const toMs = (d) => Date.parse(`${d}T00:00:00Z`);
const addDays = (d, n) => new Date(toMs(d) + n * DAY).toISOString().slice(0, 10);
const ZOOMS = { weeks: 16, months: 5, quarters: 2 };          // px per day
const RISK = {
  overdue: { label: 'Overdue', tone: 'bad' },
  off_track: { label: 'Off track', tone: 'bad' },
  stalled: { label: 'Stalled', tone: 'warn' },
  at_risk: { label: 'At risk', tone: 'warn' },
  on_track: { label: 'On track', tone: 'good' },
  done: { label: 'Done', tone: 'good' },
};

// One key result's forecast, opened from its diamond: where it stands, the pace you're on vs
// the pace you need, when it lands — and "Draft a fix" when it's slipping.
function GoalCard({ goal, anchor, onClose, onFix, fixing }) {
  const ref = useRef(null);
  const [pos, setPos] = useState(null);
  useLayoutEffect(() => {
    const r = anchor.getBoundingClientRect(), el = ref.current;
    const w = Math.min(340, window.innerWidth - 24), h = el ? el.offsetHeight : 320;
    const left = Math.max(12, Math.min(r.left + r.width / 2 - w / 2, window.innerWidth - w - 12));
    const below = r.bottom + 8 + h <= window.innerHeight - 12;
    setPos({ left, width: w, top: below ? r.bottom + 8 : Math.max(12, r.top - h - 8) });
  }, [anchor, goal]);
  useEffect(() => {
    const key = (e) => { if (e.key === 'Escape') onClose(); };
    const down = (e) => { if (ref.current && !ref.current.contains(e.target) && !anchor.contains(e.target)) onClose(); };
    const scroll = (e) => { if (!ref.current?.contains(e.target)) onClose(); };
    document.addEventListener('keydown', key); document.addEventListener('mousedown', down); document.addEventListener('scroll', scroll, true);
    window.addEventListener('resize', onClose);
    return () => { document.removeEventListener('keydown', key); document.removeEventListener('mousedown', down); document.removeEventListener('scroll', scroll, true); window.removeEventListener('resize', onClose); };
  }, [anchor, onClose]);

  const f = goal;
  const st = FORECAST_STATUS[f.status] || FORECAST_STATUS.unknown;
  const pctNow = f.target > 0 ? Math.min(100, Math.round((f.current / f.target) * 100)) : 0;
  const forecastable = ['on_track', 'at_risk', 'off_track', 'stalled'].includes(f.status);
  const need = f.required_per_week;
  const paceRatio = need > 0 ? f.rate_per_week / need : null;
  return createPortal(
    <div ref={ref} className={`rm-goal fc-t-${st.tone}`} role="dialog" aria-label={`Goal: ${f.title}`}
      style={pos ? { left: pos.left, top: pos.top, width: pos.width } : { visibility: 'hidden', left: 0, top: 0 }}>
      <div className="rm-goal-top">
        <span className={`ui-chip ui-chip--${st.tone}`}><span className="fc-dot" />{st.label}</span>
        {f.days_remaining != null && f.status !== 'done' && <span className={`fc-left ${f.days_remaining < 0 ? 'late' : ''}`}>{f.days_remaining < 0 ? `${-f.days_remaining}d over` : `${f.days_remaining}d left`}</span>}
        <button type="button" className="rm-goal-x" onClick={onClose} aria-label="Close"><X size={15} /></button>
      </div>
      <h3 className="rm-goal-title">{f.title}</h3>
      <p className="rm-goal-proj">{f.project} · due {fmtDate(f.target_date)}</p>
      <div className="fc-figures">
        <span className="fc-now"><b>{fmtNum(f.current)}</b><span>/ {fmtNum(f.target)} {f.unit}</span></span>
        {f.target > 0 && <span className="fc-pct">{pctNow}%</span>}
      </div>
      <div className="fc-bar"><span className="fc-bar-now" style={{ width: `${pctNow}%` }} /></div>
      {forecastable && (
        <>
          <Trajectory f={f} />
          <dl className="fc-metrics">
            <div><dt><Gauge size={12} /> Your pace</dt><dd>{fmtNum(f.rate_per_week)}<i>/wk</i></dd></div>
            <div><dt><Flag size={12} /> Needed</dt><dd>{fmtNum(need)}<i>/wk</i>{paceRatio != null && f.rate_per_week > 0 && <em className={paceRatio >= 1 ? 'up' : 'down'}>{paceRatio >= 1 ? `${fmtNum(paceRatio)}× ahead` : `${fmtNum(1 / paceRatio)}× short`}</em>}</dd></div>
            <div><dt><CalendarClock size={12} /> Finish</dt><dd>{f.projected_date && (f.projected_final ?? 0) >= f.target ? fmtDate(f.projected_date) : <span className="fc-never">not at this pace</span>}</dd></div>
          </dl>
        </>
      )}
      <p className="fc-line">{line(f)}</p>
      <div className="rm-goal-actions">
        {SLIPPING.has(f.status) && (
          <button type="button" className="fc-fix" onClick={() => onFix(f)} disabled={fixing}>
            {fixing ? <><Loader2 size={14} className="rm-spin" /> Drafting…</> : <><Wand2 size={14} /> Draft a fix</>}
          </button>
        )}
        <Link className="rm-goal-open" to={`/projects/${f.project_id}`}>Open project <ArrowRight size={13} /></Link>
      </div>
    </div>,
    document.body
  );
}

// Every active project on one timeline: span, progress, health and key-result milestones.
export default function Roadmap() {
  const { api } = useContext(AuthContext);
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [zoom, setZoom] = useState(null);
  const [goal, setGoal] = useState(null);     // { goal, anchor } — the open diamond
  const [params, setParams] = useSearchParams();
  const slippingOnly = params.get('slipping') === '1';
  const scrollRef = useRef(null);

  const load = () => api.getRoadmap()
    .then(d => (d && !d.error ? setData(d) : setError(d?.error || 'Could not load the roadmap')))
    .catch(() => setError('Could not load the roadmap'));
  useEffect(() => { load(); }, [api]); // eslint-disable-line react-hooks/exhaustive-deps
  const { draft, fixingId, modal: fixModal } = useGoalFix({ onApplied: () => { setGoal(null); load(); } });
  const setSlipping = (on) => {
    const next = new URLSearchParams(params);
    if (on) next.set('slipping', '1'); else next.delete('slipping');
    setParams(next, { replace: true });
  };

  const model = useMemo(() => {
    if (!data) return null;
    const dated = data.projects.filter(p => p.start && p.end);
    const undated = data.projects.filter(p => !(p.start && p.end));
    const all = dated.flatMap(p => [p.start, p.end, ...p.milestones.map(m => m.date)]).concat(data.today).sort();
    const first = addDays(all[0], -14), last = addDays(all[all.length - 1], 30);
    // Start on the 1st of the month so month bands line up.
    const from = `${first.slice(0, 7)}-01`;
    const days = Math.round((toMs(last) - toMs(from)) / DAY) + 1;
    const groups = [];
    for (const p of dated) {
      let g = groups.find(x => x.id === p.category_id);
      if (!g) groups.push(g = { id: p.category_id, name: p.category_name, color: p.category_color, projects: [] });
      g.projects.push(p);
    }
    const months = [];
    for (let d = from; d <= last; ) {
      const [y, m] = d.split('-').map(Number);
      const next = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;
      months.push({ key: d, label: `${MONTHS[m - 1]}${m === 1 || !months.length ? ` ${y}` : ''}`, offset: (toMs(d) - toMs(from)) / DAY, len: (Math.min(toMs(next), toMs(last) + DAY) - toMs(d)) / DAY });
      d = next;
    }
    const counts = {
      risk: data.projects.filter(p => ['overdue', 'off_track', 'stalled', 'at_risk'].includes(p.risk)).length,
      overdue: data.projects.reduce((n, p) => n + (p.overdue || 0), 0),
      slipping: dated.reduce((n, p) => n + p.milestones.filter(m => SLIPPING.has(m.status)).length, 0),
    };
    return { from, days, groups, undated, months, counts, span: Math.round((toMs(all[all.length - 1]) - toMs(all[0])) / DAY) };
  }, [data]);

  // First open: the closest zoom that still shows the whole plan.
  useEffect(() => { if (model && !zoom) setZoom(model.span <= 75 ? 'weeks' : model.span <= 300 ? 'months' : 'quarters'); }, [model, zoom]);

  const dw = ZOOMS[zoom || 'months'];
  const x = (d) => ((toMs(d) - toMs(model.from)) / DAY) * dw;

  // Open with today in view.
  useEffect(() => {
    if (!model || !scrollRef.current) return;
    scrollRef.current.scrollLeft = Math.max(0, x(data.today) - 160);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model, zoom]);

  if (error) return <div className="rm-empty"><AlertTriangle size={18} /> {error}</div>;
  if (!model) return <div className="rm-empty"><Loader2 size={18} className="rm-spin" /> Loading roadmap…</div>;
  if (!data.projects.length) return <div className="rm-empty"><CalendarPlus size={18} /> No active projects yet.</div>;

  const width = model.days * dw;
  // Week ticks (Mondays) when zoomed to weeks; month starts are already labelled.
  const ticks = [];
  if (zoom === 'weeks') {
    for (let d = model.from; toMs(d) <= toMs(model.from) + (model.days - 1) * DAY; d = addDays(d, 1)) {
      if (new Date(toMs(d)).getUTCDay() === 1) ticks.push(d);
    }
  }
  const open = (p) => navigate(`/projects/${p.id}?view=timeline`);

  return (
    <div className="rm">
      <div className="rm-bar">
        <div className="ptv-seg" role="tablist" aria-label="Zoom">
          {Object.keys(ZOOMS).map(z => (
            <button key={z} type="button" className={zoom === z ? 'on' : ''} onClick={() => setZoom(z)}>{z[0].toUpperCase() + z.slice(1)}</button>
          ))}
        </div>
        <span className="rm-stat"><b>{data.projects.length}</b> active</span>
        {model.counts.risk > 0 && <span className="rm-stat warn"><Flame size={14} /> <b>{model.counts.risk}</b> need attention</span>}
        {model.counts.overdue > 0 && <span className="rm-stat bad"><AlertTriangle size={14} /> <b>{model.counts.overdue}</b> overdue task{model.counts.overdue > 1 ? 's' : ''}</span>}
        {(model.counts.slipping > 0 || slippingOnly) && (
          <button type="button" className={`rm-filter ${slippingOnly ? 'on' : ''}`} aria-pressed={slippingOnly} onClick={() => setSlipping(!slippingOnly)}
            title="Show only projects with a goal that's behind pace, stalled or overdue">
            <Flame size={13} /> Slipping only <b>{model.counts.slipping}</b>
          </button>
        )}
        <span className="rm-legend"><Diamond size={12} /> key-result deadline — tap one for its forecast</span>
      </div>

      {model.groups.length > 0 && (
        <div className="rm-scroll" ref={scrollRef}>
          <div className="rm-inner" style={{ width: `calc(var(--rm-label) + ${width}px)` }}>
            <div className="rm-head">
              <div className="rm-corner">Projects</div>
              <div className="rm-scale" style={{ width }}>
                {model.months.map(m => (
                  <div key={m.key} className="rm-month" style={{ left: m.offset * dw, width: m.len * dw }}><span>{m.label}</span></div>
                ))}
                {ticks.map(t => <span key={t} className="rm-tick" style={{ left: x(t) }}>{Number(t.slice(8))}</span>)}
                <div className="rm-today-chip" style={{ left: x(data.today) + dw / 2 }}>Today</div>
              </div>
            </div>

            <div className="rm-body">
              {ticks.map(t => <span key={t} className="rm-grid" style={{ left: `calc(var(--rm-label) + ${x(t)}px)` }} aria-hidden="true" />)}
              <div className="rm-today" style={{ left: `calc(var(--rm-label) + ${x(data.today) + dw / 2}px)` }} aria-hidden="true" />
              {slippingOnly && !model.counts.slipping && <div className="rm-none">Nothing is slipping — every goal with a deadline is on pace. 🎯</div>}
              {model.groups.map(g => ({ ...g, projects: slippingOnly ? g.projects.filter(p => p.milestones.some(m => SLIPPING.has(m.status))) : g.projects })).filter(g => g.projects.length).map(g => (
                <div key={g.id || 'none'} className="rm-group" style={{ '--cat': g.color }}>
                  <div className="rm-group-head"><span className="rm-dot" />{g.name}<i>{g.projects.length}</i></div>
                  {g.projects.map(p => {
                    const left = x(p.start), w = Math.max(dw, x(p.end) - left + dw);
                    // A bar too short for its label shows as a slim pill; the label (and any overdue
                    // count) sits just after it, so nothing is squeezed or clipped inside.
                    const short = w < 96, barW = Math.max(w, 12), pct = Math.round(p.progress * 100);
                    const label = `${pct}%${p.next_date ? ` · next ${fmtDay(p.next_date)}` : ''}`;
                    const risk = RISK[p.risk];
                    const tip = `${p.name}\n${fmtDay(p.start)} → ${fmtDay(p.end)}${p.dates_from === 'tasks' ? ' (from its tasks)' : ''}\n${p.tasks_done}/${p.tasks_total} tasks done${p.overdue ? ` · ${p.overdue} overdue` : ''}${risk ? `\nGoals: ${risk.label}` : ''}`;
                    return (
                      <div key={p.id} className="rm-row">
                        <button type="button" className="rm-label" onClick={() => open(p)} title={p.result || p.name}>
                          {p.is_starred && <Star size={12} className="rm-star" />}
                          <span className="rm-name">{p.name}</span>
                          {risk && <span className={`rm-risk ${risk.tone}`}>{risk.label}</span>}
                        </button>
                        <div className="rm-track" style={{ width }}>
                          <button type="button" className={`rm-bar-p ${risk ? `tone-${risk.tone}` : ''} ${p.dates_from === 'tasks' ? 'soft' : ''} ${short ? 'short' : ''}`}
                            style={{ left, width: barW, '--pct': `${pct}%` }} onClick={() => open(p)} title={tip} aria-label={tip}>
                            <span className="rm-fill" />
                            {!short && <span className="rm-bar-text">{label}</span>}
                            {!short && p.overdue > 0 && <span className="rm-overdue" title={`${p.overdue} overdue`}>{p.overdue}</span>}
                          </button>
                          {short && (
                            <span className="rm-outside" style={{ left: left + barW + 8 }}>
                              {label}
                              {p.overdue > 0 && <span className="rm-overdue" title={`${p.overdue} overdue`}>{p.overdue}</span>}
                            </span>
                          )}
                          {p.milestones.map((m, i) => (
                            <button key={m.id || i} type="button"
                              className={`rm-ms-hit ${slippingOnly && !SLIPPING.has(m.status) ? 'dim' : ''} ${goal?.goal.id === m.id ? 'open' : ''}`}
                              style={{ left: x(m.date) + dw / 2 }}
                              onClick={(e) => { const anchor = e.currentTarget; setGoal(g => (g?.goal.id === m.id ? null : { goal: m, anchor })); }}
                              aria-label={`${m.title}: ${RISK[m.status]?.label || m.status}, ${m.current ?? 0} of ${m.target ?? '?'} ${m.unit || ''}, due ${fmtDay(m.date)}. Open forecast`}
                              title={`${m.title} · ${m.current ?? 0}/${m.target ?? '?'} ${m.unit || ''} · due ${fmtDay(m.date)}`}>
                              <span className={`rm-ms ${RISK[m.status]?.tone || ''}`} />
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {goal && <GoalCard goal={goal.goal} anchor={goal.anchor} onClose={() => setGoal(null)} onFix={draft} fixing={fixingId === goal.goal.id} />}
      {fixModal}

      {model.undated.length > 0 && !slippingOnly && (
        <div className="ptv-tray">
          <div className="ptv-tray-head"><span><CalendarClock size={14} /> <b>{model.undated.length}</b> project{model.undated.length > 1 ? 's' : ''} without dates — give {model.undated.length > 1 ? 'them' : 'it'} dated tasks to place {model.undated.length > 1 ? 'them' : 'it'} here</span></div>
          <div className="ptv-chips">
            {model.undated.map(p => <Link key={p.id} to={`/projects/${p.id}`} className="ptv-chip">{p.name}</Link>)}
          </div>
        </div>
      )}
    </div>
  );
}
