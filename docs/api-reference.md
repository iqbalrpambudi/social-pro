# Social Media Uploader — API Reference

Versi API-first untuk aplikasi Social Media Uploader. API yang sama dipakai oleh:
- **Web GUI**: dashboard, pemilihan akun/platform, upload video, penjadwalan, dan monitoring.
- **Integrasi langsung**: aplikasi lain mengirim video dan membuat publikasi melalui REST API.
- **Worker internal**: memproses publikasi ke YouTube, TikTok, Instagram, dan Facebook menggunakan adapter platform.

> Base URL contoh: `https://api.example.com/v1`  
> Semua endpoint di bawah memakai `/v1`. Ganti domain sesuai deployment.

## 1. Prinsip desain

1. GUI bukan jalur khusus. GUI memanggil API publik yang sama dengan integrasi eksternal.
2. Upload file besar dilakukan langsung ke object storage menggunakan presigned URL. API server tidak perlu menjadi proxy untuk seluruh byte video.
3. `POST /publications` membuat satu permintaan publikasi dengan satu atau banyak target platform.
4. Satu publikasi dapat berhasil di satu platform dan gagal di platform lain; status disimpan per target.
5. Semua operasi tulis memerlukan `Idempotency-Key` agar retry klien tidak membuat publikasi ganda.
6. Token provider tidak pernah dikembalikan ke klien.

## 2. Authentication

Gunakan API key untuk server-to-server integration. GUI sebaiknya menggunakan session cookie `HttpOnly`, `Secure`, `SameSite` atau access token berumur pendek sesuai arsitektur autentikasi.

### API key

Kirim key pada header:

```http
Authorization: Bearer smu_live_REPLACE_WITH_SECRET
```

- Simpan key hanya di backend integrator, bukan di browser/mobile bundle.
- Sediakan kemampuan revoke, rotasi, scope, dan pembatasan rate.
- Jangan menggunakan API key milik pengguna dari kode frontend.

Untuk aplikasi multi-tenant, setiap request harus dibatasi ke workspace/tenant pemilik kredensial.

### Idempotency

Untuk operasi `POST` yang membuat resource, kirim:

```http
Idempotency-Key: 9bd2d6d2-9d9b-4c7d-8b2e-2f5a2e51b8a1
```

Gunakan key yang sama saat mengulang request yang sama. Server menyimpan hasil request berdasarkan principal + endpoint + key dan menolak pemakaian ulang key yang sama dengan payload berbeda (`409 IDEMPOTENCY_CONFLICT`).

## 3. Workflow API

1. `POST /media/uploads` — meminta upload session dan presigned URL.
2. Client mengunggah video langsung ke `upload.url` menggunakan method/header yang diberikan.
3. `POST /media/{mediaId}/complete` — menyatakan upload selesai; server memverifikasi object, ukuran, dan checksum jika tersedia.
4. `GET /media/{mediaId}` — tunggu sampai media siap (`ready`) bila validasi asynchronous.
5. `GET /social-accounts` — pilih akun platform yang sudah terhubung melalui OAuth.
6. `POST /publications` — membuat publikasi ke satu atau beberapa target.
7. `GET /publications/{publicationId}` — polling status publikasi.
8. Opsional: daftarkan webhook agar sistem Anda menerima perubahan status tanpa polling.

## 4. Endpoint

### Health

#### `GET /health`

Liveness check. Tidak mengembalikan secret atau detail infrastruktur.

Response `200`:

```json
{
  "status": "ok"
}
```

#### `GET /ready`

Readiness check untuk deployment. Periksa dependency penting, tetapi jangan mengekspos connection string atau credential.

---

### Upload media

#### `POST /media/uploads`

Membuat media record dan upload session. Gunakan `Content-Length` atau `sizeBytes` untuk validasi batas upload.

Request:

```http
POST /v1/media/uploads
Authorization: Bearer smu_live_REPLACE_WITH_SECRET
Idempotency-Key: 9bd2d6d2-9d9b-4c7d-8b2e-2f5a2e51b8a1
Content-Type: application/json
```

```json
{
  "fileName": "video-demo.mp4",
  "contentType": "video/mp4",
  "sizeBytes": 73400320,
  "checksumSha256": "optional-hex-sha256"
}
```

Response `201`:

