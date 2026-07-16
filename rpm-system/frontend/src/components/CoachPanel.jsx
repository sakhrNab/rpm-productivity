import { useState, useEffect, useRef, useContext } from 'react';
import { Sparkles, Send, Loader2, Brain, Trash2, Pin, PinOff, Wand2, Lock } from 'lucide-react';
import { AuthContext } from '../App';
import { useToast } from './ToastProvider';
import Markdown from './Markdown';
import './CoachPanel.css';

// A per-category / per-project AI coach: draft → approve → chat, with a viewable,
// editable structured memory. Never calls the AI on load — only on your action.
export default function CoachPanel({ scope = 'category', categoryId, projectId }) {
  const { api } = useContext(AuthContext);
  const { showToast } = useToast();
  const [phase, setPhase] = useState('loading'); // loading | none | draft | ready
  const [ready, setReady] = useState(false);
  const [missing, setMissing] = useState([]);
  const [coach, setCoach] = useState(null);
  const [draft, setDraft] = useState(null);       // { name, persona }
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [showMem, setShowMem] = useState(false);
  const [memory, setMemory] = useState([]);
  const turns = useRef(0);
  const msgRef = useRef([]);
  msgRef.current = messages;
  const coachRef = useRef(null);
  coachRef.current = coach;

  const modelKey = () => localStorage.getItem('ai.modelKey');

  const loadStatus = async () => {
    try {
      const res = scope === 'project' ? await api.getProjectCoach(projectId) : await api.getCategoryCoach(categoryId);
      if (res.coach) { setCoach(res.coach); setPhase('ready'); }
      else { setReady(scope === 'project' ? true : !!res.ready); setMissing(res.missing || []); setPhase('none'); }
    } catch { setPhase('none'); }
  };
  useEffect(() => { loadStatus(); }, [categoryId, projectId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Batched memory: reconcile the recent exchange when leaving the panel.
  const flushMemory = async () => {
    const c = coachRef.current;
    if (!c || turns.current === 0) return;
    turns.current = 0;
    const t = msgRef.current.filter(m => m.content).slice(-12).map(m => `${m.role === 'user' ? 'Them' : 'Coach'}: ${m.content}`).join('\n');
    if (t) { try { await api.coachRemember(c.id, t); } catch { /* ignore */ } }
  };
  useEffect(() => () => { flushMemory(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const draftIt = async () => {
    const mk = modelKey(); if (!mk) { showToast('Pick a default AI model in Settings first.', 'info'); return; }
    setBusy(true);
    try {
      const res = await api.draftCoach(scope === 'project' ? { projectId, modelKey: mk } : { categoryId, modelKey: mk });
      if (res.error) throw new Error(res.error);
      setDraft({ name: res.name, persona: res.persona }); setPhase('draft');
    } catch (e) { showToast(e.message || 'Failed to draft a coach', 'error'); }
    finally { setBusy(false); }
  };
  const createIt = async () => {
    if (!draft?.name?.trim() || !draft?.persona?.trim()) return;
    setBusy(true);
    try {
      const body = scope === 'project' ? { scope: 'project', projectId, ...draft } : { scope: 'category', categoryId, ...draft };
      const res = await api.createCoach(body);
      if (res.error) throw new Error(res.error);
      setCoach({ id: res.id, name: res.name }); setDraft(null); setPhase('ready');
      showToast(`${res.name} is ready`, 'success');
    } catch (e) { showToast(e.message || 'Failed to create coach', 'error'); }
    finally { setBusy(false); }
  };
  const removeCoach = async () => {
    if (!window.confirm('Remove this coach? Its memory is deleted too.')) return;
    try { await api.deleteCoach(coach.id); setCoach(null); setMessages([]); setPhase('none'); loadStatus(); showToast('Coach removed', 'info'); }
    catch { showToast('Failed to remove coach', 'error'); }
  };

  const send = async () => {
    const text = input.trim();
    if (!text || streaming || !coach) return;
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

  if (phase === 'loading') return null;

  return (
    <section className="coach-panel">
      <div className="coach-head">
        <span className="coach-title"><Sparkles size={16} /> {coach ? coach.name : 'AI Coach'}</span>
        {phase === 'ready' && (
          <span className="coach-head-actions">
            <button type="button" className="coach-mini" onClick={openMem} title="What this coach remembers"><Brain size={14} /> Memory</button>
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
          <label className="coach-field">Name
            <input className="form-input" value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} maxLength={80} />
          </label>
          <label className="coach-field">Persona (its system prompt)
            <textarea className="form-input coach-persona" value={draft.persona} onChange={e => setDraft({ ...draft, persona: e.target.value })} rows={7} />
          </label>
          <div className="coach-draft-actions">
            <button type="button" className="btn btn-ghost" onClick={() => { setDraft(null); setPhase('none'); }}>Cancel</button>
            <button type="button" className="btn btn-secondary" onClick={draftIt} disabled={busy}>Re-draft</button>
            <button type="button" className="btn btn-primary" onClick={createIt} disabled={busy || !draft.name.trim() || !draft.persona.trim()}>Create coach</button>
          </div>
        </div>
      )}

      {phase === 'ready' && (
        <div className="coach-chat">
          {messages.length === 0 && (
            <p className="coach-empty">Ask your coach anything about this area — “what should I focus on here?”, “I'm stuck on X”, “add a task to…”. It remembers what matters across conversations.</p>
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
            <textarea
              className="form-input coach-input"
              placeholder={`Message ${coach.name}…`}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
              rows={1}
              disabled={streaming}
            />
            <button type="button" className="btn btn-primary coach-send" onClick={send} disabled={!input.trim() || streaming}><Send size={16} /></button>
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
