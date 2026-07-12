import { useState, useContext } from 'react';
import { AuthContext } from '../../App';
import { useToast } from '../ToastProvider';

function CreatePersonModal({ onClose, onSuccess, initialData }) {
  const { api } = useContext(AuthContext);
  const { showToast } = useToast();
  const isEditing = Boolean(initialData?.id);
  const [formData, setFormData] = useState({
    name: initialData?.name || '',
    email: initialData?.email || '',
    phone: initialData?.phone || '',
    notes: initialData?.notes || '',
  });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name.trim()) return;

    setLoading(true);
    try {
      if (isEditing) {
        await api.updatePerson(initialData.id, formData);
      } else {
        const created = await api.createPerson(formData);
        if (created?.invited) {
          showToast(`Invitation email sent to ${formData.email.trim()}.`, 'success');
        }
      }
      onSuccess();
    } catch (error) {
      console.error('Failed to save person:', error);
      showToast('Could not save this person. Please try again.', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">{isEditing ? 'Edit Person' : 'Add New Person'}</h3>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <div className="form-group">
              <label className="form-label">NAME</label>
              <input
                type="text"
                className="form-input"
                placeholder="Full name"
                value={formData.name}
                onChange={e => setFormData({ ...formData, name: e.target.value })}
                autoFocus
              />
            </div>

            <div className="form-group">
              <label className="form-label">EMAIL</label>
              <input
                type="email"
                className="form-input"
                placeholder="email@example.com"
                value={formData.email}
                onChange={e => setFormData({ ...formData, email: e.target.value })}
              />
            </div>

            <div className="form-group">
              <label className="form-label">PHONE</label>
              <input
                type="tel"
                className="form-input"
                placeholder="+1 234 567 8900"
                value={formData.phone}
                onChange={e => setFormData({ ...formData, phone: e.target.value })}
              />
            </div>

            <div className="form-group">
              <label className="form-label">NOTES</label>
              <textarea
                className="form-input"
                placeholder="Additional notes..."
                value={formData.notes}
                onChange={e => setFormData({ ...formData, notes: e.target.value })}
                rows={3}
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
              disabled={loading || !formData.name.trim()}
            >
              {loading ? 'Saving...' : (isEditing ? 'Save changes' : 'Add Person')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default CreatePersonModal;
