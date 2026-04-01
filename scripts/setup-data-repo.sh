#!/bin/bash
# Skrip untuk menyediakan repositori data peribadi
# Jalankan sekali sahaja untuk menyediakan struktur

echo "=== Penyediaan Repositori Data Multichat ==="

DATA_DIR="${1:-.}/MULTIWSDATA"
mkdir -p "$DATA_DIR/sessions"
mkdir -p "$DATA_DIR/uploads"
mkdir -p "$DATA_DIR/db"
mkdir -p "$DATA_DIR/logs"

cat > "$DATA_DIR/.gitignore" << 'GITIGNORE'
*.db-wal
*.db-shm
*.log
*.tmp
node_modules/
GITIGNORE

cat > "$DATA_DIR/README.md" << 'README'
# Data Multichat

Repositori ini menyimpan data untuk platform Multichat.

## Struktur

```
sessions/   - Sesi WhatsApp
uploads/    - Fail media yang dimuat naik
db/         - Pangkalan data SQLite
logs/       - Log aplikasi
```

⚠️ JANGAN padam atau ubah fail dalam repositori ini secara manual.
README

echo "Struktur data disediakan di: $DATA_DIR"
echo "Sila 'git init' dan push ke repositori peribadi anda."
