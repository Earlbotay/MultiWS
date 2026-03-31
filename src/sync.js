const simpleGit = require('simple-git');
const fs = require('fs');
const path = require('path');
const config = require('./config');

const DATA_DIR = config.DATA_DIR;

/**
 * Semak sama ada penyegerakan GitHub dikonfigurasikan
 */
function isSyncEnabled() {
  return !!(config.DATA_REPO && config.GH_TOKEN);
}

/**
 * Dapatkan URL repositori dengan token
 */
function getRepoUrl() {
  return `https://${config.GH_TOKEN}@github.com/${config.DATA_REPO}.git`;
}

/**
 * Inisialisasi penyegerakan data dengan repositori GitHub
 * - Jika DATA_REPO dan GH_TOKEN ditetapkan, cuba klon atau init repo
 * - Tarik data terkini dari repo
 */
async function initSync() {
  if (!isSyncEnabled()) {
    console.log('[Sync] Penyegerakan GitHub tidak dikonfigurasikan. Langkau.');
    return;
  }

  console.log('[Sync] Memulakan penyegerakan dengan repositori:', config.DATA_REPO);

  const git = simpleGit(DATA_DIR);
  const gitDir = path.join(DATA_DIR, '.git');

  try {
    const isRepo = fs.existsSync(gitDir);

    if (!isRepo) {
      console.log('[Sync] Direktori data bukan repositori git. Cuba klon...');

      // Cuba klon repositori ke dalam direktori sementara kemudian pindahkan
      const tempDir = path.join(process.cwd(), '.temp-clone');

      try {
        // Cuba klon ke direktori sementara
        await simpleGit().clone(getRepoUrl(), tempDir);

        // Pindahkan fail .git dari direktori sementara ke direktori data
        const tempGitDir = path.join(tempDir, '.git');
        if (fs.existsSync(tempGitDir)) {
          fs.cpSync(tempGitDir, gitDir, { recursive: true });
        }

        // Bersihkan direktori sementara
        fs.rmSync(tempDir, { recursive: true, force: true });

        // Tarik data terkini
        await git.pull('origin', 'main');
        console.log('[Sync] Berjaya klon dan tarik data dari repositori.');
      } catch (cloneErr) {
        // Bersihkan jika klon gagal
        if (fs.existsSync(tempDir)) {
          fs.rmSync(tempDir, { recursive: true, force: true });
        }

        console.log('[Sync] Gagal klon repositori. Mula repositori baharu...');

        // Init repositori baharu
        await git.init();
        await git.addRemote('origin', getRepoUrl());

        // Cipta .gitignore
        const gitignorePath = path.join(DATA_DIR, '.gitignore');
        if (!fs.existsSync(gitignorePath)) {
          fs.writeFileSync(gitignorePath, '*.db-journal\n*.db-wal\n*.db-shm\n');
        }

        // Commit awal
        await git.add('.');
        await git.commit('Permulaan repositori data Multichat');

        try {
          await git.push('origin', 'main', ['--set-upstream']);
          console.log('[Sync] Repositori baharu dimulakan dan ditolak ke GitHub.');
        } catch (pushErr) {
          console.warn('[Sync] Amaran: Gagal tolak ke GitHub:', pushErr.message);
        }
      }
    } else {
      // Repo sudah wujud, tarik data terkini
      try {
        await git.pull('origin', 'main');
        console.log('[Sync] Berjaya tarik data terkini dari repositori.');
      } catch (pullErr) {
        console.warn('[Sync] Amaran semasa tarik data:', pullErr.message);
      }
    }
  } catch (err) {
    console.error('[Sync] Ralat semasa inisialisasi penyegerakan:', err.message);
  }
}

/**
 * Tolak perubahan data ke repositori GitHub
 * @param {string} message - Mesej commit
 */
async function pushSync(message = 'Kemaskini data automatik') {
  if (!isSyncEnabled()) {
    return;
  }

  try {
    const git = simpleGit(DATA_DIR);

    // Tambah semua perubahan
    await git.add('.');

    // Semak jika ada perubahan untuk di-commit
    const status = await git.status();
    if (status.files.length === 0) {
      console.log('[Sync] Tiada perubahan untuk ditolak.');
      return;
    }

    // Commit dan tolak
    await git.commit(message);
    await git.push('origin', 'main');

    console.log(`[Sync] Berjaya tolak ${status.files.length} perubahan ke GitHub.`);
  } catch (err) {
    console.error('[Sync] Ralat semasa tolak data:', err.message);
  }
}

/**
 * Tarik perubahan terkini dari repositori GitHub
 */
async function pullSync() {
  if (!isSyncEnabled()) {
    return;
  }

  try {
    const git = simpleGit(DATA_DIR);
    await git.pull('origin', 'main');
    console.log('[Sync] Berjaya tarik data terkini dari GitHub.');
  } catch (err) {
    console.error('[Sync] Ralat semasa tarik data:', err.message);
  }
}

module.exports = { initSync, pushSync, pullSync };
