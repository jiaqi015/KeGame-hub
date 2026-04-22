import type { OpenDayWorkbookParseCache, OpenDayWorkbookParseCachePayload } from '../application/openDayWorkbookParseCache.js';

export class LayeredOpenDayWorkbookParseCache implements OpenDayWorkbookParseCache {
  constructor(
    private readonly primary: OpenDayWorkbookParseCache,
    private readonly secondary?: OpenDayWorkbookParseCache,
  ) {}

  async get(key: string): Promise<OpenDayWorkbookParseCachePayload | null> {
    const primaryValue = await this.primary.get(key);
    if (primaryValue) {
      return primaryValue;
    }

    if (!this.secondary) {
      return null;
    }

    const secondaryValue = await this.secondary.get(key);
    if (secondaryValue) {
      await this.primary.set(key, secondaryValue);
      return secondaryValue;
    }

    return null;
  }

  async set(key: string, value: OpenDayWorkbookParseCachePayload): Promise<void> {
    await this.primary.set(key, value);
    if (this.secondary) {
      await this.secondary.set(key, value);
    }
  }
}
