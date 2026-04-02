'use strict';

const path = require('path');
const fs = require('fs');

// ── Read environment variables with defaults ──
const config = {
  PORT: parseInt(process.env.PORT, 10) || 8080,
  DATA_DIR: process.env.DATA_DIR || './MULTIWSDATA',
  NODE_ENV: process.env.NODE_ENV || 'development',
  SESSION_SECRET: process.env.SESSION_SECRET || 'default-session-secret-change-me',
  ADMIN_USER: process.env.ADMIN_USER || 'admin',
  ADMIN_PASS: process.env.ADMIN_PASS || 'admin123',
  DATA_REPO: process.env.DATA_REPO || '',
  DATA_REPO_TOKEN: process.env.DATA_REPO_TOKEN || '',
};

// ── Warn if using default secret values ──
if (config.SESSION_SECRET === 'default-session-secret-change-me') {
  console.warn('[CONFIG] AMARAN: SESSION_SECRET menggunakan nilai lalai. Sila tetapkan nilai rawak yang panjang untuk keselamatan.');
}
if (config.ADMIN_PASS === 'admin123') {
  console.warn('[CONFIG] AMARAN: ADMIN_PASS menggunakan nilai lalai. Sila tetapkan password yang kuat.');
}

// ── Resolve DATA_DIR to absolute path ──
config.DATA_DIR = path.resolve(config.DATA_DIR);

// ── Auto-create required directories ──
const dirs = [
  config.DATA_DIR,
  path.join(config.DATA_DIR, 'sessions'),
  path.join(config.DATA_DIR, 'db'),
  path.join(config.DATA_DIR, 'logs'),
  path.join(config.DATA_DIR, 'auth'),
  path.join(config.DATA_DIR, 'uploads'),
];

for (const dir of dirs) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    console.log(`[CONFIG] Direktori dicipta: ${dir}`);
  }
}

module.exports = config;
