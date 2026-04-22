import type { OpenDayAnalysisResponse } from '../domain/openDay.types.js';
import type { OpenDayAnalysisCache } from '../application/openDayAnalysisCache.js';

export class LayeredOpenDayAnalysisCache implements OpenDayAnalysisCache {
  constructor(
    private readonly primary: OpenDayAnalysisCache,
    private readonly secondary?: OpenDayAnalysisCache,
  ) {}

  async get(key: string): Promise<OpenDayAnalysisResponse | null> {
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

  async set(key: string, value: OpenDayAnalysisResponse): Promise<void> {
    await this.primary.set(key, value);
    if (this.secondary) {
      await this.secondary.set(key, value);
    }
  }
}
