import { useState, useContext, useEffect } from 'react';
import { Check, Pencil, Trash2, Calendar as CalendarIcon, SlidersHorizontal, Target, Compass, FolderOpen, ListChecks, Plus } from 'lucide-react';
import { AppContext, AuthContext } from '../../App';
import { useToast } from '../ToastProvider';
import CreateActionModal from './CreateActionModal';
import ModalHead from './ModalHead';
import Picker from '../Picker';
import './CreateBlockModal.css';

const PRIO_OPTIONS = [0, 1, 2, 3].map(v => ({
  value: v,
  label: ['No prio', 'Low', 'Med', 'High'][v],
  icon: <span className={`mk-dot mk-p${v}`} />,
}));

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
  const krOptions = [
    { value: '', label: 'Not linked to a key result' },
    ...keyResults.map(kr => ({ value: kr.id, label: kr.title })),
  ];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal cbm-modal" onClick={e => e.stopPropagation()}>
        <ModalHead
          icon={Target}
          title={isEdit ? 'Edit RPM block' : 'New RPM block'}
          subtitle="Result → Purpose → Massive Action Plan."
          onClose={onClose}
        />

        <form onSubmit={handleSubmit}>
          <div className="modal-body mk-body">
            {/* Result + Purpose */}
            <div className="mk-section">
              <label className="mk-field">
                <span className="form-label cbm-label-result"><Target size={13} /> Result</span>
                <input
                  type="text"
                  className="form-input mk-hero"
                  placeholder="A specific, measurable outcome you're committed to"
                  value={formData.result_title}
                  onChange={e => setFormData({ ...formData, result_title: e.target.value })}
                />
              </label>
              <label className="mk-field">
                <span className="form-label cbm-label-purpose"><Compass size={13} /> Purpose</span>
                <input
                  type="text"
                  className="form-input"
                  placeholder="The deeper, emotional reason you want this result"
                  value={formData.purpose}
                  onChange={e => setFormData({ ...formData, purpose: e.target.value })}
                />
              </label>
            </div>

            {/* Where it lives */}
            <div className="mk-section">
              <p className="ui-kicker"><FolderOpen size={14} /> Where it lives</p>
              <div className="mk-grid mk-grid-2">
                <div className="mk-field">
                  <span className="form-label">Category</span>
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

            {/* Massive Action Plan */}
            <div className="mk-section">
              <div className="mk-section-head">
                <p className="ui-kicker">
                  <ListChecks size={14} /> Massive Action Plan
                  {actions.length > 0 && <span className="ui-count">{attachedCount}/{actions.length}</span>}
                </p>
                <div className="cbm-map-tools">
                  {actions.length > 0 && (
                    <button type="button" className="cbm-tool" onClick={selectAll}>
                      {allSelected ? 'Clear all' : 'Select all'}
                    </button>
                  )}
                  <button
                    type="button"
                    className="cbm-tool cbm-tool-add"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setShowActionModal(true);
                    }}
                  >
                    <Plus size={14} /> New action
                  </button>
                </div>
              </div>

              <p className="mk-help">
                Checked actions <strong>are</strong> this block’s plan (they show on the block card). Check to add, uncheck to drop.
              </p>
              <div className="cbm-list">
                {actions.length === 0 ? (
                  <div className="ui-empty cbm-empty">
                    <ListChecks size={22} />
                    No actions yet — create the first step of this block’s plan.
                  </div>
                ) : (
                  [...actions]
                    .sort((a, b) => (selectedActions.includes(b.id) ? 1 : 0) - (selectedActions.includes(a.id) ? 1 : 0))
                    .map(action => {
                    const isSel = selectedActions.includes(action.id);
                    const dateVal = action.scheduled_date ? String(action.scheduled_date).slice(0, 10) : '';
                    const prio = action.priority || 0;
                    return (
                      <div key={action.id} className={`cbm-action-row mk-p${prio} ${isSel ? 'is-selected' : ''}`}>
                        <div className="cbm-row-main">
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
              </div>
            </div>
          </div>

          <div className="modal-footer mk-foot">
            {actions.length > 0 && <span className="mk-foot-note">{attachedCount} action{attachedCount === 1 ? '' : 's'} in plan</span>}
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
