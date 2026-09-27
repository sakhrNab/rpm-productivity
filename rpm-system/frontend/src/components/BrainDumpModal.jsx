import { useState, useRef, useContext, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import {
  Sparkles, X, Mic, Loader2, Wand2, Check, FolderPlus, FolderKanban,
  Target, Zap, Pencil, ArrowRight, CornerDownRight, Lightbulb, Brain,
} from 'lucide-react';
import { AuthContext } from '../App';
import { useToast } from './ToastProvider';
import UsageBadge from './UsageBadge';
import './BrainDumpModal.css';

const PRIO = { 1: 'Low', 2: 'Med', 3: 'High' };
const OP_META = {
  create_category: { icon: FolderPlus, label: 'New category', cls: 'cat' },
  create_project: { icon: FolderKanban, label: 'New project', cls: 'proj' },
  create_key_result: { icon: Target, label: 'Key result', cls: 'kr' },
  create_action: { icon: Zap, label: 'Action', cls: 'act' },
  update_action: { icon: Pencil, label: 'Update', cls: 'upd' },
};

// Build parent/child + depth info so the preview can indent and cascade selection.
function analyze(operations, existing) {
  const catName = Object.fromEntries((existing?.categories || []).map(c => [c.id, c.name]));
  const projName = Object.fromEntries((existing?.projects || []).map(p => [p.id, p.name]));
  const tempIndex = {};
  operations.forEach((o, i) => { if (o.tempId) tempIndex[o.tempId] = i; });

  const parentIdx = operations.map(o => (o.parentTempId != null && tempIndex[o.parentTempId] != null ? tempIndex[o.parentTempId] : null));
  const depth = operations.map((_, i) => {
    let d = 0, p = parentIdx[i];
    while (p != null) { d++; p = parentIdx[p]; }
    return d;
  });

  // "Lands in" label when the parent is an EXISTING item (new-parent shown via indentation).
  const landsIn = operations.map((o, i) => {
    if (parentIdx[i] != null) return null;
    if (o.op === 'create_project' && o.categoryId && catName[o.categoryId]) return catName[o.categoryId];
    if ((o.op === 'create_key_result' || o.op === 'create_action') && o.projectId && projName[o.projectId]) return projName[o.projectId];
    if (o.op === 'create_action' && o.categoryId && catName[o.categoryId]) return catName[o.categoryId];
    if (o.op === 'update_action') return 'existing task';
    return null;
  });

  const descendants = (i) => {
    const out = [];
    const walk = (k) => operations.forEach((_, j) => { if (parentIdx[j] === k) { out.push(j); walk(j); } });
    walk(i);
    return out;
  };
  const ancestors = (i) => {
    const out = []; let p = parentIdx[i];
    while (p != null) { out.push(p); p = parentIdx[p]; }
    return out;
  };
  return { parentIdx, depth, landsIn, descendants, ancestors };
}

function opTitle(o) {
  return o.name || o.title || (o.op === 'update_action' ? (o.reason || 'Update task') : 'Item');
}

export default function BrainDumpModal({ onClose, onApplied, initialPlan = null, title = 'Brain Dump' }) {
  const { api } = useContext(AuthContext);
  const { showToast } = useToast();
  const [text, setText] = useState('');
  const [phase, setPhase] = useState(initialPlan ? 'preview' : 'input'); // input | loading | preview | applying
  const [plan, setPlan] = useState(initialPlan);
  const [selected, setSelected] = useState(() => new Set(initialPlan ? (initialPlan.operations || []).map((_, i) => i) : []));
  const [listening, setListening] = useState(false);
  const [error, setError] = useState('');
  const recognitionRef = useRef(null);
  const baseRef = useRef('');

  const modelKey = localStorage.getItem('ai.modelKey') || '';
  const meta = useMemo(() => (plan ? analyze(plan.operations, plan.existing) : null), [plan]);
  const SR = typeof window !== 'undefined' ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null;

  const startVoice = () => {
    if (!SR) { showToast('Voice input isn’t supported on this browser.', 'info'); return; }
    try {
      const rec = new SR();
      rec.lang = navigator.language || 'en-US';
      rec.interimResults = true;
      rec.continuous = true;
      baseRef.current = text ? text.trim() + ' ' : '';
      rec.onresult = (e) => {
        let s = '';
        for (let i = 0; i < e.results.length; i++) s += e.results[i][0].transcript + ' ';
        setText(baseRef.current + s);
      };
      rec.onend = () => setListening(false);
      rec.onerror = () => setListening(false);
      recognitionRef.current = rec;
      rec.start();
      setListening(true);
    } catch { setListening(false); }
  };
  const stopVoice = () => { try { recognitionRef.current && recognitionRef.current.stop(); } catch { /* noop */ } setListening(false); };

  const build = async () => {
    if (!text.trim()) return;
    if (!modelKey) { setError('Pick a default AI model in Settings first.'); return; }
    stopVoice();
    setError(''); setPhase('loading');
    try {
      const res = await api.aiBrainDump({ text: text.trim(), modelKey });
      if (res.error) throw new Error(res.error);
      const ops = res.operations || [];
      setPlan(res);
      setSelected(new Set(ops.map((_, i) => i)));
      setPhase(ops.length ? 'preview' : 'input');
      if (!ops.length) setError('I couldn’t find anything to plan in that — try adding more detail.');
    } catch (e) {
      const msg = e.message || 'Failed to build your plan';
      if (/no longer available|unknown model/i.test(msg)) localStorage.removeItem('ai.modelKey');
      setError(msg); setPhase('input');
    }
  };

  const toggle = (i) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(i)) { next.delete(i); meta.descendants(i).forEach(d => next.delete(d)); }
      else { next.add(i); meta.ancestors(i).forEach(a => next.add(a)); }
      return next;
    });
  };

  const apply = async () => {
    const ops = plan.operations.filter((_, i) => selected.has(i));
    if (!ops.length) { showToast('Select at least one item.', 'info'); return; }
    setPhase('applying');
    try {
      const res = await api.aiBrainDumpApply({ operations: ops });
      if (res.error) throw new Error(res.error);
      const a = res.applied || {};
      const parts = [];
      if (a.categories) parts.push(`${a.categories} categor${a.categories > 1 ? 'ies' : 'y'}`);
      if (a.projects) parts.push(`${a.projects} project${a.projects > 1 ? 's' : ''}`);
      if (a.key_results) parts.push(`${a.key_results} key result${a.key_results > 1 ? 's' : ''}`);
      if (a.actions) parts.push(`${a.actions} action${a.actions > 1 ? 's' : ''}`);
      if (a.updates) parts.push(`${a.updates} update${a.updates > 1 ? 's' : ''}`);
      showToast(parts.length ? `Added ${parts.join(', ')}.` : 'Plan applied.', 'success');
      if (onApplied) onApplied();
      onClose();
    } catch (e) {
      showToast(e.message || 'Failed to apply plan', 'error');
      setPhase('preview');
    }
  };

  const selectedCount = selected.size;
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  // Presentational tally of what the plan contains, e.g. "2 projects · 6 actions".
  const tally = plan ? Object.entries((plan.operations || []).reduce((acc, o) => {
    const k = (OP_META[o.op] ? o.op : 'create_action');
    acc[k] = (acc[k] || 0) + 1; return acc;
  }, {})) : [];
  const inPreview = (phase === 'preview' || phase === 'applying') && plan;

  return createPortal(
    <div className="bd-overlay" onMouseDown={onClose}>
      <div className={`bd-modal ${inPreview ? 'is-preview' : ''}`} onMouseDown={e => e.stopPropagation()} role="dialog" aria-label={title}>
        <header className="bd-head">
          <span className="ui-icon-badge bd-badge" aria-hidden="true"><Brain size={20} /></span>
          <div className="bd-head-text">
            <h2 className="bd-head-title">{title}</h2>
            <p className="bd-head-sub">{inPreview ? 'Review the plan — uncheck anything you don’t want.' : 'Empty your head. I’ll turn it into an RPM plan you approve.'}</p>
          </div>
          <button className="bd-close" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </header>

        {(phase === 'input' || phase === 'loading') && (
          <>
            <div className="bd-body">
              <p className="bd-tagline" title="Brain Dump captures new thoughts INTO your plan as structured RPM items. It's the opposite of Compass, which reflects your existing plan back as today's focus.">
                <span className="ui-chip ui-chip--ai bd-tagline-tag"><Sparkles size={12} /> Capture → organize</span>
                <Link to="/compass" onClick={onClose} className="bd-crosslink">Already planned? Check your Compass <ArrowRight size={12} /></Link>
              </p>
              <div className={`bd-input-wrap ${listening ? 'is-live' : ''}`}>
                <textarea
                  className="bd-textarea"
                  placeholder="e.g. I need to ship the app this month, mom's birthday is coming up, I keep skipping workouts, investor deck due Friday, want to learn Spanish this year…"
                  aria-label="What's on your mind"
                  value={text}
                  onChange={e => setText(e.target.value)}
                  disabled={phase === 'loading'}
                  autoFocus
                />
                <div className="bd-input-bar">
                  <span className="bd-words">{words > 0 ? `${words} word${words === 1 ? '' : 's'}` : 'Goals, tasks, worries, deadlines'}</span>
                  {SR && (
                    <button
                      type="button"
                      className={`bd-mic ${listening ? 'live' : ''}`}
                      onMouseDown={startVoice}
                      onMouseUp={stopVoice}
                      onMouseLeave={() => listening && stopVoice()}
                      onTouchStart={(e) => { e.preventDefault(); startVoice(); }}
                      onTouchEnd={(e) => { e.preventDefault(); stopVoice(); }}
                      disabled={phase === 'loading'}
                      title="Hold to talk"
                    >
                      <Mic size={15} /> {listening ? 'Listening… release to stop' : 'Hold to talk'}
                    </button>
                  )}
                </div>
                {phase === 'loading' && <div className="bd-scan" aria-hidden="true" />}
              </div>
              {error && <p className="bd-error">{error}</p>}
              {!modelKey && <p className="bd-hint">No AI model selected. <Link to="/settings" onClick={onClose}>Choose one in Settings →</Link></p>}
            </div>
            <div className="bd-foot">
              <span className="bd-foot-note">You review everything before it’s added.</span>
              <button className="btn btn-primary bd-build" onClick={build} disabled={phase === 'loading' || !text.trim()}>
                {phase === 'loading' ? <><Loader2 size={16} className="bd-spin" /> Building your plan…</> : <><Wand2 size={16} /> Build my plan</>}
              </button>
            </div>
          </>
        )}

        {inPreview && (
          <>
            <div className="bd-body">
              {plan.summary && <p className="bd-summary">{plan.summary}</p>}
              {tally.length > 0 && (
                <div className="bd-tally">
                  {tally.map(([op, n]) => {
                    const m = OP_META[op];
                    const Icon = m.icon;
                    return <span key={op} className={`bd-tally-item bd-t-${m.cls}`}><Icon size={13} /> <b>{n}</b> {m.label.toLowerCase()}</span>;
                  })}
                </div>
              )}
              {Array.isArray(plan.notes) && plan.notes.length > 0 && (
                <div className="bd-notes">
                  <div className="bd-notes-head"><Lightbulb size={14} /> Things to consider</div>
                  <ul>{plan.notes.map((n, i) => <li key={i}>{n}</li>)}</ul>
                </div>
              )}
              <p className="ui-kicker bd-review-kicker">
                <CornerDownRight size={13} /> What I’ll create
                <span className="ui-count">{selectedCount}/{plan.operations.length}</span>
              </p>
              <div className="bd-tree">
                {plan.operations.map((o, i) => {
                  const m = OP_META[o.op] || OP_META.create_action;
                  const Icon = m.icon;
                  const on = selected.has(i);
                  return (
                    <div
                      key={i}
                      className={`bd-op bd-op-${m.cls} ${o.op === 'create_action' && o.priority > 0 ? `bd-rail-p${o.priority}` : ''} ${on ? '' : 'off'}`}
                      style={{ marginLeft: `${Math.min(meta.depth[i] || 0, 4) * 18}px` }}
                      onClick={() => toggle(i)}
                      role="checkbox"
                      aria-checked={on}
                    >
                      <span className={`bd-check ${on ? 'on' : ''}`}>{on && <Check size={12} strokeWidth={3} />}</span>
                      {meta.depth[i] > 0 && <CornerDownRight size={13} className="bd-op-nest" />}
                      <span className={`bd-op-icon bd-op-icon-${m.cls}`}><Icon size={14} /></span>
                      <span className="bd-op-main">
                        <span className="bd-op-title">{opTitle(o)}</span>
                        <span className="bd-op-tags">
                          <span className="bd-op-kind">{m.label}</span>
                          {o.op === 'create_action' && o.priority > 0 && <span className={`bd-op-prio p${o.priority}`}>{PRIO[o.priority]}</span>}
                          {o.scheduled_date && <span className="bd-op-date">{o.scheduled_date}</span>}
                          {o.target_value != null && <span className="bd-op-date">target {o.target_value}{o.unit ? ` ${o.unit}` : ''}</span>}
                          {meta.landsIn[i] && <span className="bd-op-lands"><ArrowRight size={11} /> {meta.landsIn[i]}</span>}
                        </span>
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="bd-foot bd-preview-actions">
              <button className="btn btn-secondary" onClick={() => { if (initialPlan) onClose(); else setPhase('input'); }} disabled={phase === 'applying'}>{initialPlan ? 'Cancel' : 'Back'}</button>
              <div className="bd-actions-right">
                {plan.usage && <UsageBadge usage={plan.usage} />}
                <span className="bd-count">{selectedCount} of {plan.operations.length} selected</span>
                <button className="btn btn-primary" onClick={apply} disabled={phase === 'applying' || !selectedCount}>
                  {phase === 'applying' ? <><Loader2 size={16} className="bd-spin" /> Adding…</> : <><Check size={16} /> Approve &amp; add</>}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body
  );
}
