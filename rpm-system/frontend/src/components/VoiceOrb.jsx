import { useState, useRef, useContext, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { Mic, X, Loader2, Zap, Check, CalendarDays, Square, SendHorizontal, AlertTriangle, Plus, Languages, ExternalLink, Speech } from 'lucide-react';
import { AppContext, AuthContext } from '../App';
import { useToast } from './ToastProvider';
import Markdown from './Markdown';
import {
  sttSupported, ttsSupported, startListening, stopListening, abortListening, speak, speakChunk, cancelSpeak,
  startWakeWord, stopWakeWord, wakeListening, onVoicesReady, getVoiceName, setVoiceName as saveVoiceName,
  getSpeechLangSetting, setSpeechLang, listenCue, bargeSupported, startBargeIn, stopBargeIn, abortBargeIn,
} from '../utils/speech';
import { isBargeIn, isOnlyStop } from '../utils/bargeIn';
import Picker from './Picker';
import './VoiceOrb.css';

// Flush speech at a sentence end or a line break (so bullets/headings speak too).
const SENTENCE = /^[\s\S]*?(?:[.!?…](?:["')\]]+)?\s|\n+)/;

// "That's all" style phrases end a hands-free conversation and let the orb sleep.
const STOP_RE = /^\s*(stop|that'?s all|that is all|thanks?( jarvis)?|thank you|goodbye|good bye|bye|see you|never ?mind|dismiss|go to sleep|sleep now|we'?re done|i'?m done)[.!]?\s*$/i;
// Spoken answers to "shall I?" — only when something is waiting for approval.
const YES_RE = /^\s*(yes|yeah|yep|yup|sure|ok(ay)?|do it|go ahead|approve( it| them| all)?|confirm(ed)?|please do|sounds good|correct|right)[.!]?\s*(please)?[.!]?\s*$/i;
const NO_RE = /^\s*(no|nope|nah|don'?t|cancel|skip( it)?|dismiss|leave it|forget it|never ?mind)[.!]?\s*$/i;

const CONV_KEY = 'orb.conv';
const CONV_TTL = 12 * 3600 * 1000;   // a new conversation after 12 quiet hours

// Speech-recognition languages worth offering; "Auto" follows the browser.
const LANGS = [
  ['', 'Auto (browser)'], ['en-US', 'English (US)'], ['en-GB', 'English (UK)'], ['de-DE', 'Deutsch'],
  ['ar-SA', 'العربية'], ['fr-FR', 'Français'], ['es-ES', 'Español'], ['it-IT', 'Italiano'],
  ['nl-NL', 'Nederlands'], ['pt-BR', 'Português'], ['tr-TR', 'Türkçe'],
];

// Friendly labels for the actions the agent takes — shown as activity pills so you
// can SEE what it did, not just read the prose.
const ACT_LABEL = {
  create_action: (a) => `Added task${a?.title ? ` “${a.title}”` : ''}`,
  schedule_action: (a) => `Rescheduled → ${a?.scheduled_date || 'a new date'}`,
  complete_action: (a) => (a?.completed === false ? 'Reopened a task' : 'Marked a task done'),
  create_rpm_block: (a) => `Created RPM block${a?.result_title ? ` “${a.result_title}”` : ''}`,
  update_key_result: () => 'Updated goal progress',
  create_reminder: (a) => `Reminder${a?.title ? ` “${a.title}”` : ''}`,
  capture_idea: (a) => `Captured${a?.title ? ` “${a.title}”` : ' an idea'}`,
  note_to_coach: () => 'Passed a note to your coach',
  open_page: () => 'Opening the page',
  find_actions: (a) => `Looked up tasks${a?.query ? ` “${a.query}”` : ''}`,
  remember: (a) => `Noted${a?.content ? `: “${a.content}”` : ''}`,
  forget: () => 'Forgot a memory',
};

// Microphone errors → what to actually do about them.
const MIC_ERR = {
  'not-allowed': 'The microphone is blocked. Click the lock icon in the address bar, allow the microphone for this site, then tap the orb again.',
  'service-not-allowed': 'This browser won’t let the site use speech recognition. Chrome, Edge or Safari work best.',
  'audio-capture': 'No microphone was found. Plug one in (or pick one in your system sound settings) and try again.',
  network: 'The browser’s speech service can’t be reached. Check your connection — Brave and some privacy browsers block it; Chrome, Edge or Safari work.',
  'language-not-supported': 'Speech recognition doesn’t support the chosen language here. Pick another language below.',
  unsupported: 'This browser can’t do speech-to-text. Type below, or use Chrome, Edge or Safari to talk.',
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

// Saved tool log → activity pills (and approve cards for proposals).
const pillsFrom = (tools) => (Array.isArray(tools) ? tools : [])
  .filter(t => ACT_LABEL[t.name] && !t.result?.proposed && t.result?.ok !== false)
  .map(t => ({ text: ACT_LABEL[t.name](t.args || {}), done: true }));
const parseTools = (v) => { if (Array.isArray(v)) return v; try { return JSON.parse(v || 'null') || []; } catch { return []; } };

// Saved thread (Jarvis conversation or coach thread) → orb exchanges.
function toTurns(msgs, coach = null) {
  const out = [];
  for (const m of msgs || []) {
    if (m.role === 'user') out.push({ you: m.content, reply: '', acts: [], coach, tools: [] });
    else if (m.role === 'assistant') {
      const tools = parseTools(m.tools);
      const turn = { you: '', reply: m.content || '', acts: pillsFrom(tools), coach, tools, msgId: m.id };
      const last = out[out.length - 1];
      if (last && !last.reply && !last.msgId) Object.assign(last, { reply: turn.reply, acts: turn.acts, tools, msgId: m.id });
      else out.push(turn);
    }
  }
  return out.slice(-12);
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
// hands-free mode) to talk, or type in the panel; it thinks, acts, and speaks.
export default function VoiceOrb() {
  const { api } = useContext(AuthContext);
  const { refreshData } = useContext(AppContext);
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [state, setState] = useState('idle'); // idle | listening | thinking | speaking
  const [open, setOpen] = useState(false);
  const [transcript, setTranscript] = useState(''); // live user text this turn
  const [reply, setReply] = useState('');            // live streaming reply this turn
  const [acts, setActs] = useState([]);              // activity pills this turn
  const [turns, setTurns] = useState([]);            // committed exchanges
  const [hs, setHs] = useState(() => localStorage.getItem('orb.hs') === '1'); // hands-free
  // Talk over it: speaking while it answers stops it and becomes your next request.
  // Off = the old way (tap the orb or Stop). Saved per device.
  const [barge, setBarge] = useState(() => localStorage.getItem('orb.barge') !== '0');
  const [voices, setVoices] = useState([]);
  const [voice, setVoice] = useState(() => getVoiceName());
  const [lang, setLang] = useState(() => getSpeechLangSetting());
  const [coaches, setCoaches] = useState([]);
  const [activeCoach, setActiveCoach] = useState(null); // null = general Jarvis
  const [suggested, setSuggested] = useState(null);     // coach hand-off suggestion
  const [micErr, setMicErr] = useState(null);           // what went wrong with the mic, in words
  const [heardNothing, setHeardNothing] = useState(false);
  const [typed, setTyped] = useState('');
  const [loaded, setLoaded] = useState(false);          // saved thread restored

  const convId = useRef(null);
  const hsRef = useRef(hs); hsRef.current = hs;
  const turnsRef = useRef(turns); turnsRef.current = turns;
  const coachesRef = useRef(coaches); coachesRef.current = coaches;
  const endingRef = useRef(false);          // set when a stop phrase ends the loop
  const activeCoachRef = useRef(null); activeCoachRef.current = activeCoach;
  const coachMsgs = useRef([]);             // this session's exchange with a coach, for its memory
  const actsRef = useRef([]);
  const toolsRef = useRef([]);              // this turn's tool log, in the server's shape
  const threadRef = useRef(null);
  const inputRef = useRef(null);
  const interruptRef = useRef(false);   // set when the user stops a reply mid-stream
  const readerRef = useRef(null);       // active response stream, so we can abort it
  const abortRef = useRef(null);        // aborts the HTTP request itself (server stops generating)
  const autoListenRef = useRef(false);  // this listen wasn't started by a tap (errors stay quiet)
  const spokenRef = useRef('');         // what the orb has said aloud this reply (to tell its echo from you)
  const replySpeakingRef = useRef(false); // speaking a REPLY (not a one-line confirmation)
  const bargedRef = useRef(false);      // you interrupted; the barge recognizer now holds your request

  useEffect(() => onVoicesReady(setVoices), []);
  useEffect(() => { api.getCoaches().then(c => setCoaches(Array.isArray(c) ? c : [])).catch(() => {}); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // Reconcile the active coach's session into its memory when the orb unmounts.
  useEffect(() => () => {
    abortListening(); stopWakeWord(); cancelSpeak();
    flushCoachMemory(activeCoachRef.current);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // Keep the thread scrolled to the newest message.
  useEffect(() => { if (threadRef.current) threadRef.current.scrollTop = threadRef.current.scrollHeight; }, [turns, reply, transcript, acts, micErr, heardNothing]);

  // Pick up where you left off: the last Jarvis conversation (if it's recent) comes back
  // the first time the panel opens — same thread you see in Coach → Jarvis.
  useEffect(() => {
    if (!open || loaded) return;
    setLoaded(true);
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(CONV_KEY) || 'null'); } catch { /* ignore */ }
    if (!saved?.id || Date.now() - (saved.at || 0) > CONV_TTL) { localStorage.removeItem(CONV_KEY); return; }
    convId.current = saved.id;
    api.getAiConversation(saved.id)
      .then(c => { if (c?.messages && !turnsRef.current.length) setTurns(toTurns(c.messages)); else if (!c?.messages) { convId.current = null; localStorage.removeItem(CONV_KEY); } })
      .catch(() => {});
  }, [open, loaded]); // eslint-disable-line react-hooks/exhaustive-deps

  const rememberConv = (id) => { convId.current = id; try { localStorage.setItem(CONV_KEY, JSON.stringify({ id, at: Date.now() })); } catch { /* noop */ } };

  const flushCoachMemory = (coach) => {
    if (coach && coachMsgs.current.length >= 2) {
      const t = coachMsgs.current.map(m => `${m.role === 'user' ? 'User' : 'Coach'}: ${m.content}`).join('\n');
      api.coachRemember(coach.id, t).catch(() => {});
    }
  };

  // Switching to a coach shows the end of its saved thread (check-ins, earlier chats);
  // back to Jarvis shows the Jarvis conversation again.
  const switchCoach = (c) => {
    flushCoachMemory(activeCoachRef.current);
    setActiveCoach(c); coachMsgs.current = []; setSuggested(null);
    setTurns([]);
    if (c) {
      api.getCoachMessages(c.id, 12).then(r => { if (activeCoachRef.current?.id === c.id) setTurns(toTurns(r?.messages, c)); }).catch(() => {});
    } else if (convId.current) {
      api.getAiConversation(convId.current).then(r => { if (!activeCoachRef.current && r?.messages) setTurns(toTurns(r.messages)); }).catch(() => {});
    }
  };

  // Speak a short line, then listen or idle.
  const say = (line, { thenListen = false } = {}) => {
    replySpeakingRef.current = false;
    if (ttsSupported()) { setState('speaking'); speak(line, { onEnd: () => (thenListen ? listen({ auto: true }) : setState('idle')) }); }
    else if (thenListen) listen({ auto: true }); else setState('idle');
  };

  // Tap (or wake word): start listening straight away — no spoken greeting to talk over.
  // A short chime says "go". Safari only allows the mic from inside the tap itself, so
  // when nothing else holds the mic we start synchronously.
  const begin = () => {
    endingRef.current = false;
    setOpen(true);
    if (!sttSupported()) { setMicErr(MIC_ERR.unsupported); setTimeout(() => inputRef.current?.focus(), 50); return; }
    cancelSpeak();
    if (wakeListening()) stopWakeWord().then(() => { listenCue(); listen(); });
    else { listenCue(); listen(); }
  };

  // Stop the assistant right now — cut the speech AND abort the response stream so
  // no more of it gets spoken. Works whether it's thinking or mid-sentence.
  const interrupt = () => {
    interruptRef.current = true;
    endingRef.current = true;
    bargedRef.current = false;
    abortBargeIn();
    cancelSpeak();
    try { readerRef.current && readerRef.current.cancel(); } catch { /* noop */ }
    readerRef.current = null;
    try { abortRef.current && abortRef.current.abort(); } catch { /* noop */ }
    abortRef.current = null;
    setState('idle');
  };

  // You spoke over the reply: stop talking and stop generating, but keep the mic — what
  // you're saying is the next request (the barge recognizer carries it to ask()).
  const cutForBarge = () => {
    bargedRef.current = true;
    interruptRef.current = true;
    cancelSpeak();
    try { readerRef.current && readerRef.current.cancel(); } catch { /* noop */ }
    readerRef.current = null;
    try { abortRef.current && abortRef.current.abort(); } catch { /* noop */ }
    abortRef.current = null;
    setOpen(true); setState('listening'); setTranscript(''); setMicErr(null); setHeardNothing(false);
  };

  const listen = ({ auto = false } = {}) => {
    if (!sttSupported()) return;
    cancelSpeak();
    autoListenRef.current = auto;
    setOpen(true); setState('listening'); setTranscript(''); setMicErr(null); setHeardNothing(false);
    let failed = false;
    startListening({
      onInterim: (t) => setTranscript(t),
      onFinal: (t) => {
        if (t) { ask(t, { spoken: true }); return; }
        setState('idle'); setTranscript('');
        if (!failed && !autoListenRef.current) setHeardNothing(true);
      },
      onError: (e) => {
        failed = true;
        // A re-listen the browser refused (no tap behind it) just goes quiet.
        if (autoListenRef.current && (e === 'not-allowed' || e === 'service-not-allowed')) return;
        setMicErr(MIC_ERR[e] || `The microphone stopped (${e}). Tap the orb to try again, or type below.`);
      },
    });
  };

  const pushAct = (o) => { actsRef.current = [...actsRef.current, o]; setActs(actsRef.current); };
  const markActDone = (ok = true) => {
    const arr = [...actsRef.current];
    for (let i = arr.length - 1; i >= 0; i--) { if (!arr[i].done) { arr[i] = { ...arr[i], done: true, failed: !ok }; break; } }
    actsRef.current = arr; setActs(arr);
  };

  // ---------- proposals (edits, deletes — and anything the model only suggested) ----------
  // Only the LATEST exchange's suggestions answer to a spoken "yes" — an older card never
  // swallows a "yes" meant for the assistant's question (tap those instead).
  const pendingProposals = () => {
    const ti = turnsRef.current.length - 1;
    const last = turnsRef.current[ti];
    return (last?.tools || []).map((tool, j) => ({ tool, j })).filter(x => x.tool.result?.proposed && !x.tool.status).map(({ j }) => ({ ti, j }));
  };
  const saveTools = (turn) => {
    if (!turn?.msgId) return;
    const save = turn.coach ? api.saveCoachMessageTools : api.aiSaveMessageTools;
    save(turn.msgId, turn.tools).catch(() => {});
  };
  const setToolStatus = (ti, j, patch) => setTurns(prev => {
    const next = prev.map((t, i) => (i !== ti ? t : { ...t, tools: t.tools.map((x, k) => (k === j ? { ...x, ...patch } : x)) }));
    if (patch.status === 'applied' || patch.status === 'dismissed') saveTools(next[ti]);
    return next;
  });
  const approve = async (ti, j) => {
    const tool = turnsRef.current[ti]?.tools?.[j];
    if (!tool?.result?.proposed || tool.status) return false;
    setToolStatus(ti, j, { status: 'applying' });
    try {
      const res = await api.aiApplyProposal({ kind: tool.result.kind, payload: tool.result.payload });
      if (!res || res.error || res.ok === false) throw new Error(res?.error || 'Could not apply that');
      setToolStatus(ti, j, { status: 'applied', applied: res });
      return true;
    } catch (e) {
      setToolStatus(ti, j, { status: undefined });
      showToast(e.message || 'Could not apply that', 'error');
      return false;
    }
  };
  const dismiss = (ti, j) => setToolStatus(ti, j, { status: 'dismissed' });

  // ---------- one exchange ----------
  const ask = async (text, { spoken = false } = {}) => {
    setHeardNothing(false); setMicErr(null);
    const hasPending = pendingProposals();
    // "Yes" / "no" answers whatever is waiting for approval — no AI call needed.
    if (hasPending.length && YES_RE.test(text)) {
      setTranscript(text); setState('thinking');
      let ok = 0; for (const p of hasPending) if (await approve(p.ti, p.j)) ok++;
      if (refreshData) refreshData();
      setTurns(t => [...t, { you: text, reply: ok ? `Done — applied ${ok === 1 ? 'it' : `all ${ok}`}.` : 'That didn’t go through.', acts: [], coach: activeCoachRef.current, tools: [] }]);
      setTranscript('');
      return spoken ? say(ok ? 'Done.' : 'That didn’t go through.', { thenListen: hsRef.current && !endingRef.current }) : setState('idle');
    }
    if (hasPending.length && NO_RE.test(text)) {
      hasPending.forEach(p => dismiss(p.ti, p.j));
      setTurns(t => [...t, { you: text, reply: 'Okay, skipped.', acts: [], coach: activeCoachRef.current, tools: [] }]);
      return spoken ? say('Okay, skipped.', { thenListen: hsRef.current && !endingRef.current }) : setState('idle');
    }
    // End a hands-free conversation.
    if (STOP_RE.test(text)) { endingRef.current = true; setTranscript(''); setSuggested(null); setTurns(t => [...t, { you: text, reply: 'Okay — I’m here when you need me.', acts: [], tools: [] }]); return spoken ? say('Okay — I’m here when you need me.') : setState('idle'); }
    // Explicit coach routing (no AI call).
    const cmd = matchCoachCommand(text, coachesRef.current);
    if (cmd?.toJarvis) { switchCoach(null); setTranscript(''); return spoken ? say('Back to Jarvis. What do you need?', { thenListen: true }) : setState('idle'); }
    if (cmd?.coach) { switchCoach(cmd.coach); setTranscript(''); return spoken ? say(`You’re with ${cmd.coach.name} now. Go ahead.`, { thenListen: true }) : setState('idle'); }

    const coach = activeCoachRef.current;
    interruptRef.current = false;
    bargedRef.current = false;
    spokenRef.current = '';
    replySpeakingRef.current = false;
    setState('thinking'); setTranscript(text); setReply(''); setSuggested(null);
    actsRef.current = []; setActs([]); toolsRef.current = [];
    let full = '', msgId = null, navTo = null;

    const canSpeak = spoken && ttsSupported();
    let sbuf = '', pending = 0, streamDone = false, started = false;
    // After the reply: keep the conversation going in hands-free mode, or when the
    // assistant just asked something (so you can simply answer).
    const followUp = () => spoken && !endingRef.current && (hsRef.current || /\?\s*$/.test(full.trim()));
    const finishIfDone = () => {
      if (interruptRef.current) return;
      if (streamDone && pending === 0) { if (followUp()) listen({ auto: true }); else setState('idle'); }
    };
    const flush = (chunk) => {
      if (interruptRef.current || !canSpeak || !chunk.trim()) return;
      spokenRef.current += ` ${chunk}`;
      if (!started) { started = true; replySpeakingRef.current = true; setState('speaking'); }
      pending++; speakChunk(chunk, { onEnd: () => { pending--; finishIfDone(); } });
    };
    const drain = () => { let m; while ((m = sbuf.match(SENTENCE))) { const s = m[0]; sbuf = sbuf.slice(s.length); flush(s); } };

    const request = (modelKey) => {
      const controller = new AbortController();
      abortRef.current = controller;
      return coach
        ? api.coachChatStream(coach.id, { messages: [{ role: 'user', content: text }], autoMode: true, voice: true, ...(modelKey ? { modelKey } : {}) }, controller.signal)
        : api.aiChatStream({ conversationId: convId.current, modelKey: modelKey || undefined, message: text, webSearch: false, rpmMode: true, autoMode: true, voice: true }, controller.signal);
    };

    try {
      if (coach) coachMsgs.current.push({ role: 'user', content: text });
      // The server falls back to your saved default model; a model this browser remembers
      // but that no longer exists is forgotten and the request retried without it.
      let res = await request(localStorage.getItem('ai.modelKey'));
      if (!res.ok || !res.body) {
        let m = 'Request failed'; try { m = (await res.json()).error || m; } catch { /* ignore */ }
        if (/unknown model|no longer available/i.test(m) && localStorage.getItem('ai.modelKey')) {
          localStorage.removeItem('ai.modelKey');
          res = await request(null);
          if (!res.ok || !res.body) { m = 'Request failed'; try { m = (await res.json()).error || m; } catch { /* ignore */ } throw new Error(m); }
        } else throw new Error(m);
      }
      const reader = res.body.getReader();
      readerRef.current = reader;
      const dec = new TextDecoder();
      let buf = '', acted = false;
      while (true) {
        if (interruptRef.current) break;
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let sep;
        while ((sep = buf.indexOf('\n\n')) >= 0) {
          const frame = buf.slice(0, sep); buf = buf.slice(sep + 2);
          const line = frame.split('\n').find(l => l.startsWith('data:'));
          if (!line) continue;
          let ev; try { ev = JSON.parse(line.slice(5).trim()); } catch { continue; }
          if (ev.type === 'meta' && ev.conversationId && !coach) rememberConv(ev.conversationId);
          else if (ev.type === 'delta') { full += ev.text; setReply(full); sbuf += ev.text; drain(); }
          else if (ev.type === 'tool_call') {
            toolsRef.current.push({ name: ev.name, args: ev.args, done: false });
            const f = ACT_LABEL[ev.name]; if (f) pushAct({ text: f(ev.args || {}), done: false, name: ev.name });
          } else if (ev.type === 'tool_result') {
            const tl = toolsRef.current;
            for (let i = tl.length - 1; i >= 0; i--) if (tl[i].name === ev.name && !tl[i].done) { tl[i] = { ...tl[i], done: true, result: ev.result }; break; }
            const r = ev.result || {};
            if (r.navigate) navTo = r.navigate;
            if (r.proposed) {
              // A suggestion, not a change — the card below carries it; drop the pill.
              const arr = [...actsRef.current]; const i = arr.findLastIndex(a => !a.done); if (i >= 0) arr.splice(i, 1);
              actsRef.current = arr; setActs(arr);
            } else { if (r.ok !== false && ev.name !== 'open_page' && ev.name !== 'find_actions') acted = true; markActDone(r.ok !== false); }
          }
          else if (ev.type === 'saved') msgId = ev.messageId;
          else if (ev.type === 'error') { full += (full ? '\n' : '') + '⚠️ ' + (ev.message || 'error'); setReply(full); }
        }
      }
      readerRef.current = null;
      if (acted && refreshData) refreshData();
      if (navTo) navigate(navTo);
      if (coach && full.trim()) coachMsgs.current.push({ role: 'assistant', content: full });
      if (!coach && convId.current) rememberConv(convId.current);
      // Commit this exchange into the thread and offer a hand-off if it fit a coach.
      const stopped = interruptRef.current;
      const sug = stopped ? null : suggestCoach(text, coachesRef.current, coach);
      // Snapshot now: the updater runs later, after these refs are reset for the next turn.
      const turn = { you: text, reply: full + (stopped && full ? ' …' : ''), acts: actsRef.current, coach, tools: toolsRef.current, msgId };
      setTurns(t => [...t, turn]);
      setTranscript(''); setReply(''); actsRef.current = []; setActs([]);
      if (sug) setSuggested(sug);
      if (stopped) { if (!bargedRef.current) setState('idle'); return; }   // cut off — don't speak the rest; a barge-in is already listening
      streamDone = true;
      if (sbuf.trim()) { flush(sbuf); sbuf = ''; }
      if (!started) { if (followUp()) listen({ auto: true }); else setState('idle'); }
      else finishIfDone();
    } catch (e) {
      readerRef.current = null;
      if (interruptRef.current) { if (!bargedRef.current) setState('idle'); return; }  // abort throws — that's expected
      setState('idle');
      setTurns(t => [...t, { you: text, reply: '⚠️ ' + (e.message || 'Something went wrong'), acts: [], coach, tools: [] }]);
      setTranscript(''); setReply('');
      if (canSpeak) speak('Sorry — that didn’t work. The details are on screen.');
    }
  };

  // While a reply is being spoken, listen for you talking over it.
  useEffect(() => {
    if (state !== 'speaking' || !barge || !replySpeakingRef.current || !bargeSupported()) return undefined;
    startBargeIn({
      isGenuine: (heard) => isBargeIn(heard, spokenRef.current),
      onBarge: cutForBarge,
      onInterim: (t) => setTranscript(t),
      onFinal: (t) => {
        bargedRef.current = false;
        if (!t || isOnlyStop(t)) { setTranscript(''); setState('idle'); return; }   // "stop" → just stop
        ask(t, { spoken: true });
      },
    });
    return () => stopBargeIn();   // reply finished without an interruption
  }, [state, barge]); // eslint-disable-line react-hooks/exhaustive-deps

  // Hands-free: arm "Hey RPM" whenever idle. One recognizer at a time, so it only
  // runs while idle (not while listening/speaking), and it auto-restarts itself.
  useEffect(() => {
    if (!hs || state !== 'idle') { stopWakeWord(); return; }
    startWakeWord({
      onWake: () => begin(),
      onError: (e) => {
        if (e === 'not-allowed' || e === 'service-not-allowed') {
          setHs(false); localStorage.setItem('orb.hs', '0');
          showToast('Mic permission is needed for hands-free.', 'error');
        }
      },
    });
    return () => { stopWakeWord(); };
  }, [hs, state]); // eslint-disable-line react-hooks/exhaustive-deps

  const orbClick = () => {
    if (state === 'idle') begin();
    else if (state === 'listening') stopListening();       // settles → onFinal → ask
    else interrupt();                                       // speaking OR thinking → stop now
  };
  const close = () => { interrupt(); abortListening(); setOpen(false); setMicErr(null); setHeardNothing(false); };
  const toggleBarge = () => setBarge(v => {
    const nv = !v;
    localStorage.setItem('orb.barge', nv ? '1' : '0');
    if (!nv) stopBargeIn();
    return nv;
  });
  // A fresh conversation: the assistant forgets this thread's context too.
  const newChat = () => {
    setTurns([]); setSuggested(null); setMicErr(null); setHeardNothing(false);
    if (activeCoach) { flushCoachMemory(activeCoach); coachMsgs.current = []; }
    else { convId.current = null; localStorage.removeItem(CONV_KEY); }
  };
  const toggleHs = () => setHs(v => {
    const nv = !v;
    localStorage.setItem('orb.hs', nv ? '1' : '0');
    if (!nv) { stopWakeWord(); endingRef.current = true; }
    else showToast('Hands-free on — say “Hey RPM” or tap. It keeps listening and sleeps when you pause.', 'info');
    return nv;
  });
  const sendTyped = (e) => {
    e?.preventDefault();
    const t = typed.trim();
    if (!t || state === 'thinking') return;
    if (state === 'listening') abortListening();
    if (state === 'speaking') cancelSpeak();
    setTyped('');
    ask(t, { spoken: false });
  };

  const canBarge = barge && bargeSupported();
  const label = { listening: 'Listening…', thinking: 'Thinking…', speaking: canBarge ? 'Speaking — talk to interrupt' : 'Speaking…' }[state] || (hs ? 'Say “Hey RPM” or tap' : 'Tap to talk');
  const subtitle = activeCoach
    ? `Focused on ${activeCoach.category_name || activeCoach.name}`
    : 'Sees your day, week, goals & coaches';
  const empty = !turns.length && !transcript && !reply;
  const busy = state === 'thinking';

  const Proposal = ({ tool, ti, j }) => (
    <div className={`vorb-prop ${tool.status || ''}`}>
      <span className="vorb-prop-label">{tool.result.label}</span>
      {tool.status === 'applied' ? <span className="vorb-prop-state"><Check size={12} /> Done</span>
        : tool.status === 'dismissed' ? <span className="vorb-prop-state">Skipped</span>
          : (
            <span className="vorb-prop-btns">
              <button type="button" className="vorb-prop-yes" disabled={tool.status === 'applying'} onClick={() => approve(ti, j).then(ok => ok && refreshData && refreshData())}>
                {tool.status === 'applying' ? <Loader2 size={12} className="vorb-spin" /> : <Check size={12} />} Approve
              </button>
              <button type="button" className="vorb-prop-no" disabled={tool.status === 'applying'} onClick={() => dismiss(ti, j)}>Skip</button>
            </span>
          )}
    </div>
  );

  const Exchange = ({ ex, ti }) => (
    <div className="vorb-ex">
      {ex.you && <div className="vorb-bubble you">{ex.you}</div>}
      {ex.acts?.map((a, i) => (
        <div key={i} className={`vorb-act ${a.done ? 'done' : ''} ${a.failed ? 'failed' : ''}`}>
          {!a.done ? <Loader2 size={12} className="vorb-spin" /> : a.failed ? <AlertTriangle size={12} /> : <Check size={12} />}{a.text}
        </div>
      ))}
      {(ex.reply || ex.streaming) && (
        <div className="vorb-bubble bot">
          <CoachAv coach={ex.coach} size={20} />
          <div className="vorb-bubble-md"><Markdown>{ex.reply}</Markdown></div>
        </div>
      )}
      {ti != null && ex.tools?.map((tool, j) => (tool.result?.proposed ? <Proposal key={j} tool={tool} ti={ti} j={j} /> : null))}
      {ti != null && ex.tools?.filter(t => t.result?.ok && t.result?.link && !t.result?.proposed && t.name !== 'open_page').slice(0, 1).map((t, j) => (
        <button key={`l${j}`} type="button" className="vorb-open" onClick={() => navigate(t.result.link)}><ExternalLink size={11} /> Open</button>
      ))}
    </div>
  );

  const pendingCount = (turns[turns.length - 1]?.tools || []).filter(x => x.result?.proposed && !x.status).length;

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
              {(state === 'thinking' || state === 'speaking') && (
                <button className="vorb-mini stop" onClick={interrupt} title="Stop"><Square size={11} /> Stop</button>
              )}
              {!busy && state !== 'speaking' && turns.length > 0 && <button className="vorb-mini" onClick={newChat} title="Start a new conversation"><Plus size={11} /> New</button>}
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
            {empty && !micErr && (
              <div className="vorb-hint">
                {activeCoach
                  ? <>Talking to <strong>{activeCoach.name}</strong> — ask about this area, or say “back to Jarvis”.</>
                  : (
                    <>
                      <strong>Try:</strong>
                      <ul>
                        <li>“What’s my must-win today?”</li>
                        <li>“Add call the plumber tomorrow at 9 and remind me at 8:45.”</li>
                        <li>“I finished the pricing FAQ — tell my {coaches[0]?.name?.replace(/\s*coach$/i, '') || 'business'} coach.”</li>
                        <li>“Open my roadmap.”</li>
                      </ul>
                    </>
                  )}
              </div>
            )}
            {turns.map((ex, i) => <Exchange key={i} ex={ex} ti={i} />)}
            {/* live, in-progress turn */}
            {(transcript || reply || acts.length > 0) && (
              <Exchange ex={{ you: transcript, acts, reply, coach: activeCoach, streaming: state === 'thinking' || state === 'speaking' }} />
            )}
            {state === 'listening' && !transcript && <div className="vorb-listening"><span /><span /><span /> Listening — speak now</div>}
            {heardNothing && <div className="vorb-note">I didn’t hear anything. Tap the orb and speak, or type below.</div>}
            {micErr && <div className="vorb-err"><AlertTriangle size={14} /><span>{micErr}</span></div>}
            {pendingCount > 0 && state !== 'thinking' && <div className="vorb-note">Say “yes” to approve {pendingCount > 1 ? 'these' : 'this'}, or “no” to skip.</div>}
            {suggested && (
              <button className="vorb-suggest" onClick={() => switchCoach(suggested)}>
                <span className="vorb-cp-em">{suggested.avatar_image ? <img src={suggested.avatar_image} alt="" /> : (suggested.avatar_emoji || '🧭')}</span>
                This fits your {suggested.name} — hand off?
              </button>
            )}
          </div>

          <form className="vorb-type" onSubmit={sendTyped}>
            <input
              ref={inputRef} value={typed} onChange={(e) => setTyped(e.target.value)}
              placeholder={activeCoach ? `Message ${activeCoach.name}…` : 'Type to Jarvis…'} aria-label="Type a message" disabled={busy}
            />
            <button type="submit" className="vorb-send" disabled={!typed.trim() || busy} aria-label="Send"><SendHorizontal size={15} /></button>
          </form>

          <div className="vorb-settings">
            {bargeSupported() && ttsSupported() && (
              <button
                type="button" role="switch" aria-checked={barge} className={`vorb-switch ${barge ? 'on' : ''}`} onClick={toggleBarge}
                title={barge
                  ? 'On: just start talking while it answers — it stops and listens. (Headphones help in loud rooms.) Turn off to interrupt only by tapping.'
                  : 'Off: tap the orb or Stop to interrupt. Turn on to interrupt just by talking.'}
              >
                <Speech size={13} /> Talk over it <span className="vorb-switch-track"><i /></span>
              </button>
            )}
            {sttSupported() && (
              <Picker
                className="vorb-voice vorb-lang"
                value={lang}
                title="Language you speak"
                header="I speak"
                onChange={(v) => { setLang(v); setSpeechLang(v); }}
                options={LANGS.map(([value, l]) => ({ value, label: l, icon: value === '' ? <Languages size={13} /> : undefined }))}
              />
            )}
            {ttsSupported() && voices.length > 0 && (
              <Picker
                className="vorb-voice"
                value={voice}
                title="Pick a voice"
                header="Voice"
                onChange={(v) => { setVoice(v); saveVoiceName(v); cancelSpeak(); speak('This is my voice now.'); }}
                options={[
                  { value: '', label: 'Auto (best available)' },
                  ...voices
                    .filter(v => (v.lang || '').toLowerCase().startsWith((lang || navigator.language || 'en').slice(0, 2).toLowerCase()))
                    .map(v => ({ value: v.name, label: v.name })),
                ]}
              />
            )}
          </div>
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
        {pendingCount > 0 && <span className="vorb-pending" aria-label={`${pendingCount} waiting for approval`}>{pendingCount}</span>}
      </button>
    </div>,
    document.body
  );
}
