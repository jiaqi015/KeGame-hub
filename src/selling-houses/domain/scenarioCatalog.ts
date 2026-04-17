export { BASE_RULES, mergeRules } from './config/baseRules';
export { DIFFICULTY_OPTIONS, getDifficultyOptions } from './config/difficultyOptions';
export { BUILT_IN_WORLD, getBuiltInWorld } from './worlds/builtinWorld';
export {
  buildScenarioSnapshot,
  getBuiltInScenario,
  getBuiltInScenarios,
  getScenarioSnapshotById,
  listBuiltInScenarioSummaries,
} from './scenarios/builtinScenarios';
export {
  generateScenarioBundle,
  generateScenarioDefinition,
  generateScenarioSnapshot,
} from './scenario-generation/scenarioFactory';
export { getDifficultyProfile, listDifficultyProfiles } from './scenario-generation/difficultyProfiles';
export { getScenarioBlueprintsForDifficulty, listScenarioBlueprints } from './scenario-generation/scenarioBlueprints';

import type { ScenarioSnapshot } from './models';
import { mergeRules } from './config/baseRules';

export function resolveScenarioRules(snapshot: ScenarioSnapshot) {
  return mergeRules(snapshot.scenario.rules);
}
