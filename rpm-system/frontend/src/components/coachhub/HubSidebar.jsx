import { Link } from 'react-router-dom';
import { Plus, MessageSquare, Trash2, Settings as SettingsIcon, Sparkles, Bot, LayoutGrid, X } from 'lucide-react';
import { CoachAvatar } from '../CoachPanel';

export const coachArea = (c) => c.category_name || c.project_name || (c.scope === 'project' ? 'Project' : 'Area');

// The hub's left rail (a full "Chats" screen on phones): Jarvis + its conversations,
// then every coach with its unread count.
export default function HubSidebar({
  mode, j, coaches, unread, activeCoachId,
  onJarvis, onNewChat, onOpenConversation, onCoach, onOverview, onCloseList, coachesRef,
}) {
  const { conversations, conversationId, deleteConversation } = j;
  const jarvisOn = mode === 'jarvis';

  return (
    <aside className="asst-sidebar chub-side" aria-label="Chats">
      <div className="chub-side-phonehead">
        <span className="ui-kicker"><MessageSquare size={13} /> Chats</span>
        <button type="button" className="chub-iconbtn" onClick={onCloseList} aria-label="Back to the chat"><X size={16} /></button>
      </div>

      {/* ---------- Jarvis ---------- */}
      <div className="chub-group chub-group--jarvis">
        <button type="button" className={`chub-jarvis ${jarvisOn ? 'active' : ''}`} onClick={onJarvis} aria-current={jarvisOn && !conversationId ? 'page' : undefined}>
          <span className="chub-jarvis-badge" aria-hidden="true"><Sparkles size={16} /></span>
          <span className="chub-item-text">
            <b>Jarvis</b>
            <i>Your general assistant</i>
          </span>
        </button>
        <button className="btn btn-primary asst-newchat" onClick={onNewChat}><Plus size={16} /> New chat</button>
        <p className="ui-kicker asst-side-kicker"><MessageSquare size={13} /> Conversations{conversations.length > 0 && <span className="ui-count">{conversations.length}</span>}</p>
        <div className="asst-conv-list">
          {conversations.length === 0 && <div className="asst-conv-empty">No conversations yet.</div>}
          {conversations.map(c => (
            <div
              key={c.id}
              role="button"
              tabIndex={0}
              className={`asst-conv ${jarvisOn && c.id === conversationId ? 'active' : ''}`}
              onClick={() => onOpenConversation(c.id)}
              onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onOpenConversation(c.id); } }}
            >
              <MessageSquare size={14} />
              <span className="asst-conv-title">{c.title || 'Untitled'}</span>
              <button className="asst-conv-del" onClick={(e) => deleteConversation(e, c.id)} aria-label="Delete" title="Delete conversation"><Trash2 size={14} /></button>
            </div>
          ))}
        </div>
      </div>

      {/* ---------- coaches ---------- */}
      <div className="chub-group chub-group--coaches" ref={coachesRef}>
        <div className="chub-group-head">
          <p className="ui-kicker asst-side-kicker"><Bot size={13} /> Your coaches{coaches?.length > 0 && <span className="ui-count">{coaches.length}</span>}</p>
          <button type="button" className={`chub-iconbtn ${mode === 'overview' ? 'on' : ''}`} onClick={onOverview} title="All coaches" aria-label="All coaches"><LayoutGrid size={15} /></button>
        </div>
        <div className="chub-coach-list">
          {coaches === null && <div className="asst-conv-empty">Loading…</div>}
          {coaches?.length === 0 && (
            <button type="button" className="chub-coach-empty" onClick={onOverview}>No coaches yet — how to add one</button>
          )}
          {coaches?.map(c => {
            const n = unread[c.id] || 0;
            const on = mode === 'coach' && activeCoachId === c.id;
            return (
              <button
                key={c.id}
                type="button"
                className={`chub-coach ${on ? 'active' : ''}`}
                style={{ '--coach': c.color || '#4ECDC4' }}
                onClick={() => onCoach(c.id)}
                aria-current={on ? 'page' : undefined}
                aria-label={`${c.name}, ${coachArea(c)}${n ? `, ${n} unread` : ''}`}
              >
                <CoachAvatar c={c} size={34} />
                <span className="chub-item-text">
                  <b>{c.name}</b>
                  <i>{coachArea(c)}</i>
                </span>
                {n > 0 && <span className="chub-unread" aria-hidden="true">{n > 9 ? '9+' : n}</span>}
              </button>
            );
          })}
        </div>
      </div>

      <Link to="/settings" className="asst-settings-link" title="API keys & settings"><SettingsIcon size={15} /> <span>API keys &amp; settings</span></Link>
    </aside>
  );
}
