const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const rateLimit = require('express-rate-limit');
const db = require('../database');
const { requireAuth } = require('../auth');

const COOKIE_OPTIONS = {
  httpOnly: true,
  signed: true,
  secure: true,
  sameSite: 'strict',
  maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
};

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { success: false, error: 'Terlalu banyak percubaan log masuk. Sila cuba selepas 15 minit.' },
  standardHeaders: true,
  legacyHeaders: false
});

const adminLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 3,
  message: { success: false, error: 'Terlalu banyak percubaan log masuk admin. Sila cuba selepas 15 minit.' },
  standardHeaders: true,
  legacyHeaders: false
});

// POST /login
router.post('/login', loginLimiter, async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ success: false, error: 'Username dan password diperlukan' });
    }

    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
    if (!user) {
      return res.status(401).json({ success: false, error: 'Username atau password salah' });
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return res.status(401).json({ success: false, error: 'Username atau password salah' });
    }

    res.cookie('auth_token', user.id, COOKIE_OPTIONS);
    res.json({
      success: true,
      data: { id: user.id, username: user.username, role: user.role }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ success: false, error: 'Ralat server' });
  }
});

// POST /admin-login
router.post('/admin-login', adminLoginLimiter, async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ success: false, error: 'Username dan password diperlukan' });
    }

    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
    if (!user) {
      return res.status(401).json({ success: false, error: 'Username atau password salah' });
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return res.status(401).json({ success: false, error: 'Username atau password salah' });
    }

    if (user.role !== 'admin') {
      return res.status(403).json({ success: false, error: 'Akses ditolak. Anda bukan admin.' });
    }

    res.cookie('auth_token', user.id, COOKIE_OPTIONS);
    res.json({
      success: true,
      data: { id: user.id, username: user.username, role: user.role }
    });
  } catch (err) {
    console.error('Admin login error:', err);
    res.status(500).json({ success: false, error: 'Ralat server' });
  }
});

// POST /logout
router.post('/logout', requireAuth, (req, res) => {
  try {
    res.clearCookie('auth_token', COOKIE_OPTIONS);
    res.json({ success: true });
  } catch (err) {
    console.error('Logout error:', err);
    res.status(500).json({ success: false, error: 'Ralat server' });
  }
});

// GET /me
router.get('/me', requireAuth, (req, res) => {
  try {
    res.json({
      success: true,
      data: { id: req.user.id, username: req.user.username, role: req.user.role }
    });
  } catch (err) {
    console.error('Get me error:', err);
    res.status(500).json({ success: false, error: 'Ralat server' });
  }
});

// PUT /password
router.put('/password', requireAuth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ success: false, error: 'Password semasa dan password baru diperlukan' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ success: false, error: 'Password baru mestilah sekurang-kurangnya 6 aksara' });
    }

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    if (!user) {
      return res.status(404).json({ success: false, error: 'Pengguna tidak dijumpai' });
    }

    const valid = await bcrypt.compare(currentPassword, user.password);
    if (!valid) {
      return res.status(401).json({ success: false, error: 'Password semasa salah' });
    }

    const hash = await bcrypt.hash(newPassword, 10);
    db.prepare('UPDATE users SET password = ? WHERE id = ?').run(hash, req.user.id);

    // Refresh cookie
    res.cookie('auth_token', req.user.id, COOKIE_OPTIONS);
    res.json({ success: true });
  } catch (err) {
    console.error('Change password error:', err);
    res.status(500).json({ success: false, error: 'Ralat server' });
  }
});

module.exports = router;
