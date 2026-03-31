const express = require('express');
const router = express.Router();
const { requireAuth } = require('../auth');
const warmerService = require('../whatsapp/warmer');
const { db } = require('../database');
const { triggerSync } = require('../sync');

router.use(requireAuth);

// Senarai semua sesi warmer untuk pengguna
router.get('/', (req, res) => {
  try {
    const sessions = warmerService.getSessions(req.user.id);
    res.json({ success: true, data: sessions });
  } catch (err) {
    console.log(`[Warmer Route] Ralat mendapatkan senarai warmer: ${err.message}`);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Cipta sesi warmer baru
router.post('/', (req, res) => {
  try {
    const { deviceIds, messages, intervalMin, intervalMax } = req.body;

    if (!deviceIds || !Array.isArray(deviceIds) || deviceIds.length < 2) {
      return res.status(400).json({ success: false, error: 'Sekurang-kurangnya 2 peranti diperlukan' });
    }

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ success: false, error: 'Sila sediakan senarai mesej' });
    }

    // Sahkan semua peranti milik pengguna
    for (const deviceId of deviceIds) {
      const device = db.prepare('SELECT * FROM devices WHERE id = ? AND user_id = ?').get(deviceId, req.user.id);
      if (!device) {
        return res.status(403).json({ success: false, error: `Peranti ${deviceId} tidak dijumpai atau bukan milik anda` });
      }
    }

    const session = warmerService.createSession(
      req.user.id,
      deviceIds,
      messages,
      intervalMin || 30,
      intervalMax || 60
    );

    triggerSync('warmer: cipta sesi baru');
    res.json({ success: true, data: session });
  } catch (err) {
    console.log(`[Warmer Route] Ralat mencipta warmer: ${err.message}`);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Mulakan warmer
router.post('/:id/start', async (req, res) => {
  try {
    const session = db.prepare('SELECT * FROM warmer_sessions WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!session) {
      return res.status(404).json({ success: false, error: 'Sesi warmer tidak dijumpai' });
    }

    warmerService.startWarmer(Number(req.params.id)).catch(err => {
      console.log(`[Warmer Route] Ralat menjalankan warmer: ${err.message}`);
    });

    triggerSync('warmer: mula sesi');
    res.json({ success: true, data: { message: 'Warmer sedang dimulakan' } });
  } catch (err) {
    console.log(`[Warmer Route] Ralat memulakan warmer: ${err.message}`);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Hentikan warmer
router.post('/:id/stop', (req, res) => {
  try {
    const session = db.prepare('SELECT * FROM warmer_sessions WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!session) {
      return res.status(404).json({ success: false, error: 'Sesi warmer tidak dijumpai' });
    }

    warmerService.stopWarmer(Number(req.params.id));
    triggerSync('warmer: henti sesi');
    res.json({ success: true, data: { message: 'Warmer telah dihentikan' } });
  } catch (err) {
    console.log(`[Warmer Route] Ralat menghentikan warmer: ${err.message}`);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Dapatkan butiran warmer
router.get('/:id', (req, res) => {
  try {
    const session = warmerService.getSession(Number(req.params.id));
    if (!session || session.user_id !== req.user.id) {
      return res.status(404).json({ success: false, error: 'Sesi warmer tidak dijumpai' });
    }

    res.json({ success: true, data: session });
  } catch (err) {
    console.log(`[Warmer Route] Ralat mendapatkan butiran warmer: ${err.message}`);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Padam warmer
router.delete('/:id', (req, res) => {
  try {
    const session = db.prepare('SELECT * FROM warmer_sessions WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!session) {
      return res.status(404).json({ success: false, error: 'Sesi warmer tidak dijumpai' });
    }

    warmerService.deleteWarmer(Number(req.params.id));
    triggerSync('warmer: padam sesi');
    res.json({ success: true, data: { message: 'Warmer telah dipadam' } });
  } catch (err) {
    console.log(`[Warmer Route] Ralat memadam warmer: ${err.message}`);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
