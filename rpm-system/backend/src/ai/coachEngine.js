// Runs the coach accountability loop against the database: check-ins (AI), follow-ups and
// slip alerts (pure data), the saved thread, delivery on the user's channels, and the
// Done / Tomorrow / Drop actions behind follow-up buttons. Decisions live in coachLoop.js.

const { chatCoach, coachSnapshot } = require('./coaches');
const { recordUsage } = require('./usage');
const { buildHistory } = require('./history');
const { listKeysMasked } = require('./keys');
const { getModelEntry } = require('./registry');
const { ymd } = require('./dates');
const L = require('./coachLoop');
const telegram = require('../telegram');
const push = require('../push');
const { sendCoachMessage } = require('../email');

const APP_URL = () => process.env.FRONTEND_URL || 'https://rpm.aiwaverider.com';
const API_URL = () => process.env.BACKEND_URL || 'https://api.rpm.aiwaverider.com';
const SECRET = () => process.env.JWT_SECRET || 'dev-secret';
const CHEAP = { deepseek: 'deepseek/deepseek-v4-flash', anthropic: 'anthropic/claude-haiku-4-5', openai: 'openai/gpt-5-mini', zhipu: 'zhipu/glm-4.5-air' };

const areaPath = (coach) => (coach.scope === 'project' ? `/projects/${coach.project_id}` : `/categories/${coach.category_id}`) + '?coach=open';
const esc = (s) => telegram.escapeHtml(String(s || ''));

// Scheduled work has no browser: coach model → the user's saved default → their cheapest usable model.
async function resolveModel(pool, userId, coach) {
  const keys = await listKeysMasked(pool, userId);
  const ok = new Set(keys.filter(k => k.configured).map(k => k.provider));
  const usable = (key) => { const m = key && getModelEntry(key); return m && ok.has(m.provider) ? key : null; };
  if (usable(coach?.model)) return coach.model;
  const def = (await pool.query('SELECT ai_default_model FROM users WHERE id = $1', [userId])).rows[0]?.ai_default_model;
  if (usable(def)) return def;
  for (const p of ['deepseek', 'anthropic', 'openai', 'zhipu']) if (ok.has(p) && usable(CHEAP[p])) return CHEAP[p];
  return null;
}

async function saveMessage(pool, coach, { role, kind = 'chat', content = '', tools = null, meta = null, read = false }) {
  const r = await pool.query(
    `INSERT INTO coach_messages (coach_id, user_id, role, kind, content, tools, meta, read_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7, ${read ? 'NOW()' : 'NULL'}) RETURNING *`,
    [coach.id, coach.user_id, role, kind, content, tools ? JSON.stringify(tools) : null, meta ? JSON.stringify(meta) : null]);
  return r.rows[0];
}

async function threadHistory(pool, coachId, limit = 30) {
  const { rows } = await pool.query(
    `SELECT role, content FROM (SELECT role, content, created_at FROM coach_messages WHERE coach_id = $1 ORDER BY created_at DESC LIMIT $2) t ORDER BY created_at`,
    [coachId, limit]);
  return rows;
}

