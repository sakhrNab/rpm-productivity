// List-style Business pages. Each one: header with Add, empty state with a template, cards.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Users, Gift, Package, Radio, Wrench, Library as LibraryIcon, CalendarDays, Plus, CalendarPlus, CheckCircle2,
  ExternalLink, Square, CheckSquare,
} from 'lucide-react';
import Picker from '../Picker';
import { useToast } from '../ToastProvider';
import { BizEditor, BizEmpty, Bullets, Loading, RowActions, SectionHead, useBizApi, useBizList } from './bizKit';
import { STAGES, TONE_CHIP, fmtDate, stageLabel, todayStr, toneLabel } from './bizConfig';

// Shared shell: header + Add, editor modal, empty state.
function useEditor() {
  const [editing, setEditing] = useState(null); // null | 'new' | row
  return { editing, open: (r = 'new') => setEditing(r), close: () => setEditing(null) };
}
function Editor({ section, icon, ed, list, defaults }) {
  if (!ed.editing) return null;
  const row = ed.editing === 'new' ? null : ed.editing;
  return (
    <BizEditor section={section} icon={icon} row={row} defaults={defaults} onClose={ed.close}
      onSave={(data) => (row ? list.update(row.id, data) : list.create(data))} />
  );
}
const AddButton = ({ onClick, label }) => (
  <button type="button" className="btn btn-primary biz-add" onClick={onClick}><Plus size={16} /> {label}</button>
);
const Chip = ({ tone, children }) => <span className={`ui-chip ${tone ? `ui-chip--${tone}` : ''}`}>{children}</span>;

// ───────────────────────── Leads ─────────────────────────
const FIT = { 3: ['Strong fit', 'good'], 2: ['Maybe', 'warn'], 1: ['Long shot', 'info'] };

export function Leads() {
  const list = useBizList('leads');
  const biz = useBizApi();
  const { showToast } = useToast();
  const ed = useEditor();
  const [stage, setStage] = useState('open');
  const today = todayStr();
  if (!list.rows) return <Loading />;

  const rows = list.rows.filter((l) => (stage === 'all' ? true : stage === 'open' ? !['paid', 'lost'].includes(l.stage) : l.stage === stage));
  const counts = Object.fromEntries(STAGES.map((s) => [s.value, list.rows.filter((l) => l.stage === s.value).length]));
  const followUp = async (l) => {
    try {
      const r = await biz.current.followUp(l.id, l.next_contact ? {} : { scheduled_date: today });
      list.setRows((rs) => rs.map((x) => (x.id === l.id ? r.lead : x)));
      showToast(`Added to RPM: “${r.action.title}”${r.action.scheduled_date ? ` on ${fmtDate(r.action.scheduled_date)}` : ''}`, 'success');
    } catch (e) { showToast(e.message, 'error'); }
  };

  return (
    <section className="biz-section">
      <SectionHead kicker="Leads" icon={Users} count={list.rows.length}><AddButton onClick={() => ed.open()} label="Add lead" /></SectionHead>
      {list.rows.length === 0 ? (
        <BizEmpty icon={Users} title="No leads yet" text="Named people or companies you could sell to, where they stand, and when you talk to them next."
          onAdd={() => ed.open()} addLabel="Add your first lead" onTemplate={list.template} />
      ) : (
        <>
          <div className="biz-filter" role="tablist" aria-label="Filter by stage">
            {[{ value: 'open', label: 'Open' }, { value: 'all', label: 'All' }, ...STAGES].map((s) => (
              <button key={s.value} type="button" role="tab" aria-selected={stage === s.value} className={`biz-pill ${stage === s.value ? 'on' : ''}`} onClick={() => setStage(s.value)}>
                {s.label}{counts[s.value] ? <span className="biz-pill-n">{counts[s.value]}</span> : null}
              </button>
            ))}
          </div>
          {rows.length === 0 && <p className="biz-muted">No leads in this stage.</p>}
          <div className="biz-grid">
            {rows.map((l) => {
              const late = l.next_contact && l.next_contact < today && !['paid', 'lost'].includes(l.stage);
              return (
                <article key={l.id} className="ui-card biz-card">
                  <header className="biz-card-head">
                    <h3 className="biz-card-title">{l.name}</h3>
                    <RowActions label={l.name} onEdit={() => ed.open(l)} onDelete={() => list.remove(l.id)} />
                  </header>
                  <div className="biz-chips">
                    <Chip tone={FIT[l.fit]?.[1]}>{FIT[l.fit]?.[0]}</Chip>
                    {l.source && <Chip>{l.source}</Chip>}
                    {l.offer && <Chip tone="info">{l.offer}</Chip>}
                  </div>
                  {l.why && <p className="biz-text">{l.why}</p>}
                  {l.next_step && <p className="biz-next"><b>Next:</b> {l.next_step}</p>}
                  <div className="biz-lead-ctl">
                    <Picker value={l.stage} options={STAGES} onChange={(v) => list.update(l.id, { stage: v }).catch(() => {})} title="Stage" />
                    <label className={`biz-date ${late ? 'late' : ''}`}>
                      <span>Next contact</span>
                      <input type="date" value={l.next_contact || ''} onChange={(e) => list.update(l.id, { next_contact: e.target.value || null }).catch(() => {})} />
                    </label>
                  </div>
                  <footer className="biz-card-foot">
                    {l.action_id ? (
                      <span className="ui-chip ui-chip--good"><CheckCircle2 size={13} /> Follow-up in RPM</span>
                    ) : (
                      <button type="button" className="btn btn-secondary biz-small" onClick={() => followUp(l)}><CalendarPlus size={15} /> Add follow-up to RPM</button>
                    )}
                    {l.action_id && <button type="button" className="btn btn-ghost biz-small" onClick={() => followUp(l)}>Add another</button>}
                  </footer>
                </article>
              );
            })}
          </div>
        </>
      )}
      <Editor section="leads" icon={Users} ed={ed} list={list} defaults={{ fit: 2, stage: 'identified' }} />
    </section>
  );
}

