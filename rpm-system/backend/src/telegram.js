// Telegram bot integration (Phase 2). One app-wide bot; token stored encrypted in
// app_config. Users link their chat via a one-tap deep link; the bot sends the digest
// and supports tap-to-complete on today's tasks.

const crypto = require('crypto');
const { encryptSecret, decryptSecret } = require('./ai/crypto');

const BACKEND_URL = () => process.env.BACKEND_URL || 'https://api.rpm.aiwaverider.com';

function escapeHtml(s = '') {
  return String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
}

// ---- app_config helpers ----
async function setSecretConfig(pool, key, secret) {
  const e = encryptSecret(secret);
  await pool.query(
    `INSERT INTO app_config (key, ciphertext, iv, auth_tag, plain, updated_at) VALUES ($1,$2,$3,$4,NULL,NOW())
     ON CONFLICT (key) DO UPDATE SET ciphertext=$2, iv=$3, auth_tag=$4, plain=NULL, updated_at=NOW()`,
    [key, e.ciphertext, e.iv, e.auth_tag]
  );
}
async function setPlainConfig(pool, key, plain) {
  await pool.query(
    `INSERT INTO app_config (key, plain, ciphertext, iv, auth_tag, updated_at) VALUES ($1,$2,NULL,NULL,NULL,NOW())
     ON CONFLICT (key) DO UPDATE SET plain=$2, ciphertext=NULL, iv=NULL, auth_tag=NULL, updated_at=NOW()`,
    [key, plain]
  );
}
async function getSecretConfig(pool, key) {
  const { rows } = await pool.query('SELECT ciphertext, iv, auth_tag FROM app_config WHERE key=$1', [key]);
  if (!rows[0]?.ciphertext) return null;
  try { return decryptSecret(rows[0]); } catch { return null; }
}
async function getPlainConfig(pool, key) {
  const { rows } = await pool.query('SELECT plain FROM app_config WHERE key=$1', [key]);
  return rows[0]?.plain || null;
}
async function deleteConfig(pool, key) { await pool.query('DELETE FROM app_config WHERE key=$1', [key]); }

const getToken = (pool) => getSecretConfig(pool, 'telegram_bot_token');
const getBotUsername = (pool) => getPlainConfig(pool, 'telegram_bot_username');
const getWebhookSecret = (pool) => getPlainConfig(pool, 'telegram_webhook_secret');
async function isBotConfigured(pool) { return !!(await getToken(pool)); }

// ---- Telegram API ----
async function tg(token, method, body) {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(data.description || `Telegram ${method} failed`);
  return data.result;
}
async function sendMessage(token, chatId, text, extra = {}) {
  return tg(token, 'sendMessage', { chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true, ...extra });
}

// Configure the bot: validate the token, store it + username, register the webhook.
async function configureBot(pool, botToken) {
  const me = await tg(botToken, 'getMe', {});         // validates token
  await setSecretConfig(pool, 'telegram_bot_token', botToken);
  await setPlainConfig(pool, 'telegram_bot_username', me.username);
  let secret = await getWebhookSecret(pool);
  if (!secret) { secret = crypto.randomBytes(24).toString('hex'); await setPlainConfig(pool, 'telegram_webhook_secret', secret); }
  await tg(botToken, 'setWebhook', { url: `${BACKEND_URL()}/api/telegram/webhook`, secret_token: secret, allowed_updates: ['message', 'callback_query'] });
  return { username: me.username };
}
async function removeBot(pool) {
  const token = await getToken(pool);
  if (token) { try { await tg(token, 'deleteWebhook', {}); } catch { /* ignore */ } }
  await deleteConfig(pool, 'telegram_bot_token');
  await deleteConfig(pool, 'telegram_bot_username');
  await deleteConfig(pool, 'telegram_webhook_secret');
}

// ---- Linking a user's chat ----
async function startLink(pool, userId) {
  const username = await getBotUsername(pool);
  if (!username) throw new Error('The Telegram bot is not set up yet.');
  const code = crypto.randomBytes(8).toString('hex');
  await pool.query(
    `INSERT INTO notification_prefs (user_id, telegram_link_code, updated_at) VALUES ($1,$2,NOW())
     ON CONFLICT (user_id) DO UPDATE SET telegram_link_code=$2, updated_at=NOW()`,
    [userId, code]
  );
  return { deepLink: `https://t.me/${username}?start=${code}`, botUsername: username };
}

