import { useState, useContext } from 'react';
import { Inbox, Check } from 'lucide-react';
import ModalHead from './ModalHead';
import { AuthContext } from '../../App';
import './CreateCaptureItemModal.css';

function CreateCaptureItemModal({ onClose, onSuccess, projectId, initialData = {} }) {
  const { api } = useContext(AuthContext);
  const [formData, setFormData] = useState({
    title: initialData.title || '',
    notes: initialData.notes || '',
  });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.title.trim()) return;

    setLoading(true);
    try {
      if (initialData.id) {
        await api.updateCaptureItem(initialData.id, {
          ...formData,
          project_id: projectId,
        });
      } else {
        await api.createCaptureItem({
          ...formData,
          project_id: projectId,
        });
      }
      onSuccess();
    } catch (error) {
      console.error('Failed to save capture item:', error);
    } finally {
      setLoading(false);
    }
  };

  const isEdit = Boolean(initialData.id);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal cci-modal" onClick={e => e.stopPropagation()}>
        <ModalHead
          icon={Inbox}
          title={isEdit ? 'Edit capture item' : 'Capture it'}
          subtitle="Park the thought now — turn it into an action when you're ready."
          onClose={onClose}
        />

        <form onSubmit={handleSubmit}>
          <div className="modal-body mk-body">
            <label className="mk-field">
              <span className="form-label">Title</span>
              <input
                type="text"
                className="form-input mk-hero"
                placeholder="What's on your mind?"
                value={formData.title}
                onChange={e => setFormData({ ...formData, title: e.target.value })}
                autoFocus
                required
              />
            </label>

            <label className="mk-field">
              <span className="form-label">Notes <span className="mk-optional">optional</span></span>
              <textarea
                className="form-input"
                placeholder="Context, links, why it matters"
                value={formData.notes}
                onChange={e => setFormData({ ...formData, notes: e.target.value })}
                rows={4}
              />
            </label>
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
              <Check size={16} /> {loading ? 'Saving...' : (isEdit ? 'Update' : 'Capture')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default CreateCaptureItemModal;

