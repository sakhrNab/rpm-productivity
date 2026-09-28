import { Flag, Target, Trophy } from 'lucide-react';
import './BlockFace.css';

// The face of an RPM block — a category-lit header band carrying the block number, the
// deadline countdown and the RESULT as the headline, with a progress ring sitting on the
// band's edge. Shared by the block card (project page) and the live preview in the block
// editor, so what you build in the editor is exactly what the card shows.

export function dueInfo(target, { done = false, late = false } = {}) {
  const key = target ? String(target).slice(0, 10) : '';
  if (!key) return null;
  const [y, m, d] = key.split('-').map(Number);
  const now = new Date();
  const days = Math.round((new Date(y, m - 1, d) - new Date(now.getFullYear(), now.getMonth(), now.getDate())) / 86400000);
  const tone = done ? 'good' : (late || days < 0) ? 'bad' : days <= 7 ? 'warn' : 'info';
  const label = done ? 'Hit' : days === 0 ? 'Due today' : days === 1 ? 'Due tomorrow'
    : days > 1 ? `${days} days left` : days === -1 ? '1 day late' : `${-days} days late`;
  const dt = new Date(y, m - 1, d);
  const opts = { month: 'short', day: 'numeric' };
  if (dt.getFullYear() !== now.getFullYear()) opts.year = 'numeric';
  return { key, days, tone, label, short: dt.toLocaleDateString('en-US', opts) };
}

export function BlockRing({ pct = 0, done = 0, total = 0 }) {
  const has = total > 0;
  return (
    <span className={`bk-ring ${has && pct >= 100 ? 'is-done' : ''}`} role="img" aria-label={has ? `${done} of ${total} actions done` : 'No actions yet'}>
      <svg viewBox="0 0 48 48" aria-hidden="true">
        <circle className="bk-ring-bg" cx="24" cy="24" r="20" />
        <circle className="bk-ring-fg" cx="24" cy="24" r="20" pathLength="100" strokeDasharray="100" strokeDashoffset={100 - (has ? pct : 0)} />
      </svg>
      <span className="bk-ring-val">{has ? <>{pct}<i>%</i></> : '—'}</span>
    </span>
  );
}

export function DueChip({ due }) {
  if (!due) return null;
  return (
    <span className={`bk-due tone-${due.tone}`} title={`Deadline · ${due.short}`}>
      {due.tone === 'good' ? <Trophy size={12} /> : <Flag size={12} />}
      <span>{due.label}</span>
      <b>{due.short}</b>
    </span>
  );
}

// number: 1-based block number (or a word like "New"); lead: extra element before it (drag grip);
// tools: elements on the right (menu); onResultClick makes the headline a button.
export function BlockBand({ number, result, placeholder = 'Name the result', onResultClick, due, progress, lead, tools, kicker }) {
  const no = typeof number === 'number' ? String(number).padStart(2, '0') : number;
  const title = result && result.trim() ? result : placeholder;
  const empty = !(result && result.trim());
  return (
    <header className={`bk-band ${due ? `tone-${due.tone}` : ''}`}>
      {no && <span className="bk-band-art" aria-hidden="true"><span className="bk-watermark">{no}</span></span>}
      <div className="bk-band-top">
        <span className="bk-no">{lead}<span className="bk-dot" />{kicker || (no ? <>Block <b>{no}</b></> : 'Block')}</span>
        <span className="bk-band-tools"><DueChip due={due} />{tools}</span>
      </div>
      <div className="bk-result">
        <span className="bk-label"><Target size={12} /> Result</span>
        {onResultClick
          ? <button type="button" className={`bk-title ${empty ? 'is-empty' : ''}`} onClick={onResultClick} title="Open this block">{title}</button>
          : <div className={`bk-title ${empty ? 'is-empty' : ''}`}>{title}</div>}
      </div>
      {progress && <BlockRing {...progress} />}
    </header>
  );
}

export function PurposeQuote({ children, placeholder }) {
  const text = typeof children === 'string' ? children.trim() : children;
  if (!text && !placeholder) return null;
  return <blockquote className={`bk-quote ${text ? '' : 'is-empty'}`}>{text || placeholder}</blockquote>;
}
