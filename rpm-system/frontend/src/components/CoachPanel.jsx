import { useState, useEffect, useLayoutEffect, useRef, useContext, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  Sparkles, Send, Loader2, Brain, Trash2, Pin, PinOff, Wand2, Lock, Settings2, Upload, Check,
  CalendarDays, Clock, TrendingDown, X, CalendarClock, BellRing, BellOff, ChevronLeft,
} from 'lucide-react';
import { AuthContext } from '../App';
import { useToast } from './ToastProvider';
import CoachThread from './CoachThread';
import { fileToCompressedDataURL } from '../utils/image';
import { BRIEF_ME, DAY_SHORT, WEEK_ORDER, fixPrompt, localToday, parseDays, scheduleLabel } from '../utils/coach';
import './CoachPanel.css';

const EMOJIS = ['🧭', '💰', '❤️', '💪', '🧠', '🚀', '🎯', '📈', '🌱', '🔥', '⚡', '🦉', '🧘', '📚', '🎨', '🤝'];

export function CoachAvatar({ c, size = 30 }) {
  const style = { width: size, height: size, fontSize: Math.round(size * 0.55) };
  if (c?.avatar_image) return <img src={c.avatar_image} className="coach-avatar" style={style} alt="" />;
  const color = c?.color || '#4ECDC4';
  return <span className="coach-avatar" style={{ ...style, background: color + '22', border: `1px solid ${color}66` }} aria-hidden="true">{c?.avatar_emoji || '🧭'}</span>;
}

// Proposal status is saved server-side; transient UI states are not.
const persistable = (tools) => tools.map(t => (t.status === 'applying' ? { ...t, status: undefined } : t));

