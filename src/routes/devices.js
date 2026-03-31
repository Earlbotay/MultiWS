const express = require('express');
const router = express.Router();
const QRCode = require('qrcode');
const { db } = require('../database');
const { requireAuth } = require('../auth');
const waManager = require('../whatsapp/manager');

router.use(requireAuth);

// Senaraikan peranti
router.get('/', (req, res) => {
  try {
    const devices = db.prepare('SELECT * FROM devices WHERE user_id = ? ORDER BY created_at DESC').all(req.user.id);
    // Tambah status langsung
    const devicesWithStatus = devices.map(d => ({
      ...d,
      liveStatus: waManager.getStatus(d.id)
    }));
    res.json({ success: true, data: devicesWithStatus });
  } catch (err) {
    console.error(`[Peranti] Ralat menyenaraikan peranti: ${err.message}`);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Tambah peranti
router.post('/', (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ success: false, error: 'Nama peranti diperlukan' });

    const result = db.prepare('INSERT INTO devices (user_id, name) VALUES (?, ?)').run(req.user.id, name.trim());
    const device = db.prepare('SELECT * FROM devices WHERE id = ?').get(result.lastInsertRowid);

    console.log(`[Peranti] Peranti baru ditambah: "${name}" (ID: ${device.id})`);
    res.json({ success: true, data: device });
  } catch (err) {
    console.error(`[Peranti] Ralat menambah peranti: ${err.message}`);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Sambung peranti (mulakan sesi WhatsApp)
router.post('/:id/connect', async (req, res) => {
  try {
    const device = db.prepare('SELECT * FROM devices WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!device) return res.status(404).json({ success: false, error: 'Peranti tidak dijumpai' });

    await waManager.startSession(device.id);

    console.log(`[Peranti] Sesi dimulakan untuk peranti #${device.id}`);
    res.json({ success: true, data: { message: 'Menyambung... Sila imbas kod QR' } });
  } catch (err) {
    console.error(`[Peranti] Ralat memulakan sesi: ${err.message}`);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Dapatkan kod QR
router.get('/:id/qr', async (req, res) => {
  try {
    const device = db.prepare('SELECT * FROM devices WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!device) return res.status(404).json({ success: false, error: 'Peranti tidak dijumpai' });

    const qr = waManager.getQR(device.id);
    const status = waManager.getStatus(device.id);

    if (qr) {
      const dataUrl = await QRCode.toDataURL(qr);
      console.log(`[Peranti] Kod QR dijana untuk peranti #${device.id}`);
      return res.json({ success: true, qr: dataUrl, status });
    }

    res.json({ success: true, qr: null, status });
  } catch (err) {
    console.error(`[Peranti] Ralat mendapatkan kod QR: ${err.message}`);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Dapatkan status peranti
router.get('/:id/status', (req, res) => {
  try {
    const device = db.prepare('SELECT * FROM devices WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!device) return res.status(404).json({ success: false, error: 'Peranti tidak dijumpai' });

    const liveStatus = waManager.getStatus(device.id);
    res.json({ success: true, data: { id: device.id, status: liveStatus } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Putuskan sambungan peranti
router.post('/:id/disconnect', async (req, res) => {
  try {
    const device = db.prepare('SELECT * FROM devices WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!device) return res.status(404).json({ success: false, error: 'Peranti tidak dijumpai' });

    await waManager.stopSession(device.id);

    console.log(`[Peranti] Peranti #${device.id} telah diputuskan sambungan`);
    res.json({ success: true, data: { message: 'Peranti diputuskan' } });
  } catch (err) {
    console.error(`[Peranti] Ralat memutuskan sambungan: ${err.message}`);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Padam peranti
router.delete('/:id', async (req, res) => {
  try {
    const device = db.prepare('SELECT * FROM devices WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!device) return res.status(404).json({ success: false, error: 'Peranti tidak dijumpai' });

    await waManager.deleteSession(device.id);

    console.log(`[Peranti] Peranti #${device.id} dan semua data berkaitan telah dipadam`);
    res.json({ success: true, data: { message: 'Peranti dipadam' } });
  } catch (err) {
    console.error(`[Peranti] Ralat memadam peranti: ${err.message}`);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
