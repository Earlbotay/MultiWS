'use strict';

const path = require('path');
const Database = require('better-sqlite3');
const bcrypt = require('bcrypt');
const config = require('./config');

// ── Initialize SQLite database ──
const dbPath = path.join(config.DATA_DIR, 'db', 'multichat.db');
const db = new Database(dbPath);

// ── Enable WAL mode and foreign keys ──
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ── Create all tables ──
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT DEFAULT 'user',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS devices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    phone TEXT,
    status TEXT DEFAULT 'disconnected',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS contacts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    phone TEXT NOT NULL,
    name TEXT,
    has_whatsapp INTEGER DEFAULT -1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, phone),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    device_id INTEGER NOT NULL,
    remote_jid TEXT NOT NULL,
    from_me INTEGER DEFAULT 0,
    message TEXT,
    timestamp INTEGER,
    status TEXT DEFAULT 'sent',
    FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS auto_replies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    device_id INTEGER,
    trigger_word TEXT NOT NULL,
    response TEXT NOT NULL,
    is_active INTEGER DEFAULT 1,
    match_type TEXT DEFAULT 'contains',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS blast_jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    device_id INTEGER NOT NULL,
    status TEXT DEFAULT 'pending',
    total INTEGER DEFAULT 0,
    sent INTEGER DEFAULT 0,
    failed INTEGER DEFAULT 0,
    message TEXT,
    delay_min INTEGER DEFAULT 1,
    delay_max INTEGER DEFAULT 5,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS blast_recipients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    blast_id INTEGER NOT NULL,
    phone TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    sent_at DATETIME,
    error TEXT,
    FOREIGN KEY (blast_id) REFERENCES blast_jobs(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS warmer_jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    device_id INTEGER NOT NULL,
    target_phone TEXT NOT NULL,
    message TEXT NOT NULL,
    interval_min INTEGER DEFAULT 30,
    interval_max INTEGER DEFAULT 60,
    status TEXT DEFAULT 'active',
    last_sent DATETIME,
    total_sent INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE
  );
`);

// ── Seed admin user from env vars ──
async function seedAdmin() {
  const { ADMIN_USER, ADMIN_PASS } = config;

  if (!ADMIN_USER || !ADMIN_PASS) {
    console.warn('[DATABASE] AMARAN: ADMIN_USER atau ADMIN_PASS tidak ditetapkan. Admin seed dilangkau.');
    return;
  }

  try {
    const hashedPassword = await bcrypt.hash(ADMIN_PASS, 10);

    const existing = db.prepare('SELECT id, password, role FROM users WHERE username = ?').get(ADMIN_USER);

    if (existing) {
      // Update admin password and ensure role is 'admin'
      db.prepare('UPDATE users SET password = ?, role = ? WHERE id = ?').run(hashedPassword, 'admin', existing.id);
      console.log(`[DATABASE] Admin user "${ADMIN_USER}" dikemas kini.`);
    } else {
      // Create new admin user
      db.prepare('INSERT INTO users (username, password, role) VALUES (?, ?, ?)').run(ADMIN_USER, hashedPassword, 'admin');
      console.log(`[DATABASE] Admin user "${ADMIN_USER}" dicipta.`);
    }
  } catch (err) {
    console.error('[DATABASE] Ralat semasa seed admin:', err.message);
  }
}

module.exports = { db, seedAdmin };
