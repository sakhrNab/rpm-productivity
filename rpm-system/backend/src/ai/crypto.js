// AES-256-GCM encryption for provider API keys.
//
// Keys are ENCRYPTED at rest (reversible), never hashed — we must recover the
// plaintext to call the provider. The master key lives only in the backend env
// (AI_KEYS_SECRET, 32 bytes base64). If it is missing, key storage is disabled
// (fail safe) rather than storing anything in a weaker form.

const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';

function masterKey() {
  const b64 = process.env.AI_KEYS_SECRET;
  if (!b64) return null;
  const key = Buffer.from(b64, 'base64');
  if (key.length !== 32) {
    throw new Error('AI_KEYS_SECRET must decode to exactly 32 bytes (base64). Generate with: openssl rand -base64 32');
  }
  return key;
}

// True when the server is configured to store keys at all.
function isConfigured() {
  try { return !!masterKey(); } catch { return false; }
}

function encryptSecret(plaintext) {
  const key = masterKey();
  if (!key) throw new Error('AI_KEYS_SECRET not configured');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const enc = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  return {
    ciphertext: enc.toString('base64'),
    iv: iv.toString('base64'),
    auth_tag: cipher.getAuthTag().toString('base64'),
    last4: String(plaintext).slice(-4),
  };
}

function decryptSecret({ ciphertext, iv, auth_tag }) {
  const key = masterKey();
  if (!key) throw new Error('AI_KEYS_SECRET not configured');
  const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(auth_tag, 'base64'));
  const dec = Buffer.concat([decipher.update(Buffer.from(ciphertext, 'base64')), decipher.final()]);
  return dec.toString('utf8');
}

module.exports = { encryptSecret, decryptSecret, isConfigured };
