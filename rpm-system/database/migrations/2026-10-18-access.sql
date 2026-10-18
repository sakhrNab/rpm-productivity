-- Access control: roles, invite links that actually admit, registration codes, access requests the admin
-- approves, and a queryable security log for the admin dashboard. Added 2026-10-18.
-- Idempotent: safe to run more than once. init.sql carries the same statements for fresh databases.

-- Who is an admin lives in the database, not the environment.
ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(20) NOT NULL DEFAULT 'member';
ALTER TABLE users ADD COLUMN IF NOT EXISTS disabled_at TIMESTAMPTZ;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_role_check') THEN
    ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('admin', 'member'));
  END IF;
END $$;
UPDATE users SET role = 'admin' WHERE LOWER(email) = 'aiwaverider8@gmail.com';

-- Invitations: one pending invite per email; accepting marks it and remembers who joined.
ALTER TABLE invitations ADD COLUMN IF NOT EXISTS name VARCHAR(100);
ALTER TABLE invitations ADD COLUMN IF NOT EXISTS source VARCHAR(20) NOT NULL DEFAULT 'person';
ALTER TABLE invitations ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;
ALTER TABLE invitations ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMPTZ;
ALTER TABLE invitations ADD COLUMN IF NOT EXISTS accepted_user_id UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE invitations ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ;
UPDATE invitations SET status = 'pending' WHERE status = 'sent';
UPDATE invitations i SET status = 'accepted', accepted_at = COALESCE(i.accepted_at, u.created_at), accepted_user_id = u.id
  FROM users u WHERE i.status = 'pending' AND LOWER(u.email) = LOWER(i.email);
ALTER TABLE invitations ALTER COLUMN status SET DEFAULT 'pending';
DROP INDEX IF EXISTS idx_invitations_email_lower;
CREATE UNIQUE INDEX IF NOT EXISTS uq_invitations_pending_email ON invitations (LOWER(email)) WHERE status = 'pending';
CREATE UNIQUE INDEX IF NOT EXISTS uq_invitations_token ON invitations (token);

-- Codes the admin hands out. uses <= max_uses is enforced by the claiming UPDATE.
CREATE TABLE IF NOT EXISTS registration_codes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code VARCHAR(40) NOT NULL,
    label VARCHAR(120),
    max_uses INTEGER NOT NULL DEFAULT 1 CHECK (max_uses > 0),
    uses INTEGER NOT NULL DEFAULT 0,
    expires_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_registration_codes_code ON registration_codes (UPPER(code));

-- Which account each code / invite produced (the admin sees who came in through what).
ALTER TABLE users ADD COLUMN IF NOT EXISTS joined_via VARCHAR(20);
ALTER TABLE users ADD COLUMN IF NOT EXISTS registration_code_id UUID REFERENCES registration_codes(id) ON DELETE SET NULL;

-- "Let me in" requests from the public sign-up page.
CREATE TABLE IF NOT EXISTS access_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) NOT NULL,
    name VARCHAR(100) NOT NULL,
    message TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'denied')),
    ip VARCHAR(64),
    reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
    reviewed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_access_requests_pending_email ON access_requests (LOWER(email)) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_access_requests_created ON access_requests (created_at DESC);

-- The same SECURITY_EVENT lines the container log gets, kept 90 days for the admin's Security view.
CREATE TABLE IF NOT EXISTS security_events (
    id BIGSERIAL PRIMARY KEY,
    ts TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    event VARCHAR(40) NOT NULL,
    user_email VARCHAR(120),
    ip VARCHAR(64),
    reason VARCHAR(60)
);
CREATE INDEX IF NOT EXISTS idx_security_events_ts ON security_events (ts DESC);
CREATE INDEX IF NOT EXISTS idx_security_events_event_ts ON security_events (event, ts DESC);

-- "Own account + linked": a contact that became a member points at their account.
ALTER TABLE persons ADD COLUMN IF NOT EXISTS member_user_id UUID REFERENCES users(id) ON DELETE SET NULL;
UPDATE persons p SET member_user_id = u.id FROM users u
  WHERE p.member_user_id IS NULL AND p.email <> '' AND LOWER(p.email) = LOWER(u.email);
