import { useContext, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppContext } from '../App';
import { Plus } from 'lucide-react';
import CreateProjectModal from '../components/modals/CreateProjectModal';

function ProjectsPage() {
  const { projects, categories, refreshData } = useContext(AppContext);
  const navigate = useNavigate();
  const [showProjectModal, setShowProjectModal] = useState(false);

  const getCategoryById = (id) => categories.find(c => c.id === id);

  const handleProjectSuccess = () => {
    setShowProjectModal(false);
    if (refreshData) refreshData();
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
          <div className="empty-state" style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '48px' }}>
            <p style={{ color: 'var(--text-muted)', fontSize: '1.1rem', marginBottom: '16px' }}>
              No projects yet. Create your first project to get started!
            </p>
          </div>
        ) : (
          projects.map(project => {
          const category = getCategoryById(project.category_id);
          return (
            <div
              key={project.id}
              className="project-card"
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
              <div className="project-card-content">
                {category && (
                  <div 
                    className="project-card-badge"
                    style={{ color: category.color }}
                  >
                    <span style={{ 
                      width: 8, 
                      height: 8, 
                      borderRadius: '50%', 
                      background: category.color 
                    }} />
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
