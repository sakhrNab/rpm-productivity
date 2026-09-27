import { useState, useContext } from 'react';
import { AuthContext } from '../../App';
import { FolderKanban, Compass, Target, Heart, Plus, Check } from 'lucide-react';
import CreateCategoryModal from './CreateCategoryModal';
import ModalHead from './ModalHead';
import Picker from '../Picker';
import './CreateProjectModal.css';

function CreateProjectModal({ onClose, onSuccess, categories = [], initialData = {}, onCategoriesRefresh }) {
  const { api } = useContext(AuthContext);
  const [formData, setFormData] = useState({
    name: initialData.name || '',
    ultimate_result: initialData.ultimate_result || '',
    ultimate_purpose: initialData.ultimate_purpose || '',
    category_id: initialData.category_id || '',
  });
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name.trim() || !formData.category_id) return;

    setLoading(true);
    try {
      if (initialData.id) {
        // Update existing project
        await api.updateProject(initialData.id, formData);
      } else {
        // Create new project
        await api.createProject(formData);
      }
      onSuccess();
    } catch (error) {
      console.error('Failed to save project:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCategoryCreated = async (newCategory) => {
    // Close category modal first
    setShowCategoryModal(false);
    
    // Refresh categories list and wait for it to complete
    if (onCategoriesRefresh) {
      await onCategoriesRefresh();
    }
    
    // Select the newly created category
    if (newCategory && newCategory.id) {
      setFormData(prev => ({ ...prev, category_id: newCategory.id }));
    }
  };

  const isEdit = Boolean(initialData.id);
  const NEW_CATEGORY = '__new_category__';
  const categoryOptions = [
    ...categories.map(cat => ({ value: cat.id, label: cat.name, icon: <span className="mk-dot" style={{ '--c': cat.color }} /> })),
    { value: NEW_CATEGORY, label: 'Create new category', icon: <Plus size={14} className="cpm-new-icon" />, group: categories.length ? 'New' : undefined },
  ];
  const missing = [!formData.name.trim() && 'a name', !formData.category_id && 'a category'].filter(Boolean);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal cpm-modal" onClick={e => e.stopPropagation()}>
        <ModalHead
          icon={FolderKanban}
          title={isEdit ? 'Edit project' : 'New project'}
          subtitle="Name it, then anchor it to a result and a reason."
          onClose={onClose}
        />

        <form onSubmit={handleSubmit}>
          <div className="modal-body mk-body">
            {/* Name */}
            <label className="mk-field">
              <span className="form-label">Name</span>
              <input
                type="text"
                className="form-input mk-hero"
                placeholder="Name of project"
                value={formData.name}
                onChange={e => setFormData({ ...formData, name: e.target.value })}
                autoFocus
              />
            </label>

            {/* Category */}
            <div className="mk-field">
              <span className="form-label">Category</span>
              <Picker
                value={formData.category_id}
                options={categoryOptions}
                onChange={v => {
                  if (v === NEW_CATEGORY) { setShowCategoryModal(true); return; }
                  setFormData({ ...formData, category_id: v });
                }}
                placeholder={categories.length ? 'Select category' : 'No categories yet'}
                header="Category"
              />
            </div>

            {/* The why */}
            <div className="mk-section">
              <p className="ui-kicker"><Compass size={14} /> Result &amp; purpose</p>
              <label className="mk-field">
                <span className="form-label cpm-label-result"><Target size={13} /> Ultimate result</span>
                <input
                  type="text"
                  className="form-input"
                  placeholder="What you'll gain from completing this project"
                  value={formData.ultimate_result}
                  onChange={e => setFormData({ ...formData, ultimate_result: e.target.value })}
                />
              </label>
              <label className="mk-field">
                <span className="form-label cpm-label-purpose"><Heart size={13} /> Ultimate purpose</span>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Why it matters to you"
                  value={formData.ultimate_purpose}
                  onChange={e => setFormData({ ...formData, ultimate_purpose: e.target.value })}
                />
              </label>
            </div>
          </div>

          <div className="modal-footer mk-foot">
            {missing.length > 0 && <span className="mk-foot-note">Needs {missing.join(' and ')}</span>}
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={loading || !formData.name.trim() || !formData.category_id}
            >
              <Check size={16} /> {loading ? (isEdit ? 'Updating...' : 'Creating...') : (isEdit ? 'Update project' : 'Create project')}
            </button>
          </div>
        </form>
      </div>

      {/* Create Category Modal */}
      {showCategoryModal && (
        <CreateCategoryModal
          onClose={() => setShowCategoryModal(false)}
          onSuccess={handleCategoryCreated}
        />
      )}
    </div>
  );
}

export default CreateProjectModal;