// Send one coach message on every channel the user enabled. In-app delivery is the saved row.
async function deliver(pool, { user, prefs, coach, heading, text, followups = [], email = true }) {
  if (!prefs) return {};
  const url = APP_URL() + areaPath(coach);
  const out = {};
  const who = `${coach.avatar_emoji || '🧭'} ${coach.name}`;
  if (prefs.telegram_enabled && prefs.telegram_chat_id) {
    const body = `${esc(who)} — <b>${esc(heading)}</b>\n\n${esc(text).slice(0, 3000)}${followups.length ? '' : `\n\n<a href="${url}">Reply in RPM →</a>`}`;
    const kb = followups.map(f => [
      { text: `✅ ${f.title.length > 22 ? f.title.slice(0, 21) + '…' : f.title}`, callback_data: `cf:d:${f.id}` },
      { text: '➡️ Tomorrow', callback_data: `cf:t:${f.id}` },
      { text: '✖ Drop', callback_data: `cf:x:${f.id}` },
    ]);
    out.telegram = kb.length ? await telegram.notifyWithButtons(pool, prefs.telegram_chat_id, body, kb) : await telegram.notify(pool, prefs.telegram_chat_id, body);
  }
  if (email && prefs.email_enabled && user.email) {
    const links = (f) => Object.fromEntries(['d', 't', 'x'].map(op => [op, `${API_URL()}/api/coach/act?t=${encodeURIComponent(L.signAction({ uid: user.id, aid: f.id, op, date: f.next_date }, SECRET()))}`]));
    try { out.email = await sendCoachMessage({ to: user.email, name: user.name, coachName: coach.name, emoji: coach.avatar_emoji, heading, text, followups: followups.map(f => ({ ...f, links: links(f) })), ctaUrl: url }); }
    catch (e) { console.error('[coach] email:', e.message); }
  }
  if (prefs.webpush_enabled) {
    try { out.push = await push.sendToUser(pool, user.id, { title: `${who}: ${heading}`, body: String(text).replace(/\s+/g, ' ').slice(0, 140), url, tag: `coach-${coach.id}` }); }
    catch (e) { console.error('[coach] push:', e.message); }
  }
  return out;
}

const CHECKIN_BRIEF = {
  plan: `It's the start of the week. Write this week's check-in in under 120 words: where this area stands right now (use THIS AREA RIGHT NOW — name real tasks and goals), then propose up to 3 concrete commitments for this week as action proposals with dates this week (only if they aren't already planned). End with one short question.`,
  review: `It's the end of the week. Write a short review in under 120 words: what got done, what slipped (name them), one lesson. If slipped tasks still matter, propose moving them to next week. End with one reflection question.`,
  nudge: `Write a short mid-week nudge in under 80 words: the one thing that matters most today in this area, and anything slipping. If something is off, propose one concrete fix.`,
};

// A check-in. AI when a model is available (proposals stay proposals: ask-first), else a data-only note.
async function runCheckin(pool, coach, { user, prefs, now, deliverIt = true }) {
  const kind = L.checkinKind(now.dow);
  const modelKey = await resolveModel(pool, coach.user_id, coach);
  let text = '', tools = [], rawUsage = null;
  if (modelKey) {
    const history = buildHistory([...(await threadHistory(pool, coach.id, 20)),
      { role: 'user', content: `(Automatic ${kind === 'plan' ? 'weekly planning' : kind === 'review' ? 'weekly review' : 'mid-week'} check-in — the person did not type this. Speak to them directly as their coach.)\n${CHECKIN_BRIEF[kind]}` }]);
    for await (const ev of chatCoach({ pool, userId: coach.user_id, coach, messages: history, autoMode: false, modelKey, timezone: prefs?.timezone })) {
      if (ev.type === 'text') text += ev.text;
      else if (ev.type === 'tool_result' && ev.result && ev.result.proposed) tools.push({ name: ev.name, done: true, result: ev.result });
      else if (ev.type === 'usage') rawUsage = ev.usage;
      else if (ev.type === 'error') throw new Error(ev.message || 'AI failed');
    }
    if (rawUsage) await recordUsage(pool, { userId: coach.user_id, modelKey, feature: 'coach_checkin', usage: rawUsage });
  }
  if (!text.trim()) {
    const s = await coachSnapshot(pool, coach.user_id, coach, now.dateStr);
    text = [
      s.today.length ? `Today: ${s.today.slice(0, 3).join('; ')}.` : 'Nothing is scheduled today in this area.',
      `This week: ${s.week_count} task(s).`,
      s.overdue.length ? `Carried over: ${s.overdue.slice(0, 3).map(o => `${o.title} (${o.days_late}d)`).join('; ')}.` : '',
      s.at_risk.length ? `Slipping: ${s.at_risk.map(k => k.title).join(', ')}.` : '',
      modelKey ? '' : '(Add an AI key in Settings for a real coaching check-in.)',
    ].filter(Boolean).join('\n');
  }
  const heading = kind === 'plan' ? 'Your week ahead' : kind === 'review' ? 'Weekly review' : 'Quick check-in';
  const msg = await saveMessage(pool, coach, { role: 'assistant', kind: 'checkin', content: text.trim(), tools: tools.length ? tools : null, meta: { checkin: kind } });
  await pool.query('UPDATE coaches SET last_checkin_date = $2 WHERE id = $1', [coach.id, now.dateStr]);
  if (deliverIt) await deliver(pool, { user, prefs, coach, heading: tools.length ? `${heading} · ${tools.length} suggestion${tools.length > 1 ? 's' : ''} to approve` : heading, text: text.trim() });
  return msg;
}

