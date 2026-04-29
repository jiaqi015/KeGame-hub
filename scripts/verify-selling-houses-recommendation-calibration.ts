import assert from 'node:assert/strict';

import { runRecommendationCalibration } from './run-selling-houses-recommendation-calibration.js';

const result = runRecommendationCalibration({
  scenarioId: 'standard-window-chain',
  runs: 3,
  baseSeed: 730001,
});

assert.equal(result.scenario, 'standard-window-chain', 'Expected calibration to record the scenario id');
assert.equal(result.runs, 3, 'Expected calibration to respect the requested run count');
assert.equal(result.seeds, '730001..730003', 'Expected calibration to record the seed range');
assert.equal(result.executionMode, 'choose-one-from-top4', 'Expected calibration default to choose one Top4 item, not execute all Top4');
assert.ok(result.decisionPoints > 0, 'Expected calibration to visit recommendation decision points');
assert.ok(result.top1ExecutionRatePct >= 0 && result.top1ExecutionRatePct <= 100, 'Expected top1 execution rate to be a percentage');
assert.equal(result.failedTop1, 0, 'Expected recommendation Top1 to stay executable in the calibration harness');
assert.ok(
  result.qualityStatus === 'healthy' || result.qualityStatus === 'needs-tuning',
  'Expected calibration to report an explicit quality status',
);
assert.equal(
  result.qualityStatus,
  result.qualityWarnings.length > 0 ? 'needs-tuning' : 'healthy',
  'Expected qualityStatus to reflect qualityWarnings instead of hiding tuning risk',
);
assert.ok(
  result.qualityStatus === 'needs-tuning' || result.averageScore >= 50,
  'Expected low-score runs to be marked as tuning risk',
);
assert.ok(
  result.qualityStatus === 'needs-tuning' || result.coreBadRunRatePct <= 35,
  'Expected high core-bad rates to be marked as tuning risk',
);
assert.ok(Object.keys(result.top1ActionDistributionPct).length > 0, 'Expected calibration to report action distribution');
assert.ok(Object.keys(result.top1PhaseDistributionPct).length > 0, 'Expected calibration to report phase distribution');

const top1OnlyResult = runRecommendationCalibration({
  scenarioId: 'standard-window-chain',
  runs: 1,
  baseSeed: 730001,
  executionMode: 'top1-only',
});
assert.equal(top1OnlyResult.executionMode, 'top1-only', 'Expected calibration to support top1-only execution');
assert.equal(top1OnlyResult.failedTop1, 0, 'Expected top1-only calibration to keep Top1 executable');

const executeAllResult = runRecommendationCalibration({
  scenarioId: 'standard-window-chain',
  runs: 1,
  baseSeed: 730001,
  executionMode: 'execute-all-top4',
});
assert.equal(executeAllResult.executionMode, 'execute-all-top4', 'Expected calibration to support explicit execute-all-top4 mode');

console.log('selling-houses recommendation calibration verification passed');
