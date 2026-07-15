import { useState, useContext, useEffect } from 'react';
import { X, Clock, Star, Calendar, FolderOpen, User } from 'lucide-react';
import { AppContext, AuthContext } from '../../App';
import './CreateActionModal.css';

function CreateActionModal({ onClose, onSuccess, categories, initialData = {} }) {
  const { projects, persons } = useContext(AppContext);
  const { api } = useContext(AuthContext);
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
  const [createLeverage, setCreateLeverage] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.title.trim()) return;

    setLoading(true);
    try {
      const payload = {
        ...formData,
        category_id: formData.category_id || null,
        project_id: formData.project_id || null,
        block_id: formData.block_id || null,
        leverage_person_id: formData.leverage_person_id || null,
      };
      const saved = initialData.id
        ? await api.updateAction(initialData.id, payload)
        : await api.createAction(payload);

      // Optionally create an accountability request for the assigned person
      const actionId = saved?.id || initialData.id;
      if (createLeverage && formData.leverage_person_id && actionId) {
        try {
          await api.createLeverageRequest({
            action_id: actionId,
            person_id: formData.leverage_person_id,
            message: formData.notes || '',
          });
        } catch (err) {
          console.error('Failed to create leverage request:', err);
        }
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
          <div className="modal-body cam-modal-body">
            {/* Title */}
            <input
              type="text"
              className="form-input cam-title-input"
              placeholder="Title"
              value={formData.title}
              onChange={e => setFormData({ ...formData, title: e.target.value })}
              autoFocus
            />

            {/* Notes */}
            <textarea
              className="form-input cam-mb-16"
              placeholder="Add notes"
              value={formData.notes}
              onChange={e => setFormData({ ...formData, notes: e.target.value })}
              rows={3}
            />

            {/* Quick Options Row */}
            <div className="form-row cam-quick-row">
              {/* Category Dropdown */}
              <div className="dropdown cam-relative">
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
                  <div className="dropdown-menu cam-menu-200">
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
                <Clock size={14} className="cam-icon-muted" />
                <input
                  type="number"
                  className="duration-input"
                  value={formData.duration_hours}
                  onChange={e => setFormData({ ...formData, duration_hours: parseInt(e.target.value) || 0 })}
                  min="0"
                  max="24"
                />
                <span className="cam-unit">h</span>
                <input
                  type="number"
                  className="duration-input"
                  value={formData.duration_minutes}
                  onChange={e => setFormData({ ...formData, duration_minutes: parseInt(e.target.value) || 0 })}
                  min="0"
                  max="59"
                />
                <span className="cam-unit">m</span>
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
                <Calendar size={14} className="cam-icon-muted" />
                <input
                  type="date"
                  className="cam-date-input"
                  value={formData.scheduled_date}
                  onChange={e => setFormData({ ...formData, scheduled_date: e.target.value })}
                />
              </div>
            </div>

            {/* Project */}
            <div className="form-row cam-mb-16">
              <span className="cam-field-label">Project</span>
              <div className="dropdown cam-dropdown-flex">
                <button
                  type="button"
                  className="dropdown-trigger cam-trigger-full"
                  onClick={() => setShowProjectDropdown(!showProjectDropdown)}
                >
                  <FolderOpen size={16} className="cam-icon-muted" />
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
                          // A project belongs to a category — apply it automatically.
                          setFormData({ ...formData, project_id: proj.id, category_id: proj.category_id || formData.category_id });
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
            <div className="form-row cam-mb-16">
              <span className="cam-field-label">Leverage/Commit</span>
              <div className="dropdown cam-dropdown-flex">
                <button
                  type="button"
                  className="dropdown-trigger cam-trigger-full"
                  onClick={() => setShowPersonDropdown(!showPersonDropdown)}
                >
                  <User size={16} className="cam-icon-muted" />
                  <span>{selectedPerson?.name || 'Choose person (optional)'}</span>
                </button>
                {showPersonDropdown && (
                  <div className="dropdown-menu">
                    <div
                      className="dropdown-item"
                      onClick={() => {
                        setFormData({ ...formData, leverage_person_id: '' });
                        setShowPersonDropdown(false);
                      }}
                    >
                      No person
                    </div>
                    {persons.length === 0 && (
                      <div className="dropdown-item cam-dropdown-empty">
                        No people yet — add them on the People page
                      </div>
                    )}
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
                        {person.email && <span className="cam-person-email">{person.email}</span>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <label className="cam-leverage-label cam-mb-16">
              <input
                type="checkbox"
                checked={createLeverage}
                onChange={e => setCreateLeverage(e.target.checked)}
                disabled={!formData.leverage_person_id}
              />
              Create Leverage Request
            </label>
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
