const express = require('express');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const path = require('path');
const config = require('./config');
const { db, seedAdmin } = require('./database');
const { requireAuth } = require('./auth');
const { addClient } = require('./events');
const { initSync, syncData } = require('./sync');
const WAManager = require('./whatsapp/manager');
const { getUserStats } = require('./whatsapp/status');
require('./logger');

const app = express();

// ── Middleware ──────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser(config.SESSION_SECRET));
app.use(cors({ origin: true, credentials: true }));
app.use(express.static(path.join(__dirname, '../public')));

// ── Routes ─────────────────────────────────────────────────

// 1. Auth routes (public — no requireAuth)
app.use('/api/auth', require('./routes/auth'));

// 2. Health check (public — no requireAuth)
app.get('/api/health', (req, res) => {
  const wam = WAManager.getInstance();
  const sessions = wam.sessions || new Map();
  let devicesConnected = 0;
  sessions.forEach((session) => {
    if (session && session.connected) devicesConnected++;
  });
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    devicesConnected
  });
});

// 3. SSE endpoint (requires auth)
app.get('/api/events', requireAuth, (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive'
  });
  res.write('data: connected\n\n');
  addClient(req.user.id, res);
});

// 4. Global auth for all remaining /api/* routes
app.use('/api', requireAuth);

// 5-12. Protected API routes
app.use('/api/devices', require('./routes/devices'));
app.use('/api/chat', require('./routes/chat'));
app.use('/api/blast', require('./routes/blast'));
app.use('/api/warmer', require('./routes/warmer'));
app.use('/api/checker', require('./routes/checker'));
app.use('/api/auto-reply', require('./routes/autoReply'));
app.use('/api/status', require('./routes/status'));
app.use('/api/admin', require('./routes/admin'));

// 13. Stats endpoint (auth already covered by global middleware)
app.get('/api/stats', async (req, res) => {
  const stats = getUserStats(req.user.id);
  res.json({
    success: true,
    data: {
      username: req.user.username,
      role: req.user.role,
      ...stats
    }
  });
});

// 14. SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// ── Startup ────────────────────────────────────────────────
async function start() {
  await seedAdmin();
  await initSync();

  const wam = WAManager.getInstance();
  await wam.reconnectAll();

  app.listen(config.PORT, () => {
    console.log(`MultiChat berjalan pada port ${config.PORT}`);
  });
}
start().catch(console.error);

// ── Graceful Shutdown ──────────────────────────────────────
async function shutdown() {
  console.log('Shutting down gracefully…');
  try {
    await syncData();
  } catch (err) {
    console.error('Sync error during shutdown:', err);
  }
  try {
    WAManager.getInstance().disconnectAll();
  } catch (err) {
    console.error('Disconnect error during shutdown:', err);
  }
  try {
    db.close();
  } catch (err) {
    console.error('DB close error during shutdown:', err);
  }
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
