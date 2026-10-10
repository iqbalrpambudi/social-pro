# Social Media Uploader Service

## Dokumen Arsitektur Teknis dan Panduan Pengembangan

-   **Status:** Draft baseline untuk implementasi MVP
-   **Versi dokumen:** 1.0
-   **Tanggal:** 10 Oktober 2026
-   **Bahasa:** Indonesia
-   **Stack utama:** Node.js + TypeScript + Hono + PostgreSQL
-   **Target awal:** 1--20 video per hari
-   **Prioritas:** Resource rendah, operasional sederhana, mudah
    dikembangkan

------------------------------------------------------------------------

## 1. Ringkasan Eksekutif

Social Media Uploader adalah service untuk mengirim satu video ke satu
atau beberapa akun media sosial melalui API resmi. Pengguna memilih
video, akun/platform tujuan, caption, metadata, dan waktu publikasi.
Sistem menyimpan video di object storage, membuat job publikasi
independen per target, mengirim video melalui API platform, lalu melacak
hasilnya.

### Keputusan arsitektur utama

1.  **Modular monolith**: satu codebase TypeScript dengan modul domain
    yang jelas.
2.  **API dan worker merupakan proses terpisah** dari codebase yang
    sama. Pada deployment awal keduanya boleh berjalan di satu
    mesin/container host.
3.  **Upload browser langsung ke object storage** menggunakan presigned
    URL. API tidak menerima seluruh payload video.
4.  **PostgreSQL sebagai sumber data utama** untuk pengguna, akun
    sosial, media, publikasi, status, dan audit.
5.  **Queue PostgreSQL terlebih dahulu** untuk meminimalkan komponen
    infrastruktur. Gunakan `pg-boss` sebagai opsi awal; pertimbangkan
    BullMQ + Redis bila kebutuhan queue berkembang atau Redis sudah
    tersedia sebagai layanan terkelola.
6.  **Adapter per platform**: YouTube, TikTok, Instagram, dan Facebook
    tidak boleh disatukan menjadi satu alur API generik yang mengabaikan
    perbedaan.
7.  **OAuth dan token disimpan di backend**, dienkripsi, dan tidak
    dikirim ke frontend.
8.  **Retry bersifat sadar-status**: kegagalan jaringan tidak otomatis
    berarti platform belum menerima video. Periksa status/ID eksternal
    sebelum mencoba publikasi ulang.
9.  **Tidak melakukan transcoding secara default**. FFmpeg hanya
    ditambahkan untuk validasi lanjutan, thumbnail, atau konversi yang
    benar-benar diperlukan.
10. **API resmi dan proses approval adalah dependency produk**, bukan
    detail implementasi belaka. Akses auto-publish berbeda
    antarplatform, tipe akun, scope, dan status audit aplikasi.

### Catatan tentang queue dan resource

Untuk volume 1--20 video per hari, sistem tidak memerlukan Kafka,
Kubernetes, atau microservices per platform. Pilihan paling hemat
komponen adalah PostgreSQL + `pg-boss`, sehingga Redis tidak wajib
dioperasikan. Jika tim memilih BullMQ sesuai stack Node.js umum,
jalankan Redis sebagai layanan terkelola atau tambahkan Redis setelah
ada kebutuhan yang jelas. Jangan menggunakan dua sistem queue sekaligus.

------------------------------------------------------------------------

## 2. Tujuan dan Batasan

### 2.1 Tujuan MVP

-   Menghubungkan akun sosial melalui OAuth resmi.
-   Mengunggah video ke object storage dengan aman.
-   Memilih satu atau lebih akun/platform tujuan untuk sebuah video.
-   Mengirim publikasi secara asynchronous.
-   Menyimpan status per target publikasi.
-   Menampilkan error yang dapat ditindaklanjuti.
-   Mengulang target gagal tanpa mengulang target yang telah sukses.
-   Menyediakan dasar untuk scheduling, token refresh, dan notifikasi.

### 2.2 Bukan tujuan MVP

-   Mengedit video secara kompleks.
-   Menjadi sistem analytics sosial media penuh.
-   Menjamin semua platform menerima publikasi untuk semua jenis akun.
-   Mengakali API resmi, batasan rate limit, atau proses audit platform.
-   Menjamin publikasi exactly-once. API eksternal dan jaringan tidak
    memungkinkan jaminan ini secara umum; sistem menggunakan idempotency
    dan rekonsiliasi untuk mengurangi duplikasi.

### 2.3 Asumsi

-   Satu video dapat dikirim ke beberapa target.
-   Target adalah pasangan platform + akun sosial yang terhubung.
-   Akun sosial dimiliki atau diotorisasi oleh pengguna yang
    menghubungkannya.
-   MVP menggunakan satu backend deployment dan satu worker deployment.
-   Video disimpan sementara atau sesuai kebijakan retensi yang
    ditentukan produk.
-   Semua integrasi menggunakan API resmi dan mematuhi kebijakan
    masing-masing platform.

------------------------------------------------------------------------

## 3. Stack Final

  ---------------------------------------------------------------------------------
  Area                    Pilihan                           Alasan
  ----------------------- --------------------------------- -----------------------
  Runtime                 Node.js LTS                       Stabil untuk service
                                                            HTTP dan I/O; gunakan
                                                            rilis LTS yang sesuai
                                                            jadwal resmi Node.js

  Bahasa                  TypeScript dengan strict mode     Kontrak payload, model
                                                            domain, dan adapter
                                                            lebih aman

  HTTP framework          Hono + `@hono/node-server`        API kecil, ringan,
                                                            sederhana, mudah diuji

  Validation              Zod                               Validasi request dan
                                                            konfigurasi platform
                                                            pada runtime

  Database                PostgreSQL                        Sumber kebenaran untuk
                                                            data relasional,
                                                            transaksi, status, dan
                                                            audit

  ORM/query               Drizzle ORM                       Query dan schema
                                                            bertipe, migrasi
                                                            terkontrol

  Queue default           `pg-boss`                         Menggunakan PostgreSQL
                                                            yang sudah diperlukan;
                                                            menghindari Redis
                                                            sebagai komponen
                                                            tambahan pada volume
                                                            rendah

  Queue alternatif        BullMQ + Redis                    Pilih bila Redis sudah
                                                            tersedia/terkelola atau
                                                            fitur operasional
                                                            BullMQ lebih sesuai

  Object storage          S3-compatible; misalnya           File video tidak
                          Cloudflare R2 atau layanan S3     disimpan di database
                          lain                              atau filesystem
                                                            container

  HTTP client             `fetch` bawaan Node.js atau       HTTP API, OAuth,
                          `undici`                          upload, dan polling

  Logging                 Pino                              JSON log terstruktur

  Testing                 Vitest,                           Unit, integration, dan
                          Supertest-compatible/in-process   contract tests
                          Hono testing, testcontainers bila 
                          diperlukan                        

  API schema              OpenAPI                           Dokumentasi API dan
                                                            validasi kontrak

  Deployment              Docker image + managed            Operasional sederhana,
                          PostgreSQL/object storage         mudah dipindahkan

  Media processing        FFmpeg opsional                   Hanya jika perlu
                                                            thumbnail, inspeksi
                                                            codec, atau transcode
  ---------------------------------------------------------------------------------

