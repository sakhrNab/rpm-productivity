import { useState, useRef, useContext, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Mic, X, Loader2, Zap, Check, CalendarDays } from 'lucide-react';
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

// "That's all" style phrases end a hands-free conversation and let the orb sleep.
const STOP_RE = /^\s*(stop|that'?s all|that is all|thanks?( jarvis)?|thank you|goodbye|good bye|bye|see you|never ?mind|dismiss|go to sleep|sleep now|we'?re done|i'?m done)[.!]?\s*$/i;

// Friendly labels for the actions the agent takes — shown as activity pills so you
// can SEE what it did, not just read the prose.
const ACT_LABEL = {
  create_action: (a) => `Added task${a?.title ? ` “${a.title}”` : ''}`,
  schedule_action: (a) => `Rescheduled → ${a?.scheduled_date || 'a new date'}`,
  complete_action: (a) => (a?.completed === false ? 'Reopened a task' : 'Marked a task done'),
  create_rpm_block: (a) => `Created RPM block${a?.result_title ? ` “${a.result_title}”` : ''}`,
  update_key_result: () => 'Updated goal progress',
  update_action: (a) => `Edited a task${a?.title ? ` → “${a.title}”` : ''}`,
  delete_action: () => 'Proposed deleting a task',
};

// Detect explicit routing commands: "talk to my wealth coach", "back to Jarvis".
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

// Softer signal: the question is ABOUT a coached area, so offer a hand-off.
const TOPIC_STOP = new Set(['the', 'ultimate', 'coach', 'my', 'and', 'for', 'with', 'this', 'that', 'your', 'from', 'about', 'goal', 'goals', 'plan', 'life', 'area']);
function suggestCoach(text, coaches, active) {
  if (active || !coaches.length) return null;
  const q = ` ${text.toLowerCase()} `;
  for (const c of coaches) {
    const words = `${c.name} ${c.category_name || ''}`.toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length >= 4 && !TOPIC_STOP.has(w));
    if (words.some(w => q.includes(` ${w} `) || q.includes(`${w} `) || q.includes(` ${w}`))) return c;
  }
  return null;
}

function CoachAv({ coach, size = 22 }) {
  if (!coach) return <span className="vorb-av jarvis" style={{ width: size, height: size }}>✦</span>;
  return (
    <span className="vorb-av" style={{ width: size, height: size, background: coach.avatar_image ? undefined : (coach.color || '#4ECDC4') }}>
      {coach.avatar_image ? <img src={coach.avatar_image} alt="" /> : (coach.avatar_emoji || '🧭')}
    </span>
  );
}

