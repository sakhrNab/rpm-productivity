// Revenue model: editable channels (volume × convert% × ticket), low / base / high scenarios,
// compared to the cash goal. Stored in biz_settings.revenue_model.
import { useEffect, useMemo, useState } from 'react';
import { TrendingUp, Plus, Trash2, Save } from 'lucide-react';
import { useToast } from '../ToastProvider';
import { BizEmpty, Loading, SectionHead, useBizApi } from './bizKit';
import { SCENARIOS, channelCash, modelTotal, money } from './bizConfig';

const blank = (i) => ({ id: `ch${Date.now().toString(36)}${i}`, name: '', unit: 'units', volume: 0, convert: 0, ticket: 0, startsWeek: 1, note: '' });

export default function Revenue() {
  const biz = useBizApi();
  const { showToast } = useToast();
  const [model, setModel] = useState(null);
  const [saved, setSaved] = useState('[]');
  const [settings, setSettings] = useState(null);
  const [goal, setGoal] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const [st, sum] = await Promise.all([biz.current.settings(), biz.current.summary()]);
    setSettings(st);
    setModel(st.revenue_model || []);
    setSaved(JSON.stringify(st.revenue_model || []));
    setGoal(sum.cash);
  };
  useEffect(() => { load().catch((e) => showToast(e.message, 'error')); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const dirty = model && JSON.stringify(model) !== saved;
  const cur = settings?.currency || 'EUR';
  const totals = useMemo(() => Object.fromEntries(Object.entries(SCENARIOS).map(([k, m]) => [k, modelTotal(model, m)])), [model]);
  if (!model) return <Loading />;

  const set = (i, k, v) => setModel((m) => m.map((c, j) => (j === i ? { ...c, [k]: v } : c)));
  const num = (v) => (v === '' ? '' : Number(v));
  const save = async () => {
    setBusy(true);
    try {
      const clean = model.map((c) => ({ ...c, volume: Number(c.volume) || 0, convert: Number(c.convert) || 0, ticket: Number(c.ticket) || 0, startsWeek: Number(c.startsWeek) || 1 }));
      const st = await biz.current.saveSettings({ revenue_model: clean });
      setModel(st.revenue_model); setSaved(JSON.stringify(st.revenue_model));
      showToast('Revenue model saved', 'success');
    } catch (e) { showToast(e.message, 'error'); } finally { setBusy(false); }
  };
  const template = async () => {
    try { await biz.current.template('revenue'); await load(); showToast('Sample model added — change every number to your own guess', 'success'); }
    catch (e) { showToast(e.message, 'error'); }
  };

  const target = goal?.target_value || 0;
  return (
    <section className="biz-section">
      <SectionHead kicker="Revenue model" icon={TrendingUp}>
        {model.length > 0 && <button type="button" className="btn btn-secondary" onClick={() => setModel((m) => [...m, blank(m.length)])}><Plus size={16} /> Channel</button>}
        {dirty && <button type="button" className="btn btn-primary" disabled={busy} onClick={save}><Save size={16} /> {busy ? 'Saving…' : 'Save'}</button>}
      </SectionHead>

      {model.length === 0 ? (
        <BizEmpty icon={TrendingUp} title="No revenue model yet" text="List the channels that could bring money, how many attempts you will make, what share converts and the ticket. You get a low / base / high forecast."
          onAdd={() => setModel([blank(0)])} addLabel="Add a channel" onTemplate={template} />
      ) : (
        <>
          <div className="biz-scen">
            {Object.entries(SCENARIOS).map(([k, m]) => (
              <div key={k} className={`ui-card biz-scen-card ${k === 'base' ? 'base' : ''}`}>
                <p className="ui-kicker">{k} · ×{m}</p>
                <b>{money(totals[k], cur)}</b>
                {target > 0 && <span className={totals[k] >= target ? 'good' : 'warn'}>{Math.round((totals[k] / target) * 100)}% of {money(target, cur)}</span>}
              </div>
            ))}
          </div>
          <div className="biz-model">
            {model.map((c, i) => (
              <div key={c.id || i} className="ui-card biz-card biz-model-row">
                <div className="biz-model-head">
                  <input className="form-input biz-model-name" aria-label="Channel name" placeholder="Channel name" value={c.name} onChange={(e) => set(i, 'name', e.target.value)} />
                  <b className="biz-model-cash">{money(channelCash(c), cur)}</b>
                  <button type="button" className="btn btn-ghost btn-icon" aria-label={`Remove ${c.name || 'channel'}`} onClick={() => setModel((m) => m.filter((_, j) => j !== i))}><Trash2 size={15} /></button>
                </div>
                <div className="biz-model-grid">
                  <label><span>Volume</span><input className="form-input" type="number" min="0" inputMode="decimal" value={c.volume} onChange={(e) => set(i, 'volume', num(e.target.value))} /></label>
                  <label><span>Unit</span><input className="form-input" value={c.unit} onChange={(e) => set(i, 'unit', e.target.value)} /></label>
                  <label><span>Convert %</span><input className="form-input" type="number" min="0" max="100" step="0.01" inputMode="decimal" value={c.convert} onChange={(e) => set(i, 'convert', num(e.target.value))} /></label>
                  <label><span>Ticket {cur}</span><input className="form-input" type="number" min="0" inputMode="decimal" value={c.ticket} onChange={(e) => set(i, 'ticket', num(e.target.value))} /></label>
                  <label><span>Starts week</span><input className="form-input" type="number" min="0" value={c.startsWeek} onChange={(e) => set(i, 'startsWeek', num(e.target.value))} /></label>
                </div>
                <input className="form-input biz-model-note" aria-label="Note" placeholder="Note — where the numbers come from" value={c.note} onChange={(e) => set(i, 'note', e.target.value)} />
              </div>
            ))}
          </div>
          <p className="biz-muted">Expected cash per channel = volume × convert % × ticket. Low and high multiply the base by {SCENARIOS.low} and {SCENARIOS.high}. Real rates show up in Results.</p>
        </>
      )}
    </section>
  );
}
