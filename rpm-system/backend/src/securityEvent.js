// One line per security-relevant event, written to stdout so it lands in the container log:
//
//   SECURITY_EVENT {"ts":"…","app":"rpm","event":"login_failed","user":"a@b.c","ip":"1.2.3.4","reason":"bad_password"}
//
// Every app on the servers uses this same shape, so one reader (sec-report, the dashboard,
// CrowdSec) understands all of them. Deliberately NO password field: users mistype their real
// password, so logging "passwords tried" would build a list of real passwords. Never throws:
// a logging problem must not break a login.

const APP = 'rpm';
const EVENTS = new Set([
  'login_success', 'login_failed', 'login_rate_limited', 'password_reset_requested',
  'signup', 'access_denied', 'webhook_rejected',
]);

function securityEvent(event, fields = {}) {
  try {
    if (!EVENTS.has(event)) { console.error('securityEvent: unknown event', String(event).slice(0, 40)); return; }
    const f = fields || {};
    const line = {
      ts: new Date().toISOString(),
      app: APP,
      event,
      // Bounded so a hostile value cannot flood the log (JSON.stringify also escapes newlines, so one event = one line).
      ...(f.user !== undefined && f.user !== null && { user: String(f.user).slice(0, 120) }),
      ...(f.ip !== undefined && f.ip !== null && { ip: String(f.ip).slice(0, 64) }),
      ...(f.reason !== undefined && f.reason !== null && { reason: String(f.reason).slice(0, 60) }),
    };
    console.log(`SECURITY_EVENT ${JSON.stringify(line)}`);
  } catch { /* never let logging break the request */ }
}

module.exports = { securityEvent, APP, EVENTS };
