import { useState, useRef, useContext, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Mic, X, Loader2, Radio, Zap } from 'lucide-react';
import { AppContext, AuthContext } from '../App';
import { useToast } from './ToastProvider';
import Markdown from './Markdown';
import {
  sttSupported, ttsSupported, startListening, stopListening, speak, speakChunk, cancelSpeak,
  startWakeWord, stopWakeWord, onVoicesReady, getVoiceName, setVoiceName as saveVoiceName,
} from '../utils/speech';
import './VoiceOrb.css';

// Flush speech at a sentence end or a line break (so bullets/headings speak too).
const SENTENCE = /^[\s\S]*?(?:[.!?…](?:["')\]]+)?\s|\n+)/;

const GREETS = ['Yes?', "I'm listening.", 'Go ahead.', 'What do you need?'];
const timeGreet = () => { const h = new Date().getHours(); return h < 12 ? 'Good morning.' : h < 18 ? 'Good afternoon.' : 'Good evening.'; };

// Detect routing commands: "talk to my wealth coach", "back to Jarvis", etc.
function matchCoachCommand(text, coaches) {
  const t = text.toLowerCase().trim();
  if (/\b(back to|switch to|talk to|go back to)\s+jarvis\b/.test(t) || /\b(leave|exit|close|stop)\s+(the\s+)?coach\b/.test(t)) return { toJarvis: true };
  const m = t.match(/\b(?:talk to|switch to|ask|open|connect (?:me )?to|hey)\s+(?:my\s+)?(.+?)\s+coach\b/);
  const guess = (m ? m[1] : '').trim();
  if (!guess) return null;
  const norm = (s) => (s || '').toLowerCase().replace(/\s*coach$/, '').trim();
  const c = coaches.find(c => norm(c.name).includes(guess) || guess.includes(norm(c.name)) || norm(c.category_name).includes(guess) || guess.includes(norm(c.category_name)));
  return c ? { coach: c } : null;
}

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
  const [wake, setWake] = useState(() => localStorage.getItem('orb.wake') === '1'); // "Hey RPM"
  const [voices, setVoices] = useState([]);
  const [voice, setVoice] = useState(() => getVoiceName());
  const [coaches, setCoaches] = useState([]);
  const [activeCoach, setActiveCoach] = useState(null); // null = general Jarvis
  const convId = useRef(null);
  const convRef = useRef(false);
  const firstRef = useRef(true);
  const activeCoachRef = useRef(null); activeCoachRef.current = activeCoach;
  const coachMsgs = useRef([]);

  useEffect(() => { convRef.current = conv; }, [conv]);
  // getVoices() populates asynchronously in Chrome.
  useEffect(() => onVoicesReady(setVoices), []);
  useEffect(() => { api.getCoaches().then(c => setCoaches(Array.isArray(c) ? c : [])).catch(() => {}); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const switchCoach = (c) => {
    // Batch-reconcile the outgoing coach's session into its memory (firing policy:
    // never per-message; only when the conversation with that coach ends).
    const prev = activeCoachRef.current;
    if (prev && coachMsgs.current.length >= 2) {
      const transcript = coachMsgs.current.map(m => `${m.role === 'user' ? 'User' : 'Coach'}: ${m.content}`).join('\n');
      api.coachRemember(prev.id, transcript).catch(() => {});
    }
    setActiveCoach(c); coachMsgs.current = [];
  };
  useEffect(() => () => {
    stopListening(); stopWakeWord(); cancelSpeak();
    const prev = activeCoachRef.current;
    if (prev && coachMsgs.current.length >= 2) {
      const transcript = coachMsgs.current.map(m => `${m.role === 'user' ? 'User' : 'Coach'}: ${m.content}`).join('\n');
      api.coachRemember(prev.id, transcript).catch(() => {});
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Greet first, then listen — so it feels like it's talking to you, not just recording.
  const activate = () => {
    if (!sttSupported()) { showToast('Voice needs Chrome or Edge (with mic access).', 'info'); return; }
    cancelSpeak();
    // Keep the previous answer on screen — it's only cleared once a NEW reply starts.
    setOpen(true);
    const greet = firstRef.current ? `${timeGreet()} What do you need?` : GREETS[Math.floor(Math.random() * GREETS.length)];
    firstRef.current = false;
    if (ttsSupported()) { setState('speaking'); speak(greet, { onEnd: () => listen() }); }
    else listen();
  };

  const listen = () => {
    if (!sttSupported()) { showToast('Voice needs Chrome or Edge (with mic access).', 'info'); return; }
    cancelSpeak();
    // Don't wipe the last answer just because we're listening again (conversation
    // mode / wake word) — onInterim overwrites the transcript as you speak, and the
    // reply is cleared in ask() when a new one starts.
    setOpen(true); setState('listening');
    startListening({
      onInterim: (t) => setTranscript(t),
      onFinal: (t) => { if (t) ask(t); else setState('idle'); },
      onError: (e) => { setState('idle'); if (e !== 'no-speech' && e !== 'aborted' && e !== 'unsupported') showToast('Voice: ' + e, 'error'); },
    });
  };

  // Speak a short line, then return to listening (conversation) or idle.
  const say = (line, thenListen) => {
    if (ttsSupported()) { setState('speaking'); speak(line, { onEnd: () => { if (thenListen) listen(); else if (convRef.current) listen(); else setState('idle'); } }); }
    else if (thenListen || convRef.current) listen(); else setState('idle');
  };

  const ask = async (text) => {
    // Routing commands: hand off to / from a coach without hitting the AI.
    const cmd = matchCoachCommand(text, coaches);
    if (cmd?.toJarvis) {
      switchCoach(null); setTranscript(text); setReply('');
      say("Okay, back to Jarvis. What do you need?");
      return;
    }
    if (cmd?.coach) {
      switchCoach(cmd.coach); setTranscript(text); setReply('');
      say(`You're with ${cmd.coach.name} now. Go ahead.`, true);
      return;
    }
    const modelKey = localStorage.getItem('ai.modelKey');
    if (!modelKey) { setState('idle'); showToast('Pick a default AI model in Settings first.', 'info'); return; }
    const coach = activeCoachRef.current;
    setState('thinking'); setReply(''); setTranscript(text);
    let full = '';
    // Speak sentence-by-sentence as the reply streams, instead of waiting for it all.
    const canSpeak = ttsSupported();
    let buf = '', pending = 0, streamDone = false, started = false;
    const finishIfDone = () => {
      if (streamDone && pending === 0) { if (convRef.current) listen(); else setState('idle'); }
    };
    const flush = (chunk) => {
      if (!canSpeak || !chunk.trim()) return;
      if (!started) { started = true; setState('speaking'); }
      pending++;
      speakChunk(chunk, { onEnd: () => { pending--; finishIfDone(); } });
    };
    const drain = () => {
      let m;
      while ((m = buf.match(SENTENCE))) { const s = m[0]; buf = buf.slice(s.length); flush(s); }
    };
    try {
      let res;
      if (coach) {
        coachMsgs.current.push({ role: 'user', content: text });
        res = await api.coachChatStream(coach.id, { messages: coachMsgs.current.slice(-12), autoMode: true });
      } else {
        res = await api.aiChatStream({ conversationId: convId.current, modelKey, message: text, webSearch: false, rpmMode: true, autoMode: true });
      }
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
          else if (ev.type === 'delta') { full += ev.text; setReply(full); buf += ev.text; drain(); }
          else if (ev.type === 'tool_result') acted = true;
          else if (ev.type === 'error') full += (full ? '\n' : '') + '⚠️ ' + (ev.message || 'error');
        }
      }
      if (acted && refreshData) refreshData();
      if (coach && full.trim()) coachMsgs.current.push({ role: 'assistant', content: full });
      streamDone = true;
      if (buf.trim()) { flush(buf); buf = ''; }
      if (!started) { if (convRef.current) listen(); else setState('idle'); } // nothing spoken
      else finishIfDone();
    } catch (e) {
      setState('idle');
      setReply('⚠️ ' + (e.message || 'Something went wrong'));
    }
  };

  // "Hey RPM": only armed while idle — one recognizer at a time, and it must not
  // hear the assistant speaking or compete with the command mic.
  useEffect(() => {
    if (!wake || state !== 'idle') { stopWakeWord(); return; }
    startWakeWord({
      onWake: () => activate(),
      onError: (e) => {
        if (e === 'not-allowed' || e === 'service-not-allowed') {
          setWake(false); localStorage.setItem('orb.wake', '0');
          showToast('Mic permission is needed for “Hey RPM”.', 'error');
        }
      },
    });
    return () => stopWakeWord();
  }, [wake, state]); // eslint-disable-line react-hooks/exhaustive-deps

  const orbClick = () => {
    if (state === 'idle') activate();
    else if (state === 'listening') stopListening();      // settles → onFinal → ask
    else if (state === 'speaking') { cancelSpeak(); setState('idle'); }
    // thinking: ignore
  };
  const close = () => { stopListening(); cancelSpeak(); setState('idle'); setOpen(false); };
  const toggleConv = () => setConv(v => {
    const nv = !v;
    if (nv && state === 'idle') activate();
    if (!nv) { stopListening(); cancelSpeak(); }
    return nv;
  });
  const toggleWake = () => setWake(v => {
    const nv = !v;
    localStorage.setItem('orb.wake', nv ? '1' : '0');
    if (!nv) stopWakeWord();
    else showToast('Listening for “Hey RPM” — your mic stays on.', 'info');
    return nv;
  });

  if (!sttSupported() && !ttsSupported()) return null;

  const label = { listening: 'Listening…', thinking: 'Thinking…', speaking: 'Speaking…' }[state] || 'Tap to talk';

  return createPortal(
    <div className="vorb-root">
      {open && (
        <div className="vorb-panel">
          <div className="vorb-panel-head">
            <span className="vorb-who">
              {activeCoach
                ? <><span className="vorb-who-av" style={{ background: activeCoach.avatar_image ? undefined : (activeCoach.color || '#4ECDC4') }}>{activeCoach.avatar_image ? <img src={activeCoach.avatar_image} alt="" /> : (activeCoach.avatar_emoji || '🧭')}</span>{activeCoach.name}</>
                : <><span className="vorb-who-av jarvis">✦</span>Jarvis</>}
            </span>
            <div className="vorb-panel-actions">
              <span className="vorb-state">{label}</span>
              <button className="vorb-close" onClick={close} aria-label="Close"><X size={14} /></button>
            </div>
          </div>
          {coaches.length > 0 && (
            <div className="vorb-coachpick">
              <button className={`vorb-cp ${!activeCoach ? 'on' : ''}`} onClick={() => switchCoach(null)} title="Jarvis — your general assistant">✦ Jarvis</button>
              {coaches.map(c => (
                <button key={c.id} className={`vorb-cp ${activeCoach?.id === c.id ? 'on' : ''}`} onClick={() => switchCoach(c)} title={c.name} style={activeCoach?.id === c.id ? { borderColor: c.color || '#4ECDC4' } : undefined}>
                  <span className="vorb-cp-em">{c.avatar_image ? <img src={c.avatar_image} alt="" /> : (c.avatar_emoji || '🧭')}</span>{c.name}
                </button>
              ))}
            </div>
          )}
          {transcript && <div className="vorb-you">“{transcript}”</div>}
          {reply
            ? <div className="vorb-reply"><Markdown>{reply}</Markdown></div>
            : (!transcript && <div className="vorb-hint">{activeCoach
                ? <>Talking to <strong>{activeCoach.name}</strong> — ask about this area, or say “back to Jarvis”.</>
                : <>Ask me anything — “what should I focus on today?”, “add a task to call the plumber tomorrow”, or “talk to my {coaches[0]?.name?.replace(/\s*coach$/i, '') || 'wealth'} coach”.</>}</div>)}
          {ttsSupported() && voices.length > 0 && (
            <select
              className="vorb-voice form-input"
              value={voice}
              onChange={(e) => { setVoice(e.target.value); saveVoiceName(e.target.value); cancelSpeak(); speak('This is my voice now.'); }}
              title="Pick a voice"
            >
              <option value="">Voice: auto (best available)</option>
              {voices
                .filter(v => (v.lang || '').toLowerCase().startsWith((navigator.language || 'en').slice(0, 2).toLowerCase()))
                .map(v => <option key={v.name} value={v.name}>{v.name}</option>)}
            </select>
          )}
        </div>
      )}
      <div className="vorb-chips">
        {sttSupported() && (
          <button className={`vorb-chip ${wake ? 'on' : ''}`} onClick={toggleWake} title={wake ? 'Wake word on — say “Hey RPM”. Mic stays on.' : 'Enable wake word: say “Hey RPM”'}>
            <Zap size={11} /> Hey RPM
          </button>
        )}
        {sttSupported() && (
          <button className={`vorb-chip ${conv ? 'on' : ''}`} onClick={toggleConv} title="Hands-free conversation">
            <Radio size={11} />
          </button>
        )}
      </div>
      <button className={`vorb vorb-${state} ${wake && state === 'idle' ? 'armed' : ''} ${activeCoach ? 'coached' : ''}`} onClick={orbClick} title={activeCoach ? `${activeCoach.name} · ${label}` : label} aria-label={label}>
        <span className="vorb-core" />
        <span className="vorb-ring" />
        <span className="vorb-ic">{state === 'thinking' ? <Loader2 size={20} className="vorb-spin" /> : <Mic size={20} />}</span>
        {activeCoach && (
          <span className="vorb-badge" style={{ background: activeCoach.avatar_image ? undefined : (activeCoach.color || '#4ECDC4') }}>
            {activeCoach.avatar_image ? <img src={activeCoach.avatar_image} alt="" /> : (activeCoach.avatar_emoji || '🧭')}
          </span>
        )}
      </button>
    </div>,
    document.body
  );
}