**Versi Node.js:** pilih versi LTS yang direkomendasikan pada saat
proyek mulai dibangun dan pin versi runtime di image serta CI. Periksa
jadwal rilis resmi: https://github.com/nodejs/Release

**Hono di Node.js:** https://hono.dev/docs/getting-started/nodejs

### 3.1 Mengapa Hono, bukan framework yang lebih besar?

Kebutuhan utama adalah endpoint REST, OAuth callback, upload-session
creation, status job, dan webhook. Hono memberi lapisan routing ringan.
Bila tim lebih menyukai plugin ecosystem dan schema integration server
yang lebih opinionated, Fastify juga pilihan yang valid. Jangan memilih
berdasarkan microbenchmark semata; konsistensi implementasi dan keamanan
lebih penting untuk beban 1--20 video/hari.

### 3.2 Mengapa PostgreSQL queue dulu?

Pada skala awal, menambahkan Redis berarti menambah service,
konfigurasi, monitoring, credential, dan kemungkinan biaya. Queue
berbasis PostgreSQL mengurangi komponen yang harus dioperasikan. Jika
nanti ada kebutuhan throughput/isolasi queue lebih tinggi, migrasi ke
BullMQ + Redis dapat dilakukan di balik interface `JobQueue`.

### 3.3 Mengapa tidak menggunakan serverless untuk seluruh sistem?

API ringan dapat dijalankan pada platform serverless/container managed,
tetapi upload media, proses polling panjang, dan worker yang harus
berjalan terus perlu diperiksa batas waktu eksekusi dan model billing
platform. Arsitektur ini tidak mengunci deployment: API bisa dipindahkan
ke managed container dan worker dijalankan sebagai worker service.

------------------------------------------------------------------------

## 4. Arsitektur Tingkat Tinggi

``` mermaid
flowchart TD
    U[Dashboard / Client] -->|Create upload URL| API[Hono API]
    API --> DB[(PostgreSQL)]
    API --> OBJ[(Object Storage)]
    U -->|Direct upload via presigned URL| OBJ
    U -->|Complete upload + submit publication| API
    API --> DB
    API --> Q[PostgreSQL-backed Queue]
    Q --> W[Background Worker]
    W --> DB
    W --> OBJ
    W --> Y[YouTube Adapter]
    W --> T[TikTok Adapter]
    W --> I[Instagram Adapter]
    W --> F[Facebook Adapter]
    Y --> EXT[Official Platform APIs]
    T --> EXT
    I --> EXT
    F --> EXT
    EXT -->|status / webhook where supported| API
```

### 4.1 Komponen

**Dashboard/client** - Memilih file, target akun, metadata, privasi, dan
jadwal. - Mengunggah file langsung ke object storage. - Memantau status
publikasi. - Tidak pernah menerima atau menyimpan provider refresh
token.

**API** - Autentikasi dan otorisasi pengguna. - Validasi request dengan
Zod. - Membuat upload session dan publication record. - Memvalidasi
kepemilikan media serta akun target. - Menjadwalkan pekerjaan dan
mengembalikan response cepat. - Menyediakan OAuth start/callback dan
endpoint status.

**PostgreSQL** - Menyimpan semua data bisnis dan status publikasi. -
Menjadi sumber kebenaran, bukan status in-memory. - Menyimpan audit
event yang relevan. - Dapat menjadi backend queue melalui `pg-boss`.

**Object storage** - Menyimpan binary video dan thumbnail. - Menggunakan
private bucket secara default. - Mengeluarkan presigned URL dengan masa
berlaku pendek. - Tidak menggunakan URL publik permanen untuk media
privat.

**Worker** - Mengambil pekerjaan queue. - Mengambil metadata media dan
credential akun. - Menjalankan adapter platform. - Menyimpan sesi
upload, external post ID, status, dan error. - Menjalankan retry
terkontrol serta polling status.

**Platform adapter** - Memetakan model internal ke payload API
platform. - Mengimplementasikan auth header, inisialisasi upload,
transfer, finalisasi, dan status check yang diperlukan. - Menormalkan
error provider menjadi kategori internal. - Tidak mengasumsikan semua
platform memiliki proses upload identik.

------------------------------------------------------------------------

## 5. Alur Utama

### 5.1 Connect social account

1.  Pengguna memilih platform dan menekan Connect.
2.  Backend membuat OAuth `state` yang acak, berumur pendek, sekali
    pakai, dan terikat pada sesi pengguna.
3.  Backend mengarahkan browser ke authorization URL resmi.
4.  Platform mengarahkan kembali ke callback backend.
5.  Backend memvalidasi `state`, menukar authorization code, dan
    memverifikasi identitas akun sesuai API platform.
6.  Backend menyimpan provider account ID, token terenkripsi, expiry,
    scope, dan status koneksi.
7.  Frontend menampilkan akun terhubung beserta izin yang tersedia.

**Aturan:** gunakan PKCE jika didukung oleh provider dan flow terkait.
Validasi redirect URI secara ketat. Jangan memasukkan token ke query
string atau log.

### 5.2 Upload media

1.  Client meminta `POST /v1/media/upload-url`.
2.  Backend memvalidasi ukuran, nama file, tipe yang diizinkan, kuota,
    dan user.
3.  Backend membuat record media berstatus `upload_pending` dan key
    storage acak yang tidak berasal langsung dari nama file pengguna.
4.  Backend memberikan presigned URL dan metode upload.
5.  Browser mengunggah file langsung ke storage.
6.  Client memanggil `POST /v1/media/:id/complete`.
7.  Backend memverifikasi object benar-benar ada, ukuran, dan metadata
    storage. Jangan hanya percaya klaim client.
8.  Media berubah menjadi `ready` setelah validasi dasar selesai.

Untuk file besar, gunakan multipart upload yang didukung provider
storage. Jangan meneruskan seluruh video melalui memory buffer API.

