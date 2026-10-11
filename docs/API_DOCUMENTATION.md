# Social Pro — Panduan Lengkap Dokumentasi REST API

Dokumentasi resmi untuk integrasi programmatic API **Social Pro (Social Media Uploader)**. API ini dirancang dengan prinsip **API-first**, arsitektur **Direct Storage Upload**, dan **Asynchronous Worker Queue** yang memungkinkan Anda mengunggah media video dan mendistribusikannya ke berbagai platform media sosial (YouTube & Mock Simulator).

---

## 📑 Daftar Isi
1. [Akses Dokumentasi Interaktif](#-akses-dokumentasi-interaktif)
2. [Otentikasi & Keamanan](#-otentikasi--keamanan)
3. [Alur Kerja (Workflow) Integrasi](#-alur-kerja-workflow-integrasi)
4. [Endpoint Reference](#-endpoint-reference)
   - [Health & Infrastruktur](#1-health--infrastruktur)
   - [Media Assets (Upload S3)](#2-media-assets-upload-s3)
   - [Social Accounts](#3-social-accounts)
   - [OAuth 2.0 (YouTube Connect)](#4-oauth-20-youtube-connect)
   - [Publications](#5-publications)
   - [Real-time Events (SSE Stream)](#6-real-time-events-sse-stream)
5. [Contoh Kode Integrasi Lengkap (Node.js & Python)](#-contoh-kode-integrasi-lengkap)
6. [Daftar Error Code & Troubleshooting](#-daftar-error-code--troubleshooting)

---

## 🌐 Akses Dokumentasi Interaktif

Selain membaca dokumen ini, Anda dapat mengakses antarmuka dokumentasi interaktif yang sudah terpasang langsung di server:

| Format / Tool | URL | Keterangan |
|---|---|---|
| **Scalar / Swagger UI** | `http://localhost:4000/docs` | Dokumentasi interaktif modern dengan live test console & auto code generator |
| **OpenAPI 3.1 JSON** | `http://localhost:4000/openapi.json` | Spesifikasi standar untuk import ke **Postman**, **Insomnia**, atau **Bruno** |

---

## 🔐 Otentikasi & Keamanan

Semua permintaan ke endpoint `/v1/*` (kecuali callback OAuth) memerlukan header HTTP Bearer Token:

```http
Authorization: Bearer smu_secret_token_dev_12345
```

> **Default Token Dev**: `smu_secret_token_dev_12345`  
> Token dapat dikonfigurasi melalui environment variable `API_TOKEN` pada file `.env`.

### Idempotensi
Untuk endpoint pembuatan transaksi seperti `POST /v1/publications`, sangat disarankan mengirimkan header `Idempotency-Key` (berupa UUID atau string unik):

```http
Idempotency-Key: pub_req_1728643200_a1b2c3d4
```

Jika koneksi jaringan terputus dan klien melakukan *retry*, server akan mengembalikan hasil operasi sebelumnya tanpa memproses publikasi ganda.

---

## 🔄 Alur Kerja (Workflow) Integrasi

```mermaid
sequenceDiagram
    autonumber
    actor Client as Klien / Integrator
    participant API as Social Pro API
    participant S3 as Object Storage (S3/MinIO)
    participant Worker as Background Worker
    participant YT as YouTube Data API

    Client->>API: 1. POST /v1/media/uploads (nama, tipe, ukuran)
    API-->>Client: Mengembalikan mediaId & Presigned PUT URL
    Client->>S3: 2. PUT (Binary File Video langsung ke Storage)
    Client->>API: 3. POST /v1/media/{mediaId}/complete
    API-->>Client: Status media berubah menjadi "ready"
    Client->>API: 4. GET /v1/social-accounts (Dapatkan socialAccountId)
    Client->>API: 5. POST /v1/publications (mediaId + target + judul)
    API-->>Client: 201 Created (Status: "queued")
    Note over Worker: Worker mengambil antrean job
    Worker->>YT: Worker mengunggah video ke YouTube
    Worker->>API: Emit SSE Event (uploading -> published)
    Client->>API: 6. GET /v1/publications/{id} (Ambil link YouTube)
```

---

## 🚀 Endpoint Reference

### 1. Health & Infrastruktur

#### `GET /health`
Memeriksa apakah server Hono sedang aktif.
- **Security**: Tidak memerlukan token
- **Response `200`**:
  ```json
  { "status": "ok" }
  ```

#### `GET /ready`
Memeriksa kesiapan koneksi ke PostgreSQL dan S3/MinIO Object Storage.
- **Security**: Tidak memerlukan token
- **Response `200`**:
  ```json
  {
    "status": "ready",
    "database": "connected",
    "storage": "connected"
  }
  ```

---

### 2. Media Assets (Upload S3)

#### `POST /v1/media/uploads`
Membuat record media baru dan menghasilkan **Presigned PUT URL** berdurasi terbatas.
- **Headers**: `Authorization: Bearer <TOKEN>`, `Content-Type: application/json`
- **Request Body**:
  ```json
  {
    "fileName": "demo-video.mp4",
    "contentType": "video/mp4",
    "sizeBytes": 20971520
  }
  ```
- **Response `201 Created`**:
  ```json
  {
    "media": {
      "id": "f8892d45-cd0d-4e2c-ade1-677fc9f1bc2c",
      "status": "upload_pending",
      "fileName": "demo-video.mp4",
      "contentType": "video/mp4",
      "mediaType": "video",
      "sizeBytes": 20971520,
      "createdAt": "2026-10-11T10:00:00.000Z"
    },
    "upload": {
      "method": "PUT",
      "url": "http://localhost:9000/social-uploader-media/media/...?X-Amz-Signature=...",
      "headers": {
        "Content-Type": "video/mp4"
      },
      "expiresAt": "2026-10-11T10:15:00.000Z"
    }
  }
  ```

#### `PUT {upload.url}` (Langsung ke Storage)
Upload raw binary file video ke S3:
```bash
curl -X PUT "{upload.url}" \
  -H "Content-Type: video/mp4" \
  --upload-file "./demo-video.mp4"
```

#### `POST /v1/media/{mediaId}/complete`
Memverifikasi objek di storage dan mengubah status aset menjadi `ready`.
- **Response `200 OK`**:
  ```json
  {
    "media": {
      "id": "f8892d45-cd0d-4e2c-ade1-677fc9f1bc2c",
      "status": "ready",
      "fileName": "demo-video.mp4",
      "sizeBytes": 20971520
    }
  }
  ```

#### `GET /v1/media`
Mengambil semua media aset milik user beserta `previewUrl` aktif untuk streaming.
- **Response `200 OK`**:
  ```json
  {
    "data": [
      {
        "id": "f8892d45-cd0d-4e2c-ade1-677fc9f1bc2c",
        "status": "ready",
        "fileName": "demo-video.mp4",
        "previewUrl": "http://localhost:9000/social-uploader-media/media/...presigned..."
      }
    ]
  }
  ```

#### `DELETE /v1/media/{mediaId}`
Menghapus file media dari database dan S3 storage.

---

### 3. Social Accounts

#### `GET /v1/social-accounts`
Mengambil daftar akun media sosial yang terhubung.
- **Response `200 OK`**:
  ```json
  {
    "data": [
      {
        "id": "b5216f2c-af33-45f3-8439-17cda01fbed6",
        "platform": "youtube",
        "displayName": "Channel Saya",
        "externalAccountId": "UC_xxxxxxxxxxxxxxxx",
        "status": "active",
        "capabilities": {
          "videoUpload": true,
          "scheduledPublishing": true,
          "customThumbnail": true
        }
      }
    ]
  }
  ```

#### `POST /v1/social-accounts/mock-connect`
Menghubungkan akun simulasi untuk pengujian lokal tanpa akun YouTube asli.
- **Request Body**:
  ```json
  {
    "displayName": "Dev Channel Simulator",
    "platform": "youtube"
  }
  ```

#### `DELETE /v1/social-accounts/{id}`
Memutuskan koneksi akun media sosial.

---

### 4. OAuth 2.0 (YouTube Connect)

#### `GET /v1/oauth/youtube/connect`
Menghasilkan URL consent resmi Google Cloud OAuth 2.0.
- **Response `200 OK`**:
  ```json
  {
    "authorizationUrl": "https://accounts.google.com/o/oauth2/v2/auth?client_id=...&scope=https://www.googleapis.com/auth/youtube.upload...",
    "state": "state_token_random_123"
  }
  ```

---

### 5. Publications

#### `POST /v1/publications`
Membuat permintaan publikasi video ke satu atau banyak akun platform.
- **Headers**:
  - `Authorization: Bearer <TOKEN>`
  - `Content-Type: application/json`
  - `Idempotency-Key: <OPTIONAL_UNIQUE_KEY>`
- **Request Body**:
  ```json
  {
    "mediaId": "f8892d45-cd0d-4e2c-ade1-677fc9f1bc2c",
    "targets": [
      {
        "socialAccountId": "b5216f2c-af33-45f3-8439-17cda01fbed6",
        "title": "Tutorial Automasi Video API",
        "caption": "Deskripsi video dan hashtag #socialpro #automation",
        "visibility": "public"
      }
    ],
    "scheduleAt": null
  }
  ```
- **Response `201 Created`**:
  ```json
  {
    "id": "8d431bb5-f11d-4923-960a-c3ce058077fc",
    "status": "queued",
    "mediaId": "f8892d45-cd0d-4e2c-ade1-677fc9f1bc2c",
    "scheduleAt": null,
    "targets": [
      {
        "id": "e452b69b-14f3-4f97-84b5-9f6997b90190",
        "socialAccountId": "b5216f2c-af33-45f3-8439-17cda01fbed6",
        "platform": "youtube",
        "status": "queued"
      }
    ],
    "createdAt": "2026-10-11T10:30:00.000Z"
  }
  ```

#### `GET /v1/publications` (Dengan Pagination)
Mengambil riwayat publikasi dengan parameter `limit` dan `offset`.
- **Query Params**:
  - `limit` (number, default: 20, max: 100)
  - `offset` (number, default: 0)
- **Response `200 OK`**:
  ```json
  {
    "data": [ ... ],
    "total": 45,
    "limit": 20,
    "offset": 0
  }
  ```

#### `GET /v1/publications/{id}`
Mengambil status detail publikasi dan URL hasil posting.
- **Response `200 OK`**:
  ```json
  {
    "id": "8d431bb5-f11d-4923-960a-c3ce058077fc",
    "status": "succeeded",
    "mediaId": "f8892d45-cd0d-4e2c-ade1-677fc9f1bc2c",
    "targets": [
      {
        "id": "e452b69b-14f3-4f97-84b5-9f6997b90190",
        "platform": "youtube",
        "status": "published",
        "attemptCount": 1,
        "externalPostId": "wb96B0hF2io",
        "externalPostUrl": "https://www.youtube.com/watch?v=wb96B0hF2io",
        "publishedAt": "2026-10-11T10:31:29.780Z"
      }
    ]
  }
  ```

#### `POST /v1/publications/{id}/retry`
Mengantrekan kembali publikasi yang berstatus `failed`.

#### `GET /v1/publications/quota/today`
Memeriksa penggunaan kuota YouTube Data API hari ini (batas default Google: 10.000 unit = ~6 video/hari).
- **Response `200 OK`**:
  ```json
  {
    "date": "2026-10-11",
    "platform": "youtube",
    "quotaUsed": 1600,
    "quotaLimit": 10000,
    "remainingUnits": 8400,
    "remainingVideos": 5
  }
  ```

---

### 6. Real-time Events (SSE Stream)

#### `GET /v1/events/stream`
Membuka streaming Server-Sent Events untuk monitoring event tanpa polling berulang.
- **Headers**:
  - `Accept: text/event-stream`
  - `Authorization: Bearer <TOKEN>`
- **Format Payload Event**:
  ```http
  event: publication_status
  data: {
    "publicationId": "8d431bb5-f11d-4923-960a-c3ce058077fc",
    "targetId": "e452b69b-14f3-4f97-84b5-9f6997b90190",
    "platform": "youtube",
    "status": "uploading",
    "timestamp": "2026-10-11T10:30:15.000Z",
    "message": "Mengunggah video ke YouTube via resumable session"
  }
  ```

---

## 💻 Contoh Kode Integrasi Lengkap

### Contoh Node.js / TypeScript (Menggunakan `fetch`)

```typescript
import fs from 'fs';

const API_BASE = 'http://localhost:4000';
const API_TOKEN = 'smu_secret_token_dev_12345';
const headers = {
  'Authorization': `Bearer ${API_TOKEN}`,
  'Content-Type': 'application/json',
};

async function publishVideo(filePath: string, title: string, description: string) {
  const stat = fs.statSync(filePath);

  console.log('1. Minta presigned upload session...');
  const uploadInitRes = await fetch(`${API_BASE}/v1/media/uploads`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      fileName: 'video.mp4',
      contentType: 'video/mp4',
      sizeBytes: stat.size,
    }),
  });
  const { media, upload } = await uploadInitRes.json();

  console.log(`2. Uploading binary file ke S3 (${stat.size} bytes)...`);
  const fileStream = fs.readFileSync(filePath);
  await fetch(upload.url, {
    method: 'PUT',
    headers: { 'Content-Type': 'video/mp4' },
    body: fileStream,
  });

  console.log('3. Konfirmasi upload selesai...');
  await fetch(`${API_BASE}/v1/media/${media.id}/complete`, {
    method: 'POST',
    headers,
  });

  console.log('4. Ambil social account target...');
  const accRes = await fetch(`${API_BASE}/v1/social-accounts`, { headers });
  const accounts = (await accRes.json()).data;
  const youtubeAccount = accounts.find((a: any) => a.platform === 'youtube');

  console.log('5. Trigger publikasi...');
  const pubRes = await fetch(`${API_BASE}/v1/publications`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      mediaId: media.id,
      targets: [
        {
          socialAccountId: youtubeAccount.id,
          title,
          caption: description,
          visibility: 'public',
        },
      ],
    }),
  });
  const publication = await pubRes.json();
  console.log('Publikasi berhasil diantrekan! ID:', publication.id);
  return publication;
}

// Jalankan
// publishVideo('./video.mp4', 'Judul Video Keren', 'Deskripsi video #automasi');
```

---

### Contoh Python (Menggunakan `requests`)

```python
import os
import requests

API_BASE = "http://localhost:4000"
API_TOKEN = "smu_secret_token_dev_12345"
HEADERS = {
    "Authorization": f"Bearer {API_TOKEN}",
    "Content-Type": "application/json"
}

def publish_video(file_path: str, title: str, description: str):
    file_size = os.path.getsize(file_path)

    # 1. Inisialisasi Upload
    init_res = requests.post(f"{API_BASE}/v1/media/uploads", headers=HEADERS, json={
        "fileName": os.path.basename(file_path),
        "contentType": "video/mp4",
        "sizeBytes": file_size
    }).json()

    media_id = init_res["media"]["id"]
    upload_url = init_res["upload"]["url"]

    # 2. Upload Binary ke Storage
    with open(file_path, "rb") as f:
        requests.put(upload_url, data=f, headers={"Content-Type": "video/mp4"})

    # 3. Complete Upload
    requests.post(f"{API_BASE}/v1/media/{media_id}/complete", headers=HEADERS)

    # 4. Ambil Akun
    accounts = requests.get(f"{API_BASE}/v1/social-accounts", headers=HEADERS).json()["data"]
    target_account_id = accounts[0]["id"]

    # 5. Publikasikan
    pub_res = requests.post(f"{API_BASE}/v1/publications", headers=HEADERS, json={
        "mediaId": media_id,
        "targets": [{
            "socialAccountId": target_account_id,
            "title": title,
            "caption": description,
            "visibility": "public"
        }]
    }).json()

    print(f"Publikasi masuk antrean! ID: {pub_res['id']}")
    return pub_res

# publish_video("video.mp4", "Judul Video", "Deskripsi")
```

---

## ⚠️ Daftar Error Code & Troubleshooting

| Error Code | HTTP Status | Penjelasan & Solusi |
|---|---|---|
| `UNAUTHORIZED` | 401 | Token tidak disertakan atau salah. Periksa header `Authorization: Bearer <TOKEN>`. |
| `BAD_REQUEST` | 400 | Payload JSON tidak sesuai skema (misal: `mediaId` bukan UUID atau format video tidak didukung). |
| `NOT_FOUND` | 404 | Resource data (`mediaId`, `publicationId`, atau `accountId`) tidak ditemukan. |
| `REAUTHORIZATION_REQUIRED` | 422 | Token OAuth YouTube kedaluwarsa atau izin dicabut. Buka menu **Social Accounts** dan hubungkan ulang akun YouTube. |
| `MOCK_ACCOUNT_USED` | 422 | Mencoba publish video menggunakan mock simulator account ke endpoint real. |
| `QUOTA_EXCEEDED` | 429 | Kuota harian YouTube Data API v3 (10.000 unit) habis. Tunggu reset kuota pukul 07:00 WIB (PST Midnight). |
| `SERVICE_UNAVAILABLE` | 503 | Database PostgreSQL atau MinIO Storage sedang offline. Periksa kontainer Docker. |
