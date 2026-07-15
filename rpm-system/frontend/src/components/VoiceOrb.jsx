import { useState, useRef, useContext, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Mic, X, Loader2, Radio } from 'lucide-react';
import { AppContext, AuthContext } from '../App';
import { useToast } from './ToastProvider';
import { sttSupported, ttsSupported, startListening, stopListening, speak, cancelSpeak } from '../utils/speech';
import './VoiceOrb.css';

// Global "Jarvis" voice orb — present on every page. Tap to talk; it thinks, acts
// (via the RPM agent), and speaks the reply while the orb animates its state.
export default function VoiceOrb() {
  const { api } = useContext(AuthContext);
  const { refreshData } = useContext(AppContext);
  const { showToast } = useToast();
  const [state, setState] = useState('idle'); // idle | listening | thinking | speaking
  const [open, setOpen] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [reply, setReply] = useState('');
  const [conv, setConv] = useState(false); // hands-free conversation mode
  const convId = useRef(null);
  const convRef = useRef(false);

  useEffect(() => { convRef.current = conv; }, [conv]);
  useEffect(() => () => { stopListening(); cancelSpeak(); }, []);

  const listen = () => {
    if (!sttSupported()) { showToast('Voice needs Chrome or Edge (with mic access).', 'info'); return; }
    cancelSpeak();
    setOpen(true); setReply(''); setTranscript(''); setState('listening');
    startListening({
      onInterim: (t) => setTranscript(t),
      onFinal: (t) => { if (t) ask(t); else setState('idle'); },
      onError: (e) => { setState('idle'); if (e !== 'no-speech' && e !== 'aborted' && e !== 'unsupported') showToast('Voice: ' + e, 'error'); },
    });
  };

  const ask = async (text) => {
    const modelKey = localStorage.getItem('ai.modelKey');
    if (!modelKey) { setState('idle'); showToast('Pick a default AI model in Settings first.', 'info'); return; }
    setState('thinking'); setReply('');
    let full = '';
    try {
      const res = await api.aiChatStream({ conversationId: convId.current, modelKey, message: text, webSearch: false, rpmMode: true, autoMode: true });
      if (!res.ok || !res.body) { let m = 'Request failed'; try { m = (await res.json()).error || m; } catch { /* ignore */ } throw new Error(m); }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = '', acted = false;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let sep;
        while ((sep = buf.indexOf('\n\n')) >= 0) {
          const frame = buf.slice(0, sep); buf = buf.slice(sep + 2);
          const line = frame.split('\n').find(l => l.startsWith('data:'));
          if (!line) continue;
          let ev; try { ev = JSON.parse(line.slice(5).trim()); } catch { continue; }
          if (ev.type === 'meta' && ev.conversationId) convId.current = ev.conversationId;
          else if (ev.type === 'delta') { full += ev.text; setReply(full); }
          else if (ev.type === 'tool_result') acted = true;
          else if (ev.type === 'error') full += (full ? '\n' : '') + '⚠️ ' + (ev.message || 'error');
        }
      }
      if (acted && refreshData) refreshData();
      if (ttsSupported() && full.trim()) {
        setState('speaking');
        speak(full, { onEnd: () => { if (convRef.current) listen(); else setState('idle'); } });
      } else setState('idle');
    } catch (e) {
      setState('idle');
      setReply('⚠️ ' + (e.message || 'Something went wrong'));
    }
  };

  const orbClick = () => {
    if (state === 'idle') listen();
    else if (state === 'listening') stopListening();      // settles → onFinal → ask
    else if (state === 'speaking') { cancelSpeak(); setState('idle'); }
    // thinking: ignore
  };
  const close = () => { stopListening(); cancelSpeak(); setState('idle'); setOpen(false); };
  const toggleConv = () => setConv(v => {
    const nv = !v;
    if (nv && state === 'idle') listen();
    if (!nv) { stopListening(); cancelSpeak(); }
    return nv;
  });

  if (!sttSupported() && !ttsSupported()) return null;

  const label = { listening: 'Listening…', thinking: 'Thinking…', speaking: 'Speaking…' }[state] || 'Tap to talk';

  return createPortal(
    <div className="vorb-root">
      {open && (
        <div className="vorb-panel">
          <div className="vorb-panel-head">
            <span className="vorb-state">{label}</span>
            <div className="vorb-panel-actions">
              <button className={`vorb-conv ${conv ? 'on' : ''}`} onClick={toggleConv} title="Hands-free conversation"><Radio size={13} /></button>
              <button className="vorb-close" onClick={close} aria-label="Close"><X size={14} /></button>
            </div>
          </div>
          {transcript && <div className="vorb-you">“{transcript}”</div>}
          {reply
            ? <div className="vorb-reply">{reply}</div>
            : (!transcript && <div className="vorb-hint">Ask me anything — “what should I focus on today?”, “add a task to call the plumber tomorrow”, “how's my fitness goal tracking?”</div>)}
        </div>
      )}
      <button className={`vorb vorb-${state}`} onClick={orbClick} title={label} aria-label={label}>
        <span className="vorb-core" />
        <span className="vorb-ring" />
        <span className="vorb-ic">{state === 'thinking' ? <Loader2 size={20} className="vorb-spin" /> : <Mic size={20} />}</span>
      </button>
    </div>,
    document.body
  );
}
