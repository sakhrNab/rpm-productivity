// Per-user provider API keys: store encrypted, list masked, resolve for use.

const { encryptSecret, decryptSecret, isConfigured } = require('./crypto');
const { allProviders } = require('./registry');

// Owner-level fallback keys from env (used only when a user has not set their own).
const ENV_KEY = {
  anthropic: () => process.env.ANTHROPIC_API_KEY,
  openai: () => process.env.OPENAI_API_KEY,
  zhipu: () => process.env.ZHIPU_API_KEY || process.env.ZAI_API_KEY,
  deepseek: () => process.env.DEEPSEEK_API_KEY,
};

async function saveKey(pool, userId, provider, plaintext) {
  if (!allProviders().includes(provider)) throw new Error('Unknown provider');
  if (!isConfigured()) throw new Error('Key storage is not enabled on the server (AI_KEYS_SECRET missing)');
  const { ciphertext, iv, auth_tag, last4 } = encryptSecret(plaintext.trim());
  await pool.query(
    `INSERT INTO user_api_keys (user_id, provider, ciphertext, iv, auth_tag, last4, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, NOW())
     ON CONFLICT (user_id, provider)
     DO UPDATE SET ciphertext = EXCLUDED.ciphertext, iv = EXCLUDED.iv,
                   auth_tag = EXCLUDED.auth_tag, last4 = EXCLUDED.last4, updated_at = NOW()`,
    [userId, provider, ciphertext, iv, auth_tag, last4]
  );
}

async function deleteKey(pool, userId, provider) {
  await pool.query('DELETE FROM user_api_keys WHERE user_id = $1 AND provider = $2', [userId, provider]);
}

// Masked status for every known provider (never returns plaintext).
async function listKeysMasked(pool, userId) {
  const { rows } = await pool.query(
    'SELECT provider, last4, updated_at FROM user_api_keys WHERE user_id = $1',
    [userId]
  );
  const byProvider = Object.fromEntries(rows.map(r => [r.provider, r]));
  return allProviders().map(provider => {
    const row = byProvider[provider];
    const envConfigured = !!ENV_KEY[provider]?.();
    return {
      provider,
      configured: !!row || envConfigured,
      source: row ? 'user' : (envConfigured ? 'env' : 'none'),
      last4: row?.last4 || null,
      updatedAt: row?.updated_at || null,
    };
  });
}

// Resolve the usable plaintext key for a provider: user key first, else env fallback.
async function resolveKey(pool, userId, provider) {
  const { rows } = await pool.query(
    'SELECT ciphertext, iv, auth_tag FROM user_api_keys WHERE user_id = $1 AND provider = $2',
    [userId, provider]
  );
  if (rows[0]) {
    try { return decryptSecret(rows[0]); }
    catch (e) { console.error('[ai] failed to decrypt key for', provider, e.message); }
  }
  return ENV_KEY[provider]?.() || null;
}

module.exports = { saveKey, deleteKey, listKeysMasked, resolveKey };
