import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { format, parseISO } from 'date-fns';
import { Star, Check, Clock, FolderOpen, Calendar, MoreVertical, Pencil, Trash2, ExternalLink, Flag, Lock, GitBranch, Bell } from 'lucide-react';
import { playDone } from '../utils/sound';
import './ActionRow.css';

const PRIORITY = {
  1: { label: 'Low', cls: 'low', color: 'var(--accent-cyan)' },
  2: { label: 'Med', cls: 'med', color: 'var(--accent-orange)' },
  3: { label: 'High', cls: 'high', color: 'var(--accent-red)' },
};
const PRIORITY_OPTS = [
  { value: 3, label: 'High', cls: 'high' },
  { value: 2, label: 'Med', cls: 'med' },
  { value: 1, label: 'Low', cls: 'low' },
  { value: 0, label: 'None', cls: 'none' },
];

// Stable distinguishable color per project.
function hueFromString(s) {
  let h = 0;
  for (let i = 0; i < String(s).length; i++) h = (h * 31 + String(s).charCodeAt(i)) >>> 0;
  return h % 360;
}
function projectColor(id) { return `hsl(${hueFromString(id || 'x')} 60% 62%)`; }

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

// Quick "remind me" presets → absolute ISO timestamps.
function atToday(hour) { const d = new Date(); d.setHours(hour, 0, 0, 0); return d; }
function remindPresets() {
  const now = new Date();
  const inHour = new Date(now.getTime() + 3600000);
  let evening = atToday(18); if (evening <= now) evening = new Date(evening.getTime() + 86400000);
  const tomorrowAm = new Date(atToday(9).getTime() + 86400000);
  return [
    { key: 'hour', label: 'In 1 hour', at: inHour },
    { key: 'eve', label: 'This evening · 6:00 PM', at: evening },
    { key: 'tom', label: 'Tomorrow · 9:00 AM', at: tomorrowAm },
  ];
}

