'use strict';

const path = require('path');
const simpleGit = require('simple-git');
const config = require('./config');

let git = null;
let debounceTimer = null;
let isSyncing = false;
let pendingSync = false;

const DEBOUNCE_MS = 15000; // 15 seconds

/**
 * Initialize git sync.
 * Clone the private repo if not already cloned, or configure existing repo.
 */
async function initSync() {
  if (!config.DATA_REPO || !config.DATA_REPO_TOKEN) {
    console.warn('[SYNC] DATA_REPO atau DATA_REPO_TOKEN tidak ditetapkan. Git sync dilumpuhkan.');
    return;
  }

  try {
    git = simpleGit(config.DATA_DIR);

    // Check if DATA_DIR is already a git repo
    const isRepo = await git.checkIsRepo();

    if (!isRepo) {
      // Clone the repo into DATA_DIR
      const repoUrl = `https://x-access-token:${config.DATA_REPO_TOKEN}@github.com/${config.DATA_REPO}.git`;

      console.log(`[SYNC] Mengklon repo ${config.DATA_REPO}...`);

      // Clone into a temp dir first, then move contents
      const tempDir = path.join(path.dirname(config.DATA_DIR), '.multichat-clone-temp');
      await simpleGit().clone(repoUrl, tempDir);

      // Move .git from temp to DATA_DIR
      const fs = require('fs');
      const srcGit = path.join(tempDir, '.git');
      const destGit = path.join(config.DATA_DIR, '.git');

      if (fs.existsSync(destGit)) {
        fs.rmSync(destGit, { recursive: true, force: true });
      }
      fs.renameSync(srcGit, destGit);
      fs.rmSync(tempDir, { recursive: true, force: true });

      // Reinitialize git instance
      git = simpleGit(config.DATA_DIR);

      console.log('[SYNC] Repo berjaya diklon.');
    } else {
      console.log('[SYNC] Repo git sedia ada dijumpai.');
    }

    // Configure git user
    await git.addConfig('user.email', 'multichat-bot@users.noreply.github.com');
    await git.addConfig('user.name', 'Multichat Bot');

    // Set remote URL with token (in case token changed)
    const repoUrl = `https://x-access-token:${config.DATA_REPO_TOKEN}@github.com/${config.DATA_REPO}.git`;
    try {
      await git.remote(['set-url', 'origin', repoUrl]);
    } catch {
      // Remote might not exist yet
      try {
        await git.addRemote('origin', repoUrl);
      } catch {
        // Already exists, ignore
      }
    }

    console.log('[SYNC] Git sync dimulakan.');
  } catch (err) {
    console.error('[SYNC] Ralat semasa init sync:', err.message);
    git = null;
  }
}

/**
 * Perform the actual git sync (add, commit, push).
 */
async function performSync() {
  if (!git) return;

  isSyncing = true;

  try {
    // Stage all changes
    await git.add('-A');

    // Check if there are changes to commit
    const status = await git.status();

    if (status.files.length === 0) {
      console.log('[SYNC] Tiada perubahan untuk disync.');
      isSyncing = false;
      return;
    }

    // Commit with timestamp
    const timestamp = new Date().toLocaleString('sv-SE', {
      timeZone: 'Asia/Kuala_Lumpur',
    });
    await git.commit(`sync: auto-backup ${timestamp}`);

    // Push to remote
    await git.push('origin', 'main');

    console.log(`[SYNC] Data berjaya disync. (${status.files.length} fail berubah)`);
  } catch (err) {
    console.error('[SYNC] Ralat semasa sync:', err.message);

    // Try to pull and merge if push fails (remote ahead)
    try {
      await git.pull('origin', 'main', { '--rebase': 'true' });
      await git.push('origin', 'main');
      console.log('[SYNC] Data berjaya disync selepas pull.');
    } catch (pullErr) {
      console.error('[SYNC] Ralat semasa pull + push:', pullErr.message);
    }
  } finally {
    isSyncing = false;

    // If a sync was requested while we were syncing, do one more sync
    if (pendingSync) {
      pendingSync = false;
      console.log('[SYNC] Menjalankan pending sync...');
      await performSync();
    }
  }
}

/**
 * Trigger a sync with 15-second debounce.
 * If sync is already running and a new request comes in, queue one more sync.
 */
function syncData() {
  if (!git) return;

  // If currently syncing, mark that we need another sync after current completes
  if (isSyncing) {
    pendingSync = true;
    return;
  }

  // Debounce: clear existing timer and set a new one
  if (debounceTimer) {
    clearTimeout(debounceTimer);
  }

  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    performSync().catch(err => {
      console.error('[SYNC] Ralat tidak dijangka semasa sync:', err.message);
    });
  }, DEBOUNCE_MS);
}

module.exports = { syncData, initSync };
