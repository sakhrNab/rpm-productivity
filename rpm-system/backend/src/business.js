// Business module: a per-user revenue cockpit (leads, results, offers, products, channels, fixes,
// library, content) mounted at /api/business. Every query is scoped by req.userId, and every id that
// links to another row (lead_id, action_id, goal_project_id, cash_kr_id) goes through the ownership
// guard first. Tasks, goals and dates stay in RPM projects / key results / actions — rows here only
// point at them.

const express = require('express');
const { firstForeignId } = require('./ownership');
const { TEMPLATES, templateModel } = require('./businessTemplates');
const { ymd } = require('./ai/dates');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const STAGES = ['identified', 'contacted', 'replied', 'call', 'pilot', 'paid', 'lost'];
const RESULT_TYPES = ['dm_sent', 'proposal', 'reply', 'call', 'delivered', 'case_study', 'won', 'lost', 'content', 'note'];
// Funnel role of each result type.
const ROLE = { dm_sent: 'sent', proposal: 'sent', reply: 'reply', call: 'call', delivered: 'proof', case_study: 'proof', won: 'won', lost: 'lost', content: 'content', note: 'note' };
const TONES = ['ok', 'warn', 'bad', 'info'];

class Invalid extends Error {}

// pg hands DATE columns back as local-midnight Date objects; the API always speaks YYYY-MM-DD.
const DATE_COLS = new Set(['next_contact', 'date', 'next_date', 'deadline', 'scheduled_date', 'end_date', 'target_date']);
const out = (row) => {
  if (!row || typeof row !== 'object') return row;
  const o = { ...row };
  for (const k of Object.keys(o)) if (DATE_COLS.has(k) && o[k] != null) o[k] = ymd(o[k]) || null;
  return o;
};
const outAll = (rows) => rows.map(out);

// ───────── field validators: (value) => clean value, or throw Invalid ─────────
const text = (max, { required = false } = {}) => (v, name) => {
  if (v === null || v === undefined) v = '';
  if (typeof v !== 'string' && typeof v !== 'number') throw new Invalid(`${name} must be text`);
  const s = String(v).trim();
  if (s.length > max) throw new Invalid(`${name} is too long (max ${max} characters)`);
  if (required && !s) throw new Invalid(`${name} is required`);
  return s;
};
const oneOf = (list) => (v, name) => {
  if (!list.includes(v)) throw new Invalid(`${name} must be one of: ${list.join(', ')}`);
  return v;
};
const date = () => (v, name) => {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v !== 'string' || !ISO_DATE.test(v) || Number.isNaN(Date.parse(`${v}T00:00:00Z`))) throw new Invalid(`${name} must be a date (YYYY-MM-DD)`);
  return v;
};
const int = (min, max, { nullable = false } = {}) => (v, name) => {
  if ((v === null || v === undefined || v === '') && nullable) return null;
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  if (typeof n !== 'number' || !Number.isInteger(n) || n < min || n > max) throw new Invalid(`${name} must be a whole number from ${min} to ${max}`);
  return n;
};
const num = (min, max) => (v, name) => {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'string' ? Number(v) : v;
  if (typeof n !== 'number' || !Number.isFinite(n) || n < min || n > max) throw new Invalid(`${name} must be a number from ${min} to ${max}`);
  return Math.round(n * 100) / 100;
};
const bool = () => (v, name) => {
  if (typeof v !== 'boolean') throw new Invalid(`${name} must be true or false`);
  return v;
};
const fk = () => (v, name) => {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v !== 'string' || !UUID.test(v)) throw new Invalid(`Invalid ${name}`);
  return v;
};
// JSON lists: arrays of short strings, or arrays of objects with known string keys.
const strList = (maxItems = 40, maxLen = 600) => (v, name) => {
  if (v === null || v === undefined) return [];
  if (!Array.isArray(v) || v.length > maxItems) throw new Invalid(`${name} must be a list of at most ${maxItems} items`);
  return v.map((x) => text(maxLen)(x, name)).filter(Boolean);
};
const objList = (keys, maxItems = 30, maxLen = 600) => (v, name) => {
  if (v === null || v === undefined) return [];
  if (!Array.isArray(v) || v.length > maxItems) throw new Invalid(`${name} must be a list of at most ${maxItems} items`);
  return v.map((o) => {
    if (!o || typeof o !== 'object' || Array.isArray(o)) throw new Invalid(`${name} items must be objects`);
    const out = {};
    for (const k of keys) out[k] = text(maxLen)(o[k], `${name}.${k}`);
    return out;
  });
};
const strObj = (keys, maxLen = 1000) => (v, name) => {
  if (v === null || v === undefined) return {};
  if (typeof v !== 'object' || Array.isArray(v)) throw new Invalid(`${name} must be an object`);
  const out = {};
  for (const k of keys) out[k] = text(maxLen)(v[k], `${name}.${k}`);
  return out;
};

