import { useState, useEffect, useContext } from 'react';
import { Link } from 'react-router-dom';
import { TrendingUp, RefreshCw, Wand2, Loader2, Target, Flag, Gauge, CalendarClock } from 'lucide-react';
import { AuthContext } from '../App';
import { useToast } from './ToastProvider';
import BrainDumpModal from './BrainDumpModal';
import './ForecastPanel.css';

// cls drives behaviour (warn/bad → "Draft a fix"); tone drives colour only.
const FORECAST_STATUS = {
  on_track:   { label: 'On track',   cls: 'ok',    tone: 'good' },
  at_risk:    { label: 'At risk',    cls: 'warn',  tone: 'warn' },
  off_track:  { label: 'Off track',  cls: 'bad',   tone: 'bad' },
  stalled:    { label: 'Stalled',    cls: 'bad',   tone: 'warn' },
  overdue:    { label: 'Overdue',    cls: 'bad',   tone: 'bad' },
  done:       { label: 'Reached',    cls: 'ok',    tone: 'good' },
  no_deadline:{ label: 'No deadline',cls: 'muted', tone: 'info' },
  no_target:  { label: 'No target',  cls: 'muted', tone: 'info' },
  unknown:    { label: '—',          cls: 'muted', tone: 'info' },
};
// Most urgent first (presentational ordering only).
const SEVERITY = { overdue: 0, off_track: 1, at_risk: 2, stalled: 3, on_track: 4, no_deadline: 5, no_target: 6, unknown: 7, done: 8 };
const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'attention', label: 'Needs attention' },
  { key: 'ok', label: 'On track' },
];
const DAY = 86400000;

function fmtDate(s) {
  if (!s) return '';
  try { return new Date(s + 'T00:00:00').toLocaleDateString([], { month: 'short', day: 'numeric' }); } catch { return s; }
}
const fmtNum = (n) => (n == null ? '—' : Math.abs(n) >= 100 ? String(Math.round(n)) : String(Math.round(n * 100) / 100));

function line(f) {
  const rate = `${f.rate_per_week}/wk`;
  const need = f.required_per_week != null ? `${f.required_per_week}/wk` : null;
  if (f.status === 'done') return 'Target reached.';
  if (f.status === 'overdue') return `Deadline (${fmtDate(f.target_date)}) has passed — ${f.current}/${f.target} ${f.unit}.`;
  if (f.status === 'no_deadline') return `${f.current}/${f.target} ${f.unit} — add a target date to forecast this.`;
  if (f.status === 'no_target') return 'Add a target value to forecast this.';
  if (f.status === 'stalled') return `No measurable progress yet — you'd need ${need} to hit ${f.target} by ${fmtDate(f.target_date)}.`;
  if (f.status === 'on_track') {
    const d = f.delta_days;
    const when = f.projected_date ? `~${fmtDate(f.projected_date)}` : 'in time';
    const tag = d == null ? '' : d < 0 ? ` (${-d}d early)` : d > 0 ? ` (${d}d late)` : ' (right on time)';
    return `On pace (${rate}) → hits ${f.target} ${when}${tag}.`;
  }
  // at_risk / off_track
  return `At ${rate} you reach ${f.projected_final}/${f.target} by ${fmtDate(f.target_date)}. Need ${need}${need && f.rate_per_week ? ` — that's ${Math.max(0, Math.round((f.required_per_week / Math.max(f.rate_per_week, 0.01)) * 10) / 10)}× your current pace.` : '.'}`;
}

// Trajectory sparkline, from the forecast alone: today → deadline. Dashed = the pace you
// need, solid = where your current pace takes you (it stops rising once it hits the target).
function Trajectory({ f }) {
  const days = f.days_remaining;
  if (!(f.target > 0) || !f.target_date || !(days > 0)) return null;
  const y = (v) => 36 - Math.max(0, Math.min(1, v / f.target)) * 30;       // 6 = target, 36 = zero
  const y0 = y(f.current);
  let path;
  if (f.projected_date && (f.projected_final ?? 0) >= f.target) {
    const hit = Math.max(0, (new Date(f.projected_date + 'T00:00:00') - new Date().setHours(0, 0, 0, 0)) / DAY);
    const x = Math.max(2, Math.min(100, (hit / days) * 100));
    path = `M0 ${y0} L${x.toFixed(1)} 6 L100 6`;
  } else {
    path = `M0 ${y0} L100 ${y(f.projected_final ?? f.current).toFixed(1)}`;
  }
  return (
    <div className="fc-traj" aria-hidden="true">
      <svg viewBox="0 0 100 40" preserveAspectRatio="none">
        <line className="fc-traj-target" x1="0" y1="6" x2="100" y2="6" vectorEffect="non-scaling-stroke" />
        <line className="fc-traj-base" x1="0" y1="36" x2="100" y2="36" vectorEffect="non-scaling-stroke" />
        <path className="fc-traj-need" d={`M0 ${y0} L100 6`} vectorEffect="non-scaling-stroke" />
        <path className="fc-traj-pace" d={path} vectorEffect="non-scaling-stroke" />
      </svg>
      <span className="fc-traj-l">Today</span>
      <span className="fc-traj-r">{fmtDate(f.target_date)}</span>
    </div>
  );
}

