import { forwardRef } from 'react';
import { Sparkles, X, Check, Loader2, Wand2 } from 'lucide-react';
import Markdown from '../Markdown';
import UsageBadge from '../UsageBadge';

// AI suggestions for today (propose-only): a short read plus changes you approve one by one.
const AiSuggestions = forwardRef(function AiSuggestions({ suggest, onApply, onDismiss, onClose }, ref) {
  if (!suggest) return null;
  const pending = Array.isArray(suggest.proposals) ? suggest.proposals.filter(p => !p.status).length : 0;
  return (
    <section className="md-suggest" ref={ref} aria-label="AI suggestions">
      <div className="md-suggest-head">
        <span><Sparkles size={14} /> AI suggestions</span>
        <span className="md-suggest-head-right">
          {suggest.usage && <UsageBadge usage={suggest.usage} />}
          <button type="button" className="md-suggest-close" onClick={onClose} aria-label="Close suggestions"><X size={15} /></button>
        </span>
      </div>
      <div className="md-suggest-body">
        {suggest.loading && <p className="md-suggest-muted"><Loader2 size={14} className="md-spin" /> Reviewing your tasks and priorities…</p>}
        {suggest.error && <p className="md-suggest-error">{suggest.error}</p>}
        {suggest.text && <Markdown>{suggest.text}</Markdown>}
        {Array.isArray(suggest.proposals) && suggest.proposals.length > 0 && (
          <div className="asst-proposals md-suggest-proposals">
            <div className="asst-proposals-head">
              <Wand2 size={13} /> Suggested changes — approve what you want
              {pending > 0 && <span className="asst-proposals-count">{pending} pending</span>}
            </div>
            {suggest.proposals.map((p, idx) => (
              <div key={idx} className={`asst-proposal ${p.status || ''}`}>
                <span className="asst-proposal-label">{p.label || p.kind}</span>
                {!p.status && (
                  <span className="asst-proposal-actions">
                    <button className="asst-prop-approve" onClick={() => onApply(idx, p)}><Check size={13} /> Approve</button>
                    <button className="asst-prop-dismiss" onClick={() => onDismiss(idx)}><X size={13} /> Dismiss</button>
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
    </section>
  );
});

export default AiSuggestions;
