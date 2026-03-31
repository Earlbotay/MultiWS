const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { db } = require('../database');
const config = require('../config');
const { triggerSync } = require('../sync');
const rateLimit = require('express-rate-limit');

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 minit
  max: 5,                     // Maksimum 5 percubaan
  message: {
    success: false,
    error: 'Terlalu banyak percubaan log masuk. Sila cuba lagi dalam 15 minit.'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Log masuk
router.post('/login', loginLimiter, (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ success: false, error: 'Sila masukkan nama pengguna dan kata laluan' });
    }

    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
    if (!user || !bcrypt.compareSync(password, user.password)) {
      return res.status(401).json({ success: false, error: 'Nama pengguna atau kata laluan salah' });
    }

    // Tetapkan cookie bertandatangan
    res.cookie('auth', JSON.stringify({ id: user.id, username: user.username, role: user.role || 'user' }), {
      signed: true,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 hari
      sameSite: 'lax'
    });

    console.log(`[Auth] Pengguna '${username}' berjaya log masuk`);
    res.json({ success: true, data: { id: user.id, username: user.username, role: user.role || 'user' } });
  } catch (err) {
    console.error('[Auth] Ralat semasa log masuk:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Log keluar
router.post('/logout', (req, res) => {
  res.clearCookie('auth');
  console.log('[Auth] Pengguna berjaya log keluar');
  res.json({ success: true });
});

// Semak status pengesahan
router.get('/me', (req, res) => {
  try {
    const authCookie = req.signedCookies.auth;
    if (!authCookie) {
      return res.status(401).json({ success: false, error: 'Tidak dilog masuk' });
    }
    const user = JSON.parse(authCookie);
    res.json({ success: true, data: user });
  } catch (err) {
    res.status(401).json({ success: false, error: 'Sesi tidak sah' });
  }
});

// Log masuk pentadbir (endpoint khas — tersembunyi)
router.post('/admin-login', loginLimiter, (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ success: false, error: 'Sila masukkan nama pengguna dan kata laluan' });
    }

    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
    if (!user || !bcrypt.compareSync(password, user.password)) {
      return res.status(401).json({ success: false, error: 'Nama pengguna atau kata laluan salah' });
    }

    // Pastikan pengguna mempunyai role admin
    if (user.role !== 'admin') {
      return res.status(403).json({ success: false, error: 'Akses ditolak. Anda bukan pentadbir.' });
    }

    // Tetapkan cookie bertandatangan dengan role admin
    res.cookie('auth', JSON.stringify({ id: user.id, username: user.username, role: 'admin' }), {
      signed: true,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 7 * 24 * 60 * 60 * 1000,
      sameSite: 'lax'
    });

    console.log(`[Auth] Pentadbir '${username}' berjaya log masuk`);
    res.json({ success: true, data: { id: user.id, username: user.username, role: 'admin' } });
  } catch (err) {
    console.error('[Auth] Ralat semasa log masuk admin:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Tukar kata laluan
router.post('/change-password', (req, res) => {
  try {
    const authCookie = req.signedCookies.auth;
    if (!authCookie) {
      return res.status(401).json({ success: false, error: 'Tidak dilog masuk' });
    }
    const user = JSON.parse(authCookie);
    const { currentPassword, newPassword } = req.body;

    const dbUser = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id);
    if (!dbUser) {
      res.clearCookie('auth');
      return res.status(404).json({ success: false, error: 'Akaun pengguna tidak dijumpai. Sila log masuk semula.' });
    }
    if (!bcrypt.compareSync(currentPassword, dbUser.password)) {
      return res.status(400).json({ success: false, error: 'Kata laluan semasa tidak betul' });
    }

    const hash = bcrypt.hashSync(newPassword, 10);
    db.prepare('UPDATE users SET password = ? WHERE id = ?').run(hash, user.id);

    triggerSync('auth: tukar kata laluan');
    console.log(`[Auth] Kata laluan pengguna '${user.username}' berjaya ditukar`);
    res.json({ success: true, data: 'Kata laluan berjaya ditukar' });
  } catch (err) {
    console.error('[Auth] Ralat semasa tukar kata laluan:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
