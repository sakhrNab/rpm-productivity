require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const MicrosoftStrategy = require('passport-microsoft').Strategy;
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3013;
app.set('trust proxy', 1);
// JWT Secret
const JWT_SECRET = process.env.JWT_SECRET || 'rpm-system-jwt-secret-key-change-in-production-2024';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'rpm-system-refresh-secret-key-2024';
const JWT_EXPIRES_IN = '1h';

// OAuth Configuration
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
const MICROSOFT_CLIENT_ID = process.env.MICROSOFT_CLIENT_ID || '';
const MICROSOFT_CLIENT_SECRET = process.env.MICROSOFT_CLIENT_SECRET || '';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3012';
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3013';

// Database connection
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Middleware
app.use(cors({ origin: FRONTEND_URL, credentials: true }));
app.use(express.json());
app.use(passport.initialize());
app.use('/uploads', express.static('uploads'));

if (!fs.existsSync('uploads')) fs.mkdirSync('uploads', { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});
const upload = multer({ storage });

// JWT Helper
const generateTokens = (user) => ({
  accessToken: jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN }),
  refreshToken: jwt.sign({ userId: user.id }, JWT_REFRESH_SECRET, { expiresIn: '7d' })
});

// Auth Middleware
const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Access token required' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.userId = decoded.userId;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') return res.status(401).json({ error: 'Token expired', code: 'TOKEN_EXPIRED' });
    return res.status(403).json({ error: 'Invalid token' });
  }
};

// Passport Strategies
if (GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET) {
  passport.use(new GoogleStrategy({
    clientID: GOOGLE_CLIENT_ID,
    clientSecret: GOOGLE_CLIENT_SECRET,
    callbackURL: `${BACKEND_URL}/api/auth/google/callback`
  }, async (accessToken, refreshToken, profile, done) => {
    try {
      let result = await pool.query('SELECT * FROM users WHERE provider = $1 AND provider_id = $2', ['google', profile.id]);
      let user;
      if (result.rows.length === 0) {
        result = await pool.query('SELECT * FROM users WHERE email = $1', [profile.emails[0].value]);
        if (result.rows.length > 0) {
          user = result.rows[0];
          await pool.query('UPDATE users SET provider = $1, provider_id = $2 WHERE id = $3', ['google', profile.id, user.id]);
        } else {
          result = await pool.query(
            `INSERT INTO users (email, name, avatar, provider, provider_id, email_verified) VALUES ($1, $2, $3, 'google', $4, true) RETURNING *`,
            [profile.emails[0].value, profile.displayName, profile.photos?.[0]?.value || '', profile.id]
          );
          user = result.rows[0];
          await pool.query('SELECT create_default_categories_for_user($1)', [user.id]);
        }
      } else {
        user = result.rows[0];
      }
      done(null, user);
    } catch (error) { done(error, null); }
  }));
}

if (MICROSOFT_CLIENT_ID && MICROSOFT_CLIENT_SECRET) {
  passport.use(new MicrosoftStrategy({
    clientID: MICROSOFT_CLIENT_ID,
    clientSecret: MICROSOFT_CLIENT_SECRET,
    callbackURL: `${BACKEND_URL}/api/auth/microsoft/callback`,
    scope: ['user.read']
  }, async (accessToken, refreshToken, profile, done) => {
    try {
      let result = await pool.query('SELECT * FROM users WHERE provider = $1 AND provider_id = $2', ['microsoft', profile.id]);
      let user;
      if (result.rows.length === 0) {
        result = await pool.query('SELECT * FROM users WHERE email = $1', [profile.emails[0].value]);
        if (result.rows.length > 0) {
          user = result.rows[0];
          await pool.query('UPDATE users SET provider = $1, provider_id = $2 WHERE id = $3', ['microsoft', profile.id, user.id]);
        } else {
          result = await pool.query(
            `INSERT INTO users (email, name, avatar, provider, provider_id, email_verified) VALUES ($1, $2, $3, 'microsoft', $4, true) RETURNING *`,
            [profile.emails[0].value, profile.displayName, '', profile.id]
          );
          user = result.rows[0];
          await pool.query('SELECT create_default_categories_for_user($1)', [user.id]);
        }
      } else {
        user = result.rows[0];
      }
      done(null, user);
    } catch (error) { done(error, null); }
  }));
}

