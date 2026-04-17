import assert from 'node:assert/strict';

import { LocalAdversarialSelfPlayArena, buildSelfPlayRunSnapshot } from '../src/selling-houses/application/localAdversarialSelfPlayArena';
import { generateScenarioBundle } from '../src/selling-houses/domain/scenarioCatalog';
import type { DifficultyId } from '../src/selling-houses/domain/models';

const DIFFICULTIES: DifficultyId[] = ['warmup', 'easy', 'standard', 'advanced', 'hard', 'extreme'];
const SEEDS = [
  101,
  202,
  303,
  404,
  505,
  606,
  707,
  808,
  909,
  1001,
  1102,
  1203,
  1304,
  1405,
  1506,
  1607,
  1708,
  1809,
  1910,
  2011,
];

interface DifficultyFullRunSummary {
  difficultyId: DifficultyId;
  runCount: number;
  averageScore: number;
  averageGoodEnding: number;
  averageBadEnding: number;
  rivalLossRunRate: number;
  averageDailyEventCount: number;
  averageInboundCount: number;
  averageRivalListingCount: number;
}

const summaries: DifficultyFullRunSummary[] = [];

for (const difficultyId of DIFFICULTIES) {
  const runs = SEEDS.map((seed) => {
    const bundle = generateScenarioBundle({ difficultyId, seed });
    const arena = new LocalAdversarialSelfPlayArena({
      snapshot: bundle.snapshot,
      seed,
    });
    const report = arena.playOneGame();
    const snapshot = buildSelfPlayRunSnapshot(report.finalResult);
    return {
      score: snapshot.score,
      good: snapshot.endingGood,
      bad: snapshot.endingBad,
      lostToRival: snapshot.lostToRivalCount,
      shadowStats: report.shadowStats,
    };
  });

  const summary = {
    difficultyId,
    runCount: runs.length,
    averageScore: average(runs.map((entry) => entry.score)),
    averageGoodEnding: average(runs.map((entry) => entry.good)),
    averageBadEnding: average(runs.map((entry) => entry.bad)),
    rivalLossRunRate: round((runs.filter((entry) => entry.lostToRival > 0).length / runs.length) * 100),
    averageDailyEventCount: average(runs.map((entry) => entry.shadowStats.dailyEventCount)),
    averageInboundCount: average(runs.map((entry) => entry.shadowStats.inboundCount)),
    averageRivalListingCount: average(runs.map((entry) => entry.shadowStats.totalRivalListings)),
  } satisfies DifficultyFullRunSummary;

  summaries.push(summary);
}

const warmup = summaries.find((entry) => entry.difficultyId === 'warmup');
const easy = summaries.find((entry) => entry.difficultyId === 'easy');
const standard = summaries.find((entry) => entry.difficultyId === 'standard');
const advanced = summaries.find((entry) => entry.difficultyId === 'advanced');
const hard = summaries.find((entry) => entry.difficultyId === 'hard');
const extreme = summaries.find((entry) => entry.difficultyId === 'extreme');

assert.ok(warmup, 'Expected warmup summary');
assert.ok(easy, 'Expected easy summary');
assert.ok(standard, 'Expected standard summary');
assert.ok(advanced, 'Expected advanced summary');
assert.ok(hard, 'Expected hard summary');
assert.ok(extreme, 'Expected extreme summary');
assert.ok((warmup?.rivalLossRunRate || 0) <= 40, `Warmup rival loss rate should stay low, got ${warmup?.rivalLossRunRate}`);
assert.ok((standard?.rivalLossRunRate || 0) <= 80, `Standard rival loss rate should not be guaranteed, got ${standard?.rivalLossRunRate}`);
assert.ok((hard?.averageBadEnding || 0) >= (warmup?.averageBadEnding || 0), 'Hard should not be softer than warmup on bad endings');
assert.ok((easy?.averageScore || 0) >= (standard?.averageScore || 0), 'Easy should not score below standard on average');
assert.ok((standard?.averageScore || 0) >= (advanced?.averageScore || 0), 'Standard should not score below advanced on average');
assert.ok((advanced?.averageScore || 0) >= (hard?.averageScore || 0), 'Advanced should not score below hard on average');
assert.ok((hard?.averageScore || 0) >= (extreme?.averageScore || 0), 'Hard should not score below extreme on average');
assert.ok((extreme?.averageBadEnding || 0) >= (hard?.averageBadEnding || 0), 'Extreme should have at least hard-level bad endings');

console.log('generated selling-houses full-run verification passed');
console.log(JSON.stringify(summaries, null, 2));

function average(values: number[]) {
  if (!values.length) return 0;
  return round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function round(value: number) {
  return Math.round(value * 10) / 10;
}
