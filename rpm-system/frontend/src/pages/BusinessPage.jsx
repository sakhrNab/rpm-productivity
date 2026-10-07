import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  Workflow, Users, Gift, TrendingUp, Package, Radio, Wrench, Library, BarChart3, CalendarDays, Bot, Plus,
} from 'lucide-react';
import Picker from '../components/Picker';
import { useToast } from '../components/ToastProvider';
import ModalHead from '../components/modals/ModalHead';
import Overview from '../components/business/Overview';
import Revenue from '../components/business/Revenue';
import Results from '../components/business/Results';
import Leads from '../components/business/Leads';
import Agents from '../components/business/Agents';
import { Offers, Products, Channels, Fixes, Library as LibraryPage, Content } from '../components/business/Sections';
import { BizContext, useBizApi, useBizState, useUndo } from '../components/business/bizKit';
import { fmtDate, todayStr } from '../components/business/bizConfig';
import '../components/business/Business.css';

// The circuit: Overview, the money flow (Channels → Leads → Results → Revenue), the arsenal that feeds it,
// and the Agents that work it. One URL per view (/business/leads …); phones get the app's Picker.
const VIEWS = [
  { id: 'overview', label: 'Mission flow', short: 'Flow', icon: Workflow, el: Overview, group: 'hub' },
  { id: 'channels', label: 'Channels', icon: Radio, el: Channels, group: 'flow' },
  { id: 'leads', label: 'Leads', icon: Users, el: Leads, group: 'flow' },
  { id: 'results', label: 'Results', icon: BarChart3, el: Results, group: 'flow' },
  { id: 'revenue', label: 'Revenue', icon: TrendingUp, el: Revenue, group: 'flow' },
  { id: 'offers', label: 'Offers', icon: Gift, el: Offers, group: 'arsenal' },
  { id: 'products', label: 'Products', icon: Package, el: Products, group: 'arsenal' },
  { id: 'fixes', label: 'Fixes', icon: Wrench, el: Fixes, group: 'arsenal' },
  { id: 'content', label: 'Content', icon: CalendarDays, el: Content, group: 'arsenal' },
  { id: 'library', label: 'Library', icon: Library, el: LibraryPage, group: 'arsenal' },
  { id: 'agents', label: 'Agents', icon: Bot, el: Agents, group: 'agents' },
];

// What N creates on each view (the quick-add default).
const QUICK = [
  { id: 'leads', label: 'Lead', icon: Users, field: 'name', ph: 'Who could buy? Name or company' },
  { id: 'fixes', label: 'Fix', icon: Wrench, field: 'text', ph: 'What blocks selling?' },
  { id: 'content', label: 'Post', icon: CalendarDays, field: 'title', ph: 'Post idea' },
  { id: 'offers', label: 'Offer', icon: Gift, field: 'name', ph: 'Offer name' },
  { id: 'products', label: 'Product', icon: Package, field: 'name', ph: 'Product name' },
  { id: 'channels', label: 'Channel', icon: Radio, field: 'name', ph: 'Where buyers find you' },
  { id: 'docs', label: 'Doc', icon: Library, field: 'path', ph: 'Path or URL' },
  { id: 'results', label: 'Result', icon: BarChart3 },
];
const QUICK_FOR = { leads: 'leads', fixes: 'fixes', content: 'content', offers: 'offers', products: 'products', channels: 'channels', library: 'docs', results: 'results' };

const RUNNER_FRESH_MS = 3 * 60 * 1000;
export const runnerOnline = (runner) => !!runner?.last_claim_at && Date.now() - Date.parse(runner.last_claim_at) < RUNNER_FRESH_MS;