### 5.3 Submit publikasi

1.  Client mengirim media ID, target akun, metadata per target, dan
    waktu publikasi opsional.
2.  API memvalidasi media `ready`, kepemilikan media, kepemilikan akun,
    scope, serta field yang diperlukan platform.
3.  Dalam transaksi database, API membuat `publication` dan satu
    `publication_target` untuk setiap akun/platform yang dipilih.
4.  API membuat job per target atau menjadwalkan target untuk waktu yang
    ditentukan.
5.  API mengembalikan `202 Accepted` dan ID publikasi.
6.  Worker mengerjakan target satu per satu secara independen.
7.  UI melakukan polling status atau menggunakan mekanisme realtime yang
    ditambahkan kemudian.

Satu target gagal tidak boleh membatalkan target lain.

### 5.4 Publish ke platform

Implementasi adapter dapat mencakup tahapan berikut, sesuai kebutuhan
API provider:

1.  Validasi ulang akun, scope, dan media.
2.  Ambil token dan refresh jika didukung serta diperlukan.
3.  Inisialisasi upload/session/container.
4.  Upload video atau menyediakan URL yang dapat diakses platform sesuai
    mekanisme resmi.
5.  Poll status pemrosesan jika diperlukan.
6.  Finalisasi/publish jika flow provider memerlukannya.
7.  Simpan external ID, URL posting, waktu publikasi, dan status akhir.
8.  Catat hasil tanpa menyimpan token atau data sensitif di log.

### 5.5 Scheduled publishing

-   Simpan `scheduled_at` dalam UTC.
-   UI boleh menampilkan zona waktu lokal, tetapi backend menyimpan
    timestamp UTC.
-   Queue tidak boleh menjadi satu-satunya sumber jadwal; database
    menyimpan jadwal otoritatif.
-   Job scheduler mengambil target yang jatuh tempo, membuat/memicu job,
    lalu memperbarui status secara transaksional.
-   Jika worker mati, scheduler harus dapat menemukan kembali target
    yang jatuh tempo dan belum diproses.
-   Jangan membuat job ganda ketika scheduler berjalan bersamaan;
    gunakan locking atau update bersyarat di database.

------------------------------------------------------------------------

## 6. Status dan State Machine

### 6.1 Media status

-   `upload_pending`
-   `uploaded`
-   `validating`
-   `ready`
-   `rejected`
-   `deleted`

### 6.2 Publication target status

-   `scheduled`
-   `queued`
-   `preparing`
-   `uploading`
-   `processing`
-   `publishing`
-   `published`
-   `retry_wait`
-   `failed`
-   `cancelled`
-   `reauthorization_required`
-   `unknown_remote_state`

`unknown_remote_state` penting ketika request timeout setelah provider
mungkin menerima upload/publikasi. Sistem harus melakukan rekonsiliasi
sebelum mencoba ulang.

### 6.3 Aturan transisi

-   `queued` → `preparing`
-   `preparing` → `uploading` atau `processing` sesuai adapter
-   `uploading` → `processing` / `publishing`
-   `processing` → `publishing` / `published`
-   status aktif → `retry_wait` untuk error sementara yang aman dicoba
    ulang
-   status aktif → `failed` untuk error permanen
-   status aktif → `reauthorization_required` bila token/izin tidak
    dapat diperbaiki otomatis
-   timeout ambigu → `unknown_remote_state`, lalu status
    check/reconciliation
-   `published` adalah status terminal kecuali provider mengirim status
    koreksi yang relevan

Semua transisi harus diperiksa oleh domain service; jangan membiarkan
endpoint mengubah status arbitrer.

------------------------------------------------------------------------

## 7. Model Data

Gunakan UUID sebagai primary key internal. Simpan ID provider di kolom
terpisah. Semua tabel multi-tenant harus memiliki `user_id`/`tenant_id`
dan query harus memeriksa ownership.

### 7.1 `users`

  Kolom          Tipe          Catatan
  -------------- ------------- ------------------
  `id`           uuid PK       ID internal
  `email`        text unique   Email login
  `created_at`   timestamptz   Waktu dibuat
  `updated_at`   timestamptz   Waktu diperbarui

Jika autentikasi dikelola oleh identity provider eksternal, simpan
`auth_subject` sebagai ID eksternal unik, bukan password lokal.

### 7.2 `social_accounts`

  ----------------------------------------------------------------------------------
  Kolom                        Tipe                    Catatan
  ---------------------------- ----------------------- -----------------------------
  `id`                         uuid PK                 ID internal

  `user_id`                    uuid FK                 Pemilik akun di aplikasi

  `platform`                   enum/text               `youtube`, `tiktok`,
                                                       `instagram`, `facebook`

  `provider_account_id`        text                    ID akun/page pada provider

  `display_name`               text                    Nama tampilan

  `access_token_ciphertext`    text                    Token terenkripsi

  `refresh_token_ciphertext`   text nullable           Jika provider memberi refresh
                                                       token

  `token_expires_at`           timestamptz nullable    Expiry token

  `scopes`                     jsonb                   Scope yang diberikan

  `connection_status`          text                    `connected`,
                                                       `reauthorization_required`,
                                                       `revoked`, `error`

  `last_verified_at`           timestamptz nullable    Terakhir dicek

  `created_at`                 timestamptz             Waktu dibuat

  `updated_at`                 timestamptz             Waktu diperbarui
  ----------------------------------------------------------------------------------

Tambahkan unique constraint yang sesuai untuk kombinasi
user/platform/provider account. Jangan menganggap nama akun unik.

### 7.3 `media_assets`

  Kolom                 Tipe                   Catatan
  --------------------- ---------------------- -----------------------------------
  `id`                  uuid PK                ID internal
  `user_id`             uuid FK                Pemilik
  `storage_key`         text unique            Key internal pada bucket
  `original_filename`   text                   Untuk display, bukan storage key
  `mime_type`           text                   Tipe yang terdeteksi/diverifikasi
  `size_bytes`          bigint                 Ukuran aktual
  `checksum_sha256`     text nullable          Integritas/deduplikasi opsional
  `duration_ms`         bigint nullable        Metadata media jika tersedia
  `width` / `height`    integer nullable       Metadata media
  `status`              text                   Status media
  `created_at`          timestamptz            Waktu dibuat
  `deleted_at`          timestamptz nullable   Soft delete bila diperlukan

