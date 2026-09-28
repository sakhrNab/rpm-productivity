import { useSearchParams } from 'react-router-dom';
import { Grid3X3, FolderKanban, GanttChart } from 'lucide-react';
import { PageShell } from '../components/PageShell';
import CategoriesPage from './CategoriesPage';
import ProjectsPage from './ProjectsPage';

const VIEWS = [
  { id: 'areas', label: 'Areas', icon: Grid3X3 },
  { id: 'projects', label: 'Projects', icon: FolderKanban },
  { id: 'roadmap', label: 'Roadmap', icon: GanttChart },
];

// The Plan tab (home): areas of life, the project grid, or the roadmap.
// One switch for all three — ProjectsPage reads ?view=roadmap itself.
export default function PlanPage() {
  const [params, setParams] = useSearchParams();
  const raw = params.get('view');
  const view = raw === 'projects' || raw === 'roadmap' ? raw : 'areas';
  const setView = (v) => {
    const next = new URLSearchParams(params);
    if (v === 'areas') next.delete('view'); else next.set('view', v);
    setParams(next, { replace: true });
  };
  return (
    <PageShell title="Plan" label="Plan view" views={VIEWS} value={view} onChange={setView}>
      {view === 'areas' ? <CategoriesPage embedded /> : <ProjectsPage embedded />}
    </PageShell>
  );
}
