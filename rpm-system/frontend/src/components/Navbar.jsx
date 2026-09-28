import { useState, useContext, useRef, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  Target, Sun, CalendarDays, Map as MapIcon, MessagesSquare, Sparkles, ChevronDown,
  Zap, Blocks, FolderPlus, Tag, UserPlus, FileUp, Settings, Users, AlarmClock, LogOut, X, Check
} from 'lucide-react';
import { AppContext, AuthContext } from '../App';
import CreateActionModal from './modals/CreateActionModal';
import CreateBlockModal from './modals/CreateBlockModal';
import CreateProjectModal from './modals/CreateProjectModal';
import CreateCategoryModal from './modals/CreateCategoryModal';
import CreatePersonModal from './modals/CreatePersonModal';
import BrainDumpModal from './BrainDumpModal';
import InboxBell from './InboxBell';
import './Navbar.css';

// The four places you live in. Detail pages light up the tab they belong to.
const TABS = [
  { path: '/today', label: 'Today', icon: Sun, match: ['/today'] },
  { path: '/week', label: 'Week', icon: CalendarDays, match: ['/week'] },
  { path: '/plan', label: 'Plan', icon: MapIcon, match: ['/plan', '/categories', '/projects', '/import'] },
  { path: '/coach', label: 'Coach', icon: MessagesSquare, match: ['/coach'] },
];
const isActive = (tab, pathname) => tab.match.some(m => pathname === m || pathname.startsWith(`${m}/`));

const CREATE_OPTIONS = [
  { id: 'file', icon: FileUp, label: 'Plan from a file', hint: 'Upload a doc, get a schedule' },
  { id: 'action', icon: Zap, label: 'Action' },
  { id: 'project', icon: FolderPlus, label: 'Project' },
  { id: 'block', icon: Blocks, label: 'Block' },
  { id: 'category', icon: Tag, label: 'Category' },
  { id: 'person', icon: UserPlus, label: 'Person' },
];

// Arrow-key movement between a menu's items.
function menuKeys(e) {
  if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
  const items = Array.from(e.currentTarget.querySelectorAll('[role="menuitem"]'));
  if (!items.length) return;
  e.preventDefault();
  const i = items.indexOf(document.activeElement);
  const next = e.key === 'ArrowDown' ? (i + 1) % items.length : (i - 1 + items.length) % items.length;
  items[next].focus();
}

// Close a popover on outside press and on Escape (returning focus to its trigger).
function useDismiss(open, setOpen, rootRef, triggerRef) {
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (rootRef.current?.contains(e.target) || triggerRef?.current?.contains(e.target)) return;   // the trigger toggles itself
      setOpen(false);
    };
    const onKey = (e) => { if (e.key === 'Escape') { setOpen(false); triggerRef?.current?.focus(); } };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open, setOpen, rootRef, triggerRef]);
}

