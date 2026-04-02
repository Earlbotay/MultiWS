#!/bin/bash
# ─────────────────────────────────────────────────
# setup-data-repo.sh
# Inisialisasi direktori data MULTIWSDATA dengan
# struktur folder dan git repo.
# ─────────────────────────────────────────────────

set -euo pipefail

DATA_DIR="${DATA_DIR:-./MULTIWSDATA}"

echo "🔧 Mencipta struktur direktori data di: $DATA_DIR"

# Cipta semua subdirektori yang diperlukan
mkdir -p "$DATA_DIR/auth"
mkdir -p "$DATA_DIR/uploads"
mkdir -p "$DATA_DIR/db"
mkdir -p "$DATA_DIR/sessions"
mkdir -p "$DATA_DIR/logs"

echo "✅ Direktori dicipta:"
echo "   $DATA_DIR/auth       — Baileys auth state"
echo "   $DATA_DIR/uploads    — Fail muat naik"
echo "   $DATA_DIR/db         — SQLite database"
echo "   $DATA_DIR/sessions   — Maklumat sesi"
echo "   $DATA_DIR/logs       — Log fail"

# Cipta .gitignore khusus untuk data repo
cat > "$DATA_DIR/.gitignore" << 'GITIGNORE'
# SQLite WAL & SHM (tidak perlu di-commit)
*.db-wal
*.db-shm

# Log fail (boleh dijana semula)
*.log

# Fail sementara OS
.DS_Store
Thumbs.db
GITIGNORE

echo "✅ .gitignore dicipta"

# Cipta .gitkeep dalam setiap folder supaya Git track folder kosong
for dir in auth uploads db sessions logs; do
  touch "$DATA_DIR/$dir/.gitkeep"
done

echo "✅ .gitkeep fail dicipta"

# Inisialisasi git repo jika belum ada
cd "$DATA_DIR"

if [ ! -d ".git" ]; then
  git init
  git add -A
  git commit -m "🎉 Initial data repo setup"
  echo "✅ Git repo diinisialisasi dengan commit pertama"
else
  echo "ℹ️  Git repo sudah wujud — langkau inisialisasi"
fi

echo ""
echo "🎉 Selesai! Data repo sedia di: $DATA_DIR"
echo ""
echo "Langkah seterusnya (jika guna remote sync):"
echo "  cd $DATA_DIR"
echo "  git remote add origin https://github.com/<user>/<repo>.git"
echo "  git push -u origin main"
