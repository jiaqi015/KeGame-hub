import type { OpenDayAnalysisResponse } from '../domain/openDay.types.js';
import type { OpenDayAnalysisCache } from '../application/openDayAnalysisCache.js';

interface CacheEntry {
  expiresAt: number;
  value: OpenDayAnalysisResponse;
}

export class InMemoryOpenDayAnalysisCache implements OpenDayAnalysisCache {
  private readonly entries = new Map<string, CacheEntry>();

  constructor(
    private readonly ttlMs = 5 * 60 * 1000,
    private readonly maxEntries = 200,
  ) {}

  async get(key: string): Promise<OpenDayAnalysisResponse | null> {
    const entry = this.entries.get(key);

    if (!entry) {
      return null;
    }

    if (entry.expiresAt <= Date.now()) {
      this.entries.delete(key);
      return null;
    }

    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry.value;
  }

  async set(key: string, value: OpenDayAnalysisResponse): Promise<void> {
    this.entries.set(key, {
      value,
      expiresAt: Date.now() + this.ttlMs,
    });

    if (this.entries.size <= this.maxEntries) {
      return;
    }

    const oldestKey = this.entries.keys().next().value;
    if (typeof oldestKey === 'string') {
      this.entries.delete(oldestKey);
    }
  }
}
