require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { sendInvitation, sendWelcome, sendContactAdded, sendAccountability } = require('./email');
const aiRegistry = require('./ai/registry');
const aiKeys = require('./ai/keys');
const { isConfigured: aiKeysConfigured } = require('./ai/crypto');
const { runChat, AiError } = require('./ai/service');
const { applyProposal } = require('./ai/tools');
const { runCompass } = require('./ai/coach');
const jwt = require('jsonwebtoken');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const MicrosoftStrategy = require('passport-microsoft').Strategy;
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3015;
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

// Log CORS configuration on startup
console.log('CORS Configuration:');
console.log(`  FRONTEND_URL: ${FRONTEND_URL}`);
console.log(`  BACKEND_URL: ${BACKEND_URL}`);
console.log(`  NODE_ENV: ${process.env.NODE_ENV || 'development'}`);

// Database connection
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Middleware
// Enhanced CORS configuration with explicit OPTIONS handling
app.use(cors({ 
  origin: FRONTEND_URL, // Use simple string origin for reliability
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  preflightContinue: false,
  optionsSuccessStatus: 204
}));

// Explicit OPTIONS handler for all routes (backup for CORS preflight)
// This must be before any route handlers to catch OPTIONS requests early
app.options('*', (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', FRONTEND_URL);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Max-Age', '86400'); // 24 hours
  res.sendStatus(204);
});

// Raised from the 100kb default: cover/inspiration images are stored as base64
// data URIs in JSON bodies (client-compressed to ~500kb, 2mb gives headroom).
app.use(express.json({ limit: '2mb' }));
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
          sendWelcome({ to: user.email, name: user.name, appUrl: FRONTEND_URL }).catch(e => console.error('welcome email:', e));
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
          sendWelcome({ to: user.email, name: user.name, appUrl: FRONTEND_URL }).catch(e => console.error('welcome email:', e));
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
    sendWelcome({ to: user.email, name: user.name, appUrl: FRONTEND_URL }).catch(e => console.error('welcome email:', e));

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

// Reorder categories by an ordered list of ids (drag-and-drop). Defined before
// /:id so "reorder" isn't matched as an id.
app.put('/api/categories/reorder', authenticateToken, async (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: 'ids required' });
    await pool.query(
      `UPDATE categories AS c SET sort_order = v.ord
       FROM (SELECT id, ordinality AS ord FROM unnest($1::uuid[]) WITH ORDINALITY AS t(id, ordinality)) v
       WHERE c.id = v.id AND c.user_id = $2`,
      [ids, req.userId]
    );
    res.json({ success: true });
  } catch (error) { console.error('Failed to reorder categories:', error); res.status(500).json({ error: 'Failed to reorder categories' }); }
});

app.put('/api/categories/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, icon, color, cover_image } = req.body;
    // COALESCE so partial updates (e.g. cover-image only) don't null out other
    // columns — a plain SET made cover uploads violate the name NOT NULL constraint.
    const result = await pool.query(
      `UPDATE categories SET name = COALESCE($1, name), description = COALESCE($2, description), icon = COALESCE($3, icon), color = COALESCE($4, color), cover_image = COALESCE($5, cover_image)
       WHERE id = $6 AND user_id = $7 RETURNING *`,
      [name, description, icon, color, cover_image, id, req.userId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Category not found' });
    res.json(result.rows[0]);
  } catch (error) { console.error('Error updating category:', error); res.status(500).json({ error: 'Failed to update category' }); }
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
    // Hard delete so ON DELETE CASCADE removes children (category_details,
    // projects, key_results, capture_items, inspiration_items)
    await pool.query('DELETE FROM categories WHERE id = $1 AND user_id = $2', [req.params.id, req.userId]);
    res.json({ success: true });
  } catch (error) { res.status(500).json({ error: 'Failed to delete category' }); }
});

