// The arsenal lenses: Offers, Products, Channels, Fixes, Library, Content. Each one draws the links its
// entities have — fixes wire into the offers they block, products into the offers they power, channels
// into the pipeline stages their leads sit in — and edits where you read.
import { useMemo, useState } from 'react';
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

  const blockers = useMemo(() => (fixes.rows || []).filter((f) => !f.done && (f.offer_id || L[f.id]))
    .sort((a, b) => a.severity.localeCompare(b.severity)), [fixes.rows, L]);
  const links = useMemo(() => {
    const out = [];
    for (const f of blockers) {
      const ids = f.offer_id ? [f.offer_id] : (L[f.id]?.offers || []);
      for (const oid of ids) out.push({ id: `${f.id}>${oid}`, from: `fx:${f.id}`, to: `of:${oid}`, tone: f.severity === 'P0' ? 'bad' : f.severity === 'P1' ? 'warn' : 'info', dashed: !f.offer_id, weight: f.severity === 'P0' ? 3 : 2 });
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
        read={blockers.length ? `${blockers.length} open fix${blockers.length === 1 ? '' : 'es'} wire into these offers — dashed = matched by product name, solid = linked.` : 'Nothing blocks these offers.'}>
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
  const per = useMemo(() => {
    const m = {};
    for (const l of f.leads || []) {
      const c = f.links?.leadChannel?.[l.id];
      if (!c || l.stage === 'lost') continue;
      (m[c] ||= {})[l.stage] = ((m[c] || {})[l.stage] || 0) + 1;
    }
    return m;
  }, [f]);
  const links = useMemo(() => {
    const out = [];
    for (const [cid, st] of Object.entries(per)) for (const [stage, n] of Object.entries(st)) out.push({ id: `${cid}>${stage}`, from: `ch:${cid}`, to: `cs:${stage}`, tone: 'flow', weight: 1.6 + Math.log2(n + 1) * 1.7 });
    return out;
  }, [per]);
  const w = useWires(links);
  if (!list.rows) return <Loading />;
  const stageTotals = {};
  for (const st of Object.values(per)) for (const [k, n] of Object.entries(st)) stageTotals[k] = (stageTotals[k] || 0) + n;
  const usedStages = LANES.filter((s) => stageTotals[s]);
  const total = (cid) => Object.values(per[cid] || {}).reduce((a, b) => a + b, 0);

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
const SEV = [['P0', 'P0 · blocks money'], ['P1', 'P1 · soon'], ['P2', 'P2 · later']];
export function Fixes() {
  const list = useBizList('fixes');
  const ctx = useBiz();
  const biz = useBizApi();
  const { showToast } = useToast();
  const ed = useEditor();
  const [showDone, setShowDone] = useState(false);
  const [root, setRoot] = useState(null);
  const phone = useMedia('(max-width: 900px)');
  const focus = ctx.params.get('focus');
  const offers = ctx.sum?.flow?.offers || [];
  const L = ctx.sum?.flow?.links?.fixOffers || {};
  const rows = list.rows || [];
  const open = rows.filter((f) => !f.done);
  const links = useMemo(() => {
    const out = [];
    // P0 and confirmed links always show; suggested P1/P2 links appear while you hover the row or the offer.
    for (const f of open) for (const oid of (f.offer_id ? [f.offer_id] : (L[f.id]?.offers || []))) out.push({ id: `${f.id}>${oid}`, from: `fr:${f.id}`, to: `fo:${oid}`, tone: f.severity === 'P0' ? 'bad' : f.severity === 'P1' ? 'warn' : 'info', dashed: !f.offer_id, hoverOnly: !f.offer_id && f.severity !== 'P0', weight: f.severity === 'P0' ? 2.8 : 1.8 });
    return out;
  }, [rows, L]); // eslint-disable-line react-hooks/exhaustive-deps
  const w = useWires(links);
  if (!list.rows) return <Loading />;
  const done = rows.filter((f) => f.done);
  const hitOffers = offers.filter((o) => links.some((l) => l.to === `fo:${o.id}`));
  const toRpm = async (f) => {
    try {
      const r = await biz.current.fixToAction(f.id, { scheduled_date: todayStr() });
      list.setRows((rs) => rs.map((x) => (x.id === f.id ? r.fix : x)));
      ctx.changed();
      showToast(`On your RPM list: “${r.action.title}”`, 'success');
    } catch (e) { showToast(e.message, 'error'); }
  };
  const offerOpts = [{ value: '', label: 'No offer' }, ...offers.map((o) => ({ value: o.id, label: o.name }))];
  const row = (f) => (
    <li key={f.id} className={`bz-fix sev-${f.severity} ${f.done ? 'done' : ''} ${focus === f.id ? 'flash' : ''}`}>
      <button type="button" className="bz-check" aria-pressed={f.done} aria-label={f.done ? `Mark “${f.text}” not done` : `Mark “${f.text}” done`}
        onClick={() => list.update(f.id, { done: !f.done }, { undoLabel: f.done ? 'Reopened fix' : 'Fix done' }).catch(() => {})}>
        {f.done ? <CheckSquare size={20} /> : <Square size={20} />}
      </button>
      <div {...(f.done ? {} : w.bind(`fr:${f.id}`))} className={`bz-fix-body ${f.done ? '' : w.cls(`fr:${f.id}`)}`} tabIndex={f.done ? undefined : 0}>
        <span className="bz-fix-text">{f.text}</span>
        {f.detail && <span className="bz-muted">{f.detail}</span>}
        <span className="bz-fix-meta">
          {f.effort && <Chip>{f.effort}</Chip>}
          {!f.done && (
            <span className="bz-fix-offer"><Picker value={f.offer_id || (L[f.id] ? null : '')} header="Blocks which offer?" options={offerOpts}
              placeholder={`Suggested: ${(L[f.id]?.offers || []).map((id) => offers.find((o) => o.id === id)?.name).filter(Boolean).join(', ')}`}
              onChange={(v) => list.update(f.id, { offer_id: v || null }, { undoLabel: v ? 'Linked to offer' : 'Unlinked' }).then(() => ctx.changed()).catch(() => {})} /></span>
          )}
          {f.action_id ? <Chip tone="good"><CheckCircle2 size={13} /> In RPM</Chip>
            : !f.done && <button type="button" className="bz-mini" onClick={() => toRpm(f)}><CalendarPlus size={13} /> To RPM today</button>}
        </span>
      </div>
      <button type="button" className="bz-icon-btn" aria-label={`Edit ${f.text}`} onClick={() => ed.open(f)}><Pencil size={15} /></button>
    </li>
  );
  return (
    <section className="bz-lens bz-fixes">
      <LensHead icon={Wrench} kicker="Fixes" title={open.length ? `${open.length} open · ${open.filter((f) => f.severity === 'P0').length} block money` : 'All clear'}
        read="P0 means it blocks money. Lines show the offer each fix blocks — link it from the row.">
        <AddButton onClick={() => ed.open()} label="Add fix" />
      </LensHead>
      {rows.length === 0 ? (
        <BizEmpty icon={Wrench} title="Nothing to fix yet" text="Things that block selling — a broken checkout, a missing case study. P0 first." onAdd={() => ed.open()} addLabel="Add a fix" onTemplate={list.template} />
      ) : (
        <div className={`bz-wired ${hitOffers.length && !phone ? 'two rev' : ''}`} ref={setRoot}>
          {!phone && <FlowLinks root={root} links={links} active={w.hot} />}
          <div className="bz-wired-main">
            {SEV.map(([sev, label]) => {
              const items = open.filter((f) => f.severity === sev);
              if (!items.length) return null;
              return (
                <section key={sev} className={`bz-sevgroup sev-${sev}`} aria-label={label}>
                  <p className="bz-sevgroup-head"><em className={`bz-sev sev-${sev}`}>{sev}</em> {label.split(' · ')[1]} <span>{items.length}</span></p>
                  <ul className="bz-fixlist">{items.map(row)}</ul>
                </section>
              );
            })}
            {!open.length && <p className="bz-moves-clear"><CheckCircle2 size={16} /> Every fix is done.</p>}
            {done.length > 0 && (
              <>
                <button type="button" className="bz-toggle" aria-expanded={showDone} onClick={() => setShowDone((v) => !v)}>{showDone ? 'Hide' : 'Show'} {done.length} done</button>
                {showDone && <ul className="bz-fixlist">{done.map(row)}</ul>}
              </>
            )}
          </div>
          {hitOffers.length > 0 && !phone && (
            <div className="bz-wired-side">
              <p className="bz-col-title"><Gift size={13} /> Blocks</p>
              {hitOffers.map((o) => (
                <button key={o.id} type="button" {...w.bind(`fo:${o.id}`)} className={`bz-node kind-offer ready-${o.readiness} ${w.cls(`fo:${o.id}`)}`} onClick={() => ctx.go('offers', { focus: o.id })}>
                  <Gift size={14} aria-hidden="true" /><span className="bz-node-name">{o.name}</span>
                  <small className="bz-node-sub">{links.filter((l) => l.to === `fo:${o.id}`).length} blocker(s)</small>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      <Editor section="fixes" icon={Wrench} ed={ed} list={list} defaults={{ severity: 'P1' }} />
    </section>
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