// AUTH ROUTES
app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password, name } = req.body;
    if (!email || !password || !name) return res.status(400).json({ error: 'Email, password, and name are required' });
    if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
    
    const existingUser = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existingUser.rows.length > 0) return res.status(400).json({ error: 'Email already registered' });
    
    const passwordHash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      `INSERT INTO users (email, password_hash, name, provider) VALUES ($1, $2, $3, 'local') RETURNING id, email, name, avatar`,
      [email, passwordHash, name]
    );
    const user = result.rows[0];
    await pool.query('SELECT create_default_categories_for_user($1)', [user.id]);
    
    const { accessToken, refreshToken } = generateTokens(user);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await pool.query('INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)', [user.id, refreshToken, expiresAt]);
    
    res.status(201).json({ user, accessToken, refreshToken });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });
    
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (result.rows.length === 0) return res.status(401).json({ error: 'Invalid email or password' });
    
    const user = result.rows[0];
    if (!user.password_hash) return res.status(401).json({ error: 'This account uses social login' });
    
    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) return res.status(401).json({ error: 'Invalid email or password' });
    
    const { accessToken, refreshToken } = generateTokens(user);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await pool.query('INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)', [user.id, refreshToken, expiresAt]);
    
    res.json({ user: { id: user.id, email: user.email, name: user.name, avatar: user.avatar }, accessToken, refreshToken });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

app.post('/api/auth/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) return res.status(400).json({ error: 'Refresh token required' });
    
    let decoded;
    try { decoded = jwt.verify(refreshToken, JWT_REFRESH_SECRET); }
    catch (error) { return res.status(401).json({ error: 'Invalid refresh token' }); }
    
    const tokenResult = await pool.query('SELECT * FROM refresh_tokens WHERE token = $1 AND user_id = $2 AND expires_at > NOW()', [refreshToken, decoded.userId]);
    if (tokenResult.rows.length === 0) return res.status(401).json({ error: 'Refresh token expired or invalid' });
    
    const userResult = await pool.query('SELECT * FROM users WHERE id = $1', [decoded.userId]);
    if (userResult.rows.length === 0) return res.status(401).json({ error: 'User not found' });
    
    const tokens = generateTokens(userResult.rows[0]);
    await pool.query('DELETE FROM refresh_tokens WHERE token = $1', [refreshToken]);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await pool.query('INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)', [decoded.userId, tokens.refreshToken, expiresAt]);
    
    res.json(tokens);
  } catch (error) {
    console.error('Refresh error:', error);
    res.status(500).json({ error: 'Token refresh failed' });
  }
});

app.post('/api/auth/logout', authenticateToken, async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (refreshToken) await pool.query('DELETE FROM refresh_tokens WHERE token = $1', [refreshToken]);
    res.json({ success: true });
  } catch (error) { res.status(500).json({ error: 'Logout failed' }); }
});

app.get('/api/auth/me', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT id, email, name, avatar, provider, created_at FROM users WHERE id = $1', [req.userId]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    res.json(result.rows[0]);
  } catch (error) { res.status(500).json({ error: 'Failed to get user' }); }
});

app.put('/api/auth/me', authenticateToken, async (req, res) => {
  try {
    const { name, avatar } = req.body;
    const result = await pool.query('UPDATE users SET name = COALESCE($1, name), avatar = COALESCE($2, avatar) WHERE id = $3 RETURNING id, email, name, avatar', [name, avatar, req.userId]);
    res.json(result.rows[0]);
  } catch (error) { res.status(500).json({ error: 'Failed to update user' }); }
});

