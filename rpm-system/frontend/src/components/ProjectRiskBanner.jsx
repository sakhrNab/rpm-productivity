import { useContext, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, CalendarX2, Flame, GitBranch } from 'lucide-react';
import { AuthContext } from '../App';
import { buildProjectTimeline, computeProjectSchedule } from '../utils/projectTimeline';
import './ProjectRiskBanner.css';

const day = (d) => (d ? String(d).slice(0, 10) : null);
const localToday = () => { const n = new Date(); const p = (x) => String(x).padStart(2, '0'); return `${n.getFullYear()}-${p(n.getMonth() + 1)}-${p(n.getDate())}`; };
const SLIPPING = { overdue: 'is overdue', off_track: 'is off track', stalled: 'has stalled', at_risk: 'is at risk' };

// What's going wrong in this project, in one line: overdue tasks, date conflicts
// between dependent tasks, and key results the forecast says will be missed.
export default function ProjectRiskBanner({ project, onOpenTimeline, onEditAction }) {
  const { api } = useContext(AuthContext);
  const [goals, setGoals] = useState([]);

  useEffect(() => {
    let live = true;
    api.getForecast()
      .then(f => { if (live) setGoals((f?.keyResults || []).filter(k => k.project_id === project.id && SLIPPING[k.status])); })
      .catch(() => {});
    return () => { live = false; };
  }, [api, project.id]);

  const { overdue, conflicts } = useMemo(() => {
    const today = localToday();
    const actions = (project.actions || []).filter(a => !a.is_cancelled);
    const overdue = actions.filter(a => !a.is_completed && day(a.scheduled_date) && day(a.scheduled_date) < today);
    const tl = buildProjectTimeline({
      phases: [],
      tasks: actions.map(a => ({ id: a.id, title: a.title, scheduled_date: day(a.scheduled_date), end_date: day(a.end_date), is_completed: a.is_completed, depends_on: (a.blocked_by || []).map(b => b.id) })),
    });
    return { overdue, conflicts: tl.tasks.length ? computeProjectSchedule(tl.tasks).conflicts : [] };
  }, [project]);

  if (!overdue.length && !conflicts.length && !goals.length) return null;
  const s = (n) => (n > 1 ? 's' : '');

  return (
    <div className="prb" role="status">
      <span className="prb-icon"><AlertTriangle size={16} /></span>
      <div className="prb-items">
        {overdue.length > 0 && (
          <button type="button" className="prb-item bad" onClick={() => onEditAction?.(overdue[0])} title={overdue.map(a => a.title).join('\n')}>
            <CalendarX2 size={14} /> <b>{overdue.length}</b> overdue task{s(overdue.length)}
          </button>
        )}
        {conflicts.length > 0 && (
          <button type="button" className="prb-item warn" onClick={onOpenTimeline} title={conflicts.map(t => t.title).join('\n')}>
            <GitBranch size={14} /> <b>{conflicts.length}</b> task{s(conflicts.length)} start{conflicts.length > 1 ? '' : 's'} before {conflicts.length > 1 ? 'their prerequisites finish' : 'its prerequisite finishes'} — fix on the timeline
          </button>
        )}
        {goals.slice(0, 2).map(k => (
          <Link key={k.id} to="/compass" className="prb-item bad" title={`${k.title}${k.delta_days ? ` — about ${Math.abs(Math.round(k.delta_days))} days ${k.delta_days > 0 ? 'late' : 'early'} at the current pace` : ''}`}>
            <Flame size={14} /> “{k.title}” {SLIPPING[k.status]}
          </Link>
        ))}
        {goals.length > 2 && <Link to="/compass" className="prb-item">+{goals.length - 2} more goals</Link>}
      </div>
    </div>
  );
}
