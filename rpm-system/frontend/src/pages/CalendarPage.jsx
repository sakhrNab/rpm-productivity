import { useState, useEffect, useContext } from 'react';
import { ChevronLeft, ChevronRight, Plus, CalendarDays, CheckCircle2, Clock, CalendarPlus } from 'lucide-react';
import { 
  format, startOfMonth, endOfMonth, eachDayOfInterval, 
  isSameMonth, isSameDay, addMonths, subMonths, startOfWeek, endOfWeek
} from 'date-fns';
import { AppContext, AuthContext } from '../App';
import { useToast } from '../components/ToastProvider';
import CreateActionModal from '../components/modals/CreateActionModal';
import './CalendarPage.css';

// `embedded` (inside the Week tab as "Month"): the Week header owns the page's h1.
function CalendarPage({ embedded = false }) {
  const MonthTitle = embedded ? 'h2' : 'h1';
  const { categories, refreshData } = useContext(AppContext);
  const { api } = useContext(AuthContext);
  const { showToast } = useToast();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [actions, setActions] = useState([]);
  const [selectedDate, setSelectedDate] = useState(null);
  const [editingAction, setEditingAction] = useState(null);
  const [showActionModal, setShowActionModal] = useState(false);
  const [dragId, setDragId] = useState(null);
  const [dropKey, setDropKey] = useState(null);
  const [dayView, setDayView] = useState(null); // a Date whose full action list is shown

  // Move an action to a different day (drag-and-drop reschedule)
  const rescheduleAction = async (actionId, dateStr) => {
    const action = actions.find(a => a.id === actionId);
    if (!action || String(action.scheduled_date || '').slice(0, 10) === dateStr) return;
    setActions(prev => prev.map(a => (a.id === actionId ? { ...a, scheduled_date: dateStr } : a)));
    try {
      await api.updateAction(actionId, { scheduled_date: dateStr });
      showToast(`Moved to ${format(new Date(dateStr + 'T00:00:00'), 'MMM d')}.`, 'success');
    } catch (error) {
      console.error('Failed to reschedule action:', error);
      showToast('Could not move that action. Please try again.', 'error');
      loadActions();
    }
  };

  const closeModal = () => {
    setShowActionModal(false);
    setSelectedDate(null);
    setEditingAction(null);
  };

  useEffect(() => {
    loadActions();
  }, [currentDate]);

  const loadActions = async () => {
    const start = format(startOfMonth(currentDate), 'yyyy-MM-dd');
    const end = format(endOfMonth(currentDate), 'yyyy-MM-dd');
    try {
      const data = await api.getPlanner(start, end);
      setActions(data);
    } catch (error) {
      console.error('Failed to load actions:', error);
    }
  };

  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const calendarStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const days = eachDayOfInterval({ start: calendarStart, end: calendarEnd });

  const getActionsForDay = (day) => {
    // scheduled_date comes back as an ISO timestamp (e.g. 2026-07-15T00:00:00.000Z);
    // compare only the date part so actions actually land on their day.
    const dayStr = format(day, 'yyyy-MM-dd');
    return actions.filter(a => a.scheduled_date && String(a.scheduled_date).slice(0, 10) === dayStr);
  };

  // Presentational read-outs for the header, from the month already loaded.
  const inMonth = actions.filter(a => a.scheduled_date && isSameMonth(new Date(String(a.scheduled_date).slice(0, 10) + 'T00:00:00'), currentDate));
  const doneInMonth = inMonth.filter(a => a.is_completed).length;
  const viewingThisMonth = isSameMonth(currentDate, new Date());

  return (
    <div className="cal-page">
      <div className="ui-card cal-planner">
        <div className="cal-head">
          <div className="cal-head-main">
            <p className="ui-kicker"><CalendarDays size={14} /> Calendar</p>
            <MonthTitle className="cal-month-title"><span className="ui-title-grad">{format(currentDate, 'MMMM')}</span> <span className="cal-year">{format(currentDate, 'yyyy')}</span></MonthTitle>
            <div className="cal-chips">
              <span className="ui-chip"><Clock size={12} /> {inMonth.length} scheduled</span>
              {doneInMonth > 0 && <span className="ui-chip ui-chip--good"><CheckCircle2 size={12} /> {doneInMonth} done</span>}
            </div>
          </div>
          <div className="cal-head-side">
            <div className="cal-nav">
              <button type="button" className="cal-nav-btn" aria-label="Previous month" onClick={() => setCurrentDate(subMonths(currentDate, 1))}>
                <ChevronLeft size={18} />
              </button>
              {!viewingThisMonth && (
                <button type="button" className="cal-nav-btn cal-nav-today" onClick={() => setCurrentDate(new Date())}>Today</button>
              )}
              <button type="button" className="cal-nav-btn" aria-label="Next month" onClick={() => setCurrentDate(addMonths(currentDate, 1))}>
                <ChevronRight size={18} />
              </button>
            </div>
            <button type="button" className="btn btn-primary cal-add" onClick={() => setShowActionModal(true)}>
              <Plus size={16} /> Add Action
            </button>
          </div>
        </div>

        <div className="cal-scroll">
        <div className="cal-grid">
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => (
            <div key={day} className="cal-day-header">
              <span className="cal-dh-long">{day}</span><span className="cal-dh-short" aria-hidden="true">{day[0]}</span>
            </div>
          ))}

          {days.map(day => {
            const dayActions = getActionsForDay(day);
            const isToday = isSameDay(day, new Date());
            const isCurrentMonth = isSameMonth(day, currentDate);
            const dayStr = format(day, 'yyyy-MM-dd');
            const isDropTarget = dropKey === dayStr;
            const dow = day.getDay();

            return (
              <div
                key={day.toISOString()}
                className={`cal-day ${isToday ? 'is-today' : ''} ${isCurrentMonth ? '' : 'is-out'} ${isDropTarget ? 'is-drop' : ''} ${dow === 0 || dow === 6 ? 'is-weekend' : ''}`}
                onDragOver={(e) => { if (dragId) { e.preventDefault(); setDropKey(dayStr); } }}
                onDragLeave={() => setDropKey(k => (k === dayStr ? null : k))}
                onDrop={(e) => {
                  e.preventDefault();
                  if (dragId) rescheduleAction(dragId, dayStr);
                  setDragId(null); setDropKey(null);
                }}
                onClick={() => {
                  setEditingAction(null);
                  setSelectedDate(day);
                  setShowActionModal(true);
                }}
                title={`Add an action on ${format(day, 'EEE d MMM')}`}
              >
                <div className="cal-day-top">
                  <span className="cal-daynum">{format(day, 'd')}</span>
                  <CalendarPlus size={13} className="cal-day-add" aria-hidden="true" />
                </div>
                {dayActions.slice(0, 3).map(action => (
                  <div
                    key={action.id}
                    className={`cal-event ${action.is_completed ? 'is-done' : ''} ${dragId === action.id ? 'is-dragging' : ''}`}
                    title={`${action.title} — drag to another day, or click to edit`}
                    draggable
                    onDragStart={(e) => { e.stopPropagation(); setDragId(action.id); e.dataTransfer.effectAllowed = 'move'; }}
                    onDragEnd={() => { setDragId(null); setDropKey(null); }}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedDate(null);
                      setEditingAction(action);
                      setShowActionModal(true);
                    }}
                    style={{ '--c': action.category_color || 'var(--accent-pink)' }}
                  >
                    {action.title}
                  </div>
                ))}
                {dayActions.length > 3 && (
                  <div
                    className="cal-more"
                    role="button"
                    tabIndex={0}
                    title="Show all actions on this day"
                    onClick={(e) => { e.stopPropagation(); setDayView(day); }}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); setDayView(day); } }}
                  >
                    +{dayActions.length - 3} more
                  </div>
                )}
              </div>
            );
          })}
        </div>
        </div>
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
          initialData={
            editingAction
              ? editingAction
              : (selectedDate ? { scheduled_date: format(selectedDate, 'yyyy-MM-dd') } : {})
          }
        />
      )}

      {/* Day view — every action scheduled on a given day */}
      {dayView && (() => {
        const dayStr = format(dayView, 'yyyy-MM-dd');
        const list = actions
          .filter(a => a.scheduled_date && String(a.scheduled_date).slice(0, 10) === dayStr)
          .sort((a, b) => String(a.scheduled_time || '').localeCompare(String(b.scheduled_time || '')));
        return (
          <div className="modal-overlay" onClick={() => setDayView(null)}>
            <div className="modal cal-dayview" onClick={e => e.stopPropagation()}>
              <div className="modal-header cal-dayview-head">
                <div className="cal-dayview-titles">
                  <p className="ui-kicker">{isSameDay(dayView, new Date()) ? 'Today' : format(dayView, 'yyyy')}</p>
                  <h3 className="modal-title">{format(dayView, 'EEEE, MMM d')}</h3>
                </div>
                <span className="ui-chip cal-dayview-count">
                  {list.length} action{list.length === 1 ? '' : 's'}
                  {list.some(a => a.is_completed) ? ` · ${list.filter(a => a.is_completed).length} done` : ''}
                </span>
              </div>
              <div className="modal-body cal-dayview-list">
                {list.length === 0 && <div className="ui-empty cal-dayview-empty"><CalendarDays size={22} /><p>Nothing scheduled.</p></div>}
                {list.map(action => (
                  <button
                    key={action.id}
                    type="button"
                    className={`cal-dayview-item ${action.is_completed ? 'done' : ''}`}
                    style={{ '--c': action.category_color || 'var(--accent-pink)' }}
                    onClick={() => { setDayView(null); setSelectedDate(null); setEditingAction(action); setShowActionModal(true); }}
                  >
                    <span className="cal-dayview-dot" aria-hidden="true">{action.is_completed && <CheckCircle2 size={14} />}</span>
                    <span className="cal-dayview-main">
                      <span className="cal-dayview-title">{action.title}</span>
                      {(action.project_name || action.category_name) && <span className="cal-dayview-sub">{action.project_name || action.category_name}</span>}
                    </span>
                    {action.scheduled_time && <span className="cal-dayview-time">{String(action.scheduled_time).slice(0, 5)}</span>}
                  </button>
                ))}
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setDayView(null)}>Close</button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => { setSelectedDate(dayView); setEditingAction(null); setDayView(null); setShowActionModal(true); }}
                >
                  <Plus size={16} /> Add action
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

export default CalendarPage;
