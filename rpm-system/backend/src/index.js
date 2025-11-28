require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3001;

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Middleware
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static('uploads'));

// Ensure uploads directory exists
if (!fs.existsSync('uploads')) {
  fs.mkdirSync('uploads', { recursive: true });
}

// Multer configuration for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});
const upload = multer({ storage });

// =====================================================
// CATEGORIES ROUTES
// =====================================================

// Get all categories
app.get('/api/categories', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM categories WHERE is_active = true ORDER BY sort_order'
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching categories:', error);
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
});

// Get single category with details
app.get('/api/categories/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const categoryResult = await pool.query('SELECT * FROM categories WHERE id = $1', [id]);
    if (categoryResult.rows.length === 0) {
      return res.status(404).json({ error: 'Category not found' });
    }
    
    const detailsResult = await pool.query(
      'SELECT * FROM category_details WHERE category_id = $1',
      [id]
    );
    
    const projectsResult = await pool.query(
      'SELECT * FROM v_projects_stats WHERE category_id = $1 ORDER BY sort_order',
      [id]
    );
    
    res.json({
      ...categoryResult.rows[0],
      details: detailsResult.rows[0] || null,
      projects: projectsResult.rows
    });
  } catch (error) {
    console.error('Error fetching category:', error);
    res.status(500).json({ error: 'Failed to fetch category' });
  }
});

// Create category
app.post('/api/categories', async (req, res) => {
  try {
    const { name, description, icon, color, cover_image } = req.body;
    const result = await pool.query(
      `INSERT INTO categories (name, description, icon, color, cover_image, sort_order)
       VALUES ($1, $2, $3, $4, $5, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM categories))
       RETURNING *`,
      [name, description || '', icon || 'target', color || '#FF69B4', cover_image || '']
    );
    
    // Create empty category details
    await pool.query(
      'INSERT INTO category_details (category_id) VALUES ($1)',
      [result.rows[0].id]
    );
    
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating category:', error);
    res.status(500).json({ error: 'Failed to create category' });
  }
});

// Update category
app.put('/api/categories/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, icon, color, cover_image } = req.body;
    const result = await pool.query(
      `UPDATE categories SET name = $1, description = $2, icon = $3, color = $4, cover_image = $5
       WHERE id = $6::uuid RETURNING *`,
      [name, description, icon, color, cover_image, id]
    );
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating category:', error);
    res.status(500).json({ error: 'Failed to update category' });
  }
});

