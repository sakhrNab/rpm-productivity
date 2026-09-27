import { useState, useEffect, useContext, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ChevronRight, Image, Star, MoreVertical, Plus, Clock,
  FolderOpen, Check, Edit, Copy, X, Trash2,
  Move, Download, ChevronUp, ChevronDown, Archive, ArchiveRestore,
  Sparkles, Eye, Heart, Users, Flag, Rocket, ListChecks, Layers, CheckCircle2,
  Target, CalendarDays, Pencil, List, Zap, Quote, FolderKanban
} from 'lucide-react';
import { AppContext, AuthContext } from '../App';
import CreateActionModal from '../components/modals/CreateActionModal';
import CreateBlockModal from '../components/modals/CreateBlockModal';
import CreateProjectModal from '../components/modals/CreateProjectModal';
import CreateCategoryModal from '../components/modals/CreateCategoryModal';
import { fileToCompressedDataURL } from '../utils/image';
import { useToast } from '../components/ToastProvider';
import CoachPanel from '../components/CoachPanel';
import Picker from '../components/Picker';
import './CategoryDetailPage.css';

// ---- presentational helpers (no data access) ----
const goalItems = (text) => (text || '').split('\n').map(s => s.replace(/^[\s•\-*]+/, '').trim()).filter(Boolean);
const prioClass = (a) => `p${Math.max(0, Math.min(3, Number(a?.priority) || 0))}`;
const fmtDur = (h, m) => {
  const total = (Number(h) || 0) * 60 + (Number(m) || 0);
  if (!total) return '';
  const hh = Math.floor(total / 60), mm = total % 60;
  return hh ? (mm ? `${hh}h ${mm}m` : `${hh}h`) : `${mm}m`;
};
const localDay = (v) => {
  if (!v) return null;
  const d = new Date(`${String(v).slice(0, 10)}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
};
const ACTION_FILTERS = [
  { value: 'all', label: 'View all', icon: <List size={14} /> },
  { value: 'starred', label: 'Starred', icon: <Star size={14} /> },
  { value: 'this_week', label: 'This week', icon: <CalendarDays size={14} /> },
  { value: 'completed', label: 'Completed', icon: <CheckCircle2 size={14} /> },
];

function CategoryDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { categories, refreshData } = useContext(AppContext);
  const { api } = useContext(AuthContext);
  const { showToast } = useToast();
  const [category, setCategory] = useState(null);
  const [activeTab, setActiveTab] = useState('big-picture');
  const [actions, setActions] = useState([]);
  const [filteredActions, setFilteredActions] = useState([]);
  const [actionFilter, setActionFilter] = useState('all');
  const [blocks, setBlocks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingField, setEditingField] = useState(null);
  const [editValue, setEditValue] = useState('');
  const [showActionModal, setShowActionModal] = useState(false);
  const [showBlockModal, setShowBlockModal] = useState(false);
  const [showProjectModal, setShowProjectModal] = useState(false);
  const [archivedOpen, setArchivedOpen] = useState(false);
  const [dragProjectId, setDragProjectId] = useState(null);
  const [dropZone, setDropZone] = useState(null); // 'active' | 'archived' | null
  const [editingAction, setEditingAction] = useState(null);
  const [openActionMenu, setOpenActionMenu] = useState(null);
  const [editingBlock, setEditingBlock] = useState(null);
  const [openBlockMenu, setOpenBlockMenu] = useState(null);
  const [openBlockActionMenu, setOpenBlockActionMenu] = useState(null); // { actionId, top, right } or null
  const [expandedCompleted, setExpandedCompleted] = useState({});
  const [expandedCancelled, setExpandedCancelled] = useState({});
  const [showEditCategory, setShowEditCategory] = useState(false);
  const coverInputRef = useRef(null);

  useEffect(() => {
    loadCategory();
  }, [id]);

  useEffect(() => {
    if (actions.length > 0) {
      applyFilter(actions, actionFilter);
    }
  }, [actionFilter, actions]);

  // Close menus when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (openActionMenu && !event.target.closest('.action-actions')) {
        setOpenActionMenu(null);
      }
      if (openBlockMenu && !event.target.closest('.rpm-block-header')) {
        setOpenBlockMenu(null);
      }
      if (openBlockActionMenu && !event.target.closest('.rpm-block-action') && !event.target.closest('.dropdown-menu')) {
        setOpenBlockActionMenu(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [openActionMenu, openBlockMenu, openBlockActionMenu]);

  const applyFilter = (actionsList, filter) => {
    let filtered = [...actionsList];
    switch (filter) {
      case 'starred':
        filtered = filtered.filter(a => a.is_starred);
        break;
      case 'this_week':
        filtered = filtered.filter(a => a.is_this_week);
        break;
      case 'completed':
        filtered = filtered.filter(a => a.is_completed);
        break;
      case 'all':
      default:
        // Show all actions
        filtered = filtered;
        break;
    }
    setFilteredActions(filtered);
  };

  const loadCategory = async () => {
    try {
      const [categoryData, actionsData, blocksData] = await Promise.all([
        api.getCategory(id),
        api.getActions({ category_id: id }),
        api.getBlocks({ category_id: id })
      ]);
      setCategory(categoryData);
      setActions(actionsData);
      setBlocks(blocksData);
      applyFilter(actionsData, actionFilter);
    } catch (error) {
      console.error('Failed to load category:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleActionSuccess = () => {
    setShowActionModal(false);
    setEditingAction(null);
    loadCategory();
    if (refreshData) refreshData();
  };

  const handleBlockSuccess = () => {
    setShowBlockModal(false);
    setEditingBlock(null);
    loadCategory();
    if (refreshData) refreshData();
  };

  const handleProjectSuccess = () => {
    setShowProjectModal(false);
    loadCategory();
    if (refreshData) refreshData();
  };

  const handleCategorySuccess = () => {
    setShowEditCategory(false);
    loadCategory();
    if (refreshData) refreshData();
  };

  const [coverUploading, setCoverUploading] = useState(false);
  const handleCoverUpload = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setCoverUploading(true);
    try {
      const dataUrl = await fileToCompressedDataURL(file);
      await api.updateCategory(id, { cover_image: dataUrl });
      await loadCategory();
      if (refreshData) refreshData();
      showToast('Cover image updated.', 'success');
    } catch (error) {
      console.error('Failed to upload cover image:', error);
      showToast(error?.message || 'Failed to update the cover image. Please try again.', 'error');
    } finally {
      setCoverUploading(false);
    }
  };

  const handleMoveBlock = (block) => {
    setOpenBlockMenu(null);
    // Reuse the block editor — it has category/project pickers to move the block
    setEditingBlock(block);
    setShowBlockModal(true);
  };

  const handleExportBlock = (block) => {
    setOpenBlockMenu(null);
    try {
      const data = JSON.stringify(block, null, 2);
      const blob = new Blob([data], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `block-${(block.result_title || block.id).toString().replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Failed to export block:', error);
    }
  };

  const handleFieldEdit = (field, value) => {
    setEditingField(field);
    setEditValue(value || '');
  };

  // Keyboard + pointer props for a click-to-edit display element.
  const editable = (field, value, label) => ({
    role: 'button',
    tabIndex: 0,
    title: label,
    onClick: () => handleFieldEdit(field, value),
    onKeyDown: (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleFieldEdit(field, value); }
    },
  });

  // Inline editor for any Big Picture field. Escape cancels, same as the Cancel button.
  const renderEditor = (rows, placeholder, extraClass = '') => (
    <div className="cd-editor">
      <textarea
        value={editValue}
        onChange={e => setEditValue(e.target.value)}
        onKeyDown={e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setEditingField(null); } }}
        className={`form-input cd-editor-input ${extraClass}`}
        rows={rows}
        autoFocus
        placeholder={placeholder}
      />
      <div className="cd-edit-actions">
        <button type="button" className="btn btn-primary" onClick={handleFieldSave}><Check size={15} /> Save</button>
        <button type="button" className="btn btn-secondary" onClick={() => setEditingField(null)}>Cancel</button>
        <span className="cd-edit-hint">Esc to cancel</span>
      </div>
    </div>
  );

  // Render a multi-line text field as a scannable list (one goal per line).
  // Same underlying text field — click to edit as plain multiline text.
  const renderGoalList = (text, field, placeholder, variant = 'numbered') => {
    const items = goalItems(text);
    if (items.length === 0) {
      return (
        <button type="button" className="ui-empty cd-empty-cta" onClick={() => handleFieldEdit(field, text)}>
          {variant === 'check' ? <Rocket size={20} /> : <Flag size={20} />}
          <span>{placeholder}</span>
          <span className="cd-empty-link">Add goals · one per line</span>
        </button>
      );
    }
    return (
      <ol className={`cd-goal-list cd-goal-list--${variant}`} {...editable(field, text, 'Click to edit (one goal per line)')}>
        {items.map((it, i) => (
          <li key={i}>
            <span className="cd-goal-mark" aria-hidden="true">{variant === 'check' ? '' : String(i + 1).padStart(2, '0')}</span>
            <span className="cd-goal-text">{it}</span>
          </li>
        ))}
      </ol>
    );
  };

  const handleFieldSave = async () => {
    if (!editingField) return;
    
    try {
      await api.updateCategoryDetails(id, {
        ...category.details,
        [editingField]: editValue
      });
      await loadCategory();
    } catch (error) {
      console.error('Failed to update:', error);
    }
    setEditingField(null);
  };

  // Optimistic: an action may live in the flat `actions` list and inside a
  // block's `actions`; patch both, persist in the background, resync on error.
  const patchActionEverywhere = (id, patch) => {
    const upd = a => (a.id === id ? { ...a, ...patch } : a);
    setActions(prev => prev.map(upd));
    setBlocks(prev => prev.map(b => ({ ...b, actions: (b.actions || []).map(upd) })));
  };

  const optimisticAction = async (action, patch) => {
    patchActionEverywhere(action.id, patch);
    try {
      await api.updateAction(action.id, patch);
    } catch (error) {
      console.error('Failed to update action:', error);
      await loadCategory();
    }
  };

  const toggleActionComplete = (action) =>
    optimisticAction(action, { is_completed: !action.is_completed });

  const toggleActionStar = (action) =>
    optimisticAction(action, { is_starred: !action.is_starred });

  const toggleThisWeek = async (action) => {
    try {
      await api.updateAction(action.id, { is_this_week: !action.is_this_week });
      await loadCategory();
    } catch (error) {
      console.error('Failed to update action:', error);
    }
  };

  const handleEditAction = (action) => {
    setEditingAction(action);
    setShowActionModal(true);
    setOpenActionMenu(null);
    setOpenBlockActionMenu(null);
  };

  const handleDuplicateAction = async (action) => {
    if (action.is_completed) return; // Don't duplicate completed actions
    try {
      await api.duplicateAction(action.id);
      await loadCategory();
      setOpenActionMenu(null);
      setOpenBlockActionMenu(null);
    } catch (error) {
      console.error('Failed to duplicate action:', error);
    }
  };

  const handleCancelAction = async (action) => {
    try {
      await api.updateAction(action.id, { is_cancelled: true });
      await loadCategory();
      setOpenActionMenu(null);
      setOpenBlockActionMenu(null);
    } catch (error) {
      console.error('Failed to cancel action:', error);
    }
  };

  const handleDeleteAction = async (action) => {
    if (window.confirm('Are you sure you want to delete this action?')) {
      try {
        await api.deleteAction(action.id);
        await loadCategory();
        setOpenActionMenu(null);
        setOpenBlockActionMenu(null);
      } catch (error) {
        console.error('Failed to delete action:', error);
      }
    }
  };

  // Mark a project done → complete it and move it into the Archived dropdown.
  const handleCompleteProject = async (project) => {
    setCategory(prev => prev ? {
      ...prev,
      projects: (prev.projects || []).map(p =>
        p.id === project.id ? { ...p, is_completed: true, is_archived: true } : p
      )
    } : prev);
    setArchivedOpen(true);
    try {
      await api.updateProject(project.id, { is_completed: true, is_archived: true });
    } catch (error) {
      console.error('Failed to complete project:', error);
      await loadCategory();
    }
  };

  const handleArchiveProject = async (project, archived) => {
    // Optimistic: flip the flag locally so the card moves between sections instantly.
    setCategory(prev => prev ? {
      ...prev,
      projects: (prev.projects || []).map(p =>
        p.id === project.id ? { ...p, is_archived: archived } : p
      )
    } : prev);
    if (archived) setArchivedOpen(true);
    try {
      await api.updateProject(project.id, { is_archived: archived });
    } catch (error) {
      console.error('Failed to archive project:', error);
      await loadCategory(); // revert to server truth on failure
    }
  };

  const handleProjectDrop = (targetArchived) => {
    setDropZone(null);
    const id = dragProjectId;
    setDragProjectId(null);
    if (!id) return;
    const project = (category?.projects || []).find(p => p.id === id);
    if (!project || !!project.is_archived === targetArchived) return;
    handleArchiveProject(project, targetArchived);
  };

  // Reorder active project cards (drag one over another). Active-over-active only.
  const projectsAreActiveReorder = (overId) => {
    const dragged = (category?.projects || []).find(p => p.id === dragProjectId);
    const over = (category?.projects || []).find(p => p.id === overId);
    return dragProjectId && dragProjectId !== overId && dragged && over && !dragged.is_archived && !over.is_archived;
  };
  const handleProjectReorderOver = (overId) => {
    if (!projectsAreActiveReorder(overId)) return;
    setCategory(prev => {
      if (!prev) return prev;
      const arr = [...(prev.projects || [])];
      const from = arr.findIndex(p => p.id === dragProjectId);
      const to = arr.findIndex(p => p.id === overId);
      if (from === -1 || to === -1) return prev;
      const [moved] = arr.splice(from, 1);
      arr.splice(to, 0, moved);
      return { ...prev, projects: arr };
    });
  };
  const handleProjectReorderDrop = async () => {
    const ids = (category?.projects || []).filter(p => !p.is_archived).map(p => p.id);
    setDragProjectId(null); setDropZone(null);
    try { await api.reorderProjects(ids); } catch (error) { console.error('Failed to reorder projects:', error); await loadCategory(); }
  };

  const handleRemoveFromBlock = async (action) => {
    try {
      await api.updateAction(action.id, { block_id: null });
      await loadCategory();
      setOpenBlockActionMenu(null);
    } catch (error) {
      console.error('Failed to remove action from block:', error);
    }
  };

  const handleEditBlock = (block) => {
    setEditingBlock(block);
    setShowBlockModal(true);
    setOpenBlockMenu(null);
  };

  const handleDuplicateBlock = async (block) => {
    try {
      // Get block data and duplicate it
      const blockData = {
        category_id: block.category_id,
        project_id: block.project_id,
        result_title: block.result_title + ' (copy)',
        result_description: block.result_description,
        purpose: block.purpose,
        target_date: block.target_date,
        action_ids: block.actions?.map(a => a.id) || []
      };
      await api.createBlock(blockData);
      await loadCategory();
      setOpenBlockMenu(null);
    } catch (error) {
      console.error('Failed to duplicate block:', error);
    }
  };

  const handleCompleteBlock = async (block) => {
    try {
      await api.updateBlock(block.id, { is_completed: true });
      await loadCategory();
      setOpenBlockMenu(null);
    } catch (error) {
      console.error('Failed to complete block:', error);
    }
  };

  const handleAddActionToBlock = (block) => {
    setShowActionModal(true);
    setEditingAction(null);
    // We'll set block_id in the modal
  };

  // Calculate block stats
  const calculateBlockStats = (block) => {
    if (!block.actions || block.actions.length === 0) {
      return { 
        totalDuration: { hours: 0, minutes: 0 }, 
        starredDuration: { hours: 0, minutes: 0 },
        completedCount: 0, 
        cancelledCount: 0 
      };
    }
    
    const totalMinutes = block.actions.reduce((sum, a) => 
      sum + (a.duration_hours || 0) * 60 + (a.duration_minutes || 0), 0
    );
    const totalHours = Math.floor(totalMinutes / 60);
    const totalMins = totalMinutes % 60;
    
    const starredActions = block.actions.filter(a => a.is_starred);
    const starredMinutes = starredActions.reduce((sum, a) => 
      sum + (a.duration_hours || 0) * 60 + (a.duration_minutes || 0), 0
    );
    const starredHours = Math.floor(starredMinutes / 60);
    const starredMins = starredMinutes % 60;
    
    const completedCount = block.actions.filter(a => a.is_completed && !a.is_cancelled).length;
    const cancelledCount = block.actions.filter(a => a.is_cancelled).length;
    
    return {
      totalDuration: { hours: totalHours, minutes: totalMins },
      starredDuration: { hours: starredHours, minutes: starredMins },
      completedCount,
      cancelledCount
    };
  };

  if (loading) {
    return (
      <div className="loading">
        <div className="spinner"></div>
      </div>
    );
  }

  if (!category) {
    return (
      <div className="cd">
        <div className="ui-empty cd-notfound">
          <FolderOpen size={22} />
          <span>Category not found.</span>
          <Link className="btn btn-secondary" to="/categories">Back to categories</Link>
        </div>
      </div>
    );
  }

  const details = category.details || {};

  // ---- Presentational figures, derived only from data this page already loaded ----
  const allProjects = category.projects || [];
  const activeProjects = allProjects.filter(p => !p.is_archived);
  const archivedProjects = allProjects.filter(p => p.is_archived);
  const liveActions = actions.filter(a => !a.is_cancelled);
  const openActions = liveActions.filter(a => !a.is_completed);
  const doneActions = liveActions.filter(a => a.is_completed);
  const weekStart = new Date();
  weekStart.setHours(0, 0, 0, 0);
  weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7));
  const doneThisWeek = doneActions.filter(a => a.completed_at && new Date(a.completed_at) >= weekStart).length;
  const plannedThisWeek = openActions.filter(a => a.is_this_week).length;
  const activeBlocks = blocks.filter(b => !b.is_completed).length;
  const pctDone = liveActions.length ? Math.round((doneActions.length / liveActions.length) * 100) : 0;
  const vision = details.ultimate_vision || category.description || '';
  const roles = (details.roles || '').split(/[,\n;•]+/).map(s => s.trim()).filter(Boolean);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // ---- Rows ----
  const renderActionRow = (action) => {
    const dur = fmtDur(action.duration_hours, action.duration_minutes);
    const menuOpen = openActionMenu === action.id;
    return (
      <div key={action.id} className={`cd-row ${prioClass(action)}${action.is_completed ? ' is-done' : ''}`}>
        <button
          type="button"
          className={`cd-check${action.is_completed ? ' on' : ''}`}
          onClick={() => toggleActionComplete(action)}
          aria-pressed={!!action.is_completed}
          aria-label={action.is_completed ? 'Mark not done' : 'Mark done'}
        >
          {action.is_completed && <Check size={13} strokeWidth={3} />}
        </button>
        <div className="cd-row-main">
          <span className="cd-row-title">{action.title}</span>
          <div className="cd-row-meta">
            {action.project_name && (
              <button
                type="button"
                className="cd-meta cd-meta--link"
                onClick={(e) => {
                  e.stopPropagation();
                  if (action.project_id) navigate(`/projects/${action.project_id}`);
                }}
                title={action.project_name}
              >
                <FolderOpen size={12} />
                <span>{action.project_name}</span>
              </button>
            )}
            <button
              type="button"
              className="cd-meta"
              onClick={(e) => { e.stopPropagation(); handleEditAction(action); }}
              title={`${action.duration_hours}h ${action.duration_minutes}m`}
              aria-label={dur ? `Duration ${dur} — edit` : 'Set duration'}
            >
              <Clock size={12} />
              {dur && <span>{dur}</span>}
            </button>
            <button
              type="button"
              className={`cd-meta cd-week${action.is_this_week ? ' on' : ''}`}
              onClick={(e) => { e.stopPropagation(); toggleThisWeek(action); }}
              aria-pressed={!!action.is_this_week}
            >
              {action.is_this_week ? <CalendarDays size={12} /> : <Plus size={12} />}
              <span>This week</span>
            </button>
          </div>
        </div>
        <div className="action-actions cd-row-end">
          <button
            type="button"
            className={`cd-icon-btn cd-star${action.is_starred ? ' on' : ''}`}
            onClick={(e) => { e.stopPropagation(); toggleActionStar(action); }}
            aria-pressed={!!action.is_starred}
            aria-label={action.is_starred ? 'Unstar' : 'Star'}
          >
            <Star size={15} fill={action.is_starred ? 'currentColor' : 'none'} />
          </button>
          <div className="cd-relative">
            <button
              type="button"
              className={`cd-icon-btn${menuOpen ? ' on' : ''}`}
              onClick={(e) => {
                e.stopPropagation();
                setOpenActionMenu(openActionMenu === action.id ? null : action.id);
              }}
              aria-label="More options"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
            >
              <MoreVertical size={15} />
            </button>
            {menuOpen && (
              <div className="dropdown-menu cd-menu" role="menu" onClick={(e) => e.stopPropagation()}>
                <button type="button" role="menuitem" className="dropdown-item" onClick={() => handleEditAction(action)}>
                  <Edit size={14} />
                  <span>Edit Action</span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="dropdown-item"
                  onClick={() => !action.is_completed && handleDuplicateAction(action)}
                  disabled={action.is_completed}
                  title={action.is_completed ? 'Cannot duplicate completed action' : ''}
                >
                  <Copy size={14} />
                  <span>Duplicate Action</span>
                </button>
                <button type="button" role="menuitem" className="dropdown-item" onClick={() => handleCancelAction(action)}>
                  <X size={14} />
                  <span>Cancel Action</span>
                </button>
                <button type="button" role="menuitem" className="dropdown-item cd-danger" onClick={() => handleDeleteAction(action)}>
                  <Trash2 size={14} />
                  <span>Delete Action</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderBlockActionRow = (action, idx) => {
    const dur = fmtDur(action.duration_hours, action.duration_minutes);
    const menuOpen = !!(openBlockActionMenu && openBlockActionMenu.actionId === action.id);
    return (
      <div key={action.id} className={`rpm-block-action cd-row cd-row--map ${prioClass(action)}`}>
        <span className="cd-idx">{idx + 1}</span>
        <button
          type="button"
          className={`cd-check${action.is_completed ? ' on' : ''}`}
          onClick={() => toggleActionComplete(action)}
          aria-pressed={!!action.is_completed}
          aria-label={action.is_completed ? 'Mark not done' : 'Mark done'}
        >
          {action.is_completed && <Check size={13} strokeWidth={3} />}
        </button>
        <div className="cd-row-main">
          <span className="cd-row-title">{action.title}</span>
          <div className="cd-row-meta">
            <button
              type="button"
              className="cd-meta"
              onClick={(e) => { e.stopPropagation(); handleEditAction(action); }}
              title={`${action.duration_hours}h ${action.duration_minutes}m`}
              aria-label={dur ? `Duration ${dur} — edit` : 'Set duration'}
            >
              <Clock size={12} />
              {dur && <span>{dur}</span>}
            </button>
            <button
              type="button"
              className={`cd-meta cd-week${action.is_this_week ? ' on' : ''}`}
              onClick={(e) => { e.stopPropagation(); toggleThisWeek(action); }}
              aria-pressed={!!action.is_this_week}
            >
              {action.is_this_week ? <CalendarDays size={12} /> : <Plus size={12} />}
              <span>This week</span>
            </button>
          </div>
        </div>
        <div className="cd-row-end">
          <button
            type="button"
            className={`cd-icon-btn cd-star${action.is_starred ? ' on' : ''}`}
            onClick={(e) => { e.stopPropagation(); toggleActionStar(action); }}
            aria-pressed={!!action.is_starred}
            aria-label={action.is_starred ? 'Unstar' : 'Star'}
          >
            <Star size={15} fill={action.is_starred ? 'currentColor' : 'none'} />
          </button>
          <div className="cd-relative-z">
            <button
              type="button"
              className={`cd-icon-btn${menuOpen ? ' on' : ''}`}
              onClick={(e) => {
                e.stopPropagation();
                const rect = e.currentTarget.getBoundingClientRect();
                setOpenBlockActionMenu(openBlockActionMenu === action.id ? null : {
                  actionId: action.id,
                  top: rect.bottom + 4,
                  right: window.innerWidth - rect.right
                });
              }}
              aria-label="More options"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
            >
              <MoreVertical size={15} />
            </button>
            {menuOpen && (
              <div
                className="dropdown-menu cd-menu cd-menu--fixed"
                role="menu"
                style={{ right: `${openBlockActionMenu.right}px`, top: `${openBlockActionMenu.top}px` }}
                onClick={(e) => e.stopPropagation()}
              >
                <button type="button" role="menuitem" className="dropdown-item" onClick={() => handleEditAction(action)}>
                  <Edit size={14} />
                  <span>Edit Action</span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="dropdown-item"
                  onClick={() => !action.is_completed && handleDuplicateAction(action)}
                  disabled={action.is_completed}
                >
                  <Copy size={14} />
                  <span>Duplicate Action</span>
                </button>
                <button type="button" role="menuitem" className="dropdown-item" onClick={() => handleRemoveFromBlock(action)}>
                  <Trash2 size={14} />
                  <span>Remove From Block</span>
                </button>
                <button type="button" role="menuitem" className="dropdown-item" onClick={() => handleCancelAction(action)}>
                  <X size={14} />
                  <span>Cancel Action</span>
                </button>
                <button type="button" role="menuitem" className="dropdown-item cd-danger" onClick={() => handleDeleteAction(action)}>
                  <Trash2 size={14} />
                  <span>Delete Action</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  // ---- Project cards ----
  const renderProjectCard = (project, archived) => {
    const total = Number(project.total_actions) || 0;
    const done = Number(project.completed_actions) || 0;
    const krs = Number(project.total_key_results) || 0;
    const krsDone = Number(project.completed_key_results) || 0;
    const nBlocks = Number(project.total_blocks) || 0;
    const pct = total ? Math.round((done / total) * 100) : 0;
    const result = project.ultimate_result || project.description;
    return (
      <div
        key={project.id}
        className={`cd-proj${archived ? ' is-archived' : ''}${dragProjectId === project.id ? ' cd-dragging' : ''}`}
        draggable
        role="link"
        tabIndex={0}
        aria-label={`Open project ${project.name}`}
        onKeyDown={(e) => { if (e.key === 'Enter' && e.target === e.currentTarget) navigate(`/projects/${project.id}`); }}
        onDragStart={(e) => { setDragProjectId(project.id); e.dataTransfer.effectAllowed = 'move'; }}
        onDragEnd={() => { setDragProjectId(null); setDropZone(null); }}
        onDragOver={!archived ? (e) => { if (projectsAreActiveReorder(project.id)) { e.preventDefault(); handleProjectReorderOver(project.id); } } : undefined}
        onDrop={!archived ? (e) => { if (projectsAreActiveReorder(project.id)) { e.preventDefault(); e.stopPropagation(); handleProjectReorderDrop(); } } : undefined}
        onClick={() => { if (!dragProjectId) navigate(`/projects/${project.id}`); }}
      >
        <div
          className={`cd-proj-cover${project.cover_image ? ' has-img' : ''}`}
          style={project.cover_image ? { backgroundImage: `url(${project.cover_image})` } : undefined}
        />
        <div className="cd-proj-tools">
          {!archived && (
            <button
              type="button"
              className="cd-proj-tool cd-proj-tool--done"
              title="Mark done & archive"
              aria-label="Mark done & archive"
              onClick={(e) => { e.stopPropagation(); handleCompleteProject(project); }}
            >
              <Check size={15} />
            </button>
          )}
          <button
            type="button"
            className="cd-proj-tool"
            title={archived ? 'Restore to active' : 'Archive project'}
            aria-label={archived ? 'Restore to active' : 'Archive project'}
            onClick={(e) => { e.stopPropagation(); handleArchiveProject(project, !archived); }}
          >
            {archived ? <ArchiveRestore size={15} /> : <Archive size={15} />}
          </button>
        </div>
        <div className="cd-proj-body">
          {(project.is_completed || archived) && (
            <div className="cd-proj-flags">
              {project.is_completed
                ? <span className="ui-chip ui-chip--good"><Check size={11} /> Done</span>
                : <span className="ui-chip"><Archive size={11} /> Archived</span>}
            </div>
          )}
          <h3 className="cd-proj-title">{project.name}</h3>
          {result && <p className="cd-proj-result">{result}</p>}
          {total > 0 && (
            <div className="cd-proj-progress">
              <div className="ui-meter"><i style={{ '--pct': `${pct}%` }} /></div>
              <span>{done}/{total}</span>
            </div>
          )}
          {(krs > 0 || nBlocks > 0) && (
            <div className="cd-proj-meta">
              {krs > 0 && <span><Target size={12} /> {krsDone}/{krs} key results</span>}
              {nBlocks > 0 && <span><Layers size={12} /> {nBlocks} {nBlocks === 1 ? 'block' : 'blocks'}</span>}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="cd" style={{ '--cat': category.color || '#4ecdc4' }}>
      {/* ===== Hero ===== */}
      <header className={`cd-hero${category.cover_image ? ' has-cover' : ''}`}>
        {category.cover_image && (
          <div className="cd-hero-cover" style={{ backgroundImage: `url(${category.cover_image})` }} />
        )}
        <div className="cd-hero-top">
          <nav className="cd-crumbs" aria-label="Breadcrumb">
            <Link to="/categories">Categories</Link>
            <ChevronRight size={13} aria-hidden="true" />
            <span className="cd-crumb-cat"><i className="cd-dot" />{category.name}</span>
          </nav>
          <div className="cd-hero-actions">
            <button type="button" className="cd-hero-btn" onClick={() => setShowEditCategory(true)} title="Edit category">
              <Edit size={15} />
              <span>Edit</span>
            </button>
            <button
              type="button"
              className="cd-hero-btn"
              onClick={() => coverInputRef.current?.click()}
              disabled={coverUploading}
              title="Change cover image"
            >
              <Image size={15} />
              <span>{coverUploading ? 'Uploading…' : 'Cover'}</span>
            </button>
          </div>
          <input
            ref={coverInputRef}
            type="file"
            accept="image/*"
            className="cd-hidden"
            onChange={handleCoverUpload}
          />
        </div>

        <div className="cd-hero-body">
          <div className="cd-hero-text">
            <p className="cd-hero-kicker">Area of life</p>
            <h1 className="cd-hero-title ui-title-grad">{category.name}</h1>
            <p className="cd-hero-line">
              {liveActions.length
                ? <><b>{pctDone}%</b> of {liveActions.length} actions done{plannedThisWeek > 0 && <> · <b>{plannedThisWeek}</b> planned this week</>}</>
                : 'No actions yet — start with a project or an RPM block.'}
            </p>
          </div>
          <div className="cd-ring" role="img" aria-label={`${pctDone}% of actions done`}>
            <svg viewBox="0 0 64 64" aria-hidden="true">
              <circle className="cd-ring-bg" cx="32" cy="32" r="27" />
              {pctDone > 0 && <circle className="cd-ring-fg" cx="32" cy="32" r="27" pathLength="100" strokeDasharray="100" strokeDashoffset={100 - pctDone} />}
            </svg>
            <span className="cd-ring-label"><b>{pctDone}%</b><em>done</em></span>
          </div>
        </div>

        <div className="cd-stats">
          <div className="ui-stat"><FolderKanban size={18} /><b>{activeProjects.length}</b><span>active projects</span></div>
          <div className="ui-stat"><ListChecks size={18} /><b>{openActions.length}</b><span>open actions</span></div>
          <div className="ui-stat cd-stat--good"><CheckCircle2 size={18} /><b>{doneThisWeek}</b><span>done this week</span></div>
          <div className="ui-stat"><Layers size={18} /><b>{activeBlocks}</b><span>RPM blocks</span></div>
        </div>
      </header>

      {/* ===== Tabs ===== */}
      <div className="ui-seg cd-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'big-picture'}
          className={activeTab === 'big-picture' ? 'on' : ''}
          onClick={() => setActiveTab('big-picture')}
        >
          <Sparkles size={15} />
          The Big Picture
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'actions'}
          className={activeTab === 'actions' ? 'on' : ''}
          onClick={() => setActiveTab('actions')}
        >
          <ListChecks size={15} />
          Actions &amp; Blocks
          {openActions.length > 0 && <span className="cd-tab-count">{openActions.length}</span>}
        </button>
      </div>

      {activeTab === 'big-picture' ? (
        <div className="cd-bp">
          {/* Ultimate vision — the emotional centre of the area */}
          <section className="ui-card cd-vision">
            <Quote className="cd-vision-glyph" size={96} aria-hidden="true" />
            <p className="ui-kicker"><Eye size={14} /> My ultimate vision</p>
            {editingField === 'ultimate_vision' ? (
              renderEditor(4, 'Living the life that I desire…', 'cd-editor-input--vision')
            ) : vision ? (
              <blockquote className="cd-vision-text cd-editable" {...editable('ultimate_vision', vision, 'Click to edit your ultimate vision')}>
                {vision}
                <Pencil size={14} className="cd-edit-pen" aria-hidden="true" />
              </blockquote>
            ) : (
              <button type="button" className="ui-empty cd-empty-cta" onClick={() => handleFieldEdit('ultimate_vision', '')}>
                <Eye size={20} />
                <span>Describe the future this area of your life is building toward.</span>
                <span className="cd-empty-link">Write your vision</span>
              </button>
            )}
          </section>

          <div className="cd-bp-grid">
            {/* Ultimate purpose */}
            <section className="ui-card cd-purpose">
              <p className="ui-kicker"><Heart size={14} /> My ultimate purpose</p>
              {editingField === 'ultimate_purpose' ? (
                renderEditor(3, 'Why does this matter to you?')
              ) : details.ultimate_purpose ? (
                <p className="cd-purpose-text cd-editable" {...editable('ultimate_purpose', details.ultimate_purpose, 'Click to edit your ultimate purpose')}>
                  {details.ultimate_purpose}
                  <Pencil size={13} className="cd-edit-pen" aria-hidden="true" />
                </p>
              ) : (
                <button type="button" className="ui-empty cd-empty-cta" onClick={() => handleFieldEdit('ultimate_purpose', details.ultimate_purpose)}>
                  <Heart size={20} />
                  <span>Why does this area matter to you? Your purpose is the fuel.</span>
                  <span className="cd-empty-link">Add your purpose</span>
                </button>
              )}
            </section>

            {/* Roles */}
            <section className="ui-card cd-roles">
              <p className="ui-kicker"><Users size={14} /> My roles {roles.length > 0 && <span className="ui-count">{roles.length}</span>}</p>
              {editingField === 'roles' ? (
                renderEditor(3, 'e.g. Runner, Athlete')
              ) : roles.length ? (
                <div className="cd-role-chips cd-editable" {...editable('roles', details.roles, 'Click to edit your roles')}>
                  {roles.map((r, i) => <span key={i} className="cd-role">{r}</span>)}
                  <Pencil size={13} className="cd-edit-pen" aria-hidden="true" />
                </div>
              ) : (
                <button type="button" className="ui-empty cd-empty-cta" onClick={() => handleFieldEdit('roles', details.roles)}>
                  <Users size={20} />
                  <span>Who do you need to be here?</span>
                  <span className="cd-empty-link">Add your roles</span>
                </button>
              )}
            </section>
          </div>

          <div className="cd-bp-grid">
            {/* One year goals */}
            <section className="ui-card cd-goals">
              <p className="ui-kicker">
                <Flag size={14} /> One-year goals
                {goalItems(details.one_year_goals).length > 0 && <span className="ui-count">{goalItems(details.one_year_goals).length}</span>}
              </p>
              {editingField === 'one_year_goals' ? (
                renderEditor(5, 'One goal per line')
              ) : (
                renderGoalList(details.one_year_goals, 'one_year_goals', 'Where will this area be a year from now?', 'numbered')
              )}
            </section>

            {/* 90 day goals */}
            <section className="ui-card cd-goals">
              <p className="ui-kicker">
                <Rocket size={14} /> 90-day goals
                {goalItems(details.ninety_day_goals).length > 0 && <span className="ui-count">{goalItems(details.ninety_day_goals).length}</span>}
              </p>
              {editingField === 'ninety_day_goals' ? (
                renderEditor(5, 'One goal per line')
              ) : (
                renderGoalList(details.ninety_day_goals, 'ninety_day_goals', 'What will you have done in the next 90 days?', 'check')
              )}
            </section>
          </div>

          {/* This category's AI coach */}
          <CoachPanel scope="category" categoryId={id} />

          {/* Projects */}
          <section className="cd-projects">
            <div className="cd-sec-head">
              <p className="ui-kicker">
                <FolderKanban size={14} /> My projects
                {activeProjects.length > 0 && <span className="ui-count">{activeProjects.length}</span>}
              </p>
              <button type="button" className="btn btn-secondary cd-sec-btn" onClick={() => setShowProjectModal(true)}>
                <Plus size={15} />
                New project
              </button>
            </div>

            <div
              className={`cd-proj-grid cd-dropzone${dropZone === 'active' ? ' cd-dropzone-over' : ''}`}
              onDragOver={(e) => { if (dragProjectId) { e.preventDefault(); setDropZone('active'); } }}
              onDragLeave={() => setDropZone(z => (z === 'active' ? null : z))}
              onDrop={(e) => { e.preventDefault(); handleProjectDrop(false); }}
            >
              {activeProjects.map(project => renderProjectCard(project, false))}
              {activeProjects.length === 0 && (
                <div className="ui-empty cd-proj-empty">
                  <FolderOpen size={22} />
                  <span>{archivedProjects.length ? 'No active projects — drop one here to restore it, or create a new one.' : 'No projects yet. A project turns a goal here into a plan.'}</span>
                  <button type="button" className="btn btn-primary" onClick={() => setShowProjectModal(true)}>
                    <Plus size={15} />
                    Create a project
                  </button>
                </div>
              )}
            </div>

            {archivedProjects.length > 0 && (
              <div className="cd-archived">
                <button
                  type="button"
                  className={`cd-archived-toggle${dropZone === 'archived' ? ' cd-dropzone-over' : ''}`}
                  onClick={() => setArchivedOpen(o => !o)}
                  aria-expanded={archivedOpen}
                  onDragOver={(e) => { if (dragProjectId) { e.preventDefault(); setDropZone('archived'); } }}
                  onDragLeave={() => setDropZone(z => (z === 'archived' ? null : z))}
                  onDrop={(e) => { e.preventDefault(); handleProjectDrop(true); }}
                >
                  <Archive size={15} />
                  <span>Archived</span>
                  <span className="cd-archived-count">{archivedProjects.length}</span>
                  <span className="cd-archived-hint">drag a project here to archive</span>
                  {archivedOpen ? <ChevronUp size={16} className="cd-archived-chev" /> : <ChevronDown size={16} className="cd-archived-chev" />}
                </button>
                {archivedOpen && (
                  <div className="cd-proj-grid cd-archived-grid">
                    {archivedProjects.map(project => renderProjectCard(project, true))}
                  </div>
                )}
              </div>
            )}
          </section>
        </div>
      ) : (
        /* ===== Actions and Blocks tab ===== */
        <div className="cd-work">
          {/* Actions */}
          <section className="ui-card cd-panel">
            <div className="cd-panel-head">
              <p className="ui-kicker">
                <ListChecks size={14} /> Actions
                {filteredActions.length > 0 && <span className="ui-count">{filteredActions.length}</span>}
              </p>
              <div className="cd-panel-tools">
                <Picker
                  className="cd-filter"
                  value={actionFilter}
                  onChange={setActionFilter}
                  options={ACTION_FILTERS}
                  header="Show"
                  title="Filter actions"
                />
                <button
                  type="button"
                  className="cd-icon-btn cd-icon-btn--add"
                  aria-label="Add action"
                  title="Add action"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setShowActionModal(true);
                  }}
                >
                  <Plus size={17} />
                </button>
              </div>
            </div>

            {filteredActions.length === 0 ? (
              <div className="ui-empty">
                <ListChecks size={22} />
                <span>{actions.length === 0 ? 'No actions yet. Create your first action!' : 'No actions match the selected filter.'}</span>
                {actions.length === 0 ? (
                  <button type="button" className="btn btn-primary" onClick={() => setShowActionModal(true)}>
                    <Plus size={15} /> Add action
                  </button>
                ) : (
                  <button type="button" className="btn btn-secondary" onClick={() => setActionFilter('all')}>Show all</button>
                )}
              </div>
            ) : (
              <div className="cd-rows">
                {filteredActions.map(renderActionRow)}
              </div>
            )}
          </section>

          {/* RPM Blocks */}
          <section className="cd-blocks">
            <div className="cd-panel-head cd-panel-head--bare">
              <p className="ui-kicker">
                <Layers size={14} /> RPM blocks
                {blocks.length > 0 && <span className="ui-count">{blocks.length}</span>}
              </p>
              <button
                type="button"
                className="cd-icon-btn cd-icon-btn--add"
                aria-label="Add RPM block"
                title="Add RPM block"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setShowBlockModal(true);
                }}
              >
                <Plus size={17} />
              </button>
            </div>

            {blocks.length === 0 ? (
              <div className="ui-empty">
                <Layers size={22} />
                <span>No blocks yet. A block groups actions behind one result and one purpose.</span>
                <button type="button" className="btn btn-primary" onClick={() => setShowBlockModal(true)}>
                  <Plus size={15} /> Create your first block
                </button>
              </div>
            ) : (
              blocks.map(block => {
                const stats = calculateBlockStats(block);
                const blockActions = block.actions || [];
                const completedActions = blockActions.filter(a => a.is_completed && !a.is_cancelled);
                const cancelledActions = blockActions.filter(a => a.is_cancelled);
                const activeActions = blockActions.filter(a => !a.is_completed && !a.is_cancelled);
                const liveCount = completedActions.length + activeActions.length;
                const blockPct = liveCount ? Math.round((completedActions.length / liveCount) * 100) : 0;
                const starredDur = fmtDur(stats.starredDuration.hours, stats.starredDuration.minutes);
                const totalDur = fmtDur(stats.totalDuration.hours, stats.totalDuration.minutes);
                const due = localDay(block.target_date);
                const dueDays = due ? Math.round((due - today) / 86400000) : null;
                const dueTone = !due || block.is_completed ? '' : dueDays < 0 ? ' ui-chip--bad' : dueDays <= 7 ? ' ui-chip--warn' : '';
                const dueText = due
                  ? `${dueDays < 0 && !block.is_completed ? 'Overdue · ' : 'Due '}${due.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`
                  : '';

                return (
                  <article key={block.id} className={`ui-card cd-block${block.is_completed ? ' is-done' : ''}`}>
                    <div className="rpm-block-header cd-block-head">
                      <div className="cd-block-tags">
                        {block.project_name && <span className="ui-chip"><FolderOpen size={11} /> {block.project_name}</span>}
                        {due && <span className={`ui-chip cd-mono${dueTone}`}><CalendarDays size={11} /> {dueText}</span>}
                        {block.is_completed && <span className="ui-chip ui-chip--good"><Check size={11} /> Complete</span>}
                      </div>
                      <div className="cd-block-tools">
                        {starredDur && <span className="cd-dur cd-dur--star" title="Time on starred actions"><Star size={12} fill="currentColor" />{starredDur}</span>}
                        {totalDur && <span className="cd-dur" title="Total planned time"><Clock size={12} />{totalDur}</span>}
                        <div className="cd-relative">
                          <button
                            type="button"
                            className={`cd-icon-btn${openBlockMenu === block.id ? ' on' : ''}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              setOpenBlockMenu(openBlockMenu === block.id ? null : block.id);
                            }}
                            aria-label="Block options"
                            aria-haspopup="menu"
                            aria-expanded={openBlockMenu === block.id}
                          >
                            <MoreVertical size={15} />
                          </button>
                          {openBlockMenu === block.id && (
                            <div className="dropdown-menu cd-menu" role="menu" onClick={(e) => e.stopPropagation()}>
                              <button type="button" role="menuitem" className="dropdown-item" onClick={() => handleEditBlock(block)}>
                                <Edit size={14} />
                                <span>Edit Block</span>
                              </button>
                              <button type="button" role="menuitem" className="dropdown-item" onClick={() => handleDuplicateBlock(block)}>
                                <Copy size={14} />
                                <span>Duplicate Block</span>
                              </button>
                              <button type="button" role="menuitem" className="dropdown-item" onClick={() => handleMoveBlock(block)}>
                                <Move size={14} />
                                <span>Move Block</span>
                              </button>
                              <button type="button" role="menuitem" className="dropdown-item" onClick={() => handleExportBlock(block)}>
                                <Download size={14} />
                                <span>Export Block</span>
                              </button>
                              <button type="button" role="menuitem" className="dropdown-item" onClick={() => handleCompleteBlock(block)}>
                                <Check size={14} />
                                <span>Complete Block</span>
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    <p className="cd-block-kicker">Result</p>
                    <h4 className="cd-block-title">{block.result_title}</h4>
                    {block.purpose && (
                      <p className="cd-block-purpose"><span>Purpose</span>{block.purpose}</p>
                    )}
                    {liveCount > 0 && (
                      <div className="cd-block-progress">
                        <div className="ui-meter"><i style={{ '--pct': `${blockPct}%` }} /></div>
                        <span>{completedActions.length}/{liveCount} done</span>
                      </div>
                    )}

                    {/* Massive Action Plan */}
                    <div className="cd-map">
                      <p className="ui-kicker cd-map-kicker">
                        <Zap size={13} /> Massive action plan
                        {activeActions.length > 0 && <span className="ui-count">{activeActions.length}</span>}
                      </p>
                      {activeActions.length > 0 && (
                        <div className="cd-rows cd-rows--map">
                          {activeActions.map(renderBlockActionRow)}
                        </div>
                      )}
                      <button
                        type="button"
                        className="cd-add-row"
                        onClick={() => {
                          setEditingAction({ block_id: block.id, category_id: block.category_id || id });
                          setShowActionModal(true);
                        }}
                      >
                        <Plus size={14} />
                        Add action
                      </button>
                    </div>

                    {/* Completed / cancelled — only when there is something to show */}
                    {completedActions.length > 0 && (
                      <div className="cd-fold">
                        <button
                          type="button"
                          className="cd-fold-toggle"
                          aria-expanded={!!expandedCompleted[block.id]}
                          onClick={() => setExpandedCompleted(prev => ({ ...prev, [block.id]: !prev[block.id] }))}
                        >
                          <CheckCircle2 size={14} className="cd-fold-ic--good" />
                          <span>{stats.completedCount} completed</span>
                          {expandedCompleted[block.id] ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                        </button>
                        {expandedCompleted[block.id] && completedActions.map((action, idx) => (
                          <div key={action.id} className="rpm-block-action cd-row cd-row--static is-done">
                            <span className="cd-idx">{idx + 1}</span>
                            <span className="cd-check on" aria-hidden="true"><Check size={13} strokeWidth={3} /></span>
                            <span className="cd-row-title">{action.title}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {cancelledActions.length > 0 && (
                      <div className="cd-fold">
                        <button
                          type="button"
                          className="cd-fold-toggle"
                          aria-expanded={!!expandedCancelled[block.id]}
                          onClick={() => setExpandedCancelled(prev => ({ ...prev, [block.id]: !prev[block.id] }))}
                        >
                          <X size={14} className="cd-fold-ic--bad" />
                          <span>{stats.cancelledCount} canceled</span>
                          {expandedCancelled[block.id] ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                        </button>
                        {expandedCancelled[block.id] && cancelledActions.map((action, idx) => (
                          <div key={action.id} className="rpm-block-action cd-row cd-row--static is-done">
                            <span className="cd-idx">{idx + 1}</span>
                            <span className="cd-check cd-check--x" aria-hidden="true"><X size={13} strokeWidth={3} /></span>
                            <span className="cd-row-title">{action.title}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </article>
                );
              })
            )}
          </section>
        </div>
      )}

      {/* Modals */}
      {showActionModal && categories && (
        <CreateActionModal
          onClose={() => {
            setShowActionModal(false);
            setEditingAction(null);
          }}
          onSuccess={handleActionSuccess}
          categories={categories}
          initialData={editingAction ? {
            ...editingAction,
            category_id: editingAction.category_id || id
          } : { category_id: id }}
        />
      )}
      {showBlockModal && categories && (
        <CreateBlockModal
          onClose={() => {
            setShowBlockModal(false);
            setEditingBlock(null);
          }}
          onSuccess={handleBlockSuccess}
          categories={categories}
          initialData={editingBlock ? {
            ...editingBlock,
            category_id: editingBlock.category_id || id
          } : { category_id: id }}
        />
      )}
      {showProjectModal && categories && (
        <CreateProjectModal
          onClose={() => setShowProjectModal(false)}
          onSuccess={handleProjectSuccess}
          categories={categories}
          initialData={{ category_id: id }}
          onCategoriesRefresh={refreshData}
        />
      )}
      {showEditCategory && category && (
        <CreateCategoryModal
          initialData={category}
          onClose={() => setShowEditCategory(false)}
          onSuccess={handleCategorySuccess}
        />
      )}
    </div>
  );
}

export default CategoryDetailPage;