### 7.4 `publications`

  Kolom               Tipe          Catatan
  ------------------- ------------- -------------------------------
  `id`                uuid PK       ID permintaan publikasi
  `user_id`           uuid FK       Pemilik
  `media_asset_id`    uuid FK       Media yang dipublikasikan
  `idempotency_key`   text          Kunci idempotency dari client
  `status`            text          Status agregat
  `created_at`        timestamptz   Waktu submit
  `updated_at`        timestamptz   Waktu update

Unique constraint: `(user_id, idempotency_key)` ketika key diberikan.
Request ulang dengan key sama harus mengembalikan hasil request yang
sama, bukan membuat publikasi baru.

### 7.5 `publication_targets`

  -----------------------------------------------------------------------
  Kolom                   Tipe                    Catatan
  ----------------------- ----------------------- -----------------------
  `id`                    uuid PK                 ID target

  `publication_id`        uuid FK                 Parent publication

  `user_id`               uuid FK                 Untuk ownership dan
                                                  query aman

  `social_account_id`     uuid FK                 Akun tujuan

  `platform`              text                    Snapshot platform

  `caption`               text nullable           Caption khusus target

  `title`                 text nullable           Title bila didukung

  `privacy`               text nullable           Nilai internal yang
                                                  divalidasi adapter

  `scheduled_at`          timestamptz nullable    Jadwal UTC

  `status`                text                    State machine target

  `attempt_count`         integer                 Jumlah percobaan

  `next_retry_at`         timestamptz nullable    Waktu retry

  `external_post_id`      text nullable           ID posting provider

  `external_post_url`     text nullable           URL hasil jika tersedia

  `provider_upload_id`    text nullable           ID
                                                  sesi/container/upload
                                                  provider

  `last_error_code`       text nullable           Kode error
                                                  ter-normalisasi

  `last_error_message`    text nullable           Pesan aman untuk UI

  `started_at`            timestamptz nullable    Mulai

  `published_at`          timestamptz nullable    Selesai

  `created_at` /          timestamptz             Audit waktu
  `updated_at`                                    
  -----------------------------------------------------------------------

Tambahkan unique constraint untuk mencegah target duplikat dalam satu
publication, misalnya `(publication_id, social_account_id)`.

### 7.6 `publication_events`

Audit trail append-only yang menyimpan `publication_target_id`,
`event_type`, `from_status`, `to_status`, metadata non-sensitif JSONB,
dan `created_at`. Jangan menyimpan access token, refresh token, URL
berisi credential, atau payload privat yang tidak diperlukan.

### 7.7 Indeks penting

-   `social_accounts(user_id, platform)`
-   `media_assets(user_id, created_at DESC)`
-   `publications(user_id, created_at DESC)`
-   `publication_targets(status, next_retry_at)`
-   `publication_targets(status, scheduled_at)`
-   `publication_targets(publication_id)`
-   `publication_events(publication_target_id, created_at)`

Validasi query plan ketika data mulai bertambah; jangan menambahkan
indeks berlebihan sejak awal.

------------------------------------------------------------------------

## 8. Kontrak API

Gunakan prefix `/v1`. Format error harus konsisten, misalnya:

``` json
{
  "error": {
    "code": "MEDIA_NOT_READY",
    "message": "Media belum siap dipublikasikan.",
    "request_id": "req_..."
  }
}
```

Jangan mengembalikan stack trace, provider token, atau raw error
sensitif ke client.

### 8.1 Endpoint MVP

  -----------------------------------------------------------------------------------------
  Method                  Endpoint                                  Tujuan
  ----------------------- ----------------------------------------- -----------------------
  `GET`                   `/health/live`                            Liveness check

  `GET`                   `/health/ready`                           Cek DB dan dependency
                                                                    penting

  `GET`                   `/v1/social-accounts`                     Daftar akun terhubung

  `POST`                  `/v1/social-accounts/:platform/connect`   Membuat OAuth URL

  `GET`                   `/v1/oauth/:platform/callback`            OAuth callback

  `DELETE`                `/v1/social-accounts/:id`                 Putuskan koneksi/revoke
                                                                    sesuai provider

  `POST`                  `/v1/media/upload-url`                    Membuat upload session

  `POST`                  `/v1/media/:id/complete`                  Menyelesaikan dan
                                                                    memverifikasi upload

  `GET`                   `/v1/media`                               Daftar media milik user

  `GET`                   `/v1/media/:id`                           Detail media

  `DELETE`                `/v1/media/:id`                           Hapus media jika tidak
                                                                    sedang dipakai

  `POST`                  `/v1/publications`                        Membuat publikasi
                                                                    multi-target

  `GET`                   `/v1/publications`                        Daftar publikasi dengan
                                                                    pagination

  `GET`                   `/v1/publications/:id`                    Status publication dan
                                                                    seluruh target

  `POST`                  `/v1/publication-targets/:id/retry`       Retry target yang
                                                                    memenuhi syarat

  `POST`                  `/v1/publications/:id/cancel`             Batalkan target yang
                                                                    belum mulai/masih dapat
                                                                    dibatalkan

  `POST`                  `/v1/webhooks/:platform`                  Webhook provider bila
                                                                    dibutuhkan dan didukung
  -----------------------------------------------------------------------------------------

Endpoint publik harus memerlukan autentikasi kecuali OAuth callback,
health check, dan webhook yang memiliki mekanisme validasi
masing-masing.

### 8.2 Contoh request publikasi

``` json
{
  "mediaId": "00000000-0000-0000-0000-000000000001",
  "idempotencyKey": "client-generated-unique-key",
  "targets": [
    {
      "socialAccountId": "00000000-0000-0000-0000-000000000002",
      "caption": "Video terbaru",
      "title": "Cerita Hari Ini",
      "privacy": "public"
    },
    {
      "socialAccountId": "00000000-0000-0000-0000-000000000003",
      "caption": "Cerita hari ini #fyp",
      "privacy": "private"
    }
  ]
}
```

Nilai `privacy` di atas hanya ilustrasi kontrak internal. Adapter harus
memetakan ke enum dan kebijakan aktual provider. API perlu menolak field
yang tidak didukung, atau memberikan warning yang jelas bila field
opsional diabaikan.

### 8.3 Contoh response

``` json
{
  "id": "publication-uuid",
  "status": "queued",
  "targets": [
    {
      "id": "target-uuid-1",
      "platform": "youtube",
      "status": "queued"
    },
    {
      "id": "target-uuid-2",
      "platform": "tiktok",
      "status": "queued"
    }
  ]
}
```

API sebaiknya merespons `202 Accepted` karena publikasi berlangsung
asynchronous.

### 8.4 Pagination

