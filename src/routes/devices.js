const express = require('express');
const router = express.Router();
const QRCode = require('qrcode');
const { db } = require('../database');
const waManager = require('../whatsapp/manager');
const { triggerSync } = require('../sync');
const events = require('../events');
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');
const config = require('../config');

// Regex untuk validasi nombor telefon
const PHONE_REGEX = /^[1-9]\d{7,14}$/;

function cleanPhone(phone) {
  if (!phone) return null;
  return phone.replace(/[\s\-\+\(\)]/g, '');
}

// Senaraikan peranti
router.get('/', (req, res) => {
  try {
    const devices = db.prepare('SELECT * FROM devices WHERE user_id = ? ORDER BY created_at DESC').all(req.user.id);
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
    if (!name || !name.trim()) return res.status(400).json({ success: false, error: 'Nama peranti diperlukan' });

    const connectMethod = method === 'pairing' ? 'pairing' : 'qr';
    let cleanedPhone = cleanPhone(phone);

    // Untuk kaedah pairing, nombor telefon wajib
    if (connectMethod === 'pairing') {
      if (!cleanedPhone) return res.status(400).json({ success: false, error: 'Nombor telefon diperlukan untuk kaedah pairing' });
      if (!PHONE_REGEX.test(cleanedPhone)) return res.status(400).json({ success: false, error: 'Format nombor telefon tidak sah. Gunakan format: 60123456789' });
    }

    // Semak nombor telefon pendua (jika diberikan)
    if (cleanedPhone) {
      const existing = db.prepare('SELECT * FROM devices WHERE phone = ? AND user_id = ?').get(cleanedPhone, req.user.id);
      if (existing) {
        return res.status(400).json({ success: false, error: `Nombor ${cleanedPhone} sudah didaftarkan pada peranti "${existing.name}"` });
      }
    }

    const result = db.prepare('INSERT INTO devices (user_id, name, phone, status) VALUES (?, ?, ?, ?)')
      .run(req.user.id, name.trim(), cleanedPhone || null, 'connecting');
    const device = db.prepare('SELECT * FROM devices WHERE id = ?').get(result.lastInsertRowid);

    console.log(`[Peranti] Peranti baru ditambah: "${name}" (ID: ${device.id}, Kaedah: ${connectMethod})`);

    await waManager.startSession(device.id, connectMethod, cleanedPhone);

    triggerSync('peranti: tambah baru');
    res.json({ success: true, data: { ...device, method: connectMethod } });
  } catch (err) {
    console.error(`[Peranti] Ralat menambah peranti: ${err.message}`);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Sambung semula peranti
router.post('/:id/connect', async (req, res) => {
  try {
    const device = db.prepare('SELECT * FROM devices WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!device) return res.status(404).json({ success: false, error: 'Peranti tidak dijumpai' });

    const method = req.body.method || 'qr';
    await waManager.startSession(device.id, method, device.phone);

    triggerSync('peranti: sambung semula');
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

// Putuskan sambungan
router.post('/:id/disconnect', async (req, res) => {
  try {
    const device = db.prepare('SELECT * FROM devices WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!device) return res.status(404).json({ success: false, error: 'Peranti tidak dijumpai' });

    await waManager.stopSession(device.id);
    triggerSync('peranti: putus sambungan');
    events.emit(req.user.id, 'device-status', { deviceId: device.id, status: 'disconnected' });
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
    triggerSync('peranti: padam');
    events.emit(req.user.id, 'device-status', { deviceId: device.id, status: 'deleted' });
    res.json({ success: true, data: { message: 'Peranti dipadam' } });
  } catch (err) {
    console.error(`[Peranti] Ralat memadam peranti: ${err.message}`);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Muat turun data sesi peranti (backup)
router.get('/:id/download', (req, res) => {
  try {
    const device = db.prepare('SELECT * FROM devices WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!device) return res.status(404).json({ success: false, error: 'Peranti tidak dijumpai' });

    const authDir = path.join(config.SESSIONS_DIR, `device_${device.id}`);
    if (!fs.existsSync(authDir)) {
      return res.status(404).json({ success: false, error: 'Tiada data sesi untuk peranti ini' });
    }

    const tmpFile = `/tmp/device_${device.id}_session_${Date.now()}.tar.gz`;
    execSync(`tar -czf "${tmpFile}" -C "${config.SESSIONS_DIR}" "device_${device.id}"`);

    const safeName = device.name.replace(/[^a-zA-Z0-9_\-]/g, '_');
    res.download(tmpFile, `sesi_${safeName}.tar.gz`, () => {
      try { fs.unlinkSync(tmpFile); } catch(e) {}
    });
  } catch (err) {
    console.error(`[Peranti] Ralat memuat turun sesi: ${err.message}`);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
