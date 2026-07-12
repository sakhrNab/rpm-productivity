import { useState, useEffect, useContext, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ChevronLeft, Image, Star, MoreVertical, Plus, Clock,
  FolderOpen, Calendar, Check, Hourglass, Edit, Copy, X, Trash2,
  Move, Download, ChevronUp, ChevronDown, Archive, ArchiveRestore
} from 'lucide-react';
import { AppContext, AuthContext } from '../App';
import CreateActionModal from '../components/modals/CreateActionModal';
import CreateBlockModal from '../components/modals/CreateBlockModal';
import CreateProjectModal from '../components/modals/CreateProjectModal';
import CreateCategoryModal from '../components/modals/CreateCategoryModal';
import { fileToCompressedDataURL } from '../utils/image';
import { useToast } from '../components/ToastProvider';
import './CategoryDetailPage.css';

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
    return <div>Category not found</div>;
  }

  const details = category.details || {};

  return (
    <div>
      {/* Breadcrumb */}
      <div className="page-breadcrumb">
        <Link to="/categories">Categories</Link>
        <ChevronLeft size={14} className="cd-breadcrumb-chevron" />
        <span style={{ color: category.color }}>{category.name}</span>
      </div>

      {/* Header */}
      <div className="category-header">
        <div 
          className="category-header-bg"
          style={{ 
            backgroundImage: category.cover_image 
              ? `url(${category.cover_image})` 
              : 'linear-gradient(135deg, #1a2d4a 0%, #0d1d35 100%)'
          }}
        />
        <div className="category-header-overlay" />
        <div className="category-header-content">
          <div className="cd-header-actions">
            <button
              className="btn btn-secondary cd-btn-sm"
              onClick={() => setShowEditCategory(true)}
            >
              <Edit size={14} />
              Edit
            </button>
            <button
              className="btn btn-secondary cd-btn-sm"
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
            className="cd-hidden"
            onChange={handleCoverUpload}
          />

          <div 
            style={{ 
              background: category.color, 
              padding: '4px 12px', 
              borderRadius: '4px',
              fontSize: '0.7rem',
              fontWeight: 600,
              letterSpacing: '0.1em',
              width: 'fit-content',
              marginBottom: '16px'
            }}
          >
            MY ULTIMATE VISION
          </div>
          
          {editingField === 'ultimate_vision' ? (
            <div>
              <textarea
                value={editValue}
                onChange={e => setEditValue(e.target.value)}
                className="form-input cd-vision-input"
                rows={3}
                autoFocus
                placeholder="Living the life that I desire…"
              />
              <div className="cd-edit-actions">
                <button className="btn btn-primary" onClick={handleFieldSave}>Save</button>
                <button className="btn btn-secondary" onClick={() => setEditingField(null)}>Cancel</button>
              </div>
            </div>
          ) : (
            <h1
              className="cd-vision-title cd-clickable"
              onClick={() => handleFieldEdit('ultimate_vision', details.ultimate_vision || category.description || '')}
              title="Click to edit your ultimate vision"
            >
              {details.ultimate_vision || category.description || 'Click to add your ultimate vision...'}
            </h1>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="category-tabs">
        <button 
          className={`category-tab ${activeTab === 'big-picture' ? 'active' : ''}`}
          onClick={() => setActiveTab('big-picture')}
        >
          The Big Picture
        </button>
        <button 
          className={`category-tab ${activeTab === 'actions' ? 'active' : ''}`}
          onClick={() => setActiveTab('actions')}
        >
          Actions and Blocks
        </button>
      </div>

      {activeTab === 'big-picture' ? (
        <div>
          {/* My Roles */}
          <div className="big-picture-section">
            <div className="big-picture-header">
              <div className="big-picture-icon" style={{ background: category.color }}>
                👤
              </div>
              <span className="big-picture-label">MY ROLES</span>
            </div>
            {editingField === 'roles' ? (
              <div>
                <textarea
                  value={editValue}
                  onChange={e => setEditValue(e.target.value)}
                  className="form-input"
                  rows={3}
                  autoFocus
                />
                <div className="cd-edit-actions">
                  <button className="btn btn-primary" onClick={handleFieldSave}>Save</button>
                  <button className="btn btn-secondary" onClick={() => setEditingField(null)}>Cancel</button>
                </div>
              </div>
            ) : (
              <p 
                className="big-picture-content cd-clickable"
                onClick={() => handleFieldEdit('roles', details.roles)}
              >
                {details.roles || 'Click to add your roles...'}
              </p>
            )}
          </div>

          {/* My Ultimate Purpose */}
          <div className="big-picture-section">
            <div className="big-picture-header">
              <div className="big-picture-icon" style={{ background: category.color }}>
                🎯
              </div>
              <span className="big-picture-label">MY ULTIMATE PURPOSE</span>
            </div>
            {editingField === 'ultimate_purpose' ? (
              <div>
                <textarea
                  value={editValue}
                  onChange={e => setEditValue(e.target.value)}
                  className="form-input"
                  rows={3}
                  autoFocus
                />
                <div className="cd-edit-actions">
                  <button className="btn btn-primary" onClick={handleFieldSave}>Save</button>
                  <button className="btn btn-secondary" onClick={() => setEditingField(null)}>Cancel</button>
                </div>
              </div>
            ) : (
              <p 
                className="big-picture-content cd-clickable"
                onClick={() => handleFieldEdit('ultimate_purpose', details.ultimate_purpose)}
              >
                {details.ultimate_purpose || 'Click to add your ultimate purpose...'}
              </p>
            )}
          </div>

          {/* Goals Row */}
          <div className="cd-goals-row">
            {/* One Year Goals */}
            <div className="big-picture-section cd-no-mb">
              <div className="big-picture-header">
                <div className="big-picture-icon" style={{ background: category.color }}>
                  📅
                </div>
                <span className="big-picture-label">ONE YEAR GOALS</span>
              </div>
              {editingField === 'one_year_goals' ? (
                <div>
                  <textarea
                    value={editValue}
                    onChange={e => setEditValue(e.target.value)}
                    className="form-input"
                    rows={4}
                    autoFocus
                  />
                  <div className="cd-edit-actions">
                    <button className="btn btn-primary" onClick={handleFieldSave}>Save</button>
                    <button className="btn btn-secondary" onClick={() => setEditingField(null)}>Cancel</button>
                  </div>
                </div>
              ) : (
                <p 
                  className="big-picture-content cd-clickable-prewrap"
                  onClick={() => handleFieldEdit('one_year_goals', details.one_year_goals)}
                >
                  {details.one_year_goals || 'Click to add your one year goals...'}
                </p>
              )}
            </div>

            {/* 90 Day Goals */}
            <div className="big-picture-section cd-no-mb">
              <div className="big-picture-header">
                <div className="big-picture-icon" style={{ background: category.color }}>
                  🚀
                </div>
                <span className="big-picture-label">90 DAY GOALS</span>
              </div>
              {editingField === 'ninety_day_goals' ? (
                <div>
                  <textarea
                    value={editValue}
                    onChange={e => setEditValue(e.target.value)}
                    className="form-input"
                    rows={4}
                    autoFocus
                  />
                  <div className="cd-edit-actions">
                    <button className="btn btn-primary" onClick={handleFieldSave}>Save</button>
                    <button className="btn btn-secondary" onClick={() => setEditingField(null)}>Cancel</button>
                  </div>
                </div>
              ) : (
                <p 
                  className="big-picture-content cd-clickable-prewrap"
                  onClick={() => handleFieldEdit('ninety_day_goals', details.ninety_day_goals)}
                >
                  {details.ninety_day_goals || 'Click to add your 90 day goals...'}
                </p>
              )}
            </div>
          </div>

          {/* My Projects */}
          <div className="big-picture-section">
            <div className="big-picture-header">
              <div className="big-picture-icon" style={{ background: category.color }}>
                📁
              </div>
              <span className="big-picture-label">MY PROJECTS</span>
            </div>
            
            {(() => {
              const allProjects = category.projects || [];
              const activeProjects = allProjects.filter(p => !p.is_archived);
              const archivedProjects = allProjects.filter(p => p.is_archived);

              const renderCard = (project, archived) => (
                <div
                  key={project.id}
                  className={`project-card${archived ? ' project-card-archived' : ''}${dragProjectId === project.id ? ' cd-dragging' : ''}`}
                  draggable
                  onDragStart={(e) => { setDragProjectId(project.id); e.dataTransfer.effectAllowed = 'move'; }}
                  onDragEnd={() => { setDragProjectId(null); setDropZone(null); }}
                  onClick={() => navigate(`/projects/${project.id}`)}
                >
                  <div
                    className="project-card-bg"
                    style={{
                      backgroundImage: project.cover_image
                        ? `url(${project.cover_image})`
                        : 'linear-gradient(135deg, #1a2d4a 0%, #0d1d35 100%)'
                    }}
                  />
                  <button
                    type="button"
                    className="project-card-archive"
                    title={archived ? 'Restore to active' : 'Archive project'}
                    onClick={(e) => { e.stopPropagation(); handleArchiveProject(project, !archived); }}
                  >
                    {archived ? <ArchiveRestore size={15} /> : <Archive size={15} />}
                  </button>
                  <div className="project-card-content">
                    <div className="project-card-badge" style={{ color: category.color }}>
                      <span className="cd-color-dot" style={{ background: category.color }} />
                      {category.name}
                    </div>
                    <h3 className="project-card-title">{project.name}</h3>
                    <p className="project-card-description">
                      {project.ultimate_result || project.description}
                    </p>
                  </div>
                </div>
              );

              return (
                <>
                  <div
                    className={`projects-grid cd-dropzone${dropZone === 'active' ? ' cd-dropzone-over' : ''}`}
                    onDragOver={(e) => { if (dragProjectId) { e.preventDefault(); setDropZone('active'); } }}
                    onDragLeave={() => setDropZone(z => (z === 'active' ? null : z))}
                    onDrop={(e) => { e.preventDefault(); handleProjectDrop(false); }}
                  >
                    {activeProjects.map(project => renderCard(project, false))}
                    {activeProjects.length === 0 && (
                      <div className="cd-projects-empty">
                        {archivedProjects.length ? 'No active projects — drop one here to restore it, or create a new one.' : 'No projects yet.'}
                      </div>
                    )}
                  </div>

                  <button
                    type="button"
                    className="btn btn-secondary cd-mt-16"
                    onClick={() => setShowProjectModal(true)}
                  >
                    <Plus size={16} />
                    Create New Project
                  </button>

                  {archivedProjects.length > 0 && (
                    <div className="cd-archived">
                      <button
                        type="button"
                        className={`cd-archived-toggle${dropZone === 'archived' ? ' cd-dropzone-over' : ''}`}
                        onClick={() => setArchivedOpen(o => !o)}
                        onDragOver={(e) => { if (dragProjectId) { e.preventDefault(); setDropZone('archived'); } }}
                        onDragLeave={() => setDropZone(z => (z === 'archived' ? null : z))}
                        onDrop={(e) => { e.preventDefault(); handleProjectDrop(true); }}
                      >
                        {archivedOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                        <Archive size={15} />
                        <span>Archived</span>
                        <span className="cd-archived-count">{archivedProjects.length}</span>
                        <span className="cd-archived-hint">drag a project here to archive</span>
                      </button>
                      {archivedOpen && (
                        <div className="cd-archived-grid">
                          {archivedProjects.map(project => renderCard(project, true))}
                        </div>
                      )}
                    </div>
                  )}
                </>
              );
            })()}
          </div>
        </div>
      ) : (
        /* Actions and Blocks Tab */
        <div className="actions-container">
          {/* Actions List */}
          <div className="actions-list">
            <div className="actions-header">
              <h3 className="cd-heading-1rem">Actions</h3>
              <div className="cd-flex-gap-8">
                <select
                  className="form-input cd-select-auto"
                  value={actionFilter}
                  onChange={(e) => setActionFilter(e.target.value)}
                >
                  <option value="all">View All</option>
                  <option value="starred">Starred</option>
                  <option value="this_week">This Week</option>
                  <option value="completed">Completed</option>
                </select>
                <button 
                  type="button"
                  className="btn btn-icon btn-secondary cd-add-btn"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setShowActionModal(true);
                  }}
                >
                  <Plus size={16} />
                </button>
              </div>
            </div>

            {filteredActions.length === 0 ? (
              <div className="empty-state">
                <p>{actions.length === 0 ? 'No actions yet. Create your first action!' : 'No actions match the selected filter.'}</p>
              </div>
            ) : (
              filteredActions.map(action => (
                <div key={action.id} className="action-item">
                  <div 
                    className={`action-checkbox ${action.is_completed ? 'completed' : ''}`}
                    onClick={() => toggleActionComplete(action)}
                  >
                    {action.is_completed && <Check size={12} />}
                  </div>
                  <div className="action-content">
                    <div className={`action-title ${action.is_completed ? 'completed' : ''}`}>
                      {action.title}
                    </div>
                  </div>
                  <div className="action-actions cd-action-actions-row">
                    {/* Project Icon */}
                    {action.project_name && (
                      <button 
                        type="button"
                        className="btn btn-icon btn-ghost"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (action.project_id) {
                            navigate(`/projects/${action.project_id}`);
                          }
                        }}
                        title={action.project_name}
                      >
                        <FolderOpen size={14} />
                      </button>
                    )}
                    
                    {/* Duration Icon */}
                    <button 
                      type="button"
                      className="btn btn-icon btn-ghost"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleEditAction(action);
                      }}
                      title={`${action.duration_hours}h ${action.duration_minutes}m`}
                    >
                      <Clock size={14} />
                    </button>
                    
                    {/* Star Icon */}
                    <button 
                      type="button"
                      className="btn btn-icon btn-ghost"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleActionStar(action);
                      }}
                      style={{ color: action.is_starred ? 'var(--accent-orange)' : 'var(--text-muted)' }}
                    >
                      <Star size={14} fill={action.is_starred ? 'currentColor' : 'none'} />
                    </button>
                    
                    {/* This Week Button */}
                    <button 
                      type="button"
                      className="btn btn-secondary"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleThisWeek(action);
                      }}
                      style={{ 
                        fontSize: '0.75rem',
                        padding: '4px 8px',
                        background: action.is_this_week ? 'var(--accent-cyan)' : 'transparent',
                        border: action.is_this_week ? '1px solid var(--accent-cyan)' : '1px solid var(--border-primary)'
                      }}
                    >
                      <Plus size={12} className="cd-mr-4" />
                      This week
                    </button>
                    
                    {/* More Options Menu */}
                    <div className="cd-relative">
                      <button 
                        type="button"
                        className="btn btn-icon btn-ghost"
                        onClick={(e) => {
                          e.stopPropagation();
                          setOpenActionMenu(openActionMenu === action.id ? null : action.id);
                        }}
                      >
                        <MoreVertical size={14} />
                      </button>
                      
                      {openActionMenu === action.id && (
                        <div 
                          className="dropdown-menu cd-dropdown-menu-pos"
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
                            title={action.is_completed ? 'Cannot duplicate completed action' : ''}
                          >
                            <Copy size={14} />
                            <span>Duplicate Action</span>
                          </div>
                          <div 
                            className="dropdown-item"
                            onClick={() => handleCancelAction(action)}
                          >
                            <X size={14} />
                            <span>Cancel Action</span>
                          </div>
                          <div 
                            className="dropdown-item cd-text-red"
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
              ))
            )}
          </div>

          {/* RPM Blocks */}
          <div className="rpm-blocks-container">
            <div className="rpm-blocks-header">
              <h3 className="cd-heading-1rem">RPM Blocks</h3>
              <button 
                type="button"
                className="btn btn-icon btn-secondary cd-add-btn"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setShowBlockModal(true);
                }}
              >
                <Plus size={16} />
              </button>
            </div>

            {blocks.length === 0 ? (
              <div className="empty-state">
                <p>No blocks yet. Create your first RPM block!</p>
              </div>
            ) : (
              blocks.map(block => {
                const stats = calculateBlockStats(block);
                const blockActions = block.actions || [];
                const completedActions = blockActions.filter(a => a.is_completed && !a.is_cancelled);
                const cancelledActions = blockActions.filter(a => a.is_cancelled);
                const activeActions = blockActions.filter(a => !a.is_completed && !a.is_cancelled);
                
                return (
                  <div key={block.id} className="rpm-block">
                    <div className="rpm-block-header">
                      <div className="rpm-block-badge">
                        <span className="cd-color-dot" style={{ background: category.color }} />
                        {category.name}
                      </div>
                      <div className="cd-action-actions-row">
                        {/* Starred Actions Duration */}
                        <div className="cd-duration-stat">
                          <Star size={14} fill="currentColor" className="cd-text-orange" />
                          <span>
                            {stats.starredDuration.hours > 0 ? `${stats.starredDuration.hours}h ` : ''}
                            {stats.starredDuration.minutes}m
                          </span>
                        </div>
                        {/* Total Duration */}
                        <div className="cd-duration-stat">
                          <Clock size={14} />
                          <span>
                            {stats.totalDuration.hours > 0 ? `${stats.totalDuration.hours}h ` : ''}
                            {stats.totalDuration.minutes}m
                          </span>
                        </div>
                        {/* Block Menu */}
                        <div className="cd-relative">
                          <button 
                            type="button"
                            className="btn btn-icon btn-ghost"
                            onClick={(e) => {
                              e.stopPropagation();
                              setOpenBlockMenu(openBlockMenu === block.id ? null : block.id);
                            }}
                          >
                            <MoreVertical size={14} />
                          </button>
                          
                          {openBlockMenu === block.id && (
                            <div
                              className="dropdown-menu cd-dropdown-menu-pos"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <div 
                                className="dropdown-item"
                                onClick={() => handleEditBlock(block)}
                              >
                                <Edit size={14} />
                                <span>Edit Block</span>
                              </div>
                              <div 
                                className="dropdown-item"
                                onClick={() => handleDuplicateBlock(block)}
                              >
                                <Copy size={14} />
                                <span>Duplicate Block</span>
                              </div>
                              <div
                                className="dropdown-item"
                                onClick={() => handleMoveBlock(block)}
                              >
                                <Move size={14} />
                                <span>Move Block</span>
                              </div>
                              <div
                                className="dropdown-item"
                                onClick={() => handleExportBlock(block)}
                              >
                                <Download size={14} />
                                <span>Export Block</span>
                              </div>
                              <div 
                                className="dropdown-item"
                                onClick={() => handleCompleteBlock(block)}
                              >
                                <Check size={14} />
                                <span>Complete Block</span>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="rpm-block-content">
                      <div className="rpm-block-section">
                        <div className="rpm-block-label">RESULT</div>
                        <div className="rpm-block-title">{block.result_title}</div>
                      </div>
                      <div className="rpm-block-section">
                        <div className="rpm-block-label">PURPOSE</div>
                        <div className="rpm-block-purpose">{block.purpose}</div>
                      </div>
                      
                      {/* Massive Action Plan */}
                      <div className="rpm-block-actions">
                        <div className="rpm-block-label">MASSIVE ACTION PLAN</div>
                        {activeActions.length > 0 && activeActions.map((action, idx) => {
                          const actionIndex = idx + 1;
                          return (
                            <div key={action.id} className="rpm-block-action cd-block-action-row">
                              <span className="cd-action-index">{actionIndex}</span>
                              <div
                                className={`action-checkbox ${action.is_completed ? 'completed' : ''} cd-block-checkbox`}
                                onClick={() => toggleActionComplete(action)}
                              >
                                {action.is_completed && <Check size={10} />}
                              </div>
                              <span className="cd-flex-1">{action.title}</span>
                              <div className="cd-action-icons">
                                {/* Duration Icon */}
                                <button 
                                  type="button"
                                  className="btn btn-icon btn-ghost cd-p-2"
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
                                    color: action.is_starred ? 'var(--accent-orange)' : 'var(--text-muted)'
                                  }}
                                >
                                  <Star size={12} fill={action.is_starred ? 'currentColor' : 'none'} />
                                </button>
                                
                                {/* This Week Button */}
                                <button 
                                  type="button"
                                  className="btn btn-secondary"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    toggleThisWeek(action);
                                  }}
                                  style={{ 
                                    fontSize: '0.7rem',
                                    padding: '2px 6px',
                                    background: action.is_this_week ? 'var(--accent-cyan)' : 'transparent',
                                    border: action.is_this_week ? '1px solid var(--accent-cyan)' : '1px solid var(--border-primary)'
                                  }}
                                >
                                  <Plus size={10} className="cd-mr-2" />
                                  This week
                                </button>
                                
                                {/* Action Menu */}
                                <div className="cd-relative-z">
                                  <button
                                    type="button"
                                    className="btn btn-icon btn-ghost cd-p-2"
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
                                        className="dropdown-item cd-text-red"
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
                          className="btn btn-secondary cd-add-action-btn"
                          onClick={() => {
                            setEditingAction({ block_id: block.id, category_id: block.category_id || id });
                            setShowActionModal(true);
                          }}
                        >
                          <Plus size={14} />
                          Add Action
                        </button>
                      </div>
                      
                      {/* Completed Actions Section */}
                      <div className="cd-mt-16">
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
                          <span className="cd-section-header-muted">
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
                          <div key={action.id} className="rpm-block-action cd-done-action-row">
                            <span className="cd-action-index">{idx + 1}</span>
                            <div className="action-checkbox completed cd-completed-checkbox">
                              <Check size={10} />
                            </div>
                            <span className="cd-strike">{action.title}</span>
                          </div>
                        ))}
                      </div>
                      
                      {/* Cancelled Actions Section */}
                      <div className="cd-mt-16">
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
                          <span className="cd-section-header-muted">
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
                          <div key={action.id} className="rpm-block-action cd-done-action-row">
                            <span className="cd-action-index">{idx + 1}</span>
                            <X size={14} className="cd-text-red" />
                            <span className="cd-strike">{action.title}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    
                    {/* Block Footer */}
                    <div className="rpm-block-footer cd-block-footer">
                      <span>{stats.completedCount} COMPLETED ACTIONS</span>
                      <span>{stats.cancelledCount} CANCELED ACTIONS</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
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
