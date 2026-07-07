import { useState, useContext, useRef, useEffect } from 'react';
import { X } from 'lucide-react';
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

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal ckr-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">{initialData.id ? 'Edit Key Result' : 'Add Key Result'}</h3>
          <button type="button" className="btn btn-icon btn-ghost" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <div className="form-group">
              <label className="form-label">Title</label>
              <textarea
                ref={titleRef}
                className="form-input ckr-title"
                rows={1}
                placeholder="Key result title"
                value={formData.title}
                onChange={e => { setFormData({ ...formData, title: e.target.value }); autoGrow(e.target); }}
                onKeyDown={e => { if (e.key === 'Enter') e.preventDefault(); }}
                autoFocus
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">Description (optional)</label>
              <textarea
                className="form-input"
                placeholder="Description"
                value={formData.description}
                onChange={e => setFormData({ ...formData, description: e.target.value })}
                rows={3}
              />
            </div>

            <div className="ckr-grid ckr-grid-3">
              <div className="form-group">
                <label className="form-label">Current</label>
                <input
                  type="number"
                  min="0"
                  inputMode="decimal"
                  className="form-input"
                  placeholder="0"
                  value={formData.current_value}
                  onChange={e => setFormData({ ...formData, current_value: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Target</label>
                <input
                  type="number"
                  min="0"
                  inputMode="decimal"
                  className="form-input"
                  placeholder="100"
                  value={formData.target_value}
                  onChange={e => setFormData({ ...formData, target_value: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Unit</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="kg, %, items"
                  value={formData.unit}
                  onChange={e => setFormData({ ...formData, unit: e.target.value })}
                />
              </div>
            </div>
            <p className="ckr-hint">Progress bar fills as <strong>current ÷ target</strong>. Update “Current” here or with the ± control on the card.</p>

            <div className="form-group">
              <label className="form-label">Target Date (optional)</label>
              <input
                type="date"
                className="form-input"
                value={formData.target_date}
                onChange={e => setFormData({ ...formData, target_date: e.target.value })}
              />
            </div>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button 
              type="submit" 
              className="btn btn-primary" 
              disabled={loading || !formData.title.trim()}
            >
              {loading ? 'Saving...' : (initialData.id ? 'Update' : 'Add')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default CreateKeyResultModal;

