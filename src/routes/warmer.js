const express = require('express');
const router = express.Router();
const warmerService = require('../whatsapp/warmer');
const { db } = require('../database');
const { triggerSync } = require('../sync');

router.get('/', (req, res) => {
  try {
    const sessions = warmerService.getSessions(req.user.id);
    res.json({ success: true, data: sessions });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/', (req, res) => {
  try {
    const { deviceIds, messages } = req.body;
    // Accept both field name formats
    const intervalMin = req.body.intervalMin || req.body.minInterval || 30;
    const intervalMax = req.body.intervalMax || req.body.maxInterval || 60;

    if (!deviceIds || !Array.isArray(deviceIds) || deviceIds.length < 2) {
      return res.status(400).json({ success: false, error: 'Sekurang-kurangnya 2 peranti diperlukan' });
    }
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ success: false, error: 'Sila sediakan senarai mesej' });
    }

    for (const deviceId of deviceIds) {
      const device = db.prepare('SELECT * FROM devices WHERE id = ? AND user_id = ?').get(deviceId, req.user.id);
      if (!device) return res.status(403).json({ success: false, error: `Peranti ${deviceId} tidak dijumpai` });
    }

    const session = warmerService.createSession(req.user.id, deviceIds, messages, intervalMin, intervalMax);
    triggerSync('warmer: cipta sesi baru');
    res.json({ success: true, data: session });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/:id/start', async (req, res) => {
  try {
    const session = db.prepare('SELECT * FROM warmer_sessions WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!session) return res.status(404).json({ success: false, error: 'Sesi warmer tidak dijumpai' });

    warmerService.startWarmer(Number(req.params.id)).catch(err => {
      console.log(`[Warmer Route] Ralat: ${err.message}`);
    });
    triggerSync('warmer: mula sesi');
    res.json({ success: true, data: { message: 'Warmer sedang dimulakan' } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/:id/stop', (req, res) => {
  try {
    const session = db.prepare('SELECT * FROM warmer_sessions WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!session) return res.status(404).json({ success: false, error: 'Sesi warmer tidak dijumpai' });

    warmerService.stopWarmer(Number(req.params.id));
    triggerSync('warmer: henti sesi');
    res.json({ success: true, data: { message: 'Warmer telah dihentikan' } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/:id', (req, res) => {
  try {
    const session = warmerService.getSession(Number(req.params.id));
    if (!session || session.user_id !== req.user.id) {
      return res.status(404).json({ success: false, error: 'Sesi warmer tidak dijumpai' });
    }
    res.json({ success: true, data: session });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.delete('/:id', (req, res) => {
  try {
    const session = db.prepare('SELECT * FROM warmer_sessions WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!session) return res.status(404).json({ success: false, error: 'Sesi warmer tidak dijumpai' });

    warmerService.deleteWarmer(Number(req.params.id));
    triggerSync('warmer: padam sesi');
    res.json({ success: true, data: { message: 'Warmer telah dipadam' } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
