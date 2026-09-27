import { Fragment } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Check, ExternalLink, Sunrise, ClipboardCheck, BellRing, Wand2, X, Zap, Wrench, Loader2 } from 'lucide-react';
import Markdown from './Markdown';
import { CHECKIN_LABEL, FOLLOWUP_OUTCOME, dayLabel, proseLines, relTime } from '../utils/coach';

// Label for an executed (non-proposal) tool chip — coach tools are mostly read-only lookups.
function toolLabel(t) {
  const r = t.result;
  const base = {
    find_actions: r?.count != null ? `Looked up tasks (${r.count})` : 'Looking up tasks',
    list_projects: 'Read your projects',
    web_search: t.done ? 'Searched the web' : 'Searching the web…',
    remember: r?.content ? `Remembered: “${r.content}”` : 'Saving to memory',
    forget: 'Forgot a memory',
    create_action: r?.title ? `Created “${r.title}”` : 'Created a task',
    schedule_action: r?.scheduled_date ? `Scheduled → ${String(r.scheduled_date).slice(0, 10)}` : 'Scheduled a task',
    complete_action: 'Completed a task',
  }[t.name] || (t.done ? t.name.replace(/_/g, ' ') : `${t.name.replace(/_/g, ' ')}…`);
  return r && r.ok === false ? `${base} — failed` : base;
}

const CHECKIN_ICON = { plan: Sunrise, review: ClipboardCheck, nudge: BellRing };

