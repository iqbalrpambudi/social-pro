export const getApiBaseUrl = (): string => {
  return localStorage.getItem('smu_api_url') || 'http://localhost:4000';
};

export const getApiToken = (): string => {
  return localStorage.getItem('smu_api_token') || 'smu_secret_token_dev_12345';
};

export interface SocialAccount {
  id: string;
  platform: 'youtube' | 'tiktok' | 'instagram' | 'facebook' | 'mock';
  displayName: string;
  externalAccountId: string;
  status: string;
  capabilities: {
    videoUpload: boolean;
    scheduledPublishing: boolean;
    customThumbnail: boolean;
  };
  createdAt: string;
}

export interface MediaAsset {
  id: string;
  status: string;
  fileName: string;
  contentType: string;
  mediaType: 'video' | 'image';
  sizeBytes: number;
  previewUrl?: string | null;
  createdAt: string;
}

export interface PublicationTarget {
  id: string;
  socialAccountId: string;
  platform: string;
  caption?: string | null;
  title?: string | null;
  status: string;
  externalPostId?: string | null;
  externalPostUrl?: string | null;
  publishedAt?: string | null;
  error?: {
    code?: string | null;
    message?: string | null;
  } | null;
}

export interface Publication {
  id: string;
  status: string;
  mediaId: string;
  mediaFilename: string;
  scheduleAt?: string | null;
  targets: PublicationTarget[];
  createdAt: string;
  updatedAt?: string;
}

export interface DailyQuota {
  date: string;
  platform: string;
  quotaUsed: number;
  quotaLimit: number;
  remainingUnits: number;
  remainingVideos: number;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const url = `${getApiBaseUrl()}${path}`;
  const headers = new Headers(options.headers || {});

  if (!headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${getApiToken()}`);
  }

  const res = await fetch(url, {
    ...options,
    headers,
  });

  if (!res.ok) {
    let errBody: any;
    try {
      errBody = await res.json();
    } catch {
      errBody = { error: { message: `HTTP ${res.status}: ${res.statusText}` } };
    }
    const message = errBody?.error?.message || `Request gagal dengan status ${res.status}`;
    throw new Error(message);
  }

  if (res.status === 204) {
    return {} as T;
  }

  return res.json();
}

export const api = {
  async getHealth() {
    return request<{ status: string }>('/health');
  },

  async getReady() {
    return request<{ status: string; database: string; storage: string }>('/ready');
  },

  async getDailyQuota() {
    return request<DailyQuota>('/v1/publications/quota/today');
  },

  async getSocialAccounts() {
    return request<{ data: SocialAccount[] }>('/v1/social-accounts');
  },

  async connectMockAccount(displayName: string, platform: 'youtube' | 'mock' = 'youtube') {
    return request<{ message: string; account: SocialAccount }>('/v1/social-accounts/mock-connect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ displayName, platform }),
    });
  },

  async disconnectAccount(accountId: string) {
    return request<void>(`/v1/social-accounts/${accountId}`, {
      method: 'DELETE',
    });
  },

  async createUploadSession(fileName: string, contentType: string, sizeBytes: number) {
    return request<{
      media: MediaAsset;
      upload: {
        method: string;
        url: string;
        headers: Record<string, string>;
        expiresAt: string;
      };
    }>('/v1/media/uploads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileName, contentType, sizeBytes }),
    });
  },

  uploadToPresignedUrl(
    url: string,
    contentType: string,
    file: File,
    onProgress?: (percent: number) => void
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', url);
      xhr.setRequestHeader('Content-Type', contentType);

      if (onProgress && xhr.upload) {
        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) {
            const percent = Math.round((event.loaded / event.total) * 100);
            onProgress(percent);
          }
        };
      }

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve();
        } else {
          reject(new Error(`Gagal mengunggah file ke storage: HTTP ${xhr.status}`));
        }
      };

      xhr.onerror = () => {
        reject(new Error('Koneksi jaringan gagal saat mengunggah file ke storage'));
      };

      xhr.send(file);
    });
  },

  async completeUpload(mediaId: string) {
    return request<{ media: MediaAsset }>(`/v1/media/${mediaId}/complete`, {
      method: 'POST',
    });
  },

  async listMedia() {
    return request<{ data: MediaAsset[] }>('/v1/media');
  },

  async createPublication(params: {
    mediaId: string;
    targets: Array<{
      socialAccountId: string;
      caption?: string;
      title?: string;
      visibility?: 'public' | 'unlisted' | 'private';
      thumbnailMediaId?: string;
    }>;
    scheduleAt?: string | null;
  }) {
    const idempotencyKey = `pub_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    return request<Publication>('/v1/publications', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': idempotencyKey,
      },
      body: JSON.stringify(params),
    });
  },

  async listPublications() {
    return request<{ data: Publication[] }>('/v1/publications');
  },

  async getPublication(id: string) {
    return request<Publication>(`/v1/publications/${id}`);
  },

  async retryPublication(id: string) {
    return request<{ message: string; publicationId: string }>(`/v1/publications/${id}/retry`, {
      method: 'POST',
    });
  },
};
