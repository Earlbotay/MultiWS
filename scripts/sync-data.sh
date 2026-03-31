#!/bin/bash
# Sinkronkan data ke repositori peribadi

DATA_DIR="${DATA_DIR:-./data}"
cd "$DATA_DIR" || exit 1

git add -A
if git diff --cached --quiet; then
  echo "Tiada perubahan untuk disinkronkan"
  exit 0
fi

git commit -m "sync: $(date '+%Y-%m-%d %H:%M:%S')"
git push origin main
echo "Data berjaya disinkronkan"
