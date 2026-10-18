import { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  Check, X, Copy, Send, RotateCw, Ban, Search, KeyRound, MailPlus, Plus, ShieldCheck, UserX, UserCheck, Inbox, Globe,
} from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { AuthContext } from '../../App';
import { useToast } from '../ToastProvider';
import Picker from '../Picker';

// ───────── shared bits ─────────
export const initials = (name = '') => name.split(/\s+/).filter(Boolean).map(n => n[0]).join('').toUpperCase().slice(0, 2) || '?';
export const ago = (ts) => (ts ? `${formatDistanceToNow(new Date(ts))} ago` : '—');
const day = (ts) => (ts ? format(new Date(ts), 'd MMM yyyy') : '—');

export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
}

/** { data, loading, error, reload } for one admin API call. */
export function useAdminLoad(loader) {
  const [state, setState] = useState({ data: null, loading: true, error: '' });
  const reload = useCallback(() => {
    setState(s => ({ ...s, loading: true }));
    return loader().then(data => setState({ data, loading: false, error: '' }))
      .catch(e => setState(s => ({ ...s, loading: false, error: e.message || 'Failed to load' })));
  }, [loader]);
  useEffect(() => { reload(); }, [reload]);
  return { ...state, reload };
}

const EVENTS = {
  login_success: { label: 'Signed in', tone: 'good' },
  login_failed: { label: 'Failed sign-in', tone: 'bad' },
  login_rate_limited: { label: 'Rate-limited', tone: 'bad' },
  password_reset_requested: { label: 'Password reset', tone: 'info' },
  signup: { label: 'Sign-up', tone: 'good' },
  access_denied: { label: 'Access denied', tone: 'bad' },
  webhook_rejected: { label: 'Webhook rejected', tone: 'warn' },
  access_requested: { label: 'Access requested', tone: 'info' },
  admin_action: { label: 'Admin action', tone: 'ai' },
};
export function eventMeta(event, reason) {
  if (event === 'signup' && reason && reason !== 'created') return { label: 'Sign-up blocked', tone: 'warn' };
  if (event === 'signup') return { label: 'New member', tone: 'good' };
  return EVENTS[event] || { label: event, tone: 'info' };
}
const TONE_CHIP = { good: 'ui-chip--good', bad: 'ui-chip--bad', warn: 'ui-chip--warn', info: 'ui-chip--info', ai: 'ui-chip--ai' };

const Loading = () => <div className="adm-loading"><div className="spinner" /></div>;
const Failed = ({ error }) => <div className="ui-empty">{error}</div>;

/** Text input with a leading icon, in the admin's style. */
function Field({ icon: Icon, label, ...props }) {
  return (
    <label className="adm-field">
      <span className="adm-field-label">{label}</span>
      <span className="adm-input">{Icon && <Icon size={15} aria-hidden="true" />}<input {...props} /></span>
    </label>
  );
}

function CopyLink({ url, label = 'Copy link' }) {
  const { showToast } = useToast();
  return (
    <button type="button" className="btn-ghost adm-btn" onClick={async () => showToast((await copyText(url)) ? 'Invite link copied' : url, 'info')}>
      <Copy size={14} /> {label}
    </button>
  );
}

