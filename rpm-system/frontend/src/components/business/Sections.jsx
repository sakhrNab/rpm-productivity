// The arsenal lenses: Offers, Products, Channels, Fixes, Library, Content. Each one draws the links its
// entities have. Wired lenses keep the linked cards in ONE column with a port on the card edge, so every
// wire runs in the gutter between the card and its target — never under another card.
import { useEffect, useMemo, useState } from 'react';
import { DndContext, DragOverlay, PointerSensor, TouchSensor, useDraggable, useDroppable, useSensor, useSensors } from '@dnd-kit/core';
import ModalHead from '../modals/ModalHead';
import {
  Gift, Package, Radio, Wrench, Library as LibraryIcon, CalendarDays, CalendarPlus, CheckCircle2, ExternalLink,
  Square, CheckSquare, Pencil, Search, Link2, ChevronDown, ShieldAlert, Users, Plus, FileText, Layers,
} from 'lucide-react';
import Picker from '../Picker';
import FlowLinks, { connected, useMedia } from '../FlowLinks';
import { useToast } from '../ToastProvider';
import DatePick from './DatePick';
import { AddButton, BizEmpty, Bullets, Chip, Editor, LensHead, Loading, ValueEquation, useBiz, useBizApi, useBizList, useEditor } from './bizKit';
import { LANES, READINESS_PCT, TONE_CHIP, addDaysStr, fmtDate, stageLabel, todayStr, toneLabel } from './bizConfig';

const STOP = new Set(['your', 'the', 'and', 'for', 'with', 'from', 'service', 'free', 'install', 'partner', 'app', 'auto', 'ai', 'docs', 'plan', 'notes', 'md']);
const words = (s) => String(s || '').toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 3 && !STOP.has(w));
const shares = (a, b) => { const B = new Set(words(b)); return words(a).some((w) => B.has(w)); };
const plural = (n, w) => `${n} ${n === 1 ? w : /(x|s|ch)$/.test(w) ? `${w}es` : `${w}s`}`;
/** The one sentence every page uses for blockers (numbers from the backend's fixBlocks). */
export const blockLine = (st) => `${plural(st.p0Fixes, 'P0 fix')} · ${plural(st.offersBlockedByP0, 'offer')} blocked`;

/** Hover state → lit link ids + lit node ids for a wired layout. */
function useWires(links) {
  const [hover, setHover] = useState(null);
  const hot = useMemo(() => (hover ? connected(links, hover) : new Set()), [hover, links]);
  const lit = useMemo(() => {
    const s = new Set(hover ? [hover] : []);
    for (const l of links) if (hot.has(l.id)) { s.add(l.from); s.add(l.to); }
    return s;
  }, [hot, hover, links]);
  const on = (id) => ({ onMouseEnter: () => setHover(id), onMouseLeave: () => setHover(null), onFocus: () => setHover(id), onBlur: () => setHover(null) });
  const bind = (id) => ({ 'data-node': id, ...on(id) });
  const cls = (id) => (lit.size ? (lit.has(id) ? 'is-hot' : 'is-dim') : '');
  return { hot: hot.size ? hot : null, bind, on, cls };
}
/** The visible connection point on a card's edge; wires attach here, not to the card's middle. */
const Port = ({ id, side = 'right', live = true }) => <span className={`bz-port ${side} ${live ? '' : 'idle'}`} data-node={id} aria-hidden="true" />;

