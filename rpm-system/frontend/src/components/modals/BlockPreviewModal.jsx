import { useContext } from 'react';
import { Target, Compass, ListChecks, Check, Pencil, Flag, Trophy, Clock, Hourglass } from 'lucide-react';
import { AppContext } from '../../App';
import ModalHead from './ModalHead';
import './BlockPreviewModal.css';

// ---- presentational helpers (same countdown rules as the block card) ----
const dayKey = (d) => (d ? String(d).slice(0, 10) : '');
const daysUntil = (key) => {
  if (!key) return null;
  const [y, m, d] = key.split('-').map(Number);
  const now = new Date();
  return Math.round((new Date(y, m - 1, d) - new Date(now.getFullYear(), now.getMonth(), now.getDate())) / 86400000);
};
const fmtShort = (key) => {
  if (!key) return '';
  const dt = new Date(`${key}T00:00:00`);
  if (isNaN(dt)) return key;
  const opts = { month: 'short', day: 'numeric' };
  if (dt.getFullYear() !== new Date().getFullYear()) opts.year = 'numeric';
  return dt.toLocaleDateString('en-US', opts);
};
const fmtMins = (mins) => {
  const h = Math.floor(mins / 60), m = mins % 60;
  return `${h ? `${h}h` : ''}${h && m ? ' ' : ''}${m ? `${m}m` : ''}` || '0m';
};
const mins = (a) => (a.duration_hours || 0) * 60 + (a.duration_minutes || 0);