app.get('/api/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));
app.get('/api/auth/google/callback', passport.authenticate('google', { session: false, failureRedirect: `${FRONTEND_URL}/login?error=google_failed` }), async (req, res) => {
  try {
    const { accessToken, refreshToken } = generateTokens(req.user);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await pool.query('INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)', [req.user.id, refreshToken, expiresAt]);
    res.redirect(`${FRONTEND_URL}/auth/callback?accessToken=${accessToken}&refreshToken=${refreshToken}`);
  } catch (error) { res.redirect(`${FRONTEND_URL}/login?error=google_failed`); }
});

app.get('/api/auth/microsoft', passport.authenticate('microsoft', { scope: ['user.read'] }));
app.get('/api/auth/microsoft/callback', passport.authenticate('microsoft', { session: false, failureRedirect: `${FRONTEND_URL}/login?error=microsoft_failed` }), async (req, res) => {
  try {
    const { accessToken, refreshToken } = generateTokens(req.user);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await pool.query('INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)', [req.user.id, refreshToken, expiresAt]);
    res.redirect(`${FRONTEND_URL}/auth/callback?accessToken=${accessToken}&refreshToken=${refreshToken}`);
  } catch (error) { res.redirect(`${FRONTEND_URL}/login?error=microsoft_failed`); }
});

// CATEGORIES
app.get('/api/categories', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM categories WHERE user_id = $1 AND is_active = true ORDER BY sort_order', [req.userId]);
    res.json(result.rows);
  } catch (error) { res.status(500).json({ error: 'Failed to fetch categories' }); }
});

app.get('/api/categories/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    if (!req.userId) {
      console.error('req.userId is missing');
      return res.status(401).json({ error: 'User not authenticated' });
    }
    console.log('Fetching category:', id, 'for user:', req.userId);
    const categoryResult = await pool.query('SELECT * FROM categories WHERE id = $1 AND user_id = $2', [id, req.userId]);
    if (categoryResult.rows.length === 0) return res.status(404).json({ error: 'Category not found' });
    const detailsResult = await pool.query('SELECT * FROM category_details WHERE category_id = $1', [id]);
    console.log('Fetching projects for category:', id, 'user:', req.userId);
    const projectsResult = await pool.query('SELECT * FROM v_projects_stats WHERE category_id = $1 AND user_id = $2 ORDER BY sort_order', [id, req.userId]);
    res.json({ ...categoryResult.rows[0], details: detailsResult.rows[0] || null, projects: projectsResult.rows });
  } catch (error) {
    console.error('Error fetching category:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ error: 'Failed to fetch category', details: process.env.NODE_ENV !== 'production' ? error.message : undefined });
  }
});

app.post('/api/categories', authenticateToken, async (req, res) => {
  try {
    const { name, description, icon, color, cover_image } = req.body;
    const result = await pool.query(
      `INSERT INTO categories (user_id, name, description, icon, color, cover_image, sort_order) VALUES ($1, $2, $3, $4, $5, $6, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM categories WHERE user_id = $1)) RETURNING *`,
      [req.userId, name, description || '', icon || 'target', color || '#FF69B4', cover_image || '']
    );
    await pool.query('INSERT INTO category_details (category_id) VALUES ($1)', [result.rows[0].id]);
    res.status(201).json(result.rows[0]);
  } catch (error) { res.status(500).json({ error: 'Failed to create category' }); }
});

app.put('/api/categories/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, icon, color, cover_image } = req.body;
    const result = await pool.query('UPDATE categories SET name = $1, description = $2, icon = $3, color = $4, cover_image = $5 WHERE id = $6 AND user_id = $7 RETURNING *', [name, description, icon, color, cover_image, id, req.userId]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Category not found' });
    res.json(result.rows[0]);
  } catch (error) { res.status(500).json({ error: 'Failed to update category' }); }
});

