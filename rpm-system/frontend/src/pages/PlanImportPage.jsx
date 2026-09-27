import { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  FileUp, FileText, Sparkles, Check, X, Loader2, CalendarRange, Route, Bell, Link2, Layers, Clock,
  AlertTriangle, HelpCircle, Lightbulb, Plus, FolderKanban, FolderPlus, PenLine, ArrowRight, RotateCcw,
  GanttChart, List, Target, Zap, Trash2, History, Compass,
} from 'lucide-react';
import { AppContext, AuthContext } from '../App';
import { useToast } from '../components/ToastProvider';
import Picker from '../components/Picker';
import PlanTimeline from '../components/plan/PlanTimeline';
import { fmtDay, reminderUpcoming } from '../utils/planFormat';
import TaskEditor from '../components/plan/TaskEditor';
import { takePendingFile } from '../utils/pendingFile';
import ErrorBoundary from '../components/ErrorBoundary';
import { schedulePlan } from '../utils/planSchedule';
import './PlanImportPage.css';

const MAX_BYTES = 10 * 1024 * 1024;
const STAGES = [
  { id: 'reading', label: 'Reading your file' },
  { id: 'thinking', label: 'Understanding what it asks for' },
  { id: 'structuring', label: 'Breaking it into tasks & dependencies' },
  { id: 'scheduling', label: 'Building the timeline' },
];
const INSIGHT_ICON = { gap: Lightbulb, risk: AlertTriangle, question: HelpCircle };
const kb = (n) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

function ConfidenceRing({ value }) {
  const r = 22, c = 2 * Math.PI * r;
  return (
    <svg className="pim-ring" viewBox="0 0 56 56" aria-label={`${value}% confident`}>
      <circle cx="28" cy="28" r={r} className="pim-ring-bg" />
      <circle cx="28" cy="28" r={r} className="pim-ring-fg" strokeDasharray={c} strokeDashoffset={c * (1 - value / 100)} />
      <text x="28" y="32" textAnchor="middle">{value}%</text>
    </svg>
  );
}

// The new-project form also carries an optional draft of a new category (area of life).
const EMPTY_NEW = { name: '', result: '', purpose: '', category_id: '', new_category_name: '', newCat: false, cat_vision: '', cat_purpose: '', cat_roles: '', cat_1y: '', cat_90: '' };
const catDraftFields = (c) => (c ? {
  new_category_name: c.name || '', cat_vision: c.vision || '', cat_purpose: c.purpose || '', cat_roles: c.roles || '',
  cat_1y: (c.one_year_goals || []).join('\n'), cat_90: (c.ninety_day_goals || []).join('\n'),
} : {});

