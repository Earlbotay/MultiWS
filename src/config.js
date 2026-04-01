const path = require('path');
const fs = require('fs');

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
  LOG_DIR: path.join(process.env.DATA_DIR || path.join(process.cwd(), 'MULTIWSDATA'), 'logs'),
};

// Pastikan direktori wujud
const dirs = [config.DATA_DIR, config.SESSIONS_DIR, path.join(config.DATA_DIR, 'db'), config.LOG_DIR];
for (const dir of dirs) {
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch (err) {
    console.error(`[Config] Gagal mencipta direktori ${dir}: ${err.message}`);
  }
}
console.log('[Config] Direktori data disahkan:', config.DATA_DIR);

if (config.SESSION_SECRET === 'rahsia-sesi-lalai-multichat') {
  console.warn('\u26a0\ufe0f  [AMARAN KESELAMATAN] SESSION_SECRET tidak ditetapkan! Sila set dalam .env');
}
if (config.ADMIN_PASS === 'admin123') {
  console.warn('\u26a0\ufe0f  [AMARAN KESELAMATAN] Kata laluan admin lalai digunakan! Sila tukar segera.');
}

module.exports = config;
