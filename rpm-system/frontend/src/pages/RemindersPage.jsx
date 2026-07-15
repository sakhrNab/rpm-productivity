import { useState, useEffect, useContext } from 'react';
import { Bell, Plus, Trash2, Clock, CalendarClock, Link2, Settings as SettingsIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import { AuthContext } from '../App';
import { useToast } from '../components/ToastProvider';
import './RemindersPage.css';

const DOW_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function describeReminder(r) {
  if (r.kind === 'daily') return `Every day at ${r.remind_time || '09:00'}`;
  if (r.kind === 'weekly') return `Every ${DOW_LABELS[r.remind_dow] || ''} at ${r.remind_time || '09:00'}`;
  if (r.remind_at) { try { return new Date(r.remind_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }); } catch { return 'Once'; } }
  return 'Once';
}

function RemindersPage() {
  const { api } = useContext(AuthContext);
  const { showToast } = useToast();
  const [reminders, setReminders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ title: '', kind: 'once', remind_at: '', remind_time: '09:00', remind_dow: 1 });

  const load = () => api.getReminders().then(rs => setReminders(Array.isArray(rs) ? rs : [])).catch(() => {}).finally(() => setLoading(false));
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const add = async () => {
    if (!form.title.trim()) return;
    setAdding(true);
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
      const payload = { title: form.title.trim(), kind: form.kind, timezone: tz };
      if (form.kind === 'once') payload.remind_at = form.remind_at ? new Date(form.remind_at).toISOString() : null;
      else { payload.remind_time = form.remind_time; if (form.kind === 'weekly') payload.remind_dow = Number(form.remind_dow); }
      const r = await api.createReminder(payload);
      if (r?.error) throw new Error(r.error);
      setForm({ title: '', kind: 'once', remind_at: '', remind_time: '09:00', remind_dow: 1 });
      showToast('Reminder added', 'success');
      load();
    } catch (e) { showToast(e.message || 'Failed to add reminder', 'error'); }
    finally { setAdding(false); }
  };

  const remove = async (id) => {
    try { await api.deleteReminder(id); load(); showToast('Reminder removed', 'info'); }
    catch { showToast('Failed to remove', 'error'); }
  };

  const linked = reminders.filter(r => r.action_id);
  const standalone = reminders.filter(r => !r.action_id);

  const renderItem = (r) => (
    <li key={r.id} className="rem-item">
      <div className="rem-item-icon">{r.action_id ? <Link2 size={15} /> : <Bell size={15} />}</div>
      <div className="rem-item-body">
        <div className="rem-item-title">{r.title}</div>
        <div className="rem-item-when"><CalendarClock size={12} /> {describeReminder(r)}</div>
      </div>
      <button className="rem-item-del" onClick={() => remove(r.id)} aria-label="Delete reminder"><Trash2 size={15} /></button>
    </li>
  );

  return (
    <div className="rem-page">
      <header className="rem-head">
        <div className="rem-head-icon"><Bell size={24} /></div>
        <div>
          <h1 className="rem-title">Reminders</h1>
          <p className="rem-sub">
            Nudges delivered through your enabled channels.{' '}
            <Link to="/settings" className="rem-link"><SettingsIcon size={12} /> Configure channels &amp; digest</Link>
          </p>
        </div>
      </header>

      {/* Add a standalone reminder */}
      <section className="rem-card rem-add">
        <h2 className="rem-card-head"><Plus size={15} /> New reminder</h2>
        <p className="rem-add-hint">For anything not tied to a task — “drink water”, “stand-up at 10”. To remind yourself about a specific task, use the <Bell size={12} /> bell on the task in My Day or My Week.</p>
        <div className="rem-form">
          <input
            className="form-input rem-form-title"
            placeholder="Remind me to…"
            value={form.title}
            onChange={e => setForm({ ...form, title: e.target.value })}
            onKeyDown={e => { if (e.key === 'Enter') add(); }}
          />
          <select className="form-input rem-form-kind" value={form.kind} onChange={e => setForm({ ...form, kind: e.target.value })}>
            <option value="once">Once</option>
            <option value="daily">Every day</option>
            <option value="weekly">Every week</option>
          </select>
          {form.kind === 'once'
            ? <input type="datetime-local" className="form-input" value={form.remind_at} onChange={e => setForm({ ...form, remind_at: e.target.value })} />
            : <input type="time" className="form-input rem-form-time" value={form.remind_time} onChange={e => setForm({ ...form, remind_time: e.target.value })} />}
          {form.kind === 'weekly' && (
            <select className="form-input rem-form-dow" value={form.remind_dow} onChange={e => setForm({ ...form, remind_dow: e.target.value })}>
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d, i) => <option key={i} value={i}>{d}</option>)}
            </select>
          )}
          <button className="btn btn-primary rem-form-add" onClick={add} disabled={adding || !form.title.trim()}><Plus size={15} /> Add</button>
        </div>
      </section>

      {loading ? (
        <div className="rem-card rem-muted">Loading…</div>
      ) : reminders.length === 0 ? (
        <div className="rem-card rem-empty">
          <Clock size={22} />
          <p>No reminders yet. Add one above, or tap the <Bell size={13} /> bell on a task to be reminded about it.</p>
        </div>
      ) : (
        <>
          {linked.length > 0 && (
            <section className="rem-card">
              <h2 className="rem-card-head"><Link2 size={15} /> Task reminders <span className="rem-count">{linked.length}</span></h2>
              <ul className="rem-list">{linked.map(renderItem)}</ul>
            </section>
          )}
          {standalone.length > 0 && (
            <section className="rem-card">
              <h2 className="rem-card-head"><Bell size={15} /> Standalone reminders <span className="rem-count">{standalone.length}</span></h2>
              <ul className="rem-list">{standalone.map(renderItem)}</ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}

export default RemindersPage;
