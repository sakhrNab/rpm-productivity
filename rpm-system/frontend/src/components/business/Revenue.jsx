// Revenue lens: every model channel (volume × convert% × ticket) pours into the scenario total, which
// pours into the cash target — connector thickness = that channel's share. Real attempts logged in
// Results sit next to each channel's plan. Stored in biz_settings.revenue_model.
import { useEffect, useMemo, useState } from 'react';
import { TrendingUp, Plus, Trash2, Save, Target } from 'lucide-react';
import FlowLinks, { useMedia } from '../FlowLinks';
import { useToast } from '../ToastProvider';
import { BizEmpty, LensHead, Loading, useBiz, useBizApi } from './bizKit';
import { SCENARIOS, channelCash, modelTotal, money } from './bizConfig';

const blank = (i) => ({ id: `ch${Date.now().toString(36)}${i}`, name: '', unit: 'attempts', volume: 0, convert: 0, ticket: 0, startsWeek: 1, note: '' });
const SENT = new Set(['dm_sent', 'proposal']);

export default function Revenue() {
  const ctx = useBiz();
  const biz = useBizApi();
  const { showToast } = useToast();
  const [model, setModel] = useState(null);
  const [saved, setSaved] = useState('[]');
  const [busy, setBusy] = useState(false);
  const [scen, setScen] = useState('base');
  const [root, setRoot] = useState(null);
  const [hover, setHover] = useState(null);
  const phone = useMedia('(max-width: 900px)');
  const s = ctx.sum;

  useEffect(() => {
    if (!s || model) return;
    const m = s.settings?.revenue_model || [];
    setModel(m); setSaved(JSON.stringify(m));
  }, [s, model]);

  const dirty = model && JSON.stringify(model) !== saved;
  const cur = s?.settings?.currency || 'EUR';
  const mult = SCENARIOS[scen];
  const totals = useMemo(() => Object.fromEntries(Object.entries(SCENARIOS).map(([k, m]) => [k, modelTotal(model, m)])), [model]);
  const actual = useMemo(() => {
    const a = {};
    for (const r of s?.flow?.results || []) {
      const id = s.flow.links?.resultModel?.[r.channel];
      if (id && SENT.has(r.type)) a[id] = (a[id] || 0) + (r.n || 0);
    }
    return a;
  }, [s]);
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
      ctx.changed();
    } catch (e) { showToast(e.message, 'error'); } finally { setBusy(false); }
  };
  const template = async () => {
    try {
      await biz.current.template('revenue');
      const st = await biz.current.settings();
      setModel(st.revenue_model || []); setSaved(JSON.stringify(st.revenue_model || []));
      ctx.changed();
      showToast('Sample model added — change every number to your own guess', 'success');
    } catch (e) { showToast(e.message, 'error'); }
  };

  const target = s?.cash?.target_value || 0;
  const total = totals[scen];
  const links = [
    ...model.map((c, i) => {
      const v = channelCash(c) * mult;
      return { id: `m${i}`, from: `rm:${i}`, to: 'rm-total', tone: v > 0 ? 'flow' : 'dim', dashed: v <= 0, idle: v <= 0, weight: v > 0 && total > 0 ? 1.8 + (v / total) * 7 : 1.4 };
    }),
    ...(target ? [{ id: 'total>target', from: 'rm-total', to: 'rm-target', tone: total >= target ? 'good' : 'warn', weight: 4 }] : []),
  ];
  const hot = hover === null ? null : new Set(hover === 'total' ? links.map((l) => l.id) : [`m${hover}`, 'total>target']);

  return (
    <section className="bz-lens bz-revenue">
      <LensHead icon={TrendingUp} kicker="Revenue model" title={model.length ? `${money(total, cur)} ${scen} case` : 'No model yet'}
        read={target ? `${Math.round((total / target) * 100)}% of the ${money(target, cur)} target in the ${scen} case. Expected cash per channel = volume × convert % × ticket.` : 'Link a cash key result on the mission flow to compare the model with your target.'}>
        {model.length > 0 && (
          <div className="ui-seg bz-seg-sm" role="radiogroup" aria-label="Scenario">
            {Object.entries(SCENARIOS).map(([k, m]) => (
              <button key={k} type="button" role="radio" aria-checked={scen === k} className={scen === k ? 'on' : ''} onClick={() => setScen(k)}>{k} <em className="bz-seg-n">×{m}</em></button>
            ))}
          </div>
        )}
        {model.length > 0 && <button type="button" className="btn btn-secondary" onClick={() => setModel((m) => [...m, blank(m.length)])}><Plus size={16} /> Channel</button>}
      </LensHead>

      {model.length === 0 ? (
        <BizEmpty icon={TrendingUp} title="No revenue model yet" text="List the channels that could bring money, how many attempts you will make, what share converts and the ticket. You get a low / base / high forecast against your cash target."
          onAdd={() => setModel([blank(0)])} addLabel="Add a channel" onTemplate={template} />
      ) : (
        <div className="bz-rev" ref={setRoot}>
          <FlowLinks root={root} links={links} active={hot} simplify={phone} version={`${model.length}-${scen}-${phone}`} />
          <div className="bz-rev-rows" data-node-group="rows">
            {model.map((c, i) => {
              const v = channelCash(c) * mult;
              return (
                <article key={c.id || i} className="bz-rev-row" onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
                  <header className="bz-rev-head">
                    <textarea rows={1} className="bz-in bz-rev-name" aria-label="Channel name" placeholder="Channel name" value={c.name} onChange={(e) => set(i, 'name', e.target.value.replace(/\n/g, ' '))} />
                    <button type="button" className="bz-icon-btn" aria-label={`Remove ${c.name || 'channel'}`} onClick={() => setModel((m) => m.filter((_, j) => j !== i))}><Trash2 size={15} /></button>
                    <span className={`bz-rev-cash ${v > 0 ? '' : 'quiet'}`}>{money(v, cur)}</span>
                  </header>
                  <div className="bz-rev-eq">
                    <label><span>Volume</span><input className="bz-in" type="number" min="0" inputMode="decimal" value={c.volume} onChange={(e) => set(i, 'volume', num(e.target.value))} /></label>
                    <i aria-hidden="true">×</i>
                    <label><span>Convert %</span><input className="bz-in" type="number" min="0" max="100" step="0.01" inputMode="decimal" value={c.convert} onChange={(e) => set(i, 'convert', num(e.target.value))} /></label>
                    <i aria-hidden="true">×</i>
                    <label><span>Ticket {cur}</span><input className="bz-in" type="number" min="0" inputMode="decimal" value={c.ticket} onChange={(e) => set(i, 'ticket', num(e.target.value))} /></label>
                    <label className="bz-rev-unit"><span>Unit</span><input className="bz-in" value={c.unit} onChange={(e) => set(i, 'unit', e.target.value)} /></label>
                    <label className="bz-rev-wk"><span>From week</span><input className="bz-in" type="number" min="0" value={c.startsWeek} onChange={(e) => set(i, 'startsWeek', num(e.target.value))} /></label>
                  </div>
                  <div className="bz-rev-foot">
                    {Number(c.volume) > 0 && (
                      <span className="bz-rev-actual" title="Attempts logged in Results for this channel">
                        <i style={{ width: `${Math.min(100, ((actual[c.id] || 0) / Number(c.volume)) * 100)}%` }} />
                        <b>{actual[c.id] || 0}</b> / {c.volume} {c.unit} logged
                      </span>
                    )}
                    <textarea className="bz-in bz-rev-note" rows={1} aria-label="Note" placeholder="Where the numbers come from" value={c.note} onChange={(e) => set(i, 'note', e.target.value)} />
                  </div>
                  {!phone && <span className={`bz-port right ${v > 0 ? '' : 'idle'}`} data-node={`rm:${i}`} aria-hidden="true" />}
                </article>
              );
            })}
          </div>
          <div className="bz-rev-sink" data-node-group="sink">
            <div data-node="rm-total" className="bz-node kind-total" onMouseEnter={() => setHover('total')} onMouseLeave={() => setHover(null)}>
              <span className="bz-node-cap">{scen} case</span>
              <b className="bz-big">{money(total, cur)}</b>
              <small className="bz-node-sub">low {money(totals.low, cur)} · high {money(totals.high, cur)}</small>
            </div>
            {target > 0 && (
              <div data-node="rm-target" className={`bz-node kind-cash ${total >= target ? 'ok' : 'short'}`}>
                <Target size={15} aria-hidden="true" />
                <span className="bz-node-cap">Cash target</span>
                <b className="bz-big">{money(target, cur)}</b>
                <small className="bz-node-sub">{total >= target ? `covered ${Math.round((total / target) * 100)}%` : `${money(target - total, cur)} short`}</small>
              </div>
            )}
          </div>
        </div>
      )}
      {dirty && (
        <div className="bz-savebar" role="region" aria-label="Unsaved model">
          <span>Unsaved changes to the model</span>
          <button type="button" className="btn btn-ghost" onClick={() => setModel(JSON.parse(saved))}>Discard</button>
          <button type="button" className="btn btn-primary" disabled={busy} onClick={save}><Save size={16} /> {busy ? 'Saving…' : 'Save model'}</button>
        </div>
      )}
    </section>
  );
}
