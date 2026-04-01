const express = require('express');
const path = require('path');
const cors = require('cors');
const config = require('./config');
require('./logger'); // Activate file logging
const { db } = require('./database');
const { requireAuth, requireAdmin } = require('./auth');
const events = require('./events');

const app = express();

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

const cookieParser = require('cookie-parser');
app.use(cookieParser(config.SESSION_SECRET));

// Static files
app.use(express.static(path.join(__dirname, '..', 'public')));

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ success: true, status: 'ok', uptime: process.uptime(), timestamp: Date.now() });
});

// Auth routes (no middleware needed)
app.use('/api/auth', require('./routes/auth'));

// Protected routes - apply requireAuth globally
app.use('/api/devices', requireAuth, require('./routes/devices'));
app.use('/api/chat', requireAuth, require('./routes/chat'));
app.use('/api/blast', requireAuth, require('./routes/blast'));
app.use('/api/warmer', requireAuth, require('./routes/warmer'));
app.use('/api/checker', requireAuth, require('./routes/checker'));
app.use('/api/autoreply', requireAuth, require('./routes/autoReply'));
app.use('/api/status', requireAuth, require('./routes/status'));

// Admin routes
app.use('/api/admin', requireAdmin, require('./routes/admin'));

// Dashboard stats endpoint
app.get('/api/stats', requireAuth, (req, res) => {
  try {
    const userId = req.user.id;
    const devices = db.prepare('SELECT COUNT(*) as count FROM devices WHERE user_id = ?').get(userId);
    const messages = db.prepare('SELECT COUNT(*) as count FROM messages WHERE device_id IN (SELECT id FROM devices WHERE user_id = ?)').get(userId);
    const autoReplies = db.prepare('SELECT COUNT(*) as count FROM auto_replies WHERE user_id = ? AND is_active = 1').get(userId);
    const blasts = db.prepare('SELECT COUNT(*) as count FROM blast_jobs WHERE user_id = ? AND status = ?').get(userId, 'running');
    const activeDevices = db.prepare("SELECT COUNT(*) as count FROM devices WHERE user_id = ? AND status = 'connected'").get(userId);

    res.json({
      success: true,
      data: {
        totalDevices: devices.count,
        activeDevices: activeDevices.count,
        totalMessages: messages.count,
        activeAutoReplies: autoReplies.count,
        runningBlasts: blasts.count
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// SSE endpoint for real-time updates
app.get('/api/events', requireAuth, (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();
  events.addClient(req.user.id, res);
  res.write('event: connected\ndata: {}\n\n');

  // Keep-alive every 30s
  const keepAlive = setInterval(() => {
    try { res.write(': keepalive\n\n'); } catch (e) { clearInterval(keepAlive); }
  }, 30000);
  res.on('close', () => clearInterval(keepAlive));
});

// 404 handler for API
app.use('/api', (req, res) => {
  res.status(404).json({ success: false, error: 'Endpoint API tidak dijumpai' });
});

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// Initialize services
const autoReplyService = require('./whatsapp/autoReply');
const { initSync, syncNow } = require('./sync');

const PORT = config.PORT;
app.listen(PORT, async () => {
  console.log(`Multichat berjalan di port ${PORT}`);
  console.log(`Direktori data: ${config.DATA_DIR}`);

  await initSync();

  // Auto-reconnect devices
  try {
    const fs = require('fs');
    const waManager = require('./whatsapp/manager');
    const devices = db.prepare('SELECT * FROM devices').all();

    for (const device of devices) {
      const authDir = path.join(config.SESSIONS_DIR, `device_${device.id}`);
      const credsFile = path.join(authDir, 'creds.json');

      if (fs.existsSync(credsFile)) {
        console.log(`[Auto-Reconnect] Menyambung semula peranti #${device.id} (${device.name})...`);
        try {
          await waManager.startSession(device.id, 'qr', null);
          console.log(`[Auto-Reconnect] Peranti #${device.id} berjaya dimulakan`);
        } catch (err) {
          console.error(`[Auto-Reconnect] Gagal menyambung peranti #${device.id}: ${err.message}`);
          db.prepare("UPDATE devices SET status = ?, updated_at = datetime('now') WHERE id = ?")
            .run('disconnected', device.id);
        }
        await new Promise(r => setTimeout(r, 3000));
      } else {
        db.prepare("UPDATE devices SET status = ?, updated_at = datetime('now') WHERE id = ?")
          .run('disconnected', device.id);
      }
    }
    console.log('[Auto-Reconnect] Proses sambung semula selesai');
  } catch (err) {
    console.error('[Auto-Reconnect] Ralat:', err.message);
  }
});

// Graceful shutdown
async function gracefulShutdown(signal) {
  console.log(`\n[Shutdown] Menerima ${signal}. Menyimpan data...`);
  try {
    await syncNow('sync: penutupan server');
    console.log('[Shutdown] Data berjaya disimpan.');
  } catch (err) {
    console.error('[Shutdown] Gagal simpan data:', err.message);
  }
  process.exit(0);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