// ───────────────────────── Offers ─────────────────────────
export function Offers() {
  const list = useBizList('offers');
  const ed = useEditor();
  if (!list.rows) return <Loading />;
  return (
    <section className="biz-section">
      <SectionHead kicker="Offers" icon={Gift} count={list.rows.length}><AddButton onClick={() => ed.open()} label="Add offer" /></SectionHead>
      {list.rows.length === 0 ? (
        <BizEmpty icon={Gift} title="No offers yet" text="What you sell, to whom, for how much — the promise, the price ladder, the guarantee."
          onAdd={() => ed.open()} addLabel="Write an offer" onTemplate={list.template} />
      ) : (
        <div className="biz-stack">
          {list.rows.map((o) => (
            <article key={o.id} className="ui-card biz-card biz-offer">
              <header className="biz-card-head">
                <div className="biz-min">
                  <h3 className="biz-card-title">{o.name}</h3>
                  {o.tagline && <p className="biz-tagline">{o.tagline}</p>}
                </div>
                <RowActions label={o.name} onEdit={() => ed.open(o)} onDelete={() => list.remove(o.id)} />
              </header>
              <div className="biz-chips">
                <Chip tone={TONE_CHIP[o.readiness]}>{toneLabel(o.readiness)}</Chip>
                {o.product && <Chip>{o.product}</Chip>}
                {o.for_who && <Chip tone="info">{o.for_who}</Chip>}
              </div>
              {o.readiness_note && <p className="biz-muted">{o.readiness_note}</p>}
              {o.value && Object.values(o.value).some(Boolean) && (
                <dl className="biz-value">
                  {[['dream', 'Dream'], ['likelihood', 'Likelihood'], ['time', 'Time'], ['effort', 'Effort']].map(([k, label]) => o.value[k] && (
                    <div key={k}><dt>{label}</dt><dd>{o.value[k]}</dd></div>
                  ))}
                </dl>
              )}
              {o.ladder?.length > 0 && (
                <ol className="biz-ladder">
                  {o.ladder.map((s, i) => <li key={i}><b>{s.step}</b><span className="biz-price">{s.price}</span>{s.note && <small>{s.note}</small>}</li>)}
                </ol>
              )}
              {o.guarantee && <p className="biz-text"><b>Guarantee:</b> {o.guarantee}</p>}
              {o.bonuses?.length > 0 && <><p className="ui-kicker biz-sub">Bonuses</p><Bullets items={o.bonuses} /></>}
              {o.deliverables?.length > 0 && (
                <><p className="ui-kicker biz-sub">Deliverables</p>
                  <ul className="biz-deliv">{o.deliverables.map((d, i) => <li key={i}><span className="biz-when">{d.when}</span><span>{d.what}</span>{d.form && <small>{d.form}</small>}</li>)}</ul></>
              )}
              {o.first_line && <p className="biz-quote">“{o.first_line}”</p>}
              {o.qualify && <p className="biz-text"><b>Qualify:</b> {o.qualify}</p>}
              {o.weak_spots?.length > 0 && <><p className="ui-kicker biz-sub">Weak spots</p><Bullets items={o.weak_spots} className="warn" /></>}
            </article>
          ))}
        </div>
      )}
      <Editor section="offers" icon={Gift} ed={ed} list={list} defaults={{ readiness: 'warn' }} />
    </section>
  );
}

