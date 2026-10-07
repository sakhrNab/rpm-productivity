// Leads lens: the pipeline as a board. Lanes are stages; drag a lead (or Shift+←/→) to move it, with an
// Undo toast. Arrow keys walk the board, Enter opens the lead. The lead sheet shows its lineage —
// source channel → lead → RPM follow-up → results — as a lit connector strip, and edits in place.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { DndContext, DragOverlay, PointerSensor, TouchSensor, useDraggable, useDroppable, useSensor, useSensors } from '@dnd-kit/core';
import {
  Users, Search, CalendarPlus, CheckCircle2, Flame, Clock, BarChart3, Radio, Link2, XCircle, Trash2,
} from 'lucide-react';
import Picker from '../Picker';
import ModalHead from '../modals/ModalHead';
import FlowLinks, { useMedia } from '../FlowLinks';
import { useToast } from '../ToastProvider';
import DatePick from './DatePick';
import { AddButton, BizEmpty, Chip, Editor, LensHead, Loading, useBiz, useBizApi, useBizList, useEditor } from './bizKit';
import { FIT, LANES, STAGES, fmtDate, leadSignals, needsAttention, resultLabel, stageAge, stageLabel, todayStr } from './bizConfig';

const FILTERS = [{ value: 'all', label: 'All' }, { value: 'attention', label: 'Needs attention' }, { value: 'strong', label: 'Strong fit' }];

