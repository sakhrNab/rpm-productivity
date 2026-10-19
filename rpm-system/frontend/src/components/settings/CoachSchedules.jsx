import { useContext, useEffect, useState } from 'react';
import { AuthContext } from '../../App';
import { useToast } from '../ToastProvider';

// Settings → Notifications → "Your coaches": each coach's own rhythm (coaches.proactive / checkin_days /
// checkin_time / followup_time, validated by coachLoop.cleanSchedule). Saved per coach as you change it.
const DAYS = [{ n: 1, l: 'Mon' }, { n: 2, l: 'Tue' }, { n: 3, l: 'Wed' }, { n: 4, l: 'Thu' }, { n: 5, l: 'Fri' }, { n: 6, l: 'Sat' }, { n: 0, l: 'Sun' }];
const parseDays = (s) => String(s ?? '1,5').split(',').map(Number).filter(n => Number.isInteger(n) && n >= 0 && n <= 6);
const kindOf = (n) => (n === 1 ? 'plans the week' : n === 5 ? 'reviews the week' : 'nudges');

export default function CoachSchedules({ onCount }) {
  const { api } = useContext(AuthContext);
  const { showToast } = useToast();
  const [coaches, setCoaches] = useState(null);
  const [busy, setBusy] = useState(null);

  useEffect(() => {
    api.getCoaches().then(list => {
      const active = (Array.isArray(list) ? list : []).filter(c => c.is_active !== false);
      setCoaches(active); onCount?.(active.length);
    }).catch(() => setCoaches([]));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async (c, patch) => {
    setBusy(c.id);
    setCoaches(list => list.map(x => (x.id === c.id ? { ...x, ...patch } : x)));
    try {
      const out = await api.updateCoach(c.id, patch);
      if (out?.error) throw new Error(out.error);
      setCoaches(list => list.map(x => (x.id === c.id ? { ...x, ...out } : x)));
    } catch (e) {
      setCoaches(list => list.map(x => (x.id === c.id ? c : x)));
      showToast(e.message || 'Could not save the coach schedule', 'error');
    } finally { setBusy(null); }
  };

  if (coaches === null) return <div className="settings-remind-sub">Loading coaches…</div>;
  if (!coaches.length) return <div className="settings-remind-sub">No coaches yet — add one from an area’s page.</div>;

  return (
    <div className="cs">
      {coaches.map(c => {
        const days = parseDays(c.checkin_days);
        const on = c.proactive !== false;
        const toggleDay = (n) => save(c, { checkin_days: (days.includes(n) ? days.filter(d => d !== n) : [...days, n]).join(',') });
        return (
          <div key={c.id} className={`cs-row ${on ? '' : 'is-off'}`}>
            <div className="cs-head">
              <span className="cs-emoji" aria-hidden="true">{c.avatar_emoji || '🧭'}</span>
              <div className="cs-name">
                <b>{c.name}</b>
                <span className="settings-remind-sub">{on ? 'Messages you on its own' : 'Only answers when you open it'}</span>
              </div>
              <label className="settings-switch">
                <input type="checkbox" role="switch" aria-label={`${c.name} messages you on its own`} checked={on} disabled={busy === c.id}
                  onChange={e => save(c, { proactive: e.target.checked })} />
                <span />
              </label>
            </div>
            {on && (
              <div className="cs-detail">
                <div className="cs-field">
                  <span>Check-in days</span>
                  <div className="cs-days" role="group" aria-label={`${c.name} check-in days`}>
                    {DAYS.map(d => (
                      <button key={d.n} type="button" className={`cs-day ${days.includes(d.n) ? 'on' : ''}`} aria-pressed={days.includes(d.n)}
                        title={days.includes(d.n) ? `${d.l}: ${kindOf(d.n)}` : `Add ${d.l}`} disabled={busy === c.id} onClick={() => toggleDay(d.n)}>
                        {d.l}
                      </button>
                    ))}
                  </div>
                </div>
                <label className="cs-field">
                  <span>Check-in at</span>
                  <input type="time" className="form-input settings-time" value={c.checkin_time || '08:30'} disabled={busy === c.id}
                    onChange={e => e.target.value && save(c, { checkin_time: e.target.value })} />
                </label>
                <label className="cs-field">
                  <span>Follow-up at</span>
                  <input type="time" className="form-input settings-time" value={c.followup_time || '18:00'} disabled={busy === c.id}
                    onChange={e => e.target.value && save(c, { followup_time: e.target.value })} />
                </label>
                <p className="cs-sum">
                  {days.length ? `${days.sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)).map(n => DAYS.find(d => d.n === n).l).join(', ')} at ${c.checkin_time || '08:30'}` : 'No check-in days'}
                  {' · follow-up daily at '}{c.followup_time || '18:00'}{' · slip alerts when something changes'}
                </p>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