export default function PlanImportPage() {
  const { api } = useContext(AuthContext);
  const { refreshData } = useContext(AppContext);
  const { showToast } = useToast();
  const [params] = useSearchParams();
  const presetProject = params.get('project');
  const navigate = useNavigate();
  const [importId, setImportId] = useState(null);
  const [recent, setRecent] = useState([]);
  const [saveState, setSaveState] = useState('');     // '' | 'saving' | 'saved'

  const [stage, setStage] = useState('drop');        // drop | analyzing | studio | done
  const [file, setFile] = useState(null);
  const [note, setNote] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [models, setModels] = useState([]);
  const [modelKey, setModelKey] = useState(localStorage.getItem('ai.modelKey') || '');

  const [fileInfo, setFileInfo] = useState(null);
  const [progress, setProgress] = useState({ stage: 'reading', tasks: 0, started: 0 });
  const [elapsed, setElapsed] = useState(0);
  const abortRef = useRef(null);
  const inputRef = useRef(null);
  const autoStart = useRef(false);                    // a file handed over from the Assistant / a global drop

  const [plan, setPlan] = useState(null);
  const [existing, setExisting] = useState({ categories: [], projects: [] });
  const [tasks, setTasks] = useState([]);
  const [phases, setPhases] = useState([]);
  const [keyResults, setKeyResults] = useState([]);
  const [mode, setMode] = useState('existing');      // existing | new | own
  const [projectId, setProjectId] = useState('');
  const [newProj, setNewProj] = useState(EMPTY_NEW);
  const [createBlocks, setCreateBlocks] = useState(true);
  const [view, setView] = useState(() => (window.matchMedia?.('(max-width: 719px)').matches ? 'list' : 'timeline'));
  const [zoom, setZoom] = useState('week');
  const [spotlight, setSpotlight] = useState(false);
  const [editing, setEditing] = useState(null);
  const [applying, setApplying] = useState(false);
  const [result, setResult] = useState(null);

  useEffect(() => {
    api.getAiModels().then(d => {
      const ok = new Set((d.providers || []).filter(p => p.configured).map(p => p.provider));
      const avail = (d.models || []).filter(m => ok.has(m.provider));
      setModels(avail);
      if (!avail.some(m => m.key === modelKey) && avail[0]) setModelKey(avail[0].key);
    }).catch(() => {});
    loadRecent();
    if (params.get('draft')) openImport(params.get('draft'));
    else {
      const handed = takePendingFile();
      if (handed) { pick(handed); autoStart.current = true; }
    }
    return () => abortRef.current?.abort();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const loadRecent = () => api.listImports().then(r => setRecent(Array.isArray(r) ? r : [])).catch(() => {});

  // Reopen a saved upload: drafts continue where you left off; applied ones live in their project now.
  const openImport = async (id) => {
    const row = await api.getImport(id).catch(() => null);
    if (!row || row.error) { showToast('That upload is no longer available.', 'error'); return; }
    if (row.status === 'applied' && row.project_id) { navigate(`/projects/${row.project_id}?view=timeline`); return; }
    setFile({ name: row.file_name, size: 0 });
    loadPlan(row.plan, row.existing, row.draft);
    setImportId(row.id);
  };
  const removeImport = async (e, id) => {
    e.stopPropagation();
    if (!window.confirm('Delete this saved upload? (Tasks already created are not affected.)')) return;
    await api.deleteImport(id).catch(() => {});
    loadRecent();
  };

  useEffect(() => {
    if (stage !== 'analyzing') return undefined;
    const id = setInterval(() => setElapsed(Math.round((Date.now() - progress.started) / 1000)), 500);
    return () => clearInterval(id);
  }, [stage, progress.started]);

  // ---------- upload + analyze ----------
  const pick = (f) => {
    if (!f) return;
    if (f.size > MAX_BYTES) { showToast('That file is over 10 MB.', 'error'); return; }
    setFile(f);
  };

  // A file dropped on the orb (or anywhere outside the drop zone) while already here.
  useEffect(() => {
    const onFile = (e) => { if (stage !== 'drop') return; pick(e.detail); autoStart.current = true; };
    window.addEventListener('rpm:plan-file', onFile);
    return () => window.removeEventListener('rpm:plan-file', onFile);
  }, [stage]); // eslint-disable-line react-hooks/exhaustive-deps

  // "Plan it" means go: start as soon as a usable model is known. With no model the file
  // just waits on the drop screen, where the model picker explains what's missing.
  useEffect(() => {
    if (!autoStart.current || !file || stage !== 'drop' || !models.length || !models.some(m => m.key === modelKey)) return;
    autoStart.current = false;
    analyze();
  }, [file, models, modelKey, stage]); // eslint-disable-line react-hooks/exhaustive-deps

  const analyze = async () => {
    if (!file) return;
    if (!modelKey) { showToast('Add an API key in Settings to choose a model first.', 'error'); return; }
    const controller = new AbortController();
    abortRef.current = controller;
    setStage('analyzing'); setFileInfo(null); setElapsed(0);
    setProgress({ stage: 'reading', tasks: 0, started: Date.now() });
    let gotPlan = false;
    try {
      const res = await api.importPlanStream(file, { modelKey, note, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone }, controller.signal);
      if (!res.ok || !res.body) {
        let msg = 'Could not analyze that file.';
        try { msg = (await res.json()).error || msg; } catch { /* ignore */ }
        throw new Error(msg);
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let i;
        while ((i = buf.indexOf('\n\n')) >= 0) {
          const frame = buf.slice(0, i); buf = buf.slice(i + 2);
          const line = frame.split('\n').find(l => l.startsWith('data:'));
          if (!line) continue;
          let ev; try { ev = JSON.parse(line.slice(5)); } catch { continue; }
          if (ev.type === 'file') setFileInfo(ev);
          else if (ev.type === 'stage') setProgress(p => ({ ...p, stage: ev.stage }));
          else if (ev.type === 'progress') setProgress(p => ({ ...p, tasks: ev.tasks }));
          else if (ev.type === 'error') throw new Error(ev.message);
          else if (ev.type === 'plan') { gotPlan = true; setImportId(ev.import_id || null); loadPlan(ev.plan, ev.existing); }
        }
      }
      if (!gotPlan) throw new Error('The analysis ended without a plan — try again.');
    } catch (e) {
      if (controller.signal.aborted) { setStage('drop'); return; }
      showToast(e.message || 'Could not analyze that file.', 'error');
      setStage('drop');
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
    }
  };

  const loadPlan = (p, ex, draft) => {
    setPlan(draft?.title ? { ...p, title: draft.title } : p);
    setExisting(ex || { categories: [], projects: [] });
    setTasks(p.tasks.map(t => ({
      key: t.key, phase: t.phase, title: t.title, description: t.description, size: t.size, priority: t.priority,
      effort_minutes: t.effort_minutes, span_days: t.span_days, pin: t.pin || null, deadline: t.deadline,
      depends_on: t.depends_on, reminder: t.reminder, source: t.source, why: t.why, include: t.include !== false,
    })));
    setPhases(p.phases.map(ph => ({ key: ph.key, title: ph.title, description: ph.description })));
    setKeyResults(p.key_results || []);
    const pl = p.placement;
    const preset = presetProject && (ex?.projects || []).some(x => x.id === presetProject) ? presetProject : null;
    setMode(preset || pl.decision === 'existing_project' ? 'existing' : 'new');
    setProjectId(preset || pl.project_id || '');
    setNewProj({ ...EMPTY_NEW, name: pl.new_project.name, result: pl.new_project.result, purpose: pl.new_project.purpose, category_id: pl.category_id || '',
      ...catDraftFields(pl.new_category), newCat: pl.decision === 'new_category' || !pl.category_id });
    if (draft) {                                      // restore the user's edits
      if (Array.isArray(draft.tasks)) setTasks(draft.tasks);
      if (Array.isArray(draft.phases)) setPhases(draft.phases);
      if (Array.isArray(draft.key_results)) setKeyResults(draft.key_results);
      if (draft.mode) setMode(draft.mode);
      if (draft.projectId !== undefined) setProjectId(draft.projectId);
      if (draft.newProj) setNewProj({ ...EMPTY_NEW, ...draft.newProj });   // drafts saved before category drafts existed
      if (typeof draft.createBlocks === 'boolean') setCreateBlocks(draft.createBlocks);
    }
    const span = p.schedule?.span_days || 30;
    setZoom(span <= 21 ? 'day' : span <= 150 ? 'week' : 'month');
    setStage('studio');
  };

  // Autosave edits to the saved upload (debounced) so leaving the page loses nothing.
  useEffect(() => {
    if (stage !== 'studio' || !importId) return undefined;
    setSaveState('saving');
    const t = setTimeout(() => {
      api.saveImportDraft(importId, { title: plan?.title, tasks, phases, key_results: keyResults, mode, projectId, newProj, createBlocks })
        .then(r => setSaveState(r?.ok ? 'saved' : ''))
        .catch(() => setSaveState(''));
    }, 900);
    return () => clearTimeout(t);
  }, [stage, importId, tasks, phases, keyResults, mode, projectId, newProj, createBlocks]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------- live schedule ----------
  const today = plan?.today || new Date().toISOString().slice(0, 10);
  const sched = useMemo(() => {
    if (!tasks.length) return null;
    const keys = new Set(tasks.map(t => t.key));
    const included = new Set(tasks.filter(t => t.include).map(t => t.key));
    const r = schedulePlan(tasks.map(t => ({
      ...t, start: t.pin,
      depends_on: t.include ? t.depends_on.filter(d => included.has(d)) : t.depends_on.filter(d => keys.has(d)),
    })), { today });
    const orig = new Map(tasks.map(t => [t.key, t]));
    return { ...r, tasks: r.tasks.map(t => ({ ...t, pin: orig.get(t.key).pin, depends_on: orig.get(t.key).depends_on })) };
  }, [tasks, today]);

  const scheduled = sched?.tasks || [];
  const incl = scheduled.filter(t => t.include);
  const stats = useMemo(() => {
    if (!incl.length) return null;
    const start = incl.reduce((m, t) => (t.start < m ? t.start : m), incl[0].start);
    const end = incl.reduce((m, t) => (t.end > m ? t.end : m), incl[0].end);
    const inclKeys = new Set(incl.map(t => t.key));
    return {
      start, end,
      days: Math.round((Date.parse(end) - Date.parse(start)) / 86400000) + 1,
      critical: incl.filter(t => t.critical).length,
      reminders: incl.filter(t => reminderUpcoming(t.start, t.reminder)).length,
      deps: incl.reduce((n, t) => n + t.depends_on.filter(d => inclKeys.has(d)).length, 0),
      initiative: incl.filter(t => t.source === 'initiative').length,
      hours: Math.round(incl.reduce((n, t) => n + t.effort_minutes, 0) / 6) / 10,
      late: incl.filter(t => t.late).length,
    };
  }, [incl, today]);

  const updateTask = (key, patch) => setTasks(ts => ts.map(t => (t.key === key ? { ...t, ...patch } : t)));
  const pinTask = (key, date) => updateTask(key, { pin: date });
  const editingTask = editing ? scheduled.find(t => t.key === editing) : null;

  const addInsightTask = (text) => {
    const key = `u${Date.now().toString(36)}`;
    const phase = phases[phases.length - 1]?.key || 'ph1';
    setTasks(ts => [...ts, { key, phase, title: text.replace(/\?$/, '').slice(0, 120), description: '', size: 'small', priority: 2, effort_minutes: 30, span_days: 1, pin: null, deadline: null, depends_on: [], reminder: null, source: 'initiative', why: 'Added from an insight', include: true }]);
    setEditing(key);
  };

  // ---------- placement ----------
  const catName = (id) => existing.categories.find(c => c.id === id)?.name || '';
  const projectOptions = useMemo(() => existing.projects.map(p => ({
    value: p.id, label: p.name, group: catName(p.category_id) || 'Other',
    hint: p.id === plan?.placement.project_id ? 'AI pick' : plan?.placement.alternatives.some(a => a.project_id === p.id) ? 'also fits' : undefined,
  })).sort((a, b) => a.group.localeCompare(b.group)), [existing, plan]); // eslint-disable-line react-hooks/exhaustive-deps
  const categoryOptions = [
    ...existing.categories.map(c => ({ value: c.id, label: c.name })),
    { value: '__new__', label: '+ New category…' },
  ];
  const chosenProject = existing.projects.find(p => p.id === projectId);
  const destination = mode === 'existing' ? chosenProject?.name
    : `${newProj.newCat && newProj.new_category_name.trim() ? `${newProj.new_category_name.trim()} (new area) › ` : ''}${newProj.name || 'your new project'}`;

  const switchMode = (m) => {
    setMode(m);
    if (m === 'own') setNewProj(p => ({ ...p, name: '', result: '', purpose: '', ...(p.newCat ? { new_category_name: '', cat_vision: '', cat_purpose: '', cat_roles: '', cat_1y: '', cat_90: '' } : {}) }));
    if (m === 'new' && plan?.placement.decision === 'new_category') setNewProj(p => ({ ...p, newCat: true, category_id: '', ...(p.new_category_name ? {} : catDraftFields(plan.placement.new_category)) }));
    if (m === 'new' && plan) setNewProj(p => ({ ...p, name: p.name || plan.placement.new_project.name, result: p.result || plan.placement.new_project.result, purpose: p.purpose || plan.placement.new_project.purpose }));
  };

  const aiArea = plan?.placement.new_category || null;
  const useAiArea = () => setNewProj(p => ({ ...p, newCat: true, category_id: '', ...catDraftFields(aiArea) }));

  const apply = async () => {
    if (mode === 'existing' && !projectId) { showToast('Pick the project this belongs to.', 'error'); return; }
    if (mode !== 'existing' && !newProj.name.trim()) { showToast('Give the new project a name.', 'error'); return; }
    if (mode !== 'existing' && (newProj.newCat ? !newProj.new_category_name.trim() : !newProj.category_id)) { showToast(newProj.newCat ? 'Name the new category.' : 'Pick a category for the new project.', 'error'); return; }
    setApplying(true);
    try {
      const placement = mode === 'existing'
        ? { mode: 'existing', project_id: projectId }
        : { mode: 'new', name: newProj.name, result: newProj.result, purpose: newProj.purpose,
          ...(newProj.newCat
            ? { new_category: { name: newProj.new_category_name, vision: newProj.cat_vision, purpose: newProj.cat_purpose, roles: newProj.cat_roles,
                one_year_goals: newProj.cat_1y.split('\n'), ninety_day_goals: newProj.cat_90.split('\n') } }
            : { category_id: newProj.category_id }) };
      const res = await api.applyImportPlan({
        plan: { ...plan, tasks, phases, key_results: keyResults },
        placement, options: { create_blocks: createBlocks }, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        import_id: importId,
      });
      if (!res || res.error) throw new Error(res?.error || 'Failed to create the plan');
      setResult(res);
      setStage('done');
      refreshData?.();
      loadRecent();
    } catch (e) {
      showToast(e.message || 'Failed to create the plan', 'error');
    } finally {
      setApplying(false);
    }
  };

  const reset = () => { setStage('drop'); setFile(null); setPlan(null); setTasks([]); setResult(null); setNote(''); setImportId(null); setSaveState(''); loadRecent(); };

  // ---------- render ----------
  return (
    <div className={`pim pim-stage-${stage}`}>
      <header className="pim-head">
        <div className="pim-head-icon"><FileUp size={22} /></div>
        <div>
          <h1 className="pim-title">Plan from a file</h1>
          <p className="pim-sub">
            <span className="pim-tag">AI</span>
            Drop a brief, meeting notes, a spreadsheet or a syllabus — I’ll place it in your plan and schedule every task.
          </p>
        </div>
      </header>

      {stage === 'drop' && (
        <section className="pim-drop-wrap">
          <label
            className={`pim-drop ${dragOver ? 'over' : ''} ${file ? 'has-file' : ''}`}
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={e => { e.preventDefault(); setDragOver(false); pick(e.dataTransfer.files?.[0]); }}
          >
            <input ref={inputRef} type="file" className="pim-file-input" onChange={e => pick(e.target.files?.[0])} />
            <div className="pim-orbit" aria-hidden="true">
              {['PDF', 'DOCX', 'XLSX', 'MD', 'CSV', 'HTML', 'PPTX', 'TXT'].map((t, i) => (
                <span key={t} style={{ '--i': i }}>{t}</span>
              ))}
            </div>
            <div className="pim-drop-core">
              {file ? (<>
                <FileText size={34} />
                <strong className="pim-file-name">{file.name}</strong>
                <span className="pim-file-meta">{kb(file.size)} · ready</span>
                <button type="button" className="pim-change" onClick={(e) => { e.preventDefault(); inputRef.current?.click(); }}>Choose another</button>
              </>) : (<>
                <FileUp size={34} />
                <strong>Drop a file here</strong>
                <span className="pim-file-meta">or click to browse · up to 10 MB</span>
              </>)}
            </div>
          </label>

          <div className="pim-drop-side">
            <label className="pim-note">
              <span>Anything I should know? <em>optional</em></span>
              <textarea className="form-input" rows={3} maxLength={1000} value={note} onChange={e => setNote(e.target.value)}
                placeholder="e.g. Launch is Nov 15. Sara handles design. Keep weekends free." />
            </label>
            <div className="pim-model">
              <span>Model</span>
              {models.length ? (
                <Picker value={modelKey} onChange={v => { setModelKey(v); localStorage.setItem('ai.modelKey', v); }}
                  options={models.map(m => ({ value: m.key, label: m.label }))} header="Plan with" />
              ) : <Link to="/settings" className="pim-link">Add an API key in Settings</Link>}
            </div>
            <button type="button" className="btn btn-primary pim-go" disabled={!file || !modelKey} onClick={analyze}>
              <Sparkles size={17} /> Build my plan
            </button>
            <p className="pim-fine">Nothing is added to your plan until you approve it. Each analysis is kept as a draft you can reopen.</p>
          </div>
        </section>
      )}

      {stage === 'drop' && recent.length > 0 && (
        <section className="pim-recent">
          <div className="pim-card-head"><History size={16} /> Recent uploads</div>
          <div className="pim-recent-list">
            {recent.map(r => (
              <div key={r.id} role="button" tabIndex={0} className="pim-recent-item" onClick={() => openImport(r.id)}
                onKeyDown={e => { if (e.key === 'Enter') openImport(r.id); }}>
                <FileText size={18} />
                <span className="pim-recent-main">
                  <b>{r.title || r.file_name}</b>
                  <span>{r.file_name} · {r.task_count} tasks · {new Date(r.updated_at).toLocaleDateString([], { month: 'short', day: 'numeric' })}</span>
                </span>
                {r.status === 'applied'
                  ? <span className="pim-recent-status done">Created{r.project_name ? ` · ${r.project_name}` : ''}</span>
                  : <span className="pim-recent-status">Draft</span>}
                <button type="button" className="pim-recent-del" onClick={e => removeImport(e, r.id)} aria-label="Delete saved upload"><Trash2 size={14} /></button>
              </div>
            ))}
          </div>
        </section>
      )}

      {stage === 'analyzing' && (
        <section className="pim-analyze">
          <div className="pim-doc">
            <div className="pim-doc-head">
              <FileText size={18} />
              <span className="pim-doc-name">{file?.name}</span>
              {fileInfo && <span className="pim-doc-meta">{fileInfo.kind.toUpperCase()} · {fileInfo.chars.toLocaleString()} chars{fileInfo.meta?.pages ? ` · ${fileInfo.meta.pages} pages` : ''}</span>}
            </div>
            <pre className="pim-doc-text">{fileInfo?.preview || ' '}</pre>
            <div className="pim-beam" aria-hidden="true" />
          </div>
          <div className="pim-pipeline">
            {STAGES.map((s, i) => {
              const cur = STAGES.findIndex(x => x.id === progress.stage);
              const state = i < cur ? 'done' : i === cur ? 'active' : 'todo';
              return (
                <div key={s.id} className={`pim-step ${state}`}>
                  <span className="pim-step-dot">{state === 'done' ? <Check size={13} /> : state === 'active' ? <Loader2 size={13} className="pim-spin" /> : i + 1}</span>
                  <span className="pim-step-label">{s.label}</span>
                  {s.id === 'structuring' && progress.tasks > 0 && <span className="pim-count">{progress.tasks} tasks</span>}
                </div>
              );
            })}
            <div className="pim-analyze-foot">
              <span><Clock size={13} /> {elapsed}s</span>
              <button type="button" className="btn btn-secondary" onClick={() => abortRef.current?.abort()}><X size={14} /> Cancel</button>
            </div>
            {fileInfo?.truncated && <p className="pim-fine">Long document — I’m planning from the first 60,000 characters.</p>}
          </div>
        </section>
      )}

      {stage === 'studio' && plan && (<>
        <section className="pim-summary">
          <div className="pim-summary-main">
            <div className="pim-kicker">{plan.doc_type || 'Plan'} · from {file?.name}</div>
            <h2 className="pim-plan-title">{plan.title}</h2>
            {plan.summary && <p className="pim-plan-sum">{plan.summary}</p>}
          </div>
          {stats && (
            <div className="pim-stats">
              <div className="pim-stat"><Zap size={15} /><b>{incl.length}</b><span>tasks</span></div>
              <div className="pim-stat"><CalendarRange size={15} /><b>{stats.days}d</b><span>{fmtDay(stats.start)} → {fmtDay(stats.end)}</span></div>
              <div className="pim-stat crit"><Route size={15} /><b>{stats.critical}</b><span>critical path</span></div>
              <div className="pim-stat"><Link2 size={15} /><b>{stats.deps}</b><span>dependencies</span></div>
              <div className="pim-stat"><Bell size={15} /><b>{stats.reminders}</b><span>reminders</span></div>
              <div className="pim-stat"><Clock size={15} /><b>{stats.hours}h</b><span>hands-on</span></div>
              {stats.initiative > 0 && <div className="pim-stat ai"><Sparkles size={15} /><b>{stats.initiative}</b><span>my additions</span></div>}
            </div>
          )}
        </section>

        <section className="pim-grid">
          <div className="pim-card pim-place">
            <div className="pim-card-head"><Target size={16} /> Where it belongs</div>
            <div className="pim-verdict">
              <ConfidenceRing value={plan.placement.confidence} />
              <div>
                <div className="pim-verdict-path">
                  {plan.placement.decision === 'new_category'
                    ? <span className="pim-chip new"><Sparkles size={12} /> New area: {plan.placement.new_category?.name}</span>
                    : <span className="pim-chip">{catName(plan.placement.category_id) || 'New category'}</span>}
                  <ArrowRight size={13} />
                  <strong>{plan.placement.decision === 'existing_project' ? existing.projects.find(p => p.id === plan.placement.project_id)?.name : `New: ${plan.placement.new_project.name}`}</strong>
                </div>
                {plan.placement.reason && <p className="pim-reason">{plan.placement.reason}</p>}
              </div>
            </div>

            <div className="pim-modes" role="tablist" aria-label="Destination">
              <button type="button" role="tab" aria-selected={mode === 'existing'} className={mode === 'existing' ? 'on' : ''} onClick={() => switchMode('existing')} disabled={!existing.projects.length}>
                <FolderKanban size={14} /> Existing project
              </button>
              <button type="button" role="tab" aria-selected={mode === 'new'} className={mode === 'new' ? 'on' : ''} onClick={() => switchMode('new')}>
                <FolderPlus size={14} /> AI’s new project
              </button>
              <button type="button" role="tab" aria-selected={mode === 'own'} className={mode === 'own' ? 'on' : ''} onClick={() => switchMode('own')}>
                <PenLine size={14} /> I’ll set it up
              </button>
            </div>

            {mode === 'existing' ? (
              <div className="pim-form">
                <Picker value={projectId} onChange={setProjectId} options={projectOptions} placeholder="Choose a project…" header="Your projects" />
                {plan.placement.alternatives.length > 0 && (
                  <div className="pim-alts">
                    {plan.placement.alternatives.map(a => (
                      <button type="button" key={a.project_id} className={`pim-alt ${projectId === a.project_id ? 'on' : ''}`} onClick={() => setProjectId(a.project_id)}>
                        <b>{existing.projects.find(p => p.id === a.project_id)?.name}</b><span>{a.reason}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="pim-form">
                <label><span>Project name</span><input className="form-input" value={newProj.name} maxLength={200} onChange={e => setNewProj(p => ({ ...p, name: e.target.value }))} placeholder="Name your project" /></label>
                <label><span>Result — what will be true when it’s done</span><textarea className="form-input" rows={2} value={newProj.result} onChange={e => setNewProj(p => ({ ...p, result: e.target.value }))} /></label>
                <label><span>Purpose — why it matters</span><textarea className="form-input" rows={2} value={newProj.purpose} onChange={e => setNewProj(p => ({ ...p, purpose: e.target.value }))} /></label>
                <div className="pim-cat">
                  <span>Category</span>
                  <Picker value={newProj.newCat ? '__new__' : newProj.category_id} onChange={v => setNewProj(p => ({ ...p, newCat: v === '__new__', category_id: v === '__new__' ? '' : v }))}
                    options={categoryOptions} placeholder="Choose a category…" header="Categories" />
                  {!newProj.newCat && (plan.placement.category_alternatives?.length > 0 || aiArea) && (
                    <div className="pim-alts">
                      {(plan.placement.category_alternatives || []).map(a => (
                        <button type="button" key={a.category_id} className={`pim-alt ${newProj.category_id === a.category_id ? 'on' : ''}`} onClick={() => setNewProj(p => ({ ...p, category_id: a.category_id }))}>
                          <b>{catName(a.category_id)}</b><span>{a.reason || 'also fits'}</span>
                        </button>
                      ))}
                      {aiArea && (
                        <button type="button" className="pim-alt ai" onClick={useAiArea}>
                          <b><Sparkles size={12} /> New area: {aiArea.name}</b><span>I drafted its vision and goals — use it instead</span>
                        </button>
                      )}
                    </div>
                  )}
                  {newProj.newCat && (
                    <div className="pim-area">
                      <div className="pim-area-head">
                        <Compass size={15} /> {mode === 'new' && aiArea ? 'The new area of your life I drafted' : 'Your new area of life'}
                        <span>you can edit all of it later on the category page</span>
                      </div>
                      <label><span>Name</span><input className="form-input" placeholder="e.g. Health, Family, Craft" maxLength={40} value={newProj.new_category_name} onChange={e => setNewProj(p => ({ ...p, new_category_name: e.target.value }))} /></label>
                      <label><span>Ultimate vision</span><textarea className="form-input" rows={2} value={newProj.cat_vision} onChange={e => setNewProj(p => ({ ...p, cat_vision: e.target.value }))} placeholder="What this area of your life looks like at its best" /></label>
                      <label><span>Purpose — why it matters</span><textarea className="form-input" rows={2} value={newProj.cat_purpose} onChange={e => setNewProj(p => ({ ...p, cat_purpose: e.target.value }))} /></label>
                      <label><span>Your roles here</span><input className="form-input" value={newProj.cat_roles} maxLength={200} onChange={e => setNewProj(p => ({ ...p, cat_roles: e.target.value }))} placeholder="e.g. Athlete, Coach" /></label>
                      <div className="pim-area-goals">
                        <label><span>1-year goals <i>one per line</i></span><textarea className="form-input" rows={4} value={newProj.cat_1y} onChange={e => setNewProj(p => ({ ...p, cat_1y: e.target.value }))} /></label>
                        <label><span>90-day goals <i>one per line</i></span><textarea className="form-input" rows={4} value={newProj.cat_90} onChange={e => setNewProj(p => ({ ...p, cat_90: e.target.value }))} /></label>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
            {keyResults.length > 0 && (
              <div className="pim-krs pim-krs-all">
                <span>Key results I suggest{mode === 'existing' ? ' for this project' : ''}</span>
                {keyResults.map((k, i) => (
                  <label key={i} className="pim-kr">
                    <input type="checkbox" checked={k.include !== false} onChange={e => setKeyResults(ks => ks.map((x, j) => (j === i ? { ...x, include: e.target.checked } : x)))} />
                    <span>{k.title}{k.target_value != null ? ` — ${k.target_value}${k.unit ? ` ${k.unit}` : ''}` : ''}{k.target_date ? ` by ${fmtDay(k.target_date)}` : ''}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          <div className="pim-card pim-insights">
            <div className="pim-card-head"><Lightbulb size={16} /> I noticed</div>
            {plan.insights.length === 0 && <p className="pim-empty">The document is clear — no gaps or risks that I could see.</p>}
            {plan.insights.map((ins, i) => {
              const Icon = INSIGHT_ICON[ins.type] || Lightbulb;
              return (
                <div key={i} className={`pim-insight ${ins.type}`}>
                  <Icon size={15} />
                  <p>{ins.text}</p>
                  {ins.type !== 'question' && (
                    <button type="button" className="pim-mini" onClick={() => addInsightTask(ins.text)} title="Add a task for this"><Plus size={13} /> Task</button>
                  )}
                </div>
              );
            })}
            {stats?.late > 0 && (
              <div className="pim-insight risk"><AlertTriangle size={15} /><p>{stats.late} task{stats.late > 1 ? 's end' : ' ends'} after {stats.late > 1 ? 'their deadlines' : 'its deadline'} — look for the red flags on the timeline.</p></div>
            )}
          </div>
        </section>

        <section className="pim-tl-card">
          <div className="pim-tl-bar">
            <div className="pim-seg" role="tablist" aria-label="View">
              <button type="button" className={view === 'timeline' ? 'on' : ''} onClick={() => setView('timeline')}><GanttChart size={14} /> Timeline</button>
              <button type="button" className={view === 'list' ? 'on' : ''} onClick={() => setView('list')}><List size={14} /> List</button>
            </div>
            {view === 'timeline' && (
              <div className="pim-seg" role="tablist" aria-label="Zoom">
                {['day', 'week', 'month'].map(z => (
                  <button key={z} type="button" className={zoom === z ? 'on' : ''} onClick={() => setZoom(z)}>{z[0].toUpperCase() + z.slice(1)}s</button>
                ))}
              </div>
            )}
            <button type="button" className={`pim-toggle ${spotlight ? 'on' : ''}`} onClick={() => setSpotlight(s => !s)} aria-pressed={spotlight}>
              <Route size={14} /> Critical path
            </button>
            <div className="pim-legend">
              <span><i className="lg p3" />High</span><span><i className="lg p2" />Medium</span><span><i className="lg p1" />Low</span>
              <span><i className="lg ai" />My addition</span>
            </div>
          </div>
          <p className="pim-hint">Drag a bar (or focus it and use ← →) to move it — everything after it re-flows. Click a task to edit.</p>

          {view === 'timeline' ? (
            <ErrorBoundary name="plan-timeline" resetKey={tasks} message="The timeline couldn't be drawn — try the List view.">
              <PlanTimeline tasks={scheduled} phases={phases} today={today} zoom={zoom} spotlight={spotlight}
                selectedKey={editing} onPin={pinTask} onOpen={setEditing} />
            </ErrorBoundary>
          ) : (
            <div className={`pli ${spotlight ? 'spotlight' : ''}`}>
              {phases.map(ph => {
                const mine = scheduled.filter(t => t.phase === ph.key).sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));
                if (!mine.length) return null;
                return (
                  <div key={ph.key} className="pli-phase">
                    <div className="pli-phase-head"><Layers size={14} /><b>{ph.title}</b><span>{mine.length} tasks</span></div>
                    {mine.map(t => (
                      <button type="button" key={t.key} className={`pli-task p${t.priority} ${t.critical && t.include ? 'critical' : ''} ${!t.include ? 'excluded' : ''} ${t.source === 'initiative' ? 'initiative' : ''}`} onClick={() => setEditing(t.key)}>
                        <span className="pli-when"><b>{fmtDay(t.start)}</b>{t.span_days > 1 && <em>→ {fmtDay(t.end)}</em>}</span>
                        <span className="pli-body">
                          <span className="pli-title">{t.source === 'initiative' && <Sparkles size={12} />} {t.title}</span>
                          <span className="pli-chips">
                            <i>{t.size}</i><i>{t.effort_minutes >= 60 ? `${Math.round(t.effort_minutes / 6) / 10}h` : `${t.effort_minutes}m`}</i>
                            {t.depends_on.length > 0 && <i><Link2 size={10} /> after {t.depends_on.length}</i>}
                            {t.reminder && <i><Bell size={10} /> {t.reminder.time}</i>}
                            {t.late && <i className="late">past deadline</i>}
                          </span>
                        </span>
                      </button>
                    ))}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <footer className="pim-footer">
          <label className="pim-opt">
            <input type="checkbox" checked={createBlocks} onChange={e => setCreateBlocks(e.target.checked)} />
            <span>Make each phase an RPM block</span>
          </label>
          <div className="pim-footer-main">
            <span className="pim-footer-sum">
              {incl.length} task{incl.length === 1 ? '' : 's'}{createBlocks ? ` · ${phases.filter(ph => incl.some(t => t.phase === ph.key)).length} blocks` : ''}{stats ? ` · ${stats.reminders} reminders` : ''} → <b>{destination || 'choose a project'}</b>
            </span>
            {saveState && <span className="pim-saved">{saveState === 'saving' ? 'Saving draft…' : 'Draft saved'}</span>}
            <button type="button" className="btn btn-secondary" onClick={reset}><RotateCcw size={14} /> Start over</button>
            <button type="button" className="btn btn-primary pim-create" onClick={apply} disabled={applying || !incl.length}>
              {applying ? <Loader2 size={16} className="pim-spin" /> : <Check size={16} />} Create plan
            </button>
          </div>
        </footer>

        {editingTask && (
          <TaskEditor task={editingTask} tasks={scheduled} phases={phases} onChange={updateTask} onClose={() => setEditing(null)} />
        )}
      </>)}

      {stage === 'done' && result && (
        <section className="pim-done">
          <div className="pim-burst" aria-hidden="true"><Check size={42} /></div>
          <h2>Your plan is live.</h2>
          <p>
            {result.counts.actions} tasks{result.counts.blocks ? `, ${result.counts.blocks} RPM blocks` : ''}
            {result.counts.dependencies ? `, ${result.counts.dependencies} dependencies` : ''}{result.counts.reminders ? `, ${result.counts.reminders} reminders` : ''}
            {result.counts.key_results ? `, ${result.counts.key_results} key results` : ''} — {result.created_category ? `in a brand-new project and a new area of your life, “${newProj.new_category_name}”.` : result.created_project ? 'in a brand-new project.' : `added to ${chosenProject?.name || 'your project'}.`}
          </p>
          <div className="pim-done-actions">
            <Link to={`${result.link}?view=timeline`} className="btn btn-primary"><GanttChart size={16} /> Open the timeline</Link>
            <Link to={result.link} className="btn btn-secondary"><FolderKanban size={16} /> Open the project</Link>
            {result.created_category && <Link to={`/categories/${result.category_id}`} className="btn btn-secondary"><Compass size={16} /> See the new area</Link>}
            <Link to="/calendar" className="btn btn-secondary"><CalendarRange size={16} /> See it on the calendar</Link>
            <button type="button" className="btn btn-secondary" onClick={reset}><FileUp size={16} /> Plan another file</button>
          </div>
        </section>
      )}
    </div>
  );
}
