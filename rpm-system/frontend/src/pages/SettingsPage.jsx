import { useContext, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AuthContext } from '../App';
import { useToast } from '../components/ToastProvider';
import { KeyRound, Check, Trash2, ShieldCheck, AlertTriangle, ExternalLink, Sparkles, Globe, Bell, Send, Info, Mail, Smartphone, Plus, Clock, BarChart3, Compass, Brain, Pin, SlidersHorizontal } from 'lucide-react';
import Picker from '../components/Picker';
import { subscribeToPush, unsubscribeFromPush, pushSupported } from '../utils/push';
import UsageDashboard from '../components/UsageDashboard';
import './SettingsPage.css';

const PROVIDER_LABEL = { anthropic: 'Claude', openai: 'OpenAI', zhipu: 'z.ai (GLM)', deepseek: 'DeepSeek' };
const DOW_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
function describeReminder(r) {
  if (r.kind === 'daily') return `every day at ${r.remind_time || '09:00'}`;
  if (r.kind === 'weekly') return `${DOW_LABELS[r.remind_dow] || ''} at ${r.remind_time || '09:00'}`;
  if (r.remind_at) { try { return new Date(r.remind_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }); } catch { return 'once'; } }
  return 'once';
}

// Section header shared by every card: icon badge · sentence-case title · one-line explainer (+ optional right slot).
function SectionHead({ icon, title, children, aside }) {
  return (
    <div className="settings-section-head">
      <span className="ui-icon-badge settings-section-badge" aria-hidden="true">{icon}</span>
      <div className="settings-section-text">
        <h2>{title}</h2>
        <p>{children}</p>
      </div>
      {aside}
    </div>
  );
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
  const [memories, setMemories] = useState([]);
  const [newMemory, setNewMemory] = useState('');

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
      api.saveDefaultModel(null).catch(() => {});
    }
  }, [models, defaultModel]);

  const configuredProviders = new Set(Object.values(status).filter(p => p.configured).map(p => p.provider));
  const availableModels = models.filter(m => configuredProviders.has(m.provider));
  const chooseDefault = (key) => {
    setDefaultModel(key);
    if (key) { localStorage.setItem('ai.modelKey', key); showToast('Default model set', 'success'); }
    // Also save it server-side so scheduled coach check-ins can use it (fire-and-forget).
    api.saveDefaultModel(key || null).catch(() => {});
  };

  const setPref = (patch) => setPrefs(p => ({ ...p, ...patch }));
  const savePrefs = async () => {
    if (!prefs) return;
    setSavingPrefs(true);
    try {
      const saved = await api.saveNotifPrefs({
        email_enabled: prefs.email_enabled, digest_enabled: prefs.digest_enabled,
        digest_time: prefs.digest_time || '08:00', overdue_enabled: prefs.overdue_enabled,
        task_time_enabled: prefs.task_time_enabled, chief_enabled: prefs.chief_enabled,
        chief_time: prefs.chief_time || '07:30', timezone: prefs.timezone || 'UTC',
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
  const [testingChief, setTestingChief] = useState(false);
  const sendChiefTest = async () => {
    setTestingChief(true);
    try {
      const r = await api.sendTestChief();
      if (r.error) throw new Error(r.error);
      showToast('Chief of Staff briefing sent to your enabled channels.', 'success');
    } catch (e) { showToast(e.message || 'Failed to send briefing', 'error'); }
    finally { setTestingChief(false); }
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

  const loadMemories = () => api.getAiMemory().then(m => setMemories(Array.isArray(m) ? m : [])).catch(() => {});
  useEffect(() => { loadMemories(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const addMemory = async () => {
    const content = newMemory.trim();
    if (!content) return;
    const r = await api.addAiMemory({ content }).catch(() => null);
    if (!r || r.error) { showToast(r?.error || 'Failed to save', 'error'); return; }
    setNewMemory(''); loadMemories();
  };
  const forgetMemory = async (id) => { await api.deleteAiMemory(id).catch(() => {}); loadMemories(); };
  const togglePin = async (m) => { await api.updateAiMemory(m.id, { pinned: !m.pinned }).catch(() => {}); loadMemories(); };

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
      <header className="ui-card settings-hero">
        <span className="ui-icon-badge settings-hero-icon" aria-hidden="true"><SlidersHorizontal size={22} /></span>
        <div className="settings-hero-text">
          <p className="ui-kicker">Control room</p>
          <h1 className="settings-title"><span className="ui-title-grad">Settings</span></h1>
          <p className="settings-sub">Your AI keys and default model, what the Assistant remembers, how RPM nudges you — and what it all costs.</p>
        </div>
      </header>

      <div className="ui-seg settings-seg" role="tablist" aria-label="Settings sections">
        <button type="button" role="tab" aria-selected={tab === 'api'} className={tab === 'api' ? 'on' : ''} onClick={() => setTab('api')}>
          <KeyRound size={15} /> API keys
        </button>
        <button type="button" role="tab" aria-selected={tab === 'memory'} className={tab === 'memory' ? 'on' : ''} onClick={() => setTab('memory')}>
          <Brain size={15} /> Memory {memories.length > 0 && <span className="settings-seg-n">{memories.length}</span>}
        </button>
        <button type="button" role="tab" aria-selected={tab === 'reminders'} className={tab === 'reminders' ? 'on' : ''} onClick={() => setTab('reminders')}>
          <Bell size={15} /> Reminders {tg?.connected && <span className="settings-tab-dot" title="Telegram connected" />}
        </button>
        <button type="button" role="tab" aria-selected={tab === 'usage'} className={tab === 'usage' ? 'on' : ''} onClick={() => setTab('usage')}>
          <BarChart3 size={15} /> Usage
        </button>
      </div>

      {tab === 'usage' && (
        <section className="ui-card settings-section">
          <UsageDashboard />
        </section>
      )}

      {tab === 'api' && (<>
      <section className="ui-card settings-section">
        <SectionHead icon={<KeyRound size={20} />} title="AI provider API keys">
          Bring your own keys. They're encrypted at rest (AES-256-GCM) and never shown again after saving.
        </SectionHead>

        {!storageEnabled && (
          <div className="settings-warn" role="alert">
            <AlertTriangle size={16} />
            <span>Key storage isn't enabled on the server yet (the <code>AI_KEYS_SECRET</code> master key is missing).
            You can't save keys until an admin sets it.</span>
          </div>
        )}

        <div className="settings-keys">
          {PROVIDERS.map(p => {
            const st = status[p.id] || {};
            return (
              <div key={p.id} className={`settings-key-row ${st.configured ? 'is-set' : ''}`}>
                <div className="settings-key-info">
                  <div className="settings-key-label">
                    <span className="settings-key-name">{p.label}</span>
                    {st.configured
                      ? (
                        <span className={`ui-chip ${st.source === 'env' ? 'ui-chip--info' : 'ui-chip--good'}`}>
                          <Check size={12} /> {st.source === 'env' ? 'server default' : <>saved <span className="settings-mono">····{st.last4 || ''}</span></>}
                        </span>
                      )
                      : <span className="ui-chip">not set</span>}
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
                    aria-label={`${p.label} API key`}
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
                    <button className="btn btn-icon btn-secondary settings-key-del" onClick={() => remove(p.id)} aria-label={`Remove ${p.label} key`} title="Remove key">
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
          <span>Keys are stored encrypted and only decrypted server-side to make requests. We show only the last 4 characters.</span>
        </div>
      </section>

      {availableModels.length > 0 && (
        <section className="ui-card settings-section settings-default-model">
          <SectionHead icon={<Sparkles size={20} />} title="Default AI model">
            The model the Assistant opens with. Change it any time from the Assistant too.
          </SectionHead>
          <Picker
            className="settings-model-select"
            value={availableModels.some(m => m.key === defaultModel) ? defaultModel : ''}
            onChange={chooseDefault}
            placeholder="Choose a default model…"
            header="Default model"
            options={['anthropic', 'openai', 'zhipu', 'deepseek'].flatMap(prov =>
              availableModels.filter(m => m.provider === prov).map(m => ({
                value: m.key, label: m.label, group: PROVIDER_LABEL[prov], hint: m.webSearch ? '🌐' : undefined,
              })))}
          />
          <div className="settings-note">
            <Globe size={14} /> <span>Models marked 🌐 support web search. If you pick one without it, the Assistant will tell you and the web-search toggle stays off for that model.</span>
          </div>
        </section>
      )}
      </>)}

      {tab === 'memory' && (
      <section className="ui-card settings-section settings-memory">
        <SectionHead icon={<Brain size={20} />} title="Assistant memory"
          aside={memories.length > 0 ? <span className="ui-chip settings-section-count">{memories.length} remembered</span> : null}>
          What the Assistant and voice orb remember about you across conversations. It saves things you tell it
          (“remember I prefer mornings for deep work”); you can add, pin or delete them here.
        </SectionHead>
        <div className="settings-mem-form">
          <input className="form-input" placeholder="Add something it should know about you…" aria-label="Add a memory" value={newMemory}
            maxLength={300} onChange={e => setNewMemory(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addMemory(); }} />
          <button type="button" className="btn btn-primary" onClick={addMemory} disabled={!newMemory.trim()}><Plus size={15} /> Remember</button>
        </div>
        <div className="settings-mem-list">
          {memories.length === 0 && (
            <div className="ui-empty settings-mem-empty"><Brain size={24} /><p>Nothing remembered yet. Tell the Assistant a preference, or add one above.</p></div>
          )}
          {memories.map(m => (
            <div key={m.id} className={`settings-mem-item ${m.pinned ? 'pinned' : ''}`}>
              <span className="ui-chip ui-chip--good settings-mem-kind">{m.kind}</span>
              <span className="settings-mem-text">{m.content}</span>
              <button type="button" className="settings-mem-btn" onClick={() => togglePin(m)} title={m.pinned ? 'Unpin' : 'Pin (always kept)'} aria-label={m.pinned ? 'Unpin memory' : 'Pin memory'} aria-pressed={!!m.pinned}>
                <Pin size={15} />
              </button>
              <button type="button" className="settings-mem-btn del" onClick={() => forgetMemory(m.id)} title="Forget" aria-label="Forget memory">
                <Trash2 size={15} />
              </button>
            </div>
          ))}
        </div>
      </section>
      )}

      {tab === 'reminders' && prefs && (
        <section className="ui-card settings-section settings-reminders">
          <SectionHead icon={<Bell size={20} />} title="Reminders &amp; channels">
            Get a morning digest of your day and overdue tasks, and pick where each nudge lands.
          </SectionHead>

          <p className="ui-kicker settings-group-kicker">Briefings</p>

          {/* Chief of Staff — proactive briefing */}
          <div className="settings-remind-row settings-chief-row">
            <div className="settings-remind-main">
              <span className="settings-row-ico" aria-hidden="true"><Compass size={17} /></span>
              <div>
                <div className="settings-remind-title">Chief of Staff briefing</div>
                <div className="settings-remind-sub">Each morning it messages you first — your plan plus which goals are slipping and the fix — on your enabled channels (email / Telegram / web push).</div>
              </div>
            </div>
            <label className="settings-switch">
              <input type="checkbox" role="switch" aria-label="Chief of Staff briefing" checked={!!prefs.chief_enabled} onChange={e => setPref({ chief_enabled: e.target.checked })} />
              <span />
            </label>
          </div>
          {prefs.chief_enabled && (
            <div className="settings-remind-detail">
              <label className="settings-remind-check">
                Send at
                <input type="time" className="form-input settings-time" value={prefs.chief_time || '07:30'} onChange={e => setPref({ chief_time: e.target.value })} />
              </label>
              <button type="button" className="btn btn-secondary" onClick={sendChiefTest} disabled={testingChief}>
                <Send size={15} /> {testingChief ? 'Sending…' : 'Send me a test briefing now'}
              </button>
            </div>
          )}

          {/* Email */}
          <div className="settings-remind-row">
            <div className="settings-remind-main">
              <span className="settings-row-ico" aria-hidden="true"><Mail size={17} /></span>
              <div>
                <div className="settings-remind-title">Email digest</div>
                <div className="settings-remind-sub">A daily summary to your account email.</div>
              </div>
            </div>
            <label className="settings-switch">
              <input type="checkbox" role="switch" aria-label="Email digest" checked={!!prefs.email_enabled && !!prefs.digest_enabled}
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

          {/* Per-task reminders (fires on whichever channels are enabled) */}
          <div className="settings-remind-row">
            <div className="settings-remind-main">
              <span className="settings-row-ico" aria-hidden="true"><Clock size={17} /></span>
              <div>
                <div className="settings-remind-title">Remind me at each task's time</div>
                <div className="settings-remind-sub">When a task has a scheduled time, get a nudge when it's due — on your enabled channels (email, Telegram, web push).</div>
              </div>
            </div>
            <label className="settings-switch">
              <input type="checkbox" role="switch" aria-label="Remind me at each task's time" checked={!!prefs.task_time_enabled} onChange={e => setPref({ task_time_enabled: e.target.checked })} />
              <span />
            </label>
          </div>

          <p className="ui-kicker settings-group-kicker">Channels</p>
          {/* Telegram */}
          <div className="settings-remind-row">
            <div className="settings-remind-main">
              <span className="settings-row-ico" aria-hidden="true"><Send size={17} /></span>
              <div>
                <div className="settings-remind-title">
                  Telegram
                  <button type="button" className="settings-info-btn" onClick={() => setTgSteps(v => !v)} aria-label="How to connect Telegram"><Info size={14} /></button>
                  {tg?.connected && <span className="ui-chip ui-chip--good"><Check size={12} /> Connected</span>}
                  {tg && !tg.botConfigured && <span className="ui-chip ui-chip--warn">Not set up</span>}
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
                  <input type="checkbox" role="switch" aria-label="Telegram reminders" checked={!!prefs?.telegram_enabled} onChange={e => toggleTgReminders(e.target.checked)} /><span />
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
              <span className="settings-row-ico" aria-hidden="true"><Smartphone size={17} /></span>
              <div>
                <div className="settings-remind-title">Web push {pushOn && <span className="ui-chip ui-chip--good"><Check size={12} /> On</span>}</div>
                <div className="settings-remind-sub">Browser notifications (on iPhone, add RPM to your Home Screen first).</div>
              </div>
            </div>
            {pushSupported() ? (
              pushOn
                ? <button className="btn btn-secondary" onClick={disablePush} disabled={pushBusy}>{pushBusy ? '…' : 'Disable'}</button>
                : <button className="btn btn-primary" onClick={enablePush} disabled={pushBusy}>{pushBusy ? 'Enabling…' : 'Enable'}</button>
            ) : <span className="ui-chip ui-chip--warn">Not supported here</span>}
          </div>

          {/* Custom reminders live on their own page now */}
          <div className="settings-custom-rem">
            <h3 className="settings-subhead"><Clock size={15} /> Your reminders</h3>
            <p className="settings-remind-sub">
              Your one-off and recurring reminders now live on their own page — and you can set a reminder
              straight from any task with the <Bell size={12} style={{ verticalAlign: '-2px' }} /> bell in My Day or My Week.
            </p>
            <Link to="/reminders" className="btn btn-secondary settings-rem-link"><Bell size={15} /> Manage reminders</Link>
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
