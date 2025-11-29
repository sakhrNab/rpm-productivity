import { useState, useEffect, useContext } from 'react';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { 
  format, startOfMonth, endOfMonth, eachDayOfInterval, 
  isSameMonth, isSameDay, addMonths, subMonths, startOfWeek, endOfWeek
} from 'date-fns';
import { AppContext, AuthContext } from '../App';
import CreateActionModal from '../components/modals/CreateActionModal';

function CalendarPage() {
  const { categories, refreshData } = useContext(AppContext);
  const { api } = useContext(AuthContext);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [actions, setActions] = useState([]);
  const [selectedDate, setSelectedDate] = useState(null);
  const [showActionModal, setShowActionModal] = useState(false);

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
    return actions.filter(a => a.scheduled_date === format(day, 'yyyy-MM-dd'));
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

      <div className="project-planner" style={{ maxWidth: '1200px' }}>
        <div className="planner-header">
          <button 
            className="btn btn-icon btn-secondary"
            onClick={() => setCurrentDate(subMonths(currentDate, 1))}
          >
            <ChevronLeft size={16} />
          </button>
          <h2 style={{ margin: '0 24px' }}>{format(currentDate, 'MMMM yyyy')}</h2>
          <button 
            className="btn btn-icon btn-secondary"
            onClick={() => setCurrentDate(addMonths(currentDate, 1))}
          >
            <ChevronRight size={16} />
          </button>
        </div>

        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(7, 1fr)',
          gap: '1px',
          background: 'var(--border-primary)',
          borderRadius: 'var(--radius-lg)',
          overflow: 'hidden'
        }}>
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => (
            <div 
              key={day} 
              style={{ 
                padding: '12px', 
                textAlign: 'center',
                background: 'var(--bg-secondary)',
                fontWeight: 600,
                fontSize: '0.85rem',
                color: 'var(--text-muted)'
              }}
            >
              {day}
            </div>
          ))}
          
          {days.map(day => {
            const dayActions = getActionsForDay(day);
            const isToday = isSameDay(day, new Date());
            const isCurrentMonth = isSameMonth(day, currentDate);
            
            return (
              <div
                key={day.toISOString()}
                onClick={() => {
                  setSelectedDate(day);
                  setShowActionModal(true);
                }}
                style={{
                  minHeight: '100px',
                  padding: '8px',
                  background: isToday ? 'var(--bg-card-hover)' : 'var(--bg-secondary)',
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
                    style={{
                      fontSize: '0.75rem',
                      padding: '2px 4px',
                      background: action.category_color || 'var(--accent-pink)',
                      borderRadius: '2px',
                      marginBottom: '2px',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis'
                    }}
                  >
                    {action.title}
                  </div>
                ))}
                {dayActions.length > 3 && (
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                    +{dayActions.length - 3} more
                  </div>
                )}
              </div>
            );
          })}
        </div>
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
          initialData={selectedDate ? { 
            scheduled_date: format(selectedDate, 'yyyy-MM-dd')
          } : {}}
        />
      )}
    </div>
  );
}

export default CalendarPage;
