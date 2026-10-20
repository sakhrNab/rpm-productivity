// /oauth/authorize — "Allow <app> to use your RPM?" The backend's authorization endpoint judges the
// request and sends the browser here; this page asks the backend to judge it again (it is the one
// that knows the registered clients), shows exactly what was asked, and posts the decision with the
// signed-in session's JWT. The backend answers with where to send the browser (code or denial).
import { useContext, useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';
import { AuthContext } from '../App';

export const SCOPE_LABELS = {
  'mcp:read': { title: 'Read', body: 'See your outcomes, actions, RPM blocks, key results, forecast and Business area.' },
  'mcp:write': { title: 'Plan and update', body: 'Add, edit, complete and delete actions; create outcomes, blocks and key results; save Business rows.' },
};

export default function OAuthConsentPage() {
  const { api, user } = useContext(AuthContext);
  const location = useLocation();
  const params = useMemo(() => Object.fromEntries(new URLSearchParams(location.search)), [location.search]);
  const [req, setReq] = useState(null);
  const [error, setError] = useState('');
  const [granted, setGranted] = useState([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.getOauthRequest(params).then((r) => { setReq(r); setGranted(r.scopes); }).catch((e) => setError(e.message || 'This request is not valid.'));
  }, [params]);   // eslint-disable-line react-hooks/exhaustive-deps

  const decide = async (decision) => {
    setBusy(true);
    try {
      const { redirect } = await api.oauthConsent({ request: params, decision, granted });
      window.location.assign(redirect);
    } catch (e) { setError(e.message || 'Something went wrong'); setBusy(false); }
  };

  return (
    <div className="auth-container">
      <div className="auth-card ui-card" style={{ maxWidth: 480 }}>
        {error ? (
          <><h1 className="auth-title">Can’t connect this app</h1><p className="auth-subtitle">{error}</p></>
        ) : !req ? (
          <div className="spinner" />
        ) : (
          <>
            <ShieldCheck size={28} aria-hidden="true" />
            <h1 className="auth-title">Allow {req.clientName} to use RPM?</h1>
            <p className="auth-subtitle">It will act as <strong>{user?.email}</strong>, only with what you tick below, and returns to <strong>{req.redirectHost}</strong>.</p>
            <div role="group" aria-label="What this app may do" style={{ display: 'grid', gap: 10, margin: '16px 0' }}>
              {req.scopes.map((s) => (
                <label key={s} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <input type="checkbox" checked={granted.includes(s)} onChange={(e) => setGranted((g) => (e.target.checked ? [...new Set([...g, s])] : g.filter((x) => x !== s)))} />
                  <span><strong>{SCOPE_LABELS[s]?.title || s}</strong><br /><small>{SCOPE_LABELS[s]?.body}</small></span>
                </label>
              ))}
            </div>
            <p className="auth-subtitle"><small>It can never use your AI keys, send messages, or change your settings. You can disconnect it any time in Settings → API keys → Connected apps.</small></p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => decide('deny')}>Cancel</button>
              <button type="button" className="btn btn-primary" disabled={busy || !granted.length} onClick={() => decide('allow')}>Allow</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
