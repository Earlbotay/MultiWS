# Multichat

Platform automasi WhatsApp yang lengkap.

## Ciri-ciri

- 📱 **Pengurusan Peranti** - Sambung dan urus pelbagai akaun WhatsApp
- 💬 **Ruang Chat** - Baca dan balas mesej dari dashboard
- 📢 **Broadcast** - Hantar mesej pukal dengan kelewatan tersuai
- 🔥 **Pemanasan Akaun** - Pastikan akaun kekal aktif
- 🔍 **Semak Nombor** - Semak nombor WhatsApp secara pukal
- 🤖 **Auto Balas** - Balas mesej secara automatik berdasarkan kata kunci
- 📸 **Status WhatsApp** - Hantar status teks, gambar, dan video

## Keperluan

- Node.js 20+
- GitHub Akaun (untuk Actions)
- Cloudflare Tunnel Token
- Repositori peribadi untuk data

## Pemasangan

### 1. Fork atau Clone

```bash
git clone https://github.com/anda/multichat.git
cd multichat
```

### 2. Sediakan Repositori Data

Cipta repositori **peribadi** baru di GitHub untuk menyimpan data.

```bash
npm run setup
cd data
git init
git remote add origin https://github.com/anda/multichat-data.git
git add -A
git commit -m "permulaan"
git push -u origin main
cd ..
```

### 3. Tetapkan GitHub Secrets

Pergi ke Settings > Secrets and variables > Actions:

| Secret | Keterangan |
|--------|-----------|
| `CF_TUNNEL_TOKEN` | Token Cloudflare Tunnel anda |
| `DATA_REPO` | Nama repo data (contoh: `anda/multichat-data`) |
| `DATA_REPO_TOKEN` | GitHub Personal Access Token dengan akses repo |

### 4. Sediakan Cloudflare Tunnel

1. Pergi ke [Cloudflare Zero Trust](https://one.dash.cloudflare.com/)
2. Cipta tunnel baru
3. Tetapkan `localhost:8080` sebagai service
4. Salin token tunnel

### 5. Jalankan

Pergi ke tab **Actions** dan jalankan workflow **Multichat Platform** secara manual.

Atau tunggu ia berjalan secara automatik mengikut jadual.

## Pembangunan Tempatan

```bash
npm install
export DATA_DIR=./data
export PORT=8080
npm start
```

Buka `http://localhost:8080` di pelayar.

## Pengguna Default

Pada permulaan pertama, pengguna admin akan dicipta secara automatik:

- **Nama Pengguna:** admin
- **Kata Laluan:** admin123

⚠️ Sila tukar kata laluan selepas log masuk pertama.

## Struktur Projek

```
multichat/
├── .github/workflows/    # GitHub Actions
├── public/               # Frontend (HTML/CSS/JS)
│   ├── css/
│   ├── js/
│   └── *.html
├── src/                  # Backend
│   ├── routes/           # Express routes
│   ├── whatsapp/         # WhatsApp logic
│   ├── server.js         # Entry point
│   ├── config.js         # Configuration
│   ├── database.js       # SQLite database
│   └── auth.js           # Authentication
├── scripts/              # Helper scripts
└── package.json
```

## Nota

- Data (sesi WhatsApp, pangkalan data, fail) disinkronkan ke repositori peribadi setiap 10 minit
- Perkhidmatan berjalan selama ~5 jam dan dimulakan semula secara automatik
- Selepas stabil, disyorkan untuk pindahkan ke VPS untuk perkhidmatan berterusan

## Lesen

MIT