Gunakan cursor pagination untuk daftar media dan publikasi jika volume
data berkembang. Jangan mengembalikan seluruh riwayat tanpa batas.

------------------------------------------------------------------------

## 9. Desain Adapter Platform

Definisikan kontrak domain yang kecil, tetapi izinkan setiap adapter
mempunyai tahapan khusus.

Contoh tipe internal:

``` ts
export type Platform =
  | "youtube"
  | "tiktok"
  | "instagram"
  | "facebook";

export interface PublishContext {
  targetId: string;
  accountId: string;
  media: {
    storageKey: string;
    mimeType: string;
    sizeBytes: number;
  };
  metadata: {
    caption?: string;
    title?: string;
    privacy?: string;
  };
  idempotencyKey: string;
}

export interface PublishOutcome {
  status: "processing" | "published" | "unknown";
  externalPostId?: string;
  externalPostUrl?: string;
  providerUploadId?: string;
}

export interface PlatformAdapter {
  readonly platform: Platform;
  validate(ctx: PublishContext): Promise<void>;
  publish(ctx: PublishContext): Promise<PublishOutcome>;
  getStatus?(
    providerUploadId: string
  ): Promise<PublishOutcome>;
}
```

Kontrak ini adalah titik awal. Untuk implementasi nyata, adapter dapat
mengekspos `initializeUpload`, `uploadChunk`, `finalize`, dan
`getStatus` bila provider memerlukannya. Jangan membuat satu abstraksi
yang terlalu sederhana hingga menyembunyikan perbedaan penting antar
API.

### 9.1 YouTube

-   Gunakan YouTube Data API resmi.
-   Verifikasi OAuth scopes, quota, ukuran file, metadata, dan privacy.
-   Pertimbangkan resumable upload.
-   Simpan video ID provider dan periksa status pemrosesan jika
    diperlukan.
-   Tangani quota exhaustion secara terpisah dari error sementara.

Dokumentasi:
https://developers.google.com/youtube/v3/guides/uploading_a_video

### 9.2 TikTok

-   Gunakan Content Posting API resmi.
-   Bedakan Direct Post dari upload/draft flow.
-   Periksa scope yang telah diberikan, audit aplikasi, batasan akun,
    dan status publikasi.
-   Jangan menjanjikan Direct Post tersedia sebelum aplikasi dan flow
    disetujui.
-   Simpan identifier dan status yang diberikan API.

Dokumentasi:
https://developers.tiktok.com/doc/content-posting-api-get-started/

### 9.3 Instagram

-   Gunakan API resmi yang sesuai dengan tipe akun dan produk Meta yang
    didukung.
-   Implementasikan pembuatan media container, pemeriksaan status
    processing, dan publish sesuai dokumentasi terkini.
-   Verifikasi izin, jenis akun, Page/business linkage bila relevan, dan
    akses aplikasi.
-   Jangan menganggap semua akun personal dapat dipublikasikan lewat
    API.

Dokumentasi: https://developers.facebook.com/docs/instagram-platform/

### 9.4 Facebook

-   Tentukan target publikasi secara eksplisit, misalnya Facebook Page.
-   Implementasikan flow video/Reels sesuai endpoint dan versi Graph API
    yang didukung.
-   Verifikasi Page access token, izin, dan akses aplikasi.
-   Tangani upload session dan status pemrosesan sesuai dokumentasi
    provider.

Dokumentasi: https://developers.facebook.com/docs/video-api/

### 9.5 Provider capability matrix

Buat file konfigurasi/registry kemampuan, bukan asumsi global:

  -----------------------------------------------------------------------
  Capability                          Contoh
  ----------------------------------- -----------------------------------
  `supportsScheduledPublish`          Apakah API mengizinkan jadwal
                                      native; jika tidak, jadwalkan di
                                      service

  `supportsResumableUpload`           Apakah sesi upload dapat
                                      dilanjutkan

  `supportsStatusPolling`             Apakah status dapat diperiksa

  `supportsWebhook`                   Apakah callback status tersedia

  `supportsPrivacySetting`            Apakah privacy bisa diatur

  `requiresPublicMediaUrl`            Apakah provider mengambil media
                                      dari URL

  `requiresFinalizeStep`              Apakah perlu langkah
                                      publish/finalisasi
  -----------------------------------------------------------------------

Capability harus diverifikasi terhadap dokumentasi dan akses aplikasi
yang nyata. Nilai bisa berbeda berdasarkan endpoint atau tipe akun.

------------------------------------------------------------------------

## 10. Queue, Retry, dan Idempotency

### 10.1 Satu target = satu job logis

Jika satu video dikirim ke tiga akun, buat tiga target dan tiga
pekerjaan independen. Ini memberi isolasi error, retry, status, dan rate
limit per akun/platform.

### 10.2 Batas concurrency

Mulai konservatif: - Worker concurrency global rendah, misalnya 2. -
Batasi concurrency per platform dan per akun. - Hindari upload paralel
terlalu banyak pada satu mesin. - Jadikan nilai concurrency konfigurasi,
bukan konstanta tersebar di kode.

### 10.3 Retry policy

-   Gunakan exponential backoff dengan jitter untuk timeout, HTTP 429,
    dan 5xx yang aman dicoba ulang.
-   Hormati `Retry-After` bila diberikan.
-   Error token/permission menjadi `reauthorization_required`.
-   Error payload/media tidak valid menjadi `failed` tanpa retry
    otomatis.
-   Batasi jumlah percobaan dan sediakan manual retry.
-   Jangan retry publikasi ambigu tanpa memeriksa status remote atau
    melakukan rekonsiliasi.
-   Catat kategori error, bukan credential atau payload sensitif.

### 10.4 Idempotency

-   Client mengirim `idempotencyKey` saat membuat publikasi.
-   Database memiliki unique constraint yang sesuai.
-   Worker menggunakan `publication_target.id` sebagai correlation ID
    internal.
-   Simpan ID sesi upload/provider sejak pertama tersedia.
-   Sebelum memulai ulang job yang terputus, periksa status dan
    identifier yang sudah tersimpan.
-   Provider mungkin tidak mendukung idempotency key. Dalam hal itu,
    aplikasi tidak boleh mengklaim exactly-once; gunakan status check
    dan recovery.

### 10.5 Queue harus bukan satu-satunya sumber kebenaran

Status bisnis tersimpan di PostgreSQL. Jika queue kehilangan job atau
worker crash, proses reconciliation harus menemukan target `queued`,
`retry_wait`, atau `scheduled` yang memenuhi syarat dan memastikan job
kembali diproses.

------------------------------------------------------------------------

