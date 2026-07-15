import './UsageBadge.css';

// Small inline token + estimated-cost badge shown under an AI result.
// usage = { input, output, cached, cost }
function fmtTokens(n) {
  n = Number(n) || 0;
  if (n >= 1000) return (n / 1000).toFixed(n >= 10000 ? 0 : 1) + 'k';
  return String(n);
}
export function fmtCost(c) {
  c = Number(c) || 0;
  if (c === 0) return '$0';
  if (c < 0.01) return '$' + c.toFixed(4);
  if (c < 1) return '$' + c.toFixed(3);
  return '$' + c.toFixed(2);
}

export default function UsageBadge({ usage, className = '' }) {
  if (!usage || (usage.input == null && usage.output == null && usage.cost == null)) return null;
  const title = `Input ${usage.input || 0} tokens${usage.cached ? ` (${usage.cached} cached)` : ''} · Output ${usage.output || 0} tokens · Estimated cost ${fmtCost(usage.cost)}`;
  return (
    <span className={`usage-badge ${className}`} title={title}>
      <span className="usage-part">↑ {fmtTokens(usage.input)}</span>
      <span className="usage-part">↓ {fmtTokens(usage.output)}</span>
      {usage.cached ? <span className="usage-part usage-cached">⚡{fmtTokens(usage.cached)}</span> : null}
      <span className="usage-cost">~{fmtCost(usage.cost)}</span>
    </span>
  );
}
