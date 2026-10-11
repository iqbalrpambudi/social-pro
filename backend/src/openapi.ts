export const openapiSpec = {
  openapi: '3.1.0',
  info: {
    title: 'Social Pro - Social Media Uploader API',
    version: '1.0.0',
    description:
      'API-first service untuk mengunggah media video, mengelola akun media sosial (YouTube & Mock), mempublikasikan konten secara terjadwal/langsung, serta memantau status eksekusi secara real-time via Server-Sent Events (SSE).',
    contact: {
      name: 'Social Pro Engineering',
    },
  },
  servers: [
    {
      url: 'http://localhost:4000',
      description: 'Local Development Server',
    },
  ],
  security: [
    {
      BearerAuth: [],
    },
  ],
  tags: [
    { name: 'Health', description: 'Pemeriksaan status server dan kesiapan infrastruktur' },
    { name: 'Media Assets', description: 'Manajemen upload media dengan presigned URL S3' },
    { name: 'Social Accounts', description: 'Manajemen akun media sosial dan otentikasi' },
    { name: 'OAuth', description: 'Alur otentikasi Google Cloud OAuth 2.0 untuk YouTube' },
    { name: 'Publications', description: 'Pembuatan dan pemantauan distribusi konten video' },
    { name: 'Realtime Events', description: 'Server-Sent Events (SSE) live streaming status' },
  ],
  paths: {
    '/health': {
      get: {
        tags: ['Health'],
        summary: 'Liveness Check',
        description: 'Mengecek apakah proses server API Hono sedang berjalan.',
        security: [],
        responses: {
          '200': {
            description: 'Server aktif dan merespons',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    status: { type: 'string', example: 'ok' },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/ready': {
      get: {
        tags: ['Health'],
        summary: 'Readiness Check',
        description: 'Mengecek kesiapan koneksi ke PostgreSQL database dan S3/MinIO Object Storage.',
        security: [],
        responses: {
          '200': {
            description: 'Database dan Storage siap menerima request',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    status: { type: 'string', example: 'ready' },
                    database: { type: 'string', example: 'connected' },
                    storage: { type: 'string', example: 'connected' },
                  },
                },
              },
            },
          },
          '503': {
            description: 'Infrastruktur belum siap',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
              },
            },
          },
        },
      },
    },
    '/v1/media/uploads': {
      post: {
        tags: ['Media Assets'],
        summary: 'Inisialisasi Sesi Upload Media',
        description:
          'Membuat record media baru dengan status upload_pending dan mengembalikan presigned PUT URL untuk upload binary langsung ke private S3 bucket.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['fileName', 'contentType', 'sizeBytes'],
                properties: {
                  fileName: { type: 'string', example: 'promo_video.mp4' },
                  contentType: {
                    type: 'string',
                    enum: [
                      'video/mp4',
                      'video/quicktime',
                      'video/webm',
                      'image/jpeg',
                      'image/png',
                      'image/webp',
                    ],
                    example: 'video/mp4',
                  },
                  sizeBytes: { type: 'integer', example: 15420000 },
                  checksumSha256: { type: 'string', example: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855' },
                },
              },
            },
          },
        },
        responses: {
          '201': {
            description: 'Sesi upload berhasil dibuat',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    media: { $ref: '#/components/schemas/MediaAsset' },
                    upload: {
                      type: 'object',
                      properties: {
                        method: { type: 'string', example: 'PUT' },
                        url: { type: 'string', example: 'http://localhost:9000/social-uploader-media/media/...?X-Amz-Signature=...' },
                        headers: {
                          type: 'object',
                          properties: {
                            'Content-Type': { type: 'string', example: 'video/mp4' },
                          },
                        },
                        expiresAt: { type: 'string', format: 'date-time' },
                      },
                    },
                  },
                },
              },
            },
          },
          '400': { $ref: '#/components/responses/BadRequest' },
          '401': { $ref: '#/components/responses/Unauthorized' },
        },
      },
    },
    '/v1/media/{mediaId}/complete': {
      post: {
        tags: ['Media Assets'],
        summary: 'Konfirmasi Upload Selesai',
        description:
          'Memverifikasi keberadaan dan ukuran file di S3 storage, lalu mengubah status media menjadi ready.',
        parameters: [
          {
            name: 'mediaId',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
          },
        ],
        responses: {
          '200': {
            description: 'Media terverifikasi dan siap digunakan untuk publikasi',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    media: { $ref: '#/components/schemas/MediaAsset' },
                  },
                },
              },
            },
          },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
    },
    '/v1/media': {
      get: {
        tags: ['Media Assets'],
        summary: 'Daftar Media Library',
        description: 'Mengambil seluruh koleksi file media milik user beserta presigned URL untuk pemutaran/preview.',
        responses: {
          '200': {
            description: 'Daftar aset media',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    data: {
                      type: 'array',
                      items: { $ref: '#/components/schemas/MediaAsset' },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/v1/media/{mediaId}': {
      get: {
        tags: ['Media Assets'],
        summary: 'Detail Media Asset',
        description: 'Mengambil detail aset media tunggal beserta presigned URL stream video.',
        parameters: [
          {
            name: 'mediaId',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
          },
        ],
        responses: {
          '200': {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    media: { $ref: '#/components/schemas/MediaAsset' },
                  },
                },
              },
            },
          },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
      delete: {
        tags: ['Media Assets'],
        summary: 'Hapus Media Asset',
        description: 'Menghapus record media dari database dan menghapus file objek fisik dari S3 Storage.',
        parameters: [
          {
            name: 'mediaId',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
          },
        ],
        responses: {
          '200': {
            description: 'Media berhasil dihapus',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    message: { type: 'string', example: 'Media aset berhasil dihapus.' },
                    mediaId: { type: 'string', format: 'uuid' },
                  },
                },
              },
            },
          },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
    },
    '/v1/social-accounts': {
      get: {
        tags: ['Social Accounts'],
        summary: 'Daftar Akun Media Sosial',
        description: 'Mengambil daftar semua akun media sosial yang terhubung (YouTube & Mock).',
        responses: {
          '200': {
            description: 'Daftar akun media sosial',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    data: {
                      type: 'array',
                      items: { $ref: '#/components/schemas/SocialAccount' },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/v1/social-accounts/mock-connect': {
      post: {
        tags: ['Social Accounts'],
        summary: 'Hubungkan Mock Simulator Account',
        description: 'Membuat akun simulasi lokal tanpa memerlukan akun YouTube asli untuk kebutuhan pengujian.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  displayName: { type: 'string', example: 'Dev Channel Simulator' },
                  platform: { type: 'string', enum: ['youtube', 'tiktok', 'mock'], default: 'youtube' },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Akun simulator berhasil dibuat',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    message: { type: 'string', example: 'Mock account berhasil dihubungkan' },
                    account: { $ref: '#/components/schemas/SocialAccount' },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/v1/social-accounts/{id}': {
      delete: {
        tags: ['Social Accounts'],
        summary: 'Putuskan Akun Media Sosial',
        description: 'Memutuskan koneksi akun sosial, mencabut token, dan menghapus integrasi.',
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
          },
        ],
        responses: {
          '200': {
            description: 'Akun berhasil diputuskan',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    message: { type: 'string', example: 'Akun berhasil diputuskan' },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/v1/oauth/youtube/connect': {
      get: {
        tags: ['OAuth'],
        summary: 'Mulai OAuth YouTube Connect',
        description: 'Menghasilkan URL consent izin Google Cloud OAuth 2.0 untuk akun YouTube asli.',
        responses: {
          '200': {
            description: 'URL otorisasi Google berhasil dibuat',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    authorizationUrl: { type: 'string', example: 'https://accounts.google.com/o/oauth2/v2/auth?...' },
                    state: { type: 'string', example: 'state_random_token_123' },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/v1/oauth/youtube/callback': {
      get: {
        tags: ['OAuth'],
        summary: 'Google OAuth Redirect Callback',
        description: 'Endpoint publik yang menerima callback code dari Google consent screen.',
        security: [],
        parameters: [
          { name: 'code', in: 'query', schema: { type: 'string' } },
          { name: 'state', in: 'query', schema: { type: 'string' } },
          { name: 'error', in: 'query', schema: { type: 'string' } },
        ],
        responses: {
          '302': { description: 'Redirect kembali ke antarmuka aplikasi frontend' },
        },
      },
    },
    '/v1/oauth/tiktok/connect': {
      get: {
        tags: ['OAuth'],
        summary: 'Mulai OAuth TikTok Connect',
        description: 'Menghasilkan URL consent izin TikTok Login Kit & Content Posting API v2 untuk akun TikTok resmi.',
        responses: {
          '200': {
            description: 'URL otorisasi TikTok berhasil dibuat',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    authorizationUrl: { type: 'string', example: 'https://www.tiktok.com/v2/auth/authorize/?...' },
                    state: { type: 'string', example: 'state_random_token_123' },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/v1/oauth/tiktok/callback': {
      get: {
        tags: ['OAuth'],
        summary: 'TikTok OAuth Redirect Callback',
        description: 'Endpoint publik yang menerima callback authorization code dari TikTok.',
        security: [],
        parameters: [
          { name: 'code', in: 'query', schema: { type: 'string' } },
          { name: 'state', in: 'query', schema: { type: 'string' } },
          { name: 'error', in: 'query', schema: { type: 'string' } },
        ],
        responses: {
          '302': { description: 'Redirect kembali ke antarmuka aplikasi frontend' },
        },
      },
    },
    '/v1/publications': {
      post: {
        tags: ['Publications'],
        summary: 'Buat Publikasi Video Baru',
        description:
          'Mengirimkan video berstatus ready ke antrean penerbitan background worker. Mendukung header Idempotency-Key untuk mencegah duplikasi.',
        parameters: [
          {
            name: 'Idempotency-Key',
            in: 'header',
            required: false,
            schema: { type: 'string' },
            description: 'Kunci idempotensi unik untuk mencegah publikasi ganda',
          },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['mediaId', 'targets'],
                properties: {
                  mediaId: { type: 'string', format: 'uuid', example: 'f8892d45-cd0d-4e2c-ade1-677fc9f1bc2c' },
                  scheduleAt: { type: 'string', format: 'date-time', nullable: true, example: null },
                  clientReference: { type: 'string', example: 'campaign_q4_01' },
                  targets: {
                    type: 'array',
                    minItems: 1,
                    maxItems: 10,
                    items: {
                      type: 'object',
                      required: ['socialAccountId'],
                      properties: {
                        socialAccountId: { type: 'string', format: 'uuid', example: 'b5216f2c-af33-45f3-8439-17cda01fbed6' },
                        title: { type: 'string', maxLength: 200, example: 'Judul Video Keren #socialpro' },
                        caption: { type: 'string', maxLength: 5000, example: 'Deskripsi lengkap video di YouTube' },
                        visibility: { type: 'string', enum: ['public', 'unlisted', 'private'], default: 'public' },
                        thumbnailMediaId: { type: 'string', format: 'uuid', nullable: true },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        responses: {
          '201': {
            description: 'Publikasi berhasil dimasukkan ke antrean worker',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Publication' },
              },
            },
          },
          '400': { $ref: '#/components/responses/BadRequest' },
          '401': { $ref: '#/components/responses/Unauthorized' },
        },
      },
      get: {
        tags: ['Publications'],
        summary: 'Daftar Publikasi (dengan Pagination)',
        description: 'Mengambil riwayat publikasi video yang difilter per user dengan limit dan offset pagination.',
        parameters: [
          {
            name: 'limit',
            in: 'query',
            required: false,
            schema: { type: 'integer', default: 20, maximum: 100 },
            description: 'Jumlah data per halaman (maksimal 100)',
          },
          {
            name: 'offset',
            in: 'query',
            required: false,
            schema: { type: 'integer', default: 0 },
            description: 'Offset data untuk pagination',
          },
        ],
        responses: {
          '200': {
            description: 'Daftar publikasi dan metadata pagination',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    data: {
                      type: 'array',
                      items: { $ref: '#/components/schemas/Publication' },
                    },
                    total: { type: 'integer', example: 45 },
                    limit: { type: 'integer', example: 20 },
                    offset: { type: 'integer', example: 0 },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/v1/publications/{id}': {
      get: {
        tags: ['Publications'],
        summary: 'Detail Status Publikasi',
        description: 'Mengambil status terbaru dan hasil eksekusi adapter per target dari publikasi tertentu.',
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
          },
        ],
        responses: {
          '200': {
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Publication' },
              },
            },
          },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
    },
    '/v1/publications/{id}/retry': {
      post: {
        tags: ['Publications'],
        summary: 'Retry Publikasi Gagal',
        description: 'Mengantrekan kembali seluruh target publikasi yang gagal dieksekusi oleh worker.',
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
          },
        ],
        responses: {
          '200': {
            description: 'Publikasi dijadwalkan ulang untuk dicoba kembali',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    message: { type: 'string', example: 'Publikasi berhasil dimasukkan kembali ke antrean untuk dicoba ulang.' },
                    publicationId: { type: 'string', format: 'uuid' },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/v1/publications/quota/today': {
      get: {
        tags: ['Publications'],
        summary: 'Cek Sisa Quota Harian YouTube API',
        description: 'Mengambil metrik konsumsi quota unit Google YouTube Data API v3 untuk hari ini.',
        responses: {
          '200': {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    date: { type: 'string', example: '2026-10-11' },
                    platform: { type: 'string', example: 'youtube' },
                    quotaUsed: { type: 'integer', example: 1600 },
                    quotaLimit: { type: 'integer', example: 10000 },
                    remainingUnits: { type: 'integer', example: 8400 },
                    remainingVideos: { type: 'integer', example: 5 },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/v1/events/stream': {
      get: {
        tags: ['Realtime Events'],
        summary: 'SSE Real-Time Stream',
        description:
          'Membuka koneksi HTTP Server-Sent Events (SSE) untuk menerima event live progres eksekusi (uploading, preparing, published, failed, ping heartbeat).',
        responses: {
          '200': {
            description: 'Koneksi event stream terbuka',
            content: {
              'text/event-stream': {
                schema: {
                  type: 'string',
                  example: 'event: publication_status\ndata: {"status":"published","publicationId":"..."}\n\n',
                },
              },
            },
          },
        },
      },
    },
  },
  components: {
    securitySchemes: {
      BearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT / API Token',
        description: 'Sertakan header: Authorization: Bearer <API_TOKEN>',
      },
    },
    schemas: {
      MediaAsset: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          status: { type: 'string', enum: ['upload_pending', 'ready', 'failed'], example: 'ready' },
          fileName: { type: 'string', example: 'tutorial.mp4' },
          contentType: { type: 'string', example: 'video/mp4' },
          mediaType: { type: 'string', enum: ['video', 'image'], example: 'video' },
          sizeBytes: { type: 'integer', example: 10485760 },
          previewUrl: { type: 'string', nullable: true },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
      SocialAccount: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          platform: { type: 'string', enum: ['youtube', 'tiktok', 'mock'], example: 'youtube' },
          displayName: { type: 'string', example: 'Channel Saya' },
          externalAccountId: { type: 'string', example: 'UC1234567890' },
          status: { type: 'string', example: 'active' },
          capabilities: {
            type: 'object',
            properties: {
              videoUpload: { type: 'boolean', example: true },
              scheduledPublishing: { type: 'boolean', example: true },
              customThumbnail: { type: 'boolean', example: true },
            },
          },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
      PublicationTarget: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          publicationId: { type: 'string', format: 'uuid' },
          socialAccountId: { type: 'string', format: 'uuid', nullable: true },
          platform: { type: 'string', example: 'youtube' },
          title: { type: 'string', nullable: true },
          caption: { type: 'string', nullable: true },
          visibility: { type: 'string', example: 'public' },
          status: {
            type: 'string',
            enum: ['queued', 'scheduled', 'preparing', 'uploading', 'published', 'failed', 'reauthorization_required'],
            example: 'published',
          },
          attemptCount: { type: 'integer', example: 1 },
          externalPostId: { type: 'string', nullable: true, example: 'wb96B0hF2io' },
          externalPostUrl: { type: 'string', nullable: true, example: 'https://www.youtube.com/watch?v=wb96B0hF2io' },
          publishedAt: { type: 'string', format: 'date-time', nullable: true },
          lastErrorCode: { type: 'string', nullable: true },
          lastErrorMessage: { type: 'string', nullable: true },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },
      Publication: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          status: {
            type: 'string',
            enum: ['queued', 'scheduled', 'processing', 'preparing', 'succeeded', 'partially_succeeded', 'failed'],
            example: 'succeeded',
          },
          mediaId: { type: 'string', format: 'uuid' },
          mediaFilename: { type: 'string', example: 'video.mp4' },
          scheduleAt: { type: 'string', format: 'date-time', nullable: true },
          targets: {
            type: 'array',
            items: { $ref: '#/components/schemas/PublicationTarget' },
          },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
      ErrorResponse: {
        type: 'object',
        properties: {
          error: {
            type: 'object',
            properties: {
              code: { type: 'string', example: 'BAD_REQUEST' },
              message: { type: 'string', example: 'Parameter tidak valid' },
              requestId: { type: 'string', example: 'req_123' },
              details: { type: 'object' },
            },
          },
        },
      },
    },
    responses: {
      BadRequest: {
        description: 'Parameter atau payload request tidak valid',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorResponse' },
          },
        },
      },
      Unauthorized: {
        description: 'Token otentikasi tidak valid atau tidak disertakan',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorResponse' },
          },
        },
      },
      NotFound: {
        description: 'Resource data tidak ditemukan',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorResponse' },
          },
        },
      },
    },
  },
};
