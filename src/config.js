const path = require('path');
const fs = require('fs');

// Muat pembolehubah persekitaran dari fail .env
require('dotenv').config();

const config = {
  PORT: parseInt(process.env.PORT, 10) || 8080,
  SESSION_SECRET: process.env.SESSION_SECRET || 'rahsia-sesi-lalai-multichat',
  ADMIN_USER: process.env.ADMIN_USER || 'admin',
  ADMIN_PASS: process.env.ADMIN_PASS || 'admin123',
  DATA_REPO: process.env.DATA_REPO || '',
  GH_TOKEN: process.env.GH_TOKEN || '',
  CF_TUNNEL_TOKEN: process.env.CF_TUNNEL_TOKEN || '',
  DATA_DIR: path.join(process.cwd(), 'data'),
  DB_PATH: path.join(process.cwd(), 'data', 'multichat.db'),
  SESSIONS_DIR: path.join(process.cwd(), 'data', 'sessions'),
};

// Pastikan direktori data dan sesi wujud
try {
  fs.mkdirSync(config.DATA_DIR, { recursive: true });
  console.log('[Config] Direktori data disahkan:', config.DATA_DIR);
} catch (err) {
  console.error('[Config] Gagal mencipta direktori data:', err.message);
}

try {
  fs.mkdirSync(config.SESSIONS_DIR, { recursive: true });
  console.log('[Config] Direktori sesi disahkan:', config.SESSIONS_DIR);
} catch (err) {
  console.error('[Config] Gagal mencipta direktori sesi:', err.message);
}

module.exports = config;