// ───────────────────────── Products ─────────────────────────
export function Products() {
  const list = useBizList('products');
  const ed = useEditor();
  const today = todayStr();
  if (!list.rows) return <Loading />;
  return (
    <section className="biz-section">
      <SectionHead kicker="Products" icon={Package} count={list.rows.length}><AddButton onClick={() => ed.open()} label="Add product" /></SectionHead>
      {list.rows.length === 0 ? (
        <BizEmpty icon={Package} title="No products yet" text="Everything you have built: what it does, its role, what blocks it and the next step."
          onAdd={() => ed.open()} addLabel="Add a product" onTemplate={list.template} />
      ) : (
        <div className="biz-grid">
          {list.rows.map((p) => (
            <article key={p.id} className="ui-card biz-card">
              <header className="biz-card-head">
                <h3 className="biz-card-title">{p.name}</h3>
                <RowActions label={p.name} onEdit={() => ed.open(p)} onDelete={() => list.remove(p.id)} />
              </header>
              <div className="biz-chips">
                <Chip tone={p.role === 'paid' ? 'good' : p.role === 'park' ? 'bad' : 'info'}>{p.role}</Chip>
                {p.promised && <Chip tone="ai">Promised</Chip>}
                {p.price && <Chip>{p.price}</Chip>}
              </div>
              {p.what && <p className="biz-text">{p.what}</p>}
              {p.status && <p className="biz-muted">{p.status}</p>}
              {p.blocker && <p className="biz-text biz-blocker"><b>Blocker:</b> {p.blocker}</p>}
              {p.next_step && (
                <p className="biz-next"><b>Next:</b> {p.next_step}
                  {p.next_date && <span className={`biz-when ${p.next_date < today ? 'late' : ''}`}> · {fmtDate(p.next_date)}</span>}</p>
              )}
              {p.repo && <p className="biz-muted biz-mono">{p.repo}</p>}
            </article>
          ))}
        </div>
      )}
      <Editor section="products" icon={Package} ed={ed} list={list} defaults={{ role: 'paid', promised: false }} />
    </section>
  );
}

// ───────────────────────── Channels ─────────────────────────
export function Channels() {
  const list = useBizList('channels');
  const ed = useEditor();
  if (!list.rows) return <Loading />;
  return (
    <section className="biz-section">
      <SectionHead kicker="Channels" icon={Radio} count={list.rows.length}><AddButton onClick={() => ed.open()} label="Add channel" /></SectionHead>
      {list.rows.length === 0 ? (
        <BizEmpty icon={Radio} title="No channels yet" text="Where buyers can find you, what the numbers are today, and the next moves per channel."
          onAdd={() => ed.open()} addLabel="Add a channel" onTemplate={list.template} />
      ) : (
        <div className="biz-grid">
          {list.rows.map((c) => (
            <article key={c.id} className={`ui-card biz-card biz-tone-${c.tone}`}>
              <header className="biz-card-head">
                <h3 className="biz-card-title">{c.name}</h3>
                <RowActions label={c.name} onEdit={() => ed.open(c)} onDelete={() => list.remove(c.id)} />
              </header>
              {c.stat && <p className="biz-stat">{c.stat}</p>}
              {c.verdict && <p className="biz-text"><Chip tone={TONE_CHIP[c.tone]}>{toneLabel(c.tone)}</Chip> {c.verdict}</p>}
              {c.audience && <p className="biz-muted">{c.audience}</p>}
              {c.gaps?.length > 0 && <><p className="ui-kicker biz-sub">Gaps</p><Bullets items={c.gaps} className="warn" /></>}
              {c.moves?.length > 0 && <><p className="ui-kicker biz-sub">Moves</p><Bullets items={c.moves} className="good" /></>}
            </article>
          ))}
        </div>
      )}
      <Editor section="channels" icon={Radio} ed={ed} list={list} defaults={{ tone: 'info' }} />
    </section>
  );
}

