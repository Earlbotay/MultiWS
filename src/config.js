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
  DATA_DIR: process.env.DATA_DIR || path.join(process.cwd(), 'MULTIWSDATA'),
  DB_PATH: path.join(process.env.DATA_DIR || path.join(process.cwd(), 'MULTIWSDATA'), 'db', 'multichat.db'),
  SESSIONS_DIR: path.join(process.env.DATA_DIR || path.join(process.cwd(), 'MULTIWSDATA'), 'sessions'),
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

try {
  fs.mkdirSync(path.join(config.DATA_DIR, 'db'), { recursive: true });
  console.log('[Config] Direktori db disahkan');
} catch (err) {
  console.error('[Config] Gagal mencipta direktori db:', err.message);
}

// Amaran keselamatan
if (config.SESSION_SECRET === 'rahsia-sesi-lalai-multichat') {
  console.warn('⚠️  [AMARAN KESELAMATAN] SESSION_SECRET tidak ditetapkan! Sila set dalam .env');
}
if (config.ADMIN_PASS === 'admin123') {
  console.warn('⚠️  [AMARAN KESELAMATAN] Kata laluan admin lalai digunakan! Sila tukar segera.');
}

module.exports = config;
