import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { FileUp } from 'lucide-react';
import { useToast } from './ToastProvider';
import { setPendingFile, MAX_UPLOAD_BYTES } from '../utils/pendingFile';
import './GlobalFileDrop.css';

// Drop a file anywhere in the app — or on the voice orb — to turn it into a plan.
// Pages with their own drop zones (the Assistant chat, the planner) handle their drops
// first; this only takes drops nobody handled, and never lets the browser navigate away
// to show the file.
const OWN_DROP_ZONES = ['/assistant', '/import'];
const hasFiles = (e) => Array.from(e.dataTransfer?.types || []).includes('Files');

export default function GlobalFileDrop() {
  const location = useLocation();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [dragging, setDragging] = useState(false);
  const depth = useRef(0);
  const pathRef = useRef(location.pathname);
  pathRef.current = location.pathname;

  useEffect(() => {
    const end = () => { depth.current = 0; setDragging(false); document.body.classList.remove('rpm-file-drag'); };
    const onEnter = (e) => {
      if (!hasFiles(e)) return;
      depth.current += 1;
      if (depth.current === 1) { setDragging(true); document.body.classList.add('rpm-file-drag'); }
    };
    const onOver = (e) => { if (hasFiles(e)) e.preventDefault(); };      // allow dropping (and stop the browser opening the file)
    const onLeave = (e) => { if (!hasFiles(e)) return; depth.current = Math.max(0, depth.current - 1); if (!depth.current) end(); };
    const onDrop = (e) => {
      if (!hasFiles(e)) return;
      const handled = e.defaultPrevented;                                   // a page's own drop zone took it
      e.preventDefault();
      end();
      if (handled) return;
      const file = e.dataTransfer.files?.[0];
      if (!file) return;
      if (file.size > MAX_UPLOAD_BYTES) { showToast('That file is over 10 MB.', 'error'); return; }
      if (pathRef.current === '/import') { window.dispatchEvent(new CustomEvent('rpm:plan-file', { detail: file })); return; }
      setPendingFile(file);
      navigate('/import');
    };
    window.addEventListener('dragenter', onEnter);
    window.addEventListener('dragover', onOver);
    window.addEventListener('dragleave', onLeave);
    window.addEventListener('drop', onDrop);
    window.addEventListener('dragend', end);
    return () => {
      window.removeEventListener('dragenter', onEnter);
      window.removeEventListener('dragover', onOver);
      window.removeEventListener('dragleave', onLeave);
      window.removeEventListener('drop', onDrop);
      window.removeEventListener('dragend', end);
      document.body.classList.remove('rpm-file-drag');
    };
  }, [navigate, showToast]);

  if (!dragging || OWN_DROP_ZONES.includes(location.pathname)) return null;
  return (
    <div className="gfd" aria-hidden="true">
      <div className="gfd-card">
        <FileUp size={34} />
        <b>Drop to turn it into a plan</b>
        <span>A brief, notes, a spreadsheet, a PDF — I’ll place it in your projects and schedule the work.</span>
      </div>
    </div>
  );
}
