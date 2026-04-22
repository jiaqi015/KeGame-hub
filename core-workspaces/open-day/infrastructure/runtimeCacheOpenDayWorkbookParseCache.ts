import { getCache } from '@vercel/functions';
import type { OpenDayWorkbookParseCache, OpenDayWorkbookParseCachePayload } from '../application/openDayWorkbookParseCache.js';

export class RuntimeCacheOpenDayWorkbookParseCache implements OpenDayWorkbookParseCache {
  constructor(
    private readonly ttlSeconds = 30 * 60,
    private readonly namespace = 'open-day-workbook',
  ) {}

  async get(key: string): Promise<OpenDayWorkbookParseCachePayload | null> {
    try {
      const cache = getCache({ namespace: this.namespace });
      const value = await cache.get(key);
      return (value as OpenDayWorkbookParseCachePayload | undefined) ?? null;
    } catch {
      return null;
    }
  }

  async set(key: string, value: OpenDayWorkbookParseCachePayload): Promise<void> {
    try {
      const cache = getCache({ namespace: this.namespace });
      await cache.set(key, value, {
        ttl: this.ttlSeconds,
        tags: ['open-day-workbook'],
        name: 'open-day-workbook-payload',
      });
    } catch {
      // Cache is a best-effort acceleration only.
    }
  }
}
