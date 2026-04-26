import type { DifficultyId } from '../src/selling-houses/domain/models.js';

export type OutcomeTargetMetric = 'averageDeals' | 'pAtLeastOneSelfClose21d' | 'averageRivalDeals';
export type OutcomeTargetStatus = 'PASS' | 'WATCH' | 'FAIL';

export interface OutcomeTargetRange {
  min: number;
  max: number;
}

export interface OutcomeTargetCheck {
  difficulty: DifficultyId;
  metric: OutcomeTargetMetric;
  actual: number;
  target: OutcomeTargetRange;
  status: OutcomeTargetStatus;
  note: string;
}

export type OutcomeTargetSummary = Record<OutcomeTargetMetric, number>;

export const OUTCOME_TARGET_STATUS_VALUES: readonly OutcomeTargetStatus[] = ['PASS', 'WATCH', 'FAIL'];

export const OUTCOME_TARGETS: Record<DifficultyId, Record<OutcomeTargetMetric, OutcomeTargetRange>> = {
  warmup: {
    averageDeals: { min: 1.6, max: 2.2 },
    pAtLeastOneSelfClose21d: { min: 95, max: 100 },
    averageRivalDeals: { min: 0, max: 0.8 },
  },
  easy: {
    averageDeals: { min: 2.0, max: 2.7 },
    pAtLeastOneSelfClose21d: { min: 95, max: 100 },
    averageRivalDeals: { min: 0, max: 0.9 },
  },
  standard: {
    averageDeals: { min: 1.05, max: 1.45 },
    pAtLeastOneSelfClose21d: { min: 85, max: 100 },
    averageRivalDeals: { min: 0.8, max: 2.6 },
  },
  advanced: {
    averageDeals: { min: 0.85, max: 1.25 },
    pAtLeastOneSelfClose21d: { min: 55, max: 85 },
    averageRivalDeals: { min: 1.2, max: 3.0 },
  },
  hard: {
    averageDeals: { min: 0.45, max: 0.85 },
    pAtLeastOneSelfClose21d: { min: 40, max: 70 },
    averageRivalDeals: { min: 1.8, max: 3.5 },
  },
  extreme: {
    averageDeals: { min: 0.25, max: 0.5 },
    pAtLeastOneSelfClose21d: { min: 20, max: 45 },
    averageRivalDeals: { min: 2.0, max: 3.8 },
  },
};

export const OUTCOME_TARGET_METRICS: OutcomeTargetMetric[] = [
  'averageDeals',
  'pAtLeastOneSelfClose21d',
  'averageRivalDeals',
];

export function evaluateOutcomeTarget(
  difficulty: DifficultyId,
  metric: OutcomeTargetMetric,
  actual: number,
  summary?: OutcomeTargetSummary,
): OutcomeTargetCheck {
  const target = OUTCOME_TARGETS[difficulty][metric];
  const baseStatus = classifyTargetStatus(actual, target, metric);
  const isStandardOverStableRisk = difficulty === 'standard'
    && metric === 'pAtLeastOneSelfClose21d'
    && actual >= 100;
  const isExtremeOverHardRisk = difficulty === 'extreme'
    && summary !== undefined
    && summary.averageDeals < OUTCOME_TARGETS.extreme.averageDeals.min
    && summary.pAtLeastOneSelfClose21d < OUTCOME_TARGETS.extreme.pAtLeastOneSelfClose21d.min
    && (metric === 'averageDeals' || metric === 'pAtLeastOneSelfClose21d');
  const status: OutcomeTargetStatus = isExtremeOverHardRisk
    ? 'FAIL'
    : isStandardOverStableRisk && baseStatus === 'PASS'
    ? 'WATCH'
    : baseStatus;

  return {
    difficulty,
    metric,
    actual,
    target,
    status,
    note: buildTargetNote(status, isStandardOverStableRisk, isExtremeOverHardRisk, actual, target),
  };
}

export function evaluateOutcomeTargets(
  difficulty: DifficultyId,
  summary: OutcomeTargetSummary,
): OutcomeTargetCheck[] {
  return OUTCOME_TARGET_METRICS.map((metric) => evaluateOutcomeTarget(difficulty, metric, summary[metric], summary));
}

export function formatOutcomeTargetRange(range: OutcomeTargetRange) {
  return `${range.min}-${range.max}`;
}

export function summarizeOutcomeTargetStatus(checks: OutcomeTargetCheck[]): OutcomeTargetStatus {
  if (checks.some((entry) => entry.status === 'FAIL')) {
    return 'FAIL';
  }
  if (checks.some((entry) => entry.status === 'WATCH')) {
    return 'WATCH';
  }
  return 'PASS';
}

function classifyTargetStatus(
  actual: number,
  target: OutcomeTargetRange,
  metric: OutcomeTargetMetric,
): OutcomeTargetStatus {
  if (actual >= target.min && actual <= target.max) {
    return 'PASS';
  }

  const width = Math.max(0.01, target.max - target.min);
  const gap = actual < target.min ? target.min - actual : actual - target.max;
  const failGap = Math.max(width * 0.2, metricMinimumFailGap(metric));
  return gap >= failGap ? 'FAIL' : 'WATCH';
}

function metricMinimumFailGap(metric: OutcomeTargetMetric) {
  if (metric === 'pAtLeastOneSelfClose21d') {
    return 5;
  }
  if (metric === 'averageRivalDeals') {
    return 0.25;
  }
  return 0.07;
}

function buildTargetNote(
  status: OutcomeTargetStatus,
  isStandardOverStableRisk: boolean,
  isExtremeOverHardRisk: boolean,
  actual: number,
  target: OutcomeTargetRange,
) {
  if (isStandardOverStableRisk) {
    return '过稳风险';
  }
  if (isExtremeOverHardRisk) {
    return '过硬风险';
  }
  if (status === 'PASS') {
    return '目标内';
  }
  return actual < target.min ? '偏低' : '偏高';
}