const areaFilter = (coach) => (coach.scope === 'project' ? ['project_id', coach.project_id] : ['category_id', coach.category_id]);

async function runFollowup(pool, coach, { user, prefs, now }) {
  const [col, id] = areaFilter(coach);
  const { rows } = await pool.query(
    `SELECT id, title, priority, is_starred, is_completed, is_cancelled FROM actions
      WHERE user_id = $1 AND ${col} = $2 AND scheduled_date = $3::date AND is_completed = false AND is_cancelled = false`,
    [coach.user_id, id, now.dateStr]);
  await pool.query('UPDATE coaches SET last_followup_date = $2 WHERE id = $1', [coach.id, now.dateStr]);
  const picks = L.pickFollowups(rows);
  if (!picks.length) return null;
  const next = L.addDaysStr(now.dateStr, 1);
  const followups = picks.map(t => ({ id: t.id, title: t.title, next_date: next }));
  const text = picks.length === 1 ? `Did you get “${picks[0].title}” done today?` : `Quick end-of-day check — did these get done?\n${picks.map(t => `• ${t.title}`).join('\n')}`;
  const msg = await saveMessage(pool, coach, { role: 'assistant', kind: 'followup', content: text, meta: { date: now.dateStr, actions: followups, results: {} } });
  const tgLinked = !!(prefs && prefs.telegram_enabled && prefs.telegram_chat_id);
  await deliver(pool, { user, prefs, coach, heading: 'Did it happen?', text, followups, email: !tgLinked });
  return msg;
}

const lastAlertCheck = new Map();                 // coachId → ms; alerts are evaluated at most hourly
async function runAlerts(pool, coach, { user, prefs, now, force = false }) {
  if (coach.last_alert_at && Date.now() - new Date(coach.last_alert_at).getTime() < 20 * 3600000) return null;
  if (!force && Date.now() - (lastAlertCheck.get(coach.id) || 0) < 3600000) return null;
  lastAlertCheck.set(coach.id, Date.now());
  const s = await coachSnapshot(pool, coach.user_id, coach, now.dateStr);
  const [col, id] = areaFilter(coach);
  const dl = (await pool.query(
    `SELECT p.name, (p.end_date - $3::date) AS days_left,
            (SELECT count(*)::int FROM actions a WHERE a.project_id = p.id AND a.is_completed = false AND a.is_cancelled = false) AS open
       FROM projects p WHERE p.user_id = $1 AND ${col === 'project_id' ? 'p.id' : 'p.category_id'} = $2
        AND p.end_date IS NOT NULL AND p.is_completed = false AND p.is_archived = false`, [coach.user_id, id, now.dateStr])).rows;
  const { alerts, sig } = L.detectAlerts({ overdue: s.overdue, at_risk: s.at_risk, deadlines: dl });
  if (!sig) { if (coach.last_alert_sig) await pool.query("UPDATE coaches SET last_alert_sig = '' WHERE id = $1", [coach.id]); return null; }
  if (sig === coach.last_alert_sig) return null;
  const text = `Heads-up — this needs you:\n${alerts.map(a => `• ${a.text}`).join('\n')}\n\nWant me to draft a fix? Open me and tap “Fix this with me”.`;
  const msg = await saveMessage(pool, coach, { role: 'assistant', kind: 'alert', content: text, meta: { alerts } });
  await pool.query('UPDATE coaches SET last_alert_sig = $2, last_alert_at = NOW() WHERE id = $1', [coach.id, sig]);
  await deliver(pool, { user, prefs, coach, heading: 'Something is slipping', text, email: !(prefs && prefs.telegram_enabled && prefs.telegram_chat_id) });
  return msg;
}