// PROJECTS
app.get('/api/projects', authenticateToken, async (req, res) => {
  try {
    const { category_id, starred, archived, include_archived } = req.query;
    let query = 'SELECT * FROM v_projects_stats WHERE user_id = $1';
    const params = [req.userId];
    if (category_id) { params.push(category_id); query += ` AND category_id = $${params.length}`; }
    if (starred === 'true') query += ' AND is_starred = true';
    // Archived projects are hidden by default. Pass ?archived=true for only archived,
    // or ?include_archived=true to return both active and archived together.
    if (archived === 'true') query += ' AND is_archived = true';
    else if (include_archived !== 'true') query += ' AND is_archived = false';
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
    await attachActionsToBlocks(blocksResult.rows);
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

// Reorder projects by an ordered list of ids (drag-and-drop). Before /:id.
app.put('/api/projects/reorder', authenticateToken, async (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: 'ids required' });
    await pool.query(
      `UPDATE projects AS p SET sort_order = v.ord
       FROM (SELECT id, ordinality AS ord FROM unnest($1::uuid[]) WITH ORDINALITY AS t(id, ordinality)) v
       WHERE p.id = v.id AND p.user_id = $2`,
      [ids, req.userId]
    );
    res.json({ success: true });
  } catch (error) { console.error('Failed to reorder projects:', error); res.status(500).json({ error: 'Failed to reorder projects' }); }
});

