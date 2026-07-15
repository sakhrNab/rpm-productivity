import { useState, useContext, useEffect } from 'react';
import { X, Clock, Star, Calendar, FolderOpen, User, Flag, Lock, ChevronDown, Bell } from 'lucide-react';
import TaskReminders from '../TaskReminders';

const PRIORITY_OPTIONS = [
  { value: 0, label: 'None', cls: 'none' },
  { value: 1, label: 'Low', cls: 'low' },
  { value: 2, label: 'Med', cls: 'med' },
  { value: 3, label: 'High', cls: 'high' },
];
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
    scheduled_date: (initialData.scheduled_date || '').slice(0, 10),
    is_starred: initialData.is_starred || false,
    is_this_week: initialData.is_this_week || false,
    priority: initialData.priority || 0,
  });
  const [candidateActions, setCandidateActions] = useState([]);
  const [dependsOn, setDependsOn] = useState([]); // ids this action is blocked by
  const [originalDeps, setOriginalDeps] = useState([]);
  const [showDepsDropdown, setShowDepsDropdown] = useState(false);
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false);
  const [showProjectDropdown, setShowProjectDropdown] = useState(false);
  const [showPersonDropdown, setShowPersonDropdown] = useState(false);
  const [createLeverage, setCreateLeverage] = useState(false);
  const [loading, setLoading] = useState(false);

  // Load candidate actions to depend on + this action's existing dependencies.
  useEffect(() => {
    api.getActions()
      .then(list => setCandidateActions((list || []).filter(a => a.id !== initialData.id && !a.is_completed)))
      .catch(() => {});
    if (initialData.id) {
      api.getActionDependencies(initialData.id)
        .then(d => { const ids = (d.blocked_by || []).map(b => b.id); setDependsOn(ids); setOriginalDeps(ids); })
        .catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

      // Sync "blocked by" dependencies (add new, remove cleared).
      if (actionId) {
        const toAdd = dependsOn.filter(id => !originalDeps.includes(id));
        const toRemove = originalDeps.filter(id => !dependsOn.includes(id));
        await Promise.all([
          ...toAdd.map(depId => api.addActionDependency(actionId, depId).catch(() => {})),
          ...toRemove.map(depId => api.removeActionDependency(actionId, depId).catch(() => {})),
        ]);
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

            {/* Priority (Chet Holmes: rank what matters most) */}
            <div className="form-row cam-mb-16">
              <span className="cam-field-label"><Flag size={14} className="cam-icon-muted" /> Priority</span>
              <div className="cam-prio-group">
                {PRIORITY_OPTIONS.map(o => (
                  <button
                    key={o.value}
                    type="button"
                    className={`cam-prio-btn cam-prio-${o.cls} ${formData.priority === o.value ? 'active' : ''}`}
                    onClick={() => setFormData({ ...formData, priority: o.value })}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Dependencies — blocked by other actions */}
            <div className="form-row cam-mb-16">
              <span className="cam-field-label"><Lock size={14} className="cam-icon-muted" /> Blocked by</span>
              <div className="dropdown cam-dropdown-flex">
                <button type="button" className="dropdown-trigger cam-trigger-full" onClick={() => setShowDepsDropdown(v => !v)}>
                  <span>{dependsOn.length ? `${dependsOn.length} action${dependsOn.length > 1 ? 's' : ''}` : 'Depends on… (optional)'}</span>
                  <ChevronDown size={14} className="cam-icon-muted cam-ml-auto" />
                </button>
                {showDepsDropdown && (
                  <div className="dropdown-menu cam-deps-menu">
                    {candidateActions.length === 0 && <div className="dropdown-item cam-dropdown-empty">No other actions yet</div>}
                    {candidateActions.map(a => {
                      const checked = dependsOn.includes(a.id);
                      return (
                        <div
                          key={a.id}
                          className="dropdown-item cam-dep-item"
                          onClick={() => setDependsOn(prev => checked ? prev.filter(id => id !== a.id) : [...prev, a.id])}
                        >
                          <input type="checkbox" readOnly checked={checked} />
                          <span className="cam-dep-title">{a.title}</span>
                          {a.project_name && <span className="cam-person-email">{a.project_name}</span>}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
            {dependsOn.length > 0 && (
              <div className="cam-dep-chips">
                {dependsOn.map(id => {
                  const a = candidateActions.find(c => c.id === id);
                  return (
                    <span key={id} className="cam-dep-chip">
                      {a ? a.title : 'action'}
                      <button type="button" onClick={() => setDependsOn(prev => prev.filter(x => x !== id))} aria-label="Remove"><X size={11} /></button>
                    </span>
                  );
                })}
              </div>
            )}

            {/* Reminders — manage this task's reminders (existing tasks only) */}
            <div className="form-row cam-mb-16">
              <span className="cam-field-label"><Bell size={14} className="cam-icon-muted" /> Reminders</span>
              <TaskReminders actionId={initialData.id} actionTitle={formData.title} />
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