## 11. Keamanan

### 11.1 Token OAuth

-   Simpan access token dan refresh token hanya di backend.
-   Enkripsi token saat disimpan, misalnya AES-256-GCM melalui envelope
    encryption.
-   Encryption key berada di secret manager/environment, bukan di
    database bersama ciphertext.
-   Sertakan key version agar rotasi key bisa dilakukan.
-   Jangan log token, authorization code, client secret, atau header
    Authorization.
-   Terapkan least privilege untuk scopes.
-   Tangani revoke, expiry, refresh failure, dan reauthorization.
-   Jangan mengirim provider token ke browser atau menyimpannya di
    localStorage.

### 11.2 OAuth flow

-   Validasi `state` dengan crypto-safe random.
-   `state` sekali pakai dan berumur pendek.
-   Validasi callback origin dan redirect URI dengan allowlist.
-   Gunakan PKCE bila didukung.
-   Jangan menerima arbitrary `redirect_uri` dari request pengguna.
-   Lindungi callback dari replay.
-   Simpan credential aplikasi provider sebagai secret.

### 11.3 Object storage

-   Bucket private secara default.
-   Presigned URL berumur pendek dan dibatasi ke object key serta
    operasi yang dimaksud.
-   Gunakan key acak, jangan nama file pengguna sebagai key.
-   Batasi ukuran file dan tipe media.
-   Verifikasi ukuran object setelah upload.
-   Jangan menganggap ekstensi file sebagai validasi MIME.
-   Terapkan lifecycle policy untuk file sementara.
-   Cegah akses lintas pengguna dengan ownership check di setiap
    endpoint.

### 11.4 API dan database

-   Semua endpoint bisnis memerlukan autentikasi.
-   Setiap operasi harus memeriksa ownership user/tenant.
-   Gunakan rate limiting pada endpoint auth, upload session, dan
    submit.
-   Gunakan parameterized query/ORM.
-   Validasi payload dengan Zod.
-   Tambahkan CSRF protection jika autentikasi dashboard berbasis
    cookie.
-   Atur CORS secara ketat.
-   Gunakan TLS untuk koneksi publik dan database bila didukung.
-   Simpan audit trail untuk connect/disconnect akun, publikasi, retry,
    dan penghapusan media.

### 11.5 Data retention

Tetapkan kebijakan yang eksplisit: - Berapa lama file video disimpan
setelah semua target selesai? - Apakah file tetap tersedia untuk
retry? - Kapan token yang dicabut dihapus? - Berapa lama audit event
disimpan? - Bagaimana pengguna meminta penghapusan data?

Jangan menghapus media sebelum retry/reconciliation yang diperlukan
selesai.

------------------------------------------------------------------------

## 12. Validasi Media

MVP: - Batasi ukuran file maksimum berdasarkan kebijakan produk dan
batas provider. - Allowlist container/MIME yang dibutuhkan. - Verifikasi
object storage selesai diunggah. - Ambil metadata dasar bila tersedia. -
Simpan checksum opsional. - Berikan error yang jelas bila file tidak
didukung.

FFmpeg tidak perlu berjalan pada setiap upload. Tambahkan media worker
terpisah bila perlu: - inspeksi codec/duration/resolution, -
thumbnail, - normalisasi atau transcoding, - deteksi file rusak.

Jika FFmpeg ditambahkan: - batasi CPU, memory, waktu proses, dan ukuran
output; - jangan menjalankan shell command dengan string input pengguna
yang tidak disanitasi; - gunakan argument array; - jalankan sebagai
proses/container terisolasi; - simpan hasil sebagai asset turunan
terpisah.

------------------------------------------------------------------------

## 13. Struktur Folder yang Disarankan

``` text
social-uploader/
├── src/
│   ├── app.ts
│   ├── server.ts
│   ├── config/
│   │   ├── env.ts
│   │   └── platform-config.ts
│   ├── modules/
│   │   ├── auth/
│   │   ├── social-accounts/
│   │   ├── media/
│   │   ├── publications/
│   │   └── webhooks/
│   ├── providers/
│   │   ├── contracts.ts
│   │   ├── registry.ts
│   │   ├── youtube/
│   │   ├── tiktok/
│   │   ├── instagram/
│   │   └── facebook/
│   ├── jobs/
│   │   ├── queue.ts
│   │   ├── publish-target.job.ts
│   │   ├── reconcile-targets.job.ts
│   │   └── cleanup-media.job.ts
│   ├── workers/
│   │   ├── worker.ts
│   │   └── scheduler.ts
│   ├── db/
│   │   ├── client.ts
│   │   ├── schema/
│   │   └── migrations/
│   ├── storage/
│   ├── security/
│   ├── observability/
│   └── lib/
├── tests/
│   ├── unit/
│   ├── integration/
│   ├── contract/
│   └── fixtures/
├── Dockerfile
├── compose.yaml
├── drizzle.config.ts
├── package.json
├── tsconfig.json
├── .env.example
└── README.md
```

Pisahkan route/controller, domain service, persistence, dan provider
adapter. Jangan menaruh seluruh logika publikasi dalam satu handler
HTTP.

------------------------------------------------------------------------

## 14. Environment Configuration

Contoh `.env.example`:

``` dotenv
NODE_ENV=development
PORT=3000
LOG_LEVEL=info
PUBLIC_APP_URL=http://localhost:3000
API_BASE_URL=http://localhost:3000

DATABASE_URL=postgres://app:app@localhost:5432/social_uploader

QUEUE_DRIVER=pg-boss
# Redis hanya bila memilih BullMQ:
REDIS_URL=

STORAGE_ENDPOINT=
STORAGE_REGION=auto
STORAGE_BUCKET=social-uploader
STORAGE_ACCESS_KEY_ID=
STORAGE_SECRET_ACCESS_KEY=
STORAGE_FORCE_PATH_STYLE=false
PRESIGNED_URL_TTL_SECONDS=600
MAX_UPLOAD_BYTES=1073741824

TOKEN_ENCRYPTION_KEY=
TOKEN_ENCRYPTION_KEY_VERSION=1

YOUTUBE_CLIENT_ID=
YOUTUBE_CLIENT_SECRET=
YOUTUBE_REDIRECT_URI=

TIKTOK_CLIENT_KEY=
TIKTOK_CLIENT_SECRET=
TIKTOK_REDIRECT_URI=

META_APP_ID=
META_APP_SECRET=
META_REDIRECT_URI=

FRONTEND_ORIGIN=http://localhost:3001
```

