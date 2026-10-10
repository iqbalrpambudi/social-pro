# SocialPro — Social Media Video Uploader Service & Dashboard

Aplikasi multi-platform **Social Media Video Uploader** dengan arsitektur **API-First Modular Monolith** dan **Web Dashboard GUI (React + Vite + Radix UI)** untuk mendistribusikan video ke media sosial resmi (**YouTube, TikTok, Instagram, Facebook**).

---

## 🌟 Fitur Utama

1. **Direct-to-Storage Presigned Upload**:
   - Video berukuran besar diunggah langsung dari browser ke private Object Storage (MinIO S3 / Cloudflare R2 / AWS S3) melalui Presigned PUT URL.
   - Server backend tidak terbebani bandwidth dan memori streaming video.
2. **Asynchronous Background Queue (`pg-boss` di atas PostgreSQL)**:
   - Tidak memerlukan Redis di awal. Menggunakan database PostgreSQL yang sama untuk persistensi data dan queue background job.
   - **1 Target Platform = 1 Job Logis**: Kegagalan di satu platform tidak menggagalkan target platform lainnya.
3. **Real-time Server-Sent Events (SSE)**:
   - Dashboard web memantau status upload, progress publikasi platform, dan URL hasil secara real-time via endpoint SSE stream.
4. **Adapter Scalability (Provider Registry Pattern)**:
   - Menggunakan modular adapter registry. Saat ini telah mengimplementasikan **`YouTubeAdapter`** (API resmi v3) dan **`MockPlatformAdapter`** (untuk pengujian dev tanpa memotong kuota).
   - Mudah diekstensi untuk **TikTok**, **Instagram Reels**, dan **Facebook Video**.
5. **Pelindung Kuota YouTube (Quota-Conscious Guard)**:
   - Kuota default YouTube Data API v3 adalah **10.000 unit/hari** (1 upload = 1.600 unit = ~6 video/hari).
   - Sistem melacak kuota harian secara otomatis dan mencegah error ban `403 quotaExceeded`.
6. **Keamanan Kredensial (Zero-Token Exposure)**:
   - Access token dan refresh token OAuth disimpan di PostgreSQL dengan enkripsi **AES-256-GCM**. Token tidak pernah dikirim ke browser.
   - Logging terstruktur (Pino) dengan sanitasi redaction otomatis.

---

## 🏗️ Tech Stack

* **Backend Runtime & HTTP**: Node.js v24 LTS + TypeScript + [Hono](https://hono.dev/) (`@hono/node-server`)
* **Database & ORM**: PostgreSQL 16 + [Drizzle ORM](https://orm.drizzle.team/)
* **Queue**: `pg-boss` (PostgreSQL-backed background queue)
* **Object Storage**: S3-Compatible (MinIO lokal / Cloudflare R2 / AWS S3)
* **Frontend Web Dashboard**: React 19 + Vite + Radix UI + Lucide React + Vanilla CSS (Dark theme glassmorphism)

---

## 🚀 Panduan Menjalankan Aplikasi

### 1. Prasyarat
* Node.js v20+ atau v24 LTS
* Docker & Docker Compose

### 2. Jalankan Infrastruktur Lokal (PostgreSQL & MinIO S3)
```bash
# Menyalakan PostgreSQL (port 5434) dan MinIO (port 9000 & 9001)
docker compose up -d
```

### 3. Konfigurasi Environment
Salin template konfigurasi:
```bash
cp .env.example .env
```
Default port:
* PostgreSQL: `5434`
* MinIO S3 API: `9000` (Console Web: `http://localhost:9001`, user: `minioadmin`, pass: `minioadmin`)
* Backend API: `4000`
* Frontend Web: `5173`

### 4. Menjalankan Backend API & Background Worker
```bash
# Terminal 1 - Jalankan API Server
npm run backend:dev

# Terminal 2 - Jalankan Worker Queue
npm run backend:worker
```

### 5. Menjalankan Frontend Dashboard
```bash
# Terminal 3 - Jalankan Vite Web App
npm run frontend:dev
```
Buka browser di **http://localhost:5173**.

---

## 📡 Dokumentasi Endpoint API (`/v1`)

| Method | Endpoint | Deskripsi |
|---|---|---|
| `GET` | `/health` | Liveness check |
| `GET` | `/ready` | Readiness check (cek koneksi DB & S3) |
| `GET` | `/v1/events/stream` | Server-Sent Events (SSE) live progress stream |
| `POST` | `/v1/media/uploads` | Buat sesi upload & terima presigned PUT URL |
| `POST` | `/v1/media/:id/complete` | Verifikasi integritas file di S3 dan ubah status ke `ready` |
| `GET` | `/v1/media` | Daftar media yang tersimpan di S3 |
| `GET` | `/v1/social-accounts` | Daftar akun media sosial yang terhubung |
| `POST` | `/v1/social-accounts/mock-connect` | Hubungkan channel simulasi (Dev mode) |
| `DELETE` | `/v1/social-accounts/:id` | Putuskan koneksi akun sosial |
| `POST` | `/v1/publications` | Buat publikasi ke satu atau banyak target platform |
| `GET` | `/v1/publications` | Riwayat publikasi dan status seluruh target |
| `GET` | `/v1/publications/:id` | Detail status publikasi, external post URL, dan error log |
| `POST` | `/v1/publications/:id/retry` | Antrekan ulang target yang gagal diproses |
| `GET` | `/v1/publications/quota/today` | Status kuota harian YouTube (~6 video/hari) |

Semua endpoint `/v1/*` diproteksi dengan header:
```http
Authorization: Bearer smu_secret_token_dev_12345
```
