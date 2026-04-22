import { getCache } from '@vercel/functions';
import type { OpenDayAnalysisResponse } from '../domain/openDay.types.js';
import type { OpenDayAnalysisCache } from '../application/openDayAnalysisCache.js';

export class RuntimeCacheOpenDayAnalysisCache implements OpenDayAnalysisCache {
  constructor(
    private readonly ttlSeconds = 5 * 60,
    private readonly namespace = 'open-day-analysis',
  ) {}

  async get(key: string): Promise<OpenDayAnalysisResponse | null> {
    try {
      const cache = getCache({ namespace: this.namespace });
      const value = await cache.get(key);
      return (value as OpenDayAnalysisResponse | undefined) ?? null;
    } catch {
      return null;
    }
  }

  async set(key: string, value: OpenDayAnalysisResponse): Promise<void> {
    try {
      const cache = getCache({ namespace: this.namespace });
      await cache.set(key, value, {
        ttl: this.ttlSeconds,
        tags: ['open-day-analysis'],
        name: 'open-day-analysis-result',
      });
    } catch {
      // Runtime Cache should be a performance enhancement only.
    }
  }
}
