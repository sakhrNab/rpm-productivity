import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ChevronDown, ChevronLeft, FileUp, Sparkles, LayoutGrid } from 'lucide-react';
import { AuthContext } from '../App';
import CoachPanel from '../components/CoachPanel';
import useJarvis from '../components/coachhub/useJarvis';
import JarvisChat from '../components/coachhub/JarvisChat';
import HubSidebar from '../components/coachhub/HubSidebar';
import CoachesOverview from '../components/coachhub/CoachesOverview';
import useViewportLock from '../utils/useViewportLock';
import '../components/coachhub/aiShared.css';
import '../components/coachhub/CoachHub.css';

const PHONE_Q = '(max-width: 860px)';
const isPhone = () => typeof window !== 'undefined' && window.matchMedia?.(PHONE_Q).matches;

// Coach — one hub for every AI you talk to: Jarvis (the general assistant, with its
// conversations) and your area/project coaches.
//   /coach              → Jarvis
//   /coach?c=<coachId>  → that coach's thread (CoachPanel, full height)
//   /coach?view=coaches → all coaches at a glance
//   /coach?tab=coaches  → the coaches group: first coach (phones: the list), or the overview if none
export default function CoachHubPage() {
  const { api } = useContext(AuthContext);
  const [params, setParams] = useSearchParams();
  const coachId = params.get('c');
  const tab = params.get('tab');
  const view = params.get('view');
  const mode = coachId ? 'coach' : view === 'coaches' ? 'overview' : 'jarvis';

  useViewportLock(true);
  const j = useJarvis();
  const [coaches, setCoaches] = useState(null);
  const [unread, setUnread] = useState({});
  const [listOpen, setListOpen] = useState(false);        // phones: the "Chats" list screen
  const [dragging, setDragging] = useState(false);
  const dragDepth = useRef(0);
  const coachesRef = useRef(null);
  const coachIdRef = useRef(coachId); coachIdRef.current = coachId;

  const loadCoaches = useCallback(async () => {
    let list = [];
    try { const r = await api.getCoaches(); list = Array.isArray(r) ? r : []; } catch { /* none */ }
    setCoaches(list);
    // Unread per coach (limit 1 keeps it light; reading the count never marks anything read).
    const counts = await Promise.all(list.map(c => api.getCoachMessages(c.id, 1)
      .then(r => [c.id, c.id === coachIdRef.current ? 0 : (r?.unread || 0)]).catch(() => [c.id, 0])));
    setUnread(Object.fromEntries(counts));
    return list;
  }, [api]);
  useEffect(() => { loadCoaches(); }, [loadCoaches]);

  // Opening a coach marks its thread read (CoachPanel does that) — clear the dot here too.
  useEffect(() => { if (coachId) setUnread(u => (u[coachId] ? { ...u, [coachId]: 0 } : u)); }, [coachId]);

  // ?tab=coaches → resolve to a concrete view once the coaches are known.
  useEffect(() => {
    if (tab !== 'coaches' || coaches === null) return;
    if (!coaches.length) { setParams({ view: 'coaches' }, { replace: true }); return; }
    if (isPhone()) {
      setParams({}, { replace: true });
      setListOpen(true);
      requestAnimationFrame(() => coachesRef.current?.scrollIntoView({ block: 'start' }));
    } else {
      setParams({ c: coaches[0].id }, { replace: true });
    }
  }, [tab, coaches]); // eslint-disable-line react-hooks/exhaustive-deps

  // A deep link to a coach that no longer exists → the overview.
  useEffect(() => {
    if (coachId && coaches && !coaches.some(c => c.id === coachId)) setParams({ view: 'coaches' }, { replace: true });
  }, [coachId, coaches]); // eslint-disable-line react-hooks/exhaustive-deps

  const showJarvis = () => { if (mode !== 'jarvis') setParams({}); setListOpen(false); };
  const onNewChat = () => { j.newChat(); showJarvis(); };
  const onOpenConversation = (id) => { j.openConversation(id); showJarvis(); };
  const onCoach = (id) => { if (id !== coachId) setParams({ c: id }); setListOpen(false); };
  const onOverview = () => { setParams({ view: 'coaches' }); setListOpen(false); };

  // Files: drop anywhere in the main area → Jarvis's "plan it / ask about it" card.
  const hasFiles = (e) => Array.from(e.dataTransfer?.types || []).includes('Files');
  const dropProps = {
    onDragEnter: (e) => { if (!hasFiles(e)) return; e.preventDefault(); dragDepth.current += 1; setDragging(true); },
    onDragOver: (e) => { if (hasFiles(e)) e.preventDefault(); },
    onDragLeave: (e) => { if (!hasFiles(e)) return; dragDepth.current = Math.max(0, dragDepth.current - 1); if (!dragDepth.current) setDragging(false); },
    onDrop: (e) => {
      if (!hasFiles(e)) return;
      e.preventDefault(); dragDepth.current = 0; setDragging(false);
      j.chooseFile(e.dataTransfer.files?.[0]).then(ok => { if (ok) showJarvis(); });
    },
  };

  const convTitle = j.conversations.find(c => c.id === j.conversationId)?.title;
  const totalUnread = Object.values(unread).reduce((s, n) => s + n, 0);

  return (
    <div className={`asst chub ${listOpen ? 'list-open' : ''}`}>
      <HubSidebar
        mode={mode}
        j={j}
        coaches={coaches}
        unread={unread}
        activeCoachId={coachId}
        coachesRef={coachesRef}
        onJarvis={showJarvis}
        onNewChat={onNewChat}
        onOpenConversation={onOpenConversation}
        onCoach={onCoach}
        onOverview={onOverview}
        onCloseList={() => setListOpen(false)}
      />

      <section className={`asst-main chub-main chub-main--${mode} ${dragging ? 'is-dragging' : ''}`} {...dropProps}>
        {dragging && (
          <div className="asst-dropzone" aria-hidden="true">
            <FileUp size={30} />
            <b>Drop your file</b>
            <span>Then choose: turn it into a plan, or ask Jarvis about it</span>
          </div>
        )}

        {/* phones: which chat am I in + the way back to the list */}
        {mode === 'coach' ? (
          // The coach's own header already names it — here just the way back.
          <button type="button" className="chub-switch chub-switch--back" onClick={() => setListOpen(true)}>
            <ChevronLeft size={16} /> <span className="chub-switch-back-label">All chats</span>
            {totalUnread > 0 && <span className="chub-unread" title={`${totalUnread} unread`}>{totalUnread > 9 ? '9+' : totalUnread}</span>}
          </button>
        ) : (
          <button type="button" className="chub-switch" onClick={() => setListOpen(true)} aria-label="Switch chat">
            <span className="chub-jarvis-badge chub-jarvis-badge--sm">{mode === 'overview' ? <LayoutGrid size={14} /> : <Sparkles size={14} />}</span>
            <span className="chub-item-text">
              <b>{mode === 'overview' ? 'Your coaches' : 'Jarvis'}</b>
              <i>{mode === 'overview' ? 'All coaches' : (convTitle || 'New chat')}</i>
            </span>
            {totalUnread > 0 && <span className="chub-unread" title={`${totalUnread} unread`}>{totalUnread > 9 ? '9+' : totalUnread}</span>}
            <span className="chub-switch-all">All chats <ChevronDown size={14} /></span>
          </button>
        )}

        {mode === 'jarvis' && <JarvisChat j={j} />}
        {mode === 'coach' && (
          <div className="chub-coachview">
            <CoachPanel key={coachId} coachId={coachId} variant="drawer" onCoachChange={loadCoaches} />
          </div>
        )}
        {mode === 'overview' && <CoachesOverview coaches={coaches} unread={unread} onOpen={onCoach} />}
      </section>
    </div>
  );
}
