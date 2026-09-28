import { useSearchParams } from 'react-router-dom';
import { CalendarDays, CalendarRange } from 'lucide-react';
import { PageShell } from '../components/PageShell';
import MyWeekPage from './MyWeekPage';
import CalendarPage from './CalendarPage';

const VIEWS = [
  { id: 'week', label: 'Week', icon: CalendarDays },
  { id: 'month', label: 'Month', icon: CalendarRange },
];

// The Week tab: this week's actions, or the month calendar (?view=month).
export default function WeekPage() {
  const [params, setParams] = useSearchParams();
  const view = params.get('view') === 'month' ? 'month' : 'week';
  const setView = (v) => {
    const next = new URLSearchParams(params);
    if (v === 'month') next.set('view', 'month'); else next.delete('view');
    setParams(next, { replace: true });
  };
  return (
    <PageShell title="Week" label="Week view" views={VIEWS} value={view} onChange={setView}>
      {view === 'month' ? <CalendarPage embedded /> : <MyWeekPage embedded />}
    </PageShell>
  );
}
