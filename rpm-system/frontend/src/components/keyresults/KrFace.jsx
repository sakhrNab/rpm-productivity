import { Gauge, Trophy } from 'lucide-react';
import { DueChip } from '../blocks/BlockFace';
import './KrFace.css';

// The face of a key result — the measure itself: status, deadline countdown, the title,
// the number (now / target) with a progress bar, and the pace needed. Shared by the key
// result cards (project page) and the live preview in the key-result editor.

export const KR_STATUS = {
  on_track: { label: 'On track', tone: 'good' },
  at_risk: { label: 'At risk', tone: 'warn' },
  off_track: { label: 'Off track', tone: 'bad' },
  stalled: { label: 'Stalled', tone: 'warn' },
  overdue: { label: 'Overdue', tone: 'bad' },
  done: { label: 'Reached', tone: 'good' },
  no_deadline: { label: 'No deadline', tone: 'info' },
  no_target: { label: 'No target', tone: 'info' },
};

const num = (n) => {
  if (n == null || !Number.isFinite(Number(n))) return '—';
  const v = Number(n);
  return Math.abs(v) >= 100 ? String(Math.round(v)) : String(Math.round(v * 100) / 100);
};

// A plain pace read when there's no forecast yet (the editor preview): what's left ÷ weeks left.
export function neededPerWeek(current, target, dueDays) {
  if (!(target > 0) || dueDays == null || dueDays <= 0) return null;
  const left = Math.max(0, target - (current || 0));
  return left === 0 ? 0 : left / Math.max(dueDays / 7, 1 / 7);
}

// number: 1-based (or a word); status: a forecast status key; pace: { need, rate } per week.
export function KrFace({ number, title, placeholder = 'Name what you will measure', current, target, unit, due, status, pace, done, tools, onTitleClick }) {
  const hasTarget = Number(target) > 0;
  const cur = Number(current) || 0;
  const pct = hasTarget ? Math.max(0, Math.min(100, Math.round((cur / Number(target)) * 100))) : 0;
  const st = done ? KR_STATUS.done : KR_STATUS[status] || null;
  const no = typeof number === 'number' ? String(number).padStart(2, '0') : number;
  const empty = !(title && title.trim());
  return (
    <div className={`krf ${st ? `tone-${st.tone}` : 'tone-none'} ${done ? 'is-done' : ''}`}>
      <div className="krf-top">
        <span className="krf-no">{done ? <Trophy size={12} /> : <span className="krf-dot" />}{no ? <>KR <b>{no}</b></> : 'Key result'}</span>
        {st && !done && <span className={`krf-status tone-${st.tone}`}>{st.label}</span>}
        <span className="krf-tools">{tools}</span>
      </div>
      {onTitleClick
        ? <button type="button" className={`krf-title ${empty ? 'is-empty' : ''}`} onClick={onTitleClick} title="Open key result">{empty ? placeholder : title}</button>
        : <div className={`krf-title ${empty ? 'is-empty' : ''}`}>{empty ? placeholder : title}</div>}
      <div className="krf-figure">
        <span className="krf-now"><b>{hasTarget ? num(cur) : '—'}</b><span>{hasTarget ? `/ ${num(target)}${unit ? ` ${unit}` : ''}` : 'set a target to measure'}</span></span>
        {hasTarget && <span className="krf-pct">{pct}%</span>}
      </div>
      <div className="krf-bar" aria-hidden="true"><i style={{ width: `${pct}%` }} /></div>
      {(due || (pace && pace.need != null && !done)) && (
        <div className="krf-meta">
          <DueChip due={due} />
          {pace && pace.need != null && !done && (
            <span className="krf-pace">
              <Gauge size={12} />
              {pace.need === 0 ? 'Target reached' : <>needs <b>{num(pace.need)}/wk</b>{pace.rate != null && <> · you're at <b className={pace.rate >= pace.need ? 'up' : 'down'}>{num(pace.rate)}/wk</b></>}</>}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
