import type { OpenDayCatalogResponse } from '../domain/openDay.types.js';
import { defaultOpenDayConfig, mergeOpenDayConfig, openDayPresetCatalog } from './openDayConfig.js';
import { createOpenDayHash } from './openDayFingerprint.js';

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export class OpenDayCatalogService {
  execute(): OpenDayCatalogResponse {
    const defaultConfig = clone(defaultOpenDayConfig);
    const generatedAt = new Date().toISOString();

    return {
      generatedAt,
      defaultConfig,
      defaultConfigVersion: createOpenDayHash(defaultConfig, 'cfg'),
      presets: openDayPresetCatalog.map((preset) => ({
        ...clone(preset),
        version: createOpenDayHash({ id: preset.id, overrides: preset.overrides }, 'preset'),
        resolvedConfig: mergeOpenDayConfig(defaultConfig, preset.overrides),
      })),
    };
  }
}
