import { useState, useContext, useRef, useEffect } from 'react';
import { Trophy, Gauge, CalendarClock, Check, Target, AlignLeft } from 'lucide-react';
import ModalHead from './ModalHead';
import { AuthContext } from '../../App';
import { useToast } from '../ToastProvider';
import { KrFace, neededPerWeek } from '../keyresults/KrFace';
import { dueInfo } from '../blocks/BlockFace';
import './CreateKeyResultModal.css';

// Grow a textarea to fit its content (cross-browser; field-sizing is Chromium-only)
const autoGrow = (el) => {
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = `${el.scrollHeight}px`;
};

// Quick deadline picks (they only set the date field).
const isoDay = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const plusDays = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return isoDay(d); };
const DUE_PICKS = [
  { label: '30 days', value: () => plusDays(30) },
  { label: '90 days', value: () => plusDays(90) },
  { label: 'End of quarter', value: () => { const d = new Date(); const q = Math.floor(d.getMonth() / 3); return isoDay(new Date(d.getFullYear(), q * 3 + 3, 0)); } },
  { label: 'End of year', value: () => isoDay(new Date(new Date().getFullYear(), 11, 31)) },
];
const UNIT_PICKS = ['%', 'customers', '$', 'kg', 'items', 'hours'];
// The API returns numerics as "6.00" — show them as plain numbers (6), same value.
const numStr = (v) => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? (v ?? '') : String(Number(v)));

