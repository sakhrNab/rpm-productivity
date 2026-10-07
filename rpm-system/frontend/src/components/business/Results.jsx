// Results: log what happened in ~10 seconds (type → channel → number → save). A won deal can add
// its value to the linked cash key result, after an explicit confirm.
import { useContext, useEffect, useMemo, useState } from 'react';
import { BarChart3, Plus, Trash2 } from 'lucide-react';
import { AuthContext } from '../../App';
import Picker from '../Picker';
import { useToast } from '../ToastProvider';
import { Loading, SectionHead, useBizApi, useBizList } from './bizKit';
import { RESULT_TYPES, fmtDate, money, resultLabel, todayStr } from './bizConfig';

export default function Results() {
  const list = useBizList('results');
  const leads = useBizList('leads');
  const biz = useBizApi();
  const { api } = useContext(AuthContext);
  const { showToast } = useToast();
  const [settings, setSettings] = useState(null);
  const [form, setForm] = useState({ type: 'dm_sent', channel: '', count: 1, value_eur: '', views: '', lead_id: '', note: '', date: todayStr() });
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(null); // { amount, kr }

  useEffect(() => { biz.current.settings().then(setSettings).catch(() => setSettings({})); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const channelOptions = useMemo(() => {
    const names = new Set([...(settings?.revenue_model || []).map((c) => c.name).filter(Boolean), ...(list.rows || []).map((r) => r.channel).filter(Boolean)]);
    return [{ value: '', label: 'No channel' }, ...[...names].map((n) => ({ value: n, label: n }))];
  }, [settings, list.rows]);
  const [newChannel, setNewChannel] = useState('');
  if (!list.rows) return <Loading />;

  const meta = RESULT_TYPES.find((t) => t.value === form.type);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const cur = settings?.currency || 'EUR';

  const submit = async (e) => {
    e.preventDefault();
    const body = { type: form.type, channel: (newChannel || form.channel || '').trim(), note: form.note, date: form.date, lead_id: form.lead_id || null };
    if (meta.countable) body.count = Math.max(1, Number(form.count) || 1);
    if (form.type === 'won') body.value_eur = form.value_eur === '' ? null : Number(form.value_eur);
    if (form.type === 'content' && form.views !== '') body.views = Number(form.views);
    setBusy(true);
    try {
      await list.create(body);
      showToast(`Logged: ${resultLabel(form.type)}`, 'success');
      if (form.type === 'won' && body.value_eur > 0 && settings?.cash_kr_id) {
        const sum = await biz.current.summary();
        if (sum.cash) setConfirm({ amount: body.value_eur, kr: sum.cash });
      }
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
    } catch (e) { showToast(e.message, 'error'); } finally { setConfirm(null); }
  };

  return (
    <section className="biz-section">
      <SectionHead kicker="Results" icon={BarChart3} count={list.rows.length} />
      <form className="ui-card biz-card biz-log" onSubmit={submit} aria-label="Log a result">
        <div className="biz-types" role="radiogroup" aria-label="What happened">
          {RESULT_TYPES.map((t) => (
            <button key={t.value} type="button" role="radio" aria-checked={form.type === t.value} className={`biz-pill ${form.type === t.value ? 'on' : ''}`} onClick={() => set('type', t.value)}>{t.label}</button>
          ))}
        </div>
        <div className="biz-log-grid">
          <label className="mk-field"><span className="form-label">Channel</span>
            <Picker value={form.channel} options={channelOptions} onChange={(v) => { set('channel', v); setNewChannel(''); }} placeholder="Channel" />
          </label>
          <label className="mk-field"><span className="form-label">…or new channel</span>
            <input className="form-input" value={newChannel} maxLength={40} placeholder="e.g. Upwork" onChange={(e) => setNewChannel(e.target.value)} />
          </label>
          {meta.countable && (
            <label className="mk-field"><span className="form-label">How many</span>
              <input className="form-input" type="number" min="1" max="10000" inputMode="numeric" value={form.count} onChange={(e) => set('count', e.target.value)} />
            </label>
          )}
          {form.type === 'won' && (
            <label className="mk-field"><span className="form-label">Value {cur}</span>
              <input className="form-input" type="number" min="0" step="0.01" inputMode="decimal" value={form.value_eur} onChange={(e) => set('value_eur', e.target.value)} />
            </label>
          )}
          {form.type === 'content' && (
            <label className="mk-field"><span className="form-label">Views</span>
              <input className="form-input" type="number" min="0" inputMode="numeric" value={form.views} onChange={(e) => set('views', e.target.value)} />
            </label>
          )}
          <label className="mk-field"><span className="form-label">Lead</span>
            <Picker value={form.lead_id} placeholder="No lead" onChange={(v) => set('lead_id', v)}
              options={[{ value: '', label: 'No lead' }, ...(leads.rows || []).map((l) => ({ value: l.id, label: l.name }))]} />
          </label>
          <label className="mk-field"><span className="form-label">Date</span>
            <input className="form-input" type="date" value={form.date} onChange={(e) => set('date', e.target.value)} />
          </label>
          <label className="mk-field biz-wide"><span className="form-label">Note</span>
            <input className="form-input" value={form.note} maxLength={4000} placeholder="Optional" onChange={(e) => set('note', e.target.value)} />
          </label>
        </div>
        <button type="submit" className="btn btn-primary" disabled={busy}><Plus size={16} /> {busy ? 'Logging…' : 'Log result'}</button>
      </form>

      {confirm && (
        <div className="ui-card biz-card biz-confirm" role="alertdialog" aria-label="Update cash key result">
          <p className="biz-text">Add <b>{money(confirm.amount, cur)}</b> to <b>{confirm.kr.title}</b>? It goes from {money(confirm.kr.current_value, cur)} to {money(Number(confirm.kr.current_value) + confirm.amount, cur)}.</p>
          <div className="biz-empty-actions">
            <button type="button" className="btn btn-primary" onClick={addToKr}>Yes, update the key result</button>
            <button type="button" className="btn btn-ghost" onClick={() => setConfirm(null)}>Not now</button>
          </div>
        </div>
      )}

      {list.rows.length === 0 ? (
        <p className="biz-muted biz-center">Nothing logged yet. Every message sent, reply, call and deal you log builds your real funnel.</p>
      ) : (
        <ul className="ui-card biz-card biz-results">
          {list.rows.map((r) => (
            <li key={r.id}>
              <span className="biz-when">{fmtDate(r.date)}</span>
              <span className="biz-min biz-result-text">
                <b>{r.count > 1 ? `${r.count}× ` : ''}{resultLabel(r.type)}</b>
                {r.type === 'won' && r.value_eur != null && <> · {money(r.value_eur, cur)}</>}
                {r.views != null && <> · {Number(r.views).toLocaleString()} views</>}
                {r.channel && <> · {r.channel}</>}
                {r.lead_id && <> · {(leads.rows || []).find((l) => l.id === r.lead_id)?.name || 'lead'}</>}
                {r.note && <small>{r.note}</small>}
              </span>
              <button type="button" className="btn btn-ghost btn-icon" aria-label="Delete result" onClick={() => list.remove(r.id)}><Trash2 size={15} /></button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
