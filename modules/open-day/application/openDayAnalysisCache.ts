import type { OpenDayAnalysisResponse } from '../domain/openDay.types.js';

export interface OpenDayAnalysisCache {
  get(key: string): OpenDayAnalysisResponse | null;
  set(key: string, value: OpenDayAnalysisResponse): void;
}
