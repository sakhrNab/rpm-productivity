import { useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppContext } from '../App';
import { Plus } from 'lucide-react';

function ProjectsPage() {
  const { projects, categories } = useContext(AppContext);
  const navigate = useNavigate();

  const getCategoryById = (id) => categories.find(c => c.id === id);

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Active Projects</h1>
        <button className="btn btn-primary">
          <Plus size={16} />
          Create New Project
        </button>
      </div>

      <div className="projects-grid">
        {projects.map(project => {
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
        })}
      </div>
    </div>
  );
}

export default ProjectsPage;
