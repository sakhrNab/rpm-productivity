-- RPM System Database Schema
-- PostgreSQL 15+

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- CATEGORIES TABLE
-- =====================================================
CREATE TABLE categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(50) NOT NULL,
    description TEXT,
    icon VARCHAR(50) DEFAULT 'target',
    color VARCHAR(7) DEFAULT '#FF69B4',
    cover_image VARCHAR(500),
    sort_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================
-- CATEGORY DETAILS (Big Picture Content)
-- =====================================================
CREATE TABLE category_details (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    category_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    ultimate_vision TEXT,
    roles TEXT,
    ultimate_purpose TEXT,
    one_year_goals TEXT,
    ninety_day_goals TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================
-- PROJECTS TABLE
-- =====================================================
CREATE TABLE projects (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    category_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    name VARCHAR(200) NOT NULL,
    ultimate_result TEXT,
    ultimate_purpose TEXT,
    description TEXT,
    cover_image VARCHAR(500),
    start_date DATE,
    end_date DATE,
    is_completed BOOLEAN DEFAULT false,
    is_starred BOOLEAN DEFAULT false,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================
-- PERSONS TABLE (Accountability Partners)
-- =====================================================
CREATE TABLE persons (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL,
    email VARCHAR(255),
    phone VARCHAR(50),
    avatar VARCHAR(500),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================
-- ACTIONS TABLE
-- =====================================================
CREATE TABLE actions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
    project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
    block_id UUID, -- Will be updated after blocks table is created
    leverage_person_id UUID REFERENCES persons(id) ON DELETE SET NULL,
    title VARCHAR(300) NOT NULL,
    notes TEXT,
    duration_hours INTEGER DEFAULT 0,
    duration_minutes INTEGER DEFAULT 5,
    scheduled_date DATE,
    scheduled_time TIME,
    end_date DATE,
    is_starred BOOLEAN DEFAULT false,
    is_this_week BOOLEAN DEFAULT false,
    is_completed BOOLEAN DEFAULT false,
    completed_at TIMESTAMP WITH TIME ZONE,
    is_cancelled BOOLEAN DEFAULT false,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================
-- RPM BLOCKS TABLE
-- =====================================================
CREATE TABLE rpm_blocks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
    project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
    result_title VARCHAR(300) NOT NULL,
    result_description TEXT,
    purpose TEXT,
    target_date DATE,
    is_completed BOOLEAN DEFAULT false,
    is_in_progress BOOLEAN DEFAULT false,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Add foreign key to actions table for block_id
ALTER TABLE actions 
ADD CONSTRAINT fk_actions_block 
FOREIGN KEY (block_id) REFERENCES rpm_blocks(id) ON DELETE SET NULL;

-- =====================================================
-- KEY RESULTS TABLE
-- =====================================================
CREATE TABLE key_results (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    title VARCHAR(300) NOT NULL,
    description TEXT,
    target_value DECIMAL(15, 2),
    current_value DECIMAL(15, 2) DEFAULT 0,
    unit VARCHAR(50),
    target_date DATE,
    is_starred BOOLEAN DEFAULT false,
    is_completed BOOLEAN DEFAULT false,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================
-- CAPTURE LIST TABLE
-- =====================================================
CREATE TABLE capture_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    title VARCHAR(300) NOT NULL,
    notes TEXT,
    is_processed BOOLEAN DEFAULT false,
    is_starred BOOLEAN DEFAULT false,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================
-- INSPIRATION BOARD TABLE
-- =====================================================
CREATE TABLE inspiration_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    title VARCHAR(200),
    description TEXT,
    image_url VARCHAR(500),
    link_url VARCHAR(500),
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================
-- LEVERAGE REQUESTS TABLE
-- =====================================================
CREATE TABLE leverage_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    action_id UUID REFERENCES actions(id) ON DELETE CASCADE,
    person_id UUID NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
    message TEXT,
    status VARCHAR(20) DEFAULT 'pending', -- pending, accepted, declined
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================
-- INDEXES FOR PERFORMANCE
-- =====================================================
CREATE INDEX idx_projects_category ON projects(category_id);
CREATE INDEX idx_actions_category ON actions(category_id);
CREATE INDEX idx_actions_project ON actions(project_id);
CREATE INDEX idx_actions_block ON actions(block_id);
CREATE INDEX idx_actions_scheduled ON actions(scheduled_date);
CREATE INDEX idx_actions_starred ON actions(is_starred) WHERE is_starred = true;
CREATE INDEX idx_actions_this_week ON actions(is_this_week) WHERE is_this_week = true;
CREATE INDEX idx_rpm_blocks_category ON rpm_blocks(category_id);
CREATE INDEX idx_rpm_blocks_project ON rpm_blocks(project_id);
CREATE INDEX idx_key_results_project ON key_results(project_id);
CREATE INDEX idx_capture_items_project ON capture_items(project_id);

-- =====================================================
-- UPDATE TIMESTAMP TRIGGER
-- =====================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply trigger to all tables
CREATE TRIGGER update_categories_updated_at BEFORE UPDATE ON categories FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_category_details_updated_at BEFORE UPDATE ON category_details FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_projects_updated_at BEFORE UPDATE ON projects FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_persons_updated_at BEFORE UPDATE ON persons FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_actions_updated_at BEFORE UPDATE ON actions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_rpm_blocks_updated_at BEFORE UPDATE ON rpm_blocks FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_key_results_updated_at BEFORE UPDATE ON key_results FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_capture_items_updated_at BEFORE UPDATE ON capture_items FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_inspiration_items_updated_at BEFORE UPDATE ON inspiration_items FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_leverage_requests_updated_at BEFORE UPDATE ON leverage_requests FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- SEED DATA - Default Categories
-- =====================================================
INSERT INTO categories (name, description, icon, color, cover_image, sort_order) VALUES
('3 TO THRIVE', 'Design a life of meaning and growth by focusing on what matters', 'target', '#FF69B4', 'https://images.unsplash.com/photo-1519681393784-d120267933ba?w=800', 1),
('JUICE OF LIFE', 'Have great time and memories with friends and family', 'users', '#6B8DD6', 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800', 2),
('UNFORGETTABLE ECSTATIC LIFE', 'Have a life full of enjoyment, memorable experiences', 'star', '#64B5F6', 'https://images.unsplash.com/photo-1475274047050-1d0c0975c63e?w=800', 3),
('ABSOLUTE FINANCIAL FREEDOM', 'Living the life that I desire with all the leisures', 'dollar-sign', '#4DD0E1', 'https://images.unsplash.com/photo-1483728642387-6c3bdd6c93e5?w=800', 4),
('THE ULTIMATE LOVER', 'Create an intimate relationship that fulfills me', 'heart', '#9575CD', 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=800', 5),
('WORLD CLASS WELL BEING', 'Be healthy and energetic with a great attractive body', 'activity', '#4DB6AC', 'https://images.unsplash.com/photo-1454496522488-7a8e488e8606?w=800', 6),
('ROOTS OF LIFE', 'To be connected and loving with everyone', 'home', '#7986CB', 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=800', 7),
('RESULTS CREATING MACHINE', 'Support anyone to achieve any goal', 'zap', '#81C784', 'https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=800', 8),
('CAPTURE', 'Quick capture for ideas and tasks', 'inbox', '#FFB74D', 'https://images.unsplash.com/photo-1501785888041-af3ef285b470?w=800', 9);

-- Create category details for each category
INSERT INTO category_details (category_id, ultimate_vision, roles, ultimate_purpose, one_year_goals, ninety_day_goals)
SELECT id, 
    'Design a life of meaning and growth by focusing on what matters',
    'Tony Robbins Results Master, Creating Machine, Laser Focus, Energy Dynamo, Results Creating Machine, Life Creator, Financial Wise, Money Magnet, Genius Investor',
    'Create the life I want. Grow and support others. Have the life I want to inspire others. Enjoy life on another level.',
    'Financial Independence: Get 5k euro monthly as passive income. Renowned speaker in the Arabic World: Have a talk every week in an Arabic country for 5k dollars each. Create a passionate trustful loving relationship: Marry the partner with whom I can start this a relationship and have children.',
    'Reach 85k Financially. Collect 400k For RTI: Invest 30k and save 5k. Find a solution for mom and Tota.'
FROM categories WHERE name = '3 TO THRIVE';

-- Insert sample project
INSERT INTO projects (category_id, name, ultimate_result, ultimate_purpose, cover_image)
SELECT c.id, 'SUPPORT THE ROOTS', 'Make sure that my family are have extraordinary life', 'I need to take care of my family', 'https://images.unsplash.com/photo-1475274047050-1d0c0975c63e?w=800'
FROM categories c WHERE c.name = 'ROOTS OF LIFE';

-- Insert sample key results
INSERT INTO key_results (project_id, title, target_date, sort_order)
SELECT p.id, 'Radically fix this is a problem', NULL, 1
FROM projects p WHERE p.name = 'SUPPORT THE ROOTS';

INSERT INTO key_results (project_id, title, target_date, sort_order)
SELECT p.id, 'Have a Living paid', NULL, 2
FROM projects p WHERE p.name = 'SUPPORT THE ROOTS';

INSERT INTO key_results (project_id, title, target_date, sort_order)
SELECT p.id, 'Support her to make her', NULL, 3
FROM projects p WHERE p.name = 'SUPPORT THE ROOTS';

-- Insert sample capture items
INSERT INTO capture_items (project_id, title, sort_order)
SELECT p.id, 'future piece her', 1
FROM projects p WHERE p.name = 'SUPPORT THE ROOTS';

INSERT INTO capture_items (project_id, title, sort_order)
SELECT p.id, 'Take her to the doctors', 2
FROM projects p WHERE p.name = 'SUPPORT THE ROOTS';

INSERT INTO capture_items (project_id, title, sort_order)
SELECT p.id, 'Perform her how important is the operation', 3
FROM projects p WHERE p.name = 'SUPPORT THE ROOTS';

INSERT INTO capture_items (project_id, title, sort_order)
SELECT p.id, 'be with her', 4
FROM projects p WHERE p.name = 'SUPPORT THE ROOTS';

-- Insert sample RPM block
INSERT INTO rpm_blocks (category_id, project_id, result_title, purpose, sort_order)
SELECT c.id, p.id, 'Have 10 options for Tota and Mama', 
    'My mom is getting older, I need to find a solution for her otherwise it will be too late. Tota is 26 if she does not change now when would she. She needs to see her life and enjoy it!',
    1
FROM categories c, projects p WHERE c.name = '3 TO THRIVE' AND p.name = 'SUPPORT THE ROOTS';

-- Insert sample actions for the RPM block
INSERT INTO actions (category_id, project_id, block_id, title, duration_hours, duration_minutes, sort_order)
SELECT c.id, p.id, b.id, 'Discuss those 3 with Abadi', 0, 30, 1
FROM categories c, projects p, rpm_blocks b 
WHERE c.name = '3 TO THRIVE' AND p.name = 'SUPPORT THE ROOTS' AND b.result_title = 'Have 10 options for Tota and Mama';

INSERT INTO actions (category_id, project_id, block_id, title, duration_hours, duration_minutes, sort_order)
SELECT c.id, p.id, b.id, 'Shortlist them onto 3', 0, 45, 2
FROM categories c, projects p, rpm_blocks b 
WHERE c.name = '3 TO THRIVE' AND p.name = 'SUPPORT THE ROOTS' AND b.result_title = 'Have 10 options for Tota and Mama';

INSERT INTO actions (category_id, project_id, block_id, title, duration_hours, duration_minutes, sort_order)
SELECT c.id, p.id, b.id, 'Find 10 options', 1, 0, 3
FROM categories c, projects p, rpm_blocks b 
WHERE c.name = '3 TO THRIVE' AND p.name = 'SUPPORT THE ROOTS' AND b.result_title = 'Have 10 options for Tota and Mama';

-- Insert more sample projects
INSERT INTO projects (category_id, name, ultimate_result, ultimate_purpose, cover_image)
SELECT c.id, 'CREATE 65.5K/ 85K € UNTIL 31.12', 'Be free and spontaneous with power: Travel spontaneously where I want, buy what I want, give my...', 'Achieve financial freedom milestone', 'https://images.unsplash.com/photo-1519681393784-d120267933ba?w=800'
FROM categories c WHERE c.name = 'ABSOLUTE FINANCIAL FREEDOM';

INSERT INTO projects (category_id, name, ultimate_result, ultimate_purpose, cover_image)
SELECT c.id, 'CASH COLLECT 312K/400K', 'Learn the best techniques and skills need to be a mentor. Get the title of being a m...', 'Build wealth systematically', 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800'
FROM categories c WHERE c.name = 'ABSOLUTE FINANCIAL FREEDOM';

INSERT INTO projects (category_id, name, ultimate_result, ultimate_purpose, cover_image)
SELECT c.id, 'URGENT RPMS', 'Keep growing beside the 3 major goals', 'Stay focused on priorities', 'https://images.unsplash.com/photo-1475274047050-1d0c0975c63e?w=800'
FROM categories c WHERE c.name = '3 TO THRIVE';

-- =====================================================
-- VIEWS FOR COMMON QUERIES
-- =====================================================

-- View for actions with all related data
CREATE VIEW v_actions_full AS
SELECT 
    a.*,
    c.name as category_name,
    c.color as category_color,
    c.icon as category_icon,
    p.name as project_name,
    b.result_title as block_result,
    per.name as leverage_person_name
FROM actions a
LEFT JOIN categories c ON a.category_id = c.id
LEFT JOIN projects p ON a.project_id = p.id
LEFT JOIN rpm_blocks b ON a.block_id = b.id
LEFT JOIN persons per ON a.leverage_person_id = per.id;

-- View for RPM blocks with completion stats
CREATE VIEW v_rpm_blocks_stats AS
SELECT 
    b.*,
    c.name as category_name,
    c.color as category_color,
    p.name as project_name,
    COUNT(a.id) as total_actions,
    COUNT(CASE WHEN a.is_completed THEN 1 END) as completed_actions
FROM rpm_blocks b
LEFT JOIN categories c ON b.category_id = c.id
LEFT JOIN projects p ON b.project_id = p.id
LEFT JOIN actions a ON a.block_id = b.id
GROUP BY b.id, c.name, c.color, p.name;

-- View for projects with stats
CREATE VIEW v_projects_stats AS
SELECT 
    p.*,
    c.name as category_name,
    c.color as category_color,
    c.icon as category_icon,
    COUNT(DISTINCT a.id) as total_actions,
    COUNT(DISTINCT CASE WHEN a.is_completed THEN a.id END) as completed_actions,
    COUNT(DISTINCT kr.id) as total_key_results,
    COUNT(DISTINCT CASE WHEN kr.is_completed THEN kr.id END) as completed_key_results,
    COUNT(DISTINCT rb.id) as total_blocks
FROM projects p
LEFT JOIN categories c ON p.category_id = c.id
LEFT JOIN actions a ON a.project_id = p.id
LEFT JOIN key_results kr ON kr.project_id = p.id
LEFT JOIN rpm_blocks rb ON rb.project_id = p.id
GROUP BY p.id, c.name, c.color, c.icon;

COMMENT ON TABLE categories IS 'Main life categories for organizing goals and actions';
COMMENT ON TABLE projects IS 'Projects belonging to categories with specific outcomes';
COMMENT ON TABLE actions IS 'Individual tasks and actions to be completed';
COMMENT ON TABLE rpm_blocks IS 'RPM planning blocks with Result, Purpose, Massive Action Plan';
COMMENT ON TABLE key_results IS 'Measurable key results for projects';
COMMENT ON TABLE capture_items IS 'Quick capture list items for processing';
COMMENT ON TABLE persons IS 'Accountability partners and leverage persons';
