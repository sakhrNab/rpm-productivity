import { useState, useEffect, useContext } from 'react';
import { useParams, Link } from 'react-router-dom';
import { 
  ChevronLeft, ChevronRight, Image, Plus, Star, MoreVertical, 
  Check, Clock, Hourglass, Calendar as CalendarIcon
} from 'lucide-react';
import { AppContext, api } from '../App';
import { format, startOfWeek, endOfWeek, eachDayOfInterval, addWeeks, subWeeks } from 'date-fns';

function ProjectDetailPage() {
  const { id } = useParams();
  const { categories } = useContext(AppContext);
  const [project, setProject] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('starred');
  const [currentWeek, setCurrentWeek] = useState(new Date());

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
          <button className="btn btn-secondary" style={{ position: 'absolute', top: 16, right: 16 }}>
            <Image size={14} />
            Change Cover Image
          </button>
          
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
          
          <h1 style={{ fontSize: '2rem', marginBottom: '8px' }}>{project.name}</h1>
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
          <p style={{ color: 'var(--text-secondary)' }}>
            {project.ultimate_result || 'Click to add ultimate result...'}
          </p>
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
          <p style={{ color: 'var(--text-secondary)' }}>
            {project.ultimate_purpose || 'Click to add ultimate purpose...'}
          </p>
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
            <button className="btn btn-icon btn-ghost" style={{ marginLeft: 'auto' }}>
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
                <div className="key-result-actions">
                  <button className="btn btn-icon btn-ghost">
                    <Star size={12} />
                  </button>
                  <button className="btn btn-icon btn-ghost">
                    <MoreVertical size={12} />
                  </button>
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
            <button className="btn btn-icon btn-ghost" style={{ marginLeft: 'auto' }}>
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
                <div className="capture-actions">
                  <button className="btn btn-icon btn-ghost">
                    <Star size={12} />
                  </button>
                  <button className="btn btn-icon btn-ghost">
                    <MoreVertical size={12} />
                  </button>
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
          <button className="btn btn-icon btn-ghost" style={{ marginLeft: 'auto' }}>
            <Plus size={14} />
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(400px, 1fr))', gap: '16px' }}>
          {project.rpm_blocks?.map(block => (
            <div key={block.id} className="rpm-block">
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
                <div style={{ display: 'flex', gap: '4px' }}>
                  <button className="btn btn-icon btn-ghost" style={{ fontSize: '0.7rem' }}>Ok</button>
                  <button className="btn btn-icon btn-ghost" style={{ fontSize: '0.7rem' }}>Mtn</button>
                  <button className="btn btn-icon btn-ghost"><MoreVertical size={12} /></button>
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
                {block.actions?.length > 0 && (
                  <div className="rpm-block-actions">
                    <div className="rpm-block-label">MASSIVE ACTION PLAN</div>
                    {block.actions.map((action, idx) => (
                      <div key={action.id} className="rpm-block-action">
                        <span style={{ color: 'var(--text-muted)', width: '20px' }}>{idx + 1}</span>
                        <div 
                          className={`action-checkbox ${action.is_completed ? 'completed' : ''}`}
                          onClick={() => toggleActionComplete(action)}
                          style={{ width: 16, height: 16 }}
                        >
                          {action.is_completed && <Check size={10} />}
                        </div>
                        <span style={{ flex: 1 }}>{action.title}</span>
                        <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                          {action.duration_hours}h {action.duration_minutes}m
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="rpm-block-footer">
                <span>{block.completed_actions || 0} COMPLETED ACTIONS</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Hourglass size={12} />
                </div>
              </div>
            </div>
          ))}
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
            <button className="btn btn-icon btn-secondary">
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
          {weekDays.map(day => (
            <div key={day.toISOString() + '-cell'} className="planner-day">
              <div className="planner-day-number">{format(day, 'd')}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default ProjectDetailPage;
