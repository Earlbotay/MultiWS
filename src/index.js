const path = require('path');
const fs = require('fs');
const express = require('express');
const session = require('express-session');
const config = require('./config');
const { initSync, pushSync } = require('./sync');
const { requireAuth } = require('./auth');

// Pastikan pangkalan data dimuat dan admin dicipta
require('./database');

async function main() {
  console.log('╔══════════════════════════════════════════╗');
  console.log('║        MULTICHAT - Platform Automasi     ║');
  console.log('║            WhatsApp v1.0.0               ║');
  console.log('╚══════════════════════════════════════════╝');
  console.log('');

  // ─── 1. Inisialisasi penyegerakan GitHub ──────────────────────────────
  try {
    await initSync();
  } catch (err) {
    console.warn('[Pelayan] Amaran: Gagal memulakan penyegerakan GitHub:', err.message);
  }

  // ─── 2. Cipta aplikasi Express ────────────────────────────────────────
  const app = express();

  // ─── 3. Middleware asas ───────────────────────────────────────────────
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));
  app.use(express.static(path.join(process.cwd(), 'public')));

  // ─── 4. Sesi Express ─────────────────────────────────────────────────
  app.use(session({
    secret: config.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 24 * 60 * 60 * 1000, // 24 jam
      httpOnly: true,
      sameSite: 'lax',
    },
  }));

  // ─── 5. Lekapkan laluan API ───────────────────────────────────────────
  const routes = [
    { path: '/api/auth', file: './routes/auth' },
    { path: '/api/devices', file: './routes/device' },
    { path: '/api/chat', file: './routes/chat' },
    { path: '/api/blast', file: './routes/blast' },
    { path: '/api/warmer', file: './routes/warmer' },
    { path: '/api/checker', file: './routes/checker' },
    { path: '/api/autoreply', file: './routes/autoReply' },
    { path: '/api/status', file: './routes/status' },
  ];

  for (const route of routes) {
    try {
      const router = require(route.file);
      app.use(route.path, router);
      console.log(`[Pelayan] Laluan '${route.path}' berjaya dilekapkan.`);
    } catch (err) {
      if (err.code === 'MODULE_NOT_FOUND') {
        console.warn(`[Pelayan] Amaran: Fail laluan '${route.file}' belum wujud. Dilangkau.`);
      } else {
        console.error(`[Pelayan] Ralat memuat laluan '${route.path}':`, err.message);
      }
    }
  }

  // ─── 6. Halaman HTML ─────────────────────────────────────────────────
  // Halaman log masuk (tiada pengesahan diperlukan)
  app.get('/', (req, res) => {
    const loginPage = path.join(process.cwd(), 'public', 'index.html');
    if (fs.existsSync(loginPage)) {
      return res.sendFile(loginPage);
    }
    return res.status(200).send('<h1>Multichat</h1><p>Sila cipta fail public/index.html</p>');
  });

  // Halaman lain memerlukan pengesahan
  app.get('/dashboard', requireAuth, (req, res) => {
    const page = path.join(process.cwd(), 'public', 'dashboard.html');
    if (fs.existsSync(page)) return res.sendFile(page);
    return res.status(404).send('Halaman tidak ditemui.');
  });

  app.get('/devices', requireAuth, (req, res) => {
    const page = path.join(process.cwd(), 'public', 'devices.html');
    if (fs.existsSync(page)) return res.sendFile(page);
    return res.status(404).send('Halaman tidak ditemui.');
  });

  app.get('/chat', requireAuth, (req, res) => {
    const page = path.join(process.cwd(), 'public', 'chat.html');
    if (fs.existsSync(page)) return res.sendFile(page);
    return res.status(404).send('Halaman tidak ditemui.');
  });

  app.get('/blast', requireAuth, (req, res) => {
    const page = path.join(process.cwd(), 'public', 'blast.html');
    if (fs.existsSync(page)) return res.sendFile(page);
    return res.status(404).send('Halaman tidak ditemui.');
  });

  app.get('/warmer', requireAuth, (req, res) => {
    const page = path.join(process.cwd(), 'public', 'warmer.html');
    if (fs.existsSync(page)) return res.sendFile(page);
    return res.status(404).send('Halaman tidak ditemui.');
  });

  app.get('/checker', requireAuth, (req, res) => {
    const page = path.join(process.cwd(), 'public', 'checker.html');
    if (fs.existsSync(page)) return res.sendFile(page);
    return res.status(404).send('Halaman tidak ditemui.');
  });

  app.get('/autoreply', requireAuth, (req, res) => {
    const page = path.join(process.cwd(), 'public', 'autoreply.html');
    if (fs.existsSync(page)) return res.sendFile(page);
    return res.status(404).send('Halaman tidak ditemui.');
  });

  // Tangkap semua halaman lain yang memerlukan pengesahan
  app.get('/:page', requireAuth, (req, res) => {
    const pageName = req.params.page;
    const pagePath = path.join(process.cwd(), 'public', `${pageName}.html`);
    if (fs.existsSync(pagePath)) {
      return res.sendFile(pagePath);
    }
    return res.status(404).send('Halaman tidak ditemui.');
  });

  // ─── 7. Mulakan pelayan ───────────────────────────────────────────────
  app.listen(config.PORT, () => {
    console.log('');
    console.log(`[Pelayan] ✅ Multichat berjaya dimulakan!`);
    console.log(`[Pelayan] 🌐 Akses di: http://localhost:${config.PORT}`);
    console.log(`[Pelayan] 📁 Direktori data: ${config.DATA_DIR}`);
    console.log('');
  });

  // ─── 8. Penyegerakan berkala setiap 10 minit ─────────────────────────
  const SYNC_INTERVAL = 10 * 60 * 1000; // 10 minit
  const syncTimer = setInterval(async () => {
    console.log('[Sync] Memulakan penyegerakan berkala...');
    try {
      await pushSync('Penyegerakan berkala automatik');
    } catch (err) {
      console.error('[Sync] Ralat semasa penyegerakan berkala:', err.message);
    }
  }, SYNC_INTERVAL);

  // ─── 9. Penutupan pelayan secara teratur ──────────────────────────────
  async function gracefulShutdown(signal) {
    console.log(`\n[Pelayan] Isyarat ${signal} diterima. Menutup pelayan...`);

    // Hentikan penyegerakan berkala
    clearInterval(syncTimer);

    // Tolak data terakhir ke GitHub
    try {
      console.log('[Pelayan] Menolak data terakhir ke GitHub...');
      await pushSync('Penyegerakan sebelum penutupan pelayan');
    } catch (err) {
      console.error('[Pelayan] Ralat semasa penyegerakan penutupan:', err.message);
    }

    console.log('[Pelayan] Multichat telah ditutup. Selamat tinggal! 👋');
    process.exit(0);
  }

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
}

// Jalankan aplikasi
main().catch((err) => {
  console.error('[Pelayan] Ralat kritikal semasa memulakan Multichat:', err);
  process.exit(1);
});
