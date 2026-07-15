import { useState, useEffect, useContext } from 'react';
import { BarChart3, Coins, ArrowUp, ArrowDown, Zap } from 'lucide-react';
import { AuthContext } from '../App';
import { fmtCost } from './UsageBadge';
import './UsageDashboard.css';

const RANGES = [{ d: 7, label: '7d' }, { d: 30, label: '30d' }, { d: 90, label: '90d' }];
const FEATURE_LABEL = { chat: 'Assistant', compass: 'Compass', braindump: 'Brain Dump', suggestions: 'Suggestions' };

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

  return (
    <div className="usage-dash">
      <div className="usage-dash-head">
        <h3><BarChart3 size={16} /> AI usage &amp; cost</h3>
        <div className="usage-range">
          {RANGES.map(r => (
            <button key={r.d} type="button" className={days === r.d ? 'active' : ''} onClick={() => setDays(r.d)}>{r.label}</button>
          ))}
        </div>
      </div>

      {loading ? (
        <p className="usage-muted">Loading…</p>
      ) : !data || total.calls === 0 ? (
        <p className="usage-muted">No AI usage recorded in this period yet. Costs are estimated from public model prices and appear here after you use the Assistant, Compass, Brain Dump, or AI suggestions.</p>
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
              <h4>By model</h4>
              <div className="usage-table">
                {data.byModel.map((m, i) => (
                  <div key={i} className="usage-row">
                    <span className="usage-row-name">{m.model || 'unknown'}</span>
                    <span className="usage-row-meta">{m.calls} · {fmtTokens((m.input || 0) + (m.output || 0))} tok</span>
                    <span className="usage-row-cost">{fmtCost(m.cost)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {data.byFeature?.length > 0 && (
            <div className="usage-section">
              <h4>By feature</h4>
              <div className="usage-chips">
                {data.byFeature.map((f, i) => (
                  <span key={i} className="usage-chip">{FEATURE_LABEL[f.feature] || f.feature || 'other'} · {fmtCost(f.cost)}</span>
                ))}
              </div>
            </div>
          )}

          {data.byDay?.length > 1 && (
            <div className="usage-section">
              <h4>Daily cost</h4>
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
