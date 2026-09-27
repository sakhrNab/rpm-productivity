import { X, ExternalLink, Pencil, Trash2, Sparkles } from 'lucide-react';
import './InspirationPreviewModal.css';

function hostOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; }
}

function InspirationPreviewModal({ item, onClose, onEdit, onDelete }) {
  if (!item) return null;
  return (
    <div className="modal-overlay insp-preview-overlay" onClick={onClose}>
      <div className="insp-preview" role="dialog" aria-label={item.title || 'Inspiration'} onClick={e => e.stopPropagation()}>
        <button type="button" className="insp-preview-close" onClick={onClose} aria-label="Close">
          <X size={18} />
        </button>

        <div className="insp-preview-media">
          {item.image_url ? (
            <img src={item.image_url} alt={item.title || 'Inspiration'} />
          ) : (
            <div className="insp-preview-noimg"><Sparkles size={40} /></div>
          )}
        </div>

        <div className="insp-preview-body">
          <p className="ui-kicker insp-preview-kicker"><Sparkles size={13} /> Inspiration</p>
          <h3 className="insp-preview-title">{item.title || 'Untitled'}</h3>
          {item.description && <p className="insp-preview-desc">{item.description}</p>}
          {item.link_url && (
            <a className="insp-preview-link" href={item.link_url} target="_blank" rel="noopener noreferrer" title={item.link_url}>
              <ExternalLink size={14} /> <span>{hostOf(item.link_url)}</span>
            </a>
          )}
        </div>

        <div className="insp-preview-actions">
          <button type="button" className="btn btn-secondary insp-preview-delete" onClick={() => onDelete(item)}>
            <Trash2 size={14} /> Delete
          </button>
          <button type="button" className="btn btn-primary" onClick={() => onEdit(item)}>
            <Pencil size={14} /> Edit
          </button>
        </div>
      </div>
    </div>
  );
}

export default InspirationPreviewModal;
