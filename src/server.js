const express = require('express');
const path = require('path');
const config = require('./config');
const { db } = require('./database');
const { requireAuth } = require('./auth');

const app = express();

// Middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Cookie-based auth
const cookieParser = require('cookie-parser');
app.use(cookieParser(config.SESSION_SECRET));

// Static files
app.use(express.static(path.join(__dirname, '..', 'public')));

// Auth routes (no middleware needed)
app.use('/api/auth', require('./routes/auth'));

// Protected routes
app.use('/api/devices', require('./routes/devices'));
app.use('/api/chat', require('./routes/chat'));
app.use('/api/blast', require('./routes/blast'));
app.use('/api/warmer', require('./routes/warmer'));
app.use('/api/checker', require('./routes/checker'));
app.use('/api/autoreply', require('./routes/autoReply'));
app.use('/api/status', require('./routes/status'));

// Dashboard stats endpoint
app.get('/api/stats', requireAuth, (req, res) => {
  try {
    const userId = req.user.id;
    const devices = db.prepare('SELECT COUNT(*) as count FROM devices WHERE user_id = ?').get(userId);
    const messages = db.prepare('SELECT COUNT(*) as count FROM messages WHERE device_id IN (SELECT id FROM devices WHERE user_id = ?)').get(userId);
    const autoReplies = db.prepare('SELECT COUNT(*) as count FROM auto_replies WHERE user_id = ? AND is_active = 1').get(userId);
    const blasts = db.prepare('SELECT COUNT(*) as count FROM blast_jobs WHERE user_id = ? AND status = ?').get(userId, 'running');

    res.json({
      success: true,
      data: {
        totalDevices: devices.count,
        totalMessages: messages.count,
        activeAutoReplies: autoReplies.count,
        runningBlasts: blasts.count
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// SPA fallback - serve index.html for non-API routes
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api')) {
    const filePath = path.join(__dirname, '..', 'public', req.path);
    res.sendFile(filePath, (err) => {
      if (err) {
        res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
      }
    });
  }
});

// Initialize auto-reply listener
const autoReplyService = require('./whatsapp/autoReply');

const PORT = config.PORT;
app.listen(PORT, () => {
  console.log(`Multichat berjalan di port ${PORT}`);
  console.log(`Direktori data: ${config.DATA_DIR}`);
});
