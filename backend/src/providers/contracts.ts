export type Platform =
  | 'youtube'
  | 'tiktok'
  | 'instagram'
  | 'facebook'
  | 'mock';

export interface PublishContext {
  targetId: string;
  publicationId: string;
  accountId: string;
  platform: Platform;
  media: {
    id: string;
    storageKey: string;
    mimeType: string;
    sizeBytes: number;
    originalFilename: string;
  };
  thumbnailMedia?: {
    id: string;
    storageKey: string;
    mimeType: string;
  };
  metadata: {
    caption?: string;
    title?: string;
    visibility?: 'public' | 'unlisted' | 'private' | string;
    privacyLevel?: string;
    tags?: string[];
    disableComment?: boolean;
    disableDuet?: boolean;
    disableStitch?: boolean;
    [key: string]: any;
  };
  credentials: {
    accessToken: string;
    refreshToken?: string;
    providerAccountId: string;
  };
  idempotencyKey: string;
}

export interface PublishOutcome {
  status: 'publishing' | 'processing' | 'published' | 'failed' | 'unknown_remote_state';
  externalPostId?: string;
  externalPostUrl?: string;
  providerUploadId?: string;
  errorCode?: string;
  errorMessage?: string;
}

export interface PlatformCapabilities {
  supportsScheduledPublish: boolean;
  supportsResumableUpload: boolean;
  supportsThumbnail: boolean;
  supportsVisibility: boolean;
  maxVideoSizeBytes: number;
  allowedMimeTypes: string[];
}

export interface PlatformAdapter {
  readonly platform: Platform;
  readonly capabilities: PlatformCapabilities;
  validate(ctx: PublishContext): Promise<void>;
  publish(ctx: PublishContext): Promise<PublishOutcome>;
  getStatus?(providerUploadId: string): Promise<PublishOutcome>;
}
