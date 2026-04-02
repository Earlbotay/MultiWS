const express = require('express');
const router = express.Router();
const db = require('../database');
const { startBlast, stopBlast } = require('../whatsapp/blast');

// GET / — List user's blast jobs
router.get('/', (req, res) => {
  try {
    const jobs = db.prepare(`
      SELECT bj.*, d.name AS device_name 
      FROM blast_jobs bj
      LEFT JOIN devices d ON bj.device_id = d.id
      WHERE bj.user_id = ? 
      ORDER BY bj.created_at DESC
    `).all(req.user.id);

    res.json({ success: true, data: jobs });
  } catch (err) {
    console.error('List blast jobs error:', err);
    res.status(500).json({ success: false, error: 'Ralat server' });
  }
});

// POST / — Create blast job
router.post('/', (req, res) => {
  try {
    const { deviceId, message, recipients } = req.body;

    // Accept both naming conventions for delay
    const delayMin = req.body.delayMin || req.body.minDelay || 1;
    const delayMax = req.body.delayMax || req.body.maxDelay || 5;

    if (!deviceId || !message || !recipients || !Array.isArray(recipients) || recipients.length === 0) {
      return res.status(400).json({ success: false, error: 'deviceId, message, dan recipients diperlukan' });
    }

    // Verify device ownership
    const device = db.prepare('SELECT * FROM devices WHERE id = ? AND user_id = ?').get(deviceId, req.user.id);
    if (!device) {
      return res.status(404).json({ success: false, error: 'Peranti tidak dijumpai' });
    }

    // Insert blast job
    const jobResult = db.prepare(`
      INSERT INTO blast_jobs (user_id, device_id, message, total, delay_min, delay_max) 
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(req.user.id, deviceId, message, recipients.length, delayMin, delayMax);

    const blastId = jobResult.lastInsertRowid;

    // Insert recipients
    const insertRecipient = db.prepare('INSERT INTO blast_recipients (blast_id, phone) VALUES (?, ?)');
    const insertMany = db.transaction((items) => {
      for (const phone of items) {
        insertRecipient.run(blastId, phone);
      }
    });
    insertMany(recipients);

    const job = db.prepare('SELECT * FROM blast_jobs WHERE id = ?').get(blastId);

    res.json({ success: true, data: job });
  } catch (err) {
    console.error('Create blast job error:', err);
    res.status(500).json({ success: false, error: 'Ralat server' });
  }
});

// GET /:id — Blast detail with recipients (paginated)
router.get('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 50));
    const offset = (page - 1) * limit;

    const job = db.prepare(`
      SELECT bj.*, d.name AS device_name 
      FROM blast_jobs bj
      LEFT JOIN devices d ON bj.device_id = d.id
      WHERE bj.id = ? AND bj.user_id = ?
    `).get(id, req.user.id);

    if (!job) {
      return res.status(404).json({ success: false, error: 'Blast job tidak dijumpai' });
    }

    const total = db.prepare('SELECT COUNT(*) AS count FROM blast_recipients WHERE blast_id = ?').get(id).count;

    const recipients = db.prepare(`
      SELECT * FROM blast_recipients 
      WHERE blast_id = ? 
      ORDER BY id ASC 
      LIMIT ? OFFSET ?
    `).all(id, limit, offset);

    res.json({
      success: true,
      data: { job, recipients, page, limit, total }
    });
  } catch (err) {
    console.error('Get blast detail error:', err);
    res.status(500).json({ success: false, error: 'Ralat server' });
  }
});

// POST /:id/start — Start blast
router.post('/:id/start', (req, res) => {
  try {
    const { id } = req.params;

    const job = db.prepare('SELECT * FROM blast_jobs WHERE id = ? AND user_id = ?').get(id, req.user.id);
    if (!job) {
      return res.status(404).json({ success: false, error: 'Blast job tidak dijumpai' });
    }

    if (job.status === 'running') {
      return res.status(400).json({ success: false, error: 'Blast sudah sedang berjalan' });
    }

    if (job.status === 'completed') {
      return res.status(400).json({ success: false, error: 'Blast sudah selesai' });
    }

    // Start blast asynchronously (don't await)
    startBlast(parseInt(id));

    res.json({ success: true });
  } catch (err) {
    console.error('Start blast error:', err);
    res.status(500).json({ success: false, error: 'Ralat server' });
  }
});

// POST /:id/stop — Stop blast
router.post('/:id/stop', (req, res) => {
  try {
    const { id } = req.params;

    const job = db.prepare('SELECT * FROM blast_jobs WHERE id = ? AND user_id = ?').get(id, req.user.id);
    if (!job) {
      return res.status(404).json({ success: false, error: 'Blast job tidak dijumpai' });
    }

    stopBlast(parseInt(id));

    res.json({ success: true });
  } catch (err) {
    console.error('Stop blast error:', err);
    res.status(500).json({ success: false, error: 'Ralat server' });
  }
});

module.exports = router;