// Global "Jarvis" voice orb — present on every page. Tap (or say "Hey RPM" in
// hands-free mode) to talk; it thinks, acts, and speaks while it animates.
export default function VoiceOrb() {
  const { api } = useContext(AuthContext);
  const { refreshData } = useContext(AppContext);
  const { showToast } = useToast();
  const [state, setState] = useState('idle'); // idle | listening | thinking | speaking
  const [open, setOpen] = useState(false);
  const [transcript, setTranscript] = useState(''); // live user text this turn
  const [reply, setReply] = useState('');            // live streaming reply this turn
  const [acts, setActs] = useState([]);              // activity pills this turn
  const [turns, setTurns] = useState([]);            // committed exchanges
  const [hs, setHs] = useState(() => localStorage.getItem('orb.hs') === '1'); // hands-free
  const [voices, setVoices] = useState([]);
  const [voice, setVoice] = useState(() => getVoiceName());
  const [coaches, setCoaches] = useState([]);
  const [activeCoach, setActiveCoach] = useState(null); // null = general Jarvis
  const [suggested, setSuggested] = useState(null);     // coach hand-off suggestion

  const convId = useRef(null);
  const firstRef = useRef(true);
  const hsRef = useRef(hs); hsRef.current = hs;
  const endingRef = useRef(false);          // set when a stop phrase ends the loop
  const activeCoachRef = useRef(null); activeCoachRef.current = activeCoach;
  const coachMsgs = useRef([]);             // per-session transcript for coach API context
  const actsRef = useRef([]);
  const threadRef = useRef(null);

  useEffect(() => onVoicesReady(setVoices), []);
  useEffect(() => { api.getCoaches().then(c => setCoaches(Array.isArray(c) ? c : [])).catch(() => {}); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // Reconcile the active coach's session into its memory when the orb unmounts.
  useEffect(() => () => {
    stopListening(); stopWakeWord(); cancelSpeak();
    flushCoachMemory(activeCoachRef.current);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // Keep the thread scrolled to the newest message.
  useEffect(() => { if (threadRef.current) threadRef.current.scrollTop = threadRef.current.scrollHeight; }, [turns, reply, transcript, acts]);

  const flushCoachMemory = (coach) => {
    if (coach && coachMsgs.current.length >= 2) {
      const t = coachMsgs.current.map(m => `${m.role === 'user' ? 'User' : 'Coach'}: ${m.content}`).join('\n');
      api.coachRemember(coach.id, t).catch(() => {});
    }
  };

  const switchCoach = (c) => {
    flushCoachMemory(activeCoachRef.current);
    setActiveCoach(c); coachMsgs.current = []; setSuggested(null);
  };

  // Speak a short meta line (greeting / confirmation), then listen or idle.
  const say = (line, { thenListen = false } = {}) => {
    if (ttsSupported()) { setState('speaking'); speak(line, { onEnd: () => (thenListen ? listen() : setState('idle')) }); }
    else if (thenListen) listen(); else setState('idle');
  };

  // Begin an engagement: greet, then listen. Loops in hands-free mode.
  const beginEngagement = () => {
    if (!sttSupported()) { showToast('Voice needs Chrome or Edge (with mic access).', 'info'); return; }
    cancelSpeak(); setOpen(true); endingRef.current = false;
    const greet = firstRef.current ? `${timeGreet()} What do you need?` : GREETS[Math.floor(Math.random() * GREETS.length)];
    firstRef.current = false;
    if (ttsSupported()) { setState('speaking'); speak(greet, { onEnd: () => listen() }); }
    else listen();
  };

  const listen = () => {
    if (!sttSupported()) { showToast('Voice needs Chrome or Edge (with mic access).', 'info'); return; }
    cancelSpeak();
    setOpen(true); setState('listening'); setTranscript('');
    startListening({
      onInterim: (t) => setTranscript(t),
      onFinal: (t) => { if (t) ask(t); else setState('idle'); },   // silence → sleep
      onError: (e) => { setState('idle'); if (e !== 'no-speech' && e !== 'aborted' && e !== 'unsupported') showToast('Voice: ' + e, 'error'); },
    });
  };

  const pushAct = (o) => { actsRef.current = [...actsRef.current, o]; setActs(actsRef.current); };
  const markActDone = () => {
    const arr = [...actsRef.current];
    for (let i = arr.length - 1; i >= 0; i--) { if (!arr[i].done) { arr[i] = { ...arr[i], done: true }; break; } }
    actsRef.current = arr; setActs(arr);
  };

  const ask = async (text) => {
    // End a hands-free conversation.
    if (STOP_RE.test(text)) { endingRef.current = true; setTranscript(text); setSuggested(null); say('Okay — I’m here when you need me.'); return; }
    // Explicit coach routing (no AI call).
    const cmd = matchCoachCommand(text, coaches);
    if (cmd?.toJarvis) { switchCoach(null); setTranscript(text); say('Back to Jarvis. What do you need?', { thenListen: hsRef.current }); return; }
    if (cmd?.coach) { switchCoach(cmd.coach); setTranscript(text); say(`You’re with ${cmd.coach.name} now. Go ahead.`, { thenListen: true }); return; }

    const modelKey = localStorage.getItem('ai.modelKey');
    if (!modelKey) { setState('idle'); showToast('Pick a default AI model in Settings first.', 'info'); return; }
    const coach = activeCoachRef.current;
    setState('thinking'); setTranscript(text); setReply(''); setSuggested(null);
    actsRef.current = []; setActs([]);
    let full = '';

    const canSpeak = ttsSupported();
    let sbuf = '', pending = 0, streamDone = false, started = false;
    const finishIfDone = () => { if (streamDone && pending === 0) { if (hsRef.current && !endingRef.current) listen(); else setState('idle'); } };
    const flush = (chunk) => {
      if (!canSpeak || !chunk.trim()) return;
      if (!started) { started = true; setState('speaking'); }
      pending++; speakChunk(chunk, { onEnd: () => { pending--; finishIfDone(); } });
    };
    const drain = () => { let m; while ((m = sbuf.match(SENTENCE))) { const s = m[0]; sbuf = sbuf.slice(s.length); flush(s); } };

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
          else if (ev.type === 'delta') { full += ev.text; setReply(full); sbuf += ev.text; drain(); }
          else if (ev.type === 'tool_call') { const f = ACT_LABEL[ev.name]; if (f) pushAct({ text: f(ev.args || {}), done: false }); }
          else if (ev.type === 'tool_result') { acted = true; markActDone(); }
          else if (ev.type === 'error') { full += (full ? '\n' : '') + '⚠️ ' + (ev.message || 'error'); setReply(full); }
        }
      }
      if (acted && refreshData) refreshData();
      if (coach && full.trim()) coachMsgs.current.push({ role: 'assistant', content: full });
      // Commit this exchange into the thread and offer a hand-off if it fit a coach.
      const sug = suggestCoach(text, coaches, coach);
      setTurns(t => [...t, { you: text, reply: full, acts: actsRef.current, coach }]);
      setTranscript(''); setReply(''); actsRef.current = []; setActs([]);
      if (sug) setSuggested(sug);
      streamDone = true;
      if (sbuf.trim()) { flush(sbuf); sbuf = ''; }
      if (!started) { if (hsRef.current && !endingRef.current) listen(); else setState('idle'); }
      else finishIfDone();
    } catch (e) {
      setState('idle');
      setReply('⚠️ ' + (e.message || 'Something went wrong'));
    }
  };

  // Hands-free: arm "Hey RPM" whenever idle. One recognizer at a time, so it only
  // runs while idle (not while listening/speaking), and it auto-restarts itself.
  useEffect(() => {
    if (!hs || state !== 'idle') { stopWakeWord(); return; }
    startWakeWord({
      onWake: () => beginEngagement(),
      onError: (e) => {
        if (e === 'not-allowed' || e === 'service-not-allowed') {
          setHs(false); localStorage.setItem('orb.hs', '0');
          showToast('Mic permission is needed for hands-free.', 'error');
        }
      },
    });
    return () => stopWakeWord();
  }, [hs, state]); // eslint-disable-line react-hooks/exhaustive-deps

  const orbClick = () => {
    if (state === 'idle') beginEngagement();
    else if (state === 'listening') stopListening();       // settles → onFinal → ask
    else if (state === 'speaking') { cancelSpeak(); endingRef.current = true; setState('idle'); }
    // thinking: ignore
  };
  const close = () => { stopListening(); cancelSpeak(); endingRef.current = true; setState('idle'); setOpen(false); };
  const clearThread = () => { setTurns([]); setSuggested(null); };
  const toggleHs = () => setHs(v => {
    const nv = !v;
    localStorage.setItem('orb.hs', nv ? '1' : '0');
    if (!nv) { stopWakeWord(); endingRef.current = true; }
    else showToast('Hands-free on — say “Hey RPM” or tap. It keeps listening and sleeps when you pause.', 'info');
    return nv;
  });

  if (!sttSupported() && !ttsSupported()) return null;

  const label = { listening: 'Listening…', thinking: 'Thinking…', speaking: 'Speaking…' }[state] || (hs ? 'Say “Hey RPM” or tap' : 'Tap to talk');
  const subtitle = activeCoach
    ? `Focused on ${activeCoach.category_name || activeCoach.name}`
    : 'Sees your day, week & goals';
  const empty = !turns.length && !transcript && !reply;

  const Exchange = ({ ex }) => (
    <div className="vorb-ex">
      {ex.you && <div className="vorb-bubble you">{ex.you}</div>}
      {ex.acts?.map((a, i) => (
        <div key={i} className={`vorb-act ${a.done ? 'done' : ''}`}>{a.done ? <Check size={12} /> : <Loader2 size={12} className="vorb-spin" />}{a.text}</div>
      ))}
      {(ex.reply || ex.streaming) && (
        <div className="vorb-bubble bot">
          <CoachAv coach={ex.coach} size={20} />
          <div className="vorb-bubble-md"><Markdown>{ex.reply}</Markdown></div>
        </div>
      )}
    </div>
  );

  return createPortal(
    <div className="vorb-root">
      {open && <div className="vorb-scrim" onClick={close} />}
      {open && (
        <div className="vorb-panel" role="dialog" aria-label="Voice assistant">
          <div className="vorb-panel-head">
            <span className="vorb-who">
              <CoachAv coach={activeCoach} size={26} />
              <span className="vorb-who-txt">
                <span className="vorb-who-name">{activeCoach ? activeCoach.name : 'Jarvis'}</span>
                <span className="vorb-who-sub"><CalendarDays size={10} /> {subtitle}</span>
              </span>
            </span>
            <div className="vorb-panel-actions">
              <span className={`vorb-state st-${state}`}>{label}</span>
              {turns.length > 0 && <button className="vorb-mini" onClick={clearThread} title="Clear conversation">Clear</button>}
              <button className="vorb-close" onClick={close} aria-label="Close"><X size={15} /></button>
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

          <div className="vorb-thread" ref={threadRef}>
            {empty && (
              <div className="vorb-hint">
                {activeCoach
                  ? <>Talking to <strong>{activeCoach.name}</strong> — ask about this area, or say “back to Jarvis”.</>
                  : <>Ask me anything — “what should I focus on today?”, “add a task to call the plumber tomorrow”, or “talk to my {coaches[0]?.name?.replace(/\s*coach$/i, '') || 'wealth'} coach”.</>}
              </div>
            )}
            {turns.map((ex, i) => <Exchange key={i} ex={ex} />)}
            {/* live, in-progress turn */}
            {(transcript || reply || acts.length > 0) && (
              <Exchange ex={{ you: transcript, acts, reply, coach: activeCoach, streaming: state === 'thinking' || state === 'speaking' }} />
            )}
            {suggested && (
              <button className="vorb-suggest" onClick={() => switchCoach(suggested)}>
                <span className="vorb-cp-em">{suggested.avatar_image ? <img src={suggested.avatar_image} alt="" /> : (suggested.avatar_emoji || '🧭')}</span>
                This fits your {suggested.name} — hand off?
              </button>
            )}
          </div>

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
          <button className={`vorb-chip ${hs ? 'on' : ''}`} onClick={toggleHs} title={hs ? 'Hands-free on — say “Hey RPM”, it keeps listening and sleeps when you pause. Tap to turn off.' : 'Turn on hands-free: wake with “Hey RPM” and hold a continuous conversation'}>
            <Zap size={11} /> Hands-free
          </button>
        )}
      </div>
      <button className={`vorb vorb-${state} ${hs && state === 'idle' ? 'armed' : ''} ${activeCoach ? 'coached' : ''}`} onClick={orbClick} title={activeCoach ? `${activeCoach.name} · ${label}` : label} aria-label={label}>
        <span className="vorb-core" />
        <span className="vorb-ring" />
        <span className="vorb-ic">{state === 'thinking' ? <Loader2 size={20} className="vorb-spin" /> : <Mic size={20} />}</span>
        {activeCoach && <span className="vorb-badge" style={{ background: activeCoach.avatar_image ? undefined : (activeCoach.color || '#4ECDC4') }}>{activeCoach.avatar_image ? <img src={activeCoach.avatar_image} alt="" /> : (activeCoach.avatar_emoji || '🧭')}</span>}
      </button>
    </div>,
    document.body
  );
}