app.put('/api/categories/:id/details', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { ultimate_vision, roles, ultimate_purpose, one_year_goals, ninety_day_goals } = req.body;
    const catCheck = await pool.query('SELECT id FROM categories WHERE id = $1 AND user_id = $2', [id, req.userId]);
    if (catCheck.rows.length === 0) return res.status(404).json({ error: 'Category not found' });
    const existing = await pool.query('SELECT id FROM category_details WHERE category_id = $1', [id]);
    let result;
    if (existing.rows.length > 0) {
      result = await pool.query('UPDATE category_details SET ultimate_vision = $1, roles = $2, ultimate_purpose = $3, one_year_goals = $4, ninety_day_goals = $5 WHERE category_id = $6 RETURNING *', [ultimate_vision, roles, ultimate_purpose, one_year_goals, ninety_day_goals, id]);
    } else {
      result = await pool.query('INSERT INTO category_details (category_id, ultimate_vision, roles, ultimate_purpose, one_year_goals, ninety_day_goals) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *', [id, ultimate_vision, roles, ultimate_purpose, one_year_goals, ninety_day_goals]);
    }
    res.json(result.rows[0]);
  } catch (error) { res.status(500).json({ error: 'Failed to update category details' }); }
});

app.delete('/api/categories/:id', authenticateToken, async (req, res) => {
  try {
    await pool.query('UPDATE categories SET is_active = false WHERE id = $1 AND user_id = $2', [req.params.id, req.userId]);
    res.json({ success: true });
  } catch (error) { res.status(500).json({ error: 'Failed to delete category' }); }
});

// PROJECTS
app.get('/api/projects', authenticateToken, async (req, res) => {
  try {
    const { category_id, starred } = req.query;
    let query = 'SELECT * FROM v_projects_stats WHERE user_id = $1';
    const params = [req.userId];
    if (category_id) { params.push(category_id); query += ` AND category_id = $${params.length}`; }
    if (starred === 'true') query += ' AND is_starred = true';
    query += ' ORDER BY sort_order';
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) { res.status(500).json({ error: 'Failed to fetch projects' }); }
});

app.get('/api/projects/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const projectResult = await pool.query('SELECT * FROM v_projects_stats WHERE id = $1 AND user_id = $2', [id, req.userId]);
    if (projectResult.rows.length === 0) return res.status(404).json({ error: 'Project not found' });
    const keyResultsResult = await pool.query('SELECT * FROM key_results WHERE project_id = $1 ORDER BY sort_order', [id]);
    const captureResult = await pool.query('SELECT * FROM capture_items WHERE project_id = $1 ORDER BY sort_order', [id]);
    const blocksResult = await pool.query('SELECT * FROM v_rpm_blocks_stats WHERE project_id = $1 ORDER BY sort_order', [id]);
    for (let block of blocksResult.rows) {
      const actionsResult = await pool.query('SELECT * FROM v_actions_full WHERE block_id = $1 ORDER BY sort_order', [block.id]);
      block.actions = actionsResult.rows;
    }
    const actionsResult = await pool.query('SELECT * FROM v_actions_full WHERE project_id = $1 ORDER BY sort_order', [id]);
    const inspirationResult = await pool.query('SELECT * FROM inspiration_items WHERE project_id = $1 ORDER BY sort_order', [id]);
    res.json({ ...projectResult.rows[0], key_results: keyResultsResult.rows, capture_items: captureResult.rows, rpm_blocks: blocksResult.rows, actions: actionsResult.rows, inspiration_items: inspirationResult.rows });
  } catch (error) { res.status(500).json({ error: 'Failed to fetch project' }); }
});