Ini template, bukan credential siap pakai. Gunakan secret yang kuat dan
berbeda di setiap environment. Jangan commit file `.env`. Provider OAuth
sering memiliki konfigurasi callback dan scope yang berbeda; simpan
konfigurasi per provider sesuai dokumentasi resmi.

------------------------------------------------------------------------

## 15. Deployment dan Operasional

### 15.1 Deployment awal

Komponen minimum: - API container. - Worker container dari
image/codebase yang sama. - Managed PostgreSQL. - Object storage. -
Secret/environment management dari platform hosting.

Untuk queue `pg-boss`, API dan worker berbagi PostgreSQL. Pastikan
konfigurasi connection pool tidak menghabiskan koneksi database; batasi
pool per proses.

Jika memilih BullMQ, tambahkan Redis dan gunakan managed Redis bila
biaya/operasional lebih masuk akal. Jangan menjalankan PostgreSQL dan
Redis di dalam container API yang sama.

### 15.2 Resource awal

Untuk volume 1--20 video per hari, mulai dengan API dan worker
ber-resource kecil, worker concurrency 1--2, dan database managed
ber-tier rendah yang mendukung kebutuhan koneksi. Ini titik awal untuk
diuji, bukan jaminan kapasitas universal.

RAM/CPU aktual bergantung pada: - jumlah request simultan, - ukuran
video, - apakah file diproses oleh server, - jumlah worker, - library
dan connection pool, - provider API latency.

Direct-to-storage upload dan tidak melakukan transcoding adalah dua cara
paling efektif menjaga resource aplikasi tetap rendah.

### 15.3 Graceful shutdown

-   Hentikan penerimaan job baru.
-   Tunggu job aktif sampai batas waktu shutdown.
-   Simpan checkpoint/session upload yang tersedia.
-   Lepas koneksi database dan queue.
-   Jangan menandai job sukses sebelum hasil provider terkonfirmasi.

### 15.4 Backup dan recovery

-   Backup PostgreSQL dan uji restore secara berkala.
-   Object storage harus memiliki lifecycle dan kebijakan backup/retensi
    yang sesuai kebutuhan.
-   Simpan provider upload IDs agar job dapat direkonsiliasi.
-   Dokumentasikan langkah recovery untuk worker crash, credential
    revoked, database restore, dan provider outage.

------------------------------------------------------------------------

## 16. Observability

### 16.1 Log

Gunakan JSON logs dengan field: - `timestamp` - `level` - `request_id` -
`user_id` atau ID internal yang aman - `publication_id` - `target_id` -
`platform` - `attempt` - `duration_ms` - `error_code`

Jangan log token, authorization header, client secret, presigned URL
lengkap, atau data sensitif.

### 16.2 Metrics

Minimum: - jumlah target queued/processing/failed/published; - waktu
tunggu queue; - durasi upload/publish per platform; - retry count; -
HTTP 429 dan 5xx per provider; - token refresh failure; - jumlah target
`unknown_remote_state`; - storage bytes dan file cleanup; - penggunaan
CPU/RAM worker.

### 16.3 Alert

Awal: - job terlalu lama di status aktif; - jumlah gagal meningkat; -
koneksi database gagal; - token refresh gagal berulang; - queue backlog
terus bertambah; - object storage tidak dapat diakses.

------------------------------------------------------------------------

## 17. Testing Strategy

### Unit tests

-   State machine publication.
-   Validasi target dan metadata.
-   Mapping error provider.
-   Retry classification.
-   OAuth `state` validation.
-   Enkripsi/dekripsi token.

### Integration tests

-   Repository PostgreSQL.
-   Queue enqueue/dequeue.
-   Direct-to-storage upload flow menggunakan storage test atau mock
    yang sesuai.
-   Transaction saat membuat publication dan target.
-   Idempotency key.
-   Ownership/tenant isolation.

### Contract tests

-   Mock response tiap provider.
-   Success, rate limit, token expired, permission denied, timeout,
    malformed response, dan processing state.
-   Verifikasi setiap adapter memenuhi kontrak domain.
-   Fixture jangan berisi credential nyata.

### End-to-end tests

-   Connect akun pada environment provider yang disetujui.
-   Upload video kecil yang sah.
-   Publikasi private/unlisted/test mode bila provider mengizinkan.
-   Periksa external ID dan status final.
-   Uji disconnect/revoke dan reauthorization.

Jangan menjalankan test publikasi ke akun produksi tanpa kontrol
eksplisit dan label test yang jelas.

------------------------------------------------------------------------

## 18. CI/CD dan Kualitas Kode

Pipeline minimum: 1. Install dependency dari lockfile. 2. Format/lint.
3. Typecheck. 4. Unit tests. 5. Integration tests dengan
PostgreSQL/queue test. 6. Build production. 7. Build container image. 8.
Deploy ke staging. 9. Smoke test health endpoints. 10. Deploy production
dengan migrasi database yang kompatibel.

Aturan: - Aktifkan `strict: true` di TypeScript. - Gunakan lockfile dan
pin Node LTS/runtime image. - Migrasi database dijalankan sebagai
langkah terkontrol, bukan otomatis oleh setiap replica. - Jangan
menghapus kolom yang sedang digunakan oleh versi aplikasi lama sebelum
deployment selesai. - Gunakan dependabot/renovate atau proses update
dependency terjadwal. - Jangan menyimpan secret di log CI.

------------------------------------------------------------------------

## 19. Roadmap Implementasi

### Fase 0 --- Verifikasi akses API

-   Buat developer app pada masing-masing platform.
-   Catat scopes, account types, review/audit requirements, quota, dan
    mode test.
-   Pastikan auto-publish sesuai use case benar-benar diizinkan.
-   Pilih satu platform untuk proof of concept pertama.

**Kriteria selesai:** flow resmi dapat diotorisasi dan video uji
berhasil diproses pada akun yang memenuhi syarat.

### Fase 1 --- Fondasi

-   Bootstrap Hono + TypeScript.
-   Tambahkan config validation, logger, PostgreSQL, Drizzle, dan
    migrasi.
-   Tambahkan autentikasi pengguna.
-   Implementasikan media upload session dan private object storage.
-   Buat schema publication/target dan API status.

**Kriteria selesai:** video tersimpan aman dan publikasi dummy bisa
diproses melalui queue.

### Fase 2 --- Satu provider end-to-end

-   Implementasikan OAuth provider pertama.
-   Enkripsi token.
-   Implementasikan adapter, error mapping, status polling, retry, dan
    idempotency.
-   Tambahkan dashboard status dasar.

