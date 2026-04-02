'use strict';

const { db } = require('./database');

/**
 * requireAuth middleware
 * Check signed cookie 'auth_token', decode userId, query DB, attach req.user.
 * Return 401 if invalid.
 */
function requireAuth(req, res, next) {
  try {
    const token = req.signedCookies.auth_token;

    if (!token) {
      return res.status(401).json({ success: false, error: 'Sila log masuk terlebih dahulu.' });
    }

    // Token format: userId (stored as string in signed cookie)
    const userId = parseInt(token, 10);

    if (isNaN(userId)) {
      return res.status(401).json({ success: false, error: 'Token tidak sah.' });
    }

    const user = db.prepare('SELECT id, username, role, created_at FROM users WHERE id = ?').get(userId);

    if (!user) {
      return res.status(401).json({ success: false, error: 'Pengguna tidak dijumpai.' });
    }

    req.user = user;
    next();
  } catch (err) {
    console.error('[AUTH] Ralat middleware requireAuth:', err.message);
    return res.status(401).json({ success: false, error: 'Pengesahan gagal.' });
  }
}

/**
 * requireAdmin middleware
 * Same as requireAuth + check role === 'admin'.
 * Return 403 if not admin.
 */
function requireAdmin(req, res, next) {
  // First run requireAuth
  requireAuth(req, res, (err) => {
    if (err) return; // requireAuth already sent a response

    // Check if response was already sent by requireAuth (401 case)
    if (res.headersSent) return;

    if (!req.user || req.user.role !== 'admin') {
      return res.status(403).json({ success: false, error: 'Akses ditolak. Hanya admin dibenarkan.' });
    }

    next();
  });
}

module.exports = { requireAuth, requireAdmin };
