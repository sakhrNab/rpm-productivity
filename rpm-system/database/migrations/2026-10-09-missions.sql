-- Missions: the owner types a task, a tool-less planner turns it into steps, the owner approves, the local runner
-- runs the steps (in parallel where independent) once their dependencies are done. Added 2026-10-09.
-- Idempotent: safe to run more than once. init.sql carries the same statements for fresh databases.
-- Requires 2026-10-08-agent-runs.sql (biz_agent_runs, biz_agent_runner) to have run first.

CREATE TABLE IF NOT EXISTS biz_agent_missions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    text TEXT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'planning'
        CHECK (status IN ('planning', 'awaiting_approval', 'running', 'done', 'failed', 'cancelled')),
    plan JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    finished_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_biz_agent_missions_user ON biz_agent_missions(user_id, created_at DESC);

-- A step is an ordinary agent run that belongs to a mission and waits for its dependencies.
ALTER TABLE biz_agent_runs ADD COLUMN IF NOT EXISTS mission_id UUID REFERENCES biz_agent_missions(id) ON DELETE CASCADE;
ALTER TABLE biz_agent_runs ADD COLUMN IF NOT EXISTS step_key TEXT;
ALTER TABLE biz_agent_runs ADD COLUMN IF NOT EXISTS depends_on TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE biz_agent_runs ADD COLUMN IF NOT EXISTS capability TEXT;
CREATE INDEX IF NOT EXISTS idx_biz_agent_runs_mission ON biz_agent_runs(mission_id) WHERE mission_id IS NOT NULL;
-- One run per step key in a mission (a second approve can never double-queue a step).
CREATE UNIQUE INDEX IF NOT EXISTS uq_biz_agent_runs_step ON biz_agent_runs(mission_id, step_key) WHERE mission_id IS NOT NULL;

-- Which apps the owner's runner reports as connected (leadwave, raven, rpm, browser), from every claim / heartbeat.
ALTER TABLE biz_agent_runner ADD COLUMN IF NOT EXISTS apps JSONB NOT NULL DEFAULT '{}'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_biz_agent_missions_updated_at') THEN
    CREATE TRIGGER update_biz_agent_missions_updated_at BEFORE UPDATE ON biz_agent_missions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;
