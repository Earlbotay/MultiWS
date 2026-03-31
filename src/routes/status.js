const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { requireAuth } = require('../auth');
const statusService = require('../whatsapp/status');
const config = require('../config');
const db = require('../database');

// Pastikan direktori muat naik wujud
const uploadsDir = path.join(config.DATA_DIR, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
  console.log('[Status Route] Direktori muat naik dicipta');
}

// Konfigurasi multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, `status-${uniqueSuffix}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB had maksimum
  }
});

router.use(requireAuth);

// Hantar status teks
router.post('/text', async (req, res) => {
  try {
    const { deviceId, text, backgroundColor, font } = req.body;

    if (!deviceId || !text) {
      return res.status(400).json({ success: false, error: 'Sila sediakan deviceId dan teks' });
    }

    const device = db.prepare('SELECT * FROM devices WHERE id = ? AND user_id = ?').get(deviceId, req.user.id);
    if (!device) {
      return res.status(403).json({ success: false, error: 'Peranti tidak dijumpai atau bukan milik anda' });
    }

    const result = await statusService.postTextStatus(deviceId, text, backgroundColor, font);
    res.json({ success: true, data: result });
  } catch (err) {
    console.log(`[Status Route] Ralat menghantar status teks: ${err.message}`);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Hantar status gambar
router.post('/image', upload.single('file'), async (req, res) => {
  try {
    const { deviceId, caption } = req.body;

    if (!deviceId || !req.file) {
      return res.status(400).json({ success: false, error: 'Sila sediakan deviceId dan fail gambar' });
    }

    const device = db.prepare('SELECT * FROM devices WHERE id = ? AND user_id = ?').get(deviceId, req.user.id);
    if (!device) {
      return res.status(403).json({ success: false, error: 'Peranti tidak dijumpai atau bukan milik anda' });
    }

    const result = await statusService.postImageStatus(deviceId, req.file.path, caption);
    res.json({ success: true, data: result });
  } catch (err) {
    console.log(`[Status Route] Ralat menghantar status gambar: ${err.message}`);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Hantar status video
router.post('/video', upload.single('file'), async (req, res) => {
  try {
    const { deviceId, caption } = req.body;

    if (!deviceId || !req.file) {
      return res.status(400).json({ success: false, error: 'Sila sediakan deviceId dan fail video' });
    }

    const device = db.prepare('SELECT * FROM devices WHERE id = ? AND user_id = ?').get(deviceId, req.user.id);
    if (!device) {
      return res.status(403).json({ success: false, error: 'Peranti tidak dijumpai atau bukan milik anda' });
    }

    const result = await statusService.postVideoStatus(deviceId, req.file.path, caption);
    res.json({ success: true, data: result });
  } catch (err) {
    console.log(`[Status Route] Ralat menghantar status video: ${err.message}`);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
