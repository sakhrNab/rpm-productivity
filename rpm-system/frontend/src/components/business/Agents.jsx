// Agents: the control centre for the owner's LOCAL agents. RPM never runs a job — it queues one, the local
// runner (an access token with write scope) claims it and reports back, and this page shows the result:
// job → run → outbox → leads / results, wired. Runs refresh every 5 s.
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Bot, Sunrise, Search, Users, MessagesSquare, Inbox, RefreshCw, CalendarDays, Play, XCircle, FileText, UserPlus,
  BarChart3, ShieldAlert, Clock, Check, Wifi, WifiOff,
} from 'lucide-react';
import Picker from '../Picker';
import ModalHead from '../modals/ModalHead';
import Markdown from '../Markdown';
import FlowLinks, { connected, useMedia } from '../FlowLinks';
import { useToast } from '../ToastProvider';
import { LensHead, Loading, useBiz, useBizApi } from './bizKit';
import { fmtDate } from './bizConfig';

const ICON = { sunrise: Sunrise, search: Search, users: Users, messages: MessagesSquare, inbox: Inbox, refresh: RefreshCw, calendar: CalendarDays };
const STATUS_TONE = { queued: 'info', running: 'ai', done: 'good', failed: 'bad', cancelled: '' };
const FRESH = 3 * 60 * 1000;

