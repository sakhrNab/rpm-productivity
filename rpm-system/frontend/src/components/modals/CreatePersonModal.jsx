import { useState, useContext } from 'react';
import { AuthContext } from '../../App';
import { useToast } from '../ToastProvider';
import { UserPlus, UserRound, Contact, Mail, Phone, Send, Check } from 'lucide-react';
import ModalHead from './ModalHead';
import './CreatePersonModal.css';

function CreatePersonModal({ onClose, onSuccess, initialData }) {
  const { api } = useContext(AuthContext);
  const { showToast } = useToast();
  const isEditing = Boolean(initialData?.id);
  const [formData, setFormData] = useState({
    name: initialData?.name || '',
    email: initialData?.email || '',
    phone: initialData?.phone || '',
    notes: initialData?.notes || '',
  });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name.trim()) return;

    setLoading(true);
    try {
      if (isEditing) {
        await api.updatePerson(initialData.id, formData);
      } else {
        const created = await api.createPerson(formData);
        const to = formData.email.trim();
        switch (created?.inviteStatus) {
          case 'sent':
            showToast(`Invitation email sent to ${to}.`, 'success');
            break;
          case 'already_member':
            showToast(`${to} is already an RPM member — we let them know you added them.`, 'info');
            break;
          case 'already_invited':
            showToast(`${to} was already invited earlier.`, 'info');
            break;
          case 'send_failed':
            showToast(`Couldn't send the invitation to ${to}. Please try again.`, 'error');
            break;
          default:
            break; // no_email: nothing to say
        }
      }
      onSuccess();
    } catch (error) {
      console.error('Failed to save person:', error);
      showToast('Could not save this person. Please try again.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const hasEmail = Boolean(formData.email.trim());

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal cpe-modal" onClick={e => e.stopPropagation()}>
        <ModalHead
          icon={isEditing ? UserRound : UserPlus}
          title={isEditing ? 'Edit person' : 'Add a person'}
          subtitle={isEditing ? 'Contact details and notes for your leverage list.' : 'Someone you delegate to or commit to. Add an email to invite them.'}
          onClose={onClose}
        />

        <form onSubmit={handleSubmit}>
          <div className="modal-body mk-body">
            <label className="mk-field">
              <span className="form-label">Name</span>
              <input
                type="text"
                className="form-input mk-hero"
                placeholder="Full name"
                value={formData.name}
                onChange={e => setFormData({ ...formData, name: e.target.value })}
                autoFocus
              />
            </label>

            <div className="mk-section">
              <p className="ui-kicker"><Contact size={14} /> Contact</p>
              <div className="mk-grid mk-grid-2">
                <label className="mk-field">
                  <span className="form-label"><Mail size={12} /> Email</span>
                  <input
                    type="email"
                    className="form-input"
                    placeholder="email@example.com"
                    value={formData.email}
                    onChange={e => setFormData({ ...formData, email: e.target.value })}
                  />
                </label>
                <label className="mk-field">
                  <span className="form-label"><Phone size={12} /> Phone</span>
                  <input
                    type="tel"
                    className="form-input"
                    placeholder="+1 234 567 8900"
                    value={formData.phone}
                    onChange={e => setFormData({ ...formData, phone: e.target.value })}
                  />
                </label>
              </div>
              {!isEditing && hasEmail && (
                <p className="mk-help cpe-invite"><Send size={13} /> We'll email them an invitation when you add them.</p>
              )}
            </div>

            <label className="mk-field">
              <span className="form-label">Notes <span className="mk-optional">optional</span></span>
              <textarea
                className="form-input"
                placeholder="What they help with, how you work together…"
                value={formData.notes}
                onChange={e => setFormData({ ...formData, notes: e.target.value })}
                rows={3}
              />
            </label>
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
              <Check size={16} /> {loading ? 'Saving...' : (isEditing ? 'Save changes' : 'Add person')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default CreatePersonModal;
