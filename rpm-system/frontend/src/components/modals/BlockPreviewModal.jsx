import { X, Target, Compass, ListChecks, Check, Pencil } from 'lucide-react';
import './BlockPreviewModal.css';

function BlockPreviewModal({ block, onClose, onEdit }) {
  if (!block) return null;
  const actions = block.actions || [];
  const cancelled = actions.filter(a => a.is_cancelled);
  const denom = actions.length - cancelled.length;
  const done = actions.filter(a => a.is_completed && !a.is_cancelled).length;
  const pct = denom > 0 ? Math.round((done / denom) * 100) : 0;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal bpv-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">RPM Block</h3>
          <button type="button" className="btn btn-icon btn-ghost" onClick={onClose}><X size={20} /></button>
        </div>

        <div className="modal-body">
          <div className="bpv-section">
            <div className="bpv-label bpv-label-pink"><Target size={13} /> Result</div>
            <div className="bpv-result">{block.result_title}</div>
          </div>

          {block.purpose && (
            <div className="bpv-section">
              <div className="bpv-label bpv-label-cyan"><Compass size={13} /> Purpose</div>
              <div className="bpv-purpose">{block.purpose}</div>
            </div>
          )}

          {actions.length > 0 && (
            <div className={`bpv-progress ${pct >= 100 ? 'is-done' : ''}`}>
              <div className="bpv-track"><span className="bpv-fill" style={{ width: `${pct}%` }} /></div>
              <div className="bpv-progress-meta">
                <span>{done}/{denom} done{cancelled.length ? ` · ${cancelled.length} cancelled` : ''}</span>
                <span className="bpv-pct">{pct}%</span>
              </div>
            </div>
          )}

          <div className="bpv-section">
            <div className="bpv-label"><ListChecks size={13} /> Massive Action Plan</div>
            {actions.length === 0 ? (
              <p className="bpv-empty">No actions yet.</p>
            ) : (
              <ul className="bpv-actions">
                {actions.map(a => (
                  <li key={a.id} className={`bpv-action ${a.is_completed ? 'done' : ''} ${a.is_cancelled ? 'cancelled' : ''}`}>
                    <span className="bpv-check">{a.is_completed && <Check size={12} />}</span>
                    <span className="bpv-action-title">{a.title}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="modal-footer">
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
