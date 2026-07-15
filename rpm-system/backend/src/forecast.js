// Goal forecasting — projects each key result forward from the user's REAL pace.
// Pure data + math (no AI). Uses the kr_progress_log trend line when ≥2 points
// exist, else estimates from the KR's start (created_at) and current value.

const DAY = 86400000;

function daysBetween(a, b) { return (new Date(b) - new Date(a)) / DAY; }

// Least-squares slope (value per day) over [{t: Date, v: number}] points.
function slopePerDay(points) {
  if (points.length < 2) return null;
  const t0 = new Date(points[0].t).getTime();
  const xs = points.map(p => (new Date(p.t).getTime() - t0) / DAY);
  const ys = points.map(p => Number(p.v) || 0);
  const n = xs.length;
  const mx = xs.reduce((s, x) => s + x, 0) / n;
  const my = ys.reduce((s, y) => s + y, 0) / n;
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) { num += (xs[i] - mx) * (ys[i] - my); den += (xs[i] - mx) ** 2; }
  if (den === 0) return null;
  return num / den;
}

async function computeForecasts(pool, userId) {
  const { rows: krs } = await pool.query(
    `SELECT kr.id, kr.title, kr.current_value, kr.target_value, kr.unit, kr.target_date,
            kr.is_completed, kr.created_at, p.name AS project_name, p.id AS project_id,
            COALESCE(p.start_date, kr.created_at::date) AS start_date
       FROM key_results kr
       JOIN projects p ON p.id = kr.project_id
      WHERE p.user_id = $1 AND kr.is_completed IS NOT TRUE
      ORDER BY kr.target_date NULLS LAST`,
    [userId]
  );

  const now = new Date();
  const out = [];

  for (const kr of krs) {
    const current = Number(kr.current_value) || 0;
    const target = kr.target_value == null ? null : Number(kr.target_value);
    const targetDate = kr.target_date ? new Date(kr.target_date) : null;

    // Trend points: the progress log, prefixed with a (start, 0) baseline.
    const { rows: logRows } = await pool.query(
      'SELECT value AS v, recorded_at AS t FROM kr_progress_log WHERE key_result_id = $1 ORDER BY recorded_at',
      [kr.id]
    );
    const points = [{ t: kr.start_date, v: 0 }, ...logRows.map(r => ({ t: r.t, v: Number(r.v) || 0 }))];
    // Ensure the latest known value is represented.
    if (!logRows.length) points.push({ t: now, v: current });

    let ratePerDay = slopePerDay(points);
    if (ratePerDay == null) {
      const elapsed = Math.max(0.5, daysBetween(kr.start_date, now));
      ratePerDay = current / elapsed;
    }

    let status = 'unknown', projectedDate = null, projectedFinal = null, requiredPerWeek = null, deltaDays = null;
    const daysRemaining = targetDate ? daysBetween(now, targetDate) : null;

    if (target != null && current >= target) {
      status = 'done';
    } else if (target != null && targetDate) {
      const remaining = target - current;
      requiredPerWeek = daysRemaining > 0 ? (remaining / daysRemaining) * 7 : remaining * 7;
      projectedFinal = current + ratePerDay * Math.max(0, daysRemaining);
      if (ratePerDay > 0) {
        const daysToTarget = remaining / ratePerDay;
        projectedDate = new Date(now.getTime() + daysToTarget * DAY);
        deltaDays = Math.round(daysBetween(targetDate, projectedDate)); // + = late, - = early
      }
      if (daysRemaining < 0) status = 'overdue';
      else if (ratePerDay <= 0) status = 'stalled';
      else if (projectedFinal >= target) status = 'on_track';
      else if (projectedFinal >= target * 0.85) status = 'at_risk';
      else status = 'off_track';
    } else {
      status = target != null ? 'no_deadline' : 'no_target';
    }

    out.push({
      id: kr.id,
      title: kr.title,
      project: kr.project_name,
      project_id: kr.project_id,
      unit: kr.unit || '',
      current,
      target,
      target_date: kr.target_date ? String(kr.target_date).slice(0, 10) : null,
      days_remaining: daysRemaining == null ? null : Math.round(daysRemaining),
      rate_per_week: Math.round(ratePerDay * 7 * 100) / 100,
      required_per_week: requiredPerWeek == null ? null : Math.round(requiredPerWeek * 100) / 100,
      projected_date: projectedDate ? projectedDate.toISOString().slice(0, 10) : null,
      projected_final: projectedFinal == null ? null : Math.round(projectedFinal * 100) / 100,
      delta_days: deltaDays,
      points: logRows.length,
      status,
    });
  }

  const summary = { on_track: 0, at_risk: 0, off_track: 0, stalled: 0, overdue: 0, done: 0, other: 0 };
  for (const f of out) {
    if (summary[f.status] != null) summary[f.status]++;
    else summary.other++;
  }
  return { generatedAt: now.toISOString(), summary, keyResults: out };
}

// Record a KR value change so future forecasts use a real trend line.
async function logKrProgress(pool, keyResultId, value) {
  if (value == null || value === '') return;
  try { await pool.query('INSERT INTO kr_progress_log (key_result_id, value) VALUES ($1, $2)', [keyResultId, value]); }
  catch (e) { console.error('[forecast] log error:', e.message); }
}

module.exports = { computeForecasts, logKrProgress };
