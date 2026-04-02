# MultiChat WhatsApp 🟢

**Sistem pengurusan multi-peranti WhatsApp** — sambungkan berbilang nombor WhatsApp dari satu dashboard web.

A multi-device WhatsApp management system — connect multiple WhatsApp numbers from a single web dashboard.

---

## 📋 Ciri-ciri / Features

- **Multi-Device** — Sambung & urus berbilang sesi WhatsApp serentak / Connect & manage multiple WhatsApp sessions simultaneously
- **QR Login** — Imbas kod QR terus dari dashboard web / Scan QR codes directly from the web dashboard
- **Real-time Status** — Pantau status sambungan setiap peranti / Monitor connection status of each device
- **Admin Auth** — Login admin dilindungi bcrypt + session cookie / Admin login protected with bcrypt + session cookie
- **Auto Data Sync** — Sinkron data sesi ke GitHub repo secara automatik / Auto-sync session data to a GitHub repo
- **Backup & Restore** — Muat turun arkib data lengkap / Download full data archive
- **Cloudflare Tunnel** — Deploy selamat tanpa perlu public IP / Secure deployment without a public IP
- **GitHub Actions Deploy** — CI/CD penuh — push sahaja, deploy automatik / Full CI/CD — just push, auto deploy

---

## 🛠 Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js 20+ |
| Framework | Express.js |
| WhatsApp | @whiskeysockets/baileys |
| Database | better-sqlite3 |
| Auth | bcrypt + cookie-parser |
| QR Code | qrcode (PNG generation) |
| Git Sync | simple-git |
| Archiver | archiver (zip) |
| Tunnel | Cloudflare Tunnel (cloudflared) |
| CI/CD | GitHub Actions |

---

## 🚀 Setup

### Prasyarat / Prerequisites

- Node.js ≥ 20
- npm atau yarn
- Git
- (Production) Cloudflare Tunnel token
- (Production) GitHub repo untuk data sync

### 1. Clone & Install

```bash
git clone https://github.com/your-user/multichat.git
cd multichat
npm install
```

### 2. Konfigurasi Env / Configure Environment

```bash
cp .env.example .env
# Edit .env dengan nilai sebenar / Edit .env with actual values
```

### 3. Setup Data Repo (sekali sahaja / one-time)

```bash
chmod +x scripts/setup-data-repo.sh
./scripts/setup-data-repo.sh
```

### 4. Jalankan / Run

```bash
# Development (auto-reload)
npm run dev

# Production
npm start
```

Dashboard akan tersedia di `http://localhost:8080`
Dashboard will be available at `http://localhost:8080`

---

## 🔧 Pembolehubah Persekitaran / Environment Variables

| Variable | Penerangan / Description | Contoh / Example |
|----------|--------------------------|-----------------|
| `PORT` | Port pelayan / Server port | `8080` |
| `DATA_DIR` | Direktori data sesi / Session data directory | `./MULTIWSDATA` |
| `NODE_ENV` | Persekitaran / Environment | `production` |
| `CF_TUNNEL_TOKEN` | Token Cloudflare Tunnel | `eyJhIjoixxxxxx` |
| `DATA_REPO_TOKEN` | GitHub PAT untuk data sync | `ghp_xxxxx` |
| `DATA_REPO` | GitHub repo untuk data | `user/multichat-data` |
| `ADMIN_USER` | Username admin | `admin` |
| `ADMIN_PASS` | Password admin (plain — di-hash oleh sistem) | `kata-laluan-kuat` |
| `SESSION_SECRET` | Rahsia untuk session cookie | `rahsia-random-panjang` |

---

## 🚢 Deploy via GitHub Actions

1. Fork / clone repo ini ke GitHub anda
2. Pergi ke **Settings → Secrets and variables → Actions**
3. Tambah semua secrets dari `.env.example`
4. Push ke branch `main` — workflow akan deploy secara automatik
5. Cloudflare Tunnel akan expose dashboard anda ke internet

---

## 📁 Struktur Projek / Project Structure

```
multichat/
├── src/
│   ├── server.js          # Entry point
│   ├── routes/            # Express routes
│   ├── services/          # WhatsApp & business logic
│   ├── middleware/         # Auth & rate limiting
│   └── public/            # Frontend (HTML/CSS/JS)
├── scripts/
│   ├── setup-data-repo.sh # Init data directory
│   └── sync-data.sh       # Git sync data
├── .env.example
├── .gitignore
├── package.json
└── README.md
```

---

## 📄 Lesen / License

MIT

---

> Dibina dengan ❤️ untuk komuniti WhatsApp API Malaysia
> Built with ❤️ for the Malaysian WhatsApp API community
