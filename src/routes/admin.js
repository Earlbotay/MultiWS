const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const db = require('../database');
const { requireAdmin } = require('../auth');
const { getSystemStats } = require('../whatsapp/status');

// Apply requireAdmin to ALL routes in this file
router.use(requireAdmin);

// GET /users — List all users with device count + search
router.get('/users', (req, res) => {
  try {
    const { search } = req.query;

    let query = `
      SELECT u.id, u.username, u.role, u.created_at,
        (SELECT COUNT(*) FROM devices WHERE user_id = u.id) AS device_count
      FROM users u
    `;
    const params = [];

    if (search && search.trim()) {
      query += ' WHERE u.username LIKE ?';
      params.push(`%${search.trim()}%`);
    }

    query += ' ORDER BY u.created_at DESC';

    const users = db.prepare(query).all(...params);

    res.json({ success: true, data: users });
  } catch (err) {
    console.error('List users error:', err);
    res.status(500).json({ success: false, error: 'Ralat server' });
  }
});

// POST /users — Create new user
router.post('/users', async (req, res) => {
  try {
    const { username, password, role } = req.body;

    if (!username || !password) {
      return res.status(400).json({ success: false, error: 'Username dan password diperlukan' });
    }

    if (password.length < 6) {
      return res.status(400).json({ success: false, error: 'Password mestilah sekurang-kurangnya 6 aksara' });
    }

    const validRoles = ['user', 'admin'];
    const finalRole = validRoles.includes(role) ? role : 'user';

    // Check if username already exists
    const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
    if (existing) {
      return res.status(409).json({ success: false, error: 'Username sudah digunakan' });
    }

    const hash = await bcrypt.hash(password, 10);
    const result = db.prepare('INSERT INTO users (username, password, role) VALUES (?, ?, ?)').run(username, hash, finalRole);

    const user = db.prepare('SELECT id, username, role, created_at FROM users WHERE id = ?').get(result.lastInsertRowid);

    res.json({ success: true, data: user });
  } catch (err) {
    console.error('Create user error:', err);
    res.status(500).json({ success: false, error: 'Ralat server' });
  }
});

// GET /users/:id — User detail + all their devices
router.get('/users/:id', (req, res) => {
  try {
    const { id } = req.params;

    const user = db.prepare('SELECT id, username, role, created_at FROM users WHERE id = ?').get(id);
    if (!user) {
      return res.status(404).json({ success: false, error: 'Pengguna tidak dijumpai' });
    }

    const devices = db.prepare('SELECT * FROM devices WHERE user_id = ? ORDER BY created_at DESC').all(id);

    res.json({ success: true, data: { user, devices } });
  } catch (err) {
    console.error('Get user detail error:', err);
    res.status(500).json({ success: false, error: 'Ralat server' });
  }
});

// DELETE /users/:id — Delete user (cascade)
router.delete('/users/:id', (req, res) => {
  try {
    const { id } = req.params;

    const user = db.prepare('SELECT id, username, role FROM users WHERE id = ?').get(id);
    if (!user) {
      return res.status(404).json({ success: false, error: 'Pengguna tidak dijumpai' });
    }

    // Prevent deleting yourself
    if (parseInt(id) === req.user.id) {
      return res.status(400).json({ success: false, error: 'Tidak boleh memadam akaun sendiri' });
    }

    db.prepare('DELETE FROM users WHERE id = ?').run(id);

    res.json({ success: true });
  } catch (err) {
    console.error('Delete user error:', err);
    res.status(500).json({ success: false, error: 'Ralat server' });
  }
});

// GET /stats — System stats
router.get('/stats', async (req, res) => {
  try {
    const stats = await getSystemStats();
    res.json({ success: true, data: stats });
  } catch (err) {
    console.error('Get system stats error:', err);
    res.status(500).json({ success: false, error: 'Ralat server' });
  }
});

module.exports = router;
