// Mission flow: the money as a live circuit. Sources → Pipeline → Outcomes → Cash → Goal, joined by
// weighted, animated connectors (FlowLinks); hovering a node or a move lights its whole path. Beside it,
// the ranked next best moves; under it, what blocks the money (fix → offer) and what the agents produced.
import { useContext, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Briefcase, Target, Wallet, Settings2, Wand2, ArrowRight, Radio, Users, BarChart3, AlertTriangle, Bot, Gift, Flag, ListChecks,
} from 'lucide-react';
import { AppContext, AuthContext } from '../../App';
import Picker from '../Picker';
import ModalHead from '../modals/ModalHead';
import FlowLinks, { connected, useMedia } from '../FlowLinks';
import { useToast } from '../ToastProvider';
import NextMoves from './Moves';
import DatePick from './DatePick';
import { Loading, useBiz, useBizApi } from './bizKit';
import { LANES, daysBetween, fmtDate, money, stageLabel, todayStr } from './bizConfig';

const OUTCOMES = [['sent', 'Sent'], ['reply', 'Replies'], ['call', 'Calls'], ['proof', 'Proof'], ['won', 'Won']];
const STAGE_TO_OUTCOME = { contacted: 'sent', replied: 'reply', call: 'call', pilot: 'proof', paid: 'won' };
const W = (n) => 1.6 + Math.log2((n || 0) + 1) * 1.7;

