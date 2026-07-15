import { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { AuthContext } from '../App';
import { useToast } from '../components/ToastProvider';
import {
  Send, Globe, Plus, Trash2, MessageSquare, Sparkles, ChevronDown, ChevronRight,
  Settings as SettingsIcon, Zap, Wand2, Check, X, ExternalLink, Info
} from 'lucide-react';
import './AssistantPage.css';

const PROVIDER_LABEL = {
  anthropic: 'Claude', openai: 'OpenAI', zhipu: 'z.ai (GLM)', deepseek: 'DeepSeek',
};

// Label for an executed (auto-mode) tool chip.
function toolLabel(t) {
  const r = t.result;
  const failed = r && r.ok === false;
  const base = {
    list_projects: 'Read your projects',
    create_action: r?.title ? `Created “${r.title}”` : 'Created an action',
    schedule_action: r?.scheduled_date ? `Scheduled → ${String(r.scheduled_date).slice(0, 10)}` : 'Scheduled an action',
    complete_action: r?.is_completed === false ? 'Reopened an action' : 'Completed an action',
    create_rpm_block: r?.result_title ? `Created block “${r.result_title}”` : 'Created an RPM block',
    update_key_result: r?.title ? `Updated “${r.title}” → ${r.current_value}` : 'Updated a key result',
  }[t.name] || t.name;
  return failed ? `${base} — failed` : base;
}

const MD_COMPONENTS = {
  a: ({ node, ...props }) => <a {...props} target="_blank" rel="noopener noreferrer" />,
  table: ({ node, ...props }) => <div className="asst-md-tablewrap"><table {...props} /></div>,
};

function Markdown({ children }) {
  return (
    <div className="asst-md">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={MD_COMPONENTS}>{children}</ReactMarkdown>
    </div>
  );
}

function AssistantPage() {
  const { api } = useContext(AuthContext);
  const { showToast } = useToast();

  const [models, setModels] = useState([]);
  const [providers, setProviders] = useState([]);
  const [modelKey, setModelKey] = useState(localStorage.getItem('ai.modelKey') || '');
  const [webSearch, setWebSearch] = useState(false);
  const [rpmMode, setRpmMode] = useState(() => localStorage.getItem('ai.rpmMode') !== 'off');
  const [autoMode, setAutoMode] = useState(() => localStorage.getItem('ai.autoMode') === 'on');
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const [openFamilies, setOpenFamilies] = useState({});

  const [conversations, setConversations] = useState([]);
  const [conversationId, setConversationId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);

  const scrollRef = useRef(null);

  const configuredProviders = useMemo(
    () => new Set(providers.filter(p => p.configured).map(p => p.provider)),
    [providers]
  );
  const availableModels = useMemo(
    () => models.filter(m => configuredProviders.has(m.provider)),
    [models, configuredProviders]
  );
  const selectedModel = models.find(m => m.key === modelKey) || null;

  useEffect(() => {
    api.getAiModels()
      .then(data => { setModels(data.models || []); setProviders(data.providers || []); })
      .catch(() => showToast('Failed to load AI models', 'error'));
    refreshConversations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!modelKey && availableModels.length) setModelKey(availableModels[0].key);
    if (modelKey && !availableModels.find(m => m.key === modelKey) && availableModels.length) {
      setModelKey(availableModels[0].key);
    }
  }, [availableModels, modelKey]);

  useEffect(() => { if (modelKey) localStorage.setItem('ai.modelKey', modelKey); }, [modelKey]);
  useEffect(() => { localStorage.setItem('ai.rpmMode', rpmMode ? 'on' : 'off'); }, [rpmMode]);
  useEffect(() => { localStorage.setItem('ai.autoMode', autoMode ? 'on' : 'off'); }, [autoMode]);

  useEffect(() => {
    if (selectedModel && !selectedModel.webSearch && webSearch) setWebSearch(false);
  }, [selectedModel, webSearch]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, streaming]);

  const refreshConversations = () => { api.getAiConversations().then(setConversations).catch(() => {}); };

  const openConversation = async (id) => {
    try {
      const conv = await api.getAiConversation(id);
      setConversationId(conv.id);
      setMessages((conv.messages || []).map(m => ({
        role: m.role, content: m.content, sources: m.sources || null,
        tools: Array.isArray(m.tools) ? m.tools : [], dbId: m.id,
      })));
      if (conv.model) setModelKey(conv.model);
    } catch { showToast('Failed to open conversation', 'error'); }
  };

  const newChat = () => { setConversationId(null); setMessages([]); setInput(''); };

  const deleteConversation = async (e, id) => {
    e.stopPropagation();
    if (!window.confirm('Delete this conversation?')) return;
    try {
      await api.deleteAiConversation(id);
      if (id === conversationId) newChat();
      refreshConversations();
    } catch { showToast('Failed to delete', 'error'); }
  };

  // Update one tool entry within a message (immutably). persist=true saves the
  // message's tools to the server so approve/dismiss survive leaving the chat.
  const updateTool = (mi, ti, patch, persist = false) => setMessages(prev => {
    const next = prev.map((m, i) => {
      if (i !== mi) return m;
      const tools = (m.tools || []).map((t, j) => (j === ti ? { ...t, ...patch } : t));
      return { ...m, tools };
    });
    if (persist && next[mi]?.dbId) api.aiSaveMessageTools(next[mi].dbId, next[mi].tools).catch(() => {});
    return next;
  });

  const approveProposal = async (mi, ti, t) => {
    updateTool(mi, ti, { status: 'applying' });
    try {
      const res = await api.aiApplyProposal({ kind: t.result.kind, payload: t.result.payload });
      if (!res || res.error || res.ok === false) throw new Error(res?.error || 'Failed to apply');
      updateTool(mi, ti, { status: 'applied', applied: res }, true);
      showToast('Applied', 'success');
    } catch (e) {
      updateTool(mi, ti, { status: undefined });
      showToast(e.message || 'Failed to apply', 'error');
    }
  };
  const dismissProposal = (mi, ti) => updateTool(mi, ti, { status: 'dismissed' }, true);

  const send = async () => {
    const text = input.trim();
    if (!text || streaming) return;
    if (!modelKey) { showToast('Pick a model first', 'error'); return; }

    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: text }, { role: 'assistant', content: '', sources: null, tools: [] }]);
    setStreaming(true);

    try {
      const res = await api.aiChatStream({ conversationId, modelKey, message: text, webSearch, rpmMode, autoMode });
      if (!res.ok || !res.body) {
        let msg = 'AI request failed';
        try { const j = await res.json(); msg = j.error || msg; } catch { /* ignore */ }
        throw new Error(msg);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let erroredMsg = null;

      const apply = (ev) => {
        if (ev.type === 'meta' && ev.conversationId) setConversationId(ev.conversationId);
        else if (ev.type === 'saved' && ev.messageId) {
          setMessages(prev => {
            const next = [...prev];
            const li = next.length - 1;
            if (next[li] && next[li].role === 'assistant') next[li] = { ...next[li], dbId: ev.messageId };
            return next;
          });
        } else if (ev.type === 'delta') {
          setMessages(prev => {
            const next = [...prev];
            next[next.length - 1] = { ...next[next.length - 1], content: next[next.length - 1].content + ev.text };
            return next;
          });
        } else if (ev.type === 'tool_call') {
          setMessages(prev => {
            const next = [...prev];
            const m = next[next.length - 1];
            next[next.length - 1] = { ...m, tools: [...(m.tools || []), { name: ev.name, args: ev.args, done: false }] };
            return next;
          });
        } else if (ev.type === 'tool_result') {
          setMessages(prev => {
            const next = [...prev];
            const m = next[next.length - 1];
            const tools = [...(m.tools || [])];
            for (let i = tools.length - 1; i >= 0; i--) {
              if (tools[i].name === ev.name && !tools[i].done) {
                tools[i] = { ...tools[i], done: true, result: ev.result };
                break;
              }
            }
            next[next.length - 1] = { ...m, tools };
            return next;
          });
        } else if (ev.type === 'sources') {
          setMessages(prev => {
            const next = [...prev];
            next[next.length - 1] = { ...next[next.length - 1], sources: ev.sources };
            return next;
          });
        } else if (ev.type === 'error') {
          erroredMsg = ev.message || 'AI request failed';
        }
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let sep;
        while ((sep = buffer.indexOf('\n\n')) >= 0) {
          const frame = buffer.slice(0, sep); buffer = buffer.slice(sep + 2);
          const line = frame.split('\n').find(l => l.startsWith('data:'));
          if (!line) continue;
          try { apply(JSON.parse(line.slice(5).trim())); } catch { /* ignore partial */ }
        }
      }

      if (erroredMsg) {
        showToast(erroredMsg, 'error');
        setMessages(prev => {
          const next = [...prev];
          const last = next[next.length - 1];
          if (last && last.role === 'assistant' && !last.content) last.content = `⚠️ ${erroredMsg}`;
          return next;
        });
      }
      refreshConversations();
    } catch (err) {
      showToast(err.message || 'AI request failed', 'error');
      setMessages(prev => {
        const next = [...prev];
        const last = next[next.length - 1];
        if (last && last.role === 'assistant' && !last.content) last.content = `⚠️ ${err.message || 'AI request failed'}`;
        return next;
      });
    } finally {
      setStreaming(false);
    }
  };

  const onKeyDown = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } };

  const noModels = models.length > 0 && availableModels.length === 0;

  // Split a message's tools into executed chips vs approval proposals.
  const renderTools = (m, mi) => {
    const tools = m.tools || [];
    if (!tools.length) return null;
    const chips = [];
    const proposals = [];
    tools.forEach((t, ti) => {
      if (t.result && t.result.proposed) proposals.push({ t, ti });
      else chips.push({ t, ti });
    });
    return (
      <>
        {chips.length > 0 && (
          <div className="asst-tools">
            {chips.map(({ t, ti }) => {
              const link = t.result?.link;
              return (
                <span key={ti} className={`asst-tool ${t.done ? 'done' : 'running'} ${t.result && t.result.ok === false ? 'err' : ''}`}>
                  <Zap size={12} /> {toolLabel(t)}
                  {t.done && link && <Link to={link} className="asst-tool-open">Open <ExternalLink size={11} /></Link>}
                </span>
              );
            })}
          </div>
        )}
        {proposals.length > 0 && (
          <div className="asst-proposals">
            <div className="asst-proposals-head"><Wand2 size={13} /> Suggested changes — approve what you want</div>
            {proposals.map(({ t, ti }) => {
              const link = (t.applied && t.applied.link) || t.result.link;
              return (
                <div key={ti} className={`asst-proposal ${t.status || ''}`}>
                  <span className="asst-proposal-label">{t.result.label || t.name}</span>
                  {(!t.status) && (
                    <span className="asst-proposal-actions">
                      <button className="asst-prop-approve" onClick={() => approveProposal(mi, ti, t)}><Check size={13} /> Approve</button>
                      <button className="asst-prop-dismiss" onClick={() => dismissProposal(mi, ti)}><X size={13} /> Dismiss</button>
                    </span>
                  )}
                  {t.status === 'applying' && <span className="asst-proposal-state">Applying…</span>}
                  {t.status === 'applied' && (
                    <span className="asst-proposal-state done">
                      <Check size={13} /> Added
                      {link && <Link to={link} className="asst-tool-open">Open <ExternalLink size={11} /></Link>}
                    </span>
                  )}
                  {t.status === 'dismissed' && <span className="asst-proposal-state muted">Dismissed</span>}
                </div>
              );
            })}
          </div>
        )}
      </>
    );
  };

  return (
    <div className="asst">
      <aside className="asst-sidebar">
        <button className="btn btn-primary asst-newchat" onClick={newChat}><Plus size={16} /> New chat</button>
        <div className="asst-conv-list">
          {conversations.length === 0 && <div className="asst-conv-empty">No conversations yet.</div>}
          {conversations.map(c => (
            <div key={c.id} className={`asst-conv ${c.id === conversationId ? 'active' : ''}`} onClick={() => openConversation(c.id)}>
              <MessageSquare size={14} />
              <span className="asst-conv-title">{c.title || 'Untitled'}</span>
              <button className="asst-conv-del" onClick={(e) => deleteConversation(e, c.id)} aria-label="Delete"><Trash2 size={13} /></button>
            </div>
          ))}
        </div>
        <Link to="/settings" className="asst-settings-link"><SettingsIcon size={14} /> API keys &amp; settings</Link>
      </aside>

      <section className="asst-main">
        <header className="asst-topbar">
          <div className="asst-model-picker">
            <button className="asst-model-btn" onClick={() => setModelMenuOpen(o => !o)}>
              <Sparkles size={15} />
              <span>{selectedModel ? selectedModel.label : 'Select model'}</span>
              <ChevronDown size={14} />
            </button>
            {modelMenuOpen && (
              <div className="asst-model-menu" onMouseLeave={() => setModelMenuOpen(false)}>
                {['anthropic', 'openai', 'zhipu', 'deepseek'].map(prov => {
                  const provModels = models.filter(m => m.provider === prov);
                  if (!provModels.length) return null;
                  const configured = configuredProviders.has(prov);
                  const families = [...new Set(provModels.map(m => m.family))];
                  return (
                    <div key={prov} className="asst-model-group">
                      <div className="asst-model-group-label">
                        {PROVIDER_LABEL[prov]}
                        {!configured && <span className="asst-nokey">needs key</span>}
                      </div>
                      {families.map(fam => {
                        const famModels = provModels.filter(m => m.family === fam);
                        const famKey = `${prov}/${fam}`;
                        const hasSelected = famModels.some(m => m.key === modelKey);
                        const open = openFamilies[famKey] !== undefined ? openFamilies[famKey] : hasSelected;
                        return (
                          <div key={famKey} className="asst-model-fam">
                            <button
                              className={`asst-model-fam-head ${hasSelected ? 'has-sel' : ''}`}
                              disabled={!configured}
                              onClick={() => setOpenFamilies(o => ({ ...o, [famKey]: !open }))}
                            >
                              {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                              <span className="asst-model-fam-name">{fam}</span>
                              <span className="asst-model-fam-count">{famModels.length}</span>
                            </button>
                            {open && famModels.map(m => (
                              <button key={m.key} className={`asst-model-item asst-model-sub ${m.key === modelKey ? 'active' : ''}`} disabled={!configured}
                                onClick={() => { setModelKey(m.key); setModelMenuOpen(false); }}>
                                {m.label}
                                {m.webSearch && <Globe size={12} className="asst-model-web" />}
                              </button>
                            ))}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="asst-toggles">
            <button className={`asst-websearch ${rpmMode ? 'on' : ''}`} onClick={() => setRpmMode(v => !v)}
              title="RPM mode: the assistant sees your projects, key results and actions — and can act on them">
              <Sparkles size={15} /> RPM {rpmMode ? 'on' : 'off'}
            </button>
            <button className={`asst-websearch ${autoMode ? 'on' : ''}`} disabled={!rpmMode} onClick={() => setAutoMode(v => !v)}
              title={autoMode ? 'Auto: changes apply immediately' : 'Ask first: changes are suggested for your approval'}>
              <Wand2 size={15} /> {autoMode ? 'Auto' : 'Ask first'}
            </button>
            <button className={`asst-websearch ${webSearch ? 'on' : ''}`} disabled={!selectedModel?.webSearch} onClick={() => setWebSearch(v => !v)}
              title={selectedModel?.webSearch ? 'Toggle web search' : 'This model has no web search'}>
              <Globe size={15} /> Web {webSearch ? 'on' : 'off'}
            </button>
          </div>
          {selectedModel && !selectedModel.webSearch && (
            <div className="asst-ws-hint"><Info size={12} /> {selectedModel.label} has no web search — pick a model with the <Globe size={11} /> icon to use it.</div>
          )}
        </header>

        <div className="asst-messages" ref={scrollRef}>
          {noModels && (
            <div className="asst-empty">
              <Sparkles size={28} />
              <h2>No models available yet</h2>
              <p>Add an API key for at least one provider to start chatting.</p>
              <Link to="/settings" className="btn btn-primary">Add API keys</Link>
            </div>
          )}
          {!noModels && messages.length === 0 && (
            <div className="asst-empty">
              <Sparkles size={28} />
              <h2>Ask anything</h2>
              <p>In RPM mode I can see your projects and suggest or make changes. Try “Plan my week for my top key result.”</p>
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} className={`asst-msg ${m.role}`}>
              <div className="asst-msg-role">{m.role === 'user' ? 'You' : (selectedModel?.label || 'Assistant')}</div>
              {renderTools(m, i)}
              <div className="asst-msg-content">
                {m.role === 'assistant'
                  ? (m.content ? <Markdown>{m.content}</Markdown> : (streaming && i === messages.length - 1 ? <span className="asst-cursor">▍</span> : null))
                  : m.content}
              </div>
              {Array.isArray(m.sources) && m.sources.length > 0 && (
                <div className="asst-sources">
                  <span className="asst-sources-label"><Globe size={12} /> Sources</span>
                  {m.sources.map((s, j) => (
                    <a key={j} href={s.url} target="_blank" rel="noopener noreferrer" className="asst-source">{s.title || s.url}</a>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="asst-composer">
          <textarea className="asst-input"
            placeholder={selectedModel ? `Message ${selectedModel.label}…` : 'Select a model to begin…'}
            value={input} onChange={e => setInput(e.target.value)} onKeyDown={onKeyDown} rows={1}
            disabled={!modelKey || streaming} />
          <button className="btn btn-primary asst-send" onClick={send} disabled={!input.trim() || streaming || !modelKey}>
            <Send size={16} />
          </button>
        </div>
      </section>
    </div>
  );
}

export default AssistantPage;
