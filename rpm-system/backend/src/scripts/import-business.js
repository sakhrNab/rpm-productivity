// Import a Business export (JSON) for one user. Idempotent: rows that already exist (same natural key)
// are skipped, so running it twice inserts nothing new. Every row goes through the same validators as
// the API.
//   node src/scripts/import-business.js --email you@x.com --file business.json [--dry-run]
//
// File shape (all keys optional):
//   { "settings": { "deadline": "YYYY-MM-DD", "currency": "EUR", "revenue_model": [...],
//                   "goal_project_name": "…", "cash_kr_title": "…" },
//     "leads": [...], "results": [{ ..., "lead_name": "…" }], "offers": [...], "products": [...],
//     "channels": [...], "fixes": [...], "docs": [...], "content": [...] }
// Row keys are the API column names (see src/business.js TABLES).
require('dotenv').config();
const fs = require('fs');
const { Pool } = require('pg');
const { TABLES, SETTINGS_FIELDS, clean, insertRow, Invalid } = require('../business');

// Natural key per section: the columns that identify "the same row" across imports.
const NATURAL_KEY = {
  leads: ['name'], offers: ['name'], products: ['name'], channels: ['name'], fixes: ['text'], docs: ['path'],
  content: ['date', 'title'], results: ['date', 'type', 'channel', 'note', 'count'],
};

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > -1 ? process.argv[i + 1] : d; };

async function importBusiness(db, userId, data, { log = () => {} } = {}) {
  const report = {};
  const leadIds = new Map((await db.query('SELECT id, name FROM biz_leads WHERE user_id = $1', [userId])).rows.map((r) => [r.name, r.id]));

  for (const section of ['leads', 'offers', 'products', 'channels', 'fixes', 'docs', 'content', 'results']) {
    const rows = Array.isArray(data[section]) ? data[section] : [];
    const cfg = TABLES[section];
    const r = (report[section] = { inserted: 0, skipped: 0, invalid: 0 });
    for (const [i, raw] of rows.entries()) {
      let row;
      try {
        const src = { ...raw };
        delete src.action_id; // ids from another system never carry over
        delete src.lead_id;
        row = clean(cfg.fields, src, { create: true, required: cfg.required });
        if (section === 'results' && raw.lead_name && leadIds.has(raw.lead_name)) row.lead_id = leadIds.get(raw.lead_name);
      } catch (e) {
        if (!(e instanceof Invalid)) throw e;
        r.invalid += 1; log(`  ${section}[${i}] skipped: ${e.message}`); continue;
      }
      const key = NATURAL_KEY[section];
      const probe = { ...row };
      if (section === 'results') { probe.count = probe.count ?? 1; probe.note = probe.note ?? ''; probe.channel = probe.channel ?? ''; }
      const where = key.map((c, j) => `${c} IS NOT DISTINCT FROM $${j + 2}`).join(' AND ');
      const found = await db.query(`SELECT id FROM ${cfg.table} WHERE user_id = $1 AND ${where} LIMIT 1`, [userId, ...key.map((c) => probe[c] ?? null)]);
      if (found.rows.length) { r.skipped += 1; continue; }
      const ins = await insertRow(db, cfg, userId, row);
      if (section === 'leads') leadIds.set(ins.name, ins.id);
      r.inserted += 1;
    }
  }

  const s = data.settings && typeof data.settings === 'object' ? data.settings : null;
  if (s) {
    const row = clean(SETTINGS_FIELDS, { deadline: s.deadline, currency: s.currency, ...(Array.isArray(s.revenue_model) ? { revenue_model: s.revenue_model } : {}) });
    if (s.goal_project_name) {
      const p = await db.query('SELECT id FROM projects WHERE user_id = $1 AND name = $2 ORDER BY created_at LIMIT 1', [userId, s.goal_project_name]);
      if (p.rows[0]) {
        row.goal_project_id = p.rows[0].id;
        if (s.cash_kr_title) {
          const k = await db.query('SELECT id FROM key_results WHERE project_id = $1 AND title = $2 LIMIT 1', [p.rows[0].id, s.cash_kr_title]);
          if (k.rows[0]) row.cash_kr_id = k.rows[0].id;
        }
      } else log(`  settings: no project named "${s.goal_project_name}" — goal link left empty`);
    }
    for (const k of Object.keys(row)) if (row[k] === null || row[k] === undefined || row[k] === '') delete row[k];
    if (row.revenue_model) row.revenue_model = JSON.stringify(row.revenue_model);
    const cols = Object.keys(row);
    // Existing settings win: only empty fields are filled, so a re-import never overwrites edits.
    await db.query(
      `INSERT INTO biz_settings (user_id${cols.map((c) => `, ${c}`).join('')}) VALUES ($1${cols.map((_, i) => `, $${i + 2}`).join('')})
       ON CONFLICT (user_id) DO ${cols.length ? `UPDATE SET ${cols.map((c) => c === 'revenue_model'
        ? `revenue_model = CASE WHEN jsonb_array_length(biz_settings.revenue_model) = 0 THEN EXCLUDED.revenue_model ELSE biz_settings.revenue_model END`
        : c === 'currency' ? 'currency = biz_settings.currency'
        : `${c} = COALESCE(biz_settings.${c}, EXCLUDED.${c})`).join(', ')}` : 'NOTHING'}`,
      [userId, ...cols.map((c) => row[c])],
    );
    report.settings = cols;
  }
  return report;
}

if (require.main === module) {
  const email = arg('email');
  const file = arg('file');
  const dry = process.argv.includes('--dry-run');
  if (!email || !file) { console.error('usage: --email <email> --file <export.json> [--dry-run]'); process.exit(1); }
  (async () => {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    const client = await pool.connect();
    try {
      const u = await client.query('SELECT id FROM users WHERE email = $1', [email]);
      if (!u.rows.length) throw new Error(`no user ${email}`);
      await client.query('BEGIN');
      const report = await importBusiness(client, u.rows[0].id, data, { log: console.log });
      await client.query(dry ? 'ROLLBACK' : 'COMMIT');
      console.log(JSON.stringify(report, null, 2));
      console.log(dry ? 'DRY RUN — rolled back, nothing written.' : 'Committed.');
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      console.error(e.message); process.exitCode = 1;
    } finally { client.release(); await pool.end(); }
  })();
}

module.exports = { importBusiness, NATURAL_KEY };
