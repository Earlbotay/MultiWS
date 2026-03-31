const express = require('express');
const router = express.Router();
const QRCode = require('qrcode');
const db = require('../database');
const { requireAuth } = require('../auth');
const waManager = require('../whatsapp/manager');

// Semua laluan memerlukan pengesahan
router.use(requireAuth);

/**
 * GET / - Senaraikan semua peranti milik pengguna semasa
 */
router.get('/', (req, res) => {
  try {
    const devices = db.prepare('SELECT * FROM devices WHERE user_id = ? ORDER BY created_at DESC').all(req.session.user.id);

    // Tambah status langsung dari pengurus sesi
    devices.forEach(d => {
      d.liveStatus = waManager.getStatus(d.id);
    });

    console.log(`[Peranti] Menyenaraikan ${devices.length} peranti untuk pengguna #${req.session.user.id}`);
    return res.json({ success: true, data: devices });
  } catch (err) {
    console.error(`[Peranti] Ralat menyenaraikan peranti: ${err.message}`);
    return res.status(500).json({ success: false, error: 'Gagal mendapatkan senarai peranti' });
  }
});

/**
 * POST / - Tambah peranti baru
 */
router.post('/', (req, res) => {
  try {
    const { name } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, error: 'Nama peranti diperlukan' });
    }

    const result = db.prepare(
      `INSERT INTO devices (user_id, name, status, created_at, updated_at)
       VALUES (?, ?, 'disconnected', datetime('now'), datetime('now'))`
    ).run(req.session.user.id, name.trim());

    const device = db.prepare('SELECT * FROM devices WHERE id = ?').get(result.lastInsertRowid);

    console.log(`[Peranti] Peranti baru ditambah: "${name}" (ID: ${device.id}) oleh pengguna #${req.session.user.id}`);
    return res.json({ success: true, data: device });
  } catch (err) {
    console.error(`[Peranti] Ralat menambah peranti: ${err.message}`);
    return res.status(500).json({ success: false, error: 'Gagal menambah peranti baru' });
  }
});

/**
 * POST /:id/connect - Mulakan sesi WhatsApp untuk peranti
 */
router.post('/:id/connect', async (req, res) => {
  try {
    const deviceId = parseInt(req.params.id);

    // Sahkan peranti milik pengguna
    const device = db.prepare('SELECT * FROM devices WHERE id = ? AND user_id = ?').get(deviceId, req.session.user.id);
    if (!device) {
      return res.status(404).json({ success: false, error: 'Peranti tidak dijumpai' });
    }

    await waManager.startSession(deviceId);

    console.log(`[Peranti] Sesi dimulakan untuk peranti #${deviceId}`);
    return res.json({ success: true, data: { message: 'Sesi WhatsApp sedang dimulakan' } });
  } catch (err) {
    console.error(`[Peranti] Ralat memulakan sesi peranti #${req.params.id}: ${err.message}`);
    return res.status(500).json({ success: false, error: 'Gagal memulakan sesi WhatsApp' });
  }
});

/**
 * GET /:id/qr - Dapatkan kod QR untuk peranti
 */
router.get('/:id/qr', async (req, res) => {
  try {
    const deviceId = parseInt(req.params.id);

    // Sahkan peranti milik pengguna
    const device = db.prepare('SELECT * FROM devices WHERE id = ? AND user_id = ?').get(deviceId, req.session.user.id);
    if (!device) {
      return res.status(404).json({ success: false, error: 'Peranti tidak dijumpai' });
    }

    const qr = waManager.getQR(deviceId);
    const status = waManager.getStatus(deviceId);

    if (qr) {
      const dataUrl = await QRCode.toDataURL(qr);
      console.log(`[Peranti] Kod QR dijana untuk peranti #${deviceId}`);
      return res.json({ success: true, qr: dataUrl });
    }

    console.log(`[Peranti] Tiada kod QR tersedia untuk peranti #${deviceId}. Status: ${status}`);
    return res.json({ success: true, qr: null, status });
  } catch (err) {
    console.error(`[Peranti] Ralat mendapatkan kod QR peranti #${req.params.id}: ${err.message}`);
    return res.status(500).json({ success: false, error: 'Gagal mendapatkan kod QR' });
  }
});

/**
 * POST /:id/disconnect - Putuskan sambungan peranti
 */
router.post('/:id/disconnect', async (req, res) => {
  try {
    const deviceId = parseInt(req.params.id);

    // Sahkan peranti milik pengguna
    const device = db.prepare('SELECT * FROM devices WHERE id = ? AND user_id = ?').get(deviceId, req.session.user.id);
    if (!device) {
      return res.status(404).json({ success: false, error: 'Peranti tidak dijumpai' });
    }

    await waManager.stopSession(deviceId);

    console.log(`[Peranti] Peranti #${deviceId} telah diputuskan sambungan`);
    return res.json({ success: true, data: { message: 'Peranti telah diputuskan sambungan' } });
  } catch (err) {
    console.error(`[Peranti] Ralat memutuskan sambungan peranti #${req.params.id}: ${err.message}`);
    return res.status(500).json({ success: false, error: 'Gagal memutuskan sambungan peranti' });
  }
});

/**
 * DELETE /:id - Padam peranti dan semua data berkaitan
 */
router.delete('/:id', async (req, res) => {
  try {
    const deviceId = parseInt(req.params.id);

    // Sahkan peranti milik pengguna
    const device = db.prepare('SELECT * FROM devices WHERE id = ? AND user_id = ?').get(deviceId, req.session.user.id);
    if (!device) {
      return res.status(404).json({ success: false, error: 'Peranti tidak dijumpai' });
    }

    await waManager.deleteSession(deviceId);

    console.log(`[Peranti] Peranti #${deviceId} dan semua data berkaitan telah dipadam`);
    return res.json({ success: true, data: { message: 'Peranti telah dipadam sepenuhnya' } });
  } catch (err) {
    console.error(`[Peranti] Ralat memadam peranti #${req.params.id}: ${err.message}`);
    return res.status(500).json({ success: false, error: 'Gagal memadam peranti' });
  }
});

/**
 * GET /:id/status - Dapatkan status semasa peranti
 */
router.get('/:id/status', (req, res) => {
  try {
    const deviceId = parseInt(req.params.id);

    // Sahkan peranti milik pengguna
    const device = db.prepare('SELECT * FROM devices WHERE id = ? AND user_id = ?').get(deviceId, req.session.user.id);
    if (!device) {
      return res.status(404).json({ success: false, error: 'Peranti tidak dijumpai' });
    }

    const liveStatus = waManager.getStatus(deviceId);

    console.log(`[Peranti] Status peranti #${deviceId}: ${liveStatus}`);
    return res.json({ success: true, data: { id: deviceId, status: liveStatus } });
  } catch (err) {
    console.error(`[Peranti] Ralat mendapatkan status peranti #${req.params.id}: ${err.message}`);
    return res.status(500).json({ success: false, error: 'Gagal mendapatkan status peranti' });
  }
});

module.exports = router;
