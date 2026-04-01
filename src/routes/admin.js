const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { db } = require('../database');
const waManager = require('../whatsapp/manager');
const { triggerSync } = require('../sync');

// Statistik keseluruhan
router.get('/stats', (req, res) => {
  try {
    const totalUsers = db.prepare('SELECT COUNT(*) as count FROM users').get().count;
    const totalDevices = db.prepare('SELECT COUNT(*) as count FROM devices').get().count;
    const connectedDevices = db.prepare("SELECT COUNT(*) as count FROM devices WHERE status = 'connected'").get().count;
    const totalMessages = db.prepare('SELECT COUNT(*) as count FROM messages').get().count;
    const totalBlasts = db.prepare('SELECT COUNT(*) as count FROM blast_jobs').get().count;
    const runningBlasts = db.prepare("SELECT COUNT(*) as count FROM blast_jobs WHERE status = 'running'").get().count;
    const totalAutoReplies = db.prepare('SELECT COUNT(*) as count FROM auto_replies WHERE is_active = 1').get().count;

    res.json({
      success: true,
      data: { totalUsers, totalDevices, connectedDevices, totalMessages, totalBlasts, runningBlasts, totalAutoReplies }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Senarai semua pengguna dengan carian
router.get('/users', (req, res) => {
  try {
    const search = req.query.search || '';
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;

    let users, total;
    if (search) {
      const q = `%${search}%`;
      users = db.prepare('SELECT id, username, role, created_at FROM users WHERE username LIKE ? ORDER BY created_at DESC LIMIT ? OFFSET ?').all(q, limit, offset);
      total = db.prepare('SELECT COUNT(*) as count FROM users WHERE username LIKE ?').get(q).count;
    } else {
      users = db.prepare('SELECT id, username, role, created_at FROM users ORDER BY created_at DESC LIMIT ? OFFSET ?').all(limit, offset);
      total = db.prepare('SELECT COUNT(*) as count FROM users').get().count;
    }

    // Tambah statistik untuk setiap pengguna
    const usersWithStats = users.map(u => {
      const deviceCount = db.prepare('SELECT COUNT(*) as count FROM devices WHERE user_id = ?').get(u.id).count;
      const connectedCount = db.prepare("SELECT COUNT(*) as count FROM devices WHERE user_id = ? AND status = 'connected'").get(u.id).count;
      const messageCount = db.prepare('SELECT COUNT(*) as count FROM messages WHERE device_id IN (SELECT id FROM devices WHERE user_id = ?)').get(u.id).count;
      return { ...u, deviceCount, connectedCount, messageCount };
    });

    res.json({ success: true, data: usersWithStats, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Butiran pengguna tertentu
router.get('/users/:id', (req, res) => {
  try {
    const user = db.prepare('SELECT id, username, role, created_at FROM users WHERE id = ?').get(req.params.id);
    if (!user) return res.status(404).json({ success: false, error: 'Pengguna tidak dijumpai' });

    const devices = db.prepare('SELECT * FROM devices WHERE user_id = ? ORDER BY created_at DESC').all(user.id);
    const devicesWithStatus = devices.map(d => ({
      ...d,
      status: waManager.getStatus(d.id) || d.status
    }));

    const blasts = db.prepare('SELECT * FROM blast_jobs WHERE user_id = ? ORDER BY created_at DESC LIMIT 10').all(user.id);
    const autoReplies = db.prepare('SELECT * FROM auto_replies WHERE user_id = ?').all(user.id);
    const messageCount = db.prepare('SELECT COUNT(*) as count FROM messages WHERE device_id IN (SELECT id FROM devices WHERE user_id = ?)').get(user.id).count;

    res.json({ success: true, data: { ...user, devices: devicesWithStatus, blasts, autoReplies, messageCount } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Cipta pengguna baru
router.post('/users', (req, res) => {
  try {
    const { username, password, role } = req.body;
    if (!username || !password) return res.status(400).json({ success: false, error: 'Nama pengguna dan kata laluan diperlukan' });
    if (password.length < 6) return res.status(400).json({ success: false, error: 'Kata laluan mestilah sekurang-kurangnya 6 aksara' });

    const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
    if (existing) return res.status(400).json({ success: false, error: 'Nama pengguna sudah wujud' });

    const hash = bcrypt.hashSync(password, 10);
    const result = db.prepare('INSERT INTO users (username, password, role) VALUES (?, ?, ?)').run(username, hash, role || 'user');

    triggerSync('admin: cipta pengguna baru');
    console.log(`[Admin] Pengguna baru '${username}' dicipta oleh admin`);
    res.json({ success: true, data: { id: result.lastInsertRowid, username, role: role || 'user' } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Padam pengguna
router.delete('/users/:id', (req, res) => {
  try {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
    if (!user) return res.status(404).json({ success: false, error: 'Pengguna tidak dijumpai' });
    if (user.id === req.user.id) return res.status(400).json({ success: false, error: 'Anda tidak boleh memadam akaun sendiri' });

    // Padam semua data berkaitan
    const devices = db.prepare('SELECT id FROM devices WHERE user_id = ?').all(user.id);
    for (const device of devices) {
      try { waManager.deleteSession(device.id); } catch (e) {}
    }
    db.prepare('DELETE FROM users WHERE id = ?').run(user.id);
    triggerSync('admin: padam pengguna');
    console.log(`[Admin] Pengguna '${user.username}' dipadam oleh admin`);
    res.json({ success: true, data: { message: 'Pengguna dan semua data berkaitan telah dipadam' } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Senarai semua peranti (admin)
router.get('/devices', (req, res) => {
  try {
    const devices = db.prepare(`
      SELECT d.*, u.username as owner_username
      FROM devices d
      JOIN users u ON d.user_id = u.id
      ORDER BY d.created_at DESC
    `).all();

    const devicesWithStatus = devices.map(d => ({
      ...d,
      status: waManager.getStatus(d.id) || d.status
    }));

    res.json({ success: true, data: devicesWithStatus });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
