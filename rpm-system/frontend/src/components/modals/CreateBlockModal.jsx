import { useState, useContext, useEffect } from 'react';
import { Check, Pencil, Trash2, Calendar as CalendarIcon, SlidersHorizontal, Target, Compass, FolderOpen, ListChecks, Plus, Flag, Hourglass, CalendarClock } from 'lucide-react';
import { AppContext, AuthContext } from '../../App';
import { useToast } from '../ToastProvider';
import CreateActionModal from './CreateActionModal';
import ModalHead from './ModalHead';
import Picker from '../Picker';
import { BlockBand, PurposeQuote, dueInfo } from '../blocks/BlockFace';
import './CreateBlockModal.css';

const PRIO_OPTIONS = [0, 1, 2, 3].map(v => ({
  value: v,
  label: ['No prio', 'Low', 'Med', 'High'][v],
  icon: <span className={`mk-dot mk-p${v}`} />,
}));

// Quick deadline picks (they only set the date field).
const isoDay = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const plusDays = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return isoDay(d); };
const DUE_PICKS = [
  { label: '1 week', value: () => plusDays(7) },
  { label: '2 weeks', value: () => plusDays(14) },
  { label: '30 days', value: () => plusDays(30) },
  { label: 'End of month', value: () => { const d = new Date(); return isoDay(new Date(d.getFullYear(), d.getMonth() + 1, 0)); } },
];
const fmtMins = (mins) => {
  const h = Math.floor(mins / 60), m = mins % 60;
  return `${h ? `${h}h` : ''}${h && m ? ' ' : ''}${m ? `${m}m` : ''}`;
};

