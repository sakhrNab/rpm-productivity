import { useContext, useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppContext } from '../App';
import { Plus, MoreVertical, Trash2 } from 'lucide-react';
import CreateProjectModal from '../components/modals/CreateProjectModal';
import './ProjectsPage.css';

function ProjectsPage() {
  const { projects, categories, refreshData, api } = useContext(AppContext);
  const navigate = useNavigate();
  const [showProjectModal, setShowProjectModal] = useState(false);
  const [openMenuId, setOpenMenuId] = useState(null);
  const menuRef = useRef(null);

  const getCategoryById = (id) => categories.find(c => c.id === id);

  const handleProjectSuccess = () => {
    setShowProjectModal(false);
    if (refreshData) refreshData();
  };

  // Close the open menu when clicking anywhere outside of it
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setOpenMenuId(null);
      }
    };
    if (openMenuId) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [openMenuId]);

  const handleDelete = async (project) => {
    setOpenMenuId(null);
    const confirmed = window.confirm(
      `Delete "${project.name}"?\n\nThis permanently removes the project and everything inside it — its key results, capture items, and actions. This cannot be undone.`
    );
    if (!confirmed) return;
    try {
      await api.deleteProject(project.id);
      if (refreshData) await refreshData();
    } catch (error) {
      console.error('Failed to delete project:', error);
      alert('Failed to delete project. Please try again.');
    }
  };

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Active Projects</h1>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => setShowProjectModal(true)}
        >
          <Plus size={16} />
          Create New Project
        </button>
      </div>

      <div className="projects-grid">
        {projects.length === 0 ? (
          <div className="empty-state pp-empty-state">
            <p className="pp-empty-text">
              No projects yet. Create your first project to get started!
            </p>
          </div>
        ) : (
          projects.map(project => {
          const category = getCategoryById(project.category_id);
          return (
            <div
              key={project.id}
              className={`project-card ${openMenuId === project.id ? 'menu-open' : ''}`}
              onClick={() => navigate(`/projects/${project.id}`)}
            >
              <div
                className="project-card-bg"
                style={{
                  backgroundImage: project.cover_image
                    ? `url(${project.cover_image})`
                    : 'linear-gradient(135deg, #1a2d4a 0%, #0d1d35 100%)'
                }}
              />

              <div
                className="project-card-menu dropdown"
                ref={openMenuId === project.id ? menuRef : null}
              >
                <button
                  className="btn btn-icon btn-ghost"
                  aria-label="Project options"
                  onClick={(e) => {
                    e.stopPropagation();
                    setOpenMenuId(openMenuId === project.id ? null : project.id);
                  }}
                >
                  <MoreVertical size={16} color="white" />
                </button>
                {openMenuId === project.id && (
                  <div
                    className="dropdown-menu"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div
                      className="dropdown-item pp-delete-item"
                      onClick={() => handleDelete(project)}
                    >
                      <Trash2 size={14} />
                      Delete project
                    </div>
                  </div>
                )}
              </div>

              <div className="project-card-content">
                {category && (
                  <div
                    className="project-card-badge"
                    style={{ color: category.color }}
                  >
                    <span
                      className="pp-badge-dot"
                      style={{ background: category.color }}
                    />
                    {category.name}
                  </div>
                )}
                <h3 className="project-card-title">{project.name}</h3>
                <p className="project-card-description">
                  {project.ultimate_result || project.description}
                </p>
              </div>
            </div>
          );
        })
        )}
      </div>

      {/* Create Project Modal */}
      {showProjectModal && categories && (
        <CreateProjectModal
          onClose={() => setShowProjectModal(false)}
          onSuccess={handleProjectSuccess}
          categories={categories}
          onCategoriesRefresh={refreshData}
        />
      )}
    </div>
  );
}

export default ProjectsPage;
