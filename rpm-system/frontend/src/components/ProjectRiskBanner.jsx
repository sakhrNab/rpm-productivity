import { useContext, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, CalendarOff, CalendarPlus, CalendarX2, Flame, GitBranch, Inbox, Layers, Target, Wand2, Wrench } from 'lucide-react';
import { AuthContext } from '../App';
import { buildProjectTimeline, computeProjectSchedule } from '../utils/projectTimeline';
import './ProjectRiskBanner.css';

const day = (d) => (d ? String(d).slice(0, 10) : null);
const localToday = () => { const n = new Date(); const p = (x) => String(x).padStart(2, '0'); return `${n.getFullYear()}-${p(n.getMonth() + 1)}-${p(n.getDate())}`; };
const SLIPPING = { overdue: 'is overdue', off_track: 'is off track', stalled: 'has stalled', at_risk: 'is at risk' };
const MAX_ITEMS = 6;
const s = (n) => (n > 1 ? 's' : '');
const daysBetween = (from, to) => Math.round((Date.parse(`${to}T00:00:00`) - Date.parse(`${from}T00:00:00`)) / 86400000);

// What's going wrong in this project, in one calm strip — most severe first, each
// item jumps to the fix: a passed or missing deadline, overdue tasks, slipping goals,
// dependency conflicts, key results ticked done without progress, empty blocks and
// tasks that sit outside every block.
export default function ProjectRiskBanner({
  project, onOpenTimeline, onEditAction, onShowKeyResults, onShowBlocks, onShowUnsorted, onEditDeadline,
  onAskCoach, hasCoach = true, onForecast,
}) {
  const { api } = useContext(AuthContext);
  const [goals, setGoals] = useState([]);

  useEffect(() => {
    let live = true;
    api.getForecast()
      .then(f => {
        if (!live) return;
        const mine = (f?.keyResults || []).filter(k => k.project_id === project.id);
        setGoals(mine.filter(k => SLIPPING[k.status]));
        if (onForecast) onForecast(mine);   // the key result cards reuse it (no second request)
      })
      .catch(() => {});
    return () => { live = false; };
  }, [api, project.id]);

  const facts = useMemo(() => {
    const today = localToday();
    const actions = (project.actions || []).filter(a => !a.is_cancelled);
    const overdue = actions.filter(a => !a.is_completed && day(a.scheduled_date) && day(a.scheduled_date) < today);
    const tl = buildProjectTimeline({
      phases: [],
      tasks: actions.map(a => ({ id: a.id, title: a.title, scheduled_date: day(a.scheduled_date), end_date: day(a.end_date), is_completed: a.is_completed, depends_on: (a.blocked_by || []).map(b => b.id) })),
    });
    const end = day(project.end_date);
    const deadlinePassed = !project.is_completed && end && end < today ? daysBetween(end, today) : 0;
    const noDeadline = !project.is_completed && !end;
    const hollowKrs = (project.key_results || []).filter(k => {
      const target = Number(k.target_value);
      return k.is_completed && k.target_value !== null && k.target_value !== '' && target > 0 && (Number(k.current_value) || 0) < target;
    });
    const emptyBlocks = (project.rpm_blocks || []).filter(b => {
      if (b.is_completed) return false;
      const own = (b.actions && b.actions.length ? b.actions : actions.filter(a => a.block_id === b.id));
      return own.filter(a => !a.is_cancelled).length === 0;
    });
    const unsorted = actions.filter(a => !a.is_completed && !a.block_id);
    return {
      overdue, deadlinePassed, noDeadline, hollowKrs, emptyBlocks, unsorted, end,
      conflicts: tl.tasks.length ? computeProjectSchedule(tl.tasks).conflicts : [],
    };
  }, [project]);

  // Every candidate item, ranked by severity (lower = more urgent).
  const items = [];
  const { overdue, conflicts, deadlinePassed, noDeadline, hollowKrs, emptyBlocks, unsorted, end } = facts;
  if (deadlinePassed) items.push({
    key: 'deadline-passed', rank: 0, tone: 'bad', Icon: CalendarX2, onClick: onEditDeadline,
    title: `The result was due ${end}. Set a new deadline or finish it.`,
    text: `The result deadline passed ${deadlinePassed} day${s(deadlinePassed)} ago (it was due ${end})`,
    body: <>Result deadline passed <b>{deadlinePassed}</b> day{s(deadlinePassed)} ago</>, cta: 'New date →',
  });
  if (overdue.length) items.push({
    key: 'overdue', rank: 1, tone: 'bad', Icon: CalendarX2, onClick: () => onEditAction?.(overdue[0]),
    title: overdue.map(a => a.title).join('\n'),
    text: `${overdue.length} overdue task${s(overdue.length)}: ${overdue.slice(0, 6).map(a => `“${a.title}”`).join(', ')}${overdue.length > 6 ? ' …' : ''}`,
    body: <><b>{overdue.length}</b> overdue task{s(overdue.length)}</>,
  });
  goals.slice(0, 2).forEach((k, i) => items.push({
    key: `goal-${k.id}`, rank: 2 + i * 0.01, tone: 'bad', Icon: Flame, to: '/today',
    title: `${k.title}${k.delta_days ? ` — about ${Math.abs(Math.round(k.delta_days))} days ${k.delta_days > 0 ? 'late' : 'early'} at the current pace` : ''}`,
    text: `Key result “${k.title}” ${SLIPPING[k.status]}${k.delta_days ? ` (about ${Math.abs(Math.round(k.delta_days))} days ${k.delta_days > 0 ? 'late' : 'early'} at the current pace)` : ''}`,
    body: <>“{k.title}” {SLIPPING[k.status]}</>,
  }));
  if (goals.length > 2) items.push({
    key: 'goals-more', rank: 2.5, tone: 'bad', Icon: Flame, to: '/today',
    title: goals.slice(2).map(k => k.title).join('\n'), body: <>+{goals.length - 2} more goals slipping</>,
    text: `${goals.length - 2} more key results slipping: ${goals.slice(2).map(k => `“${k.title}”`).join(', ')}`,
  });
  if (conflicts.length) items.push({
    key: 'conflicts', rank: 3, tone: 'warn', Icon: GitBranch, onClick: onOpenTimeline,
    title: conflicts.map(t => t.title).join('\n'),
    text: `${conflicts.length} task${s(conflicts.length)} start before a prerequisite finishes: ${conflicts.map(t => `“${t.title}”`).join(', ')}`,
    body: <><b>{conflicts.length}</b> task{s(conflicts.length)} start{conflicts.length > 1 ? '' : 's'} before {conflicts.length > 1 ? 'their prerequisites finish' : 'its prerequisite finishes'}</>,
    cta: 'Fix on timeline →',
  });
  if (hollowKrs.length) items.push({
    key: 'hollow-krs', rank: 4, tone: 'warn', Icon: Target, onClick: onShowKeyResults,
    title: hollowKrs.map(k => `${k.title} — ${Number(k.current_value) || 0}/${k.target_value}`).join('\n'),
    text: `${hollowKrs.length} key result${s(hollowKrs.length)} marked done without the progress: ${hollowKrs.map(k => `“${k.title}” ${Number(k.current_value) || 0}/${k.target_value}`).join(', ')}`,
    body: <><b>{hollowKrs.length}</b> key result{s(hollowKrs.length)} marked done with no progress</>,
  });
  if (noDeadline) items.push({
    key: 'no-deadline', rank: 5, tone: 'warn', Icon: CalendarOff, onClick: onEditDeadline,
    title: 'A result without a date is a wish. Give it a deadline.',
    text: 'The project result has no deadline',
    body: <>No deadline set</>, cta: <><CalendarPlus size={13} /> Set</>,
  });
  // Blocks without tasks and tasks without a block are one problem with one fix: the By-block view.
  if (unsorted.length || emptyBlocks.length) {
    const parts = [];
    if (unsorted.length) parts.push(<span key="u"><b>{unsorted.length}</b> task{s(unsorted.length)} {unsorted.length > 1 ? "aren't" : "isn't"} in any block</span>);
    if (emptyBlocks.length) parts.push(<span key="e"><b>{emptyBlocks.length}</b> block{s(emptyBlocks.length)} {emptyBlocks.length > 1 ? 'have' : 'has'} no tasks</span>);
    items.push({
      key: 'sorting', rank: 6, tone: 'info', Icon: unsorted.length ? Inbox : Layers,
      onClick: unsorted.length ? onShowUnsorted : onShowBlocks,
      title: [
        ...(unsorted.length ? ['Not in any block:', ...unsorted.map(a => `• ${a.title}`)] : []),
        ...(emptyBlocks.length ? ['Blocks with no tasks:', ...emptyBlocks.map(b => `• ${b.result_title}`)] : []),
      ].join('\n'),
      body: parts.length > 1 ? <>{parts[0]} · {parts[1]}</> : parts[0],
      cta: 'Sort →',
      text: [
        unsorted.length ? `${unsorted.length} task${s(unsorted.length)} not in any block: ${unsorted.slice(0, 6).map(a => `“${a.title}”`).join(', ')}` : '',
        emptyBlocks.length ? `${emptyBlocks.length} block${s(emptyBlocks.length)} with no tasks: ${emptyBlocks.map(b => `“${b.result_title}”`).join(', ')}` : '',
      ].filter(Boolean).join('; '),
    });
  }

  if (!items.length) return null;
  items.sort((a, b) => a.rank - b.rank);
  const shown = items.slice(0, MAX_ITEMS);
  const hidden = items.length - shown.length;
  const tone = items.some(i => i.tone === 'bad') ? 'bad' : items.some(i => i.tone === 'warn') ? 'warn' : 'info';

  return (
    <div className={`prb prb--${tone}`} role="status">
      <div className="prb-head">
        <span className="prb-icon"><AlertTriangle size={16} /></span>
        <span className="prb-kicker">Needs attention <b>{items.length}</b></span>
      </div>
      <div className="prb-items">
        {shown.map(({ key, tone: t, Icon, onClick, to, title, body, cta }) => {
          const inner = <><Icon size={14} /> <span>{body}</span>{cta && <em>{cta}</em>}</>;
          return to ? (
            <Link key={key} to={to} className={`prb-item ${t}`} title={title}>{inner}</Link>
          ) : (
            <button key={key} type="button" className={`prb-item ${t}`} onClick={onClick} title={title}>{inner}</button>
          );
        })}
        {hidden > 0 && (
          <span className="prb-item prb-more" title={items.slice(MAX_ITEMS).map(i => i.title.split('\n')[0]).join('\n')}>
            +{hidden} more
          </span>
        )}
      </div>
      {onAskCoach && (
        <button type="button" className="prb-ask" onClick={() => onAskCoach(items.map(i => i.text).filter(Boolean))}>
          {hasCoach ? <><Wrench size={14} /> Fix this with me</> : <><Wand2 size={14} /> Set up a coach to fix this</>}
        </button>
      )}
    </div>
  );
}
