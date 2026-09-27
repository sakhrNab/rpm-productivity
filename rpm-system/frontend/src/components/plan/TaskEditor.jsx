import { useEffect } from 'react';
import { X, Sparkles, Bell, Pin, Link2, AlertTriangle } from 'lucide-react';
import Picker from '../Picker';
import { fmtDay } from '../../utils/planFormat';

const PRIORITIES = [{ v: 0, l: 'None' }, { v: 1, l: 'Low' }, { v: 2, l: 'Medium' }, { v: 3, l: 'High' }];
const SIZES = [{ v: 'small', l: 'Small', h: '< 1h' }, { v: 'medium', l: 'Medium', h: '1–4h' }, { v: 'big', l: 'Big', h: '> 4h' }];

// Keys that (transitively) depend on `key` — picking any of them as a prerequisite would make a cycle.
function descendants(key, tasks) {
  const out = new Set();
  const stack = [key];
  while (stack.length) {
    const k = stack.pop();
    for (const t of tasks) if (t.depends_on.includes(k) && !out.has(t.key)) { out.add(t.key); stack.push(t.key); }
  }
  return out;
}

export default function TaskEditor({ task, tasks, phases, onChange, onClose }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  if (!task) return null;

  const set = (patch) => onChange(task.key, patch);
  const blocked = descendants(task.key, tasks);
  const hours = Math.floor(task.effort_minutes / 60);
  const mins = task.effort_minutes % 60;

  return (
    <>
      <div className="pte-scrim" onClick={onClose} />
      <aside className="pte" role="dialog" aria-label={`Edit ${task.title}`}>
        <header className="pte-head">
          <div className="pte-dates">
            <span>{fmtDay(task.start)}</span><span className="pte-arrow">→</span><span>{fmtDay(task.end)}</span>
            {task.critical && task.include && <em className="pte-crit">critical path</em>}
            {task.critical === false && task.include && <em className="pte-slack">{task.slack_days}d slack</em>}
          </div>
          <button type="button" className="pte-x" onClick={onClose} aria-label="Close editor"><X size={18} /></button>
        </header>

        {task.source === 'initiative' && (
          <div className="pte-ai"><Sparkles size={14} /> <span><b>Added on my initiative.</b> {task.why}</span></div>
        )}
        {task.late && <div className="pte-warn"><AlertTriangle size={14} /> Ends {fmtDay(task.end)}, after its deadline ({fmtDay(task.deadline)}). Start it earlier or shorten its prerequisites.</div>}
        {task.shifted && <div className="pte-warn soft"><Pin size={14} /> Pinned to {fmtDay(task.pin)}, but its prerequisites finish later — moved to {fmtDay(task.start)}.</div>}

        <label className="pte-include">
          <input type="checkbox" checked={task.include} onChange={e => set({ include: e.target.checked })} />
          <span>Include this task</span>
        </label>

        <label className="pte-field">
          <span>Title</span>
          <input className="form-input" value={task.title} maxLength={200} onChange={e => set({ title: e.target.value })} />
        </label>
        <label className="pte-field">
          <span>What done looks like</span>
          <textarea className="form-input" rows={4} value={task.description} maxLength={2000} onChange={e => set({ description: e.target.value })} />
        </label>

        <div className="pte-field">
          <span>Priority</span>
          <div className="pte-seg" role="radiogroup" aria-label="Priority">
            {PRIORITIES.map(p => (
              <button key={p.v} type="button" role="radio" aria-checked={task.priority === p.v} className={`p${p.v} ${task.priority === p.v ? 'on' : ''}`} onClick={() => set({ priority: p.v })}>{p.l}</button>
            ))}
          </div>
        </div>

        <div className="pte-field">
          <span>Size</span>
          <div className="pte-seg" role="radiogroup" aria-label="Size">
            {SIZES.map(s => (
              <button key={s.v} type="button" role="radio" aria-checked={task.size === s.v} className={task.size === s.v ? 'on' : ''} onClick={() => set({ size: s.v })}>
                {s.l}<small>{s.h}</small>
              </button>
            ))}
          </div>
        </div>

        <div className="pte-grid">
          <label className="pte-field">
            <span>Effort</span>
            <div className="pte-effort">
              <input className="form-input" type="number" min={0} max={200} value={hours} onChange={e => set({ effort_minutes: Math.max(5, Number(e.target.value || 0) * 60 + mins) })} aria-label="Hours" /><i>h</i>
              <input className="form-input" type="number" min={0} max={59} step={5} value={mins} onChange={e => set({ effort_minutes: Math.max(5, hours * 60 + Number(e.target.value || 0)) })} aria-label="Minutes" /><i>m</i>
            </div>
          </label>
          <label className="pte-field">
            <span>Takes (calendar days)</span>
            <input className="form-input" type="number" min={1} max={120} value={task.span_days} onChange={e => set({ span_days: Math.max(1, Math.min(120, Number(e.target.value) || 1)) })} />
          </label>
          <label className="pte-field">
            <span>Start {task.pin ? <em className="pte-pinned"><Pin size={11} /> pinned</em> : <em className="pte-auto">auto</em>}</span>
            <div className="pte-row">
              <input className="form-input" type="date" value={task.pin || task.start} onChange={e => set({ pin: e.target.value || null })} />
              {task.pin && <button type="button" className="pte-mini" onClick={() => set({ pin: null })}>Auto</button>}
            </div>
          </label>
          <label className="pte-field">
            <span>Deadline</span>
            <div className="pte-row">
              <input className="form-input" type="date" value={task.deadline || ''} onChange={e => set({ deadline: e.target.value || null })} />
              {task.deadline && <button type="button" className="pte-mini" onClick={() => set({ deadline: null })}>Clear</button>}
            </div>
          </label>
        </div>

        <div className="pte-field">
          <span><Bell size={12} /> Reminder</span>
          <div className="pte-row">
            <label className="pte-switch">
              <input type="checkbox" checked={!!task.reminder} onChange={e => set({ reminder: e.target.checked ? { days_before: 0, time: '09:00' } : null })} />
              <span>{task.reminder ? 'On' : 'Off'}</span>
            </label>
            {task.reminder && (<>
              <input className="form-input pte-num" type="number" min={0} max={30} value={task.reminder.days_before}
                onChange={e => set({ reminder: { ...task.reminder, days_before: Math.max(0, Math.min(30, Number(e.target.value) || 0)) } })} aria-label="Days before start" />
              <em>days before, at</em>
              <input className="form-input pte-time" type="time" value={task.reminder.time} onChange={e => set({ reminder: { ...task.reminder, time: e.target.value || '09:00' } })} />
            </>)}
          </div>
        </div>

        <div className="pte-field">
          <span>Phase</span>
          <Picker value={task.phase} onChange={v => set({ phase: v })} options={phases.map(p => ({ value: p.key, label: p.title }))} />
        </div>

        <div className="pte-field">
          <span><Link2 size={12} /> Can't start until…</span>
          <div className="pte-deps">
            {tasks.filter(t => t.key !== task.key).map(t => {
              const on = task.depends_on.includes(t.key);
              const cyc = blocked.has(t.key);
              return (
                <button key={t.key} type="button" disabled={cyc && !on} aria-pressed={on}
                  className={`pte-dep ${on ? 'on' : ''}`} title={cyc ? 'This task already depends on this one' : t.title}
                  onClick={() => set({ depends_on: on ? task.depends_on.filter(d => d !== t.key) : [...task.depends_on, t.key] })}>
                  {t.title}
                </button>
              );
            })}
          </div>
        </div>
      </aside>
    </>
  );
}
