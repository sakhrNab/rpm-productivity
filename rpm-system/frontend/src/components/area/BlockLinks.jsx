import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

// Glowing links between an RPM block and its tasks, drawn over the page: from each task
// row that belongs to `blockId` (in the Actions list, visible page only) to the block's
// card — or, when the card is scrolled out of view, to the block's tab in the navigator.
// Desktop only (the two columns sit side by side); recomputed on scroll/resize/paging.
export default function BlockLinks({ blockId, root, media = '(min-width: 1100px)', color = '#4ecdc4', version }) {
  const [paths, setPaths] = useState([]);

  useEffect(() => {
    if (!blockId || !root) { setPaths([]); return undefined; }
    const mq = window.matchMedia(media);
    let raf = 0;
    const calc = () => {
      raf = 0;
      if (!mq.matches) { setPaths([]); return; }
      const vh = window.innerHeight;
      const top = (parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--nav-h')) || 62) + 8;
      const card = root.querySelector(`[data-block-card="${blockId}"]`);
      const tab = root.querySelector(`[data-nav-block="${blockId}"]`);
      let target = null;
      if (card) {
        const r = card.getBoundingClientRect();
        if (r.bottom > top + 40 && r.top < vh - 40) target = { x: r.left, y: Math.min(Math.max(r.top + 56, top + 24), r.bottom - 24) };
      }
      if (!target && tab) {
        const r = tab.getBoundingClientRect();
        if (r.width) target = { x: r.left + 6, y: r.top + r.height / 2 };
      }
      if (!target) { setPaths([]); return; }
      const rows = [...root.querySelectorAll(`[data-link-row][data-block-id="${blockId}"]`)]
        .filter(el => !el.closest('.pl-page[aria-hidden="true"]'));
      const out = [];
      for (const row of rows) {
        const rr = row.getBoundingClientRect();
        if (!rr.height || rr.bottom < top || rr.top > vh) continue;
        const sx = rr.right - 2, sy = rr.top + rr.height / 2;
        const bend = Math.max(48, Math.abs(target.x - sx) * 0.55);
        out.push({ key: row.dataset.actionId, d: `M ${sx} ${sy} C ${sx + bend} ${sy}, ${target.x - bend} ${target.y}, ${target.x} ${target.y}`, sx, sy });
      }
      setPaths(out.length ? out.map(p => ({ ...p, tx: target.x, ty: target.y })) : []);
    };
    const req = () => { if (!raf) raf = requestAnimationFrame(calc); };
    req();
    // capture: also catches the paged list's own horizontal scroll (swiping pages)
    window.addEventListener('scroll', req, true);
    window.addEventListener('resize', req);
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(req) : null;
    if (ro) ro.observe(root);
    const t = setInterval(req, 700);   // cheap safety net for layout changes (expanding folds, images)
    return () => { cancelAnimationFrame(raf); window.removeEventListener('scroll', req, true); window.removeEventListener('resize', req); ro?.disconnect(); clearInterval(t); };
  }, [blockId, root, media, version]);

  if (!paths.length) return null;
  const { tx, ty } = paths[0];
  return createPortal(
    <svg className="cd-links" style={{ '--link': color }} aria-hidden="true">
      <defs>
        <linearGradient id="cd-link-grad" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor={color} stopOpacity="0.35" />
          <stop offset="1" stopColor={color} stopOpacity="1" />
        </linearGradient>
      </defs>
      {paths.map(p => (
        <g key={p.key}>
          <path className="cd-link-glow" d={p.d} />
          <path className="cd-link-line" d={p.d} stroke="url(#cd-link-grad)" />
          <path className="cd-link-flow" d={p.d} />
          <circle className="cd-link-dot" cx={p.sx} cy={p.sy} r="3.5" />
        </g>
      ))}
      <circle className="cd-link-end" cx={tx} cy={ty} r="5" />
    </svg>,
    document.body
  );
}
