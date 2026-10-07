// The arsenal lenses: Offers, Products, Channels, Fixes, Library, Content. Each one draws the links its
// entities have — fixes wire into the offers they block, products into the offers they power, channels
// into the pipeline stages their leads sit in — and edits where you read.
import { useEffect, useMemo, useState } from 'react';
import { DndContext, DragOverlay, PointerSensor, TouchSensor, useDraggable, useDroppable, useSensor, useSensors } from '@dnd-kit/core';
import ModalHead from '../modals/ModalHead';
import {
  Gift, Package, Radio, Wrench, Library as LibraryIcon, CalendarDays, CalendarPlus, CheckCircle2, ExternalLink,
  Square, CheckSquare, Pencil, Search, Link2, ChevronDown, ShieldAlert, Users,
} from 'lucide-react';
import Picker from '../Picker';
import FlowLinks, { connected, useMedia } from '../FlowLinks';
import { useToast } from '../ToastProvider';
import DatePick from './DatePick';
import { AddButton, BizEmpty, Bullets, Chip, Editor, LensHead, Loading, useBiz, useBizApi, useBizList, useEditor } from './bizKit';
import { LANES, READINESS_PCT, TONE_CHIP, fmtDate, stageLabel, todayStr, toneLabel } from './bizConfig';

const STOP = new Set(['your', 'the', 'and', 'for', 'with', 'from', 'service', 'free', 'install', 'partner', 'app', 'auto', 'ai']);
const words = (s) => String(s || '').toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 3 && !STOP.has(w));
const shares = (a, b) => { const B = new Set(words(b)); return words(a).some((w) => B.has(w)); };

/** Hover state → lit link ids + lit node ids for a wired layout. */
function useWires(links) {
  const [hover, setHover] = useState(null);
  const hot = useMemo(() => (hover ? connected(links, hover) : new Set()), [hover, links]);
  const lit = useMemo(() => {
    const s = new Set(hover ? [hover] : []);
    for (const l of links) if (hot.has(l.id)) { s.add(l.from); s.add(l.to); }
    return s;
  }, [hot, hover, links]);
  const bind = (id) => ({
    'data-node': id,
    onMouseEnter: () => setHover(id), onMouseLeave: () => setHover(null), onFocus: () => setHover(id), onBlur: () => setHover(null),
  });
  const cls = (id) => (lit.size ? (lit.has(id) ? 'is-hot' : 'is-dim') : '');
  return { hot: hot.size ? hot : null, bind, cls };
}

// ───────────────────────── Offers ─────────────────────────
export function Offers() {
  const list = useBizList('offers');
  const fixes = useBizList('fixes');
  const ctx = useBiz();
  const ed = useEditor();
  const [root, setRoot] = useState(null);
  const phone = useMedia('(max-width: 900px)');
  const focus = ctx.params.get('focus');
  const L = ctx.sum?.flow?.links?.fixOffers || {};
  const leads = ctx.sum?.flow?.leads || [];

  // deep link: /business/offers?edit=<id> opens the editor
  const editId = ctx.params.get('edit');
  useEffect(() => { const r = editId && (list.rows || []).find((o) => o.id === editId); if (r) ed.open(r); }, [editId, list.rows]); // eslint-disable-line react-hooks/exhaustive-deps
  const blockers = useMemo(() => (fixes.rows || []).filter((f) => !f.done && (f.offer_id || L[f.id]))
    .sort((a, b) => a.severity.localeCompare(b.severity)), [fixes.rows, L]);
  const links = useMemo(() => {
    const out = [];
    for (const f of blockers) {
      const ids = f.offer_id ? [f.offer_id] : (L[f.id]?.offers || []);
      // drawn only for the hovered / focused item; offers carry a blocker count instead
      for (const oid of ids) out.push({ id: `${f.id}>${oid}`, from: `fx:${f.id}`, to: `of:${oid}`, tone: f.severity === 'P0' ? 'bad' : f.severity === 'P1' ? 'warn' : 'info', dashed: !f.offer_id, hoverOnly: true, weight: f.severity === 'P0' ? 3 : 2 });
    }
    return out;
  }, [blockers, L]);
  const w = useWires(links);
  if (!list.rows || !fixes.rows) return <Loading />;
  const ready = list.rows.filter((o) => o.readiness === 'ok').length;
  const blockersOf = (oid) => links.filter((l) => l.to === `of:${oid}`).map((l) => blockers.find((f) => `fx:${f.id}` === l.from)).filter(Boolean);
  const interested = (o) => leads.filter((l) => l.offer && (shares(l.offer, o.name) || shares(l.offer, o.product))).length;

  return (
    <section className="bz-lens bz-offers">
      <LensHead icon={Gift} kicker="Offers" title={`${list.rows.length} offer${list.rows.length === 1 ? '' : 's'} · ${ready} ready to sell`}
        read={blockers.length ? `${blockers.length} open fix${blockers.length === 1 ? '' : 'es'} block these offers. Hover a blocker or an offer to see what connects — dashed = guessed from the product name.` : 'Nothing blocks these offers.'}>
        <AddButton onClick={() => ed.open()} label="Add offer" />
      </LensHead>
      {list.rows.length === 0 ? (
        <BizEmpty icon={Gift} title="No offers yet" text="What you sell, to whom, for how much — the promise, the price ladder, the guarantee." onAdd={() => ed.open()} addLabel="Write an offer" onTemplate={list.template} />
      ) : (
        <div className={`bz-wired ${blockers.length && !phone ? 'two' : ''}`} ref={setRoot}>
          {!phone && <FlowLinks root={root} links={links} active={w.hot} />}
          {blockers.length > 0 && !phone && (
            <div className="bz-wired-left" aria-label="Blockers">
              <p className="bz-col-title"><ShieldAlert size={13} /> Blocking</p>
              {blockers.map((f) => (
                <div key={f.id} {...w.bind(`fx:${f.id}`)} tabIndex={0} className={`bz-node kind-fix sev-${f.severity} ${w.cls(`fx:${f.id}`)}`}>
                  <em className={`bz-sev sev-${f.severity}`}>{f.severity}</em>
                  <span className="bz-node-name">{f.text}</span>
                  {!f.offer_id && (L[f.id]?.offers || []).length === 1 && (
                    <button type="button" className="bz-mini" onClick={() => fixes.update(f.id, { offer_id: L[f.id].offers[0] }, { undoLabel: 'Linked fix to offer' }).then(() => ctx.changed()).catch(() => {})}><Link2 size={12} /> Confirm link</button>
                  )}
                </div>
              ))}
            </div>
          )}
          <div className="bz-wired-right bz-offer-list">
            {list.rows.map((o) => (
              <OfferSheet key={o.id} o={o} head={w.bind(`of:${o.id}`)} cls={w.cls(`of:${o.id}`)} focus={focus === o.id}
                blockers={blockersOf(o.id)} showBlockers={phone} interested={interested(o)} onEdit={() => ed.open(o)} />
            ))}
          </div>
        </div>
      )}
      <Editor section="offers" icon={Gift} ed={ed} list={list} defaults={{ readiness: 'warn' }} />
    </section>
  );
}

