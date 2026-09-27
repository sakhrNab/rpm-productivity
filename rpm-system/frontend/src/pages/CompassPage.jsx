import { useState, useEffect, useContext } from 'react';
import {
  Compass, Sparkles, RefreshCw, CheckCircle2, Circle, Target, ArrowRight, X, Check, Wand2,
  AlertTriangle, Trophy, ListChecks, History, Globe, Clock,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { AppContext, AuthContext } from '../App';
import Markdown from '../components/Markdown';
import UsageBadge from '../components/UsageBadge';
import ForecastPanel from '../components/ForecastPanel';
import { useToast } from '../components/ToastProvider';
import { getCompassState, subscribeCompass, runCompassRequest, patchCompassAction } from '../utils/compassStore';
import './CompassPage.css';

// Health ring: share of key results on track (or already reached).
function HealthRing({ pct }) {
  const r = 30;
  const c = 2 * Math.PI * r;
  const known = pct != null;
  return (
    <div className="cmp-ring" role="img" aria-label={known ? `${pct}% of key results on track` : 'Forecast loading'}>
      <svg viewBox="0 0 72 72">
        <circle className="cmp-ring-bg" cx="36" cy="36" r={r} />
        <circle className="cmp-ring-fg" cx="36" cy="36" r={r} strokeDasharray={c} strokeDashoffset={known ? c * (1 - pct / 100) : c} />
      </svg>
      <span className="cmp-ring-val"><b>{known ? `${pct}%` : '—'}</b><i>on track</i></span>
    </div>
  );
}

// Daily Compass — a short morning ritual. Coach must-win + today's actions (act on
// them) + key results + AI suggestions you can approve. Request state lives in a
// module store so it survives navigating away and back mid-load.
function CompassPage() {
  const { api } = useContext(AuthContext);
  const { refreshData } = useContext(AppContext);
  const { showToast } = useToast();
  const [state, setState] = useState(getCompassState);
  const [suggest, setSuggest] = useState(null);
  const [forecast, setForecast] = useState(undefined);   // shared up from ForecastPanel (no extra request)
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

  // Hero numbers — derived from data already on the page.
  const fcKrs = forecast?.keyResults || [];
  const sum = forecast?.summary || {};
  const onTrack = sum.on_track || 0;
  const reached = sum.done || 0;
  const needAttention = (sum.at_risk || 0) + (sum.off_track || 0) + (sum.stalled || 0) + (sum.overdue || 0);
  const healthPct = forecast === undefined ? null : fcKrs.length ? Math.round(((onTrack + reached) / fcKrs.length) * 100) : null;

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
      {/* ---------- hero ---------- */}
      <header className="cmp-hero ui-card">
        <div className="cmp-hero-main">
          <p className="ui-kicker"><Compass size={14} /> Compass <span className="cmp-kdot" /> {format(today, 'EEEE, MMMM d')}</p>
          <h1 className="cmp-title ui-title-grad">{greeting}. Here's your compass.</h1>
          <p className="compass-desc" title="Compass reads what's already in your plan against your goals and key results, and hands back today's one must-win. Reflect → focus: information flows OUT of your system. (Brain Dump is the opposite — it captures new thoughts INTO your plan.)">
            <span className="compass-desc-tag">Reflect → focus</span>
            <span>turns your plan into today's must-win.</span>
            <button type="button" className="compass-crosslink" onClick={() => window.dispatchEvent(new CustomEvent('rpm:open-braindump'))}>
              New thoughts? Brain-dump them <ArrowRight size={13} />
            </button>
          </p>
        </div>

        <div className="cmp-hero-board">
          <HealthRing pct={healthPct} />
          <div className="cmp-stats">
            <div className="ui-stat"><Target size={18} /><b>{forecast === undefined ? '—' : fcKrs.length}</b><span>key results</span></div>
            {onTrack > 0 && <div className="ui-stat cmp-stat-good"><CheckCircle2 size={18} /><b>{onTrack}</b><span>on track</span></div>}
            {needAttention > 0 && <div className="ui-stat cmp-stat-warn"><AlertTriangle size={18} /><b>{needAttention}</b><span>need attention</span></div>}
            {reached > 0 && <div className="ui-stat cmp-stat-good"><Trophy size={18} /><b>{reached}</b><span>reached</span></div>}
            {actions.length > 0 && <div className="ui-stat"><ListChecks size={18} /><b>{doneCount}/{actions.length}</b><span>done today</span></div>}
          </div>
        </div>

        {hasContent && (
          <div className="cmp-hero-status">
            {state.status === 'ready' && state.generatedAt && (
              <span className="compass-generated"><Clock size={12} /> Updated {whenLabel(state.generatedAt)}</span>
            )}
            {state.status === 'ready' && state.usage && <UsageBadge usage={state.usage} />}
            <button type="button" className="btn btn-secondary compass-refresh" onClick={run} disabled={state.status === 'loading'}>
              <RefreshCw size={15} className={state.status === 'loading' ? 'spin' : ''} />
              {state.status === 'loading' ? 'Reading…' : 'Refresh'}
            </button>
          </div>
        )}
      </header>

      <div className="compass-grid">
        {/* ---------- must-win / coach guidance ---------- */}
        <section className="ui-card compass-guidance">
          <h2 className="ui-kicker cmp-kicker-ai"><Sparkles size={14} /> Today's must-win</h2>

          {(state.status === 'idle' || state.status === 'init') && (
            <div className="compass-invite">
              <span className="compass-invite-orb" aria-hidden="true"><Compass size={30} /></span>
              <h3>Where should today's energy go?</h3>
              <p>Get a focused read on today — your must-win, drawn from your goals and where your key results stand.</p>
              <button type="button" className="btn btn-primary compass-cta-big" onClick={run}>
                <Sparkles size={16} /> Read my compass
              </button>
              <span className="compass-invite-note">Runs only when you ask — your last read is kept here.</span>
            </div>
          )}

          {isStale && (
            <p className="compass-stale"><History size={14} /> Showing your read from {state.dateStr}. <button type="button" className="compass-stale-btn" onClick={run}>Refresh for today</button></p>
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
            <div className="ui-empty compass-empty">
              <Sparkles size={24} />
              <span>Pick a default AI model to get your daily guidance.</span>
              <Link to="/settings" className="btn btn-primary compass-cta">Open Settings <ArrowRight size={15} /></Link>
            </div>
          )}

          {state.status === 'error' && (
            <div className="compass-error-box">
              <AlertTriangle size={18} />
              <p className="compass-error">{state.error}</p>
              <button type="button" className="btn btn-secondary" onClick={run}>Try again</button>
            </div>
          )}

          {state.status === 'ready' && (
            state.text ? <div className="compass-read"><Markdown>{state.text}</Markdown></div> : <p className="compass-muted">No guidance came back — try refreshing.</p>
          )}

          {state.status === 'ready' && state.sources?.length > 0 && (
            <div className="compass-sources">
              <span><Globe size={12} /> Sources</span>
              {state.sources.slice(0, 5).map((s, i) => (
                <a key={i} href={s.url} target="_blank" rel="noopener noreferrer">{s.title || s.url}</a>
              ))}
            </div>
          )}

          {state.status === 'ready' && state.text && (
            <div className="compass-act">
              <Link to="/my-day" className="btn btn-primary compass-cta">Go to My Day <ArrowRight size={15} /></Link>
              <button type="button" className="btn btn-secondary compass-cta" onClick={runSuggest} disabled={suggest?.loading}>
                <Wand2 size={15} /> {suggest?.loading ? 'Thinking…' : 'Suggest improvements'}
              </button>
            </div>
          )}

          {/* AI suggestions panel (proposals with Approve / Dismiss) */}
          {suggest && (
            <div className="compass-suggest">
              <div className="compass-suggest-head">
                <span className="ui-kicker cmp-kicker-ai"><Wand2 size={14} /> Suggestions</span>
                <span className="compass-suggest-right">
                  {suggest.usage && <UsageBadge usage={suggest.usage} />}
                  <button type="button" className="compass-suggest-close" onClick={() => setSuggest(null)} aria-label="Close"><X size={15} /></button>
                </span>
              </div>
              {suggest.loading && <p className="compass-muted small">Reviewing today's tasks and priorities…</p>}
              {suggest.error && <p className="compass-error">{suggest.error}</p>}
              {suggest.text && <Markdown>{suggest.text}</Markdown>}
              {Array.isArray(suggest.proposals) && suggest.proposals.length > 0 && (
                <div className="asst-proposals">
                  <div className="asst-proposals-head">
                    <Wand2 size={13} /> Suggested changes — approve what you want
                    <span className="asst-proposals-count">{suggest.proposals.filter(p => !p.status).length} pending</span>
                  </div>
                  {suggest.proposals.map((p, idx) => (
                    <div key={idx} className={`asst-proposal ${p.status || ''}`}>
                      <span className="asst-proposal-label">{p.label || p.kind}</span>
                      {!p.status && (
                        <span className="asst-proposal-actions">
                          <button className="asst-prop-approve" onClick={() => applySuggestion(idx, p)}><Check size={14} /> Approve</button>
                          <button className="asst-prop-dismiss" onClick={() => dismissSuggestion(idx)}><X size={14} /> Dismiss</button>
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

        {/* ---------- today at a glance (actionable) ---------- */}
        <aside className="compass-side">
          <section className="ui-card compass-card">
            <h2 className="ui-kicker">
              <ListChecks size={14} /> Today's actions
              {actions.length > 0 && <span className="ui-count">{doneCount}/{actions.length}</span>}
            </h2>
            {actions.length > 0 && (
              <div className="ui-meter compass-today-meter"><i style={{ '--pct': `${Math.round((doneCount / actions.length) * 100)}%` }} /></div>
            )}
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
                      {a.is_completed ? <CheckCircle2 size={18} /> : <Circle size={18} />}
                    </button>
                    <span className="compass-list-title">{a.title}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {ctx && Array.isArray(ctx.carried) && ctx.carried.length > 0 && (
            <section className="ui-card compass-card compass-carried">
              <h2 className="ui-kicker">
                <History size={14} /> Carried over
                <span className="ui-count compass-count-warn">{ctx.carried.length}</span>
              </h2>
              <ul className="compass-list carried">
                {ctx.carried.map((a, i) => (
                  <li key={a.id || i}>
                    <span className="compass-list-title">{a.title}</span>
                    <span className="ui-chip ui-chip--warn compass-late">{a.days_late}d late</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {ctx && (
            <section className="ui-card compass-card">
              <h2 className="ui-kicker"><Target size={14} /> Key results{krs.length > 0 && <span className="ui-count">{krs.length}</span>}</h2>
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
                        <div className="ui-meter"><i style={{ '--pct': `${pct}%` }} /></div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          )}
        </aside>
      </div>

      <ForecastPanel onData={setForecast} />
    </div>
  );
}

export default CompassPage;
