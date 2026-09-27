import { useState, useContext, useRef } from 'react';
import { Upload, Link as LinkIcon, ImagePlus, Image as ImageIcon, Sparkles, PenLine, Check } from 'lucide-react';
import ModalHead from './ModalHead';
import { AuthContext } from '../../App';
import { fileToCompressedDataURL } from '../../utils/image';
import { useToast } from '../ToastProvider';
import './CreateInspirationModal.css';

function CreateInspirationModal({ onClose, onSuccess, projectId, initialData = {} }) {
  const { api } = useContext(AuthContext);
  const { showToast } = useToast();
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
      const dataUrl = await fileToCompressedDataURL(file);
      setFormData(f => ({ ...f, image_url: dataUrl }));
    } catch (err) {
      console.error('Failed to process image:', err);
      showToast(err?.message || 'Could not process that image. Please try another.', 'error');
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
      showToast(isEditing ? 'Inspiration updated.' : 'Added to the board.', 'success');
      onSuccess();
    } catch (err) {
      console.error('Failed to save inspiration item:', err);
      showToast('Could not save this inspiration. Please try again.', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal insp-modal" onClick={e => e.stopPropagation()}>
        <ModalHead
          icon={Sparkles}
          title={isEditing ? 'Edit inspiration' : 'Add inspiration'}
          subtitle="Images, links and notes that keep this project's why vivid."
          onClose={onClose}
          badgeStyle={{ color: '#ff9bd0' }}
        />

        <form onSubmit={handleSubmit}>
          <div className="modal-body mk-body">
            {/* Visual drop zone / preview */}
            <div className="mk-field">
              <button
                type="button"
                className={`insp-dropzone ${formData.image_url ? 'has-image' : ''} ${uploading ? 'is-uploading' : ''}`}
                onClick={() => fileRef.current?.click()}
                style={formData.image_url ? { backgroundImage: `url(${formData.image_url})` } : undefined}
              >
                {!formData.image_url && (
                  <span className="insp-dropzone-empty">
                    <span className="insp-dropzone-icon"><ImagePlus size={24} /></span>
                    <span className="insp-dropzone-title">{uploading ? 'Uploading…' : 'Upload an image'}</span>
                    <small>Click to choose a file — or paste an image URL below</small>
                  </span>
                )}
                {formData.image_url && (
                  <span className="insp-dropzone-overlay">
                    <Upload size={16} /> Replace image
                  </span>
                )}
              </button>
              <input ref={fileRef} type="file" accept="image/*" className="insp-file" onChange={handleUpload} />
              <label className="mk-field insp-url">
                <span className="form-label"><ImageIcon size={12} /> Image URL</span>
                <input
                  type="url"
                  className="form-input"
                  placeholder="https://…"
                  value={formData.image_url}
                  onChange={e => setFormData({ ...formData, image_url: e.target.value })}
                />
              </label>
            </div>

            <div className="mk-section">
              <p className="ui-kicker"><PenLine size={14} /> Details</p>
              <label className="mk-field">
                <span className="form-label">Title</span>
                <input
                  type="text"
                  className="form-input"
                  placeholder="What is this?"
                  value={formData.title}
                  onChange={e => setFormData({ ...formData, title: e.target.value })}
                  autoFocus
                />
              </label>

              <label className="mk-field">
                <span className="form-label">Note</span>
                <textarea
                  className="form-input"
                  placeholder="Why does this inspire the project?"
                  value={formData.description}
                  onChange={e => setFormData({ ...formData, description: e.target.value })}
                  rows={3}
                />
              </label>

              <label className="mk-field">
                <span className="form-label"><LinkIcon size={12} /> Link <span className="mk-optional">optional</span></span>
                <input
                  type="url"
                  className="form-input"
                  placeholder="https://…"
                  value={formData.link_url}
                  onChange={e => setFormData({ ...formData, link_url: e.target.value })}
                />
              </label>
            </div>
          </div>

          <div className="modal-footer mk-foot">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={loading || uploading}>
              <Check size={16} /> {loading ? 'Saving…' : (isEditing ? 'Save' : 'Add to board')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default CreateInspirationModal;
