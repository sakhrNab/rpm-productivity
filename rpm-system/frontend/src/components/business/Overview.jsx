// Business overview: goal countdown, cash vs goal (from the linked RPM key result), funnel, next steps.
import { useContext, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Briefcase, Target, Wallet, Filter, ListChecks, Settings2, Wand2, CalendarClock, ArrowRight } from 'lucide-react';
import { AppContext, AuthContext } from '../../App';
import Picker from '../Picker';
import { useToast } from '../ToastProvider';
import { Loading, useBizApi } from './bizKit';
import { daysBetween, fmtDate, money, stageLabel, todayStr } from './bizConfig';

const FUNNEL = [['sent', 'Sent'], ['reply', 'Replies'], ['call', 'Calls'], ['proof', 'Proof'], ['won', 'Won']];

export default function Overview({ go }) {
  const biz = useBizApi();
  const { showToast } = useToast();
  const [s, setS] = useState(null);
  const [err, setErr] = useState('');
  const [setup, setSetup] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try { setS(await biz.current.summary()); setErr(''); } catch (e) { setErr(e.message); }
  };
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (err) return <p className="biz-err">{err}</p>;
  if (!s) return <Loading />;

  const startTemplate = async () => {
    setBusy(true);
    try { await biz.current.template('all'); showToast('Sample business added — every row can be edited or deleted', 'success'); await load(); }
    catch (e) { showToast(e.message, 'error'); } finally { setBusy(false); }
  };

  if (s.empty && !setup) {
    return (
      <section className="ui-card biz-hero biz-welcome">
        <span className="ui-icon-badge"><Briefcase size={22} /></span>
        <h2 className="biz-hero-title ui-title-grad">Your business cockpit</h2>
        <p className="biz-text">Leads, offers, results and the revenue model for what you sell — next to the plan you already keep in RPM.
          Goals, tasks and dates stay in your RPM projects; this area links to them. Nobody else can see it.</p>
        <div className="biz-empty-actions">
          <button type="button" className="btn btn-primary" disabled={busy} onClick={startTemplate}><Wand2 size={16} /> {busy ? 'Adding…' : 'Start from template'}</button>
          <button type="button" className="btn btn-secondary" onClick={() => setSetup(true)}><Settings2 size={16} /> Start empty — link my goal</button>
        </div>
        <p className="biz-muted">The template adds a few clearly-marked sample rows to every page. Edit or delete them freely.</p>
      </section>
    );
  }

  const today = todayStr();
  const days = s.deadline ? daysBetween(today, s.deadline) : null;
  const cur = s.settings?.currency || 'EUR';
  const cash = s.cash;
  const pct = cash && cash.target_value > 0 ? Math.min(100, Math.round((cash.current_value / cash.target_value) * 100)) : 0;
  const maxF = Math.max(1, ...FUNNEL.map(([k]) => s.funnel[k] || 0));
  const steps = [
    ...s.next.actions.map((a) => ({ key: `a${a.id}`, when: a.scheduled_date, text: a.title, tag: 'RPM task', to: s.goal ? `/projects/${s.goal.id}` : '/today' })),
    ...s.next.followUps.map((l) => ({ key: `l${l.id}`, when: l.next_contact, text: `${l.name}${l.next_step ? ` — ${l.next_step}` : ''}`, tag: stageLabel(l.stage), view: 'leads' })),
    ...s.next.fixes.map((f) => ({ key: `f${f.id}`, when: null, text: f.text, tag: f.severity, view: 'fixes' })),
    ...s.next.products.map((p) => ({ key: `p${p.id}`, when: p.next_date, text: `${p.name}: ${p.next_step}`, tag: 'Product', view: 'products' })),
  ].sort((a, b) => (a.when || '9999').localeCompare(b.when || '9999')).slice(0, 8);

  return (
    <div className="biz-overview">
      <section className="ui-card biz-hero">
        <div className="biz-hero-row">
          <div className="biz-min">
            <p className="ui-kicker"><Target size={14} /> Goal</p>
            {s.goal ? (
              <Link to={`/projects/${s.goal.id}`} className="biz-hero-title biz-link">{s.goal.name} <ArrowRight size={16} /></Link>
            ) : (
              <p className="biz-hero-title">No goal linked yet</p>
            )}
          </div>
          {days !== null && (
            <div className={`biz-countdown ${days < 0 ? 'late' : days <= 14 ? 'soon' : ''}`}>
              <b>{Math.abs(days)}</b><span>{days < 0 ? 'days late' : days === 1 ? 'day left' : 'days left'}</span>
              <small>{fmtDate(s.deadline)}</small>
            </div>
          )}
        </div>
        {cash ? (
          <div className="biz-cash">
            <div className="biz-cash-nums">
              <span><Wallet size={14} /> {cash.title}</span>
              <b>{money(cash.current_value, cur)} <small>of {money(cash.target_value, cur)}</small></b>
            </div>
            <div className="ui-meter" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Cash vs goal"><i style={{ '--pct': `${pct}%` }} /></div>
            {s.funnel.cash_logged > 0 && <p className="biz-muted">{money(s.funnel.cash_logged, cur)} logged as deals won in Results.</p>}
          </div>
        ) : (
          <p className="biz-muted">Link a key result that holds your cash number to see cash vs goal here.</p>
        )}
        <button type="button" className="btn btn-ghost biz-small" onClick={() => setSetup((v) => !v)}><Settings2 size={15} /> {setup ? 'Close settings' : 'Goal & cash settings'}</button>
        {setup && <GoalSettings settings={s.settings} onSaved={() => { load(); setSetup(false); }} />}
      </section>

      <div className="biz-two">
        <section className="ui-card biz-card">
          <p className="ui-kicker"><Filter size={14} /> Funnel</p>
          <div className="biz-funnel">
            {FUNNEL.map(([k, label]) => (
              <div key={k} className="biz-funnel-row">
                <span>{label}</span>
                <div className="biz-funnel-bar"><i style={{ width: `${((s.funnel[k] || 0) / maxF) * 100}%` }} /></div>
                <b>{s.funnel[k] || 0}</b>
              </div>
            ))}
          </div>
          <div className="biz-chips">
            {Object.entries(s.stages).filter(([, n]) => n).map(([st, n]) => (
              <button key={st} type="button" className="ui-chip biz-chip-btn" onClick={() => go('leads')}>{stageLabel(st)} · {n}</button>
            ))}
          </div>
          <button type="button" className="btn btn-secondary biz-small" onClick={() => go('results')}>Log a result</button>
        </section>

        <section className="ui-card biz-card">
          <p className="ui-kicker"><ListChecks size={14} /> Next steps</p>
          {steps.length === 0 ? <p className="biz-muted">Nothing scheduled. Add a follow-up from Leads or a task to your goal project.</p> : (
            <ul className="biz-steps">
              {steps.map((st) => (
                <li key={st.key}>
                  <span className={`biz-when ${st.when && st.when < today ? 'late' : ''}`}><CalendarClock size={13} /> {st.when ? fmtDate(st.when) : 'open'}</span>
                  {st.to ? <Link to={st.to} className="biz-step-text biz-link">{st.text}</Link>
                    : <button type="button" className="biz-step-text biz-linkbtn" onClick={() => go(st.view)}>{st.text}</button>}
                  <span className="ui-chip">{st.tag}</span>
                </li>
              ))}
            </ul>
          )}
          <Link to="/today" className="btn btn-ghost biz-small">Open Today in RPM <ArrowRight size={14} /></Link>
        </section>
      </div>

      <section className="biz-counts">
        {[['leads', 'Leads'], ['offers', 'Offers'], ['products', 'Products'], ['channels', 'Channels'], ['fixes', 'Fixes'], ['content', 'Posts'], ['docs', 'Docs'], ['results', 'Results']].map(([k, label]) => (
          <button key={k} type="button" className="ui-stat biz-count" onClick={() => go(k === 'docs' ? 'library' : k)}>
            <b>{s.counts[k]}</b><span>{label}</span>
          </button>
        ))}
      </section>
    </div>
  );
}

