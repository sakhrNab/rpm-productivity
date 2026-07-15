import { useState, useEffect, useContext } from 'react';
import { Bell, Plus, Pencil, Trash2, Clock } from 'lucide-react';
import { AuthContext } from '../App';
import { useToast } from './ToastProvider';
import './TaskReminders.css';

const DOW_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
function describe(r) {
  if (r.kind === 'daily') return `Every day · ${(r.remind_time || '09:00').slice(0, 5)}`;
  if (r.kind === 'weekly') return `${DOW_SHORT[r.remind_dow] || ''} · ${(r.remind_time || '09:00').slice(0, 5)}`;
  if (r.remind_at) { try { return new Date(r.remind_at).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }); } catch { return 'Once'; } }
  return 'Once';
}
function toLocalInput(iso) {
  const d = new Date(iso); const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
function atToday(h) { const d = new Date(); d.setHours(h, 0, 0, 0); return d; }
function presets() {
  const now = new Date();
  let eve = atToday(18); if (eve <= now) eve = new Date(eve.getTime() + 86400000);
  return [
    { key: 'h', label: '+1 hour', at: new Date(now.getTime() + 3600000) },
    { key: 'e', label: 'Tonight 6pm', at: eve },
    { key: 't', label: 'Tomorrow 9am', at: new Date(atToday(9).getTime() + 86400000) },
  ];
}

// Self-contained reminder manager for one task (used in the action edit modal).
export default function TaskReminders({ actionId, actionTitle }) {
  const { api } = useContext(AuthContext);
  const { showToast } = useToast();
  const [reminders, setReminders] = useState([]);
  const [customAt, setCustomAt] = useState('');
  const [editId, setEditId] = useState(null);
  const [editVal, setEditVal] = useState('');

  const load = () => api.getReminders().then(rs => setReminders((Array.isArray(rs) ? rs : []).filter(r => r.action_id === actionId))).catch(() => {});
  useEffect(() => { if (actionId) load(); }, [actionId]); // eslint-disable-line react-hooks/exhaustive-deps

  const add = async (date) => {
    if (!date) return;
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
      const r = await api.createReminder({ title: actionTitle || 'Reminder', action_id: actionId, kind: 'once', remind_at: date.toISOString(), timezone: tz });
      if (r?.error) throw new Error(r.error);
      setCustomAt(''); load(); showToast('Reminder added', 'success');
    } catch (e) { showToast(e.message || 'Failed to add reminder', 'error'); }
  };
  const del = async (r) => {
    try { await api.deleteReminder(r.id); load(); }
    catch { showToast('Failed to remove', 'error'); }
  };
  const startEdit = (r) => { setEditId(r.id); setEditVal(r.kind === 'once' && r.remind_at ? toLocalInput(r.remind_at) : (r.remind_time || '09:00').slice(0, 5)); };
  const saveEdit = async (r) => {
    if (!editVal) { setEditId(null); return; }
    try {
      const patch = r.kind === 'once' ? { remind_at: new Date(editVal).toISOString() } : { remind_time: editVal };
      const res = await api.updateReminder(r.id, patch);
      if (res?.error) throw new Error(res.error);
      setEditId(null); load(); showToast('Reminder updated', 'success');
    } catch (e) { showToast(e.message || 'Failed to update', 'error'); }
  };

  if (!actionId) {
    return <p className="tr-hint"><Clock size={13} /> Save the task first, then you can add reminders.</p>;
  }

  return (
    <div className="task-reminders">
      {reminders.length > 0 && (
        <ul className="tr-list">
          {reminders.map(r => (
            <li key={r.id} className="tr-item">
              {editId === r.id ? (
                <>
                  <input type={r.kind === 'once' ? 'datetime-local' : 'time'} className="form-input tr-edit" value={editVal} onChange={e => setEditVal(e.target.value)} autoFocus />
                  <button type="button" className="tr-save" onClick={() => saveEdit(r)}>Save</button>
                </>
              ) : (
                <>
                  <Bell size={13} className="tr-item-icon" />
                  <span className="tr-when">{describe(r)}</span>
                  <button type="button" className="tr-icon" title="Edit" onClick={() => startEdit(r)}><Pencil size={13} /></button>
                  <button type="button" className="tr-icon tr-del" title="Delete" onClick={() => del(r)}><Trash2 size={13} /></button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      <div className="tr-add">
        {presets().map(p => (
          <button key={p.key} type="button" className="tr-preset" onClick={() => add(p.at)}><Plus size={12} /> {p.label}</button>
        ))}
        <span className="tr-custom">
          <input type="datetime-local" className="form-input tr-custom-in" value={customAt} onChange={e => setCustomAt(e.target.value)} />
          <button type="button" className="tr-preset" disabled={!customAt} onClick={() => customAt && add(new Date(customAt))}>Add</button>
        </span>
      </div>
    </div>
  );
}