function OfferSheet({ o, head, cls, focus, blockers, showBlockers, interested, onEdit }) {
  const pct = READINESS_PCT[o.readiness] ?? 50;
  const hasMore = o.guarantee || o.bonuses?.length || o.deliverables?.length || o.first_line || o.qualify || o.weak_spots?.length || (o.value && Object.values(o.value).some(Boolean));
  return (
    <article className={`bz-offer ready-${o.readiness} ${focus ? 'flash' : ''}`}>
      <header {...head} tabIndex={0} className={`bz-offer-head bz-node kind-offer ${cls}`}>
        <div className="bz-offer-title">
          <h3>{o.name}</h3>
          {o.tagline && <p>{o.tagline}</p>}
        </div>
        {blockers.length > 0 && <span className={`bz-blockcount ${blockers.some((f) => f.severity === 'P0') ? 'p0' : ''}`}><ShieldAlert size={12} /> {blockers.length} blocker{blockers.length === 1 ? '' : 's'}</span>}
        <button type="button" className="bz-icon-btn" aria-label={`Edit ${o.name}`} onClick={onEdit}><Pencil size={15} /></button>
      </header>
      <div className="bz-offer-meter">
        <span className={`ui-chip ui-chip--${TONE_CHIP[o.readiness] || 'info'}`}>{toneLabel(o.readiness)}</span>
        <div className="bz-meter" aria-label={`Readiness ${pct}%`}><i style={{ width: `${pct}%` }} /></div>
        {interested > 0 && <span className="bz-offer-int"><Users size={13} /> {interested} lead{interested === 1 ? '' : 's'}</span>}
      </div>
      {o.readiness_note && <p className="bz-muted">{o.readiness_note}</p>}
      <div className="bz-chips">{o.product && <Chip>{o.product}</Chip>}{o.for_who && <Chip tone="info">{o.for_who}</Chip>}</div>
      {o.ladder?.length > 0 && (
        <ol className="bz-ladder" aria-label="Price ladder">
          {o.ladder.map((s, i) => <li key={i}><span>{s.step}</span><b>{s.price}</b>{s.note && <small>{s.note}</small>}</li>)}
        </ol>
      )}
      {showBlockers && blockers.length > 0 && (
        <div className="bz-offer-blockers">{blockers.map((f) => <span key={f.id} className={`bz-blocker sev-${f.severity}`}><em className={`bz-sev sev-${f.severity}`}>{f.severity}</em>{f.text}</span>)}</div>
      )}
      {hasMore && (
        <details className="bz-more">
          <summary><ChevronDown size={14} /> The full offer</summary>
          {o.value && Object.values(o.value).some(Boolean) && (
            <dl className="bz-value">{[['dream', 'Dream'], ['likelihood', 'Likelihood'], ['time', 'Time'], ['effort', 'Effort']].map(([k, label]) => o.value[k] && <div key={k}><dt>{label}</dt><dd>{o.value[k]}</dd></div>)}</dl>
          )}
          {o.guarantee && <p className="bz-text"><b>Guarantee:</b> {o.guarantee}</p>}
          {o.bonuses?.length > 0 && <><p className="ui-kicker">Bonuses</p><Bullets items={o.bonuses} /></>}
          {o.deliverables?.length > 0 && <><p className="ui-kicker">Deliverables</p><ul className="bz-deliv">{o.deliverables.map((d, i) => <li key={i}><span>{d.when}</span><b>{d.what}</b>{d.form && <small>{d.form}</small>}</li>)}</ul></>}
          {o.first_line && <p className="bz-quote">“{o.first_line}”</p>}
          {o.qualify && <p className="bz-text"><b>Qualify:</b> {o.qualify}</p>}
          {o.weak_spots?.length > 0 && <><p className="ui-kicker">Weak spots</p><Bullets items={o.weak_spots} className="warn" /></>}
        </details>
      )}
    </article>
  );
}

