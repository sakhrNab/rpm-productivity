// The AI writes Markdown (**bold**, # headings, lists). Channels that aren't a Markdown renderer — email,
// Telegram, web push — get it converted here instead of showing the raw ** and #.
//
// Safe by construction: the text is HTML-escaped FIRST, then only our own tags are added, and links are
// kept only for http(s) URLs. Covers what the coaches actually produce: headings, bold, italic, inline
// code, links, bullet and numbered lists, paragraphs.

const esc = (s) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Inline marks on ALREADY-ESCAPED text. kind: 'email' | 'telegram' | 'text'.
function inline(s, kind, linkStyle = '') {
  const link = (label, url) => {
    if (kind === 'text') return `${label} (${url})`;
    return `<a href="${url}"${kind === 'email' && linkStyle ? ` style="${linkStyle}"` : ''}>${label}</a>`;
  };
  let out = s
    .replace(/`([^`\n]+)`/g, (m, c) => (kind === 'text' ? c : `<code>${c}</code>`))
    .replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, (m, label, url) => link(label, url))
    .replace(/\*\*([^*\n]+?)\*\*/g, (m, b) => (kind === 'text' ? b : `<b>${b}</b>`))
    .replace(/__([^_\n]+?)__/g, (m, b) => (kind === 'text' ? b : `<b>${b}</b>`))
    .replace(/(^|[^*\w])\*(?!\s)([^*\n]+?)\*(?!\w)/g, (m, pre, i) => `${pre}${kind === 'text' ? i : `<i>${i}</i>`}`)
    .replace(/(^|[^\w])_(?!\s)([^_\n]+?)_(?!\w)/g, (m, pre, i) => `${pre}${kind === 'text' ? i : `<i>${i}</i>`}`);
  return out;
}

const HEADING = /^\s{0,3}#{1,6}\s+(.*?)\s*#*\s*$/;
const BULLET = /^\s{0,3}[-*•+]\s+(.*)$/;
const NUMBER = /^\s{0,3}(\d{1,3})[.)]\s+(.*)$/;
const RULE = /^\s{0,3}([-*_])(\s*\1){2,}\s*$/;

// Group lines into blocks: heading | ul | ol | p (consecutive plain lines join into one paragraph).
function blocks(md) {
  const out = [];
  for (const raw of String(md || '').replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.replace(/\s+$/, '');
    let m;
    if (!line.trim()) { out.push({ t: 'gap' }); continue; }
    if (RULE.test(line)) { out.push({ t: 'gap' }); continue; }
    if ((m = line.match(HEADING))) { out.push({ t: 'h', text: m[1] }); continue; }
    if ((m = line.match(BULLET))) { const last = out[out.length - 1]; if (last?.t === 'ul') last.items.push(m[1]); else out.push({ t: 'ul', items: [m[1]] }); continue; }
    if ((m = line.match(NUMBER))) { const last = out[out.length - 1]; if (last?.t === 'ol') last.items.push(m[2]); else out.push({ t: 'ol', start: Number(m[1]), items: [m[2]] }); continue; }
    const last = out[out.length - 1];
    if (last?.t === 'p') last.lines.push(line.trim()); else out.push({ t: 'p', lines: [line.trim()] });
  }
  return out.filter(b => b.t !== 'gap');
}

/** Markdown → email-safe HTML with inline styles (email clients ignore <style>). */
function toEmailHtml(md, { color = 'inherit', linkColor = '#4ecdc4' } = {}) {
  const link = `color:${linkColor};`;
  const p = `margin:0 0 12px;color:${color};`;
  return blocks(md).map(b => {
    if (b.t === 'h') return `<p style="margin:16px 0 8px;font-weight:800;font-size:15.5px;color:#ffffff;">${inline(esc(b.text), 'email', link)}</p>`;
    if (b.t === 'ul' || b.t === 'ol') {
      const tag = b.t;
      const start = b.t === 'ol' && b.start !== 1 ? ` start="${b.start}"` : '';
      return `<${tag}${start} style="margin:0 0 12px;padding-left:22px;color:${color};">${b.items.map(i => `<li style="margin:0 0 6px;">${inline(esc(i), 'email', link)}</li>`).join('')}</${tag}>`;
    }
    return `<p style="${p}">${b.lines.map(l => inline(esc(l), 'email', link)).join('<br>')}</p>`;
  }).join('');
}

/** Markdown → Telegram HTML (only b, i, code, a are allowed there; lists become bullet lines). */
function toTelegramHtml(md) {
  return blocks(md).map(b => {
    if (b.t === 'h') return `<b>${inline(esc(b.text), 'telegram')}</b>`;
    if (b.t === 'ul') return b.items.map(i => `• ${inline(esc(i), 'telegram')}`).join('\n');
    if (b.t === 'ol') return b.items.map((i, n) => `${b.start + n}. ${inline(esc(i), 'telegram')}`).join('\n');
    return b.lines.map(l => inline(esc(l), 'telegram')).join('\n');
  }).join('\n\n');
}

/** Markdown → readable plain text (email text part, push notifications). Not HTML-escaped. */
function toPlainText(md) {
  const unesc = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
  const t = (s) => unesc(inline(esc(s), 'text'));
  return blocks(md).map(b => {
    if (b.t === 'h') return t(b.text);
    if (b.t === 'ul') return b.items.map(i => `• ${t(i)}`).join('\n');
    if (b.t === 'ol') return b.items.map((i, n) => `${b.start + n}. ${t(i)}`).join('\n');
    return b.lines.map(t).join('\n');
  }).join('\n\n');
}

module.exports = { toEmailHtml, toTelegramHtml, toPlainText };
