const express = require('express');
const router = express.Router();
const { requireAuth } = require('../auth');
const autoReplyService = require('../whatsapp/autoReply');
const db = require('../database');

router.use(requireAuth);

// Senarai peraturan auto-reply
router.get('/', (req, res) => {
  try {
    const deviceId = req.query.deviceId ? Number(req.query.deviceId) : null;

    if (deviceId) {
      const device = db.prepare('SELECT * FROM devices WHERE id = ? AND user_id = ?').get(deviceId, req.user.id);
      if (!device) {
        return res.status(403).json({ success: false, error: 'Peranti tidak dijumpai atau bukan milik anda' });
      }
    }

    const rules = autoReplyService.getRules(req.user.id, deviceId);
    res.json({ success: true, data: rules });
  } catch (err) {
    console.log(`[AutoReply Route] Ralat mendapatkan senarai peraturan: ${err.message}`);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Cipta peraturan auto-reply baru
router.post('/', (req, res) => {
  try {
    const { deviceId, triggerWord, replyMessage, matchType } = req.body;

    if (!deviceId || !triggerWord || !replyMessage) {
      return res.status(400).json({ success: false, error: 'Sila lengkapkan semua maklumat yang diperlukan' });
    }

    const validMatchTypes = ['exact', 'contains', 'startswith'];
    if (matchType && !validMatchTypes.includes(matchType)) {
      return res.status(400).json({ success: false, error: 'Jenis padanan tidak sah. Gunakan: exact, contains, atau startswith' });
    }

    const device = db.prepare('SELECT * FROM devices WHERE id = ? AND user_id = ?').get(deviceId, req.user.id);
    if (!device) {
      return res.status(403).json({ success: false, error: 'Peranti tidak dijumpai atau bukan milik anda' });
    }

    const rule = autoReplyService.createRule(
      req.user.id,
      deviceId,
      triggerWord,
      replyMessage,
      matchType || 'contains'
    );

    res.json({ success: true, data: rule });
  } catch (err) {
    console.log(`[AutoReply Route] Ralat mencipta peraturan: ${err.message}`);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Kemaskini peraturan auto-reply
router.put('/:id', (req, res) => {
  try {
    const rule = db.prepare('SELECT * FROM auto_replies WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!rule) {
      return res.status(404).json({ success: false, error: 'Peraturan tidak dijumpai' });
    }

    const { triggerWord, replyMessage, matchType, isActive } = req.body;

    const updatedRule = autoReplyService.updateRule(
      Number(req.params.id),
      triggerWord || rule.trigger_word,
      replyMessage || rule.reply_message,
      matchType || rule.match_type,
      isActive !== undefined ? isActive : rule.is_active
    );

    res.json({ success: true, data: updatedRule });
  } catch (err) {
    console.log(`[AutoReply Route] Ralat mengemaskini peraturan: ${err.message}`);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Padam peraturan auto-reply
router.delete('/:id', (req, res) => {
  try {
    const rule = db.prepare('SELECT * FROM auto_replies WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!rule) {
      return res.status(404).json({ success: false, error: 'Peraturan tidak dijumpai' });
    }

    autoReplyService.deleteRule(Number(req.params.id));
    res.json({ success: true, data: { message: 'Peraturan telah dipadam' } });
  } catch (err) {
    console.log(`[AutoReply Route] Ralat memadam peraturan: ${err.message}`);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Tukar status aktif/tidak aktif
router.post('/:id/toggle', (req, res) => {
  try {
    const rule = db.prepare('SELECT * FROM auto_replies WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!rule) {
      return res.status(404).json({ success: false, error: 'Peraturan tidak dijumpai' });
    }

    const updatedRule = autoReplyService.toggleRule(Number(req.params.id));
    res.json({ success: true, data: updatedRule });
  } catch (err) {
    console.log(`[AutoReply Route] Ralat menukar status peraturan: ${err.message}`);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
