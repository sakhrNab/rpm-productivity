import { useState, useEffect, useContext, useRef } from 'react';
import { Bell, Plus, Trash2, Clock, CalendarClock, CalendarDays, Link2, Repeat, Settings as SettingsIcon, BellRing } from 'lucide-react';
import { Link } from 'react-router-dom';
import { format, isSameDay, addDays, differenceInCalendarDays } from 'date-fns';
import { AuthContext } from '../App';
import { useToast } from '../components/ToastProvider';
import Picker from '../components/Picker';
import './RemindersPage.css';

const DOW_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DOW_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const KIND_OPTIONS = [
  { value: 'once', label: 'Once', icon: <CalendarClock size={15} />, hint: 'a date & time' },
  { value: 'daily', label: 'Every day', icon: <Repeat size={15} />, hint: 'at a time' },
  { value: 'weekly', label: 'Every week', icon: <CalendarDays size={15} />, hint: 'on a weekday' },
];
const DOW_OPTIONS = DOW_LABELS.map((label, value) => ({ value, label }));
const FILTERS = [['all', 'All'], ['once', 'Once'], ['daily', 'Daily'], ['weekly', 'Weekly']];

function describeReminder(r) {
  if (r.kind === 'daily') return `Every day at ${r.remind_time || '09:00'}`;
  if (r.kind === 'weekly') return `Every ${DOW_LABELS[r.remind_dow] || ''} at ${r.remind_time || '09:00'}`;
  if (r.remind_at) { try { return new Date(r.remind_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }); } catch { return 'Once'; } }
  return 'Once';
}

// Next time this reminder will fire (local time) — for ordering and the "next up" read-out.
function nextFire(r, now) {
  if (r.kind === 'once') {
    if (!r.remind_at || r.is_done) return null;
    const d = new Date(r.remind_at);
    return Number.isNaN(d.getTime()) || d <= now ? null : d;
  }
  const [h, m] = String(r.remind_time || '09:00').split(':').map(Number);
  let d = new Date(now); d.setHours(h || 0, m || 0, 0, 0);
  if (r.kind === 'weekly') {
    d = addDays(d, ((Number(r.remind_dow) || 0) - d.getDay() + 7) % 7);
    if (d <= now) d = addDays(d, 7);
  } else if (d <= now) d = addDays(d, 1);
  return d;
}
function relDay(d, now) {
  if (isSameDay(d, now)) return 'Today';
  if (isSameDay(d, addDays(now, 1))) return 'Tomorrow';
  const diff = differenceInCalendarDays(d, now);
  return diff < 7 ? format(d, 'EEEE') : format(d, 'EEE d MMM');
}
function hhmm(t) { return String(t || '09:00').slice(0, 5); }

