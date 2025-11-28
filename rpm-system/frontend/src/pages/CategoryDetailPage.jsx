import { useState, useEffect, useContext } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { 
  ChevronLeft, Image, Star, MoreVertical, Plus, Clock, 
  FolderOpen, Calendar, Check, Hourglass, Edit, Copy, X, Trash2,
  Move, Download, ChevronUp, ChevronDown
} from 'lucide-react';
import { AppContext, api } from '../App';
import CreateActionModal from '../components/modals/CreateActionModal';
import CreateBlockModal from '../components/modals/CreateBlockModal';
import CreateProjectModal from '../components/modals/CreateProjectModal';

function CategoryDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { categories, refreshData } = useContext(AppContext);
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
  const [editingAction, setEditingAction] = useState(null);
  const [openActionMenu, setOpenActionMenu] = useState(null);
  const [editingBlock, setEditingBlock] = useState(null);
  const [openBlockMenu, setOpenBlockMenu] = useState(null);
  const [openBlockActionMenu, setOpenBlockActionMenu] = useState(null); // { actionId, top, right } or null
  const [expandedCompleted, setExpandedCompleted] = useState({});
  const [expandedCancelled, setExpandedCancelled] = useState({});

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

  // Debug: Log modal state changes
  useEffect(() => {
    console.log('Action modal state:', showActionModal);
  }, [showActionModal]);

  useEffect(() => {
    console.log('Block modal state:', showBlockModal);
  }, [showBlockModal]);

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

  const toggleActionComplete = async (action) => {
    try {
      await api.updateAction(action.id, { is_completed: !action.is_completed });
      await loadCategory();
    } catch (error) {
      console.error('Failed to update action:', error);
    }
  };

  const toggleActionStar = async (action) => {
    try {
      await api.updateAction(action.id, { is_starred: !action.is_starred });
      await loadCategory();
    } catch (error) {
      console.error('Failed to update action:', error);
    }
  };

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
        <ChevronLeft size={14} style={{ transform: 'rotate(180deg)' }} />
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
          <button 
            className="btn btn-secondary"
            style={{ 
              position: 'absolute', 
              top: '16px', 
              right: '16px',
              fontSize: '0.85rem'
            }}
          >
            <Image size={14} />
            Change Cover Image
          </button>

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
          
          <h1 style={{ 
            fontSize: '2.5rem', 
            fontWeight: 300,
            maxWidth: '700px',
            lineHeight: 1.3
          }}>
            {details.ultimate_vision || category.description || 'Click to add your ultimate vision...'}
          </h1>
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
                <div style={{ marginTop: '8px', display: 'flex', gap: '8px' }}>
                  <button className="btn btn-primary" onClick={handleFieldSave}>Save</button>
                  <button className="btn btn-secondary" onClick={() => setEditingField(null)}>Cancel</button>
                </div>
              </div>
            ) : (
              <p 
                className="big-picture-content"
                onClick={() => handleFieldEdit('roles', details.roles)}
                style={{ cursor: 'pointer' }}
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
                <div style={{ marginTop: '8px', display: 'flex', gap: '8px' }}>
                  <button className="btn btn-primary" onClick={handleFieldSave}>Save</button>
                  <button className="btn btn-secondary" onClick={() => setEditingField(null)}>Cancel</button>
                </div>
              </div>
            ) : (
              <p 
                className="big-picture-content"
                onClick={() => handleFieldEdit('ultimate_purpose', details.ultimate_purpose)}
                style={{ cursor: 'pointer' }}
              >
                {details.ultimate_purpose || 'Click to add your ultimate purpose...'}
              </p>
            )}
          </div>

          {/* Goals Row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '24px' }}>
            {/* One Year Goals */}
            <div className="big-picture-section" style={{ marginBottom: 0 }}>
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
                  <div style={{ marginTop: '8px', display: 'flex', gap: '8px' }}>
                    <button className="btn btn-primary" onClick={handleFieldSave}>Save</button>
                    <button className="btn btn-secondary" onClick={() => setEditingField(null)}>Cancel</button>
                  </div>
                </div>
              ) : (
                <p 
                  className="big-picture-content"
                  onClick={() => handleFieldEdit('one_year_goals', details.one_year_goals)}
                  style={{ cursor: 'pointer', whiteSpace: 'pre-wrap' }}
                >
                  {details.one_year_goals || 'Click to add your one year goals...'}
                </p>
              )}
            </div>

            {/* 90 Day Goals */}
            <div className="big-picture-section" style={{ marginBottom: 0 }}>
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
                  <div style={{ marginTop: '8px', display: 'flex', gap: '8px' }}>
                    <button className="btn btn-primary" onClick={handleFieldSave}>Save</button>
                    <button className="btn btn-secondary" onClick={() => setEditingField(null)}>Cancel</button>
                  </div>
                </div>
              ) : (
                <p 
                  className="big-picture-content"
                  onClick={() => handleFieldEdit('ninety_day_goals', details.ninety_day_goals)}
                  style={{ cursor: 'pointer', whiteSpace: 'pre-wrap' }}
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
            
            <div className="projects-grid">
              {category.projects?.map(project => (
                <div 
                  key={project.id}
                  className="project-card"
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
                  <div className="project-card-content">
                    <div 
                      className="project-card-badge"
                      style={{ color: category.color }}
                    >
                      <span style={{ 
                        width: 8, 
                        height: 8, 
                        borderRadius: '50%', 
                        background: category.color 
                      }} />
                      {category.name}
                    </div>
                    <h3 className="project-card-title">{project.name}</h3>
                    <p className="project-card-description">
                      {project.ultimate_result || project.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            <button 
              type="button"
              className="btn btn-secondary" 
              style={{ marginTop: '16px' }}
              onClick={() => setShowProjectModal(true)}
            >
              <Plus size={16} />
              Create New Project
            </button>
          </div>
        </div>
      ) : (
        /* Actions and Blocks Tab */
        <div className="actions-container">
          {/* Actions List */}
          <div className="actions-list">
            <div className="actions-header">
              <h3 style={{ fontSize: '1rem' }}>Actions</h3>
              <div style={{ display: 'flex', gap: '8px' }}>
                <select 
                  className="form-input" 
                  style={{ width: 'auto', padding: '4px 12px' }}
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
                  className="btn btn-icon btn-secondary"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    console.log('Action button clicked, current state:', showActionModal);
                    setShowActionModal(true);
                    console.log('State set to true');
                  }}
                  style={{ 
                    cursor: 'pointer',
                    pointerEvents: 'auto',
                    zIndex: 10,
                    position: 'relative'
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
                  <div className="action-actions" style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
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
                      <Plus size={12} style={{ marginRight: '4px' }} />
                      This week
                    </button>
                    
                    {/* More Options Menu */}
                    <div style={{ position: 'relative' }}>
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
              ))
            )}
          </div>

          {/* RPM Blocks */}
          <div className="rpm-blocks-container">
            <div className="rpm-blocks-header">
              <h3 style={{ fontSize: '1rem' }}>RPM Blocks</h3>
              <button 
                type="button"
                className="btn btn-icon btn-secondary"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  console.log('Block button clicked, current state:', showBlockModal);
                  setShowBlockModal(true);
                  console.log('State set to true');
                }}
                style={{ 
                  cursor: 'pointer',
                  pointerEvents: 'auto',
                  zIndex: 10,
                  position: 'relative'
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
                        <span style={{ 
                          width: 8, 
                          height: 8, 
                          borderRadius: '50%', 
                          background: category.color 
                        }} />
                        {category.name}
                      </div>
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        {/* Starred Actions Duration */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem' }}>
                          <Star size={14} fill="currentColor" style={{ color: 'var(--accent-orange)' }} />
                          <span>
                            {stats.starredDuration.hours > 0 ? `${stats.starredDuration.hours}h ` : ''}
                            {stats.starredDuration.minutes}m
                          </span>
                        </div>
                        {/* Total Duration */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem' }}>
                          <Clock size={14} />
                          <span>
                            {stats.totalDuration.hours > 0 ? `${stats.totalDuration.hours}h ` : ''}
                            {stats.totalDuration.minutes}m
                          </span>
                        </div>
                        {/* Block Menu */}
                        <div style={{ position: 'relative' }}>
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
                                onClick={() => {/* TODO: Implement move */}}
                              >
                                <Move size={14} />
                                <span>Move Block</span>
                              </div>
                              <div 
                                className="dropdown-item"
                                onClick={() => {/* TODO: Implement export */}}
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
                                  <Plus size={10} style={{ marginRight: '2px' }} />
                                  This week
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
                          onClick={() => {
                            setEditingAction({ block_id: block.id, category_id: block.category_id || id });
                            setShowActionModal(true);
                          }}
                          style={{ 
                            marginTop: '8px',
                            width: '100%',
                            justifyContent: 'center'
                          }}
                        >
                          <Plus size={14} />
                          Add Action
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
    </div>
  );
}

export default CategoryDetailPage;
