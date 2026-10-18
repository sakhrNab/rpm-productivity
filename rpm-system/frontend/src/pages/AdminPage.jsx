import { useCallback, useContext, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ShieldCheck, LayoutDashboard, Inbox, Users, MailPlus, KeyRound, ShieldAlert, Check, X, ArrowRight, Activity,
} from 'lucide-react';
import { AuthContext } from '../App';
import { useToast } from '../components/ToastProvider';
import { Requests, Members, Invites, Codes, Security, eventMeta, useAdminLoad, copyText, initials, ago } from '../components/admin/AdminSections';
import '../components/admin/Admin.css';

// The admin dashboard: who gets in (requests, invites, codes), who is in (members) and what happened
// (security log). One URL per tab: /admin/requests … Admins only (route guard + API).
const TABS = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'requests', label: 'Requests', icon: Inbox },
  { id: 'members', label: 'Members', icon: Users },
  { id: 'invites', label: 'Invites', icon: MailPlus },
  { id: 'codes', label: 'Codes', icon: KeyRound },
  { id: 'security', label: 'Security', icon: ShieldAlert },
];

export default function AdminPage() {
  const { tab: raw } = useParams();
  const tab = TABS.some(t => t.id === raw) ? raw : 'overview';
  const navigate = useNavigate();
  const { api } = useContext(AuthContext);
  const overview = useAdminLoad(useCallback(() => api.admin.overview(), [api]));
  const o = overview.data;
  const go = (id) => navigate(id === 'overview' ? '/admin' : `/admin/${id}`);

  const stats = o ? [
    { label: 'Members', value: o.members.members, sub: `${o.members.active_7d} active this week`, icon: Users, to: 'members' },
    { label: 'Waiting for you', value: o.queue.requests, sub: 'access requests', icon: Inbox, to: 'requests', tone: o.queue.requests ? 'warn' : '' },
    { label: 'Open invites', value: o.queue.invites, sub: 'not used yet', icon: MailPlus, to: 'invites' },
    { label: 'Live codes', value: o.queue.codes, sub: 'can still admit', icon: KeyRound, to: 'codes' },
    { label: 'Failed sign-ins', value: o.security24h.failed_logins, sub: 'last 24 hours', icon: ShieldAlert, to: 'security', tone: o.security24h.failed_logins > 10 ? 'bad' : '' },
  ] : [];

  return (
    <div className="adm-page">
      <header className="ui-card adm-hero">
        <div className="adm-hero-top">
          <div className="ui-icon-badge"><ShieldCheck size={22} /></div>
          <div className="adm-hero-text">
            <p className="ui-kicker">Workspace</p>
            <h1 className="adm-title"><span className="ui-title-grad">Admin</span></h1>
            <p className="adm-sub">Who gets in, who's in, and what's happening on your RPM.</p>
          </div>
        </div>
        <div className="adm-stats">
          {stats.map(s => (
            <button key={s.label} type="button" className={`adm-stat ${s.tone ? `is-${s.tone}` : ''}`} onClick={() => go(s.to)}>
              <s.icon size={16} aria-hidden="true" />
              <b>{s.value}</b>
              <span className="adm-stat-label">{s.label}</span>
              <span className="adm-stat-sub">{s.sub}</span>
            </button>
          ))}
          {!o && !overview.error && <div className="adm-stats-skel" aria-hidden="true" />}
        </div>
      </header>

      <nav className="ui-seg adm-tabs" role="tablist" aria-label="Admin sections">
        {TABS.map(t => (
          <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} onClick={() => go(t.id)}>
            <t.icon size={15} /> {t.label}
            {t.id === 'requests' && o?.queue.requests > 0 && <span className="adm-tab-badge">{o.queue.requests}</span>}
          </button>
        ))}
      </nav>

      {overview.error && tab === 'overview' && <div className="ui-empty">{overview.error}</div>}
      {tab === 'overview' && o && <Overview o={o} go={go} onChange={overview.reload} />}
      {tab === 'requests' && <Requests onChange={overview.reload} />}
      {tab === 'members' && <Members onChange={overview.reload} />}
      {tab === 'invites' && <Invites onChange={overview.reload} />}
      {tab === 'codes' && <Codes onChange={overview.reload} />}
      {tab === 'security' && <Security />}
    </div>
  );
}

