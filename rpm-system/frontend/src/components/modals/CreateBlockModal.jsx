import { useState, useContext, useEffect } from 'react';
import { Check } from 'lucide-react';
import { AppContext, api } from '../../App';
import CreateActionModal from './CreateActionModal';

function CreateBlockModal({ onClose, onSuccess, categories, initialData = {} }) {
  const { projects } = useContext(AppContext);
  const [formData, setFormData] = useState({
    result_title: initialData.result_title || '',
    purpose: initialData.purpose || '',
    category_id: initialData.category_id || '',
    project_id: initialData.project_id || '',
    target_date: initialData.target_date || '',
  });
  const [actions, setActions] = useState([]);
  const [selectedActions, setSelectedActions] = useState([]);
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false);
  const [showProjectDropdown, setShowProjectDropdown] = useState(false);
  const [showActionModal, setShowActionModal] = useState(false);
  const [loading, setLoading] = useState(false);

  // Load actions that don't belong to a block yet
  useEffect(() => {
    const loadActions = async () => {
      try {
        // If category_id is provided, filter by it; otherwise get all
        const params = { completed: 'false' };
        if (formData.category_id) {
          params.category_id = formData.category_id;
        }
        const data = await api.getActions(params);
        // Filter actions that don't have a block_id
        setActions(data.filter(a => !a.block_id));
      } catch (error) {
        console.error('Failed to load actions:', error);
      }
    };
    loadActions();
  }, [formData.category_id]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.result_title.trim()) return;

    setLoading(true);
    try {
      if (initialData.id) {
        // Update existing block
        await api.updateBlock(initialData.id, {
          ...formData,
          category_id: formData.category_id || null,
          project_id: formData.project_id || null,
        });
      } else {
        // Create new block
        await api.createBlock({
          ...formData,
          category_id: formData.category_id || null,
          project_id: formData.project_id || null,
          action_ids: selectedActions,
        });
      }
      onSuccess();
    } catch (error) {
      console.error('Failed to save block:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleAction = (actionId) => {
    setSelectedActions(prev => 
      prev.includes(actionId) 
        ? prev.filter(id => id !== actionId)
        : [...prev, actionId]
    );
  };

  const selectAll = () => {
    if (selectedActions.length === actions.length) {
      setSelectedActions([]);
    } else {
      setSelectedActions(actions.map(a => a.id));
    }
  };

  const handleActionCreated = async () => {
    setShowActionModal(false);
    // Reload actions list to include the newly created action
    try {
      const params = { completed: 'false' };
      if (formData.category_id) {
        params.category_id = formData.category_id;
      }
      const data = await api.getActions(params);
      setActions(data.filter(a => !a.block_id));
    } catch (error) {
      console.error('Failed to reload actions:', error);
    }
  };

  const selectedCategory = categories.find(c => c.id === formData.category_id);
  const selectedProject = projects.find(p => p.id === formData.project_id);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '700px' }}>
        <div className="modal-header" style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center' 
        }}>
          <h3 className="modal-title">{initialData.id ? 'Edit Block' : 'Create a New Block'}</h3>
          <div style={{ display: 'flex', gap: '8px' }}>
            {/* Category Dropdown */}
            <div className="dropdown" style={{ position: 'relative' }}>
              <button
                type="button"
                className="dropdown-trigger"
                onClick={() => setShowCategoryDropdown(!showCategoryDropdown)}
                style={{ 
                  background: selectedCategory ? selectedCategory.color + '20' : 'var(--accent-pink)20',
                  borderColor: selectedCategory ? selectedCategory.color : 'var(--accent-pink)',
                  color: selectedCategory ? selectedCategory.color : 'var(--accent-pink)'
                }}
              >
                <span>{selectedCategory?.name || '3 TO THRIVE'}</span>
              </button>
              {showCategoryDropdown && (
                <div className="dropdown-menu">
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
                        width: 12, 
                        height: 12, 
                        borderRadius: '50%', 
                        background: cat.color 
                      }} />
                      {cat.name}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Project Dropdown */}
            <div className="dropdown" style={{ position: 'relative' }}>
              <button
                type="button"
                className="dropdown-trigger"
                onClick={() => setShowProjectDropdown(!showProjectDropdown)}
              >
                <span>{selectedProject?.name || 'Choose Project'}</span>
              </button>
              {showProjectDropdown && (
                <div className="dropdown-menu">
                  <div
                    className="dropdown-item"
                    onClick={() => {
                      setFormData({ ...formData, project_id: '' });
                      setShowProjectDropdown(false);
                    }}
                  >
                    No Project
                  </div>
                  {projects.map(proj => (
                    <div
                      key={proj.id}
                      className="dropdown-item"
                      onClick={() => {
                        setFormData({ ...formData, project_id: proj.id });
                        setShowProjectDropdown(false);
                      }}
                    >
                      {proj.name}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            {/* Result */}
            <div className="form-group">
              <label className="form-label" style={{ color: 'var(--accent-pink)' }}>RESULT</label>
              <input
                type="text"
                className="form-input"
                placeholder="A specific, measurable outcome that you are committed to achieving"
                value={formData.result_title}
                onChange={e => setFormData({ ...formData, result_title: e.target.value })}
                style={{ 
                  fontSize: '1.25rem',
                  background: 'transparent',
                  border: 'none',
                  borderBottom: '1px solid var(--border-primary)',
                  borderRadius: 0,
                  padding: '12px 0'
                }}
              />
            </div>

            {/* Purpose */}
            <div className="form-group">
              <label className="form-label" style={{ color: 'var(--accent-pink)' }}>PURPOSE</label>
              <input
                type="text"
                className="form-input"
                placeholder="The deeper, emotional reason behind why you want to achieve this result"
                value={formData.purpose}
                onChange={e => setFormData({ ...formData, purpose: e.target.value })}
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

            {/* Add Actions to Block */}
            <div className="form-group">
              <div style={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center',
                marginBottom: '12px'
              }}>
                <label className="form-label" style={{ marginBottom: 0 }}>ADD ACTIONS TO BLOCK</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button 
                    type="button" 
                    className="btn btn-secondary"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setShowActionModal(true);
                    }}
                    style={{ fontSize: '0.8rem', padding: '4px 12px' }}
                  >
                    +
                  </button>
                  <button 
                    type="button" 
                    className="btn btn-secondary"
                    onClick={selectAll}
                    style={{ fontSize: '0.8rem', padding: '4px 12px' }}
                  >
                    Select All
                  </button>
                </div>
              </div>

              <div className="checkbox-list">
                {actions.length === 0 ? (
                  <div style={{ 
                    padding: '24px', 
                    textAlign: 'center', 
                    color: 'var(--text-muted)' 
                  }}>
                    No available actions. Create actions first.
                  </div>
                ) : (
                  actions.map(action => (
                    <div key={action.id} className="checkbox-item">
                      <div
                        className={`checkbox-input ${selectedActions.includes(action.id) ? 'checked' : ''}`}
                        onClick={() => toggleAction(action.id)}
                      >
                        {selectedActions.includes(action.id) && <Check size={12} />}
                      </div>
                      <span style={{ flex: 1 }}>{action.title}</span>
                      <div 
                        className="checkbox-input"
                        style={{ 
                          background: selectedActions.includes(action.id) ? 'var(--accent-cyan)' : 'transparent'
                        }}
                      />
                    </div>
                  ))
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
              disabled={loading || !formData.result_title.trim()}
            >
              {loading ? (initialData.id ? 'Updating...' : 'Creating...') : (initialData.id ? 'Update block' : 'Create block')}
            </button>
          </div>
        </form>
      </div>

      {/* Create Action Modal */}
      {showActionModal && categories && (
        <CreateActionModal 
          onClose={() => setShowActionModal(false)}
          onSuccess={handleActionCreated}
          categories={categories}
          initialData={{ 
            category_id: formData.category_id,
            project_id: formData.project_id || null
          }}
        />
      )}
    </div>
  );
}

export default CreateBlockModal;
