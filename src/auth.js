/**
 * Middleware pengesahan — pastikan pengguna telah log masuk
 * Menyokong kedua-dua cookie bertandatangan dan sesi Express
 */
function requireAuth(req, res, next) {
  // Cuba dapatkan pengguna dari cookie bertandatangan terlebih dahulu
  if (req.signedCookies && req.signedCookies.auth) {
    try {
      const user = JSON.parse(req.signedCookies.auth);
      if (user && user.id) {
        req.user = user;
        return next();
      }
    } catch (e) {
      // Cookie tidak sah, teruskan ke semakan sesi
    }
  }

  // Fallback ke sesi Express (keserasian dengan kod sedia ada)
  if (req.session && req.session.user) {
    req.user = req.session.user;
    return next();
  }

  // Jika permintaan API, kembalikan 401
  if (req.path.startsWith('/api/') || req.xhr || req.headers.accept === 'application/json') {
    return res.status(401).json({ success: false, error: 'Sila log masuk terlebih dahulu.' });
  }

  // Jika permintaan halaman biasa, alihkan ke halaman log masuk
  return res.redirect('/');
}

module.exports = { requireAuth };
