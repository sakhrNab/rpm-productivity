import { Link } from 'react-router-dom';
import { Compass, Mail, Send, Smartphone, Clock, Bell, CalendarCheck, CheckCircle2, AlertTriangle, ListChecks } from 'lucide-react';

// Settings → Notifications → "What we send". One row per message type: on/off, when, and which channels.
// Mirrors backend/src/notifyRoutes.js — a message reaches a channel only if that channel is on above AND
// its box here is on.
const CHANNELS = [
  { id: 'email', label: 'Email', icon: Mail },
  { id: 'telegram', label: 'Telegram', icon: Send },
  { id: 'push', label: 'Push', icon: Smartphone },
];

export const NOTIFY_TYPES = [
  { id: 'briefing', enable: 'chief_enabled', icon: Compass, title: 'Morning briefing (Chief of Staff)',
    what: "Today's plan, what carried over, and which goals are slipping — with the fix.", time: 'chief_time', timeDefault: '07:30', when: 'Every day' },
  { id: 'digest', enable: 'digest_enabled', icon: ListChecks, title: 'Daily digest',
    what: "A plain list of today's tasks (and, if you like, what's overdue).", time: 'digest_time', timeDefault: '08:00', when: 'Every day', overdue: true },
  { id: 'task_time', enable: 'task_time_enabled', icon: Clock, title: 'Task-time reminders',
    what: 'A nudge when a task with a set time is due.', when: 'At each task’s time (within 20 min)' },
  { id: 'reminder', enable: null, icon: Bell, title: 'Your reminders',
    what: 'The one-off and repeating reminders you create.', when: 'When you set them', manage: '/reminders' },
  { id: 'coach_checkin', enable: 'coach_checkins_enabled', icon: CalendarCheck, title: 'Coach check-ins',
    what: 'Each coach plans your week (Mon), reviews it (Fri), or nudges you on other days you pick.', when: 'Per coach — set below' },
  { id: 'coach_followup', enable: 'coach_followups_enabled', icon: CheckCircle2, title: 'Coach end-of-day follow-ups',
    what: '“Did it happen?” for up to 3 important tasks due today, with Done / Tomorrow / Drop buttons.', when: 'Daily, per coach — set below' },
  { id: 'coach_alert', enable: 'coach_alerts_enabled', icon: AlertTriangle, title: 'Coach slip alerts',
    what: 'When tasks are 2+ days late, a goal falls off pace, or a deadline is a week away — only when something changes.', when: '09:00–21:00, at most once a day per coach' },
];

export default function NotifyMatrix({ prefs, setPref, available, coachCount }) {
  const routes = prefs.routes || {};
  const setRoute = (type, ch, on) => setPref({ routes: { ...routes, [type]: { ...(routes[type] || {}), [ch]: on } } });

  return (
    <div className="nm">
      {NOTIFY_TYPES.map(t => {
        const on = t.enable ? !!prefs[t.enable] : true;
        const r = routes[t.id] || {};
        const reaches = CHANNELS.filter(c => on && available[c.id] && r[c.id] !== false).map(c => c.label);
        const perCoach = t.id.startsWith('coach_') && coachCount > 1;
        return (
          <div key={t.id} className={`nm-row ${on ? '' : 'is-off'}`}>
            <div className="nm-head">
              <span className="settings-row-ico" aria-hidden="true"><t.icon size={17} /></span>
              <div className="nm-text">
                <div className="settings-remind-title">{t.title}</div>
                <div className="settings-remind-sub">{t.what}</div>
                <div className="nm-when">
                  <span>{t.when}</span>
                  {perCoach && on && <span className="nm-note">× {coachCount} coaches</span>}
                  {on && <span className={`nm-reach ${reaches.length ? '' : 'is-none'}`}>{reaches.length ? `→ ${reaches.join(', ')}` : '→ in the app only'}</span>}
                </div>
              </div>
              {t.enable ? (
                <label className="settings-switch">
                  <input type="checkbox" role="switch" aria-label={t.title} checked={on} onChange={e => setPref({ [t.enable]: e.target.checked })} />
                  <span />
                </label>
              ) : (
                <Link className="nm-manage" to={t.manage}>Manage</Link>
              )}
            </div>

            {on && (
              <div className="nm-detail">
                {t.time && (
                  <label className="settings-remind-field">
                    <span>Send at</span>
                    <input type="time" className="form-input settings-time" value={prefs[t.time] || t.timeDefault}
                      onChange={e => setPref({ [t.time]: e.target.value })} />
                  </label>
                )}
                {t.overdue && (
                  <label className="settings-remind-check">
                    <input type="checkbox" checked={!!prefs.overdue_enabled} onChange={e => setPref({ overdue_enabled: e.target.checked })} />
                    Include overdue tasks
                  </label>
                )}
                <div className="nm-channels" role="group" aria-label={`${t.title}: channels`}>
                  {CHANNELS.map(c => {
                    const chOn = r[c.id] !== false;
                    const avail = !!available[c.id];
                    return (
                      <button key={c.id} type="button" aria-pressed={chOn && avail} disabled={!avail}
                        className={`nm-ch ${chOn && avail ? 'on' : ''}`}
                        title={avail ? `${chOn ? 'Stop' : 'Start'} sending this by ${c.label}` : `${c.label} is off — turn it on under “Where we can reach you”`}
                        onClick={() => setRoute(t.id, c.id, !chOn)}>
                        <c.icon size={13} /> {c.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
