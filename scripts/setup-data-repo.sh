#!/bin/bash
# Skrip untuk menyediakan repositori data peribadi
# Jalankan sekali sahaja untuk menyediakan struktur

echo "=== Penyediaan Repositori Data Multichat ==="

DATA_DIR="${1:-.}/data"
mkdir -p "$DATA_DIR/auth"
mkdir -p "$DATA_DIR/uploads"  
mkdir -p "$DATA_DIR/db"

# Create .gitignore for data repo
cat > "$DATA_DIR/.gitignore" << 'GITIGNORE'
# Node
node_modules/

# Temp
*.tmp
*.log
GITIGNORE

# Create initial README for data repo
cat > "$DATA_DIR/README.md" << 'README'
# Data Multichat

Repositori ini menyimpan data untuk platform Multichat.

## Struktur

```
auth/       - Sesi WhatsApp
uploads/    - Fail media yang dimuat naik
db/         - Pangkalan data SQLite
```

⚠️ JANGAN padam atau ubah fail dalam repositori ini secara manual.
README

echo "Struktur data disediakan di: $DATA_DIR"
echo "Sila 'git init' dan push ke repositori peribadi anda."
