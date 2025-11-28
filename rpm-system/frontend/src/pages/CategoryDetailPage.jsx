import { useState, useEffect, useContext } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { 
  ChevronLeft, Image, Star, MoreVertical, Plus, Clock, 
  FolderOpen, Calendar, Check, Hourglass
} from 'lucide-react';
import { AppContext, api } from '../App';

function CategoryDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { categories, refreshData } = useContext(AppContext);
  const [category, setCategory] = useState(null);
  const [activeTab, setActiveTab] = useState('big-picture');
  const [actions, setActions] = useState([]);
  const [blocks, setBlocks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingField, setEditingField] = useState(null);
  const [editValue, setEditValue] = useState('');

  useEffect(() => {
    loadCategory();
  }, [id]);

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
    } catch (error) {
      console.error('Failed to load category:', error);
    } finally {
      setLoading(false);
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

  const toggleActionComplete = async (action) => {
    try {
      await api.updateAction(action.id, { is_completed: !action.is_completed });
      await loadCategory();
      setActions(prev => prev.map(a => 
        a.id === action.id ? { ...a, is_completed: !a.is_completed } : a
      ));
    } catch (error) {
      console.error('Failed to update action:', error);
    }
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
              className="btn btn-secondary" 
              style={{ marginTop: '16px' }}
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
                <select className="form-input" style={{ width: 'auto', padding: '4px 12px' }}>
                  <option>View All</option>
                  <option>Starred</option>
                  <option>This Week</option>
                  <option>Completed</option>
                </select>
                <button className="btn btn-icon btn-secondary">
                  <Plus size={16} />
                </button>
              </div>
            </div>

            {actions.length === 0 ? (
              <div className="empty-state">
                <p>No actions yet. Create your first action!</p>
              </div>
            ) : (
              actions.map(action => (
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
                    <div className="action-meta">
                      {action.project_name && (
                        <span><FolderOpen size={12} /> {action.project_name}</span>
                      )}
                      <span><Clock size={12} /> {action.duration_hours}h {action.duration_minutes}m</span>
                      {action.scheduled_date && (
                        <span><Calendar size={12} /> {action.scheduled_date}</span>
                      )}
                    </div>
                  </div>
                  <div className="action-actions">
                    <button className="btn btn-icon btn-ghost">
                      <Star size={14} fill={action.is_starred ? 'currentColor' : 'none'} />
                    </button>
                    <button className="btn btn-icon btn-ghost">
                      <MoreVertical size={14} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* RPM Blocks */}
          <div className="rpm-blocks-container">
            <div className="rpm-blocks-header">
              <h3 style={{ fontSize: '1rem' }}>RPM Blocks</h3>
              <button className="btn btn-icon btn-secondary">
                <Plus size={16} />
              </button>
            </div>

            {blocks.length === 0 ? (
              <div className="empty-state">
                <p>No blocks yet. Create your first RPM block!</p>
              </div>
            ) : (
              blocks.map(block => (
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
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button className="btn btn-icon btn-ghost" style={{ fontSize: '0.75rem' }}>
                        Ok
                      </button>
                      <button className="btn btn-icon btn-ghost" style={{ fontSize: '0.75rem' }}>
                        Mtn
                      </button>
                      <button className="btn btn-icon btn-ghost">
                        <MoreVertical size={14} />
                      </button>
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
                    {block.actions && block.actions.length > 0 && (
                      <div className="rpm-block-actions">
                        <div className="rpm-block-label">MASSIVE ACTION PLAN</div>
                        {block.actions.map((action, idx) => (
                          <div key={action.id} className="rpm-block-action">
                            <span style={{ color: 'var(--text-muted)' }}>{idx + 1}</span>
                            <span>{action.title}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="rpm-block-footer">
                    <span>{block.completed_actions || 0} COMPLETED ACTIONS</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Hourglass size={14} />
                      <span>In Progress</span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default CategoryDetailPage;
