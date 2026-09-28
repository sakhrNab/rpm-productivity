import { createContext, useContext, useState } from 'react';
import { createPortal } from 'react-dom';
import './PageShell.css';

// A tab page that hosts several existing pages behind one segmented switch
// (Week = My Week | Month, Plan = Areas | Projects | Roadmap). The hosted page is
// rendered with `embedded`, drops its own title/switch, and hands its create buttons
// to <ShellActions>, which portals them into this header — one row, no duplicates.
const SlotContext = createContext(null);

export function PageShell({ title, label, views, value, onChange, children }) {
  const [slot, setSlot] = useState(null);
  return (
    <div className="shell">
      <header className="shell-head">
        <h1 className="page-title shell-title">{title}</h1>
        <div className="ui-seg shell-seg" role="tablist" aria-label={label}>
          {views.map(v => (
            <button
              key={v.id}
              type="button"
              role="tab"
              aria-selected={value === v.id}
              className={value === v.id ? 'on' : ''}
              onClick={() => onChange(v.id)}
            >
              {v.icon && <v.icon size={15} />} {v.label}
            </button>
          ))}
        </div>
        <div className="shell-actions" ref={setSlot} />
      </header>
      <SlotContext.Provider value={slot}>{children}</SlotContext.Provider>
    </div>
  );
}

// Render a hosted page's header buttons in the shell's header (nothing until it mounts).
export function ShellActions({ children }) {
  const slot = useContext(SlotContext);
  return slot ? createPortal(children, slot) : null;
}
