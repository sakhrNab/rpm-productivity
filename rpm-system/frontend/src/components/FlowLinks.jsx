import { useEffect, useLayoutEffect, useRef, useState } from 'react';

// Glowing, animated connectors between elements inside `root` that carry data-node="<id>".
// links: [{ id, from, to, tone?, weight?, dashed?, idle?, hoverOnly? }] — hoverOnly links draw only while active
//   tone: flow (cyan→pink, default) | good | warn | bad | info | ai — colour = meaning, as everywhere in RPM
//   weight: stroke width in px (volume through the link); idle: no travelling light (nothing flowing yet)
// active: Set of link ids to light up (others dim) — or null.
// simplify: on narrow screens collapse links to the nearest [data-node-group] of each end (one trunk per
//   pair of groups, weights summed) so a stacked phone layout gets a few clean vertical wires.
// Orientation is picked per link: side-by-side ends get a horizontal S-curve, stacked ends a vertical one.
// Styling lives in styles/ui.css (.ui-links); motion stops under prefers-reduced-motion.
const TONES = {
  flow: ['#4ecdc4', '#ff69b4'], good: ['#4ecdc4', '#7ee0d8'], warn: ['#ffb74d', '#ffd08a'],
  bad: ['#ff6b81', '#ff69b4'], info: ['#9575cd', '#b9a4e8'], ai: ['#ff69b4', '#ffb3d9'], dim: ['#6b7a8f', '#a8b5c8'],
};

export function useMedia(query) {
  const get = () => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(query).matches : false);
  const [on, setOn] = useState(get);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const f = () => setOn(mq.matches);
    f();
    mq.addEventListener('change', f);
    return () => mq.removeEventListener('change', f);
  }, [query]);
  return on;
}

/** Ids of every link on a path through `nodeId` (upstream and downstream, following direction). */
export function connected(links, nodeId) {
  const hot = new Set();
  if (!nodeId) return hot;
  const walk = (start, dir) => {
    const seen = new Set([start]);
    const queue = [start];
    while (queue.length) {
      const n = queue.shift();
      for (const l of links) {
        const [a, b] = dir === 'down' ? [l.from, l.to] : [l.to, l.from];
        if (a === n) { hot.add(l.id); if (!seen.has(b)) { seen.add(b); queue.push(b); } }
      }
    }
  };
  walk(nodeId, 'down');
  walk(nodeId, 'up');
  return hot;
}