export const ago = (iso) => {
  if (!iso) return '';
  const s = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} d ago`;
};

/** Leads in an outbox preview: CSV with a name column, a markdown table, or "- Name — why" lines. */
export function parseLeads(text) {
  const lines = String(text || '').split('\n').map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return [];
  const splitCsv = (l) => { const out = []; let cur = ''; let q = false; for (const ch of l) { if (ch === '"') q = !q; else if (ch === ',' && !q) { out.push(cur.trim()); cur = ''; } else cur += ch; } out.push(cur.trim()); return out; };
  const table = lines.filter((l) => l.startsWith('|'));
  if (table.length >= 2) {
    const cells = (l) => l.replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
    const head = cells(table[0]).map((h) => h.toLowerCase());
    const ni = Math.max(0, head.findIndex((h) => /name|company|business|job/.test(h)));
    const wi = head.findIndex((h) => /why|note|fit|reason/.test(h));
    return table.slice(1).filter((l) => !/^\|?\s*:?-{2,}/.test(l)).map((l) => { const c = cells(l); return { name: c[ni], why: wi >= 0 ? c[wi] : c.filter((_, i) => i !== ni).join(' · ') }; }).filter((x) => x.name);
  }
  const head = splitCsv(lines[0]).map((h) => h.toLowerCase());
  if (lines.length > 1 && head.includes('name')) {
    const ni = head.indexOf('name'); const si = head.indexOf('source'); const wi = head.findIndex((h) => /why|note|reason/.test(h));
    return lines.slice(1).map((l) => { const c = splitCsv(l); return { name: c[ni], source: si >= 0 ? c[si] : '', why: wi >= 0 ? c.slice(wi).join(', ') : '' }; }).filter((x) => x.name);
  }
  return lines.filter((l) => /^[-*•]\s+/.test(l)).map((l) => {
    const t = l.replace(/^[-*•]\s+/, '');
    const [name, ...rest] = t.split(/\s+[—–-]\s+/);
    return { name: name.replace(/\*\*/g, '').trim(), why: rest.join(' — ') };
  }).filter((x) => x.name);
}

export default function Agents() {
  const ctx = useBiz();
  const biz = useBizApi();
  const { showToast } = useToast();
  const [jobs, setJobs] = useState(null);
  const [runs, setRuns] = useState(null);
  const [runner, setRunner] = useState(null);
  const [inputs, setInputs] = useState({});
  const [confirmJob, setConfirmJob] = useState(null);
  const [busy, setBusy] = useState(null);
  const [openId, setOpenId] = useState(() => ctx.params.get('focus'));
  const [root, setRoot] = useState(null);
  const [hover, setHover] = useState(null);
  const [, tick] = useState(0);
  const phone = useMedia('(max-width: 1000px)');
  const wantJob = ctx.params.get('job');

  const load = useCallback(async () => {
    try { const r = await biz.current.agentRuns(); setRuns(r.runs); setRunner(r.runner); }
    catch (e) { setRuns((x) => x || []); if (!jobs) showToast(e.message, 'error'); }
  }, [biz]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    biz.current.agentJobs().then((r) => { setJobs(r.jobs); setRunner(r.runner); }).catch((e) => { setJobs([]); showToast(e.message, 'error'); });
    load();
    const t = setInterval(() => { if (!document.hidden) load(); tick((n) => n + 1); }, 5000);
    return () => clearInterval(t);
  }, [load]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (wantJob && jobs) document.querySelector(`[data-node="job:${wantJob}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [wantJob, jobs]);

  const valueOf = (job, f) => inputs[job.id]?.[f.key] ?? f.default;
  const setVal = (job, key, v) => setInputs((s) => ({ ...s, [job.id]: { ...(s[job.id] || {}), [key]: v } }));
  const queue = async (job, confirmed = false) => {
    const body = Object.fromEntries(job.inputs.map((f) => [f.key, valueOf(job, f)]));
    setBusy(job.id);
    try {
      const run = await biz.current.queueRun(job.id, body, confirmed);
      setRuns((rs) => [run, ...(rs || [])]);
      setConfirmJob(null);
      ctx.changed();
      showToast(`${job.title} queued — your runner picks it up`, 'success');
      ctx.undo.push({ message: `Queued ${job.title}`, undo: async () => { await biz.current.cancelRun(run.id); load(); } });
    } catch (e) {
      if (e.data?.needs_confirmation) setConfirmJob(job.id);
      else showToast(e.message, 'error');
    } finally { setBusy(null); }
  };
  const cancel = async (run) => {
    try { const r = await biz.current.cancelRun(run.id); setRuns((rs) => rs.map((x) => (x.id === r.id ? r : x))); ctx.changed(); showToast('Run cancelled', 'success'); }
    catch (e) { showToast(e.message, 'error'); load(); }
  };

  const shown = (runs || []).slice(0, 12);
  const links = useMemo(() => shown.map((r) => ({
    id: `l${r.id}`, from: `job:${r.job_id}`, to: `run:${r.id}`,
    tone: r.status === 'failed' ? 'bad' : r.status === 'done' ? 'good' : r.status === 'cancelled' ? 'dim' : 'ai',
    idle: r.status !== 'running' && r.status !== 'queued', dashed: r.status === 'queued' || r.status === 'cancelled', weight: r.status === 'running' ? 3 : 2,
  })), [runs]); // eslint-disable-line react-hooks/exhaustive-deps
  const hot = hover ? connected(links, hover) : null;
  if (!jobs || !runs) return <Loading />;

  const online = runner?.last_claim_at && Date.now() - Date.parse(runner.last_claim_at) < FRESH;
  const jobOf = (id) => jobs.find((j) => j.id === id);
  const opened = openId ? runs.find((r) => r.id === openId) : null;
  const running = runs.filter((r) => r.status === 'running').length;
  const queued = runs.filter((r) => r.status === 'queued').length;
  const headline = running || queued
    ? [running && `${running} running`, queued && `${queued} queued${online ? '' : ' — waiting for your runner'}`].filter(Boolean).join(' · ')
    : 'Your local agents';

  return (
    <section className="bz-lens bz-agents">
      <LensHead icon={Bot} kicker="Agents" title={headline}
        read="RPM queues jobs and shows what comes back. Your local runner does the work — nothing runs here, nothing is sent.">
        <span className={`bz-runner ${online ? 'on' : ''}`} title={runner ? `Last claim ${new Date(runner.last_claim_at).toLocaleString()}` : 'The runner has never connected'}>
          {online ? <Wifi size={15} /> : <WifiOff size={15} />}
          {online ? `Runner online · checked in ${ago(runner.last_claim_at)}` : runner ? `Runner offline · last check-in ${ago(runner.last_claim_at)}` : 'No runner connected yet'}
          {runner?.runner && <em>{runner.runner}</em>}
        </span>
      </LensHead>

      <div className={`bz-agents-grid ${phone ? '' : 'wired'}`} ref={setRoot}>
        {!phone && <FlowLinks root={root} links={links} active={hot && hot.size ? hot : null} />}
        <div className="bz-jobs" aria-label="Jobs">
          {jobs.map((job) => {
            const Icon = ICON[job.icon] || Bot;
            const needs = job.confirm && Object.entries(job.confirm.when).every(([k, v]) => valueOf(job, { key: k, default: job.inputs.find((f) => f.key === k)?.default }) === v);
            return (
              <article key={job.id} data-node={`job:${job.id}`} className={`bz-job ${wantJob === job.id ? 'flash' : ''} ${hover && hot?.size && !links.some((l) => hot.has(l.id) && l.from === `job:${job.id}`) ? 'is-dim' : ''}`}
                onMouseEnter={() => setHover(`job:${job.id}`)} onMouseLeave={() => setHover(null)}>
                <header className="bz-job-head">
                  <span className="bz-job-ic" aria-hidden="true"><Icon size={18} /></span>
                  <div><h3>{job.title}</h3><p>{job.what}</p></div>
                </header>
                {job.inputs.length > 0 ? (
                  <div className="bz-job-inputs">
                    {job.inputs.map((f) => (
                      <label key={f.key} className="bz-job-field"><span>{f.label}</span>
                        {f.type === 'choice'
                          ? <Picker value={valueOf(job, f)} header={f.label} options={f.options.map((o) => ({ value: o, label: o.replace('_', ' ') }))} onChange={(v) => setVal(job, f.key, v)} />
                          : <input className="bz-in" value={valueOf(job, f)} maxLength={f.max || 200} onChange={(e) => setVal(job, f.key, e.target.value)} />}
                      </label>
                    ))}
                  </div>
                ) : <p className="bz-job-noin">No inputs — it reads RPM and your plan.</p>}
                <footer className="bz-job-foot">
                  <span className="bz-job-out">{job.outputs.map((o) => <span key={o}><FileText size={12} /> {o}</span>)}</span>
                  {needs && <span className="ui-chip ui-chip--warn"><ShieldAlert size={12} /> paid source</span>}
                  <button type="button" className="btn btn-primary bz-job-go" disabled={busy === job.id} onClick={() => queue(job)}><Play size={15} /> {busy === job.id ? 'Queuing…' : 'Queue'}</button>
                </footer>
                {confirmJob === job.id && (
                  <div className="bz-job-confirm" role="alertdialog" aria-label="Confirm paid source">
                    <p><ShieldAlert size={15} /> {job.confirm.text}</p>
                    <div><button type="button" className="btn btn-primary" onClick={() => queue(job, true)}>Queue with Google Places</button>
                      <button type="button" className="btn btn-ghost" onClick={() => setConfirmJob(null)}>Keep it free</button></div>
                  </div>
                )}
              </article>
            );
          })}
        </div>

        <div className="bz-runs" aria-label="Runs" aria-live="polite">
          <p className="bz-col-title"><Clock size={13} /> Runs <span className="bz-live-dot" aria-hidden="true" /> live</p>
          {shown.length === 0 ? (
            <p className="bz-muted bz-pad">No runs yet. Queue a job — when your runner is online it picks it up within seconds.</p>
          ) : shown.map((r) => {
            const job = jobOf(r.job_id);
            const inp = Object.entries(r.inputs || {}).map(([k, v]) => `${k}: ${v}`).join(' · ');
            return (
              <button key={r.id} type="button" data-node={`run:${r.id}`} className={`bz-run st-${r.status} ${hot?.size ? (hot.has(`l${r.id}`) ? 'is-hot' : 'is-dim') : ''}`}
                onClick={() => setOpenId(r.id)} onMouseEnter={() => setHover(`run:${r.id}`)} onMouseLeave={() => setHover(null)}>
                <span className={`bz-run-pill ${STATUS_TONE[r.status]}`}>{r.status}</span>
                <span className="bz-run-body">
                  <b>{job?.title || r.job_id}</b>
                  <small>{inp || 'no inputs'} · {ago(r.finished_at || r.started_at || r.created_at)}</small>
                </span>
                {(r.outbox || []).length > 0 && <span className="bz-run-out"><FileText size={13} /> {r.outbox.length}</span>}
                {r.cost_usd != null && <span className="bz-run-cost">${Number(r.cost_usd).toFixed(2)}</span>}
              </button>
            );
          })}
          <details className={`bz-howto ${online ? 'mini' : ''}`}>
            <summary className="ui-kicker"><Wifi size={13} /> {online ? 'Runner setup' : 'Setup — connect your runner'}</summary>
            <ol>
              <li>Create an access token with <b>write</b> scope in Settings.</li>
              <li>Your local runner polls <code>POST /api/business/agent-runs/claim</code> — each poll is a check-in.</li>
              <li>It works the job on your machine, then reports the summary and outbox with <code>POST …/agent-runs/:id/report</code>.</li>
            </ol>
            <p className="bz-muted">Running runs can be cancelled here; the runner stops on its next report.</p>
          </details>
        </div>
      </div>

      {opened && <RunSheet run={opened} job={jobOf(opened.job_id)} onClose={() => setOpenId(null)} onCancel={() => cancel(opened)} />}
    </section>
  );
}

