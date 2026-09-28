import { useEffect, useState, useContext } from 'react';
import { Link } from 'react-router-dom';
import { Compass, Sparkles, RefreshCw, ArrowRight, AlertTriangle, History, Globe, Clock } from 'lucide-react';
import { format } from 'date-fns';
import { AuthContext } from '../../App';
import Markdown from '../Markdown';
import UsageBadge from '../UsageBadge';
import { getCompassState, subscribeCompass, runCompassRequest } from '../../utils/compassStore';

// Today's must-win — the Compass read. Runs only when asked; the last read is cached
// (module store + localStorage) so it survives navigation, and is flagged when stale.
export default function CompassRead() {
  const { api } = useContext(AuthContext);
  const [state, setState] = useState(getCompassState);
  const now = new Date();
  const todayStr = format(now, 'yyyy-MM-dd');

  // Reflect the shared store; an in-flight request keeps running across navigation.
  useEffect(() => subscribeCompass(setState), []);
  const run = () => runCompassRequest(api);

  const whenLabel = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    const diff = (now - d) / 1000;
    if (diff < 90) return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400 && d.getDate() === now.getDate()) return `${Math.floor(diff / 3600)}h ago`;
    return d.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
  };

  const isStale = state.status === 'ready' && state.dateStr && state.dateStr !== todayStr;
  const hasContent = state.status === 'ready' || state.status === 'loading' || state.status === 'error';

  return (
    <section className="td-mustwin" aria-label="Today's must-win">
      <div className="td-mustwin-head">
        <h2 className="ui-kicker td-kicker-ai"><Compass size={14} /> Today's must-win</h2>
        {hasContent && (
          <span className="td-mustwin-status">
            {state.status === 'ready' && state.generatedAt && (
              <span className="compass-generated"><Clock size={12} /> {whenLabel(state.generatedAt)}</span>
            )}
            {state.status === 'ready' && state.usage && <UsageBadge usage={state.usage} />}
            <button type="button" className="td-mini" onClick={run} disabled={state.status === 'loading'} title="Read my compass again">
              <RefreshCw size={14} className={state.status === 'loading' ? 'md-spin' : ''} />
              {state.status === 'loading' ? 'Reading…' : 'Refresh'}
            </button>
          </span>
        )}
      </div>

      {(state.status === 'idle' || state.status === 'init') && (
        <div className="compass-invite">
          <span className="compass-invite-orb" aria-hidden="true"><Compass size={24} /></span>
          <p><b>Where should today's energy go?</b> A focused read on today — your must-win, drawn from your goals and where your key results stand.</p>
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
          <Sparkles size={22} />
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

      <p
        className="compass-desc"
        title="Compass reads what's already in your plan against your goals and key results, and hands back today's one must-win. Reflect → focus: information flows OUT of your system. (Brain Dump is the opposite — it captures new thoughts INTO your plan.)"
      >
        <span className="compass-desc-tag">Reflect → focus</span>
        <button type="button" className="compass-crosslink" onClick={() => window.dispatchEvent(new CustomEvent('rpm:open-braindump'))}>
          New thoughts? Brain-dump them <ArrowRight size={13} />
        </button>
      </p>
    </section>
  );
}