/** Blocker facts from the summary — the one backend answer every page shares (businessMoves.fixBlocks). */
export function useBlocks() {
  const L = useBiz()?.sum?.flow?.links || {};
  return { fixOffers: L.fixOffers || {}, offerBlockers: L.offerBlockers || {}, offerReadiness: L.offerReadiness || {}, stats: L.blockStats || { p0Fixes: 0, offersBlockedByP0: 0, openFixes: 0, offersBlocked: 0, offersReady: 0 } };
}
/** Readiness as shown: a P0 blocker overrides what was typed (backend rule in fixBlocks). */
export function readyOf(o, R = {}) {
  const r = R[o?.id];
  const value = r?.effective || o?.readiness || 'warn';
  return { value, overridden: !!r?.p0Blocked && r.stored !== 'bad', label: r?.p0Blocked ? 'Blocked by a P0' : toneLabel(value), tone: TONE_CHIP[value] || 'info' };
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
  const { fixOffers, offerBlockers, offerReadiness, stats } = useBlocks();
  const leads = ctx.sum?.flow?.leads || [];

  // deep link: /business/offers?edit=<id> opens the editor
  const editId = ctx.params.get('edit');
  useEffect(() => { const r = editId && (list.rows || []).find((o) => o.id === editId); if (r) ed.open(r); }, [editId, list.rows]); // eslint-disable-line react-hooks/exhaustive-deps
  const byId = useMemo(() => Object.fromEntries((fixes.rows || []).map((f) => [f.id, f])), [fixes.rows]);
  const blockers = useMemo(() => (fixes.rows || []).filter((f) => !f.done && fixOffers[f.id]).sort((a, b) => a.severity.localeCompare(b.severity)), [fixes.rows, fixOffers]);
  const links = useMemo(() => blockers.flatMap((f) => fixOffers[f.id].offers.map((oid) => ({
    id: `${f.id}>${oid}`, from: `fx:${f.id}`, to: `of:${oid}`, tone: f.severity === 'P0' ? 'bad' : f.severity === 'P1' ? 'warn' : 'info',
    dashed: !fixOffers[f.id].explicit, hoverOnly: true, weight: f.severity === 'P0' ? 3 : 2,
  }))), [blockers, fixOffers]);
  const w = useWires(links);
  if (!list.rows || !fixes.rows) return <Loading />;
  const ready = list.rows.filter((o) => readyOf(o, offerReadiness).value === 'ok').length;
  const blockersOf = (oid) => (offerBlockers[oid]?.fixIds || []).map((id) => byId[id]).filter(Boolean);
  const interested = (o) => leads.filter((l) => l.offer && (shares(l.offer, o.name) || shares(l.offer, o.product))).length;

  return (
    <section className="bz-lens bz-offers">
      <LensHead icon={Gift} kicker="Offers" title={`${plural(list.rows.length, 'offer')} · ${ready} ready to sell`}
        read={stats.openFixes ? `${blockLine(stats)}. Hover a blocker or an offer to light what connects — dashed = guessed from the product name.` : 'Nothing blocks these offers.'}
        readTouch={stats.openFixes ? `${blockLine(stats)}. Each offer lists its blockers.` : 'Nothing blocks these offers.'}>
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
                  {fixOffers[f.id].offers.length > 1 && <small className="bz-node-sub">blocks {fixOffers[f.id].offers.length} offers</small>}
                  {!fixOffers[f.id].explicit && fixOffers[f.id].offers.length === 1 && (
                    <button type="button" className="bz-guess" onClick={() => fixes.update(f.id, { offer_id: fixOffers[f.id].offers[0] }, { undoLabel: 'Linked fix to offer' }).then(() => ctx.changed()).catch(() => {})}><Link2 size={12} /> guessed · Confirm</button>
                  )}
                </div>
              ))}
            </div>
          )}
          <div className="bz-wired-right bz-offer-list">
            {list.rows.map((o) => (
              <OfferSheet key={o.id} o={o} ready={readyOf(o, offerReadiness)} head={w.bind(`of:${o.id}`)} cls={w.cls(`of:${o.id}`)} focus={focus === o.id}
                blockers={blockersOf(o.id)} showBlockers={phone} interested={interested(o)} onEdit={() => ed.open(o)} />
            ))}
          </div>
        </div>
      )}
      <Editor section="offers" icon={Gift} ed={ed} list={list} defaults={{ readiness: 'warn' }} />
    </section>
  );
}

