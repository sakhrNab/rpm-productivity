// Missions: "Tell the agents what to do". A task in plain words -> a tool-less planner turns it into a plan of
// steps (capabilities) -> you approve -> the local runner works the steps (in parallel where independent) once the
// apps they need are connected. The plan is drawn as a small flow canvas: one node per step, glowing wires along
// "depends on". RPM never runs anything; every change goes through /api/business/missions.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Sparkles, Play, XCircle, Check, X, ShieldAlert, FileText, Link2, Eye, CircleDollarSign, PenLine, Loader2, History, Wand2,
} from 'lucide-react';
import FlowLinks, { useMedia } from '../FlowLinks';
import { useToast } from '../ToastProvider';
import { useBizApi } from './bizKit';

const APP_LABEL = { leadwave: 'LeadWave', raven: 'Raven', rpm: 'RPM', browser: 'Browser' };
const RISK = {
  read: { tone: '', Icon: Eye, label: 'reads only' },
  draft: { tone: 'info', Icon: PenLine, label: 'drafts files' },
  paid: { tone: 'warn', Icon: CircleDollarSign, label: 'costs money' },
  'outward-read': { tone: 'warn', Icon: Eye, label: 'reads your browser' },
};
const RUN_TONE = { queued: 'info', running: 'ai', done: 'good', failed: 'bad', cancelled: '' };
const MISSION_TONE = { planning: 'ai', awaiting_approval: 'warn', running: 'ai', done: 'good', failed: 'bad', cancelled: '' };
const MISSION_LABEL = { planning: 'planning', awaiting_approval: 'needs approval', running: 'running', done: 'done', failed: 'failed', cancelled: 'cancelled' };
const OPEN = ['planning', 'awaiting_approval', 'running'];

const effectiveRisk = (cap, inputs) => (cap?.confirm && Object.entries(cap.confirm.when).every(([k, v]) => inputs?.[k] === v) ? cap.confirm.risk : cap?.risk);
const needsConfirm = (cap, inputs) => ['paid', 'outward-read'].includes(effectiveRisk(cap, inputs));

