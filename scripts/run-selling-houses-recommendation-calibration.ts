import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { asWritableCase } from '../src/selling-houses/domain/models.js';
import { createInitialState, updateDerivedState } from '../src/selling-houses/application/gameState.js';
import { advanceDays, executeAction } from '../src/selling-houses/domain/engine.js';
import { evaluateFinalResult } from '../src/selling-houses/domain/resultEvaluation.js';
import { deriveCaseRecommendations } from '../src/selling-houses/domain/recommendationEngine.js';
import { getScenarioSnapshotById } from '../src/selling-houses/domain/scenarioCatalog.js';

export type RecommendationCalibrationExecutionMode =
  | 'top1-only'
  | 'choose-one-from-top4'
  | 'execute-all-top4';

export interface RecommendationCalibrationOptions {
  scenarioId?: string;
  runs?: number;
  baseSeed?: number;
  topN?: number;
  executionMode?: RecommendationCalibrationExecutionMode;
}

export interface RecommendationCalibrationResult {
  scenario: string;
  runs: number;
  seeds: string;
  executionMode: RecommendationCalibrationExecutionMode;
  executionStatus: 'executable' | 'execution-risk';
  executionWarnings: string[];
  qualityStatus: 'healthy' | 'needs-tuning';
  qualityWarnings: string[];
  decisionPoints: number;
  top1ExecutionRatePct: number;
  failedTop1: number;
  averageImmediateTrustDeltaPerExecutedTop1: number;
  averageTop4SlotsPerDay: number;
  averageScore: number;
  averageAbility: number;
  averageDefense: number;
  averageSatisfaction: number;
  averageSoldCount: number;
  averageWithdrawnCount: number;
  coreBadRunRatePct: number;
  lostToRivalRunRatePct: number;
  top1ActionDistributionPct: Record<string, number>;
  top1PhaseDistributionPct: Record<string, number>;
}

interface CalibrationAggregate {
  days: number;
  decisionPoints: number;
  top1: number;
  top1Executed: number;
  top1Failed: number;
  immediateTrustDelta: number;
  score: number;
  ability: number;
  defense: number;
  satisfaction: number;
  sold: number;
  withdrawn: number;
  lostToRivalRuns: number;
  coreBadRuns: number;
  actionCounts: Record<string, number>;
  phaseCounts: Record<string, number>;
}

function increment(map: Record<string, number>, key: string) {
  map[key] = (map[key] || 0) + 1;
}

function pct(numerator: number, denominator: number) {
  return denominator ? Math.round((numerator / denominator) * 1000) / 10 : 0;
}

function average(value: number, denominator: number) {
  return Math.round((value / Math.max(1, denominator)) * 100) / 100;
}

function distributionPct(counts: Record<string, number>, total: number) {
  return Object.fromEntries(
    Object.entries(counts)
      .sort((left, right) => right[1] - left[1])
      .map(([key, value]) => [key, pct(value, total)]),
  );
}

function deriveQualityWarnings(input: {
  averageScore: number;
  coreBadRunRatePct: number;
  lostToRivalRunRatePct: number;
}) {
  const warnings: string[] = [];
  if (input.averageScore < 50) {
    warnings.push('average-score-low');
  }
  if (input.coreBadRunRatePct > 35) {
    warnings.push('core-bad-rate-high');
  }
  if (input.lostToRivalRunRatePct > 35) {
    warnings.push('lost-to-rival-rate-high');
  }
  return warnings;
}

function deriveExecutionWarnings(input: {
  top1ExecutionRatePct: number;
  failedTop1: number;
}) {
  const warnings: string[] = [];
  if (input.failedTop1 > 0 || input.top1ExecutionRatePct < 95) {
    warnings.push('top1-execution-risk');
  }
  return warnings;
}