app.post('/api/projects', authenticateToken, async (req, res) => {
  try {
    const { category_id, name, ultimate_result, ultimate_purpose, description, cover_image, start_date, end_date } = req.body;
    const catCheck = await pool.query('SELECT id FROM categories WHERE id = $1 AND user_id = $2', [category_id, req.userId]);
    if (catCheck.rows.length === 0) return res.status(400).json({ error: 'Invalid category' });
    const result = await pool.query(
      `INSERT INTO projects (user_id, category_id, name, ultimate_result, ultimate_purpose, description, cover_image, start_date, end_date, sort_order) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM projects WHERE category_id = $2)) RETURNING *`,
      [req.userId, category_id, name, ultimate_result || '', ultimate_purpose || '', description || '', cover_image || '', start_date || null, end_date || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) { res.status(500).json({ error: 'Failed to create project' }); }
});

app.put('/api/projects/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, ultimate_result, ultimate_purpose, description, cover_image, start_date, end_date, is_starred, is_completed } = req.body;
    const result = await pool.query(
      `UPDATE projects SET name = COALESCE($1, name), ultimate_result = COALESCE($2, ultimate_result), ultimate_purpose = COALESCE($3, ultimate_purpose), description = COALESCE($4, description), cover_image = COALESCE($5, cover_image), start_date = COALESCE($6, start_date), end_date = COALESCE($7, end_date), is_starred = COALESCE($8, is_starred), is_completed = COALESCE($9, is_completed) WHERE id = $10 AND user_id = $11 RETURNING *`,
      [name, ultimate_result, ultimate_purpose, description, cover_image, start_date, end_date, is_starred, is_completed, id, req.userId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Project not found' });
    res.json(result.rows[0]);
  } catch (error) { res.status(500).json({ error: 'Failed to update project' }); }
});

app.delete('/api/projects/:id', authenticateToken, async (req, res) => {
  try { await pool.query('DELETE FROM projects WHERE id = $1 AND user_id = $2', [req.params.id, req.userId]); res.json({ success: true }); }
  catch (error) { res.status(500).json({ error: 'Failed to delete project' }); }
});

// ACTIONS
app.get('/api/actions', authenticateToken, async (req, res) => {
  try {
    const { category_id, project_id, block_id, starred, this_week, completed } = req.query;
    let query = 'SELECT * FROM v_actions_full WHERE user_id = $1';
    const params = [req.userId];
    if (category_id) { params.push(category_id); query += ` AND category_id = $${params.length}`; }
    if (project_id) { params.push(project_id); query += ` AND project_id = $${params.length}`; }
    if (block_id) { params.push(block_id); query += ` AND block_id = $${params.length}`; }
    if (starred === 'true') query += ' AND is_starred = true';
    if (this_week === 'true') query += ' AND is_this_week = true';
    if (completed === 'true') query += ' AND is_completed = true';
    else if (completed === 'false') query += ' AND is_completed = false';
    query += ' ORDER BY sort_order';
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) { res.status(500).json({ error: 'Failed to fetch actions' }); }
});

app.get('/api/actions/:id', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM v_actions_full WHERE id = $1 AND user_id = $2', [req.params.id, req.userId]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Action not found' });
    res.json(result.rows[0]);
  } catch (error) { res.status(500).json({ error: 'Failed to fetch action' }); }
});

app.post('/api/actions', authenticateToken, async (req, res) => {
  try {
    const { category_id, project_id, block_id, leverage_person_id, title, notes, duration_hours, duration_minutes, scheduled_date, scheduled_time, end_date, is_starred, is_this_week } = req.body;
    const result = await pool.query(
      `INSERT INTO actions (user_id, category_id, project_id, block_id, leverage_person_id, title, notes, duration_hours, duration_minutes, scheduled_date, scheduled_time, end_date, is_starred, is_this_week, sort_order) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM actions WHERE user_id = $1)) RETURNING *`,
      [req.userId, category_id || null, project_id || null, block_id || null, leverage_person_id || null, title, notes || '', duration_hours || 0, duration_minutes || 5, scheduled_date || null, scheduled_time || null, end_date || null, is_starred || false, is_this_week || false]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) { res.status(500).json({ error: 'Failed to create action' }); }
});

app.put('/api/actions/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    const fields = [], values = [];
    let paramCount = 1;
    const allowedFields = ['category_id', 'project_id', 'block_id', 'leverage_person_id', 'title', 'notes', 'duration_hours', 'duration_minutes', 'scheduled_date', 'scheduled_time', 'end_date', 'is_starred', 'is_this_week', 'is_completed', 'is_cancelled', 'sort_order'];
    for (const [key, value] of Object.entries(updates)) {
      if (allowedFields.includes(key)) { fields.push(`${key} = $${paramCount}`); values.push(value); paramCount++; }
    }
    if (updates.is_completed === true) fields.push(`completed_at = CURRENT_TIMESTAMP`);
    if (fields.length === 0) return res.status(400).json({ error: 'No valid fields to update' });
    values.push(id, req.userId);
    const result = await pool.query(`UPDATE actions SET ${fields.join(', ')} WHERE id = $${paramCount} AND user_id = $${paramCount + 1} RETURNING *`, values);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Action not found' });
    res.json(result.rows[0]);
  } catch (error) { res.status(500).json({ error: 'Failed to update action' }); }
});

