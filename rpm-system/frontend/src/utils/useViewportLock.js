import { useEffect } from 'react';

// Full-height chat screens on a phone (the Coach hub).
//
// The hub sizes itself to the screen and scrolls its own message list, so the page behind it
// must never scroll — on iOS Safari a scrollable page lets the toolbar collapse/expand under
// your thumb and drags the sticky header and the tab bar out of place. This also follows the
// *visual* viewport: when the keyboard opens, iOS pans the page to reveal the field, which
// used to push the header off the top and leave a gap above the tab bar afterwards.
//
//   html.rpm-chat-lock  — the document can't scroll
//   --vvh / --vvt       — visual-viewport height / top offset (px), used to size the hub
//   html.rpm-kbd        — keyboard is up (the tab bar steps aside)
//   html.rpm-vv-pan     — the page was panned: shift the shell back into view
export default function useViewportLock(active = true) {
  useEffect(() => {
    if (!active) return undefined;
    const root = document.documentElement;
    const vv = window.visualViewport;
    root.classList.add('rpm-chat-lock');
    let raf = 0;
    const sync = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        if (!vv) return;
        const covered = window.innerHeight - vv.height;
        root.style.setProperty('--vvh', `${Math.round(vv.height)}px`);
        root.style.setProperty('--vvt', `${Math.round(vv.offsetTop)}px`);
        root.classList.toggle('rpm-kbd', covered > 120);          // a keyboard, not a collapsing toolbar
        root.classList.toggle('rpm-vv-pan', vv.offsetTop > 1);
        if (vv.offsetTop > 1 && covered <= 120) window.scrollTo(0, 0);
      });
    };
    sync();
    vv?.addEventListener('resize', sync);
    vv?.addEventListener('scroll', sync);
    window.addEventListener('orientationchange', sync);
    return () => {
      cancelAnimationFrame(raf);
      vv?.removeEventListener('resize', sync);
      vv?.removeEventListener('scroll', sync);
      window.removeEventListener('orientationchange', sync);
      root.classList.remove('rpm-chat-lock', 'rpm-kbd', 'rpm-vv-pan');
      root.style.removeProperty('--vvh');
      root.style.removeProperty('--vvt');
    };
  }, [active]);
}