```json
{
  "media": {
    "id": "med_01JABCDEF0123456789",
    "status": "upload_pending",
    "fileName": "video-demo.mp4",
    "contentType": "video/mp4",
    "sizeBytes": 73400320,
    "createdAt": "2026-10-10T12:00:00.000Z"
  },
  "upload": {
    "method": "PUT",
    "url": "https://storage.example.com/presigned-url",
    "headers": {
      "Content-Type": "video/mp4"
    },
    "expiresAt": "2026-10-10T12:15:00.000Z"
  }
}
```

`url` dan header bersifat sementara. Kirim file ke URL tersebut, bukan ke URL API.

Contoh browser/client upload:

```ts
const response = await fetch(upload.url, {
  method: upload.method,
  headers: upload.headers,
  body: videoFile,
});

if (!response.ok) {
  throw new Error(`Upload failed: ${response.status}`);
}
```

Untuk CLI, `curl` juga bisa digunakan:

```bash
curl -X PUT "$PRESIGNED_URL" \
  -H "Content-Type: video/mp4" \
  --upload-file "./video-demo.mp4"
```

Jangan menambahkan header yang tidak diminta oleh presigned URL; beberapa object-storage provider menandatangani header tertentu.

#### `POST /media/{mediaId}/complete`

Dipanggil setelah upload ke storage selesai.

Response `202`:

```json
{
  "media": {
    "id": "med_01JABCDEF0123456789",
    "status": "processing"
  }
}
```

Server memverifikasi object di storage, ukuran, tipe file, dan checksum. Jika pemeriksaan sinkron, status dapat langsung `ready`; jika asynchronous, gunakan `GET /media/{mediaId}` atau webhook.

#### `GET /media/{mediaId}`

Response `200`:

```json
{
  "id": "med_01JABCDEF0123456789",
  "status": "ready",
  "fileName": "video-demo.mp4",
  "contentType": "video/mp4",
  "sizeBytes": 73400320,
  "durationSeconds": 48.2,
  "width": 1080,
  "height": 1920,
  "createdAt": "2026-10-10T12:00:00.000Z"
}
```

Status media yang umum: `upload_pending`, `processing`, `ready`, `failed`.

#### `GET /media`

Daftar media milik workspace saat ini. Mendukung `limit`, `cursor`, `status`.

---

### Social accounts

#### `GET /social-accounts`

Daftar akun yang telah dihubungkan melalui OAuth.

Response `200`:

```json
{
  "data": [
    {
      "id": "sac_01JXYZ",
      "platform": "youtube",
      "displayName": "My Channel",
      "externalAccountId": "provider-account-id",
      "status": "connected",
      "capabilities": {
        "videoUpload": true,
        "scheduledPublishing": true
      }
    }
  ],
  "nextCursor": null
}
```

Jangan kembalikan access token atau refresh token.

#### `POST /social-accounts/{accountId}/reconnect`

Memulai proses reconnect OAuth jika koneksi expired/revoked. Implementasi bisa mengembalikan URL authorization atau mengalihkan ke halaman OAuth. Callback OAuth harus divalidasi menggunakan `state` dan proteksi CSRF.

#### `DELETE /social-accounts/{accountId}`

Memutus akun dari service. Perilaku terhadap publikasi yang sudah antre harus dijelaskan di produk; rekomendasi: jangan membatalkan publikasi yang sedang diproses secara diam-diam, tandai target tertunda sebagai gagal dengan kode yang jelas.

> Koneksi akun baru idealnya dimulai melalui UI admin atau endpoint OAuth yang menghasilkan authorization URL singkat. Jangan menerima token provider mentah dari browser sebagai cara koneksi utama.

---

### Publikasi

#### `POST /publications`

Membuat publikasi ke satu atau banyak platform. Endpoint mengembalikan `202 Accepted`; publikasi diproses oleh worker di background.

Request:

```http
POST /v1/publications
Authorization: Bearer smu_live_REPLACE_WITH_SECRET
Idempotency-Key: 9bd2d6d2-9d9b-4c7d-8b2e-2f5a2e51b8a1
Content-Type: application/json
```

