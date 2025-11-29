import { useState, useContext } from 'react';
import { X } from 'lucide-react';
import { AuthContext } from '../../App';

function CreateKeyResultModal({ onClose, onSuccess, projectId, initialData = {} }) {
  const { api } = useContext(AuthContext);
  const [formData, setFormData] = useState({
    title: initialData.title || '',
    description: initialData.description || '',
    target_value: initialData.target_value || '',
    unit: initialData.unit || '',
    target_date: initialData.target_date || '',
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
      onSuccess();
    } catch (error) {
      console.error('Failed to save key result:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '500px' }}>
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
              <input
                type="text"
                className="form-input"
                placeholder="Key result title"
                value={formData.title}
                onChange={e => setFormData({ ...formData, title: e.target.value })}
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

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div className="form-group">
                <label className="form-label">Target Value (optional)</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g., 100"
                  value={formData.target_value}
                  onChange={e => setFormData({ ...formData, target_value: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Unit (optional)</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g., kg, %, items"
                  value={formData.unit}
                  onChange={e => setFormData({ ...formData, unit: e.target.value })}
                />
              </div>
            </div>

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

