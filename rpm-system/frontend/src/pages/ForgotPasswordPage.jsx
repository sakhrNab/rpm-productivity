import { useState, useContext } from 'react';
import { Link } from 'react-router-dom';
import { Mail, AlertCircle, MailCheck } from 'lucide-react';
import { AuthContext } from '../App';
import AuthLogo from '../components/AuthLogo';
import './RegisterPage.css';

// Ask for a reset link. The answer is the same whether or not the email has an account.
function ForgotPasswordPage() {
  const { api } = useContext(AuthContext);
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const out = await api.forgotPassword(email);
      setSent(out.message);
    } catch (err) {
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
          <h1>Forgot password</h1>
          <p>We'll email you a link to choose a new one.</p>
        </div>

        {error && (
          <div className="auth-error"><AlertCircle size={18} /><span>{error}</span></div>
        )}

        {sent ? (
          <div className="reg-done">
            <span className="ui-icon-badge"><MailCheck size={20} /></span>
            <h2>Check your email</h2>
            <p>{sent}</p>
            <p>Nothing arrived? Look in spam, or ask again in a few minutes.</p>
            <Link to="/login" className="btn-secondary">Back to sign in</Link>
          </div>
        ) : (
          <form onSubmit={submit} className="auth-form">
            <div className="form-group">
              <label htmlFor="fp-email">Email</label>
              <div className="input-with-icon">
                <Mail size={18} />
                <input type="email" id="fp-email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="The email you sign in with" required autoComplete="email" autoFocus />
              </div>
            </div>
            <button type="submit" className="btn-primary auth-submit" disabled={loading}>
              {loading ? 'Sending…' : 'Send reset link'}
            </button>
          </form>
        )}

        <div className="auth-footer">
          <p>Remembered it? <Link to="/login">Sign in</Link></p>
        </div>
      </div>
    </div>
  );
}

export default ForgotPasswordPage;
