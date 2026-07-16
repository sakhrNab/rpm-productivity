import { useState, useEffect, useRef, useContext } from 'react';
import { Sparkles, Send, Loader2, Brain, Trash2, Pin, PinOff, Wand2, Lock, Settings2, Upload, Check } from 'lucide-react';
import { AuthContext } from '../App';
import { useToast } from './ToastProvider';
import Markdown from './Markdown';
import { fileToCompressedDataURL } from '../utils/image';
import './CoachPanel.css';

const EMOJIS = ['🧭', '💰', '❤️', '💪', '🧠', '🚀', '🎯', '📈', '🌱', '🔥', '⚡', '🦉', '🧘', '📚', '🎨', '🤝'];

function Avatar({ c, size = 30 }) {
  const style = { width: size, height: size, fontSize: Math.round(size * 0.55) };
  if (c?.avatar_image) return <img src={c.avatar_image} className="coach-avatar" style={style} alt="" />;
  const color = c?.color || '#4ECDC4';
  return <span className="coach-avatar" style={{ ...style, background: color + '22', border: `1px solid ${color}66` }}>{c?.avatar_emoji || '🧭'}</span>;
}

// A per-category / per-project coach. Open by category/project (draft→approve→chat) or
// directly by coachId (from the Coaches page). Identity + memory are editable.
export default function CoachPanel({ scope = 'category', categoryId, projectId, coachId }) {
  const { api } = useContext(AuthContext);
  const { showToast } = useToast();
  const [phase, setPhase] = useState('loading'); // loading | none | draft | ready
  const [ready, setReady] = useState(false);
  const [missing, setMissing] = useState([]);
  const [coach, setCoach] = useState(null);
  const [draft, setDraft] = useState(null);
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [showMem, setShowMem] = useState(false);
  const [memory, setMemory] = useState([]);
  const [showSettings, setShowSettings] = useState(false);
  const [edit, setEdit] = useState(null);
  const turns = useRef(0);
  const msgRef = useRef([]); msgRef.current = messages;
  const coachRef = useRef(null); coachRef.current = coach;
  const fileRef = useRef(null);

  const loadStatus = async () => {
    try {
      if (coachId) { const c = await api.getCoach(coachId); if (c && c.id) { setCoach(c); setPhase('ready'); return; } }
      const res = scope === 'project' ? await api.getProjectCoach(projectId) : await api.getCategoryCoach(categoryId);
      if (res.coach) { const full = await api.getCoach(res.coach.id).catch(() => res.coach); setCoach(full); setPhase('ready'); }
      else { setReady(scope === 'project' ? true : !!res.ready); setMissing(res.missing || []); setPhase('none'); }
    } catch { setPhase('none'); }
  };
  useEffect(() => { loadStatus(); }, [categoryId, projectId, coachId]); // eslint-disable-line react-hooks/exhaustive-deps

  const flushMemory = async () => {
    const c = coachRef.current;
    if (!c || turns.current === 0) return;
    turns.current = 0;
    const t = msgRef.current.filter(m => m.content).slice(-12).map(m => `${m.role === 'user' ? 'Them' : 'Coach'}: ${m.content}`).join('\n');
    if (t) { try { await api.coachRemember(c.id, t); } catch { /* ignore */ } }
  };
  useEffect(() => () => { flushMemory(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
      setCoach(res); setDraft(null); setPhase('ready');
      showToast(`${res.name} is ready`, 'success');
    } catch (e) { showToast(e.message || 'Failed to create coach', 'error'); }
    finally { setBusy(false); }
  };
  const removeCoach = async () => {
    if (!window.confirm('Remove this coach? Its memory is deleted too.')) return;
    try { await api.deleteCoach(coach.id); setCoach(null); setMessages([]); setShowSettings(false); setPhase(coachId ? 'loading' : 'none'); if (!coachId) loadStatus(); showToast('Coach removed', 'info'); }
    catch { showToast('Failed to remove coach', 'error'); }
  };

  const openSettings = () => { setEdit({ name: coach.name, avatar_emoji: coach.avatar_emoji || '🧭', color: coach.color || '#4ECDC4', avatar_image: coach.avatar_image || '', responsibilities: coach.responsibilities || '', persona: coach.persona || '' }); setShowSettings(true); };
  const saveSettings = async () => {
    setBusy(true);
    try {
      const res = await api.updateCoach(coach.id, edit);
      if (res.error) throw new Error(res.error);
      setCoach(res); setShowSettings(false); showToast('Coach updated', 'success');
    } catch (e) { showToast(e.message || 'Failed to save', 'error'); }
    finally { setBusy(false); }
  };
  const uploadAvatar = async (e) => {
    const f = e.target.files?.[0]; e.target.value = ''; if (!f) return;
    try { const url = await fileToCompressedDataURL(f, { maxDim: 256 }); setEdit(x => ({ ...x, avatar_image: url })); }
    catch { showToast('Could not read that image', 'error'); }
  };

  const send = async () => {
    const text = input.trim(); if (!text || streaming || !coach) return;
    const prior = msgRef.current.filter(m => m.content);
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: text }, { role: 'assistant', content: '' }]);
    setStreaming(true);
    let full = '';
    try {
      const res = await api.coachChatStream(coach.id, { messages: [...prior, { role: 'user', content: text }], autoMode: true });
      if (!res.ok || !res.body) { let m = 'Request failed'; try { m = (await res.json()).error || m; } catch { /* ignore */ } throw new Error(m); }
      const reader = res.body.getReader(); const dec = new TextDecoder(); let buf = '';
      while (true) {
        const { done, value } = await reader.read(); if (done) break;
        buf += dec.decode(value, { stream: true }); let sep;
        while ((sep = buf.indexOf('\n\n')) >= 0) {
          const frame = buf.slice(0, sep); buf = buf.slice(sep + 2);
          const line = frame.split('\n').find(l => l.startsWith('data:')); if (!line) continue;
          let ev; try { ev = JSON.parse(line.slice(5).trim()); } catch { continue; }
          if (ev.type === 'delta') { full += ev.text; setMessages(prev => { const n = [...prev]; n[n.length - 1] = { ...n[n.length - 1], content: full }; return n; }); }
          else if (ev.type === 'error') { full += (full ? '\n' : '') + '⚠️ ' + (ev.message || 'error'); setMessages(prev => { const n = [...prev]; n[n.length - 1] = { ...n[n.length - 1], content: full }; return n; }); }
        }
      }
      turns.current++;
      if (turns.current >= 6) flushMemory();
    } catch (e) {
      setMessages(prev => { const n = [...prev]; n[n.length - 1] = { ...n[n.length - 1], content: '⚠️ ' + (e.message || 'failed') }; return n; });
    } finally { setStreaming(false); }
  };

  const openMem = async () => { setShowMem(true); try { const m = await api.listCoachMemory(coach.id); setMemory(Array.isArray(m) ? m : []); } catch { /* ignore */ } };
  const delMem = async (m) => { try { await api.deleteCoachMemory(m.id); setMemory(x => x.filter(i => i.id !== m.id)); } catch { /* ignore */ } };
  const togglePin = async (m) => { try { await api.pinCoachMemory(m.id, !m.pinned); setMemory(x => x.map(i => i.id === m.id ? { ...i, pinned: !i.pinned } : i)); } catch { /* ignore */ } };

  if (phase === 'loading') return coachId ? <div className="coach-panel coach-loading"><Loader2 size={18} className="coach-spin" /></div> : null;

  return (
    <section className="coach-panel" style={coach?.color ? { borderColor: coach.color + '55' } : undefined}>
      <div className="coach-head">
        <span className="coach-title">
          {coach ? <Avatar c={coach} /> : <Sparkles size={18} />}
          <span className="coach-name-block">
            <span className="coach-name">{coach ? coach.name : 'AI Coach'}</span>
            {coach?.responsibilities && <span className="coach-resp">{coach.responsibilities}</span>}
          </span>
        </span>
        {phase === 'ready' && (
          <span className="coach-head-actions">
            <button type="button" className="coach-mini" onClick={openMem} title="What this coach remembers"><Brain size={14} /> Memory</button>
            <button type="button" className="coach-mini" onClick={openSettings} title="Coach settings"><Settings2 size={14} /></button>
            <button type="button" className="coach-mini danger" onClick={removeCoach} title="Remove coach"><Trash2 size={14} /></button>
          </span>
        )}
      </div>

      {phase === 'none' && !ready && (
        <p className="coach-locked"><Lock size={13} /> Add {missing.length ? missing.join(' and ') : 'a vision or purpose and a goal'} to this category to unlock its dedicated coach.</p>
      )}
      {phase === 'none' && ready && (
        <div className="coach-invite">
          <p>Give this {scope} its own coach — a specialist that knows only this area's goals and gets to know you over time.</p>
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
              {EMOJIS.map(e => <button key={e} type="button" className={`coach-emoji ${draft.emoji === e ? 'on' : ''}`} onClick={() => setDraft({ ...draft, emoji: e })}>{e}</button>)}
            </span>
            <input type="color" className="coach-color" value={draft.color} onChange={e => setDraft({ ...draft, color: e.target.value })} title="Accent color" />
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

      {phase === 'ready' && !showSettings && (
        <div className="coach-chat">
          {messages.length === 0 && (
            <p className="coach-empty">Ask {coach.name} anything about this area — “what should I focus on here?”, “I'm stuck on X”, “add a task to…”. It remembers what matters across conversations.</p>
          )}
          <div className="coach-messages">
            {messages.map((m, i) => (
              <div key={i} className={`coach-msg ${m.role}`}>
                {m.role === 'assistant'
                  ? (m.content ? <Markdown>{m.content}</Markdown> : (streaming && i === messages.length - 1 ? <span className="coach-cursor">▍</span> : null))
                  : m.content}
              </div>
            ))}
          </div>
          <div className="coach-composer">
            <textarea className="form-input coach-input" placeholder={`Message ${coach.name}…`} value={input}
              onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }} rows={1} disabled={streaming} />
            <button type="button" className="btn btn-primary coach-send" onClick={send} disabled={!input.trim() || streaming}><Send size={16} /></button>
          </div>
        </div>
      )}

      {phase === 'ready' && showSettings && edit && (
        <div className="coach-settings">
          <div className="coach-identity-row">
            <span className="coach-emoji-pick">
              {EMOJIS.map(e => <button key={e} type="button" className={`coach-emoji ${edit.avatar_emoji === e ? 'on' : ''}`} onClick={() => setEdit({ ...edit, avatar_emoji: e, avatar_image: '' })}>{e}</button>)}
            </span>
            <input type="color" className="coach-color" value={edit.color} onChange={e => setEdit({ ...edit, color: e.target.value })} title="Accent color" />
            <button type="button" className="coach-mini" onClick={() => fileRef.current?.click()}><Upload size={13} /> Image</button>
            {edit.avatar_image && <button type="button" className="coach-mini danger" onClick={() => setEdit({ ...edit, avatar_image: '' })}>Clear image</button>}
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={uploadAvatar} />
          </div>
          {edit.avatar_image && <img src={edit.avatar_image} className="coach-avatar" style={{ width: 44, height: 44 }} alt="" />}
          <label className="coach-field">Name<input className="form-input" value={edit.name} onChange={e => setEdit({ ...edit, name: e.target.value })} maxLength={80} /></label>
          <label className="coach-field">Responsibilities<input className="form-input" value={edit.responsibilities} onChange={e => setEdit({ ...edit, responsibilities: e.target.value })} maxLength={300} /></label>
          <label className="coach-field">Persona (system prompt)<textarea className="form-input coach-persona" value={edit.persona} onChange={e => setEdit({ ...edit, persona: e.target.value })} rows={7} /></label>
          <div className="coach-draft-actions">
            <button type="button" className="btn btn-ghost" onClick={() => setShowSettings(false)}>Cancel</button>
            <button type="button" className="btn btn-primary" onClick={saveSettings} disabled={busy}><Check size={15} /> Save</button>
          </div>
        </div>
      )}

      {showMem && (
        <div className="coach-mem-overlay" onMouseDown={() => setShowMem(false)}>
          <div className="coach-mem" onMouseDown={e => e.stopPropagation()}>
            <div className="coach-mem-head"><span><Brain size={15} /> What {coach?.name} remembers</span><button className="coach-mini" onClick={() => setShowMem(false)}>Close</button></div>
            {memory.length === 0
              ? <p className="coach-empty">Nothing yet — it builds up as you talk.</p>
              : <ul className="coach-mem-list">
                  {memory.map(m => (
                    <li key={m.id} className={m.pinned ? 'pinned' : ''}>
                      <span className="coach-mem-kind">{m.kind}</span>
                      <span className="coach-mem-content">{m.content}</span>
                      <button className="coach-mem-btn" onClick={() => togglePin(m)} title={m.pinned ? 'Unpin' : 'Pin (never forget)'}>{m.pinned ? <Pin size={13} /> : <PinOff size={13} />}</button>
                      <button className="coach-mem-btn danger" onClick={() => delMem(m)} title="Forget this"><Trash2 size={13} /></button>
                    </li>
                  ))}
                </ul>}
            <p className="coach-mem-note">The coach keeps only durable facts, pruned automatically. Pin anything it must never forget.</p>
          </div>
        </div>
      )}
    </section>
  );
}