app.post('/api/actions/:id/duplicate', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      `INSERT INTO actions (user_id, category_id, project_id, block_id, leverage_person_id, title, notes, duration_hours, duration_minutes, scheduled_date, scheduled_time, end_date, is_starred, is_this_week, sort_order) SELECT user_id, category_id, project_id, block_id, leverage_person_id, title || ' (copy)', notes, duration_hours, duration_minutes, scheduled_date, scheduled_time, end_date, is_starred, is_this_week, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM actions WHERE user_id = $2) FROM actions WHERE id = $1 AND user_id = $2 RETURNING *`,
      [req.params.id, req.userId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Action not found' });
    res.status(201).json(result.rows[0]);
  } catch (error) { res.status(500).json({ error: 'Failed to duplicate action' }); }
});

app.delete('/api/actions/:id', authenticateToken, async (req, res) => {
  try { await pool.query('DELETE FROM actions WHERE id = $1 AND user_id = $2', [req.params.id, req.userId]); res.json({ success: true }); }
  catch (error) { res.status(500).json({ error: 'Failed to delete action' }); }
});

// BLOCKS
app.get('/api/blocks', authenticateToken, async (req, res) => {
  try {
    const { category_id, project_id } = req.query;
    let query = 'SELECT * FROM v_rpm_blocks_stats WHERE user_id = $1';
    const params = [req.userId];
    if (category_id) { params.push(category_id); query += ` AND category_id = $${params.length}`; }
    if (project_id) { params.push(project_id); query += ` AND project_id = $${params.length}`; }
    query += ' ORDER BY sort_order';
    const result = await pool.query(query, params);
    for (let block of result.rows) {
      const actionsResult = await pool.query('SELECT * FROM v_actions_full WHERE block_id = $1 ORDER BY sort_order', [block.id]);
      block.actions = actionsResult.rows;
    }
    res.json(result.rows);
  } catch (error) { res.status(500).json({ error: 'Failed to fetch blocks' }); }
});

app.get('/api/blocks/:id', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM v_rpm_blocks_stats WHERE id = $1 AND user_id = $2', [req.params.id, req.userId]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Block not found' });
    const actionsResult = await pool.query('SELECT * FROM v_actions_full WHERE block_id = $1 ORDER BY sort_order', [req.params.id]);
    res.json({ ...result.rows[0], actions: actionsResult.rows });
  } catch (error) { res.status(500).json({ error: 'Failed to fetch block' }); }
});

app.post('/api/blocks', authenticateToken, async (req, res) => {
  try {
    const { category_id, project_id, result_title, result_description, purpose, target_date, action_ids } = req.body;
    const result = await pool.query(
      `INSERT INTO rpm_blocks (user_id, category_id, project_id, result_title, result_description, purpose, target_date, sort_order) VALUES ($1, $2, $3, $4, $5, $6, $7, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM rpm_blocks WHERE user_id = $1)) RETURNING *`,
      [req.userId, category_id || null, project_id || null, result_title, result_description || '', purpose || '', target_date || null]
    );
    if (action_ids && action_ids.length > 0) await pool.query('UPDATE actions SET block_id = $1 WHERE id = ANY($2) AND user_id = $3', [result.rows[0].id, action_ids, req.userId]);
    res.status(201).json(result.rows[0]);
  } catch (error) { res.status(500).json({ error: 'Failed to create block' }); }
});