// ───────── tables ─────────
// fields: column -> validator. `required` columns must be present on create. `json` columns are
// serialised before they go to pg. `order` is the list order.
const TABLES = {
  leads: {
    table: 'biz_leads', order: 'next_contact ASC NULLS LAST, created_at ASC', required: ['name'],
    fields: {
      name: text(200, { required: true }), source: text(120), why: text(2000), offer: text(200), stage: oneOf(STAGES),
      next_step: text(1000), next_contact: date(), fit: int(1, 3), notes: text(4000), action_id: fk(),
    },
  },
  results: {
    table: 'biz_results', order: 'date DESC, created_at DESC', required: ['type'],
    fields: {
      type: oneOf(RESULT_TYPES), channel: text(40), lead_id: fk(), count: int(1, 10000), value_eur: num(0, 10000000),
      views: int(0, 1000000000, { nullable: true }), note: text(4000), date: date(),
    },
  },
  offers: {
    table: 'biz_offers', order: 'sort ASC, created_at ASC', required: ['name'],
    json: ['value', 'ladder', 'bonuses', 'deliverables', 'weak_spots'],
    fields: {
      name: text(200, { required: true }), tagline: text(1000), for_who: text(1000), product: text(200), readiness: oneOf(TONES),
      readiness_note: text(1000), value: strObj(['dream', 'likelihood', 'time', 'effort']), ladder: objList(['step', 'price', 'note']),
      guarantee: text(2000), bonuses: strList(), scarcity: text(500), deliverables: objList(['when', 'what', 'form']),
      first_line: text(1000), qualify: text(1000), weak_spots: strList(), sort: int(-100000, 100000),
    },
  },
  products: {
    table: 'biz_products', order: 'sort ASC, created_at ASC', required: ['name'],
    fields: {
      name: text(200, { required: true }), what: text(1000), role: text(20), promised: bool(), status: text(1000), price: text(200),
      blocker: text(1000), next_step: text(1000), next_date: date(), repo: text(200), sort: int(-100000, 100000),
    },
  },
  channels: {
    table: 'biz_channels', order: 'sort ASC, created_at ASC', required: ['name'], json: ['gaps', 'moves'],
    fields: {
      name: text(200, { required: true }), stat: text(300), audience: text(1000), verdict: text(1000), tone: oneOf(TONES),
      gaps: strList(), moves: strList(), sort: int(-100000, 100000),
    },
  },
  fixes: {
    table: 'biz_fixes', order: 'done ASC, severity ASC, sort ASC, created_at ASC', required: ['text'],
    fields: {
      severity: oneOf(['P0', 'P1', 'P2']), text: text(500, { required: true }), detail: text(2000), effort: text(40), done: bool(),
      action_id: fk(), sort: int(-100000, 100000),
    },
  },
  docs: {
    table: 'biz_docs', order: 'date DESC NULLS LAST, created_at DESC', required: ['path'],
    fields: { path: text(500, { required: true }), status: oneOf(['current', 'superseded', 'obsolete', 'archive']), note: text(2000), date: date() },
  },
  content: {
    table: 'biz_content', order: 'date ASC NULLS LAST, created_at ASC', required: ['title'],
    fields: {
      date: date(), platform: text(60), title: text(300, { required: true }), goal: text(20), hook: text(2000),
      status: oneOf(['idea', 'draft', 'ready', 'published']),
    },
  },
};
const LINK_FIELDS = ['lead_id', 'action_id', 'goal_project_id', 'cash_kr_id'];

