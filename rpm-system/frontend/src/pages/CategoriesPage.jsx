import { useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppContext } from '../App';
import { 
  Target, Heart, DollarSign, Users, Activity, Home, Zap, Inbox, Star
} from 'lucide-react';

const iconMap = {
  'target': Target,
  'heart': Heart,
  'dollar-sign': DollarSign,
  'users': Users,
  'activity': Activity,
  'home': Home,
  'zap': Zap,
  'inbox': Inbox,
  'star': Star,
};

function CategoriesPage() {
  const { categories } = useContext(AppContext);
  const navigate = useNavigate();

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Active Categories</h1>
      </div>

      <div className="categories-grid">
        {categories.map(category => {
          const IconComponent = iconMap[category.icon] || Target;
          return (
            <div
              key={category.id}
              className="category-card"
              onClick={() => navigate(`/categories/${category.id}`)}
            >
              <div 
                className="category-card-bg"
                style={{ 
                  backgroundImage: category.cover_image 
                    ? `url(${category.cover_image})` 
                    : 'linear-gradient(135deg, #1a2d4a 0%, #0d1d35 100%)'
                }}
              />
              <div className="category-card-overlay" />
              <div className="category-card-content">
                <div 
                  className="category-card-icon"
                  style={{ background: category.color }}
                >
                  <IconComponent size={18} color="white" />
                </div>
                <h3 className="card-title">{category.name}</h3>
                <p className="card-description">{category.description}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default CategoriesPage;
