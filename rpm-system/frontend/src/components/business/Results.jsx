// Results lens: the funnel as a flow (Sent → Replies → Calls → Proof → Won → Cash) with the conversion
// on every connector, a one-line log bar, and the ledger grouped by week. A won deal can add its value to
// the linked cash key result after an explicit confirm.
import { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { BarChart3, Plus, Trash2, Minus, Wallet } from 'lucide-react';
import { AuthContext } from '../../App';
import Picker from '../Picker';
import FlowLinks, { useMedia } from '../FlowLinks';
import { useToast } from '../ToastProvider';
import DatePick from './DatePick';
import { BizEmpty, LensHead, Loading, useBiz, useBizApi, useBizList } from './bizKit';
import { RESULT_TYPES, fmtDate, money, resultLabel, todayStr } from './bizConfig';

const ROLE = { dm_sent: 'sent', proposal: 'sent', reply: 'reply', call: 'call', delivered: 'proof', case_study: 'proof', won: 'won', lost: 'lost', content: 'content', note: 'note' };
const weekOf = (iso) => { const d = new Date(`${iso}T12:00:00Z`); const day = (d.getUTCDay() + 6) % 7; d.setUTCDate(d.getUTCDate() - day); return d.toISOString().slice(0, 10); };

export default function Results() {
  const list = useBizList('results');
  const leads = useBizList('leads');
  const ctx = useBiz();
  const biz = useBizApi();
  const { api } = useContext(AuthContext);
  const { showToast } = useToast();
  const params = ctx.params;
  const [form, setForm] = useState(() => ({
    type: RESULT_TYPES.some((t) => t.value === params.get('type')) ? params.get('type') : 'dm_sent',
    channel: params.get('channel') || '', count: 1, value_eur: '', views: '', lead_id: params.get('lead') || '', note: '', date: todayStr(),
  }));
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const [root, setRoot] = useState(null);
  const logRef = useRef(null);
  const phone = useMedia('(max-width: 760px)');
  const settings = ctx.sum?.settings;
  const cur = settings?.currency || 'EUR';

  useEffect(() => { if (params.get('log')) setTimeout(() => logRef.current?.querySelector('button[aria-checked="true"]')?.focus(), 120); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const channelOptions = useMemo(() => {
    const names = new Map();
    for (const c of settings?.revenue_model || []) if (c.id) names.set(c.id, c.name || c.id);
    for (const r of list.rows || []) if (r.channel && !names.has(r.channel)) names.set(r.channel, r.channel);
    for (const c of ctx.sum?.flow?.channels || []) if (!names.has(c.name)) names.set(c.name, c.name);
    return [{ value: '', label: 'No channel' }, ...[...names].map(([v, l]) => ({ value: v, label: l }))];
  }, [settings, list.rows, ctx.sum]);
  const [newChannel, setNewChannel] = useState('');
  if (!list.rows) return <Loading />;

  const meta = RESULT_TYPES.find((t) => t.value === form.type);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const totals = { sent: 0, reply: 0, call: 0, proof: 0, won: 0, cash: 0 };
  for (const r of list.rows) {
    const role = ROLE[r.type];
    if (role === 'won') { totals.won += 1; totals.cash += Number(r.value_eur) || 0; }
    else if (totals[role] !== undefined) totals[role] += r.count || 1;
  }
  const model = settings?.revenue_model || [];
  const chanLabel = (ch) => { const id = ctx.sum?.flow?.links?.resultModel?.[ch]; return model.find((m) => m.id === id)?.name || ch; };
  const OUT_LABEL = { sent: 'Sent', reply: 'Replies', call: 'Calls', proof: 'Proof', won: 'Won', lost: 'Lost', content: 'Content', note: 'Notes' };
  const ORDER = ['sent', 'reply', 'call', 'proof', 'won', 'lost', 'content', 'note'];
  const agg = {}; const src = {};
  for (const r of list.rows) {
    const role = ROLE[r.type]; const key = r.channel ? chanLabel(r.channel) : '-';
    const n = role === 'won' || role === 'content' || role === 'note' ? 1 : r.count || 1;
    agg[`${key}|${role}`] = (agg[`${key}|${role}`] || 0) + n;
    src[key] = (src[key] || 0) + n;
  }
  const sources = Object.entries(src).map(([key, n]) => ({ key, label: key === '-' ? 'No channel' : key, n })).sort((a, b) => b.n - a.n);
  const roleN = {}; for (const [k, n] of Object.entries(agg)) { const role = k.split('|')[1]; roleN[role] = (roleN[role] || 0) + n; }
  const prev = { reply: 'sent', call: 'reply', proof: 'call', won: 'proof' };
  const outs = ORDER.filter((r) => roleN[r]).map((role) => {
    const of = prev[role] && roleN[prev[role]] ? prev[role] : null;
    return { role, label: OUT_LABEL[role], n: roleN[role], rate: of ? Math.round((roleN[role] / roleN[of]) * 100) : null, of: of && OUT_LABEL[of].toLowerCase() };
  });
  const TONE = { won: 'good', lost: 'bad', note: 'dim', content: 'info' };
  const links = Object.entries(agg).map(([k, n]) => { const [key, role] = k.split('|'); return { id: k, from: `rc:${key}`, to: `ro:${role}`, tone: TONE[role] || 'flow', weight: 1.8 + Math.log2(n + 1) * 1.8 }; });

  const submit = async (e) => {
    e.preventDefault();
    const body = { type: form.type, channel: (newChannel || form.channel || '').trim(), note: form.note, date: form.date, lead_id: form.lead_id || null };
    if (meta.countable) body.count = Math.max(1, Number(form.count) || 1);
    if (form.type === 'won') body.value_eur = form.value_eur === '' ? null : Number(form.value_eur);
    if (form.type === 'content' && form.views !== '') body.views = Number(form.views);
    setBusy(true);
    try {
      const row = await list.create(body);
      list.setRows((rs) => [row, ...(rs || []).filter((r) => r.id !== row.id)]);
      ctx.undo.push({ message: `Logged: ${body.count > 1 ? `${body.count}× ` : ''}${resultLabel(form.type)}`, undo: async () => { await biz.current.remove('results', row.id); list.setRows((rs) => rs.filter((r) => r.id !== row.id)); ctx.changed(); } });
      if (form.type === 'won' && body.value_eur > 0 && ctx.sum?.cash) setConfirm({ amount: body.value_eur, kr: ctx.sum.cash });
      setForm((f) => ({ ...f, count: 1, value_eur: '', views: '', note: '', lead_id: '' }));
      setNewChannel('');
    } catch { /* toast shown by the hook */ } finally { setBusy(false); }
  };
  const addToKr = async () => {
    const { amount, kr } = confirm;
    try {
      const r = await api.updateKeyResult(kr.id, { current_value: (Number(kr.current_value) || 0) + amount });
      if (r?.error) throw new Error(r.error);
      showToast(`${kr.title}: now ${money(r.current_value, cur)}`, 'success');
      ctx.changed();
    } catch (e) { showToast(e.message, 'error'); } finally { setConfirm(null); }
  };

  const weeks = [];
  for (const r of list.rows) {
    const w = weekOf(r.date || todayStr());
    let g = weeks.find((x) => x.w === w);
    if (!g) { g = { w, rows: [] }; weeks.push(g); }
    g.rows.push(r);
  }
  const leadName = (id) => (leads.rows || []).find((l) => l.id === id)?.name;

  return (
    <section className="bz-lens bz-results">
      <LensHead icon={BarChart3} kicker="Outcomes" title={totals.sent ? `${totals.sent} sent · ${totals.reply} replies · ${totals.won} won` : list.rows.length ? `${list.rows.length} logged · nothing sent yet` : 'Your real funnel'}
        read="Log what happened in one line. Each entry lands on the timeline and wires the channel it came from into what it became." />

      {/* log bar */}
      <form className="bz-logbar" onSubmit={submit} aria-label="Log a result" ref={logRef}>
        <div className="bz-types" role="radiogroup" aria-label="What happened">
          {RESULT_TYPES.map((t) => (
            <button key={t.value} type="button" role="radio" aria-checked={form.type === t.value} className={`bz-type ${form.type === t.value ? 'on' : ''} role-${ROLE[t.value]}`} onClick={() => set('type', t.value)}>{t.label}</button>
          ))}
        </div>
        <div className="bz-log-fields">
          {meta.countable && (
            <div className="bz-stepper-num" role="group" aria-label="How many">
              <button type="button" aria-label="One less" onClick={() => setForm((f) => ({ ...f, count: Math.max(1, (Number(f.count) || 1) - 1) }))}><Minus size={14} /></button>
              <input type="number" min="1" max="10000" inputMode="numeric" aria-label="How many" value={form.count} onChange={(e) => set('count', e.target.value)} />
              <button type="button" aria-label="One more" onClick={() => setForm((f) => ({ ...f, count: Math.min(10000, (Number(f.count) || 0) + 1) }))}><Plus size={14} /></button>
            </div>
          )}
          {form.type === 'won' && <input className="bz-in bz-in-num" type="number" min="0" step="0.01" inputMode="decimal" placeholder={`Value ${cur}`} aria-label={`Value ${cur}`} value={form.value_eur} onChange={(e) => set('value_eur', e.target.value)} />}
          {form.type === 'content' && <input className="bz-in bz-in-num" type="number" min="0" inputMode="numeric" placeholder="Views" aria-label="Views" value={form.views} onChange={(e) => set('views', e.target.value)} />}
          <div className="bz-log-pick"><Picker value={newChannel ? '' : form.channel} options={channelOptions} header="Channel" onChange={(v) => { set('channel', v); setNewChannel(''); }} placeholder="Channel" /></div>
          <input className="bz-in" value={newChannel} maxLength={40} placeholder="…or new channel" aria-label="New channel" onChange={(e) => setNewChannel(e.target.value)} />
          <div className="bz-log-pick"><Picker value={form.lead_id} placeholder="No lead" header="Lead" onChange={(v) => set('lead_id', v)} options={[{ value: '', label: 'No lead' }, ...(leads.rows || []).map((l) => ({ value: l.id, label: l.name }))]} /></div>
          <DatePick value={form.date} onChange={(v) => set('date', v || todayStr())} label="Date" allowClear={false} />
          <input className="bz-in bz-in-note" value={form.note} maxLength={4000} placeholder="Note (optional)" aria-label="Note" onChange={(e) => set('note', e.target.value)} />
          <button type="submit" className="btn btn-primary" disabled={busy}><Plus size={16} /> {busy ? 'Logging…' : 'Log'}</button>
        </div>
      </form>

      {confirm && (
        <div className="bz-confirm" role="alertdialog" aria-label="Update cash key result">
          <Wallet size={18} aria-hidden="true" />
          <p>Add <b>{money(confirm.amount, cur)}</b> to <b>{confirm.kr.title}</b>? It goes from {money(confirm.kr.current_value, cur)} to {money(Number(confirm.kr.current_value) + confirm.amount, cur)}.</p>
          <button type="button" className="btn btn-primary" onClick={addToKr}>Yes, update it</button>
          <button type="button" className="btn btn-ghost" onClick={() => setConfirm(null)}>Not now</button>
        </div>
      )}

      {list.rows.length === 0 ? (
        <BizEmpty icon={BarChart3} title="Nothing logged yet" text="Log the first message you send today. Each entry lands on the timeline and wires its channel into the outcome it produced." />
      ) : (
        <>
          {/* where results come from → what they became (zero is silent: only what was logged) */}
          <div className="bz-sankey" ref={setRoot}>
            <FlowLinks root={root} links={links} simplify={phone} version={`${list.rows.length}-${phone}`} />
            <div className="bz-sankey-col" data-node-group="from">
              <p className="bz-col-title">From channel</p>
              {sources.map((c) => (
                <div key={c.key} data-node={`rc:${c.key}`} className={`bz-node kind-src ${c.key === '-' ? 'quiet' : ''}`}>
                  <span className="bz-node-name">{c.label}</span><b className="bz-node-n">{c.n}</b>
                </div>
              ))}
            </div>
            <div className="bz-sankey-col" data-node-group="to">
              <p className="bz-col-title">Became</p>
              {outs.map((o) => (
                <div key={o.role} data-node={`ro:${o.role}`} className={`bz-node kind-out role-${o.role}`}>
                  <span className="bz-node-name">{o.label}</span><b className="bz-node-n">{o.role === 'won' && totals.cash ? money(totals.cash, cur) : o.n}</b>
                  {o.rate != null && <small className="bz-node-sub">{o.rate}% of {o.of}</small>}
                </div>
              ))}
            </div>
          </div>
          {/* the timeline: every entry on one spine, newest first, grouped by week */}
          <ol className="bz-timeline" aria-label="Results timeline">
            {weeks.map((g) => (
              <li key={g.w} className="bz-tl-week">
                <p className="bz-tl-mark">Week of {fmtDate(g.w)}</p>
                <ul>
                  {g.rows.map((r) => (
                    <li key={r.id} className={`bz-tl-entry role-${ROLE[r.type]}`}>
                      <i className="bz-tl-dot" aria-hidden="true" />
                      <div className="bz-tl-card">
                        <span className="bz-tl-top"><b>{r.count > 1 ? `${r.count}× ` : ''}{resultLabel(r.type)}</b>
                          {r.type === 'won' && r.value_eur != null && <em className="bz-entry-cash">{money(r.value_eur, cur)}</em>}
                          {r.views != null && <span> · {Number(r.views).toLocaleString()} views</span>}
                          <span className="bz-tl-date">{fmtDate(r.date)}</span></span>
                        <span className="bz-tl-meta">
                          {r.channel && <span className="bz-entry-chan">from {chanLabel(r.channel)}</span>}
                          {r.lead_id && leadName(r.lead_id) && <span className="bz-entry-lead">→ {leadName(r.lead_id)}</span>}
                        </span>
                        {r.note && <small>{r.note}</small>}
                      </div>
                      <button type="button" className="bz-icon-btn" aria-label={`Delete ${resultLabel(r.type)} on ${fmtDate(r.date)}`} onClick={() => list.remove(r.id, resultLabel(r.type))}><Trash2 size={15} /></button>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
        </>
      )}
    </section>
  );
}
