import { useState, useContext, useRef, useEffect } from 'react';
import { Trophy, Gauge, CalendarDays, Check } from 'lucide-react';
import ModalHead from './ModalHead';
import { AuthContext } from '../../App';
import { useToast } from '../ToastProvider';
import './CreateKeyResultModal.css';

// Grow a textarea to fit its content (cross-browser; field-sizing is Chromium-only)
const autoGrow = (el) => {
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = `${el.scrollHeight}px`;
};

function CreateKeyResultModal({ onClose, onSuccess, projectId, initialData = {} }) {
  const { api } = useContext(AuthContext);
  const { showToast } = useToast();
  const titleRef = useRef(null);
  useEffect(() => { autoGrow(titleRef.current); }, []);
  const [formData, setFormData] = useState({
    title: initialData.title || '',
    description: initialData.description || '',
    target_value: initialData.target_value ?? '',
    current_value: initialData.current_value ?? '',
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
  // Live preview of the card's progress bar (current ÷ target) — presentational only.
  const cur = parseFloat(formData.current_value);
  const tgt = parseFloat(formData.target_value);
  const hasMeasure = Number.isFinite(tgt) && tgt > 0;
  const pct = hasMeasure ? Math.max(0, Math.min(100, Math.round(((Number.isFinite(cur) ? cur : 0) / tgt) * 100))) : 0;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal ckr-modal" onClick={e => e.stopPropagation()}>
        <ModalHead
          icon={Trophy}
          title={isEdit ? 'Edit key result' : 'New key result'}
          subtitle="A measurable finish line for this project."
          onClose={onClose}
        />

        <form onSubmit={handleSubmit}>
          <div className="modal-body mk-body">
            <label className="mk-field">
              <span className="form-label">Title</span>
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
              <span className="form-label">Description <span className="mk-optional">optional</span></span>
              <textarea
                className="form-input"
                placeholder="How you'll measure it, what counts"
                value={formData.description}
                onChange={e => setFormData({ ...formData, description: e.target.value })}
                rows={3}
              />
            </label>

            <div className="mk-section">
              <p className="ui-kicker"><Gauge size={14} /> Measure</p>
              <div className="mk-grid ckr-measure">
                <label className="mk-field">
                  <span className="form-label">Current</span>
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
                <label className="mk-field">
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
              <div className={`ckr-preview ${hasMeasure ? '' : 'is-empty'}`}>
                <div className="ckr-preview-row">
                  <span className="ckr-preview-val">
                    {hasMeasure
                      ? <>{Number.isFinite(cur) ? cur : 0} <i>/</i> {tgt}{formData.unit ? ` ${formData.unit}` : ''}</>
                      : 'Set a target to see progress'}
                  </span>
                  {hasMeasure && <b className="ckr-preview-pct">{pct}%</b>}
                </div>
                <div className="ui-meter"><i style={{ '--pct': `${pct}%` }} /></div>
              </div>
              <p className="mk-help">Progress fills as <strong>current ÷ target</strong>. Update “Current” here or with the ± control on the card.</p>
            </div>

            <div className="mk-section">
              <p className="ui-kicker"><CalendarDays size={14} /> Deadline</p>
              <label className="mk-field">
                <span className="form-label">Target date <span className="mk-optional">optional</span></span>
                <input
                  type="date"
                  className="form-input ckr-date"
                  value={formData.target_date}
                  onChange={e => setFormData({ ...formData, target_date: e.target.value })}
                />
              </label>
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

