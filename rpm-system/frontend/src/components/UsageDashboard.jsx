import { useState, useEffect, useContext } from 'react';
import { BarChart3, Coins, ArrowUp, ArrowDown, Zap } from 'lucide-react';
import { AuthContext } from '../App';
import { fmtCost } from './UsageBadge';
import './UsageDashboard.css';

const RANGES = [{ d: 7, label: '7d' }, { d: 30, label: '30d' }, { d: 90, label: '90d' }];
const FEATURE_LABEL = {
  chat: 'Assistant', compass: 'Compass', braindump: 'Brain Dump', suggestions: 'Suggestions',
  image_read: 'Photo reading', file_plan: 'File plans', coach_chat: 'Coach chat', coach_checkin: 'Coach check-ins',
  coach_draft: 'Coach drafts', coach_memory: 'Coach memory', fix: 'Goal fixes', triage: 'Triage',
};
// Unknown keys still read well: "some_new_thing" → "Some new thing".
const featureLabel = (k) => FEATURE_LABEL[k] || (k ? String(k).replace(/_/g, ' ').replace(/^./, c => c.toUpperCase()) : 'Other');

function fmtTokens(n) {
  n = Number(n) || 0;
  if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
  return String(n);
}

export default function UsageDashboard() {
  const { api } = useContext(AuthContext);
  const [days, setDays] = useState(30);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    api.getAiUsage(days).then(d => { if (alive) { setData(d && !d.error ? d : null); setLoading(false); } }).catch(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [days]); // eslint-disable-line react-hooks/exhaustive-deps

  const total = data?.total || { cost: 0, calls: 0, input: 0, output: 0, cached: 0 };
  const maxDay = Math.max(1, ...((data?.byDay || []).map(d => d.cost)));

  const maxModel = Math.max(0.0000001, ...((data?.byModel || []).map(m => m.cost || 0)));

  return (
    <div className="usage-dash">
      <div className="usage-dash-head">
        <div className="usage-dash-title">
          <span className="ui-icon-badge usage-badge-ico" aria-hidden="true"><BarChart3 size={20} /></span>
          <div>
            <h2>AI usage &amp; cost</h2>
            <p>Estimated from public per-token prices, per model.</p>
          </div>
        </div>
        <div className="ui-seg usage-range" role="tablist" aria-label="Period">
          {RANGES.map(r => (
            <button key={r.d} type="button" role="tab" aria-selected={days === r.d} className={days === r.d ? 'on' : ''} onClick={() => setDays(r.d)}>{r.label}</button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="ui-empty usage-empty"><div className="spinner usage-spinner" /><p>Loading…</p></div>
      ) : !data || total.calls === 0 ? (
        <div className="ui-empty usage-empty">
          <Coins size={24} />
          <p>No AI usage recorded in this period yet. Costs are estimated from public model prices and appear here after you use the Assistant, Compass, Brain Dump, or AI suggestions.</p>
        </div>
      ) : (
        <>
          <div className="usage-cards">
            <div className="usage-card usage-card-hero">
              <span className="usage-card-label"><Coins size={14} /> Estimated cost</span>
              <span className="usage-card-val">{fmtCost(total.cost)}</span>
              <span className="usage-card-sub">{total.calls} call{total.calls !== 1 ? 's' : ''} · last {days}d</span>
            </div>
            <div className="usage-card">
              <span className="usage-card-label"><ArrowUp size={13} /> Input</span>
              <span className="usage-card-val">{fmtTokens(total.input)}</span>
              {total.cached > 0 && <span className="usage-card-sub"><Zap size={11} /> {fmtTokens(total.cached)} cached</span>}
            </div>
            <div className="usage-card">
              <span className="usage-card-label"><ArrowDown size={13} /> Output</span>
              <span className="usage-card-val">{fmtTokens(total.output)}</span>
            </div>
          </div>

          {data.byModel?.length > 0 && (
            <div className="usage-section">
              <h3 className="ui-kicker">By model</h3>
              <div className="usage-table">
                {data.byModel.map((m, i) => (
                  <div key={i} className="usage-row">
                    <span className="usage-row-name">{m.model || 'unknown'}</span>
                    <span className="usage-row-cost">{fmtCost(m.cost)}</span>
                    <span className="usage-row-meta">{m.calls} call{m.calls !== 1 ? 's' : ''} · {fmtTokens((m.input || 0) + (m.output || 0))} tok</span>
                    <span className="ui-meter usage-row-meter" aria-hidden="true"><i style={{ '--pct': `${Math.max(2, Math.round(((m.cost || 0) / maxModel) * 100))}%` }} /></span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {data.byFeature?.length > 0 && (
            <div className="usage-section">
              <h3 className="ui-kicker">By feature</h3>
              <div className="usage-chips">
                {data.byFeature.map((f, i) => (
                  <span key={i} className="ui-chip usage-chip">{featureLabel(f.feature)} <b>{fmtCost(f.cost)}</b></span>
                ))}
              </div>
            </div>
          )}

          {data.byDay?.length > 1 && (
            <div className="usage-section">
              <h3 className="ui-kicker">Daily cost</h3>
              <div className="usage-bars">
                {data.byDay.map((d, i) => (
                  <div key={i} className="usage-bar-col" title={`${d.day}: ${fmtCost(d.cost)}`}>
                    <div className="usage-bar" style={{ height: `${Math.max(2, Math.round((d.cost / maxDay) * 100))}%` }} />
                  </div>
                ))}
              </div>
            </div>
          )}

          <p className="usage-note">Costs are <b>estimates</b> based on public per-token prices for each model and may differ from your provider's actual billing. Logs are kept for about a year.</p>
        </>
      )}
    </div>
  );
}
