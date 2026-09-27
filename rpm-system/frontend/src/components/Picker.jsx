import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Check } from 'lucide-react';
import './Picker.css';

// The app's one dropdown. Never use a native <select> (it renders the OS menu).
// options: [{ value, label, group?, icon?, hint? }]. The menu is portalled and
// fixed-positioned so no overflow:hidden ancestor can clip it; it flips upward
// when there isn't room below.
export default function Picker({ value, options, onChange, placeholder = 'Choose…', header, className = '', title, disabled }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const [active, setActive] = useState(-1);
  const btnRef = useRef(null);
  const menuRef = useRef(null);
  const selected = options.find(o => o.value === value);

  const place = () => {
    const r = btnRef.current?.getBoundingClientRect();
    if (!r) return;
    const maxH = 320;
    const below = window.innerHeight - r.bottom - 8;
    const up = below < Math.min(maxH, 200) && r.top > below;
    const width = Math.max(r.width, 220);
    const left = Math.min(Math.max(8, r.left), window.innerWidth - width - 8);
    setPos(up
      ? { left, width, bottom: window.innerHeight - r.top + 6, maxHeight: Math.min(maxH, r.top - 16) }
      : { left, width, top: r.bottom + 6, maxHeight: Math.min(maxH, below - 8) });
  };

  useLayoutEffect(() => { if (open) place(); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (btnRef.current?.contains(e.target) || menuRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') { setOpen(false); btnRef.current?.focus(); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); setActive(i => Math.min(options.length - 1, i + 1)); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(i => Math.max(0, i - 1)); }
      else if (e.key === 'Enter' && active >= 0) { e.preventDefault(); pick(options[active]); }
    };
    const onMove = () => place();
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', onMove);
    window.addEventListener('scroll', onMove, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onMove);
      window.removeEventListener('scroll', onMove, true);
    };
  }, [open, active, options]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (open) setActive(Math.max(0, options.findIndex(o => o.value === value)));
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (open && active >= 0) menuRef.current?.querySelector(`[data-idx="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active, open]);

  const pick = (o) => { if (!o) return; setOpen(false); if (o.value !== value) onChange(o.value); btnRef.current?.focus(); };

  let lastGroup = null;
  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className={`picker-trigger ${open ? 'open' : ''} ${className}`}
        onClick={() => !disabled && setOpen(o => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        title={title}
        disabled={disabled}
      >
        {selected?.icon && <span className="picker-icon">{selected.icon}</span>}
        <span className={`picker-value ${selected ? '' : 'placeholder'}`}>{selected ? selected.label : placeholder}</span>
        <ChevronDown size={14} className="picker-chevron" />
      </button>
      {open && pos && createPortal(
        <div ref={menuRef} className="picker-menu" role="listbox" style={pos}>
          {header && <div className="picker-header">{header}</div>}
          {options.map((o, i) => {
            const groupHead = o.group && o.group !== lastGroup ? <div key={`g-${o.group}`} className="picker-group">{o.group}</div> : null;
            lastGroup = o.group || lastGroup;
            const isSel = o.value === value;
            return [
              groupHead,
              <button
                key={o.value || `opt-${i}`}
                type="button"
                role="option"
                aria-selected={isSel}
                data-idx={i}
                className={`picker-option ${isSel ? 'selected' : ''} ${i === active ? 'active' : ''}`}
                onMouseEnter={() => setActive(i)}
                onClick={() => pick(o)}
              >
                {o.icon && <span className="picker-icon">{o.icon}</span>}
                <span className="picker-option-label">{o.label}</span>
                {o.hint && <span className="picker-hint">{o.hint}</span>}
                {isSel && <Check size={14} className="picker-check" />}
              </button>,
            ];
          })}
        </div>,
        document.body
      )}
    </>
  );
}
