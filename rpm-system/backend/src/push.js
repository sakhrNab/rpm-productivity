// Web push (Phase 3). VAPID keys are auto-generated once and stored in app_config
// (public plain, private encrypted with AES-256-GCM) — no manual key handling.

const webpush = require('web-push');
const { encryptSecret, decryptSecret } = require('./ai/crypto');

async function getConfig(pool, key) {
  const { rows } = await pool.query('SELECT ciphertext, iv, auth_tag, plain FROM app_config WHERE key=$1', [key]);
  return rows[0] || null;
}
async function setSecret(pool, key, secret) {
  const e = encryptSecret(secret);
  await pool.query(
    `INSERT INTO app_config (key, ciphertext, iv, auth_tag, updated_at) VALUES ($1,$2,$3,$4,NOW())
     ON CONFLICT (key) DO UPDATE SET ciphertext=$2, iv=$3, auth_tag=$4, plain=NULL, updated_at=NOW()`,
    [key, e.ciphertext, e.iv, e.auth_tag]
  );
}
async function setPlain(pool, key, plain) {
  await pool.query(
    `INSERT INTO app_config (key, plain, updated_at) VALUES ($1,$2,NOW())
     ON CONFLICT (key) DO UPDATE SET plain=$2, ciphertext=NULL, iv=NULL, auth_tag=NULL, updated_at=NOW()`,
    [key, plain]
  );
}

let vapid = null;
async function ensureVapid(pool) {
  if (vapid) return vapid;
  let pub = (await getConfig(pool, 'vapid_public'))?.plain;
  const privRow = await getConfig(pool, 'vapid_private');
  let priv = privRow?.ciphertext ? decryptSecret(privRow) : null;
  if (!pub || !priv) {
    const keys = webpush.generateVAPIDKeys();
    pub = keys.publicKey; priv = keys.privateKey;
    await setPlain(pool, 'vapid_public', pub);
    await setSecret(pool, 'vapid_private', priv);
  }
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:support@aiwaverider.com', pub, priv);
  vapid = { publicKey: pub, privateKey: priv };
  return vapid;
}
async function getPublicKey(pool) { return (await ensureVapid(pool)).publicKey; }

async function saveSubscription(pool, userId, sub) {
  if (!sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth) throw new Error('Invalid subscription');
  await pool.query(
    `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth) VALUES ($1,$2,$3,$4)
     ON CONFLICT (user_id, endpoint) DO UPDATE SET p256dh=$3, auth=$4`,
    [userId, sub.endpoint, sub.keys.p256dh, sub.keys.auth]
  );
}
async function removeSubscription(pool, userId, endpoint) {
  await pool.query('DELETE FROM push_subscriptions WHERE user_id=$1 AND endpoint=$2', [userId, endpoint]);
}
async function hasSubscription(pool, userId) {
  const { rows } = await pool.query('SELECT 1 FROM push_subscriptions WHERE user_id=$1 LIMIT 1', [userId]);
  return rows.length > 0;
}

async function sendToUser(pool, userId, payload) {
  await ensureVapid(pool);
  const { rows } = await pool.query('SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id=$1', [userId]);
  let sent = 0;
  for (const s of rows) {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(payload));
      sent++;
    } catch (err) {
      if (err.statusCode === 410 || err.statusCode === 404) {
        await pool.query('DELETE FROM push_subscriptions WHERE id=$1', [s.id]); // subscription gone
      } else console.error('[push] send error:', err.statusCode || err.message);
    }
  }
  return { sent };
}

module.exports = { ensureVapid, getPublicKey, saveSubscription, removeSubscription, hasSubscription, sendToUser };