function Navbar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { categories, refreshData } = useContext(AppContext);
  const { user, logout } = useContext(AuthContext);
  const [showCreateMenu, setShowCreateMenu] = useState(false);
  const [showSheet, setShowSheet] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [activeModal, setActiveModal] = useState(null);
  const [showBrainDump, setShowBrainDump] = useState(false);
  const createMenuRef = useRef(null);
  const createBtnRef = useRef(null);
  const userMenuRef = useRef(null);
  const userBtnRef = useRef(null);
  const sheetRef = useRef(null);
  const sheetBtnRef = useRef(null);

  useDismiss(showCreateMenu, setShowCreateMenu, createMenuRef, createBtnRef);
  useDismiss(showUserMenu, setShowUserMenu, userMenuRef, userBtnRef);
  useDismiss(showSheet, setShowSheet, sheetRef, sheetBtnRef);

  // Close any open menu when the route changes.
  useEffect(() => {
    setShowCreateMenu(false); setShowUserMenu(false); setShowSheet(false);
  }, [location.pathname]);

  // Let any page open the Brain Dump modal (e.g. the Compass cross-link).
  useEffect(() => {
    const open = () => setShowBrainDump(true);
    window.addEventListener('rpm:open-braindump', open);
    return () => window.removeEventListener('rpm:open-braindump', open);
  }, []);

  // Focus the first item when a menu opens, so the keyboard lands inside it.
  useEffect(() => {
    const root = showCreateMenu ? createMenuRef.current : showSheet ? sheetRef.current : showUserMenu ? userMenuRef.current : null;
    root?.querySelector('[role="menuitem"]')?.focus({ preventScroll: true });
  }, [showCreateMenu, showSheet, showUserMenu]);

  const openBrainDump = () => {
    setShowCreateMenu(false); setShowSheet(false);
    setShowBrainDump(true);
  };

  const handleCreateClick = (type) => {
    setShowCreateMenu(false); setShowSheet(false);
    if (type === 'file') { navigate('/import'); return; }
    setActiveModal(type);
  };

  const handleModalClose = () => setActiveModal(null);
  const handleModalSuccess = () => { setActiveModal(null); refreshData(); };

  const handleLogout = async () => {
    setShowUserMenu(false);
    await logout();
    navigate('/login');
  };

  const getUserInitials = () => {
    if (!user?.name) return '?';
    return user.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  const tabLink = (tab, cls) => {
    const on = isActive(tab, location.pathname);
    return (
      <Link key={tab.path} to={tab.path} className={`${cls} ${on ? 'on' : ''}`} aria-current={on ? 'page' : undefined}>
        <tab.icon size={cls === 'tn-tab' ? 16 : 20} aria-hidden="true" />
        <span>{tab.label}</span>
      </Link>
    );
  };

  return (
    <>
      <header className="tn">
        <Link to="/plan" className="tn-brand" aria-label="RPM — go to your plan">
          <Target size={22} />
          <span>RPM</span>
        </Link>

        <nav className="tn-tabs" aria-label="Main">
          {TABS.map(t => tabLink(t, 'tn-tab'))}
        </nav>

        <div className="tn-right">
          <InboxBell />

          <div className="tn-capture" ref={createMenuRef}>
            <button
              type="button"
              className="tn-cap-main"
              onClick={openBrainDump}
              title="Brain Dump — turn a messy thought-dump into your plan"
            >
              <Sparkles size={16} /> <span>Capture</span>
            </button>
            <button
              ref={createBtnRef}
              type="button"
              className={`tn-cap-more ${showCreateMenu ? 'on' : ''}`}
              aria-label="More ways to add"
              aria-haspopup="menu"
              aria-expanded={showCreateMenu}
              onClick={() => setShowCreateMenu(v => !v)}
            >
              <ChevronDown size={16} className="tn-chev" />
            </button>

            {showCreateMenu && (
              <div className="tn-panel tn-menu" role="menu" aria-label="Add" onKeyDown={menuKeys}>
                <p className="tn-menu-head">Add</p>
                {CREATE_OPTIONS.map(o => (
                  <button key={o.id} type="button" role="menuitem" className="tn-menu-item" onClick={() => handleCreateClick(o.id)}>
                    <o.icon size={16} />
                    <span>{o.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="tn-user" ref={userMenuRef}>
            <button
              ref={userBtnRef}
              type="button"
              className="tn-avatar"
              aria-label="Account menu"
              aria-haspopup="menu"
              aria-expanded={showUserMenu}
              onClick={() => setShowUserMenu(v => !v)}
            >
              {user?.avatar ? (
                <img src={user.avatar} alt="" className="tn-avatar-img" />
              ) : (
                <span className="tn-avatar-initials">{getUserInitials()}</span>
              )}
            </button>

            {showUserMenu && (
              <div className="tn-panel tn-menu tn-user-menu" role="menu" aria-label="Account" onKeyDown={menuKeys}>
                <div className="tn-user-head">
                  <b>{user?.name}</b>
                  <small>{user?.email}</small>
                </div>
                <Link to="/settings" role="menuitem" className="tn-menu-item" onClick={() => setShowUserMenu(false)}>
                  <Settings size={16} /> <span>Settings &amp; API keys</span>
                  {location.pathname === '/settings' && <Check size={14} className="tn-menu-cur" />}
                </Link>
                <Link to="/people" role="menuitem" className="tn-menu-item" onClick={() => setShowUserMenu(false)}>
                  <Users size={16} /> <span>People</span>
                  {location.pathname === '/people' && <Check size={14} className="tn-menu-cur" />}
                </Link>
                <Link to="/reminders" role="menuitem" className="tn-menu-item" onClick={() => setShowUserMenu(false)}>
                  <AlarmClock size={16} /> <span>Reminders</span>
                  {location.pathname === '/reminders' && <Check size={14} className="tn-menu-cur" />}
                </Link>
                <div className="tn-menu-sep" role="separator" />
                <button type="button" role="menuitem" className="tn-menu-item tn-menu-danger" onClick={handleLogout}>
                  <LogOut size={16} /> <span>Log out</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Phones: bottom tab bar with the capture button raised in the middle. */}
      <nav className="tn-bottom" aria-label="Main">
        {tabLink(TABS[0], 'tn-btab')}
        {tabLink(TABS[1], 'tn-btab')}
        <div className="tn-bcap-slot">
          <button
            ref={sheetBtnRef}
            type="button"
            className={`tn-bcap ${showSheet ? 'on' : ''}`}
            aria-label="Capture"
            aria-haspopup="menu"
            aria-expanded={showSheet}
            onClick={() => setShowSheet(v => !v)}
          >
            {showSheet ? <X size={24} /> : <Sparkles size={24} />}
          </button>
        </div>
        {tabLink(TABS[2], 'tn-btab')}
        {tabLink(TABS[3], 'tn-btab')}
      </nav>

      {showSheet && (
        <div className="tn-sheet-root">
          <div className="tn-sheet-scrim" aria-hidden="true" />
          <div className="tn-sheet" ref={sheetRef} role="menu" aria-label="Capture" onKeyDown={menuKeys}>
            <i className="tn-sheet-grip" aria-hidden="true" />
            <button type="button" role="menuitem" className="tn-sheet-item tn-sheet-hero" onClick={openBrainDump}>
              <span className="tn-sheet-ico"><Sparkles size={20} /></span>
              <span className="tn-sheet-txt"><b>Brain dump</b><small>Talk or type — it becomes your plan</small></span>
            </button>
            {CREATE_OPTIONS.map(o => (
              <button key={o.id} type="button" role="menuitem" className="tn-sheet-item" onClick={() => handleCreateClick(o.id)}>
                <span className="tn-sheet-ico"><o.icon size={18} /></span>
                <span className="tn-sheet-txt"><b>{o.label}</b>{o.hint && <small>{o.hint}</small>}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Modals */}
      {activeModal === 'action' && (
        <CreateActionModal onClose={handleModalClose} onSuccess={handleModalSuccess} categories={categories} />
      )}
      {activeModal === 'block' && (
        <CreateBlockModal onClose={handleModalClose} onSuccess={handleModalSuccess} categories={categories} />
      )}
      {activeModal === 'project' && (
        <CreateProjectModal onClose={handleModalClose} onSuccess={handleModalSuccess} categories={categories} />
      )}
      {activeModal === 'category' && (
        <CreateCategoryModal onClose={handleModalClose} onSuccess={handleModalSuccess} />
      )}
      {activeModal === 'person' && (
        <CreatePersonModal onClose={handleModalClose} onSuccess={handleModalSuccess} />
      )}
      {showBrainDump && (
        <BrainDumpModal onClose={() => setShowBrainDump(false)} onApplied={refreshData} />
      )}
    </>
  );
}

export default Navbar;
