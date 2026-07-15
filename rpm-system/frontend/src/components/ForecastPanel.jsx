import { useState, useEffect, useContext } from 'react';
import { TrendingUp, RefreshCw, Wand2, Loader2 } from 'lucide-react';
import { AuthContext } from '../App';
import { useToast } from './ToastProvider';
import BrainDumpModal from './BrainDumpModal';
import './ForecastPanel.css';

const STATUS = {
  on_track:   { label: 'On track',   cls: 'ok' },
  at_risk:    { label: 'At risk',    cls: 'warn' },
  off_track:  { label: 'Off track',  cls: 'bad' },
  stalled:    { label: 'Stalled',    cls: 'bad' },
  overdue:    { label: 'Overdue',    cls: 'bad' },
  done:       { label: 'Reached',    cls: 'ok' },
  no_deadline:{ label: 'No deadline',cls: 'muted' },
  no_target:  { label: 'No target',  cls: 'muted' },
  unknown:    { label: '—',          cls: 'muted' },
};

function fmtDate(s) {
  if (!s) return '';
  try { return new Date(s + 'T00:00:00').toLocaleDateString([], { month: 'short', day: 'numeric' }); } catch { return s; }
}
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

export default function ForecastPanel() {
  const { api } = useContext(AuthContext);
  const { showToast } = useToast();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [fixingId, setFixingId] = useState(null);
  const [fixPlan, setFixPlan] = useState(null);

  const load = () => { setLoading(true); api.getForecast().then(d => setData(d && !d.error ? d : null)).catch(() => {}).finally(() => setLoading(false)); };
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
  const s = data?.summary || {};
  const atRisk = (s.at_risk || 0) + (s.off_track || 0) + (s.stalled || 0) + (s.overdue || 0);

  return (
    <section className="fc-panel">
      <div className="fc-head">
        <span className="fc-title"><TrendingUp size={16} /> Goal trajectory</span>
        <span className="fc-head-right">
          {!loading && krs.length > 0 && (
            <span className="fc-summary">
              {s.on_track ? <b className="fc-chip ok">{s.on_track} on track</b> : null}
              {atRisk ? <b className="fc-chip warn">{atRisk} need attention</b> : null}
              {s.done ? <b className="fc-chip ok">{s.done} done</b> : null}
            </span>
          )}
          <button type="button" className="fc-refresh" onClick={load} title="Recompute" aria-label="Recompute">
            <RefreshCw size={13} className={loading ? 'spin' : ''} />
          </button>
        </span>
      </div>

      {loading ? (
        <p className="fc-muted">Projecting your goals…</p>
      ) : krs.length === 0 ? (
        <p className="fc-muted">No active key results with a target and date yet. Add a measurable key result to see its forecast.</p>
      ) : (
        <ul className="fc-list">
          {krs.map(f => {
            const st = STATUS[f.status] || STATUS.unknown;
            const pctNow = f.target > 0 ? Math.min(100, Math.round((f.current / f.target) * 100)) : 0;
            const pctProj = f.target > 0 && f.projected_final != null ? Math.min(100, Math.round((f.projected_final / f.target) * 100)) : null;
            return (
              <li key={f.id} className={`fc-item fc-${st.cls}`}>
                <div className="fc-item-top">
                  <span className="fc-dot" />
                  <span className="fc-item-title">{f.title}</span>
                  <span className={`fc-badge fc-${st.cls}`}>{st.label}</span>
                </div>
                <div className="fc-bar">
                  <span className="fc-bar-now" style={{ width: `${pctNow}%` }} />
                  {pctProj != null && pctProj > pctNow && <span className="fc-bar-proj" style={{ left: `${pctNow}%`, width: `${pctProj - pctNow}%` }} />}
                  {f.target > 0 && f.projected_final != null && (
                    <span className="fc-bar-marker" style={{ left: `${Math.min(100, pctProj)}%` }} title="Projected" />
                  )}
                </div>
                <div className="fc-item-line">{line(f)}</div>
                {(st.cls === 'warn' || st.cls === 'bad') && (
                  <button type="button" className="fc-fix" onClick={() => draftFix(f)} disabled={fixingId === f.id}>
                    {fixingId === f.id ? <><Loader2 size={13} className="spin" /> Drafting…</> : <><Wand2 size={13} /> Draft a fix</>}
                  </button>
                )}
              </li>
            );
          })}
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
