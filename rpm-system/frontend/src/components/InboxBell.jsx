import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, CheckCheck, AlarmClock, History, ArrowRight, Inbox } from 'lucide-react';
import { AuthContext } from '../App';

const POLL_MS = 60_000;
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function relTime(at) {
  const t = new Date(at).getTime();
  if (!Number.isFinite(t)) return '';
  const s = Math.max(0, (Date.now() - t) / 1000);
  if (s < 60) return 'now';
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  if (s < 7 * 86400) return `${Math.floor(s / 86400)}d`;
  return new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// "09:30:00" → "9:30 AM" in the viewer's locale
function clock(hms) {
  if (!hms) return '';
  const [h, m] = String(hms).split(':').map(Number);
  const d = new Date(); d.setHours(h || 0, m || 0, 0, 0);
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function reminderWhen(r) {
  if (r.kind === 'once' && r.remind_at) {
    const d = new Date(r.remind_at);
    const today = new Date();
    const sameDay = d.toDateString() === today.toDateString();
    const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
    return sameDay ? `Today · ${time}` : `Tomorrow · ${time}`;
  }
  if (r.kind === 'daily') return `Daily · ${clock(r.remind_time)}`;
  if (r.kind === 'weekly') return `${DOW[r.remind_dow] ?? 'Weekly'} · ${clock(r.remind_time)}`;
  return '';
}

// Header bell: unread coach messages, reminders due in the next 24h, carried-over tasks.
export default function InboxBell() {
  const { api } = useContext(AuthContext);
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [data, setData] = useState(null);
  const [marking, setMarking] = useState(false);
  const rootRef = useRef(null);
  const btnRef = useRef(null);
  // `api` is rebuilt on every AuthProvider render — read it through a ref so the poll
  // interval isn't torn down and restarted each time.
  const apiRef = useRef(api);
  apiRef.current = api;

  const load = useCallback(async () => {
    try {
      const res = await apiRef.current.getInbox();
      if (res && !res.error) setData(res);
    } catch { /* keep the last good snapshot */ }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, POLL_MS);
    return () => clearInterval(id);
  }, [load]);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') { setOpen(false); btnRef.current?.focus(); } };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  const toggle = () => {
    if (!open) load();                    // refresh on open
    setOpen(!open);
  };

  const go = (to) => { setOpen(false); navigate(to); };

  const markAll = async () => {
    setMarking(true);
    setData(d => d && { ...d, unread: 0, coach: d.coach.map(c => ({ ...c, unread: false })) });
    try { await apiRef.current.markInboxRead(); } catch { /* the next poll re-syncs */ }
    await load();
    setMarking(false);
  };

  const unread = data?.unread || 0;
  // Unread first, then the latest of the rest.
  const coach = (data?.coach || []).slice().sort((a, b) => (b.unread - a.unread) || (new Date(b.at) - new Date(a.at))).slice(0, 8);
  const reminders = data?.reminders || [];
  const overdue = data?.overdue || 0;
  const empty = !coach.length && !reminders.length && !overdue;

  return (
    <div className="tn-bell" ref={rootRef}>
      <button
        ref={btnRef}
        type="button"
        className={`tn-icon-btn ${open ? 'on' : ''}`}
        aria-label={unread ? `Inbox, ${unread} unread` : 'Inbox'}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={toggle}
      >
        <Bell size={18} />
        {unread > 0 && <span className="tn-badge" aria-hidden="true">{unread > 9 ? '9+' : unread}</span>}
      </button>

      {open && (
        <div className="tn-panel tn-inbox" role="dialog" aria-label="Inbox">
          <div className="tn-inbox-head">
            <p className="ui-kicker"><Inbox size={14} /> Inbox {unread > 0 && <span className="ui-count">{unread} new</span>}</p>
            <button type="button" className="tn-link-btn" onClick={markAll} disabled={!unread || marking}>
              <CheckCheck size={14} /> Mark all read
            </button>
          </div>

          <div className="tn-inbox-body">
            {!data && <div className="tn-inbox-loading">Loading…</div>}
            {data && empty && (
              <div className="ui-empty tn-inbox-empty"><CheckCheck size={20} /> You’re all caught up.</div>
            )}

            {overdue > 0 && (
              <button type="button" className="tn-inbox-row tn-inbox-overdue" onClick={() => go('/today')}>
                <span className="tn-inbox-ico tn-ico-warn"><History size={16} /></span>
                <span className="tn-inbox-main">
                  <b>{overdue} carried-over {overdue === 1 ? 'task' : 'tasks'}</b>
                  <small>Triage them on Today</small>
                </span>
                <ArrowRight size={15} className="tn-inbox-go" />
              </button>
            )}

            {coach.length > 0 && (
              <section className="tn-inbox-sec">
                <h3 className="tn-inbox-sec-title">Coaches</h3>
                {coach.map(m => (
                  <button key={m.id} type="button" className={`tn-inbox-row ${m.unread ? 'unread' : ''}`} onClick={() => go(m.link)}>
                    <span className="tn-inbox-ico tn-emoji" aria-hidden="true">{m.coach?.emoji || '🧭'}</span>
                    <span className="tn-inbox-main">
                      <span className="tn-inbox-line">
                        <b>{m.coach?.name || 'Coach'}</b>
                        <time dateTime={m.at}>{relTime(m.at)}</time>
                      </span>
                      <small className="tn-inbox-preview">{m.preview}</small>
                    </span>
                    {m.unread && <i className="tn-dot" aria-label="unread" />}
                  </button>
                ))}
              </section>
            )}

            {reminders.length > 0 && (
              <section className="tn-inbox-sec">
                <h3 className="tn-inbox-sec-title">Due in the next 24h</h3>
                {reminders.map(r => (
                  <button key={r.id} type="button" className="tn-inbox-row" onClick={() => go('/reminders')}>
                    <span className="tn-inbox-ico"><AlarmClock size={16} /></span>
                    <span className="tn-inbox-main">
                      <b className="tn-inbox-title">{r.title}</b>
                      <small className="tn-mono">{reminderWhen(r)}</small>
                    </span>
                  </button>
                ))}
              </section>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
