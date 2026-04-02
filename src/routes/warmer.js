const express = require('express');
const router = express.Router();
const db = require('../database');
const { startWarmer, stopWarmer } = require('../whatsapp/warmer');

// GET / — List user's warmer jobs
router.get('/', (req, res) => {
  try {
    const warmers = db.prepare(`
      SELECT wj.*, d.name AS device_name 
      FROM warmer_jobs wj
      LEFT JOIN devices d ON wj.device_id = d.id
      WHERE wj.user_id = ? 
      ORDER BY wj.created_at DESC
    `).all(req.user.id);

    res.json({ success: true, data: warmers });
  } catch (err) {
    console.error('List warmer jobs error:', err);
    res.status(500).json({ success: false, error: 'Ralat server' });
  }
});

// POST / — Create warmer
router.post('/', (req, res) => {
  try {
    const { deviceId, targetPhone, message } = req.body;

    // Accept both naming conventions for interval
    const intervalMin = req.body.intervalMin || req.body.minInterval || 30;
    const intervalMax = req.body.intervalMax || req.body.maxInterval || 60;

    if (!deviceId || !targetPhone || !message) {
      return res.status(400).json({ success: false, error: 'deviceId, targetPhone, dan message diperlukan' });
    }

    // Verify device ownership
    const device = db.prepare('SELECT * FROM devices WHERE id = ? AND user_id = ?').get(deviceId, req.user.id);
    if (!device) {
      return res.status(404).json({ success: false, error: 'Peranti tidak dijumpai' });
    }

    const result = db.prepare(`
      INSERT INTO warmer_jobs (user_id, device_id, target_phone, message, interval_min, interval_max) 
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(req.user.id, deviceId, targetPhone, message, intervalMin, intervalMax);

    const warmer = db.prepare('SELECT * FROM warmer_jobs WHERE id = ?').get(result.lastInsertRowid);

    res.json({ success: true, data: warmer });
  } catch (err) {
    console.error('Create warmer error:', err);
    res.status(500).json({ success: false, error: 'Ralat server' });
  }
});

// POST /:id/start — Start warmer
router.post('/:id/start', (req, res) => {
  try {
    const { id } = req.params;

    const warmer = db.prepare('SELECT * FROM warmer_jobs WHERE id = ? AND user_id = ?').get(id, req.user.id);
    if (!warmer) {
      return res.status(404).json({ success: false, error: 'Warmer tidak dijumpai' });
    }

    startWarmer(parseInt(id));

    res.json({ success: true });
  } catch (err) {
    console.error('Start warmer error:', err);
    res.status(500).json({ success: false, error: 'Ralat server' });
  }
});

// POST /:id/stop — Stop warmer
router.post('/:id/stop', (req, res) => {
  try {
    const { id } = req.params;

    const warmer = db.prepare('SELECT * FROM warmer_jobs WHERE id = ? AND user_id = ?').get(id, req.user.id);
    if (!warmer) {
      return res.status(404).json({ success: false, error: 'Warmer tidak dijumpai' });
    }

    stopWarmer(parseInt(id));

    res.json({ success: true });
  } catch (err) {
    console.error('Stop warmer error:', err);
    res.status(500).json({ success: false, error: 'Ralat server' });
  }
});

// DELETE /:id — Delete warmer
router.delete('/:id', (req, res) => {
  try {
    const { id } = req.params;

    const warmer = db.prepare('SELECT * FROM warmer_jobs WHERE id = ? AND user_id = ?').get(id, req.user.id);
    if (!warmer) {
      return res.status(404).json({ success: false, error: 'Warmer tidak dijumpai' });
    }

    // Stop if active
    if (warmer.status === 'active') {
      try {
        stopWarmer(parseInt(id));
      } catch (e) {
        // Ignore stop errors during deletion
      }
    }

    db.prepare('DELETE FROM warmer_jobs WHERE id = ?').run(id);

    res.json({ success: true });
  } catch (err) {
    console.error('Delete warmer error:', err);
    res.status(500).json({ success: false, error: 'Ralat server' });
  }
});

module.exports = router;
