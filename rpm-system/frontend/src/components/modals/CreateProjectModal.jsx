import { useState } from 'react';
import { api } from '../../App';

function CreateProjectModal({ onClose, onSuccess, categories }) {
  const [formData, setFormData] = useState({
    name: '',
    ultimate_result: '',
    ultimate_purpose: '',
    category_id: '',
  });
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name.trim() || !formData.category_id) return;

    setLoading(true);
    try {
      await api.createProject(formData);
      onSuccess();
    } catch (error) {
      console.error('Failed to create project:', error);
    } finally {
      setLoading(false);
    }
  };

  const selectedCategory = categories.find(c => c.id === formData.category_id);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">Create a new Project</h3>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            {/* Name */}
            <div className="form-group">
              <label className="form-label">NAME</label>
              <input
                type="text"
                className="form-input"
                placeholder="Name of Project"
                value={formData.name}
                onChange={e => setFormData({ ...formData, name: e.target.value })}
                autoFocus
                style={{ 
                  fontSize: '1.25rem',
                  background: 'transparent',
                  border: 'none',
                  borderBottom: '1px solid var(--accent-cyan)',
                  borderRadius: 0,
                  padding: '12px 0'
                }}
              />
            </div>

            {/* Ultimate Result */}
            <div className="form-group">
              <label className="form-label">ULTIMATE RESULT</label>
              <input
                type="text"
                className="form-input"
                placeholder="What you'll gain from completing this Project"
                value={formData.ultimate_result}
                onChange={e => setFormData({ ...formData, ultimate_result: e.target.value })}
                style={{ 
                  fontSize: '1rem',
                  background: 'transparent',
                  border: 'none',
                  borderBottom: '1px solid var(--border-primary)',
                  borderRadius: 0,
                  padding: '12px 0',
                  color: 'var(--text-secondary)'
                }}
              />
            </div>

            {/* Ultimate Purpose */}
            <div className="form-group">
              <label className="form-label">ULTIMATE PURPOSE</label>
              <input
                type="text"
                className="form-input"
                placeholder="Ultimate purpose for completing this Project"
                value={formData.ultimate_purpose}
                onChange={e => setFormData({ ...formData, ultimate_purpose: e.target.value })}
                style={{ 
                  fontSize: '1rem',
                  background: 'transparent',
                  border: 'none',
                  borderBottom: '1px solid var(--border-primary)',
                  borderRadius: 0,
                  padding: '12px 0',
                  color: 'var(--text-secondary)'
                }}
              />
            </div>

            {/* Category */}
            <div className="form-group">
              <label className="form-label">CHOOSE CATEGORY</label>
              <div className="dropdown" style={{ position: 'relative' }}>
                <button
                  type="button"
                  className="dropdown-trigger"
                  onClick={() => setShowCategoryDropdown(!showCategoryDropdown)}
                  style={{ 
                    width: '200px',
                    justifyContent: 'flex-start',
                    background: selectedCategory ? selectedCategory.color + '10' : 'var(--bg-card)'
                  }}
                >
                  {selectedCategory && (
                    <span style={{ 
                      width: 16, 
                      height: 16, 
                      borderRadius: '4px', 
                      background: selectedCategory.color,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '10px'
                    }}>
                      ≡
                    </span>
                  )}
                  <span>{selectedCategory?.name || 'Select Category'}</span>
                </button>
                {showCategoryDropdown && (
                  <div className="dropdown-menu" style={{ minWidth: '250px' }}>
                    {categories.map(cat => (
                      <div
                        key={cat.id}
                        className="dropdown-item"
                        onClick={() => {
                          setFormData({ ...formData, category_id: cat.id });
                          setShowCategoryDropdown(false);
                        }}
                      >
                        <span style={{ 
                          width: 16, 
                          height: 16, 
                          borderRadius: '4px', 
                          background: cat.color,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '10px'
                        }}>
                          ≡
                        </span>
                        {cat.name}
                      </div>
                    ))}
                    <div 
                      className="dropdown-item" 
                      style={{ 
                        borderTop: '1px solid var(--border-primary)',
                        color: 'var(--accent-pink)'
                      }}
                    >
                      + Create new category
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button 
              type="submit" 
              className="btn btn-primary" 
              disabled={loading || !formData.name.trim() || !formData.category_id}
            >
              {loading ? 'Creating...' : 'Create Project'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default CreateProjectModal;
