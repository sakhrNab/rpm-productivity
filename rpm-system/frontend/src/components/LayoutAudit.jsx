import { useEffect, useState } from 'react';

// Dev-only layout invariant, rendered inside a page root (e.g. Business). After the page settles it checks
// every element under `selector` and outlines + counts:
//  1. clipped text — a leaf element or form field whose content is wider than its box while the box clips
//     (overflow not visible), unless it deliberately ellipsizes AND carries a title with the full text;
//  2. right-edge clipping — anything whose box runs past the viewport's right edge, unless it sits inside a
//     horizontal scroller (then it must be reachable by scrolling, which is intended).
// A red badge shows the count, so a static screenshot doubles as the check. Production builds render nothing.
export default function LayoutAudit({ selector = '.biz-page', delay = 2000, version }) {
  const [issues, setIssues] = useState([]);
  useEffect(() => {
    if (!import.meta.env.DEV) return undefined;
    let t = 0;
    const run = () => {
      const root = document.querySelector(selector);
      if (!root) return;
      root.querySelectorAll('[data-layout-issue]').forEach((el) => el.removeAttribute('data-layout-issue'));
      const W = document.documentElement.clientWidth;
      const found = [];
      const inScroller = (el) => { for (let p = el.parentElement; p && p !== root; p = p.parentElement) { const o = getComputedStyle(p).overflowX; if (o === 'auto' || o === 'scroll') return true; } return false; };
      for (const el of root.querySelectorAll('*')) {
        if (el.closest('.ui-links, svg, .modal-overlay:not(:has(.modal))')) continue;
        const cs = getComputedStyle(el);
        if (cs.display === 'none' || cs.visibility === 'hidden') continue;
        const r = el.getBoundingClientRect();
        if (!r.width || !r.height) continue;
        if (r.right > W + 1 && cs.position !== 'fixed' && !inScroller(el)) { found.push({ el, why: 'past the right edge' }); continue; }
        const field = el.tagName === 'INPUT' && !['checkbox', 'radio', 'number'].includes(el.type);
        const leaf = field || el.tagName === 'TEXTAREA' || (!el.children.length && el.textContent.trim());
        if (!leaf) continue;
        const clips = field || cs.overflowX !== 'visible';
        const wide = el.scrollWidth > el.clientWidth + 1;
        const okEllipsis = cs.textOverflow === 'ellipsis' && (el.title || el.closest('[title]'));
        if (clips && wide && !okEllipsis && !cs.webkitLineClamp?.match?.(/^\d/)) found.push({ el, why: 'text clipped' });
      }
      for (const f of found) f.el.setAttribute('data-layout-issue', f.why);
      setIssues(found.map((f) => `${f.why}: ${(f.el.value || f.el.textContent || f.el.className || f.el.tagName).toString().trim().slice(0, 40)}`));
    };
    const req = () => { clearTimeout(t); t = setTimeout(run, delay); };
    req();
    window.addEventListener('resize', req);
    return () => { clearTimeout(t); window.removeEventListener('resize', req); };
  }, [selector, delay, version]);
  if (!import.meta.env.DEV || !issues.length) return null;
  return <div className="ui-layout-audit" role="status" title={issues.join('\n')}>{issues.length} layout issue{issues.length === 1 ? '' : 's'}</div>;
}
