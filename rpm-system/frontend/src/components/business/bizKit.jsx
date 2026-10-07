// Shared building blocks for the Business pages: a list hook, the generic row editor (modal),
// the empty state with "Start from template", and small row parts.
import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Pencil, Trash2, Plus, Wand2 } from 'lucide-react';
import { AuthContext } from '../../App';
import { useToast } from '../ToastProvider';
import ModalHead from '../modals/ModalHead';
import Picker from '../Picker';
import { FIELDS, SINGULAR } from './bizConfig';

export function useBizApi() {
  const { api } = useContext(AuthContext);
  const ref = useRef(api.biz);
  ref.current = api.biz;
  return ref;
}

/** Rows of one section + create/update/remove that keep the list in sync. */
export function useBizList(section) {
  const biz = useBizApi();
  const { showToast } = useToast();
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');

  const reload = useCallback(async () => {
    try { setRows(await biz.current.list(section)); setError(''); }
    catch (e) { setError(e.message); setRows((r) => r || []); }
  }, [biz, section]);
  useEffect(() => { reload(); }, [reload]);

  const fail = (e) => { showToast(e.message, 'error'); throw e; };
  const create = async (data) => {
    try { const row = await biz.current.create(section, data); await reload(); return row; } catch (e) { return fail(e); }
  };
  const update = async (id, data) => {
    try {
      const row = await biz.current.update(section, id, data);
      setRows((rs) => (rs || []).map((r) => (r.id === id ? row : r)));
      return row;
    } catch (e) { return fail(e); }
  };
  const remove = async (id) => {
    try { await biz.current.remove(section, id); setRows((rs) => (rs || []).filter((r) => r.id !== id)); } catch (e) { fail(e); }
  };
  const template = async () => {
    try { await biz.current.template(section); await reload(); showToast('Sample rows added — edit or delete them freely', 'success'); }
    catch (e) { showToast(e.message, 'error'); }
  };
  return { rows, error, reload, create, update, remove, template, setRows };
}

// ───── generic editor ─────
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
  return v;
};

export function BizEditor({ section, row, defaults = {}, icon, onSave, onClose }) {
  const fields = FIELDS[section];
  const [form, setForm] = useState(() => Object.fromEntries(fields.map((f) => [f.k, toForm(f, row ? row[f.k] : defaults[f.k] ?? (f.type === 'enum' ? f.options[0].value : undefined))])));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const set = (k, v) => setForm((s) => ({ ...s, [k]: v }));

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
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

  const noun = SINGULAR[section] || 'item';
  return (
    <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <form className="modal biz-modal" onSubmit={submit} role="dialog" aria-modal="true" aria-label={row ? `Edit ${noun}` : `New ${noun}`}>
        <ModalHead icon={icon} title={row ? `Edit ${noun}` : `New ${noun}`} subtitle="Only you can see this." onClose={onClose} />
        <div className="modal-body mk-body">
          <div className="mk-grid mk-grid-2">
            {fields.map((f) => (
              <div key={f.k} className={`mk-field ${f.wide ? 'biz-wide' : ''}`}>
                <label className="form-label" htmlFor={`biz-${f.k}`}>{f.label}{!f.required && f.type !== 'bool' && <span className="mk-optional">optional</span>}</label>
                <FieldInput f={f} value={form[f.k]} onChange={(v) => set(f.k, v)} />
                {f.hint && <p className="mk-help">{f.hint}</p>}
              </div>
            ))}
          </div>
          {err && <p className="biz-err" role="alert">{err}</p>}
        </div>
        <div className="modal-footer">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
        </div>
      </form>
    </div>
  );
}

function FieldInput({ f, value, onChange }) {
  const id = `biz-${f.k}`;
  if (f.type === 'enum') return <Picker value={value} options={f.options} onChange={onChange} title={f.label} />;
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
  return <input id={id} type={f.type === 'date' ? 'date' : f.type === 'number' ? 'number' : 'text'} value={value ?? ''} onChange={(e) => onChange(e.target.value)} />;
}

// ───── empty state + section header ─────
export function BizEmpty({ icon: Icon, title, text, onTemplate, onAdd, addLabel }) {
  const [busy, setBusy] = useState(false);
  return (
    <div className="ui-empty biz-empty">
      {Icon && <Icon size={28} />}
      <b className="biz-empty-title">{title}</b>
      <p>{text}</p>
      <div className="biz-empty-actions">
        {onAdd && <button type="button" className="btn btn-primary" onClick={onAdd}><Plus size={16} /> {addLabel || 'Add'}</button>}
        {onTemplate && (
          <button type="button" className="btn btn-secondary" disabled={busy} onClick={async () => { setBusy(true); try { await onTemplate(); } finally { setBusy(false); } }}>
            <Wand2 size={16} /> {busy ? 'Adding…' : 'Start from template'}
          </button>
        )}
      </div>
    </div>
  );
}

export function SectionHead({ kicker, icon: Icon, count, children }) {
  return (
    <div className="biz-head">
      <p className="ui-kicker">{Icon && <Icon size={14} />} {kicker}{count ? <span className="ui-count"> · {count}</span> : null}</p>
      <div className="biz-head-actions">{children}</div>
    </div>
  );
}

export function RowActions({ onEdit, onDelete, label }) {
  const [confirm, setConfirm] = useState(false);
  return (
    <div className="biz-rowact">
      {onEdit && <button type="button" className="btn btn-ghost btn-icon" onClick={onEdit} aria-label={`Edit ${label}`} title="Edit"><Pencil size={15} /></button>}
      {onDelete && (confirm ? (
        <>
          <button type="button" className="btn btn-ghost biz-danger" onClick={() => { setConfirm(false); onDelete(); }}>Delete</button>
          <button type="button" className="btn btn-ghost" onClick={() => setConfirm(false)}>Keep</button>
        </>
      ) : (
        <button type="button" className="btn btn-ghost btn-icon" onClick={() => setConfirm(true)} aria-label={`Delete ${label}`} title="Delete"><Trash2 size={15} /></button>
      ))}
    </div>
  );
}

export const Bullets = ({ items, className = '' }) => (items && items.length ? (
  <ul className={`biz-bullets ${className}`}>{items.map((t, i) => <li key={i}>{t}</li>)}</ul>
) : null);

export function Loading() {
  return <div className="loading biz-loading"><div className="spinner" /></div>;
}