function CreateKeyResultModal({ onClose, onSuccess, projectId, initialData = {} }) {
  const { api } = useContext(AuthContext);
  const { showToast } = useToast();
  const titleRef = useRef(null);
  useEffect(() => { autoGrow(titleRef.current); }, []);
  const [formData, setFormData] = useState({
    title: initialData.title || '',
    description: initialData.description || '',
    target_value: numStr(initialData.target_value),
    current_value: numStr(initialData.current_value),
    unit: initialData.unit || '',
    // A <input type="date"> needs "yyyy-MM-dd"; the API returns a full ISO
    // timestamp (e.g. 2026-09-30T00:00:00.000Z), so keep just the date part.
    target_date: initialData.target_date ? String(initialData.target_date).slice(0, 10) : '',
  });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.title.trim()) return;

    setLoading(true);
    try {
      if (initialData.id) {
        await api.updateKeyResult(initialData.id, {
          ...formData,
          project_id: projectId,
        });
      } else {
        await api.createKeyResult({
          ...formData,
          project_id: projectId,
        });
      }
      showToast(initialData.id ? 'Key result updated.' : 'Key result added.', 'success');
      onSuccess();
    } catch (error) {
      console.error('Failed to save key result:', error);
      showToast('Could not save this key result. Please try again.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const isEdit = Boolean(initialData.id);
  // Live preview — the real key result card face, fed by the form (presentational only).
  const cur = parseFloat(formData.current_value);
  const tgt = parseFloat(formData.target_value);
  const hasMeasure = Number.isFinite(tgt) && tgt > 0;
  const curN = Number.isFinite(cur) ? cur : 0;
  const reached = hasMeasure && curN >= tgt;
  const due = dueInfo(formData.target_date, { done: reached });
  const need = hasMeasure ? neededPerWeek(curN, tgt, due?.days) : null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal ckr-modal" onClick={e => e.stopPropagation()}>
        <ModalHead
          icon={Trophy}
          title={isEdit ? 'Edit key result' : 'New key result'}
          subtitle="A measurable finish line for this project. The card on the left is what you'll get."
          onClose={onClose}
        />

        <form onSubmit={handleSubmit}>
          <div className="modal-body mk-body ckr-body">
            {/* Live preview of the key result card */}
            <aside className="ckr-preview" aria-label="Live preview of the key result card">
              <p className="ckr-preview-label"><span className="ckr-live" /> Live preview</p>
              <div className="ckr-card">
                <KrFace
                  number=""
                  title={formData.title}
                  placeholder="What you'll measure appears here"
                  current={curN}
                  target={hasMeasure ? tgt : null}
                  unit={formData.unit}
                  due={due}
                  pace={need != null ? { need } : null}
                  done={reached}
                />
                {formData.description.trim() && <p className="ckr-card-desc">{formData.description}</p>}
              </div>
              <p className="ckr-preview-help">
                {hasMeasure
                  ? (need == null ? 'Add a deadline to see the pace you need.' : need === 0 ? 'Target reached — nice.' : `To hit it on time you need about ${Math.round(need * 100) / 100} ${formData.unit || 'units'} a week.`)
                  : 'Set a target to see progress and pace.'}
              </p>
            </aside>

            <div className="ckr-steps">
              {/* 1 — what */}
              <section className="ckr-step">
                <span className="ckr-step-no" aria-hidden="true">1</span>
                <div className="ckr-step-main">
                  <label className="mk-field">
                    <span className="form-label"><Target size={13} /> What you'll measure</span>
                    <textarea
                      ref={titleRef}
                      className="form-input mk-hero ckr-title"
                      rows={1}
                      placeholder="e.g. 100 paying customers"
                      value={formData.title}
                      onChange={e => { setFormData({ ...formData, title: e.target.value }); autoGrow(e.target); }}
                      onKeyDown={e => { if (e.key === 'Enter') e.preventDefault(); }}
                      autoFocus
                      required
                    />
                  </label>
                  <label className="mk-field">
                    <span className="form-label"><AlignLeft size={13} /> What counts <span className="mk-optional">optional</span></span>
                    <textarea
                      className="form-input"
                      placeholder="How you'll measure it, what counts"
                      value={formData.description}
                      onChange={e => setFormData({ ...formData, description: e.target.value })}
                      rows={2}
                    />
                  </label>
                </div>
              </section>

              {/* 2 — the measure */}
              <section className="ckr-step">
                <span className="ckr-step-no" aria-hidden="true">2</span>
                <div className="ckr-step-main">
                  <span className="form-label ckr-label"><Gauge size={13} /> The measure</span>
                  <div className="ckr-measure">
                    <label className="mk-field">
                      <span className="form-label">Now</span>
                      <input
                        type="number"
                        min="0"
                        inputMode="decimal"
                        className="form-input ckr-num"
                        placeholder="0"
                        value={formData.current_value}
                        onChange={e => setFormData({ ...formData, current_value: e.target.value })}
                      />
                    </label>
                    <span className="ckr-of" aria-hidden="true">of</span>
                    <label className="mk-field">
                      <span className="form-label">Target</span>
                      <input
                        type="number"
                        min="0"
                        inputMode="decimal"
                        className="form-input ckr-num"
                        placeholder="100"
                        value={formData.target_value}
                        onChange={e => setFormData({ ...formData, target_value: e.target.value })}
                      />
                    </label>
                    <label className="mk-field ckr-unit">
                      <span className="form-label">Unit</span>
                      <input
                        type="text"
                        className="form-input"
                        placeholder="kg, %, items"
                        value={formData.unit}
                        onChange={e => setFormData({ ...formData, unit: e.target.value })}
                      />
                    </label>
                  </div>
                  <div className="ckr-picks" role="group" aria-label="Quick unit">
                    {UNIT_PICKS.map(u => (
                      <button key={u} type="button" className={`ckr-pick ${formData.unit === u ? 'on' : ''}`} onClick={() => setFormData({ ...formData, unit: u })}>{u}</button>
                    ))}
                  </div>
                  <p className="mk-help">Progress fills as <strong>now ÷ target</strong>. Update “Now” here or with the − / + on the card.</p>
                </div>
              </section>

              {/* 3 — deadline */}
              <section className="ckr-step">
                <span className="ckr-step-no" aria-hidden="true">3</span>
                <div className="ckr-step-main">
                  <span className="form-label ckr-label"><CalendarClock size={13} /> Deadline <span className="mk-optional">drives the countdown and pace</span></span>
                  <div className="ckr-due-row">
                    <input
                      type="date"
                      className="form-input ckr-date"
                      aria-label="Target date"
                      value={formData.target_date}
                      onChange={e => setFormData({ ...formData, target_date: e.target.value })}
                    />
                    <div className="ckr-picks" role="group" aria-label="Quick deadline">
                      {DUE_PICKS.map(p => {
                        const v = p.value();
                        return <button key={p.label} type="button" className={`ckr-pick due ${formData.target_date === v ? 'on' : ''}`} onClick={() => setFormData({ ...formData, target_date: v })}>{p.label}</button>;
                      })}
                    </div>
                  </div>
                </div>
              </section>
            </div>
          </div>

          <div className="modal-footer mk-foot">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={loading || !formData.title.trim()}
            >
              <Check size={16} /> {loading ? 'Saving...' : (isEdit ? 'Update' : 'Add key result')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default CreateKeyResultModal;