function CreateBlockModal({ onClose, onSuccess, categories, initialData = {} }) {
  const { projects } = useContext(AppContext);
  const { api } = useContext(AuthContext);
  const { showToast } = useToast();
  const [editingActionId, setEditingActionId] = useState(null);
  const [editingTitle, setEditingTitle] = useState('');

  // Inline edit / date / delete for the attached actions
  const patchAction = async (id, patch) => {
    setActions(prev => prev.map(a => (a.id === id ? { ...a, ...patch } : a)));
    try {
      await api.updateAction(id, patch);
    } catch (error) {
      console.error('Failed to update action:', error);
      showToast('Could not update that action.', 'error');
    }
  };
  const saveTitle = (id) => {
    const title = editingTitle.trim();
    setEditingActionId(null);
    if (title) patchAction(id, { title });
  };
  const removeAction = async (id) => {
    if (!window.confirm('Delete this action permanently?')) return;
    setActions(prev => prev.filter(a => a.id !== id));
    setSelectedActions(prev => prev.filter(x => x !== id));
    try {
      await api.deleteAction(id);
      showToast('Action deleted.', 'success');
    } catch (error) {
      console.error('Failed to delete action:', error);
      showToast('Could not delete that action.', 'error');
    }
  };
  const [formData, setFormData] = useState({
    result_title: initialData.result_title || '',
    purpose: initialData.purpose || '',
    category_id: initialData.category_id || '',
    project_id: initialData.project_id || '',
    key_result_id: initialData.key_result_id || '',
    // <input type="date"> needs yyyy-MM-dd; the API returns a full ISO timestamp,
    // so keep just the date part or the deadline looks empty when re-editing.
    target_date: initialData.target_date ? String(initialData.target_date).slice(0, 10) : '',
  });
  const [keyResults, setKeyResults] = useState([]);
  const [actions, setActions] = useState([]);

  // Key results for this project — a block can be linked to the KR it drives toward
  useEffect(() => {
    if (!formData.project_id) { setKeyResults([]); return; }
    let active = true;
    api.getKeyResults(formData.project_id)
      .then(data => { if (active) setKeyResults(Array.isArray(data) ? data : []); })
      .catch(err => console.error('Failed to load key results:', err));
    return () => { active = false; };
  }, [formData.project_id]);
  const [selectedActions, setSelectedActions] = useState((initialData.actions || []).map(a => a.id));
  const [showActionModal, setShowActionModal] = useState(false);
  const [editAction, setEditAction] = useState(null);
  const [loading, setLoading] = useState(false);

  // Show only actions that belong to the SAME project (or category, when the block
  // isn't tied to a project) so one project's actions don't leak into another's.
  const inScope = (a) => {
    if (a.block_id && a.block_id !== initialData.id) return false; // already in another block
    if (formData.project_id) return a.project_id === formData.project_id;
    if (formData.category_id) return a.category_id === formData.category_id;
    return !a.project_id; // loose blocks: only truly unassigned actions
  };

  useEffect(() => {
    const loadActions = async () => {
      try {
        const data = await api.getActions({ completed: 'false' });
        setActions(data.filter(inScope));
      } catch (error) {
        console.error('Failed to load actions:', error);
      }
    };
    loadActions();
  }, [formData.category_id, formData.project_id]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.result_title.trim()) return;

    setLoading(true);
    try {
      if (initialData.id) {
        // Update existing block (also re-sync which actions belong to it)
        await api.updateBlock(initialData.id, {
          ...formData,
          category_id: formData.category_id || null,
          project_id: formData.project_id || null,
          action_ids: selectedActions,
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
    // Reload the list and auto-attach any newly created action, so a brand-new
    // action actually lands in the block's Massive Action Plan (not just listed).
    try {
      const data = await api.getActions({ completed: 'false' });
      const scoped = data.filter(inScope);
      const prevIds = new Set(actions.map(a => a.id));
      const newIds = scoped.filter(a => !prevIds.has(a.id)).map(a => a.id);
      setActions(scoped);
      if (newIds.length) setSelectedActions(prev => [...new Set([...prev, ...newIds])]);
    } catch (error) {
      console.error('Failed to reload actions:', error);
    }
  };

  const isEdit = Boolean(initialData.id);
  const catById = Object.fromEntries(categories.map(c => [c.id, c]));
  const allSelected = actions.length > 0 && selectedActions.length === actions.length;
  const attachedCount = actions.filter(a => selectedActions.includes(a.id)).length;

  // Picker options (presentational — same values the old dropdowns/selects wrote)
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
  // Mission cues (presentational): category colour, deadline countdown, plan time.
  const cat = catById[formData.category_id];
  const due = dueInfo(formData.target_date);
  const dueTone = due?.tone || '';
  // Live preview: the actions in the plan (open ones from the list + any already-done ones on the block).
  const knownActions = [...actions, ...(initialData.actions || []).filter(a => !actions.some(x => x.id === a.id))];
  const planActions = knownActions.filter(a => selectedActions.includes(a.id) && !a.is_cancelled);
  const planDone = planActions.filter(a => a.is_completed).length;
  const planPct = planActions.length ? Math.round((planDone / planActions.length) * 100) : 0;
  const proj = projects.find(p => p.id === formData.project_id);
  const planMins = actions
    .filter(a => selectedActions.includes(a.id))
    .reduce((s, a) => s + (a.duration_hours || 0) * 60 + (a.duration_minutes || 0), 0);
  const openNewAction = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setShowActionModal(true);
  };

  const krOptions = [
    { value: '', label: 'Not linked to a key result' },
    ...keyResults.map(kr => ({ value: kr.id, label: kr.title })),
  ];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className={`modal cbm-modal ${dueTone ? `is-due-${dueTone}` : ''}`}
        style={cat?.color ? { '--cat': cat.color } : undefined}
        onClick={e => e.stopPropagation()}
      >
        <ModalHead
          icon={Target}
          title={isEdit ? 'Edit RPM block' : 'New RPM block'}
          subtitle="Result → Purpose → Massive Action Plan. The card on the left is what you'll get."
          onClose={onClose}
          badgeStyle={cat?.color ? { color: cat.color } : undefined}
        />

        <form onSubmit={handleSubmit}>
          <div className="modal-body mk-body cbm-body">
            {/* Live preview — the real block card face, updating as you type */}
            <aside className="cbm-preview" aria-label="Live preview of the block card">
              <p className="cbm-preview-label"><span className="cbm-live" /> Live preview</p>
              <div className="cbm-card">
                <BlockBand
                  number=""
                  kicker={<>{isEdit ? 'Block' : 'New block'}{cat && <><i aria-hidden="true">·</i><b>{cat.name}</b></>}</>}
                  result={formData.result_title}
                  placeholder="Your result appears here"
                  due={due}
                  progress={{ pct: planPct, done: planDone, total: planActions.length }}
                />
                <div className="cbm-card-body">
                  <PurposeQuote placeholder="…and why it matters to you.">{formData.purpose}</PurposeQuote>
                  {planActions.length > 0 ? (
                    <ol className="cbm-card-path">
                      {planActions.slice(0, 5).map((a, i) => (
                        <li key={a.id} className={`mk-p${a.priority || 0} ${a.is_completed ? 'is-done' : ''}`}><b>{i + 1}</b><span>{a.title}</span></li>
                      ))}
                      {planActions.length > 5 && <li className="cbm-card-more">+{planActions.length - 5} more</li>}
                    </ol>
                  ) : (
                    <p className="cbm-card-empty">No actions in the plan yet.</p>
                  )}
                  <p className="cbm-card-meta">
                    <span><ListChecks size={12} />{planActions.length - planDone} to do{planDone > 0 ? ` · ${planDone} done` : ''}</span>
                    {planMins > 0 && <span><Hourglass size={12} />{fmtMins(planMins)}</span>}
                    {proj && <span><FolderOpen size={12} />{proj.name}</span>}
                  </p>
                </div>
              </div>
            </aside>

            <div className="cbm-steps">
              {/* 1 — Result */}
              <section className="cbm-step">
                <span className="cbm-step-no" aria-hidden="true">1</span>
                <label className="mk-field cbm-result">
                  <span className="form-label cbm-label-result"><Target size={13} /> Result <span className="mk-optional">what, specifically</span></span>
                  <input
                    type="text"
                    className="form-input mk-hero cbm-result-in"
                    placeholder="A specific, measurable outcome you're committed to"
                    value={formData.result_title}
                    onChange={e => setFormData({ ...formData, result_title: e.target.value })}
                    autoFocus={!isEdit}
                  />
                </label>
              </section>

              {/* 2 — Purpose */}
              <section className="cbm-step">
                <span className="cbm-step-no" aria-hidden="true">2</span>
                <label className="mk-field cbm-why">
                  <span className="form-label cbm-label-purpose"><Compass size={13} /> Purpose <span className="mk-optional">why it matters</span></span>
                  <textarea
                    className="form-input cbm-why-in"
                    rows={2}
                    placeholder="The deeper, emotional reason you want this result"
                    value={formData.purpose}
                    onChange={e => setFormData({ ...formData, purpose: e.target.value })}
                  />
                </label>
              </section>

              {/* 3 — Deadline + where it lives */}
              <section className="cbm-step">
                <span className="cbm-step-no" aria-hidden="true">3</span>
                <div className="cbm-step-main">
                  <div className="mk-field cbm-deadline">
                    <span className="form-label"><CalendarClock size={13} /> Deadline <span className="mk-optional">drives the countdown</span></span>
                    <div className="cbm-due-row">
                      <input
                        type="date"
                        className="form-input cbm-due-in"
                        value={formData.target_date}
                        onChange={e => setFormData({ ...formData, target_date: e.target.value })}
                        aria-label="Deadline"
                      />
                      <div className="cbm-due-picks" role="group" aria-label="Quick deadline">
                        {DUE_PICKS.map(p => {
                          const v = p.value();
                          return (
                            <button key={p.label} type="button" className={`cbm-pick ${formData.target_date === v ? 'on' : ''}`} onClick={() => setFormData({ ...formData, target_date: v })}>{p.label}</button>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  <div className="mk-grid mk-grid-2">
                    <div className="mk-field">
                      <span className="form-label"><FolderOpen size={13} /> Category</span>
                      <Picker
                        value={formData.category_id}
                        options={categoryOptions}
                        onChange={v => setFormData({ ...formData, category_id: v })}
                        placeholder="3 to Thrive"
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

                  {/* Link to a Key Result (optional) — the block's actions drive toward it */}
                  {formData.project_id && keyResults.length > 0 && (
                    <div className="mk-field">
                      <span className="form-label">Key result it drives <span className="mk-optional">optional</span></span>
                      <Picker
                        value={formData.key_result_id}
                        options={krOptions}
                        onChange={v => setFormData({ ...formData, key_result_id: v })}
                        placeholder="Not linked to a key result"
                        header="Key results in this project"
                      />
                    </div>
                  )}
                </div>
              </section>

              {/* 4 — Massive Action Plan */}
            <div className="mk-section cbm-step cbm-step-map">
              <span className="cbm-step-no" aria-hidden="true">4</span>
              <div className="mk-section-head">
                <p className="ui-kicker cbm-map-kicker">
                  <ListChecks size={14} /> Massive Action Plan
                  {actions.length > 0 && <span className="ui-count">{attachedCount}/{actions.length}</span>}
                </p>
                <div className="cbm-map-tools">
                  {actions.length > 0 && (
                    <button type="button" className="cbm-tool" onClick={selectAll}>
                      {allSelected ? 'Clear all' : 'Select all'}
                    </button>
                  )}
                </div>
              </div>

              {attachedCount > 0 && (
                <div className="cbm-plan-strip">
                  <span className="cbm-meta"><ListChecks size={12} />{attachedCount} action{attachedCount === 1 ? '' : 's'} in plan</span>
                  {planMins > 0 && <span className="cbm-meta cbm-meta--muted"><Hourglass size={12} />{fmtMins(planMins)} planned</span>}
                </div>
              )}
              <p className="mk-help">
                Checked actions <strong>are</strong> this block’s plan (they show on the block card). Check to add, uncheck to drop.
              </p>
              <div className="cbm-list">
                {actions.length === 0 ? (
                  <p className="cbm-map-empty">No actions yet. What is the first move that gets this result rolling?</p>
                ) : (
                  [...actions]
                    .sort((a, b) => (selectedActions.includes(b.id) ? 1 : 0) - (selectedActions.includes(a.id) ? 1 : 0))
                    .map((action, idx) => {
                    const isSel = selectedActions.includes(action.id);
                    const dateVal = action.scheduled_date ? String(action.scheduled_date).slice(0, 10) : '';
                    const prio = action.priority || 0;
                    return (
                      <div key={action.id} className={`cbm-action-row mk-p${prio} ${isSel ? 'is-selected' : ''}`}>
                        <div className="cbm-row-main">
                          <span className="cbm-index">{idx + 1}</span>
                          <button
                            type="button"
                            className={`cbm-check ${isSel ? 'checked' : ''}`}
                            onClick={() => toggleAction(action.id)}
                            title={isSel ? 'Attached to this block' : 'Attach to this block'}
                            aria-pressed={isSel}
                          >
                            {isSel && <Check size={14} />}
                          </button>

                          {editingActionId === action.id ? (
                            <input
                              className="cbm-title-input"
                              value={editingTitle}
                              onChange={e => setEditingTitle(e.target.value)}
                              onKeyDown={e => {
                                if (e.key === 'Enter') { e.preventDefault(); saveTitle(action.id); }
                                if (e.key === 'Escape') setEditingActionId(null);
                              }}
                              onBlur={() => saveTitle(action.id)}
                              autoFocus
                            />
                          ) : (
                            <span
                              className="cbm-action-title"
                              onClick={() => { setEditingActionId(action.id); setEditingTitle(action.title); }}
                              title="Click to rename"
                            >
                              {action.title}
                            </span>
                          )}
                        </div>

                        <div className="cbm-row-tools">
                          <Picker
                            className={`cbm-prio-pick mk-p${prio}`}
                            value={prio}
                            options={PRIO_OPTIONS}
                            onChange={v => patchAction(action.id, { priority: Number(v) })}
                            header="Priority"
                            title="Priority"
                          />

                          <label className="cbm-date" title="Day this action appears on the calendar">
                            <CalendarIcon size={13} />
                            <input
                              type="date"
                              value={dateVal}
                              onChange={e => patchAction(action.id, { scheduled_date: e.target.value || null })}
                            />
                          </label>

                          <span className="cbm-row-icons">
                            <button
                              type="button"
                              className="cbm-icon-btn"
                              onClick={() => { setEditingActionId(action.id); setEditingTitle(action.title); }}
                              title="Rename action"
                              aria-label="Rename action"
                            >
                              <Pencil size={14} />
                            </button>
                            <button
                              type="button"
                              className="cbm-icon-btn"
                              onClick={() => { setEditAction(action); setShowActionModal(true); }}
                              title="Priority, reminders & dependencies"
                              aria-label="More settings"
                            >
                              <SlidersHorizontal size={14} />
                            </button>
                            <button
                              type="button"
                              className="cbm-icon-btn cbm-del"
                              onClick={() => removeAction(action.id)}
                              title="Delete action"
                              aria-label="Delete action"
                            >
                              <Trash2 size={14} />
                            </button>
                          </span>
                        </div>
                      </div>
                    );
                  })
                )}
                <button
                  type="button"
                  className={`cbm-add-row ${actions.length === 0 ? 'is-first' : ''}`}
                  onClick={openNewAction}
                >
                  <span className="cbm-add-ico"><Plus size={15} /></span>
                  {actions.length === 0 ? 'Add the first action' : 'Add action'}
                </button>
              </div>
            </div>
            </div>
          </div>

          <div className="modal-footer mk-foot">
            {attachedCount > 0 && <span className="mk-foot-note">{attachedCount} action{attachedCount === 1 ? '' : 's'} in plan</span>}
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={loading || !formData.result_title.trim()}
            >
              <Check size={16} /> {loading ? (isEdit ? 'Updating...' : 'Creating...') : (isEdit ? 'Update block' : 'Create block')}
            </button>
          </div>
        </form>
      </div>

      {/* Create Action Modal */}
      {showActionModal && categories && (
        <CreateActionModal
          onClose={() => { setShowActionModal(false); setEditAction(null); }}
          onSuccess={() => { setEditAction(null); handleActionCreated(); }}
          categories={categories}
          initialData={editAction || {
            category_id: formData.category_id,
            project_id: formData.project_id || null
          }}
        />
      )}
    </div>
  );
}

export default CreateBlockModal;
