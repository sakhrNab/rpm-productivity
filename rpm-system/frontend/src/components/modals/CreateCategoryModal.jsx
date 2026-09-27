import { useState, useContext } from 'react';
import { AuthContext } from '../../App';
import { 
  Target, Heart, DollarSign, Users, Activity, Home, Zap, Inbox,
  Star, Briefcase, Book, Music, Camera, Plane, Coffee, Gift, Check, Palette, Shapes
} from 'lucide-react';
import ModalHead from './ModalHead';
import './CreateCategoryModal.css';

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

function CreateCategoryModal({ onClose, onSuccess, initialData }) {
  const { api } = useContext(AuthContext);
  const isEditing = Boolean(initialData?.id);
  const [formData, setFormData] = useState({
    name: initialData?.name || '',
    description: initialData?.description || '',
    color: initialData?.color || '#FF69B4',
    icon: initialData?.icon || 'target',
  });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name.trim()) return;

    setLoading(true);
    try {
      const saved = isEditing
        ? await api.updateCategory(initialData.id, formData)
        : await api.createCategory(formData);
      onSuccess(saved);
    } catch (error) {
      console.error('Failed to save category:', error);
    } finally {
      setLoading(false);
    }
  };

  const SelectedIcon = (ICONS.find(i => i.id === formData.icon) || ICONS[0]).component;
  const nameLen = formData.name.length;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal ccm-modal" style={{ '--cat': formData.color }} onClick={e => e.stopPropagation()}>
        <ModalHead
          icon={SelectedIcon}
          title={isEditing ? 'Edit category' : 'New category'}
          subtitle="An area of life your projects and actions roll up to."
          onClose={onClose}
          badgeStyle={{
            color: formData.color,
            background: `linear-gradient(135deg, ${formData.color}38, ${formData.color}10)`,
            borderColor: `${formData.color}66`,
          }}
        />

        <form onSubmit={handleSubmit}>
          <div className="modal-body mk-body">
            {/* Name */}
            <label className="mk-field">
              <span className="form-label">
                Name
                <span className={`mk-count ccm-count ${nameLen >= 45 ? 'near' : ''}`}>{nameLen}/50</span>
              </span>
              <input
                type="text"
                className="form-input mk-hero"
                placeholder="e.g. Health & Fitness"
                value={formData.name}
                onChange={e => setFormData({ ...formData, name: e.target.value })}
                maxLength={50}
                autoFocus
              />
            </label>

            {/* Color */}
            <div className="mk-section">
              <p className="ui-kicker"><Palette size={14} /> Colour</p>
              <div className="ccm-swatches" role="radiogroup" aria-label="Colour">
                {COLORS.map(color => (
                  <button
                    type="button"
                    key={color}
                    role="radio"
                    aria-checked={formData.color === color}
                    aria-label={color}
                    className={`ccm-swatch ${formData.color === color ? 'selected' : ''}`}
                    style={{ '--sw': color }}
                    onClick={() => setFormData({ ...formData, color })}
                  >
                    {formData.color === color && <Check size={14} strokeWidth={3} />}
                  </button>
                ))}
              </div>
            </div>

            {/* Icon */}
            <div className="mk-section">
              <p className="ui-kicker"><Shapes size={14} /> Icon</p>
              <div className="ccm-icons" role="radiogroup" aria-label="Icon">
                {ICONS.map(icon => {
                  const IconComponent = icon.component;
                  return (
                    <button
                      type="button"
                      key={icon.id}
                      role="radio"
                      aria-checked={formData.icon === icon.id}
                      aria-label={icon.id}
                      className={`ccm-icon ${formData.icon === icon.id ? 'selected' : ''}`}
                      onClick={() => setFormData({ ...formData, icon: icon.id })}
                    >
                      <IconComponent size={18} />
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="modal-footer mk-foot">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={loading || !formData.name.trim()}
            >
              <Check size={16} /> {loading ? 'Saving...' : (isEditing ? 'Save changes' : 'Create category')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default CreateCategoryModal;