```json
{
  "mediaId": "med_01JABCDEF0123456789",
  "targets": [
    {
      "socialAccountId": "sac_youtube_01",
      "caption": "Video terbaru kami",
      "title": "Video Demo",
      "visibility": "public"
    },
    {
      "socialAccountId": "sac_tiktok_01",
      "caption": "Video terbaru kami #demo",
      "privacyLevel": "PUBLIC_TO_EVERYONE",
      "disableComment": false,
      "disableDuet": false,
      "disableStitch": false
    },
    {
      "socialAccountId": "sac_instagram_01",
      "caption": "Video terbaru kami"
    },
    {
      "socialAccountId": "sac_facebook_01",
      "caption": "Video terbaru kami",
      "title": "Video Demo"
    }
  ],
  "scheduleAt": null,
  "clientReference": "campaign-october-001"
}
```

Catatan:
- `mediaId` harus milik workspace yang sama dan berstatus `ready`.
- Setiap target harus menunjuk ke akun yang terhubung dan berhak diakses.
- Field target divalidasi berdasarkan platform; jangan menganggap semua platform mendukung opsi yang sama.
- `scheduleAt` adalah ISO 8601 UTC, misalnya `2026-10-12T09:00:00Z`. `null` berarti publish secepatnya.
- Sebelum production, validasi panjang caption, rasio/durasi video, kategori, visibility, dan izin sesuai aturan terbaru tiap provider.
- API service tidak dapat menjamin bahwa setiap akun memiliki izin API untuk direct publishing; approval dan scope provider tetap diperlukan.

Response `202`:

```json
{
  "id": "pub_01JPUBLICATION",
  "status": "queued",
  "mediaId": "med_01JABCDEF0123456789",
  "scheduleAt": null,
  "targets": [
    {
      "id": "ptg_youtube_01",
      "socialAccountId": "sac_youtube_01",
      "platform": "youtube",
      "status": "queued"
    },
    {
      "id": "ptg_tiktok_01",
      "socialAccountId": "sac_tiktok_01",
      "platform": "tiktok",
      "status": "queued"
    }
  ],
  "createdAt": "2026-10-10T12:05:00.000Z"
}
```

Status publikasi: `draft`, `scheduled`, `queued`, `processing`, `partially_succeeded`, `succeeded`, `failed`, `cancelled`.

Status target: `queued`, `processing`, `uploading`, `publishing`, `succeeded`, `failed`, `cancelled`, `unknown`.

`unknown` penting untuk kasus timeout setelah provider mungkin sudah menerima video; worker harus merekonsiliasi status sebelum mengulang operasi yang berpotensi membuat posting duplikat.

#### `GET /publications/{publicationId}`

Response `200`:

```json
{
  "id": "pub_01JPUBLICATION",
  "status": "partially_succeeded",
  "mediaId": "med_01JABCDEF0123456789",
  "scheduleAt": null,
  "targets": [
    {
      "id": "ptg_youtube_01",
      "platform": "youtube",
      "status": "succeeded",
      "providerPostId": "provider-video-id",
      "publishedAt": "2026-10-10T12:07:00.000Z",
      "error": null
    },
    {
      "id": "ptg_tiktok_01",
      "platform": "tiktok",
      "status": "failed",
      "providerPostId": null,
      "publishedAt": null,
      "error": {
        "code": "PROVIDER_PERMISSION_REQUIRED",
        "message": "Akun tidak memiliki izin yang diperlukan."
      }
    }
  ],
  "createdAt": "2026-10-10T12:05:00.000Z",
  "updatedAt": "2026-10-10T12:07:00.000Z"
}
```

#### `GET /publications`

Daftar publikasi dengan filter opsional `status`, `platform`, `from`, `to`, `limit`, `cursor`.

#### `POST /publications/{publicationId}/cancel`

Mencoba membatalkan publikasi yang masih `scheduled` atau `queued`. Tidak menjanjikan pembatalan jika proses sudah dikirim ke provider.

Response `202`:

```json
{
  "id": "pub_01JPUBLICATION",
  "status": "cancellation_requested"
}
```

#### `POST /publications/{publicationId}/retry`

Mengantrekan ulang target yang gagal dan aman untuk dicoba lagi. Endpoint tidak boleh blind-retry target berstatus `unknown`; rekonsiliasi provider harus dilakukan terlebih dahulu.

#### `GET /publications/{publicationId}/events`

