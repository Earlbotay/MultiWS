/**
 * Middleware pengesahan
 */
function requireAuth(req, res, next) {
  if (req.signedCookies && req.signedCookies.auth) {
    try {
      const user = JSON.parse(req.signedCookies.auth);
      if (user && user.id) {
        req.user = user;
        return next();
      }
    } catch (e) {}
  }

  if (req.session && req.session.user) {
    req.user = req.session.user;
    return next();
  }

  if (req.path.startsWith('/api/') || req.xhr || req.headers.accept === 'application/json') {
    return res.status(401).json({ success: false, error: 'Sila log masuk terlebih dahulu.' });
  }
  return res.redirect('/');
}

/**
 * Middleware pentadbir - pastikan pengguna mempunyai role admin
 */
function requireAdmin(req, res, next) {
  requireAuth(req, res, () => {
    if (req.user && req.user.role === 'admin') {
      return next();
    }
    return res.status(403).json({ success: false, error: 'Akses ditolak. Anda bukan pentadbir.' });
  });
}

module.exports = { requireAuth, requireAdmin };
