const express = require('express');
const router = express.Router();
const db = require('../database');
const WAManager = require('../whatsapp/manager');

// Helper: format phone to JID
function formatJid(phone) {
  // Remove all non-digit characters
  let cleaned = phone.replace(/[^0-9]/g, '');
  // Ensure it ends with @s.whatsapp.net
  if (!cleaned.includes('@')) {
    return cleaned + '@s.whatsapp.net';
  }
  return cleaned;
}

// GET /:deviceId/conversations — List conversations
router.get('/:deviceId/conversations', (req, res) => {
  try {
    const { deviceId } = req.params;

    const device = db.prepare('SELECT * FROM devices WHERE id = ? AND user_id = ?').get(deviceId, req.user.id);
    if (!device) {
      return res.status(404).json({ success: false, error: 'Peranti tidak dijumpai' });
    }

    const conversations = db.prepare(`
      SELECT 
        remote_jid,
        message AS last_message,
        timestamp AS last_time
      FROM messages
      WHERE device_id = ? AND id IN (
        SELECT MAX(id) FROM messages WHERE device_id = ? GROUP BY remote_jid
      )
      ORDER BY timestamp DESC
    `).all(deviceId, deviceId);

    res.json({ success: true, data: conversations });
  } catch (err) {
    console.error('List conversations error:', err);
    res.status(500).json({ success: false, error: 'Ralat server' });
  }
});

// GET /:deviceId/messages/:jid — Messages in conversation with pagination
router.get('/:deviceId/messages/:jid', (req, res) => {
  try {
    const { deviceId, jid } = req.params;
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 50));
    const offset = (page - 1) * limit;

    const device = db.prepare('SELECT * FROM devices WHERE id = ? AND user_id = ?').get(deviceId, req.user.id);
    if (!device) {
      return res.status(404).json({ success: false, error: 'Peranti tidak dijumpai' });
    }

    const total = db.prepare('SELECT COUNT(*) AS count FROM messages WHERE device_id = ? AND remote_jid = ?').get(deviceId, jid).count;

    const messages = db.prepare(`
      SELECT * FROM messages 
      WHERE device_id = ? AND remote_jid = ? 
      ORDER BY timestamp DESC 
      LIMIT ? OFFSET ?
    `).all(deviceId, jid, limit, offset);

    res.json({
      success: true,
      data: { messages, page, limit, total }
    });
  } catch (err) {
    console.error('List messages error:', err);
    res.status(500).json({ success: false, error: 'Ralat server' });
  }
});

// POST /:deviceId/send — Send message
router.post('/:deviceId/send', async (req, res) => {
  try {
    const { deviceId } = req.params;
    const { to, message } = req.body;

    if (!to || !message) {
      return res.status(400).json({ success: false, error: 'Nombor penerima dan mesej diperlukan' });
    }

    const device = db.prepare('SELECT * FROM devices WHERE id = ? AND user_id = ?').get(deviceId, req.user.id);
    if (!device) {
      return res.status(404).json({ success: false, error: 'Peranti tidak dijumpai' });
    }

    const jid = formatJid(to);
    const manager = WAManager.getInstance();
    await manager.sendMessage(parseInt(deviceId), jid, message);

    // Save to messages table
    const timestamp = Math.floor(Date.now() / 1000);
    db.prepare(`
      INSERT INTO messages (device_id, remote_jid, from_me, message, timestamp, status) 
      VALUES (?, ?, 1, ?, ?, 'sent')
    `).run(deviceId, jid, message, timestamp);

    res.json({ success: true });
  } catch (err) {
    console.error('Send message error:', err);
    res.status(500).json({ success: false, error: err.message || 'Ralat server' });
  }
});

module.exports = router;
