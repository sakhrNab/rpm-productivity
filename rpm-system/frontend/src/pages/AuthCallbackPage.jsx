import { useEffect, useContext } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { AuthContext } from '../App';

function AuthCallbackPage() {
  const { handleOAuthCallback } = useContext(AuthContext);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const accessToken = params.get('accessToken');
    const refreshToken = params.get('refreshToken');

    if (accessToken && refreshToken) {
      handleOAuthCallback({ accessToken, refreshToken });
      // Small delay to ensure tokens are stored before redirect
      setTimeout(() => {
        navigate('/', { replace: true });
        // Force reload to get user data
        window.location.reload();
      }, 100);
    } else {
      navigate('/login?error=oauth_failed', { replace: true });
    }
  }, [location, handleOAuthCallback, navigate]);

  return (
    <div className="auth-container">
      <div className="auth-card">
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
          <h1>Completing Sign In...</h1>
          <p>Please wait while we complete your authentication.</p>
        </div>
        <div className="loading" style={{ marginTop: '2rem' }}>
          <div className="spinner"></div>
        </div>
      </div>
    </div>
  );
}

export default AuthCallbackPage;

