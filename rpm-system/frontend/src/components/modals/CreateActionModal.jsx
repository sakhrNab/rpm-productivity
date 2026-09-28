import { useState, useContext, useEffect } from 'react';
import { X, Clock, Star, CalendarDays, FolderOpen, User, Flag, Lock, ChevronDown, Bell, Zap, Check, SlidersHorizontal, Target } from 'lucide-react';
import TaskReminders from '../TaskReminders';
import Picker from '../Picker';
import ModalHead from './ModalHead';

// Rail colours match every action row: p3 pink · p2 cyan · p1 purple · p0 slate.
const PRIORITY_OPTIONS = [
  { value: 0, label: 'None', hint: 'Someday', color: '#7d8aa3' },
  { value: 1, label: 'Low', hint: 'Nice to do', color: '#9575cd' },
  { value: 2, label: 'Med', hint: 'Should do', color: '#4ecdc4' },
  { value: 3, label: 'High', hint: 'Must do', color: '#ff69b4' },
];

// ---- presentational date helpers (local calendar days, YYYY-MM-DD) ----
const pad2 = n => String(n).padStart(2, '0');
const toISODay = d => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const shortDay = d => d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
function describeDay(iso, today) {
  if (!iso) return null;
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  const diff = Math.round((d - today) / 86400000);
  const label = diff === 0 ? 'Today' : diff === 1 ? 'Tomorrow' : diff === -1 ? 'Yesterday' : shortDay(d);
  return { label, late: diff < 0 };
}
const durationLabel = (h, m) => [h > 0 && `${h}h`, m > 0 && `${m}m`].filter(Boolean).join(' ');
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

  // ---- live preview of the step being written (presentational only) ----
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const quickDays = [
    { key: 'today', label: 'Today', iso: toISODay(today) },
    { key: 'tomorrow', label: 'Tomorrow', iso: toISODay(addDays(today, 1)) },
    // Next week = the coming Monday
    { key: 'next', label: 'Next week', iso: toISODay(addDays(today, ((8 - today.getDay()) % 7) || 7)) },
  ];
  const day = describeDay(formData.scheduled_date, today);
  const dur = durationLabel(formData.duration_hours, formData.duration_minutes);
  const prio = PRIORITY_OPTIONS.find(o => o.value === formData.priority) || PRIORITY_OPTIONS[0];
  const project = projects.find(p => p.id === formData.project_id);
  const category = catById[formData.category_id] || (project && catById[project.category_id]);
  const catColor = category?.color || '#4ecdc4';
  const extrasSet = [selectedPerson && 1, dependsOn.length && 1].filter(Boolean).length;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal cam-modal"
        style={{ '--cat': catColor, '--rail': prio.color }}
        onClick={e => e.stopPropagation()}
      >
        <ModalHead
          icon={Zap}
          title={isEdit ? 'Edit action' : 'New action'}
          subtitle={isEdit ? 'Tune the details, what it waits on and when to nudge you.' : 'One clear step — give it a day, a home and a priority.'}
          onClose={onClose}
          badgeStyle={{
            background: `linear-gradient(135deg, color-mix(in srgb, ${catColor} 28%, transparent), rgba(255, 105, 180, 0.14))`,
            borderColor: `color-mix(in srgb, ${catColor} 42%, transparent)`,
          }}
        />
        <form className="cam-form" onSubmit={handleSubmit}>
          <div className="modal-body mk-body cam-modal-body">
            {/* The step — a mission card: title, notes, live preview */}
            <section className={`cam-card cam-p${formData.priority}`} aria-label="Action">
              <p className="cam-card-kicker">
                <span className="cam-cat-dot" aria-hidden="true" />
                <span>{isEdit ? 'Step' : 'New step'}</span>
                {(project || category) && <><i aria-hidden="true">·</i><b>{project ? project.name : category.name}</b></>}
              </p>
              <input
                type="text"
                className="form-input mk-hero cam-title"
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
              <div className="cam-preview" aria-live="polite">
                <span className={`cam-pv ${day ? (day.late ? 'is-late' : 'is-set') : 'is-muted'}`}>
                  <CalendarDays size={13} /> {day ? day.label : 'No day yet'}
                </span>
                {dur && <span className="cam-pv is-set"><Clock size={13} /> {dur}</span>}
                {formData.priority > 0 && (
                  <span className="cam-pv cam-pv-prio"><span className="cam-pv-dot" /> {prio.label} priority</span>
                )}
                <span className={`cam-pv ${project || category ? '' : 'is-muted'}`}>
                  {project || category
                    ? <><span className="mk-dot" style={{ '--c': catColor }} /> {project ? project.name : category.name}</>
                    : <><FolderOpen size={13} /> Capture list</>}
                </span>
                {formData.is_starred && <span className="cam-pv cam-pv-star"><Star size={13} fill="currentColor" /> Starred</span>}
                {selectedPerson && <span className="cam-pv"><User size={13} /> {selectedPerson.name}</span>}
                {dependsOn.length > 0 && <span className="cam-pv is-late"><Lock size={13} /> Waits on {dependsOn.length}</span>}
              </div>
            </section>

            {/* When */}
            <div className="mk-section">
              <div className="cam-when">
                <div className="mk-field">
                  <span className="form-label"><CalendarDays size={13} /> When</span>
                  <div className="cam-day-picks" role="group" aria-label="Quick day">
                    {quickDays.map(q => (
                      <button
                        key={q.key}
                        type="button"
                        className={`cam-day-chip ${formData.scheduled_date === q.iso ? 'on' : ''}`}
                        aria-pressed={formData.scheduled_date === q.iso}
                        title={shortDay(new Date(`${q.iso}T00:00:00`))}
                        onClick={() => setFormData({ ...formData, scheduled_date: q.iso })}
                      >
                        {q.label}
                      </button>
                    ))}
                  </div>
                  <input
                    type="date"
                    className="form-input cam-date"
                    aria-label="Day"
                    value={formData.scheduled_date}
                    onChange={e => setFormData({ ...formData, scheduled_date: e.target.value })}
                  />
                </div>
                <div className="mk-field">
                  <span className="form-label"><Clock size={13} /> How long</span>
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
              <div className="mk-grid mk-grid-2">
                <div className="mk-field">
                  <span className="form-label"><FolderOpen size={13} /> Category</span>
                  <Picker
                    value={formData.category_id}
                    options={categoryOptions}
                    onChange={v => setFormData({ ...formData, category_id: v })}
                    placeholder="Capture list"
                    header="Category"
                  />
                </div>
                <div className="mk-field">
                  <span className="form-label"><Target size={13} /> Project</span>
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
              <div className="mk-section-head">
                <p className="ui-kicker"><Flag size={14} /> Priority</p>
                <button
                  type="button"
                  className={`cam-star ${formData.is_starred ? 'on' : ''}`}
                  aria-pressed={formData.is_starred}
                  onClick={() => setFormData({ ...formData, is_starred: !formData.is_starred })}
                >
                  <Star size={15} fill={formData.is_starred ? 'currentColor' : 'none'} />
                  {formData.is_starred ? 'Starred' : 'Star'}
                </button>
              </div>
              <div className="cam-prio" role="radiogroup" aria-label="Priority">
                {PRIORITY_OPTIONS.map(o => (
                  <button
                    key={o.value}
                    type="button"
                    role="radio"
                    aria-checked={formData.priority === o.value}
                    className={`cam-prio-pill ${formData.priority === o.value ? 'on' : ''}`}
                    style={{ '--c': o.color }}
                    onClick={() => setFormData({ ...formData, priority: o.value })}
                  >
                    <b>{o.label}</b>
                    <small>{o.hint}</small>
                  </button>
                ))}
              </div>
            </div>

            {/* Extras — optional: leverage, dependencies, reminders */}
            <div className="mk-section cam-extras">
              <p className="ui-kicker">
                <SlidersHorizontal size={14} /> Extras
                {extrasSet > 0 && <span className="ui-count">{extrasSet}</span>}
              </p>

              {/* Leverage */}
              <details className="cam-drawer" open={Boolean(formData.leverage_person_id) || undefined}>
                <summary className="cam-drawer-row">
                  <span className="cam-drawer-ico"><User size={15} /></span>
                  <span className="cam-drawer-text">
                    <b>Leverage / commit</b>
                    <small>{selectedPerson ? `With ${selectedPerson.name}` : 'Get someone to own or back it'}</small>
                  </span>
                  <ChevronDown size={15} className="cam-drawer-chev" />
                </summary>
                <div className="cam-drawer-body">
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
              </details>

              {/* Dependencies — blocked by other actions (inline expander, never clipped by the scroller) */}
              <div className={`cam-drawer ${showDepsDropdown ? 'is-open' : ''}`}>
                <button
                  type="button"
                  className="cam-drawer-row cam-deps-trigger"
                  aria-expanded={showDepsDropdown}
                  onClick={() => setShowDepsDropdown(v => !v)}
                >
                  <span className={`cam-drawer-ico ${dependsOn.length ? 'is-bad' : ''}`}><Lock size={15} /></span>
                  <span className="cam-drawer-text">
                    <b>Blocked by{dependsOn.length > 0 && <span className="ui-count">{dependsOn.length}</span>}</b>
                    <small>{dependsOn.length ? `Waits on ${dependsOn.length} action${dependsOn.length > 1 ? 's' : ''}` : 'Depends on… (optional)'}</small>
                  </span>
                  <ChevronDown size={15} className="cam-drawer-chev" />
                </button>
                {(showDepsDropdown || dependsOn.length > 0) && (
                  <div className="cam-drawer-body">
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
                )}
              </div>

              {/* Reminders — manage this task's reminders (existing tasks only) */}
              <details className="cam-drawer">
                <summary className="cam-drawer-row">
                  <span className="cam-drawer-ico"><Bell size={15} /></span>
                  <span className="cam-drawer-text">
                    <b>Reminders</b>
                    <small>{isEdit ? 'Nudge me before it’s due' : 'Available once the action is saved'}</small>
                  </span>
                  <ChevronDown size={15} className="cam-drawer-chev" />
                </summary>
                <div className="cam-drawer-body">
                  <TaskReminders actionId={initialData.id} actionTitle={formData.title} />
                </div>
              </details>
            </div>
          </div>

          <div className="modal-footer mk-foot cam-foot">
            <span className="mk-foot-note">{formData.title.trim() ? 'Enter ↵ saves' : 'Name the step to save'}</span>
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
