import { useState, useContext, useEffect } from 'react';
import { X, Clock, Star, Calendar, FolderOpen, User } from 'lucide-react';
import { AppContext, api } from '../../App';

function CreateActionModal({ onClose, onSuccess, categories, initialData = {} }) {
  const { projects, persons } = useContext(AppContext);
  const [formData, setFormData] = useState({
    title: initialData.title || '',
    notes: initialData.notes || '',
    category_id: initialData.category_id || '',
    project_id: initialData.project_id || '',
    block_id: initialData.block_id || '',
    leverage_person_id: initialData.leverage_person_id || '',
    duration_hours: initialData.duration_hours || 0,
    duration_minutes: initialData.duration_minutes || 5,
    scheduled_date: initialData.scheduled_date || '',
    is_starred: initialData.is_starred || false,
    is_this_week: initialData.is_this_week || false,
  });
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false);
  const [showProjectDropdown, setShowProjectDropdown] = useState(false);
  const [showPersonDropdown, setShowPersonDropdown] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.title.trim()) return;

    setLoading(true);
    try {
      if (initialData.id) {
        // Update existing action
        await api.updateAction(initialData.id, {
          ...formData,
          category_id: formData.category_id || null,
          project_id: formData.project_id || null,
          block_id: formData.block_id || null,
          leverage_person_id: formData.leverage_person_id || null,
        });
      } else {
        // Create new action
        await api.createAction({
          ...formData,
          category_id: formData.category_id || null,
          project_id: formData.project_id || null,
          block_id: formData.block_id || null,
          leverage_person_id: formData.leverage_person_id || null,
        });
      }
      onSuccess();
    } catch (error) {
      console.error('Failed to save action:', error);
    } finally {
      setLoading(false);
    }
  };

  const selectedCategory = categories.find(c => c.id === formData.category_id);
  const selectedProject = projects.find(p => p.id === formData.project_id);
  const selectedPerson = persons.find(p => p.id === formData.leverage_person_id);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <form onSubmit={handleSubmit}>
          <div className="modal-body" style={{ padding: '24px' }}>
            {/* Title */}
            <input
              type="text"
              className="form-input"
              placeholder="Title"
              value={formData.title}
              onChange={e => setFormData({ ...formData, title: e.target.value })}
              autoFocus
              style={{ 
                fontSize: '1.5rem', 
                fontWeight: '600',
                background: 'transparent',
                border: 'none',
                padding: '0',
                marginBottom: '16px'
              }}
            />

            {/* Notes */}
            <textarea
              className="form-input"
              placeholder="Add notes"
              value={formData.notes}
              onChange={e => setFormData({ ...formData, notes: e.target.value })}
              rows={3}
              style={{ marginBottom: '16px' }}
            />

            {/* Quick Options Row */}
            <div className="form-row" style={{ marginBottom: '20px', gap: '8px', flexWrap: 'wrap' }}>
              {/* Category Dropdown */}
              <div className="dropdown" style={{ position: 'relative' }}>
                <button
                  type="button"
                  className="dropdown-trigger"
                  onClick={() => setShowCategoryDropdown(!showCategoryDropdown)}
                  style={{ 
                    background: selectedCategory ? selectedCategory.color + '20' : 'var(--bg-card)',
                    borderColor: selectedCategory ? selectedCategory.color : 'var(--border-primary)'
                  }}
                >
                  <span>{selectedCategory?.name || 'CAPTURE'}</span>
                </button>
                {showCategoryDropdown && (
                  <div className="dropdown-menu" style={{ minWidth: '200px' }}>
                    {categories.map(cat => (
                      <div
                        key={cat.id}
                        className="dropdown-item"
                        onClick={() => {
                          setFormData({ ...formData, category_id: cat.id });
                          setShowCategoryDropdown(false);
                        }}
                      >
                        <span 
                          style={{ 
                            width: 12, 
                            height: 12, 
                            borderRadius: '50%', 
                            background: cat.color 
                          }} 
                        />
                        {cat.name}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Duration */}
              <div className="duration-picker">
                <Clock size={14} style={{ color: 'var(--text-muted)' }} />
                <input
                  type="number"
                  className="duration-input"
                  value={formData.duration_hours}
                  onChange={e => setFormData({ ...formData, duration_hours: parseInt(e.target.value) || 0 })}
                  min="0"
                  max="24"
                />
                <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>h</span>
                <input
                  type="number"
                  className="duration-input"
                  value={formData.duration_minutes}
                  onChange={e => setFormData({ ...formData, duration_minutes: parseInt(e.target.value) || 0 })}
                  min="0"
                  max="59"
                />
                <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>m</span>
              </div>

              {/* Star */}
              <button
                type="button"
                className="btn btn-icon btn-secondary"
                onClick={() => setFormData({ ...formData, is_starred: !formData.is_starred })}
                style={{ 
                  color: formData.is_starred ? 'var(--accent-orange)' : 'var(--text-muted)'
                }}
              >
                <Star size={16} fill={formData.is_starred ? 'currentColor' : 'none'} />
              </button>

              {/* Date */}
              <div className="duration-picker">
                <Calendar size={14} style={{ color: 'var(--text-muted)' }} />
                <input
                  type="date"
                  value={formData.scheduled_date}
                  onChange={e => setFormData({ ...formData, scheduled_date: e.target.value })}
                  style={{ 
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--text-primary)',
                    fontSize: '0.85rem'
                  }}
                />
              </div>
            </div>

            {/* Project */}
            <div className="form-row" style={{ marginBottom: '16px' }}>
              <span style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Project</span>
              <div className="dropdown" style={{ position: 'relative', flex: 1 }}>
                <button
                  type="button"
                  className="dropdown-trigger"
                  onClick={() => setShowProjectDropdown(!showProjectDropdown)}
                  style={{ width: '100%', justifyContent: 'flex-start' }}
                >
                  <FolderOpen size={16} style={{ color: 'var(--text-muted)' }} />
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

            {/* Leverage Person */}
            <div className="form-row" style={{ marginBottom: '16px' }}>
              <span style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Leverage/Commit</span>
              <div className="dropdown" style={{ position: 'relative' }}>
                <button
                  type="button"
                  className="btn btn-icon btn-secondary"
                  onClick={() => setShowPersonDropdown(!showPersonDropdown)}
                >
                  <User size={16} />
                </button>
                {showPersonDropdown && (
                  <div className="dropdown-menu" style={{ right: 0, left: 'auto' }}>
                    <div
                      className="dropdown-item"
                      onClick={() => {
                        setFormData({ ...formData, leverage_person_id: '' });
                        setShowPersonDropdown(false);
                      }}
                    >
                      No Person
                    </div>
                    {persons.map(person => (
                      <div
                        key={person.id}
                        className="dropdown-item"
                        onClick={() => {
                          setFormData({ ...formData, leverage_person_id: person.id });
                          setShowPersonDropdown(false);
                        }}
                      >
                        {person.name}
                      </div>
                    ))}
                  </div>
                )}
              </div>
              {selectedPerson && (
                <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                  {selectedPerson.name}
                </span>
              )}
              <label style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: '8px',
                marginLeft: 'auto',
                color: 'var(--text-muted)',
                fontSize: '0.85rem'
              }}>
                <input type="checkbox" />
                Create Leverage Request
              </label>
            </div>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={loading || !formData.title.trim()}>
              {loading ? 'Saving...' : initialData.id ? 'Update Action' : 'Save Action'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default CreateActionModal;