export default function BusinessPage() {
  const { view: raw } = useParams();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const biz = useBizApi();
  const { showToast } = useToast();
  const state = useBizState();
  const undo = useUndo();
  const [quick, setQuick] = useState(null); // null | section id
  const view = VIEWS.find((v) => v.id === raw) || VIEWS[0];

  const go = useCallback((id, query = {}) => {
    const q = new URLSearchParams(Object.entries(query).filter(([, v]) => v !== undefined && v !== null && v !== ''));
    const path = id === 'overview' ? '/business' : `/business/${id}`;
    navigate(q.toString() ? `${path}?${q}` : path);
  }, [navigate]);

  // One-click execution of a "next best move".
  const runMove = useCallback(async (m) => {
    const a = m.action || {};
    try {
      if (a.type === 'follow_up') {
        const r = await biz.current.followUp(a.lead_id, { scheduled_date: a.date || todayStr() });
        showToast(`On your RPM list: “${r.action.title}”${r.action.scheduled_date ? ` · ${fmtDate(r.action.scheduled_date)}` : ''}`, 'success');
      } else if (a.type === 'set_next_contact') {
        await biz.current.update('leads', a.lead_id, { next_contact: a.date });
        showToast(`Next contact set for ${fmtDate(a.date)}`, 'success');
      } else if (a.type === 'fix_to_rpm') {
        const r = await biz.current.fixToAction(a.fix_id, { scheduled_date: a.date || todayStr() });
        showToast(`On your RPM list: “${r.action.title}”`, 'success');
      } else if (a.type === 'queue_agent') {
        try {
          await biz.current.queueRun(a.job_id, a.inputs || {});
          showToast('Queued — your local runner picks it up', 'success');
        } catch (e) {
          if (e.data?.needs_confirmation) { go('agents', { job: a.job_id }); return false; }
          throw e;
        }
      } else if (a.type === 'log_result') {
        go('results', { type: a.prefill?.type, channel: a.prefill?.channel, lead: a.prefill?.lead_id });
        return false;
      } else {
        go(a.view || 'overview', { filter: a.filter, focus: a.id });
        return false;
      }
      state.changed({ lists: true });
      return true;
    } catch (e) { showToast(e.message, 'error'); return false; }
  }, [biz, go, showToast, state]);

  // Quick add (and other out-of-tree writers) announce changes; every list and the canvas reload.
  const { changed } = state;
  useEffect(() => {
    const f = () => changed({ lists: true });
    window.addEventListener('biz:changed', f);
    return () => window.removeEventListener('biz:changed', f);
  }, [changed]);

  // N = quick add (not while typing or while a dialog is open).
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'n' && e.key !== 'N') return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      if (document.querySelector('.modal-overlay, .picker-menu, .dp-menu')) return;
      e.preventDefault();
      setQuick(QUICK_FOR[view.id] || 'leads');
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [view.id]);

  const ctx = useMemo(() => ({
    ...state, undo, go, runMove, params, setParams, openQuick: (s) => setQuick(s || QUICK_FOR[view.id] || 'leads'),
  }), [state, undo, go, runMove, params, setParams, view.id]);

  const sum = state.sum;
  const badge = (id) => {
    if (!sum) return null;
    const f = sum.flow || {};
    if (id === 'leads') { const n = (sum.moves || []).filter((m) => ['overdue', 'due_today', 'stuck', 'no_date'].includes(m.kind)).length; return n ? { n, tone: 'warn' } : null; }
    if (id === 'fixes') { const n = (f.fixes || []).filter((x) => !x.done && x.severity === 'P0').length; return n ? { n, tone: 'bad' } : null; }
    if (id === 'agents') { const n = (sum.agents?.runs || []).filter((r) => r.status === 'running' || r.status === 'queued').length; return n ? { n, tone: 'ai' } : null; }
    return null;
  };
  const online = runnerOnline(sum?.agents?.runner);
  const View = view.el;

  return (
    <BizContext.Provider value={ctx}>
      <div className={`biz-page bz-view-${view.id}`}>
        <header className="bz-top">
          <div className="bz-top-row">
            <h1 className="page-title bz-title">Business</h1>
            <div className="bz-nav-phone">
              <Picker value={view.id} header="Business" onChange={(v) => go(v)}
                options={VIEWS.map((v) => ({ value: v.id, label: v.label, icon: <v.icon size={15} />, group: v.group === 'hub' ? undefined : v.group === 'flow' ? 'Money flow' : v.group === 'arsenal' ? 'Arsenal' : 'Automation' }))} />
            </div>
            <button type="button" className="btn btn-primary bz-quick-btn" onClick={() => setQuick(QUICK_FOR[view.id] || 'leads')} aria-keyshortcuts="N">
              <Plus size={16} /> <span>New</span><kbd className="bz-kbd" aria-hidden="true">N</kbd>
            </button>
          </div>
          <nav className="bz-circuit" aria-label="Business pages">
            {['hub', 'flow', 'arsenal', 'agents'].map((g) => (
              <div key={g} className={`bz-circuit-group g-${g}`} role="group" aria-label={g === 'flow' ? 'Money flow' : g === 'arsenal' ? 'Arsenal' : g === 'agents' ? 'Automation' : 'Overview'}>
                {g === 'flow' && <span className="bz-circuit-wire" aria-hidden="true" />}
                {VIEWS.filter((v) => v.group === g).map((v) => {
                  const b = badge(v.id);
                  return (
                    <button key={v.id} type="button" aria-current={v.id === view.id ? 'page' : undefined} className={`bz-circuit-node ${v.id === view.id ? 'on' : ''}`} onClick={() => go(v.id)}>
                      <v.icon size={15} aria-hidden="true" /> <span>{v.short && v.id !== view.id ? v.short : v.label}</span>
                      {v.id === 'agents' && <i className={`bz-runner-dot ${online ? 'on' : ''}`} aria-label={online ? 'runner online' : 'runner offline'} />}
                      {b && <em className={`bz-badge tone-${b.tone}`}>{b.n}</em>}
                    </button>
                  );
                })}
              </div>
            ))}
          </nav>
        </header>
        {state.err && !sum ? <p className="biz-err">{state.err}</p> : <View key={view.id} go={go} />}
        {quick && <QuickAdd section={quick} onClose={() => setQuick(null)} />}
        {undo.view}
      </div>
    </BizContext.Provider>
  );
}