const MODEL_KEYS = ['id', 'name', 'unit', 'note'];
function validateModel(v) {
  if (!Array.isArray(v) || v.length > 20) throw new Invalid('revenue_model must be a list of at most 20 channels');
  return v.map((c, i) => {
    if (!c || typeof c !== 'object' || Array.isArray(c)) throw new Invalid('revenue_model items must be objects');
    const out = {};
    for (const k of MODEL_KEYS) out[k] = text(k === 'note' ? 1000 : 120)(c[k], `revenue_model.${k}`);
    if (!out.id) out.id = `ch${i + 1}`;
    out.volume = num(0, 1000000)(c.volume, 'revenue_model.volume') ?? 0;
    out.convert = num(0, 100)(c.convert, 'revenue_model.convert') ?? 0;
    out.ticket = num(0, 10000000)(c.ticket, 'revenue_model.ticket') ?? 0;
    out.startsWeek = int(0, 520, { nullable: true })(c.startsWeek, 'revenue_model.startsWeek') ?? 1;
    return out;
  });
}

const SETTINGS_FIELDS = {
  goal_project_id: fk(), cash_kr_id: fk(), deadline: date(), currency: text(8), revenue_model: validateModel,
};

/** Validates a body against a field map. Unknown keys are ignored. Returns { col: value }. */
function clean(fields, body, { create = false, required = [] } = {}) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Invalid('Body must be an object');
  const out = {};
  for (const [col, check] of Object.entries(fields)) {
    if (!(col in body)) continue;
    out[col] = check(body[col], col);
  }
  if (create) for (const r of required) if (!(r in out)) out[r] = fields[r](undefined, r); // throws "required"
  return out;
}

const serialise = (cfg, row) => {
  const vals = {};
  for (const [k, v] of Object.entries(row)) vals[k] = (cfg.json || []).includes(k) ? JSON.stringify(v) : v;
  return vals;
};

// ───────── data access (also used by the template + import paths) ─────────
async function insertRow(db, cfg, userId, row) {
  const vals = serialise(cfg, row);
  const cols = Object.keys(vals);
  const params = [userId, ...cols.map((c) => vals[c])];
  const { rows } = await db.query(
    `INSERT INTO ${cfg.table} (user_id${cols.map((c) => `, ${c}`).join('')}) VALUES ($1${cols.map((_, i) => `, $${i + 2}`).join('')}) RETURNING *`,
    params,
  );
  return out(rows[0]);
}

async function getRow(db, cfg, userId, id) {
  if (!UUID.test(String(id))) return null;
  const { rows } = await db.query(`SELECT * FROM ${cfg.table} WHERE id = $1 AND user_id = $2`, [id, userId]);
  return rows[0] ? out(rows[0]) : null;
}

async function updateRow(db, cfg, userId, id, row) {
  if (!UUID.test(String(id))) return null;
  const vals = serialise(cfg, row);
  const cols = Object.keys(vals);
  const params = cols.map((c) => vals[c]);
  params.push(id, userId);
  const { rows } = await db.query(
    `UPDATE ${cfg.table} SET ${cols.map((c, i) => `${c} = $${i + 1}`).join(', ')} WHERE id = $${cols.length + 1} AND user_id = $${cols.length + 2} RETURNING *`,
    params,
  );
  return rows[0] ? out(rows[0]) : null;
}

async function deleteRow(db, cfg, userId, id) {
  if (!UUID.test(String(id))) return false;
  const { rows } = await db.query(`DELETE FROM ${cfg.table} WHERE id = $1 AND user_id = $2 RETURNING id`, [id, userId]);
  return rows.length > 0;
}

async function getSettings(db, userId) {
  const { rows } = await db.query('SELECT * FROM biz_settings WHERE user_id = $1', [userId]);
  return rows[0] ? out(rows[0]) : null;
}

