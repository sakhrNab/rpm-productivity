import { useLayoutEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Send, Globe, Sparkles, ChevronDown, ChevronRight, Zap, Wand2, Check, X, ExternalLink, Info,
  Mic, Volume2, VolumeX, Radio, Square, Paperclip, FileText, Loader2, GanttChart, MessageCircle,
  Target, TrendingUp, CalendarDays, ListChecks,
} from 'lucide-react';
import Markdown from '../Markdown';
import UsageBadge from '../UsageBadge';
import { sttSupported, ttsSupported } from '../../utils/speech';
import './JarvisChat.css';

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
    find_actions: r?.count != null ? `Looked up actions (${r.count})` : 'Looking up actions',
    web_search: t.done ? (r?.results != null ? `Searched the web (${r.results} results)` : 'Searched the web') : 'Searching the web…',
    remember: r?.content ? `Remembered: “${r.content}”` : 'Saving to memory',
    forget: 'Forgot a memory',
  }[t.name] || t.name;
  return failed ? `${base} — failed` : base;
}

const fmtSize = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
const fmtChars = (n) => (n >= 1000 ? `${Math.round(n / 1000)}k chars` : `${n} chars`);
// Empty-state starters: clicking one only fills the composer (never sends).
const STARTERS = [
  { icon: CalendarDays, text: 'Plan my week for my top key result.' },
  { icon: TrendingUp, text: 'Which of my goals are slipping, and what should I do about it today?' },
  { icon: ListChecks, text: 'What should my must-win be today?' },
  { icon: Target, text: 'Break my next project milestone into concrete actions.' },
];

// A file chip on a user message (name + size; the text itself stays on the server).
function FileChips({ files }) {
  if (!Array.isArray(files) || !files.length) return null;
  return (
    <div className="asst-files">
      {files.map((f, i) => (
        <span key={i} className="asst-file" title={f.truncated ? 'Long file — only the first part was read' : f.name}>
          <FileText size={13} /> <span className="asst-file-name">{f.name}</span>
          {f.chars ? <i>{fmtChars(f.chars)}{f.truncated ? ' · first part' : ''}</i> : null}
        </span>
      ))}
    </div>
  );
}

