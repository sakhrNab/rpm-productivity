-- Refresh-token reuse grace. Added 2026-10-22 (see backend/src/session.js).
-- A rotated refresh token is kept for 60 s with a pointer to its successor, so a second tab presenting the
-- just-rotated token gets the same successor instead of a 401. Rows are pruned after the window.
-- Idempotent: safe to run more than once. init.sql carries the same statements for fresh databases.
-- The backend runs without it (falls back to the old rotation with no grace window).
ALTER TABLE refresh_tokens ADD COLUMN IF NOT EXISTS rotated_at TIMESTAMPTZ;
ALTER TABLE refresh_tokens ADD COLUMN IF NOT EXISTS successor_token VARCHAR(500);
