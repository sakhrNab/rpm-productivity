import { useState, useContext, useRef, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { 
  Target, Calendar, CalendarDays, Sun, Users, FolderKanban, Grid3X3,
  Plus, Zap, Blocks, FolderPlus, Tag, UserPlus, Settings, ChevronDown
} from 'lucide-react';
import { AppContext, api } from '../App';
import CreateActionModal from './modals/CreateActionModal';
import CreateBlockModal from './modals/CreateBlockModal';
import CreateProjectModal from './modals/CreateProjectModal';
import CreateCategoryModal from './modals/CreateCategoryModal';
import CreatePersonModal from './modals/CreatePersonModal';

function Navbar() {
  const location = useLocation();
  const { categories, refreshData } = useContext(AppContext);
  const [showCreateMenu, setShowCreateMenu] = useState(false);
  const [activeModal, setActiveModal] = useState(null);
  const createMenuRef = useRef(null);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (createMenuRef.current && !createMenuRef.current.contains(event.target)) {
        setShowCreateMenu(false);
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

          <button className="btn btn-icon btn-ghost">
            <Settings size={18} />
          </button>
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