const esc = (s) => (window.CSS?.escape ? window.CSS.escape(s) : String(s).replace(/"/g, '\\"'));

export default function FlowLinks({ root, links, active = null, simplify = false, version, className = '' }) {
  const [paths, setPaths] = useState([]);
  const rafRef = useRef(0);
  const idRef = useRef(`fl${Math.random().toString(36).slice(2, 8)}`);
  const activeRef = useRef(active);
  activeRef.current = active;
  const activeKey = active ? [...active].sort().join(',') : '';

  useLayoutEffect(() => {
    if (!root) { setPaths([]); return undefined; }
    const calc = () => {
      rafRef.current = 0;
      const box = root.getBoundingClientRect();
      if (!box.width) { setPaths([]); return; }
      let list = links;
      if (simplify) {
        const merged = new Map();
        for (const l of links) {
          const a = root.querySelector(`[data-node="${esc(l.from)}"]`)?.closest('[data-node-group]')?.dataset.nodeGroup;
          const b = root.querySelector(`[data-node="${esc(l.to)}"]`)?.closest('[data-node-group]')?.dataset.nodeGroup;
          if (!a || !b || a === b) continue;
          const k = `${a}>${b}`;
          const m = merged.get(k) || { id: k, from: a, to: b, tone: l.tone, weight: 0, idle: true, group: true, members: [] };
          m.weight += l.weight || 2; m.idle = m.idle && !!l.idle; m.members.push(l.id);
          merged.set(k, m);
        }
        list = [...merged.values()].map((m) => ({ ...m, weight: Math.min(8, Math.max(2, m.weight / Math.max(1, m.members.length) + Math.log2(m.members.length + 1))) }));
      }
      const find = (id, group) => root.querySelector(group ? `[data-node-group="${esc(id)}"]` : `[data-node="${esc(id)}"]`);
      const out = [];
      for (const l of list) {
        if (l.hoverOnly && !activeRef.current?.has(l.id)) continue;
        const a = find(l.from, l.group); const b = find(l.to, l.group);
        if (!a || !b) continue;
        const ra = a.getBoundingClientRect(); const rb = b.getBoundingClientRect();
        if (!ra.width || !rb.width) continue;
        const A = { l: ra.left - box.left, r: ra.right - box.left, t: ra.top - box.top, b: ra.bottom - box.top };
        const B = { l: rb.left - box.left, r: rb.right - box.left, t: rb.top - box.top, b: rb.bottom - box.top };
        const acx = (A.l + A.r) / 2; const acy = (A.t + A.b) / 2; const bcx = (B.l + B.r) / 2; const bcy = (B.t + B.b) / 2;
        const sideBySide = A.r <= B.l - 4 || B.r <= A.l - 4;
        let d; let x1; let y1; let x2; let y2;
        if (sideBySide && (Math.abs(bcx - acx) >= Math.abs(bcy - acy) * 0.35 || !(A.b <= B.t || B.b <= A.t))) {
          const right = B.l >= A.r;
          x1 = right ? A.r : A.l; x2 = right ? B.l : B.r;
          y1 = acy; y2 = bcy;
          const bend = Math.max(28, Math.abs(x2 - x1) * 0.5) * (right ? 1 : -1);
          d = `M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}`;
        } else {
          const down = B.t >= A.b - 2 || bcy > acy;
          x1 = acx; x2 = bcx; y1 = down ? A.b : A.t; y2 = down ? B.t : B.b;
          const bend = Math.max(18, Math.abs(y2 - y1) * 0.5) * (down ? 1 : -1);
          d = `M ${x1} ${y1} C ${x1} ${y1 + bend}, ${x2} ${y2 - bend}, ${x2} ${y2}`;
        }
        out.push({ ...l, d, x1, y1, x2, y2 });
      }
      setPaths(out);
    };
    const req = () => { if (!rafRef.current) rafRef.current = requestAnimationFrame(calc); };
    calc();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(req) : null;
    ro?.observe(root);
    for (const el of root.querySelectorAll('[data-node], [data-node-group]')) ro?.observe(el);
    window.addEventListener('resize', req);
    root.addEventListener('scroll', req, true);
    document.fonts?.ready?.then(req).catch(() => {});
    const t = setTimeout(req, 350);
    return () => {
      cancelAnimationFrame(rafRef.current); rafRef.current = 0;
      ro?.disconnect(); window.removeEventListener('resize', req); root.removeEventListener('scroll', req, true); clearTimeout(t);
    };
  }, [root, links, simplify, version, activeKey]);

  if (!paths.length) return null;
  const uid = idRef.current;
  const hotSet = active && active.size ? active : null;
  return (
    <svg className={`ui-links ${className}`} aria-hidden="true">
      <defs>
        {paths.map((p, i) => {
          const [c1, c2] = TONES[p.tone] || TONES.flow;
          return (
            <linearGradient key={p.id} id={`${uid}-${i}`} gradientUnits="userSpaceOnUse" x1={p.x1} y1={p.y1} x2={p.x2} y2={p.y2}>
              <stop offset="0" stopColor={c1} stopOpacity="0.55" />
              <stop offset="1" stopColor={c2} stopOpacity="1" />
            </linearGradient>
          );
        })}
      </defs>
      {paths.map((p, i) => {
        const hot = hotSet && (hotSet.has(p.id) || (p.members || []).some((m) => hotSet.has(m)));
        const cls = `${hotSet ? (hot ? 'hot' : 'dim') : ''} ${p.idle ? 'idle' : ''}`;
        const w = `${Math.max(1.5, Math.min(9, p.weight || 2))}px`;
        return (
          <g key={p.id} className={cls} style={{ '--w': w }}>
            <path className="ui-wire-glow" d={p.d} stroke={`url(#${uid}-${i})`} />
            <path className={`ui-wire ${p.dashed ? 'dashed' : ''}`} d={p.d} stroke={`url(#${uid}-${i})`} />
            <path className="ui-wire-flow" d={p.d} />
            <circle className="ui-wire-end" cx={p.x2} cy={p.y2} r="2.6" />
          </g>
        );
      })}
    </svg>
  );
}