app.put('/api/projects/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, ultimate_result, ultimate_purpose, description, cover_image, start_date, end_date, is_starred, is_completed, is_archived } = req.body;
    // date columns reject '' — coerce empty strings to NULL
    const startDate = start_date === '' ? null : start_date;
    const endDate = end_date === '' ? null : end_date;
    const result = await pool.query(
      `UPDATE projects SET name = COALESCE($1, name), ultimate_result = COALESCE($2, ultimate_result), ultimate_purpose = COALESCE($3, ultimate_purpose), description = COALESCE($4, description), cover_image = COALESCE($5, cover_image), start_date = COALESCE($6, start_date), end_date = COALESCE($7, end_date), is_starred = COALESCE($8, is_starred), is_completed = COALESCE($9, is_completed), is_archived = COALESCE($10, is_archived) WHERE id = $11 AND user_id = $12 RETURNING *`,
      [name, ultimate_result, ultimate_purpose, description, cover_image, startDate, endDate, is_starred, is_completed, is_archived, id, req.userId]
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
    const { category_id, project_id, block_id, starred, this_week, completed, start_date, end_date } = req.query;
    let query = 'SELECT * FROM v_actions_full WHERE user_id = $1';
    const params = [req.userId];
    if (category_id) { params.push(category_id); query += ` AND category_id = $${params.length}`; }
    if (project_id) { params.push(project_id); query += ` AND project_id = $${params.length}`; }
    if (block_id) { params.push(block_id); query += ` AND block_id = $${params.length}`; }
    if (starred === 'true') query += ' AND is_starred = true';
    // Unified "this week" / date-range filter: an action counts as this week if
    // it is flagged is_this_week OR scheduled within the given date range.
    if (start_date && end_date) {
      params.push(start_date); const s = params.length;
      params.push(end_date); const e = params.length;
      if (this_week === 'true') {
        query += ` AND (is_this_week = true OR (scheduled_date >= $${s} AND scheduled_date <= $${e}))`;
      } else {
        query += ` AND scheduled_date >= $${s} AND scheduled_date <= $${e}`;
      }
    } else if (this_week === 'true') {
      query += ' AND is_this_week = true';
    }
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
    // uuid / date / time / numeric columns reject '' — coerce empty strings to NULL
    const nullableFields = new Set(['category_id', 'project_id', 'block_id', 'leverage_person_id', 'duration_hours', 'duration_minutes', 'scheduled_date', 'scheduled_time', 'end_date', 'sort_order']);
    for (const [key, value] of Object.entries(updates)) {
      if (allowedFields.includes(key)) { fields.push(`${key} = $${paramCount}`); values.push(nullableFields.has(key) && value === '' ? null : value); paramCount++; }
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
// Attach each block's actions using a single batched query (avoids N+1).
async function attachActionsToBlocks(blocks) {
  if (!blocks.length) return blocks;
  const ids = blocks.map(b => b.id);
  const actions = await pool.query(
    'SELECT * FROM v_actions_full WHERE block_id = ANY($1) ORDER BY sort_order',
    [ids]
  );
  const byBlock = {};
  for (const a of actions.rows) (byBlock[a.block_id] ||= []).push(a);
  for (const b of blocks) b.actions = byBlock[b.id] || [];
  return blocks;
}

app.get('/api/blocks', authenticateToken, async (req, res) => {
  try {
    const { category_id, project_id } = req.query;
    let query = 'SELECT * FROM v_rpm_blocks_stats WHERE user_id = $1';
    const params = [req.userId];
    if (category_id) { params.push(category_id); query += ` AND category_id = $${params.length}`; }
    if (project_id) { params.push(project_id); query += ` AND project_id = $${params.length}`; }
    query += ' ORDER BY sort_order';
    const result = await pool.query(query, params);
    await attachActionsToBlocks(result.rows);
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
    const { category_id, project_id, key_result_id, result_title, result_description, purpose, target_date, action_ids } = req.body;
    const result = await pool.query(
      `INSERT INTO rpm_blocks (user_id, category_id, project_id, key_result_id, result_title, result_description, purpose, target_date, sort_order) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM rpm_blocks WHERE user_id = $1)) RETURNING *`,
      [req.userId, category_id || null, project_id || null, key_result_id || null, result_title, result_description || '', purpose || '', target_date || null]
    );
    if (action_ids && action_ids.length > 0) await pool.query('UPDATE actions SET block_id = $1 WHERE id = ANY($2) AND user_id = $3', [result.rows[0].id, action_ids, req.userId]);
    res.status(201).json(result.rows[0]);
  } catch (error) { res.status(500).json({ error: 'Failed to create block' }); }
});

app.put('/api/blocks/:id', authenticateToken, async (req, res) => {
  try {
    const { category_id, project_id, key_result_id, result_title, result_description, purpose, target_date, is_completed, is_in_progress, action_ids } = req.body;
    // the date column rejects '' — coerce empty string to NULL (COALESCE then keeps the existing value)
    const targetDate = target_date === '' ? null : target_date;
    // key_result_id: '' clears the link, a uuid sets it, and undefined (not sent) keeps it
    const keyResultParam = key_result_id === undefined ? '__KEEP__' : (key_result_id || '');
    const result = await pool.query(
      `UPDATE rpm_blocks SET category_id = COALESCE($1, category_id), project_id = COALESCE($2, project_id), result_title = COALESCE($3, result_title), result_description = COALESCE($4, result_description), purpose = COALESCE($5, purpose), target_date = COALESCE($6, target_date), is_completed = COALESCE($7, is_completed), is_in_progress = COALESCE($8, is_in_progress), key_result_id = CASE WHEN $11 = '__KEEP__' THEN key_result_id ELSE NULLIF($11, '')::uuid END WHERE id = $9 AND user_id = $10 RETURNING *`,
      [category_id, project_id, result_title, result_description, purpose, targetDate, is_completed, is_in_progress, req.params.id, req.userId, keyResultParam]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Block not found' });
    // Re-sync which actions belong to this block when action_ids is provided.
    if (Array.isArray(action_ids)) {
      await pool.query('UPDATE actions SET block_id = NULL WHERE block_id = $1 AND user_id = $2', [req.params.id, req.userId]);
      if (action_ids.length > 0) await pool.query('UPDATE actions SET block_id = $1 WHERE id = ANY($2) AND user_id = $3', [req.params.id, action_ids, req.userId]);
    }
    res.json(result.rows[0]);
  } catch (error) { res.status(500).json({ error: 'Failed to update block' }); }
});

app.delete('/api/blocks/:id', authenticateToken, async (req, res) => {
  try {
    await pool.query('UPDATE actions SET block_id = NULL WHERE block_id = $1 AND user_id = $2', [req.params.id, req.userId]);
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
    // numeric/date columns reject '' — coerce empty strings to NULL
    const nullableFields = new Set(['target_value', 'current_value', 'target_date']);
    for (const [key, value] of Object.entries(updates)) {
      if (allowedFields.includes(key)) {
        fields.push(`${key} = $${paramCount}`);
        values.push(nullableFields.has(key) && value === '' ? null : value);
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

// INSPIRATION ITEMS (scoped via parent project ownership)
async function userOwnsProject(projectId, userId) {
  const r = await pool.query('SELECT id FROM projects WHERE id = $1 AND user_id = $2', [projectId, userId]);
  return r.rows.length > 0;
}

app.get('/api/inspiration-items', authenticateToken, async (req, res) => {
  try {
    const { project_id } = req.query;
    if (!project_id) return res.status(400).json({ error: 'project_id is required' });
    if (!(await userOwnsProject(project_id, req.userId))) return res.status(404).json({ error: 'Project not found' });
    const result = await pool.query('SELECT * FROM inspiration_items WHERE project_id = $1 ORDER BY sort_order', [project_id]);
    res.json(result.rows);
  } catch (error) { res.status(500).json({ error: 'Failed to fetch inspiration items' }); }
});

app.post('/api/inspiration-items', authenticateToken, async (req, res) => {
  try {
    const { project_id, title, description, image_url, link_url } = req.body;
    if (!(await userOwnsProject(project_id, req.userId))) return res.status(400).json({ error: 'Invalid project' });
    const result = await pool.query(
      `INSERT INTO inspiration_items (project_id, title, description, image_url, link_url, sort_order) VALUES ($1, $2, $3, $4, $5, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM inspiration_items WHERE project_id = $1)) RETURNING *`,
      [project_id, title || '', description || '', image_url || '', link_url || '']
    );
    res.status(201).json(result.rows[0]);
  } catch (error) { res.status(500).json({ error: 'Failed to create inspiration item' }); }
});

app.put('/api/inspiration-items/:id', authenticateToken, async (req, res) => {
  try {
    const { title, description, image_url, link_url } = req.body;
    const result = await pool.query(
      `UPDATE inspiration_items ii SET title = COALESCE($1, ii.title), description = COALESCE($2, ii.description), image_url = COALESCE($3, ii.image_url), link_url = COALESCE($4, ii.link_url)
       FROM projects p WHERE ii.id = $5 AND ii.project_id = p.id AND p.user_id = $6 RETURNING ii.*`,
      [title, description, image_url, link_url, req.params.id, req.userId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Inspiration item not found' });
    res.json(result.rows[0]);
  } catch (error) { res.status(500).json({ error: 'Failed to update inspiration item' }); }
});

app.delete('/api/inspiration-items/:id', authenticateToken, async (req, res) => {
  try {
    const check = await pool.query('SELECT ii.id FROM inspiration_items ii JOIN projects p ON ii.project_id = p.id WHERE ii.id = $1 AND p.user_id = $2', [req.params.id, req.userId]);
    if (check.rows.length === 0) return res.status(404).json({ error: 'Inspiration item not found' });
    await pool.query('DELETE FROM inspiration_items WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (error) { res.status(500).json({ error: 'Failed to delete inspiration item' }); }
});

// LEVERAGE REQUESTS (accountability: ask a person to help with an action)
app.get('/api/leverage-requests', authenticateToken, async (req, res) => {
  try {
    const { action_id, person_id } = req.query;
    let query = `SELECT lr.*, p.name AS person_name, a.title AS action_title
                 FROM leverage_requests lr
                 JOIN persons p ON lr.person_id = p.id
                 LEFT JOIN actions a ON lr.action_id = a.id
                 WHERE p.user_id = $1`;
    const params = [req.userId];
    if (action_id) { params.push(action_id); query += ` AND lr.action_id = $${params.length}`; }
    if (person_id) { params.push(person_id); query += ` AND lr.person_id = $${params.length}`; }
    query += ' ORDER BY lr.created_at DESC';
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) { res.status(500).json({ error: 'Failed to fetch leverage requests' }); }
});

app.post('/api/leverage-requests', authenticateToken, async (req, res) => {
  try {
    const { action_id, person_id, message, status } = req.body;
    const personCheck = await pool.query('SELECT id FROM persons WHERE id = $1 AND user_id = $2', [person_id, req.userId]);
    if (personCheck.rows.length === 0) return res.status(400).json({ error: 'Invalid person' });
    if (action_id) {
      const actionCheck = await pool.query('SELECT id FROM actions WHERE id = $1 AND user_id = $2', [action_id, req.userId]);
      if (actionCheck.rows.length === 0) return res.status(400).json({ error: 'Invalid action' });
    }
    const result = await pool.query(
      'INSERT INTO leverage_requests (action_id, person_id, message, status) VALUES ($1, $2, $3, $4) RETURNING *',
      [action_id || null, person_id, message || '', status || 'pending']
    );

    // Notify the person they're being counted on (if they have an email).
    try {
      const person = await pool.query('SELECT name, email FROM persons WHERE id = $1', [person_id]);
      const to = (person.rows[0]?.email || '').trim();
      if (to) {
        const me = await pool.query('SELECT name FROM users WHERE id = $1', [req.userId]);
        let actionTitle = '';
        if (action_id) {
          const a = await pool.query('SELECT title FROM actions WHERE id = $1', [action_id]);
          actionTitle = a.rows[0]?.title || '';
        }
        sendAccountability({ to, recipientName: person.rows[0]?.name, inviterName: me.rows[0]?.name, actionTitle, message, appUrl: FRONTEND_URL })
          .catch(err => console.error('Accountability email error:', err));
      }
    } catch (notifyErr) {
      console.error('Accountability notify flow error:', notifyErr);
    }

    res.status(201).json(result.rows[0]);
  } catch (error) { res.status(500).json({ error: 'Failed to create leverage request' }); }
});

app.put('/api/leverage-requests/:id', authenticateToken, async (req, res) => {
  try {
    const { message, status } = req.body;
    const result = await pool.query(
      `UPDATE leverage_requests lr SET message = COALESCE($1, lr.message), status = COALESCE($2, lr.status)
       FROM persons p WHERE lr.id = $3 AND lr.person_id = p.id AND p.user_id = $4 RETURNING lr.*`,
      [message, status, req.params.id, req.userId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Leverage request not found' });
    res.json(result.rows[0]);
  } catch (error) { res.status(500).json({ error: 'Failed to update leverage request' }); }
});

app.delete('/api/leverage-requests/:id', authenticateToken, async (req, res) => {
  try {
    const check = await pool.query('SELECT lr.id FROM leverage_requests lr JOIN persons p ON lr.person_id = p.id WHERE lr.id = $1 AND p.user_id = $2', [req.params.id, req.userId]);
    if (check.rows.length === 0) return res.status(404).json({ error: 'Leverage request not found' });
    await pool.query('DELETE FROM leverage_requests WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (error) { res.status(500).json({ error: 'Failed to delete leverage request' }); }
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
    const person = result.rows[0];

    // If this person has an email and isn't already an RPM user, invite them once.
    // inviteStatus tells the UI exactly what happened so "add person" isn't silent:
    //   no_email | already_member | already_invited | sent | send_failed
    let inviteStatus = 'no_email';
    const cleanEmail = (email || '').trim().toLowerCase();
    if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(cleanEmail)) {
      try {
        const existingUser = await pool.query('SELECT id FROM users WHERE LOWER(email) = $1', [cleanEmail]);
        if (existingUser.rows.length > 0) {
          // Already a member: no invite, but let them know they were added.
          const me = await pool.query('SELECT name FROM users WHERE id = $1', [req.userId]);
          sendContactAdded({ to: cleanEmail, recipientName: name, inviterName: me.rows[0]?.name, appUrl: FRONTEND_URL })
            .catch(err => console.error('Contact-added email error:', err));
          inviteStatus = 'already_member';
        } else {
          const token = crypto.randomBytes(24).toString('hex');
          // unique index on LOWER(email) makes this a no-op if already invited
          const ins = await pool.query(
            `INSERT INTO invitations (inviter_user_id, email, token) VALUES ($1, $2, $3)
             ON CONFLICT (LOWER(email)) DO NOTHING RETURNING id`,
            [req.userId, cleanEmail, token]
          );
          if (ins.rows.length === 0) {
            inviteStatus = 'already_invited';
          } else {
            const me = await pool.query('SELECT name FROM users WHERE id = $1', [req.userId]);
            const joinUrl = `${FRONTEND_URL}/?invite=${token}`;
            // Await so we can report real delivery status back to the UI. sendInvitation
            // never throws — it returns { sent: boolean }.
            const result = await sendInvitation({ to: cleanEmail, recipientName: name, inviterName: me.rows[0]?.name, joinUrl });
            inviteStatus = result && result.sent ? 'sent' : 'send_failed';
          }
        }
      } catch (inviteErr) {
        console.error('Invitation flow error:', inviteErr);
        inviteStatus = 'send_failed';
      }
    }

    res.status(201).json({ ...person, invited: inviteStatus === 'sent', inviteStatus });
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
    if (!start_date || !end_date) return res.status(400).json({ error: 'start_date and end_date are required' });
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

// ============================================================
// AI layer: multi-provider chat + native web search + per-user keys
// ============================================================

// Model registry (all curated models) + this user's provider key status.
app.get('/api/ai/models', authenticateToken, async (req, res) => {
  try {
    const providers = await aiKeys.listKeysMasked(pool, req.userId);
    res.json({ models: aiRegistry.MODELS, providers, storageEnabled: aiKeysConfigured() });
  } catch (error) {
    console.error('[ai] models error:', error);
    res.status(500).json({ error: 'Failed to load models' });
  }
});

// Masked key status per provider.
app.get('/api/ai/keys', authenticateToken, async (req, res) => {
  try {
    res.json({ providers: await aiKeys.listKeysMasked(pool, req.userId), storageEnabled: aiKeysConfigured() });
  } catch (error) {
    console.error('[ai] keys list error:', error);
    res.status(500).json({ error: 'Failed to load keys' });
  }
});

// Save / replace a provider key (encrypted at rest).
app.put('/api/ai/keys/:provider', authenticateToken, async (req, res) => {
  try {
    const { key } = req.body;
    if (!key || !String(key).trim()) return res.status(400).json({ error: 'API key is required' });
    if (!aiKeysConfigured()) {
      return res.status(503).json({ error: 'Key storage is not enabled on the server yet (AI_KEYS_SECRET is missing).' });
    }
    await aiKeys.saveKey(pool, req.userId, req.params.provider, String(key));
    res.json({ success: true });
  } catch (error) {
    console.error('[ai] key save error:', error);
    res.status(400).json({ error: error.message || 'Failed to save key' });
  }
});

app.delete('/api/ai/keys/:provider', authenticateToken, async (req, res) => {
  try {
    await aiKeys.deleteKey(pool, req.userId, req.params.provider);
    res.json({ success: true });
  } catch (error) {
    console.error('[ai] key delete error:', error);
    res.status(500).json({ error: 'Failed to delete key' });
  }
});

// Streaming chat (SSE). Persists the user + assistant messages.
app.post('/api/ai/chat', authenticateToken, async (req, res) => {
  const { conversationId, modelKey, message, webSearch, rpmMode, autoMode } = req.body;
  if (!modelKey || !message || !String(message).trim()) {
    return res.status(400).json({ error: 'modelKey and message are required' });
  }
  if (!aiRegistry.getModelEntry(modelKey)) return res.status(400).json({ error: 'Unknown model' });

  try {
    // Resolve or create the conversation
    let convId = conversationId;
    if (convId) {
      const chk = await pool.query('SELECT id FROM ai_conversations WHERE id = $1 AND user_id = $2', [convId, req.userId]);
      if (!chk.rows[0]) return res.status(404).json({ error: 'Conversation not found' });
    } else {
      const title = String(message).trim().slice(0, 60);
      const ins = await pool.query(
        'INSERT INTO ai_conversations (user_id, title, model) VALUES ($1, $2, $3) RETURNING id',
        [req.userId, title, modelKey]
      );
      convId = ins.rows[0].id;
    }

    const history = (await pool.query(
      'SELECT role, content FROM ai_messages WHERE conversation_id = $1 ORDER BY created_at',
      [convId]
    )).rows;

    await pool.query(
      'INSERT INTO ai_messages (conversation_id, role, content, model) VALUES ($1, $2, $3, $4)',
      [convId, 'user', String(message).trim(), modelKey]
    );

    const messages = [
      ...history.map(h => ({ role: h.role, content: h.content })),
      { role: 'user', content: String(message).trim() },
    ];

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    const send = (obj) => res.write(`data: ${JSON.stringify(obj)}\n\n`);
    send({ type: 'meta', conversationId: convId, model: modelKey });

    let full = '';
    let sources = [];
    try {
      for await (const ev of runChat({ pool, userId: req.userId, modelKey, messages, webSearch: !!webSearch, rpm: rpmMode !== false, autoMode: !!autoMode })) {
        if (ev.type === 'text') { full += ev.text; send({ type: 'delta', text: ev.text }); }
        else if (ev.type === 'tool_call') send({ type: 'tool_call', name: ev.name, args: ev.args });
        else if (ev.type === 'tool_result') send({ type: 'tool_result', name: ev.name, result: ev.result });
        else if (ev.type === 'sources') { sources = ev.sources || []; if (sources.length) send({ type: 'sources', sources }); }
        else if (ev.type === 'error') send({ type: 'error', message: ev.message });
      }
    } catch (err) {
      console.error('[ai] chat stream error:', err);
      send({ type: 'error', code: err.code || 'stream_error', message: err.message || 'AI request failed' });
    }

    await pool.query(
      'INSERT INTO ai_messages (conversation_id, role, content, model, sources) VALUES ($1, $2, $3, $4, $5)',
      [convId, 'assistant', full, modelKey, sources.length ? JSON.stringify(sources) : null]
    );
    await pool.query('UPDATE ai_conversations SET updated_at = NOW(), model = $2 WHERE id = $1', [convId, modelKey]);
    send({ type: 'done' });
    res.end();
  } catch (error) {
    console.error('[ai] chat error:', error);
    if (!res.headersSent) res.status(500).json({ error: 'AI request failed' });
    else { res.write(`data: ${JSON.stringify({ type: 'error', message: 'AI request failed' })}\n\n`); res.end(); }
  }
});

// Conversation history
app.get('/api/ai/conversations', authenticateToken, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, title, model, created_at, updated_at FROM ai_conversations WHERE user_id = $1 ORDER BY updated_at DESC LIMIT 100',
      [req.userId]
    );
    res.json(rows);
  } catch (error) { console.error('[ai] conversations error:', error); res.status(500).json({ error: 'Failed' }); }
});

app.get('/api/ai/conversations/:id', authenticateToken, async (req, res) => {
  try {
    const conv = await pool.query('SELECT id, title, model FROM ai_conversations WHERE id = $1 AND user_id = $2', [req.params.id, req.userId]);
    if (!conv.rows[0]) return res.status(404).json({ error: 'Not found' });
    const msgs = await pool.query('SELECT role, content, model, sources, created_at FROM ai_messages WHERE conversation_id = $1 ORDER BY created_at', [req.params.id]);
    res.json({ ...conv.rows[0], messages: msgs.rows });
  } catch (error) { console.error('[ai] conversation error:', error); res.status(500).json({ error: 'Failed' }); }
});

app.delete('/api/ai/conversations/:id', authenticateToken, async (req, res) => {
  try {
    await pool.query('DELETE FROM ai_conversations WHERE id = $1 AND user_id = $2', [req.params.id, req.userId]);
    res.json({ success: true });
  } catch (error) { console.error('[ai] delete conversation error:', error); res.status(500).json({ error: 'Failed' }); }
});

// Apply an assistant proposal the user approved (propose-mode writes).
app.post('/api/ai/apply', authenticateToken, async (req, res) => {
  try {
    const { kind, payload } = req.body;
    if (!kind) return res.status(400).json({ error: 'kind is required' });
    const result = await applyProposal(pool, req.userId, kind, payload || {});
    if (result && result.ok === false) return res.status(400).json(result);
    res.json(result);
  } catch (error) {
    console.error('[ai] apply error:', error);
    res.status(500).json({ error: 'Failed to apply' });
  }
});

// RPM Coach — Daily Compass (scaffold)
app.post('/api/ai/coach/compass', authenticateToken, async (req, res) => {
  try {
    const { modelKey, webSearch } = req.body;
    if (!modelKey) return res.status(400).json({ error: 'modelKey is required' });
    const result = await runCompass({ pool, userId: req.userId, modelKey, webSearch: !!webSearch });
    res.json(result);
  } catch (error) {
    console.error('[ai] compass error:', error);
    res.status(error instanceof AiError ? 400 : 500).json({ error: error.message || 'Failed' });
  }
});

app.listen(PORT, '0.0.0.0', () => console.log(`RPM Backend running on port ${PORT}`));