// ───────────────────────── Products ─────────────────────────
export function Products() {
  const list = useBizList('products');
  const ctx = useBiz();
  const ed = useEditor();
  const [root, setRoot] = useState(null);
  const phone = useMedia('(max-width: 900px)');
  const offers = ctx.sum?.flow?.offers || [];
  const today = todayStr();
  const links = useMemo(() => {
    const out = [];
    for (const p of list.rows || []) for (const o of offers) if (shares(o.product, p.name)) out.push({ id: `${p.id}>${o.id}`, from: `pr:${p.id}`, to: `po:${o.id}`, tone: p.role === 'paid' ? 'flow' : 'info', weight: 2.2 });
    return out;
  }, [list.rows, offers]);
  const w = useWires(links);
  if (!list.rows) return <Loading />;
  const powered = offers.filter((o) => links.some((l) => l.to === `po:${o.id}`));
  const blocked = list.rows.filter((p) => p.blocker).length;

  return (
    <section className="bz-lens bz-products">
      <LensHead icon={Package} kicker="Products" title={`${list.rows.length} product${list.rows.length === 1 ? '' : 's'}${blocked ? ` · ${blocked} blocked` : ''}`}
        read={powered.length ? 'Lines show which offer each product powers.' : 'What you have built, what blocks it, and the next step.'}>
        <AddButton onClick={() => ed.open()} label="Add product" />
      </LensHead>
      {list.rows.length === 0 ? (
        <BizEmpty icon={Package} title="No products yet" text="Everything you have built: what it does, its role, what blocks it and the next step." onAdd={() => ed.open()} addLabel="Add a product" onTemplate={list.template} />
      ) : (
        <div className={`bz-wired ${powered.length && !phone ? 'two rev' : ''}`} ref={setRoot}>
          {!phone && <FlowLinks root={root} links={links} active={w.hot} />}
          <div className="bz-wired-main bz-prod-grid">
            {list.rows.map((p) => (
              <article key={p.id} className={`bz-prod role-${p.role} ${p.blocker ? 'blocked' : ''}`}>
                <header {...w.bind(`pr:${p.id}`)} tabIndex={0} className={`bz-prod-head bz-node kind-prod ${w.cls(`pr:${p.id}`)}`}>
                  <span className="bz-prod-name">{p.name}</span>
                  <Chip tone={p.role === 'paid' ? 'good' : p.role === 'park' ? 'bad' : 'info'}>{p.role}</Chip>
                  <button type="button" className="bz-icon-btn" aria-label={`Edit ${p.name}`} onClick={() => ed.open(p)}><Pencil size={15} /></button>
                </header>
                {p.what && <p className="bz-text">{p.what}</p>}
                <div className="bz-chips">{p.promised && <Chip tone="ai">Promised</Chip>}{p.price && <Chip>{p.price}</Chip>}</div>
                {p.status && <p className="bz-muted">{p.status}</p>}
                {p.blocker && <p className="bz-blocker-line"><ShieldAlert size={14} /> {p.blocker}</p>}
                {(p.next_step || p.next_date) && (
                  <div className="bz-nextline">
                    <span>{p.next_step || 'Next step'}</span>
                    <DatePick compact value={p.next_date} label="Next step date" onChange={(v) => list.update(p.id, { next_date: v }, { undoLabel: 'Date changed' }).catch(() => {})} tone={p.next_date && p.next_date < today ? 'late' : ''} />
                  </div>
                )}
              </article>
            ))}
          </div>
          {powered.length > 0 && !phone && (
            <div className="bz-wired-side">
              <p className="bz-col-title"><Gift size={13} /> Powers</p>
              {powered.map((o) => (
                <button key={o.id} type="button" {...w.bind(`po:${o.id}`)} className={`bz-node kind-offer ready-${o.readiness} ${w.cls(`po:${o.id}`)}`} onClick={() => ctx.go('offers', { focus: o.id })}>
                  <Gift size={14} aria-hidden="true" /><span className="bz-node-name">{o.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      <Editor section="products" icon={Package} ed={ed} list={list} defaults={{ role: 'paid', promised: false }} />
    </section>
  );
}

// ───────────────────────── Channels ─────────────────────────
export function Channels() {
  const list = useBizList('channels');
  const ctx = useBiz();
  const ed = useEditor();
  const [root, setRoot] = useState(null);
  const phone = useMedia('(max-width: 900px)');
  const focus = ctx.params.get('focus');
  const f = ctx.sum?.flow || {};
  const biz = useBizApi();
  const { showToast } = useToast();
  // per channel → stage counts, split into linked (source = channel name) and guessed (a shared word)
  const { per, guess, guessIds } = useMemo(() => {
    const m = {}; const g = {}; const ids = {};
    for (const l of f.leads || []) {
      const c = f.links?.leadChannel?.[l.id];
      if (!c || l.stage === 'lost') continue;
      const isGuess = !!f.links?.leadChannelGuess?.[l.id];
      const t = isGuess ? g : m;
      (t[c] ||= {})[l.stage] = ((t[c] || {})[l.stage] || 0) + 1;
      if (isGuess) (ids[c] ||= []).push(l.id);
    }
    return { per: m, guess: g, guessIds: ids };
  }, [f]);
  const links = useMemo(() => {
    const out = [];
    for (const [cid, st] of Object.entries(per)) for (const [stage, n] of Object.entries(st)) out.push({ id: `${cid}>${stage}`, from: `ch:${cid}`, to: `cs:${stage}`, tone: 'flow', weight: 1.6 + Math.log2(n + 1) * 1.7 });
    for (const [cid, st] of Object.entries(guess)) for (const [stage, n] of Object.entries(st)) out.push({ id: `${cid}~${stage}`, from: `ch:${cid}`, to: `cs:${stage}`, tone: 'flow', dashed: true, weight: 1.6 + Math.log2(n + 1) * 1.7 });
    return out;
  }, [per, guess]);
  const confirm = async (c) => {
    try {
      for (const id of guessIds[c.id] || []) await biz.current.update('leads', id, { source: c.name });
      showToast(`${(guessIds[c.id] || []).length} leads now come from “${c.name}”`, 'success');
      ctx.changed({ lists: true });
    } catch (e) { showToast(e.message, 'error'); }
  };
  const w = useWires(links);
  if (!list.rows) return <Loading />;
  const stageTotals = {};
  for (const st of [...Object.values(per), ...Object.values(guess)]) for (const [k, n] of Object.entries(st)) stageTotals[k] = (stageTotals[k] || 0) + n;
  const usedStages = LANES.filter((s) => stageTotals[s]);
  const total = (cid) => [...Object.values(per[cid] || {}), ...Object.values(guess[cid] || {})].reduce((a, b) => a + b, 0);

  return (
    <section className="bz-lens bz-channels">
      <LensHead icon={Radio} kicker="Channels" title={`${list.rows.length} channel${list.rows.length === 1 ? '' : 's'}`}
        read={links.length ? 'Lines show where each channel’s leads sit in the pipeline right now.' : 'Where buyers can find you, the numbers today, and the next moves.'}>
        <AddButton onClick={() => ed.open()} label="Add channel" />
      </LensHead>
      {list.rows.length === 0 ? (
        <BizEmpty icon={Radio} title="No channels yet" text="Where buyers can find you, what the numbers are today, and the next moves per channel." onAdd={() => ed.open()} addLabel="Add a channel" onTemplate={list.template} />
      ) : (
        <div className={`bz-wired ${usedStages.length && !phone ? 'two rev' : ''}`} ref={setRoot}>
          {!phone && <FlowLinks root={root} links={links} active={w.hot} />}
          <div className="bz-wired-main bz-chan-list">
            {list.rows.map((c) => (
              <article key={c.id} className={`bz-chan tone-${c.tone} ${focus === c.id ? 'flash' : ''}`}>
                <header {...w.bind(`ch:${c.id}`)} tabIndex={0} className={`bz-chan-head bz-node kind-src ${w.cls(`ch:${c.id}`)}`}>
                  <i className={`bz-dot tone-${TONE_CHIP[c.tone] || 'info'}`} aria-hidden="true" />
                  <span className="bz-chan-name">{c.name}</span>
                  {total(c.id) > 0 && <b className="bz-node-n">{total(c.id)} lead{total(c.id) === 1 ? '' : 's'}</b>}
                  <button type="button" className="bz-icon-btn" aria-label={`Edit ${c.name}`} onClick={() => ed.open(c)}><Pencil size={15} /></button>
                </header>
                {guessIds[c.id]?.length > 0 && (
                  <p className="bz-guessline">{guessIds[c.id].length} lead{guessIds[c.id].length === 1 ? '' : 's'} matched by a shared word (dashed)
                    <button type="button" className="bz-guess" onClick={() => confirm(c)}>Confirm link</button></p>
                )}
                {c.stat && <p className="bz-chan-stat">{c.stat}</p>}
                {c.verdict && <p className="bz-text"><Chip tone={TONE_CHIP[c.tone]}>{toneLabel(c.tone)}</Chip> {c.verdict}</p>}
                {c.audience && <p className="bz-muted">{c.audience}</p>}
                {(c.gaps?.length > 0 || c.moves?.length > 0) && (
                  <details className="bz-more">
                    <summary><ChevronDown size={14} /> {c.gaps?.length || 0} gaps · {c.moves?.length || 0} moves</summary>
                    {c.gaps?.length > 0 && <><p className="ui-kicker">Gaps</p><Bullets items={c.gaps} className="warn" /></>}
                    {c.moves?.length > 0 && <><p className="ui-kicker">Moves</p><Bullets items={c.moves} className="good" /></>}
                  </details>
                )}
              </article>
            ))}
          </div>
          {usedStages.length > 0 && !phone && (
            <div className="bz-wired-side">
              <p className="bz-col-title"><Users size={13} /> In the pipeline</p>
              {usedStages.map((s) => (
                <button key={s} type="button" {...w.bind(`cs:${s}`)} className={`bz-node kind-stage st-${s} ${w.cls(`cs:${s}`)}`} onClick={() => ctx.go('leads', { filter: s })}>
                  <span className="bz-node-name">{stageLabel(s)}</span><b className="bz-node-n">{stageTotals[s]}</b>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      <Editor section="channels" icon={Radio} ed={ed} list={list} defaults={{ tone: 'info' }} />
    </section>
  );
}

// ───────────────────────── Fixes ─────────────────────────
// Fixes live in OFFER LANES: each lane is an offer, holding the fixes that block it (P0 first). Drag a fix
// into another lane to re-link it; a guessed lane (matched by product name) shows dashed until confirmed.
const SEV = [['P0', 'blocks money'], ['P1', 'soon'], ['P2', 'later']];
export function Fixes() {
  const list = useBizList('fixes');
  const ctx = useBiz();
  const biz = useBizApi();
  const { showToast } = useToast();
  const ed = useEditor();
  const [sev, setSev] = useState(() => (['P0', 'P1', 'P2'].includes(ctx.params.get('filter')) ? ctx.params.get('filter') : 'all'));
  const [showDone, setShowDone] = useState(false);
  const [openId, setOpenId] = useState(() => ctx.params.get('focus'));
  const [dragId, setDragId] = useState(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 6 } }));
  const offers = ctx.sum?.flow?.offers || [];
  const L = ctx.sum?.flow?.links?.fixOffers || {};
  // lanes depend on the offer links in the summary: wait for both so lanes never re-order under you
  if (!list.rows || !ctx.sum) return <Loading />;
  const rows = list.rows;
  const open = rows.filter((f) => !f.done);
  const done = rows.filter((f) => f.done);
  const laneOf = (f) => f.offer_id || L[f.id]?.offers?.[0] || 'none';
  const guessed = (f) => !f.offer_id && !!L[f.id];
  const shown = open.filter((f) => sev === 'all' || f.severity === sev);
  const byLane = {};
  for (const f of shown) (byLane[laneOf(f)] ||= []).push(f);
  for (const k of Object.keys(byLane)) byLane[k].sort((a, b) => a.severity.localeCompare(b.severity));
  const p0 = (k) => (byLane[k] || []).filter((f) => f.severity === 'P0').length;
  const lanes = [...offers.filter((o) => byLane[o.id]).sort((a, b) => p0(b.id) - p0(a.id) || byLane[b.id].length - byLane[a.id].length).map((o) => o.id), ...(byLane.none ? ['none'] : [])];
  const offerOf = (id) => offers.find((o) => o.id === id);
  const blockedOffers = lanes.filter((k) => k !== 'none' && p0(k)).length;

  const relink = (f, lane) => {
    const v = lane === 'none' ? null : lane;
    if ((f.offer_id || null) === v && !guessed(f)) return;
    list.update(f.id, { offer_id: v }, { undoLabel: v ? `Linked to ${offerOf(v)?.name}` : 'Unlinked from offers' }).then(() => ctx.changed()).catch(() => {});
  };
  const toRpm = async (f) => {
    try {
      const r = await biz.current.fixToAction(f.id, { scheduled_date: todayStr() });
      list.setRows((rs) => rs.map((x) => (x.id === f.id ? r.fix : x)));
      ctx.changed();
      showToast(`On your RPM list: “${r.action.title}”`, 'success');
    } catch (e) { showToast(e.message, 'error'); }
  };
  const toggleDone = (f) => list.update(f.id, { done: !f.done }, { undoLabel: f.done ? 'Reopened fix' : 'Fix done' }).catch(() => {});
  const opened = openId ? rows.find((f) => f.id === openId) : null;
  const dragFix = dragId ? rows.find((f) => f.id === dragId) : null;

  return (
    <section className="bz-lens bz-fixes">
      <LensHead icon={Wrench} kicker="Fixes" title={open.length ? `${open.filter((f) => f.severity === 'P0').length} P0 fixes block ${blockedOffers} offer${blockedOffers === 1 ? '' : 's'}` : 'All clear'}
        read="Each lane is an offer and the fixes standing between it and money. Drag a fix to another lane to re-link it; dashed = guessed from the product name.">
        <AddButton onClick={() => ed.open()} label="Add fix" />
      </LensHead>
      {rows.length === 0 ? (
        <BizEmpty icon={Wrench} title="Nothing to fix yet" text="Things that block selling — a broken checkout, a missing case study. P0 first." onAdd={() => ed.open()} addLabel="Add a fix" onTemplate={list.template} />
      ) : (
        <>
          <div className="bz-toolbar" role="toolbar" aria-label="Filter fixes">
            <div className="ui-seg bz-seg-sm" role="radiogroup" aria-label="Severity">
              {[['all', 'All', open.length], ...SEV.map(([k]) => [k, k, open.filter((f) => f.severity === k).length])].filter(([, , n]) => n).map(([k, l, n]) => (
                <button key={k} type="button" role="radio" aria-checked={sev === k} className={sev === k ? 'on' : ''} onClick={() => setSev(k)}>{l} <em className="bz-seg-n">{n}</em></button>
              ))}
            </div>
            {done.length > 0 && <button type="button" className={`bz-toggle ${showDone ? 'on' : ''}`} aria-pressed={showDone} onClick={() => setShowDone((v) => !v)}><CheckSquare size={14} /> Done · {done.length}</button>}
          </div>
          <DndContext sensors={sensors} onDragStart={(e) => setDragId(e.active.id)} onDragCancel={() => setDragId(null)}
            onDragEnd={(e) => { setDragId(null); if (e.over) relink(rows.find((f) => f.id === e.active.id), e.over.id); }}>
            <div className="bz-board bz-offerlanes">
              {lanes.map((k) => (
                <OfferLane key={k} id={k} offer={offerOf(k)} fixes={byLane[k]} dragging={!!dragId}>
                  {byLane[k].map((f) => <FixCard key={f.id} f={f} guessed={guessed(f)} focus={openId === f.id} onOpen={() => setOpenId(f.id)} onDone={() => toggleDone(f)}
                    onConfirm={() => relink(f, laneOf(f))} />)}
                </OfferLane>
              ))}
              {dragId && offers.filter((o) => !byLane[o.id]).map((o) => <OfferLane key={o.id} id={o.id} offer={o} fixes={[]} dragging />)}
              {dragId && !byLane.none && <OfferLane id="none" fixes={[]} dragging />}
            </div>
            <DragOverlay dropAnimation={null}>{dragFix ? <FixCard f={dragFix} guessed={guessed(dragFix)} overlay /> : null}</DragOverlay>
          </DndContext>
          {showDone && (
            <section className="bz-postgroup" aria-label="Done fixes">
              <p className="ui-kicker">Done · {done.length}</p>
              <div className="bz-postgrid">{done.map((f) => <FixCard key={f.id} f={f} onOpen={() => setOpenId(f.id)} onDone={() => toggleDone(f)} />)}</div>
            </section>
          )}
        </>
      )}
      {opened && <FixSheet f={opened} offers={offers} suggested={L[opened.id]?.offers || []} onClose={() => setOpenId(null)}
        onRelink={(v) => relink(opened, v || 'none')} onRpm={() => toRpm(opened)} onDone={() => toggleDone(opened)} onEdit={() => { setOpenId(null); ed.open(opened); }} />}
      <Editor section="fixes" icon={Wrench} ed={ed} list={list} defaults={{ severity: 'P1' }} />
    </section>
  );
}

function OfferLane({ id, offer, fixes, dragging, children }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  const counts = SEV.map(([k]) => [k, fixes.filter((f) => f.severity === k).length]).filter(([, n]) => n);
  return (
    <div ref={setNodeRef} className={`bz-lane bz-olane ${id === 'none' ? 'none' : `ready-${offer?.readiness}`} ${isOver ? 'over' : ''} ${dragging ? 'dropping' : ''}`}
      role="group" aria-label={id === 'none' ? 'Not tied to an offer' : `Blocks ${offer?.name}`}>
      <header className="bz-olane-head">
        {id === 'none' ? <b className="bz-olane-name">Not tied to an offer</b> : (
          <>
            <span className="bz-olane-cap"><Gift size={12} /> blocks</span>
            <b className="bz-olane-name">{offer?.name}</b>
            <span className="bz-olane-meta">
              <span className={`ui-chip ui-chip--${TONE_CHIP[offer?.readiness] || 'info'}`}>{toneLabel(offer?.readiness)}</span>
              {counts.map(([k, n]) => <em key={k} className={`bz-sev sev-${k}`}>{n} {k}</em>)}
            </span>
          </>
        )}
      </header>
      <div className="bz-lane-body">{children}{!fixes.length && <p className="bz-lane-empty">Drop here</p>}</div>
    </div>
  );
}

function FixCard({ f, guessed, focus, onOpen, onDone, onConfirm, overlay = false }) {
  const drag = useDraggable({ id: f.id, disabled: overlay || f.done });
  return (
    <div ref={overlay ? undefined : drag.setNodeRef} className={`bz-fixcard sev-${f.severity} ${guessed ? 'guessed' : ''} ${f.done ? 'done' : ''} ${drag.isDragging ? 'ghost' : ''} ${overlay ? 'overlay' : ''} ${focus ? 'flash' : ''}`}>
      <button type="button" className="bz-check" aria-pressed={!!f.done} aria-label={f.done ? `Mark “${f.text}” not done` : `Mark “${f.text}” done`} onClick={onDone}>
        {f.done ? <CheckSquare size={18} /> : <Square size={18} />}
      </button>
      <button type="button" className="bz-fixcard-main" onClick={onOpen} {...(overlay || f.done ? {} : drag.listeners)} {...(overlay || f.done ? {} : drag.attributes)} aria-label={`${f.severity}: ${f.text}`}>
        <span className="bz-fixcard-top"><em className={`bz-sev sev-${f.severity}`}>{f.severity}</em>{f.effort && <span className="bz-fixcard-eff">{f.effort}</span>}{f.action_id && <CheckCircle2 size={13} className="bz-card-rpm" aria-label="In RPM" />}</span>
        <span className="bz-fixcard-text">{f.text}</span>
      </button>
      {guessed && onConfirm && <button type="button" className="bz-guess" onClick={onConfirm} title="Matched by product name — confirm this offer">guessed · Confirm</button>}
    </div>
  );
}

function FixSheet({ f, offers, suggested, onClose, onRelink, onRpm, onDone, onEdit }) {
  useEffect(() => {
    const k = (e) => { if (e.key === 'Escape' && !document.querySelector('.picker-menu')) onClose(); };
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  }, [onClose]);
  const guess = !f.offer_id && suggested.length;
  return (
    <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal biz-modal" role="dialog" aria-modal="true" aria-label={`Fix: ${f.text}`}>
        <ModalHead icon={Wrench} title={f.text} subtitle={`${f.severity} · ${SEV.find(([k]) => k === f.severity)?.[1]}${f.effort ? ` · ${f.effort}` : ''}${f.done ? ' · done' : ''}`} onClose={onClose} />
        <div className="modal-body mk-body">
          {f.detail && <p className="bz-text">{f.detail}</p>}
          <div className="mk-field">
            <span className="form-label">Blocks offer {guess ? <em className="bz-req">guessed — confirm or change</em> : null}</span>
            <Picker value={f.offer_id || (guess ? suggested[0] : '')} header="Blocks which offer?" onChange={(v) => onRelink(v)}
              options={[{ value: '', label: 'Not tied to an offer' }, ...offers.map((o) => ({ value: o.id, label: o.name, hint: suggested.includes(o.id) && !f.offer_id ? 'suggested' : '' }))]} />
          </div>
        </div>
        <div className="modal-footer mk-foot">
          <button type="button" className="btn btn-ghost bz-del" onClick={onEdit}><Pencil size={15} /> Edit all fields</button>
          <button type="button" className="btn btn-ghost" onClick={onDone}>{f.done ? 'Reopen' : 'Mark done'}</button>
          {f.action_id ? <span className="ui-chip ui-chip--good"><CheckCircle2 size={13} /> In RPM</span>
            : <button type="button" className="btn btn-secondary" onClick={onRpm}><CalendarPlus size={15} /> To RPM today</button>}
          <button type="button" className="btn btn-primary" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
}

// ───────────────────────── Library ─────────────────────────
const isUrl = (s) => /^https?:\/\//i.test(s || '');
const STATUS = ['current', 'superseded', 'obsolete', 'archive'];
const STATUS_TONE = { current: 'good', superseded: 'warn', obsolete: 'bad', archive: undefined };

export function Library() {
  const list = useBizList('docs');
  const ed = useEditor();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('current');
  if (!list.rows) return <Loading />;
  const counts = Object.fromEntries(STATUS.map((s) => [s, list.rows.filter((d) => d.status === s).length]));
  const rows = list.rows.filter((d) => (status === 'all' || d.status === status) && (!q || `${d.path} ${d.note}`.toLowerCase().includes(q.toLowerCase())));
  return (
    <section className="bz-lens bz-library">
      <LensHead icon={LibraryIcon} kicker="Library" title={`${counts.current} current · ${list.rows.length - counts.current} older`} read="Research, plans and notes — where they live and whether they still hold.">
        <AddButton onClick={() => ed.open()} label="Add document" />
      </LensHead>
      {list.rows.length === 0 ? (
        <BizEmpty icon={LibraryIcon} title="No documents yet" text="Research, plans and notes: where they live and whether they are still current." onAdd={() => ed.open()} addLabel="Add a document" onTemplate={list.template} />
      ) : (
        <>
          <div className="bz-toolbar" role="toolbar" aria-label="Filter documents">
            <label className="bz-search"><Search size={15} aria-hidden="true" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search documents" aria-label="Search documents" /></label>
            <div className="ui-seg bz-seg-sm" role="radiogroup" aria-label="Status">
              {[['all', 'All', list.rows.length], ...STATUS.map((s) => [s, s, counts[s]])].filter(([, , n]) => n).map(([v, l, n]) => (
                <button key={v} type="button" role="radio" aria-checked={status === v} className={status === v ? 'on' : ''} onClick={() => setStatus(v)}>{l} <em className="bz-seg-n">{n}</em></button>
              ))}
            </div>
          </div>
          <ul className="bz-docs">
            {rows.map((d) => (
              <li key={d.id} className={`bz-doc st-${d.status}`}>
                <i className={`bz-dot tone-${STATUS_TONE[d.status] || 'info'}`} aria-hidden="true" />
                <div className="bz-doc-body">
                  {isUrl(d.path) ? <a href={d.path} target="_blank" rel="noopener noreferrer" className="bz-doc-path">{d.path} <ExternalLink size={12} /></a>
                    : <span className="bz-doc-path mono">{d.path}</span>}
                  {d.note && <span className="bz-muted">{d.note}</span>}
                </div>
                {d.date && <span className="bz-doc-date">{fmtDate(d.date)}</span>}
                <div className="bz-doc-status"><Picker value={d.status} header="Status" options={STATUS.map((s) => ({ value: s, label: s }))} onChange={(v) => list.update(d.id, { status: v }, { undoLabel: `Marked ${v}` }).catch(() => {})} /></div>
                <button type="button" className="bz-icon-btn" aria-label={`Edit ${d.path}`} onClick={() => ed.open(d)}><Pencil size={15} /></button>
              </li>
            ))}
            {rows.length === 0 && <li className="bz-muted bz-pad">No documents match.</li>}
          </ul>
        </>
      )}
      <Editor section="docs" icon={LibraryIcon} ed={ed} list={list} defaults={{ status: 'current', date: todayStr() }} />
    </section>
  );
}

// ───────────────────────── Content ─────────────────────────
const CONTENT_STATUS = ['idea', 'draft', 'ready', 'published'];
const CONTENT_TONE = { idea: undefined, draft: 'warn', ready: 'info', published: 'good' };
const addDays = (iso, n) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

export function Content() {
  const list = useBizList('content');
  const ed = useEditor();
  const today = todayStr();
  if (!list.rows) return <Loading />;
  const days = Array.from({ length: 14 }, (_, i) => addDays(today, i));
  const inStrip = new Set(days);
  const later = list.rows.filter((c) => c.date && c.date > days[13]);
  const past = list.rows.filter((c) => c.date && c.date < today && c.status !== 'published');
  const unscheduled = list.rows.filter((c) => !c.date);
  const next = list.rows.filter((c) => c.date && c.date >= today && c.status !== 'published').sort((a, b) => a.date.localeCompare(b.date))[0];
  const cycle = (c) => list.update(c.id, { status: CONTENT_STATUS[(CONTENT_STATUS.indexOf(c.status) + 1) % CONTENT_STATUS.length] }, { undoLabel: 'Status changed' }).catch(() => {});
  const Post = ({ c }) => (
    <div className={`bz-post st-${c.status}`}>
      <button type="button" className="bz-post-title" onClick={() => ed.open(c)}>{c.title}</button>
      <span className="bz-post-meta">
        <button type="button" className={`ui-chip ${CONTENT_TONE[c.status] ? `ui-chip--${CONTENT_TONE[c.status]}` : ''} bz-chip-btn`} title="Next status" onClick={() => cycle(c)}>{c.status} ›</button>
        {c.platform && <Chip>{c.platform}</Chip>}
        <DatePick compact value={c.date} label="Post date" onChange={(v) => list.update(c.id, { date: v }, { undoLabel: v ? `Moved to ${fmtDate(v)}` : 'Unscheduled' }).catch(() => {})} />
      </span>
    </div>
  );
  return (
    <section className="bz-lens bz-content">
      <LensHead icon={CalendarDays} kicker="Content" title={next ? `Next: ${next.title}` : `${list.rows.length} post${list.rows.length === 1 ? '' : 's'}`}
        read={next ? `${fmtDate(next.date)}${next.platform ? ` · ${next.platform}` : ''} — click a status to move it forward.` : 'A simple content calendar: what goes out when, where, and why.'}>
        <AddButton onClick={() => ed.open()} label="Plan a post" />
      </LensHead>
      {list.rows.length === 0 ? (
        <BizEmpty icon={CalendarDays} title="No posts planned" text="What goes out when, where, and why (proof or community). Posts you publish show up as outcomes." onAdd={() => ed.open()} addLabel="Plan your first post" onTemplate={list.template} />
      ) : (
        <>
          <div className="bz-strip" role="list" aria-label="Next 14 days">
            {days.map((d) => {
              const items = list.rows.filter((c) => c.date === d);
              return (
                <div key={d} role="listitem" className={`bz-day ${d === today ? 'today' : ''} ${items.length ? 'has' : ''}`}>
                  <p className="bz-day-head">{d === today ? 'Today' : fmtDate(d)}</p>
                  {items.map((c) => <Post key={c.id} c={c} />)}
                </div>
              );
            })}
          </div>
          {[['Overdue — not published', past], ['Later', later], ['Not scheduled', unscheduled]].map(([label, items]) => items.length > 0 && (
            <section key={label} className="bz-postgroup"><p className="ui-kicker">{label} · {items.length}</p><div className="bz-postgrid">{items.filter((c) => !inStrip.has(c.date)).map((c) => <Post key={c.id} c={c} />)}</div></section>
          ))}
        </>
      )}
      <Editor section="content" icon={CalendarDays} ed={ed} list={list} defaults={{ status: 'idea', date: today }} />
    </section>
  );
}
