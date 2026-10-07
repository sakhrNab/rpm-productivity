// Shared building blocks for the Business area: the page context (summary + undo + quick add), a list
// hook with optimistic writes, the editor modal (shared modal shell), empty states and small parts.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Plus, Wand2, Undo2, X, Trash2 } from 'lucide-react';
import { AuthContext } from '../../App';
import { useToast } from '../ToastProvider';
import ModalHead from '../modals/ModalHead';
import Picker from '../Picker';
import DatePick from './DatePick';
import { FIELDS, SINGULAR } from './bizConfig';

export function useBizApi() {
  const { api } = useContext(AuthContext);
  const ref = useRef(api.biz);
  ref.current = api.biz;
  return ref;
}

// ───── page context ─────
export const BizContext = createContext(null);
export const useBiz = () => useContext(BizContext);

/** Summary (flow, moves, agents) + a version that bumps after every write so lists and the canvas reload. */
export function useBizState() {
  const biz = useBizApi();
  const [sum, setSum] = useState(null);
  const [err, setErr] = useState('');
  const [version, setVersion] = useState(0);
  const timer = useRef(0);
  const load = useCallback(async () => {
    try { setSum(await biz.current.summary()); setErr(''); } catch (e) { setErr(e.message); }
  }, [biz]);
  useEffect(() => { load(); }, [load]);
  // Writes call changed(): the summary refreshes once, shortly after the last write.
  const changed = useCallback(({ lists = false } = {}) => {
    if (lists) setVersion((v) => v + 1);
    clearTimeout(timer.current);
    timer.current = setTimeout(load, 250);
  }, [load]);
  useEffect(() => () => clearTimeout(timer.current), []);
  return { sum, err, reloadSummary: load, changed, version };
}

// ───── undo toasts ─────
// push({ message, undo?, commit? }): `commit` runs when the toast expires (deferred deletes), `undo`
// runs instead when the person presses Undo. Pending commits flush on unmount (navigating away).
export function useUndo() {
  const [items, setItems] = useState([]);
  const pending = useRef(new Map());
  const close = useCallback((id, how) => {
    const p = pending.current.get(id);
    if (!p) return;
    pending.current.delete(id);
    clearTimeout(p.timer);
    setItems((xs) => xs.filter((x) => x.id !== id));
    const fn = how === 'undo' ? p.undo : p.commit;
    if (fn) Promise.resolve().then(fn).catch(() => {});
  }, []);
  const push = useCallback(({ message, undo, commit, ms = 6500 }) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const timer = setTimeout(() => close(id, 'commit'), ms);
    pending.current.set(id, { undo, commit, timer });
    setItems((xs) => [...xs.slice(-2), { id, message, canUndo: !!undo }]);
    return id;
  }, [close]);
  useEffect(() => () => { for (const id of [...pending.current.keys()]) close(id, 'commit'); }, [close]);
  const view = items.length ? createPortal(
    <div className="bz-undo-stack" role="region" aria-live="polite" aria-label="Recent changes">
      {items.map((t) => (
        <div key={t.id} className="bz-undo" role="status">
          <span>{t.message}</span>
          {t.canUndo && <button type="button" className="bz-undo-btn" onClick={() => close(t.id, 'undo')}><Undo2 size={14} /> Undo</button>}
          <button type="button" className="bz-undo-x" aria-label="Dismiss" onClick={() => close(t.id, 'commit')}><X size={14} /></button>
        </div>
      ))}
    </div>, document.body) : null;
  return { push, view };
}

