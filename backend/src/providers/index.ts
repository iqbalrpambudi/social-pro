import { registry } from './registry.js';
import { YouTubeAdapter } from './youtube/youtube.adapter.js';
import { TikTokAdapter } from './tiktok/tiktok.adapter.js';
import { MockPlatformAdapter } from './mock/mock.adapter.js';

let initialized = false;

export function initializeAdapters(): void {
  if (initialized) return;
  registry.register(new YouTubeAdapter());
  registry.register(new TikTokAdapter());
  registry.register(new MockPlatformAdapter());
  initialized = true;
}

// Auto-initialize default adapters
initializeAdapters();

export * from './contracts.js';
export * from './registry.js';
