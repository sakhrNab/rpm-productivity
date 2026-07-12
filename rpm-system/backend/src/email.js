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

function invitationHtml({ recipientName, inviterName, joinUrl }) {
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
          You received this because ${from} added you as a contact in RPM. If this wasn't expected, you can safely ignore it — no account is created until you sign up.
        </td></tr>
      </table>
      <div style="max-width:560px;color:#4a5568;font-size:11px;padding:16px 8px;">© AI Waverider · RPM</div>
    </td></tr>
  </table>
</body>
</html>`;
}

// Fire-and-forget; never throws to the caller.
async function sendInvitation({ to, recipientName, inviterName, joinUrl }) {
  const t = getTransporter();
  if (!t) { console.warn('[email] SMTP not configured — skipping invitation to', to); return { sent: false, reason: 'not_configured' }; }
  try {
    await t.sendMail({
      from: `"${SMTP.fromName}" <${SMTP.fromEmail}>`,
      to,
      subject: `${inviterName || 'A friend'} invited you to RPM — design your life on purpose`,
      html: invitationHtml({ recipientName, inviterName, joinUrl }),
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

module.exports = { sendInvitation, sendWelcome, sendContactAdded, sendAccountability };
