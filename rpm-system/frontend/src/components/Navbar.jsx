import { useState, useContext, useRef, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { 
  Target, Calendar, CalendarDays, Sun, Users, FolderKanban, Grid3X3,
  Plus, Zap, Blocks, FolderPlus, Tag, UserPlus, ChevronDown,
  LogOut
} from 'lucide-react';
import { AppContext, AuthContext } from '../App';
import CreateActionModal from './modals/CreateActionModal';
import CreateBlockModal from './modals/CreateBlockModal';
import CreateProjectModal from './modals/CreateProjectModal';
import CreateCategoryModal from './modals/CreateCategoryModal';
import CreatePersonModal from './modals/CreatePersonModal';

function Navbar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { categories, refreshData } = useContext(AppContext);
  const { user, logout } = useContext(AuthContext);
  const [showCreateMenu, setShowCreateMenu] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [activeModal, setActiveModal] = useState(null);
  const createMenuRef = useRef(null);
  const userMenuRef = useRef(null);

  // Close menus when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (createMenuRef.current && !createMenuRef.current.contains(event.target)) {
        setShowCreateMenu(false);
      }
      if (userMenuRef.current && !userMenuRef.current.contains(event.target)) {
        setShowUserMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const navItems = [
    { path: '/calendar', icon: Calendar, label: 'Calendar' },
    { path: '/my-week', icon: CalendarDays, label: 'My Week' },
    { path: '/my-day', icon: Sun, label: 'My Day' },
    { path: '/people', icon: Users, label: 'People' },
    { path: '/projects', icon: FolderKanban, label: 'Projects' },
    { path: '/categories', icon: Grid3X3, label: 'Categories' },
  ];

  const createOptions = [
    { id: 'action', icon: Zap, label: 'Action' },
    { id: 'block', icon: Blocks, label: 'Block' },
    { id: 'project', icon: FolderPlus, label: 'Project' },
    { id: 'category', icon: Tag, label: 'Category' },
    { id: 'person', icon: UserPlus, label: 'Person' },
  ];

  const handleCreateClick = (type) => {
    setShowCreateMenu(false);
    setActiveModal(type);
  };

  const handleModalClose = () => {
    setActiveModal(null);
  };

  const handleModalSuccess = () => {
    setActiveModal(null);
    refreshData();
  };

  const handleLogout = async () => {
    setShowUserMenu(false);
    await logout();
    navigate('/login');
  };

  const getUserInitials = () => {
    if (!user?.name) return '?';
    return user.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  return (
    <>
      <nav className="navbar">
        <Link to="/" className="navbar-brand">
          <Target size={24} />
          <span>RPM</span>
        </Link>

        <div className="navbar-nav">
          {navItems.map(item => (
            <Link
              key={item.path}
              to={item.path}
              className={`nav-link ${location.pathname === item.path ? 'active' : ''}`}
            >
              <item.icon size={16} />
              <span>{item.label}</span>
            </Link>
          ))}
        </div>

        <div className="navbar-actions">
          <div className="create-menu" ref={createMenuRef}>
            <button 
              className="btn btn-primary"
              onClick={() => setShowCreateMenu(!showCreateMenu)}
            >
              Create
              <ChevronDown size={16} />
            </button>
            
            {showCreateMenu && (
              <div className="create-menu-dropdown">
                {createOptions.map(option => (
                  <div
                    key={option.id}
                    className="create-menu-item"
                    onClick={() => handleCreateClick(option.id)}
                  >
                    <Plus size={16} />
                    <option.icon size={16} />
                    <span>{option.label}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="user-menu" ref={userMenuRef}>
            <button 
              className="user-avatar-btn"
              onClick={() => setShowUserMenu(!showUserMenu)}
            >
              {user?.avatar ? (
                <img src={user.avatar} alt={user.name} className="user-avatar-img" />
              ) : (
                <div className="user-avatar-initials">{getUserInitials()}</div>
              )}
            </button>

            {showUserMenu && (
              <div className="user-menu-dropdown">
                <div className="user-menu-header">
                  <div className="user-info">
                    <span className="user-name">{user?.name}</span>
                    <span className="user-email">{user?.email}</span>
                  </div>
                </div>
                <div className="user-menu-divider"></div>
                <div className="user-menu-item" onClick={handleLogout}>
                  <LogOut size={16} />
                  <span>Sign Out</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </nav>

      {/* Modals */}
      {activeModal === 'action' && (
        <CreateActionModal 
          onClose={handleModalClose} 
          onSuccess={handleModalSuccess}
          categories={categories}
        />
      )}
      {activeModal === 'block' && (
        <CreateBlockModal 
          onClose={handleModalClose} 
          onSuccess={handleModalSuccess}
          categories={categories}
        />
      )}
      {activeModal === 'project' && (
        <CreateProjectModal 
          onClose={handleModalClose} 
          onSuccess={handleModalSuccess}
          categories={categories}
        />
      )}
      {activeModal === 'category' && (
        <CreateCategoryModal 
          onClose={handleModalClose} 
          onSuccess={handleModalSuccess}
        />
      )}
      {activeModal === 'person' && (
        <CreatePersonModal 
          onClose={handleModalClose} 
          onSuccess={handleModalSuccess}
        />
      )}
    </>
  );
}

export default Navbar;