/** Creates an RPM action owned by the user, filed under the business goal project when one is set. */
async function createLinkedAction(db, userId, { title, notes, scheduled_date }) {
  const s = await getSettings(db, userId);
  let projectId = null;
  let categoryId = null;
  if (s?.goal_project_id) {
    const p = await db.query('SELECT id, category_id FROM projects WHERE id = $1 AND user_id = $2', [s.goal_project_id, userId]);
    if (p.rows[0]) { projectId = p.rows[0].id; categoryId = p.rows[0].category_id; }
  }
  const { rows } = await db.query(
    `INSERT INTO actions (user_id, category_id, project_id, title, notes, scheduled_date, sort_order)
     VALUES ($1, $2, $3, $4, $5, $6, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM actions WHERE user_id = $1)) RETURNING *`,
    [userId, categoryId, projectId, title.slice(0, 300), notes || '', scheduled_date || null],
  );
  return out(rows[0]);
}

// ───────── summary ─────────
const n = (v) => (v === null || v === undefined || v === '' ? 0 : Number(v) || 0);

async function buildSummary(db, userId) {
  const s = await getSettings(db, userId);
  const counts = {};
  for (const [key, cfg] of Object.entries(TABLES)) {
    const { rows } = await db.query(`SELECT COUNT(*)::int AS c FROM ${cfg.table} WHERE user_id = $1`, [userId]);
    counts[key] = rows[0]?.c || 0;
  }

  const { rows: res } = await db.query(
    'SELECT type, SUM(count)::int AS n, COALESCE(SUM(value_eur), 0) AS cash, COUNT(*)::int AS rows FROM biz_results WHERE user_id = $1 GROUP BY type',
    [userId],
  );
  const funnel = { sent: 0, reply: 0, call: 0, proof: 0, won: 0, lost: 0, content: 0, cash_logged: 0 };
  for (const r of res) {
    const role = ROLE[r.type];
    if (role === 'won') { funnel.won += r.rows; funnel.cash_logged += n(r.cash); }
    else if (role === 'content') funnel.content += r.rows;
    else if (role && role !== 'note') funnel[role] += r.n;
  }

  const { rows: stageRows } = await db.query('SELECT stage, COUNT(*)::int AS c FROM biz_leads WHERE user_id = $1 GROUP BY stage', [userId]);
  const stages = Object.fromEntries(STAGES.map((st) => [st, 0]));
  for (const r of stageRows) stages[r.stage] = r.c;

  let goal = null;
  let cash = null;
  let nextActions = [];
  if (s?.goal_project_id) {
    const p = await db.query('SELECT id, name, end_date, ultimate_result FROM projects WHERE id = $1 AND user_id = $2', [s.goal_project_id, userId]);
    if (p.rows[0]) {
      goal = out(p.rows[0]);
      const a = await db.query(
        `SELECT id, title, scheduled_date, is_starred FROM actions
          WHERE user_id = $1 AND project_id = $2 AND is_completed = false AND COALESCE(is_cancelled, false) = false
          ORDER BY scheduled_date ASC NULLS LAST, sort_order ASC LIMIT 6`,
        [userId, goal.id],
      );
      nextActions = outAll(a.rows);
    }
  }
  if (s?.cash_kr_id) {
    const k = await db.query(
      `SELECT kr.id, kr.title, kr.current_value, kr.target_value, kr.unit, kr.target_date, kr.project_id
         FROM key_results kr JOIN projects p ON p.id = kr.project_id WHERE kr.id = $1 AND p.user_id = $2`,
      [s.cash_kr_id, userId],
    );
    if (k.rows[0]) cash = { ...out(k.rows[0]), current_value: n(k.rows[0].current_value), target_value: n(k.rows[0].target_value) };
  }

  const { rows: followUps } = await db.query(
    `SELECT id, name, stage, next_step, next_contact, action_id FROM biz_leads
      WHERE user_id = $1 AND stage NOT IN ('paid', 'lost') AND next_contact IS NOT NULL
      ORDER BY next_contact ASC LIMIT 5`,
    [userId],
  );
  const { rows: openFixes } = await db.query(
    `SELECT id, severity, text, effort, action_id FROM biz_fixes WHERE user_id = $1 AND done = false
      ORDER BY severity ASC, sort ASC, created_at ASC LIMIT 5`,
    [userId],
  );
  const { rows: productSteps } = await db.query(
    `SELECT id, name, next_step, next_date FROM biz_products WHERE user_id = $1 AND next_date IS NOT NULL AND next_step <> ''
      ORDER BY next_date ASC LIMIT 5`,
    [userId],
  );

  return {
    settings: s, counts, empty: Object.values(counts).every((c) => c === 0) && !s,
    funnel, stages, goal, cash, deadline: s?.deadline || goal?.end_date || null,
    next: { actions: nextActions, followUps: outAll(followUps), fixes: openFixes, products: outAll(productSteps) },
  };
}

