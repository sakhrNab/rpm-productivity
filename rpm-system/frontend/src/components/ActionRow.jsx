import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { format, parseISO } from 'date-fns';
import { Star, Check, Clock, Calendar, MoreVertical, Pencil, Trash2, ExternalLink, Flag, Lock, GitBranch, Bell } from 'lucide-react';
import { playDone } from '../utils/sound';
import './ActionRow.css';

const PRIORITY = {
  1: { label: 'Low', cls: 'low' },
  2: { label: 'Med', cls: 'med' },
  3: { label: 'High', cls: 'high' },
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

// hideToday: on a single-day list (My Day) every row would say "Today" — drop that chip.
function ActionRow({ action, onToggleComplete, onToggleStar, onEdit, onDelete, onChangePriority, onRemind, reminders = [], onDeleteReminder, onUpdateReminder, hideToday = false }) {
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
  const pLevel = prio ? action.priority : 0;
  const done = !!action.is_completed;
  const dateStr = action.scheduled_date ? prettyDate(action.scheduled_date) : null;
  const showDate = !(hideToday && dateStr === 'Today');
  const catColor = action.category_color || 'var(--accent-pink)';
  const projColor = projectColor(action.project_id);

  return (
    <div className={`ar-row p${pLevel} ${done ? 'is-done' : ''}`}>
      <button
        type="button"
        role="checkbox"
        aria-checked={done}
        aria-label={done ? 'Mark as not done' : 'Mark as done'}
        className={`ar-check ${done ? 'on' : ''}`}
        onClick={() => { if (!action.is_completed) playDone(); onToggleComplete(action); }}
      >
        <Check size={14} strokeWidth={3} />
      </button>

      <div className="ar-main" onClick={() => onEdit(action)} title="Open action">
        <div className="ar-title">{action.title}</div>
        <div className="ar-meta">
          {/* Priority — inline, click to change */}
          {onChangePriority ? (
            <span className="ar-prio-wrap" ref={prioRef} onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                className={`ar-chip ar-prio ar-prio-${prio ? prio.cls : 'none'}`}
                onClick={() => setPrioOpen(v => !v)}
                title="Set priority"
                aria-haspopup="listbox"
                aria-expanded={prioOpen}
              >
                <Flag size={11} /> {prio ? prio.label : 'Priority'}
              </button>
              {prioOpen && (
                <div className="ar-pop ar-prio-menu" role="listbox">
                  <div className="ar-pop-head">Priority</div>
                  {PRIORITY_OPTS.map(o => {
                    const sel = (action.priority || 0) === o.value;
                    return (
                      <button
                        key={o.value}
                        type="button"
                        role="option"
                        aria-selected={sel}
                        className={`ar-pop-opt ar-prio-opt ar-prio-${o.cls} ${sel ? 'active' : ''}`}
                        onClick={() => { setPrioOpen(false); onChangePriority(action, o.value); }}
                      >
                        <i className="ar-prio-dot" /> {o.label}
                        {sel && <Check size={13} className="ar-pop-check" />}
                      </button>
                    );
                  })}
                </div>
              )}
            </span>
          ) : prio && (
            <span className={`ar-chip ar-prio ar-prio-${prio.cls}`}><Flag size={11} /> {prio.label}</span>
          )}

          {/* Project (distinguishable color), else the category (real color) */}
          {action.project_name ? (
            <span className="ar-chip ar-proj" style={{ '--c': projColor }} title={action.category_name ? `${action.category_name} · ${action.project_name}` : action.project_name}>
              <i className="ar-dot" /> {action.project_name}
            </span>
          ) : action.category_name && (
            <span className="ar-chip ar-cat" style={{ '--c': catColor }}>
              <i className="ar-dot" /> {action.category_name}
            </span>
          )}

          {action.scheduled_date
            ? showDate && <span className="ar-chip ar-when"><Calendar size={11} /> {dateStr}</span>
            : <span className="ar-chip ar-when ar-unscheduled"><Calendar size={11} /> Unscheduled</span>}
          {(Number(action.duration_hours) > 0 || Number(action.duration_minutes) > 0) && (
            <span className="ar-chip ar-when"><Clock size={11} /> {prettyDuration(action.duration_hours, action.duration_minutes)}</span>
          )}
          {reminders.length > 0 && (
            <span className="ar-chip ar-rem" title={reminders.map(describeReminder).join(' · ')}>
              <Bell size={11} /> {describeReminder(reminders[0])}{reminders.length > 1 ? ` +${reminders.length - 1}` : ''}
            </span>
          )}
          {Array.isArray(action.blocked_by) && action.blocked_by.length > 0 && (
            <span className="ar-chip ar-dep-blocked" title={'Blocked by: ' + action.blocked_by.map(b => b.title).join(', ')}>
              <Lock size={11} /> Blocked by {action.blocked_by.length}
            </span>
          )}
          {Array.isArray(action.blocks) && action.blocks.length > 0 && (
            <span className="ar-chip ar-dep-blocks" title={'Blocks: ' + action.blocks.map(b => b.title).join(', ')}>
              <GitBranch size={11} /> Blocks {action.blocks.length}
            </span>
          )}
        </div>
      </div>

      <div className="ar-tools">
        {onRemind && (
          <div className="ar-remind-wrap" ref={remindRef}>
            <button
              type="button"
              className={`ar-tool ${reminders.length ? 'has' : ''}`}
              aria-label="Remind me about this task"
              aria-expanded={remindOpen}
              title="Remind me"
              onClick={() => setRemindOpen(v => !v)}
            >
              <Bell size={15} />
            </button>
            {remindOpen && (
              <div className="ar-pop ar-remind-menu">
                {reminders.length > 0 && (
                  <div className="ar-remind-existing">
                    <div className="ar-pop-head">Reminders</div>
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
                            <Bell size={12} className="ar-remind-item-ico" />
                            <span className="ar-remind-item-when">{describeReminder(r)}</span>
                            {onUpdateReminder && <button type="button" className="ar-remind-icon" title="Edit" aria-label="Edit reminder" onClick={() => startEditRem(r)}><Pencil size={13} /></button>}
                            {onDeleteReminder && <button type="button" className="ar-remind-icon ar-remind-del" title="Delete" aria-label="Delete reminder" onClick={() => onDeleteReminder(r)}><Trash2 size={13} /></button>}
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                <div className="ar-pop-head">{reminders.length ? 'Add another' : 'Remind me…'}</div>
                {remindPresets().map(p => (
                  <button key={p.key} type="button" className="ar-pop-opt" onClick={() => setReminder(p.at)}>
                    <Clock size={13} /> {p.label}
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
          type="button"
          className={`ar-tool ar-star ${action.is_starred ? 'on' : ''}`}
          aria-label="Toggle star"
          aria-pressed={!!action.is_starred}
          onClick={() => onToggleStar(action)}
        >
          <Star size={15} fill={action.is_starred ? 'currentColor' : 'none'} />
        </button>

        <div className="ar-more" ref={menuRef}>
          <button type="button" className="ar-tool" aria-label="Action options" aria-expanded={menuOpen} onClick={() => setMenuOpen(v => !v)}>
            <MoreVertical size={16} />
          </button>
          {menuOpen && (
            <div className="ar-pop ar-menu" role="menu">
              <button type="button" role="menuitem" className="ar-pop-opt" onClick={() => { setMenuOpen(false); onEdit(action); }}>
                <Pencil size={14} /> Edit action
              </button>
              {action.project_id && (
                <button type="button" role="menuitem" className="ar-pop-opt" onClick={() => { setMenuOpen(false); navigate(`/projects/${action.project_id}`); }}>
                  <ExternalLink size={14} /> Go to project
                </button>
              )}
              <button type="button" role="menuitem" className="ar-pop-opt ar-delete-item" onClick={() => { setMenuOpen(false); onDelete(action); }}>
                <Trash2 size={14} /> Delete action
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default ActionRow;
