// Settings → Connected apps: apps the user signed in to with their RPM account through the hosted
// MCP connector (Wavecode, Claude, ChatGPT…). Disconnecting revokes the grant at once.
import { useContext, useEffect, useState } from 'react';
import { Plug } from 'lucide-react';
import { AuthContext } from '../../App';
import { useToast } from '../ToastProvider';
import { SCOPE_LABELS } from '../../pages/OAuthConsentPage';

const day = (iso) => (iso ? new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : 'never');
const scopeText = (s) => String(s || '').split(' ').map((x) => SCOPE_LABELS[x]?.title || x).join(' · ');

export default function ConnectedApps() {
  const { api } = useContext(AuthContext);
  const { showToast } = useToast();
  const [grants, setGrants] = useState(null);
  const load = () => api.getOauthGrants().then((d) => setGrants(d.grants || [])).catch(() => setGrants([]));
  useEffect(() => { load(); }, []);   // eslint-disable-line react-hooks/exhaustive-deps

  const disconnect = async (g) => {
    if (!window.confirm(`Disconnect ${g.app}? It loses access to your RPM at once.`)) return;
    const ok = await api.revokeOauthGrant(g.id).then(() => true).catch(() => false);
    showToast(ok ? `Disconnected ${g.app}` : 'Could not disconnect', ok ? 'info' : 'error');
    load();
  };

  return (
    <>
      <div className="settings-section-head">
        <span className="ui-icon-badge settings-section-badge" aria-hidden="true"><Plug size={20} /></span>
        <div className="settings-section-text">
          <h2>Connected apps</h2>
          <p>Apps you signed in to with your RPM account — for example Wavecode or Claude. Each sees only what you allowed.</p>
        </div>
      </div>
      {grants === null ? null : grants.length === 0 ? (
        <div className="ui-empty"><Plug size={22} /><p>No apps connected.</p></div>
      ) : (
        <div className="settings-mem-list">
          {grants.map((g) => (
            <div key={g.id} className="settings-mem-item">
              <span className="ui-chip settings-mem-kind">{scopeText(g.scope)}</span>
              <span className="settings-mem-text"><strong>{g.app}</strong> · since {day(g.created_at)} · last used {day(g.last_used_at)}</span>
              <button type="button" className="btn btn-secondary" onClick={() => disconnect(g)}>Disconnect</button>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