// ───────── router ─────────
function createBusinessRouter({ pool }) {
  const router = express.Router();

  const wrap = (fn) => async (req, res) => {
    try { await fn(req, res); } catch (e) {
      if (e instanceof Invalid) return res.status(400).json({ error: e.message });
      console.error(`[business] ${req.method} ${req.path}:`, e.message);
      res.status(500).json({ error: 'Business request failed' });
    }
  };
  // Every linking id must belong to this user; otherwise 400 before anything is written.
  const guardLinks = async (req, row) => {
    const bad = await firstForeignId(pool, req.userId, row, LINK_FIELDS);
    if (bad) throw new Invalid(`Invalid ${bad}`);
  };

  router.get('/summary', wrap(async (req, res) => res.json(await buildSummary(pool, req.userId))));

  router.get('/settings', wrap(async (req, res) => {
    const s = await getSettings(pool, req.userId);
    res.json(s || { goal_project_id: null, cash_kr_id: null, deadline: null, currency: 'EUR', revenue_model: [] });
  }));

  router.put('/settings', wrap(async (req, res) => {
    const row = clean(SETTINGS_FIELDS, req.body);
    if (row.currency !== undefined && !row.currency) row.currency = 'EUR';
    await guardLinks(req, row);
    if (row.revenue_model) row.revenue_model = JSON.stringify(row.revenue_model);
    const cols = Object.keys(row);
    const params = [req.userId, ...cols.map((c) => row[c])];
    const sql = cols.length
      ? `INSERT INTO biz_settings (user_id${cols.map((c) => `, ${c}`).join('')}) VALUES ($1${cols.map((_, i) => `, $${i + 2}`).join('')})
         ON CONFLICT (user_id) DO UPDATE SET ${cols.map((c) => `${c} = EXCLUDED.${c}`).join(', ')} RETURNING *`
      : 'INSERT INTO biz_settings (user_id) VALUES ($1) ON CONFLICT (user_id) DO UPDATE SET user_id = EXCLUDED.user_id RETURNING *';
    const { rows } = await pool.query(sql, params);
    res.json(out(rows[0]));
  }));

  // Start from a template: sample rows the user can edit or delete. Only fills sections that are empty,
  // so pressing it twice never duplicates anything.
  router.post('/template', wrap(async (req, res) => {
    const want = req.body?.section || 'all';
    const sections = want === 'all' ? Object.keys(TEMPLATES) : [want];
    if (!sections.every((sct) => TEMPLATES[sct])) throw new Invalid(`section must be one of: all, ${Object.keys(TEMPLATES).join(', ')}`);
    const created = {};
    for (const sct of sections) {
      const cfg = TABLES[sct];
      const { rows } = await pool.query(`SELECT COUNT(*)::int AS c FROM ${cfg.table} WHERE user_id = $1`, [req.userId]);
      if (rows[0].c > 0) { created[sct] = 0; continue; }
      for (const t of TEMPLATES[sct]) await insertRow(pool, cfg, req.userId, clean(cfg.fields, t, { create: true, required: cfg.required }));
      created[sct] = TEMPLATES[sct].length;
    }
    if (want === 'all' || want === 'revenue') {
      const s = await getSettings(pool, req.userId);
      if (!s || !Array.isArray(s.revenue_model) || !s.revenue_model.length) {
        await pool.query(
          `INSERT INTO biz_settings (user_id, revenue_model) VALUES ($1, $2)
           ON CONFLICT (user_id) DO UPDATE SET revenue_model = EXCLUDED.revenue_model`,
          [req.userId, JSON.stringify(templateModel())],
        );
        created.revenue_model = templateModel().length;
      }
    }
    res.status(201).json({ created });
  }));

  // Lead follow-up → an RPM action on the lead's next-contact date, linked back to the lead.
  router.post('/leads/:id/follow-up', wrap(async (req, res) => {
    const lead = await getRow(pool, TABLES.leads, req.userId, req.params.id);
    if (!lead) return res.status(404).json({ error: 'Not found' });
    const when = date()(req.body?.scheduled_date ?? lead.next_contact ?? null, 'scheduled_date');
    const title = text(300)(req.body?.title, 'title') || `Follow up: ${lead.name}`;
    const action = await createLinkedAction(pool, req.userId, { title, notes: lead.next_step || '', scheduled_date: when });
    const updated = await updateRow(pool, TABLES.leads, req.userId, lead.id, { action_id: action.id });
    res.status(201).json({ action, lead: updated });
  }));

  // Fix → an RPM action, linked back to the fix.
  router.post('/fixes/:id/action', wrap(async (req, res) => {
    const fix = await getRow(pool, TABLES.fixes, req.userId, req.params.id);
    if (!fix) return res.status(404).json({ error: 'Not found' });
    const when = date()(req.body?.scheduled_date, 'scheduled_date');
    const action = await createLinkedAction(pool, req.userId, { title: `[${fix.severity}] ${fix.text}`, notes: fix.detail || '', scheduled_date: when });
    const updated = await updateRow(pool, TABLES.fixes, req.userId, fix.id, { action_id: action.id });
    res.status(201).json({ action, fix: updated });
  }));

  const tableOf = (req, res) => {
    const cfg = Object.prototype.hasOwnProperty.call(TABLES, req.params.table) ? TABLES[req.params.table] : null;
    if (!cfg) res.status(404).json({ error: 'Unknown section' });
    return cfg;
  };

  router.get('/:table', wrap(async (req, res) => {
    const cfg = tableOf(req, res); if (!cfg) return;
    const { rows } = await pool.query(`SELECT * FROM ${cfg.table} WHERE user_id = $1 ORDER BY ${cfg.order}`, [req.userId]);
    res.json(outAll(rows));
  }));

  router.post('/:table', wrap(async (req, res) => {
    const cfg = tableOf(req, res); if (!cfg) return;
    const row = clean(cfg.fields, req.body, { create: true, required: cfg.required });
    await guardLinks(req, row);
    res.status(201).json(await insertRow(pool, cfg, req.userId, row));
  }));

  router.get('/:table/:id', wrap(async (req, res) => {
    const cfg = tableOf(req, res); if (!cfg) return;
    const row = await getRow(pool, cfg, req.userId, req.params.id);
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json(row);
  }));

  router.put('/:table/:id', wrap(async (req, res) => {
    const cfg = tableOf(req, res); if (!cfg) return;
    if (!UUID.test(req.params.id)) return res.status(404).json({ error: 'Not found' });
    const row = clean(cfg.fields, req.body);
    if (!Object.keys(row).length) throw new Invalid('No valid fields to update');
    await guardLinks(req, row);
    const updated = await updateRow(pool, cfg, req.userId, req.params.id, row);
    if (!updated) return res.status(404).json({ error: 'Not found' });
    res.json(updated);
  }));

  router.delete('/:table/:id', wrap(async (req, res) => {
    const cfg = tableOf(req, res); if (!cfg) return;
    if (!(await deleteRow(pool, cfg, req.userId, req.params.id))) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true });
  }));

  return router;
}

module.exports = {
  createBusinessRouter, buildSummary, clean, validateModel, insertRow, getSettings,
  TABLES, SETTINGS_FIELDS, STAGES, RESULT_TYPES, ROLE, Invalid,
};
