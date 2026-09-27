import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Check, ChevronLeft, ChevronRight, Gauge, GripVertical, Loader2, Minus, Plus, Scale, Settings2, Undo2, X } from 'lucide-react';
import { AuthContext } from '../App';
import { useToast } from './ToastProvider';
import { suggestRebalance, fmtHours, addDays } from '../utils/capacity';
import { fmtDay } from '../utils/planFormat';
import './CapacityStrip.css';

const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const wd = (d) => WD[new Date(`${d}T00:00:00Z`).getUTCDay()];
const SHOW = 4;

// Planned vs available hours for a run of days. Tasks can be dragged (or tapped, then
// a day tapped) onto another day; overloaded days get a one-click, previewed rebalance.
export default function CapacityStrip({ start: baseStart, days = 7, today, refreshKey, onChanged, navigable = false }) {
  const { api } = useContext(AuthContext);
  const { showToast } = useToast();
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [picked, setPicked] = useState(null);          // task being moved by tap
  const [dragOver, setDragOver] = useState(null);
  const [expanded, setExpanded] = useState({});
  const [editHours, setEditHours] = useState(null);    // { weekday, weekend }
  const [preview, setPreview] = useState(null);        // rebalance moves
  const [undo, setUndo] = useState(null);
  const undoTimer = useRef(null);
  const [offset, setOffset] = useState(0);            // weeks away from baseStart (navigable strips)
  const start = addDays(baseStart, offset * days);
  const end = addDays(start, days - 1);

  const load = useCallback(() => {
    api.getCapacity(start, end).then(d => { if (d && !d.error) setData(d); }).catch(() => {});
  }, [api, start, end]);
  useEffect(() => { load(); }, [load, refreshKey]);
  useEffect(() => () => clearTimeout(undoTimer.current), []);

  const save = async (changes, label) => {
    if (!changes.length) return;
    setBusy(true);
    try {
      const res = await api.rescheduleActions(changes);
      if (!res?.ok) throw new Error(res?.error || 'Could not move it');
      clearTimeout(undoTimer.current);
      setUndo({ label, previous: res.previous });
      undoTimer.current = setTimeout(() => setUndo(null), 10000);
      load(); onChanged?.();
    } catch (e) { showToast(e.message || 'Could not move it', 'error'); }
    finally { setBusy(false); setPicked(null); setPreview(null); }
  };

  const doUndo = async () => {
    const prev = (undo?.previous || []).filter(p => p.scheduled_date);
    setUndo(null); clearTimeout(undoTimer.current);
    const res = await api.rescheduleActions(prev).catch(() => null);
    if (!res?.ok) showToast('Undo failed', 'error');
    load(); onChanged?.();
  };

  const moveTo = (task, date) => {
    if (!task || task.scheduled_date === date) { setPicked(null); return; }
    const span = task.end_date && task.end_date > task.scheduled_date
      ? Math.round((Date.parse(task.end_date) - Date.parse(task.scheduled_date)) / 86400000) : 0;
    if (task.prereq_end && date <= task.prereq_end) showToast(`Heads-up: “${task.title}” now starts before its prerequisite finishes (${fmtDay(task.prereq_end)}).`, 'info', 6000);
    save([{ id: task.id, scheduled_date: date, end_date: span ? addDays(date, span) : null }], `Moved “${task.title}” to ${wd(date)} ${fmtDay(date)}`);
  };

  const saveHours = async () => {
    const r = await api.saveCapacitySettings(editHours).catch(() => null);
    if (!r?.ok) { showToast(r?.error || 'Could not save your hours', 'error'); return; }
    setEditHours(null); load();
  };

  if (!data) return <div className="cap cap-loading"><Loader2 size={16} className="cap-spin" /> Checking your capacity…</div>;

  const future = data.days.filter(d => d.date >= today);
  const planned = future.reduce((n, d) => n + d.planned_minutes, 0);
  const avail = future.reduce((n, d) => n + d.capacity_minutes, 0);
  const over = future.filter(d => d.overloaded);
  const dropProps = (d) => (d.date < today ? {} : {
    onDragOver: (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; if (dragOver !== d.date) setDragOver(d.date); },
    onDragLeave: (e) => { if (!e.currentTarget.contains(e.relatedTarget)) setDragOver(null); },
    onDrop: (e) => {
      e.preventDefault(); setDragOver(null);
      const id = e.dataTransfer.getData('text/rpm-task');
      const task = data.days.flatMap(x => x.tasks).find(t => t.id === id);
      if (task) moveTo(task, d.date);
    },
  });

  return (
    <section className="cap" aria-label="Capacity">
      <header className="cap-head">
        <span className="cap-title"><Gauge size={16} /> Capacity</span>
        {navigable && (
          <span className="cap-nav">
            <button type="button" onClick={() => setOffset(o => o - 1)} aria-label="Previous week"><ChevronLeft size={15} /></button>
            <span>{offset === 0 ? 'This week' : offset === 1 ? 'Next week' : `${fmtDay(start)} – ${fmtDay(end)}`}</span>
            <button type="button" onClick={() => setOffset(o => o + 1)} aria-label="Next week"><ChevronRight size={15} /></button>
          </span>
        )}
        <span className="cap-sum">{future.length ? <><b>{fmtHours(planned)}</b> planned of {fmtHours(avail)} available{start === today ? ' in the next 7 days' : start < today ? ' in the days left' : ''}</> : 'These days have passed'}</span>
        {busy && <Loader2 size={14} className="cap-spin" />}
        {undo && <span className="cap-undo" role="status">{undo.label}<button type="button" onClick={doUndo}><Undo2 size={13} /> Undo</button></span>}
        <button type="button" className="cap-gear" onClick={() => setEditHours(editHours ? null : { ...data.settings })} aria-expanded={!!editHours} title="Set your available hours">
          <Settings2 size={15} /> {data.settings.weekday}h / {data.settings.weekend}h
        </button>
      </header>

      {editHours && (
        <div className="cap-hours">
          {[['weekday', 'Weekdays'], ['weekend', 'Weekends']].map(([k, label]) => (
            <div key={k} className="cap-stepper">
              <span>{label}</span>
              <button type="button" aria-label={`Less time on ${label.toLowerCase()}`} onClick={() => setEditHours(h => ({ ...h, [k]: Math.max(0, h[k] - 0.5) }))}><Minus size={14} /></button>
              <b>{editHours[k]}h</b>
              <button type="button" aria-label={`More time on ${label.toLowerCase()}`} onClick={() => setEditHours(h => ({ ...h, [k]: Math.min(16, h[k] + 0.5) }))}><Plus size={14} /></button>
            </div>
          ))}
          <span className="cap-hours-note">Hours you can really give to tasks — not your whole working day.</span>
          <button type="button" className="cap-btn primary" onClick={saveHours}><Check size={14} /> Save</button>
        </div>
      )}

      {over.length > 0 && !preview && (
        <div className="cap-alert">
          <Scale size={15} />
          <span><b>{over.map(d => wd(d.date)).join(', ')}</b> {over.length > 1 ? 'are' : 'is'} over by {over.map(d => fmtHours(d.planned_minutes - d.capacity_minutes)).join(', ')}</span>
          <button type="button" className="cap-btn" onClick={() => {
            const moves = suggestRebalance(data.days, today);
            if (!moves.length) showToast('Nothing can move safely — every task left there is starred, high priority, or others depend on it. Drag one yourself, or raise your hours.', 'info', 7000);
            else setPreview(moves);
          }}>Rebalance</button>
        </div>
      )}

      {preview && (
        <div className="cap-preview">
          <div className="cap-preview-head">Move {preview.length} task{preview.length > 1 ? 's' : ''} to lighter days?</div>
          {(() => {
            // Days the moves can't fix — say why instead of leaving the user guessing.
            const left = over.filter(d => d.planned_minutes - preview.filter(m => m.from === d.date).reduce((n, m) => n + m.minutes, 0) > d.capacity_minutes);
            return left.length ? <p className="cap-note">{left.map(d => wd(d.date)).join(', ')} will still be over — what's left there is starred, high priority, multi-day, or other tasks wait on it. Drag one yourself if you can.</p> : null;
          })()}
          {preview.map(m => <div key={m.id} className="cap-move"><span>{m.title}</span><i>{wd(m.from)} → <b>{wd(m.scheduled_date)} {fmtDay(m.scheduled_date)}</b> · {fmtHours(m.minutes)}</i></div>)}
          <div className="cap-preview-actions">
            <button type="button" className="cap-btn primary" disabled={busy} onClick={() => save(preview.map(({ id, scheduled_date, end_date }) => ({ id, scheduled_date, end_date })), `Rebalanced ${preview.length} task${preview.length > 1 ? 's' : ''}`)}><Check size={14} /> Move them</button>
            <button type="button" className="cap-btn" onClick={() => setPreview(null)}><X size={14} /> Keep as is</button>
          </div>
        </div>
      )}

      {picked && <p className="cap-hint">Now tap the day to move “{picked.title}” to — or tap it again to cancel.</p>}

      <div className="cap-days" style={{ '--n': data.days.length }}>
        {data.days.map(d => {
          const pct = d.capacity_minutes ? Math.min(100, (d.planned_minutes / d.capacity_minutes) * 100) : (d.planned_minutes ? 100 : 0);
          const donePct = d.capacity_minutes ? Math.min(100, (d.done_minutes / d.capacity_minutes) * 100) : 0;
          const past = d.date < today;
          const lvl = d.overloaded ? 'over' : pct >= 85 ? 'full' : 'ok';
          const list = expanded[d.date] ? d.tasks : d.tasks.slice(0, SHOW);
          const target = picked && !past && picked.scheduled_date !== d.date;
          return (
            <div key={d.date} className={`cap-day ${past ? 'past' : ''} ${d.date === today ? 'today' : ''} ${dragOver === d.date ? 'drop' : ''} ${target ? 'target' : ''} load-${lvl}`}
              {...dropProps(d)} onClick={target ? () => moveTo(picked, d.date) : undefined}>
              <div className="cap-day-head">
                <span className="cap-wd">{wd(d.date)}</span><span className="cap-date">{fmtDay(d.date)}</span>
                <span className="cap-num">{fmtHours(d.planned_minutes)}<i>/{fmtHours(d.capacity_minutes)}</i></span>
              </div>
              <div className="cap-meter" role="meter" aria-valuemin={0} aria-valuemax={d.capacity_minutes} aria-valuenow={d.planned_minutes} aria-label={`${wd(d.date)}: ${fmtHours(d.planned_minutes)} planned of ${fmtHours(d.capacity_minutes)}`}>
                <span className="cap-done" style={{ width: `${donePct}%` }} />
                <span className="cap-fill" style={{ left: `${donePct}%`, width: `${Math.min(100 - donePct, pct)}%` }} />
              </div>
              <div className="cap-tasks">
                {list.map(t => {
                  const movable = !t.is_completed && !past;
                  return (
                    <button key={t.id} type="button" className={`cap-task p${t.priority} ${t.is_completed ? 'done' : ''} ${picked?.id === t.id ? 'picked' : ''}`}
                      draggable={movable}
                      onDragStart={(e) => { e.dataTransfer.setData('text/rpm-task', t.id); e.dataTransfer.effectAllowed = 'move'; }}
                      onClick={(e) => { e.stopPropagation(); if (movable) setPicked(picked?.id === t.id ? null : t); }}
                      title={`${t.title}${t.minutes ? ` · ${fmtHours(t.minutes)}` : ''}${t.multi_day ? ' (share of a multi-day task)' : ''}${t.blocks_count ? `\n${t.blocks_count} task${t.blocks_count > 1 ? 's' : ''} wait on this` : ''}${movable ? '\nDrag to another day, or tap then tap a day' : ''}`}>
                      {movable && <GripVertical size={11} className="cap-grip" />}
                      <span className="cap-task-title">{t.title}</span>
                      {t.minutes > 0 && <i>{fmtHours(t.minutes)}</i>}
                    </button>
                  );
                })}
                {d.tasks.length > SHOW && (
                  <button type="button" className="cap-more" onClick={(e) => { e.stopPropagation(); setExpanded(x => ({ ...x, [d.date]: !x[d.date] })); }}>
                    {expanded[d.date] ? 'Show less' : `+${d.tasks.length - SHOW} more`}
                  </button>
                )}
                {!d.tasks.length && !past && <span className="cap-free">Free</span>}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
