const express = require('express');
const router = express.Router();
const { db } = require('../database');
const waManager = require('../whatsapp/manager');
const { triggerSync } = require('../sync');
const events = require('../events');

function verifyDeviceOwnership(deviceId, userId) {
  return db.prepare('SELECT * FROM devices WHERE id = ? AND user_id = ?').get(deviceId, userId) || null;
}

// Perbualan dengan pagination
router.get('/conversations/:deviceId', (req, res) => {
  try {
    const deviceId = parseInt(req.params.deviceId);
    const device = verifyDeviceOwnership(deviceId, req.user.id);
    if (!device) return res.status(404).json({ success: false, error: 'Peranti tidak dijumpai' });

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const offset = (page - 1) * limit;

    const conversations = db.prepare(`
      SELECT remote_jid,
             MAX(timestamp) as last_time,
             (SELECT message FROM messages m2
              WHERE m2.device_id = ? AND m2.remote_jid = messages.remote_jid
              ORDER BY timestamp DESC LIMIT 1) as last_message,
             COUNT(*) as total_messages
      FROM messages
      WHERE device_id = ?
      GROUP BY remote_jid
      ORDER BY last_time DESC
      LIMIT ? OFFSET ?
    `).all(deviceId, deviceId, limit, offset);

    res.json({ success: true, data: conversations });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Mesej dengan pagination
router.get('/messages/:deviceId/:remoteJid', (req, res) => {
  try {
    const deviceId = parseInt(req.params.deviceId);
    const remoteJid = decodeURIComponent(req.params.remoteJid);
    const device = verifyDeviceOwnership(deviceId, req.user.id);
    if (!device) return res.status(404).json({ success: false, error: 'Peranti tidak dijumpai' });

    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;

    const messages = db.prepare(`
      SELECT * FROM messages
      WHERE device_id = ? AND remote_jid = ?
      ORDER BY timestamp DESC
      LIMIT ? OFFSET ?
    `).all(deviceId, remoteJid, limit, offset);

    res.json({ success: true, data: messages.reverse() });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Hantar mesej
router.post('/send/:deviceId', async (req, res) => {
  try {
    const deviceId = parseInt(req.params.deviceId);
    const device = verifyDeviceOwnership(deviceId, req.user.id);
    if (!device) return res.status(404).json({ success: false, error: 'Peranti tidak dijumpai' });

    const { to, message, type } = req.body;
    if (!to || !message) return res.status(400).json({ success: false, error: 'Penerima dan mesej diperlukan' });

    const jid = waManager.formatJid(to);
    let content;

    switch (type) {
      case 'image':
        content = { image: { url: message }, caption: req.body.caption || '' };
        break;
      case 'document':
        content = { document: { url: message }, mimetype: req.body.mimetype || 'application/octet-stream', fileName: req.body.fileName || 'document' };
        break;
      case 'video':
        content = { video: { url: message }, caption: req.body.caption || '' };
        break;
      case 'audio':
        content = { audio: { url: message }, mimetype: 'audio/mpeg' };
        break;
      default:
        content = { text: message };
        break;
    }

    const result = await waManager.sendMessage(deviceId, jid, content);
    triggerSync('chat: hantar mesej');
    events.emit(req.user.id, 'message-sent', { deviceId, to: jid });
    res.json({ success: true, data: { messageId: result?.key?.id, to: jid, message } });
  } catch (err) {
    res.status(500).json({ success: false, error: `Gagal menghantar mesej: ${err.message}` });
  }
});

// Kenalan
router.get('/contacts/:deviceId', (req, res) => {
  try {
    const deviceId = parseInt(req.params.deviceId);
    const device = verifyDeviceOwnership(deviceId, req.user.id);
    if (!device) return res.status(404).json({ success: false, error: 'Peranti tidak dijumpai' });

    const contacts = db.prepare(`
      SELECT sender,
        MAX(remote_jid) as remote_jid,
        COUNT(*) as message_count,
        MAX(timestamp) as last_seen
      FROM messages
      WHERE device_id = ? AND is_outgoing = 0
      GROUP BY sender
      ORDER BY last_seen DESC
    `).all(deviceId);

    res.json({ success: true, data: contacts });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
