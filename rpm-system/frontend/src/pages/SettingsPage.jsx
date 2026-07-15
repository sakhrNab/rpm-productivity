import { useContext, useEffect, useState } from 'react';
import { AuthContext } from '../App';
import { useToast } from '../components/ToastProvider';
import { KeyRound, Check, Trash2, ShieldCheck, AlertTriangle, ExternalLink, Sparkles, Globe, Bell, Send, Info, Mail, Smartphone, Plus, Clock } from 'lucide-react';
import { subscribeToPush, unsubscribeFromPush, pushSupported } from '../utils/push';
import './SettingsPage.css';

const PROVIDER_LABEL = { anthropic: 'Claude', openai: 'OpenAI', zhipu: 'z.ai (GLM)', deepseek: 'DeepSeek' };
const DOW_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
function describeReminder(r) {
  if (r.kind === 'daily') return `every day at ${r.remind_time || '09:00'}`;
  if (r.kind === 'weekly') return `${DOW_LABELS[r.remind_dow] || ''} at ${r.remind_time || '09:00'}`;
  if (r.remind_at) { try { return new Date(r.remind_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }); } catch { return 'once'; } }
  return 'once';
}

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
  const [prefs, setPrefs] = useState(null);
  const [savingPrefs, setSavingPrefs] = useState(false);
  const [testing, setTesting] = useState(false);
  const [tgSteps, setTgSteps] = useState(false);
  const [tg, setTg] = useState(null);        // telegram status
  const [botToken, setBotToken] = useState('');
  const [tgBusy, setTgBusy] = useState(false);
  const [tab, setTab] = useState('api');     // 'api' | 'reminders'
  const [pushOn, setPushOn] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [reminders, setReminders] = useState([]);
  const [newRem, setNewRem] = useState({ title: '', kind: 'once', remind_at: '', remind_time: '09:00', remind_dow: 1 });
  const [addingRem, setAddingRem] = useState(false);

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
    api.getNotifPrefs().then(p => {
      // Default the timezone to the browser's on first setup.
      let tz = p.timezone;
      if ((!tz || tz === 'UTC') && !p.last_digest_date) {
        try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch { tz = 'UTC'; }
      }
      setPrefs({ ...p, timezone: tz });
    }).catch(() => {});
    api.telegramStatus().then(setTg).catch(() => {});
    if (pushSupported()) api.pushPublicKey().then(d => setPushOn(!!d.subscribed)).catch(() => {});
    api.getReminders().then(setReminders).catch(() => {});
  };
  const loadTg = () => api.telegramStatus().then(setTg).catch(() => {});
  const loadReminders = () => api.getReminders().then(setReminders).catch(() => {});

  const enablePush = async () => {
    setPushBusy(true);
    try { await subscribeToPush(api); setPushOn(true); showToast('Web push enabled on this device.', 'success'); }
    catch (e) { showToast(e.message || 'Could not enable push', 'error'); }
    finally { setPushBusy(false); }
  };
  const disablePush = async () => {
    setPushBusy(true);
    try { await unsubscribeFromPush(api); setPushOn(false); showToast('Web push disabled on this device.', 'info'); }
    catch { showToast('Failed to disable', 'error'); }
    finally { setPushBusy(false); }
  };
  const addReminder = async () => {
    if (!newRem.title.trim()) return;
    setAddingRem(true);
    try {
      const payload = { title: newRem.title.trim(), kind: newRem.kind, timezone: prefs?.timezone || 'UTC' };
      if (newRem.kind === 'once') payload.remind_at = newRem.remind_at ? new Date(newRem.remind_at).toISOString() : null;
      else { payload.remind_time = newRem.remind_time; if (newRem.kind === 'weekly') payload.remind_dow = Number(newRem.remind_dow); }
      const r = await api.createReminder(payload);
      if (r.error) throw new Error(r.error);
      setNewRem({ title: '', kind: 'once', remind_at: '', remind_time: '09:00', remind_dow: 1 });
      loadReminders();
      showToast('Reminder added', 'success');
    } catch (e) { showToast(e.message || 'Failed to add reminder', 'error'); }
    finally { setAddingRem(false); }
  };
  const removeReminder = async (id) => { await api.deleteReminder(id); loadReminders(); };
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

  const setPref = (patch) => setPrefs(p => ({ ...p, ...patch }));
  const savePrefs = async () => {
    if (!prefs) return;
    setSavingPrefs(true);
    try {
      const saved = await api.saveNotifPrefs({
        email_enabled: prefs.email_enabled, digest_enabled: prefs.digest_enabled,
        digest_time: prefs.digest_time || '08:00', overdue_enabled: prefs.overdue_enabled,
        timezone: prefs.timezone || 'UTC',
      });
      setPrefs(p => ({ ...p, ...saved }));
      showToast('Reminder settings saved', 'success');
    } catch { showToast('Failed to save', 'error'); }
    finally { setSavingPrefs(false); }
  };
  const sendTest = async () => {
    setTesting(true);
    try {
      const r = await api.sendTestDigest();
      if (r.error) throw new Error(r.error);
      showToast('Test digest sent to your email.', 'success');
    } catch (e) { showToast(e.message || 'Failed to send test digest', 'error'); }
    finally { setTesting(false); }
  };

  const saveBot = async () => {
    if (!botToken.trim()) return;
    setTgBusy(true);
    try {
      const r = await api.setTelegramBot(botToken.trim());
      if (r.error) throw new Error(r.error);
      showToast(`Telegram bot connected: @${r.username}`, 'success');
      setBotToken(''); loadTg();
    } catch (e) { showToast(e.message || 'Invalid bot token', 'error'); }
    finally { setTgBusy(false); }
  };
  const removeBot = async () => {
    if (!window.confirm('Remove the Telegram bot? Everyone will be disconnected.')) return;
    await api.removeTelegramBot(); loadTg(); showToast('Telegram bot removed', 'info');
  };
  const connectTg = async () => {
    setTgBusy(true);
    try {
      const r = await api.telegramConnect();
      if (r.error) throw new Error(r.error);
      window.open(r.deepLink, '_blank');
      showToast('Opening Telegram — tap Start, then return here.', 'info');
      setTimeout(loadTg, 5000);
    } catch (e) { showToast(e.message || 'Failed to start connection', 'error'); }
    finally { setTgBusy(false); }
  };
  const disconnectTg = async () => { await api.telegramDisconnect(); loadTg(); showToast('Telegram disconnected', 'info'); };
  const toggleTgReminders = async (on) => {
    setPref({ telegram_enabled: on });
    try { await api.saveNotifPrefs({ telegram_enabled: on }); } catch { showToast('Failed to save', 'error'); }
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

      <div className="settings-tabs">
        <button type="button" className={`settings-tab ${tab === 'api' ? 'active' : ''}`} onClick={() => setTab('api')}>
          <KeyRound size={15} /> API keys
        </button>
        <button type="button" className={`settings-tab ${tab === 'reminders' ? 'active' : ''}`} onClick={() => setTab('reminders')}>
          <Bell size={15} /> Reminders {tg?.connected && <span className="settings-tab-dot" />}
        </button>
      </div>

      {tab === 'api' && (<>
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
      </>)}

      {tab === 'reminders' && prefs && (
        <section className="settings-section settings-reminders">
          <div className="settings-section-head">
            <Bell size={18} />
            <div>
              <h2>Reminders</h2>
              <p>Get a morning digest of your day and overdue tasks. More channels coming.</p>
            </div>
          </div>

          {/* Email */}
          <div className="settings-remind-row">
            <div className="settings-remind-main">
              <Mail size={16} />
              <div>
                <div className="settings-remind-title">Email digest</div>
                <div className="settings-remind-sub">A daily summary to your account email.</div>
              </div>
            </div>
            <label className="settings-switch">
              <input type="checkbox" checked={!!prefs.email_enabled && !!prefs.digest_enabled}
                onChange={e => setPref({ email_enabled: e.target.checked, digest_enabled: e.target.checked })} />
              <span />
            </label>
          </div>

          {prefs.email_enabled && prefs.digest_enabled && (
            <div className="settings-remind-detail">
              <label className="settings-remind-field">
                <span>Send at</span>
                <input type="time" className="form-input settings-time" value={prefs.digest_time || '08:00'}
                  onChange={e => setPref({ digest_time: e.target.value })} />
              </label>
              <label className="settings-remind-field">
                <span>Timezone</span>
                <input type="text" className="form-input settings-tz" value={prefs.timezone || 'UTC'}
                  placeholder="e.g. Europe/Berlin" onChange={e => setPref({ timezone: e.target.value })} />
              </label>
              <label className="settings-remind-check">
                <input type="checkbox" checked={!!prefs.overdue_enabled} onChange={e => setPref({ overdue_enabled: e.target.checked })} />
                Include overdue tasks
              </label>
            </div>
          )}

          {/* Telegram */}
          <div className="settings-remind-row">
            <div className="settings-remind-main">
              <Send size={16} />
              <div>
                <div className="settings-remind-title">
                  Telegram
                  <button type="button" className="settings-info-btn" onClick={() => setTgSteps(v => !v)} aria-label="How to connect Telegram"><Info size={14} /></button>
                  {tg?.connected && <span className="settings-badge ok"><Check size={12} /> Connected</span>}
                  {tg && !tg.botConfigured && <span className="settings-soon">Not set up</span>}
                </div>
                <div className="settings-remind-sub">Instant push + tap “✅ Done” right in chat.</div>
              </div>
            </div>
            {tg?.botConfigured && !tg.connected && (
              <button className="btn btn-primary" onClick={connectTg} disabled={tgBusy}>{tgBusy ? 'Opening…' : 'Connect Telegram'}</button>
            )}
            {tg?.connected && (
              <div className="settings-tg-connected">
                <label className="settings-switch" title="Telegram reminders">
                  <input type="checkbox" checked={!!prefs?.telegram_enabled} onChange={e => toggleTgReminders(e.target.checked)} /><span />
                </label>
                <button className="btn btn-secondary" onClick={disconnectTg}>Disconnect</button>
              </div>
            )}
          </div>

          {/* Owner: set the bot token */}
          {tg && !tg.botConfigured && tg.isOwner && (
            <div className="settings-remind-detail settings-tg-owner">
              <input type="password" className="form-input settings-key-input"
                placeholder="Paste bot token from @BotFather (e.g. 8123…:AAF…)"
                value={botToken} onChange={e => setBotToken(e.target.value)} autoComplete="off" />
              <button className="btn btn-primary" onClick={saveBot} disabled={tgBusy || !botToken.trim()}>{tgBusy ? 'Connecting…' : 'Save bot'}</button>
            </div>
          )}
          {tg && !tg.botConfigured && !tg.isOwner && (
            <div className="settings-remind-sub settings-tg-note">The workspace owner needs to set up the Telegram bot first.</div>
          )}
          {tg?.botConfigured && tg.isOwner && (
            <button type="button" className="settings-tg-remove-link" onClick={removeBot}>Remove bot{tg.botUsername ? ` (@${tg.botUsername})` : ''}</button>
          )}

          {tgSteps && (
            <div className="settings-tg-steps">
              {tg?.isOwner && !tg?.botConfigured ? (
                <>
                  <strong>Create the bot (owner, ~2 min)</strong>
                  <ol>
                    <li>In Telegram, open <b>@BotFather</b> and send <code>/newbot</code>.</li>
                    <li>Pick a name, then a username ending in “bot” (e.g. <code>MyRPMBot</code>).</li>
                    <li>Copy the <b>token</b> it gives you, paste it above, and press <b>Save bot</b>.</li>
                    <li>Then anyone can tap <b>Connect Telegram</b> to link in one tap.</li>
                  </ol>
                </>
              ) : (
                <>
                  <strong>Connect Telegram</strong>
                  <ol>
                    <li>Press <b>Connect Telegram</b> — it opens our bot in the Telegram app.</li>
                    <li>Tap <b>Start</b> in that chat.</li>
                    <li>Come back here — you’ll show as <b>Connected</b>. Toggle reminders on.</li>
                  </ol>
                  <p className="settings-remind-sub">No token needed on your side — the bot is set up by the app.</p>
                </>
              )}
            </div>
          )}

          {/* Web push */}
          <div className="settings-remind-row">
            <div className="settings-remind-main">
              <Smartphone size={16} />
              <div>
                <div className="settings-remind-title">Web push {pushOn && <span className="settings-badge ok"><Check size={12} /> On</span>}</div>
                <div className="settings-remind-sub">Browser notifications (on iPhone, add RPM to your Home Screen first).</div>
              </div>
            </div>
            {pushSupported() ? (
              pushOn
                ? <button className="btn btn-secondary" onClick={disablePush} disabled={pushBusy}>{pushBusy ? '…' : 'Disable'}</button>
                : <button className="btn btn-primary" onClick={enablePush} disabled={pushBusy}>{pushBusy ? 'Enabling…' : 'Enable'}</button>
            ) : <span className="settings-soon">Not supported here</span>}
          </div>

          {/* Custom reminders */}
          <div className="settings-custom-rem">
            <h3 className="settings-subhead"><Clock size={15} /> Your reminders</h3>
            {reminders.length === 0 && <p className="settings-remind-sub">No custom reminders yet.</p>}
            {reminders.map(r => (
              <div key={r.id} className="settings-rem-item">
                <span className="settings-rem-title">{r.title}</span>
                <span className="settings-rem-when">{describeReminder(r)}</span>
                <button className="settings-rem-del" onClick={() => removeReminder(r.id)} aria-label="Delete reminder"><Trash2 size={14} /></button>
              </div>
            ))}
            <div className="settings-rem-form">
              <input className="form-input settings-rem-title-in" placeholder="Remind me to…" value={newRem.title} onChange={e => setNewRem({ ...newRem, title: e.target.value })} />
              <select className="form-input settings-rem-kind" value={newRem.kind} onChange={e => setNewRem({ ...newRem, kind: e.target.value })}>
                <option value="once">Once</option>
                <option value="daily">Every day</option>
                <option value="weekly">Every week</option>
              </select>
              {newRem.kind === 'once'
                ? <input type="datetime-local" className="form-input" value={newRem.remind_at} onChange={e => setNewRem({ ...newRem, remind_at: e.target.value })} />
                : <input type="time" className="form-input settings-time" value={newRem.remind_time} onChange={e => setNewRem({ ...newRem, remind_time: e.target.value })} />}
              {newRem.kind === 'weekly' && (
                <select className="form-input settings-rem-dow" value={newRem.remind_dow} onChange={e => setNewRem({ ...newRem, remind_dow: e.target.value })}>
                  {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d, i) => <option key={i} value={i}>{d}</option>)}
                </select>
              )}
              <button className="btn btn-primary" onClick={addReminder} disabled={addingRem || !newRem.title.trim()}><Plus size={15} /> Add</button>
            </div>
            <p className="settings-remind-sub">Sent via your enabled channels above (email / Telegram / web push).</p>
          </div>

          <div className="settings-remind-actions">
            <button className="btn btn-primary" onClick={savePrefs} disabled={savingPrefs}>{savingPrefs ? 'Saving…' : 'Save reminders'}</button>
            <button className="btn btn-secondary" onClick={sendTest} disabled={testing}>
              <Send size={15} /> {testing ? 'Sending…' : 'Send me a test digest'}
            </button>
          </div>
        </section>
      )}
    </div>
  );
}

export default SettingsPage;