// Done / Tomorrow / Drop on a task (from Telegram, an email link or the app). Owner-checked.
async function applyFollowup(pool, userId, actionId, op, today) {
  const a = (await pool.query(
    `SELECT id, title, to_char(scheduled_date, 'YYYY-MM-DD') AS d, to_char(end_date, 'YYYY-MM-DD') AS e FROM actions WHERE id = $1 AND user_id = $2`,
    [actionId, userId])).rows[0];
  if (!a) return { ok: false, error: 'Task not found' };
  if (op === 'd') await pool.query('UPDATE actions SET is_completed = true, completed_at = NOW() WHERE id = $1', [a.id]);
  else if (op === 'x') await pool.query('UPDATE actions SET is_cancelled = true WHERE id = $1', [a.id]);
  else if (op === 't') {
    const base = today || a.d || new Date().toISOString().slice(0, 10);
    const next = L.addDaysStr(base, 1);
    const span = a.d && a.e ? Math.round((Date.parse(a.e) - Date.parse(a.d)) / 86400000) : 0;
    await pool.query('UPDATE actions SET scheduled_date = $2, end_date = $3, reminded_at = NULL WHERE id = $1', [a.id, next, span > 0 ? L.addDaysStr(next, span) : null]);
  } else return { ok: false, error: 'Unknown action' };
  // Record the outcome on the follow-up message(s) that asked about it, so the thread shows it.
  await pool.query(
    `UPDATE coach_messages SET meta = jsonb_set(coalesce(meta, '{}'::jsonb), ARRAY['results', $2::text], to_jsonb($3::text), true)
      WHERE user_id = $1 AND kind = 'followup' AND meta->'actions' @> jsonb_build_array(jsonb_build_object('id', $2::text))`,
    [userId, a.id, op]);
  return { ok: true, title: a.title, op };
}

// One pass over every proactive coach; each piece of work isolated so one failure can't block others.
async function fireCoachLoop(pool, { getPrefs, nowInTz }) {
  const { rows } = await pool.query(
    `SELECT co.*, u.email, u.name AS user_name FROM coaches co JOIN users u ON u.id = co.user_id
      WHERE co.is_active = true AND co.proactive = true`);
  for (const co of rows) {
    try {
      // Channels are opt-in (same rule as the digest): no saved notification settings → in-app only.
      const hasRow = (await pool.query('SELECT 1 FROM notification_prefs WHERE user_id = $1', [co.user_id])).rows.length > 0;
      const prefs = hasRow ? await getPrefs(pool, co.user_id) : null;
      const now = nowInTz(prefs?.timezone || 'UTC');
      const user = { id: co.user_id, email: co.email, name: co.user_name };
      for (const w of L.dueWork(co, now)) {
        try {
          if (w === 'checkin') await runCheckin(pool, co, { user, prefs, now });
          else if (w === 'followup') await runFollowup(pool, co, { user, prefs, now });
          else if (w === 'alerts') await runAlerts(pool, co, { user, prefs, now });
        } catch (e) {
          console.error(`[coach] ${w} failed for ${co.id}:`, e.message);
          if (w === 'checkin') await pool.query('UPDATE coaches SET last_checkin_date = $2 WHERE id = $1', [co.id, now.dateStr]).catch(() => {});
        }
      }
    } catch (e) { console.error('[coach] loop:', co.id, e.message); }
  }
}

// Coaches keyed by area, for routing the daily briefing through them ("one voice per area").
async function coachesByArea(pool, userId) {
  const { rows } = await pool.query('SELECT id, scope, project_id, category_id, name, avatar_emoji FROM coaches WHERE user_id = $1 AND is_active = true', [userId]);
  const byProject = new Map(), byCategory = new Map();
  for (const c of rows) (c.scope === 'project' ? byProject.set(c.project_id, c) : byCategory.set(c.category_id, c));
  return (projectId, categoryId) => byProject.get(projectId) || byCategory.get(categoryId) || null;
}

module.exports = { resolveModel, saveMessage, threadHistory, runCheckin, runFollowup, runAlerts, applyFollowup, fireCoachLoop, coachesByArea, areaPath, ymd };
