import { useState, useEffect, useContext } from 'react';
import { Link } from 'react-router-dom';
import { Bot, Brain, X, ArrowRight, MessageSquare } from 'lucide-react';
import { AuthContext } from '../App';
import CoachPanel from '../components/CoachPanel';
import './CoachesPage.css';

function Avatar({ c, size = 46 }) {
  const style = { width: size, height: size, fontSize: Math.round(size * 0.5) };
  if (c.avatar_image) return <img src={c.avatar_image} className="cchp-avatar" style={style} alt="" />;
  const color = c.color || '#4ECDC4';
  return <span className="cchp-avatar" style={{ ...style, background: color + '22', border: `1px solid ${color}66` }}>{c.avatar_emoji || '🧭'}</span>;
}

// One place to see every coach — solves "they're hidden inside categories".
export default function CoachesPage() {
  const { api } = useContext(AuthContext);
  const [coaches, setCoaches] = useState(null);
  const [open, setOpen] = useState(null); // coachId being chatted with

  const load = () => api.getCoaches().then(c => setCoaches(Array.isArray(c) ? c : [])).catch(() => setCoaches([]));
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="cchp-page">
      <header className="cchp-head">
        <div className="cchp-head-icon"><Bot size={24} /></div>
        <div>
          <h1 className="cchp-title">Your Coaches</h1>
          <p className="cchp-sub">A specialist for each area of your life — each one knows only its area and learns you over time.</p>
        </div>
      </header>

      {coaches === null ? (
        <p className="cchp-muted">Loading…</p>
      ) : coaches.length === 0 ? (
        <div className="cchp-empty">
          <Bot size={30} />
          <p>No coaches yet. Open a <Link to="/categories">category</Link> that has a vision (or purpose) and a goal, and set up its coach from there.</p>
        </div>
      ) : (
        <div className="cchp-grid">
          {coaches.map(c => (
            <button key={c.id} type="button" className="cchp-card" style={{ borderColor: (c.color || '#4ECDC4') + '55' }} onClick={() => setOpen(c.id)}>
              <Avatar c={c} />
              <div className="cchp-card-body">
                <div className="cchp-card-name">{c.name}</div>
                <div className="cchp-card-area">{c.category_name || c.project_name || (c.scope === 'project' ? 'Project' : 'Category')}</div>
                {c.responsibilities && <div className="cchp-card-resp">{c.responsibilities}</div>}
                <div className="cchp-card-meta">
                  {c.memory_count > 0 && <span><Brain size={12} /> {c.memory_count} remembered</span>}
                  <span className="cchp-card-open"><MessageSquare size={12} /> Chat <ArrowRight size={12} /></span>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {open && (
        <div className="cchp-overlay" onMouseDown={() => { setOpen(null); load(); }}>
          <div className="cchp-modal" onMouseDown={e => e.stopPropagation()}>
            <button className="cchp-close" onClick={() => { setOpen(null); load(); }} aria-label="Close"><X size={18} /></button>
            <CoachPanel coachId={open} />
          </div>
        </div>
      )}
    </div>
  );
}