/** Rows of one section with optimistic update / deferred delete (undo) that keep the summary fresh. */
export function useBizList(section) {
  const biz = useBizApi();
  const ctx = useBiz();
  const { showToast } = useToast();
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  const rowsRef = useRef(rows);
  rowsRef.current = rows;

  const reload = useCallback(async () => {
    try { setRows(await biz.current.list(section)); setError(''); }
    catch (e) { setError(e.message); setRows((r) => r || []); }
  }, [biz, section]);
  useEffect(() => { reload(); }, [reload, ctx?.version]);

  const create = async (data) => {
    try {
      const row = await biz.current.create(section, data);
      setRows((rs) => [...(rs || []), row]);
      ctx?.changed();
      return row;
    } catch (e) { showToast(e.message, 'error'); throw e; }
  };
  /** Optimistic: the row changes at once; on failure it snaps back. undoLabel → an Undo toast. */
  const update = async (id, data, { undoLabel } = {}) => {
    const before = (rowsRef.current || []).find((r) => r.id === id);
    setRows((rs) => (rs || []).map((r) => (r.id === id ? { ...r, ...data } : r)));
    try {
      const row = await biz.current.update(section, id, data);
      setRows((rs) => (rs || []).map((r) => (r.id === id ? row : r)));
      ctx?.changed();
      if (undoLabel && before && ctx?.undo) {
        const back = Object.fromEntries(Object.keys(data).map((k) => [k, before[k] ?? null]));
        ctx.undo.push({ message: undoLabel, undo: () => update(id, back) });
      }
      return row;
    } catch (e) {
      if (before) setRows((rs) => (rs || []).map((r) => (r.id === id ? before : r)));
      showToast(e.message, 'error');
      throw e;
    }
  };
  /** Deferred delete: the row disappears now, the server delete happens when the Undo toast expires. */
  const remove = (id, label) => {
    const before = (rowsRef.current || []).find((r) => r.id === id);
    const idx = (rowsRef.current || []).findIndex((r) => r.id === id);
    setRows((rs) => (rs || []).filter((r) => r.id !== id));
    const commit = async () => {
      try { await biz.current.remove(section, id); ctx?.changed(); }
      catch (e) { showToast(e.message, 'error'); reload(); }
    };
    if (ctx?.undo && before) {
      ctx.undo.push({
        message: `Deleted ${label ? `“${label}”` : SINGULAR[section] || 'item'}`,
        commit,
        undo: () => setRows((rs) => { const xs = [...(rs || [])]; xs.splice(Math.max(0, idx), 0, before); return xs; }),
      });
    } else commit();
  };
  const template = async () => {
    try { await biz.current.template(section); await reload(); ctx?.changed(); showToast('Sample rows added — edit or delete them freely', 'success'); }
    catch (e) { showToast(e.message, 'error'); }
  };
  return { rows, error, reload, create, update, remove, template, setRows };
}

// ───── editor (shared modal shell) ─────
const toForm = (field, v) => {
  if (field.type === 'list') return (v || []).join('\n');
  if (field.type === 'rows') return (v || []).map((o) => field.keys.map((k) => o[k] || '').join(' | ')).join('\n');
  if (field.type === 'pairs') return { ...(v || {}) };
  if (field.type === 'bool') return !!v;
  return v ?? '';
};
const fromForm = (field, v) => {
  if (field.type === 'list') return String(v || '').split('\n').map((s) => s.trim()).filter(Boolean);
  if (field.type === 'rows') {
    return String(v || '').split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
      const parts = l.split('|').map((s) => s.trim());
      return Object.fromEntries(field.keys.map((k, i) => [k, i === field.keys.length - 1 ? parts.slice(i).join(' | ') : parts[i] || '']));
    });
  }
  if (field.type === 'date') return v || null;
  if (field.optionsFrom) return v || null;
  return v;
};

