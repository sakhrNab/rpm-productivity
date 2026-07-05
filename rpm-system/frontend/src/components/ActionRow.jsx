import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Star, Check, Clock, FolderOpen, Calendar, MoreVertical, Pencil, Trash2, ExternalLink } from 'lucide-react';

// Reusable action row used by My Day / My Week.
// Clicking the content opens the action for editing; the menu offers
// edit, jump-to-project and delete.
function ActionRow({ action, onToggleComplete, onToggleStar, onEdit, onDelete }) {
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    };
    if (menuOpen) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [menuOpen]);

  return (
    <div className="action-item">
      <div
        className={`action-checkbox ${action.is_completed ? 'completed' : ''}`}
        onClick={() => onToggleComplete(action)}
      >
        {action.is_completed && <Check size={12} />}
      </div>

      <div
        className="action-content"
        style={{ cursor: 'pointer' }}
        onClick={() => onEdit(action)}
        title="Open action"
      >
        <div className={`action-title ${action.is_completed ? 'completed' : ''}`}>
          {action.title}
        </div>
        <div className="action-meta">
          {action.project_name && <span><FolderOpen size={12} /> {action.project_name}</span>}
          {action.scheduled_date
            ? <span><Calendar size={12} /> {action.scheduled_date}</span>
            : <span style={{ color: 'var(--accent-orange)' }}><Calendar size={12} /> unscheduled</span>}
          <span><Clock size={12} /> {action.duration_hours}h {action.duration_minutes}m</span>
        </div>
      </div>

      <button
        className="btn btn-icon btn-ghost"
        aria-label="Toggle star"
        onClick={() => onToggleStar(action)}
        style={{ color: action.is_starred ? 'var(--accent-orange)' : 'var(--text-muted)' }}
      >
        <Star size={14} fill={action.is_starred ? 'currentColor' : 'none'} />
      </button>

      <div className="dropdown action-actions" style={{ position: 'relative' }} ref={menuRef}>
        <button
          className="btn btn-icon btn-ghost"
          aria-label="Action options"
          onClick={() => setMenuOpen(v => !v)}
        >
          <MoreVertical size={16} />
        </button>
        {menuOpen && (
          <div className="dropdown-menu" style={{ right: 0, left: 'auto', minWidth: 170 }}>
            <div className="dropdown-item" onClick={() => { setMenuOpen(false); onEdit(action); }}>
              <Pencil size={14} />
              Edit action
            </div>
            {action.project_id && (
              <div
                className="dropdown-item"
                onClick={() => { setMenuOpen(false); navigate(`/projects/${action.project_id}`); }}
              >
                <ExternalLink size={14} />
                Go to project
              </div>
            )}
            <div
              className="dropdown-item"
              style={{ color: 'var(--accent-red)' }}
              onClick={() => { setMenuOpen(false); onDelete(action); }}
            >
              <Trash2 size={14} />
              Delete action
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default ActionRow;
