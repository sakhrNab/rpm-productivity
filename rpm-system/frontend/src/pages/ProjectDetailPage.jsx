import { useState, useEffect, useContext, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { 
  ChevronLeft, ChevronRight, Image, Plus, Star, MoreVertical, 
  Check, Clock, Hourglass, Calendar as CalendarIcon, Edit, Trash2, X,
  Copy, Move, Download, ChevronUp, ChevronDown, FolderOpen, ExternalLink
} from 'lucide-react';
import { AppContext, AuthContext } from '../App';
import { format, startOfWeek, endOfWeek, eachDayOfInterval, addWeeks, subWeeks } from 'date-fns';
import CreateProjectModal from '../components/modals/CreateProjectModal';
import CreateKeyResultModal from '../components/modals/CreateKeyResultModal';
import CreateCaptureItemModal from '../components/modals/CreateCaptureItemModal';
import CreateBlockModal from '../components/modals/CreateBlockModal';
import CreateActionModal from '../components/modals/CreateActionModal';
import CreateInspirationModal from '../components/modals/CreateInspirationModal';
import InspirationPreviewModal from '../components/modals/InspirationPreviewModal';
import BlockPreviewModal from '../components/modals/BlockPreviewModal';
import { fileToCompressedDataURL } from '../utils/image';
import { useToast } from '../components/ToastProvider';
import './ProjectDetailPage.css';

// Format an API date (a full ISO timestamp for a DATE column) as a friendly
// day, using only the date part so timezone never shifts it by a day.
const fmtDate = (d) => {
  if (!d) return '';
  const datePart = String(d).slice(0, 10);
  const parsed = new Date(`${datePart}T00:00:00`);
  return isNaN(parsed) ? datePart : format(parsed, 'MMM d, yyyy');
};

function ProjectDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { categories, refreshData } = useContext(AppContext);
  const { api } = useContext(AuthContext);
  const { showToast } = useToast();
  const [project, setProject] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('starred');
  const [currentWeek, setCurrentWeek] = useState(new Date());
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingField, setEditingField] = useState(null);
  const [editValue, setEditValue] = useState('');
  const [showKeyResultModal, setShowKeyResultModal] = useState(false);
  const [showCaptureItemModal, setShowCaptureItemModal] = useState(false);
  const [showBlockModal, setShowBlockModal] = useState(false);
  const [editingKeyResult, setEditingKeyResult] = useState(null);
  const [editingCaptureItem, setEditingCaptureItem] = useState(null);
  const [editingBlock, setEditingBlock] = useState(null);
  const [openKeyResultMenu, setOpenKeyResultMenu] = useState(null);
  const [openCaptureItemMenu, setOpenCaptureItemMenu] = useState(null);
  const [openBlockMenu, setOpenBlockMenu] = useState(null); // { blockId, top, right } or null
  const [openBlockActionMenu, setOpenBlockActionMenu] = useState(null);
  const [expandedCompleted, setExpandedCompleted] = useState({});
  const [expandedCancelled, setExpandedCancelled] = useState({});
  const [showActionModal, setShowActionModal] = useState(false);
  const [editingAction, setEditingAction] = useState(null);
  const [draggedBlock, setDraggedBlock] = useState(null);
  const [dragOverBlock, setDragOverBlock] = useState(null);
  const coverInputRef = useRef(null);
  const [showInspirationModal, setShowInspirationModal] = useState(false);
  const [editingInspiration, setEditingInspiration] = useState(null);
  const [previewInspiration, setPreviewInspiration] = useState(null);
  const [previewBlock, setPreviewBlock] = useState(null);
  const [dragActionId, setDragActionId] = useState(null);
  const [dropDay, setDropDay] = useState(null);

  useEffect(() => {
    loadProject();
  }, [id]);

  const [coverUploading, setCoverUploading] = useState(false);
  const handleCoverUpload = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setCoverUploading(true);
    try {
      const dataUrl = await fileToCompressedDataURL(file);
      await api.updateProject(id, { cover_image: dataUrl });
      await loadProject();
      if (refreshData) refreshData();
      showToast('Cover image updated.', 'success');
    } catch (error) {
      console.error('Failed to upload cover image:', error);
      showToast(error?.message || 'Failed to update the cover image. Please try again.', 'error');
    } finally {
      setCoverUploading(false);
    }
  };

  const handleAddInspiration = () => {
    setEditingInspiration(null);
    setShowInspirationModal(true);
  };

  const handleEditInspiration = (item) => {
    setPreviewInspiration(null);
    setEditingInspiration(item);
    setShowInspirationModal(true);
  };

  const handleInspirationSuccess = () => {
    setShowInspirationModal(false);
    setEditingInspiration(null);
    loadProject();
  };

  const handleDeleteInspiration = async (item) => {
    if (!window.confirm('Delete this inspiration item?')) return;
    setPreviewInspiration(null);
    try {
      await api.deleteInspirationItem(item.id);
      await loadProject();
    } catch (error) {
      console.error('Failed to delete inspiration item:', error);
    }
  };

  const loadProject = async () => {
    try {
      const data = await api.getProject(id);
      setProject(data);
    } catch (error) {
      console.error('Failed to load project:', error);
    } finally {
      setLoading(false);
    }
  };

  // Optimistic helpers: update the item in local state immediately (an action
  // can live both in project.actions and inside a block's actions), persist in
  // the background, and reload to resync if the request fails.
  const patchActionEverywhere = (id, patch) =>
    setProject(prev => {
      if (!prev) return prev;
      const upd = a => (a.id === id ? { ...a, ...patch } : a);
      return {
        ...prev,
        actions: (prev.actions || []).map(upd),
        rpm_blocks: (prev.rpm_blocks || []).map(b => ({ ...b, actions: (b.actions || []).map(upd) })),
      };
    });

  const optimisticAction = async (action, patch) => {
    patchActionEverywhere(action.id, patch);
    try {
      await api.updateAction(action.id, patch);
    } catch (error) {
      console.error('Failed to update action:', error);
      await loadProject();
    }
  };

  const toggleActionComplete = (action) =>
    optimisticAction(action, { is_completed: !action.is_completed });

  const toggleActionStar = (action) =>
    optimisticAction(action, { is_starred: !(action.is_starred === true) });

  const toggleThisWeek = (action) =>
    optimisticAction(action, { is_this_week: !action.is_this_week });

  const handleEditAction = (action) => {
    setEditingAction(action);
    setShowActionModal(true);
    setOpenBlockActionMenu(null);
  };

  const handleDuplicateAction = async (action) => {
    if (action.is_completed) return;
    try {
      await api.duplicateAction(action.id);
      await loadProject();
      setOpenBlockActionMenu(null);
    } catch (error) {
      console.error('Failed to duplicate action:', error);
    }
  };

  const handleRemoveFromBlock = async (action) => {
    try {
      await api.updateAction(action.id, { block_id: null });
      await loadProject();
      setOpenBlockActionMenu(null);
    } catch (error) {
      console.error('Failed to remove action from block:', error);
    }
  };

  const handleCancelAction = async (action) => {
    try {
      await api.updateAction(action.id, { is_cancelled: true });
      await loadProject();
      setOpenBlockActionMenu(null);
    } catch (error) {
      console.error('Failed to cancel action:', error);
    }
  };

  const handleDeleteAction = async (action) => {
    if (window.confirm('Are you sure you want to delete this action?')) {
      try {
        await api.deleteAction(action.id);
        await loadProject();
        setOpenBlockActionMenu(null);
      } catch (error) {
        console.error('Failed to delete action:', error);
      }
    }
  };

  const handleEditBlock = (block) => {
    setEditingBlock(block);
    setShowBlockModal(true);
    setOpenBlockMenu(null);
  };

  const handleDuplicateBlock = async (block) => {
    try {
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
      await loadProject();
      setOpenBlockMenu(null);
    } catch (error) {
      console.error('Failed to duplicate block:', error);
    }
  };

  const handleCompleteBlock = async (block) => {
    try {
      await api.updateBlock(block.id, { is_completed: true });
      await loadProject();
      setOpenBlockMenu(null);
    } catch (error) {
      console.error('Failed to complete block:', error);
    }
  };

  // Calculate block stats
  const calculateBlockStats = (block) => {
    if (!block.actions || block.actions.length === 0) {
      return { 
        totalDuration: { hours: 0, minutes: 0 }, 
        remainingDuration: { hours: 0, minutes: 0 },
        completedCount: 0, 
        cancelledCount: 0 
      };
    }
    
    const totalMinutes = block.actions.reduce((sum, a) => 
      sum + (a.duration_hours || 0) * 60 + (a.duration_minutes || 0), 0
    );
    const totalHours = Math.floor(totalMinutes / 60);
    const totalMins = totalMinutes % 60;
    
    // Calculate remaining duration (only for non-completed actions)
    const remainingActions = block.actions.filter(a => !a.is_completed && !a.is_cancelled);
    const remainingMinutes = remainingActions.reduce((sum, a) => 
      sum + (a.duration_hours || 0) * 60 + (a.duration_minutes || 0), 0
    );
    const remainingHours = Math.floor(remainingMinutes / 60);
    const remainingMins = remainingMinutes % 60;
    
    const completedCount = block.actions.filter(a => a.is_completed && !a.is_cancelled).length;
    const cancelledCount = block.actions.filter(a => a.is_cancelled).length;
    
    return {
      totalDuration: { hours: totalHours, minutes: totalMins },
      remainingDuration: { hours: remainingHours, minutes: remainingMins },
      completedCount,
      cancelledCount
    };
  };

  const handleFieldEdit = (field, value) => {
    setEditingField(field);
    setEditValue(value || '');
  };

  const handleFieldSave = async (field) => {
    if (!project) return;
    try {
      await api.updateProject(project.id, { [field]: editValue });
      await loadProject();
      if (refreshData) refreshData();
    } catch (error) {
      console.error('Failed to update project:', error);
    }
    setEditingField(null);
    setEditValue('');
  };

  const handleProjectEdit = () => {
    setShowEditModal(true);
  };

  const handleProjectUpdate = () => {
    setShowEditModal(false);
    loadProject();
    if (refreshData) refreshData();
  };

  const handleKeyResultSuccess = () => {
    setShowKeyResultModal(false);
    setEditingKeyResult(null);
    loadProject();
  };

  const handleCaptureItemSuccess = () => {
    setShowCaptureItemModal(false);
    setEditingCaptureItem(null);
    loadProject();
  };

  const handleBlockSuccess = () => {
    setShowBlockModal(false);
    setEditingBlock(null);
    loadProject();
    if (refreshData) refreshData();
  };

  const handleActionSuccess = () => {
    setShowActionModal(false);
    setEditingAction(null);
    loadProject();
    if (refreshData) refreshData();
  };

  const handleDragStart = (e, block) => {
    setDraggedBlock(block);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/html', block.id);
  };

  const handleDragOver = (e, block) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (draggedBlock && draggedBlock.id !== block.id) {
      setDragOverBlock(block.id);
    }
  };

  const handleDragLeave = () => {
    setDragOverBlock(null);
  };

  const handleDrop = async (e, targetBlock) => {
    e.preventDefault();
    setDragOverBlock(null);
    
    if (!draggedBlock || !targetBlock || draggedBlock.id === targetBlock.id) {
      setDraggedBlock(null);
      return;
    }

    try {
      const blocks = [...(project.rpm_blocks || [])];
      const draggedIndex = blocks.findIndex(b => b.id === draggedBlock.id);
      const targetIndex = blocks.findIndex(b => b.id === targetBlock.id);
      
      if (draggedIndex === -1 || targetIndex === -1) {
        setDraggedBlock(null);
        return;
      }

      // Remove dragged block and insert at new position
      const [removed] = blocks.splice(draggedIndex, 1);
      blocks.splice(targetIndex, 0, removed);

      // Update sort_order for all affected blocks
      const updatePromises = blocks.map((block, index) => 
        api.updateBlock(block.id, { sort_order: index })
      );
      
      await Promise.all(updatePromises);
      await loadProject();
      setDraggedBlock(null);
    } catch (error) {
      console.error('Failed to reorder blocks:', error);
      setDraggedBlock(null);
    }
  };

  const handleDragEnd = () => {
    setDraggedBlock(null);
    setDragOverBlock(null);
  };

  const patchListItem = (listKey, id, patch) =>
    setProject(prev => (prev ? { ...prev, [listKey]: (prev[listKey] || []).map(x => (x.id === id ? { ...x, ...patch } : x)) } : prev));

  const toggleKeyResultStar = async (keyResult) => {
    const next = !keyResult.is_starred;
    patchListItem('key_results', keyResult.id, { is_starred: next });
    try {
      await api.updateKeyResult(keyResult.id, { is_starred: next });
    } catch (error) {
      console.error('Failed to update key result:', error);
      await loadProject();
    }
  };

  const handleUpdateKeyResultProgress = async (keyResult, rawValue) => {
    let value = rawValue === '' || rawValue === null ? 0 : Number(rawValue);
    if (Number.isNaN(value)) return;
    value = Math.max(0, value);
    if (value === (Number(keyResult.current_value) || 0)) return; // no change
    const target = Number(keyResult.target_value);
    const nowDone = !Number.isNaN(target) && target > 0 && value >= target;
    patchListItem('key_results', keyResult.id, { current_value: value, ...(nowDone ? { is_completed: true } : {}) });
    try {
      await api.updateKeyResult(keyResult.id, { current_value: value, ...(nowDone ? { is_completed: true } : {}) });
    } catch (error) {
      console.error('Failed to update progress:', error);
      showToast('Could not update progress. Please try again.', 'error');
      await loadProject();
    }
  };

  const handleEditKeyResult = (keyResult) => {
    setEditingKeyResult(keyResult);
    setShowKeyResultModal(true);
    setOpenKeyResultMenu(null);
  };

  const handleDeleteKeyResult = async (keyResult) => {
    if (window.confirm('Are you sure you want to delete this key result?')) {
      try {
        await api.deleteKeyResult(keyResult.id);
        await loadProject();
        setOpenKeyResultMenu(null);
      } catch (error) {
        console.error('Failed to delete key result:', error);
      }
    }
  };

  const toggleCaptureItemStar = async (captureItem) => {
    const next = !captureItem.is_starred;
    patchListItem('capture_items', captureItem.id, { is_starred: next });
    try {
      await api.updateCaptureItem(captureItem.id, { is_starred: next });
    } catch (error) {
      console.error('Failed to update capture item:', error);
      await loadProject();
    }
  };

  const handleEditCaptureItem = (captureItem) => {
    setEditingCaptureItem(captureItem);
    setShowCaptureItemModal(true);
    setOpenCaptureItemMenu(null);
  };

  const handleDeleteCaptureItem = async (captureItem) => {
    if (window.confirm('Are you sure you want to delete this capture item?')) {
      try {
        await api.deleteCaptureItem(captureItem.id);
        await loadProject();
        setOpenCaptureItemMenu(null);
      } catch (error) {
        console.error('Failed to delete capture item:', error);
      }
    }
  };

  // Close menus when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (openKeyResultMenu && !event.target.closest('.key-result-actions')) {
        setOpenKeyResultMenu(null);
      }
      if (openCaptureItemMenu && !event.target.closest('.capture-actions')) {
        setOpenCaptureItemMenu(null);
      }
      if (openBlockMenu && !event.target.closest('.rpm-block-header') && !event.target.closest('.dropdown-menu')) {
        setOpenBlockMenu(null);
      }
      if (openBlockActionMenu && !event.target.closest('.rpm-block-action') && !event.target.closest('.dropdown-menu')) {
        setOpenBlockActionMenu(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [openKeyResultMenu, openCaptureItemMenu, openBlockMenu, openBlockActionMenu]);

  if (loading) {
    return <div className="loading"><div className="spinner"></div></div>;
  }

  if (!project) {
    return <div>Project not found</div>;
  }

  const category = categories.find(c => c.id === project.category_id);
  const weekStart = startOfWeek(currentWeek, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(currentWeek, { weekStartsOn: 1 });
  const weekDays = eachDayOfInterval({ start: weekStart, end: weekEnd });

  const starredActions = project.actions?.filter(a => a.is_starred && !a.is_completed) || [];
  const allActions = project.actions || [];

  // Get actions for a specific day (scheduled_date may be an ISO timestamp)
  const getActionsForDay = (day) => {
    if (!project.actions) return [];
    const dayStr = format(day, 'yyyy-MM-dd');
    return project.actions.filter(a => a.scheduled_date && String(a.scheduled_date).slice(0, 10) === dayStr);
  };

  // Actions with no date yet — shown in the planner's "Unscheduled" strip
  const unscheduledActions = (project.actions || []).filter(a => !a.scheduled_date && !a.is_completed && !a.is_cancelled);

  const handleScheduleAction = async (actionId, dateStr) => {
    const action = (project.actions || []).find(a => a.id === actionId);
    if (!action || String(action.scheduled_date || '').slice(0, 10) === dateStr) return;
    patchListItem('actions', actionId, { scheduled_date: dateStr });
    try {
      await api.updateAction(actionId, { scheduled_date: dateStr });
      showToast(`Scheduled for ${format(new Date(dateStr + 'T00:00:00'), 'MMM d')}.`, 'success');
    } catch (error) {
      console.error('Failed to schedule action:', error);
      showToast('Could not schedule that action. Please try again.', 'error');
      await loadProject();
    }
  };

  return (
    <div>
      {/* Breadcrumb */}
      <div className="page-breadcrumb">
        <Link to="/categories">Categories</Link>
        <ChevronLeft size={14} className="pd-breadcrumb-chevron" />
        {category && <Link to={`/categories/${category.id}`}>{category.name}</Link>}
        <ChevronLeft size={14} className="pd-breadcrumb-chevron" />
        <span>{project.name}</span>
      </div>

      {/* Header */}
      <div className="project-header">
        <div 
          className="project-header-bg"
          style={{ 
            backgroundImage: project.cover_image 
              ? `url(${project.cover_image})` 
              : 'linear-gradient(135deg, #1a2d4a 0%, #0d1d35 100%)'
          }}
        />
        <div className="project-header-overlay" />
        <div className="project-header-content">
          <div className="pd-cover-actions">
            <button 
              type="button"
              className="btn btn-secondary"
              onClick={handleProjectEdit}
            >
              <Edit size={14} />
              Edit Project
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => coverInputRef.current?.click()}
              disabled={coverUploading}
            >
              <Image size={14} />
              {coverUploading ? 'Uploading…' : 'Change Cover Image'}
            </button>
          </div>
          <input
            ref={coverInputRef}
            type="file"
            accept="image/*"
            className="pd-hidden"
            onChange={handleCoverUpload}
          />
          
          {category && (
            <div style={{ 
              display: 'inline-flex', 
              alignItems: 'center', 
              gap: '8px',
              background: category.color + '30',
              padding: '4px 12px',
              borderRadius: '4px',
              marginBottom: '12px'
            }}>
              <span style={{ 
                width: 8, 
                height: 8, 
                borderRadius: '50%', 
                background: category.color 
              }} />
              <span style={{ fontSize: '0.75rem', color: category.color }}>{category.name}</span>
            </div>
          )}
          
          <h1 className="pd-title-heading">
            {editingField === 'name' ? (
              <input
                type="text"
                value={editValue}
                onChange={e => setEditValue(e.target.value)}
                onBlur={() => handleFieldSave('name')}
                onKeyDown={e => {
                  if (e.key === 'Enter') handleFieldSave('name');
                  if (e.key === 'Escape') setEditingField(null);
                }}
                autoFocus
                className="pd-title-input"
              />
            ) : (
              <span
                onClick={() => handleFieldEdit('name', project.name)}
                className="pd-clickable"
              >
                {project.name}
              </span>
            )}
          </h1>
        </div>
      </div>

      {/* Actions Tabs */}
      <div className="pd-tabs">
        <button 
          className={`category-tab ${activeTab === 'starred' ? 'active' : ''} pd-flex-center-gap8`}
          onClick={() => setActiveTab('starred')}
        >
          <Star size={14} />
          Starred Actions
        </button>
        <button 
          className={`category-tab ${activeTab === 'all' ? 'active' : ''}`}
          onClick={() => setActiveTab('all')}
        >
          All Actions
        </button>
      </div>

      {/* Project Sections */}
      <div className="project-sections">
        {/* Ultimate Result */}
        <div className="project-section pd-hero pd-hero-result">
          <div className="project-section-header">
            <div className="project-section-icon pd-section-icon-pink">
              🎯
            </div>
            <span className="project-section-label pd-section-label-pink">
              ULTIMATE RESULT
            </span>
          </div>
          {editingField === 'ultimate_result' ? (
            <textarea
              value={editValue}
              onChange={e => setEditValue(e.target.value)}
              onBlur={() => handleFieldSave('ultimate_result')}
              onKeyDown={e => {
                if (e.key === 'Escape') setEditingField(null);
              }}
              autoFocus
              className="pd-field-textarea"
            />
          ) : (
            <p
              className="pd-field-text"
              onClick={() => handleFieldEdit('ultimate_result', project.ultimate_result)}
            >
              {project.ultimate_result || 'Click to add ultimate result...'}
            </p>
          )}
        </div>

        {/* Ultimate Purpose */}
        <div className="project-section pd-hero pd-hero-purpose">
          <div className="project-section-header">
            <div className="project-section-icon pd-section-icon-pink">
              💡
            </div>
            <span className="project-section-label pd-section-label-pink">
              ULTIMATE PURPOSE
            </span>
          </div>
          {editingField === 'ultimate_purpose' ? (
            <textarea
              value={editValue}
              onChange={e => setEditValue(e.target.value)}
              onBlur={() => handleFieldSave('ultimate_purpose')}
              onKeyDown={e => {
                if (e.key === 'Escape') setEditingField(null);
              }}
              autoFocus
              className="pd-field-textarea"
            />
          ) : (
            <p
              className="pd-field-text"
              onClick={() => handleFieldEdit('ultimate_purpose', project.ultimate_purpose)}
            >
              {project.ultimate_purpose || 'Click to add ultimate purpose...'}
            </p>
          )}
        </div>
      </div>

      {/* Key Results & Capture List Row */}
      <div className="project-sections">
        {/* Key Results */}
        <div className="project-section">
          <div className="project-section-header">
            <div className="project-section-icon pd-section-icon-pink">
              📊
            </div>
            <span className="project-section-label pd-section-label-pink">
              KEY RESULTS
            </span>
            <button 
              type="button"
              className="btn btn-icon btn-ghost pd-ml-auto"
              onClick={(e) => {
                e.stopPropagation();
                setEditingKeyResult(null);
                setShowKeyResultModal(true);
              }}
            >
              <Plus size={14} />
            </button>
          </div>
          
          {project.key_results?.length === 0 ? (
            <p className="pd-text-muted">No key results yet</p>
          ) : (
            <div className="kr-list">
              {project.key_results?.map((kr, idx) => {
                const target = Number(kr.target_value);
                const current = Number(kr.current_value) || 0;
                const hasTarget = kr.target_value !== null && kr.target_value !== undefined && kr.target_value !== '' && !Number.isNaN(target) && target > 0;
                const pct = hasTarget ? Math.max(0, Math.min(100, Math.round((current / target) * 100))) : null;
                const done = Boolean(kr.is_completed) || (hasTarget && pct >= 100);
                return (
                  <div
                    key={kr.id}
                    className={`kr-card pd-clickable ${done ? 'kr-card-done' : ''}`}
                    onClick={() => handleEditKeyResult(kr)}
                    title="Open key result"
                  >
                    <div className="kr-card-head">
                      <div className="kr-num">{done ? <Check size={13} /> : idx + 1}</div>
                      <div className="kr-title">{kr.title}</div>
                      <div className="key-result-actions pd-item-actions">
                        <button
                          type="button"
                          className="btn btn-icon btn-ghost"
                          onClick={(e) => { e.stopPropagation(); toggleKeyResultStar(kr); }}
                          style={{ color: kr.is_starred ? 'var(--accent-orange)' : 'var(--text-muted)', padding: '2px' }}
                        >
                          <Star size={12} fill={kr.is_starred ? 'currentColor' : 'none'} />
                        </button>
                        <div className="pd-relative">
                          <button
                            type="button"
                            className="btn btn-icon btn-ghost pd-icon-pad"
                            onClick={(e) => { e.stopPropagation(); setOpenKeyResultMenu(openKeyResultMenu === kr.id ? null : kr.id); }}
                          >
                            <MoreVertical size={12} />
                          </button>
                          {openKeyResultMenu === kr.id && (
                            <div className="dropdown-menu pd-dropdown-abs" onClick={(e) => e.stopPropagation()}>
                              <div className="dropdown-item" onClick={() => handleEditKeyResult(kr)}>
                                <Edit size={14} /><span>Edit Key Result</span>
                              </div>
                              <div className="dropdown-item pd-text-red" onClick={() => handleDeleteKeyResult(kr)}>
                                <Trash2 size={14} /><span>Delete Key Result</span>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {hasTarget && (
                      <div className="kr-progress" onClick={(e) => e.stopPropagation()}>
                        <div className="kr-track"><span className="kr-fill" style={{ width: `${pct}%` }} /></div>
                        <div className="kr-progress-meta">
                          <div className="kr-editor" title="Update progress">
                            <button
                              type="button"
                              className="kr-step"
                              aria-label="Decrease progress"
                              onClick={() => handleUpdateKeyResultProgress(kr, current - 1)}
                            >−</button>
                            <input
                              type="number"
                              key={`kr-cur-${kr.id}-${current}`}
                              className="kr-current-input"
                              defaultValue={current}
                              min={0}
                              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); } }}
                              onBlur={(e) => handleUpdateKeyResultProgress(kr, e.target.value)}
                            />
                            <span className="kr-sep">/</span>
                            <span className="kr-target-val">{target}{kr.unit ? ` ${kr.unit}` : ''}</span>
                            <button
                              type="button"
                              className="kr-step"
                              aria-label="Increase progress"
                              onClick={() => handleUpdateKeyResultProgress(kr, current + 1)}
                            >+</button>
                          </div>
                          <span className="kr-pct">{pct}%</span>
                        </div>
                      </div>
                    )}

                    {kr.target_date && (
                      <div className="kr-foot"><CalendarIcon size={12} /> {fmtDate(kr.target_date)}</div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Capture List */}
        <div className="project-section">
          <div className="project-section-header">
            <div className="project-section-icon pd-section-icon-cyan">
              📝
            </div>
            <span className="project-section-label pd-section-label-cyan">
              CAPTURE LIST
            </span>
            <button 
              type="button"
              className="btn btn-icon btn-ghost pd-ml-auto"
              onClick={(e) => {
                e.stopPropagation();
                setEditingCaptureItem(null);
                setShowCaptureItemModal(true);
              }}
            >
              <Plus size={14} />
            </button>
          </div>
          
          {project.capture_items?.length === 0 ? (
            <p className="pd-text-muted">No capture items yet</p>
          ) : (
            project.capture_items?.map((item, idx) => (
              <div key={item.id} className="capture-item">
                <span className="capture-number">{idx + 1}</span>
                <span className="capture-title">{item.title}</span>
                <div className="capture-actions pd-item-actions">
                  <button 
                    type="button"
                    className="btn btn-icon btn-ghost"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleCaptureItemStar(item);
                    }}
                    style={{ 
                      color: item.is_starred ? 'var(--accent-orange)' : 'var(--text-muted)',
                      padding: '2px'
                    }}
                  >
                    <Star size={12} fill={item.is_starred ? 'currentColor' : 'none'} />
                  </button>
                  <div className="pd-relative">
                    <button
                      type="button"
                      className="btn btn-icon btn-ghost pd-icon-pad"
                      onClick={(e) => {
                        e.stopPropagation();
                        setOpenCaptureItemMenu(openCaptureItemMenu === item.id ? null : item.id);
                      }}
                    >
                      <MoreVertical size={12} />
                    </button>
                    
                    {openCaptureItemMenu === item.id && (
                      <div
                        className="dropdown-menu pd-dropdown-abs"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div 
                          className="dropdown-item"
                          onClick={() => handleEditCaptureItem(item)}
                        >
                          <Edit size={14} />
                          <span>Edit Capture Item</span>
                        </div>
                        <div 
                          className="dropdown-item pd-text-red"
                          onClick={() => handleDeleteCaptureItem(item)}
                        >
                          <Trash2 size={14} />
                          <span>Delete Capture Item</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Inspiration Board */}
      <div className="project-section pd-mt-24">
        <div className="project-section-header">
          <span className="project-section-label">Inspiration Board</span>
          <button
            type="button"
            className="btn btn-icon btn-ghost pd-ml-auto"
            onClick={handleAddInspiration}
          >
            <Plus size={14} />
          </button>
        </div>
        <div className="pd-mood-grid">
          {project.inspiration_items?.map(item => (
            <button
              key={item.id}
              type="button"
              className="pd-mood-card"
              onClick={() => setPreviewInspiration(item)}
              title={item.title || 'Open'}
              style={item.image_url ? { backgroundImage: `url(${item.image_url})` } : undefined}
            >
              {!item.image_url && <span className="pd-mood-noimg"><Image size={26} /></span>}
              <span className="pd-mood-overlay">
                <span className="pd-mood-title">{item.title || 'Untitled'}</span>
                {item.link_url && <span className="pd-mood-badge"><ExternalLink size={12} /></span>}
              </span>
              <span
                className="pd-mood-del"
                role="button"
                aria-label="Delete inspiration item"
                onClick={(e) => { e.stopPropagation(); handleDeleteInspiration(item); }}
              >
                <Trash2 size={13} />
              </span>
            </button>
          ))}

          {/* Add tile */}
          <button type="button" className="pd-mood-add" onClick={handleAddInspiration}>
            <Plus size={22} />
            <span>Add inspiration</span>
          </button>
        </div>
      </div>

      {/* RPM Blocks Section */}
      <div className="project-section pd-mt-24">
        <div className="project-section-header">
          <span className="project-section-label">RPM Blocks</span>
          <button 
            type="button"
            className="btn btn-icon btn-ghost pd-ml-auto"
            onClick={(e) => {
              e.stopPropagation();
              setEditingBlock(null);
              setShowBlockModal(true);
            }}
          >
            <Plus size={14} />
          </button>
        </div>

        <div className="pd-blocks-grid">
          {project.rpm_blocks?.map(block => {
            // Fallback: if block.actions is not populated, filter from project.actions
            const blockActions = block.actions && block.actions.length > 0 
              ? block.actions 
              : (project.actions || []).filter(a => a.block_id === block.id);
            
            const stats = calculateBlockStats({ ...block, actions: blockActions });
            const completedActions = blockActions.filter(a => a.is_completed && !a.is_cancelled);
            const cancelledActions = blockActions.filter(a => a.is_cancelled);
            const activeActions = blockActions.filter(a => !a.is_completed && !a.is_cancelled);
            
            return (
              <div 
                key={block.id} 
                className="rpm-block"
                draggable
                onDragStart={(e) => handleDragStart(e, block)}
                onDragOver={(e) => handleDragOver(e, block)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, block)}
                onDragEnd={handleDragEnd}
                style={{
                  cursor: 'move',
                  opacity: draggedBlock?.id === block.id ? 0.5 : 1,
                  border: dragOverBlock === block.id ? '2px dashed var(--accent-cyan)' : '1px solid var(--border-primary)',
                  transition: 'all 0.2s ease'
                }}
              >
                <div className="rpm-block-header">
                  <div className="rpm-block-badge">
                    <span style={{ 
                      width: 8, 
                      height: 8, 
                      borderRadius: '50%', 
                      background: category?.color || 'var(--accent-pink)' 
                    }} />
                    {category?.name || 'Category'}
                  </div>
                  <div className="pd-flex-center-gap8">
                    {/* Time Remaining (Left) */}
                    <div className="pd-flex-center-gap4-sm">
                      <Clock size={14} />
                      <span>
                        {stats.remainingDuration.hours > 0 ? `${stats.remainingDuration.hours}h ` : ''}
                        {stats.remainingDuration.minutes}m
                      </span>
                    </div>
                    {/* Total Duration (Right) */}
                    <div className="pd-flex-center-gap4-sm">
                      <Hourglass size={14} />
                      <span>
                        {stats.totalDuration.hours > 0 ? `${stats.totalDuration.hours}h ` : ''}
                        {stats.totalDuration.minutes}m
                      </span>
                    </div>
                    {/* Block Menu */}
                    <div className="pd-relative-z1000">
                      <button 
                        type="button"
                        className="btn btn-icon btn-ghost"
                        onClick={(e) => {
                          e.stopPropagation();
                          const rect = e.currentTarget.getBoundingClientRect();
                          setOpenBlockMenu(openBlockMenu === block.id ? null : {
                            blockId: block.id,
                            top: rect.bottom + 4,
                            right: window.innerWidth - rect.right
                          });
                        }}
                      >
                        <MoreVertical size={14} />
                      </button>
                      
                      {openBlockMenu && openBlockMenu.blockId === block.id && (
                        <div 
                          className="dropdown-menu"
                          style={{ 
                            position: 'fixed',
                            right: `${openBlockMenu.right}px`,
                            top: `${openBlockMenu.top}px`,
                            minWidth: '180px',
                            zIndex: 10000,
                            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)'
                          }}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div 
                            className="dropdown-item"
                            onClick={() => {
                              handleEditBlock(block);
                              setOpenBlockMenu(null);
                            }}
                          >
                            <Edit size={14} />
                            <span>Edit Block</span>
                          </div>
                          <div 
                            className="dropdown-item"
                            onClick={() => {
                              handleDuplicateBlock(block);
                              setOpenBlockMenu(null);
                            }}
                          >
                            <Copy size={14} />
                            <span>Duplicate Block</span>
                          </div>
                          <div 
                            className="dropdown-item"
                            onClick={() => {
                              /* TODO: Implement move */
                              setOpenBlockMenu(null);
                            }}
                          >
                            <Move size={14} />
                            <span>Move Block</span>
                          </div>
                          <div 
                            className="dropdown-item"
                            onClick={() => {
                              /* TODO: Implement export */
                              setOpenBlockMenu(null);
                            }}
                          >
                            <Download size={14} />
                            <span>Export Block</span>
                          </div>
                          <div 
                            className="dropdown-item"
                            onClick={() => {
                              handleCompleteBlock(block);
                              setOpenBlockMenu(null);
                            }}
                          >
                            <Check size={14} />
                            <span>Complete Block</span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                {(() => {
                  const total = blockActions.length;
                  const denom = total - cancelledActions.length;
                  const done = completedActions.length;
                  const pct = denom > 0 ? Math.round((done / denom) * 100) : 0;
                  if (total === 0) return null;
                  return (
                    <div className={`rpm-block-progress ${pct >= 100 ? 'is-done' : ''}`}>
                      <div className="rpm-block-track"><span className="rpm-block-fill" style={{ width: `${pct}%` }} /></div>
                      <div className="rpm-block-progress-meta">
                        <span>{done}/{denom} done{cancelledActions.length ? ` · ${cancelledActions.length} cancelled` : ''}</span>
                        <span className="rpm-block-pct">{pct}%</span>
                      </div>
                    </div>
                  );
                })()}
                <div className="rpm-block-content">
                  <div className="rpm-block-section">
                    <div className="rpm-block-label">RESULT</div>
                    <div
                      className="rpm-block-title pd-clickable"
                      onClick={() => setPreviewBlock({ ...block, actions: blockActions })}
                      title="Preview this block"
                    >{block.result_title}</div>
                  </div>
                  <div className="rpm-block-section">
                    <div className="rpm-block-label">PURPOSE</div>
                    <div className="rpm-block-purpose">{block.purpose}</div>
                  </div>
                  
                  {/* Massive Action Plan */}
                  <div className="rpm-block-actions">
                    <div
                      className="rpm-block-label pd-clickable"
                      onClick={() => setPreviewBlock({ ...block, actions: blockActions })}
                      title="Preview this block"
                    >MASSIVE ACTION PLAN</div>
                    {activeActions.length > 0 && activeActions.map((action, idx) => {
                      const actionIndex = idx + 1;
                      return (
                        <div key={action.id} className="rpm-block-action pd-block-action-row">
                          <span className="pd-action-index">{actionIndex}</span>
                          <div
                            className={`action-checkbox ${action.is_completed ? 'completed' : ''} pd-checkbox-sm`}
                            onClick={() => toggleActionComplete(action)}
                          >
                            {action.is_completed && <Check size={10} />}
                          </div>
                          <span className="pd-flex-1">{action.title}</span>
                          <div className="pd-flex-gap4-center">
                            {/* Project Icon */}
                            {action.project_name && (
                              <button 
                                type="button"
                                className="btn btn-icon btn-ghost pd-icon-pad"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (action.project_id) {
                                    navigate(`/projects/${action.project_id}`);
                                  }
                                }}
                                title={action.project_name}
                              >
                                <FolderOpen size={12} />
                              </button>
                            )}
                            
                            {/* Duration Icon */}
                            <button 
                              type="button"
                              className="btn btn-icon btn-ghost pd-icon-pad"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleEditAction(action);
                              }}
                              title={`${action.duration_hours}h ${action.duration_minutes}m`}
                            >
                              <Clock size={12} />
                            </button>
                            
                            {/* Star Icon */}
                            <button 
                              type="button"
                              className="btn btn-icon btn-ghost"
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleActionStar(action);
                              }}
                              style={{ 
                                padding: '2px',
                                color: action.is_starred === true ? 'var(--accent-orange)' : 'var(--text-muted)'
                              }}
                            >
                              <Star 
                                size={12} 
                                fill={action.is_starred === true ? 'currentColor' : 'none'} 
                                stroke={action.is_starred === true ? 'currentColor' : 'var(--text-muted)'}
                              />
                            </button>
                            
                            {/* Action Menu */}
                            <div className="pd-relative-z1000">
                              <button 
                                type="button"
                                className="btn btn-icon btn-ghost pd-icon-pad"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const rect = e.currentTarget.getBoundingClientRect();
                                  setOpenBlockActionMenu(openBlockActionMenu === action.id ? null : {
                                    actionId: action.id,
                                    top: rect.bottom + 4,
                                    right: window.innerWidth - rect.right
                                  });
                                }}
                              >
                                <MoreVertical size={12} />
                              </button>
                              
                              {openBlockActionMenu && openBlockActionMenu.actionId === action.id && (
                                <div 
                                  className="dropdown-menu"
                                  style={{ 
                                    position: 'fixed',
                                    right: `${openBlockActionMenu.right}px`,
                                    top: `${openBlockActionMenu.top}px`,
                                    minWidth: '180px',
                                    zIndex: 10000,
                                    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)'
                                  }}
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <div 
                                    className="dropdown-item"
                                    onClick={() => handleEditAction(action)}
                                  >
                                    <Edit size={14} />
                                    <span>Edit Action</span>
                                  </div>
                                  <div 
                                    className="dropdown-item"
                                    onClick={() => !action.is_completed && handleDuplicateAction(action)}
                                    style={{ 
                                      opacity: action.is_completed ? 0.5 : 1,
                                      cursor: action.is_completed ? 'not-allowed' : 'pointer',
                                      pointerEvents: action.is_completed ? 'none' : 'auto'
                                    }}
                                  >
                                    <Copy size={14} />
                                    <span>Duplicate Action</span>
                                  </div>
                                  <div 
                                    className="dropdown-item"
                                    onClick={() => handleRemoveFromBlock(action)}
                                  >
                                    <Trash2 size={14} />
                                    <span>Remove From Block</span>
                                  </div>
                                  <div 
                                    className="dropdown-item"
                                    onClick={() => handleCancelAction(action)}
                                  >
                                    <X size={14} />
                                    <span>Cancel Action</span>
                                  </div>
                                  <div 
                                    className="dropdown-item pd-text-red"
                                    onClick={() => handleDeleteAction(action)}
                                  >
                                    <Trash2 size={14} />
                                    <span>Delete Action</span>
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    
                    {/* Add Action Button */}
                    <button 
                      type="button"
                      className="btn btn-secondary pd-add-action-btn"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setEditingAction({
                          block_id: block.id,
                          category_id: block.category_id || project.category_id,
                          project_id: project.id
                        });
                        setShowActionModal(true);
                      }}
                    >
                      <Plus size={14} />
                      Add Massive Action Plan
                    </button>
                  </div>
                  
                  {/* Completed Actions Section */}
                  <div className="pd-mt-16">
                    <div 
                      style={{ 
                        display: 'flex', 
                        justifyContent: 'space-between', 
                        alignItems: 'center',
                        cursor: completedActions.length > 0 ? 'pointer' : 'default',
                        marginBottom: '8px'
                      }}
                      onClick={() => completedActions.length > 0 && setExpandedCompleted(prev => ({
                        ...prev,
                        [block.id]: !prev[block.id]
                      }))}
                    >
                      <span className="pd-count-label">
                        {stats.completedCount} COMPLETED ACTIONS
                      </span>
                      {completedActions.length > 0 && (
                        expandedCompleted[block.id] ? (
                          <ChevronUp size={14} />
                        ) : (
                          <ChevronDown size={14} />
                        )
                      )}
                    </div>
                    {expandedCompleted[block.id] && completedActions.length > 0 && completedActions.map((action, idx) => (
                      <div key={action.id} className="rpm-block-action pd-block-action-done">
                        <span className="pd-action-index">{idx + 1}</span>
                        <div className="action-checkbox completed pd-checkbox-sm2">
                          <Check size={10} />
                        </div>
                        <span className="pd-strike-flex">{action.title}</span>
                      </div>
                    ))}
                  </div>
                  
                  {/* Cancelled Actions Section */}
                  <div className="pd-mt-16">
                    <div 
                      style={{ 
                        display: 'flex', 
                        justifyContent: 'space-between', 
                        alignItems: 'center',
                        cursor: cancelledActions.length > 0 ? 'pointer' : 'default',
                        marginBottom: '8px'
                      }}
                      onClick={() => cancelledActions.length > 0 && setExpandedCancelled(prev => ({
                        ...prev,
                        [block.id]: !prev[block.id]
                      }))}
                    >
                      <span className="pd-count-label">
                        {stats.cancelledCount} CANCELED ACTIONS
                      </span>
                      {cancelledActions.length > 0 && (
                        expandedCancelled[block.id] ? (
                          <ChevronUp size={14} />
                        ) : (
                          <ChevronDown size={14} />
                        )
                      )}
                    </div>
                    {expandedCancelled[block.id] && cancelledActions.length > 0 && cancelledActions.map((action, idx) => (
                      <div key={action.id} className="rpm-block-action pd-block-action-done">
                        <span className="pd-action-index">{idx + 1}</span>
                        <X size={14} className="pd-text-red" />
                        <span className="pd-strike-flex">{action.title}</span>
                      </div>
                    ))}
                  </div>
                </div>
                
                {/* Block Footer */}
                <div className="rpm-block-footer pd-block-footer">
                  <span>{stats.completedCount} COMPLETED ACTIONS</span>
                  <span>{stats.cancelledCount} CANCELED ACTIONS</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Project Planner */}
      <div className="project-planner">
        <div className="planner-header">
          <h3>Project Planner</h3>
          <div className="planner-nav">
            <button 
              className="btn btn-icon btn-secondary"
              onClick={() => setCurrentWeek(subWeeks(currentWeek, 1))}
            >
              <ChevronLeft size={16} />
            </button>
            <div className="planner-date-range">
              {format(weekStart, 'MMM d')} - {format(weekEnd, 'MMM d, yyyy')}
            </div>
            <button 
              className="btn btn-icon btn-secondary"
              onClick={() => setCurrentWeek(addWeeks(currentWeek, 1))}
            >
              <ChevronRight size={16} />
            </button>
            <button 
              type="button"
              className="btn btn-icon btn-secondary"
              onClick={() => setCurrentWeek(new Date())}
              title="Go to current week"
            >
              <CalendarIcon size={16} />
            </button>
          </div>
        </div>

        {unscheduledActions.length > 0 && (
          <div className="planner-unscheduled">
            <div className="planner-unscheduled-label">
              Unscheduled · {unscheduledActions.length} — drag onto a day (or click to edit)
            </div>
            <div className="planner-unscheduled-list">
              {unscheduledActions.map(a => (
                <div
                  key={a.id}
                  className={`planner-chip${dragActionId === a.id ? ' is-dragging' : ''}`}
                  draggable
                  onDragStart={(e) => { setDragActionId(a.id); e.dataTransfer.effectAllowed = 'move'; }}
                  onDragEnd={() => { setDragActionId(null); setDropDay(null); }}
                  onClick={() => handleEditAction(a)}
                  title={a.title}
                >
                  {a.title}
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="planner-grid">
          {weekDays.map(day => (
            <div key={day.toISOString()} className="planner-day-header">
              {format(day, 'EEE d')}
            </div>
          ))}
          {weekDays.map(day => {
            const dayActions = getActionsForDay(day);
            const dayStr = format(day, 'yyyy-MM-dd');
            const isToday = dayStr === format(new Date(), 'yyyy-MM-dd');
            const isDropTarget = dropDay === dayStr;

            return (
              <div
                key={day.toISOString() + '-cell'}
                className={`planner-day${isDropTarget ? ' is-drop-target' : ''}`}
                onDragOver={(e) => { if (dragActionId) { e.preventDefault(); setDropDay(dayStr); } }}
                onDragLeave={() => setDropDay(d => (d === dayStr ? null : d))}
                onDrop={(e) => {
                  e.preventDefault();
                  if (dragActionId) handleScheduleAction(dragActionId, dayStr);
                  setDragActionId(null); setDropDay(null);
                }}
                onClick={() => {
                  setEditingAction({
                    scheduled_date: dayStr,
                    project_id: project.id,
                    category_id: project.category_id
                  });
                  setShowActionModal(true);
                }}
                style={{
                  cursor: 'pointer',
                  background: isDropTarget ? 'var(--bg-card-hover)' : (isToday ? 'var(--bg-card-hover)' : 'var(--bg-secondary)'),
                  border: isDropTarget ? '1px solid var(--accent-pink)' : (isToday ? '1px solid var(--accent-cyan)' : '1px solid transparent')
                }}
              >
                <div className="planner-day-number" style={{ 
                  fontWeight: isToday ? 700 : 400,
                  color: isToday ? 'var(--accent-cyan)' : 'var(--text-primary)'
                }}>
                  {format(day, 'd')}
                </div>
                {dayActions.length > 0 && (
                  <div className="pd-day-actions">
                    {dayActions.slice(0, 3).map(action => (
                      <div
                        key={action.id}
                        style={{
                          fontSize: '0.75rem',
                          padding: '4px 6px',
                          background: action.category_color || 'var(--accent-pink)',
                          borderRadius: '4px',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          cursor: 'pointer'
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleEditAction(action);
                        }}
                        title={action.title}
                      >
                        {action.title}
                      </div>
                    ))}
                    {dayActions.length > 3 && (
                      <div className="pd-day-more">
                        +{dayActions.length - 3} more
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Edit Project Modal */}
      {showEditModal && categories && project && (
        <CreateProjectModal 
          onClose={() => setShowEditModal(false)}
          onSuccess={handleProjectUpdate}
          categories={categories}
          initialData={project}
          onCategoriesRefresh={refreshData}
        />
      )}

      {/* Key Result Modal */}
      {showKeyResultModal && project && (
        <CreateKeyResultModal 
          onClose={() => {
            setShowKeyResultModal(false);
            setEditingKeyResult(null);
          }}
          onSuccess={handleKeyResultSuccess}
          projectId={project.id}
          initialData={editingKeyResult || {}}
        />
      )}

      {/* Capture Item Modal */}
      {showCaptureItemModal && project && (
        <CreateCaptureItemModal 
          onClose={() => {
            setShowCaptureItemModal(false);
            setEditingCaptureItem(null);
          }}
          onSuccess={handleCaptureItemSuccess}
          projectId={project.id}
          initialData={editingCaptureItem || {}}
        />
      )}

      {/* Block Modal */}
      {showBlockModal && categories && project && (
        <CreateBlockModal 
          onClose={() => {
            setShowBlockModal(false);
            setEditingBlock(null);
          }}
          onSuccess={handleBlockSuccess}
          categories={categories}
          initialData={editingBlock ? {
            ...editingBlock,
            category_id: editingBlock.category_id || project.category_id
          } : { 
            category_id: project.category_id,
            project_id: project.id
          }}
        />
      )}

      {/* Action Modal */}
      {showActionModal && categories && project && (
        <CreateActionModal 
          onClose={() => {
            setShowActionModal(false);
            setEditingAction(null);
          }}
          onSuccess={handleActionSuccess}
          categories={categories}
          initialData={editingAction ? {
            ...editingAction,
            category_id: editingAction.category_id || project.category_id
          } : { 
            category_id: project.category_id,
            project_id: project.id
          }}
        />
      )}

      {/* Inspiration create / edit */}
      {showInspirationModal && project && (
        <CreateInspirationModal
          projectId={project.id}
          initialData={editingInspiration || {}}
          onClose={() => { setShowInspirationModal(false); setEditingInspiration(null); }}
          onSuccess={handleInspirationSuccess}
        />
      )}

      {/* Inspiration preview / lightbox */}
      {previewInspiration && (
        <InspirationPreviewModal
          item={previewInspiration}
          onClose={() => setPreviewInspiration(null)}
          onEdit={handleEditInspiration}
          onDelete={handleDeleteInspiration}
        />
      )}

      {previewBlock && (
        <BlockPreviewModal
          block={previewBlock}
          onClose={() => setPreviewBlock(null)}
          onEdit={(b) => { setPreviewBlock(null); handleEditBlock(b); }}
        />
      )}
    </div>
  );
}

export default ProjectDetailPage;