// Pick the RPM project that is the business goal, and which of its key results holds the cash.
function GoalSettings({ settings, onSaved }) {
  const { projects } = useContext(AppContext);
  const { api } = useContext(AuthContext);
  const biz = useBizApi();
  const { showToast } = useToast();
  const [projectId, setProjectId] = useState(settings?.goal_project_id || '');
  const [krId, setKrId] = useState(settings?.cash_kr_id || '');
  const [deadline, setDeadline] = useState(settings?.deadline || '');
  const [currency, setCurrency] = useState(settings?.currency || 'EUR');
  const [krs, setKrs] = useState([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!projectId) { setKrs([]); return; }
    api.getKeyResults(projectId).then((r) => setKrs(Array.isArray(r) ? r : [])).catch(() => setKrs([]));
  }, [projectId]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    setBusy(true);
    try {
      await biz.current.saveSettings({ goal_project_id: projectId || null, cash_kr_id: krId || null, deadline: deadline || null, currency });
      showToast('Business goal saved', 'success');
      onSaved();
    } catch (e) { showToast(e.message, 'error'); } finally { setBusy(false); }
  };

  return (
    <div className="biz-settings">
      <label className="mk-field"><span className="form-label">Goal project</span>
        <Picker value={projectId} placeholder="Choose a project…" header="Your projects"
          options={[{ value: '', label: 'None' }, ...(projects || []).map((p) => ({ value: p.id, label: p.name }))]}
          onChange={(v) => { setProjectId(v); setKrId(''); }} />
      </label>
      <label className="mk-field"><span className="form-label">Cash key result</span>
        <Picker value={krId} placeholder={projectId ? (krs.length ? 'Choose a key result…' : 'This project has no key results') : 'Pick a project first'} disabled={!projectId || !krs.length}
          options={[{ value: '', label: 'None' }, ...krs.map((k) => ({ value: k.id, label: k.title, hint: k.target_value ? `${k.target_value} ${k.unit || ''}` : '' }))]}
          onChange={setKrId} />
      </label>
      <label className="mk-field"><span className="form-label">Deadline</span>
        <input type="date" className="form-input" value={deadline || ''} onChange={(e) => setDeadline(e.target.value)} />
      </label>
      <label className="mk-field"><span className="form-label">Currency</span>
        <Picker value={currency} options={['EUR', 'USD', 'GBP', 'CHF'].map((c) => ({ value: c, label: c }))} onChange={setCurrency} />
      </label>
      <div className="biz-settings-actions">
        <button type="button" className="btn btn-primary" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save'}</button>
        <p className="biz-muted">No goal project yet? <Link to="/plan?view=projects" className="biz-link">Create one in Plan</Link> with a cash key result, then link it here.</p>
      </div>
    </div>
  );
}
