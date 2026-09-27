import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, CalendarPlus, CheckCircle2, FileUp, Loader2, Route, Undo2, Wand2 } from 'lucide-react';
import { AuthContext } from '../../App';
import { useToast } from '../ToastProvider';
import PlanTimeline from './PlanTimeline';
import { buildProjectTimeline, computeProjectSchedule, cascadeMove, fixConflicts, autoSchedule } from '../../utils/projectTimeline';
import { fmtDay } from '../../utils/planFormat';
import './ProjectTimeline.css';

// The project's REAL tasks on the plan timeline. Saved dates are shown as-is; drags,
// "fix conflicts" and auto-scheduling write through /api/actions/reschedule, with undo.
export default function ProjectTimeline({ projectId, refreshKey, onEdit, onChanged }) {
  const { api } = useContext(AuthContext);
  const { showToast } = useToast();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [zoom, setZoom] = useState(null);
  const [spotlight, setSpotlight] = useState(false);
  const [busy, setBusy] = useState(false);
  const [undo, setUndo] = useState(null);           // { label, previous, timer }
  const undoTimer = useRef(null);

  const load = useCallback(() => {
    api.getProjectTimeline(projectId)
      .then(d => { if (d && !d.error) { setData(d); setError(null); } else setError(d?.error || 'Could not load the timeline'); })
      .catch(() => setError('Could not load the timeline'));
  }, [api, projectId]);
  useEffect(() => { load(); }, [load, refreshKey]);
  useEffect(() => () => clearTimeout(undoTimer.current), []);

  const tl = useMemo(() => (data ? buildProjectTimeline(data) : null), [data]);
  const sched = useMemo(() => (tl ? computeProjectSchedule(tl.tasks) : null), [tl]);

  useEffect(() => {
    if (zoom || !sched?.tasks.length) return;
    const starts = sched.tasks.map(t => t.start).sort();
    const ends = sched.tasks.map(t => t.end).sort();
    const span = (Date.parse(ends[ends.length - 1]) - Date.parse(starts[0])) / 86400000;
    setZoom(span <= 21 ? 'day' : span <= 150 ? 'week' : 'month');
  }, [sched, zoom]);

  // Apply date changes optimistically, save them, and offer undo.
  const apply = async (changes, label) => {
    if (!changes.length) return;
    const before = data;
    const byId = new Map(changes.map(c => [c.id, c]));
    setData(d => ({ ...d, tasks: d.tasks.map(t => (byId.has(t.id) ? { ...t, scheduled_date: byId.get(t.id).scheduled_date, end_date: byId.get(t.id).end_date } : t)) }));
    setBusy(true);
    try {
      const res = await api.rescheduleActions(changes);
      if (!res || !res.ok) throw new Error(res?.error || 'Could not save');
      clearTimeout(undoTimer.current);
      setUndo({ label, previous: res.previous });
      undoTimer.current = setTimeout(() => setUndo(null), 10000);
      onChanged?.();
    } catch (e) {
      setData(before);
      showToast(e.message || 'Could not save the new dates', 'error');
    } finally { setBusy(false); }
  };

  const doUndo = async () => {
    if (!undo) return;
    const prev = undo.previous.filter(p => p.scheduled_date);
    setUndo(null);
    clearTimeout(undoTimer.current);
    const byId = new Map(prev.map(c => [c.id, c]));
    setData(d => ({ ...d, tasks: d.tasks.map(t => (byId.has(t.id) ? { ...t, scheduled_date: byId.get(t.id).scheduled_date, end_date: byId.get(t.id).end_date } : t)) }));
    const res = await api.rescheduleActions(prev).catch(() => null);
    if (!res?.ok) { showToast('Undo failed — reloading', 'error'); load(); } else onChanged?.();
  };

  const onPin = (key, date) => {
    const changes = cascadeMove(tl.tasks, key, date);
    if (!changes.length) return;
    const task = tl.tasks.find(t => t.key === key);
    const extra = changes.length - 1;
    apply(changes, `Moved “${task.title}” to ${fmtDay(date)}${extra ? ` and ${extra} task${extra > 1 ? 's' : ''} after it` : ''}`);
  };

  if (error) return <div className="ptv-empty"><AlertTriangle size={18} /> {error}</div>;
  if (!data || !sched) return <div className="ptv-empty"><Loader2 size={18} className="ptv-spin" /> Loading timeline…</div>;

  const done = sched.tasks.filter(t => t.done).length;
  const total = sched.tasks.length + tl.unscheduled.length;

  return (
    <div className="ptv">
      <div className="ptv-bar">
        <div className="ptv-seg" role="tablist" aria-label="Zoom">
          {['day', 'week', 'month'].map(z => (
            <button key={z} type="button" className={zoom === z ? 'on' : ''} onClick={() => setZoom(z)}>{z[0].toUpperCase() + z.slice(1)}s</button>
          ))}
        </div>
        <button type="button" className={`ptv-toggle ${spotlight ? 'on' : ''}`} onClick={() => setSpotlight(s => !s)} aria-pressed={spotlight}>
          <Route size={14} /> Critical path
        </button>
        <span className="ptv-stat"><CheckCircle2 size={14} /> {done}/{total} done</span>
        {busy && <span className="ptv-stat"><Loader2 size={14} className="ptv-spin" /> Saving…</span>}
        {undo && (
          <span className="ptv-undo" role="status">
            {undo.label}
            <button type="button" onClick={doUndo}><Undo2 size={13} /> Undo</button>
          </span>
        )}
      </div>

      {sched.conflicts.length > 0 && (
        <div className="ptv-alert">
          <AlertTriangle size={16} />
          <span>
            <b>{sched.conflicts.length} task{sched.conflicts.length > 1 ? 's start' : ' starts'} before {sched.conflicts.length > 1 ? 'their prerequisites finish' : 'its prerequisite finishes'}</b>
            {' — '}{sched.conflicts.slice(0, 3).map(t => `“${t.title}”`).join(', ')}{sched.conflicts.length > 3 ? '…' : ''}
          </span>
          <button type="button" onClick={() => apply(fixConflicts(sched.tasks, tl.tasks), `Moved ${sched.conflicts.length} task${sched.conflicts.length > 1 ? 's' : ''} after their prerequisites`)} disabled={busy}>
            <Wand2 size={14} /> Fix all
          </button>
        </div>
      )}

      {sched.tasks.length > 0 ? (
        <>
          <p className="ptv-hint">Drag a bar (or focus it and press ← →) to reschedule — tasks that depend on it move with it. Click to edit.</p>
          <PlanTimeline tasks={sched.tasks} phases={tl.phases} today={data.today} zoom={zoom || 'week'} spotlight={spotlight}
            onPin={onPin} onOpen={onEdit} />
        </>
      ) : (
        <div className="ptv-empty">
          <CalendarPlus size={18} /> No dated tasks yet.
          <Link to={`/import?project=${projectId}`} className="ptv-link"><FileUp size={14} /> Plan from a file</Link>
        </div>
      )}

      {tl.unscheduled.length > 0 && (
        <div className="ptv-tray">
          <div className="ptv-tray-head">
            <span><b>{tl.unscheduled.length}</b> without a date</span>
            <button type="button" disabled={busy} onClick={() => apply(autoSchedule(tl.unscheduled, tl.tasks, data.today), `Scheduled ${tl.unscheduled.length} task${tl.unscheduled.length > 1 ? 's' : ''}`)}>
              <Wand2 size={14} /> Auto-schedule after their prerequisites
            </button>
          </div>
          <div className="ptv-chips">
            {tl.unscheduled.map(u => (
              <button type="button" key={u.id} className="ptv-chip" onClick={() => onEdit(u.id)}>{u.title}</button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