export default function Leads() {
  const list = useBizList('leads');
  const ctx = useBiz();
  const biz = useBizApi();
  const { showToast } = useToast();
  const ed = useEditor();
  const today = todayStr();
  const params = ctx.params;
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState(() => (['attention', 'strong'].includes(params.get('filter')) ? params.get('filter') : 'all'));
  const [source, setSource] = useState('');
  const [showLost, setShowLost] = useState(false);
  const [openId, setOpenId] = useState(() => params.get('focus') || null);
  const [dragId, setDragId] = useState(null);
  const [focusId, setFocusId] = useState(null);
  const phone = useMedia('(max-width: 900px)');
  const flashStage = LANES.includes(params.get('filter')) ? params.get('filter') : null;
  const boardRef = useRef(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 6 } }));

  useEffect(() => {
    if (!flashStage || !list.rows) return;
    boardRef.current?.querySelector(`[data-lane="${flashStage}"]`)?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
  }, [flashStage, list.rows]);

  const sources = useMemo(() => [...new Set((list.rows || []).map((l) => l.source).filter(Boolean))].sort(), [list.rows]);
  if (!list.rows) return <Loading />;

  const match = (l) => {
    if (q && !`${l.name} ${l.source} ${l.why} ${l.next_step} ${l.offer}`.toLowerCase().includes(q.toLowerCase())) return false;
    if (source && l.source !== source) return false;
    if (filter === 'attention' && !needsAttention(l, today)) return false;
    if (filter === 'strong' && l.fit !== 3) return false;
    return true;
  };
  const shown = list.rows.filter(match);
  const lanes = [...LANES, ...(showLost ? ['lost'] : [])];
  const byLane = Object.fromEntries(lanes.map((st) => [st, shown.filter((l) => l.stage === st).sort((a, b) => (b.fit - a.fit) || String(a.next_contact || '9').localeCompare(String(b.next_contact || '9')))]));
  const lostCount = list.rows.filter((l) => l.stage === 'lost').length;
  const attention = list.rows.filter((l) => needsAttention(l, today)).length;
  const open = list.rows.filter((l) => !['paid', 'lost'].includes(l.stage)).length;

  const move = (lead, stage) => {
    if (!lead || lead.stage === stage) return;
    list.update(lead.id, { stage }, { undoLabel: `${lead.name} → ${stageLabel(stage)}` }).catch(() => {});
  };
  const followUp = async (l) => {
    try {
      const r = await biz.current.followUp(l.id, l.next_contact ? {} : { scheduled_date: today });
      list.setRows((rs) => rs.map((x) => (x.id === l.id ? r.lead : x)));
      ctx.changed();
      showToast(`On your RPM list: “${r.action.title}”${r.action.scheduled_date ? ` · ${fmtDate(r.action.scheduled_date)}` : ''}`, 'success');
    } catch (e) { showToast(e.message, 'error'); }
  };

  // keyboard: arrows walk, Shift+←/→ moves stage, Enter opens
  const onCardKey = (e, l) => {
    const col = lanes.indexOf(l.stage);
    const row = byLane[l.stage].findIndex((x) => x.id === l.id);
    const focus = (id) => { setFocusId(id); requestAnimationFrame(() => boardRef.current?.querySelector(`[data-lead="${id}"]`)?.focus()); };
    if (e.key === 'Enter') { e.preventDefault(); setOpenId(l.id); }
    else if (e.shiftKey && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
      e.preventDefault();
      const to = lanes[col + (e.key === 'ArrowRight' ? 1 : -1)];
      if (to) { move(l, to); focus(l.id); }
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const next = byLane[l.stage][row + (e.key === 'ArrowDown' ? 1 : -1)];
      if (next) focus(next.id);
    } else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      for (let c = col + (e.key === 'ArrowRight' ? 1 : -1); c >= 0 && c < lanes.length; c += e.key === 'ArrowRight' ? 1 : -1) {
        const lane = byLane[lanes[c]];
        if (lane.length) { focus(lane[Math.min(row, lane.length - 1)].id); break; }
      }
    }
  };

  const dragLead = dragId ? list.rows.find((l) => l.id === dragId) : null;
  const opened = openId ? list.rows.find((l) => l.id === openId) : null;

  return (
    <section className="bz-lens bz-leads">
      <LensHead icon={Users} kicker="Pipeline" title={`${open} open lead${open === 1 ? '' : 's'}`}
        read={attention ? `${attention} need attention — overdue, due today, stuck or without a next date.` : 'Drag a card to move it. Shift + arrow keys move the focused card.'}
        readTouch={`${attention ? `${attention} need attention. ` : ''}Tap a lead to open it — move it with the stage steps at the top of its sheet.`}>
        <AddButton onClick={() => ed.open()} label="Add lead" />
      </LensHead>

      {list.rows.length === 0 ? (
        <BizEmpty icon={Users} title="No leads yet" text="Named people or companies you could sell to, where they stand, and when you talk to them next."
          onAdd={() => ed.open()} addLabel="Add your first lead" onTemplate={list.template}
          extra={<button type="button" className="btn btn-ghost" onClick={() => ctx.go('agents', { job: 'prospect-list' })}>Queue a prospect list</button>} />
      ) : (
        <>
          <div className="bz-toolbar" role="toolbar" aria-label="Filter leads">
            <label className="bz-search"><Search size={15} aria-hidden="true" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search leads" aria-label="Search leads" /></label>
            <div className="ui-seg bz-seg-sm" role="radiogroup" aria-label="Show">
              {FILTERS.map((f) => (
                <button key={f.value} type="button" role="radio" aria-checked={filter === f.value} className={filter === f.value ? 'on' : ''} onClick={() => setFilter(f.value)}>
                  {f.label}{f.value === 'attention' && attention ? <em className="bz-seg-n">{attention}</em> : null}
                </button>
              ))}
            </div>
            {sources.length > 1 && (
              <div className="bz-tool-picker"><Picker value={source} header="Source" onChange={setSource} options={[{ value: '', label: 'All sources' }, ...sources.map((s) => ({ value: s, label: s }))]} /></div>
            )}
            {lostCount > 0 && <button type="button" className={`bz-toggle ${showLost ? 'on' : ''}`} aria-pressed={showLost} onClick={() => setShowLost((v) => !v)}><XCircle size={14} /> Lost · {lostCount}</button>}
          </div>

          <DndContext sensors={sensors} onDragStart={(e) => setDragId(e.active.id)} onDragCancel={() => setDragId(null)}
            onDragEnd={(e) => { setDragId(null); if (e.over) move(list.rows.find((l) => l.id === e.active.id), e.over.id); }}>
            {/* empty lanes shrink to a slim drop strip; they open up while you drag */}
            <div className="bz-board" ref={boardRef} style={phone ? undefined : { gridTemplateColumns: lanes.map((st) => (byLane[st].length || dragId ? 'minmax(200px, 1fr)' : '64px')).join(' '), gridAutoFlow: 'row' }}>
              {lanes.map((st, i) => (
                <Lane key={st} stage={st} index={i} leads={byLane[st]} flash={flashStage === st} dragging={!!dragId}>
                  {byLane[st].map((l) => (
                    <LeadCard key={l.id} lead={l} today={today} focused={focusId === l.id}
                      onOpen={() => setOpenId(l.id)} onKey={(e) => onCardKey(e, l)} onFocus={() => setFocusId(l.id)} />
                  ))}
                </Lane>
              ))}
            </div>
            <DragOverlay dropAnimation={null}>{dragLead ? <LeadCard lead={dragLead} today={today} overlay /> : null}</DragOverlay>
          </DndContext>
          {!showLost && <LostDrop dragging={!!dragId} />}
        </>
      )}

      {opened && <LeadSheet lead={opened} list={list} onClose={() => setOpenId(null)} onFollowUp={() => followUp(opened)} />}
      <Editor section="leads" icon={Users} ed={ed} list={list} defaults={{ fit: 2, stage: 'identified' }} />
    </section>
  );
}

