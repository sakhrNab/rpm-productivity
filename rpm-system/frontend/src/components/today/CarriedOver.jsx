import { AlertTriangle, Wand2, Loader2, ArrowDownToLine, Check } from 'lucide-react';

// Tasks still sitting on a past date. Nothing moves on its own — the real dates keep the
// forecasting honest — so each one is decided here: done, today, drop, or AI triage.
export default function CarriedOver({ overdue, triaging, onTriage, onMoveAll, onComplete, onOpen, onToday, onDrop }) {
  if (!overdue.length) return null;
  return (
    <section className="ui-card md-carried" aria-label="Carried over">
      <div className="md-carried-head">
        <p className="ui-kicker"><AlertTriangle size={14} /> Carried over <span className="ui-count">{overdue.length}</span></p>
        <span className="md-carried-actions">
          <button type="button" className="md-carried-btn ai" onClick={onTriage} disabled={triaging}>
            {triaging ? <><Loader2 size={14} className="md-spin" /> Triaging…</> : <><Wand2 size={14} /> Triage with AI</>}
          </button>
          <button type="button" className="md-carried-btn" onClick={onMoveAll}><ArrowDownToLine size={14} /> Move all to today</button>
        </span>
      </div>
      <p className="md-carried-note">These slipped past their planned date. Nothing moves on its own — decide each one.</p>
      <ul className="md-carried-list">
        {overdue.map(a => (
          <li key={a.id} className="md-carried-row">
            <button type="button" className="md-carried-check" onClick={() => onComplete(a)} title="Mark done" aria-label={`Mark “${a.title}” done`}>
              <Check size={13} strokeWidth={3} />
            </button>
            <button type="button" className="md-carried-name" onClick={() => onOpen(a)} title="Open to reschedule">{a.title}</button>
            <span
              className={`ui-chip ${a.days_late > 7 ? 'ui-chip--bad' : 'ui-chip--warn'} md-carried-age`}
              title={`Planned ${String(a.scheduled_date).slice(0, 10)}`}
            >
              {a.days_late}d late
            </span>
            <span className="md-carried-btns">
              <button type="button" className="md-carried-mini" onClick={() => onToday(a)}>Today</button>
              <button type="button" className="md-carried-mini drop" onClick={() => onDrop(a)}>Drop</button>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
