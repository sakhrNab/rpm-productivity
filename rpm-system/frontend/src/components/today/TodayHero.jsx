import { format } from 'date-fns';
import {
  Plus, Sparkles, AlertTriangle, CalendarDays, CheckCircle2, Clock, CircleDot, Target, TrendingUp, ArrowDown,
} from 'lucide-react';
import CompassRead from './CompassRead';

export const fmtH = (h) => {
  const mins = Math.round(h * 60);
  const hh = Math.floor(mins / 60), mm = mins % 60;
  if (!hh) return `${mm}m`;
  return mm ? `${hh}h ${mm}m` : `${hh}h`;
};

const RING_R = 30, RING_C = 2 * Math.PI * RING_R;

// Goals at a glance, from the forecast the board below already loaded (no extra request).
function GoalsLine({ forecast, onJump }) {
  const krs = forecast?.keyResults || [];
  const sum = forecast?.summary || {};
  const onTrack = sum.on_track || 0;
  const reached = sum.done || 0;
  const needAttention = (sum.at_risk || 0) + (sum.off_track || 0) + (sum.stalled || 0) + (sum.overdue || 0);
  const healthPct = krs.length ? Math.round(((onTrack + reached) / krs.length) * 100) : null;

  return (
    <div className="td-goals">
      <span className="td-goals-label"><Target size={14} /> Goals</span>
      {forecast === undefined ? (
        <span className="td-goals-muted">Forecasting…</span>
      ) : !krs.length ? (
        <span className="td-goals-muted">No measurable key results yet</span>
      ) : (
        <>
          <span className="td-goals-pct"><b>{healthPct}%</b> on track</span>
          <span className="ui-meter td-goals-meter" aria-hidden="true"><i style={{ '--pct': `${healthPct}%` }} /></span>
          <span className="td-goals-chips">
            <span className="ui-chip">{krs.length} key result{krs.length === 1 ? '' : 's'}</span>
            {needAttention > 0 && <span className="ui-chip ui-chip--warn">{needAttention} need attention</span>}
            {reached > 0 && <span className="ui-chip ui-chip--good">{reached} reached</span>}
          </span>
        </>
      )}
      <button type="button" className="td-mini td-goals-jump" onClick={onJump}>
        <TrendingUp size={14} /> Forecast <ArrowDown size={13} />
      </button>
    </div>
  );
}

// Today hero: date + greeting + where the day stands, goals line, the day's two actions,
// and the Compass must-win read beside it.
export default function TodayHero({ user, actions, overdueCount, forecast, suggestLoading, onSuggest, onAdd, onJumpForecast }) {
  const now = new Date();
  const hour = now.getHours();
  const greeting = hour < 5 ? 'Working late' : hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const firstName = (user?.name || '').trim().split(/\s+/)[0];
  const hoursOf = (a) => (Number(a.duration_hours) || 0) + (Number(a.duration_minutes) || 0) / 60;
  const doneCount = actions.filter(a => a.is_completed).length;
  const todoCount = actions.length - doneCount;
  const plannedH = actions.reduce((sum, a) => sum + hoursOf(a), 0);
  const leftH = actions.filter(a => !a.is_completed).reduce((sum, a) => sum + hoursOf(a), 0);
  const pct = actions.length ? Math.round((doneCount / actions.length) * 100) : 0;
  const summary = actions.length === 0
    ? 'Nothing is planned for today yet — add an action or pull one in from your week.'
    : todoCount === 0
      ? 'Everything on today’s list is done. Nicely handled.'
      : `${todoCount} to go${leftH > 0 ? ` · about ${fmtH(leftH)} of focused work left` : ''}.`;

  return (
    <header className="ui-card td-hero">
      <div className="td-hero-main">
        <div className="td-hero-top">
          <div className="td-hero-text">
            <p className="ui-kicker td-hero-kicker">
              <span className="md-hero-tag">Today</span>
              <CalendarDays size={14} /> {format(now, 'EEEE · d MMM yyyy')}
            </p>
            <h1 className="td-hero-title">
              <span className="ui-title-grad">{greeting}{firstName ? `, ${firstName}` : ''}</span>
            </h1>
            <p className="td-hero-sub">{summary}</p>
          </div>
          {actions.length > 0 && (
            <div className="td-ring" role="img" aria-label={`${pct}% of today done`}>
              <svg viewBox="0 0 72 72" width="72" height="72" aria-hidden="true">
                <circle className="td-ring-bg" cx="36" cy="36" r={RING_R} />
                <circle className="td-ring-fg" cx="36" cy="36" r={RING_R} strokeDasharray={RING_C} strokeDashoffset={RING_C * (1 - pct / 100)} />
              </svg>
              <span className="td-ring-val"><b>{pct}%</b><i>done</i></span>
            </div>
          )}
        </div>

        <div className="td-hero-stats">
          {todoCount > 0 && <div className="ui-stat"><CircleDot size={18} /><b>{todoCount}</b><span>to do</span></div>}
          {doneCount > 0 && <div className="ui-stat td-stat-good"><CheckCircle2 size={18} /><b>{doneCount}</b><span>done</span></div>}
          {overdueCount > 0 && <div className="ui-stat td-stat-warn"><AlertTriangle size={18} /><b>{overdueCount}</b><span>carried over</span></div>}
          {plannedH > 0 && <div className="ui-stat"><Clock size={18} /><b>{fmtH(plannedH)}</b><span>planned</span></div>}
        </div>

        <GoalsLine forecast={forecast} onJump={onJumpForecast} />

        <div className="md-header-actions td-hero-actions">
          <button type="button" className="btn btn-secondary" onClick={onSuggest} disabled={suggestLoading}>
            <Sparkles size={16} /> {suggestLoading ? 'Thinking…' : 'AI suggestions'}
          </button>
          <button type="button" className="btn btn-primary" onClick={onAdd}>
            <Plus size={16} /> Add Action
          </button>
        </div>
      </div>

      <CompassRead />
    </header>
  );
}
