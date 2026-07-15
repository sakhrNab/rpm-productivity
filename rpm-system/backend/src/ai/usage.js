// AI usage/cost logging. Every AI call records token counts + an estimated cost
// into ai_usage. Rows older than the retention window are pruned (see pruneOldUsage).

const { getModelEntry, estimateCost } = require('./registry');

const RETENTION_DAYS = 366; // keep ~1 year of per-call logs, then prune

// Normalise a raw usage object from any provider into { input, output, cached }.
function normalizeUsage(raw = {}) {
  const input = raw.input ?? raw.inputTokens ?? raw.promptTokens ?? raw.prompt_tokens ?? 0;
  const output = raw.output ?? raw.outputTokens ?? raw.completionTokens ?? raw.completion_tokens ?? 0;
  const cached = raw.cached ?? raw.cachedInputTokens ?? raw.cacheReadTokens ?? raw.cache_read_input_tokens
    ?? raw.prompt_tokens_details?.cached_tokens ?? 0;
  return { input: Number(input) || 0, output: Number(output) || 0, cached: Number(cached) || 0 };
}

// Record one call. Returns the enriched usage ({...tokens, cost, model}) for the UI.
async function recordUsage(pool, { userId, modelKey, feature, usage }) {
  const u = normalizeUsage(usage);
  const entry = getModelEntry(modelKey);
  const cost = estimateCost(modelKey, u);
  const provider = entry?.provider || null;
  try {
    await pool.query(
      `INSERT INTO ai_usage (user_id, model, provider, feature, input_tokens, output_tokens, cached_tokens, cost_usd)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [userId, modelKey || null, provider, feature || null, u.input, u.output, u.cached, cost]
    );
  } catch (e) { console.error('[ai-usage] record error:', e.message); }
  return { input: u.input, output: u.output, cached: u.cached, cost, model: modelKey, feature };
}

// Aggregate summary for a user over the last `days` days.
async function getUsageSummary(pool, userId, days = 30) {
  const since = `NOW() - INTERVAL '${Math.max(1, Math.min(366, Number(days) || 30))} days'`;
  const [total, byModel, byFeature, byDay] = await Promise.all([
    pool.query(
      `SELECT COUNT(*)::int AS calls, COALESCE(SUM(input_tokens),0)::bigint AS input,
              COALESCE(SUM(output_tokens),0)::bigint AS output, COALESCE(SUM(cached_tokens),0)::bigint AS cached,
              COALESCE(SUM(cost_usd),0)::numeric AS cost
         FROM ai_usage WHERE user_id = $1 AND created_at >= ${since}`, [userId]),
    pool.query(
      `SELECT model, COUNT(*)::int AS calls, COALESCE(SUM(input_tokens),0)::bigint AS input,
              COALESCE(SUM(output_tokens),0)::bigint AS output, COALESCE(SUM(cost_usd),0)::numeric AS cost
         FROM ai_usage WHERE user_id = $1 AND created_at >= ${since}
        GROUP BY model ORDER BY cost DESC`, [userId]),
    pool.query(
      `SELECT feature, COUNT(*)::int AS calls, COALESCE(SUM(cost_usd),0)::numeric AS cost
         FROM ai_usage WHERE user_id = $1 AND created_at >= ${since}
        GROUP BY feature ORDER BY cost DESC`, [userId]),
    pool.query(
      `SELECT to_char(date_trunc('day', created_at), 'YYYY-MM-DD') AS day,
              COALESCE(SUM(cost_usd),0)::numeric AS cost,
              COALESCE(SUM(input_tokens + output_tokens),0)::bigint AS tokens
         FROM ai_usage WHERE user_id = $1 AND created_at >= ${since}
        GROUP BY day ORDER BY day`, [userId]),
  ]);
  const t = total.rows[0] || {};
  return {
    days: Number(days) || 30,
    total: {
      calls: t.calls || 0,
      input: Number(t.input) || 0,
      output: Number(t.output) || 0,
      cached: Number(t.cached) || 0,
      cost: Number(t.cost) || 0,
    },
    byModel: byModel.rows.map(r => ({ model: r.model, calls: r.calls, input: Number(r.input), output: Number(r.output), cost: Number(r.cost) })),
    byFeature: byFeature.rows.map(r => ({ feature: r.feature, calls: r.calls, cost: Number(r.cost) })),
    byDay: byDay.rows.map(r => ({ day: r.day, cost: Number(r.cost), tokens: Number(r.tokens) })),
  };
}

// Delete logs past the retention window. Cheap (indexed on created_at via user_id index scan).
async function pruneOldUsage(pool) {
  try {
    const r = await pool.query(`DELETE FROM ai_usage WHERE created_at < NOW() - INTERVAL '${RETENTION_DAYS} days'`);
    if (r.rowCount) console.log(`[ai-usage] pruned ${r.rowCount} rows older than ${RETENTION_DAYS} days`);
  } catch (e) { console.error('[ai-usage] prune error:', e.message); }
}

module.exports = { recordUsage, getUsageSummary, pruneOldUsage, normalizeUsage };
