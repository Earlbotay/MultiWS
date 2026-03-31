const simpleGit = require('simple-git');
const fs = require('fs');
const path = require('path');
const config = require('./config');

const DATA_DIR = config.DATA_DIR;
let syncTimer = null;
let isSyncing = false;
let pendingSync = false;

/**
 * Semak sama ada penyegerakan boleh dilakukan
 * Cek jika DATA_DIR adalah repositori git (sudah diklon oleh workflow)
 */
function isSyncEnabled() {
  const gitDir = path.join(DATA_DIR, '.git');
  return fs.existsSync(gitDir);
}

/**
 * Inisialisasi penyegerakan — pastikan git config betul
 */
async function initSync() {
  if (!isSyncEnabled()) {
    console.log('[Sync] Direktori data bukan repositori git. Penyegerakan dilumpuhkan.');
    return;
  }

  try {
    const git = simpleGit(DATA_DIR);

    // Pastikan git config ada
    const email = await git.getConfig('user.email');
    if (!email.value) {
      await git.addConfig('user.email', 'multichat-bot@users.noreply.github.com');
      await git.addConfig('user.name', 'Multichat Bot');
    }

    // Pastikan .gitignore ada
    const gitignorePath = path.join(DATA_DIR, '.gitignore');
    if (!fs.existsSync(gitignorePath)) {
      fs.writeFileSync(gitignorePath, '*.db-wal\n*.db-shm\n*.log\n');
    }

    console.log('[Sync] Penyegerakan dimulakan. Data akan disync setiap kali ada perubahan.');
  } catch (err) {
    console.error('[Sync] Ralat semasa inisialisasi:', err.message);
  }
}

/**
 * Laksanakan push sebenar ke GitHub
 */
async function executePush(message = 'auto: kemaskini data') {
  if (!isSyncEnabled()) return;
  if (isSyncing) {
    pendingSync = true;
    return;
  }

  isSyncing = true;

  try {
    const git = simpleGit(DATA_DIR);

    // Tambah semua perubahan
    await git.add('.');

    // Semak jika ada perubahan
    const status = await git.status();
    if (status.files.length === 0) {
      isSyncing = false;
      return;
    }

    // Commit dan push
    const timestamp = new Date().toLocaleString('ms-MY', { timeZone: 'Asia/Kuala_Lumpur' });
    await git.commit(`${message} (${timestamp})`);
    await git.push('origin', 'main');

    console.log(`[Sync] ✅ ${status.files.length} perubahan berjaya ditolak ke GitHub.`);
  } catch (err) {
    console.error('[Sync] ❌ Gagal sync:', err.message);
  } finally {
    isSyncing = false;

    // Jika ada perubahan pending semasa sync, jalankan lagi
    if (pendingSync) {
      pendingSync = false;
      setTimeout(() => executePush('auto: kemaskini tertunda'), 5000);
    }
  }
}

/**
 * Trigger sync dengan debounce 15 saat
 * Panggil fungsi ini setiap kali ada perubahan data
 * Ia akan tunggu 15s selepas perubahan terakhir sebelum sync
 * (supaya perubahan berturut-turut digabung dalam satu commit)
 */
function triggerSync(message) {
  if (!isSyncEnabled()) return;

  // Reset timer — tunggu 15s dari perubahan terakhir
  if (syncTimer) {
    clearTimeout(syncTimer);
  }

  syncTimer = setTimeout(() => {
    syncTimer = null;
    executePush(message || 'auto: kemaskini data');
  }, 15000); // 15 saat debounce
}

/**
 * Sync segera tanpa debounce (untuk shutdown)
 */
async function syncNow(message) {
  if (syncTimer) {
    clearTimeout(syncTimer);
    syncTimer = null;
  }
  await executePush(message || 'sync: sebelum tutup');
}

module.exports = { initSync, triggerSync, syncNow };
