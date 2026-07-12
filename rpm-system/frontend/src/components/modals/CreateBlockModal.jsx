import { useState, useContext, useEffect } from 'react';
import { Check, Pencil, Trash2, Calendar as CalendarIcon } from 'lucide-react';
import { AppContext, AuthContext } from '../../App';
import { useToast } from '../ToastProvider';
import CreateActionModal from './CreateActionModal';
import './CreateBlockModal.css';

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
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false);
  const [showProjectDropdown, setShowProjectDropdown] = useState(false);
  const [showActionModal, setShowActionModal] = useState(false);
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

  const selectedCategory = categories.find(c => c.id === formData.category_id);
  const selectedProject = projects.find(p => p.id === formData.project_id);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal cbm-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header cbm-header">
          <h3 className="modal-title">{initialData.id ? 'Edit Block' : 'Create a New Block'}</h3>
          <div className="cbm-actions">
            {/* Category Dropdown */}
            <div className="dropdown cbm-relative">
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
            <div className="dropdown cbm-relative">
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
              <label className="form-label cbm-label-pink">RESULT</label>
              <input
                type="text"
                className="form-input cbm-result-input"
                placeholder="A specific, measurable outcome that you are committed to achieving"
                value={formData.result_title}
                onChange={e => setFormData({ ...formData, result_title: e.target.value })}
              />
            </div>

            {/* Purpose */}
            <div className="form-group">
              <label className="form-label cbm-label-pink">PURPOSE</label>
              <input
                type="text"
                className="form-input cbm-purpose-input"
                placeholder="The deeper, emotional reason behind why you want to achieve this result"
                value={formData.purpose}
                onChange={e => setFormData({ ...formData, purpose: e.target.value })}
              />
            </div>

            {/* Link to a Key Result (optional) — the block's actions drive toward it */}
            {formData.project_id && keyResults.length > 0 && (
              <div className="form-group">
                <label className="form-label">Key result this block works toward (optional)</label>
                <select
                  className="form-input"
                  value={formData.key_result_id}
                  onChange={e => setFormData({ ...formData, key_result_id: e.target.value })}
                >
                  <option value="">Not linked to a key result</option>
                  {keyResults.map(kr => (
                    <option key={kr.id} value={kr.id}>{kr.title}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Add Actions to Block */}
            <div className="form-group">
              <div className="cbm-actions-head">
                <label className="form-label cbm-label-flush">ADD ACTIONS TO BLOCK</label>
                <div className="cbm-actions">
                  <button
                    type="button"
                    className="btn btn-secondary cbm-small-btn"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setShowActionModal(true);
                    }}
                  >
                    +
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary cbm-small-btn"
                    onClick={selectAll}
                  >
                    Select All
                  </button>
                </div>
              </div>

              <div className="checkbox-list">
                {actions.length === 0 ? (
                  <div className="cbm-empty">
                    No unassigned actions to attach yet. You can add actions to this
                    block after saving, with the “+ Add Massive Action Plan” button on the block.
                  </div>
                ) : (
                  actions.map(action => {
                    const isSel = selectedActions.includes(action.id);
                    const dateVal = action.scheduled_date ? String(action.scheduled_date).slice(0, 10) : '';
                    return (
                      <div key={action.id} className={`cbm-action-row ${isSel ? 'is-selected' : ''}`}>
                        <button
                          type="button"
                          className={`cbm-check ${isSel ? 'checked' : ''}`}
                          onClick={() => toggleAction(action.id)}
                          title={isSel ? 'Attached to this block' : 'Attach to this block'}
                        >
                          {isSel && <Check size={13} />}
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

                        <label className="cbm-date" title="Day this action appears on the calendar">
                          <CalendarIcon size={13} />
                          <input
                            type="date"
                            value={dateVal}
                            onChange={e => patchAction(action.id, { scheduled_date: e.target.value || null })}
                          />
                        </label>

                        <button
                          type="button"
                          className="cbm-icon-btn"
                          onClick={() => { setEditingActionId(action.id); setEditingTitle(action.title); }}
                          title="Rename action"
                        >
                          <Pencil size={13} />
                        </button>
                        <button
                          type="button"
                          className="cbm-icon-btn cbm-del"
                          onClick={() => removeAction(action.id)}
                          title="Delete action"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    );
                  })
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
