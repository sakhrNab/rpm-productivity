import { useState, useContext, useRef } from 'react';
import { X, Upload, Link as LinkIcon, ImagePlus } from 'lucide-react';
import { AuthContext } from '../../App';
import './CreateInspirationModal.css';

function CreateInspirationModal({ onClose, onSuccess, projectId, initialData = {} }) {
  const { api } = useContext(AuthContext);
  const isEditing = Boolean(initialData.id);
  const [formData, setFormData] = useState({
    title: initialData.title || '',
    description: initialData.description || '',
    image_url: initialData.image_url || '',
    link_url: initialData.link_url || '',
  });
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(false);
  const fileRef = useRef(null);

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploading(true);
    try {
      const { url } = await api.uploadImage(file);
      if (url) setFormData(f => ({ ...f, image_url: url }));
    } catch (err) {
      console.error('Failed to upload image:', err);
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (isEditing) await api.updateInspirationItem(initialData.id, formData);
      else await api.createInspirationItem({ ...formData, project_id: projectId });
      onSuccess();
    } catch (err) {
      console.error('Failed to save inspiration item:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal insp-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">{isEditing ? 'Edit inspiration' : 'Add inspiration'}</h3>
          <button type="button" className="btn btn-icon btn-ghost" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            {/* Visual drop zone / preview */}
            <button
              type="button"
              className={`insp-dropzone ${formData.image_url ? 'has-image' : ''}`}
              onClick={() => fileRef.current?.click()}
              style={formData.image_url ? { backgroundImage: `url(${formData.image_url})` } : undefined}
            >
              {!formData.image_url && (
                <div className="insp-dropzone-empty">
                  <ImagePlus size={28} />
                  <span>{uploading ? 'Uploading…' : 'Click to upload an image'}</span>
                  <small>or paste an image URL below</small>
                </div>
              )}
              {formData.image_url && (
                <div className="insp-dropzone-overlay">
                  <Upload size={18} /> Replace
                </div>
              )}
            </button>
            <input ref={fileRef} type="file" accept="image/*" className="insp-file" onChange={handleUpload} />

            <div className="form-group">
              <label className="form-label">Image URL</label>
              <input
                type="url"
                className="form-input"
                placeholder="https://…"
                value={formData.image_url}
                onChange={e => setFormData({ ...formData, image_url: e.target.value })}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Title</label>
              <input
                type="text"
                className="form-input"
                placeholder="What is this?"
                value={formData.title}
                onChange={e => setFormData({ ...formData, title: e.target.value })}
                autoFocus
              />
            </div>

            <div className="form-group">
              <label className="form-label">Note</label>
              <textarea
                className="form-input"
                placeholder="Why does this inspire the project?"
                value={formData.description}
                onChange={e => setFormData({ ...formData, description: e.target.value })}
                rows={3}
              />
            </div>

            <div className="form-group">
              <label className="form-label"><LinkIcon size={13} /> Link (optional)</label>
              <input
                type="url"
                className="form-input"
                placeholder="https://…"
                value={formData.link_url}
                onChange={e => setFormData({ ...formData, link_url: e.target.value })}
              />
            </div>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={loading || uploading}>
              {loading ? 'Saving…' : (isEditing ? 'Save' : 'Add to board')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default CreateInspirationModal;