export default function Overview({ go }) {
  const ctx = useBiz();
  const biz = useBizApi();
  const { showToast } = useToast();
  const s = ctx.sum;
  const [root, setRoot] = useState(null);
  const [band, setBand] = useState(null);
  const [hover, setHover] = useState(null);       // node id
  const [moveFocus, setMoveFocus] = useState(null); // move
  const [settings, setSettings] = useState(false);
  const [busy, setBusy] = useState(false);
  const phone = useMedia('(max-width: 900px)');

  const g = useMemo(() => (s ? buildGraph(s) : null), [s]);
  if (!s) return <Loading />;

  const startTemplate = async () => {
    setBusy(true);
    try { await biz.current.template('all'); showToast('Sample business added — every row can be edited or deleted', 'success'); ctx.changed({ lists: true }); }
    catch (e) { showToast(e.message, 'error'); } finally { setBusy(false); }
  };

  // A guessed source → channel match becomes a link once the lead's source is the channel's exact name.
  const confirmSource = async (n) => {
    try {
      for (const id of n.guessed) await biz.current.update('leads', id, { source: n.label });
      showToast(`${n.guessed.length} lead${n.guessed.length === 1 ? '' : 's'} now come from “${n.label}”`, 'success');
      ctx.changed({ lists: true });
    } catch (e) { showToast(e.message, 'error'); }
  };

  if (s.empty) {
    return (
      <section className="bz-welcome">
        <div className="bz-welcome-art" aria-hidden="true"><i /><i /><i /><i /><i /></div>
        <span className="ui-icon-badge"><Briefcase size={22} /></span>
        <h2 className="bz-welcome-title ui-title-grad">Wire up your money</h2>
        <p>Channels, leads, results, cash and your goal — as one live circuit next to the plan you already keep in RPM.
          Goals, tasks and dates stay in your RPM projects; this area links to them. Nobody else can see it.</p>
        <div className="bz-empty-actions">
          <button type="button" className="btn btn-primary" disabled={busy} onClick={startTemplate}><Wand2 size={16} /> {busy ? 'Adding…' : 'Start from template'}</button>
          <button type="button" className="btn btn-secondary" onClick={() => setSettings(true)}><Settings2 size={16} /> Start empty — link my goal</button>
        </div>
        {settings && <GoalSettings settings={s.settings} onClose={() => setSettings(false)} onSaved={() => ctx.changed({ lists: true })} />}
      </section>
    );
  }

  // what to light: a hovered node, or the entity a hovered move is about
  const focusNodes = moveFocus ? g.nodesFor(moveFocus.entity) : hover ? [hover] : [];
  // light only what really flows (skeleton links would light the whole circuit)
  const hot = new Set(); for (const n of focusNodes) for (const id of connected(g.liveLinks, n)) hot.add(id);
  const bandHot = new Set(); for (const n of focusNodes) for (const id of connected(g.bandLinks, n)) bandHot.add(id);
  const lit = new Set(focusNodes);
  for (const l of [...g.links, ...g.bandLinks]) if (hot.has(l.id) || bandHot.has(l.id)) { lit.add(l.from); lit.add(l.to); }
  const nodeProps = (id, extra = '') => ({
    'data-node': id,
    className: `bz-node ${extra} ${lit.size ? (lit.has(id) ? 'is-hot' : 'is-dim') : ''}`,
    onMouseEnter: () => setHover(id), onMouseLeave: () => setHover(null), onFocus: () => setHover(id), onBlur: () => setHover(null),
  });

  const cur = s.settings?.currency || 'EUR';
  const today = todayStr();
  const days = s.deadline ? daysBetween(today, s.deadline) : null;
  const cash = s.cash;
  const pct = cash && cash.target_value > 0 ? Math.min(100, (cash.current_value / cash.target_value) * 100) : 0;
  const pace = cash && s.deadline && s.start ? Math.min(100, Math.max(0, (daysBetween(s.start, today) / Math.max(1, daysBetween(s.start, s.deadline))) * 100)) : null;
  const weeksLeft = days != null && days > 0 ? days / 7 : null;
  const perWeek = cash && weeksLeft ? Math.max(0, cash.target_value - cash.current_value) / weeksLeft : null;

  return (
    <div className="bz-mission">
      {/* ── hero: goal · countdown · cash vs a straight-line pace ── */}
      <section className="bz-hero">
        <div className="bz-hero-goal">
          <p className="ui-kicker"><Target size={14} /> Mission
            <button type="button" className="bz-hero-gear" onClick={() => setSettings(true)} aria-label="Goal and cash settings" title="Goal & cash settings"><Settings2 size={15} /></button>
          </p>
          {s.goal ? <Link to={`/projects/${s.goal.id}`} className="bz-hero-title ui-title-grad">{s.goal.name}</Link>
            : <button type="button" className="bz-hero-title bz-hero-link" onClick={() => setSettings(true)}>Link your goal project</button>}
          {s.goal?.ultimate_result && <p className="bz-hero-sub">{s.goal.ultimate_result}</p>}
        </div>
        <div className="bz-hero-cash">
          {cash ? (
            <>
              <div className="bz-cash-row">
                <span className="bz-cash-label"><Wallet size={14} /> {cash.title}</span>
                <b className="bz-cash-num">{money(cash.current_value, cur)} <small>/ {money(cash.target_value, cur)}</small></b>
              </div>
              <div className="bz-cash-track" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} aria-label="Cash vs goal">
                <i className="bz-cash-fill" style={{ width: `${pct}%` }} />
                {pace != null && <i className={`bz-cash-pace ${pct + 0.5 < pace ? 'behind' : ''}`} style={{ left: `${pace}%` }} title={`Straight-line pace today: ${Math.round(pace)}%`} />}
              </div>
              <p className="bz-cash-read">
                {perWeek ? <>Needs <b>{money(perWeek, cur)}</b>/week{pace != null && <> · pace marker = where a straight line would be today</>}</> : 'Goal reached or no deadline.'}
              </p>
            </>
          ) : (
            <button type="button" className="btn btn-secondary" onClick={() => setSettings(true)}><Wallet size={16} /> Link the key result that holds your cash</button>
          )}
        </div>
        {days !== null && (
          <div className={`bz-countdown ${days < 0 ? 'late' : days <= 14 ? 'soon' : ''}`} aria-label={`${Math.abs(days)} days ${days < 0 ? 'late' : 'left'}`}>
            <b>{Math.abs(days)}</b><span>{days < 0 ? 'days late' : days === 1 ? 'day left' : 'days left'}</span><small>{fmtDate(s.deadline)}</small>
          </div>
        )}
      </section>

      <div className="bz-mission-grid">
        {/* ── the circuit ── */}
        <section className="bz-canvas" aria-label="Money flow">
          <div className="bz-flow" ref={setRoot}>
            <FlowLinks root={root} links={g.links} active={hot.size ? hot : null} simplify={phone} version={`${s.counts?.leads}-${phone}`} />
            <Column id="src" title="Sources" icon={Radio} onTitle={() => go('channels')}>
              {g.sources.map((n) => (
                <div key={n.id} className="bz-node-wrap">
                  <button type="button" {...nodeProps(n.id, `kind-src ${n.count ? '' : 'quiet'}`)} onClick={() => go('channels', { focus: n.channelId })}>
                    <i className={`bz-dot tone-${n.tone || 'info'}`} aria-hidden="true" />
                    <span className="bz-node-name">{n.label}</span>
                    {n.count > 0 && <b className="bz-node-n">{n.count}</b>}
                  </button>
                  {n.guessed.length > 0 && (
                    <button type="button" className="bz-guess" onClick={() => confirmSource(n)} title={`Lead source “${n.guessedFrom.join('”, “')}” was matched to this channel by a shared word`}>
                      {n.guessed.length} guessed · Confirm
                    </button>
                  )}
                </div>
              ))}
            </Column>
            <Column id="pipe" title="Pipeline" icon={Users} onTitle={() => go('leads')}>
              {g.liveStages.map((st) => (
                <button key={st} type="button" {...nodeProps(`st:${st}`, `kind-stage st-${st}`)} onClick={() => go('leads', { filter: st })}>
                  <span className="bz-node-name">{stageLabel(st)}</span>
                  <b className="bz-node-n">{g.stages[st]}</b>
                  {g.stuck[st] > 0 && <em className="bz-node-flag" title={`${g.stuck[st]} stuck`}>{g.stuck[st]} stuck</em>}
                </button>
              ))}
              {g.emptyStages.length > 0 && (
                <button type="button" className="bz-quietline" onClick={() => go('leads')}>
                  {g.liveStages.length ? 'Then ' : ''}{g.emptyStages.map(stageLabel).join(' → ')} <span>empty</span>
                </button>
              )}
            </Column>
            <Column id="out" title="Outcomes" icon={BarChart3} onTitle={() => go('results')}>
              {g.liveOutcomes.map(([k, label]) => (
                <button key={k} type="button" {...nodeProps(`out:${k}`, 'kind-out')} onClick={() => go('results')}>
                  <span className="bz-node-name">{label}</span>
                  <b className="bz-node-n">{s.funnel[k]}</b>
                </button>
              ))}
              {g.liveOutcomes.length === 0 && (
                <button type="button" {...nodeProps('out:none', 'kind-out quiet')} onClick={() => go('results', { log: 1 })}>
                  <span className="bz-node-name">Nothing logged yet</span>
                  <small className="bz-node-sub">Log the first message →</small>
                </button>
              )}
            </Column>
            <Column id="cash" title="Cash" icon={Wallet} onTitle={() => go('revenue')}>
              <button type="button" {...nodeProps('cash', 'kind-cash')} onClick={() => go('revenue')}>
                <span className="bz-ring" style={{ '--pct': `${pct}%` }} aria-hidden="true"><b>{Math.round(pct)}%</b></span>
                <span className="bz-node-name">{cash ? money(cash.current_value, cur) : 'Not linked'}</span>
                {cash && <small className="bz-node-sub">of {money(cash.target_value, cur)}</small>}
                {s.funnel?.cash_logged > 0 && <small className="bz-node-sub">{money(s.funnel.cash_logged, cur)} logged as won</small>}
              </button>
            </Column>
            <Column id="goal" title="Goal" icon={Flag}>
              {s.goal ? (
                <Link to={`/projects/${s.goal.id}`} {...nodeProps('goal', 'kind-goal')}>
                  <span className="bz-node-name">{s.goal.name}</span>
                  {days !== null && <small className="bz-node-sub">{days < 0 ? `${-days} days late` : `${days} days left`}</small>}
                </Link>
              ) : (
                <button type="button" {...nodeProps('goal', 'kind-goal quiet')} onClick={() => setSettings(true)}><span className="bz-node-name">Link a goal</span></button>
              )}
            </Column>
          </div>
          <p className="bz-canvas-legend">
            <span><i className="lg-live" /> flowing</span><span><i className="lg-skel" /> the path, nothing logged yet</span>
            <span className="bz-canvas-tip">Hover a node to trace where it comes from and where it goes.</span>
          </p>
        </section>

        <aside className="bz-rail">
          <NextMoves moves={s.moves} onFocus={setMoveFocus} limit={3} compact={phone} />
          {(s.next?.actions?.length > 0 || s.next?.products?.length > 0) && (
            <section className="bz-rpmnext" aria-label="Next in RPM">
              <p className="ui-kicker"><ListChecks size={14} /> Next in RPM</p>
              <ul>
                {(s.next.actions || []).slice(0, 4).map((a) => (
                  <li key={a.id}><Link to={s.goal ? `/projects/${s.goal.id}` : '/today'}>
                    <span className={`bz-rpm-when ${a.scheduled_date && a.scheduled_date < today ? 'late' : ''}`}>{a.scheduled_date ? fmtDate(a.scheduled_date) : 'open'}</span>
                    <span className="bz-rpm-title">{a.title}</span></Link></li>
                ))}
                {(s.next.products || []).slice(0, 2).map((p) => (
                  <li key={p.id}><button type="button" onClick={() => go('products')}>
                    <span className={`bz-rpm-when ${p.next_date < today ? 'late' : ''}`}>{fmtDate(p.next_date)}</span>
                    <span className="bz-rpm-title">{p.name}: {p.next_step}</span></button></li>
                ))}
              </ul>
            </section>
          )}
        </aside>
      </div>

      {/* ── what blocks the money: fix → offer ── */}
      {g.bandFixes.length > 0 && (
        <section className="bz-band" aria-label="What blocks the money">
          <header className="bz-band-head">
            <p className="ui-kicker"><AlertTriangle size={14} /> What blocks the money</p>
            <button type="button" className="btn btn-ghost bz-small" onClick={() => go('fixes')}>All fixes <ArrowRight size={14} /></button>
          </header>
          <div className="bz-band-flow" ref={setBand}>
            <FlowLinks root={band} links={g.bandLinks} active={bandHot.size ? bandHot : null} simplify={phone} />
            <div className="bz-band-col" data-node-group="fixes">
              {g.bandFixes.map((f) => (
                <button key={f.id} type="button" {...nodeProps(`fix:${f.id}`, `kind-fix sev-${f.severity}`)} onClick={() => go('fixes', { focus: f.id })}>
                  <em className={`bz-sev sev-${f.severity}`}>{f.severity}</em>
                  <span className="bz-node-name">{f.text}</span>
                </button>
              ))}
            </div>
            <div className="bz-band-col" data-node-group="offers">
              {g.bandOffers.map((o) => (
                <button key={o.id} type="button" {...nodeProps(`offer:${o.id}`, `kind-offer ready-${o.readiness}`)} onClick={() => go('offers', { focus: o.id })}>
                  <Gift size={14} aria-hidden="true" />
                  <span className="bz-node-name">{o.name}</span>
                  <small className="bz-node-sub">{g.blockCount[o.id]} blocker{g.blockCount[o.id] === 1 ? '' : 's'}</small>
                </button>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── agents: run → outbox ── */}
      <AgentStrip agents={s.agents} go={go} />

      {settings && <GoalSettings settings={s.settings} onClose={() => setSettings(false)} onSaved={() => ctx.changed({ lists: true })} />}
    </div>
  );
}

function Column({ id, title, icon: Icon, onTitle, children }) {
  return (
    <div className={`bz-col col-${id}`} data-node-group={id}>
      {onTitle ? <button type="button" className="bz-col-title" onClick={onTitle}><Icon size={13} /> {title}</button>
        : <p className="bz-col-title"><Icon size={13} /> {title}</p>}
      <div className="bz-col-nodes">{children}</div>
    </div>
  );
}

/** Nodes + links of the circuit from the summary. Real links glow and animate; skeleton links (the path
 *  with nothing logged yet) are faint dashed lines so the structure always reads. */
function buildGraph(s) {
  const f = s.flow || { leads: [], channels: [], offers: [], fixes: [], links: {} };
  const L = f.links || {};
  const open = (f.leads || []).filter((l) => l.stage !== 'lost');
  const stages = {}; const stuck = {};
  const today = todayStr();
  const LIMIT = { identified: 7, contacted: 5, replied: 3, call: 4, pilot: 14 };
  for (const l of open) {
    stages[l.stage] = (stages[l.stage] || 0) + 1;
    const since = String(l.stage_changed_at || l.created_at || '').slice(0, 10);
    if (LIMIT[l.stage] && since && daysBetween(since, today) > LIMIT[l.stage]) stuck[l.stage] = (stuck[l.stage] || 0) + 1;
  }
  // sources: every channel, plus raw lead sources that match no channel
  const bySrc = new Map();
  for (const c of f.channels || []) bySrc.set(`ch:${c.id}`, { id: `ch:${c.id}`, channelId: c.id, label: c.name, tone: { ok: 'good', warn: 'warn', bad: 'bad' }[c.tone] || 'info', count: 0, perStage: {}, guessStage: {}, guessed: [], guessedFrom: [] });
  for (const l of open) {
    const key = L.leadChannel?.[l.id] ? `ch:${L.leadChannel[l.id]}` : `src:${(l.source || 'Unknown').trim().toLowerCase()}`;
    if (!bySrc.has(key)) bySrc.set(key, { id: key, label: l.source || 'No source', tone: 'info', count: 0, perStage: {}, guessStage: {}, guessed: [], guessedFrom: [] });
    const n = bySrc.get(key); n.count += 1;
    if (L.leadChannelGuess?.[l.id]) {
      n.guessed.push(l.id); n.guessStage[l.stage] = (n.guessStage[l.stage] || 0) + 1;
      if (!n.guessedFrom.includes(l.source)) n.guessedFrom.push(l.source);
    } else n.perStage[l.stage] = (n.perStage[l.stage] || 0) + 1;
  }
  const sources = [...bySrc.values()].sort((a, b) => b.count - a.count).slice(0, 8);
  const links = [];
  // confirmed sources glow; guessed ones are dashed until the owner confirms them
  for (const src of sources) {
    for (const [st, n] of Object.entries(src.perStage)) links.push({ id: `${src.id}>${st}`, from: src.id, to: `st:${st}`, tone: 'flow', weight: W(n) });
    for (const [st, n] of Object.entries(src.guessStage)) links.push({ id: `${src.id}~${st}`, from: src.id, to: `st:${st}`, tone: 'flow', dashed: true, weight: W(n) });
  }
  // zero is silent: only stages and outcomes that hold something are nodes
  const liveStages = LANES.filter((st) => stages[st] > 0);
  const emptyStages = LANES.filter((st) => !stages[st]);
  const liveOutcomes = OUTCOMES.filter(([k]) => (s.funnel?.[k] || 0) > 0);
  for (const [st, out] of Object.entries(STAGE_TO_OUTCOME)) {
    const n = s.funnel?.[out] || 0;
    if (n && stages[st]) links.push({ id: `${st}>${out}`, from: `st:${st}`, to: `out:${out}`, tone: 'flow', weight: W(n) });
  }
  if (!liveOutcomes.length && liveStages.length) {
    const last = liveStages[liveStages.length - 1];
    links.push({ id: 'pipe>none', from: `st:${last}`, to: 'out:none', tone: 'dim', dashed: true, idle: true, weight: 1.6 });
    links.push({ id: 'none>cash', from: 'out:none', to: 'cash', tone: 'dim', dashed: true, idle: true, weight: 1.6 });
  }
  if (liveOutcomes.length) {
    // the furthest outcome feeds the cash (won if any)
    const tail = (s.funnel?.won || 0) > 0 ? 'won' : liveOutcomes[liveOutcomes.length - 1][0];
    const won = s.funnel?.won || 0;
    links.push({ id: 'out>cash', from: `out:${tail}`, to: 'cash', tone: won ? 'good' : 'dim', dashed: !won, idle: !won, weight: won ? W(won) + 1 : 1.6 });
    for (let i = 0; i < liveOutcomes.length - 1; i++) {
      const a = liveOutcomes[i][0]; const b = liveOutcomes[i + 1][0];
      links.push({ id: `o:${a}>${b}`, from: `out:${a}`, to: `out:${b}`, tone: 'good', weight: W(s.funnel[b]) });
    }
  }
  const pct = s.cash?.target_value ? s.cash.current_value / s.cash.target_value : 0;
  links.push({ id: 'cash>goal', from: 'cash', to: 'goal', tone: pct > 0 ? 'flow' : 'dim', dashed: pct <= 0, idle: pct <= 0, weight: 2 + pct * 6 });

  // blockers band: open P0/P1 fixes that wire to an offer
  const offers = Object.fromEntries((f.offers || []).map((o) => [o.id, o]));
  const bandFixes = (f.fixes || []).filter((x) => !x.done && x.severity !== 'P2' && L.fixOffers?.[x.id]).slice(0, 6);
  const bandLinks = []; const blockCount = {};
  for (const x of bandFixes) {
    for (const oid of L.fixOffers[x.id].offers) {
      if (!offers[oid]) continue;
      blockCount[oid] = (blockCount[oid] || 0) + 1;
      bandLinks.push({ id: `fix:${x.id}>offer:${oid}`, from: `fix:${x.id}`, to: `offer:${oid}`, tone: x.severity === 'P0' ? 'bad' : 'warn', dashed: !L.fixOffers[x.id].explicit, weight: x.severity === 'P0' ? 3 : 2 });
    }
  }
  const bandOffers = Object.keys(blockCount).map((id) => offers[id]);

  const leadsById = Object.fromEntries((f.leads || []).map((l) => [l.id, l]));
  const nodesFor = (e) => {
    if (!e) return [];
    if (e.type === 'lead') { const l = leadsById[e.id]; return l ? [`st:${l.stage}`] : []; }
    if (e.type === 'leads') return [...new Set((e.ids || []).map((id) => leadsById[id] && `st:${leadsById[id].stage}`).filter(Boolean))];
    if (e.type === 'fix') return [`fix:${e.id}`];
    if (e.type === 'cash') return ['cash'];
    if (e.type === 'funnel') return [`out:${e.step}`];
    if (e.type === 'model') return ['cash'];
    return [];
  };
  return { sources, stages, stuck, liveStages, emptyStages, liveOutcomes, links, liveLinks: links.filter((l) => !l.idle), bandFixes, bandOffers, bandLinks, blockCount, nodesFor };
}

const RUN_TONE = { queued: 'info', running: 'ai', done: 'good', failed: 'bad', cancelled: undefined };
function AgentStrip({ agents, go }) {
  if (!agents) return null;
  const runs = agents.runs || [];
  return (
    <section className="bz-agentstrip" aria-label="Agent activity">
      <p className="ui-kicker"><Bot size={14} /> Agents</p>
      {runs.length === 0 ? (
        <p className="bz-muted">No runs yet. Queue a prospect list or an Upwork scout — your local runner does the work, RPM shows the outbox.</p>
      ) : (
        <ul className="bz-agentstrip-list">
          {runs.slice(0, 4).map((r) => (
            <li key={r.id}>
              <button type="button" className="bz-agentstrip-run" onClick={() => go('agents', { focus: r.id })}>
                <span className={`ui-chip ${RUN_TONE[r.status] ? `ui-chip--${RUN_TONE[r.status]}` : ''}`}>{r.status}</span>
                <b>{r.job_id}</b>
                {(r.outbox || []).length > 0 && <small>{r.outbox.length} file{r.outbox.length === 1 ? '' : 's'} in outbox</small>}
              </button>
            </li>
          ))}
        </ul>
      )}
      <button type="button" className="btn btn-ghost bz-small" onClick={() => go('agents')}>Open Agents <ArrowRight size={14} /></button>
    </section>
  );
}

// Pick the RPM project that is the business goal, and which of its key results holds the cash.
export function GoalSettings({ settings, onClose, onSaved }) {
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
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !document.querySelector('.picker-menu, .dp-menu')) onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await biz.current.saveSettings({ goal_project_id: projectId || null, cash_kr_id: krId || null, deadline: deadline || null, currency });
      showToast('Business goal saved', 'success');
      onSaved(); onClose();
    } catch (err) { showToast(err.message, 'error'); } finally { setBusy(false); }
  };

  return (
    <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <form className="modal biz-modal" onSubmit={save} role="dialog" aria-modal="true" aria-label="Goal and cash">
        <ModalHead icon={Target} title="Goal & cash" subtitle="The RPM project this business works toward, and the key result that holds the cash." onClose={onClose} />
        <div className="modal-body mk-body">
          <div className="mk-grid mk-grid-2">
            <div className="mk-field biz-wide"><span className="form-label">Goal project</span>
              <Picker value={projectId} placeholder="Choose a project…" header="Your projects"
                options={[{ value: '', label: 'None' }, ...(projects || []).map((p) => ({ value: p.id, label: p.name }))]}
                onChange={(v) => { setProjectId(v); setKrId(''); }} />
            </div>
            <div className="mk-field biz-wide"><span className="form-label">Cash key result</span>
              <Picker value={krId} placeholder={projectId ? (krs.length ? 'Choose a key result…' : 'This project has no key results') : 'Pick a project first'} disabled={!projectId || !krs.length}
                options={[{ value: '', label: 'None' }, ...krs.map((k) => ({ value: k.id, label: k.title, hint: k.target_value ? `${k.target_value} ${k.unit || ''}` : '' }))]}
                onChange={setKrId} />
            </div>
            <div className="mk-field"><span className="form-label">Deadline</span><DatePick value={deadline || null} onChange={(v) => setDeadline(v || '')} label="Deadline" /></div>
            <div className="mk-field"><span className="form-label">Currency</span>
              <Picker value={currency} options={['EUR', 'USD', 'GBP', 'CHF'].map((c) => ({ value: c, label: c }))} onChange={setCurrency} />
            </div>
          </div>
          <p className="mk-help">No goal project yet? <Link to="/plan?view=projects" className="biz-link">Create one in Plan</Link> with a cash key result, then link it here.</p>
        </div>
        <div className="modal-footer mk-foot">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
        </div>
      </form>
    </div>
  );
}