// The Jarvis chat pane (Coach hub main area). All state comes from useJarvis() — `j`.
export default function JarvisChat({ j }) {
  const {
    models, modelKey, setModelKey, selectedModel, configuredProviders, noModels,
    modelMenuOpen, setModelMenuOpen, openFamilies, setOpenFamilies, pickerRef,
    rpmMode, setRpmMode, autoMode, setAutoMode, webSearch, setWebSearch,
    messages, input, setInput, streaming, send, stop, onKeyDown, applyStarter, inputRef, scrollRef,
    approveProposal, dismissProposal,
    attach, setAttach, chooseFile, planIt, askAboutIt, fileInputRef,
    listening, speaking, speakReplies, convMode, startVoice, stopVoice, toggleConv, toggleSpeak, stopSpeaking,
  } = j;

  // Coming back from a coach: land on the newest message.
  useLayoutEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // The message box grows with what you type (up to ~5 lines), then scrolls.
  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight + 2, 132)}px`;
  }, [input, inputRef]);

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
            <div className="asst-proposals-head">
              <Wand2 size={13} /> Suggested changes — approve what you want
              {proposals.some(({ t }) => !t.status) && <span className="asst-proposals-count">{proposals.filter(({ t }) => !t.status).length} pending</span>}
            </div>
            {proposals.map(({ t, ti }) => {
              const link = (t.applied && t.applied.link) || t.result.link;
              return (
                <div key={ti} className={`asst-proposal ${t.status || ''}`}>
                  <span className="asst-proposal-label">{t.result.label || t.name}</span>
                  {(!t.status) && (
                    <span className="asst-proposal-actions">
                      <button className="asst-prop-approve" onClick={() => approveProposal(mi, ti, t)}><Check size={14} /> Approve</button>
                      <button className="asst-prop-dismiss" onClick={() => dismissProposal(mi, ti)}><X size={14} /> Dismiss</button>
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
    <>
      <header className="asst-topbar">
        <div className="asst-model-picker" ref={pickerRef}>
          <button className={`asst-model-btn ${modelMenuOpen ? 'open' : ''}`} onClick={() => setModelMenuOpen(o => !o)} aria-haspopup="listbox" aria-expanded={modelMenuOpen}>
            <Sparkles size={15} />
            <span className="asst-model-btn-label">{selectedModel ? selectedModel.label : 'Select model'}</span>
            {selectedModel && <span className="asst-model-btn-prov">{PROVIDER_LABEL[selectedModel.provider] || selectedModel.provider}</span>}
            <ChevronDown size={14} className="asst-model-chev" />
          </button>
          {modelMenuOpen && (
            <div className="asst-model-menu" role="listbox" aria-label="Model" onMouseLeave={() => setModelMenuOpen(false)}>
              <div className="asst-model-menu-head">Choose a model</div>
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
                            <button key={m.key} role="option" aria-selected={m.key === modelKey} className={`asst-model-item asst-model-sub ${m.key === modelKey ? 'active' : ''}`} disabled={!configured}
                              onClick={() => { setModelKey(m.key); setModelMenuOpen(false); }}>
                              <span className="asst-model-item-label">{m.label}</span>
                              {m.webSearch && <Globe size={12} className="asst-model-web" aria-label="Web search" />}
                              {m.key === modelKey && <Check size={14} className="asst-model-check" />}
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
          <button className={`asst-websearch ${rpmMode ? 'on' : ''}`} onClick={() => setRpmMode(v => !v)} aria-pressed={rpmMode} aria-label={`RPM mode ${rpmMode ? 'on' : 'off'}`}
            title="RPM mode: the assistant sees your projects, key results and actions — and can act on them">
            <Sparkles size={15} /> <span className="asst-tog-label">RPM {rpmMode ? 'on' : 'off'}</span><i className="asst-tog-dot" />
          </button>
          <button className={`asst-websearch ${autoMode ? 'on' : ''}`} disabled={!rpmMode} onClick={() => setAutoMode(v => !v)} aria-pressed={autoMode} aria-label={autoMode ? 'Auto mode on' : 'Ask first mode'}
            title={autoMode ? 'Auto: changes apply immediately' : 'Ask first: changes are suggested for your approval'}>
            <Wand2 size={15} /> <span className="asst-tog-label">{autoMode ? 'Auto' : 'Ask first'}</span><i className="asst-tog-dot" />
          </button>
          <button className={`asst-websearch ${webSearch ? 'on' : ''}`} disabled={!selectedModel?.webSearch} onClick={() => setWebSearch(v => !v)} aria-pressed={webSearch} aria-label={`Web search ${webSearch ? 'on' : 'off'}`}
            title={selectedModel?.webSearch ? 'Toggle web search' : 'This model has no web search'}>
            <Globe size={15} /> <span className="asst-tog-label">Web {webSearch ? 'on' : 'off'}</span><i className="asst-tog-dot" />
          </button>
        </div>
        {selectedModel && !selectedModel.webSearch && (
          <div className="asst-ws-hint"><Info size={12} /> {selectedModel.label} has no web search — pick a model with the <Globe size={11} /> icon to use it.</div>
        )}
      </header>

      <div className="asst-messages" ref={scrollRef}>
        {noModels && (
          <div className="asst-empty">
            <span className="ui-icon-badge asst-empty-badge"><Sparkles size={26} /></span>
            <h2 className="asst-empty-title">No models available yet</h2>
            <p>Add an API key for at least one provider to start chatting.</p>
            <Link to="/settings" className="btn btn-primary">Add API keys</Link>
          </div>
        )}
        {!noModels && messages.length === 0 && (
          <div className="asst-empty asst-welcome">
            <span className="ui-icon-badge asst-empty-badge"><Sparkles size={26} /></span>
            <p className="ui-kicker">Jarvis · {selectedModel ? selectedModel.label : 'Assistant'} · {rpmMode ? (autoMode ? 'RPM · auto' : 'RPM · ask first') : 'general chat'}</p>
            <h2 className="asst-empty-title ui-title-grad">Ask anything</h2>
            <p>In RPM mode I can see your projects and suggest or make changes. Start with one of these, or ask your own.</p>
            <div className="asst-starters">
              {STARTERS.map(({ icon: Icon, text }) => (
                <button key={text} type="button" className="asst-starter" onClick={() => applyStarter(text)} title="Put this in the message box">
                  <Icon size={15} /> <span>{text}</span>
                </button>
              ))}
            </div>
            <span className="asst-empty-hint"><Paperclip size={12} /> Drop a file anywhere here to plan it or ask about it</span>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`asst-msg ${m.role}`}>
            <div className="asst-msg-role">
              {m.role === 'assistant' && <span className="asst-avatar" aria-hidden="true"><Sparkles size={13} /></span>}
              {m.role === 'user' ? 'You' : (selectedModel?.label || 'Assistant')}
            </div>
            {m.role === 'user' && <FileChips files={m.attachments} />}
            {renderTools(m, i)}
            <div className="asst-msg-content">
              {m.role === 'assistant'
                ? (m.content ? <Markdown>{m.content}</Markdown> : (streaming && i === messages.length - 1 ? <span className="asst-cursor">▍</span> : null))
                : m.content}
            </div>
            {Array.isArray(m.sources) && m.sources.length > 0 && (
              <div className="asst-sources">
                <span className="asst-sources-label"><Globe size={12} /> Sources</span>
                {m.sources.map((s, k) => (
                  <a key={k} href={s.url} target="_blank" rel="noopener noreferrer" className="asst-source">{s.title || s.url}</a>
                ))}
              </div>
            )}
            {m.role === 'assistant' && m.usage && (
              <div className="asst-usage"><UsageBadge usage={m.usage} /></div>
            )}
          </div>
        ))}
      </div>

      {(sttSupported() || ttsSupported()) && (
        <div className="asst-voicebar">
          {ttsSupported() && (
            <button type="button" className={`asst-voice-toggle ${speakReplies ? 'on' : ''}`} onClick={toggleSpeak} title="Read replies aloud" aria-pressed={speakReplies}>
              {speakReplies ? <Volume2 size={14} /> : <VolumeX size={14} />} <span className="asst-voice-label">Speak replies</span>
            </button>
          )}
          {sttSupported() && (
            <button type="button" className={`asst-voice-toggle ${convMode ? 'on' : ''}`} onClick={toggleConv} title="Hands-free conversation" aria-pressed={convMode}>
              <Radio size={14} /> <span className="asst-voice-label">Conversation</span>
            </button>
          )}
          {speaking && (
            <button type="button" className="asst-voice-toggle stop" onClick={stopSpeaking}>
              <Square size={12} /> Stop speaking
            </button>
          )}
        </div>
      )}
      {attach && (
        <div className={`asst-attach ${attach.status}`} role="status">
          <span className="asst-attach-file">
            {attach.status === 'reading' ? <Loader2 size={16} className="asst-spin" /> : <FileText size={16} />}
            <span className="asst-attach-name">{attach.file.name}</span>
            <i>{attach.status === 'ready' ? `${fmtChars(attach.data.chars)}${attach.data.truncated ? ' · first part' : ''} · attached to your next message` : attach.status === 'reading' ? 'Reading…' : fmtSize(attach.file.size)}</i>
          </span>
          {attach.status === 'choose' && (
            <span className="asst-attach-actions">
              <button type="button" className="asst-attach-btn plan" onClick={planIt} title="Open the planner: phases, tasks, dependencies, reminders — placed in your projects">
                <GanttChart size={14} /> Plan it
              </button>
              <button type="button" className="asst-attach-btn" onClick={askAboutIt} title="Read it and chat about it here">
                <MessageCircle size={14} /> Ask about it
              </button>
            </span>
          )}
          <button type="button" className="asst-attach-x" onClick={() => setAttach(null)} aria-label="Remove file" disabled={attach.status === 'reading'}><X size={14} /></button>
        </div>
      )}
      <div className="asst-composer">
        <input ref={fileInputRef} type="file" className="asst-file-input" tabIndex={-1} aria-hidden="true"
          onChange={e => { chooseFile(e.target.files?.[0]); e.target.value = ''; }} />
        <button type="button" className="btn asst-clip" onClick={() => fileInputRef.current?.click()} disabled={streaming || attach?.status === 'reading'}
          title="Attach a file — plan it, or ask about it" aria-label="Attach a file">
          <Paperclip size={16} />
        </button>
        <textarea ref={inputRef} className="asst-input"
          aria-label="Message Jarvis"
          placeholder={listening ? 'Listening…' : attach?.status === 'ready' ? 'Ask about the file… or just send' : (selectedModel ? 'Message Jarvis…' : 'Select a model to begin…')}
          value={input} onChange={e => setInput(e.target.value)} onKeyDown={onKeyDown} rows={1}
          disabled={!modelKey || streaming} />
        {sttSupported() && (
          <button
            type="button"
            className={`btn asst-mic ${listening ? 'live' : ''}`}
            onClick={() => (listening ? stopVoice() : startVoice())}
            disabled={streaming || !modelKey}
            title={listening ? 'Stop listening' : 'Speak'}
            aria-label={listening ? 'Stop listening' : 'Speak'}
          >
            <Mic size={16} />
          </button>
        )}
        {streaming ? (
          <button className="btn btn-secondary asst-send asst-stop" onClick={stop} title="Stop generating" aria-label="Stop generating">
            <Square size={14} />
          </button>
        ) : (
          <button className="btn btn-primary asst-send" onClick={() => send()} disabled={(!input.trim() && attach?.status !== 'ready') || !modelKey} aria-label="Send">
            <Send size={16} />
          </button>
        )}
      </div>
    </>
  );
}
