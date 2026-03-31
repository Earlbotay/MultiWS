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
    // Tambah status langsung dari WAManager
    const devicesWithStatus = devices.map(d => ({
      ...d,
      status: waManager.getStatus(d.id) || d.status
    }));
    res.json({ success: true, data: devicesWithStatus });
  } catch (err) {
    console.error(`[Peranti] Ralat menyenaraikan peranti: ${err.message}`);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Tambah peranti dan mulakan sesi
router.post('/', async (req, res) => {
  try {
    const { name, phone, method } = req.body;
    if (!name) return res.status(400).json({ success: false, error: 'Nama peranti diperlukan' });
    if (!phone) return res.status(400).json({ success: false, error: 'Nombor telefon diperlukan' });

    const connectMethod = method === 'pairing' ? 'pairing' : 'qr';

    const result = db.prepare('INSERT INTO devices (user_id, name, phone, status) VALUES (?, ?, ?, ?)').run(req.user.id, name.trim(), phone.trim(), 'connecting');
    const device = db.prepare('SELECT * FROM devices WHERE id = ?').get(result.lastInsertRowid);

    console.log(`[Peranti] Peranti baru ditambah: "${name}" (ID: ${device.id}, Kaedah: ${connectMethod})`);

    // Mulakan sesi WhatsApp terus
    await waManager.startSession(device.id, connectMethod, phone.trim());

    res.json({ success: true, data: { ...device, method: connectMethod } });
  } catch (err) {
    console.error(`[Peranti] Ralat menambah peranti: ${err.message}`);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Sambung semula peranti sedia ada
router.post('/:id/connect', async (req, res) => {
  try {
    const device = db.prepare('SELECT * FROM devices WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!device) return res.status(404).json({ success: false, error: 'Peranti tidak dijumpai' });

    const method = req.body.method || 'qr';
    await waManager.startSession(device.id, method, device.phone);

    console.log(`[Peranti] Sesi dimulakan untuk peranti #${device.id} (kaedah: ${method})`);
    res.json({ success: true, data: { message: 'Menyambung...', method } });
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
    const pairingCode = waManager.getPairingCode(device.id);
    const status = waManager.getStatus(device.id);
    const error = waManager.getError(device.id);

    let qrDataUrl = null;
    if (qr) {
      qrDataUrl = await QRCode.toDataURL(qr);
    }

    res.json({ success: true, qr: qrDataUrl, pairingCode, status, error });
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
