import type { ScenarioBlueprint } from './types';
import { pickRandom, type RandomSource } from '../utils';

export function buildScenarioPresentation(
  blueprint: ScenarioBlueprint,
  caseCount: number,
  eventCount: number,
  source: RandomSource,
) {
  const name = pickRandom(blueprint.naming.titlePool, source);
  const theme = pickRandom(blueprint.naming.themeFragments, source);
  const description = `${caseCount} 套盘，${pickRandom(blueprint.naming.descriptionFragments, source)}，预埋 ${eventCount} 个关键节点。`;

  return {
    name,
    theme,
    description,
  };
}