export function runRecommendationCalibration(
  options: RecommendationCalibrationOptions = {},
): RecommendationCalibrationResult {
  const scenarioId = options.scenarioId || 'standard-window-chain';
  const runs = options.runs ?? 100;
  const baseSeed = options.baseSeed ?? 730001;
  const topN = options.topN ?? 4;
  const executionMode = options.executionMode || 'choose-one-from-top4';
  const snapshot = getScenarioSnapshotById(scenarioId);
  if (!snapshot) {
    throw new Error(`Unknown selling-houses scenario: ${scenarioId}`);
  }

  const aggregate: CalibrationAggregate = {
    days: 0,
    decisionPoints: 0,
    top1: 0,
    top1Executed: 0,
    top1Failed: 0,
    immediateTrustDelta: 0,
    score: 0,
    ability: 0,
    defense: 0,
    satisfaction: 0,
    sold: 0,
    withdrawn: 0,
    lostToRivalRuns: 0,
    coreBadRuns: 0,
    actionCounts: {},
    phaseCounts: {},
  };

  for (let index = 0; index < runs; index += 1) {
    const seed = baseSeed + index;
    const state = createInitialState(snapshot, seed);
    updateDerivedState(state);

    while (!state.gameOver && state.day <= state.maxDay) {
      updateDerivedState(state);
      const todayTop = deriveCaseRecommendations(state).slice(0, topN);
      aggregate.days += 1;
      aggregate.decisionPoints += todayTop.length;

      if (todayTop[0]) {
        aggregate.top1 += 1;
        increment(aggregate.actionCounts, todayTop[0].primaryAction.actionId);
        increment(aggregate.phaseCounts, todayTop[0].phase);
      }

      const executableRanks = executionMode === 'top1-only'
        ? [0]
        : executionMode === 'choose-one-from-top4'
          ? [todayTop.findIndex((recommendation) => {
              const caseItem = state.cases.find((entry) => entry.id === recommendation.caseId);
              return Boolean(caseItem && caseItem.status === 'active');
            })].filter((rank) => rank >= 0)
          : todayTop.map((_recommendation, rank) => rank);

      for (const rank of executableRanks) {
        const recommendation = todayTop[rank];
        if (!recommendation) continue;
        const caseItem = state.cases.find((entry) => entry.id === recommendation.caseId);
        if (!caseItem || caseItem.status !== 'active') continue;

        const beforeTrust = caseItem.trust;
        const ok = executeAction(
          state,
          recommendation.primaryAction.actionId,
          caseItem,
          recommendation.primaryAction.optionId || null,
        );
        if (rank === 0) {
          if (ok) {
            aggregate.top1Executed += 1;
            aggregate.immediateTrustDelta += caseItem.trust - beforeTrust;
          } else {
            aggregate.top1Failed += 1;
          }
        }
      }

      if (state.gameOver || state.day >= state.maxDay) break;
      advanceDays(state, 1);
    }

    const result = state.finalResult || evaluateFinalResult(state, 'recommendation-calibration');
    aggregate.score += result.score;
    aggregate.ability += result.dimensions.ability.score;
    aggregate.defense += result.dimensions.defense.score;
    aggregate.satisfaction += result.dimensions.satisfaction.score;
    aggregate.sold += state.closedDeals.length;
    aggregate.withdrawn += state.cases.filter((entry) => entry.status === 'withdrawn').length;
    if (state.cases.some((entry) => entry.status === 'lost_to_rival')) {
      aggregate.lostToRivalRuns += 1;
    }
    if (result.caseResults.some((entry) => entry.goalTier === 'core' && entry.defenseOutcome !== 'held')) {
      aggregate.coreBadRuns += 1;
    }
  }

  const averageScore = average(aggregate.score, runs);
  const coreBadRunRatePct = pct(aggregate.coreBadRuns, runs);
  const lostToRivalRunRatePct = pct(aggregate.lostToRivalRuns, runs);
  const top1ExecutionRatePct = pct(aggregate.top1Executed, aggregate.top1);
  const qualityWarnings = deriveQualityWarnings({
    averageScore,
    coreBadRunRatePct,
    lostToRivalRunRatePct,
  });
  const executionWarnings = deriveExecutionWarnings({
    top1ExecutionRatePct,
    failedTop1: aggregate.top1Failed,
  });

  return {
    scenario: scenarioId,
    runs,
    seeds: `${baseSeed}..${baseSeed + runs - 1}`,
    executionMode,
    executionStatus: executionWarnings.length > 0 ? 'execution-risk' : 'executable',
    executionWarnings,
    qualityStatus: qualityWarnings.length > 0 ? 'needs-tuning' : 'healthy',
    qualityWarnings,
    decisionPoints: aggregate.decisionPoints,
    top1ExecutionRatePct,
    failedTop1: aggregate.top1Failed,
    averageImmediateTrustDeltaPerExecutedTop1: average(aggregate.immediateTrustDelta, aggregate.top1Executed),
    averageTop4SlotsPerDay: average(aggregate.decisionPoints, aggregate.days),
    averageScore,
    averageAbility: average(aggregate.ability, runs),
    averageDefense: average(aggregate.defense, runs),
    averageSatisfaction: average(aggregate.satisfaction, runs),
    averageSoldCount: average(aggregate.sold, runs),
    averageWithdrawnCount: average(aggregate.withdrawn, runs),
    coreBadRunRatePct,
    lostToRivalRunRatePct,
    top1ActionDistributionPct: distributionPct(aggregate.actionCounts, aggregate.top1),
    top1PhaseDistributionPct: distributionPct(aggregate.phaseCounts, aggregate.top1),
  };
}

function numberArg(rawValue: string | undefined, fallback: number) {
  const parsed = Number(rawValue);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function readCliOptions(argv: string[]): RecommendationCalibrationOptions {
  const options: RecommendationCalibrationOptions = {};
  argv.forEach((arg) => {
    const [key, value] = arg.replace(/^--/, '').split('=');
    if (key === 'scenario' || key === 'scenarioId') options.scenarioId = value;
    if (key === 'runs') options.runs = numberArg(value, 100);
    if (key === 'seed' || key === 'baseSeed') options.baseSeed = numberArg(value, 730001);
    if (key === 'topN') options.topN = numberArg(value, 4);
    if (
      key === 'mode'
      || key === 'executionMode'
    ) {
      if (value === 'top1-only' || value === 'choose-one-from-top4' || value === 'execute-all-top4') {
        options.executionMode = value;
      } else {
        throw new Error(`Unknown recommendation calibration execution mode: ${value}`);
      }
    }
  });
  return options;
}

const entryPath = process.argv[1] ? resolve(process.argv[1]) : '';
if (entryPath === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(runRecommendationCalibration(readCliOptions(process.argv.slice(2))), null, 2));
}