function Lane({ stage, index, leads, flash, dragging, children }) {
  const { setNodeRef, isOver } = useDroppable({ id: stage });
  return (
    <div ref={setNodeRef} data-lane={stage} className={`bz-lane st-${stage} ${isOver ? 'over' : ''} ${flash ? 'flash' : ''} ${dragging ? 'dropping' : ''} ${!leads.length && !dragging ? 'slim' : ''}`} style={{ '--i': index }}
      role="group" aria-label={`${stageLabel(stage)}: ${leads.length} lead${leads.length === 1 ? '' : 's'}`}>
      <header className="bz-lane-head">
        <i className="bz-lane-pip" aria-hidden="true" />
        <b>{stageLabel(stage)}</b>
        {leads.length > 0 && <span className="bz-lane-n">{leads.length}</span>}
      </header>
      <div className="bz-lane-body">
        {children}
        {!leads.length && <p className="bz-lane-empty">{dragging ? 'Drop here' : '—'}</p>}
      </div>
    </div>
  );
}

function LostDrop({ dragging }) {
  const { setNodeRef, isOver } = useDroppable({ id: 'lost' });
  return (
    <div ref={setNodeRef} className={`bz-lostdrop ${dragging ? 'show' : ''} ${isOver ? 'over' : ''}`} aria-hidden={!dragging}>
      <XCircle size={16} /> Drop here to mark lost
    </div>
  );
}

function LeadCard({ lead: l, today, onOpen, onKey, onFocus, overlay = false, focused }) {
  const drag = useDraggable({ id: l.id, disabled: overlay });
  const sig = leadSignals(l, today);
  const fit = FIT[l.fit] || FIT[2];
  return (
    <button ref={overlay ? undefined : drag.setNodeRef} type="button" data-lead={l.id}
      className={`bz-card ${drag.isDragging ? 'ghost' : ''} ${overlay ? 'overlay' : ''} ${focused ? 'kfocus' : ''}`}
      style={{ '--fit': fit.c }} onClick={onOpen} onKeyDown={onKey} onFocus={onFocus}
      aria-label={`${l.name}, ${stageLabel(l.stage)}, ${fit.label}${sig.overdue ? `, ${sig.overdue} days overdue` : ''}`}
      {...(overlay ? {} : drag.listeners)} {...(overlay ? {} : drag.attributes)} tabIndex={0} role="button">
      <span className="bz-card-top">
        <b className="bz-card-name">{l.name}</b>
        {l.action_id && <CheckCircle2 size={14} className="bz-card-rpm" aria-label="Follow-up in RPM" />}
      </span>
      {l.next_step && <span className="bz-card-next">{l.next_step}</span>}
      <span className="bz-card-meta">
        {l.source && <span className="bz-card-src">{l.source}</span>}
        {sig.overdue ? <span className="bz-sig bad"><Clock size={12} /> {sig.overdue}d late</span>
          : sig.today ? <span className="bz-sig warn"><Clock size={12} /> today</span>
            : l.next_contact ? <span className="bz-sig"><Clock size={12} /> {fmtDate(l.next_contact)}</span> : null}
        {sig.stuck && <span className="bz-sig warn"><Flame size={12} /> {sig.stuck}d</span>}
      </span>
    </button>
  );
}