function Tools({ m, onApprove, onDismiss }) {
  const tools = Array.isArray(m.tools) ? m.tools : [];
  if (!tools.length) return null;
  const chips = [], proposals = [];
  tools.forEach((t, ti) => (t.result && t.result.proposed ? proposals : chips).push({ t, ti }));
  const pending = proposals.filter(({ t }) => !t.status).length;
  const canAct = !!m.id && !m.local;
  return (
    <>
      {chips.length > 0 && (
        <div className="coach-tools">
          {chips.map(({ t, ti }) => (
            <span key={ti} className={`coach-tool ${t.done ? 'done' : 'running'}${t.result && t.result.ok === false ? ' err' : ''}`}>
              {t.done ? <Zap size={12} /> : <Loader2 size={12} className="coach-spin" />} {toolLabel(t)}
            </span>
          ))}
        </div>
      )}
      {proposals.length > 0 && (
        <div className="coach-props">
          <div className="coach-props-head">
            <Wand2 size={13} /> Suggested changes
            {pending > 0 && <span className="coach-props-count">{pending} pending</span>}
          </div>
          {proposals.map(({ t, ti }) => {
            const link = (t.applied && t.applied.link) || t.result.link;
            return (
              <div key={ti} className={`coach-prop ${t.status || ''}`}>
                <span className="coach-prop-label">{t.result.label || t.name}</span>
                {!t.status && (
                  <span className="coach-prop-actions">
                    <button type="button" className="coach-prop-approve" disabled={!canAct} onClick={() => onApprove(m.id, ti)}><Check size={14} /> Approve</button>
                    <button type="button" className="coach-prop-dismiss" disabled={!canAct} onClick={() => onDismiss(m.id, ti)}><X size={14} /> Dismiss</button>
                  </span>
                )}
                {t.status === 'applying' && <span className="coach-prop-state"><Loader2 size={13} className="coach-spin" /> Applying…</span>}
                {t.status === 'applied' && (
                  <span className="coach-prop-state done">
                    <Check size={13} /> Applied
                    {link && <Link to={link} className="coach-prop-open">Open <ExternalLink size={11} /></Link>}
                  </span>
                )}
                {t.status === 'dismissed' && <span className="coach-prop-state muted">Dismissed</span>}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

function FollowupRows({ m, onFollowup }) {
  const actions = m.meta?.actions || [];
  const results = m.meta?.results || {};
  return (
    <ul className="coach-fu">
      {actions.map(a => {
        const r = results[a.id];
        return (
          <li key={a.id} className={`coach-fu-row${r ? ` is-${r}` : ''}`}>
            <span className="coach-fu-title">{a.title}</span>
            {r ? (
              <span className={`coach-fu-outcome is-${r}`}>{r === 'd' ? '✅' : r === 't' ? '➡️' : '✖'} {FOLLOWUP_OUTCOME[r]}</span>
            ) : (
              <span className="coach-fu-btns">
                <button type="button" onClick={() => onFollowup(m.id, a.id, 'd')} disabled={!m.id}>✅ Done</button>
                <button type="button" onClick={() => onFollowup(m.id, a.id, 't')} disabled={!m.id}>➡️ Tomorrow</button>
                <button type="button" className="drop" onClick={() => onFollowup(m.id, a.id, 'x')} disabled={!m.id}>✖ Drop</button>
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

// The saved coach thread: check-ins, follow-ups, alerts, chat bubbles and proposal cards.
export default function CoachThread({ messages, streaming, onApprove, onDismiss, onFollowup, onFix }) {
  let lastDay = '';
  return (
    <div className="coach-thread-list">
      {messages.map((m, i) => {
        const day = m.created_at ? dayLabel(m.created_at) : '';
        const divider = day && day !== lastDay ? <div className="coach-day" role="separator"><span>{day}</span></div> : null;
        if (day) lastDay = day;
        const key = m.id || `local-${i}`;
        const time = m.created_at ? relTime(m.created_at) : '';
        const unread = !m.read_at && m.role === 'assistant' && !m.local;

        if (m.role === 'user') {
          return <Fragment key={key}>{divider}<div className="coach-msg user">{m.content}</div></Fragment>;
        }

        if (m.kind === 'checkin') {
          const k = m.meta?.checkin || 'nudge';
          const Icon = CHECKIN_ICON[k] || BellRing;
          return (
            <Fragment key={key}>
              {divider}
              <article className={`coach-card coach-card--checkin${unread ? ' is-unread' : ''}`}>
                <header className="coach-card-head"><Icon size={13} /> {CHECKIN_LABEL[k] || 'Check-in'}<time>{time}</time></header>
                {m.content && <Markdown>{m.content}</Markdown>}
                <Tools m={m} onApprove={onApprove} onDismiss={onDismiss} />
              </article>
            </Fragment>
          );
        }

        if (m.kind === 'followup') {
          const prose = m.meta?.actions?.length ? proseLines(m.content) : m.content;
          return (
            <Fragment key={key}>
              {divider}
              <article className={`coach-card coach-card--followup${unread ? ' is-unread' : ''}`}>
                <header className="coach-card-head"><ClipboardCheck size={13} /> Follow-up<time>{time}</time></header>
                {prose && <p className="coach-card-text">{prose}</p>}
                {m.meta?.actions?.length > 0 && <FollowupRows m={m} onFollowup={onFollowup} />}
              </article>
            </Fragment>
          );
        }

        if (m.kind === 'alert') {
          const alerts = m.meta?.alerts || [];
          const prose = alerts.length ? proseLines(m.content).split('\n').filter(l => !/fix this with me/i.test(l)).join('\n').trim() : m.content;
          return (
            <Fragment key={key}>
              {divider}
              <article className={`coach-card coach-card--alert${unread ? ' is-unread' : ''}`}>
                <header className="coach-card-head"><AlertTriangle size={13} /> Heads-up<time>{time}</time></header>
                {prose && <p className="coach-card-text">{prose}</p>}
                {alerts.length > 0 && <ul className="coach-alerts">{alerts.map((a, j) => <li key={a.key || j}>{a.text}</li>)}</ul>}
                {alerts.length > 0 && onFix && (
                  <button type="button" className="coach-fix" onClick={() => onFix(alerts.map(a => a.text))} disabled={streaming}>
                    <Wrench size={13} /> Fix this with me
                  </button>
                )}
              </article>
            </Fragment>
          );
        }

        // chat
        const isLast = i === messages.length - 1;
        return (
          <Fragment key={key}>
            {divider}
            <div className="coach-msg assistant">
              {m.content
                ? <Markdown>{m.content}</Markdown>
                : (streaming && isLast && !(m.tools || []).length ? <span className="coach-typing" aria-label="Typing"><i /><i /><i /></span> : null)}
              <Tools m={m} onApprove={onApprove} onDismiss={onDismiss} />
            </div>
          </Fragment>
        );
      })}
    </div>
  );
}
