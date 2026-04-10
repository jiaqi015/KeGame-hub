import type { OpenDayWorkbookParseCache, OpenDayWorkbookParseCachePayload } from '../application/openDayWorkbookParseCache.js';

interface CacheEntry {
  expiresAt: number;
  value: OpenDayWorkbookParseCachePayload;
}

export class InMemoryOpenDayWorkbookParseCache implements OpenDayWorkbookParseCache {
  private readonly entries = new Map<string, CacheEntry>();

  constructor(
    private readonly ttlMs = 30 * 60 * 1000,
    private readonly maxEntries = 80,
  ) {}

  async get(key: string): Promise<OpenDayWorkbookParseCachePayload | null> {
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

  async set(key: string, value: OpenDayWorkbookParseCachePayload): Promise<void> {
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
