import type {
  BoardPressureProfile,
  DifficultyId,
  GoalContextId,
  ScenarioDefinition,
  ScenarioSummary,
  ScoreThresholds,
} from './models.js';
import {
  scoreThresholdsForTarget,
  targetScoreForDifficulty,
} from './config/difficultyTargets.js';

export {
  PLAYER_TARGET_SCORE_BY_DIFFICULTY,
  scoreThresholdsForTarget,
  targetScoreForDifficulty,
} from './config/difficultyTargets.js';

export function inferGoalContext(scenario: ScenarioDefinition): GoalContextId {
  if (scenario.goalContext) {
    return scenario.goalContext;
  }
  const urgentCount = scenario.cases.filter((entry) => entry.windowDays <= 8 || entry.initialUrgency >= 76).length;
  const fragileCount = scenario.cases.filter((entry) => entry.initialTrust <= 58 || entry.initialPatience <= 45).length;
  if (fragileCount >= Math.ceil(scenario.cases.length / 2)) {
    return 'satisfaction';
  }
  if (urgentCount >= Math.ceil(scenario.cases.length / 2)) {
    return 'defense';
  }
  return 'ability';
}

export function inferBoardPressureProfile(scenario: ScenarioDefinition): BoardPressureProfile {
  const abilityPressure = Math.min(92, 44 + scenario.cases.length * 4);
  const defensePressure = Math.min(92, 40 + scenario.competitionGroups.length * 10);
  const satisfactionPressure = Math.min(
    92,
    38 + scenario.cases.filter((entry) => entry.initialTrust <= 60 || entry.initialPatience <= 48).length * 8,
  );
  return {
    abilityPressure,
    defensePressure,
    satisfactionPressure,
  };
}

export function enrichScenarioDefinition(scenario: ScenarioDefinition): ScenarioDefinition {
  const goalContext = inferGoalContext(scenario);
  const targetScore = scenario.targetScore || targetScoreForDifficulty(scenario.difficultyId);
  return {
    ...scenario,
    goalContext,
    targetScore,
    scoreThresholds: scenario.scoreThresholds || scoreThresholdsForTarget(targetScore),
    boardPressureProfile: scenario.boardPressureProfile || inferBoardPressureProfile(scenario),
    cases: scenario.cases.map((entry) => ({
      ...entry,
      goalTier: entry.goalTier
        || (entry.windowDays <= 8 || entry.initialUrgency >= 76 ? 'core'
          : entry.initialTrust <= 58 || entry.initialPatience <= 45 ? 'important'
            : 'normal'),
    })),
  };
}

export function buildScenarioSummary(scenario: ScenarioDefinition): ScenarioSummary {
  const enriched = enrichScenarioDefinition(scenario);
  return {
    id: enriched.id,
    difficultyId: enriched.difficultyId,
    name: enriched.name,
    opening: {
      kind: 'scenario',
      scenarioId: enriched.id,
    },
    presentation: {
      theme: enriched.theme,
      description: enriched.description,
      caseCount: enriched.cases.length,
      maxDay: enriched.maxDay,
      goalContext: enriched.goalContext || 'ability',
      targetScore: enriched.targetScore || targetScoreForDifficulty(enriched.difficultyId),
    },
  };
}
