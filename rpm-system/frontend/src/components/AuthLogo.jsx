// The RPM mark used on the sign-in / sign-up / password pages.
export default function AuthLogo() {
  return (
    <div className="auth-logo">
      <svg viewBox="0 0 100 100" width="60" height="60" aria-hidden="true">
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
  );
}
