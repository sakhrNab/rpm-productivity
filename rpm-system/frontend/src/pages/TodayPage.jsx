import { useState, useEffect, useContext, useRef } from 'react';
import { Plus, ListChecks, Sun } from 'lucide-react';
import { format } from 'date-fns';
import { AppContext, AuthContext } from '../App';
import CreateActionModal from '../components/modals/CreateActionModal';
import ActionRow from '../components/ActionRow';
import SortableActionGroups from '../components/SortableActionGroups';
import BrainDumpModal from '../components/BrainDumpModal';
import { useToast } from '../components/ToastProvider';
import CapacityStrip from '../components/CapacityStrip';
import ForecastPanel from '../components/ForecastPanel';
import TodayHero from '../components/today/TodayHero';
import CarriedOver from '../components/today/CarriedOver';
import AiSuggestions from '../components/today/AiSuggestions';
import CatchUp from '../components/today/CatchUp';
import PagedList from '../components/today/PagedList';
import { mergePageOrder } from '../utils/paging';
import { patchCompassAction } from '../utils/compassStore';
import { sortActions, groupActions } from '../utils/actionSort';
import '../components/coachhub/aiShared.css';
import '../components/today/Today.css';

// Today — the day in one place (what My Day and Compass used to split): where the day
// stands + the Compass must-win, capacity, today's list, carried-over triage, AI
// suggestions, and the goal forecast board.
function TodayPage() {
  const { categories, refreshData } = useContext(AppContext);
  const { api, user } = useContext(AuthContext);
  const { showToast } = useToast();
  const [actions, setActions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showActionModal, setShowActionModal] = useState(false);
  const [editingAction, setEditingAction] = useState(null);
  const [suggest, setSuggest] = useState(null);
  const [reminders, setReminders] = useState([]);
  const [overdue, setOverdue] = useState([]);
  const [triaging, setTriaging] = useState(false);
  const [triagePlan, setTriagePlan] = useState(null);
  const [forecast, setForecast] = useState(undefined);   // shared up from ForecastPanel (no extra request)
  const suggestRef = useRef(null);
  const listRef = useRef(null);
  // Side by side, Carried over takes the natural height of Today's list (never stretches it).
  const [paneH, setPaneH] = useState(null);
  const forecastRef = useRef(null);
  const today = format(new Date(), 'yyyy-MM-dd');

  useEffect(() => { loadActions(); loadReminders(); loadOverdue(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Tasks still sitting on a past date. We never silently move them — the real dates
  // are what keep the forecasting honest — so they're surfaced here to triage.
  const loadOverdue = () => api.getOverdueActions(today).then(d => setOverdue(Array.isArray(d) ? d : [])).catch(() => {});
  const moveToToday = async (a) => {
    try { await api.updateAction(a.id, { scheduled_date: today }); loadOverdue(); loadActions(); showToast('Moved to today', 'success'); }
    catch { showToast('Could not move that task', 'error'); }
  };
  const dropTask = async (a) => {
    try { await api.updateAction(a.id, { is_cancelled: true }); loadOverdue(); showToast(`Dropped “${a.title}”`, 'info'); }
    catch { showToast('Could not drop that task', 'error'); }
  };
  const completeOverdue = async (a) => {
    try { await api.updateAction(a.id, { is_completed: true }); loadOverdue(); showToast('Done', 'success'); }
    catch { showToast('Could not update that task', 'error'); }
  };
  const moveAllToToday = async () => {
    if (!overdue.length) return;
    try {
      await Promise.all(overdue.map(a => api.updateAction(a.id, { scheduled_date: today })));
      loadOverdue(); loadActions(); showToast(`Moved ${overdue.length} to today`, 'success');
    } catch { showToast('Some tasks could not be moved', 'error'); loadOverdue(); loadActions(); }
  };
  const triageOverdue = async () => {
    const modelKey = localStorage.getItem('ai.modelKey');
    if (!modelKey) { showToast('Pick a default AI model in Settings first.', 'info'); return; }
    setTriaging(true);
    try {
      const res = await api.triageOverdue({ modelKey, today });
      if (res.error) throw new Error(res.error);
      if (!res.operations?.length) { showToast('No triage suggestions came back.', 'info'); return; }
      setTriagePlan(res);
    } catch (e) {
      const msg = e.message || 'Failed to triage';
      if (/no longer available|unknown model/i.test(msg)) localStorage.removeItem('ai.modelKey');
      showToast(msg, 'error');
    } finally { setTriaging(false); }
  };

  const loadActions = async () => {
    try {
      const data = await api.getPlanner(today, today);
      setActions(sortActions(data));
    } catch (error) {
      console.error('Failed to load actions:', error);
    } finally { setLoading(false); }
  };
  const loadReminders = () => api.getReminders().then(rs => setReminders(Array.isArray(rs) ? rs : [])).catch(() => {});
  const remindersFor = (actionId) => reminders.filter(r => r.action_id === actionId);
  const deleteReminderFor = async (r) => {
    try { await api.deleteReminder(r.id); loadReminders(); showToast('Reminder removed', 'info'); }
    catch { showToast('Failed to remove reminder', 'error'); }
  };
  const updateReminderFor = async (r, patch) => {
    try { const res = await api.updateReminder(r.id, patch); if (res?.error) throw new Error(res.error); loadReminders(); showToast('Reminder updated', 'success'); }
    catch (e) { showToast(e.message || 'Failed to update reminder', 'error'); }
  };

  const patchAndSort = (id, patch) => setActions(prev => sortActions(prev.map(a => (a.id === id ? { ...a, ...patch } : a))));

  const toggleComplete = async (action) => {
    const next = !action.is_completed;
    patchAndSort(action.id, { is_completed: next });
    patchCompassAction(action.id, { is_completed: next });   // keep the cached compass context in step
    try { await api.updateAction(action.id, { is_completed: next }); }
    catch (error) {
      console.error('Failed to update action:', error);
      patchAndSort(action.id, { is_completed: !next });
      patchCompassAction(action.id, { is_completed: !next });
    }
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

  const remindAction = async (action, remindAtISO) => {
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
      const r = await api.createReminder({ title: action.title, action_id: action.id, kind: 'once', remind_at: remindAtISO, timezone: tz });
      if (r?.error) throw new Error(r.error);
      loadReminders();
      showToast('Reminder set', 'success');
    } catch (e) { showToast(e.message || 'Failed to set reminder', 'error'); }
  };

  // A reorder within one page of the list, merged back into the full order. While a search
  // filters the list the pages aren't contiguous, so reordering waits until it's cleared.
  const reorderPage = (offset, searching) => (pageIds) => {
    if (searching) { showToast('Clear the search to reorder.', 'info'); return; }
    handleReorder(mergePageOrder(actions.map(a => a.id), offset, pageIds));
  };
  const actionText = (a) => `${a.title} ${a.project_name || ''} ${a.category_name || ''}`;

  const handleEdit = (action) => { setEditingAction(action); setShowActionModal(true); };
  const handleDelete = async (action) => {
    if (!window.confirm(`Delete action "${action.title}"?`)) return;
    try { await api.deleteAction(action.id); await loadActions(); if (refreshData) refreshData(); }
    catch (error) { console.error('Failed to delete action:', error); }
  };
  const closeModal = () => { setShowActionModal(false); setEditingAction(null); };

  // AI suggestions (propose-only) for today.
  const runSuggest = async () => {
    const modelKey = localStorage.getItem('ai.modelKey');
    if (!modelKey) { showToast('Pick a default AI model in Settings first.', 'info'); return; }
    setSuggest({ loading: true });
    try {
      const res = await api.aiSuggestPlan({ modelKey, start_date: today, end_date: today });
      if (res.error) throw new Error(res.error);
      setSuggest({ text: res.text, proposals: (res.proposals || []).map(p => ({ ...p })), usage: res.usage });
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
      loadActions(); loadOverdue(); if (refreshData) refreshData();
    } catch (e) {
      setSuggest(s => ({ ...s, proposals: s.proposals.map((x, i) => (i === idx ? { ...x, status: undefined } : x)) }));
      showToast(e.message || 'Failed to apply', 'error');
    }
  };
  const dismissSuggestion = (idx) => setSuggest(s => ({ ...s, proposals: s.proposals.map((x, i) => (i === idx ? { ...x, status: 'dismissed' } : x)) }));

  // The suggestions panel sits below the list on phones — bring it into view when asked for.
  const suggestLoading = !!suggest?.loading;
  useEffect(() => {
    if (suggestLoading) requestAnimationFrame(() => suggestRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }));
  }, [suggestLoading]);

  useEffect(() => {
    const el = listRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(() => setPaneH(Math.round(el.getBoundingClientRect().height)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [loading]);

  const jumpToForecast = () => forecastRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  if (loading) return <div className="loading"><div className="spinner"></div></div>;

  const doneCount = actions.filter(a => a.is_completed).length;
  const pct = actions.length ? Math.round((doneCount / actions.length) * 100) : 0;
  const hasAside = !!suggest || overdue.length > 0;

  return (
    <div className={`td-page ${hasAside ? 'has-aside' : ''}`} style={paneH ? { '--pane-h': `${Math.max(420, paneH)}px` } : undefined}>
      <TodayHero
        user={user}
        actions={actions}
        overdueCount={overdue.length}
        forecast={forecast}
        suggestLoading={suggestLoading}
        onSuggest={runSuggest}
        onAdd={() => setShowActionModal(true)}
        onJumpForecast={jumpToForecast}
      />

      <div className="td-cap">
        <CapacityStrip start={today} today={today} refreshKey={actions} onChanged={() => { loadActions(); loadOverdue(); }} />
      </div>

      <section ref={listRef} className="ui-card td-list" aria-label="Today's actions">
        <div className="td-list-head">
          <p className="ui-kicker"><ListChecks size={14} /> Today’s actions <span className="ui-count">{actions.length ? `${doneCount}/${actions.length}` : ''}</span></p>
          {actions.length > 0 && <div className="ui-meter td-list-meter" aria-hidden="true"><i style={{ '--pct': `${pct}%` }} /></div>}
        </div>

        <CatchUp forecast={forecast} onPlanned={() => { loadActions(); loadOverdue(); if (refreshData) refreshData(); }} />

        {actions.length === 0 ? (
          <div className="ui-empty">
            <Sun size={26} />
            <p>A clear day. Plan one thing that moves you forward.</p>
            <button type="button" className="btn btn-primary" onClick={() => setShowActionModal(true)}><Plus size={16} /> Add Action</button>
          </div>
        ) : (
          <PagedList items={actions} pageSize={6} textOf={actionText} label="today's actions" searchPlaceholder="Search today’s actions…" renderPage={(pageItems, { offset, searching }) => (
          <SortableActionGroups
            groups={groupActions(pageItems)}
            onReorder={reorderPage(offset, searching)}
            renderRow={(action) => (
              <ActionRow
                action={action}
                hideToday
                onToggleComplete={toggleComplete}
                onToggleStar={toggleStar}
                onEdit={handleEdit}
                onDelete={handleDelete}
                onChangePriority={changePriority}
                onRemind={remindAction}
                reminders={remindersFor(action.id)}
                onDeleteReminder={deleteReminderFor}
                onUpdateReminder={updateReminderFor}
              />
            )}
          />
          )} />
        )}
      </section>

      {hasAside && (
        <div className="td-aside">
          <CarriedOver
            overdue={overdue}
            triaging={triaging}
            onTriage={triageOverdue}
            onMoveAll={moveAllToToday}
            onComplete={completeOverdue}
            onOpen={handleEdit}
            onToday={moveToToday}
            onDrop={dropTask}
          />
          <AiSuggestions
            ref={suggestRef}
            suggest={suggest}
            onApply={applySuggestion}
            onDismiss={dismissSuggestion}
            onClose={() => setSuggest(null)}
          />
        </div>
      )}

      <div className="td-forecast" ref={forecastRef}>
        <ForecastPanel onData={setForecast} />
      </div>

      {triagePlan && (
        <BrainDumpModal
          initialPlan={triagePlan}
          title="Triage carried-over tasks"
          onClose={() => setTriagePlan(null)}
          onApplied={() => { setTriagePlan(null); loadOverdue(); loadActions(); }}
        />
      )}

      {showActionModal && categories && (
        <CreateActionModal
          onClose={closeModal}
          onSuccess={() => { closeModal(); loadActions(); if (refreshData) refreshData(); }}
          categories={categories}
          initialData={editingAction || { scheduled_date: today, is_this_week: true }}
        />
      )}
    </div>
  );
}

export default TodayPage;