function RemindersPage() {
  const { api } = useContext(AuthContext);
  const { showToast } = useToast();
  const [reminders, setReminders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ title: '', kind: 'once', remind_at: '', remind_time: '09:00', remind_dow: 1 });
  const [filter, setFilter] = useState('all');
  const titleRef = useRef(null);

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

  const now = new Date();
  const withNext = reminders.map(r => ({ r, next: nextFire(r, now) }));
  // Soonest first; finished one-offs sink to the bottom.
  const byNext = (a, b) => (a.next ? a.next.getTime() : Infinity) - (b.next ? b.next.getTime() : Infinity);
  const counts = { all: reminders.length, once: 0, daily: 0, weekly: 0 };
  reminders.forEach(r => { if (counts[r.kind] !== undefined) counts[r.kind] += 1; });
  const shown = withNext.filter(x => filter === 'all' || x.r.kind === filter).sort(byNext);
  const linked = shown.filter(x => x.r.action_id);
  const standalone = shown.filter(x => !x.r.action_id);
  const upcoming = withNext.filter(x => x.next).sort(byNext)[0];
  const recurring = counts.daily + counts.weekly;
  const taskLinked = reminders.filter(r => r.action_id).length;

  const renderItem = ({ r, next }) => {
    const at = r.kind === 'once' && r.remind_at ? new Date(r.remind_at) : null;
    const finished = r.kind === 'once' && !next;
    return (
      <li key={r.id} className={`rem-item k-${r.kind} ${finished ? 'is-past' : ''}`}>
        <div className="rem-tile" aria-hidden="true">
          {r.kind === 'once' && at && !Number.isNaN(at.getTime())
            ? <><b>{format(at, 'd')}</b><span>{format(at, 'MMM')}</span></>
            : r.kind === 'weekly'
              ? <><b>{DOW_SHORT[r.remind_dow] || '—'}</b><span>weekly</span></>
              : <><Repeat size={16} /><span>daily</span></>}
        </div>
        <div className="rem-item-body">
          <div className="rem-item-title">{r.title}</div>
          <div className="rem-item-meta">
            <span className="rem-time" title={describeReminder(r)}>
              {r.kind === 'once' ? <Clock size={12} /> : <Repeat size={12} />} {r.kind === 'once' ? (at ? format(at, 'EEE d MMM · HH:mm') : 'No time set') : `${r.kind === 'weekly' ? `${DOW_LABELS[r.remind_dow] || ''}s` : 'Daily'} · ${hhmm(r.remind_time)}`}
            </span>
            {r.action_id && <span className="ui-chip rem-kind" title={r.action_title || 'Linked to a task'}><Link2 size={11} /> Task</span>}
            {finished && <span className="ui-chip rem-kind">Sent</span>}
            {next && r.kind === 'once' && differenceInCalendarDays(next, now) < 2 && <span className="ui-chip ui-chip--warn rem-kind">{relDay(next, now)}</span>}
          </div>
        </div>
        <button type="button" className="rem-item-del" onClick={() => remove(r.id)} aria-label={`Delete reminder “${r.title}”`} title="Delete reminder"><Trash2 size={16} /></button>
      </li>
    );
  };

  const section = (title, icon, items, key) => items.length > 0 && (
    <section className="ui-card rem-card" key={key} aria-label={title}>
      <h2 className="ui-kicker rem-card-head">{icon} {title} <span className="ui-count">{items.length}</span></h2>
      <ul className="rem-list">{items.map(renderItem)}</ul>
    </section>
  );

  return (
    <div className="rem-page">
      <header className="ui-card rem-hero">
        <div className="rem-hero-top">
          <div className="ui-icon-badge rem-hero-icon"><BellRing size={22} /></div>
          <div className="rem-hero-text">
            <p className="ui-kicker">Nudges</p>
            <h1 className="rem-title"><span className="ui-title-grad">Reminders</span></h1>
            <p className="rem-sub">
              Delivered through your enabled channels.{' '}
              <Link to="/settings" className="rem-link"><SettingsIcon size={13} /> Channels &amp; digest</Link>
            </p>
          </div>
        </div>
        {reminders.length > 0 && (
          <div className="rem-hero-stats">
            <div className="ui-stat"><Bell size={18} /><b>{reminders.length}</b><span>reminders</span></div>
            {recurring > 0 && <div className="ui-stat"><Repeat size={18} /><b>{recurring}</b><span>recurring</span></div>}
            {taskLinked > 0 && <div className="ui-stat rem-stat-info"><Link2 size={18} /><b>{taskLinked}</b><span>on tasks</span></div>}
            {upcoming && (
              <div className="rem-next">
                <span className="rem-next-label">Next up · <b>{relDay(upcoming.next, now)} {format(upcoming.next, 'HH:mm')}</b></span>
                <span className="rem-next-title">{upcoming.r.title}</span>
              </div>
            )}
          </div>
        )}
      </header>

      {/* Add a standalone reminder */}
      <section className="ui-card rem-add" aria-label="New reminder">
        <h2 className="ui-kicker rem-card-head"><Plus size={14} /> New reminder</h2>
        <div className="rem-form">
          <input
            ref={titleRef}
            className="form-input rem-form-title"
            placeholder="Remind me to…"
            aria-label="Reminder text"
            value={form.title}
            onChange={e => setForm({ ...form, title: e.target.value })}
            onKeyDown={e => { if (e.key === 'Enter') add(); }}
          />
          <div className="rem-form-row">
            <div className="rem-form-kind">
              <Picker
                value={form.kind}
                onChange={v => setForm({ ...form, kind: v })}
                options={KIND_OPTIONS}
                header="Repeat"
                title="How often"
              />
            </div>
            {form.kind === 'weekly' && (
              <div className="rem-form-dow">
                <Picker
                  value={Number(form.remind_dow)}
                  onChange={v => setForm({ ...form, remind_dow: v })}
                  options={DOW_OPTIONS}
                  header="Day of the week"
                  title="Day of the week"
                />
              </div>
            )}
            {form.kind === 'once'
              ? <input type="datetime-local" className="form-input rem-form-when" aria-label="Date and time" value={form.remind_at} onChange={e => setForm({ ...form, remind_at: e.target.value })} />
              : <input type="time" className="form-input rem-form-time" aria-label="Time" value={form.remind_time} onChange={e => setForm({ ...form, remind_time: e.target.value })} />}
            <button type="button" className="btn btn-primary rem-form-add" onClick={add} disabled={adding || !form.title.trim()}><Plus size={16} /> {adding ? 'Adding…' : 'Add'}</button>
          </div>
        </div>
        <p className="rem-add-hint">For anything not tied to a task — “drink water”, “stand-up at 10”. For a specific task, use the <Bell size={12} /> bell on its row in My Day or My Week.</p>
      </section>

      {loading ? (
        <div className="ui-card rem-card rem-muted"><div className="spinner rem-spinner" /> Loading reminders…</div>
      ) : reminders.length === 0 ? (
        <div className="ui-empty rem-empty">
          <Clock size={26} />
          <p>No reminders yet. Add one above, or tap the <Bell size={13} /> bell on any task.</p>
          <button type="button" className="btn btn-secondary" onClick={() => titleRef.current?.focus()}><Plus size={15} /> Write your first reminder</button>
        </div>
      ) : (
        <>
          <div className="ui-seg rem-filter" role="tablist" aria-label="Filter reminders">
            {FILTERS.filter(([k]) => k === 'all' || counts[k] > 0).map(([k, label]) => (
              <button key={k} type="button" role="tab" aria-selected={filter === k} className={filter === k ? 'on' : ''} onClick={() => setFilter(k)}>
                {label} <span className="rem-filter-n">{counts[k]}</span>
              </button>
            ))}
          </div>
          {shown.length === 0 && <div className="ui-empty"><Bell size={22} /><p>No {filter} reminders.</p></div>}
          {section('Standalone', <Bell size={14} />, standalone, 'standalone')}
          {section('On tasks', <Link2 size={14} />, linked, 'linked')}
        </>
      )}
    </div>
  );
}

export default RemindersPage;