const DOW_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
function describeReminder(r) {
  if (r.kind === 'daily') return `Every day · ${(r.remind_time || '09:00').slice(0, 5)}`;
  if (r.kind === 'weekly') return `${DOW_SHORT[r.remind_dow] || ''} · ${(r.remind_time || '09:00').slice(0, 5)}`;
  if (r.remind_at) { try { return new Date(r.remind_at).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }); } catch { return 'Once'; } }
  return 'Once';
}
function toLocalInput(iso) {
  const d = new Date(iso); const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

function ActionRow({ action, onToggleComplete, onToggleStar, onEdit, onDelete, onChangePriority, onRemind, reminders = [], onDeleteReminder, onUpdateReminder }) {
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [prioOpen, setPrioOpen] = useState(false);
  const [remindOpen, setRemindOpen] = useState(false);
  const [customAt, setCustomAt] = useState('');
  const [editRemId, setEditRemId] = useState(null);
  const [editRemVal, setEditRemVal] = useState('');
  const menuRef = useRef(null);
  const prioRef = useRef(null);
  const remindRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
      if (prioRef.current && !prioRef.current.contains(e.target)) setPrioOpen(false);
      if (remindRef.current && !remindRef.current.contains(e.target)) { setRemindOpen(false); setEditRemId(null); }
    };
    if (menuOpen || prioOpen || remindOpen) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [menuOpen, prioOpen, remindOpen]);

  const setReminder = (date) => {
    setRemindOpen(false);
    if (onRemind && date) onRemind(action, date.toISOString());
  };
  const startEditRem = (r) => {
    setEditRemId(r.id);
    setEditRemVal(r.kind === 'once' && r.remind_at ? toLocalInput(r.remind_at) : (r.remind_time || '09:00').slice(0, 5));
  };
  const saveEditRem = (r) => {
    if (!editRemVal || !onUpdateReminder) { setEditRemId(null); return; }
    const patch = r.kind === 'once' ? { remind_at: new Date(editRemVal).toISOString() } : { remind_time: editRemVal };
    onUpdateReminder(r, patch);
    setEditRemId(null);
  };

  const prio = PRIORITY[action.priority];
  const stripeColor = prio ? prio.color : 'transparent';

  return (
    <div className="action-item" style={{ borderLeft: `3px solid ${stripeColor}` }}>
      <div
        className={`action-checkbox ${action.is_completed ? 'completed' : ''}`}
        onClick={() => { if (!action.is_completed) playDone(); onToggleComplete(action); }}
      >
        {action.is_completed && <Check size={12} />}
      </div>

      <div className="action-content ar-content" onClick={() => onEdit(action)} title="Open action">
        <div className={`action-title ${action.is_completed ? 'completed' : ''}`}>
          {action.title}
        </div>
        <div className="action-meta">
          {/* Priority — inline, click to change */}
          {onChangePriority ? (
            <span className="ar-prio-wrap" ref={prioRef} onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                className={`ar-prio ${prio ? `ar-prio-${prio.cls}` : 'ar-prio-none'} ar-prio-btn`}
                onClick={() => setPrioOpen(v => !v)}
                title="Set priority"
              >
                <Flag size={11} /> {prio ? prio.label : 'Priority'}
              </button>
              {prioOpen && (
                <div className="ar-prio-menu">
                  {PRIORITY_OPTS.map(o => (
                    <button
                      key={o.value}
                      type="button"
                      className={`ar-prio-opt ar-prio-${o.cls} ${action.priority === o.value ? 'active' : ''}`}
                      onClick={() => { setPrioOpen(false); onChangePriority(action, o.value); }}
                    >
                      <Flag size={11} /> {o.label}
                    </button>
                  ))}
                </div>
              )}
            </span>
          ) : prio && (
            <span className={`ar-prio ar-prio-${prio.cls}`}><Flag size={11} /> {prio.label}</span>
          )}

          {/* Category (real color) + project (distinguishable color) */}
          {action.category_name && (
            <span className="ar-cat" style={{ color: action.category_color || 'var(--accent-pink)', borderColor: (action.category_color || 'var(--accent-pink)') + '66', background: (action.category_color || 'var(--accent-pink)') + '1f' }}>
              {action.category_name}
            </span>
          )}
          {action.project_name && (
            <span className="ar-proj" style={{ color: projectColor(action.project_id), borderColor: projectColor(action.project_id) + '55' }}>
              <FolderOpen size={11} /> {action.project_name}
            </span>
          )}

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

      {onRemind && (
        <div className="ar-remind-wrap" ref={remindRef}>
          <button
            className="btn btn-icon btn-ghost"
            aria-label="Remind me about this task"
            title="Remind me"
            onClick={() => setRemindOpen(v => !v)}
          >
            <Bell size={14} />
          </button>
          {remindOpen && (
            <div className="ar-remind-menu">
              {reminders.length > 0 && (
                <div className="ar-remind-existing">
                  <div className="ar-remind-head">Reminders</div>
                  {reminders.map(r => (
                    <div key={r.id} className="ar-remind-item">
                      {editRemId === r.id ? (
                        <>
                          <input
                            type={r.kind === 'once' ? 'datetime-local' : 'time'}
                            className="form-input ar-remind-edit-in"
                            value={editRemVal}
                            onChange={(e) => setEditRemVal(e.target.value)}
                            autoFocus
                          />
                          <button type="button" className="ar-remind-save" onClick={() => saveEditRem(r)}>Save</button>
                        </>
                      ) : (
                        <>
                          <span className="ar-remind-item-when">{describeReminder(r)}</span>
                          {onUpdateReminder && <button type="button" className="ar-remind-icon" title="Edit" onClick={() => startEditRem(r)}><Pencil size={12} /></button>}
                          {onDeleteReminder && <button type="button" className="ar-remind-icon ar-remind-del" title="Delete" onClick={() => onDeleteReminder(r)}><Trash2 size={12} /></button>}
                        </>
                      )}
                    </div>
                  ))}
                </div>
              )}
              <div className="ar-remind-head">{reminders.length ? 'Add another' : 'Remind me…'}</div>
              {remindPresets().map(p => (
                <button key={p.key} type="button" className="ar-remind-opt" onClick={() => setReminder(p.at)}>
                  {p.label}
                </button>
              ))}
              <div className="ar-remind-custom">
                <input
                  type="datetime-local"
                  className="form-input"
                  value={customAt}
                  onChange={(e) => setCustomAt(e.target.value)}
                  aria-label="Custom reminder time"
                />
                <button
                  type="button"
                  className="btn btn-primary ar-remind-set"
                  disabled={!customAt}
                  onClick={() => customAt && setReminder(new Date(customAt))}
                >
                  Set
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <button
        className="btn btn-icon btn-ghost"
        aria-label="Toggle star"
        onClick={() => onToggleStar(action)}
        style={{ color: action.is_starred ? 'var(--accent-orange)' : 'var(--text-muted)' }}
      >
        <Star size={14} fill={action.is_starred ? 'currentColor' : 'none'} />
      </button>

      <div className="dropdown action-actions ar-actions" ref={menuRef}>
        <button className="btn btn-icon btn-ghost" aria-label="Action options" onClick={() => setMenuOpen(v => !v)}>
          <MoreVertical size={16} />
        </button>
        {menuOpen && (
          <div className="dropdown-menu ar-menu">
            <div className="dropdown-item" onClick={() => { setMenuOpen(false); onEdit(action); }}>
              <Pencil size={14} />
              Edit action
            </div>
            {action.project_id && (
              <div className="dropdown-item" onClick={() => { setMenuOpen(false); navigate(`/projects/${action.project_id}`); }}>
                <ExternalLink size={14} />
                Go to project
              </div>
            )}
            <div className="dropdown-item ar-delete-item" onClick={() => { setMenuOpen(false); onDelete(action); }}>
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