// Update category details (Big Picture)
app.put('/api/categories/:id/details', async (req, res) => {
  try {
    const { id } = req.params;
    const { ultimate_vision, roles, ultimate_purpose, one_year_goals, ninety_day_goals } = req.body;
    
    const existing = await pool.query('SELECT id FROM category_details WHERE category_id = $1', [id]);
    
    let result;
    if (existing.rows.length > 0) {
      result = await pool.query(
        `UPDATE category_details 
         SET ultimate_vision = $1, roles = $2, ultimate_purpose = $3, 
             one_year_goals = $4, ninety_day_goals = $5
         WHERE category_id = $6 RETURNING *`,
        [ultimate_vision, roles, ultimate_purpose, one_year_goals, ninety_day_goals, id]
      );
    } else {
      result = await pool.query(
        `INSERT INTO category_details (category_id, ultimate_vision, roles, ultimate_purpose, one_year_goals, ninety_day_goals)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [id, ultimate_vision, roles, ultimate_purpose, one_year_goals, ninety_day_goals]
      );
    }
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating category details:', error);
    res.status(500).json({ error: 'Failed to update category details' });
  }
});

// Delete category
app.delete('/api/categories/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query('UPDATE categories SET is_active = false WHERE id = $1::uuid', [id]);
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting category:', error);
    res.status(500).json({ error: 'Failed to delete category' });
  }
});

// =====================================================
// PROJECTS ROUTES
// =====================================================

// Get all projects
app.get('/api/projects', async (req, res) => {
  try {
    const { category_id, starred } = req.query;
    let query = 'SELECT * FROM v_projects_stats WHERE 1=1';
    const params = [];
    
    if (category_id) {
      params.push(category_id);
      query += ` AND category_id = $${params.length}`;
    }
    if (starred === 'true') {
      query += ' AND is_starred = true';
    }
    
    query += ' ORDER BY sort_order';
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching projects:', error);
    res.status(500).json({ error: 'Failed to fetch projects' });
  }
});

// Get single project with all related data
app.get('/api/projects/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const projectResult = await pool.query('SELECT * FROM v_projects_stats WHERE id = $1', [id]);
    if (projectResult.rows.length === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }
    
    const keyResultsResult = await pool.query(
      'SELECT * FROM key_results WHERE project_id = $1 ORDER BY sort_order',
      [id]
    );
    
    const captureResult = await pool.query(
      'SELECT * FROM capture_items WHERE project_id = $1 ORDER BY sort_order',
      [id]
    );
    
    const blocksResult = await pool.query(
      'SELECT * FROM v_rpm_blocks_stats WHERE project_id = $1 ORDER BY sort_order',
      [id]
    );
    
    // Get actions for each block
    for (let block of blocksResult.rows) {
      const blockActionsResult = await pool.query(
        'SELECT * FROM v_actions_full WHERE block_id = $1 ORDER BY sort_order',
        [block.id]
      );
      block.actions = blockActionsResult.rows;
    }
    
    const actionsResult = await pool.query(
      'SELECT * FROM v_actions_full WHERE project_id = $1 ORDER BY sort_order',
      [id]
    );
    
    const inspirationResult = await pool.query(
      'SELECT * FROM inspiration_items WHERE project_id = $1 ORDER BY sort_order',
      [id]
    );
    
    res.json({
      ...projectResult.rows[0],
      key_results: keyResultsResult.rows,
      capture_items: captureResult.rows,
      rpm_blocks: blocksResult.rows,
      actions: actionsResult.rows,
      inspiration_items: inspirationResult.rows
    });
  } catch (error) {
    console.error('Error fetching project:', error);
    res.status(500).json({ error: 'Failed to fetch project' });
  }
});

// Create project
app.post('/api/projects', async (req, res) => {
  try {
    const { category_id, name, ultimate_result, ultimate_purpose, description, cover_image, start_date, end_date } = req.body;
    const result = await pool.query(
      `INSERT INTO projects (category_id, name, ultimate_result, ultimate_purpose, description, cover_image, start_date, end_date, sort_order)
       VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM projects WHERE category_id = $1::uuid))
       RETURNING *`,
      [category_id, name, ultimate_result || '', ultimate_purpose || '', description || '', cover_image || '', start_date || null, end_date || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating project:', error);
    res.status(500).json({ error: 'Failed to create project' });
  }
});

// Update project
app.put('/api/projects/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, ultimate_result, ultimate_purpose, description, cover_image, start_date, end_date, is_starred, is_completed } = req.body;
    const result = await pool.query(
      `UPDATE projects SET 
        name = COALESCE($1, name),
        ultimate_result = COALESCE($2, ultimate_result),
        ultimate_purpose = COALESCE($3, ultimate_purpose),
        description = COALESCE($4, description),
        cover_image = COALESCE($5, cover_image),
        start_date = COALESCE($6, start_date),
        end_date = COALESCE($7, end_date),
        is_starred = COALESCE($8, is_starred),
        is_completed = COALESCE($9, is_completed)
       WHERE id = $10::uuid RETURNING *`,
      [name, ultimate_result, ultimate_purpose, description, cover_image, start_date, end_date, is_starred, is_completed, id]
    );
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating project:', error);
    res.status(500).json({ error: 'Failed to update project' });
  }
});

// Delete project
app.delete('/api/projects/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query('DELETE FROM projects WHERE id = $1::uuid', [id]);
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting project:', error);
    res.status(500).json({ error: 'Failed to delete project' });
  }
});

// =====================================================
// ACTIONS ROUTES
// =====================================================

// Get all actions
app.get('/api/actions', async (req, res) => {
  try {
    const { category_id, project_id, block_id, starred, this_week, completed } = req.query;
    let query = 'SELECT * FROM v_actions_full WHERE 1=1';
    const params = [];
    
    if (category_id) {
      params.push(category_id);
      query += ` AND category_id = $${params.length}`;
    }
    if (project_id) {
      params.push(project_id);
      query += ` AND project_id = $${params.length}`;
    }
    if (block_id) {
      params.push(block_id);
      query += ` AND block_id = $${params.length}`;
    }
    if (starred === 'true') {
      query += ' AND is_starred = true';
    }
    if (this_week === 'true') {
      query += ' AND is_this_week = true';
    }
    if (completed === 'true') {
      query += ' AND is_completed = true';
    } else if (completed === 'false') {
      query += ' AND is_completed = false';
    }
    
    query += ' ORDER BY sort_order';
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching actions:', error);
    res.status(500).json({ error: 'Failed to fetch actions' });
  }
});

// Get single action
app.get('/api/actions/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('SELECT * FROM v_actions_full WHERE id = $1', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Action not found' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching action:', error);
    res.status(500).json({ error: 'Failed to fetch action' });
  }
});

// Create action
app.post('/api/actions', async (req, res) => {
  try {
    const { 
      category_id, project_id, block_id, leverage_person_id,
      title, notes, duration_hours, duration_minutes,
      scheduled_date, scheduled_time, end_date, is_starred, is_this_week
    } = req.body;
    
    // Validate required fields
    if (!title || title.trim() === '') {
      return res.status(400).json({ error: 'Title is required' });
    }
    
    const result = await pool.query(
      `INSERT INTO actions (
        category_id, project_id, block_id, leverage_person_id,
        title, notes, duration_hours, duration_minutes,
        scheduled_date, scheduled_time, end_date, is_starred, is_this_week, sort_order
      ) VALUES (
        $1::uuid, $2::uuid, $3::uuid, $4::uuid, $5, $6, $7, $8, $9, $10, $11, $12, $13,
        (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM actions 
         WHERE COALESCE(block_id, project_id, category_id) = COALESCE($3::uuid, $2::uuid, $1::uuid))
      ) RETURNING *`,
      [
        category_id || null, project_id || null, block_id || null, leverage_person_id || null,
        title.trim(), notes || '', duration_hours || 0, duration_minutes || 5,
        scheduled_date || null, scheduled_time || null, end_date || null,
        is_starred || false, is_this_week || false
      ]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating action:', error);
    // Return more detailed error information in development
    const errorMessage = process.env.NODE_ENV === 'production' 
      ? 'Failed to create action' 
      : error.message || 'Failed to create action';
    res.status(500).json({ 
      error: errorMessage,
      details: process.env.NODE_ENV !== 'production' ? error.stack : undefined
    });
  }
});

// Update action
app.put('/api/actions/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    
    // Build dynamic update query
    const fields = [];
    const values = [];
    let paramCount = 1;
    
    const allowedFields = [
      'category_id', 'project_id', 'block_id', 'leverage_person_id',
      'title', 'notes', 'duration_hours', 'duration_minutes',
      'scheduled_date', 'scheduled_time', 'end_date',
      'is_starred', 'is_this_week', 'is_completed', 'is_cancelled', 'sort_order'
    ];
    
    const uuidFields = ['category_id', 'project_id', 'block_id', 'leverage_person_id'];
    
    for (const [key, value] of Object.entries(updates)) {
      if (allowedFields.includes(key)) {
        // Cast UUID fields explicitly
        const cast = uuidFields.includes(key) ? '::uuid' : '';
        fields.push(`${key} = $${paramCount}${cast}`);
        values.push(value);
        paramCount++;
      }
    }
    
    if (updates.is_completed === true) {
      fields.push(`completed_at = CURRENT_TIMESTAMP`);
    }
    
    if (fields.length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }
    
    values.push(id);
    const result = await pool.query(
      `UPDATE actions SET ${fields.join(', ')} WHERE id = $${paramCount}::uuid RETURNING *`,
      values
    );
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating action:', error);
    res.status(500).json({ error: 'Failed to update action' });
  }
});

// Duplicate action
app.post('/api/actions/:id/duplicate', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      `INSERT INTO actions (category_id, project_id, block_id, leverage_person_id, title, notes, 
        duration_hours, duration_minutes, scheduled_date, scheduled_time, end_date, is_starred, is_this_week, sort_order)
       SELECT category_id, project_id, block_id, leverage_person_id, title || ' (copy)', notes,
        duration_hours, duration_minutes, scheduled_date, scheduled_time, end_date, is_starred, is_this_week,
        (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM actions)
       FROM actions WHERE id = $1::uuid RETURNING *`,
      [id]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error duplicating action:', error);
    res.status(500).json({ error: 'Failed to duplicate action' });
  }
});

// Delete action
app.delete('/api/actions/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query('DELETE FROM actions WHERE id = $1::uuid', [id]);
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting action:', error);
    res.status(500).json({ error: 'Failed to delete action' });
  }
});

// =====================================================
// RPM BLOCKS ROUTES
// =====================================================

// Get all blocks
app.get('/api/blocks', async (req, res) => {
  try {
    const { category_id, project_id } = req.query;
    let query = 'SELECT * FROM v_rpm_blocks_stats WHERE 1=1';
    const params = [];
    
    if (category_id) {
      params.push(category_id);
      query += ` AND category_id = $${params.length}`;
    }
    if (project_id) {
      params.push(project_id);
      query += ` AND project_id = $${params.length}`;
    }
    
    query += ' ORDER BY sort_order';
    const result = await pool.query(query, params);
    
    // Get actions for each block
    for (let block of result.rows) {
      const actionsResult = await pool.query(
        'SELECT * FROM v_actions_full WHERE block_id = $1 ORDER BY sort_order',
        [block.id]
      );
      block.actions = actionsResult.rows;
    }
    
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching blocks:', error);
    res.status(500).json({ error: 'Failed to fetch blocks' });
  }
});

// Get single block
app.get('/api/blocks/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('SELECT * FROM v_rpm_blocks_stats WHERE id = $1', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Block not found' });
    }
    
    const actionsResult = await pool.query(
      'SELECT * FROM v_actions_full WHERE block_id = $1 ORDER BY sort_order',
      [id]
    );
    
    res.json({
      ...result.rows[0],
      actions: actionsResult.rows
    });
  } catch (error) {
    console.error('Error fetching block:', error);
    res.status(500).json({ error: 'Failed to fetch block' });
  }
});

// Create block
app.post('/api/blocks', async (req, res) => {
  try {
    const { category_id, project_id, result_title, result_description, purpose, target_date, action_ids } = req.body;
    
    const result = await pool.query(
      `INSERT INTO rpm_blocks (category_id, project_id, result_title, result_description, purpose, target_date, sort_order)
       VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, 
         (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM rpm_blocks WHERE COALESCE(project_id, category_id) = COALESCE($2::uuid, $1::uuid)))
       RETURNING *`,
      [category_id || null, project_id || null, result_title, result_description || '', purpose || '', target_date || null]
    );
    
    // Link selected actions to this block
    if (action_ids && action_ids.length > 0) {
      await pool.query(
        'UPDATE actions SET block_id = $1::uuid WHERE id = ANY($2::uuid[])',
        [result.rows[0].id, action_ids]
      );
    }
    
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating block:', error);
    res.status(500).json({ error: 'Failed to create block' });
  }
});

// Update block
app.put('/api/blocks/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { result_title, result_description, purpose, target_date, is_completed, is_in_progress } = req.body;
    
    const result = await pool.query(
      `UPDATE rpm_blocks SET 
        result_title = COALESCE($1, result_title),
        result_description = COALESCE($2, result_description),
        purpose = COALESCE($3, purpose),
        target_date = COALESCE($4, target_date),
        is_completed = COALESCE($5, is_completed),
        is_in_progress = COALESCE($6, is_in_progress)
       WHERE id = $7::uuid RETURNING *`,
      [result_title, result_description, purpose, target_date, is_completed, is_in_progress, id]
    );
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating block:', error);
    res.status(500).json({ error: 'Failed to update block' });
  }
});

// Delete block
app.delete('/api/blocks/:id', async (req, res) => {
  try {
    const { id } = req.params;
    // Unlink actions first
    await pool.query('UPDATE actions SET block_id = NULL WHERE block_id = $1::uuid', [id]);
    await pool.query('DELETE FROM rpm_blocks WHERE id = $1::uuid', [id]);
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting block:', error);
    res.status(500).json({ error: 'Failed to delete block' });
  }
});

// =====================================================
// KEY RESULTS ROUTES
// =====================================================

// Get key results for project
app.get('/api/projects/:projectId/key-results', async (req, res) => {
  try {
    const { projectId } = req.params;
    const result = await pool.query(
      'SELECT * FROM key_results WHERE project_id = $1 ORDER BY sort_order',
      [projectId]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching key results:', error);
    res.status(500).json({ error: 'Failed to fetch key results' });
  }
});

// Create key result
app.post('/api/key-results', async (req, res) => {
  try {
    const { project_id, title, description, target_value, unit, target_date } = req.body;
    const result = await pool.query(
      `INSERT INTO key_results (project_id, title, description, target_value, unit, target_date, sort_order)
       VALUES ($1::uuid, $2, $3, $4, $5, $6, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM key_results WHERE project_id = $1::uuid))
       RETURNING *`,
      [project_id, title, description || '', target_value || null, unit || '', target_date || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating key result:', error);
    res.status(500).json({ error: 'Failed to create key result' });
  }
});

// Update key result
app.put('/api/key-results/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, target_value, current_value, unit, target_date, is_starred, is_completed } = req.body;
    
    // Build dynamic update query to handle undefined values properly
    const fields = [];
    const values = [];
    let paramCount = 1;
    
    if (title !== undefined) {
      fields.push(`title = $${paramCount}`);
      values.push(title);
      paramCount++;
    }
    if (description !== undefined) {
      fields.push(`description = $${paramCount}`);
      values.push(description);
      paramCount++;
    }
    if (target_value !== undefined) {
      fields.push(`target_value = $${paramCount}`);
      values.push(target_value);
      paramCount++;
    }
    if (current_value !== undefined) {
      fields.push(`current_value = $${paramCount}`);
      values.push(current_value);
      paramCount++;
    }
    if (unit !== undefined) {
      fields.push(`unit = $${paramCount}`);
      values.push(unit);
      paramCount++;
    }
    if (target_date !== undefined) {
      fields.push(`target_date = $${paramCount}`);
      values.push(target_date);
      paramCount++;
    }
    if (is_starred !== undefined) {
      fields.push(`is_starred = $${paramCount}`);
      values.push(is_starred);
      paramCount++;
    }
    if (is_completed !== undefined) {
      fields.push(`is_completed = $${paramCount}`);
      values.push(is_completed);
      paramCount++;
    }
    
    if (fields.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }
    
    values.push(id);
    const result = await pool.query(
      `UPDATE key_results SET ${fields.join(', ')} WHERE id = $${paramCount}::uuid RETURNING *`,
      values
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Key result not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating key result:', error);
    const errorMessage = process.env.NODE_ENV === 'production'
      ? 'Failed to update key result'
      : error.message || 'Failed to update key result';
    res.status(500).json({ 
      error: errorMessage,
      details: process.env.NODE_ENV !== 'production' ? error.stack : undefined
    });
  }
});

// Delete key result
app.delete('/api/key-results/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query('DELETE FROM key_results WHERE id = $1::uuid', [id]);
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting key result:', error);
    res.status(500).json({ error: 'Failed to delete key result' });
  }
});

// =====================================================
// CAPTURE ITEMS ROUTES
// =====================================================

// Get capture items
app.get('/api/capture-items', async (req, res) => {
  try {
    const { project_id } = req.query;
    let query = 'SELECT * FROM capture_items WHERE 1=1';
    const params = [];
    
    if (project_id) {
      params.push(project_id);
      query += ` AND project_id = $${params.length}`;
    }
    
    query += ' ORDER BY sort_order';
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching capture items:', error);
    res.status(500).json({ error: 'Failed to fetch capture items' });
  }
});

// Create capture item
app.post('/api/capture-items', async (req, res) => {
  try {
    const { project_id, title, notes } = req.body;
    const result = await pool.query(
      `INSERT INTO capture_items (project_id, title, notes, sort_order)
       VALUES ($1::uuid, $2, $3, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM capture_items WHERE project_id = $1::uuid))
       RETURNING *`,
      [project_id || null, title, notes || '']
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating capture item:', error);
    res.status(500).json({ error: 'Failed to create capture item' });
  }
});

// Update capture item
app.put('/api/capture-items/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { title, notes, is_processed, is_starred } = req.body;
    
    const result = await pool.query(
      `UPDATE capture_items SET 
        title = COALESCE($1, title),
        notes = COALESCE($2, notes),
        is_processed = COALESCE($3, is_processed),
        is_starred = COALESCE($4, is_starred)
       WHERE id = $5::uuid RETURNING *`,
      [title, notes, is_processed, is_starred, id]
    );
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating capture item:', error);
    res.status(500).json({ error: 'Failed to update capture item' });
  }
});

// Delete capture item
app.delete('/api/capture-items/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query('DELETE FROM capture_items WHERE id = $1::uuid', [id]);
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting capture item:', error);
    res.status(500).json({ error: 'Failed to delete capture item' });
  }
});

// =====================================================
// PERSONS ROUTES
// =====================================================

// Get all persons
app.get('/api/persons', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM persons ORDER BY name');
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching persons:', error);
    res.status(500).json({ error: 'Failed to fetch persons' });
  }
});

// Create person
app.post('/api/persons', async (req, res) => {
  try {
    const { name, email, phone, avatar, notes } = req.body;
    const result = await pool.query(
      'INSERT INTO persons (name, email, phone, avatar, notes) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [name, email || '', phone || '', avatar || '', notes || '']
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating person:', error);
    res.status(500).json({ error: 'Failed to create person' });
  }
});

// Update person
app.put('/api/persons/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, phone, avatar, notes } = req.body;
    
    const result = await pool.query(
      `UPDATE persons SET 
        name = COALESCE($1, name),
        email = COALESCE($2, email),
        phone = COALESCE($3, phone),
        avatar = COALESCE($4, avatar),
        notes = COALESCE($5, notes)
       WHERE id = $6::uuid RETURNING *`,
      [name, email, phone, avatar, notes, id]
    );
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating person:', error);
    res.status(500).json({ error: 'Failed to update person' });
  }
});

// Delete person
app.delete('/api/persons/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query('DELETE FROM persons WHERE id = $1::uuid', [id]);
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting person:', error);
    res.status(500).json({ error: 'Failed to delete person' });
  }
});

// =====================================================
// CALENDAR / PLANNER ROUTES
// =====================================================

// Get scheduled items for date range
app.get('/api/planner', async (req, res) => {
  try {
    const { start_date, end_date } = req.query;
    
    const actionsResult = await pool.query(
      `SELECT * FROM v_actions_full 
       WHERE scheduled_date >= $1 AND scheduled_date <= $2
       ORDER BY scheduled_date, scheduled_time`,
      [start_date, end_date]
    );
    
    res.json(actionsResult.rows);
  } catch (error) {
    console.error('Error fetching planner data:', error);
    res.status(500).json({ error: 'Failed to fetch planner data' });
  }
});

// =====================================================
// FILE UPLOAD ROUTE
// =====================================================

app.post('/api/upload', upload.single('image'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }
  res.json({ url: `/uploads/${req.file.filename}` });
});

// =====================================================
// HEALTH CHECK
// =====================================================

app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'healthy', database: 'connected' });
  } catch (error) {
    res.status(500).json({ status: 'unhealthy', database: 'disconnected' });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`RPM Backend running on port ${PORT}`);
});
