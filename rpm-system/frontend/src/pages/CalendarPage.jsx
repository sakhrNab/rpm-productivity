import { useState, useEffect, useContext } from 'react';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { 
  format, startOfMonth, endOfMonth, eachDayOfInterval, 
  isSameMonth, isSameDay, addMonths, subMonths, startOfWeek, endOfWeek
} from 'date-fns';
import { AppContext, AuthContext } from '../App';
import { useToast } from '../components/ToastProvider';
import CreateActionModal from '../components/modals/CreateActionModal';
import './CalendarPage.css';

function CalendarPage() {
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

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Calendar</h1>
        <button 
          type="button"
          className="btn btn-primary"
          onClick={() => setShowActionModal(true)}
        >
          <Plus size={16} />
          Add Action
        </button>
      </div>

      <div className="project-planner cal-planner">
        <div className="planner-header">
          <button 
            className="btn btn-icon btn-secondary"
            onClick={() => setCurrentDate(subMonths(currentDate, 1))}
          >
            <ChevronLeft size={16} />
          </button>
          <h2 className="cal-month-title">{format(currentDate, 'MMMM yyyy')}</h2>
          <button 
            className="btn btn-icon btn-secondary"
            onClick={() => setCurrentDate(addMonths(currentDate, 1))}
          >
            <ChevronRight size={16} />
          </button>
        </div>

        <div className="calendar-scroll cal-scroll">
        <div className="cal-grid">
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => (
            <div
              key={day}
              className="cal-day-header"
            >
              {day}
            </div>
          ))}
          
          {days.map(day => {
            const dayActions = getActionsForDay(day);
            const isToday = isSameDay(day, new Date());
            const isCurrentMonth = isSameMonth(day, currentDate);
            const dayStr = format(day, 'yyyy-MM-dd');
            const isDropTarget = dropKey === dayStr;

            return (
              <div
                key={day.toISOString()}
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
                style={{
                  minHeight: '100px',
                  padding: '8px',
                  background: isDropTarget ? 'var(--bg-card-hover)' : (isToday ? 'var(--bg-card-hover)' : 'var(--bg-secondary)'),
                  boxShadow: isDropTarget ? 'inset 0 0 0 2px var(--accent-pink)' : 'none',
                  cursor: 'pointer',
                  opacity: isCurrentMonth ? 1 : 0.5
                }}
              >
                <div style={{ 
                  fontWeight: isToday ? 700 : 400,
                  color: isToday ? 'var(--accent-cyan)' : 'var(--text-primary)',
                  marginBottom: '4px'
                }}>
                  {format(day, 'd')}
                </div>
                {dayActions.slice(0, 3).map(action => (
                  <div
                    key={action.id}
                    title="Drag to another day, or click to edit"
                    draggable
                    onDragStart={(e) => { e.stopPropagation(); setDragId(action.id); e.dataTransfer.effectAllowed = 'move'; }}
                    onDragEnd={() => { setDragId(null); setDropKey(null); }}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedDate(null);
                      setEditingAction(action);
                      setShowActionModal(true);
                    }}
                    style={{
                      fontSize: '0.75rem',
                      padding: '2px 4px',
                      background: action.category_color || 'var(--accent-pink)',
                      borderRadius: '2px',
                      marginBottom: '2px',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      cursor: 'grab',
                      opacity: dragId === action.id ? 0.4 : (action.is_completed ? 0.7 : 1),
                      textDecoration: action.is_completed ? 'line-through' : 'none'
                    }}
                  >
                    {action.title}
                  </div>
                ))}
                {dayActions.length > 3 && (
                  <div
                    className="cal-more"
                    role="button"
                    title="Show all actions on this day"
                    onClick={(e) => { e.stopPropagation(); setDayView(day); }}
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
                <h3 className="modal-title">{format(dayView, 'EEEE, MMM d')}</h3>
                <span className="cal-dayview-count">{list.length} action{list.length === 1 ? '' : 's'}</span>
              </div>
              <div className="modal-body cal-dayview-list">
                {list.length === 0 && <p className="cal-dayview-empty">Nothing scheduled.</p>}
                {list.map(action => (
                  <button
                    key={action.id}
                    type="button"
                    className={`cal-dayview-item ${action.is_completed ? 'done' : ''}`}
                    onClick={() => { setDayView(null); setSelectedDate(null); setEditingAction(action); setShowActionModal(true); }}
                  >
                    <span className="cal-dayview-dot" style={{ background: action.category_color || 'var(--accent-pink)' }} />
                    <span className="cal-dayview-title">{action.title}</span>
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
