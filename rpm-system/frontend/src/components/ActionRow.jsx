import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { format, parseISO } from 'date-fns';
import { Star, Check, Clock, FolderOpen, Calendar, MoreVertical, Pencil, Trash2, ExternalLink, Flag, Lock, GitBranch } from 'lucide-react';
import { playDone } from '../utils/sound';
import './ActionRow.css';

const PRIORITY = { 1: { label: 'Low', cls: 'low' }, 2: { label: 'Med', cls: 'med' }, 3: { label: 'High', cls: 'high' } };

function prettyDate(d) {
  if (!d) return null;
  const s = String(d).slice(0, 10);
  const today = format(new Date(), 'yyyy-MM-dd');
  const tomorrow = format(new Date(Date.now() + 86400000), 'yyyy-MM-dd');
  if (s === today) return 'Today';
  if (s === tomorrow) return 'Tomorrow';
  try { return format(parseISO(s), 'MMM d'); } catch { return s; }
}

function prettyDuration(h, m) {
  const hh = Number(h) || 0, mm = Number(m) || 0;
  if (hh > 0 && mm > 0) return `${hh}h ${mm}m`;
  if (hh > 0) return `${hh}h`;
  return `${mm}m`;
}

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
        onClick={() => { if (!action.is_completed) playDone(); onToggleComplete(action); }}
      >
        {action.is_completed && <Check size={12} />}
      </div>

      <div
        className="action-content ar-content"
        onClick={() => onEdit(action)}
        title="Open action"
      >
        <div className={`action-title ${action.is_completed ? 'completed' : ''}`}>
          {PRIORITY[action.priority] && (
            <span className={`ar-prio ar-prio-${PRIORITY[action.priority].cls}`} title={`${PRIORITY[action.priority].label} priority`}>
              <Flag size={11} /> {PRIORITY[action.priority].label}
            </span>
          )}
          {action.title}
        </div>
        <div className="action-meta">
          {action.project_name && <span><FolderOpen size={12} /> {action.project_name}</span>}
          {action.scheduled_date
            ? <span><Calendar size={12} /> {prettyDate(action.scheduled_date)}</span>
            : <span className="ar-unscheduled"><Calendar size={12} /> unscheduled</span>}
          <span><Clock size={12} /> {prettyDuration(action.duration_hours, action.duration_minutes)}</span>
          {Array.isArray(action.blocked_by) && action.blocked_by.length > 0 && (
            <span className="ar-dep ar-dep-blocked" title={'Blocked by: ' + action.blocked_by.map(b => b.title).join(', ')}>
              <Lock size={12} /> Blocked by {action.blocked_by.length}
            </span>
          )}
          {Array.isArray(action.blocks) && action.blocks.length > 0 && (
            <span className="ar-dep ar-dep-blocks" title={'Blocks: ' + action.blocks.map(b => b.title).join(', ')}>
              <GitBranch size={12} /> Blocks {action.blocks.length}
            </span>
          )}
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

      <div className="dropdown action-actions ar-actions" ref={menuRef}>
        <button
          className="btn btn-icon btn-ghost"
          aria-label="Action options"
          onClick={() => setMenuOpen(v => !v)}
        >
          <MoreVertical size={16} />
        </button>
        {menuOpen && (
          <div className="dropdown-menu ar-menu">
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
              className="dropdown-item ar-delete-item"
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
