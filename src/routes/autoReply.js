const express = require('express');
const router = express.Router();
const db = require('../database');

// GET / — List user's auto-reply rules
router.get('/', (req, res) => {
  try {
    const rules = db.prepare(`
      SELECT ar.*, d.name AS device_name 
      FROM auto_replies ar
      LEFT JOIN devices d ON ar.device_id = d.id
      WHERE ar.user_id = ? 
      ORDER BY ar.created_at DESC
    `).all(req.user.id);

    res.json({ success: true, data: rules });
  } catch (err) {
    console.error('List auto-reply rules error:', err);
    res.status(500).json({ success: false, error: 'Ralat server' });
  }
});

// POST / — Create rule
router.post('/', (req, res) => {
  try {
    const { deviceId, triggerWord, response, matchType } = req.body;

    if (!triggerWord || !response) {
      return res.status(400).json({ success: false, error: 'triggerWord dan response diperlukan' });
    }

    const validMatchTypes = ['exact', 'contains', 'startsWith'];
    const finalMatchType = validMatchTypes.includes(matchType) ? matchType : 'contains';

    // Verify device ownership if deviceId provided
    if (deviceId) {
      const device = db.prepare('SELECT * FROM devices WHERE id = ? AND user_id = ?').get(deviceId, req.user.id);
      if (!device) {
        return res.status(404).json({ success: false, error: 'Peranti tidak dijumpai' });
      }
    }

    const result = db.prepare(`
      INSERT INTO auto_replies (user_id, device_id, trigger_word, response, match_type) 
      VALUES (?, ?, ?, ?, ?)
    `).run(req.user.id, deviceId || null, triggerWord, response, finalMatchType);

    const rule = db.prepare(`
      SELECT ar.*, d.name AS device_name 
      FROM auto_replies ar
      LEFT JOIN devices d ON ar.device_id = d.id
      WHERE ar.id = ?
    `).get(result.lastInsertRowid);

    res.json({ success: true, data: rule });
  } catch (err) {
    console.error('Create auto-reply rule error:', err);
    res.status(500).json({ success: false, error: 'Ralat server' });
  }
});

// PUT /:id — Edit rule
router.put('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { deviceId, triggerWord, response, matchType } = req.body;

    const rule = db.prepare('SELECT * FROM auto_replies WHERE id = ? AND user_id = ?').get(id, req.user.id);
    if (!rule) {
      return res.status(404).json({ success: false, error: 'Auto-reply rule tidak dijumpai' });
    }

    // Verify device ownership if deviceId provided
    if (deviceId) {
      const device = db.prepare('SELECT * FROM devices WHERE id = ? AND user_id = ?').get(deviceId, req.user.id);
      if (!device) {
        return res.status(404).json({ success: false, error: 'Peranti tidak dijumpai' });
      }
    }

    const validMatchTypes = ['exact', 'contains', 'startsWith'];
    const finalMatchType = matchType && validMatchTypes.includes(matchType) ? matchType : rule.match_type;

    db.prepare(`
      UPDATE auto_replies 
      SET device_id = ?, trigger_word = ?, response = ?, match_type = ?
      WHERE id = ?
    `).run(
      deviceId !== undefined ? (deviceId || null) : rule.device_id,
      triggerWord || rule.trigger_word,
      response || rule.response,
      finalMatchType,
      id
    );

    const updated = db.prepare(`
      SELECT ar.*, d.name AS device_name 
      FROM auto_replies ar
      LEFT JOIN devices d ON ar.device_id = d.id
      WHERE ar.id = ?
    `).get(id);

    res.json({ success: true, data: updated });
  } catch (err) {
    console.error('Edit auto-reply rule error:', err);
    res.status(500).json({ success: false, error: 'Ralat server' });
  }
});

// PUT /:id/toggle — Toggle is_active
router.put('/:id/toggle', (req, res) => {
  try {
    const { id } = req.params;

    const rule = db.prepare('SELECT * FROM auto_replies WHERE id = ? AND user_id = ?').get(id, req.user.id);
    if (!rule) {
      return res.status(404).json({ success: false, error: 'Auto-reply rule tidak dijumpai' });
    }

    const newActive = rule.is_active ? 0 : 1;
    db.prepare('UPDATE auto_replies SET is_active = ? WHERE id = ?').run(newActive, id);

    const updated = db.prepare(`
      SELECT ar.*, d.name AS device_name 
      FROM auto_replies ar
      LEFT JOIN devices d ON ar.device_id = d.id
      WHERE ar.id = ?
    `).get(id);

    res.json({ success: true, data: updated });
  } catch (err) {
    console.error('Toggle auto-reply rule error:', err);
    res.status(500).json({ success: false, error: 'Ralat server' });
  }
});

// DELETE /:id — Delete rule
router.delete('/:id', (req, res) => {
  try {
    const { id } = req.params;

    const rule = db.prepare('SELECT * FROM auto_replies WHERE id = ? AND user_id = ?').get(id, req.user.id);
    if (!rule) {
      return res.status(404).json({ success: false, error: 'Auto-reply rule tidak dijumpai' });
    }

    db.prepare('DELETE FROM auto_replies WHERE id = ?').run(id);

    res.json({ success: true });
  } catch (err) {
    console.error('Delete auto-reply rule error:', err);
    res.status(500).json({ success: false, error: 'Ralat server' });
  }
});

module.exports = router;