function BlockPreviewModal({ block, onClose, onEdit }) {
  const { categories = [], projects = [] } = useContext(AppContext) || {};
  if (!block) return null;
  const actions = block.actions || [];
  const cancelled = actions.filter(a => a.is_cancelled);
  const denom = actions.length - cancelled.length;
  const done = actions.filter(a => a.is_completed && !a.is_cancelled).length;
  const pct = denom > 0 ? Math.round((done / denom) * 100) : 0;
  const open = Math.max(0, denom - done);

  // Presentational only: category colour, countdown chip, time, row order.
  const project = projects.find(p => p.id === block.project_id);
  const category = categories.find(c => c.id === (block.category_id || project?.category_id));
  const blockDone = actions.length > 0 && pct >= 100;
  const dueKey = dayKey(block.target_date);
  const dueIn = dueKey ? daysUntil(dueKey) : null;
  const dueTone = !dueKey ? '' : blockDone ? 'good' : dueIn < 0 ? 'bad' : dueIn <= 7 ? 'warn' : 'info';
  const dueLabel = !dueKey ? '' : blockDone ? 'Hit'
    : dueIn === 0 ? 'Due today'
    : dueIn === 1 ? 'Due tomorrow'
    : dueIn > 1 ? `${dueIn} days left`
    : dueIn === -1 ? '1 day late'
    : `${-dueIn} days late`;
  const totalMins = actions.filter(a => !a.is_cancelled).reduce((s, a) => s + mins(a), 0);
  const leftMins = actions.filter(a => !a.is_cancelled && !a.is_completed).reduce((s, a) => s + mins(a), 0);
  const rank = (a) => (a.is_cancelled ? 2 : a.is_completed ? 1 : 0);
  const ordered = [...actions].sort((a, b) => rank(a) - rank(b));
  const cardStyle = category?.color ? { '--cat': category.color } : undefined;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className={`modal bpv-modal ${blockDone ? 'is-complete' : ''} ${dueTone ? `is-due-${dueTone}` : ''}`}
        style={cardStyle}
        onClick={e => e.stopPropagation()}
      >
        <ModalHead
          icon={Target}
          title="RPM block"
          subtitle={[project?.name, category?.name].filter(Boolean).join(' · ') || 'Result, purpose and the plan that gets you there.'}
          onClose={onClose}
          badgeStyle={category?.color ? { color: category.color } : undefined}
        />

        <div className="modal-body mk-body bpv-body">
          <div className="bpv-card">
          {/* Mission head: kicker + countdown */}
          <div className="bpv-head">
            <span className="bpv-no"><span className="bpv-dot" /> Block{category?.name && <><i aria-hidden="true">·</i><b>{category.name}</b></>}</span>
            {dueKey ? (
              <span className={`ui-chip ui-chip--${dueTone} bpv-due`} title={`Block deadline · ${fmtShort(dueKey)}`}>
                {blockDone ? <Trophy size={13} /> : <Flag size={13} />}
                <span>{dueLabel}</span>
                <b>{fmtShort(dueKey)}</b>
              </span>
            ) : blockDone ? (
              <span className="ui-chip ui-chip--good bpv-due"><Trophy size={13} /><span>Complete</span></span>
            ) : null}
          </div>

          {/* Result */}
          <section className="bpv-result-sec">
            <p className="bpv-label bpv-label--result"><Target size={13} /> Result</p>
            <h2 className="bpv-result">{block.result_title}</h2>
          </section>

          {/* Purpose */}
          {block.purpose && (
            <section className="bpv-why">
              <p className="bpv-label bpv-label--why"><Compass size={13} /> Purpose</p>
              <p className="bpv-purpose">{block.purpose}</p>
            </section>
          )}

          {/* Progress */}
          {(actions.length > 0 || totalMins > 0) && (
            <div className={`bpv-progress ${blockDone ? 'is-done' : ''}`}>
              {actions.length > 0 && (
                <>
                  <div className="bpv-score">
                    <b>{done}</b><span>/{denom}</span>
                    <em>{denom === 1 ? 'action' : 'actions'} done</em>
                    <strong className="bpv-pct">{pct}<small>%</small></strong>
                  </div>
                  <div className="ui-meter bpv-meter"><i style={{ '--pct': `${pct}%` }} /></div>
                </>
              )}
              {(totalMins > 0 || cancelled.length > 0) && (
                <div className="bpv-time">
                  {leftMins > 0 && <span className="bpv-meta"><Clock size={12} />{fmtMins(leftMins)} left</span>}
                  {totalMins > 0 && <span className="bpv-meta bpv-meta--muted"><Hourglass size={12} />{fmtMins(totalMins)} planned</span>}
                  {cancelled.length > 0 && <span className="bpv-meta bpv-meta--muted">{cancelled.length} cancelled</span>}
                </div>
              )}
            </div>
          )}

          </div>

          {/* Massive Action Plan */}
          <section className="bpv-map">
            <p className="bpv-label bpv-label--map">
              <ListChecks size={13} /> Massive action plan
              {denom > 0 && <span className="ui-count">{done}/{denom}</span>}
            </p>
            {actions.length === 0 ? (
              <div className="ui-empty bpv-empty">
                <ListChecks size={22} />
                No actions in this plan yet. What is the first move that gets this result rolling?
              </div>
            ) : (
              <ol className="bpv-actions">
                {ordered.map((a, i) => (
                  <li key={a.id} className={`bpv-action p${a.priority || 0} ${a.is_completed ? 'done' : ''} ${a.is_cancelled ? 'cancelled' : ''}`}>
                    <span className="bpv-index">{i + 1}</span>
                    <span className="bpv-check" aria-hidden="true">{a.is_completed && <Check size={11} strokeWidth={3} />}</span>
                    <span className="bpv-action-title">{a.title}</span>
                    {a.is_cancelled
                      ? <span className="bpv-tag">cancelled</span>
                      : mins(a) > 0 && <span className="bpv-dur"><Clock size={11} />{fmtMins(mins(a))}</span>}
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>

        <div className="modal-footer mk-foot">
          {denom > 0 && <span className="mk-foot-note">{open > 0 ? `${open} to go` : 'All actions done'}</span>}
          <button type="button" className="btn btn-secondary" onClick={onClose}>Close</button>
          {onEdit && (
            <button type="button" className="btn btn-primary" onClick={() => onEdit(block)}>
              <Pencil size={14} /> Edit block
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default BlockPreviewModal;
