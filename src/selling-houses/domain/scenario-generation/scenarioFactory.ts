import { getBuiltInWorld } from '../worlds/builtinWorld';
import { buildScenarioSnapshot } from '../scenarios/builtinScenarios';
import { normalizeSeed } from '../utils';
import { assembleGeneratedScenario } from './scenarioAssembler';
import { validateGeneratedScenario } from './scenarioValidators';
import type { GeneratedScenarioBundle, ScenarioGenerationRequest } from './types';

const MAX_GENERATION_ATTEMPTS = 6;

export function generateScenarioBundle(request: ScenarioGenerationRequest): GeneratedScenarioBundle {
  const world = request.world ? structuredClone(request.world) : getBuiltInWorld();
  const generationVersion = request.generationVersion || 'v1';
  const baseSeed = normalizeSeed(request.seed);

  let latestBundle: GeneratedScenarioBundle | null = null;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_GENERATION_ATTEMPTS; attempt += 1) {
    const seed = normalizeSeed(baseSeed + attempt * 9973);
    try {
      const assembled = assembleGeneratedScenario({
        ...request,
        world,
        seed,
        generationVersion,
      });
      const snapshot = buildScenarioSnapshot(assembled.scenario, 'builtin');
      const validation = validateGeneratedScenario(
        assembled.scenario,
        assembled.blueprint,
        assembled.profile,
        world,
        assembled.assignments,
      );

      latestBundle = {
        scenario: assembled.scenario,
        snapshot,
        blueprint: assembled.blueprint,
        profile: assembled.profile,
        assignments: assembled.assignments,
        validation,
        seed,
        generationVersion,
        attemptCount: attempt + 1,
      };

      if (validation.valid) {
        return latestBundle;
      }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
    }
  }

  if (latestBundle) {
    return latestBundle;
  }

  throw lastError || new Error(`无法生成 ${request.difficultyId} 的剧本。`);
}

export function generateScenarioDefinition(request: ScenarioGenerationRequest) {
  return generateScenarioBundle(request).scenario;
}

export function generateScenarioSnapshot(request: ScenarioGenerationRequest) {
  return generateScenarioBundle(request).snapshot;
}