app.put('/api/blocks/:id', authenticateToken, async (req, res) => {
  try {
    const { result_title, result_description, purpose, target_date, is_completed, is_in_progress } = req.body;
    const result = await pool.query(
      `UPDATE rpm_blocks SET result_title = COALESCE($1, result_title), result_description = COALESCE($2, result_description), purpose = COALESCE($3, purpose), target_date = COALESCE($4, target_date), is_completed = COALESCE($5, is_completed), is_in_progress = COALESCE($6, is_in_progress) WHERE id = $7 AND user_id = $8 RETURNING *`,
      [result_title, result_description, purpose, target_date, is_completed, is_in_progress, req.params.id, req.userId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Block not found' });
    res.json(result.rows[0]);
  } catch (error) { res.status(500).json({ error: 'Failed to update block' }); }
});

app.delete('/api/blocks/:id', authenticateToken, async (req, res) => {
  try {
    await pool.query('UPDATE actions SET block_id = NULL WHERE block_id = $1', [req.params.id]);
    await pool.query('DELETE FROM rpm_blocks WHERE id = $1 AND user_id = $2', [req.params.id, req.userId]);
    res.json({ success: true });
  } catch (error) { res.status(500).json({ error: 'Failed to delete block' }); }
});

// KEY RESULTS
app.get('/api/projects/:projectId/key-results', authenticateToken, async (req, res) => {
  try {
    const projectCheck = await pool.query('SELECT id FROM projects WHERE id = $1 AND user_id = $2', [req.params.projectId, req.userId]);
    if (projectCheck.rows.length === 0) return res.status(404).json({ error: 'Project not found' });
    const result = await pool.query('SELECT * FROM key_results WHERE project_id = $1 ORDER BY sort_order', [req.params.projectId]);
    res.json(result.rows);
  } catch (error) { res.status(500).json({ error: 'Failed to fetch key results' }); }
});

app.post('/api/key-results', authenticateToken, async (req, res) => {
  try {
    const { project_id, title, description, target_value, unit, target_date } = req.body;
    const projectCheck = await pool.query('SELECT id FROM projects WHERE id = $1 AND user_id = $2', [project_id, req.userId]);
    if (projectCheck.rows.length === 0) return res.status(400).json({ error: 'Invalid project' });
    const result = await pool.query(
      `INSERT INTO key_results (project_id, title, description, target_value, unit, target_date, sort_order) VALUES ($1, $2, $3, $4, $5, $6, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM key_results WHERE project_id = $1)) RETURNING *`,
      [project_id, title, description || '', target_value || null, unit || '', target_date || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) { res.status(500).json({ error: 'Failed to create key result' }); }
});

app.put('/api/key-results/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    const fields = [];
    const values = [];
    let paramCount = 1;
    const allowedFields = ['title', 'description', 'target_value', 'current_value', 'unit', 'target_date', 'is_starred', 'is_completed'];
    for (const [key, value] of Object.entries(updates)) {
      if (allowedFields.includes(key)) {
        fields.push(`${key} = $${paramCount}`);
        values.push(value);
        paramCount++;
      }
    }
    if (fields.length === 0) return res.status(400).json({ error: 'No valid fields to update' });
    values.push(id, req.userId);
    const result = await pool.query(
      `UPDATE key_results SET ${fields.join(', ')} WHERE id = $${paramCount} AND project_id IN (SELECT id FROM projects WHERE user_id = $${paramCount + 1}) RETURNING *`,
      values
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Key result not found' });
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating key result:', error);
    res.status(500).json({ error: 'Failed to update key result' });
  }
});

app.delete('/api/key-results/:id', authenticateToken, async (req, res) => {
  try {
    const krCheck = await pool.query('SELECT kr.id FROM key_results kr JOIN projects p ON kr.project_id = p.id WHERE kr.id = $1 AND p.user_id = $2', [req.params.id, req.userId]);
    if (krCheck.rows.length === 0) return res.status(404).json({ error: 'Key result not found' });
    await pool.query('DELETE FROM key_results WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (error) { res.status(500).json({ error: 'Failed to delete key result' }); }
});

// CAPTURE ITEMS
app.get('/api/capture-items', authenticateToken, async (req, res) => {
  try {
    const { project_id } = req.query;
    let query = 'SELECT * FROM capture_items WHERE user_id = $1';
    const params = [req.userId];
    if (project_id) { params.push(project_id); query += ` AND project_id = $${params.length}`; }
    query += ' ORDER BY sort_order';
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) { res.status(500).json({ error: 'Failed to fetch capture items' }); }
});

app.post('/api/capture-items', authenticateToken, async (req, res) => {
  try {
    const { project_id, title, notes } = req.body;
    const result = await pool.query(
      `INSERT INTO capture_items (user_id, project_id, title, notes, sort_order) VALUES ($1, $2, $3, $4, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM capture_items WHERE user_id = $1)) RETURNING *`,
      [req.userId, project_id || null, title, notes || '']
    );
    res.status(201).json(result.rows[0]);
  } catch (error) { res.status(500).json({ error: 'Failed to create capture item' }); }
});

app.put('/api/capture-items/:id', authenticateToken, async (req, res) => {
  try {
    const { title, notes, is_processed, is_starred } = req.body;
    const result = await pool.query('UPDATE capture_items SET title = COALESCE($1, title), notes = COALESCE($2, notes), is_processed = COALESCE($3, is_processed), is_starred = COALESCE($4, is_starred) WHERE id = $5 AND user_id = $6 RETURNING *', [title, notes, is_processed, is_starred, req.params.id, req.userId]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Capture item not found' });
    res.json(result.rows[0]);
  } catch (error) { res.status(500).json({ error: 'Failed to update capture item' }); }
});

app.delete('/api/capture-items/:id', authenticateToken, async (req, res) => {
  try { await pool.query('DELETE FROM capture_items WHERE id = $1 AND user_id = $2', [req.params.id, req.userId]); res.json({ success: true }); }
  catch (error) { res.status(500).json({ error: 'Failed to delete capture item' }); }
});

// PERSONS
app.get('/api/persons', authenticateToken, async (req, res) => {
  try { const result = await pool.query('SELECT * FROM persons WHERE user_id = $1 ORDER BY name', [req.userId]); res.json(result.rows); }
  catch (error) { res.status(500).json({ error: 'Failed to fetch persons' }); }
});

app.post('/api/persons', authenticateToken, async (req, res) => {
  try {
    const { name, email, phone, avatar, notes } = req.body;
    const result = await pool.query('INSERT INTO persons (user_id, name, email, phone, avatar, notes) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *', [req.userId, name, email || '', phone || '', avatar || '', notes || '']);
    res.status(201).json(result.rows[0]);
  } catch (error) { res.status(500).json({ error: 'Failed to create person' }); }
});

app.put('/api/persons/:id', authenticateToken, async (req, res) => {
  try {
    const { name, email, phone, avatar, notes } = req.body;
    const result = await pool.query('UPDATE persons SET name = COALESCE($1, name), email = COALESCE($2, email), phone = COALESCE($3, phone), avatar = COALESCE($4, avatar), notes = COALESCE($5, notes) WHERE id = $6 AND user_id = $7 RETURNING *', [name, email, phone, avatar, notes, req.params.id, req.userId]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Person not found' });
    res.json(result.rows[0]);
  } catch (error) { res.status(500).json({ error: 'Failed to update person' }); }
});

app.delete('/api/persons/:id', authenticateToken, async (req, res) => {
  try { await pool.query('DELETE FROM persons WHERE id = $1 AND user_id = $2', [req.params.id, req.userId]); res.json({ success: true }); }
  catch (error) { res.status(500).json({ error: 'Failed to delete person' }); }
});

// PLANNER
app.get('/api/planner', authenticateToken, async (req, res) => {
  try {
    const { start_date, end_date } = req.query;
    const result = await pool.query('SELECT * FROM v_actions_full WHERE user_id = $1 AND scheduled_date >= $2 AND scheduled_date <= $3 ORDER BY scheduled_date, scheduled_time', [req.userId, start_date, end_date]);
    res.json(result.rows);
  } catch (error) { res.status(500).json({ error: 'Failed to fetch planner data' }); }
});

// UPLOAD
app.post('/api/upload', authenticateToken, upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  res.json({ url: `/uploads/${req.file.filename}` });
});

// HEALTH
app.get('/api/health', async (req, res) => {
  try { await pool.query('SELECT 1'); res.json({ status: 'healthy', database: 'connected' }); }
  catch (error) { res.status(500).json({ status: 'unhealthy', database: 'disconnected' }); }
});

app.listen(PORT, () => console.log(`RPM Backend running on port ${PORT}`));
