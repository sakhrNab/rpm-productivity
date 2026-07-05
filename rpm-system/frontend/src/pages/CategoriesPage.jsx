import { useContext, useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppContext } from '../App';
import CreateCategoryModal from '../components/modals/CreateCategoryModal';
import {
  Target, Heart, DollarSign, Users, Activity, Home, Zap, Inbox, Star,
  MoreVertical, Trash2, Pencil
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
  const { categories, refreshData, api } = useContext(AppContext);
  const navigate = useNavigate();
  const [openMenuId, setOpenMenuId] = useState(null);
  const [editingCategory, setEditingCategory] = useState(null);
  const menuRef = useRef(null);

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

  const handleEdit = (category) => {
    setOpenMenuId(null);
    setEditingCategory(category);
  };

  const handleDelete = async (category) => {
    setOpenMenuId(null);
    const confirmed = window.confirm(
      `Delete "${category.name}"?\n\nThis permanently removes the category and everything inside it — its projects, key results, capture items, and big-picture details. This cannot be undone.`
    );
    if (!confirmed) return;
    try {
      await api.deleteCategory(category.id);
      await refreshData();
    } catch (error) {
      console.error('Failed to delete category:', error);
      alert('Failed to delete category. Please try again.');
    }
  };

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

              <div
                className="category-card-menu dropdown"
                ref={openMenuId === category.id ? menuRef : null}
              >
                <button
                  className="btn btn-icon btn-ghost"
                  aria-label="Category options"
                  onClick={(e) => {
                    e.stopPropagation();
                    setOpenMenuId(openMenuId === category.id ? null : category.id);
                  }}
                >
                  <MoreVertical size={16} color="white" />
                </button>
                {openMenuId === category.id && (
                  <div
                    className="dropdown-menu"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div
                      className="dropdown-item"
                      onClick={() => handleEdit(category)}
                    >
                      <Pencil size={14} />
                      Edit category
                    </div>
                    <div
                      className="dropdown-item"
                      style={{ color: 'var(--accent-red)' }}
                      onClick={() => handleDelete(category)}
                    >
                      <Trash2 size={14} />
                      Delete category
                    </div>
                  </div>
                )}
              </div>

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

      {editingCategory && (
        <CreateCategoryModal
          initialData={editingCategory}
          onClose={() => setEditingCategory(null)}
          onSuccess={() => {
            setEditingCategory(null);
            refreshData();
          }}
        />
      )}
    </div>
  );
}

export default CategoriesPage;
