import type {
  OpenDayConfig,
  OpenDayScenarioDraft,
  OpenDayScoreCommand,
  OpenDaySaveScenarioCommand,
} from '../domain/openDay.types.js';
import { defaultOpenDayConfig, mergeOpenDayConfig, normalizeWeights, openDayParameterPackageCatalog } from './openDayConfig.js';

interface OpenDayScenarioInputLike {
  config?: Partial<OpenDayConfig>;
  scenario?: {
    skillId?: OpenDayScenarioDraft['skillId'];
    formulaId?: OpenDayScenarioDraft['formulaId'];
    parameterPackageId?: string | null;
    config?: Partial<OpenDayConfig>;
  };
  activePresetId?: string;
  activeParameterPackageId?: string;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function resolveOpenDayParameterPackageId(input: OpenDayScenarioInputLike) {
  const direct = input.scenario?.parameterPackageId;
  if (typeof direct === 'string') {
    return direct;
  }

  if (direct === null) {
    return null;
  }

  if (typeof input.activeParameterPackageId === 'string' && input.activeParameterPackageId) {
    return input.activeParameterPackageId;
  }

  if (typeof input.activePresetId === 'string' && input.activePresetId) {
    return input.activePresetId;
  }

  return null;
}

export function resolveOpenDayScenarioDraft(
  input: OpenDayScoreCommand | OpenDaySaveScenarioCommand | OpenDayScenarioInputLike,
): OpenDayScenarioDraft {
  const parameterPackageId = resolveOpenDayParameterPackageId(input);
  const parameterPackage = parameterPackageId
    ? openDayParameterPackageCatalog.find((item) => item.id === parameterPackageId)
    : null;

  const packageConfig = parameterPackage
    ? (mergeOpenDayConfig(defaultOpenDayConfig, parameterPackage.overrides) as OpenDayConfig)
    : clone(defaultOpenDayConfig);

  const explicitConfig = input.scenario?.config || input.config;
  const mergedConfig = mergeOpenDayConfig(packageConfig, explicitConfig) as OpenDayConfig;
  mergedConfig.skillId = input.scenario?.skillId || input.scenario?.formulaId || mergedConfig.skillId || mergedConfig.formulaId || defaultOpenDayConfig.skillId;
  mergedConfig.formulaId = mergedConfig.skillId;
  mergedConfig.alpha = Math.max(0, Number(mergedConfig.alpha) || defaultOpenDayConfig.alpha);
  mergedConfig.weights = normalizeWeights(mergedConfig.weights);

  return {
    skillId: mergedConfig.skillId,
    formulaId: mergedConfig.formulaId,
    parameterPackageId,
    config: mergedConfig,
  };
}
