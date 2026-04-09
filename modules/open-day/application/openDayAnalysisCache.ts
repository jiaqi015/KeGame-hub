import type { OpenDayAnalysisResponse } from '../domain/openDay.types.js';

export interface OpenDayAnalysisCache {
  get(key: string): Promise<OpenDayAnalysisResponse | null>;
  set(key: string, value: OpenDayAnalysisResponse): Promise<void>;
}