// ───── lead sheet: lineage + inline edit ─────
function LeadSheet({ lead, list, onClose, onFollowUp }) {
  const ctx = useBiz();
  const biz = useBizApi();
  const [results, setResults] = useState(null);
  const [root, setRoot] = useState(null);
  const [name, setName] = useState(lead.name);
  const [confirm, setConfirm] = useState(false);
  const today = todayStr();
  const f = ctx.sum?.flow || {};
  const channel = (f.channels || []).find((c) => c.id === f.links?.leadChannel?.[lead.id]);

  useEffect(() => {
    let live = true;
    biz.current.list('results').then((rs) => { if (live) setResults(rs.filter((r) => r.lead_id === lead.id)); }).catch(() => setResults([]));
    return () => { live = false; };
  }, [lead.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !document.querySelector('.picker-menu, .dp-menu')) onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const save = (data, label) => list.update(lead.id, data, label ? { undoLabel: label } : {}).catch(() => {});
  const sig = leadSignals(lead, today);
  const links = [
    channel || lead.source ? { id: 'a', from: 'ln-src', to: 'ln-lead', tone: 'flow', weight: 2.4 } : null,
    { id: 'b', from: 'ln-lead', to: 'ln-rpm', tone: lead.action_id ? 'good' : 'dim', dashed: !lead.action_id, idle: !lead.action_id, weight: 2.4 },
    { id: 'c', from: 'ln-lead', to: 'ln-res', tone: results?.length ? 'flow' : 'dim', dashed: !results?.length, idle: !results?.length, weight: 2.4 },
  ].filter(Boolean);

  return (
    <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal biz-modal bz-sheet" role="dialog" aria-modal="true" aria-label={`Lead: ${lead.name}`}>
        <ModalHead icon={Users} title={lead.name} subtitle={`${stageLabel(lead.stage)} for ${stageAge(lead, today)} day${stageAge(lead, today) === 1 ? '' : 's'}${lead.source ? ` · from ${lead.source}` : ''}`} onClose={onClose} />
        <div className="modal-body mk-body">
          {/* stage stepper — click to move */}
          <div className="bz-stepper" role="radiogroup" aria-label="Stage">
            {STAGES.map((s) => (
              <button key={s.value} type="button" role="radio" aria-checked={lead.stage === s.value}
                className={`bz-step st-${s.value} ${lead.stage === s.value ? 'on' : ''} ${STAGES.findIndex((x) => x.value === lead.stage) > STAGES.findIndex((x) => x.value === s.value) && lead.stage !== 'lost' ? 'past' : ''}`}
                onClick={() => save({ stage: s.value }, `${lead.name} → ${s.label}`)}>{s.label}</button>
            ))}
          </div>

          {/* lineage: source → lead → RPM follow-up / results */}
          <div className="bz-lineage" ref={setRoot}>
            <FlowLinks root={root} links={links} version={`${lead.action_id}-${results?.length}`} />
            <div className="bz-lin-col">
              <button type="button" data-node="ln-src" className="bz-node kind-src" onClick={() => { onClose(); ctx.go('channels', { focus: channel?.id }); }}>
                <Radio size={14} aria-hidden="true" /><span className="bz-node-name">{channel?.name || lead.source || 'No source'}</span>
              </button>
            </div>
            <div className="bz-lin-col">
              <div data-node="ln-lead" className="bz-node kind-lead is-hot" style={{ '--fit': (FIT[lead.fit] || FIT[2]).c }}>
                <span className="bz-node-name">{lead.name}</span><small className="bz-node-sub">{(FIT[lead.fit] || FIT[2]).label}</small>
              </div>
            </div>
            <div className="bz-lin-col bz-lin-out">
              {lead.action_id ? (
                <Link data-node="ln-rpm" className="bz-node kind-rpm" to="/today" onClick={onClose}><CheckCircle2 size={14} /><span className="bz-node-name">Follow-up in RPM</span></Link>
              ) : (
                <button type="button" data-node="ln-rpm" className="bz-node kind-rpm quiet" onClick={onFollowUp}><CalendarPlus size={14} /><span className="bz-node-name">Add follow-up to RPM</span></button>
              )}
              <button type="button" data-node="ln-res" className={`bz-node kind-out ${results?.length ? '' : 'quiet'}`} onClick={() => { onClose(); ctx.go('results', { lead: lead.id, log: 1 }); }}>
                <BarChart3 size={14} /><span className="bz-node-name">{results?.length ? `${results.length} result${results.length === 1 ? '' : 's'}` : 'Log a result'}</span>
                {results?.[0] && <small className="bz-node-sub">{resultLabel(results[0].type)} · {fmtDate(results[0].date)}</small>}
              </button>
            </div>
          </div>

          <div className="mk-grid mk-grid-2">
            <div className="mk-field biz-wide">
              <label className="form-label" htmlFor="ls-name">Name</label>
              <input id="ls-name" value={name} maxLength={200} onChange={(e) => setName(e.target.value)} onBlur={() => name.trim() && name !== lead.name && save({ name: name.trim() })} />
            </div>
            <div className="mk-field biz-wide">
              <span className="form-label">Next step</span>
              <InlineText value={lead.next_step} placeholder="What do you do next?" onSave={(v) => save({ next_step: v })} />
            </div>
            <div className="mk-field">
              <span className="form-label">Next contact {sig.overdue ? <em className="bz-req bad">{sig.overdue}d overdue</em> : null}</span>
              <DatePick value={lead.next_contact} onChange={(v) => save({ next_contact: v }, v ? `Next contact → ${fmtDate(v)}` : 'Next contact cleared')} label="Next contact" />
            </div>
            <div className="mk-field">
              <span className="form-label">Fit</span>
              <div className="ui-seg bz-fit-seg" role="radiogroup" aria-label="Fit">
                {[3, 2, 1].map((n) => (
                  <button key={n} type="button" role="radio" aria-checked={lead.fit === n} className={lead.fit === n ? 'on' : ''} style={{ '--fit': FIT[n].c }} onClick={() => save({ fit: n })}>{FIT[n].label}</button>
                ))}
              </div>
            </div>
            <div className="mk-field"><span className="form-label">Source</span><InlineText single value={lead.source} placeholder="Where they came from" onSave={(v) => save({ source: v })} /></div>
            <div className="mk-field"><span className="form-label">Offer</span><InlineText single value={lead.offer} placeholder="What you'd sell them" onSave={(v) => save({ offer: v })} /></div>
            <div className="mk-field biz-wide"><span className="form-label">Why them</span><InlineText value={lead.why} placeholder="Why they could buy" onSave={(v) => save({ why: v })} /></div>
            <div className="mk-field biz-wide"><span className="form-label">Notes</span><InlineText value={lead.notes} placeholder="Anything to remember" onSave={(v) => save({ notes: v })} /></div>
          </div>
        </div>
        <div className="modal-footer mk-foot">
          {confirm ? (
            <span className="bz-del-confirm">
              <button type="button" className="btn btn-ghost btn-danger-ghost" onClick={() => { list.remove(lead.id, lead.name); onClose(); }}>Delete lead</button>
              <button type="button" className="btn btn-ghost" onClick={() => setConfirm(false)}>Keep</button>
            </span>
          ) : <button type="button" className="btn btn-ghost btn-danger-ghost bz-del" onClick={() => setConfirm(true)}><Trash2 size={15} /> Delete</button>}
          <span className="mk-foot-note">Edits save as you go</span>
          {lead.action_id
            ? <button type="button" className="btn btn-secondary" onClick={onFollowUp}><Link2 size={15} /> Another follow-up</button>
            : <button type="button" className="btn btn-secondary" onClick={onFollowUp}><CalendarPlus size={15} /> Follow-up to RPM</button>}
          <button type="button" className="btn btn-primary" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
}

/** Text that saves on blur (or Enter for single-line). */
export function InlineText({ value, onSave, placeholder, single = false }) {
  const [v, setV] = useState(value || '');
  useEffect(() => { setV(value || ''); }, [value]);
  const commit = () => { if ((v || '') !== (value || '')) onSave(v.trim()); };
  return single ? (
    <input className="bz-inline" value={v} placeholder={placeholder} aria-label={placeholder} onChange={(e) => setV(e.target.value)} onBlur={commit}
      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); } }} />
  ) : (
    <textarea className="bz-inline" rows={2} value={v} placeholder={placeholder} aria-label={placeholder} onChange={(e) => setV(e.target.value)} onBlur={commit} />
  );
}

export { Chip };
