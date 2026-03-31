const express = require('express');
const router = express.Router();
const { requireAuth } = require('../auth');
const blastService = require('../whatsapp/blast');
const { db } = require('../database');
const { triggerSync } = require('../sync');

router.use(requireAuth);

// Senarai semua kerja blast untuk pengguna
router.get('/', (req, res) => {
  try {
    const jobs = blastService.getJobs(req.user.id);
    res.json({ success: true, data: jobs });
  } catch (err) {
    console.log(`[Blast Route] Ralat mendapatkan senarai blast: ${err.message}`);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Cipta kerja blast baru
router.post('/', (req, res) => {
  try {
    const { deviceId, name, message, mediaPath, delayMin, delayMax, phones } = req.body;

    if (!deviceId || !name || !message || !phones || !Array.isArray(phones) || phones.length === 0) {
      return res.status(400).json({ success: false, error: 'Sila lengkapkan semua maklumat yang diperlukan' });
    }

    const device = db.prepare('SELECT * FROM devices WHERE id = ? AND user_id = ?').get(deviceId, req.user.id);
    if (!device) {
      return res.status(403).json({ success: false, error: 'Peranti tidak dijumpai atau bukan milik anda' });
    }

    const job = blastService.createJob(
      req.user.id,
      deviceId,
      name,
      message,
      mediaPath || null,
      delayMin || 1,
      delayMax || 5,
      phones
    );

    triggerSync('blast: cipta kerja baru');
    res.json({ success: true, data: job });
  } catch (err) {
    console.log(`[Blast Route] Ralat mencipta blast: ${err.message}`);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Mulakan kerja blast
router.post('/:id/start', async (req, res) => {
  try {
    const job = db.prepare('SELECT * FROM blast_jobs WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!job) {
      return res.status(404).json({ success: false, error: 'Kerja blast tidak dijumpai' });
    }

    // Mulakan di latar belakang
    blastService.startJob(Number(req.params.id)).catch(err => {
      console.log(`[Blast Route] Ralat menjalankan blast: ${err.message}`);
    });

    triggerSync('blast: mula kerja');
    res.json({ success: true, data: { message: 'Kerja blast sedang dimulakan' } });
  } catch (err) {
    console.log(`[Blast Route] Ralat memulakan blast: ${err.message}`);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Jeda kerja blast
router.post('/:id/pause', (req, res) => {
  try {
    const job = db.prepare('SELECT * FROM blast_jobs WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!job) {
      return res.status(404).json({ success: false, error: 'Kerja blast tidak dijumpai' });
    }

    blastService.pauseJob(Number(req.params.id));
    triggerSync('blast: jeda kerja');
    res.json({ success: true, data: { message: 'Kerja blast telah dijeda' } });
  } catch (err) {
    console.log(`[Blast Route] Ralat menjeda blast: ${err.message}`);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Batalkan kerja blast
router.post('/:id/cancel', (req, res) => {
  try {
    const job = db.prepare('SELECT * FROM blast_jobs WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!job) {
      return res.status(404).json({ success: false, error: 'Kerja blast tidak dijumpai' });
    }

    blastService.cancelJob(Number(req.params.id));
    triggerSync('blast: batal kerja');
    res.json({ success: true, data: { message: 'Kerja blast telah dibatalkan' } });
  } catch (err) {
    console.log(`[Blast Route] Ralat membatalkan blast: ${err.message}`);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Dapatkan butiran kerja blast
router.get('/:id', (req, res) => {
  try {
    const job = blastService.getJob(Number(req.params.id));
    if (!job || job.user_id !== req.user.id) {
      return res.status(404).json({ success: false, error: 'Kerja blast tidak dijumpai' });
    }

    res.json({ success: true, data: job });
  } catch (err) {
    console.log(`[Blast Route] Ralat mendapatkan butiran blast: ${err.message}`);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Padam kerja blast
router.delete('/:id', (req, res) => {
  try {
    const job = db.prepare('SELECT * FROM blast_jobs WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!job) {
      return res.status(404).json({ success: false, error: 'Kerja blast tidak dijumpai' });
    }

    blastService.deleteJob(Number(req.params.id));
    triggerSync('blast: padam kerja');
    res.json({ success: true, data: { message: 'Kerja blast telah dipadam' } });
  } catch (err) {
    console.log(`[Blast Route] Ralat memadam blast: ${err.message}`);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