export function BizEditor({ section, row, defaults = {}, icon, onSave, onClose, onDelete }) {
  const ctx = useBiz();
  const fields = FIELDS[section];
  const dyn = useMemo(() => ({
    offers: [{ value: '', label: 'No offer' }, ...((ctx?.sum?.flow?.offers) || []).map((o) => ({ value: o.id, label: o.name }))],
  }), [ctx?.sum]);
  const [form, setForm] = useState(() => Object.fromEntries(fields.map((f) => {
    const raw = row ? row[f.k] : (defaults[f.k] ?? (f.type === 'enum' && f.options ? f.options[0].value : undefined));
    return [f.k, toForm(f, raw)];
  })));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [confirmDel, setConfirmDel] = useState(false);
  const set = (k, v) => setForm((s) => ({ ...s, [k]: v }));

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !document.querySelector('.picker-menu, .dp-menu')) onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const submit = async (e) => {
    e.preventDefault();
    const missing = fields.find((f) => f.required && !String(form[f.k] || '').trim());
    if (missing) { setErr(`${missing.label} is required`); return; }
    setBusy(true); setErr('');
    try {
      await onSave(Object.fromEntries(fields.map((f) => [f.k, fromForm(f, form[f.k])])));
      onClose();
    } catch (e2) { setErr(e2.message); } finally { setBusy(false); }
  };

  // Fields render in groups: the ungrouped head (hero + short facts), then each named group.
  const groups = [];
  for (const f of fields) {
    const g = f.group || (groups.length ? groups[groups.length - 1].name : '');
    if (!groups.length || groups[groups.length - 1].name !== g) groups.push({ name: g, fields: [] });
    groups[groups.length - 1].fields.push(f);
  }
  const noun = SINGULAR[section] || 'item';
  return (
    <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <form className="modal biz-modal" onSubmit={submit} role="dialog" aria-modal="true" aria-label={row ? `Edit ${noun}` : `New ${noun}`}>
        <ModalHead icon={icon} title={row ? `Edit ${noun}` : `New ${noun}`} subtitle={row ? 'Changes save to your business cockpit.' : 'Only the name is required — fill the rest when you know it.'} onClose={onClose} />
        <div className="modal-body mk-body">
          {groups.map((g) => (
            <section key={g.name || 'head'} className="mk-section bz-ed-group">
              {g.name && <div className="mk-section-head"><p className="ui-kicker">{g.name}</p></div>}
              <div className="mk-grid mk-grid-2">
                {g.fields.map((f) => (
                  <div key={f.k} className={`mk-field ${f.wide ? 'biz-wide' : ''}`}>
                    <label className="form-label" htmlFor={`biz-${f.k}`}>{f.label}{f.required && <span className="bz-req">required</span>}</label>
                    <FieldInput f={f} value={form[f.k]} options={f.optionsFrom ? dyn[f.optionsFrom] : f.options} onChange={(v) => set(f.k, v)} autoFocus={f.hero && !row} />
                    {f.hint && <p className="mk-help">{f.hint}</p>}
                  </div>
                ))}
              </div>
            </section>
          ))}
          {err && <p className="biz-err" role="alert">{err}</p>}
        </div>
        <div className="modal-footer mk-foot">
          {row && onDelete && (confirmDel ? (
            <span className="bz-del-confirm">
              <button type="button" className="btn btn-ghost btn-danger-ghost" onClick={() => { onDelete(); onClose(); }}>Delete {noun}</button>
              <button type="button" className="btn btn-ghost" onClick={() => setConfirmDel(false)}>Keep</button>
            </span>
          ) : (
            <button type="button" className="btn btn-ghost btn-danger-ghost bz-del" onClick={() => setConfirmDel(true)}><Trash2 size={15} /> Delete</button>
          ))}
          {!row && <span className="mk-foot-note">Enter saves · Esc closes</span>}
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : row ? 'Save changes' : `Add ${noun}`}</button>
        </div>
      </form>
    </div>
  );
}

