import { useContext, useEffect, useState } from 'react';
import { AuthContext } from '../App';
import { useToast } from '../components/ToastProvider';
import { KeyRound, Check, Trash2, ShieldCheck, AlertTriangle, ExternalLink, Sparkles, Globe } from 'lucide-react';
import './SettingsPage.css';

const PROVIDER_LABEL = { anthropic: 'Claude', openai: 'OpenAI', zhipu: 'z.ai (GLM)', deepseek: 'DeepSeek' };

const PROVIDERS = [
  { id: 'anthropic', label: 'Claude (Anthropic)', hint: 'sk-ant-…', url: 'https://console.anthropic.com/settings/keys' },
  { id: 'openai',    label: 'OpenAI',             hint: 'sk-…',     url: 'https://platform.openai.com/api-keys' },
  { id: 'zhipu',     label: 'z.ai (GLM)',         hint: 'z.ai API key', url: 'https://z.ai/model-api' },
  { id: 'deepseek',  label: 'DeepSeek',           hint: 'sk-…',     url: 'https://platform.deepseek.com/api_keys' },
];

function SettingsPage() {
  const { api } = useContext(AuthContext);
  const { showToast } = useToast();
  const [status, setStatus] = useState({});          // provider -> { configured, source, last4 }
  const [storageEnabled, setStorageEnabled] = useState(true);
  const [drafts, setDrafts] = useState({});          // provider -> input value
  const [savingId, setSavingId] = useState(null);
  const [models, setModels] = useState([]);
  const [defaultModel, setDefaultModel] = useState(localStorage.getItem('ai.modelKey') || '');

  const load = () => {
    api.getAiKeys()
      .then(data => {
        const map = {};
        (data.providers || []).forEach(p => { map[p.provider] = p; });
        setStatus(map);
        setStorageEnabled(!!data.storageEnabled);
      })
      .catch(() => showToast('Failed to load key settings', 'error'));
    api.getAiModels().then(d => setModels(d.models || [])).catch(() => {});
  };
  useEffect(load, []); // eslint-disable-line react-hooks/exhaustive-deps

  // If the saved default points to a model that no longer exists, clear it.
  useEffect(() => {
    if (models.length && defaultModel && !models.some(m => m.key === defaultModel)) {
      localStorage.removeItem('ai.modelKey');
      setDefaultModel('');
    }
  }, [models, defaultModel]);

  const configuredProviders = new Set(Object.values(status).filter(p => p.configured).map(p => p.provider));
  const availableModels = models.filter(m => configuredProviders.has(m.provider));
  const chooseDefault = (key) => {
    setDefaultModel(key);
    if (key) { localStorage.setItem('ai.modelKey', key); showToast('Default model set', 'success'); }
  };

  const save = async (provider) => {
    const key = (drafts[provider] || '').trim();
    if (!key) return;
    setSavingId(provider);
    try {
      const res = await api.saveAiKey(provider, key);
      if (res.error) throw new Error(res.error);
      showToast('Key saved securely', 'success');
      setDrafts(d => ({ ...d, [provider]: '' }));
      load();
    } catch (e) {
      showToast(e.message || 'Failed to save key', 'error');
    } finally {
      setSavingId(null);
    }
  };

  const remove = async (provider) => {
    if (!window.confirm(`Remove your ${provider} key?`)) return;
    try {
      await api.deleteAiKey(provider);
      showToast('Key removed', 'success');
      load();
    } catch { showToast('Failed to remove key', 'error'); }
  };

  return (
    <div className="settings-page">
      <div className="page-header">
        <h1 className="page-title">Settings</h1>
      </div>

      <section className="settings-section">
        <div className="settings-section-head">
          <KeyRound size={18} />
          <div>
            <h2>AI provider API keys</h2>
            <p>Bring your own keys. They're encrypted at rest (AES-256-GCM) and never shown again after saving.</p>
          </div>
        </div>

        {!storageEnabled && (
          <div className="settings-warn">
            <AlertTriangle size={16} />
            Key storage isn't enabled on the server yet (the <code>AI_KEYS_SECRET</code> master key is missing).
            You can't save keys until an admin sets it.
          </div>
        )}

        <div className="settings-keys">
          {PROVIDERS.map(p => {
            const st = status[p.id] || {};
            return (
              <div key={p.id} className="settings-key-row">
                <div className="settings-key-info">
                  <div className="settings-key-label">
                    {p.label}
                    {st.configured && (
                      <span className={`settings-badge ${st.source === 'env' ? 'env' : 'ok'}`}>
                        <Check size={12} /> {st.source === 'env' ? 'server default' : `saved ····${st.last4 || ''}`}
                      </span>
                    )}
                  </div>
                  <a className="settings-key-get" href={p.url} target="_blank" rel="noopener noreferrer">
                    Get a key <ExternalLink size={11} />
                  </a>
                </div>
                <div className="settings-key-actions">
                  <input
                    type="password"
                    className="form-input settings-key-input"
                    placeholder={st.configured ? 'Replace key…' : p.hint}
                    value={drafts[p.id] || ''}
                    onChange={e => setDrafts(d => ({ ...d, [p.id]: e.target.value }))}
                    autoComplete="off"
                    disabled={!storageEnabled}
                  />
                  <button
                    className="btn btn-primary settings-key-save"
                    onClick={() => save(p.id)}
                    disabled={!storageEnabled || !((drafts[p.id] || '').trim()) || savingId === p.id}
                  >
                    {savingId === p.id ? 'Saving…' : 'Save'}
                  </button>
                  {st.configured && st.source === 'user' && (
                    <button className="btn btn-icon btn-secondary settings-key-del" onClick={() => remove(p.id)} aria-label="Remove key">
                      <Trash2 size={15} />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="settings-note">
          <ShieldCheck size={15} />
          Keys are stored encrypted and only decrypted server-side to make requests. We show only the last 4 characters.
        </div>
      </section>

      {availableModels.length > 0 && (
        <section className="settings-section settings-default-model">
          <div className="settings-section-head">
            <Sparkles size={18} />
            <div>
              <h2>Default AI model</h2>
              <p>The model the Assistant opens with. Change it any time from the Assistant too.</p>
            </div>
          </div>
          <select
            className="form-input settings-model-select"
            value={availableModels.some(m => m.key === defaultModel) ? defaultModel : ''}
            onChange={e => chooseDefault(e.target.value)}
          >
            <option value="" disabled>Choose a default model…</option>
            {['anthropic', 'openai', 'zhipu', 'deepseek'].map(prov => {
              const provModels = availableModels.filter(m => m.provider === prov);
              if (!provModels.length) return null;
              return (
                <optgroup key={prov} label={PROVIDER_LABEL[prov]}>
                  {provModels.map(m => (
                    <option key={m.key} value={m.key}>{m.label}{m.webSearch ? '  🌐' : ''}</option>
                  ))}
                </optgroup>
              );
            })}
          </select>
          <div className="settings-note">
            <Globe size={14} /> Models marked 🌐 support web search. If you pick one without it, the Assistant will tell you and the web-search toggle stays off for that model.
          </div>
        </section>
      )}
    </div>
  );
}

export default SettingsPage;