**Kriteria selesai:** satu target bisa dipublikasikan dan statusnya
dapat dipulihkan setelah worker restart.

### Fase 3 --- Platform lainnya

-   Tambahkan adapter TikTok, Instagram, dan Facebook satu per satu.
-   Implementasikan capability matrix per provider.
-   Uji variasi account type, metadata, dan privacy.
-   Pastikan kegagalan satu target tidak mengganggu target lain.

**Kriteria selesai:** setiap provider memiliki contract test dan uji
integrasi resmi.

### Fase 4 --- Hardening

-   Scheduling.
-   Reconciliation job.
-   Cleanup media.
-   Token refresh/reauthorization UX.
-   Monitoring dan alert.
-   Backup/restore test.
-   Rate limiting dan security review.

**Kriteria selesai:** kegagalan provider, worker restart, dan token
revoke tidak menyebabkan publikasi duplikat secara otomatis atau
kehilangan status.

------------------------------------------------------------------------

## 20. Acceptance Criteria MVP

-   [ ] Pengguna dapat menghubungkan akun melalui OAuth resmi.
-   [ ] Token disimpan terenkripsi dan tidak pernah dikirim ke frontend.
-   [ ] Pengguna dapat mengunggah video langsung ke object storage.
-   [ ] API memverifikasi media sebelum mengizinkan publikasi.
-   [ ] Satu request dapat membuat beberapa target publikasi.
-   [ ] Setiap target diproses independen.
-   [ ] Status target terlihat oleh pemiliknya.
-   [ ] Retry tidak memulai ulang target yang sudah `published`.
-   [ ] Error permanen tidak di-retry tanpa batas.
-   [ ] Timeout ambigu masuk ke reconciliation, bukan blind retry.
-   [ ] Pengguna tidak dapat mengakses media, akun, atau publication
    milik user lain.
-   [ ] Log tidak mengandung token, client secret, atau presigned URL
    lengkap.
-   [ ] Worker dapat restart tanpa kehilangan status bisnis.
-   [ ] Aplikasi hanya mengklaim auto-publish untuk flow dan akun yang
    benar-benar diizinkan provider.
-   [ ] Dokumentasi deployment, backup, dan recovery tersedia.

------------------------------------------------------------------------

## 21. Risiko dan Mitigasi

  -----------------------------------------------------------------------------
  Risiko                  Dampak                  Mitigasi
  ----------------------- ----------------------- -----------------------------
  API approval            Provider tidak bisa     Validasi akses pada Fase 0;
  ditolak/tertunda        dipakai sesuai rencana  jangan menjanjikan semua
                                                  platform sebelum approval

  Scope/token berubah     Publikasi gagal         Status
  atau dicabut                                    `reauthorization_required`,
                                                  token refresh, UX connect
                                                  ulang

  Timeout setelah         Duplikasi publikasi     Simpan upload ID, cek status
  provider menerima video                         remote, gunakan
                                                  reconciliation

  API rate limit/quota    Backlog publikasi       Per-platform limiter,
                                                  backoff, monitoring quota

  Format media tidak      Job gagal               Validasi metadata dan
  didukung                                        capability per provider

  Storage URL tidak dapat Upload gagal            Uji mekanisme pull/push
  diakses provider                                provider, URL TTL, akses dan
                                                  ukuran file

  Queue job hilang/worker Target macet            Status di DB, reconciliation,
  crash                                           graceful shutdown

  Kebocoran token         Kompromi akun sosial    Enkripsi, least privilege,
                                                  secret management, redaction
                                                  log

  Biaya storage bertambah Biaya operasional naik  Lifecycle policy, cleanup,
                                                  kuota per user

  Perubahan API provider  Integrasi rusak         Adapter terisolasi, contract
                                                  tests, pantau changelog resmi
  -----------------------------------------------------------------------------

------------------------------------------------------------------------

## 22. Checklist Keputusan Sebelum Coding

-   [ ] Apakah aplikasi untuk satu pemilik atau multi-user SaaS?
-   [ ] Apakah autentikasi aplikasi menggunakan provider eksternal atau
    login sendiri?
-   [ ] Provider pertama untuk proof of concept sudah dipilih?
-   [ ] OAuth app, scopes, dan proses approval sudah diperiksa?
-   [ ] Target publikasi: personal account, creator/business account,
    Page, atau channel?
-   [ ] Batas ukuran file dan durasi video sudah ditentukan?
-   [ ] Retensi media setelah publish sudah ditentukan?
-   [ ] Scheduling diperlukan di MVP atau fase berikutnya?
-   [ ] Apakah memilih `pg-boss` untuk menghindari Redis, atau BullMQ +
    Redis karena kebutuhan tertentu?
-   [ ] Hosting menyediakan managed PostgreSQL, object storage, secrets,
    dan worker process?
-   [ ] URL media akan diakses provider dengan metode pull atau dikirim
    worker dengan metode push?
-   [ ] Siapa yang menangani approval aplikasi dan perubahan kebijakan
    provider?

------------------------------------------------------------------------

## 23. Referensi Resmi

-   Node.js release schedule: https://github.com/nodejs/Release
-   Hono di Node.js: https://hono.dev/docs/getting-started/nodejs
-   YouTube video upload:
    https://developers.google.com/youtube/v3/guides/uploading_a_video
-   TikTok Content Posting API:
    https://developers.tiktok.com/doc/content-posting-api-get-started/
-   Instagram Platform:
    https://developers.facebook.com/docs/instagram-platform/
-   Facebook Video API: https://developers.facebook.com/docs/video-api/
-   BullMQ: https://docs.bullmq.io/
-   PostgreSQL: https://www.postgresql.org/docs/

------------------------------------------------------------------------

## 24. Kesimpulan

Untuk volume 1--20 video per hari dengan prioritas resource rendah,
gunakan **Node.js LTS + TypeScript + Hono + PostgreSQL + Drizzle +
`pg-boss` + private S3-compatible object storage** sebagai baseline.

Jalankan API dan worker sebagai proses terpisah dari satu codebase.
Hindari Redis sampai ada alasan operasional yang jelas; jika memilih
BullMQ, gunakan Redis sebagai dependency queue yang disengaja. Upload
file langsung dari browser ke object storage, jangan transcode secara
default, dan buat adapter per platform dengan state tracking serta
recovery yang eksplisit.

Risiko terbesar proyek ini bukan throughput server, melainkan akses API
resmi, approval, OAuth scopes, variasi flow upload, dan penanganan
timeout yang aman. Verifikasi semua hal tersebut lebih awal sebelum
memperluas implementasi ke empat platform.
