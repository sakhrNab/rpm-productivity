import { useState, useEffect, useContext } from 'react';
import { Plus, Sparkles, X, Check, AlertTriangle, Wand2, Loader2, CalendarDays, ListChecks, CheckCircle2, Clock, CircleDot, ArrowDownToLine, Sun } from 'lucide-react';
import { format } from 'date-fns';
import { AppContext, AuthContext } from '../App';
import CreateActionModal from '../components/modals/CreateActionModal';
import ActionRow from '../components/ActionRow';
import SortableActionGroups from '../components/SortableActionGroups';
import BrainDumpModal from '../components/BrainDumpModal';
import Markdown from '../components/Markdown';
import UsageBadge from '../components/UsageBadge';
import { useToast } from '../components/ToastProvider';
import CapacityStrip from '../components/CapacityStrip';
import { sortActions, groupActions } from '../utils/actionSort';
import './MyDayPage.css';

function MyDayPage() {
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

  const remindAction = async (action, remindAtISO) => {
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
      const r = await api.createReminder({ title: action.title, action_id: action.id, kind: 'once', remind_at: remindAtISO, timezone: tz });
      if (r?.error) throw new Error(r.error);
      loadReminders();
      showToast('Reminder set', 'success');
    } catch (e) { showToast(e.message || 'Failed to set reminder', 'error'); }
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
      loadActions(); if (refreshData) refreshData();
    } catch (e) {
      setSuggest(s => ({ ...s, proposals: s.proposals.map((x, i) => (i === idx ? { ...x, status: undefined } : x)) }));
      showToast(e.message || 'Failed to apply', 'error');
    }
  };
  const dismissSuggestion = (idx) => setSuggest(s => ({ ...s, proposals: s.proposals.map((x, i) => (i === idx ? { ...x, status: 'dismissed' } : x)) }));

  if (loading) return <div className="loading"><div className="spinner"></div></div>;

  const groups = groupActions(actions);

  // Presentational read-outs for the hero, derived from what's already loaded.
  const now = new Date();
  const hour = now.getHours();
  const greeting = hour < 5 ? 'Working late' : hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const firstName = (user?.name || '').trim().split(/\s+/)[0];
  const hoursOf = (a) => (Number(a.duration_hours) || 0) + (Number(a.duration_minutes) || 0) / 60;
  const doneCount = actions.filter(a => a.is_completed).length;
  const todoCount = actions.length - doneCount;
  const plannedH = actions.reduce((sum, a) => sum + hoursOf(a), 0);
  const leftH = actions.filter(a => !a.is_completed).reduce((sum, a) => sum + hoursOf(a), 0);
  const pct = actions.length ? Math.round((doneCount / actions.length) * 100) : 0;
  const fmtH = (h) => {
    const mins = Math.round(h * 60);
    const hh = Math.floor(mins / 60), mm = mins % 60;
    if (!hh) return `${mm}m`;
    return mm ? `${hh}h ${mm}m` : `${hh}h`;
  };
  const summary = actions.length === 0
    ? 'Nothing is planned for today yet — add an action or pull one in from your week.'
    : todoCount === 0
      ? 'Everything on today’s list is done. Nicely handled.'
      : `${todoCount} to go${leftH > 0 ? ` · about ${fmtH(leftH)} of focused work left` : ''}.`;
  const RING_R = 30, RING_C = 2 * Math.PI * RING_R;
  const hasAside = !!suggest || overdue.length > 0;

  return (
    <div className={`md-page ${hasAside ? 'has-aside' : ''}`}>
      <header className="ui-card md-hero">
        <div className="md-hero-main">
          <p className="ui-kicker md-hero-kicker">
            <span className="md-hero-tag">My Day</span>
            <CalendarDays size={14} /> {format(now, 'EEEE · d MMM yyyy')}
          </p>
          <h1 className="md-hero-title">
            <span className="ui-title-grad">{greeting}{firstName ? `, ${firstName}` : ''}</span>
          </h1>
          <p className="md-hero-sub">{summary}</p>
          <div className="md-hero-stats">
            {todoCount > 0 && <div className="ui-stat"><CircleDot size={18} /><b>{todoCount}</b><span>to do</span></div>}
            {doneCount > 0 && <div className="ui-stat md-stat-good"><CheckCircle2 size={18} /><b>{doneCount}</b><span>done</span></div>}
            {overdue.length > 0 && <div className="ui-stat md-stat-warn"><AlertTriangle size={18} /><b>{overdue.length}</b><span>overdue</span></div>}
            {plannedH > 0 && <div className="ui-stat"><Clock size={18} /><b>{fmtH(plannedH)}</b><span>planned</span></div>}
          </div>
        </div>
        <div className="md-hero-side">
          {actions.length > 0 && (
            <div className="md-ring" role="img" aria-label={`${pct}% of today done`}>
              <svg viewBox="0 0 72 72" width="72" height="72" aria-hidden="true">
                <circle className="md-ring-bg" cx="36" cy="36" r={RING_R} />
                <circle className="md-ring-fg" cx="36" cy="36" r={RING_R} strokeDasharray={RING_C} strokeDashoffset={RING_C * (1 - pct / 100)} />
              </svg>
              <span className="md-ring-val"><b>{pct}%</b><i>done</i></span>
            </div>
          )}
          <div className="md-header-actions">
            <button type="button" className="btn btn-secondary" onClick={runSuggest} disabled={suggest?.loading}>
              <Sparkles size={16} /> {suggest?.loading ? 'Thinking…' : 'AI suggestions'}
            </button>
            <button type="button" className="btn btn-primary" onClick={() => setShowActionModal(true)}>
              <Plus size={16} /> Add Action
            </button>
          </div>
        </div>
      </header>

      {hasAside && (
        <div className="md-aside">
          {suggest && (
            <div className="md-suggest">
              <div className="md-suggest-head">
                <span><Sparkles size={14} /> AI suggestions</span>
                <span className="md-suggest-head-right">
                  {suggest.usage && <UsageBadge usage={suggest.usage} />}
                  <button type="button" className="md-suggest-close" onClick={() => setSuggest(null)} aria-label="Close"><X size={15} /></button>
                </span>
              </div>
              <div className="md-suggest-body">
                {suggest.loading && <p className="md-suggest-muted"><Loader2 size={14} className="md-spin" /> Reviewing your tasks and priorities…</p>}
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

          {overdue.length > 0 && (
            <section className="ui-card md-carried" aria-label="Carried over">
              <div className="md-carried-head">
                <p className="ui-kicker"><AlertTriangle size={14} /> Carried over <span className="ui-count">{overdue.length}</span></p>
                <span className="md-carried-actions">
                  <button type="button" className="md-carried-btn ai" onClick={triageOverdue} disabled={triaging}>
                    {triaging ? <><Loader2 size={14} className="md-spin" /> Triaging…</> : <><Wand2 size={14} /> Triage with AI</>}
                  </button>
                  <button type="button" className="md-carried-btn" onClick={moveAllToToday}><ArrowDownToLine size={14} /> Move all to today</button>
                </span>
              </div>
              <p className="md-carried-note">These slipped past their planned date. Nothing moves on its own — decide each one.</p>
              <ul className="md-carried-list">
                {overdue.map(a => (
                  <li key={a.id} className="md-carried-row">
                    <button type="button" className="md-carried-check" onClick={() => completeOverdue(a)} title="Mark done" aria-label={`Mark “${a.title}” done`}>
                      <Check size={13} strokeWidth={3} />
                    </button>
                    <button type="button" className="md-carried-name" onClick={() => handleEdit(a)} title="Open to reschedule">{a.title}</button>
                    <span
                      className={`ui-chip ${a.days_late > 7 ? 'ui-chip--bad' : 'ui-chip--warn'} md-carried-age`}
                      title={`Planned ${String(a.scheduled_date).slice(0, 10)}`}
                    >
                      {a.days_late}d late
                    </span>
                    <span className="md-carried-btns">
                      <button type="button" className="md-carried-mini" onClick={() => moveToToday(a)}>Today</button>
                      <button type="button" className="md-carried-mini drop" onClick={() => dropTask(a)}>Drop</button>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}

      {triagePlan && (
        <BrainDumpModal
          initialPlan={triagePlan}
          title="Triage carried-over tasks"
          onClose={() => setTriagePlan(null)}
          onApplied={() => { setTriagePlan(null); loadOverdue(); loadActions(); }}
        />
      )}

      <div className="md-cap">
        <CapacityStrip start={today} today={today} refreshKey={actions} onChanged={() => { loadActions(); loadOverdue(); }} />
      </div>

      <section className="ui-card md-list" aria-label="Today's actions">
        <div className="md-list-head">
          <p className="ui-kicker"><ListChecks size={14} /> Today’s actions <span className="ui-count">{actions.length ? `${doneCount}/${actions.length}` : ''}</span></p>
          {actions.length > 0 && <div className="ui-meter md-list-meter" aria-hidden="true"><i style={{ '--pct': `${pct}%` }} /></div>}
        </div>

        {actions.length === 0 ? (
          <div className="ui-empty">
            <Sun size={26} />
            <p>A clear day. Plan one thing that moves you forward.</p>
            <button type="button" className="btn btn-primary" onClick={() => setShowActionModal(true)}><Plus size={16} /> Add Action</button>
          </div>
        ) : (
          <SortableActionGroups
            groups={groups}
            onReorder={handleReorder}
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
        )}
      </section>

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

export default MyDayPage;
