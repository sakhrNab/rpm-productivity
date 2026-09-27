import { useCallback, useContext, useEffect, useState } from 'react';
import { Lock, Reply, Sparkles, Wand2, ChevronRight, CalendarDays, Clock } from 'lucide-react';
import { AuthContext } from '../App';
import { CoachAvatar } from './CoachPanel';
import { localToday, previewText, relTime } from '../utils/coach';
import './CoachStrip.css';

// Which coach speaks for this page? Project pages: the project's coach, else its
// category's coach (fallback). Category pages: the category coach (+ readiness if none).
export function useAreaCoach({ scope, projectId, categoryId }) {
  const { api } = useContext(AuthContext);
  const [state, setState] = useState({ loading: true, coach: null, fallback: false, readiness: null });
  const load = useCallback(async () => {
    if (scope === 'project' ? !projectId : !categoryId) return;
    let list = [];
    try { const r = await api.getCoaches(); list = Array.isArray(r) ? r : []; } catch { /* none */ }
    const own = scope === 'project'
      ? list.find(c => c.scope === 'project' && c.project_id === projectId)
      : list.find(c => c.scope === 'category' && c.category_id === categoryId);
    const cat = !own && scope === 'project' && categoryId ? list.find(c => c.scope === 'category' && c.category_id === categoryId) : null;
    let readiness = null;
    if (!own && scope === 'category') { try { readiness = await api.getCategoryCoach(categoryId); } catch { /* ignore */ } }
    setState({ loading: false, coach: own || cat || null, fallback: !own && !!cat, readiness });
  }, [api, scope, projectId, categoryId]);
  useEffect(() => { load(); }, [load]);
  return { ...state, reload: load };
}

// Slim coach line in a page hero: latest message, today's one thing, Reply / Brief me.
// No coach → a one-line invite (or what's missing, for a locked category).
export default function CoachStrip({ area, scope, refreshKey, onReply, onBrief, onSetup, onOpen }) {
  const { api } = useContext(AuthContext);
  const [latest, setLatest] = useState(null);
  const [unread, setUnread] = useState(0);
  const [focus, setFocus] = useState(null);
  const coach = area.coach;

  useEffect(() => {
    if (!coach?.id) { setLatest(null); setUnread(0); setFocus(null); return undefined; }
    let live = true;
    api.getCoachMessages(coach.id, 20).then(r => {
      if (!live || !r) return;
      const msgs = Array.isArray(r.messages) ? r.messages : [];
      setLatest([...msgs].reverse().find(m => m.role === 'assistant' && m.content) || null);
      setUnread(r.unread || 0);
    }).catch(() => {});
    api.getCoachSnapshot(coach.id, localToday()).then(s => {
      if (!live || !s || s.error) return;
      const title = (x) => (typeof x === 'string' ? x : x?.title || '');
      if (s.today?.[0]) setFocus({ title: title(s.today[0]), late: 0 });
      else if (s.overdue?.[0]) setFocus({ title: title(s.overdue[0]), late: s.overdue[0].days_late || 0 });
      else setFocus(null);
    }).catch(() => {});
    return () => { live = false; };
  }, [api, coach?.id, refreshKey]);

  if (area.loading) return null;
  const noun = scope === 'project' ? 'project' : 'area';

  if (!coach) {
    const r = area.readiness;
    const locked = scope === 'category' && r && !r.ready;
    return (
      <div className={`cstrip cstrip--empty${locked ? ' is-locked' : ''}`}>
        {locked ? (
          <button type="button" className="cstrip-invite" onClick={onSetup}>
            <span className="cstrip-invite-icon"><Lock size={14} /></span>
            <span className="cstrip-invite-text">
              <b>Coach locked</b>
              <span>{r.missing?.length ? <>Needs {r.missing.join(' and ')}</> : 'Add a vision or purpose and a goal to unlock a coach'}</span>
            </span>
            <ChevronRight size={15} className="cstrip-chev" />
          </button>
        ) : (
          <button type="button" className="cstrip-invite" onClick={onSetup}>
            <span className="cstrip-invite-icon"><Wand2 size={14} /></span>
            <span className="cstrip-invite-text">
              <b>Set up a coach for this {noun}</b>
              <span>Checks in weekly, follows up on what slipped, changes things only with your OK</span>
            </span>
            <ChevronRight size={15} className="cstrip-chev" />
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="cstrip" style={coach.color ? { '--coach': coach.color } : undefined}>
      <button type="button" className="cstrip-main" onClick={onOpen} title={`Open ${coach.name}`}>
        <span className="cstrip-avatar">
          <CoachAvatar c={coach} size={38} />
          {unread > 0 && <span className="cstrip-dot" aria-label={`${unread} unread`} />}
        </span>
        <span className="cstrip-body">
          <span className="cstrip-top">
            <b className="cstrip-name">{coach.name}</b>
            {area.fallback && <span className="cstrip-tag">area coach</span>}
            {latest && <time className="cstrip-time">{relTime(latest.created_at)}</time>}
          </span>
          <span className={`cstrip-preview${unread > 0 ? ' is-unread' : ''}`}>
            {latest ? previewText(latest.content) : `Ask ${coach.name} what to focus on in this ${noun}.`}
          </span>
          {focus && (
            <span className={`cstrip-today${focus.late ? ' is-late' : ''}`}>
              {focus.late ? <Clock size={12} /> : <CalendarDays size={12} />}
              <em>Today:</em> <span>{focus.title}</span>{focus.late > 0 && <small>{focus.late}d late</small>}
            </span>
          )}
        </span>
      </button>
      <span className="cstrip-actions">
        {area.fallback && onSetup && (
          <button type="button" className="cstrip-btn cstrip-btn--quiet" onClick={onSetup} title={`Give this ${noun} its own coach`}><Wand2 size={14} /> Own coach</button>
        )}
        <button type="button" className="cstrip-btn" onClick={onReply}><Reply size={14} /> Reply</button>
        <button type="button" className="cstrip-btn cstrip-btn--ai" onClick={onBrief}><Sparkles size={14} /> Brief me</button>
      </span>
    </div>
  );
}
