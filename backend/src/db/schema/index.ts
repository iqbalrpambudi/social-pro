import {
  pgTable,
  uuid,
  text,
  integer,
  bigint,
  timestamp,
  jsonb,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// 1. Users
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  name: text('name').notNull().default('Admin'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// 2. Simple API Tokens
export const apiTokens = pgTable('api_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull().unique(),
  name: text('name').notNull().default('Default Token'),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// 3. Social Accounts
export const socialAccounts = pgTable(
  'social_accounts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    platform: text('platform').notNull(), // 'youtube', 'tiktok', 'instagram', 'facebook'
    providerAccountId: text('provider_account_id').notNull(),
    displayName: text('display_name').notNull(),
    accessTokenCiphertext: text('access_token_ciphertext').notNull(),
    refreshTokenCiphertext: text('refresh_token_ciphertext'),
    tokenExpiresAt: timestamp('token_expires_at', { withTimezone: true }),
    scopes: jsonb('scopes').default([]),
    connectionStatus: text('connection_status').notNull().default('connected'), // 'connected', 'reauthorization_required', 'revoked', 'error'
    lastVerifiedAt: timestamp('last_verified_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('user_platform_account_idx').on(
      table.userId,
      table.platform,
      table.providerAccountId
    ),
    index('social_accounts_user_idx').on(table.userId),
  ]
);

// 4. Media Assets
export const mediaAssets = pgTable(
  'media_assets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    storageKey: text('storage_key').notNull().unique(),
    originalFilename: text('original_filename').notNull(),
    mimeType: text('mime_type').notNull(),
    mediaType: text('media_type').notNull().default('video'), // 'video' | 'image'
    sizeBytes: bigint('size_bytes', { mode: 'number' }).notNull(),
    durationMs: bigint('duration_ms', { mode: 'number' }),
    width: integer('width'),
    height: integer('height'),
    status: text('status').notNull().default('upload_pending'), // 'upload_pending', 'uploaded', 'validating', 'ready', 'rejected', 'deleted'
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [
    index('media_assets_user_idx').on(table.userId, table.createdAt),
  ]
);

// 5. Publications
export const publications = pgTable(
  'publications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    mediaAssetId: uuid('media_asset_id')
      .notNull()
      .references(() => mediaAssets.id, { onDelete: 'restrict' }),
    idempotencyKey: text('idempotency_key'),
    status: text('status').notNull().default('queued'), // 'draft', 'scheduled', 'queued', 'processing', 'partially_succeeded', 'succeeded', 'failed', 'cancelled'
    scheduleAt: timestamp('schedule_at', { withTimezone: true }),
    clientReference: text('client_reference'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('user_publication_idempotency_idx').on(table.userId, table.idempotencyKey),
    index('publications_user_idx').on(table.userId, table.createdAt),
  ]
);

// 6. Publication Targets
export const publicationTargets = pgTable(
  'publication_targets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    publicationId: uuid('publication_id')
      .notNull()
      .references(() => publications.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    socialAccountId: uuid('social_account_id')
      .notNull()
      .references(() => socialAccounts.id, { onDelete: 'restrict' }),
    platform: text('platform').notNull(),
    caption: text('caption'),
    title: text('title'),
    visibility: text('visibility').default('public'), // 'public', 'unlisted', 'private'
    thumbnailMediaAssetId: uuid('thumbnail_media_asset_id').references(
      () => mediaAssets.id,
      { onDelete: 'set null' }
    ),
    scheduledAt: timestamp('scheduled_at', { withTimezone: true }),
    status: text('status').notNull().default('queued'), // 'scheduled', 'queued', 'preparing', 'uploading', 'processing', 'publishing', 'published', 'retry_wait', 'failed', 'cancelled', 'reauthorization_required', 'unknown_remote_state'
    attemptCount: integer('attempt_count').notNull().default(0),
    nextRetryAt: timestamp('next_retry_at', { withTimezone: true }),
    externalPostId: text('external_post_id'),
    externalPostUrl: text('external_post_url'),
    providerUploadId: text('provider_upload_id'),
    lastErrorCode: text('last_error_code'),
    lastErrorMessage: text('last_error_message'),
    startedAt: timestamp('started_at', { withTimezone: true }),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('publication_target_account_idx').on(
      table.publicationId,
      table.socialAccountId
    ),
    index('targets_status_retry_idx').on(table.status, table.nextRetryAt),
    index('targets_status_scheduled_idx').on(table.status, table.scheduledAt),
  ]
);

// 7. Publication Events (Audit Trail)
export const publicationEvents = pgTable(
  'publication_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    publicationTargetId: uuid('publication_target_id')
      .notNull()
      .references(() => publicationTargets.id, { onDelete: 'cascade' }),
    eventType: text('event_type').notNull(),
    fromStatus: text('from_status'),
    toStatus: text('to_status'),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('events_target_idx').on(table.publicationTargetId, table.createdAt),
  ]
);

// 8. Daily Quotas (for YouTube ~10.000 units tracker)
export const dailyQuotas = pgTable(
  'daily_quotas',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    date: text('date').notNull(), // 'YYYY-MM-DD' in UTC
    platform: text('platform').notNull().default('youtube'),
    quotaUsed: integer('quota_used').notNull().default(0),
    quotaLimit: integer('quota_limit').notNull().default(10000),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('daily_quota_date_platform_idx').on(table.date, table.platform),
  ]
);

// Drizzle Relations
export const usersRelations = relations(users, ({ many }) => ({
  socialAccounts: many(socialAccounts),
  mediaAssets: many(mediaAssets),
  publications: many(publications),
  apiTokens: many(apiTokens),
}));

export const socialAccountsRelations = relations(socialAccounts, ({ one, many }) => ({
  user: one(users, {
    fields: [socialAccounts.userId],
    references: [users.id],
  }),
  publicationTargets: many(publicationTargets),
}));

export const mediaAssetsRelations = relations(mediaAssets, ({ one }) => ({
  user: one(users, {
    fields: [mediaAssets.userId],
    references: [users.id],
  }),
}));

export const publicationsRelations = relations(publications, ({ one, many }) => ({
  user: one(users, {
    fields: [publications.userId],
    references: [users.id],
  }),
  mediaAsset: one(mediaAssets, {
    fields: [publications.mediaAssetId],
    references: [mediaAssets.id],
  }),
  targets: many(publicationTargets),
}));

export const publicationTargetsRelations = relations(publicationTargets, ({ one, many }) => ({
  publication: one(publications, {
    fields: [publicationTargets.publicationId],
    references: [publications.id],
  }),
  socialAccount: one(socialAccounts, {
    fields: [publicationTargets.socialAccountId],
    references: [socialAccounts.id],
  }),
  thumbnailMedia: one(mediaAssets, {
    fields: [publicationTargets.thumbnailMediaAssetId],
    references: [mediaAssets.id],
  }),
  events: many(publicationEvents),
}));

export const publicationEventsRelations = relations(publicationEvents, ({ one }) => ({
  target: one(publicationTargets, {
    fields: [publicationEvents.publicationTargetId],
    references: [publicationTargets.id],
  }),
}));
