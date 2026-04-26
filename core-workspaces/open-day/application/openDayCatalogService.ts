import type { OpenDayCatalogResponse } from '../domain/openDay.types.js';
import { listOpenDaySkillDefinitions, listOpenDayFormulaDefinitions } from '../domain/openDaySkill.js';
import { defaultOpenDayConfig, mergeOpenDayConfig, openDayParameterPackageCatalog } from './openDayConfig.js';
import { createOpenDayHash } from './openDayFingerprint.js';

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export class OpenDayCatalogService {
  execute(): OpenDayCatalogResponse {
    const defaultConfig = clone(defaultOpenDayConfig);
    const generatedAt = new Date().toISOString();
    const skills = listOpenDaySkillDefinitions();

    return {
      generatedAt,
      defaultConfig,
      defaultConfigVersion: createOpenDayHash(defaultConfig, 'cfg'),
      skills,
      formulas: skills,
      parameterPackages: openDayParameterPackageCatalog.map((parameterPackage) => ({
        ...clone(parameterPackage),
        version: createOpenDayHash({ id: parameterPackage.id, overrides: parameterPackage.overrides }, 'package'),
        resolvedConfig: mergeOpenDayConfig(defaultConfig, parameterPackage.overrides),
      })),
      presets: openDayParameterPackageCatalog.map((parameterPackage) => ({
        ...clone(parameterPackage),
        version: createOpenDayHash({ id: parameterPackage.id, overrides: parameterPackage.overrides }, 'preset'),
        resolvedConfig: mergeOpenDayConfig(defaultConfig, parameterPackage.overrides),
      })),
    };
  }
}
