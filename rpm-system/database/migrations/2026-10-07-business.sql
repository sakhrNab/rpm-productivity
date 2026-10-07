-- Business module (per-user revenue cockpit). Added 2026-10-07.
-- Idempotent: safe to run more than once. init.sql carries the same statements for fresh databases.
-- Tasks, goals and dates stay in RPM projects / key results / actions; these tables only LINK to them.

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- One row per user: which RPM project is the business goal, which key result holds the cash number.
CREATE TABLE IF NOT EXISTS biz_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    goal_project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
    cash_kr_id UUID REFERENCES key_results(id) ON DELETE SET NULL,
    deadline DATE,
    currency VARCHAR(8) NOT NULL DEFAULT 'EUR',
    revenue_model JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_biz_settings_user ON biz_settings(user_id);

CREATE TABLE IF NOT EXISTS biz_leads (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(200) NOT NULL,
    source VARCHAR(120) NOT NULL DEFAULT '',
    why TEXT NOT NULL DEFAULT '',
    offer VARCHAR(200) NOT NULL DEFAULT '',
    stage VARCHAR(20) NOT NULL DEFAULT 'identified'
        CHECK (stage IN ('identified', 'contacted', 'replied', 'call', 'pilot', 'paid', 'lost')),
    next_step TEXT NOT NULL DEFAULT '',
    next_contact DATE,
    fit SMALLINT NOT NULL DEFAULT 2 CHECK (fit BETWEEN 1 AND 3),
    notes TEXT NOT NULL DEFAULT '',
    action_id UUID REFERENCES actions(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_biz_leads_user ON biz_leads(user_id);

CREATE TABLE IF NOT EXISTS biz_results (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(20) NOT NULL
        CHECK (type IN ('dm_sent', 'proposal', 'reply', 'call', 'delivered', 'case_study', 'won', 'lost', 'content', 'note')),
    channel VARCHAR(40) NOT NULL DEFAULT '',
    lead_id UUID REFERENCES biz_leads(id) ON DELETE SET NULL,
    count INTEGER NOT NULL DEFAULT 1 CHECK (count BETWEEN 1 AND 10000),
    value_eur NUMERIC(12, 2),
    views INTEGER,
    note TEXT NOT NULL DEFAULT '',
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_biz_results_user ON biz_results(user_id, date DESC);

CREATE TABLE IF NOT EXISTS biz_offers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(200) NOT NULL,
    tagline TEXT NOT NULL DEFAULT '',
    for_who TEXT NOT NULL DEFAULT '',
    product VARCHAR(200) NOT NULL DEFAULT '',
    readiness VARCHAR(10) NOT NULL DEFAULT 'warn' CHECK (readiness IN ('ok', 'warn', 'bad', 'info')),
    readiness_note TEXT NOT NULL DEFAULT '',
    value JSONB NOT NULL DEFAULT '{}'::jsonb,
    ladder JSONB NOT NULL DEFAULT '[]'::jsonb,
    guarantee TEXT NOT NULL DEFAULT '',
    bonuses JSONB NOT NULL DEFAULT '[]'::jsonb,
    scarcity TEXT NOT NULL DEFAULT '',
    deliverables JSONB NOT NULL DEFAULT '[]'::jsonb,
    first_line TEXT NOT NULL DEFAULT '',
    qualify TEXT NOT NULL DEFAULT '',
    weak_spots JSONB NOT NULL DEFAULT '[]'::jsonb,
    sort INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_biz_offers_user ON biz_offers(user_id);

CREATE TABLE IF NOT EXISTS biz_products (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(200) NOT NULL,
    what TEXT NOT NULL DEFAULT '',
    role VARCHAR(20) NOT NULL DEFAULT 'paid',
    promised BOOLEAN NOT NULL DEFAULT false,
    status TEXT NOT NULL DEFAULT '',
    price VARCHAR(200) NOT NULL DEFAULT '',
    blocker TEXT NOT NULL DEFAULT '',
    next_step TEXT NOT NULL DEFAULT '',
    next_date DATE,
    repo VARCHAR(200) NOT NULL DEFAULT '',
    sort INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_biz_products_user ON biz_products(user_id);

CREATE TABLE IF NOT EXISTS biz_channels (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(200) NOT NULL,
    stat VARCHAR(300) NOT NULL DEFAULT '',
    audience TEXT NOT NULL DEFAULT '',
    verdict TEXT NOT NULL DEFAULT '',
    tone VARCHAR(10) NOT NULL DEFAULT 'info' CHECK (tone IN ('ok', 'warn', 'bad', 'info')),
    gaps JSONB NOT NULL DEFAULT '[]'::jsonb,
    moves JSONB NOT NULL DEFAULT '[]'::jsonb,
    sort INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_biz_channels_user ON biz_channels(user_id);

CREATE TABLE IF NOT EXISTS biz_fixes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    severity VARCHAR(2) NOT NULL DEFAULT 'P1' CHECK (severity IN ('P0', 'P1', 'P2')),
    text VARCHAR(500) NOT NULL,
    detail TEXT NOT NULL DEFAULT '',
    effort VARCHAR(40) NOT NULL DEFAULT '',
    done BOOLEAN NOT NULL DEFAULT false,
    action_id UUID REFERENCES actions(id) ON DELETE SET NULL,
    sort INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_biz_fixes_user ON biz_fixes(user_id);

CREATE TABLE IF NOT EXISTS biz_docs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    path VARCHAR(500) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'current' CHECK (status IN ('current', 'superseded', 'obsolete', 'archive')),
    note TEXT NOT NULL DEFAULT '',
    date DATE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_biz_docs_user ON biz_docs(user_id);

CREATE TABLE IF NOT EXISTS biz_content (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    date DATE,
    platform VARCHAR(60) NOT NULL DEFAULT '',
    title VARCHAR(300) NOT NULL,
    goal VARCHAR(20) NOT NULL DEFAULT '',
    hook TEXT NOT NULL DEFAULT '',
    status VARCHAR(20) NOT NULL DEFAULT 'idea' CHECK (status IN ('idea', 'draft', 'ready', 'published')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_biz_content_user ON biz_content(user_id, date);

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['biz_settings', 'biz_leads', 'biz_results', 'biz_offers', 'biz_products', 'biz_channels', 'biz_fixes', 'biz_docs', 'biz_content'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_' || t || '_updated_at') THEN
      EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()', 'update_' || t || '_updated_at', t);
    END IF;
  END LOOP;
END $$;
