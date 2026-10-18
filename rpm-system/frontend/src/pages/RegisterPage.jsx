import { useState, useContext, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { AuthContext, API_BASE } from '../App';
import { getProviders } from '../utils/socialAuth';
import { Mail, Lock, User, Eye, EyeOff, AlertCircle, KeyRound, Send, MailCheck, Sparkles, MessageSquare } from 'lucide-react';
import './RegisterPage.css';

// RPM is invite-only. You get in with an invite link (from the admin or someone who added you as a
// contact), a registration code, or by requesting access — the admin approves it and you get a link.
// Shown when Google/Microsoft sign-in on the login page found no account and no invite.
const ENTRY_ERRORS = {
  invite_required: 'No RPM account for that email yet, and RPM is invite-only. Enter a registration code and press Google/Microsoft again, or request access.',
  invite_invalid: 'This invite link has expired or was already used. Use a code or request access.',
  code_invalid: "That registration code isn't valid — it may be used up, expired or revoked.",
};

function RegisterPage() {
  const [params] = useSearchParams();
  const inviteToken = params.get('invite') || '';
  const [mode, setMode] = useState(params.get('mode') === 'request' ? 'request' : 'create');
  const [invite, setInvite] = useState(null);          // { email, name, inviterName } | false (dead link) | null (none/loading)
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [code, setCode] = useState(params.get('code') || '');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState(ENTRY_ERRORS[params.get('error')] || '');
  const [errorCode, setErrorCode] = useState(params.get('error') || '');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [website, setWebsite] = useState('');          // honeypot
  const [requested, setRequested] = useState(null);    // the email a request was sent for
  const [socialReady, setSocialReady] = useState(false);
  const { register, socialLogin, api } = useContext(AuthContext);
  const navigate = useNavigate();

  useEffect(() => { getProviders(API_BASE).then(p => setSocialReady(!!p.firebase)); }, []);

  useEffect(() => {
    if (!inviteToken) return;
    let alive = true;
    api.getInvite(inviteToken).then((inv) => {
      if (!alive) return;
      setInvite(inv || false);
      if (inv) { setEmail(inv.email); if (inv.name) setName(n => n || inv.name); }
    }).catch(() => alive && setInvite(false));
    return () => { alive = false; };
  }, [inviteToken]); // eslint-disable-line react-hooks/exhaustive-deps

  const validInvite = !!invite;
  const switchMode = (m) => { setMode(m); setError(''); setErrorCode(''); };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(''); setErrorCode('');

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    setLoading(true);

    try {
      await register(email, password, name, { invite: validInvite ? inviteToken : undefined, code: code.trim() || undefined });
      navigate('/', { replace: true });
    } catch (err) {
      setError(err.message || 'Registration failed');
      setErrorCode(err.code || '');
    } finally {
      setLoading(false);
    }
  };

  const handleRequest = async (e) => {
    e.preventDefault();
    setError(''); setErrorCode('');
    setLoading(true);
    try {
      const out = await api.requestAccess({ name, email, message, website });
      if (out.status === 'already_invited') {
        // Their email already has an invite: they can create the account right now.
        setMode('create');
        setError('');
        setRequested(null);
        setErrorCode('already_invited');
      } else {
        setRequested(email);
      }
    } catch (err) {
      setError(err.message);
      setErrorCode(err.code || '');
    } finally {
      setLoading(false);
    }
  };

  // Google / Microsoft: the invite link or code on this page admits the new account.
  const social = async (provider) => {
    setError(''); setErrorCode('');
    setLoading(true);
    try {
      await socialLogin(provider, { invite: validInvite ? inviteToken : undefined, code: code.trim() || undefined });
      navigate('/', { replace: true });
    } catch (err) {
      setError(err.message || 'Sign-in failed');
      setErrorCode(err.code || '');
    } finally {
      setLoading(false);
    }
  };

  const title = mode === 'request' ? 'Request access' : validInvite ? "You're invited" : 'Create Account';
  const subtitle = mode === 'request'
    ? 'Tell us who you are — the admin reviews every request.'
    : validInvite ? `${invite.inviterName || 'Someone'} invited you to RPM` : 'RPM is invite-only — use your invite or code';

  return (
    <div className="auth-container">
      <div className="auth-card reg-card">
        <div className="auth-header">
          <div className="auth-logo">
            <svg viewBox="0 0 100 100" width="60" height="60">
              <defs>
                <linearGradient id="logoGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#FF69B4" />
                  <stop offset="100%" stopColor="#4ECDC4" />
                </linearGradient>
              </defs>
              <circle cx="50" cy="50" r="45" fill="none" stroke="url(#logoGrad)" strokeWidth="4"/>
              <circle cx="50" cy="50" r="8" fill="url(#logoGrad)"/>
              <circle cx="50" cy="50" r="25" fill="none" stroke="url(#logoGrad)" strokeWidth="2" opacity="0.5"/>
            </svg>
          </div>
          <h1>{title}</h1>
          <p>{subtitle}</p>
        </div>

        {invite === false && (
          <div className="reg-note reg-note--warn" role="status">
            <AlertCircle size={18} />
            <span>This invite link has expired or was already used. Use a registration code, or request access.</span>
          </div>
        )}

        {validInvite && mode === 'create' && (
          <div className="reg-note reg-note--good" role="status">
            <MailCheck size={18} />
            <span>Invite for <b>{invite.email}</b> — create your account and you're in.</span>
          </div>
        )}

        {!validInvite && !requested && (
          <div className="ui-seg reg-seg" role="tablist" aria-label="How do you want to join?">
            <button type="button" role="tab" aria-selected={mode === 'create'} onClick={() => switchMode('create')}>
              <KeyRound size={15} /> I have an invite or code
            </button>
            <button type="button" role="tab" aria-selected={mode === 'request'} onClick={() => switchMode('request')}>
              <Send size={15} /> Request access
            </button>
          </div>
        )}

        {errorCode === 'already_invited' && (
          <div className="reg-note reg-note--good" role="status">
            <Sparkles size={18} />
            <span>Good news — <b>{email}</b> is already invited. Create your account below.</span>
          </div>
        )}

        {error && (
          <div className="auth-error">
            <AlertCircle size={18} />
            <span>
              {error}
              {['invite_required', 'invite_invalid', 'code_invalid'].includes(errorCode) && mode === 'create' && (
                <> <button type="button" className="reg-link" onClick={() => switchMode('request')}>Request access instead</button></>
              )}
              {['email_taken', 'already_member'].includes(errorCode) && <> <Link to="/login" className="reg-link">Sign in</Link></>}
            </span>
          </div>
        )}

        {requested ? (
          <div className="reg-done">
            <span className="ui-icon-badge"><MailCheck size={20} /></span>
            <h2>Request sent</h2>
            <p>We'll email <b>{requested}</b> as soon as the admin approves it. The email has a link that creates your account.</p>
            <Link to="/login" className="btn-secondary">Back to sign in</Link>
          </div>
        ) : mode === 'request' ? (
          <form onSubmit={handleRequest} className="auth-form">
            <div className="form-group">
              <label htmlFor="rq-name">Full Name</label>
              <div className="input-with-icon">
                <User size={18} />
                <input type="text" id="rq-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Enter your full name" required maxLength={100} />
              </div>
            </div>
            <div className="form-group">
              <label htmlFor="rq-email">Email</label>
              <div className="input-with-icon">
                <Mail size={18} />
                <input type="email" id="rq-email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Where should we send your invite?" required />
              </div>
            </div>
            <div className="form-group">
              <label htmlFor="rq-msg">Why do you want to join? <span className="reg-optional">optional</span></label>
              <div className="input-with-icon reg-textarea">
                <MessageSquare size={18} />
                <textarea id="rq-msg" value={message} onChange={(e) => setMessage(e.target.value)} rows={3} maxLength={1000} placeholder="How you know the owner, or what you'd plan with RPM" />
              </div>
            </div>
            <input type="text" className="reg-hp" tabIndex={-1} autoComplete="off" aria-hidden="true" value={website} onChange={(e) => setWebsite(e.target.value)} name="website" />
            <button type="submit" className="btn-primary auth-submit" disabled={loading}>
              {loading ? 'Sending…' : 'Request access'}
            </button>
          </form>
        ) : (
          <>
            <form onSubmit={handleSubmit} className="auth-form">
              <div className="form-group">
                <label htmlFor="name">Full Name</label>
                <div className="input-with-icon">
                  <User size={18} />
                  <input
                    type="text"
                    id="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Enter your full name"
                    required
                  />
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="email">Email</label>
                <div className="input-with-icon">
                  <Mail size={18} />
                  <input
                    type="email"
                    id="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Enter your email"
                    required
                  />
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="password">Password</label>
                <div className="input-with-icon">
                  <Lock size={18} />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    id="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Create a password (min 6 characters)"
                    required
                    minLength={6}
                  />
                  <button
                    type="button"
                    className="password-toggle"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="confirmPassword">Confirm Password</label>
                <div className="input-with-icon">
                  <Lock size={18} />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    id="confirmPassword"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Confirm your password"
                    required
                  />
                </div>
              </div>

              {!validInvite && (
                <div className="form-group">
                  <label htmlFor="code">Registration code <span className="reg-optional">not needed if your email was invited</span></label>
                  <div className="input-with-icon">
                    <KeyRound size={18} />
                    <input
                      type="text"
                      id="code"
                      className="reg-code"
                      value={code}
                      onChange={(e) => setCode(e.target.value.toUpperCase())}
                      placeholder="RPM-XXXX-XXXX"
                      autoComplete="off"
                      spellCheck={false}
                      maxLength={40}
                    />
                  </div>
                </div>
              )}

              <button type="submit" className="btn-primary auth-submit" disabled={loading}>
                {loading ? 'Creating account...' : 'Create Account'}
              </button>
            </form>

            {socialReady && (<>
            <div className="auth-divider">
              <span>{validInvite || code.trim() ? 'or join with' : 'or continue with'}</span>
            </div>

            <div className="oauth-buttons">
              <button type="button" className="oauth-btn google" onClick={() => social('google')} disabled={loading}>
                <svg viewBox="0 0 24 24" width="20" height="20">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                <span>Google</span>
              </button>

              <button type="button" className="oauth-btn microsoft" onClick={() => social('microsoft')} disabled={loading}>
                <svg viewBox="0 0 24 24" width="20" height="20">
                  <path fill="#F25022" d="M1 1h10v10H1z"/>
                  <path fill="#00A4EF" d="M1 13h10v10H1z"/>
                  <path fill="#7FBA00" d="M13 1h10v10H13z"/>
                  <path fill="#FFB900" d="M13 13h10v10H13z"/>
                </svg>
                <span>Microsoft</span>
              </button>
            </div>
            </>)}
          </>
        )}

        <div className="auth-footer">
          <p>Already have an account? <Link to="/login">Sign in</Link></p>
        </div>
      </div>
    </div>
  );
}

export default RegisterPage;
