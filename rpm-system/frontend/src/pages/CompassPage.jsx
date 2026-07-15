import { useState, useEffect, useContext } from 'react';
import { Compass, Sparkles, RefreshCw, CheckCircle2, Circle, Target, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { AppContext, AuthContext } from '../App';
import Markdown from '../components/Markdown';
import { useToast } from '../components/ToastProvider';
import './CompassPage.css';

// Daily Compass — a short morning ritual. Asks the RPM coach for today's
// must-win and shows today's actions + active key results at a glance.
function CompassPage() {
  const { api } = useContext(AuthContext);
  const { showToast } = useToast();
  const [state, setState] = useState({ status: 'idle' }); // idle | loading | ready | error | no-model
  const today = new Date();

  const run = async () => {
    const modelKey = localStorage.getItem('ai.modelKey');
    if (!modelKey) { setState({ status: 'no-model' }); return; }
    setState({ status: 'loading' });
    try {
      const res = await api.aiCoachCompass({ modelKey });
      if (res.error) throw new Error(res.error);
      setState({ status: 'ready', text: res.text, context: res.context, sources: res.sources || [] });
    } catch (e) {
      const msg = e.message || 'Failed to read your compass';
      if (/no longer available|unknown model/i.test(msg)) { localStorage.removeItem('ai.modelKey'); setState({ status: 'no-model' }); return; }
      setState({ status: 'error', error: msg });
      showToast(msg, 'error');
    }
  };

  // Auto-run once on mount if a default model is configured.
  useEffect(() => { run(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const ctx = state.context;
  const actions = ctx?.actions || [];
  const krs = ctx?.keyResults || [];
  const doneCount = actions.filter(a => a.is_completed).length;

  const greeting = (() => {
    const h = today.getHours();
    if (h < 12) return 'Good morning';
    if (h < 18) return 'Good afternoon';
    return 'Good evening';
  })();

  return (
    <div className="compass-page">
      <header className="compass-head">
        <div className="compass-head-icon"><Compass size={26} /></div>
        <div>
          <h1 className="compass-title">{greeting}. Here's your compass.</h1>
          <p className="compass-date">{format(today, 'EEEE, MMMM d')}</p>
        </div>
        <button
          type="button"
          className="btn btn-secondary compass-refresh"
          onClick={run}
          disabled={state.status === 'loading'}
        >
          <RefreshCw size={15} className={state.status === 'loading' ? 'spin' : ''} />
          {state.status === 'loading' ? 'Reading…' : 'Refresh'}
        </button>
      </header>

      <div className="compass-grid">
        {/* Must-win / coach guidance */}
        <section className="compass-card compass-guidance">
          <div className="compass-card-head"><Sparkles size={16} /> Today's must-win</div>

          {state.status === 'loading' && (
            <div className="compass-loading">
              <div className="compass-shimmer" />
              <div className="compass-shimmer short" />
              <div className="compass-shimmer" />
              <p className="compass-muted">Reading today's plan against your key results…</p>
            </div>
          )}

          {state.status === 'no-model' && (
            <div className="compass-empty">
              <p>Pick a default AI model to get your daily guidance.</p>
              <Link to="/settings" className="btn btn-primary compass-cta">Open Settings <ArrowRight size={15} /></Link>
            </div>
          )}

          {state.status === 'error' && (
            <div className="compass-empty">
              <p className="compass-error">{state.error}</p>
              <button type="button" className="btn btn-secondary" onClick={run}>Try again</button>
            </div>
          )}

          {state.status === 'ready' && (
            state.text
              ? <Markdown>{state.text}</Markdown>
              : <p className="compass-muted">No guidance came back — try refreshing.</p>
          )}

          {state.status === 'ready' && state.sources?.length > 0 && (
            <div className="compass-sources">
              <span>Sources</span>
              {state.sources.slice(0, 5).map((s, i) => (
                <a key={i} href={s.url} target="_blank" rel="noopener noreferrer">{s.title || s.url}</a>
              ))}
            </div>
          )}
        </section>

        {/* Today at a glance */}
        <aside className="compass-side">
          <section className="compass-card">
            <div className="compass-card-head">
              Today's actions
              {actions.length > 0 && <span className="compass-count">{doneCount}/{actions.length}</span>}
            </div>
            {actions.length === 0 ? (
              <p className="compass-muted small">Nothing scheduled today.</p>
            ) : (
              <ul className="compass-list">
                {actions.map((a, i) => (
                  <li key={i} className={a.is_completed ? 'done' : ''}>
                    {a.is_completed ? <CheckCircle2 size={15} /> : <Circle size={15} />}
                    <span>{a.title}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="compass-card">
            <div className="compass-card-head"><Target size={15} /> Key results</div>
            {krs.length === 0 ? (
              <p className="compass-muted small">No active key results.</p>
            ) : (
              <ul className="compass-kr">
                {krs.map((k, i) => {
                  const cur = Number(k.current_value ?? 0);
                  const tgt = Number(k.target_value ?? 0);
                  const pct = tgt > 0 ? Math.min(100, Math.round((cur / tgt) * 100)) : 0;
                  return (
                    <li key={i}>
                      <div className="compass-kr-top">
                        <span className="compass-kr-title">{k.title}</span>
                        <span className="compass-kr-val">{cur}/{tgt || '?'} {k.unit || ''}</span>
                      </div>
                      <div className="compass-kr-bar"><span style={{ width: `${pct}%` }} /></div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}

export default CompassPage;