Riwayat transisi status untuk debugging/audit.

---

### Webhooks

#### `POST /webhooks`

Mendaftarkan endpoint webhook milik integrator.

Request:

```json
{
  "url": "https://your-app.example.com/webhooks/social-uploader",
  "events": [
    "publication.target.succeeded",
    "publication.target.failed",
    "publication.completed"
  ]
}
```

Response mengembalikan `id` dan secret webhook **hanya saat dibuat**. Simpan secret secara aman.

Payload contoh:

```json
{
  "id": "evt_01JEVENT",
  "type": "publication.target.succeeded",
  "createdAt": "2026-10-10T12:07:00.000Z",
  "data": {
    "publicationId": "pub_01JPUBLICATION",
    "targetId": "ptg_youtube_01",
    "platform": "youtube",
    "status": "succeeded"
  }
}
```

Keamanan dan reliabilitas webhook:
- Sertakan signature HMAC-SHA256, timestamp, dan event ID.
- Penerima memverifikasi signature dan menolak timestamp yang terlalu lama.
- Retry delivery secara eksponensial; penerima harus idempotent berdasarkan event ID.
- Jangan mengirim token OAuth atau URL upload privat di payload.
- Tambahkan endpoint list/update/delete webhook dalam implementasi production.

---

## 5. Error format

Semua error memakai format konsisten:

```json
{
  "error": {
    "code": "MEDIA_NOT_READY",
    "message": "Media belum siap dipublikasikan.",
    "requestId": "req_01JREQUEST",
    "details": {
      "mediaId": "med_01JABCDEF0123456789"
    }
  }
}
```

Kode status yang umum:

| HTTP | Kapan digunakan |
|---|---|
| `400` | Payload tidak valid |
| `401` | API key/session tidak valid |
| `403` | Tidak memiliki scope/akses |
| `404` | Resource tidak ditemukan dalam workspace |
| `409` | Idempotency conflict atau state tidak sesuai |
| `413` | Ukuran request melebihi batas |
| `422` | Media/target tidak memenuhi aturan platform |
| `429` | Rate limit |
| `500` | Kesalahan internal |
| `502` / `503` | Provider/dependency sementara tidak tersedia |

Jangan mengungkap apakah resource milik workspace lain; gunakan perilaku `404` yang konsisten untuk menghindari enumerasi lintas tenant.

## 6. Rate limits dan pagination

- Gunakan rate limit terpisah untuk upload-session creation, publikasi, dan endpoint read.
- Kembalikan `429` bersama `Retry-After`.
- Gunakan cursor pagination (`limit` default 20, maksimum 100) untuk daftar resource.
- Batasi ukuran file, jumlah target per publikasi, dan jumlah job aktif per workspace melalui konfigurasi.
- Rate limit API service tidak menggantikan rate limit platform provider.

## 7. OpenAPI

File `openapi.yaml` di paket ini adalah kontrak awal untuk endpoint utama. Gunakan Swagger UI/Redoc untuk dokumentasi interaktif dan generator client SDK. Sesuaikan skema provider-specific dan endpoint admin sebelum production.

## 8. Rekomendasi implementasi

- `Hono + TypeScript` untuk REST API.
- `PostgreSQL + Drizzle` untuk metadata, idempotency, queue, event, dan webhook delivery.
- `pg-boss` untuk background jobs tanpa dependency Redis tambahan.
- Object storage privat yang kompatibel dengan S3 untuk video.
- API process dan worker process dijalankan terpisah dari satu codebase.
- OAuth token dienkripsi saat disimpan; akses token tidak pernah ditampilkan di API response.
- Tambahkan API key scopes, tenant isolation, audit logs, request IDs, OpenAPI validation, dan integration tests.
- Implementasikan satu platform sampai end-to-end sebelum menambahkan platform lain.

## 9. Official platform references

API behavior, scopes, account eligibility, content constraints, and review requirements change over time. Verify current official requirements before production:

- YouTube Data API: https://developers.google.com/youtube/v3
- TikTok Content Posting API: https://developers.tiktok.com/products/content-posting-api/
- Instagram Platform: https://developers.facebook.com/docs/instagram-platform/
- Facebook Graph API / Reels publishing: https://developers.facebook.com/docs/video-api/guides/reels-publishing/