// ───────── access requests ─────────
export function Requests({ onChange }) {
  const { api } = useContext(AuthContext);
  const { showToast } = useToast();
  const list = useAdminLoad(useCallback(() => api.admin.requests(), [api]));
  const [filter, setFilter] = useState('pending');
  const [busy, setBusy] = useState(null);
  if (list.loading && !list.data) return <Loading />;
  if (list.error) return <Failed error={list.error} />;
  const rows = list.data.filter(r => filter === 'all' || r.status === 'pending');
  const pendingCount = list.data.filter(r => r.status === 'pending').length;

  const decide = async (r, approve) => {
    if (!approve && !window.confirm(`Deny ${r.name}'s request? They won't be told automatically.`)) return;
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
      await list.reload(); onChange();
    } catch (e) { showToast(e.message, 'error'); }
    finally { setBusy(null); }
  };

  return (
    <section className="ui-card adm-panel">
      <div className="adm-panel-head">
        <p className="ui-kicker"><Inbox size={14} /> Access requests</p>
        <div className="ui-seg adm-seg-sm" role="tablist" aria-label="Filter requests">
          <button type="button" role="tab" aria-selected={filter === 'pending'} onClick={() => setFilter('pending')}>Pending · {pendingCount}</button>
          <button type="button" role="tab" aria-selected={filter === 'all'} onClick={() => setFilter('all')}>All · {list.data.length}</button>
        </div>
      </div>
      <p className="adm-help">People who asked to join from the sign-up page. Approving emails them a personal invite link (one use, 30 days).</p>
      {rows.length === 0 ? (
        <div className="ui-empty"><Check size={20} />{filter === 'pending' ? 'No requests waiting.' : 'No requests yet.'}</div>
      ) : (
        <ul className="adm-list">
          {rows.map(r => (
            <li key={r.id} className="adm-row">
              <span className="adm-avatar" aria-hidden="true">{initials(r.name)}</span>
              <div className="adm-row-main">
                <b>{r.name}</b>
                <span className="adm-muted">{r.email} · asked {ago(r.created_at)}</span>
                {r.message && <p className="adm-quote">{r.message}</p>}
                {r.status !== 'pending' && (
                  <span className="adm-muted adm-small">{r.status === 'approved' ? 'Approved' : 'Denied'}{r.reviewed_by_name ? ` by ${r.reviewed_by_name}` : ''} · {ago(r.reviewed_at)}</span>
                )}
              </div>
              <div className="adm-row-actions">
                {r.is_member && <span className="ui-chip ui-chip--good"><UserCheck size={12} /> Member</span>}
                {r.status === 'pending' ? (
                  <>
                    <button type="button" className="btn-primary adm-btn" disabled={busy === r.id} onClick={() => decide(r, true)}><Check size={15} /> Approve</button>
                    <button type="button" className="btn-ghost adm-btn" disabled={busy === r.id} onClick={() => decide(r, false)} aria-label={`Deny ${r.name}`}><X size={15} /> Deny</button>
                  </>
                ) : (
                  <span className={`ui-chip ${r.status === 'approved' ? 'ui-chip--good' : 'ui-chip--bad'}`}>{r.status}</span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ───────── members ─────────
const ROLE_OPTIONS = [
  { value: 'member', label: 'Member', hint: 'Their own private RPM' },
  { value: 'admin', label: 'Admin', hint: 'Also this dashboard' },
];
function joinedHow(m) {
  if (m.joined_via === 'code') return `Code ${m.joined_code || ''}`.trim();
  if (m.joined_via === 'invite') return m.inviter_name ? `Invited by ${m.inviter_name}` : 'Invite';
  if (m.joined_via === 'bootstrap') return 'Founder';
  if (m.joined_via === 'allowlist') return 'Allow-list';
  return 'Before invites';
}

export function Members({ onChange }) {
  const { api, user } = useContext(AuthContext);
  const { showToast } = useToast();
  const list = useAdminLoad(useCallback(() => api.admin.members(), [api]));
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(null);
  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (list.data || []).filter(m => !s || m.name.toLowerCase().includes(s) || m.email.toLowerCase().includes(s));
  }, [list.data, q]);
  if (list.loading && !list.data) return <Loading />;
  if (list.error) return <Failed error={list.error} />;

  const update = async (m, patch, done) => {
    setBusy(m.id);
    try { await api.admin.updateMember(m.id, patch); showToast(done, 'success'); await list.reload(); onChange(); }
    catch (e) { showToast(e.message, 'error'); }
    finally { setBusy(null); }
  };
  const toggleDisabled = (m) => {
    if (!m.disabled_at && !window.confirm(`Disable ${m.name}? They're signed out and can't sign in until you re-enable them. Their data is kept.`)) return;
    update(m, { disabled: !m.disabled_at }, m.disabled_at ? `${m.name} can sign in again` : `${m.name} is disabled`);
  };

  return (
    <section className="ui-card adm-panel">
      <div className="adm-panel-head">
        <p className="ui-kicker"><ShieldCheck size={14} /> Members <span className="ui-count">{list.data.length}</span></p>
        <label className="adm-input adm-search"><Search size={15} aria-hidden="true" /><input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Search name or email" aria-label="Search members" /></label>
      </div>
      <p className="adm-help">Every member has their own private RPM. Admins also get this dashboard. Disabling signs someone out and blocks sign-in; nothing is deleted.</p>
      {rows.length === 0 ? <div className="ui-empty">No one matches “{q}”.</div> : (
        <ul className="adm-list">
          {rows.map(m => {
            const self = m.id === user?.id;
            return (
              <li key={m.id} className={`adm-row ${m.disabled_at ? 'is-off' : ''}`}>
                {m.avatar ? <img src={m.avatar} alt="" className="adm-avatar" /> : <span className="adm-avatar" aria-hidden="true">{initials(m.name)}</span>}
                <div className="adm-row-main">
                  <b>{m.name}{self && <span className="adm-muted"> (you)</span>}</b>
                  <span className="adm-muted">{m.email}</span>
                  <span className="adm-meta">
                    <span className="ui-chip">{joinedHow(m)}</span>
                    <span>Joined {day(m.created_at)}</span>
                    <span>Active {m.last_active ? ago(m.last_active) : 'never'}</span>
                    <span>{m.actions} action{m.actions === 1 ? '' : 's'}</span>
                    {m.provider !== 'local' && <span className="ui-chip">{m.provider}</span>}
                    {m.disabled_at && <span className="ui-chip ui-chip--bad">Disabled</span>}
                  </span>
                </div>
                <div className="adm-row-actions">
                  <Picker
                    value={m.role}
                    options={ROLE_OPTIONS}
                    header="Role"
                    className="adm-role"
                    disabled={self || busy === m.id}
                    title={self ? "You can't change your own role" : 'Change role'}
                    onChange={(role) => update(m, { role }, `${m.name} is now ${role === 'admin' ? 'an admin' : 'a member'}`)}
                  />
                  <button type="button" className={`btn-ghost adm-btn ${m.disabled_at ? '' : 'adm-danger'}`} disabled={self || busy === m.id} onClick={() => toggleDisabled(m)}>
                    {m.disabled_at ? <><UserCheck size={15} /> Enable</> : <><UserX size={15} /> Disable</>}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

// ───────── invites ─────────
const SOURCE_LABEL = { person: 'Added as contact', admin: 'Admin invite', request: 'Approved request' };
const INVITE_TONE = { pending: 'ui-chip--info', accepted: 'ui-chip--good', expired: 'ui-chip--warn', revoked: 'ui-chip--bad' };

export function Invites({ onChange }) {
  const { api } = useContext(AuthContext);
  const { showToast } = useToast();
  const list = useAdminLoad(useCallback(() => api.admin.invitations(), [api]));
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [sending, setSending] = useState(false);
  const [lastLink, setLastLink] = useState(null);   // { email, url } when the email couldn't be sent
  const [filter, setFilter] = useState('open');
  const [busy, setBusy] = useState(null);

  const send = async (e) => {
    e.preventDefault();
    setSending(true); setLastLink(null);
    try {
      const out = await api.admin.invite({ email, name });
      if (out.status === 'sent') showToast(`Invite emailed to ${email}`, 'success');
      else { setLastLink({ email, url: out.joinUrl }); showToast("Invite created, but the email couldn't be sent — copy the link below", 'info', 7000); }
      setEmail(''); setName('');
      await list.reload(); onChange();
    } catch (err) { showToast(err.message, 'error'); }
    finally { setSending(false); }
  };
  const act = async (inv, what) => {
    if (what === 'revoke' && !window.confirm(`Revoke the invite for ${inv.email}? The link stops working.`)) return;
    setBusy(inv.id);
    try {
      if (what === 'revoke') { await api.admin.revokeInvite(inv.id); showToast('Invite revoked', 'info'); }
      else {
        const out = await api.admin.resendInvite(inv.id);
        if (out.status === 'sent') showToast(`Invite re-sent to ${inv.email} (valid 30 more days)`, 'success');
        else { await copyText(out.joinUrl); showToast("Renewed, but the email couldn't be sent — link copied", 'info', 7000); }
      }
      await list.reload(); onChange();
    } catch (e) { showToast(e.message, 'error'); }
    finally { setBusy(null); }
  };

  const rows = (list.data || []).filter(i => filter === 'all' || i.status === 'pending' || i.status === 'expired');

  return (
    <div className="adm-stack">
      <form className="ui-card adm-panel adm-form" onSubmit={send}>
        <p className="ui-kicker"><MailPlus size={14} /> Invite someone</p>
        <p className="adm-help">They get an email with a personal link that creates their account — no code needed. They can also just sign up (or use Google/Microsoft) with this email.</p>
        <div className="adm-form-row">
          <Field icon={MailPlus} label="Email" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="name@example.com" required />
          <Field label="Name (optional)" type="text" value={name} onChange={e => setName(e.target.value)} placeholder="For the greeting" maxLength={100} />
          <button type="submit" className="btn-primary adm-btn adm-submit" disabled={sending}><Send size={15} /> {sending ? 'Sending…' : 'Send invite'}</button>
        </div>
        {lastLink && (
          <div className="adm-linkbox">
            <span>Link for <b>{lastLink.email}</b>:</span>
            <code>{lastLink.url}</code>
            <CopyLink url={lastLink.url} />
          </div>
        )}
      </form>

      <section className="ui-card adm-panel">
        <div className="adm-panel-head">
          <p className="ui-kicker">Invitations</p>
          <div className="ui-seg adm-seg-sm" role="tablist" aria-label="Filter invites">
            <button type="button" role="tab" aria-selected={filter === 'open'} onClick={() => setFilter('open')}>Open</button>
            <button type="button" role="tab" aria-selected={filter === 'all'} onClick={() => setFilter('all')}>All</button>
          </div>
        </div>
        {list.loading && !list.data ? <Loading /> : list.error ? <Failed error={list.error} /> : rows.length === 0 ? (
          <div className="ui-empty">{filter === 'open' ? 'No open invites.' : 'No invites yet.'}</div>
        ) : (
          <ul className="adm-list">
            {rows.map(i => (
              <li key={i.id} className="adm-row">
                <span className="adm-avatar" aria-hidden="true">{initials(i.name || i.email)}</span>
                <div className="adm-row-main">
                  <b>{i.name || i.email}</b>
                  {i.name && <span className="adm-muted">{i.email}</span>}
                  <span className="adm-meta">
                    <span className={`ui-chip ${INVITE_TONE[i.status] || ''}`}>{i.status}</span>
                    <span>{SOURCE_LABEL[i.source] || i.source}{i.inviter_name ? ` · by ${i.inviter_name}` : ''}</span>
                    <span>Created {ago(i.created_at)}</span>
                    {i.status === 'pending' && <span>{i.sent_at ? `Emailed ${ago(i.sent_at)}` : 'Not emailed'}</span>}
                    {i.status === 'pending' && i.expires_at && <span>Expires {day(i.expires_at)}</span>}
                    {i.status === 'accepted' && <span>Joined {ago(i.accepted_at)}{i.accepted_name ? ` as ${i.accepted_name}` : ''}</span>}
                  </span>
                </div>
                <div className="adm-row-actions">
                  {i.joinUrl && <CopyLink url={i.joinUrl} />}
                  {(i.status === 'pending' || i.status === 'expired') && (
                    <button type="button" className="btn-ghost adm-btn" disabled={busy === i.id} onClick={() => act(i, 'resend')}><RotateCw size={14} /> {i.status === 'expired' ? 'Renew' : 'Resend'}</button>
                  )}
                  {i.status === 'pending' && (
                    <button type="button" className="btn-ghost adm-btn adm-danger" disabled={busy === i.id} onClick={() => act(i, 'revoke')} aria-label={`Revoke invite for ${i.email}`}><Ban size={14} /> Revoke</button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

// ───────── registration codes ─────────
const EXPIRY_OPTIONS = [
  { value: '', label: 'Never expires' },
  { value: '1', label: '1 day' },
  { value: '7', label: '7 days' },
  { value: '30', label: '30 days' },
  { value: '90', label: '90 days' },
];
const CODE_TONE = { active: 'ui-chip--good', used_up: 'ui-chip--info', expired: 'ui-chip--warn', revoked: 'ui-chip--bad' };
const CODE_LABEL = { active: 'Active', used_up: 'Used up', expired: 'Expired', revoked: 'Revoked' };

export function Codes({ onChange }) {
  const { api } = useContext(AuthContext);
  const { showToast } = useToast();
  const list = useAdminLoad(useCallback(() => api.admin.codes(), [api]));
  const [label, setLabel] = useState('');
  const [uses, setUses] = useState('1');
  const [expiry, setExpiry] = useState('30');
  const [creating, setCreating] = useState(false);
  const [fresh, setFresh] = useState(null);
  const [busy, setBusy] = useState(null);

  const create = async (e) => {
    e.preventDefault();
    setCreating(true);
    try {
      const out = await api.admin.createCode({ label, max_uses: Number(uses), expires_days: expiry || null });
      setFresh(out.code);
      await copyText(out.code);
      showToast(`Code ${out.code} created and copied`, 'success');
      setLabel('');
      await list.reload(); onChange();
    } catch (err) { showToast(err.message, 'error'); }
    finally { setCreating(false); }
  };
  const revoke = async (c) => {
    if (!window.confirm(`Revoke ${c.code}? Nobody can sign up with it after this.`)) return;
    setBusy(c.id);
    try { await api.admin.revokeCode(c.id); showToast('Code revoked', 'info'); await list.reload(); onChange(); }
    catch (e) { showToast(e.message, 'error'); }
    finally { setBusy(null); }
  };
  const copy = async (code) => showToast((await copyText(code)) ? `${code} copied` : code, 'info');

  return (
    <div className="adm-stack">
      <form className="ui-card adm-panel adm-form" onSubmit={create}>
        <p className="ui-kicker"><KeyRound size={14} /> New registration code</p>
        <p className="adm-help">Hand a code to anyone — in a message, a workshop, a post. They enter it on the sign-up page. Set how many people it admits and when it stops working.</p>
        <div className="adm-form-row">
          <Field label="Label (optional)" type="text" value={label} onChange={e => setLabel(e.target.value)} placeholder="e.g. October workshop" maxLength={120} />
          <Field label="People it admits" type="number" min={1} max={1000} value={uses} onChange={e => setUses(e.target.value)} required className="adm-num" />
          <div className="adm-field">
            <span className="adm-field-label">Expires</span>
            <Picker value={expiry} options={EXPIRY_OPTIONS} onChange={setExpiry} header="Code expires" className="adm-picker" />
          </div>
          <button type="submit" className="btn-primary adm-btn adm-submit" disabled={creating}><Plus size={15} /> {creating ? 'Creating…' : 'Create code'}</button>
        </div>
        {fresh && (
          <div className="adm-codebox">
            <code>{fresh}</code>
            <button type="button" className="btn-ghost adm-btn" onClick={() => copy(fresh)}><Copy size={14} /> Copy</button>
          </div>
        )}
      </form>

      <section className="ui-card adm-panel">
        <div className="adm-panel-head"><p className="ui-kicker">Codes</p></div>
        {list.loading && !list.data ? <Loading /> : list.error ? <Failed error={list.error} /> : list.data.length === 0 ? (
          <div className="ui-empty"><KeyRound size={20} />No codes yet. Create one above.</div>
        ) : (
          <ul className="adm-list">
            {list.data.map(c => (
              <li key={c.id} className={`adm-row ${c.status !== 'active' ? 'is-off' : ''}`}>
                <div className="adm-row-main">
                  <span className="adm-code-line">
                    <button type="button" className="adm-code" onClick={() => copy(c.code)} title="Copy code">{c.code} <Copy size={13} /></button>
                    <span className={`ui-chip ${CODE_TONE[c.status]}`}>{CODE_LABEL[c.status]}</span>
                  </span>
                  {c.label && <span className="adm-muted">{c.label}</span>}
                  <span className="adm-uses">
                    <span className="ui-meter" style={{ '--pct': `${Math.min(100, (c.uses / c.max_uses) * 100)}%` }}><i /></span>
                    <span>{c.uses} / {c.max_uses} used</span>
                  </span>
                  <span className="adm-meta">
                    <span>Created {ago(c.created_at)}{c.created_by_name ? ` by ${c.created_by_name}` : ''}</span>
                    <span>{c.expires_at ? `${new Date(c.expires_at) < new Date() ? 'Expired' : 'Expires'} ${day(c.expires_at)}` : 'Never expires'}</span>
                    {c.used_by.length > 0 && <span>Used by {c.used_by.map(u => u.name).join(', ')}</span>}
                  </span>
                </div>
                <div className="adm-row-actions">
                  {c.status === 'active' && (
                    <button type="button" className="btn-ghost adm-btn adm-danger" disabled={busy === c.id} onClick={() => revoke(c)} aria-label={`Revoke ${c.code}`}><Ban size={14} /> Revoke</button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

// ───────── security log ─────────
const RANGES = [{ id: 1, label: '24h' }, { id: 7, label: '7 days' }, { id: 30, label: '30 days' }, { id: 90, label: '90 days' }];

export function Security() {
  const { api } = useContext(AuthContext);
  const [days, setDays] = useState(7);
  const [event, setEvent] = useState('');
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  useEffect(() => { const t = setTimeout(() => setQuery(q), 300); return () => clearTimeout(t); }, [q]);
  const log = useAdminLoad(useCallback(() => api.admin.security({ days, event, q: query }), [api, days, event, query]));
  const d = log.data;
  const eventOptions = [{ value: '', label: 'All events' }, ...Object.entries(EVENTS).map(([value, m]) => ({ value, label: m.label }))];

  return (
    <div className="adm-stack">
      <section className="ui-card adm-panel">
        <div className="adm-panel-head adm-filters">
          <div className="ui-seg adm-seg-sm" role="tablist" aria-label="Time range">
            {RANGES.map(r => <button key={r.id} type="button" role="tab" aria-selected={days === r.id} onClick={() => setDays(r.id)}>{r.label}</button>)}
          </div>
          <Picker value={event} options={eventOptions} onChange={setEvent} header="Event" className="adm-picker" />
          <label className="adm-input adm-search"><Search size={15} aria-hidden="true" /><input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Email or IP" aria-label="Filter by email or IP" /></label>
        </div>
        {d && d.counts.length > 0 && (
          <div className="adm-counts">
            {d.counts.map(c => {
              const m = EVENTS[c.event] || { label: c.event, tone: 'info' };
              return (
                <button key={c.event} type="button" className={`ui-chip ${TONE_CHIP[m.tone]} ${event === c.event ? 'is-on' : ''}`} onClick={() => setEvent(event === c.event ? '' : c.event)}>
                  {m.label} · {c.n}
                </button>
              );
            })}
          </div>
        )}
      </section>

      <div className="adm-grid">
        <section className="ui-card adm-panel adm-span-2">
          <div className="adm-panel-head"><p className="ui-kicker">Events <span className="ui-count">{d?.events.length ?? ''}</span></p>{log.loading && d && <span className="adm-muted">Updating…</span>}</div>
          {log.loading && !d ? <Loading /> : log.error ? <Failed error={log.error} /> : d.events.length === 0 ? (
            <div className="ui-empty"><ShieldCheck size={20} />No events match.</div>
          ) : (
            <div className="adm-table-wrap">
              <table className="adm-table">
                <thead><tr><th>When</th><th>Event</th><th>Who</th><th>IP</th><th>Detail</th></tr></thead>
                <tbody>
                  {d.events.map(e => {
                    const m = eventMeta(e.event, e.reason);
                    return (
                      <tr key={e.id}>
                        <td title={format(new Date(e.ts), 'PPpp')}>{format(new Date(e.ts), 'd MMM HH:mm')}</td>
                        <td><span className={`ui-chip ${TONE_CHIP[m.tone]}`}>{m.label}</span></td>
                        <td className="adm-cell-wrap">{e.user_email || '—'}</td>
                        <td><button type="button" className="adm-ip" onClick={() => setQ(e.ip || '')} title="Show only this IP">{e.ip || '—'}</button></td>
                        <td className="adm-muted">{e.reason ? e.reason.replace(/_/g, ' ') : ''}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <p className="adm-foot">Events are kept 90 days. The same lines go to the server log (SECURITY_EVENT) for CrowdSec and the security dashboard.</p>
        </section>

        <section className="ui-card adm-panel">
          <div className="adm-panel-head"><p className="ui-kicker"><Globe size={14} /> Noisiest IPs</p></div>
          <p className="adm-help">Failed sign-ins, rate limits and denied access in this range.</p>
          {!d ? <Loading /> : d.topIps.length === 0 ? <div className="ui-empty"><Check size={20} />Nothing suspicious.</div> : (
            <ul className="adm-iplist">
              {d.topIps.map(ip => (
                <li key={ip.ip}>
                  <button type="button" className="adm-ip" onClick={() => setQ(ip.ip)}>{ip.ip}</button>
                  <span><b>{ip.n}</b> hit{ip.n === 1 ? '' : 's'} · {ip.accounts} account{ip.accounts === 1 ? '' : 's'}</span>
                  <span className="adm-muted">last {ago(ip.last)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
