const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const archiver = require('archiver');
const db = require('../database');
const config = require('../config');
const WAManager = require('../whatsapp/manager');

// GET / — List user's devices
router.get('/', (req, res) => {
  try {
    const devices = db.prepare('SELECT * FROM devices WHERE user_id = ? ORDER BY created_at DESC').all(req.user.id);
    res.json({ success: true, data: devices });
  } catch (err) {
    console.error('List devices error:', err);
    res.status(500).json({ success: false, error: 'Ralat server' });
  }
});

// POST / — Add device
router.post('/', (req, res) => {
  try {
    const { name } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, error: 'Nama peranti diperlukan' });
    }

    const trimmedName = name.trim();

    // Check duplicate name for this user
    const existing = db.prepare('SELECT id FROM devices WHERE user_id = ? AND name = ?').get(req.user.id, trimmedName);
    if (existing) {
      return res.status(409).json({ success: false, error: 'Peranti dengan nama ini sudah wujud' });
    }

    const result = db.prepare('INSERT INTO devices (user_id, name) VALUES (?, ?)').run(req.user.id, trimmedName);
    const device = db.prepare('SELECT * FROM devices WHERE id = ?').get(result.lastInsertRowid);

    res.json({ success: true, data: device });
  } catch (err) {
    console.error('Add device error:', err);
    res.status(500).json({ success: false, error: 'Ralat server' });
  }
});

// POST /:id/connect — Connect device
router.post('/:id/connect', async (req, res) => {
  try {
    const { id } = req.params;
    const { method } = req.body;

    if (!method || !['qr', 'pairing'].includes(method)) {
      return res.status(400).json({ success: false, error: 'Kaedah sambungan tidak sah. Gunakan "qr" atau "pairing".' });
    }

    const device = db.prepare('SELECT * FROM devices WHERE id = ? AND user_id = ?').get(id, req.user.id);
    if (!device) {
      return res.status(404).json({ success: false, error: 'Peranti tidak dijumpai' });
    }

    const manager = WAManager.getInstance();
    await manager.connect(parseInt(id), req.user.id, method);

    res.json({ success: true, message: 'Sambungan dimulakan' });
  } catch (err) {
    console.error('Connect device error:', err);
    res.status(500).json({ success: false, error: err.message || 'Ralat server' });
  }
});

// POST /:id/disconnect — Disconnect device
router.post('/:id/disconnect', async (req, res) => {
  try {
    const { id } = req.params;

    const device = db.prepare('SELECT * FROM devices WHERE id = ? AND user_id = ?').get(id, req.user.id);
    if (!device) {
      return res.status(404).json({ success: false, error: 'Peranti tidak dijumpai' });
    }

    const manager = WAManager.getInstance();
    await manager.disconnect(parseInt(id));

    res.json({ success: true });
  } catch (err) {
    console.error('Disconnect device error:', err);
    res.status(500).json({ success: false, error: err.message || 'Ralat server' });
  }
});

// DELETE /:id — Delete device
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const device = db.prepare('SELECT * FROM devices WHERE id = ? AND user_id = ?').get(id, req.user.id);
    if (!device) {
      return res.status(404).json({ success: false, error: 'Peranti tidak dijumpai' });
    }

    // Disconnect if connected
    const manager = WAManager.getInstance();
    try {
      await manager.disconnect(parseInt(id));
    } catch (e) {
      // Ignore disconnect errors during deletion
    }

    // Delete from DB
    db.prepare('DELETE FROM devices WHERE id = ?').run(id);

    // Delete session folder
    const sessionDir = path.join(config.DATA_DIR, 'sessions', String(id));
    if (fs.existsSync(sessionDir)) {
      fs.rmSync(sessionDir, { recursive: true, force: true });
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Delete device error:', err);
    res.status(500).json({ success: false, error: 'Ralat server' });
  }
});

// GET /:id/download — Download session backup
router.get('/:id/download', (req, res) => {
  try {
    const { id } = req.params;

    const device = db.prepare('SELECT * FROM devices WHERE id = ? AND user_id = ?').get(id, req.user.id);
    if (!device) {
      return res.status(404).json({ success: false, error: 'Peranti tidak dijumpai' });
    }

    if (device.status !== 'connected') {
      return res.status(400).json({ success: false, error: 'Peranti mesti disambungkan untuk memuat turun sesi' });
    }

    const sessionDir = path.join(config.DATA_DIR, 'sessions', String(id));
    if (!fs.existsSync(sessionDir)) {
      return res.status(404).json({ success: false, error: 'Folder sesi tidak dijumpai' });
    }

    const filename = `session-${device.name.replace(/[^a-zA-Z0-9-_]/g, '_')}-${id}.tar.gz`;
    res.setHeader('Content-Type', 'application/gzip');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    const archive = archiver('tar', { gzip: true });
    archive.on('error', (err) => {
      console.error('Archive error:', err);
      if (!res.headersSent) {
        res.status(500).json({ success: false, error: 'Ralat semasa membuat arkib' });
      }
    });

    archive.pipe(res);
    archive.directory(sessionDir, false);
    archive.finalize();
  } catch (err) {
    console.error('Download session error:', err);
    res.status(500).json({ success: false, error: 'Ralat server' });
  }
});

module.exports = router;
