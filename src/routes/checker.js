const express = require('express');
const router = express.Router();
const db = require('../database');
const { checkNumber, checkBulk } = require('../whatsapp/checker');

// POST /check — Check single number
router.post('/check', async (req, res) => {
  try {
    const { deviceId, phone } = req.body;

    if (!deviceId || !phone) {
      return res.status(400).json({ success: false, error: 'deviceId dan phone diperlukan' });
    }

    // Verify device ownership
    const device = db.prepare('SELECT * FROM devices WHERE id = ? AND user_id = ?').get(deviceId, req.user.id);
    if (!device) {
      return res.status(404).json({ success: false, error: 'Peranti tidak dijumpai' });
    }

    const result = await checkNumber(parseInt(deviceId), phone);

    res.json({ success: true, data: result });
  } catch (err) {
    console.error('Check number error:', err);
    res.status(500).json({ success: false, error: err.message || 'Ralat server' });
  }
});

// POST /check-bulk — Check multiple numbers
router.post('/check-bulk', async (req, res) => {
  try {
    const { deviceId, phones } = req.body;

    if (!deviceId || !phones || !Array.isArray(phones) || phones.length === 0) {
      return res.status(400).json({ success: false, error: 'deviceId dan phones (array) diperlukan' });
    }

    // Verify device ownership
    const device = db.prepare('SELECT * FROM devices WHERE id = ? AND user_id = ?').get(deviceId, req.user.id);
    if (!device) {
      return res.status(404).json({ success: false, error: 'Peranti tidak dijumpai' });
    }

    const results = await checkBulk(parseInt(deviceId), phones);

    res.json({ success: true, data: results });
  } catch (err) {
    console.error('Check bulk error:', err);
    res.status(500).json({ success: false, error: err.message || 'Ralat server' });
  }
});

// GET /contacts — List user's saved contacts
router.get('/contacts', (req, res) => {
  try {
    const contacts = db.prepare('SELECT * FROM contacts WHERE user_id = ? ORDER BY created_at DESC').all(req.user.id);

    res.json({ success: true, data: contacts });
  } catch (err) {
    console.error('List contacts error:', err);
    res.status(500).json({ success: false, error: 'Ralat server' });
  }
});

module.exports = router;
