-- Notification routing: per message type, which channels (email / Telegram / push), plus on/off switches
-- for the three coach message types. Added 2026-10-19. Idempotent; init.sql carries the same statements.
ALTER TABLE notification_prefs ADD COLUMN IF NOT EXISTS routes JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE notification_prefs ADD COLUMN IF NOT EXISTS coach_checkins_enabled BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE notification_prefs ADD COLUMN IF NOT EXISTS coach_followups_enabled BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE notification_prefs ADD COLUMN IF NOT EXISTS coach_alerts_enabled BOOLEAN NOT NULL DEFAULT true;
-- Keep today's behaviour: coach follow-ups and slip alerts skipped email whenever Telegram was linked
-- (a hidden rule in coachEngine). Make that an explicit, visible route for those users.
UPDATE notification_prefs
   SET routes = routes || '{"coach_followup":{"email":false},"coach_alert":{"email":false}}'::jsonb
 WHERE telegram_enabled = true AND telegram_chat_id IS NOT NULL
   AND NOT (routes ? 'coach_followup') AND NOT (routes ? 'coach_alert');