export default function ForecastPanel({ onData }) {
  const { api } = useContext(AuthContext);
  const { showToast } = useToast();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [fixingId, setFixingId] = useState(null);
  const [fixPlan, setFixPlan] = useState(null);
  const [filter, setFilter] = useState('all');

  const load = () => { setLoading(true); api.getForecast().then(d => setData(d && !d.error ? d : null)).catch(() => {}).finally(() => setLoading(false)); };
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // Share what we already loaded with the page (its hero shows the counts) — no extra request.
  useEffect(() => { if (onData) onData(loading && !data ? undefined : data); }, [data, loading]); // eslint-disable-line react-hooks/exhaustive-deps

  // Ask the AI to draft catch-up actions for a slipping goal → preview → approve.
  const draftFix = async (k) => {
    const modelKey = localStorage.getItem('ai.modelKey');
    if (!modelKey) { showToast('Pick a default AI model in Settings first.', 'info'); return; }
    setFixingId(k.id);
    try {
      const res = await api.forecastFix({ keyResultId: k.id, modelKey });
      if (res.error) throw new Error(res.error);
      if (!res.operations || !res.operations.length) { showToast('No catch-up actions came back — try again.', 'info'); return; }
      setFixPlan(res);
    } catch (e) {
      const msg = e.message || 'Failed to draft a fix';
      if (/no longer available|unknown model/i.test(msg)) localStorage.removeItem('ai.modelKey');
      showToast(msg, 'error');
    } finally { setFixingId(null); }
  };

  const krs = data?.keyResults || [];
  const attention = krs.filter(f => ['warn', 'bad'].includes((FORECAST_STATUS[f.status] || FORECAST_STATUS.unknown).cls)).length;
  const okCount = krs.filter(f => f.status === 'on_track' || f.status === 'done').length;
  const sorted = [...krs].sort((a, b) => (SEVERITY[a.status] ?? 9) - (SEVERITY[b.status] ?? 9));
  const shown = sorted.filter(f => {
    const cls = (FORECAST_STATUS[f.status] || FORECAST_STATUS.unknown).cls;
    if (filter === 'attention') return cls === 'warn' || cls === 'bad';
    if (filter === 'ok') return cls === 'ok';
    return true;
  });
  // Status spectrum: one segment per non-zero status.
  const spectrum = Object.keys(FORECAST_STATUS)
    .map(k => ({ k, n: krs.filter(f => f.status === k).length }))
    .filter(x => x.n > 0);

  return (
    <section className="fc-panel ui-card">
      <div className="fc-head">
        <h2 className="ui-kicker fc-kicker">
          <TrendingUp size={15} /> Goal trajectory
          {krs.length > 0 && <span className="ui-count">{krs.length}</span>}
        </h2>
        <div className="fc-head-right">
          {krs.length > 3 && (
            <div className="ui-seg fc-seg" role="tablist" aria-label="Filter key results">
              {FILTERS.map(x => {
                const n = x.key === 'all' ? krs.length : x.key === 'attention' ? attention : okCount;
                if (x.key !== 'all' && !n) return null;
                return (
                  <button key={x.key} type="button" role="tab" aria-selected={filter === x.key} className={filter === x.key ? 'on' : ''} onClick={() => setFilter(x.key)}>
                    {x.label} <i>{n}</i>
                  </button>
                );
              })}
            </div>
          )}
          <button type="button" className="fc-refresh" onClick={load} title="Recompute" aria-label="Recompute">
            <RefreshCw size={15} className={loading ? 'spin' : ''} />
          </button>
        </div>
      </div>

      {!loading && spectrum.length > 0 && (
        <div className="fc-spectrum">
          <div className="fc-spectrum-bar" aria-hidden="true">
            {spectrum.map(x => (
              <i key={x.k} className={`fc-t-${FORECAST_STATUS[x.k].tone}`} style={{ flexGrow: x.n }} />
            ))}
          </div>
          <div className="fc-spectrum-legend">
            {spectrum.map(x => (
              <span key={x.k} className={`fc-leg fc-t-${FORECAST_STATUS[x.k].tone}`}><b>{x.n}</b> {FORECAST_STATUS[x.k].label.toLowerCase()}</span>
            ))}
          </div>
        </div>
      )}

      {loading && !data ? (
        <div className="fc-grid" aria-busy="true">
          {[0, 1].map(i => <div key={i} className="fc-card fc-skeleton"><i /><i /><i /></div>)}
        </div>
      ) : krs.length === 0 ? (
        <div className="ui-empty">
          <Target size={24} />
          <span>No active key results with a target and date yet. Add a measurable key result to see its forecast.</span>
          <Link to="/projects" className="btn btn-secondary">Open projects</Link>
        </div>
      ) : (
        <ul className="fc-grid">
          {shown.map(f => {
            const st = FORECAST_STATUS[f.status] || FORECAST_STATUS.unknown;
            const pctNow = f.target > 0 ? Math.min(100, Math.round((f.current / f.target) * 100)) : 0;
            const pctProj = f.target > 0 && f.projected_final != null ? Math.min(100, Math.round((f.projected_final / f.target) * 100)) : null;
            const forecastable = ['on_track', 'at_risk', 'off_track', 'stalled'].includes(f.status);
            const need = f.required_per_week;
            const paceRatio = need > 0 ? f.rate_per_week / need : null;
            const d = f.delta_days;
            return (
              <li key={f.id} className={`fc-card fc-${st.cls} fc-t-${st.tone}`}>
                <div className="fc-card-top">
                  <span className={`ui-chip ui-chip--${st.tone}`}><span className="fc-dot" />{st.label}</span>
                  {f.project && (
                    f.project_id
                      ? <Link to={`/projects/${f.project_id}`} className="fc-proj" title={`Open ${f.project}`}>{f.project}</Link>
                      : <span className="fc-proj">{f.project}</span>
                  )}
                  {f.days_remaining != null && f.status !== 'done' && (
                    <span className={`fc-left ${f.days_remaining < 0 ? 'late' : ''}`}>
                      {f.days_remaining < 0 ? `${-f.days_remaining}d over` : `${f.days_remaining}d left`}
                    </span>
                  )}
                </div>

                <h3 className="fc-title">{f.title}</h3>

                <div className="fc-figures">
                  <span className="fc-now"><b>{fmtNum(f.current)}</b><span>/ {fmtNum(f.target)} {f.unit}</span></span>
                  {f.target > 0 && <span className="fc-pct">{pctNow}%</span>}
                </div>
                <div className="fc-bar" title={pctProj != null ? `Now ${pctNow}% · projected ${pctProj}% by the deadline` : `Now ${pctNow}%`}>
                  <span className="fc-bar-now" style={{ width: `${pctNow}%` }} />
                  {pctProj != null && pctProj > pctNow && <span className="fc-bar-proj" style={{ left: `${pctNow}%`, width: `${pctProj - pctNow}%` }} />}
                  {f.target > 0 && f.projected_final != null && (
                    <span className="fc-bar-marker" style={{ left: `${Math.min(100, pctProj)}%` }} title="Projected" />
                  )}
                </div>

                {forecastable && (
                  <>
                    <Trajectory f={f} />
                    <dl className="fc-metrics">
                      <div>
                        <dt><Gauge size={12} /> Your pace</dt>
                        <dd>{fmtNum(f.rate_per_week)}<i>/wk</i></dd>
                      </div>
                      <div>
                        <dt><Flag size={12} /> Needed</dt>
                        <dd>{fmtNum(need)}<i>/wk</i>
                          {paceRatio != null && f.rate_per_week > 0 && (
                            <em className={paceRatio >= 1 ? 'up' : 'down'}>{paceRatio >= 1 ? `${fmtNum(paceRatio)}× ahead` : `${fmtNum(1 / paceRatio)}× short`}</em>
                          )}
                        </dd>
                      </div>
                      <div>
                        <dt><CalendarClock size={12} /> Finish</dt>
                        <dd>
                          {f.projected_date && (f.projected_final ?? 0) >= f.target
                            ? <>{fmtDate(f.projected_date)}{d != null && d !== 0 && <em className={d < 0 ? 'up' : 'down'}>{d < 0 ? `${-d}d early` : `${d}d late`}</em>}</>
                            : <span className="fc-never">not at this pace</span>}
                        </dd>
                      </div>
                    </dl>
                  </>
                )}

                <p className="fc-line">{line(f)}</p>

                {(st.cls === 'warn' || st.cls === 'bad') && (
                  <button type="button" className="fc-fix" onClick={() => draftFix(f)} disabled={fixingId === f.id}>
                    {fixingId === f.id ? <><Loader2 size={14} className="spin" /> Drafting…</> : <><Wand2 size={14} /> Draft a fix</>}
                  </button>
                )}
              </li>
            );
          })}
          {shown.length === 0 && <li className="ui-empty fc-none">Nothing in this view.</li>}
        </ul>
      )}

      {fixPlan && (
        <BrainDumpModal
          initialPlan={fixPlan}
          title="Catch-up plan"
          onClose={() => setFixPlan(null)}
          onApplied={() => { setFixPlan(null); load(); }}
        />
      )}
    </section>
  );
}
