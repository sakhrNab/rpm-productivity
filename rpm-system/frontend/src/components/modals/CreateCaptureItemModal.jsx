import { useState, useContext } from 'react';
import { X } from 'lucide-react';
import { AuthContext } from '../../App';

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

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '500px' }}>
        <div className="modal-header">
          <h3 className="modal-title">{initialData.id ? 'Edit Capture Item' : 'Add Capture Item'}</h3>
          <button type="button" className="btn btn-icon btn-ghost" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <div className="form-group">
              <label className="form-label">Title</label>
              <input
                type="text"
                className="form-input"
                placeholder="Capture item title"
                value={formData.title}
                onChange={e => setFormData({ ...formData, title: e.target.value })}
                autoFocus
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">Notes (optional)</label>
              <textarea
                className="form-input"
                placeholder="Additional notes"
                value={formData.notes}
                onChange={e => setFormData({ ...formData, notes: e.target.value })}
                rows={4}
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

export default CreateCaptureItemModal;

