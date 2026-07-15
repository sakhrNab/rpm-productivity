import { useState, useEffect, useContext } from 'react';
import { Plus, Sparkles, X, Check } from 'lucide-react';
import { format, startOfWeek, endOfWeek } from 'date-fns';
import { AppContext, AuthContext } from '../App';
import CreateActionModal from '../components/modals/CreateActionModal';
import ActionRow from '../components/ActionRow';
import SortableActionGroups from '../components/SortableActionGroups';
import Markdown from '../components/Markdown';
import { useToast } from '../components/ToastProvider';
import { sortActions, groupActions } from '../utils/actionSort';
import './MyWeekPage.css';

function MyWeekPage() {
  const { categories, refreshData } = useContext(AppContext);
  const { api } = useContext(AuthContext);
  const { showToast } = useToast();
  const [actions, setActions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showActionModal, setShowActionModal] = useState(false);
  const [editingAction, setEditingAction] = useState(null);
  const [suggest, setSuggest] = useState(null);
  const weekStart = format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd');
  const weekEnd = format(endOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd');

  useEffect(() => { loadActions(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const loadActions = async () => {
    try {
      const data = await api.getActions({ this_week: 'true', start_date: weekStart, end_date: weekEnd });
      setActions(sortActions(data));
    } catch (error) {
      console.error('Failed to load actions:', error);
    } finally { setLoading(false); }
  };

  const patchAndSort = (id, patch) => setActions(prev => sortActions(prev.map(a => (a.id === id ? { ...a, ...patch } : a))));

  const toggleComplete = async (action) => {
    const next = !action.is_completed;
    patchAndSort(action.id, { is_completed: next });
    try { await api.updateAction(action.id, { is_completed: next }); }
    catch (error) { console.error('Failed to update action:', error); patchAndSort(action.id, { is_completed: !next }); }
  };
  const toggleStar = async (action) => {
    const next = !action.is_starred;
    setActions(prev => prev.map(a => (a.id === action.id ? { ...a, is_starred: next } : a)));
    try { await api.updateAction(action.id, { is_starred: next }); }
    catch (error) { console.error('Failed to update action:', error); setActions(prev => prev.map(a => (a.id === action.id ? { ...a, is_starred: !next } : a))); }
  };
  const changePriority = async (action, priority) => {
    const prev = action.priority || 0;
    patchAndSort(action.id, { priority });
    try { await api.updateAction(action.id, { priority }); }
    catch (error) { console.error('Failed to set priority:', error); patchAndSort(action.id, { priority: prev }); }
  };

  // Reorder (touch + mouse via dnd-kit) — persist the new order, optimistically.
  const handleReorder = async (ids) => {
    setActions(prev => {
      const map = new Map(prev.map(a => [a.id, a]));
      return ids.map(id => map.get(id)).filter(Boolean);
    });
    try { await api.reorderActions(ids); }
    catch (error) { console.error('Failed to reorder actions:', error); loadActions(); }
  };

  const handleEdit = (action) => { setEditingAction(action); setShowActionModal(true); };
  const handleDelete = async (action) => {
    if (!window.confirm(`Delete action "${action.title}"?`)) return;
    try { await api.deleteAction(action.id); await loadActions(); if (refreshData) refreshData(); }
    catch (error) { console.error('Failed to delete action:', error); }
  };
  const closeModal = () => { setShowActionModal(false); setEditingAction(null); };

  const runSuggest = async () => {
    const modelKey = localStorage.getItem('ai.modelKey');
    if (!modelKey) { showToast('Pick a default AI model in Settings first.', 'info'); return; }
    setSuggest({ loading: true });
    try {
      const res = await api.aiSuggestPlan({ modelKey, start_date: weekStart, end_date: weekEnd });
      if (res.error) throw new Error(res.error);
      setSuggest({ text: res.text, proposals: (res.proposals || []).map(p => ({ ...p })) });
    } catch (e) {
      const msg = e.message || 'Failed to get suggestions';
      if (/no longer available|unknown model/i.test(msg)) localStorage.removeItem('ai.modelKey');
      setSuggest({ error: msg });
    }
  };
  const applySuggestion = async (idx, p) => {
    setSuggest(s => ({ ...s, proposals: s.proposals.map((x, i) => (i === idx ? { ...x, status: 'applying' } : x)) }));
    try {
      const res = await api.aiApplyProposal({ kind: p.kind, payload: p.payload });
      if (!res || res.error || res.ok === false) throw new Error(res?.error || 'Failed to apply');
      setSuggest(s => ({ ...s, proposals: s.proposals.map((x, i) => (i === idx ? { ...x, status: 'applied' } : x)) }));
      showToast('Applied', 'success');
      loadActions(); if (refreshData) refreshData();
    } catch (e) {
      setSuggest(s => ({ ...s, proposals: s.proposals.map((x, i) => (i === idx ? { ...x, status: undefined } : x)) }));
      showToast(e.message || 'Failed to apply', 'error');
    }
  };
  const dismissSuggestion = (idx) => setSuggest(s => ({ ...s, proposals: s.proposals.map((x, i) => (i === idx ? { ...x, status: 'dismissed' } : x)) }));

  if (loading) return <div className="loading"><div className="spinner"></div></div>;

  const groups = groupActions(actions);

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">My Week</h1>
        <div className="md-header-actions">
          <button type="button" className="btn btn-secondary" onClick={runSuggest} disabled={suggest?.loading}>
            <Sparkles size={16} /> {suggest?.loading ? 'Thinking…' : 'AI suggestions'}
          </button>
          <button type="button" className="btn btn-primary" onClick={() => setShowActionModal(true)}>
            <Plus size={16} /> Add Action
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
            {Array.isArray(suggest.proposals) && suggest.proposals.length > 0 && (
              <div className="asst-proposals md-suggest-proposals">
                <div className="asst-proposals-head">Suggested changes — approve what you want</div>
                {suggest.proposals.map((p, idx) => (
                  <div key={idx} className={`asst-proposal ${p.status || ''}`}>
                    <span className="asst-proposal-label">{p.label || p.kind}</span>
                    {!p.status && (
                      <span className="asst-proposal-actions">
                        <button className="asst-prop-approve" onClick={() => applySuggestion(idx, p)}><Check size={13} /> Approve</button>
                        <button className="asst-prop-dismiss" onClick={() => dismissSuggestion(idx)}><X size={13} /> Dismiss</button>
                      </span>
                    )}
                    {p.status === 'applying' && <span className="asst-proposal-state">Applying…</span>}
                    {p.status === 'applied' && <span className="asst-proposal-state done"><Check size={13} /> Applied</span>}
                    {p.status === 'dismissed' && <span className="asst-proposal-state muted">Dismissed</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="actions-list mw-actions-list">
        <div className="actions-header">
          <h3>This Week's Actions</h3>
          <span className="list-count">{actions.length} actions</span>
        </div>

        {actions.length === 0 ? (
          <div className="empty-state"><p>No actions scheduled for this week</p></div>
        ) : (
          <SortableActionGroups
            groups={groups}
            onReorder={handleReorder}
            renderRow={(action) => (
              <ActionRow
                action={action}
                onToggleComplete={toggleComplete}
                onToggleStar={toggleStar}
                onEdit={handleEdit}
                onDelete={handleDelete}
                onChangePriority={changePriority}
              />
            )}
          />
        )}
      </div>

      {showActionModal && categories && (
        <CreateActionModal
          onClose={closeModal}
          onSuccess={() => { closeModal(); loadActions(); if (refreshData) refreshData(); }}
          categories={categories}
          initialData={editingAction || { is_this_week: true }}
        />
      )}
    </div>
  );
}

export default MyWeekPage;
