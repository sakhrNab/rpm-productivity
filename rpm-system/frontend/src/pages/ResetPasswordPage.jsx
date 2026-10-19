import { useState, useContext, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Lock, Eye, EyeOff, AlertCircle, ShieldCheck } from 'lucide-react';
import { AuthContext } from '../App';
import AuthLogo from '../components/AuthLogo';
import './RegisterPage.css';

const MIN = 8;

// Land here from the emailed link (/reset-password?token=…). The token is read once, then dropped from the
// address bar so it doesn't linger in history or get shared with a screenshot.
function ResetPasswordPage() {
  const { api } = useContext(AuthContext);
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [token] = useState(() => params.get('token') || '');
  const [valid, setValid] = useState(null);          // null = checking
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (params.get('token')) window.history.replaceState(null, '', '/reset-password');
    if (!token) { setValid(false); return; }
    api.checkResetToken(token).then(r => setValid(!!r.valid)).catch(() => setValid(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (password.length < MIN) { setError(`Use at least ${MIN} characters.`); return; }
    if (password !== confirm) { setError('The two passwords do not match.'); return; }
    setLoading(true);
    try {
      await api.resetPassword(token, password);
      setDone(true);
    } catch (err) {
      if (err.code === 'invalid_token') setValid(false);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-card reg-card">
        <div className="auth-header">
          <AuthLogo />
          <h1>{done ? 'Password changed' : 'Choose a new password'}</h1>
          <p>{done ? 'Every device was signed out. Sign in with your new password.' : 'Pick something you don’t use anywhere else.'}</p>
        </div>

        {error && valid !== false && (
          <div className="auth-error"><AlertCircle size={18} /><span>{error}</span></div>
        )}

        {done ? (
          <div className="reg-done">
            <span className="ui-icon-badge"><ShieldCheck size={20} /></span>
            <button type="button" className="btn-primary auth-submit" onClick={() => navigate('/login', { replace: true })}>Sign in</button>
          </div>
        ) : valid === null ? (
          <div className="reg-done"><div className="spinner" /></div>
        ) : valid === false ? (
          <div className="reg-done">
            <div className="reg-note reg-note--warn" role="status">
              <AlertCircle size={18} />
              <span>This reset link has expired or was already used. Links work once and only for 30 minutes.</span>
            </div>
            <Link to="/forgot-password" className="btn-primary">Send a new link</Link>
          </div>
        ) : (
          <form onSubmit={submit} className="auth-form">
            <div className="form-group">
              <label htmlFor="rp-pass">New password</label>
              <div className="input-with-icon">
                <Lock size={18} />
                <input type={show ? 'text' : 'password'} id="rp-pass" value={password} onChange={(e) => setPassword(e.target.value)}
                  placeholder={`At least ${MIN} characters`} required minLength={MIN} autoComplete="new-password" autoFocus />
                <button type="button" className="password-toggle" aria-label={show ? 'Hide password' : 'Show password'} onClick={() => setShow(!show)}>
                  {show ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>
            <div className="form-group">
              <label htmlFor="rp-confirm">Confirm new password</label>
              <div className="input-with-icon">
                <Lock size={18} />
                <input type={show ? 'text' : 'password'} id="rp-confirm" value={confirm} onChange={(e) => setConfirm(e.target.value)}
                  placeholder="Type it again" required autoComplete="new-password" />
              </div>
            </div>
            <button type="submit" className="btn-primary auth-submit" disabled={loading}>
              {loading ? 'Saving…' : 'Set new password'}
            </button>
          </form>
        )}

        <div className="auth-footer">
          <p><Link to="/login">Back to sign in</Link></p>
        </div>
      </div>
    </div>
  );
}

export default ResetPasswordPage;
