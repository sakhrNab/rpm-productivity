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

const STEPS = [['sent', 'Sent'], ['reply', 'Replies'], ['call', 'Calls'], ['proof', 'Proof'], ['won', 'Won']];
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
  const rate = (a, b) => (totals[a] > 0 ? Math.round((totals[b] / totals[a]) * 100) : null);
  const links = [
    ...STEPS.slice(0, -1).map(([k], i) => {
      const nx = STEPS[i + 1][0];
      return { id: `${k}>${nx}`, from: `f:${k}`, to: `f:${nx}`, tone: totals[nx] ? 'flow' : 'dim', dashed: !totals[nx], idle: !totals[nx], weight: totals[nx] ? 2 + Math.log2(totals[nx] + 1) * 1.5 : 1.4 };
    }),
    { id: 'won>cash', from: 'f:won', to: 'f:cash', tone: totals.cash ? 'good' : 'dim', dashed: !totals.cash, idle: !totals.cash, weight: totals.cash ? 4 : 1.4 },
  ];

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
      <LensHead icon={BarChart3} kicker="Outcomes" title={totals.sent ? `${totals.sent} sent · ${totals.reply} replies · ${totals.won} won` : 'Your real funnel'}
        read="Every message, reply, call and deal you log becomes a live connector here and on the mission flow." />

      {/* funnel as a flow */}
      <div className="bz-funnel" ref={setRoot}>
        <FlowLinks root={root} links={links} simplify={false} version={`${list.rows.length}-${phone}`} />
        {STEPS.map(([k, label], i) => (
          <div key={k} className="bz-funnel-step">
            <div data-node={`f:${k}`} className={`bz-node kind-out ${totals[k] ? '' : 'quiet'}`}>
              <span className="bz-node-name">{label}</span><b className="bz-node-n">{totals[k] || '—'}</b>
            </div>
            {i > 0 && rate(STEPS[i - 1][0], k) !== null && <span className="bz-rate">{rate(STEPS[i - 1][0], k)}%</span>}
          </div>
        ))}
        <div className="bz-funnel-step">
          <div data-node="f:cash" className={`bz-node kind-cash ${totals.cash ? '' : 'quiet'}`}>
            <Wallet size={14} aria-hidden="true" /><span className="bz-node-name">{totals.cash ? money(totals.cash, cur) : 'Cash'}</span>
          </div>
        </div>
      </div>

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
        <BizEmpty icon={BarChart3} title="Nothing logged yet" text="Log the first message you send today. Ten seconds per entry; the funnel above fills itself." />
      ) : (
        <div className="bz-ledger">
          {weeks.map((g) => (
            <section key={g.w} className="bz-week" aria-label={`Week of ${fmtDate(g.w)}`}>
              <p className="bz-week-head">Week of {fmtDate(g.w)}<span>{g.rows.reduce((s, r) => s + (ROLE[r.type] === 'sent' ? r.count || 1 : 0), 0) || ''}{g.rows.some((r) => ROLE[r.type] === 'sent') ? ' sent' : ''}</span></p>
              <ul>
                {g.rows.map((r) => (
                  <li key={r.id} className={`bz-entry role-${ROLE[r.type]}`}>
                    <span className="bz-entry-date">{fmtDate(r.date)}</span>
                    <span className="bz-entry-body">
                      <b>{r.count > 1 ? `${r.count}× ` : ''}{resultLabel(r.type)}</b>
                      {r.type === 'won' && r.value_eur != null && <em className="bz-entry-cash">{money(r.value_eur, cur)}</em>}
                      {r.views != null && <span> · {Number(r.views).toLocaleString()} views</span>}
                      {r.channel && <span className="bz-entry-chan">{r.channel}</span>}
                      {r.lead_id && leadName(r.lead_id) && <span className="bz-entry-lead">→ {leadName(r.lead_id)}</span>}
                      {r.note && <small>{r.note}</small>}
                    </span>
                    <button type="button" className="bz-icon-btn" aria-label={`Delete ${resultLabel(r.type)} on ${fmtDate(r.date)}`} onClick={() => list.remove(r.id, resultLabel(r.type))}><Trash2 size={15} /></button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </section>
  );
}
