import { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../../App';
import { useToast } from '../ToastProvider';
import { sttSupported, startListening, stopListening, speak, cancelSpeak } from '../../utils/speech';
import { setPendingFile, MAX_UPLOAD_BYTES } from '../../utils/pendingFile';

export const DEFAULT_FILE_QUESTION = 'What is in this file, and what should I do with it?';

// Jarvis — the general assistant's whole state machine (models, modes, conversations,
// streaming chat, files, voice). It lives in the Coach hub (not in the chat view) so a
// reply keeps streaming while you look at a coach, and the conversation list can sit in
// the hub's sidebar while the chat fills the main area.
export default function useJarvis() {
  const { api } = useContext(AuthContext);
  const { showToast } = useToast();
  const navigate = useNavigate();

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
  const [speakReplies, setSpeakReplies] = useState(() => localStorage.getItem('asst.speak') === '1');
  const [convMode, setConvMode] = useState(false);
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  // A file the user brought in: first choose (plan it / ask about it), then it rides on the next message.
  const [attach, setAttach] = useState(null);          // { file, status: 'choose' | 'reading' | 'ready', data }
  const fileInputRef = useRef(null);
  const inputRef = useRef(null);
  const pickerRef = useRef(null);

  const scrollRef = useRef(null);
  const abortRef = useRef(null);
  // Voice callbacks outlive the render that created them — read live values via refs
  // (otherwise each spoken turn used the first render's conversationId and started
  // a new conversation, so the assistant "forgot" everything said before).
  const conversationIdRef = useRef(null); conversationIdRef.current = conversationId;
  const convModeRef = useRef(false); convModeRef.current = convMode;
  const speakRef = useRef(false); speakRef.current = speakReplies;
  const sendRef = useRef(null);

  const configuredProviders = useMemo(
    () => new Set(providers.filter(p => p.configured).map(p => p.provider)),
    [providers]
  );
  const availableModels = useMemo(
    () => models.filter(m => configuredProviders.has(m.provider)),
    [models, configuredProviders]
  );
  const selectedModel = models.find(m => m.key === modelKey) || null;

  const refreshConversations = () => { api.getAiConversations().then(setConversations).catch(() => {}); };

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

  // Model menu: also close on outside click and Escape.
  useEffect(() => {
    if (!modelMenuOpen) return undefined;
    const onDown = (e) => { if (!pickerRef.current?.contains(e.target)) setModelMenuOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setModelMenuOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [modelMenuOpen]);

  const applyStarter = (text) => { setInput(text); requestAnimationFrame(() => inputRef.current?.focus()); };

  const openConversation = async (id) => {
    abortRef.current?.abort();
    try {
      const conv = await api.getAiConversation(id);
      setConversationId(conv.id);
      setMessages((conv.messages || []).map(m => ({
        role: m.role, content: m.content, sources: m.sources || null,
        tools: Array.isArray(m.tools) ? m.tools : [], dbId: m.id, attachments: m.attachments || null,
      })));
      if (conv.model) setModelKey(conv.model);
    } catch { showToast('Failed to open conversation', 'error'); }
  };

  const newChat = () => { abortRef.current?.abort(); setConversationId(null); setMessages([]); setInput(''); };
  const stop = () => { abortRef.current?.abort(); };

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

  // ---------- files ----------
  const chooseFile = (f) => {
    if (!f) return false;
    if (f.size > MAX_UPLOAD_BYTES) { showToast('That file is over 10 MB.', 'error'); return false; }
    setAttach({ file: f, status: 'choose' });
    return true;
  };
  const planIt = () => { setPendingFile(attach.file); navigate('/import'); };
  const askAboutIt = async () => {
    const f = attach.file;
    setAttach({ file: f, status: 'reading' });
    try {
      const data = await api.extractFile(f);
      setAttach(a => (a && a.file === f ? { file: f, status: 'ready', data } : a));
    } catch (e) {
      showToast(e.message || 'Could not read that file.', 'error');
      setAttach(a => (a && a.file === f ? { file: f, status: 'choose' } : a));
    }
  };

  const send = async (override) => {
    const ready = attach?.status === 'ready' ? attach.data : null;
    const text = (typeof override === 'string' ? override : input).trim() || (ready ? DEFAULT_FILE_QUESTION : '');
    if (!text || streaming) return;
    if (!modelKey) { showToast('Pick a model first', 'error'); return; }
    const attachments = ready ? [{ name: ready.name, kind: ready.kind, chars: ready.chars, truncated: ready.truncated, text: ready.text }] : undefined;

    cancelSpeak();
    setInput('');
    if (ready) setAttach(null);
    setMessages(prev => [...prev, { role: 'user', content: text, attachments: attachments?.map(({ text: _t, ...meta }) => meta) }, { role: 'assistant', content: '', sources: null, tools: [] }]);
    setStreaming(true);
    let full = '';

    const controller = new AbortController();
    abortRef.current = controller;
    const setLast = (fn) => setMessages(prev => {
      const next = [...prev];
      const li = next.length - 1;
      if (next[li] && next[li].role === 'assistant') next[li] = fn(next[li]);
      return next;
    });

    try {
      const res = await api.aiChatStream({ conversationId: conversationIdRef.current, modelKey, message: text, webSearch, rpmMode, autoMode, attachments }, controller.signal);
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
        if (ev.type === 'meta' && ev.conversationId) { conversationIdRef.current = ev.conversationId; setConversationId(ev.conversationId); }
        else if (ev.type === 'saved' && ev.messageId) {
          setMessages(prev => {
            const next = [...prev];
            const li = next.length - 1;
            if (next[li] && next[li].role === 'assistant') next[li] = { ...next[li], dbId: ev.messageId };
            return next;
          });
        } else if (ev.type === 'delta') {
          full += ev.text;
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
        } else if (ev.type === 'usage') {
          setMessages(prev => {
            const next = [...prev];
            next[next.length - 1] = { ...next[next.length - 1], usage: ev.usage };
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
        setLast(m => (m.content ? m : { ...m, content: `⚠️ ${erroredMsg}` }));
      }
      refreshConversations();
    } catch (err) {
      if (controller.signal.aborted) {
        // User pressed Stop: keep what arrived; the server saves the partial reply.
        setLast(m => ({ ...m, content: m.content ? `${m.content} …` : '_(stopped)_', tools: (m.tools || []).map(t => (t.done ? t : { ...t, done: true })) }));
        refreshConversations();
      } else {
        showToast(err.message || 'AI request failed', 'error');
        setLast(m => (m.content ? m : { ...m, content: `⚠️ ${err.message || 'AI request failed'}` }));
      }
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      setStreaming(false);
      const aborted = controller.signal.aborted;
      if (!aborted && speakRef.current && full.trim()) {
        setSpeaking(true);
        speak(full, { onEnd: () => { setSpeaking(false); if (convModeRef.current) startVoice(); } });
      } else if (!aborted && convModeRef.current) {
        startVoice();
      }
    }
  };
  sendRef.current = send;

  const onKeyDown = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } };

  // Voice ("Jarvis"): speak to the assistant; it can speak back and keep the conversation going.
  const startVoice = () => {
    if (!sttSupported()) { showToast('Voice input isn’t supported on this browser.', 'info'); return; }
    if (streaming) return;
    cancelSpeak(); setSpeaking(false);
    setListening(true);
    startListening({
      onInterim: (t) => setInput(t),
      onFinal: (t) => { if (t) sendRef.current(t); else setInput(''); },
      onEnd: () => setListening(false),
      onError: (err) => { setListening(false); if (err !== 'no-speech' && err !== 'aborted' && err !== 'unsupported') showToast('Voice: ' + err, 'error'); },
    });
  };
  const stopVoice = () => { stopListening(); setListening(false); };
  const toggleConv = () => {
    setConvMode(v => {
      const nv = !v;
      if (nv) { if (!speakReplies) { setSpeakReplies(true); localStorage.setItem('asst.speak', '1'); } if (!streaming) startVoice(); }
      else { stopVoice(); cancelSpeak(); }
      return nv;
    });
  };
  const toggleSpeak = () => setSpeakReplies(v => { const nv = !v; localStorage.setItem('asst.speak', nv ? '1' : '0'); if (!nv) cancelSpeak(); return nv; });
  const stopSpeaking = () => { cancelSpeak(); setSpeaking(false); };

  useEffect(() => () => { stopListening(); cancelSpeak(); abortRef.current?.abort(); }, []); // cleanup on unmount

  const noModels = models.length > 0 && availableModels.length === 0;

  return {
    // models / modes
    models, modelKey, setModelKey, selectedModel, configuredProviders, noModels,
    modelMenuOpen, setModelMenuOpen, openFamilies, setOpenFamilies, pickerRef,
    rpmMode, setRpmMode, autoMode, setAutoMode, webSearch, setWebSearch,
    // conversations
    conversations, conversationId, openConversation, newChat, deleteConversation,
    // chat
    messages, input, setInput, streaming, send, stop, onKeyDown, applyStarter, inputRef, scrollRef,
    approveProposal, dismissProposal,
    // files
    attach, setAttach, chooseFile, planIt, askAboutIt, fileInputRef,
    // voice
    listening, speaking, speakReplies, convMode, startVoice, stopVoice, toggleConv, toggleSpeak, stopSpeaking,
  };
}
