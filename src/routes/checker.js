const express = require('express');
const router = express.Router();
const { requireAuth } = require('../auth');
const checkerService = require('../whatsapp/checker');
const { db } = require('../database');

router.use(requireAuth);

// Semak pelbagai nombor
router.post('/check', async (req, res) => {
  try {
    const { deviceId, phones } = req.body;

    if (!deviceId || !phones || !Array.isArray(phones) || phones.length === 0) {
      return res.status(400).json({ success: false, error: 'Sila sediakan deviceId dan senarai nombor telefon' });
    }

    const device = db.prepare('SELECT * FROM devices WHERE id = ? AND user_id = ?').get(deviceId, req.user.id);
    if (!device) {
      return res.status(403).json({ success: false, error: 'Peranti tidak dijumpai atau bukan milik anda' });
    }

    const results = await checkerService.checkNumbers(deviceId, phones);
    res.json({ success: true, data: results });
  } catch (err) {
    console.log(`[Checker Route] Ralat menyemak nombor: ${err.message}`);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Semak nombor tunggal
router.post('/check-single', async (req, res) => {
  try {
    const { deviceId, phone } = req.body;

    if (!deviceId || !phone) {
      return res.status(400).json({ success: false, error: 'Sila sediakan deviceId dan nombor telefon' });
    }

    const device = db.prepare('SELECT * FROM devices WHERE id = ? AND user_id = ?').get(deviceId, req.user.id);
    if (!device) {
      return res.status(403).json({ success: false, error: 'Peranti tidak dijumpai atau bukan milik anda' });
    }

    const result = await checkerService.checkSingle(deviceId, phone);
    res.json({ success: true, data: result });
  } catch (err) {
    console.log(`[Checker Route] Ralat menyemak nombor tunggal: ${err.message}`);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