// ───────────────────────── Fixes ─────────────────────────
export function Fixes() {
  const list = useBizList('fixes');
  const biz = useBizApi();
  const { showToast } = useToast();
  const ed = useEditor();
  const [showDone, setShowDone] = useState(false);
  if (!list.rows) return <Loading />;
  const open = list.rows.filter((f) => !f.done);
  const done = list.rows.filter((f) => f.done);
  const toRpm = async (f) => {
    try {
      const r = await biz.current.fixToAction(f.id, { scheduled_date: todayStr() });
      list.setRows((rs) => rs.map((x) => (x.id === f.id ? r.fix : x)));
      showToast(`Added to RPM: “${r.action.title}”`, 'success');
    } catch (e) { showToast(e.message, 'error'); }
  };
  const row = (f) => (
    <li key={f.id} className={`biz-fix ${f.done ? 'done' : ''}`}>
      <button type="button" className="biz-check" aria-pressed={f.done} aria-label={f.done ? `Mark “${f.text}” not done` : `Mark “${f.text}” done`}
        onClick={() => list.update(f.id, { done: !f.done }).catch(() => {})}>
        {f.done ? <CheckSquare size={20} /> : <Square size={20} />}
      </button>
      <div className="biz-min biz-fix-body">
        <div className="biz-fix-top">
          <span className={`biz-sev biz-sev-${f.severity}`}>{f.severity}</span>
          <span className="biz-fix-text">{f.text}</span>
        </div>
        {f.detail && <p className="biz-muted">{f.detail}</p>}
        <div className="biz-chips">
          {f.effort && <Chip>{f.effort}</Chip>}
          {f.action_id ? <Chip tone="good"><CheckCircle2 size={13} /> In RPM</Chip>
            : !f.done && <button type="button" className="btn btn-ghost biz-small" onClick={() => toRpm(f)}><CalendarPlus size={14} /> Add to RPM</button>}
        </div>
      </div>
      <RowActions label={f.text} onEdit={() => ed.open(f)} onDelete={() => list.remove(f.id)} />
    </li>
  );
  return (
    <section className="biz-section">
      <SectionHead kicker="Fixes" icon={Wrench} count={open.length ? `${open.length} open` : null}><AddButton onClick={() => ed.open()} label="Add fix" /></SectionHead>
      {list.rows.length === 0 ? (
        <BizEmpty icon={Wrench} title="Nothing to fix yet" text="Things that block selling — a broken checkout, a missing case study. P0 first."
          onAdd={() => ed.open()} addLabel="Add a fix" onTemplate={list.template} />
      ) : (
        <div className="ui-card biz-card">
          {open.length ? <ul className="biz-fixes">{open.map(row)}</ul> : <p className="biz-muted">All fixes done.</p>}
          {done.length > 0 && (
            <>
              <button type="button" className="btn btn-ghost biz-small biz-toggle" onClick={() => setShowDone((v) => !v)}>
                {showDone ? 'Hide' : 'Show'} {done.length} done
              </button>
              {showDone && <ul className="biz-fixes">{done.map(row)}</ul>}
            </>
          )}
        </div>
      )}
      <Editor section="fixes" icon={Wrench} ed={ed} list={list} defaults={{ severity: 'P1' }} />
    </section>
  );
}

// ───────────────────────── Library ─────────────────────────
const isUrl = (s) => /^https?:\/\//i.test(s || '');
const STATUS_TONE = { current: 'good', superseded: 'warn', obsolete: 'bad', archive: undefined };

