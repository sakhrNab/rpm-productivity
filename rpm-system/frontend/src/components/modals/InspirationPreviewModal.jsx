import { X, ExternalLink, Pencil, Trash2, Sparkles } from 'lucide-react';
import './InspirationPreviewModal.css';

function InspirationPreviewModal({ item, onClose, onEdit, onDelete }) {
  if (!item) return null;
  return (
    <div className="modal-overlay insp-preview-overlay" onClick={onClose}>
      <div className="insp-preview" onClick={e => e.stopPropagation()}>
        <button type="button" className="insp-preview-close" onClick={onClose} aria-label="Close">
          <X size={20} />
        </button>

        <div className="insp-preview-media">
          {item.image_url ? (
            <img src={item.image_url} alt={item.title || 'Inspiration'} />
          ) : (
            <div className="insp-preview-noimg"><Sparkles size={40} /></div>
          )}
        </div>

        <div className="insp-preview-body">
          <h3 className="insp-preview-title">{item.title || 'Untitled'}</h3>
          {item.description && <p className="insp-preview-desc">{item.description}</p>}
          {item.link_url && (
            <a className="insp-preview-link" href={item.link_url} target="_blank" rel="noopener noreferrer">
              <ExternalLink size={15} /> {item.link_url}
            </a>
          )}
          <div className="insp-preview-actions">
            <button type="button" className="btn btn-secondary" onClick={() => onEdit(item)}>
              <Pencil size={14} /> Edit
            </button>
            <button type="button" className="btn btn-secondary insp-preview-delete" onClick={() => onDelete(item)}>
              <Trash2 size={14} /> Delete
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default InspirationPreviewModal;
