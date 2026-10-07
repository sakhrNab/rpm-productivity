-- Business redesign + Agents control page. Added 2026-10-08.
-- Idempotent: safe to run more than once. init.sql carries the same statements for fresh databases.
-- Requires 2026-10-07-business.sql (biz_* tables) to have run first.

-- Agent runs: RPM only QUEUES and DISPLAYS jobs. A local runner (authenticated with a personal access
-- token, write scope) claims the oldest queued run for its user and reports the outcome back.
CREATE TABLE IF NOT EXISTS biz_agent_runs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    job_id VARCHAR(40) NOT NULL,
    inputs JSONB NOT NULL DEFAULT '{}'::jsonb,
    status VARCHAR(12) NOT NULL DEFAULT 'queued'
        CHECK (status IN ('queued', 'running', 'done', 'failed', 'cancelled')),
    runner TEXT NOT NULL DEFAULT '',
    summary TEXT NOT NULL DEFAULT '',
    outbox JSONB NOT NULL DEFAULT '[]'::jsonb,
    cost_usd NUMERIC(10, 4),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    started_at TIMESTAMPTZ,
    finished_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_biz_agent_runs_user ON biz_agent_runs(user_id, created_at DESC);
-- The claim query: oldest queued run per user.
CREATE INDEX IF NOT EXISTS idx_biz_agent_runs_queue ON biz_agent_runs(user_id, created_at) WHERE status = 'queued';

-- Runner heartbeat: the last time this user's local runner asked for work (every claim, even an empty one).
CREATE TABLE IF NOT EXISTS biz_agent_runner (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    runner TEXT NOT NULL DEFAULT '',
    last_claim_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Flow links used by the redesigned Business area.
-- When a lead last changed stage ("stuck in a stage for N days"). Existing rows start from created_at.
ALTER TABLE biz_leads ADD COLUMN IF NOT EXISTS stage_changed_at TIMESTAMPTZ;
UPDATE biz_leads SET stage_changed_at = created_at WHERE stage_changed_at IS NULL;
ALTER TABLE biz_leads ALTER COLUMN stage_changed_at SET DEFAULT NOW();
-- Which offer a fix blocks (fix -> offer connector, "P0 fix blocks an offer").
ALTER TABLE biz_fixes ADD COLUMN IF NOT EXISTS offer_id UUID REFERENCES biz_offers(id) ON DELETE SET NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_biz_agent_runs_updated_at') THEN
    CREATE TRIGGER update_biz_agent_runs_updated_at BEFORE UPDATE ON biz_agent_runs FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;
