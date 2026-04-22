export { BASE_RULES, mergeRules } from './config/baseRules.js';
export { DIFFICULTY_OPTIONS, getDifficultyOptions } from './config/difficultyOptions.js';
export { BUILT_IN_WORLD, getBuiltInWorld } from './worlds/builtinWorld.js';
export {
  buildScenarioSnapshot,
  getBuiltInScenario,
  getBuiltInScenarios,
  getScenarioSnapshotById,
  listBuiltInScenarioSummaries,
} from './scenarios/builtinScenarios.js';
export {
  generateScenarioBundle,
  generateScenarioDefinition,
  generateScenarioSnapshot,
} from './scenario-generation/scenarioFactory.js';
export { getDifficultyProfile, listDifficultyProfiles } from './scenario-generation/difficultyProfiles.js';
export { getScenarioBlueprintsForDifficulty, listScenarioBlueprints } from './scenario-generation/scenarioBlueprints.js';

import type { ScenarioSnapshot } from './models.js';
import { mergeRules } from './config/baseRules.js';

export function resolveScenarioRules(snapshot: ScenarioSnapshot) {
  return mergeRules(snapshot.scenario.rules);
}
