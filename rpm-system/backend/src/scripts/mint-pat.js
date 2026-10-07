// Mint a personal access token for a user. Prints the token ONCE; only its hash is stored.
//   docker exec <backend> node src/scripts/mint-pat.js --email you@x.com --name claude-mcp --scopes read,write [--days 90]
require('dotenv').config();
const { Pool } = require('pg');
const { generatePat, hashPat } = require('../pat');

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > -1 ? process.argv[i + 1] : d; };
const email = arg('email');
const name = arg('name', 'token');
const scopes = String(arg('scopes', 'read')).split(',').map((s) => s.trim()).filter((s) => ['read', 'write'].includes(s));
const days = Number(arg('days', 90));
if (!email || !scopes.length) { console.error('usage: --email <email> --name <name> --scopes read[,write] [--days 90]'); process.exit(1); }

(async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const u = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (!u.rows.length) throw new Error(`no user ${email}`);
    const token = generatePat();
    await pool.query(
      `INSERT INTO personal_access_tokens (user_id, name, token_hash, last4, scopes, expires_at)
       VALUES ($1, $2, $3, $4, $5, CASE WHEN $6::int > 0 THEN NOW() + ($6::int || ' days')::interval END)`,
      [u.rows[0].id, name, hashPat(token), token.slice(-4), scopes, days]
    );
    console.log(token);
  } catch (e) { console.error(e.message); process.exitCode = 1; } finally { await pool.end(); }
})();
