import { useState, useEffect, useContext } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { 
  ChevronLeft, ChevronRight, Image, Plus, Star, MoreVertical, 
  Check, Clock, Hourglass, Calendar as CalendarIcon, Edit, Trash2, X,
  Copy, Move, Download, ChevronUp, ChevronDown, FolderOpen
} from 'lucide-react';
import { AppContext, AuthContext } from '../App';
import { format, startOfWeek, endOfWeek, eachDayOfInterval, addWeeks, subWeeks } from 'date-fns';
import CreateProjectModal from '../components/modals/CreateProjectModal';
import CreateKeyResultModal from '../components/modals/CreateKeyResultModal';
import CreateCaptureItemModal from '../components/modals/CreateCaptureItemModal';
import CreateBlockModal from '../components/modals/CreateBlockModal';
import CreateActionModal from '../components/modals/CreateActionModal';

function ProjectDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { categories, refreshData } = useContext(AppContext);
  const { api } = useContext(AuthContext);
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

  useEffect(() => {
    loadProject();
  }, [id]);

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

  const toggleActionComplete = async (action) => {
    try {
      await api.updateAction(action.id, { is_completed: !action.is_completed });
      await loadProject();
    } catch (error) {
      console.error('Failed to update action:', error);
    }
  };

  const toggleActionStar = async (action) => {
    try {
      const newStarredValue = !(action.is_starred === true);
      await api.updateAction(action.id, { is_starred: newStarredValue });
      await loadProject();
    } catch (error) {
      console.error('Failed to update action:', error);
    }
  };

  const toggleThisWeek = async (action) => {
    try {
      await api.updateAction(action.id, { is_this_week: !action.is_this_week });
      await loadProject();
    } catch (error) {
      console.error('Failed to update action:', error);
    }
  };

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
    console.log('Edit block clicked:', block);
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

  const toggleKeyResultStar = async (keyResult) => {
    try {
      await api.updateKeyResult(keyResult.id, { is_starred: !keyResult.is_starred });
      await loadProject();
    } catch (error) {
      console.error('Failed to update key result:', error);
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
    try {
      await api.updateCaptureItem(captureItem.id, { is_starred: !captureItem.is_starred });
      await loadProject();
    } catch (error) {
      console.error('Failed to update capture item:', error);
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

  // Get actions for a specific day
  const getActionsForDay = (day) => {
    if (!project.actions) return [];
    const dayStr = format(day, 'yyyy-MM-dd');
    return project.actions.filter(a => a.scheduled_date === dayStr);
  };

  return (
    <div>
      {/* Breadcrumb */}
      <div className="page-breadcrumb">
        <Link to="/categories">Categories</Link>
        <ChevronLeft size={14} style={{ transform: 'rotate(180deg)' }} />
        {category && <Link to={`/categories/${category.id}`}>{category.name}</Link>}
        <ChevronLeft size={14} style={{ transform: 'rotate(180deg)' }} />
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
          <div style={{ position: 'absolute', top: 16, right: 16, display: 'flex', gap: '8px' }}>
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
            >
              <Image size={14} />
              Change Cover Image
            </button>
          </div>
          
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
          
          <h1 style={{ fontSize: '2rem', marginBottom: '8px' }}>
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
                style={{
                  fontSize: '2rem',
                  background: 'transparent',
                  border: '1px solid var(--accent-cyan)',
                  borderRadius: '4px',
                  padding: '4px 8px',
                  color: 'var(--text-primary)',
                  width: '100%'
                }}
              />
            ) : (
              <span 
                onClick={() => handleFieldEdit('name', project.name)}
                style={{ cursor: 'pointer' }}
              >
                {project.name}
              </span>
            )}
          </h1>
        </div>
      </div>

      {/* Actions Tabs */}
      <div style={{ 
        display: 'flex', 
        gap: '16px', 
        marginBottom: '24px',
        borderBottom: '1px solid var(--border-primary)',
        paddingBottom: '12px'
      }}>
        <button 
          className={`category-tab ${activeTab === 'starred' ? 'active' : ''}`}
          onClick={() => setActiveTab('starred')}
          style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
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
        <div className="project-section">
          <div className="project-section-header">
            <div className="project-section-icon" style={{ background: 'var(--accent-pink)' }}>
              🎯
            </div>
            <span className="project-section-label" style={{ color: 'var(--accent-pink)' }}>
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
              style={{
                width: '100%',
                minHeight: '60px',
                background: 'transparent',
                border: '1px solid var(--accent-pink)',
                borderRadius: '4px',
                padding: '8px',
                color: 'var(--text-secondary)',
                resize: 'vertical'
              }}
            />
          ) : (
            <p 
              style={{ color: 'var(--text-secondary)', cursor: 'pointer', minHeight: '24px' }}
              onClick={() => handleFieldEdit('ultimate_result', project.ultimate_result)}
            >
              {project.ultimate_result || 'Click to add ultimate result...'}
            </p>
          )}
        </div>

        {/* Ultimate Purpose */}
        <div className="project-section">
          <div className="project-section-header">
            <div className="project-section-icon" style={{ background: 'var(--accent-pink)' }}>
              💡
            </div>
            <span className="project-section-label" style={{ color: 'var(--accent-pink)' }}>
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
              style={{
                width: '100%',
                minHeight: '60px',
                background: 'transparent',
                border: '1px solid var(--accent-pink)',
                borderRadius: '4px',
                padding: '8px',
                color: 'var(--text-secondary)',
                resize: 'vertical'
              }}
            />
          ) : (
            <p 
              style={{ color: 'var(--text-secondary)', cursor: 'pointer', minHeight: '24px' }}
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
            <div className="project-section-icon" style={{ background: 'var(--accent-pink)' }}>
              📊
            </div>
            <span className="project-section-label" style={{ color: 'var(--accent-pink)' }}>
              KEY RESULTS
            </span>
            <button 
              type="button"
              className="btn btn-icon btn-ghost" 
              style={{ marginLeft: 'auto' }}
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
            <p style={{ color: 'var(--text-muted)' }}>No key results yet</p>
          ) : (
            project.key_results?.map((kr, idx) => (
              <div key={kr.id} className="key-result-item">
                <div className="key-result-number">{idx + 1}</div>
                <span className="key-result-title">{kr.title}</span>
                {kr.target_date && (
                  <span className="key-result-date">{kr.target_date}</span>
                )}
                <div className="key-result-actions" style={{ position: 'relative', display: 'flex', gap: '4px' }}>
                  <button 
                    type="button"
                    className="btn btn-icon btn-ghost"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleKeyResultStar(kr);
                    }}
                    style={{ 
                      color: kr.is_starred ? 'var(--accent-orange)' : 'var(--text-muted)',
                      padding: '2px'
                    }}
                  >
                    <Star size={12} fill={kr.is_starred ? 'currentColor' : 'none'} />
                  </button>
                  <div style={{ position: 'relative' }}>
                    <button 
                      type="button"
                      className="btn btn-icon btn-ghost"
                      onClick={(e) => {
                        e.stopPropagation();
                        setOpenKeyResultMenu(openKeyResultMenu === kr.id ? null : kr.id);
                      }}
                      style={{ padding: '2px' }}
                    >
                      <MoreVertical size={12} />
                    </button>
                    
                    {openKeyResultMenu === kr.id && (
                      <div 
                        className="dropdown-menu"
                        style={{ 
                          position: 'absolute',
                          right: 0,
                          top: '100%',
                          marginTop: '4px',
                          minWidth: '180px',
                          zIndex: 1000
                        }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div 
                          className="dropdown-item"
                          onClick={() => handleEditKeyResult(kr)}
                        >
                          <Edit size={14} />
                          <span>Edit Key Result</span>
                        </div>
                        <div 
                          className="dropdown-item"
                          onClick={() => handleDeleteKeyResult(kr)}
                          style={{ color: 'var(--accent-red)' }}
                        >
                          <Trash2 size={14} />
                          <span>Delete Key Result</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Capture List */}
        <div className="project-section">
          <div className="project-section-header">
            <div className="project-section-icon" style={{ background: 'var(--accent-cyan)' }}>
              📝
            </div>
            <span className="project-section-label" style={{ color: 'var(--accent-cyan)' }}>
              CAPTURE LIST
            </span>
            <button 
              type="button"
              className="btn btn-icon btn-ghost" 
              style={{ marginLeft: 'auto' }}
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
            <p style={{ color: 'var(--text-muted)' }}>No capture items yet</p>
          ) : (
            project.capture_items?.map((item, idx) => (
              <div key={item.id} className="capture-item">
                <span className="capture-number">{idx + 1}</span>
                <span className="capture-title">{item.title}</span>
                <div className="capture-actions" style={{ position: 'relative', display: 'flex', gap: '4px' }}>
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
                  <div style={{ position: 'relative' }}>
                    <button 
                      type="button"
                      className="btn btn-icon btn-ghost"
                      onClick={(e) => {
                        e.stopPropagation();
                        setOpenCaptureItemMenu(openCaptureItemMenu === item.id ? null : item.id);
                      }}
                      style={{ padding: '2px' }}
                    >
                      <MoreVertical size={12} />
                    </button>
                    
                    {openCaptureItemMenu === item.id && (
                      <div 
                        className="dropdown-menu"
                        style={{ 
                          position: 'absolute',
                          right: 0,
                          top: '100%',
                          marginTop: '4px',
                          minWidth: '180px',
                          zIndex: 1000
                        }}
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
                          className="dropdown-item"
                          onClick={() => handleDeleteCaptureItem(item)}
                          style={{ color: 'var(--accent-red)' }}
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

      {/* RPM Blocks Section */}
      <div className="project-section" style={{ marginTop: '24px' }}>
        <div className="project-section-header">
          <span className="project-section-label">RPM Blocks</span>
          <button 
            type="button"
            className="btn btn-icon btn-ghost" 
            style={{ marginLeft: 'auto' }}
            onClick={(e) => {
              e.stopPropagation();
              setEditingBlock(null);
              setShowBlockModal(true);
            }}
          >
            <Plus size={14} />
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(400px, 1fr))', gap: '16px' }}>
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
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    {/* Time Remaining (Left) */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem' }}>
                      <Clock size={14} />
                      <span>
                        {stats.remainingDuration.hours > 0 ? `${stats.remainingDuration.hours}h ` : ''}
                        {stats.remainingDuration.minutes}m
                      </span>
                    </div>
                    {/* Total Duration (Right) */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem' }}>
                      <Hourglass size={14} />
                      <span>
                        {stats.totalDuration.hours > 0 ? `${stats.totalDuration.hours}h ` : ''}
                        {stats.totalDuration.minutes}m
                      </span>
                    </div>
                    {/* Block Menu */}
                    <div style={{ position: 'relative', zIndex: 1000 }}>
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
                        <div key={action.id} className="rpm-block-action" style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px', borderRadius: '4px' }}>
                          <span style={{ color: 'var(--text-muted)', minWidth: '20px' }}>{actionIndex}</span>
                          <div 
                            className={`action-checkbox ${action.is_completed ? 'completed' : ''}`}
                            onClick={() => toggleActionComplete(action)}
                            style={{ width: 16, height: 16, flexShrink: 0 }}
                          >
                            {action.is_completed && <Check size={10} />}
                          </div>
                          <span style={{ flex: 1 }}>{action.title}</span>
                          <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
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
                                style={{ padding: '2px' }}
                                title={action.project_name}
                              >
                                <FolderOpen size={12} />
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
                              style={{ padding: '2px' }}
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
                            <div style={{ position: 'relative', zIndex: 1000 }}>
                              <button 
                                type="button"
                                className="btn btn-icon btn-ghost"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const rect = e.currentTarget.getBoundingClientRect();
                                  setOpenBlockActionMenu(openBlockActionMenu === action.id ? null : {
                                    actionId: action.id,
                                    top: rect.bottom + 4,
                                    right: window.innerWidth - rect.right
                                  });
                                }}
                                style={{ padding: '2px' }}
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
                                    className="dropdown-item"
                                    onClick={() => handleDeleteAction(action)}
                                    style={{ color: 'var(--accent-red)' }}
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
                      className="btn btn-secondary"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        console.log('Add Action clicked for block:', block.id);
                        setEditingAction({ 
                          block_id: block.id, 
                          category_id: block.category_id || project.category_id, 
                          project_id: project.id 
                        });
                        setShowActionModal(true);
                        console.log('Action modal should open');
                      }}
                      style={{ 
                        marginTop: '8px',
                        width: '100%',
                        justifyContent: 'center',
                        cursor: 'pointer'
                      }}
                    >
                      <Plus size={14} />
                      Add Massive Action Plan
                    </button>
                  </div>
                  
                  {/* Completed Actions Section */}
                  <div style={{ marginTop: '16px' }}>
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
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
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
                      <div key={action.id} className="rpm-block-action" style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: '8px', 
                        padding: '8px',
                        opacity: 0.6
                      }}>
                        <span style={{ color: 'var(--text-muted)', minWidth: '20px' }}>{idx + 1}</span>
                        <div className="action-checkbox completed" style={{ width: 16, height: 16 }}>
                          <Check size={10} />
                        </div>
                        <span style={{ flex: 1, textDecoration: 'line-through' }}>{action.title}</span>
                      </div>
                    ))}
                  </div>
                  
                  {/* Cancelled Actions Section */}
                  <div style={{ marginTop: '16px' }}>
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
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
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
                      <div key={action.id} className="rpm-block-action" style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: '8px', 
                        padding: '8px',
                        opacity: 0.6
                      }}>
                        <span style={{ color: 'var(--text-muted)', minWidth: '20px' }}>{idx + 1}</span>
                        <X size={14} style={{ color: 'var(--accent-red)' }} />
                        <span style={{ flex: 1, textDecoration: 'line-through' }}>{action.title}</span>
                      </div>
                    ))}
                  </div>
                </div>
                
                {/* Block Footer */}
                <div className="rpm-block-footer" style={{ 
                  display: 'flex', 
                  justifyContent: 'space-between', 
                  alignItems: 'center',
                  marginTop: '16px',
                  paddingTop: '16px',
                  borderTop: '1px solid var(--border-primary)',
                  fontSize: '0.75rem',
                  color: 'var(--text-muted)'
                }}>
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

        <div className="planner-grid">
          {weekDays.map(day => (
            <div key={day.toISOString()} className="planner-day-header">
              {format(day, 'EEE d')}
            </div>
          ))}
          {weekDays.map(day => {
            const dayActions = getActionsForDay(day);
            const isToday = format(day, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd');
            
            return (
              <div 
                key={day.toISOString() + '-cell'} 
                className="planner-day"
                onClick={() => {
                  setEditingAction({ 
                    scheduled_date: format(day, 'yyyy-MM-dd'),
                    project_id: project.id,
                    category_id: project.category_id
                  });
                  setShowActionModal(true);
                }}
                style={{ 
                  cursor: 'pointer',
                  background: isToday ? 'var(--bg-card-hover)' : 'var(--bg-secondary)',
                  border: isToday ? '1px solid var(--accent-cyan)' : '1px solid transparent'
                }}
              >
                <div className="planner-day-number" style={{ 
                  fontWeight: isToday ? 700 : 400,
                  color: isToday ? 'var(--accent-cyan)' : 'var(--text-primary)'
                }}>
                  {format(day, 'd')}
                </div>
                {dayActions.length > 0 && (
                  <div style={{ 
                    marginTop: '8px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px'
                  }}>
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
                      <div style={{ 
                        fontSize: '0.7rem', 
                        color: 'var(--text-muted)',
                        textAlign: 'center'
                      }}>
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
    </div>
  );
}

export default ProjectDetailPage;
