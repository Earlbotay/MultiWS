const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const config = require('./config');

// Buka sambungan pangkalan data SQLite
const db = new Database(config.DB_PATH);
console.log('[Pangkalan Data] Disambungkan ke:', config.DB_PATH);

// Aktifkan mod WAL untuk prestasi lebih baik
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ─── Cipta jadual jika belum wujud ─────────────────────────────────────────

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
    sender TEXT,
    message TEXT,
    type TEXT DEFAULT 'text',
    media_path TEXT,
    is_outgoing INTEGER DEFAULT 0,
    timestamp INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS blast_jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    device_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    message TEXT NOT NULL,
    media_path TEXT,
    delay_min INTEGER DEFAULT 5,
    delay_max INTEGER DEFAULT 15,
    status TEXT DEFAULT 'pending',
    total INTEGER DEFAULT 0,
    sent INTEGER DEFAULT 0,
    failed INTEGER DEFAULT 0,
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

  CREATE TABLE IF NOT EXISTS warmer_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    status TEXT DEFAULT 'stopped',
    messages TEXT,
    interval_min INTEGER DEFAULT 60,
    interval_max INTEGER DEFAULT 300,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS warmer_devices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    warmer_id INTEGER NOT NULL,
    device_id INTEGER NOT NULL,
    FOREIGN KEY (warmer_id) REFERENCES warmer_sessions(id) ON DELETE CASCADE,
    FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS auto_replies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    device_id INTEGER NOT NULL,
    trigger_word TEXT NOT NULL,
    reply_message TEXT NOT NULL,
    match_type TEXT DEFAULT 'contains',
    is_active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE
  );
`);

console.log('[Pangkalan Data] Semua jadual berjaya dicipta / disahkan.');

// ─── Fungsi pembantu ────────────────────────────────────────────────────────

/**
 * Cari pengguna berdasarkan nama pengguna
 * @param {string} username
 * @returns {object|undefined}
 */
function getUser(username) {
  const stmt = db.prepare('SELECT * FROM users WHERE username = ?');
  return stmt.get(username);
}

/**
 * Cipta pengguna baharu
 * @param {string} username
 * @param {string} hashedPassword - kata laluan yang telah di-hash
 * @returns {object} hasil operasi insert
 */
function createUser(username, hashedPassword) {
  const stmt = db.prepare('INSERT INTO users (username, password) VALUES (?, ?)');
  return stmt.run(username, hashedPassword);
}

/**
 * Cipta akaun admin lalai jika belum wujud
 */
function seedAdmin() {
  // Tambah lajur role jika belum wujud (untuk DB lama)
  try {
    db.prepare("ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'user'").run();
  } catch (e) {
    // Lajur sudah wujud, abaikan
  }

  const existing = getUser(config.ADMIN_USER);
  if (!existing) {
    const salt = bcrypt.genSaltSync(10);
    const hashedPassword = bcrypt.hashSync(config.ADMIN_PASS, salt);
    db.prepare('INSERT INTO users (username, password, role) VALUES (?, ?, ?)').run(config.ADMIN_USER, hashedPassword, 'admin');
    console.log(`[Pangkalan Data] Akaun admin '${config.ADMIN_USER}' berjaya dicipta dengan role admin.`);
  } else {
    // Pastikan role admin sentiasa ditetapkan
    if (existing.role !== 'admin') {
      db.prepare('UPDATE users SET role = ? WHERE username = ?').run('admin', config.ADMIN_USER);
      console.log(`[Pangkalan Data] Role admin dikemaskini untuk '${config.ADMIN_USER}'.`);
    }
    // Kemaskini kata laluan jika env berubah (untuk GitHub Secrets)
    if (!bcrypt.compareSync(config.ADMIN_PASS, existing.password)) {
      const salt = bcrypt.genSaltSync(10);
      const hashedPassword = bcrypt.hashSync(config.ADMIN_PASS, salt);
      db.prepare('UPDATE users SET password = ? WHERE username = ?').run(hashedPassword, config.ADMIN_USER);
      console.log(`[Pangkalan Data] Kata laluan admin dikemaskini dari pembolehubah persekitaran.`);
    }
    console.log(`[Pangkalan Data] Akaun admin '${config.ADMIN_USER}' sudah wujud.`);
  }
}

// Cipta admin semasa modul dimuatkan
seedAdmin();

module.exports = {
  db,
  getUser,
  createUser,
  seedAdmin,
};