// The full coach experience: setup (locked → draft → create) or, once a coach exists, its
// saved thread (check-ins, follow-ups, alerts, chat, proposals), composer and settings.
// Open by category/project, or directly by coachId (Coaches page, drawer).
// variant: 'card' (inline container) | 'drawer' (fills CoachDrawer, has a close button).
// request: { nonce, send?, focus? } — a one-shot instruction from the host (send a message / focus the composer).
export default function CoachPanel({
  scope = 'category', categoryId, projectId, coachId, variant = 'card', onClose, request, onCoachChange, onApplied,
}) {
  const { api } = useContext(AuthContext);
  const { showToast } = useToast();
  const [phase, setPhase] = useState('loading'); // loading | none | draft | ready
  const [ready, setReady] = useState(false);
  const [missing, setMissing] = useState([]);
  const [coach, setCoach] = useState(null);
  const [draft, setDraft] = useState(null);
  const [busy, setBusy] = useState(false);
  const [thread, setThread] = useState([]);
  const [threadLoaded, setThreadLoaded] = useState(false);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [checkingIn, setCheckingIn] = useState(false);
  const [showMem, setShowMem] = useState(false);
  const [memory, setMemory] = useState([]);
  const [showSettings, setShowSettings] = useState(false);
  const [edit, setEdit] = useState(null);
  const [snap, setSnap] = useState(null);
  const turns = useRef(0);
  const threadRef = useRef([]); threadRef.current = thread;
  const coachRef = useRef(null); coachRef.current = coach;
  const fileRef = useRef(null);
  const listRef = useRef(null);
  const inputRef = useRef(null);
  const handledReq = useRef(null);
  const isDrawer = variant === 'drawer';

  const loadStatus = async () => {
    try {
      if (coachId) { const c = await api.getCoach(coachId); if (c && c.id) { setCoach(c); setPhase('ready'); return; } }
      const res = scope === 'project' ? await api.getProjectCoach(projectId) : await api.getCategoryCoach(categoryId);
      if (res.coach) { const full = await api.getCoach(res.coach.id).catch(() => res.coach); setCoach(full); setPhase('ready'); }
      else { setReady(scope === 'project' ? true : !!res.ready); setMissing(res.missing || []); setPhase('none'); }
    } catch { setPhase('none'); }
  };
  useEffect(() => { setThread([]); setThreadLoaded(false); loadStatus(); }, [categoryId, projectId, coachId]); // eslint-disable-line react-hooks/exhaustive-deps

  // The saved thread; opening it marks everything read.
  const loadThread = useCallback(async (markRead = false) => {
    const c = coachRef.current; if (!c?.id) return;
    try {
      const res = await api.getCoachMessages(c.id, 60);
      if (Array.isArray(res?.messages)) setThread(res.messages);
      if (markRead && res?.unread > 0) api.markCoachRead(c.id).catch(() => {});
    } catch { /* keep what we have */ }
    finally { setThreadLoaded(true); }
  }, [api]);

  const loadSnap = useCallback(() => {
    const c = coachRef.current; if (!c?.id) return;
    api.getCoachSnapshot(c.id, localToday()).then(s => setSnap(s && !s.error ? s : null)).catch(() => {});
  }, [api]);

  useEffect(() => {
    if (phase !== 'ready' || !coach?.id) return;
    loadThread(true);
    loadSnap();
  }, [phase, coach?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep the newest message in view.
  useLayoutEffect(() => {
    const el = listRef.current; if (el) el.scrollTop = el.scrollHeight;
  }, [thread, showSettings]);

  const flushMemory = async () => {
    const c = coachRef.current;
    if (!c || turns.current === 0) return;
    turns.current = 0;
    const t = threadRef.current.filter(m => m.content && (m.kind || 'chat') === 'chat').slice(-12)
      .map(m => `${m.role === 'user' ? 'Them' : 'Coach'}: ${m.content}`).join('\n');
    if (t) { try { await api.coachRemember(c.id, t); } catch { /* ignore */ } }
  };
  useEffect(() => () => { flushMemory(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------- setup ----------
  const modelKey = () => localStorage.getItem('ai.modelKey');
  const draftIt = async () => {
    const mk = modelKey(); if (!mk) { showToast('Pick a default AI model in Settings first.', 'info'); return; }
    setBusy(true);
    try {
      const res = await api.draftCoach(scope === 'project' ? { projectId, modelKey: mk } : { categoryId, modelKey: mk });
      if (res.error) throw new Error(res.error);
      setDraft({ name: res.name, emoji: res.emoji || '🧭', color: res.color || '#4ECDC4', responsibilities: res.responsibilities || '', persona: res.persona });
      setPhase('draft');
    } catch (e) { showToast(e.message || 'Failed to draft a coach', 'error'); }
    finally { setBusy(false); }
  };
  const createIt = async () => {
    if (!draft?.name?.trim() || !draft?.persona?.trim()) return;
    setBusy(true);
    try {
      const body = { scope, ...(scope === 'project' ? { projectId } : { categoryId }), name: draft.name, persona: draft.persona, avatar_emoji: draft.emoji, color: draft.color, responsibilities: draft.responsibilities };
      const res = await api.createCoach(body);
      if (res.error) throw new Error(res.error);
      const full = await api.getCoach(res.id).catch(() => res);
      setCoach(full && full.id ? full : res); setDraft(null); setPhase('ready');
      showToast(`${res.name} is ready`, 'success');
      onCoachChange?.();
    } catch (e) { showToast(e.message || 'Failed to create coach', 'error'); }
    finally { setBusy(false); }
  };
  const removeCoach = async () => {
    if (!window.confirm('Remove this coach? Its memory is deleted too.')) return;
    try {
      await api.deleteCoach(coach.id);
      setCoach(null); setThread([]); setShowSettings(false);
      setPhase(coachId ? 'loading' : 'none'); if (!coachId) loadStatus();
      showToast('Coach removed', 'info');
      onCoachChange?.();
      if (coachId) onClose?.();
    } catch { showToast('Failed to remove coach', 'error'); }
  };

  // ---------- settings ----------
  const openSettings = () => {
    setEdit({
      name: coach.name, avatar_emoji: coach.avatar_emoji || '🧭', color: coach.color || '#4ECDC4', avatar_image: coach.avatar_image || '',
      responsibilities: coach.responsibilities || '', persona: coach.persona || '',
      proactive: coach.proactive !== false, checkin_days: parseDays(coach.checkin_days),
      checkin_time: coach.checkin_time || '08:30', followup_time: coach.followup_time || '18:00',
    });
    setShowSettings(true);
  };
  const saveSettings = async () => {
    setBusy(true);
    try {
      const res = await api.updateCoach(coach.id, edit);
      if (res.error) throw new Error(res.error);
      setCoach(res); setShowSettings(false); showToast('Coach updated', 'success');
      onCoachChange?.();
    } catch (e) { showToast(e.message || 'Failed to save', 'error'); }
    finally { setBusy(false); }
  };
  const uploadAvatar = async (e) => {
    const f = e.target.files?.[0]; e.target.value = ''; if (!f) return;
    try { const url = await fileToCompressedDataURL(f, { maxDim: 256 }); setEdit(x => ({ ...x, avatar_image: url })); }
    catch { showToast('Could not read that image', 'error'); }
  };
  const toggleDay = (d) => setEdit(x => {
    const has = x.checkin_days.includes(d);
    return { ...x, checkin_days: parseDays(has ? x.checkin_days.filter(v => v !== d) : [...x.checkin_days, d]) };
  });

  // ---------- chat ----------
  const patchLast = (fn) => setThread(prev => {
    const n = [...prev]; const li = n.length - 1;
    if (li >= 0 && n[li].local && n[li].role === 'assistant') n[li] = fn(n[li]);
    return n;
  });
  const send = async (override) => {
    const text = (typeof override === 'string' ? override : input).trim();
    const c = coachRef.current;
    if (!text || streaming || !c) return;
    if (typeof override !== 'string') setInput('');
    const now = new Date().toISOString();
    setThread(prev => [...prev,
      { role: 'user', kind: 'chat', content: text, local: true, created_at: now, read_at: now },
      { role: 'assistant', kind: 'chat', content: '', tools: [], local: true, created_at: now, read_at: now }]);
    setStreaming(true);
    let full = '';
    try {
      const res = await api.coachChatStream(c.id, { messages: [{ role: 'user', content: text }] });
      if (!res.ok || !res.body) { let m = 'Request failed'; try { m = (await res.json()).error || m; } catch { /* ignore */ } throw new Error(m); }
      const reader = res.body.getReader(); const dec = new TextDecoder(); let buf = '';
      while (true) {
        const { done, value } = await reader.read(); if (done) break;
        buf += dec.decode(value, { stream: true }); let sep;
        while ((sep = buf.indexOf('\n\n')) >= 0) {
          const frame = buf.slice(0, sep); buf = buf.slice(sep + 2);
          const line = frame.split('\n').find(l => l.startsWith('data:')); if (!line) continue;
          let ev; try { ev = JSON.parse(line.slice(5).trim()); } catch { continue; }
          if (ev.type === 'delta') { full += ev.text; const t = full; patchLast(m => ({ ...m, content: t })); }
          else if (ev.type === 'tool_call') patchLast(m => ({ ...m, tools: [...(m.tools || []), { name: ev.name, args: ev.args, done: false }] }));
          else if (ev.type === 'tool_result') patchLast(m => {
            const tools = [...(m.tools || [])];
            for (let i = tools.length - 1; i >= 0; i--) if (tools[i].name === ev.name && !tools[i].done) { tools[i] = { ...tools[i], done: true, result: ev.result }; break; }
            return { ...m, tools };
          });
          else if (ev.type === 'error') { full += (full ? '\n\n' : '') + '⚠️ ' + (ev.message || 'error'); const t = full; patchLast(m => ({ ...m, content: t })); }
        }
      }
      turns.current++;
      if (turns.current >= 6) flushMemory();
    } catch (e) {
      patchLast(m => ({ ...m, content: '⚠️ ' + (e.message || 'failed') }));
    } finally {
      setStreaming(false);
    }
    // The server saved both turns (with ids) — swap the local copies for the saved thread.
    await loadThread(false);
  };

  // ---------- proposals / follow-ups / check-in ----------
  const setTools = (msgId, tools) => setThread(prev => prev.map(m => (m.id === msgId ? { ...m, tools } : m)));
  const toolsOf = (msgId) => (threadRef.current.find(m => m.id === msgId)?.tools || []);
  const approve = async (msgId, ti) => {
    const t = toolsOf(msgId)[ti]; if (!t || t.status) return;
    setTools(msgId, toolsOf(msgId).map((x, j) => (j === ti ? { ...x, status: 'applying' } : x)));
    try {
      const res = await api.aiApplyProposal({ kind: t.result.kind, payload: t.result.payload });
      if (!res || res.error || res.ok === false) throw new Error(res?.error || 'Failed to apply');
      const next = toolsOf(msgId).map((x, j) => (j === ti ? { ...x, status: 'applied', applied: res } : x));
      setTools(msgId, next);
      api.saveCoachMessageTools(msgId, persistable(next)).catch(() => {});
      showToast('Applied', 'success');
      loadSnap(); onApplied?.();
    } catch (e) {
      setTools(msgId, toolsOf(msgId).map((x, j) => (j === ti ? { ...x, status: undefined } : x)));
      showToast(e.message || 'Failed to apply', 'error');
    }
  };
  const dismiss = (msgId, ti) => {
    const next = toolsOf(msgId).map((x, j) => (j === ti ? { ...x, status: 'dismissed' } : x));
    setTools(msgId, next);
    api.saveCoachMessageTools(msgId, persistable(next)).catch(() => {});
  };
  const setResult = (msgId, actionId, op) => setThread(prev => prev.map(m => {
    if (m.id !== msgId) return m;
    const results = { ...(m.meta?.results || {}) };
    if (op) results[actionId] = op; else delete results[actionId];
    return { ...m, meta: { ...(m.meta || {}), results } };
  }));
  const followup = async (msgId, actionId, op) => {
    setResult(msgId, actionId, op); // optimistic
    try {
      const res = await api.coachFollowup(coachRef.current.id, actionId, op);
      if (!res || res.ok === false || res.error) throw new Error(res?.error || 'Could not update that task');
      loadSnap(); onApplied?.();
    } catch (e) {
      setResult(msgId, actionId, null);
      showToast(e.message || 'Could not update that task', 'error');
    }
  };
  const checkinNow = async () => {
    if (checkingIn || streaming) return;
    setCheckingIn(true);
    try {
      const res = await api.coachCheckinNow(coachRef.current.id);
      if (!res || res.error) throw new Error(res?.error || 'Check-in failed');
      await loadThread(true);
    } catch (e) { showToast(e.message || 'Check-in failed', 'error'); }
    finally { setCheckingIn(false); }
  };

  // ---------- host requests (Reply / Brief me / Fix this) ----------
  useEffect(() => {
    if (!request?.nonce || handledReq.current === request.nonce) return;
    if (phase !== 'ready' || !threadLoaded || streaming || showSettings) return;
    handledReq.current = request.nonce;
    if (request.send) send(request.send);
    else if (request.focus) inputRef.current?.focus();
  }, [request?.nonce, phase, threadLoaded, streaming, showSettings]); // eslint-disable-line react-hooks/exhaustive-deps

  const openMem = async () => { setShowMem(true); try { const m = await api.listCoachMemory(coach.id); setMemory(Array.isArray(m) ? m : []); } catch { /* ignore */ } };
  const delMem = async (m) => { try { await api.deleteCoachMemory(m.id); setMemory(x => x.filter(i => i.id !== m.id)); } catch { /* ignore */ } };
  const togglePin = async (m) => { try { await api.pinCoachMemory(m.id, !m.pinned); setMemory(x => x.map(i => i.id === m.id ? { ...i, pinned: !i.pinned } : i)); } catch { /* ignore */ } };

  const closeBtn = onClose ? (
    <button type="button" className="coach-mini coach-mini--icon" onClick={onClose} title="Close (Esc)" aria-label="Close coach"><X size={16} /></button>
  ) : null;

  if (phase === 'loading') {
    return (
      <section className={`coach-panel coach-panel--${variant} coach-loading`}>
        {isDrawer && <div className="coach-head coach-head--bare">{closeBtn}</div>}
        {(coachId || isDrawer) && <Loader2 size={18} className="coach-spin" />}
      </section>
    );
  }

  const locked = phase === 'none' && !ready;
  const scopeLabel = coach ? (coach.scope === 'project' ? 'Project coach' : 'Area coach') : 'AI coach';
  const status = locked ? 'Locked' : phase === 'none' ? 'Available' : phase === 'draft' ? 'Draft' : scopeLabel;
  const snapHas = snap && (snap.today?.length || snap.week_count || snap.overdue?.length || snap.at_risk?.length);

  return (
    <section
      className={`coach-panel coach-panel--${variant} coach-panel--${locked ? 'locked' : phase}`}
      style={coach?.color ? { '--coach': coach.color } : undefined}
      aria-label={coach ? `${coach.name} — coach` : 'AI coach'}
    >
      <div className="coach-head">
        <span className="coach-title">
          {coach ? <CoachAvatar c={coach} size={42} /> : <span className="coach-badge">{locked ? <Lock size={18} /> : <Sparkles size={18} />}</span>}
          <span className="coach-name-block">
            <span className={`coach-status${locked ? ' is-locked' : ''}`}>{status}</span>
            <span className="coach-name" id={isDrawer ? 'coach-drawer-title' : undefined}>{coach ? coach.name : 'AI Coach'}</span>
            {phase === 'ready' && coach && (
              <button type="button" className={`coach-sched${coach.proactive === false ? ' is-off' : ''}`} onClick={openSettings} title="Change the check-in schedule">
                {coach.proactive === false ? <BellOff size={12} /> : <CalendarClock size={12} />} {scheduleLabel(coach)}
              </button>
            )}
          </span>
        </span>
        <span className="coach-head-actions">
          {phase === 'ready' && (
            <>
              <button type="button" className="coach-mini" onClick={openMem} title="What this coach remembers"><Brain size={15} /> <span className="coach-mini-label">Memory</span></button>
              <button type="button" className={`coach-mini coach-mini--icon${showSettings ? ' on' : ''}`} onClick={() => (showSettings ? setShowSettings(false) : openSettings())} title="Coach settings" aria-label="Coach settings" aria-pressed={showSettings}><Settings2 size={15} /></button>
            </>
          )}
          {closeBtn}
        </span>
      </div>

      {phase !== 'ready' && (
        <div className="coach-scroll">
          {locked && (
            <div className="coach-locked">
              <p>
                {missing.length
                  ? <>This category's dedicated coach unlocks once it has:</>
                  : <>Add a vision or purpose and a goal to this category to unlock its dedicated coach.</>}
              </p>
              {missing.length > 0 && (
                <ul className="coach-missing">
                  {missing.map(m => <li key={m}><Lock size={12} /> {m}</li>)}
                </ul>
              )}
            </div>
          )}
          {phase === 'none' && ready && (
            <div className="coach-invite">
              <p>Give this {scope === 'project' ? 'project' : 'area'} its own coach — a specialist that knows only this {scope === 'project' ? 'project' : 'area'}'s goals, checks in on a schedule, follows up on what slipped, and gets to know you over time.</p>
              <ul className="coach-perks">
                <li><Check size={12} /> Knows only this {scope === 'project' ? 'project' : 'area'}</li>
                <li><Check size={12} /> Weekly plan &amp; review</li>
                <li><Check size={12} /> End-of-day follow-ups</li>
                <li><Check size={12} /> Changes only with your OK</li>
              </ul>
              <button type="button" className="btn btn-primary coach-cta" onClick={draftIt} disabled={busy}>
                {busy ? <><Loader2 size={15} className="coach-spin" /> Drafting…</> : <><Wand2 size={15} /> Set up a coach</>}
              </button>
            </div>
          )}
          {phase === 'draft' && draft && (
            <div className="coach-draft">
              <p className="coach-draft-note">Here's the coach I drafted — tweak anything, then create it.</p>
              <div className="coach-identity-row">
                <span className="coach-emoji-pick">
                  {EMOJIS.map(e => <button key={e} type="button" className={`coach-emoji ${draft.emoji === e ? 'on' : ''}`} onClick={() => setDraft({ ...draft, emoji: e })} aria-pressed={draft.emoji === e}>{e}</button>)}
                </span>
                <input type="color" className="coach-color" value={draft.color} onChange={e => setDraft({ ...draft, color: e.target.value })} title="Accent color" aria-label="Accent color" />
              </div>
              <label className="coach-field">Name<input className="form-input" value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} maxLength={80} /></label>
              <label className="coach-field">Responsibilities (what it owns)<input className="form-input" value={draft.responsibilities} onChange={e => setDraft({ ...draft, responsibilities: e.target.value })} maxLength={300} /></label>
              <label className="coach-field">Persona (its system prompt)<textarea className="form-input coach-persona" value={draft.persona} onChange={e => setDraft({ ...draft, persona: e.target.value })} rows={6} /></label>
              <div className="coach-draft-actions">
                <button type="button" className="btn btn-ghost" onClick={() => { setDraft(null); setPhase('none'); }}>Cancel</button>
                <button type="button" className="btn btn-secondary" onClick={draftIt} disabled={busy}>Re-draft</button>
                <button type="button" className="btn btn-primary" onClick={createIt} disabled={busy || !draft.name.trim() || !draft.persona.trim()}>Create coach</button>
              </div>
            </div>
          )}
        </div>
      )}

      {phase === 'ready' && !showSettings && (
        <div className="coach-chat">
          <div className="coach-snap">
            <span className="coach-snap-chips">
              {snap?.today?.length > 0 && <span className="ui-chip ui-chip--good"><CalendarDays size={12} /> {snap.today.length} today</span>}
              {snap?.week_count > 0 && <span className="ui-chip">{snap.week_count} this week</span>}
              {snap?.overdue?.length > 0 && <span className="ui-chip ui-chip--warn"><Clock size={12} /> {snap.overdue.length} overdue</span>}
              {snap?.at_risk?.length > 0 && <span className="ui-chip ui-chip--bad"><TrendingDown size={12} /> {snap.at_risk.length} slipping</span>}
              {!snapHas && <span className="coach-snap-quiet">Nothing due in this area</span>}
            </span>
            <span className="coach-snap-actions">
              <button type="button" className="coach-mini" onClick={checkinNow} disabled={checkingIn || streaming} title="Ask the coach for a check-in right now (in the app only)">
                {checkingIn ? <Loader2 size={14} className="coach-spin" /> : <BellRing size={14} />} Check in now
              </button>
              <button type="button" className="coach-snap-brief" onClick={() => send(BRIEF_ME)} disabled={streaming || checkingIn}>
                <Sparkles size={13} /> Brief me
              </button>
            </span>
          </div>

          <div className="coach-thread" ref={listRef} aria-live="polite">
            {!threadLoaded ? (
              <div className="coach-thread-loading"><Loader2 size={18} className="coach-spin" /></div>
            ) : thread.length === 0 ? (
              <p className="coach-empty">Ask {coach.name} anything about this area — “what should I focus on here?”, “I'm stuck on X”, “move my tasks to next week”. It proposes changes for you to approve, checks in on its schedule, and remembers what matters.</p>
            ) : (
              <CoachThread
                messages={thread}
                streaming={streaming}
                onApprove={approve}
                onDismiss={dismiss}
                onFollowup={followup}
                onFix={(lines) => send(fixPrompt(lines))}
              />
            )}
            {checkingIn && <div className="coach-checking"><Loader2 size={14} className="coach-spin" /> {coach.name} is checking in…</div>}
          </div>

          <div className="coach-composer">
            <textarea
              ref={inputRef}
              className="form-input coach-input"
              placeholder={`Message ${coach.name}…`}
              aria-label={`Message ${coach.name}`}
              value={input}
              onChange={e => { setInput(e.target.value); e.target.style.height = 'auto'; e.target.style.height = `${Math.min(e.target.scrollHeight, 140)}px`; }}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
              rows={1}
              disabled={streaming}
            />
            <button type="button" className="btn btn-primary coach-send" onClick={() => send()} disabled={!input.trim() || streaming} aria-label="Send">
              {streaming ? <Loader2 size={16} className="coach-spin" /> : <Send size={16} />}
            </button>
          </div>
        </div>
      )}

      {phase === 'ready' && showSettings && edit && (
        <div className="coach-scroll">
          <div className="coach-settings">
            <button type="button" className="coach-back" onClick={() => setShowSettings(false)}><ChevronLeft size={15} /> Back to chat</button>

            <p className="ui-kicker coach-sec"><CalendarClock size={14} /> Check-ins</p>
            <div className="coach-sched-box">
              <label className="coach-toggle">
                <input type="checkbox" checked={edit.proactive} onChange={e => setEdit({ ...edit, proactive: e.target.checked })} />
                <span className="coach-toggle-track" aria-hidden="true"><i /></span>
                <span className="coach-toggle-text">
                  <b>{edit.proactive ? 'Checks in on its own' : 'Check-ins off'}</b>
                  <span>Weekly plan on Mondays, review on Fridays, a nudge on other days — plus an end-of-day follow-up on what was due.</span>
                </span>
              </label>
              <fieldset className="coach-days" disabled={!edit.proactive}>
                <legend>Check-in days</legend>
                <div className="coach-days-row">
                  {WEEK_ORDER.map(d => (
                    <button key={d} type="button" className={`coach-day-chip${edit.checkin_days.includes(d) ? ' on' : ''}`} onClick={() => toggleDay(d)} aria-pressed={edit.checkin_days.includes(d)}>
                      {DAY_SHORT[d]}
                    </button>
                  ))}
                </div>
              </fieldset>
              <div className="coach-times">
                <label className="coach-field">Check-in time<input type="time" className="form-input" value={edit.checkin_time} disabled={!edit.proactive} onChange={e => setEdit({ ...edit, checkin_time: e.target.value })} /></label>
                <label className="coach-field">Follow-up time<input type="time" className="form-input" value={edit.followup_time} disabled={!edit.proactive} onChange={e => setEdit({ ...edit, followup_time: e.target.value })} /></label>
              </div>
            </div>

            <p className="ui-kicker coach-sec"><Sparkles size={14} /> Identity</p>
            <div className="coach-identity-row">
              <span className="coach-emoji-pick">
                {EMOJIS.map(e => <button key={e} type="button" className={`coach-emoji ${edit.avatar_emoji === e ? 'on' : ''}`} onClick={() => setEdit({ ...edit, avatar_emoji: e, avatar_image: '' })} aria-pressed={edit.avatar_emoji === e}>{e}</button>)}
              </span>
              <input type="color" className="coach-color" value={edit.color} onChange={e => setEdit({ ...edit, color: e.target.value })} title="Accent color" aria-label="Accent color" />
              <button type="button" className="coach-mini" onClick={() => fileRef.current?.click()}><Upload size={13} /> Image</button>
              {edit.avatar_image && <button type="button" className="coach-mini danger" onClick={() => setEdit({ ...edit, avatar_image: '' })}>Clear image</button>}
              <input ref={fileRef} type="file" accept="image/*" hidden onChange={uploadAvatar} />
            </div>
            {edit.avatar_image && <img src={edit.avatar_image} className="coach-avatar" style={{ width: 44, height: 44, marginBottom: 12 }} alt="" />}
            <label className="coach-field">Name<input className="form-input" value={edit.name} onChange={e => setEdit({ ...edit, name: e.target.value })} maxLength={80} /></label>
            <label className="coach-field">Responsibilities<input className="form-input" value={edit.responsibilities} onChange={e => setEdit({ ...edit, responsibilities: e.target.value })} maxLength={300} /></label>
            <label className="coach-field">Persona (system prompt)<textarea className="form-input coach-persona" value={edit.persona} onChange={e => setEdit({ ...edit, persona: e.target.value })} rows={7} /></label>
            <div className="coach-draft-actions coach-settings-actions">
              <button type="button" className="btn btn-ghost coach-remove" onClick={removeCoach}><Trash2 size={14} /> Remove coach</button>
              <span className="coach-settings-spacer" />
              <button type="button" className="btn btn-ghost" onClick={() => setShowSettings(false)}>Cancel</button>
              <button type="button" className="btn btn-primary" onClick={saveSettings} disabled={busy}><Check size={15} /> Save</button>
            </div>
          </div>
        </div>
      )}

      {showMem && createPortal(
        <div className="coach-mem-overlay" onMouseDown={() => setShowMem(false)} onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); setShowMem(false); } }}>
          <div className="coach-mem" role="dialog" aria-modal="true" aria-label={`What ${coach?.name} remembers`} onMouseDown={e => e.stopPropagation()}>
            <div className="coach-mem-head"><span><Brain size={15} /> What {coach?.name} remembers</span><button type="button" className="coach-mini" onClick={() => setShowMem(false)} autoFocus>Close</button></div>
            {memory.length === 0
              ? <p className="coach-empty">Nothing yet — it builds up as you talk.</p>
              : <ul className="coach-mem-list">
                  {memory.map(m => (
                    <li key={m.id} className={m.pinned ? 'pinned' : ''}>
                      <span className="coach-mem-kind">{m.kind}</span>
                      <span className="coach-mem-content">{m.content}</span>
                      <button type="button" className="coach-mem-btn" onClick={() => togglePin(m)} title={m.pinned ? 'Unpin' : 'Pin (never forget)'} aria-label={m.pinned ? 'Unpin' : 'Pin'}>{m.pinned ? <Pin size={13} /> : <PinOff size={13} />}</button>
                      <button type="button" className="coach-mem-btn danger" onClick={() => delMem(m)} title="Forget this" aria-label="Forget this"><Trash2 size={13} /></button>
                    </li>
                  ))}
                </ul>}
            <p className="coach-mem-note">The coach keeps only durable facts, pruned automatically. Pin anything it must never forget.</p>
          </div>
        </div>,
        document.body,
      )}
    </section>
  );
}
