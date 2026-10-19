const nodemailer = require('nodemailer');

// SMTP config (Zoho by default). Values come from the app's environment.
const SMTP = {
  host: process.env.SMTP_HOST || process.env.EMAIL_HOST || 'smtp.zoho.com',
  port: parseInt(process.env.SMTP_PORT || process.env.EMAIL_PORT || '465', 10),
  secure: (process.env.SMTP_SECURE || 'true') === 'true',
  user: process.env.SMTP_USER || process.env.EMAIL_USER || 'support@aiwaverider.com',
  pass: process.env.SMTP_PASS || process.env.EMAIL_PASSWORD || '',
  fromEmail: process.env.FROM_EMAIL || process.env.EMAIL_FROM || 'support@aiwaverider.com',
  fromName: process.env.FROM_NAME || process.env.EMAIL_FROM_NAME || 'AI Waverider · RPM',
};

let transporter = null;
function getTransporter() {
  if (!SMTP.pass) return null; // not configured — caller no-ops
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: SMTP.host,
      port: SMTP.port,
      secure: SMTP.secure,
      auth: { user: SMTP.user, pass: SMTP.pass },
    });
  }
  return transporter;
}

function escapeHtml(s = '') {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Why the invite came: a contact added you (default), the admin invited you, or your access request was approved.
const INVITE_REASONS = {
  person: (from) => `You received this because ${from} added you as a contact in RPM. If this wasn't expected, you can safely ignore it — no account is created until you sign up.`,
  admin: (from) => `You received this because ${from} invited you to RPM. This invite link is personal — it works once and expires in 30 days.`,
  request: () => `You asked for access to RPM and it was approved. This link is personal — it works once and expires in 30 days.`,
};

function invitationHtml({ recipientName, inviterName, joinUrl, source = 'person' }) {
  const hi = recipientName ? `Hi ${escapeHtml(recipientName)},` : 'Hi there,';
  const from = inviterName ? escapeHtml(inviterName) : 'A friend';
  return `<!doctype html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0a1120;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0a1120;padding:32px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#0f1d38;border:1px solid rgba(255,255,255,0.08);border-radius:20px;overflow:hidden;">
        <tr><td style="background:linear-gradient(135deg,#ff69b4,#9575cd 55%,#4ecdc4);height:6px;line-height:6px;font-size:6px;">&nbsp;</td></tr>
        <tr><td style="padding:36px 40px 8px;">
          <div style="font-size:13px;letter-spacing:2px;text-transform:uppercase;color:#4ecdc4;font-weight:700;">AI Waverider · RPM</div>
          <h1 style="margin:14px 0 6px;font-size:26px;line-height:1.25;color:#ffffff;font-weight:800;">You've been invited to design your life on purpose.</h1>
        </td></tr>
        <tr><td style="padding:8px 40px 0;color:#c3cfe2;font-size:15px;line-height:1.65;">
          <p style="margin:0 0 14px;">${hi}</p>
          <p style="margin:0 0 14px;"><strong style="color:#fff;">${from}</strong> is using <strong style="color:#fff;">RPM</strong> — a results-focused planning method — and thought it could help you too.</p>
          <p style="margin:0 0 14px;">RPM flips the usual to-do list on its head. Instead of drowning in tasks, you get crystal clear on three questions for anything that matters:</p>
          <table role="presentation" cellpadding="0" cellspacing="0" style="margin:6px 0 18px;">
            <tr><td style="padding:6px 0;color:#e6ecf7;font-size:15px;">🎯 &nbsp;<strong style="color:#fff;">Result</strong> — what specific outcome do I truly want?</td></tr>
            <tr><td style="padding:6px 0;color:#e6ecf7;font-size:15px;">💡 &nbsp;<strong style="color:#fff;">Purpose</strong> — why must I make this happen?</td></tr>
            <tr><td style="padding:6px 0;color:#e6ecf7;font-size:15px;">✅ &nbsp;<strong style="color:#fff;">Massive Action Plan</strong> — the steps that get me there.</td></tr>
          </table>
          <p style="margin:0 0 8px;">The result: less busywork, more momentum, and the deep satisfaction of moving toward the life you actually want — your health, wealth, relationships, and purpose, all in one place.</p>
        </td></tr>
        <tr><td align="center" style="padding:26px 40px 8px;">
          <a href="${joinUrl}" style="display:inline-block;background:linear-gradient(135deg,#4ecdc4,#6b8dd6);color:#04121a;text-decoration:none;font-weight:800;font-size:16px;padding:15px 34px;border-radius:999px;">Start your first RPM plan →</a>
        </td></tr>
        <tr><td align="center" style="padding:6px 40px 30px;color:#7f8ba3;font-size:12px;line-height:1.6;">
          or copy this link:<br><a href="${joinUrl}" style="color:#4ecdc4;word-break:break-all;">${joinUrl}</a>
        </td></tr>
        <tr><td style="padding:18px 40px 30px;border-top:1px solid rgba(255,255,255,0.07);color:#66728a;font-size:12px;line-height:1.6;">
          ${(INVITE_REASONS[source] || INVITE_REASONS.person)(from)}
        </td></tr>
      </table>
      <div style="max-width:560px;color:#4a5568;font-size:11px;padding:16px 8px;">© AI Waverider · RPM</div>
    </td></tr>
  </table>
</body>
</html>`;
}

// Fire-and-forget; never throws to the caller.
async function sendInvitation({ to, recipientName, inviterName, joinUrl, source = 'person' }) {
  const t = getTransporter();
  if (!t) { console.warn('[email] SMTP not configured — skipping invitation to', to); return { sent: false, reason: 'not_configured' }; }
  try {
    await t.sendMail({
      from: `"${SMTP.fromName}" <${SMTP.fromEmail}>`,
      to,
      subject: source === 'request'
        ? 'Your RPM access is approved — create your account'
        : `${inviterName || 'A friend'} invited you to RPM — design your life on purpose`,
      html: invitationHtml({ recipientName, inviterName, joinUrl, source }),
      text: `${recipientName ? 'Hi ' + recipientName + ',' : 'Hi there,'}\n\n${inviterName || 'A friend'} is using RPM — a results-focused planning method — and invited you to join.\n\nRPM helps you get clear on the Result you want, your Purpose for wanting it, and the Massive Action Plan to get there — across health, wealth, relationships and more.\n\nStart your first plan: ${joinUrl}\n\n— AI Waverider · RPM`,
    });
    return { sent: true };
  } catch (err) {
    console.error('[email] Failed to send invitation to', to, err.message);
    return { sent: false, reason: 'send_error' };
  }
}

function welcomeHtml({ name, appUrl }) {
  const hi = name ? `Welcome, ${escapeHtml(name)}!` : 'Welcome!';
  return `<!doctype html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0a1120;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0a1120;padding:32px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#0f1d38;border:1px solid rgba(255,255,255,0.08);border-radius:20px;overflow:hidden;">
        <tr><td style="background:linear-gradient(135deg,#4ecdc4,#6b8dd6 55%,#9575cd);height:6px;line-height:6px;font-size:6px;">&nbsp;</td></tr>
        <tr><td style="padding:36px 40px 8px;">
          <div style="font-size:13px;letter-spacing:2px;text-transform:uppercase;color:#4ecdc4;font-weight:700;">AI Waverider · RPM</div>
          <h1 style="margin:14px 0 6px;font-size:26px;line-height:1.25;color:#ffffff;font-weight:800;">${hi} Your account is ready.</h1>
        </td></tr>
        <tr><td style="padding:8px 40px 0;color:#c3cfe2;font-size:15px;line-height:1.65;">
          <p style="margin:0 0 14px;">You just joined RPM — a results-focused way to plan the things that actually matter. Here's the 60-second start:</p>
          <table role="presentation" cellpadding="0" cellspacing="0" style="margin:6px 0 18px;">
            <tr><td style="padding:6px 0;color:#e6ecf7;font-size:15px;"><strong style="color:#fff;">1.</strong> &nbsp;Create a <strong style="color:#fff;">Category</strong> — an area of your life (Health, Wealth, Relationships…).</td></tr>
            <tr><td style="padding:6px 0;color:#e6ecf7;font-size:15px;"><strong style="color:#fff;">2.</strong> &nbsp;Add a <strong style="color:#fff;">Project</strong> with an Ultimate Result and Purpose.</td></tr>
            <tr><td style="padding:6px 0;color:#e6ecf7;font-size:15px;"><strong style="color:#fff;">3.</strong> &nbsp;Break it into an <strong style="color:#fff;">RPM Block</strong> → a Massive Action Plan, and schedule the steps.</td></tr>
          </table>
          <p style="margin:0 0 8px;">That's the whole loop: get clear on the <strong style="color:#fff;">Result</strong>, know your <strong style="color:#fff;">Purpose</strong>, take <strong style="color:#fff;">Massive Action</strong>. Do it for one thing today and you'll feel the difference.</p>
        </td></tr>
        <tr><td align="center" style="padding:26px 40px 8px;">
          <a href="${appUrl}" style="display:inline-block;background:linear-gradient(135deg,#4ecdc4,#6b8dd6);color:#04121a;text-decoration:none;font-weight:800;font-size:16px;padding:15px 34px;border-radius:999px;">Open RPM →</a>
        </td></tr>
        <tr><td style="padding:22px 40px 30px;border-top:1px solid rgba(255,255,255,0.07);margin-top:12px;color:#66728a;font-size:12px;line-height:1.6;">
          Need a hand? Just reply to this email. — The AI Waverider team
        </td></tr>
      </table>
      <div style="max-width:560px;color:#4a5568;font-size:11px;padding:16px 8px;">© AI Waverider · RPM</div>
    </td></tr>
  </table>
</body>
</html>`;
}

async function sendWelcome({ to, name, appUrl }) {
  const t = getTransporter();
  if (!t) { console.warn('[email] SMTP not configured — skipping welcome to', to); return { sent: false }; }
  try {
    await t.sendMail({
      from: `"${SMTP.fromName}" <${SMTP.fromEmail}>`,
      to,
      subject: 'Welcome to RPM — let\'s design your life on purpose',
      html: welcomeHtml({ name, appUrl }),
      text: `${name ? 'Welcome, ' + name + '!' : 'Welcome!'}\n\nYour RPM account is ready. Quick start:\n1. Create a Category (an area of life).\n2. Add a Project with an Ultimate Result and Purpose.\n3. Break it into an RPM Block — a Massive Action Plan — and schedule the steps.\n\nOpen RPM: ${appUrl}\n\n— The AI Waverider team`,
    });
    return { sent: true };
  } catch (err) {
    console.error('[email] Failed to send welcome to', to, err.message);
    return { sent: false };
  }
}

// ---- Notification emails (recipient is already an RPM member) ----

function notifyShell({ eyebrowColor, eyebrow, heading, bodyHtml, ctaUrl, ctaLabel }) {
  return `<!doctype html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0a1120;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0a1120;padding:32px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#0f1d38;border:1px solid rgba(255,255,255,0.08);border-radius:20px;overflow:hidden;">
        <tr><td style="background:${eyebrowColor};height:6px;line-height:6px;font-size:6px;">&nbsp;</td></tr>
        <tr><td style="padding:36px 40px 8px;">
          <div style="font-size:13px;letter-spacing:2px;text-transform:uppercase;color:#4ecdc4;font-weight:700;">AI Waverider · RPM</div>
          <h1 style="margin:14px 0 6px;font-size:24px;line-height:1.3;color:#ffffff;font-weight:800;">${heading}</h1>
        </td></tr>
        <tr><td style="padding:8px 40px 0;color:#c3cfe2;font-size:15px;line-height:1.65;">${bodyHtml}</td></tr>
        <tr><td align="center" style="padding:26px 40px 30px;">
          <a href="${ctaUrl}" style="display:inline-block;background:linear-gradient(135deg,#4ecdc4,#6b8dd6);color:#04121a;text-decoration:none;font-weight:800;font-size:16px;padding:14px 32px;border-radius:999px;">${ctaLabel} →</a>
        </td></tr>
      </table>
      <div style="max-width:560px;color:#4a5568;font-size:11px;padding:16px 8px;">© AI Waverider · RPM</div>
    </td></tr>
  </table>
</body>
</html>`;
}

async function sendGeneric({ to, subject, html, text }) {
  const t = getTransporter();
  if (!t) { console.warn('[email] SMTP not configured — skipping', subject, 'to', to); return { sent: false, reason: 'not_configured' }; }
  try {
    await t.sendMail({ from: `"${SMTP.fromName}" <${SMTP.fromEmail}>`, to, subject, html, text });
    return { sent: true };
  } catch (err) {
    console.error('[email] Failed to send to', to, err.message);
    return { sent: false, reason: 'send_error' };
  }
}

// Existing member added as a contact.
async function sendContactAdded({ to, recipientName, inviterName, appUrl }) {
  const from = inviterName ? escapeHtml(inviterName) : 'Someone';
  const hi = recipientName ? `Hi ${escapeHtml(recipientName)},` : 'Hi there,';
  const html = notifyShell({
    eyebrowColor: 'linear-gradient(135deg,#4ecdc4,#6b8dd6 55%,#9575cd)',
    heading: `${from} added you as a contact on RPM`,
    bodyHtml: `<p style="margin:0 0 14px;">${hi}</p>
      <p style="margin:0 0 14px;"><strong style="color:#fff;">${from}</strong> just added you to their people in RPM. They may lean on you for accountability on their goals — no action needed right now.</p>`,
    ctaUrl: appUrl, ctaLabel: 'Open RPM',
  });
  return sendGeneric({
    to, subject: `${inviterName || 'Someone'} added you as a contact on RPM`, html,
    text: `${recipientName ? 'Hi ' + recipientName + ',' : 'Hi there,'}\n\n${inviterName || 'Someone'} added you as a contact in RPM. Open RPM: ${appUrl}\n\n— AI Waverider · RPM`,
  });
}

// Person assigned an accountability / Leverage-Commit request for an action.
async function sendAccountability({ to, recipientName, inviterName, actionTitle, message, appUrl }) {
  const from = inviterName ? escapeHtml(inviterName) : 'Someone';
  const hi = recipientName ? `Hi ${escapeHtml(recipientName)},` : 'Hi there,';
  const task = actionTitle ? escapeHtml(actionTitle) : 'a commitment';
  const note = message ? `<p style="margin:0 0 14px;padding:12px 14px;background:rgba(255,255,255,0.05);border-left:3px solid #4ecdc4;border-radius:6px;color:#e6ecf7;">“${escapeHtml(message)}”</p>` : '';
  const html = notifyShell({
    eyebrowColor: 'linear-gradient(135deg,#ff69b4,#9575cd 55%,#4ecdc4)',
    heading: `${from} is counting on you`,
    bodyHtml: `<p style="margin:0 0 14px;">${hi}</p>
      <p style="margin:0 0 14px;"><strong style="color:#fff;">${from}</strong> asked you to hold them accountable for:</p>
      <p style="margin:0 0 14px;font-size:17px;color:#fff;font-weight:700;">${task}</p>
      ${note}
      <p style="margin:0 0 8px;">A gentle nudge from you can be the difference between a goal and a done deal.</p>`,
    ctaUrl: appUrl, ctaLabel: 'Open RPM',
  });
  return sendGeneric({
    to, subject: `${inviterName || 'Someone'} is counting on you: ${actionTitle || 'an RPM commitment'}`, html,
    text: `${recipientName ? 'Hi ' + recipientName + ',' : 'Hi there,'}\n\n${inviterName || 'Someone'} asked you to hold them accountable for: ${actionTitle || 'a commitment'}.${message ? '\n\nNote: ' + message : ''}\n\nOpen RPM: ${appUrl}\n\n— AI Waverider · RPM`,
  });
}

// Daily digest of today's tasks + overdue.
const PRIO_TAG = { 3: ['High', '#ff6b6b'], 2: ['Med', '#ffb74d'], 1: ['Low', '#4ecdc4'] };
function taskRow(t) {
  const tag = PRIO_TAG[t.priority];
  const badge = tag ? `<span style="font-size:11px;font-weight:700;color:${tag[1]};border:1px solid ${tag[1]}66;border-radius:999px;padding:1px 7px;margin-right:8px;">${tag[0]}</span>` : '';
  const meta = [t.project_name, t.category_name].filter(Boolean).join(' · ');
  return `<tr><td style="padding:7px 0;border-bottom:1px solid rgba(255,255,255,0.06);color:#e6ecf7;font-size:15px;">${badge}${escapeHtml(t.title)}${meta ? ` <span style="color:#7f8ba3;font-size:12px;">— ${escapeHtml(meta)}</span>` : ''}</td></tr>`;
}

async function sendDigest({ to, name, appUrl, todayLabel, today = [], overdue = [] }) {
  const hi = name ? `Good morning, ${escapeHtml(name)}!` : 'Good morning!';
  const todayHtml = today.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${today.map(taskRow).join('')}</table>`
    : `<p style="margin:0;color:#7f8ba3;">Nothing scheduled today — a clear runway. 🎯</p>`;
  const overdueHtml = overdue.length
    ? `<h2 style="margin:24px 0 8px;font-size:16px;color:#ff8a8a;">⏰ Overdue (${overdue.length})</h2>
       <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${overdue.map(t => `<tr><td style="padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.06);color:#e6ecf7;font-size:14px;">${escapeHtml(t.title)} <span style="color:#7f8ba3;font-size:12px;">— was ${require('./ai/dates').ymd(t.scheduled_date)}</span></td></tr>`).join('')}</table>`
    : '';
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0a1120;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0a1120;padding:32px 12px;"><tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#0f1d38;border:1px solid rgba(255,255,255,0.08);border-radius:20px;overflow:hidden;">
      <tr><td style="background:linear-gradient(135deg,#4ecdc4,#6b8dd6 55%,#9575cd);height:6px;line-height:6px;font-size:6px;">&nbsp;</td></tr>
      <tr><td style="padding:32px 40px 8px;">
        <div style="font-size:13px;letter-spacing:2px;text-transform:uppercase;color:#4ecdc4;font-weight:700;">AI Waverider · RPM</div>
        <h1 style="margin:12px 0 4px;font-size:24px;color:#fff;font-weight:800;">${hi}</h1>
        <p style="margin:0;color:#7f8ba3;font-size:13px;">${escapeHtml(todayLabel || '')}</p>
      </td></tr>
      <tr><td style="padding:16px 40px 0;">
        <h2 style="margin:0 0 8px;font-size:16px;color:#fff;">📋 Today (${today.length})</h2>
        ${todayHtml}
        ${overdueHtml}
      </td></tr>
      <tr><td align="center" style="padding:26px 40px 34px;">
        <a href="${appUrl}" style="display:inline-block;background:linear-gradient(135deg,#4ecdc4,#6b8dd6);color:#04121a;text-decoration:none;font-weight:800;font-size:16px;padding:14px 32px;border-radius:999px;">Open My Day →</a>
      </td></tr>
    </table>
    <div style="max-width:560px;color:#4a5568;font-size:11px;padding:16px 8px;">You get this because daily digest is on. Turn it off in Settings → Reminders.</div>
  </td></tr></table>
</body></html>`;
  const text = `${name ? 'Good morning, ' + name + '!' : 'Good morning!'}\n\nToday (${today.length}):\n${today.map(t => '- ' + t.title).join('\n') || '(nothing scheduled)'}${overdue.length ? '\n\nOverdue (' + overdue.length + '):\n' + overdue.map(t => '- ' + t.title).join('\n') : ''}\n\nOpen: ${appUrl}`;
  return sendGeneric({ to, subject: `Your RPM day — ${today.length} task${today.length === 1 ? '' : 's'}${overdue.length ? `, ${overdue.length} overdue` : ''}`, html, text });
}

// Proactive Chief-of-Staff briefing: plan + which goals are slipping + the fix.
function chiefFixHtml(k) {
  const need = k.required_per_week != null ? `${k.required_per_week}/wk` : '';
  let detail;
  if (k.status === 'overdue') detail = `past its ${k.target_date} deadline at ${k.current}/${k.target}`;
  else if (k.status === 'stalled') detail = `no progress yet — needs ${need} to hit ${k.target} by ${k.target_date}`;
  else detail = `at ${k.rate_per_week}/wk you land ${k.projected_final}/${k.target}${k.delta_days > 0 ? ` (${k.delta_days}d late)` : ''} — need ${need}`;
  return `<tr><td style="padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.06);">
    <div style="color:#ffd166;font-size:14px;font-weight:700;">${escapeHtml(k.title)}</div>
    <div style="color:#9aa7bd;font-size:12.5px;margin-top:2px;">${escapeHtml(detail)}</div></td></tr>`;
}

async function sendChiefBriefing({ to, name, appUrl, dayUrl, todayLabel, today = [], carried = [], atRisk = [], onTrack = 0 }) {
  const hi = name ? `Good morning, ${escapeHtml(name)}.` : 'Good morning.';
  const carriedHtml = carried.length
    ? `<h2 style="margin:22px 0 8px;font-size:16px;color:#ffb74d;">📌 Carried over (${carried.length})</h2>
       <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${carried.slice(0, 10).map(c => `
         <tr><td style="padding:7px 0;border-bottom:1px solid rgba(255,255,255,0.06);color:#e6ecf7;font-size:14px;">
           ${escapeHtml(c.title)}
           <span style="color:#ffb74d;font-size:12px;font-weight:700;"> — ${c.days_late}d late</span>
         </td></tr>`).join('')}${carried.length > 10 ? `<tr><td style="padding:6px 0;color:#7f8ba3;font-size:12px;">…and ${carried.length - 10} more</td></tr>` : ''}
       </table>
       <p style="margin:8px 0 0;color:#7f8ba3;font-size:12.5px;">Nothing was moved for you — <a href="${dayUrl || appUrl}" style="color:#4ecdc4;">triage them in My Day</a> (do it today, reschedule, or drop it).</p>`
    : '';
  const goalsHtml = atRisk.length
    ? `<h2 style="margin:20px 0 8px;font-size:16px;color:#ffd166;">⚠️ ${atRisk.length} goal${atRisk.length === 1 ? '' : 's'} need attention</h2>
       <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${atRisk.map(chiefFixHtml).join('')}</table>`
    : `<h2 style="margin:20px 0 8px;font-size:16px;color:#7bd88f;">✅ Goals on track${onTrack ? ` (${onTrack})` : ''}</h2>
       <p style="margin:0;color:#7f8ba3;font-size:13px;">No key result is projected to miss its date right now. Keep the pace.</p>`;
  const todayHtml = today.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${today.map(taskRow).join('')}</table>`
    : `<p style="margin:0;color:#7f8ba3;">Nothing scheduled today.</p>`;
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0a1120;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0a1120;padding:32px 12px;"><tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#0f1d38;border:1px solid rgba(255,255,255,0.08);border-radius:20px;overflow:hidden;">
      <tr><td style="background:linear-gradient(135deg,#4ecdc4,#6b8dd6 55%,#9575cd);height:6px;line-height:6px;font-size:6px;">&nbsp;</td></tr>
      <tr><td style="padding:32px 40px 8px;">
        <div style="font-size:13px;letter-spacing:2px;text-transform:uppercase;color:#4ecdc4;font-weight:700;">🧭 Chief of Staff</div>
        <h1 style="margin:12px 0 4px;font-size:24px;color:#fff;font-weight:800;">${hi}</h1>
        <p style="margin:0;color:#7f8ba3;font-size:13px;">${escapeHtml(todayLabel || '')} · here's your day and where your goals stand.</p>
      </td></tr>
      <tr><td style="padding:8px 40px 0;">
        ${goalsHtml}
        ${carriedHtml}
        <h2 style="margin:22px 0 8px;font-size:16px;color:#fff;">📋 Today (${today.length})</h2>
        ${todayHtml}
      </td></tr>
      <tr><td align="center" style="padding:26px 40px 34px;">
        <a href="${appUrl}" style="display:inline-block;background:linear-gradient(135deg,#4ecdc4,#6b8dd6);color:#04121a;text-decoration:none;font-weight:800;font-size:16px;padding:14px 32px;border-radius:999px;">Open your Compass →</a>
      </td></tr>
    </table>
    <div style="max-width:560px;color:#4a5568;font-size:11px;padding:16px 8px;">Your Chief of Staff briefing. Turn it off in Settings → Reminders.</div>
  </td></tr></table>
</body></html>`;
  const text = `${hi}\n\n${atRisk.length ? 'Goals needing attention:\n' + atRisk.map(k => '- ' + k.title).join('\n') : 'Goals on track.'}${carried.length ? `\n\nCarried over (${carried.length}) — nothing was moved for you:\n` + carried.slice(0, 10).map(c => `- ${c.title} (${c.days_late}d late)`).join('\n') : ''}\n\nToday (${today.length}):\n${today.map(t => '- ' + t.title).join('\n') || '(nothing scheduled)'}\n\nOpen: ${appUrl}`;
  const subject = atRisk.length
    ? `🧭 ${atRisk.length} goal${atRisk.length === 1 ? '' : 's'} need attention today`
    : carried.length ? `🧭 ${carried.length} task${carried.length === 1 ? '' : 's'} carried over` : `🧭 Your day — goals on track`;
  return sendGeneric({ to, subject, html, text });
}

async function sendReminder({ to, name, title, appUrl }) {
  const html = notifyShell({
    eyebrowColor: 'linear-gradient(135deg,#ffb74d,#ff69b4 55%,#9575cd)',
    heading: `⏰ ${escapeHtml(title)}`,
    bodyHtml: `<p style="margin:0 0 14px;">${name ? 'Hi ' + escapeHtml(name) + ',' : 'Hi,'} a quick reminder you set in RPM.</p>`,
    ctaUrl: appUrl, ctaLabel: 'Open RPM',
  });
  return sendGeneric({ to, subject: `⏰ Reminder: ${title}`, html, text: `Reminder: ${title}\n\nOpen RPM: ${appUrl}` });
}

// A coach's check-in / follow-up / alert. `followups` get one-tap Done / Tomorrow / Drop links.
async function sendCoachMessage({ to, name, coachName, emoji, heading, text, followups = [], ctaUrl }) {
  const para = escapeHtml(text || '').split(/\n{2,}/).map(p => `<p style="margin:0 0 12px;">${p.replace(/\n/g, '<br>')}</p>`).join('');
  const btn = (href, label, bg) => `<a href="${href}" style="display:inline-block;margin:4px 6px 0 0;padding:7px 12px;border-radius:999px;background:${bg};color:#04121a;text-decoration:none;font-size:12.5px;font-weight:700;">${label}</a>`;
  const rows = followups.map(f => `<tr><td style="padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.06);">
    <div style="color:#ffffff;font-size:14.5px;font-weight:700;">${escapeHtml(f.title)}</div>
    <div>${btn(f.links.d, '✅ Done', '#4ecdc4')}${btn(f.links.t, '➡️ Tomorrow', '#ffd166')}${btn(f.links.x, '✖ Drop', '#c3cfe2')}</div></td></tr>`).join('');
  const html = notifyShell({
    eyebrowColor: 'linear-gradient(135deg,#4ecdc4,#9575cd 55%,#ff69b4)',
    heading: `${escapeHtml(emoji || '🧭')} ${escapeHtml(heading)}`,
    bodyHtml: `<p style="margin:0 0 10px;color:#9aa7bd;font-size:13px;">${escapeHtml(coachName)}${name ? ' → ' + escapeHtml(name) : ''}</p>${para}${rows ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table>` : ''}`,
    ctaUrl, ctaLabel: `Open ${coachName}`,
  });
  return sendGeneric({ to, subject: `${emoji || '🧭'} ${coachName}: ${heading}`, html, text: `${heading}\n\n${text || ''}\n\n${ctaUrl}` });
}

// Tell the admins someone asked to join. Never throws.
async function sendAccessRequestNotice({ to, name, email, message, adminUrl }) {
  const t = getTransporter();
  if (!t || !to.length) return { sent: false, reason: 'not_configured' };
  try {
    await t.sendMail({
      from: `"${SMTP.fromName}" <${SMTP.fromEmail}>`,
      to: to.join(', '),
      subject: `RPM access request: ${name} <${email}>`,
      html: `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;font-size:15px;line-height:1.6;color:#1a2233">
        <p><strong>${escapeHtml(name)}</strong> (${escapeHtml(email)}) asked for access to RPM.</p>
        ${message ? `<blockquote style="margin:0 0 14px;padding:8px 14px;border-left:3px solid #4ecdc4;color:#44506a">${escapeHtml(message)}</blockquote>` : ''}
        <p><a href="${adminUrl}" style="color:#0f8f86;font-weight:700">Review it in the admin dashboard →</a></p></div>`,
      text: `${name} (${email}) asked for access to RPM.\n\n${message ? message + '\n\n' : ''}Review: ${adminUrl}`,
    });
    return { sent: true };
  } catch (err) {
    console.error('[email] Failed to send access-request notice', err.message);
    return { sent: false, reason: 'send_error' };
  }
}

// Short transactional mail in the RPM look (dark card, gradient bar). body: trusted HTML; cta optional.
function plainCardHtml({ title, body, cta }) {
  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0a1120;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0a1120;padding:32px 12px;"><tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#0f1d38;border:1px solid rgba(255,255,255,0.08);border-radius:20px;overflow:hidden;">
      <tr><td style="background:linear-gradient(135deg,#4ecdc4,#6b8dd6 55%,#9575cd);height:6px;line-height:6px;font-size:6px;">&nbsp;</td></tr>
      <tr><td style="padding:32px 36px 6px;"><div style="font-size:13px;letter-spacing:2px;text-transform:uppercase;color:#4ecdc4;font-weight:700;">AI Waverider · RPM</div>
        <h1 style="margin:12px 0 4px;font-size:23px;line-height:1.3;color:#ffffff;font-weight:800;">${escapeHtml(title)}</h1></td></tr>
      <tr><td style="padding:6px 36px 0;color:#c3cfe2;font-size:15px;line-height:1.65;">${body}</td></tr>
      ${cta ? `<tr><td align="center" style="padding:22px 36px 6px;"><a href="${cta.url}" style="display:inline-block;background:linear-gradient(135deg,#4ecdc4,#6b8dd6);color:#04121a;text-decoration:none;font-weight:800;font-size:15px;padding:14px 30px;border-radius:999px;">${escapeHtml(cta.label)}</a></td></tr>
      <tr><td align="center" style="padding:6px 36px 4px;color:#7f8ba3;font-size:12px;line-height:1.6;">or copy this link:<br><a href="${cta.url}" style="color:#4ecdc4;word-break:break-all;">${cta.url}</a></td></tr>` : ''}
      <tr><td style="padding:22px 36px 28px;color:#66728a;font-size:12px;line-height:1.6;">If you didn't ask for this, you can ignore this email — nothing changes. If you think someone else is trying to get into your account, reply to this email.</td></tr>
    </table></td></tr></table>
</body></html>`;
}

// Password reset link. Never throws; the caller always answers the same way whether or not this sends.
async function sendPasswordReset({ to, name, resetUrl, minutes }) {
  const t = getTransporter();
  if (!t) { console.warn('[email] SMTP not configured — skipping password reset to', to); return { sent: false }; }
  try {
    await t.sendMail({
      from: `"${SMTP.fromName}" <${SMTP.fromEmail}>`,
      to,
      subject: 'Reset your RPM password',
      html: plainCardHtml({
        title: 'Reset your password',
        body: `<p style="margin:0 0 12px;">${name ? `Hi ${escapeHtml(name)},` : 'Hi,'}</p><p style="margin:0;">Someone (hopefully you) asked to reset the password for this RPM account. The link works once and expires in ${minutes} minutes.</p>`,
        cta: { url: resetUrl, label: 'Choose a new password →' },
      }),
      text: `${name ? 'Hi ' + name + ',' : 'Hi,'}\n\nReset your RPM password (works once, expires in ${minutes} minutes):\n${resetUrl}\n\nIf you didn't ask for this, ignore this email — nothing changes.\n\n— AI Waverider · RPM`,
    });
    return { sent: true };
  } catch (err) {
    console.error('[email] Failed to send password reset to', to, err.message);
    return { sent: false };
  }
}

// "Your password was changed" — so a takeover never goes unnoticed. Never throws.
async function sendPasswordChanged({ to, name, appUrl, how }) {
  const t = getTransporter();
  if (!t) return { sent: false };
  try {
    await t.sendMail({
      from: `"${SMTP.fromName}" <${SMTP.fromEmail}>`,
      to,
      subject: 'Your RPM password was changed',
      html: plainCardHtml({
        title: 'Your password was changed',
        body: `<p style="margin:0 0 12px;">${name ? `Hi ${escapeHtml(name)},` : 'Hi,'}</p><p style="margin:0 0 12px;">The password for your RPM account was just ${how === 'reset' ? 'reset with an emailed link' : 'changed from Settings'}. Every other device has been signed out.</p><p style="margin:0;">Wasn't you? Use “Forgot password” on the sign-in page right away to take the account back, and reply to this email.</p>`,
        cta: { url: `${appUrl}/forgot-password`, label: 'This wasn’t me — reset it' },
      }),
      text: `${name ? 'Hi ' + name + ',' : 'Hi,'}\n\nThe password for your RPM account was just ${how === 'reset' ? 'reset with an emailed link' : 'changed from Settings'}. Every other device has been signed out.\n\nWasn't you? Reset it now: ${appUrl}/forgot-password\n\n— AI Waverider · RPM`,
    });
    return { sent: true };
  } catch (err) {
    console.error('[email] Failed to send password-changed notice to', to, err.message);
    return { sent: false };
  }
}

module.exports = { sendPasswordReset, sendPasswordChanged, sendAccessRequestNotice, sendInvitation, sendWelcome, sendContactAdded, sendAccountability, sendDigest, sendReminder, sendChiefBriefing, sendCoachMessage };
