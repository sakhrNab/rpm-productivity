import { Link } from 'react-router-dom';
import { Bot, Brain, ArrowRight, MessageSquare } from 'lucide-react';
import { CoachAvatar } from '../CoachPanel';
import { coachArea } from './HubSidebar';

// Every coach at a glance (what the old Coaches page showed) — the hub's main area for
// /coach?view=coaches, and what /coach?tab=coaches lands on when no coach exists yet.
export default function CoachesOverview({ coaches, unread, onOpen }) {
  return (
    <div className="chub-overview">
      <header className="chub-ov-head">
        <span className="ui-icon-badge"><Bot size={22} /></span>
        <div className="chub-ov-titles">
          <p className="ui-kicker">Coach · specialists</p>
          <h1 className="chub-ov-title ui-title-grad">Your coaches</h1>
          <p className="chub-ov-sub">A specialist for each area of your life — each one knows only its area, checks in on a schedule and learns you over time.</p>
        </div>
      </header>

      {coaches === null ? (
        <p className="asst-conv-empty">Loading…</p>
      ) : coaches.length === 0 ? (
        <div className="ui-empty chub-ov-empty">
          <Bot size={28} />
          <p>No coaches yet. Open an area of your life that has a vision (or purpose) and a goal, and set up its coach from there.</p>
          <Link to="/plan" className="btn btn-primary">Open your plan <ArrowRight size={15} /></Link>
        </div>
      ) : (
        <div className="chub-ov-grid">
          {coaches.map(c => {
            const n = unread[c.id] || 0;
            return (
              <button key={c.id} type="button" className="chub-ov-card" style={{ '--coach': c.color || '#4ECDC4' }} onClick={() => onOpen(c.id)}>
                <CoachAvatar c={c} size={46} />
                <span className="chub-ov-card-body">
                  <span className="chub-ov-card-name">{c.name}{n > 0 && <span className="chub-unread">{n > 9 ? '9+' : n}</span>}</span>
                  <span className="chub-ov-card-area">{coachArea(c)}</span>
                  {c.responsibilities && <span className="chub-ov-card-resp">{c.responsibilities}</span>}
                  <span className="chub-ov-card-meta">
                    {c.memory_count > 0 && <span><Brain size={12} /> {c.memory_count} remembered</span>}
                    <span className="chub-ov-card-open"><MessageSquare size={12} /> Chat <ArrowRight size={12} /></span>
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
