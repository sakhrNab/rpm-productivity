import { X } from 'lucide-react';
import './modalKit.css';

// Shared modal header: gradient icon badge + title + one-line helper + close.
// Sits inside the global sticky .modal-header shell (styles/ui.css).
export default function ModalHead({ icon: Icon, title, subtitle, onClose, badgeStyle, children }) {
  return (
    <div className="modal-header mk-head">
      <span className="ui-icon-badge mk-badge" style={badgeStyle} aria-hidden="true">
        {Icon && <Icon size={20} />}
      </span>
      <div className="mk-head-text">
        <h3 className="modal-title">{title}</h3>
        {subtitle && <p className="mk-sub">{subtitle}</p>}
      </div>
      {children}
      {onClose && (
        <button type="button" className="mk-close" onClick={onClose} aria-label="Close">
          <X size={18} />
        </button>
      )}
    </div>
  );
}