function FieldInput({ f, value, options, onChange, autoFocus }) {
  const id = `biz-${f.k}`;
  if (f.type === 'enum') return <Picker value={value ?? ''} options={options || []} onChange={onChange} title={f.label} header={f.label} />;
  if (f.type === 'date') return <DatePick id={id} value={value || null} onChange={(v) => onChange(v || '')} label={f.label} />;
  if (f.type === 'bool') {
    return (
      <div className="ui-seg biz-bool" role="radiogroup" aria-label={f.label}>
        <button type="button" role="radio" aria-checked={value === true} className={value ? 'on' : ''} onClick={() => onChange(true)}>Yes</button>
        <button type="button" role="radio" aria-checked={value === false} className={!value ? 'on' : ''} onClick={() => onChange(false)}>No</button>
      </div>
    );
  }
  if (f.type === 'pairs') {
    return (
      <div className="biz-pairs">
        {f.keys.map(([k, label]) => (
          <input key={k} id={k === f.keys[0][0] ? id : undefined} placeholder={label} aria-label={label} value={value?.[k] || ''} onChange={(e) => onChange({ ...value, [k]: e.target.value })} />
        ))}
      </div>
    );
  }
  if (f.type === 'textarea' || f.type === 'list' || f.type === 'rows') {
    return <textarea id={id} rows={f.type === 'textarea' ? 2 : 3} value={value} onChange={(e) => onChange(e.target.value)} />;
  }
  return <input id={id} className={f.hero ? 'mk-hero' : ''} autoFocus={autoFocus} type={f.type === 'number' ? 'number' : 'text'} value={value ?? ''} onChange={(e) => onChange(e.target.value)} />;
}

/** Open-editor state used by every list page. */
export function useEditor() {
  const [editing, setEditing] = useState(null); // null | 'new' | row
  return { editing, open: (r = 'new') => setEditing(r), close: () => setEditing(null) };
}
export function Editor({ section, icon, ed, list, defaults }) {
  if (!ed.editing) return null;
  const row = ed.editing === 'new' ? null : ed.editing;
  return (
    <BizEditor section={section} icon={icon} row={row} defaults={defaults} onClose={ed.close}
      onDelete={row ? () => list.remove(row.id, row.name || row.text || row.title || row.path) : undefined}
      onSave={(data) => (row ? list.update(row.id, data) : list.create(data))} />
  );
}

// ───── empty state + lens header ─────
export function BizEmpty({ icon: Icon, title, text, onTemplate, onAdd, addLabel, extra }) {
  const [busy, setBusy] = useState(false);
  return (
    <div className="bz-empty">
      <span className="bz-empty-orb" aria-hidden="true">{Icon && <Icon size={26} />}</span>
      <b className="bz-empty-title">{title}</b>
      <p>{text}</p>
      <div className="bz-empty-actions">
        {onAdd && <button type="button" className="btn btn-primary" onClick={onAdd}><Plus size={16} /> {addLabel || 'Add'}</button>}
        {onTemplate && (
          <button type="button" className="btn btn-secondary" disabled={busy} onClick={async () => { setBusy(true); try { await onTemplate(); } finally { setBusy(false); } }}>
            <Wand2 size={16} /> {busy ? 'Adding…' : 'Start from template'}
          </button>
        )}
        {extra}
      </div>
    </div>
  );
}

/** A lens header: kicker + one-line read of what this segment is doing + actions. */
export function LensHead({ icon: Icon, kicker, title, read, children }) {
  return (
    <header className="bz-lens-head">
      <div className="bz-lens-text">
        <p className="ui-kicker">{Icon && <Icon size={14} />} {kicker}</p>
        {title && <h2 className="bz-lens-title">{title}</h2>}
        {read && <p className="bz-lens-read">{read}</p>}
      </div>
      {children && <div className="bz-lens-actions">{children}</div>}
    </header>
  );
}

export const Chip = ({ tone, children, className = '', ...rest }) => <span className={`ui-chip ${tone ? `ui-chip--${tone}` : ''} ${className}`} {...rest}>{children}</span>;

export const Bullets = ({ items, className = '' }) => (items && items.length ? (
  <ul className={`biz-bullets ${className}`}>{items.map((t, i) => <li key={i}>{t}</li>)}</ul>
) : null);

export function Loading() {
  return <div className="loading biz-loading"><div className="spinner" /></div>;
}

export const AddButton = ({ onClick, label }) => (
  <button type="button" className="btn btn-secondary bz-add" onClick={onClick}><Plus size={16} /> {label}</button>
);