// ───── run detail: job → run → outbox → leads / results ─────
function RunSheet({ run, job, onClose, onCancel }) {
  const ctx = useBiz();
  const biz = useBizApi();
  const { showToast } = useToast();
  const [root, setRoot] = useState(null);
  const [pick, setPick] = useState(null); // { item, leads: [{name, why, source, on}] }
  const [sent, setSent] = useState({}); // item name -> 'leads' | 'result'
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !document.querySelector('.picker-menu')) onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const outbox = run.outbox || [];
  const links = [
    { id: 'j', from: 'rs-job', to: 'rs-run', tone: 'ai', weight: 2.4, idle: run.status !== 'running' },
    ...outbox.map((o, i) => ({ id: `o${i}`, from: 'rs-run', to: `rs-o${i}`, tone: run.status === 'failed' ? 'bad' : 'flow', weight: 2 })),
    ...outbox.map((o, i) => (sent[o.name] ? { id: `t${i}`, from: `rs-o${i}`, to: sent[o.name] === 'leads' ? 'rs-leads' : 'rs-results', tone: 'good', weight: 2.4 } : null)).filter(Boolean),
  ];
  const source = `Agent: ${job?.title || run.job_id}`;
  const startAdd = (item) => {
    const have = new Set((ctx.sum?.flow?.leads || []).map((l) => l.name.trim().toLowerCase()));
    const leads = parseLeads(item.preview).map((l) => {
      const exists = have.has(l.name.trim().toLowerCase());
      return { ...l, source: l.source || source, on: !exists, exists };
    });
    if (!leads.length) { showToast('No lead rows found in this file — expected a name column or "- Name — why" lines', 'error'); return; }
    setPick({ item, leads });
  };
  const addLeads = async () => {
    const chosen = pick.leads.filter((l) => l.on);
    let ok = 0;
    for (const l of chosen) {
      try { await biz.current.create('leads', { name: l.name.slice(0, 200), source: (l.source || source).slice(0, 120), why: (l.why || '').slice(0, 2000), stage: 'identified', notes: `From ${pick.item.name} (agent run ${run.id.slice(0, 8)})` }); ok += 1; }
      catch (e) { showToast(`${l.name}: ${e.message}`, 'error'); }
    }
    if (ok) { showToast(`${ok} lead${ok === 1 ? '' : 's'} added to the pipeline`, 'success'); setSent((s) => ({ ...s, [pick.item.name]: 'leads' })); ctx.changed({ lists: true }); }
    setPick(null);
  };
  const logResult = async (item) => {
    try {
      await biz.current.create('results', {
        type: 'note', channel: run.job_id === 'upwork-scout' ? 'upwork' : run.job_id === 'prospect-list' ? 'cold' : '', count: 1,
        note: `Agent: ${job?.title || run.job_id} · ${item.name} (run ${run.id.slice(0, 8)})\n${(run.summary || '').split('\n').filter(Boolean).slice(0, 3).join('\n')}`.slice(0, 4000),
      });
      setSent((s) => ({ ...s, [item.name]: 'result' }));
      ctx.changed({ lists: true });
      showToast('Logged in Results', 'success');
    } catch (e) { showToast(e.message, 'error'); }
  };

  return (
    <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal biz-modal bz-runsheet" role="dialog" aria-modal="true" aria-label={`Run: ${job?.title || run.job_id}`}>
        <ModalHead icon={Bot} title={job?.title || run.job_id}
          subtitle={`${run.status} · queued ${fmtDate(run.created_at)} ${ago(run.created_at)}${run.runner ? ` · runner ${run.runner}` : ''}${run.cost_usd != null ? ` · $${Number(run.cost_usd).toFixed(2)}` : ''}`} onClose={onClose} />
        <div className="modal-body mk-body">
          <div className="bz-lineage bz-run-lineage" ref={setRoot}>
            <FlowLinks root={root} links={links} version={`${outbox.length}-${Object.keys(sent).length}`} />
            <div className="bz-lin-col"><div data-node="rs-job" className="bz-node kind-job"><Bot size={14} /><span className="bz-node-name">{job?.title || run.job_id}</span></div></div>
            <div className="bz-lin-col"><div data-node="rs-run" className={`bz-node kind-run st-${run.status}`}><span className={`bz-run-pill ${STATUS_TONE[run.status]}`}>{run.status}</span></div></div>
            <div className="bz-lin-col">
              {outbox.length ? outbox.map((o, i) => <div key={o.name} data-node={`rs-o${i}`} className="bz-node kind-file"><FileText size={13} /><span className="bz-node-name">{o.name}</span></div>)
                : <div className="bz-node quiet"><span className="bz-node-name">{run.status === 'queued' ? 'Waiting for the runner' : run.status === 'running' ? 'Working…' : 'No files'}</span></div>}
            </div>
            <div className="bz-lin-col">
              <div data-node="rs-leads" className={`bz-node kind-stage ${Object.values(sent).includes('leads') ? '' : 'quiet'}`}><UserPlus size={13} /><span className="bz-node-name">Leads</span></div>
              <div data-node="rs-results" className={`bz-node kind-out ${Object.values(sent).includes('result') ? '' : 'quiet'}`}><BarChart3 size={13} /><span className="bz-node-name">Results</span></div>
            </div>
          </div>

          {run.summary ? <div className="bz-md"><Markdown>{run.summary}</Markdown></div>
            : <p className="bz-muted">{run.status === 'queued' ? 'Queued. When your runner is online it claims this run within seconds.' : run.status === 'running' ? 'Your runner is working on it. This page refreshes every 5 seconds.' : 'No summary.'}</p>}

          {outbox.map((o) => (
            <section key={o.name} className="bz-outbox">
              <header><FileText size={14} /> <b>{o.name}</b> <span className="ui-chip">{o.kind}</span>
                <span className="bz-outbox-act">
                  {sent[o.name] ? <span className="ui-chip ui-chip--good"><Check size={12} /> {sent[o.name] === 'leads' ? 'Added to leads' : 'Logged'}</span> : (
                    <>
                      {(o.kind === 'leads' || o.kind === 'csv' || /lead|prospect/i.test(o.name)) && <button type="button" className="bz-mini" onClick={() => startAdd(o)}><UserPlus size={13} /> Add to leads</button>}
                      <button type="button" className="bz-mini" onClick={() => logResult(o)}><BarChart3 size={13} /> Log result</button>
                    </>
                  )}
                </span>
              </header>
              {o.kind === 'markdown' || o.kind === 'report' || o.kind === 'proposal' ? <div className="bz-md bz-outbox-pre"><Markdown>{o.preview}</Markdown></div>
                : <pre className="bz-outbox-pre">{o.preview}</pre>}
            </section>
          ))}

          {pick && (
            <section className="bz-pick" aria-label="Choose leads to add">
              <p className="ui-kicker"><UserPlus size={14} /> Add to leads — {pick.leads.filter((l) => l.on).length} of {pick.leads.length}</p>
              <ul>
                {pick.leads.map((l, i) => (
                  <li key={`${l.name}-${i}`}>
                    <label><input type="checkbox" checked={l.on} onChange={(e) => setPick((p) => ({ ...p, leads: p.leads.map((x, j) => (j === i ? { ...x, on: e.target.checked } : x)) }))} />
                      <b>{l.name}</b>{l.exists && <em className="bz-pick-dup">already in your pipeline</em>}{l.why && <small>{l.why}</small>}</label>
                  </li>
                ))}
              </ul>
              <div className="bz-pick-act">
                <button type="button" className="btn btn-primary" disabled={!pick.leads.some((l) => l.on)} onClick={addLeads}>Add {pick.leads.filter((l) => l.on).length} as Identified</button>
                <button type="button" className="btn btn-ghost" onClick={() => setPick(null)}>Cancel</button>
              </div>
            </section>
          )}
        </div>
        <div className="modal-footer mk-foot">
          {(run.status === 'queued' || run.status === 'running') && <button type="button" className="btn btn-ghost btn-danger-ghost bz-del" onClick={onCancel}><XCircle size={15} /> Cancel run</button>}
          <span className="mk-foot-note">RPM never runs jobs</span>
          <button type="button" className="btn btn-primary" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
}
