import { beforeAll, describe, expect, it } from 'vitest';
import { LocalAdversarialSelfPlayLab } from '../../application/localAdversarialSelfPlayLab.js';

const PUBLISHED_EVALUATION_SCENARIOS = [
  { difficultyId: 'warmup', scenarioId: 'warmup-clean-handoff', seedBase: 0 },
  { difficultyId: 'easy', scenarioId: 'easy-fresh-start', seedBase: 10000 },
  { difficultyId: 'standard', scenarioId: 'standard-window-chain', seedBase: 20000 },
  { difficultyId: 'advanced', scenarioId: 'advanced-window-crossfire', seedBase: 30000 },
  { difficultyId: 'hard', scenarioId: 'hard-market-shock', seedBase: 40000 },
  { difficultyId: 'extreme', scenarioId: 'extreme-last-stand', seedBase: 50000 },
] as const;

const SMOKE_EVALUATION_SEEDS: Record<string, number[]> = {
  warmup: [101, 202, 303, 404, 505, 606, 707, 808],
  easy: [1101, 1202, 1303, 1404, 1505, 1606, 1707, 1808],
  standard: [2101, 2202, 2303, 2404, 2505, 2606, 2707, 2808],
  advanced: [3101, 3202, 3303, 3404, 3505, 3606, 3707, 3808],
  hard: [4101, 4202, 4303, 4404, 4505, 4606, 4707, 4808],
  extreme: [5101, 5202, 5303, 5404, 5505, 5606, 5707],
};

function runPublishedDifficultyWindow(seedCount = 24) {
  return PUBLISHED_EVALUATION_SCENARIOS.map((scenario) => {
    const seeds = Array.from({ length: seedCount }, (_, index) => scenario.seedBase + index + 1);
    const report = new LocalAdversarialSelfPlayLab({
      scenarioId: scenario.scenarioId,
      seeds,
    }).runBatch();

    return {
      difficultyId: scenario.difficultyId,
      averageEvaluationScore: report.averageEvaluationScore,
      rivalLossRunRate: report.rivalLossRunRate,
      coreBadRunRate: report.coreBadRunRate,
      averageEndingGood: report.averageEndingGood,
    };
  });
}

function runSmokeEvaluationWindow() {
  return PUBLISHED_EVALUATION_SCENARIOS.map((scenario) => {
    const report = new LocalAdversarialSelfPlayLab({
      scenarioId: scenario.scenarioId,
      seeds: SMOKE_EVALUATION_SEEDS[scenario.difficultyId],
    }).runBatch();

    return {
      difficultyId: scenario.difficultyId,
      averageEvaluationScore: report.averageEvaluationScore,
      rivalLossRunRate: report.rivalLossRunRate,
      coreBadRunRate: report.coreBadRunRate,
      averageEndingGood: report.averageEndingGood,
      findingTitles: report.findings.map((finding) => finding.title),
    };
  });
}

describe('published difficulty balance contract', () => {
  let reports: ReturnType<typeof runPublishedDifficultyWindow>;
  let smokeReports: ReturnType<typeof runSmokeEvaluationWindow>;

  beforeAll(() => {
    reports = runPublishedDifficultyWindow();
    smokeReports = runSmokeEvaluationWindow();
  }, 30_000);

  it('keeps self-play scores descending across the published difficulty ladder', () => {
    const scores = Object.fromEntries(reports.map((report) => [
      report.difficultyId,
      report.averageEvaluationScore,
    ]));

    expect(scores.warmup).toBeGreaterThanOrEqual(scores.easy);
    expect(scores.easy).toBeGreaterThan(scores.standard);
    expect(scores.standard).toBeGreaterThanOrEqual(scores.advanced);
    expect(scores.advanced).toBeGreaterThan(scores.hard);
    expect(scores.hard).toBeGreaterThan(scores.extreme);
  });

  it('keeps rival loss and good endings within each difficulty band', () => {
    const byDifficulty = Object.fromEntries(reports.map((report) => [report.difficultyId, report]));

    expect(byDifficulty.warmup.rivalLossRunRate).toBeLessThanOrEqual(5);
    expect(byDifficulty.easy.rivalLossRunRate).toBeLessThanOrEqual(5);
    expect(byDifficulty.standard.rivalLossRunRate).toBeLessThanOrEqual(45);
    expect(byDifficulty.standard.rivalLossRunRate).toBeLessThanOrEqual(byDifficulty.advanced.rivalLossRunRate);
    expect(byDifficulty.hard.rivalLossRunRate).toBeLessThanOrEqual(55);
    expect(byDifficulty.extreme.rivalLossRunRate).toBeLessThanOrEqual(60);

    reports.forEach((report) => {
      expect(report.coreBadRunRate).toBeLessThanOrEqual(35);
      expect(report.averageEndingGood).toBeGreaterThan(0);
    });
  });

  it('keeps the original 47-game smoke evaluation monotonic', () => {
    const scores = Object.fromEntries(smokeReports.map((report) => [
      report.difficultyId,
      report.averageEvaluationScore,
    ]));

    expect(scores.warmup).toBeGreaterThanOrEqual(scores.easy);
    expect(scores.easy).toBeGreaterThan(scores.standard);
    expect(scores.standard).toBeGreaterThanOrEqual(scores.advanced);
    expect(scores.advanced).toBeGreaterThan(scores.hard);
    expect(scores.hard).toBeGreaterThan(scores.extreme);

    expect(smokeReports.every((report) => report.averageEndingGood > 0)).toBe(true);
    expect(smokeReports.every((report) => report.coreBadRunRate <= 35)).toBe(true);
  });

  it('keeps the original 47-game smoke evaluation free of balance findings', () => {
    expect(smokeReports.flatMap((report) => (
      report.findingTitles.map((title) => `${report.difficultyId}: ${title}`)
    ))).toEqual([]);
  });
});
