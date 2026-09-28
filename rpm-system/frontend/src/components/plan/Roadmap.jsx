import { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertTriangle, CalendarClock, CalendarPlus, Diamond, Flame, Loader2, Star } from 'lucide-react';
import { AuthContext } from '../../App';
import { fmtDay, MONTHS } from '../../utils/planFormat';
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

// Every active project on one timeline: span, progress, health and key-result milestones.
export default function Roadmap() {
  const { api } = useContext(AuthContext);
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [zoom, setZoom] = useState(null);
  const scrollRef = useRef(null);

  useEffect(() => {
    api.getRoadmap()
      .then(d => (d && !d.error ? setData(d) : setError(d?.error || 'Could not load the roadmap')))
      .catch(() => setError('Could not load the roadmap'));
  }, [api]);

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
    const counts = { risk: data.projects.filter(p => ['overdue', 'off_track', 'stalled', 'at_risk'].includes(p.risk)).length, overdue: data.projects.reduce((n, p) => n + (p.overdue || 0), 0) };
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
        <span className="rm-legend"><Diamond size={12} /> key-result deadline</span>
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
              {model.groups.map(g => (
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
                            <span key={i} className={`rm-ms ${RISK[m.status]?.tone || ''}`} style={{ left: x(m.date) + dw / 2 }}
                              title={`${m.title}\nTarget ${fmtDay(m.date)} · ${m.current ?? 0}/${m.target ?? '?'} ${m.unit || ''}\n${RISK[m.status]?.label || ''}`} />
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

      {model.undated.length > 0 && (
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
