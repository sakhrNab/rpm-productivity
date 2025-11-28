import { useState } from 'react';
import { api } from '../../App';
import { 
  Target, Heart, DollarSign, Users, Activity, Home, Zap, Inbox,
  Star, Briefcase, Book, Music, Camera, Plane, Coffee, Gift
} from 'lucide-react';

const COLORS = [
  '#FF69B4', '#FF8CC8', '#9575CD', '#6B8DD6', '#64B5F6', '#4DD0E1',
  '#4DB6AC', '#81C784', '#AED581', '#DCE775', '#FFD54F', '#FFB74D',
  '#FF8A65', '#A1887F', '#90A4AE', '#F48FB1'
];

const ICONS = [
  { id: 'target', component: Target },
  { id: 'heart', component: Heart },
  { id: 'dollar-sign', component: DollarSign },
  { id: 'users', component: Users },
  { id: 'activity', component: Activity },
  { id: 'home', component: Home },
  { id: 'zap', component: Zap },
  { id: 'inbox', component: Inbox },
  { id: 'star', component: Star },
  { id: 'briefcase', component: Briefcase },
  { id: 'book', component: Book },
  { id: 'music', component: Music },
  { id: 'camera', component: Camera },
  { id: 'plane', component: Plane },
  { id: 'coffee', component: Coffee },
  { id: 'gift', component: Gift },
];

function CreateCategoryModal({ onClose, onSuccess }) {
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    color: '#FF69B4',
    icon: 'target',
  });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name.trim()) return;

    setLoading(true);
    try {
      await api.createCategory(formData);
      onSuccess();
    } catch (error) {
      console.error('Failed to create category:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">Create a new category</h3>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            {/* Name */}
            <div className="form-group">
              <label className="form-label">NAME</label>
              <input
                type="text"
                className="form-input"
                placeholder=""
                value={formData.name}
                onChange={e => setFormData({ ...formData, name: e.target.value })}
                maxLength={50}
                autoFocus
                style={{ borderColor: 'var(--accent-cyan)' }}
              />
              <small style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                UP TO 50 CHARACTERS
              </small>
            </div>

            {/* Color */}
            <div className="form-group">
              <label className="form-label">COLOR</label>
              <div className="color-picker">
                {COLORS.map(color => (
                  <div
                    key={color}
                    className={`color-option ${formData.color === color ? 'selected' : ''}`}
                    style={{ background: color }}
                    onClick={() => setFormData({ ...formData, color })}
                  />
                ))}
              </div>
            </div>

            {/* Icon */}
            <div className="form-group">
              <label className="form-label">ICON</label>
              <div className="icon-picker">
                {ICONS.map(icon => {
                  const IconComponent = icon.component;
                  return (
                    <div
                      key={icon.id}
                      className={`icon-option ${formData.icon === icon.id ? 'selected' : ''}`}
                      onClick={() => setFormData({ ...formData, icon: icon.id })}
                    >
                      <IconComponent size={18} />
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button 
              type="submit" 
              className="btn btn-primary" 
              disabled={loading || !formData.name.trim()}
            >
              {loading ? 'Creating...' : 'Create category'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default CreateCategoryModal;
