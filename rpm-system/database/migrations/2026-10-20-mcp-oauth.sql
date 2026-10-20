-- The hosted MCP connector (/mcp): third-party MCP clients (Wavecode, Claude, ChatGPT…) sign in as
-- a user and get a token bound to /mcp with only the permissions the user granted (mcp:read,
-- mcp:write). Codes and tokens are stored only as sha256 hashes. Same as the block in init.sql.
CREATE TABLE IF NOT EXISTS oauth_clients (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  redirect_uris TEXT[] NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS oauth_codes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code_hash CHAR(64) NOT NULL UNIQUE,
  client_id TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  redirect_uri TEXT NOT NULL,
  challenge TEXT NOT NULL,
  scope TEXT NOT NULL,
  resource TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS oauth_tokens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  access_hash CHAR(64) NOT NULL UNIQUE,
  refresh_hash CHAR(64) UNIQUE,
  client_id TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  scope TEXT NOT NULL,
  resource TEXT NOT NULL,
  access_expires_at TIMESTAMPTZ NOT NULL,
  refresh_expires_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_oauth_tokens_user ON oauth_tokens(user_id);