export function Library() {
  const list = useBizList('docs');
  const ed = useEditor();
  if (!list.rows) return <Loading />;
  return (
    <section className="biz-section">
      <SectionHead kicker="Library" icon={LibraryIcon} count={list.rows.length}><AddButton onClick={() => ed.open()} label="Add document" /></SectionHead>
      {list.rows.length === 0 ? (
        <BizEmpty icon={LibraryIcon} title="No documents yet" text="Research, plans and notes: where they live and whether they are still current."
          onAdd={() => ed.open()} addLabel="Add a document" onTemplate={list.template} />
      ) : (
        <ul className="ui-card biz-card biz-docs">
          {list.rows.map((d) => (
            <li key={d.id} className="biz-doc">
              <div className="biz-min">
                {isUrl(d.path)
                  ? <a href={d.path} target="_blank" rel="noopener noreferrer" className="biz-doc-path">{d.path} <ExternalLink size={12} /></a>
                  : <span className="biz-doc-path biz-mono">{d.path}</span>}
                {d.note && <p className="biz-muted">{d.note}</p>}
                <div className="biz-chips">
                  <Chip tone={STATUS_TONE[d.status]}>{d.status}</Chip>
                  {d.date && <Chip>{fmtDate(d.date)}</Chip>}
                </div>
              </div>
              <RowActions label={d.path} onEdit={() => ed.open(d)} onDelete={() => list.remove(d.id)} />
            </li>
          ))}
        </ul>
      )}
      <Editor section="docs" icon={LibraryIcon} ed={ed} list={list} defaults={{ status: 'current', date: todayStr() }} />
    </section>
  );
}

// ───────────────────────── Content ─────────────────────────
const CONTENT_STATUS = ['idea', 'draft', 'ready', 'published'];
const CONTENT_TONE = { idea: undefined, draft: 'warn', ready: 'info', published: 'good' };

export function Content() {
  const list = useBizList('content');
  const ed = useEditor();
  const today = todayStr();
  if (!list.rows) return <Loading />;
  const groups = [];
  for (const c of list.rows) {
    const key = c.date || 'unscheduled';
    const g = groups.find((x) => x.key === key);
    if (g) g.items.push(c); else groups.push({ key, items: [c] });
  }
  const next = list.rows.find((c) => c.date && c.date >= today && c.status !== 'published');
  return (
    <section className="biz-section">
      <SectionHead kicker="Content" icon={CalendarDays} count={list.rows.length}><AddButton onClick={() => ed.open()} label="Plan a post" /></SectionHead>
      {list.rows.length === 0 ? (
        <BizEmpty icon={CalendarDays} title="No posts planned" text="A simple content calendar: what goes out when, where, and why (proof or community)."
          onAdd={() => ed.open()} addLabel="Plan your first post" onTemplate={list.template} />
      ) : (
        <>
          {next && <p className="biz-next biz-callout"><b>Next up:</b> {next.title} · {fmtDate(next.date)}{next.platform ? ` · ${next.platform}` : ''}</p>}
          <div className="biz-cal">
            {groups.map((g) => (
              <div key={g.key} className={`biz-cal-day ${g.key !== 'unscheduled' && g.key < today ? 'past' : ''} ${g.key === today ? 'today' : ''}`}>
                <p className="biz-cal-date">{g.key === 'unscheduled' ? 'Not scheduled' : fmtDate(g.key)}{g.key === today ? ' · today' : ''}</p>
                {g.items.map((c) => (
                  <div key={c.id} className="ui-card biz-card biz-post">
                    <div className="biz-card-head">
                      <h3 className="biz-card-title">{c.title}</h3>
                      <RowActions label={c.title} onEdit={() => ed.open(c)} onDelete={() => list.remove(c.id)} />
                    </div>
                    {c.hook && <p className="biz-text">{c.hook}</p>}
                    <div className="biz-chips">
                      <button type="button" className={`ui-chip ${CONTENT_TONE[c.status] ? `ui-chip--${CONTENT_TONE[c.status]}` : ''} biz-chip-btn`}
                        title="Next status" onClick={() => list.update(c.id, { status: CONTENT_STATUS[(CONTENT_STATUS.indexOf(c.status) + 1) % CONTENT_STATUS.length] }).catch(() => {})}>
                        {c.status} ›
                      </button>
                      {c.platform && <Chip>{c.platform}</Chip>}
                      {c.goal && <Chip tone="info">{c.goal}</Chip>}
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </>
      )}
      <Editor section="content" icon={CalendarDays} ed={ed} list={list} defaults={{ status: 'idea', date: today }} />
    </section>
  );
}

export const RpmLink = ({ to, children }) => <Link to={to} className="biz-link">{children}</Link>;
