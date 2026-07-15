import { useState, useEffect, useContext } from 'react';
import { Plus, Sparkles, X } from 'lucide-react';
import { format, startOfWeek, endOfWeek } from 'date-fns';
import { AppContext, AuthContext } from '../App';
import CreateActionModal from '../components/modals/CreateActionModal';
import ActionRow from '../components/ActionRow';
import Markdown from '../components/Markdown';
import { useToast } from '../components/ToastProvider';
import './MyWeekPage.css';

function MyWeekPage() {
  const { categories, refreshData } = useContext(AppContext);
  const { api } = useContext(AuthContext);
  const { showToast } = useToast();
  const [actions, setActions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showActionModal, setShowActionModal] = useState(false);
  const [editingAction, setEditingAction] = useState(null);
  const [dragId, setDragId] = useState(null);
  const [suggest, setSuggest] = useState(null);
  const weekStart = format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd');
  const weekEnd = format(endOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd');

  const runSuggest = async () => {
    const modelKey = localStorage.getItem('ai.modelKey');
    if (!modelKey) { showToast('Pick a default AI model in Settings first.', 'info'); return; }
    setSuggest({ loading: true });
    try {
      const res = await api.aiSuggestPlan({ modelKey, start_date: weekStart, end_date: weekEnd });
      if (res.error) throw new Error(res.error);
      setSuggest({ text: res.text });
    } catch (e) { setSuggest({ error: e.message || 'Failed to get suggestions' }); }
  };

  const handleDragOver = (e, overId) => {
    e.preventDefault();
    if (!dragId || dragId === overId) return;
    setActions(prev => {
      const from = prev.findIndex(a => a.id === dragId);
      const to = prev.findIndex(a => a.id === overId);
      if (from === -1 || to === -1) return prev;
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  };
  const handleDrop = async () => {
    const ids = actions.map(a => a.id);
    setDragId(null);
    try { await api.reorderActions(ids); }
    catch (error) { console.error('Failed to reorder actions:', error); loadActions(); }
  };
  const changePriority = async (action, priority) => {
    const prev = action.priority || 0;
    patchAction(action.id, { priority });
    try { await api.updateAction(action.id, { priority }); }
    catch (error) { console.error('Failed to set priority:', error); patchAction(action.id, { priority: prev }); }
  };

  useEffect(() => {
    loadActions();
  }, []);

  const loadActions = async () => {
    try {
      // Unified "this week": flagged is_this_week OR scheduled within the current week
      const data = await api.getActions({ this_week: 'true', start_date: weekStart, end_date: weekEnd });
      setActions(data);
    } catch (error) {
      console.error('Failed to load actions:', error);
    } finally {
      setLoading(false);
    }
  };

  // Optimistic: flip the field locally right away, then persist; revert on error.
  const patchAction = (id, patch) =>
    setActions(prev => prev.map(a => (a.id === id ? { ...a, ...patch } : a)));

  const toggleComplete = async (action) => {
    const next = !action.is_completed;
    patchAction(action.id, { is_completed: next });
    try {
      await api.updateAction(action.id, { is_completed: next });
    } catch (error) {
      console.error('Failed to update action:', error);
      patchAction(action.id, { is_completed: !next });
    }
  };

  const toggleStar = async (action) => {
    const next = !action.is_starred;
    patchAction(action.id, { is_starred: next });
    try {
      await api.updateAction(action.id, { is_starred: next });
    } catch (error) {
      console.error('Failed to update action:', error);
      patchAction(action.id, { is_starred: !next });
    }
  };

  const handleEdit = (action) => {
    setEditingAction(action);
    setShowActionModal(true);
  };

  const handleDelete = async (action) => {
    if (!window.confirm(`Delete action "${action.title}"?`)) return;
    try {
      await api.deleteAction(action.id);
      await loadActions();
      if (refreshData) refreshData();
    } catch (error) {
      console.error('Failed to delete action:', error);
    }
  };

  const closeModal = () => {
    setShowActionModal(false);
    setEditingAction(null);
  };

  if (loading) {
    return <div className="loading"><div className="spinner"></div></div>;
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">My Week</h1>
        <div className="md-header-actions">
          <button type="button" className="btn btn-secondary" onClick={runSuggest} disabled={suggest?.loading}>
            <Sparkles size={16} />
            {suggest?.loading ? 'Thinking…' : 'AI suggestions'}
          </button>
          <button type="button" className="btn btn-primary" onClick={() => setShowActionModal(true)}>
            <Plus size={16} />
            Add Action
          </button>
        </div>
      </div>

      {suggest && (
        <div className="md-suggest">
          <div className="md-suggest-head">
            <span><Sparkles size={15} /> AI suggestions</span>
            <button type="button" className="md-suggest-close" onClick={() => setSuggest(null)} aria-label="Close"><X size={15} /></button>
          </div>
          <div className="md-suggest-body">
            {suggest.loading && <p className="md-suggest-muted">Reviewing your week and priorities…</p>}
            {suggest.error && <p className="md-suggest-error">{suggest.error}</p>}
            {suggest.text && <Markdown>{suggest.text}</Markdown>}
          </div>
        </div>
      )}

      <div className="actions-list mw-actions-list">
        <div className="actions-header">
          <h3>This Week's Actions</h3>
          <span className="list-count">{actions.length} actions</span>
        </div>

        {actions.length === 0 ? (
          <div className="empty-state">
            <p>No actions scheduled for this week</p>
          </div>
        ) : (
          actions.map(action => (
            <div
              key={action.id}
              className={`md-drag-row ${dragId === action.id ? 'dragging' : ''}`}
              draggable
              onDragStart={(e) => { setDragId(action.id); e.dataTransfer.effectAllowed = 'move'; }}
              onDragOver={(e) => handleDragOver(e, action.id)}
              onDrop={(e) => { e.preventDefault(); handleDrop(); }}
              onDragEnd={handleDrop}
            >
              <ActionRow
                action={action}
                onToggleComplete={toggleComplete}
                onToggleStar={toggleStar}
                onEdit={handleEdit}
                onDelete={handleDelete}
                onChangePriority={changePriority}
              />
            </div>
          ))
        )}
      </div>

      {/* Create / Edit Action Modal */}
      {showActionModal && categories && (
        <CreateActionModal
          onClose={closeModal}
          onSuccess={() => {
            closeModal();
            loadActions();
            if (refreshData) refreshData();
          }}
          categories={categories}
          initialData={editingAction || { is_this_week: true }}
        />
      )}
    </div>
  );
}

export default MyWeekPage;
