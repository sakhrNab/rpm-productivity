import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import CoachPanel from './CoachPanel';
import './CoachDrawer.css';

// Right-side drawer (bottom sheet on phones) hosting the full coach experience.
// coachId → that coach's thread; otherwise scope + projectId/categoryId → setup flow.
// request: { nonce, send?, focus? } is passed through to the panel.
export default function CoachDrawer({ open, onClose, coachId, scope, projectId, categoryId, request, onCoachChange, onApplied }) {
  const asideRef = useRef(null);
  const lastFocus = useRef(null);
  const closeRef = useRef(onClose); closeRef.current = onClose;

  useEffect(() => {
    if (!open) return undefined;
    lastFocus.current = document.activeElement;
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      if (document.querySelector('.coach-mem-overlay')) return; // the memory popup closes first
      e.preventDefault();
      closeRef.current?.();
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    // Move focus into the drawer (the composer grabs it itself when asked to).
    const t = setTimeout(() => { if (!asideRef.current?.contains(document.activeElement)) asideRef.current?.focus(); }, 30);
    return () => {
      clearTimeout(t);
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      if (lastFocus.current && typeof lastFocus.current.focus === 'function') lastFocus.current.focus();
    };
  }, [open]);

  if (!open) return null;
  return createPortal(
    <div className="coach-drawer-root">
      <div className="coach-drawer-overlay" onMouseDown={onClose} aria-hidden="true" />
      <aside ref={asideRef} className="coach-drawer" role="dialog" aria-modal="true" aria-labelledby="coach-drawer-title" tabIndex={-1}>
        <CoachPanel
          key={coachId || `${scope}:${projectId || categoryId}`}
          variant="drawer"
          coachId={coachId}
          scope={scope}
          projectId={projectId}
          categoryId={categoryId}
          request={request}
          onClose={onClose}
          onCoachChange={onCoachChange}
          onApplied={onApplied}
        />
      </aside>
    </div>,
    document.body,
  );
}