const ago = (iso) => {
  if (!iso) return '';
  const s = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} d ago`;
};

/** depth = longest dependency chain above a step; order = plan order. */
function layout(steps) {
  const byKey = Object.fromEntries(steps.map((s) => [s.key, s]));
  const depth = {};
  const d = (k, seen = new Set()) => {
    if (depth[k] !== undefined) return depth[k];
    if (seen.has(k)) return 0;
    seen.add(k);
    const deps = (byKey[k]?.depends_on || []).filter((x) => byKey[x]);
    depth[k] = deps.length ? 1 + Math.max(...deps.map((x) => d(x, seen))) : 0;
    return depth[k];
  };
  steps.forEach((s) => d(s.key));
  const cols = [];
  steps.forEach((s) => { (cols[depth[s.key]] ||= []).push(s); });
  return { cols: cols.filter(Boolean), depth };
}

/** Steps that cannot run: the ones with a missing app, and everything that needs them. */
function blockedClosure(steps, missingOf) {
  const out = new Set(steps.filter((s) => missingOf(s).length).map((s) => s.key));
  for (let changed = true; changed;) {
    changed = false;
    for (const s of steps) if (!out.has(s.key) && s.depends_on.some((k) => out.has(k))) { out.add(s.key); changed = true; }
  }
  return out;
}

function StepNode({ step, cap, run, apps, mode, confirmed, onConfirm, onOpenRun, dependsTitles, dim, missing, excluded }) {
  const risk = effectiveRisk(cap, step.inputs);
  const R = RISK[risk] || RISK.read;
  const must = needsConfirm(cap, step.inputs);
  const shown = Object.entries(step.inputs || {}).filter(([k, v]) => v !== '' && v !== cap?.inputs?.find((f) => f.key === k)?.default);
  const status = run?.status || (mode === 'plan' ? null : 'not run');
  const files = run?.outbox || [];
  return (
    <article data-node={`ms:${step.key}`} className={`bz-ms-node ${run ? `st-${run.status}` : ''} ${missing.length ? 'blocked' : ''} ${dim ? 'is-dim' : ''}`}>
      <header>
        <b className="bz-ms-title">{cap?.title || step.capability}</b>
        {status && <span className={`bz-run-pill ${RUN_TONE[status] || ''}`}>{status}</span>}
      </header>
      <p className="bz-ms-why">{step.why}</p>
      {shown.length > 0 && <p className="bz-ms-in" title={shown.map(([k, v]) => `${k}: ${v}`).join(' · ')}>{shown.map(([k, v]) => `${k}: ${String(v).replace('_', ' ')}`).join(' · ')}</p>}
      {dependsTitles.length > 0 && <p className="bz-ms-after"><Link2 size={12} /> after {dependsTitles.join(', ')}</p>}
      <div className="bz-ms-chips">
        {(cap?.needsApps || []).map((a) => (apps?.[a]
          ? <span key={a} className="ui-chip ui-chip--good" title={`${APP_LABEL[a]} is connected`}><Check size={12} /> {APP_LABEL[a]}</span>
          : <span key={a} className="ui-chip ui-chip--bad" title={`${APP_LABEL[a]} is not connected on your runner`}><X size={12} /> connect {APP_LABEL[a]} first</span>))}
        <span className={`ui-chip ${R.tone ? `ui-chip--${R.tone}` : ''}`} title={`Risk: ${risk}`}><R.Icon size={12} /> {R.label}</span>
      </div>
      {excluded && <p className="bz-ms-skip"><X size={12} /> left out if the blocked steps are skipped</p>}
      {mode === 'plan' && must && !missing.length && !excluded && (
        <label className="bz-ms-confirm">
          <input type="checkbox" checked={!!confirmed} onChange={(e) => onConfirm(e.target.checked)} />
          <span><ShieldAlert size={13} /> {risk === 'paid' ? (cap.confirm?.text || 'This step costs money.') : 'I allow this step to read pages in my logged-in browser. It cannot click, type or send.'}</span>
        </label>
      )}
      {run && run.status === 'failed' && run.summary && <p className="bz-ms-err" title={run.summary}>{run.summary.slice(0, 160)}</p>}
      {files.length > 0 && (
        <ul className="bz-ms-files">
          {files.slice(0, 4).map((f) => (
            <li key={f.name}><button type="button" className="bz-ms-file" title={`Open ${f.name}`} onClick={() => onOpenRun(run)}><FileText size={12} /> {f.name}</button></li>
          ))}
          {files.length > 4 && <li><button type="button" className="bz-ms-file" onClick={() => onOpenRun(run)}>+{files.length - 4} more</button></li>}
        </ul>
      )}
    </article>
  );
}

function Canvas({ steps, capOf, runs, apps, mode, confirmed, setConfirmed, onOpenRun, missingOf, excludedKeys, phone }) {
  const [root, setRoot] = useState(null);
  const { cols } = useMemo(() => layout(steps), [steps]);
  const titleOf = (k) => capOf(steps.find((s) => s.key === k)?.capability)?.title || k;
  const links = useMemo(() => steps.flatMap((s) => s.depends_on.map((d) => {
    const from = runs[d]?.status;
    const to = runs[s.key]?.status;
    const tone = to === 'failed' || from === 'failed' ? 'bad' : from === 'done' ? (to === 'running' ? 'ai' : 'good') : mode === 'plan' ? 'info' : 'dim';
    return { id: `${d}>${s.key}`, from: `ms:${d}`, to: `ms:${s.key}`, tone, weight: 2.4, dashed: mode === 'plan' || !from || from === 'queued', idle: !(to === 'running' || (from === 'done' && to === 'queued')) };
  })), [steps, runs, mode]);
  const version = `${steps.map((s) => s.key).join(',')}|${steps.map((s) => runs[s.key]?.status || '-').join(',')}|${[...excludedKeys].join(',')}|${phone}|${mode}`;
  const node = (s) => (
    <StepNode key={s.key} step={s} cap={capOf(s.capability)} run={runs[s.key]} apps={apps} mode={mode}
      confirmed={confirmed[s.key]} onConfirm={(v) => setConfirmed((c) => ({ ...c, [s.key]: v }))} onOpenRun={onOpenRun}
      dependsTitles={s.depends_on.map(titleOf)} dim={mode !== 'plan' && !runs[s.key]} missing={missingOf(s)} excluded={excludedKeys.has(s.key)} />
  );
  if (phone) {
    // vertical spine, one column, no wires: each step right after the steps it needs (a chain reads top to bottom)
    const order = [];
    const seen = new Set();
    const visit = (st) => {
      if (seen.has(st.key)) return;
      seen.add(st.key);
      st.depends_on.forEach((k) => { const d = steps.find((x) => x.key === k); if (d) visit(d); });
      order.push(st);
    };
    steps.forEach(visit);
    return <div className="bz-ms-spine">{order.map(node)}</div>;
  }
  return (
    <div className="bz-ms-canvas" ref={setRoot} style={{ gridTemplateColumns: `repeat(${cols.length}, minmax(0, 1fr))` }}>
      <FlowLinks root={root} links={links} version={version} />
      {cols.map((col, i) => <div className="bz-ms-col" key={i}>{col.map(node)}</div>)}
    </div>
  );
}

export default function MissionDeck({ caps, runner, onOpenRun }) {
  const biz = useBizApi();
  const { showToast } = useToast();
  const phone = useMedia('(max-width: 900px)');
  const [text, setText] = useState('');
  const [missions, setMissions] = useState(null);
  const [activeId, setActiveId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [liveRunner, setLiveRunner] = useState(runner);
  const [confirmed, setConfirmed] = useState({});
  const [busy, setBusy] = useState(null);
  const firstLoad = useRef(true);
  const apps = (liveRunner || runner)?.apps || {};
  const capOf = useCallback((id) => caps?.find((c) => c.id === id), [caps]);

  const refreshList = useCallback(async () => {
    try {
      const r = await biz.current.missions();
      setMissions(r.missions);
      if (r.runner) setLiveRunner(r.runner);
      if (firstLoad.current) {
        firstLoad.current = false;
        const open = r.missions.find((m) => OPEN.includes(m.status));
        if (open) setActiveId(open.id);
      }
    } catch (e) { setMissions((m) => m || []); if (firstLoad.current) showToast(e.message, 'error'); }
  }, [biz]); // eslint-disable-line react-hooks/exhaustive-deps
  const refreshDetail = useCallback(async (id) => {
    try { setDetail(await biz.current.mission(id)); } catch (e) { if (e.status === 404) { setActiveId(null); setDetail(null); } }
  }, [biz]);

  useEffect(() => { refreshList(); }, [refreshList]);
  useEffect(() => { setDetail(null); setConfirmed({}); if (activeId) refreshDetail(activeId); }, [activeId, refreshDetail]);
  const status = detail?.status;
  useEffect(() => {
    // fast while something is happening, slow otherwise
    const fast = status === 'planning' || status === 'running';
    const t = setInterval(() => { if (document.hidden) return; refreshList(); if (activeId && (fast || status === 'awaiting_approval')) refreshDetail(activeId); }, fast ? 2500 : 8000);
    return () => clearInterval(t);
  }, [activeId, status, refreshList, refreshDetail]);

  const plan = detail?.plan;
  const planSteps = plan?.steps || [];
  const runs = useMemo(() => Object.fromEntries((detail?.steps || []).map((r) => [r.step_key, r])), [detail]);
  const missingOf = useCallback((s) => (capOf(s.capability)?.needsApps || []).filter((a) => !apps[a]), [capOf, apps]);
  const blocked = useMemo(() => blockedClosure(planSteps, missingOf), [planSteps, missingOf]);
  const hardBlocked = planSteps.filter((s) => missingOf(s).length);
  const runnable = planSteps.filter((s) => !blocked.has(s.key));
  const unconfirmed = (list) => list.filter((s) => needsConfirm(capOf(s.capability), s.inputs) && !confirmed[s.key]);

  const create = async () => {
    if (text.trim().length < 5 || busy) return;
    setBusy('create');
    try {
      const m = await biz.current.createMission(text.trim());
      setText('');
      setActiveId(m.id);
      setDetail(m);
      refreshList();
    } catch (e) { showToast(e.message, 'error'); } finally { setBusy(null); }
  };
  const approve = async (list) => {
    setBusy('approve');
    try {
      const d = await biz.current.approveMission(detail.id, list.map((s) => ({ key: s.key, confirmed: !!confirmed[s.key] })));
      setDetail(d);
      refreshList();
      showToast('Approved — your runner starts the steps', 'success');
    } catch (e) { showToast(e.message, 'error'); refreshDetail(detail.id); } finally { setBusy(null); }
  };
  const cancel = async () => {
    setBusy('cancel');
    try { setDetail(await biz.current.cancelMission(detail.id)); refreshList(); showToast('Mission cancelled', 'success'); }
    catch (e) { showToast(e.message, 'error'); refreshDetail(detail.id); } finally { setBusy(null); }
  };

  const online = (liveRunner || runner)?.last_claim_at && Date.now() - Date.parse((liveRunner || runner).last_claim_at) < 3 * 60 * 1000;
  const open = (detail && OPEN.includes(detail.status));
  const past = (missions || []).filter((m) => m.id !== activeId).slice(0, 8);
  const doneN = (detail?.steps || []).filter((r) => r.status === 'done').length;
  const cost = (detail?.steps || []).reduce((n, r) => n + (r.cost_usd || 0), 0) + (detail?.plan_run?.cost_usd || 0);

  return (
    <section className="bz-ms" aria-label="Missions">
      <div className="bz-ms-box">
        <div className="bz-ms-boxhead">
          <span className="bz-ms-ic" aria-hidden="true"><Wand2 size={18} /></span>
          <div><h3>Tell the agents what to do</h3><p>Describe the task in plain words. A planner with no tools turns it into steps; nothing runs until you approve.</p></div>
        </div>
        <textarea className="bz-in bz-ms-text" rows={2} maxLength={2000} value={text} placeholder="e.g. Give me my morning brief, then draft two Skool posts from it"
          aria-label="Mission" onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); create(); } }} />
        <div className="bz-ms-boxfoot">
          <small className="bz-muted">{text.trim().length < 5 ? 'At least 5 characters' : `${text.trim().length}/2000`}{phone ? '' : ' · ⌘/Ctrl + Enter plans'}</small>
          <button type="button" className="btn btn-primary" disabled={text.trim().length < 5 || busy === 'create'} onClick={create}>
            {busy === 'create' ? <Loader2 size={15} className="bz-spin" /> : <Sparkles size={15} />} {busy === 'create' ? 'Planning…' : 'Plan'}
          </button>
        </div>
      </div>

      {detail && (
        <div className={`bz-ms-card st-${detail.status}`} aria-live="polite">
          <header className="bz-ms-cardhead">
            <div className="bz-ms-cardtext">
              <p className="ui-kicker"><Sparkles size={14} /> Mission <span className={`bz-run-pill ${MISSION_TONE[detail.status] || ''}`}>{MISSION_LABEL[detail.status]}</span></p>
              <h3 className="bz-ms-task">{detail.text}</h3>
              {plan?.summary && <p className="bz-ms-sum">{plan.summary}</p>}
            </div>
            <div className="bz-ms-cardact">
              {open && <button type="button" className="btn btn-ghost btn-danger-ghost" disabled={busy === 'cancel'} onClick={cancel}><XCircle size={15} /> Cancel mission</button>}
              <button type="button" className="btn btn-ghost" onClick={() => { setActiveId(null); setDetail(null); }}>Close</button>
            </div>
          </header>

          {detail.status === 'planning' && (
            <div className="bz-ms-planning" role="status">
              <span className="bz-ms-pulse" aria-hidden="true"><i /><i /><i /></span>
              <p>{online ? 'The planner is working out the steps…' : 'Waiting for your runner to pick this up — start the dashboard on your Mac.'}</p>
            </div>
          )}

          {(detail.status === 'failed' && !planSteps.length) && (
            <p className="bz-ms-fail"><X size={14} /> {plan?.error || detail.plan_run?.summary || 'The mission failed.'}</p>
          )}
          {detail.status === 'cancelled' && !planSteps.length && <p className="bz-muted bz-pad">Cancelled before a plan existed.</p>}

          {planSteps.length > 0 && (
            <>
              <Canvas steps={planSteps} capOf={capOf} runs={runs} apps={apps} mode={detail.status === 'awaiting_approval' ? 'plan' : 'run'}
                confirmed={confirmed} setConfirmed={setConfirmed} onOpenRun={onOpenRun} missingOf={missingOf} phone={phone}
                excludedKeys={detail.status === 'awaiting_approval' ? new Set([...blocked].filter((k) => !hardBlocked.some((s) => s.key === k))) : new Set()} />

              {detail.status === 'awaiting_approval' && (
                <footer className="bz-ms-approve">
                  {hardBlocked.length > 0 && (
                    <p className="bz-ms-blocknote"><ShieldAlert size={15} /> {hardBlocked.map((s) => (capOf(s.capability)?.title || s.key)).join(', ')} {hardBlocked.length > 1 ? 'need' : 'needs'} {[...new Set(hardBlocked.flatMap(missingOf))].map((a) => APP_LABEL[a]).join(' and ')} connected before {hardBlocked.length > 1 ? 'they' : 'it'} can start.</p>
                  )}
                  <div className="bz-ms-btns">
                    <button type="button" className="btn btn-primary" disabled={busy === 'approve' || hardBlocked.length > 0 || unconfirmed(planSteps).length > 0}
                      title={hardBlocked.length ? 'Connect the missing apps first, or run without the blocked steps' : unconfirmed(planSteps).length ? 'Tick the confirmation on each marked step' : ''}
                      onClick={() => approve(planSteps)}><Play size={15} /> Approve {planSteps.length} step{planSteps.length === 1 ? '' : 's'}</button>
                    {hardBlocked.length > 0 && (
                      <button type="button" className="btn btn-ghost" disabled={busy === 'approve' || !runnable.length || unconfirmed(runnable).length > 0}
                        title={!runnable.length ? 'Nothing can run without the blocked steps' : ''} onClick={() => approve(runnable)}>
                        <Play size={15} /> Run without blocked steps ({runnable.length})
                      </button>
                    )}
                    <button type="button" className="btn btn-ghost btn-danger-ghost" disabled={busy === 'cancel'} onClick={cancel}><XCircle size={15} /> Reject</button>
                  </div>
                  {unconfirmed(hardBlocked.length ? runnable : planSteps).length > 0 && <small className="bz-muted">Tick the confirmation on {unconfirmed(hardBlocked.length ? runnable : planSteps).length} marked step{unconfirmed(hardBlocked.length ? runnable : planSteps).length === 1 ? '' : 's'} to continue.</small>}
                </footer>
              )}
              {detail.status !== 'awaiting_approval' && (
                <p className="bz-ms-prog">
                  {detail.status === 'running' ? <span className="bz-live-dot" aria-hidden="true" /> : null}
                  {doneN} of {detail.steps.length} step{detail.steps.length === 1 ? '' : 's'} done{cost > 0 ? ` · $${cost.toFixed(2)}` : ''}
                  {detail.status === 'running' && !online ? ' · waiting for your runner' : ''}
                </p>
              )}
            </>
          )}
        </div>
      )}

      {past.length > 0 && (
        <div className="bz-ms-past" aria-label="Past missions">
          <p className="bz-col-title"><History size={13} /> Past missions</p>
          <ul>
            {past.map((m) => (
              <li key={m.id}>
                <button type="button" className="bz-ms-pastrow" onClick={() => setActiveId(m.id)} title={m.text}>
                  <span className={`bz-run-pill ${MISSION_TONE[m.status] || ''}`}>{MISSION_LABEL[m.status]}</span>
                  <span className="bz-ms-pasttext">{m.text}</span>
                  <small>{(m.steps || []).length} step{(m.steps || []).length === 1 ? '' : 's'} · {ago(m.finished_at || m.created_at)}</small>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
