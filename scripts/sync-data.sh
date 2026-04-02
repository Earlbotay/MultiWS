#!/bin/bash
# ─────────────────────────────────────────────────
# sync-data.sh
# Sinkron data MULTIWSDATA ke GitHub repo.
# Jalankan secara berkala atau selepas perubahan.
# ─────────────────────────────────────────────────

set -uo pipefail

DATA_DIR="${DATA_DIR:-./MULTIWSDATA}"
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

# Pastikan direktori wujud
if [ ! -d "$DATA_DIR" ]; then
  echo "❌ Direktori data tidak dijumpai: $DATA_DIR"
  echo "   Sila jalankan scripts/setup-data-repo.sh dahulu."
  exit 1
fi

# Pastikan ia adalah git repo
if [ ! -d "$DATA_DIR/.git" ]; then
  echo "❌ $DATA_DIR bukan git repo."
  echo "   Sila jalankan scripts/setup-data-repo.sh dahulu."
  exit 1
fi

cd "$DATA_DIR" || exit 1

echo "🔄 Menyinkron data... ($TIMESTAMP)"

# Stage semua perubahan
git add -A

# Semak jika ada perubahan untuk di-commit
if git diff --cached --quiet; then
  echo "ℹ️  Tiada perubahan untuk disinkron."
  exit 0
fi

# Commit dengan timestamp
if ! git commit -m "🔄 Auto-sync: $TIMESTAMP"; then
  echo "❌ Gagal membuat commit."
  exit 1
fi

# Push ke remote
if ! git push; then
  echo "❌ Gagal push ke remote. Semak sambungan dan credentials."
  echo "   Commit berjaya secara lokal — boleh push kemudian."
  exit 1
fi

echo "✅ Data berjaya disinkron pada $TIMESTAMP"
