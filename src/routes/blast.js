const express = require('express');
const router = express.Router();
const { db } = require('../database');
const blastService = require('../whatsapp/blast');
const { triggerSync } = require('../sync');

// Senarai blast jobs
router.get('/', (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const offset = (page - 1) * limit;

    const jobs = db.prepare('SELECT * FROM blast_jobs WHERE user_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?')
      .all(req.user.id, limit, offset);
    const total = db.prepare('SELECT COUNT(*) as count FROM blast_jobs WHERE user_id = ?').get(req.user.id).count;

    res.json({ success: true, data: jobs, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Cipta blast baru (accept both field name formats)
router.post('/', (req, res) => {
  try {
    const { name, deviceId, message, phones } = req.body;

    // Accept both frontend field names and backend field names
    const delayMin = req.body.delayMin || req.body.minDelay || 5;
    const delayMax = req.body.delayMax || req.body.maxDelay || 15;

    if (!name) return res.status(400).json({ success: false, error: 'Nama broadcast diperlukan' });
    if (!deviceId) return res.status(400).json({ success: false, error: 'Sila pilih peranti' });
    if (!message) return res.status(400).json({ success: false, error: 'Mesej diperlukan' });
    if (!phones || !Array.isArray(phones) || phones.length === 0) {
      return res.status(400).json({ success: false, error: 'Senarai nombor diperlukan' });
    }

    // Validate phone numbers
    const validPhones = phones.map(p => p.replace(/[\s\-\+\(\)]/g, '')).filter(p => /^[1-9]\d{7,14}$/.test(p));
    if (validPhones.length === 0) {
      return res.status(400).json({ success: false, error: 'Tiada nombor telefon yang sah' });
    }

    const device = db.prepare('SELECT * FROM devices WHERE id = ? AND user_id = ?').get(deviceId, req.user.id);
    if (!device) return res.status(403).json({ success: false, error: 'Peranti tidak dijumpai' });

    const job = blastService.createJob(req.user.id, Number(deviceId), name, message, validPhones, delayMin, delayMax);
    triggerSync('blast: cipta baru');
    res.json({ success: true, data: job });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Detail blast job
router.get('/:id', (req, res) => {
  try {
    const job = db.prepare('SELECT * FROM blast_jobs WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!job) return res.status(404).json({ success: false, error: 'Broadcast tidak dijumpai' });

    const recipients = db.prepare('SELECT * FROM blast_recipients WHERE blast_id = ?').all(job.id);
    res.json({ success: true, data: { ...job, recipients } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Start blast
router.post('/:id/start', async (req, res) => {
  try {
    const job = db.prepare('SELECT * FROM blast_jobs WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!job) return res.status(404).json({ success: false, error: 'Broadcast tidak dijumpai' });

    blastService.startJob(Number(req.params.id)).catch(err => {
      console.error(`[Blast] Ralat menjalankan blast: ${err.message}`);
    });
    triggerSync('blast: mula');
    res.json({ success: true, data: { message: 'Broadcast dimulakan' } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Pause blast
router.post('/:id/pause', (req, res) => {
  try {
    const job = db.prepare('SELECT * FROM blast_jobs WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!job) return res.status(404).json({ success: false, error: 'Broadcast tidak dijumpai' });

    blastService.pauseJob(Number(req.params.id));
    triggerSync('blast: jeda');
    res.json({ success: true, data: { message: 'Broadcast dijedakan' } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Cancel blast
router.post('/:id/cancel', (req, res) => {
  try {
    const job = db.prepare('SELECT * FROM blast_jobs WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!job) return res.status(404).json({ success: false, error: 'Broadcast tidak dijumpai' });

    blastService.cancelJob(Number(req.params.id));
    triggerSync('blast: batal');
    res.json({ success: true, data: { message: 'Broadcast dibatalkan' } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Delete blast
router.delete('/:id', (req, res) => {
  try {
    const job = db.prepare('SELECT * FROM blast_jobs WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!job) return res.status(404).json({ success: false, error: 'Broadcast tidak dijumpai' });

    if (job.status === 'running') {
      blastService.cancelJob(Number(req.params.id));
    }
    db.prepare('DELETE FROM blast_recipients WHERE blast_id = ?').run(job.id);
    db.prepare('DELETE FROM blast_jobs WHERE id = ?').run(job.id);
    triggerSync('blast: padam');
    res.json({ success: true, data: { message: 'Broadcast dipadam' } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
