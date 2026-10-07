import { useNavigate, useParams } from 'react-router-dom';
import {
  LayoutDashboard, Users, Gift, TrendingUp, Package, Radio, Wrench, Library, BarChart3, CalendarDays,
} from 'lucide-react';
import Picker from '../components/Picker';
import Overview from '../components/business/Overview';
import Revenue from '../components/business/Revenue';
import Results from '../components/business/Results';
import { Leads, Offers, Products, Channels, Fixes, Library as LibraryPage, Content } from '../components/business/Sections';
import '../components/business/Business.css';

const VIEWS = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard, el: Overview },
  { id: 'leads', label: 'Leads', icon: Users, el: Leads },
  { id: 'results', label: 'Results', icon: BarChart3, el: Results },
  { id: 'offers', label: 'Offers', icon: Gift, el: Offers },
  { id: 'revenue', label: 'Revenue', icon: TrendingUp, el: Revenue },
  { id: 'products', label: 'Products', icon: Package, el: Products },
  { id: 'channels', label: 'Channels', icon: Radio, el: Channels },
  { id: 'fixes', label: 'Fixes', icon: Wrench, el: Fixes },
  { id: 'library', label: 'Library', icon: Library, el: LibraryPage },
  { id: 'content', label: 'Content', icon: CalendarDays, el: Content },
];

// The Business area: a per-user revenue cockpit. One URL per page (/business/leads …).
// Wide screens get a segmented switch; phones get the app's Picker.
export default function BusinessPage() {
  const { view: raw } = useParams();
  const navigate = useNavigate();
  const view = VIEWS.find((v) => v.id === raw) || VIEWS[0];
  const go = (id) => navigate(id === 'overview' ? '/business' : `/business/${id}`);
  const View = view.el;
  return (
    <div className="biz-page">
      <header className="biz-top">
        <h1 className="page-title biz-title">Business</h1>
        <nav className="ui-seg biz-seg" aria-label="Business pages">
          {VIEWS.map((v) => (
            <button key={v.id} type="button" aria-current={v.id === view.id ? 'page' : undefined} className={v.id === view.id ? 'on' : ''} onClick={() => go(v.id)}>
              <v.icon size={15} /> {v.label}
            </button>
          ))}
        </nav>
        <div className="biz-nav-phone">
          <Picker value={view.id} header="Business" onChange={go}
            options={VIEWS.map((v) => ({ value: v.id, label: v.label, icon: <v.icon size={15} /> }))} />
        </div>
      </header>
      <View key={view.id} go={go} />
    </div>
  );
}
