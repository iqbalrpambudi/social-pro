import type { Platform, PlatformAdapter } from './contracts.js';
import { logger } from '../observability/logger.js';

class AdapterRegistry {
  private adapters = new Map<Platform, PlatformAdapter>();

  register(adapter: PlatformAdapter): void {
    this.adapters.set(adapter.platform, adapter);
    logger.info({ platform: adapter.platform }, 'Platform adapter berhasil didaftarkan');
  }

  get(platform: Platform): PlatformAdapter {
    const adapter = this.adapters.get(platform);
    if (!adapter) {
      throw new Error(`Platform adapter '${platform}' belum terdaftar.`);
    }
    return adapter;
  }

  has(platform: Platform): boolean {
    return this.adapters.has(platform);
  }

  getAll(): PlatformAdapter[] {
    return Array.from(this.adapters.values());
  }
}

export const registry = new AdapterRegistry();
