import { Target, Compass, ListChecks, Check, Pencil, CheckCircle2, Circle, Ban } from 'lucide-react';
import ModalHead from './ModalHead';
import './BlockPreviewModal.css';

function BlockPreviewModal({ block, onClose, onEdit }) {
  if (!block) return null;
  const actions = block.actions || [];
  const cancelled = actions.filter(a => a.is_cancelled);
  const denom = actions.length - cancelled.length;
  const done = actions.filter(a => a.is_completed && !a.is_cancelled).length;
  const pct = denom > 0 ? Math.round((done / denom) * 100) : 0;
  const open = Math.max(0, denom - done);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal bpv-modal" onClick={e => e.stopPropagation()}>
        <ModalHead
          icon={Target}
          title="RPM block"
          subtitle="Result, purpose and the plan that gets you there."
          onClose={onClose}
        />

        <div className="modal-body mk-body">
          <div className="bpv-hero">
            <p className="ui-kicker bpv-kicker-result"><Target size={13} /> Result</p>
            <h2 className="bpv-result">{block.result_title}</h2>
            {block.purpose && (
              <blockquote className="bpv-purpose">
                <span className="bpv-purpose-label"><Compass size={12} /> Purpose</span>
                {block.purpose}
              </blockquote>
            )}
          </div>

          {actions.length > 0 && (
            <div className={`bpv-progress ${pct >= 100 ? 'is-done' : ''}`}>
              <div className="bpv-stats">
                {done > 0 && <div className="ui-stat"><CheckCircle2 size={18} /><b>{done}</b><span>done</span></div>}
                {open > 0 && <div className="ui-stat"><Circle size={18} /><b>{open}</b><span>open</span></div>}
                {cancelled.length > 0 && <div className="ui-stat bpv-stat-muted"><Ban size={18} /><b>{cancelled.length}</b><span>cancelled</span></div>}
                <div className="bpv-pct"><b>{pct}<small>%</small></b><span>complete</span></div>
              </div>
              <div className="ui-meter bpv-meter"><i style={{ '--pct': `${pct}%` }} /></div>
            </div>
          )}

          <div className="mk-section">
            <p className="ui-kicker">
              <ListChecks size={14} /> Massive Action Plan
              {denom > 0 && <span className="ui-count">{done}/{denom}</span>}
            </p>
            {actions.length === 0 ? (
              <div className="ui-empty bpv-empty"><ListChecks size={22} /> No actions in this plan yet.</div>
            ) : (
              <ul className="bpv-actions">
                {actions.map(a => (
                  <li key={a.id} className={`bpv-action mk-p${a.priority || 0} ${a.is_completed ? 'done' : ''} ${a.is_cancelled ? 'cancelled' : ''}`}>
                    <span className="bpv-check">{a.is_completed && <Check size={12} strokeWidth={3} />}</span>
                    <span className="bpv-action-title">{a.title}</span>
                    {a.is_cancelled && <span className="bpv-tag">cancelled</span>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="modal-footer mk-foot">
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