// Handle one webhook update. Returns quietly.
async function handleUpdate(pool, update, completeAction) {
  const token = await getToken(pool);
  if (!token) return;

  // /start <code> → link this chat to the user who generated the code
  const msg = update.message;
  if (msg && typeof msg.text === 'string' && msg.text.startsWith('/start')) {
    const code = msg.text.split(/\s+/)[1];
    if (code) {
      const r = await pool.query('SELECT user_id FROM notification_prefs WHERE telegram_link_code=$1', [code]);
      if (r.rows[0]) {
        await pool.query('UPDATE notification_prefs SET telegram_chat_id=$1, telegram_link_code=NULL, telegram_enabled=true, updated_at=NOW() WHERE user_id=$2',
          [String(msg.chat.id), r.rows[0].user_id]);
        await sendMessage(token, msg.chat.id, '✅ <b>Connected!</b> You\'ll get your RPM reminders here. Manage them in Settings → Reminders.');
        return;
      }
    }
    await sendMessage(token, msg.chat.id, 'Hi! Open RPM → Settings → Reminders and tap <b>Connect Telegram</b> to link your account.');
    return;
  }

  // Inline "✅ Done" button → complete the action (only if it belongs to this chat's user)
  const cb = update.callback_query;
  if (cb && typeof cb.data === 'string' && cb.data.startsWith('done:')) {
    const actionId = cb.data.slice(5);
    const chatId = String(cb.message?.chat?.id);
    try {
      const owner = await pool.query(
        `SELECT a.id FROM actions a JOIN notification_prefs p ON p.user_id = a.user_id
          WHERE a.id=$1 AND p.telegram_chat_id=$2`, [actionId, chatId]);
      if (owner.rows[0]) {
        await completeAction(actionId);
        await tg(token, 'answerCallbackQuery', { callback_query_id: cb.id, text: 'Marked done ✅' });
        try { await tg(token, 'editMessageReplyMarkup', { chat_id: chatId, message_id: cb.message.message_id, reply_markup: { inline_keyboard: [] } }); } catch { /* ignore */ }
      } else {
        await tg(token, 'answerCallbackQuery', { callback_query_id: cb.id, text: 'Not found' });
      }
    } catch {
      await tg(token, 'answerCallbackQuery', { callback_query_id: cb.id, text: 'Could not complete' });
    }
  }
}

// Send the digest to a linked chat, with tap-to-complete buttons for today's tasks.
async function sendDigestTelegram(pool, chatId, { todayLabel, today = [], overdue = [] }) {
  const token = await getToken(pool);
  if (!token) return { sent: false };
  const PRIO = { 3: '🔴', 2: '🟠', 1: '🔵' };
  const lines = [`<b>📋 Your RPM day</b>${todayLabel ? ` — ${escapeHtml(todayLabel)}` : ''}`, ''];
  if (today.length) {
    for (const t of today) lines.push(`${PRIO[t.priority] || '▫️'} ${escapeHtml(t.title)}${t.project_name ? ` <i>— ${escapeHtml(t.project_name)}</i>` : ''}`);
  } else lines.push('Nothing scheduled today — clear runway. 🎯');
  if (overdue.length) {
    lines.push('', `<b>⏰ Overdue (${overdue.length})</b>`);
    for (const t of overdue.slice(0, 10)) lines.push(`• ${escapeHtml(t.title)}`);
  }
  // Buttons: up to 6 of today's tasks
  const buttons = today.slice(0, 6).map(t => [{ text: `✅ ${t.title.slice(0, 40)}`, callback_data: `done:${t.id}` }]);
  const extra = buttons.length ? { reply_markup: { inline_keyboard: buttons } } : {};
  await sendMessage(token, chatId, lines.join('\n'), extra);
  return { sent: true };
}

// Generic message to a linked chat (used by custom reminders).
async function notify(pool, chatId, text) {
  const token = await getToken(pool);
  if (!token || !chatId) return { sent: false };
  try { await sendMessage(token, chatId, text); return { sent: true }; }
  catch (e) { console.error('[telegram] notify:', e.message); return { sent: false }; }
}

module.exports = {
  configureBot, removeBot, isBotConfigured, getBotUsername, getWebhookSecret,
  startLink, handleUpdate, sendDigestTelegram, getToken, notify,
};
