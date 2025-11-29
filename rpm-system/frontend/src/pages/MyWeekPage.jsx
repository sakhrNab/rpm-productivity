import { useState, useEffect, useContext } from 'react';
import { Plus, Star, Check, Clock, FolderOpen } from 'lucide-react';
import { AppContext, AuthContext } from '../App';
import CreateActionModal from '../components/modals/CreateActionModal';

function MyWeekPage() {
  const { categories, refreshData } = useContext(AppContext);
  const { api } = useContext(AuthContext);
  const [actions, setActions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showActionModal, setShowActionModal] = useState(false);

  useEffect(() => {
    loadActions();
  }, []);

  const loadActions = async () => {
    try {
      const data = await api.getActions({ this_week: 'true' });
      setActions(data);
    } catch (error) {
      console.error('Failed to load actions:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleComplete = async (action) => {
    try {
      await api.updateAction(action.id, { is_completed: !action.is_completed });
      await loadActions();
    } catch (error) {
      console.error('Failed to update action:', error);
    }
  };

  if (loading) {
    return <div className="loading"><div className="spinner"></div></div>;
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">My Week</h1>
        <button 
          type="button"
          className="btn btn-primary"
          onClick={() => setShowActionModal(true)}
        >
          <Plus size={16} />
          Add Action
        </button>
      </div>

      <div className="actions-list" style={{ maxWidth: '800px' }}>
        <div className="actions-header">
          <h3>This Week's Actions</h3>
          <span style={{ color: 'var(--text-muted)' }}>{actions.length} actions</span>
        </div>

        {actions.length === 0 ? (
          <div className="empty-state">
            <p>No actions scheduled for this week</p>
          </div>
        ) : (
          actions.map(action => (
            <div key={action.id} className="action-item">
              <div 
                className={`action-checkbox ${action.is_completed ? 'completed' : ''}`}
                onClick={() => toggleComplete(action)}
              >
                {action.is_completed && <Check size={12} />}
              </div>
              <div className="action-content">
                <div className={`action-title ${action.is_completed ? 'completed' : ''}`}>
                  {action.title}
                </div>
                <div className="action-meta">
                  {action.project_name && <span><FolderOpen size={12} /> {action.project_name}</span>}
                  <span><Clock size={12} /> {action.duration_hours}h {action.duration_minutes}m</span>
                </div>
              </div>
              <button className="btn btn-icon btn-ghost">
                <Star size={14} fill={action.is_starred ? 'currentColor' : 'none'} />
              </button>
            </div>
          ))
        )}
      </div>

      {/* Create Action Modal */}
      {showActionModal && categories && (
        <CreateActionModal 
          onClose={() => setShowActionModal(false)}
          onSuccess={() => {
            setShowActionModal(false);
            loadActions();
            if (refreshData) refreshData();
          }}
          categories={categories}
          initialData={{ 
            is_this_week: true
          }}
        />
      )}
    </div>
  );
}

export default MyWeekPage;
