import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Flame, Loader2, Wand2, X } from 'lucide-react';
import { format } from 'date-fns';
import { FORECAST_STATUS, SEVERITY, SLIPPING, fmtNum } from '../ForecastPanel';
import useGoalFix from '../GoalFix';

// Slipping goals, turned into work: each behind-pace key result shows up at the top of
// today's list as a catch-up to plan. "Plan catch-up" drafts the tasks that recover the
// pace (preview → approve → they land in your days); "Not today" hides it until tomorrow.
// Uses the forecast Today already loaded — no extra request.
const KEY = 'today.catchup';
const MAX = 3;

function readHidden(today) {
  try { const v = JSON.parse(localStorage.getItem(KEY) || 'null'); return v?.date === today ? v.ids || [] : []; } catch { return []; }
}

function why(f) {
  const have = `${fmtNum(f.current)}/${fmtNum(f.target)}${f.unit ? ` ${f.unit}` : ''}`;
  if (f.status === 'overdue') return `${have} · deadline passed ${-f.days_remaining}d ago`;
  if (f.status === 'stalled') return `${have} · no progress yet · needs ${fmtNum(f.required_per_week)}/wk`;
  return `${have} · needs ${fmtNum(f.required_per_week)}/wk, you're at ${fmtNum(f.rate_per_week)}/wk · ${f.days_remaining}d left`;
}

export default function CatchUp({ forecast, onPlanned }) {
  const today = format(new Date(), 'yyyy-MM-dd');
  const [hidden, setHidden] = useState(() => readHidden(today));
  const hide = (id) => setHidden(prev => {
    const next = [...new Set([...prev, id])];
    try { localStorage.setItem(KEY, JSON.stringify({ date: today, ids: next })); } catch { /* noop */ }
    return next;
  });
  // A goal you just planned a catch-up for stays off the list for today.
  const { draft, fixingId, modal } = useGoalFix({ onApplied: (kr) => { hide(kr.id); onPlanned && onPlanned(); } });

  const slipping = (forecast?.keyResults || [])
    .filter(f => SLIPPING.has(f.status) && !hidden.includes(f.id))
    .sort((a, b) => (SEVERITY[a.status] ?? 9) - (SEVERITY[b.status] ?? 9));
  if (!slipping.length) return modal || null;
  const shown = slipping.slice(0, MAX);

  return (
    <div className="td-catchup" aria-label="Goals to catch up on">
      <p className="td-catchup-head"><Flame size={13} /> Catch up <span>{slipping.length === 1 ? '1 goal is behind' : `${slipping.length} goals are behind`}</span></p>
      <ul>
        {shown.map(f => {
          const st = FORECAST_STATUS[f.status] || FORECAST_STATUS.unknown;
          const busy = fixingId === f.id;
          return (
            <li key={f.id} className={`td-catchup-row tone-${st.tone}`}>
              <div className="td-catchup-text">
                <span className="td-catchup-title">
                  <span className={`ui-chip ui-chip--${st.tone}`}>{st.label}</span>
                  <Link to={`/projects/${f.project_id}`} className="td-catchup-name" title={`${f.title} — ${f.project}`}>{f.title}</Link>
                </span>
                <span className="td-catchup-why">{f.project} · {why(f)}</span>
              </div>
              <span className="td-catchup-btns">
                <button type="button" className="td-catchup-plan" onClick={() => draft(f)} disabled={!!fixingId}>
                  {busy ? <><Loader2 size={14} className="td-spin" /> Planning…</> : <><Wand2 size={14} /> Plan catch-up</>}
                </button>
                <button type="button" className="td-catchup-hide" onClick={() => hide(f.id)} aria-label={`Not today: ${f.title}`} title="Not today"><X size={14} /></button>
              </span>
            </li>
          );
        })}
      </ul>
      {slipping.length > MAX && (
        <Link className="td-catchup-more" to="/plan?view=roadmap&slipping=1">+{slipping.length - MAX} more on the Roadmap →</Link>
      )}
      {modal}
    </div>
  );
}