// Quick add (N): pick what, type a name, Enter. Results jump to the log bar instead.
function QuickAdd({ section, onClose }) {
  const biz = useBizApi();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [kind, setKind] = useState(section);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const input = useRef(null);
  const meta = QUICK.find((q) => q.id === kind) || QUICK[0];
  useEffect(() => { input.current?.focus(); }, [kind]);
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !document.querySelector('.picker-menu')) onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const submit = async (e) => {
    e.preventDefault();
    if (kind === 'results') { onClose(); navigate('/business/results?log=1'); return; }
    if (!text.trim()) return;
    setBusy(true);
    try {
      await biz.current.create(kind, { [meta.field]: text.trim() });
      showToast(`${meta.label} added: “${text.trim()}”`, 'success');
      window.dispatchEvent(new CustomEvent('biz:changed'));
      onClose();
    } catch (err) { showToast(err.message, 'error'); } finally { setBusy(false); }
  };
  return (
    <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <form className="modal bz-quick" onSubmit={submit} role="dialog" aria-modal="true" aria-label="Quick add">
        <ModalHead icon={Plus} title="Quick add" subtitle="Pick what it is, type it, press Enter. Details can wait." onClose={onClose} />
        <div className="modal-body mk-body">
          <div className="bz-quick-kinds" role="radiogroup" aria-label="What are you adding?">
            {QUICK.map((q) => (
              <button key={q.id} type="button" role="radio" aria-checked={kind === q.id} className={`bz-quick-kind ${kind === q.id ? 'on' : ''}`} onClick={() => setKind(q.id)}>
                <q.icon size={15} aria-hidden="true" /> {q.label}
              </button>
            ))}
          </div>
          {kind === 'results' ? (
            <p className="mk-help">Results have a type, a count and a channel — Enter takes you to the log bar in Results.</p>
          ) : (
            <input ref={input} className="mk-hero bz-quick-input" value={text} maxLength={300} placeholder={meta.ph} aria-label={meta.ph} onChange={(e) => setText(e.target.value)} />
          )}
        </div>
        <div className="modal-footer mk-foot">
          <span className="mk-foot-note">Enter adds · Esc closes</span>
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={busy || (kind !== 'results' && !text.trim())}>{busy ? 'Adding…' : kind === 'results' ? 'Go to log' : `Add ${meta.label.toLowerCase()}`}</button>
        </div>
      </form>
    </div>
  );
}
