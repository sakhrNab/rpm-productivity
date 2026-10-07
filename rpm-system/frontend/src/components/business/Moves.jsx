// Next best moves: ranked by the server from the user's data (overdue / stuck leads, P0 blockers, cash
// pace, model bottleneck…). Each move has ONE button that does it. Hovering a move lights the entity it
// is about on the flow canvas (onFocus). "Not now" hides a move for today (this browser).
import { useState } from 'react';
import { Sparkles, AlertTriangle, Clock, Flame, Wallet, Filter, Bot, ChevronRight, EyeOff, Check } from 'lucide-react';
import { useBiz } from './bizKit';
import { todayStr } from './bizConfig';

const ICON = { overdue: Clock, due_today: Clock, stuck: Flame, no_date: Clock, pipeline: Filter, blocker: AlertTriangle, cash: Wallet, bottleneck: Filter };
const KEY = 'biz.moves.hidden';

function hiddenToday() {
  try { const v = JSON.parse(localStorage.getItem(KEY) || '{}'); return v.date === todayStr() ? new Set(v.ids || []) : new Set(); }
  catch { return new Set(); }
}
function hide(id) {
  try { const s = hiddenToday(); s.add(id); localStorage.setItem(KEY, JSON.stringify({ date: todayStr(), ids: [...s] })); } catch { /* private mode */ }
}

export default function NextMoves({ moves, limit = 6, onFocus, compact = false, title = 'Next best moves' }) {
  const ctx = useBiz();
  const [hidden, setHidden] = useState(hiddenToday);
  const [busy, setBusy] = useState(null);
  const [done, setDone] = useState(() => new Set());
  const list = (moves || []).filter((m) => !hidden.has(m.id)).slice(0, limit);

  const run = async (m) => {
    setBusy(m.id);
    try { const ok = await ctx.runMove(m); if (ok) setDone((s) => new Set(s).add(m.id)); }
    finally { setBusy(null); }
  };

  return (
    <section className={`bz-moves ${compact ? 'compact' : ''}`} aria-label={title}>
      <header className="bz-moves-head">
        <p className="ui-kicker"><Sparkles size={14} /> {title}</p>
        {list.length > 0 && <span className="bz-moves-n">{list.length}</span>}
      </header>
      {list.length === 0 ? (
        <p className="bz-moves-clear"><Check size={16} /> Nothing urgent — the pipeline is moving. Log what happened in Results.</p>
      ) : (
        <ol className="bz-move-list">
          {list.map((m, i) => {
            const Icon = m.action?.type === 'queue_agent' ? Bot : ICON[m.kind] || Sparkles;
            const isDone = done.has(m.id);
            return (
              <li key={m.id} className={`bz-move tone-${m.tone} ${isDone ? 'is-done' : ''}`} style={{ '--i': i }}
                onMouseEnter={() => onFocus?.(m)} onMouseLeave={() => onFocus?.(null)} onFocus={() => onFocus?.(m)} onBlur={() => onFocus?.(null)}>
                <span className="bz-move-ic" aria-hidden="true"><Icon size={16} /></span>
                <div className="bz-move-body">
                  <b className="bz-move-title">{m.title}</b>
                  {m.detail && !compact && <span className="bz-move-detail">{m.detail}</span>}
                </div>
                <div className="bz-move-act">
                  {isDone ? <span className="ui-chip ui-chip--good"><Check size={13} /> Done</span> : (
                    <button type="button" className="btn btn-secondary bz-move-btn" disabled={busy === m.id} onClick={() => run(m)}>
                      {busy === m.id ? 'Working…' : m.action?.label || 'Open'} <ChevronRight size={14} />
                    </button>
                  )}
                  <button type="button" className="bz-move-hide" aria-label={`Not now: ${m.title}`} title="Not now (hide for today)"
                    onClick={() => { hide(m.id); setHidden(hiddenToday()); }}><EyeOff size={14} /></button>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
