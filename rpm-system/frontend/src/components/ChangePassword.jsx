import { useContext, useState } from 'react';
import { Link } from 'react-router-dom';
import { Lock, Eye, EyeOff, Check } from 'lucide-react';
import { AuthContext } from '../App';
import { useToast } from './ToastProvider';

const MIN = 8;

// Settings → Security. Needs the current password; on success every other device is signed out and this
// one gets fresh tokens. Accounts made with Google/Microsoft have no password yet — they set one by email.
export default function ChangePassword() {
  const { changePassword } = useContext(AuthContext);
  const { showToast } = useToast();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [noPassword, setNoPassword] = useState(false);
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (next.length < MIN) { setError(`Use at least ${MIN} characters.`); return; }
    if (next !== confirm) { setError('The two new passwords do not match.'); return; }
    setSaving(true);
    try {
      await changePassword(current, next);
      setCurrent(''); setNext(''); setConfirm('');
      showToast('Password changed — every other device was signed out', 'success', 6000);
    } catch (err) {
      if (err.code === 'no_password') setNoPassword(true);
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const field = (id, label, value, set, auto, extra = {}) => (
    <div className="form-group">
      <label htmlFor={id}>{label}</label>
      <div className="input-with-icon">
        <Lock size={18} />
        <input type={show ? 'text' : 'password'} id={id} value={value} onChange={(e) => set(e.target.value)} autoComplete={auto} required {...extra} />
      </div>
    </div>
  );

  if (noPassword) {
    return (
      <div className="settings-pw">
        <p className="settings-pw-note">{error}</p>
        <Link to="/forgot-password" className="btn-secondary">Set a password by email</Link>
      </div>
    );
  }

  return (
    <form className="auth-form settings-pw" onSubmit={submit}>
      {error && <p className="settings-pw-error" role="alert">{error}</p>}
      {field('cp-current', 'Current password', current, setCurrent, 'current-password')}
      {field('cp-new', 'New password', next, setNext, 'new-password', { minLength: MIN, placeholder: `At least ${MIN} characters` })}
      {field('cp-confirm', 'Confirm new password', confirm, setConfirm, 'new-password')}
      <div className="settings-pw-actions">
        <button type="button" className="btn-ghost" onClick={() => setShow(s => !s)}>
          {show ? <><EyeOff size={15} /> Hide</> : <><Eye size={15} /> Show</>}
        </button>
        <button type="submit" className="btn-primary" disabled={saving}><Check size={15} /> {saving ? 'Saving…' : 'Change password'}</button>
      </div>
      <p className="settings-pw-note">Forgot the current one? <Link to="/forgot-password">Reset it by email</Link>.</p>
    </form>
  );
}