function Overview({ o, go, onChange }) {
  const { api } = useContext(AuthContext);
  const { showToast } = useToast();
  const pending = useAdminLoad(useCallback(() => api.admin.requests(), [api]));
  const [busy, setBusy] = useState(null);
  const waiting = (pending.data || []).filter(r => r.status === 'pending').slice(0, 5);
  const max = Math.max(1, ...o.signups30d.map(d => d.n));
  const total30 = o.signups30d.reduce((a, d) => a + d.n, 0);
  const sec = o.security24h;

  const decide = async (r, approve) => {
    if (!approve && !window.confirm(`Deny ${r.name}'s request?`)) return;
    setBusy(r.id);
    try {
      if (approve) {
        const out = await api.admin.approveRequest(r.id);
        if (out.status === 'sent') showToast(`Approved — invite emailed to ${r.email}`, 'success');
        else { await copyText(out.joinUrl); showToast("Approved, but the email couldn't be sent — invite link copied, send it yourself", 'info', 9000); }
      } else {
        await api.admin.denyRequest(r.id);
        showToast('Request denied', 'info');
      }
      pending.reload(); onChange();
    } catch (e) { showToast(e.message, 'error'); }
    finally { setBusy(null); }
  };

  return (
    <div className="adm-grid">
      <section className="ui-card adm-panel adm-span-2">
        <div className="adm-panel-head">
          <p className="ui-kicker"><Inbox size={14} /> Waiting for you <span className="ui-count">{o.queue.requests}</span></p>
          <button type="button" className="adm-more" onClick={() => go('requests')}>All requests <ArrowRight size={14} /></button>
        </div>
        {waiting.length === 0 ? (
          <div className="ui-empty"><Check size={20} />Nothing waiting. New access requests land here and in your inbox.</div>
        ) : (
          <ul className="adm-list">
            {waiting.map(r => (
              <li key={r.id} className="adm-row">
                <span className="adm-avatar" aria-hidden="true">{initials(r.name)}</span>
                <div className="adm-row-main">
                  <b>{r.name}</b>
                  <span className="adm-muted">{r.email} · {ago(r.created_at)}</span>
                  {r.message && <p className="adm-quote">{r.message}</p>}
                </div>
                <div className="adm-row-actions">
                  <button type="button" className="btn-primary adm-btn" disabled={busy === r.id} onClick={() => decide(r, true)}><Check size={15} /> Approve</button>
                  <button type="button" className="btn-ghost adm-btn" disabled={busy === r.id} onClick={() => decide(r, false)} aria-label={`Deny ${r.name}`}><X size={15} /> Deny</button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="ui-card adm-panel">
        <div className="adm-panel-head">
          <p className="ui-kicker"><ShieldAlert size={14} /> Security · 24h</p>
          <button type="button" className="adm-more" onClick={() => go('security')}>Log <ArrowRight size={14} /></button>
        </div>
        <dl className="adm-kv">
          <div className={sec.failed_logins ? 'is-bad' : ''}><dt>Failed sign-ins</dt><dd>{sec.failed_logins}</dd></div>
          <div className={sec.rate_limited ? 'is-bad' : ''}><dt>Rate-limited</dt><dd>{sec.rate_limited}</dd></div>
          <div className={sec.blocked_signups ? 'is-warn' : ''}><dt>Blocked sign-ups</dt><dd>{sec.blocked_signups}</dd></div>
          <div className={sec.access_denied ? 'is-warn' : ''}><dt>Access denied</dt><dd>{sec.access_denied}</dd></div>
          <div><dt>Distinct hostile IPs</dt><dd>{sec.hostile_ips}</dd></div>
        </dl>
      </section>

      <section className="ui-card adm-panel adm-span-2">
        <div className="adm-panel-head">
          <p className="ui-kicker"><Users size={14} /> Sign-ups · 30 days <span className="ui-count">{total30}</span></p>
          <span className="adm-muted">{o.members.admins} admin{o.members.admins === 1 ? '' : 's'}{o.members.disabled ? ` · ${o.members.disabled} disabled` : ''}</span>
        </div>
        <div className="adm-bars" role="img" aria-label={`${total30} sign-ups in the last 30 days`}>
          {o.signups30d.map(d => (
            <span key={d.day} className={d.n ? 'on' : ''} style={{ '--h': `${(d.n / max) * 100}%` }} title={`${d.day}: ${d.n} sign-up${d.n === 1 ? '' : 's'}`} />
          ))}
        </div>
        <div className="adm-bars-axis"><span>{o.signups30d[0]?.day}</span><span>today</span></div>
      </section>

      <section className="ui-card adm-panel">
        <div className="adm-panel-head"><p className="ui-kicker"><Activity size={14} /> Recent activity</p></div>
        {o.activity.length === 0 ? <div className="ui-empty">No sign-ups or admin actions yet.</div> : (
          <ul className="adm-feed">
            {o.activity.map((a, i) => {
              const m = eventMeta(a.event, a.reason);
              return (
                <li key={i}>
                  <span className={`adm-dot tone-${m.tone}`} aria-hidden="true" />
                  <div><b>{m.label}</b>{a.reason && a.event !== 'signup' ? <span className="adm-muted"> · {a.reason.replace(/_/g, ' ')}</span> : null}
                    <span className="adm-feed-who">{a.user_email || '—'} · {ago(a.ts)}</span></div>
                </li>
              );
            })}
          </ul>
        )}
        <p className="adm-foot"><Link to="/admin/security">Full security log →</Link></p>
      </section>
    </div>
  );
}
