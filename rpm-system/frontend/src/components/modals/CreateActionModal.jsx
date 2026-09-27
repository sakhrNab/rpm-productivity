import { useState, useContext, useEffect } from 'react';
import { X, Clock, Star, CalendarDays, FolderOpen, User, Flag, Lock, ChevronDown, Bell, Zap, Check } from 'lucide-react';
import TaskReminders from '../TaskReminders';
import Picker from '../Picker';
import ModalHead from './ModalHead';

const PRIORITY_OPTIONS = [
  { value: 0, label: 'None' },
  { value: 1, label: 'Low' },
  { value: 2, label: 'Med' },
  { value: 3, label: 'High' },
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

  const selectedPerson = persons.find(p => p.id === formData.leverage_person_id);
  const catById = Object.fromEntries(categories.map(c => [c.id, c]));
  const isEdit = Boolean(initialData.id);

  // Picker options (presentational — same values the old dropdowns wrote)
  const categoryOptions = categories.map(c => ({
    value: c.id, label: c.name, icon: <span className="mk-dot" style={{ '--c': c.color }} />,
  }));
  const projectOptions = [
    { value: '', label: 'No project' },
    ...[...projects]
      .sort((a, b) => (catById[a.category_id]?.name || '~').localeCompare(catById[b.category_id]?.name || '~'))
      .map(p => ({
        value: p.id, label: p.name, group: catById[p.category_id]?.name || 'Other',
        icon: <span className="mk-dot" style={{ '--c': catById[p.category_id]?.color }} />,
      })),
  ];
  const personOptions = [
    { value: '', label: 'No person' },
    ...persons.map(p => ({ value: p.id, label: p.name, hint: p.email || undefined })),
  ];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal cam-modal" onClick={e => e.stopPropagation()}>
        <ModalHead
          icon={Zap}
          title={isEdit ? 'Edit action' : 'New action'}
          subtitle={isEdit ? 'Tune the details, what it waits on and when to nudge you.' : 'One clear step — give it a day, a home and a priority.'}
          onClose={onClose}
        />
        <form onSubmit={handleSubmit}>
          <div className="modal-body mk-body cam-modal-body">
            {/* What */}
            <div className="mk-section">
              <input
                type="text"
                className="form-input mk-hero"
                placeholder="What needs to happen?"
                aria-label="Title"
                value={formData.title}
                onChange={e => setFormData({ ...formData, title: e.target.value })}
                autoFocus
              />
              <textarea
                className="form-input cam-notes"
                placeholder="Notes, links, context (optional)"
                aria-label="Notes"
                value={formData.notes}
                onChange={e => setFormData({ ...formData, notes: e.target.value })}
                rows={2}
              />
            </div>

            {/* When */}
            <div className="mk-section">
              <p className="ui-kicker"><CalendarDays size={14} /> When</p>
              <div className="mk-grid mk-grid-2">
                <label className="mk-field">
                  <span className="form-label">Day</span>
                  <input
                    type="date"
                    className="form-input cam-date"
                    value={formData.scheduled_date}
                    onChange={e => setFormData({ ...formData, scheduled_date: e.target.value })}
                  />
                </label>
                <div className="mk-field">
                  <span className="form-label">Duration</span>
                  <div className="cam-dur">
                    <Clock size={15} className="cam-dur-icon" />
                    <input
                      type="number"
                      className="duration-input"
                      aria-label="Hours"
                      value={formData.duration_hours}
                      onChange={e => setFormData({ ...formData, duration_hours: parseInt(e.target.value) || 0 })}
                      min="0"
                      max="24"
                    />
                    <span className="cam-unit">h</span>
                    <input
                      type="number"
                      className="duration-input"
                      aria-label="Minutes"
                      value={formData.duration_minutes}
                      onChange={e => setFormData({ ...formData, duration_minutes: parseInt(e.target.value) || 0 })}
                      min="0"
                      max="59"
                    />
                    <span className="cam-unit">m</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Where */}
            <div className="mk-section">
              <p className="ui-kicker"><FolderOpen size={14} /> Where it lives</p>
              <div className="mk-grid mk-grid-2">
                <div className="mk-field">
                  <span className="form-label">Category</span>
                  <Picker
                    value={formData.category_id}
                    options={categoryOptions}
                    onChange={v => setFormData({ ...formData, category_id: v })}
                    placeholder="Capture list"
                    header="Category"
                  />
                </div>
                <div className="mk-field">
                  <span className="form-label">Project</span>
                  <Picker
                    value={formData.project_id}
                    options={projectOptions}
                    // A project belongs to a category — apply it automatically.
                    onChange={v => {
                      const proj = projects.find(p => p.id === v);
                      setFormData({ ...formData, project_id: v, category_id: proj ? (proj.category_id || formData.category_id) : formData.category_id });
                    }}
                    placeholder="Choose project"
                    header="Project"
                  />
                </div>
              </div>
            </div>

            {/* Priority (Chet Holmes: rank what matters most) */}
            <div className="mk-section">
              <p className="ui-kicker"><Flag size={14} /> Priority</p>
              <div className="cam-prio-row">
                <div className="ui-seg mk-prio" role="radiogroup" aria-label="Priority">
                  {PRIORITY_OPTIONS.map(o => (
                    <button
                      key={o.value}
                      type="button"
                      role="radio"
                      aria-checked={formData.priority === o.value}
                      className={`mk-p${o.value} ${formData.priority === o.value ? 'on' : ''}`}
                      onClick={() => setFormData({ ...formData, priority: o.value })}
                    >
                      <span className="mk-dot" /> {o.label}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  className={`mk-toggle-chip ${formData.is_starred ? 'on' : ''}`}
                  aria-pressed={formData.is_starred}
                  onClick={() => setFormData({ ...formData, is_starred: !formData.is_starred })}
                >
                  <Star size={15} fill={formData.is_starred ? 'currentColor' : 'none'} />
                  {formData.is_starred ? 'Starred' : 'Star'}
                </button>
              </div>
            </div>

            {/* Leverage */}
            <div className="mk-section">
              <p className="ui-kicker"><User size={14} /> Leverage / commit</p>
              <Picker
                value={formData.leverage_person_id}
                options={personOptions}
                onChange={v => setFormData({ ...formData, leverage_person_id: v })}
                placeholder="Choose a person (optional)"
                header="Person"
              />
              {persons.length === 0 && <p className="mk-help">No people yet — add them on the People page.</p>}
              <label className={`mk-toggle-row ${formData.leverage_person_id ? '' : 'is-disabled'}`}>
                <input
                  type="checkbox"
                  checked={createLeverage}
                  onChange={e => setCreateLeverage(e.target.checked)}
                  disabled={!formData.leverage_person_id}
                />
                <span>
                  <b>Create leverage request</b>
                  <small>{selectedPerson ? `Ask ${selectedPerson.name} to own or back this step.` : 'Pick a person first.'}</small>
                </span>
              </label>
            </div>

            {/* Dependencies — blocked by other actions */}
            <div className="mk-section">
              <p className="ui-kicker">
                <Lock size={14} /> Blocked by
                {dependsOn.length > 0 && <span className="ui-count">{dependsOn.length}</span>}
              </p>
              <button
                type="button"
                className={`cam-deps-trigger ${showDepsDropdown ? 'open' : ''}`}
                aria-expanded={showDepsDropdown}
                onClick={() => setShowDepsDropdown(v => !v)}
              >
                <span>{dependsOn.length ? `Waits on ${dependsOn.length} action${dependsOn.length > 1 ? 's' : ''}` : 'Depends on… (optional)'}</span>
                <ChevronDown size={15} className="cam-deps-chevron" />
              </button>
              {showDepsDropdown && (
                <div className="cam-deps-list" role="listbox" aria-multiselectable="true">
                  {candidateActions.length === 0 && <div className="cam-deps-empty">No other actions yet</div>}
                  {candidateActions.map(a => {
                    const checked = dependsOn.includes(a.id);
                    return (
                      <button
                        key={a.id}
                        type="button"
                        role="option"
                        aria-selected={checked}
                        className={`cam-dep-item ${checked ? 'on' : ''}`}
                        onClick={() => setDependsOn(prev => checked ? prev.filter(id => id !== a.id) : [...prev, a.id])}
                      >
                        <span className="cam-dep-box">{checked && <Check size={12} />}</span>
                        <span className="cam-dep-title">{a.title}</span>
                        {a.project_name && <span className="cam-dep-proj">{a.project_name}</span>}
                      </button>
                    );
                  })}
                </div>
              )}
              {dependsOn.length > 0 && (
                <div className="cam-dep-chips">
                  {dependsOn.map(id => {
                    const a = candidateActions.find(c => c.id === id);
                    return (
                      <span key={id} className="ui-chip ui-chip--bad cam-dep-chip">
                        <Lock size={11} />
                        <span className="cam-dep-chip-text">{a ? a.title : 'action'}</span>
                        <button type="button" onClick={() => setDependsOn(prev => prev.filter(x => x !== id))} aria-label="Remove"><X size={12} /></button>
                      </span>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Reminders — manage this task's reminders (existing tasks only) */}
            <div className="mk-section">
              <p className="ui-kicker"><Bell size={14} /> Reminders</p>
              <TaskReminders actionId={initialData.id} actionTitle={formData.title} />
            </div>
          </div>

          <div className="modal-footer mk-foot">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={loading || !formData.title.trim()}>
              <Check size={16} /> {loading ? 'Saving...' : isEdit ? 'Update action' : 'Save action'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default CreateActionModal;