function OfferSheet({ o, ready, head, cls, focus, blockers, showBlockers, interested, onEdit }) {
  const pct = READINESS_PCT[ready.value] ?? 50;
  const hasMore = o.guarantee || o.bonuses?.length || o.deliverables?.length || o.first_line || o.qualify || o.weak_spots?.length || (o.value && Object.values(o.value).some(Boolean));
  return (
    <article className={`bz-offer ready-${ready.value} ${focus ? 'flash' : ''}`}>
      <header {...head} tabIndex={0} className={`bz-offer-head bz-node kind-offer ${cls}`}>
        <div className="bz-offer-title">
          <h3>{o.name}</h3>
          {o.tagline && <p>{o.tagline}</p>}
        </div>
        {blockers.length > 0 && <span className={`bz-blockcount ${blockers.some((f) => f.severity === 'P0') ? 'p0' : ''}`}><ShieldAlert size={12} /> {blockers.length} blocker{blockers.length === 1 ? '' : 's'}</span>}
        <button type="button" className="bz-icon-btn" aria-label={`Edit ${o.name}`} onClick={onEdit}><Pencil size={15} /></button>
      </header>
      <div className="bz-offer-meter">
        <span className={`ui-chip ui-chip--${ready.tone}`} title={ready.overridden ? `You set “${toneLabel(o.readiness)}”, but an open P0 fix blocks it` : undefined}>{ready.label}</span>
        {ready.overridden && <span className="bz-ready-was">set: {toneLabel(o.readiness)}</span>}
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
          {o.value && Object.values(o.value).some(Boolean) && <ValueEquation value={o.value} compact />}
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
  const { offerReadiness } = useBlocks();
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
  const wired = powered.length > 0 && !phone;

  return (
    <section className="bz-lens bz-products">
      <LensHead icon={Package} kicker="Products" title={`${plural(list.rows.length, 'product')}${blocked ? ` · ${blocked} blocked` : ''}`}
        read={powered.length ? 'Each product wires from its port into the offers it powers. Hover one to light its path.' : 'What you have built, what blocks it, and the next step.'}
        readTouch="What you have built, what blocks it, and the offers it powers.">
        <AddButton onClick={() => ed.open()} label="Add product" />
      </LensHead>
      {list.rows.length === 0 ? (
        <BizEmpty icon={Package} title="No products yet" text="Everything you have built: what it does, its role, what blocks it and the next step." onAdd={() => ed.open()} addLabel="Add a product" onTemplate={list.template} />
      ) : (
        <div className={`bz-wired ${wired ? 'two rev' : ''}`} ref={setRoot}>
          {wired && <FlowLinks root={root} links={links} active={w.hot} />}
          <div className="bz-wired-main bz-rows">
            {list.rows.map((p) => {
              const powers = offers.filter((o) => links.some((l) => l.from === `pr:${p.id}` && l.to === `po:${o.id}`));
              return (
                <article key={p.id} {...w.on(`pr:${p.id}`)} tabIndex={0} className={`bz-prod bz-row role-${p.role} ${p.blocker ? 'blocked' : ''} ${w.cls(`pr:${p.id}`)}`}>
                  <div className="bz-row-id">
                    <span className="bz-prod-name">{p.name}</span>
                    <span className="bz-chips"><Chip tone={p.role === 'paid' ? 'good' : p.role === 'park' ? 'bad' : 'info'}>{p.role}</Chip>{p.promised && <Chip tone="ai">Promised</Chip>}{p.price && <Chip>{p.price}</Chip>}</span>
                  </div>
                  <div className="bz-row-body">
                    {p.what && <p className="bz-text">{p.what}</p>}
                    {p.status && <p className="bz-muted">{p.status}</p>}
                    {p.blocker && <p className="bz-blocker-line"><ShieldAlert size={14} /> {p.blocker}</p>}
                    {(p.next_step || p.next_date) && (
                      <div className="bz-nextline">
                        <span>{p.next_step || 'Next step'}</span>
                        <DatePick compact value={p.next_date} label="Next step date" onChange={(v) => list.update(p.id, { next_date: v }, { undoLabel: 'Date changed' }).catch(() => {})} tone={p.next_date && p.next_date < today ? 'late' : ''} />
                      </div>
                    )}
                    {!wired && powers.length > 0 && <p className="bz-muted"><Gift size={12} /> Powers {powers.map((o) => o.name).join(', ')}</p>}
                  </div>
                  <button type="button" className="bz-icon-btn bz-row-edit" aria-label={`Edit ${p.name}`} onClick={() => ed.open(p)}><Pencil size={15} /></button>
                  {wired && powers.length > 0 && <Port id={`pr:${p.id}`} />}
                </article>
              );
            })}
          </div>
          {wired && (
            <div className="bz-wired-side">
              <p className="bz-col-title"><Gift size={13} /> Powers</p>
              {powered.map((o) => (
                <button key={o.id} type="button" {...w.bind(`po:${o.id}`)} className={`bz-node kind-offer ready-${readyOf(o, offerReadiness).value} ${w.cls(`po:${o.id}`)}`} onClick={() => ctx.go('offers', { focus: o.id })}>
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
  const w = useWires(links);
  const confirm = async (c) => {
    try {
      for (const id of guessIds[c.id] || []) await biz.current.update('leads', id, { source: c.name });
      showToast(`${plural((guessIds[c.id] || []).length, 'lead')} now come from “${c.name}”`, 'success');
      ctx.changed({ lists: true });
    } catch (e) { showToast(e.message, 'error'); }
  };
  if (!list.rows) return <Loading />;
  const stageTotals = {};
  for (const st of [...Object.values(per), ...Object.values(guess)]) for (const [k, n] of Object.entries(st)) stageTotals[k] = (stageTotals[k] || 0) + n;
  const usedStages = LANES.filter((s) => stageTotals[s]);
  const total = (cid) => [...Object.values(per[cid] || {}), ...Object.values(guess[cid] || {})].reduce((a, b) => a + b, 0);
  const wired = usedStages.length > 0 && !phone;

  return (
    <section className="bz-lens bz-channels">
      <LensHead icon={Radio} kicker="Channels" title={plural(list.rows.length, 'channel')}
        read={links.length ? 'Each channel wires from its port to the pipeline stages its leads sit in. Dashed = matched by a shared word — confirm it.' : 'Where buyers can find you, the numbers today, and the next moves.'}
        readTouch="Where buyers find you, the leads each channel brought, and the next moves.">
        <AddButton onClick={() => ed.open()} label="Add channel" />
      </LensHead>
      {list.rows.length === 0 ? (
        <BizEmpty icon={Radio} title="No channels yet" text="Where buyers can find you, what the numbers are today, and the next moves per channel." onAdd={() => ed.open()} addLabel="Add a channel" onTemplate={list.template} />
      ) : (
        <div className={`bz-wired ${wired ? 'two rev' : ''}`} ref={setRoot}>
          {wired && <FlowLinks root={root} links={links} active={w.hot} />}
          <div className="bz-wired-main bz-rows">
            {list.rows.map((c) => (
              <article key={c.id} {...w.on(`ch:${c.id}`)} tabIndex={0} className={`bz-chan bz-row tone-${c.tone} ${focus === c.id ? 'flash' : ''} ${w.cls(`ch:${c.id}`)}`}>
                <div className="bz-row-id">
                  <span className="bz-chan-name"><i className={`bz-dot tone-${TONE_CHIP[c.tone] || 'info'}`} aria-hidden="true" /> {c.name}</span>
                  {total(c.id) > 0 && <b className="bz-node-n">{plural(total(c.id), 'lead')}</b>}
                  {c.stat && <span className="bz-chan-stat">{c.stat}</span>}
                </div>
                <div className="bz-row-body">
                  {guessIds[c.id]?.length > 0 && (
                    <p className="bz-guessline">{plural(guessIds[c.id].length, 'lead')} matched by a shared word
                      <button type="button" className="bz-guess" onClick={() => confirm(c)}>guessed · Confirm</button></p>
                  )}
                  {c.verdict && <p className="bz-text"><Chip tone={TONE_CHIP[c.tone]}>{toneLabel(c.tone)}</Chip> {c.verdict}</p>}
                  {c.audience && <p className="bz-muted">{c.audience}</p>}
                  {(c.gaps?.length > 0 || c.moves?.length > 0) && (
                    <details className="bz-more">
                      <summary><ChevronDown size={14} /> {c.gaps?.length || 0} gaps · {c.moves?.length || 0} moves</summary>
                      {c.gaps?.length > 0 && <><p className="ui-kicker">Gaps</p><Bullets items={c.gaps} className="warn" /></>}
                      {c.moves?.length > 0 && <><p className="ui-kicker">Moves</p><Bullets items={c.moves} className="good" /></>}
                    </details>
                  )}
                </div>
                <button type="button" className="bz-icon-btn bz-row-edit" aria-label={`Edit ${c.name}`} onClick={() => ed.open(c)}><Pencil size={15} /></button>
                {wired && total(c.id) > 0 && <Port id={`ch:${c.id}`} />}
              </article>
            ))}
          </div>
          {wired && (
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
// Fixes live in OFFER LANES: each lane is an offer and the fixes standing between it and money (P0 first).
// Lanes come from the backend's fixBlocks — the same answer Overview and Offers use — so a fix that blocks
// three offers appears in all three lanes ("also blocks …"). Drag a fix into a lane to pin it to that offer.
const SEV = [['P0', 'blocks money'], ['P1', 'soon'], ['P2', 'later']];
export function Fixes() {
  const list = useBizList('fixes');
  const ctx = useBiz();
  const biz = useBizApi();
  const { showToast } = useToast();
  const ed = useEditor();
  const touch = useMedia('(hover: none), (max-width: 900px)');
  const [sev, setSev] = useState(() => (['P0', 'P1', 'P2'].includes(ctx.params.get('filter')) ? ctx.params.get('filter') : 'all'));
  const [showDone, setShowDone] = useState(false);
  const [openId, setOpenId] = useState(() => ctx.params.get('focus'));
  const [dragId, setDragId] = useState(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 6 } }));
  const offers = ctx.sum?.flow?.offers || [];
  const { fixOffers, offerBlockers, offerReadiness, stats } = useBlocks();
  // lanes depend on the summary's blocker map: wait for both so lanes never re-order under you
  if (!list.rows || !ctx.sum) return <Loading />;
  const rows = list.rows;
  const byId = Object.fromEntries(rows.map((f) => [f.id, f]));
  const open = rows.filter((f) => !f.done);
  const done = rows.filter((f) => f.done);
  const pass = (f) => f && !f.done && (sev === 'all' || f.severity === sev);
  const offerOf = (id) => offers.find((o) => o.id === id);
  const lanes = offers.filter((o) => (offerBlockers[o.id]?.fixIds || []).some((id) => pass(byId[id])))
    .sort((a, b) => (offerBlockers[b.id].P0 - offerBlockers[a.id].P0) || (offerBlockers[b.id].fixIds.length - offerBlockers[a.id].fixIds.length))
    .map((o) => ({ id: o.id, offer: o, fixes: offerBlockers[o.id].fixIds.map((id) => byId[id]).filter(pass).sort((a, b) => a.severity.localeCompare(b.severity)) }));
  const loose = open.filter((f) => pass(f) && !fixOffers[f.id]).sort((a, b) => a.severity.localeCompare(b.severity));

  const relink = (f, lane) => {
    const v = lane === 'none' ? null : lane;
    if ((f.offer_id || null) === v) return;
    list.update(f.id, { offer_id: v }, { undoLabel: v ? `Pinned to ${offerOf(v)?.name}` : 'Unlinked from offers' }).then(() => ctx.changed()).catch(() => {});
  };
  const toRpm = async (f) => {
    try {
      const r = await biz.current.fixToAction(f.id, { scheduled_date: todayStr() });
      list.setRows((rs) => rs.map((x) => (x.id === f.id ? r.fix : x)));
      ctx.changed();
      showToast(`On your RPM list: “${r.action.title}”`, 'success');
    } catch (e) { showToast(e.message, 'error'); }
  };
  const toggleDone = (f) => list.update(f.id, { done: !f.done }, { undoLabel: f.done ? 'Reopened fix' : 'Fix done' }).then(() => ctx.changed()).catch(() => {});
  const opened = openId ? byId[openId] : null;
  const dragFix = dragId ? byId[dragId] : null;
  const also = (f, laneId) => (fixOffers[f.id]?.offers || []).filter((id) => id !== laneId).map((id) => offerOf(id)?.name).filter(Boolean);

  return (
    <section className="bz-lens bz-fixes">
      <LensHead icon={Wrench} kicker="Fixes" title={open.length ? blockLine(stats) : 'All clear'}
        read="Each lane is an offer and the fixes standing between it and money. A fix that blocks several offers shows in each lane. Drag a fix into a lane to pin it to that offer; dashed = guessed from the product name."
        readTouch="Each lane is an offer and the fixes blocking it — swipe across lanes. Tap a fix to pin it to an offer, send it to RPM or close it.">
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
          <DndContext sensors={sensors} onDragStart={(e) => setDragId(String(e.active.id).split('@')[0])} onDragCancel={() => setDragId(null)}
            onDragEnd={(e) => { setDragId(null); if (e.over) relink(byId[String(e.active.id).split('@')[0]], e.over.id); }}>
            <div className="bz-board bz-offerlanes">
              {lanes.map((ln) => (
                <OfferLane key={ln.id} id={ln.id} offer={ln.offer} ready={ln.offer ? readyOf(ln.offer, offerReadiness) : null} counts={ln.id === 'none' ? null : offerBlockers[ln.id]} n={ln.fixes.length} dragging={!!dragId}>
                  {ln.fixes.map((f) => <FixCard key={`${f.id}@${ln.id}`} dragKey={`${f.id}@${ln.id}`} f={f} guessed={!!fixOffers[f.id] && !fixOffers[f.id].explicit} also={also(f, ln.id)}
                    focus={openId === f.id} onOpen={() => setOpenId(f.id)} onDone={() => toggleDone(f)} onConfirm={() => relink(f, ln.id)} />)}
                </OfferLane>
              ))}
              {dragId && offers.filter((o) => !lanes.some((l) => l.id === o.id)).map((o) => <OfferLane key={o.id} id={o.id} offer={o} n={0} dragging />)}
            </div>
            {/* fixes tied to no offer: a full-width section under the lanes, never a clipped lane */}
            {(loose.length > 0 || dragId) && (
              <div className="bz-loose">
                <OfferLane id="none" counts={null} n={loose.length} dragging={!!dragId}>
                  {loose.map((f) => <FixCard key={`${f.id}@none`} dragKey={`${f.id}@none`} f={f} focus={openId === f.id} onOpen={() => setOpenId(f.id)} onDone={() => toggleDone(f)} />)}
                </OfferLane>
              </div>
            )}
            <DragOverlay dropAnimation={null}>{dragFix ? <FixCard f={dragFix} overlay /> : null}</DragOverlay>
          </DndContext>
          {touch && <p className="bz-muted">Tap a fix to change the offer it blocks.</p>}
          {showDone && (
            <section className="bz-postgroup" aria-label="Done fixes">
              <p className="ui-kicker">Done · {done.length}</p>
              <div className="bz-postgrid">{done.map((f) => <FixCard key={f.id} dragKey={f.id} f={f} onOpen={() => setOpenId(f.id)} onDone={() => toggleDone(f)} />)}</div>
            </section>
          )}
        </>
      )}
      {opened && <FixSheet f={opened} offers={offers} blocks={fixOffers[opened.id]} onClose={() => setOpenId(null)}
        onRelink={(v) => relink(opened, v || 'none')} onRpm={() => toRpm(opened)} onDone={() => toggleDone(opened)} onEdit={() => { setOpenId(null); ed.open(opened); }} />}
      <Editor section="fixes" icon={Wrench} ed={ed} list={list} defaults={{ severity: 'P1' }} />
    </section>
  );
}

function OfferLane({ id, offer, ready, counts, n, dragging, children }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div ref={setNodeRef} className={`bz-lane bz-olane ${id === 'none' ? 'none' : `ready-${ready?.value}`} ${isOver ? 'over' : ''} ${dragging ? 'dropping' : ''}`}
      role="group" aria-label={id === 'none' ? 'Not tied to an offer' : `Blocks ${offer?.name}`}>
      <header className="bz-olane-head">
        {id === 'none' ? <><span className="bz-olane-cap"><Layers size={12} /> loose</span><b className="bz-olane-name">Not tied to an offer</b><span className="bz-olane-meta"><em className="bz-olane-n">{n}</em></span></> : (
          <>
            <span className="bz-olane-cap"><Gift size={12} /> blocks</span>
            <b className="bz-olane-name">{offer?.name}</b>
            <span className="bz-olane-meta">
              {ready && <span className={`ui-chip ui-chip--${ready.tone}`}>{ready.label}</span>}
              {counts && SEV.map(([k]) => counts[k] > 0 && <em key={k} className={`bz-sev sev-${k}`}>{counts[k]} {k}</em>)}
            </span>
          </>
        )}
      </header>
      <div className="bz-lane-body">{children}{!n && <p className="bz-lane-empty">Drop here</p>}</div>
    </div>
  );
}

function FixCard({ f, dragKey, guessed, also = [], focus, onOpen, onDone, onConfirm, overlay = false }) {
  const drag = useDraggable({ id: dragKey || f.id, disabled: overlay || f.done });
  return (
    <div ref={overlay ? undefined : drag.setNodeRef} className={`bz-fixcard sev-${f.severity} ${guessed ? 'guessed' : ''} ${f.done ? 'done' : ''} ${drag.isDragging ? 'ghost' : ''} ${overlay ? 'overlay' : ''} ${focus ? 'flash' : ''}`}>
      <button type="button" className="bz-check" aria-pressed={!!f.done} aria-label={f.done ? `Mark “${f.text}” not done` : `Mark “${f.text}” done`} onClick={onDone}>
        {f.done ? <CheckSquare size={18} /> : <Square size={18} />}
      </button>
      <button type="button" className="bz-fixcard-main" onClick={onOpen} {...(overlay || f.done ? {} : drag.listeners)} {...(overlay || f.done ? {} : drag.attributes)} aria-label={`${f.severity}: ${f.text}`}>
        <span className="bz-fixcard-top"><em className={`bz-sev sev-${f.severity}`}>{f.severity}</em>{f.effort && <span className="bz-fixcard-eff">{f.effort}</span>}{f.action_id && <CheckCircle2 size={13} className="bz-card-rpm" aria-label="In RPM" />}</span>
        <span className="bz-fixcard-text">{f.text}</span>
        {also.length > 0 && <span className="bz-fixcard-also">also blocks {also.join(', ')}</span>}
      </button>
      {guessed && onConfirm && <button type="button" className="bz-guess" onClick={onConfirm} title="Matched by product name — pin it to this offer">guessed · Confirm</button>}
    </div>
  );
}

function FixSheet({ f, offers, blocks, onClose, onRelink, onRpm, onDone, onEdit }) {
  useEffect(() => {
    const k = (e) => { if (e.key === 'Escape' && !document.querySelector('.picker-menu')) onClose(); };
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  }, [onClose]);
  const ids = blocks?.offers || [];
  const guess = ids.length && !blocks.explicit;
  return (
    <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal biz-modal" role="dialog" aria-modal="true" aria-label={`Fix: ${f.text}`}>
        <ModalHead icon={Wrench} title={f.text} subtitle={`${f.severity} · ${SEV.find(([k]) => k === f.severity)?.[1]}${f.effort ? ` · ${f.effort}` : ''}${f.done ? ' · done' : ''}`} onClose={onClose} />
        <div className="modal-body mk-body">
          {f.detail && <p className="bz-text">{f.detail}</p>}
          <div className="bz-fixsheet-blocks">
            <span className="form-label">Blocks {guess ? <em className="bz-req">guessed from the product name</em> : null}</span>
            <div className="bz-chips">{ids.length ? ids.map((id) => <Chip key={id} tone={guess ? 'warn' : 'info'}>{offers.find((o) => o.id === id)?.name}</Chip>) : <Chip>No offer</Chip>}</div>
          </div>
          <div className="mk-field">
            <span className="form-label">Pin to one offer</span>
            <Picker value={blocks?.explicit ? ids[0] : ''} header="Pin to which offer?" onChange={(v) => onRelink(v)} placeholder={guess ? 'Keep the guess, or pick one…' : 'Pick an offer…'}
              options={[{ value: '', label: 'Not tied to an offer' }, ...offers.map((o) => ({ value: o.id, label: o.name, hint: ids.includes(o.id) && guess ? 'guessed' : '' }))]} />
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
// A knowledge map: documents grouped under the product or offer they feed (matched by name — shown as a
// guess), each cluster a branch with its documents hanging off it. Status cycles in place.
const isUrl = (s) => /^https?:\/\//i.test(s || '');
const STATUS = ['current', 'superseded', 'obsolete', 'archive'];
const STATUS_TONE = { current: 'good', superseded: 'warn', obsolete: 'bad', archive: undefined };

export function Library() {
  const list = useBizList('docs');
  const products = useBizList('products');
  const ctx = useBiz();
  const ed = useEditor();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('current');
  const offers = ctx.sum?.flow?.offers || [];
  const clusters = useMemo(() => {
    const targets = [
      ...(products.rows || []).map((p) => ({ key: `p:${p.id}`, kind: 'product', name: p.name, match: p.name, go: () => ctx.go('products') })),
      ...offers.map((o) => ({ key: `o:${o.id}`, kind: 'offer', name: o.name, match: `${o.name}`, go: () => ctx.go('offers', { focus: o.id }) })),
    ];
    const map = new Map();
    for (const d of list.rows || []) {
      const t = targets.find((x) => shares(`${d.path} ${d.note}`, x.match));
      const key = t ? t.key : 'general';
      if (!map.has(key)) map.set(key, { ...(t || { key: 'general', kind: 'general', name: 'General — plans & research' }), docs: [] });
      map.get(key).docs.push(d);
    }
    return [...map.values()].sort((a, b) => (a.kind === 'general') - (b.kind === 'general') || b.docs.length - a.docs.length);
  }, [list.rows, products.rows, offers]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!list.rows) return <Loading />;
  const counts = Object.fromEntries(STATUS.map((s) => [s, list.rows.filter((d) => d.status === s).length]));
  const keep = (d) => (status === 'all' || d.status === status) && (!q || `${d.path} ${d.note}`.toLowerCase().includes(q.toLowerCase()));
  const cycle = (d) => list.update(d.id, { status: STATUS[(STATUS.indexOf(d.status) + 1) % STATUS.length] }, { undoLabel: 'Status changed' }).catch(() => {});
  const shown = clusters.map((c) => ({ ...c, docs: c.docs.filter(keep) })).filter((c) => c.docs.length);
  const fed = clusters.filter((c) => c.kind !== 'general').length;
  return (
    <section className="bz-lens bz-library">
      <LensHead icon={LibraryIcon} kicker="Library" title={`${counts.current} current · ${list.rows.length - counts.current} older`}
        read={`Documents grouped by the product or offer they feed (${fed} branch${fed === 1 ? '' : 'es'}, matched by name). Tap a status to move it on.`}>
        <AddButton onClick={() => ed.open()} label="Add document" />
      </LensHead>
      {list.rows.length === 0 ? (
        <BizEmpty icon={LibraryIcon} title="No documents yet" text="Research, plans and notes: where they live, what they feed and whether they still hold." onAdd={() => ed.open()} addLabel="Add a document" onTemplate={list.template} />
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
          <div className="bz-kmap">
            {shown.map((c) => (
              <section key={c.key} className={`bz-branch kind-${c.kind}`} aria-label={c.name}>
                <header className="bz-branch-head">
                  <span className="bz-branch-ic" aria-hidden="true">{c.kind === 'product' ? <Package size={15} /> : c.kind === 'offer' ? <Gift size={15} /> : <Layers size={15} />}</span>
                  {c.go ? <button type="button" className="bz-branch-name" onClick={c.go}>{c.name}</button> : <b className="bz-branch-name">{c.name}</b>}
                  <span className="bz-branch-n">{plural(c.docs.length, 'doc')}</span>
                  {c.kind !== 'general' && <span className="bz-branch-guess">matched by name</span>}
                </header>
                <ul className="bz-twigs">
                  {c.docs.map((d) => (
                    <li key={d.id} className={`bz-twig st-${d.status}`}>
                      <FileText size={14} aria-hidden="true" className="bz-twig-ic" />
                      <div className="bz-twig-body">
                        {isUrl(d.path) ? <a href={d.path} target="_blank" rel="noopener noreferrer" className="bz-doc-path">{d.path} <ExternalLink size={12} /></a>
                          : <span className="bz-doc-path mono">{d.path}</span>}
                        {d.note && <span className="bz-twig-note">{d.note}</span>}
                      </div>
                      <span className="bz-twig-meta">
                        <button type="button" className={`ui-chip ${STATUS_TONE[d.status] ? `ui-chip--${STATUS_TONE[d.status]}` : ''} bz-chip-btn`} title="Next status" onClick={() => cycle(d)}>{d.status}</button>
                        {d.date && <span className="bz-doc-date">{fmtDate(d.date)}</span>}
                        <button type="button" className="bz-icon-btn" aria-label={`Edit ${d.path}`} onClick={() => ed.open(d)}><Pencil size={14} /></button>
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
            {!shown.length && <p className="bz-muted bz-pad">No documents match.</p>}
          </div>
        </>
      )}
      <Editor section="docs" icon={LibraryIcon} ed={ed} list={list} defaults={{ status: 'current', date: todayStr() }} />
    </section>
  );
}

// ───────────────────────── Content ─────────────────────────
// A channel × day board: rows are your channels, columns the next 14 days. Every cell is a slot — click it
// to plan a post for that channel on that day. Posts cycle idea → draft → ready → published in place.
const CONTENT_STATUS = ['idea', 'draft', 'ready', 'published'];
const CONTENT_TONE = { idea: undefined, draft: 'warn', ready: 'info', published: 'good' };

export function Content() {
  const list = useBizList('content');
  const ctx = useBiz();
  const ed = useEditor();
  const [defaults, setDefaults] = useState({ status: 'idea', date: todayStr() });
  const today = todayStr();
  const channels = ctx.sum?.flow?.channels || [];
  if (!list.rows) return <Loading />;
  const days = Array.from({ length: 14 }, (_, i) => addDaysStr(today, i));
  const rowOf = (c) => channels.find((ch) => c.platform && (shares(c.platform, ch.name) || c.platform.toLowerCase() === ch.name.toLowerCase()))?.id || 'other';
  const rows = [...channels.map((ch) => ({ id: ch.id, name: ch.name, tone: TONE_CHIP[ch.tone] || 'info' })), { id: 'other', name: 'Other / no channel', tone: 'info' }];
  const inWindow = list.rows.filter((c) => c.date && c.date >= today && c.date <= days[13]);
  const outside = { overdue: list.rows.filter((c) => c.date && c.date < today && c.status !== 'published'), later: list.rows.filter((c) => c.date && c.date > days[13]), none: list.rows.filter((c) => !c.date) };
  const next = inWindow.filter((c) => c.status !== 'published').sort((a, b) => a.date.localeCompare(b.date))[0];
  const cycle = (c) => list.update(c.id, { status: CONTENT_STATUS[(CONTENT_STATUS.indexOf(c.status) + 1) % CONTENT_STATUS.length] }, { undoLabel: 'Status changed' }).catch(() => {});
  const plan = (date, channel) => { setDefaults({ status: 'idea', date, platform: channel === 'Other / no channel' ? '' : channel }); ed.open(); };
  const Post = ({ c }) => (
    <div className={`bz-post st-${c.status}`}>
      <button type="button" className="bz-post-title" onClick={() => ed.open(c)}>{c.title}</button>
      <button type="button" className={`ui-chip ${CONTENT_TONE[c.status] ? `ui-chip--${CONTENT_TONE[c.status]}` : ''} bz-chip-btn`} title="Next status" onClick={() => cycle(c)}>{c.status} ›</button>
    </div>
  );
  return (
    <section className="bz-lens bz-content">
      <LensHead icon={CalendarDays} kicker="Content" title={next ? `Next: ${next.title}` : list.rows.length ? plural(list.rows.length, 'post') : 'Nothing planned yet'}
        read={next ? `${fmtDate(next.date)}${next.platform ? ` · ${next.platform}` : ''}. Every cell is a slot — click one to plan a post on that channel that day.` : 'Rows are your channels, columns the next two weeks. Click any slot to plan a post there.'}
        readTouch="Rows are your channels, columns the next two weeks — swipe across, tap a slot to plan a post.">
        <AddButton onClick={() => plan(today, '')} label="Plan a post" />
      </LensHead>
      <div className="bz-cal-wrap">
        <div className="bz-cal" style={{ '--days': days.length }} role="grid" aria-label="Posts by channel and day">
          <div className="bz-cal-corner" role="columnheader">Channel</div>
          {days.map((d) => <div key={d} role="columnheader" className={`bz-cal-day ${d === today ? 'today' : ''}`}>{d === today ? 'Today' : fmtDate(d)}</div>)}
          {rows.map((r) => (
            <div key={r.id} className="bz-cal-row" role="row">
              <div className="bz-cal-chan" role="rowheader"><i className={`bz-dot tone-${r.tone}`} aria-hidden="true" /> {r.name}</div>
              {days.map((d) => {
                const items = inWindow.filter((c) => c.date === d && rowOf(c) === r.id);
                return (
                  <div key={d} role="gridcell" className={`bz-cal-cell ${d === today ? 'today' : ''}`}>
                    {items.map((c) => <Post key={c.id} c={c} />)}
                    <button type="button" className="bz-cal-add" aria-label={`Plan a post on ${r.name}, ${fmtDate(d)}`} onClick={() => plan(d, r.name)}><Plus size={13} /></button>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
        {list.rows.length === 0 && (
          <div className="bz-cal-empty">
            <b>No posts planned</b>
            <p>Click any slot to plan one there, or seed a few sample posts.</p>
            <button type="button" className="btn btn-secondary" onClick={list.template}>Start from template</button>
          </div>
        )}
      </div>
      {[['Overdue — not published', outside.overdue], ['Later', outside.later], ['Not scheduled', outside.none]].map(([label, items]) => items.length > 0 && (
        <section key={label} className="bz-postgroup"><p className="ui-kicker">{label} · {items.length}</p><div className="bz-postgrid">{items.map((c) => <Post key={c.id} c={c} />)}</div></section>
      ))}
      <Editor section="content" icon={CalendarDays} ed={ed} list={list} defaults={defaults} />
    </section>
  );
}
