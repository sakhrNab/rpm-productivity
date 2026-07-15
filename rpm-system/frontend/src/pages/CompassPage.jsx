import { useState, useEffect, useContext } from 'react';
import { Compass, Sparkles, RefreshCw, CheckCircle2, Circle, Target, ArrowRight, X, Check, Wand2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { AppContext, AuthContext } from '../App';
import Markdown from '../components/Markdown';
import UsageBadge from '../components/UsageBadge';
import ForecastPanel from '../components/ForecastPanel';
import { useToast } from '../components/ToastProvider';
import { getCompassState, subscribeCompass, runCompassRequest, patchCompassAction } from '../utils/compassStore';
import './CompassPage.css';

// Daily Compass — a short morning ritual. Coach must-win + today's actions (act on
// them) + key results + AI suggestions you can approve. Request state lives in a
// module store so it survives navigating away and back mid-load.
function CompassPage() {
  const { api } = useContext(AuthContext);
  const { refreshData } = useContext(AppContext);
  const { showToast } = useToast();
  const [state, setState] = useState(getCompassState);
  const [suggest, setSuggest] = useState(null);
  const today = new Date();
  const todayStr = format(today, 'yyyy-MM-dd');

  // Reflect the shared store; the in-flight request keeps running across navigation.
  useEffect(() => subscribeCompass(setState), []);

  const run = () => runCompassRequest(api);

  const whenLabel = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    const diff = (today - d) / 1000;
    if (diff < 90) return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400 && d.getDate() === today.getDate()) return `${Math.floor(diff / 3600)}h ago`;
    return d.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
  };

  const isStale = state.status === 'ready' && state.dateStr && state.dateStr !== todayStr;
  const hasContent = state.status === 'ready' || state.status === 'loading' || state.status === 'error';
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

  // CRUD: complete/uncomplete an action straight from the compass.
  const toggleComplete = async (a) => {
    if (!a.id) return;
    const next = !a.is_completed;
    patchCompassAction(a.id, { is_completed: next });
    try {
      await api.updateAction(a.id, { is_completed: next });
      if (refreshData) refreshData();
    } catch {
      patchCompassAction(a.id, { is_completed: !next });
      showToast('Could not update that task.', 'error');
    }
  };

  // AI suggestions (propose-only) — same engine as My Day, surfaced here as CTAs.
  const runSuggest = async () => {
    const modelKey = localStorage.getItem('ai.modelKey');
    if (!modelKey) { showToast('Pick a default AI model in Settings first.', 'info'); return; }
    setSuggest({ loading: true });
    try {
      const res = await api.aiSuggestPlan({ modelKey, start_date: todayStr, end_date: todayStr });
      if (res.error) throw new Error(res.error);
      setSuggest({ text: res.text, proposals: (res.proposals || []).map(p => ({ ...p })), usage: res.usage });
    } catch (e) {
      const msg = e.message || 'Failed to get suggestions';
      if (/no longer available|unknown model/i.test(msg)) localStorage.removeItem('ai.modelKey');
      setSuggest({ error: msg });
    }
  };
  const applySuggestion = async (idx, p) => {
    setSuggest(s => ({ ...s, proposals: s.proposals.map((x, i) => (i === idx ? { ...x, status: 'applying' } : x)) }));
    try {
      const res = await api.aiApplyProposal({ kind: p.kind, payload: p.payload });
      if (!res || res.error || res.ok === false) throw new Error(res?.error || 'Failed to apply');
      setSuggest(s => ({ ...s, proposals: s.proposals.map((x, i) => (i === idx ? { ...x, status: 'applied' } : x)) }));
      showToast('Applied', 'success');
      run(); if (refreshData) refreshData();
    } catch (e) {
      setSuggest(s => ({ ...s, proposals: s.proposals.map((x, i) => (i === idx ? { ...x, status: undefined } : x)) }));
      showToast(e.message || 'Failed to apply', 'error');
    }
  };
  const dismissSuggestion = (idx) => setSuggest(s => ({ ...s, proposals: s.proposals.map((x, i) => (i === idx ? { ...x, status: 'dismissed' } : x)) }));

  return (
    <div className="compass-page">
      <header className="compass-head">
        <div className="compass-head-icon"><Compass size={26} /></div>
        <div>
          <h1 className="compass-title">{greeting}. Here's your compass.</h1>
          <p className="compass-date">{format(today, 'EEEE, MMMM d')}</p>
        </div>
        {hasContent && (
          <div className="compass-head-right">
            {state.status === 'ready' && state.usage && <UsageBadge usage={state.usage} />}
            {state.status === 'ready' && state.generatedAt && (
              <span className="compass-generated">Updated {whenLabel(state.generatedAt)}</span>
            )}
            <button type="button" className="btn btn-secondary compass-refresh" onClick={run} disabled={state.status === 'loading'}>
              <RefreshCw size={15} className={state.status === 'loading' ? 'spin' : ''} />
              {state.status === 'loading' ? 'Reading…' : 'Refresh'}
            </button>
          </div>
        )}
      </header>

      <div className="compass-grid">
        {/* Must-win / coach guidance */}
        <section className="compass-card compass-guidance">
          <div className="compass-card-head"><Sparkles size={16} /> Today's must-win</div>

          {(state.status === 'idle' || state.status === 'init') && (
            <div className="compass-invite">
              <Compass size={30} />
              <p>Get a focused read on today — your must-win, drawn from your goals and where your key results stand.</p>
              <button type="button" className="btn btn-primary compass-cta-big" onClick={run}>
                <Sparkles size={16} /> Read my compass
              </button>
              <span className="compass-invite-note">Runs only when you ask — your last read is kept here.</span>
            </div>
          )}

          {isStale && (
            <p className="compass-stale">Showing your read from {state.dateStr}. <button type="button" className="compass-stale-btn" onClick={run}>Refresh for today</button></p>
          )}

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
            state.text ? <Markdown>{state.text}</Markdown> : <p className="compass-muted">No guidance came back — try refreshing.</p>
          )}

          {state.status === 'ready' && state.sources?.length > 0 && (
            <div className="compass-sources">
              <span>Sources</span>
              {state.sources.slice(0, 5).map((s, i) => (
                <a key={i} href={s.url} target="_blank" rel="noopener noreferrer">{s.title || s.url}</a>
              ))}
            </div>
          )}

          {state.status === 'ready' && state.text && (
            <div className="compass-act">
              <Link to="/my-day" className="btn btn-primary compass-cta">Go to My Day <ArrowRight size={15} /></Link>
              <button type="button" className="btn btn-secondary" onClick={runSuggest} disabled={suggest?.loading}>
                <Wand2 size={15} /> {suggest?.loading ? 'Thinking…' : 'Suggest improvements'}
              </button>
            </div>
          )}

          {/* AI suggestions panel (proposals with Approve / Dismiss) */}
          {suggest && (
            <div className="compass-suggest">
              <div className="compass-suggest-head">
                <span><Wand2 size={14} /> Suggestions</span>
                <span className="compass-suggest-right">
                  {suggest.usage && <UsageBadge usage={suggest.usage} />}
                  <button type="button" className="compass-suggest-close" onClick={() => setSuggest(null)} aria-label="Close"><X size={14} /></button>
                </span>
              </div>
              {suggest.loading && <p className="compass-muted small">Reviewing today's tasks and priorities…</p>}
              {suggest.error && <p className="compass-error">{suggest.error}</p>}
              {suggest.text && <Markdown>{suggest.text}</Markdown>}
              {Array.isArray(suggest.proposals) && suggest.proposals.length > 0 && (
                <div className="asst-proposals">
                  <div className="asst-proposals-head">Suggested changes — approve what you want</div>
                  {suggest.proposals.map((p, idx) => (
                    <div key={idx} className={`asst-proposal ${p.status || ''}`}>
                      <span className="asst-proposal-label">{p.label || p.kind}</span>
                      {!p.status && (
                        <span className="asst-proposal-actions">
                          <button className="asst-prop-approve" onClick={() => applySuggestion(idx, p)}><Check size={13} /> Approve</button>
                          <button className="asst-prop-dismiss" onClick={() => dismissSuggestion(idx)}><X size={13} /> Dismiss</button>
                        </span>
                      )}
                      {p.status === 'applying' && <span className="asst-proposal-state">Applying…</span>}
                      {p.status === 'applied' && <span className="asst-proposal-state done"><Check size={13} /> Applied</span>}
                      {p.status === 'dismissed' && <span className="asst-proposal-state muted">Dismissed</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </section>

        {/* Today at a glance — actionable */}
        <aside className="compass-side">
          <section className="compass-card">
            <div className="compass-card-head">
              Today's actions
              {actions.length > 0 && <span className="compass-count">{doneCount}/{actions.length}</span>}
            </div>
            {!ctx ? (
              <p className="compass-muted small">Read your compass to see today at a glance.</p>
            ) : actions.length === 0 ? (
              <p className="compass-muted small">Nothing scheduled today.</p>
            ) : (
              <ul className="compass-list">
                {actions.map((a, i) => (
                  <li key={a.id || i} className={a.is_completed ? 'done' : ''}>
                    <button
                      type="button"
                      className="compass-check"
                      onClick={() => toggleComplete(a)}
                      disabled={!a.id}
                      aria-label={a.is_completed ? 'Mark not done' : 'Mark done'}
                      title={a.id ? (a.is_completed ? 'Mark not done' : 'Mark done') : ''}
                    >
                      {a.is_completed ? <CheckCircle2 size={16} /> : <Circle size={16} />}
                    </button>
                    <span>{a.title}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="compass-card">
            <div className="compass-card-head"><Target size={15} /> Key results</div>
            {!ctx ? (
              <p className="compass-muted small">—</p>
            ) : krs.length === 0 ? (
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

      <ForecastPanel />
    </div>
  );
}

export default CompassPage;
