import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

import { getRuntimeTempDir } from '../lib/runtimeTemp.js';
import { createInitialState } from '../src/selling-houses/application/gameState.js';
import { MaintainerSyncConflictError } from '../src/selling-houses/application/maintainerSyncConflictError.js';
import { applyAuxiliaryStats } from '../src/selling-houses/domain/runtimeStats.js';
import { getScenarioSnapshotById } from '../src/selling-houses/domain/scenarioCatalog.js';
import { FileMaintainerRunRepository } from '../src/selling-houses/infrastructure/fileMaintainerRunRepository.js';

const baseDir = getRuntimeTempDir('selling-houses-runtime', 'verify-file-runs');
await fs.rm(baseDir, { recursive: true, force: true });

const snapshot = getScenarioSnapshotById('standard-window-chain');
if (!snapshot) {
  throw new Error('Missing builtin scenario for file repository verification');
}

const repository = new FileMaintainerRunRepository(baseDir);
const initialState = createInitialState(snapshot, 20260418);

const created = await repository.createRun({
  runId: 'verify-run-1',
  userId: 'verify-user',
  playerName: '验证维护人',
  seasonId: 'season-1',
  state: initialState,
});

assert.equal(created.syncVersion, 1, 'Expected createRun to start at syncVersion 1');
assert.equal(created.status, 'active', 'Expected initial run status to be active');

const fetched = await repository.getRun(created.runId, created.userId);
assert.ok(fetched, 'Expected getRun to return saved record');
assert.equal(fetched?.runId, created.runId, 'Expected getRun to return matching run');

const updatedState = structuredClone(created.saveData);
updatedState.day = 3;
applyAuxiliaryStats(updatedState, {
  promotionBudget: updatedState.auxiliaryStats.promotionBudget + 1200,
});
updatedState.energy = Math.max(0, updatedState.energy - 2);
updatedState.gameOver = true;
updatedState.finalResult = {
  title: '验证通关',
  summary: '文件仓储路径可用。',
  reason: '验证 fallback 仓储写入和读取逻辑。',
  score: 88,
  goalContext: 'ability',
  dimensions: {
    ability: { score: 32, maxScore: 35, label: '控盘力', summary: '验证用' },
    defense: { score: 28, maxScore: 35, label: '守盘力', summary: '验证用' },
    satisfaction: { score: 28, maxScore: 30, label: '业主满意度', summary: '验证用' },
  },
  stats: [
    { label: '验证', value: '通过' },
  ],
  grade: 'A',
  targetScore: 75,
  endingStats: {
    good: 1,
    neutral: 0,
    bad: 0,
    coreBadCount: 0,
    importantBadCount: 0,
    weightedGood: 1,
    weightedBad: 0,
  },
  scoreBreakdown: [
    { label: '节奏', value: 30, maxValue: 35, summary: '验证用' },
  ],
  highlights: ['文件仓储可写。'],
  improvements: ['后续可继续补结构化影子索引。'],
  promotionNotes: [],
  coachNotes: [],
  nextRunAdvice: ['继续验证无库模式下的行为一致性。'],
  customerReview: {
    engaged: 1,
    comparing: 0,
    atRisk: 0,
    rivalPulled: 0,
    strongestCaseTitle: null,
    mostComparedCaseTitle: null,
    mostAtRiskCaseTitle: null,
    summary: '验证客户复盘结构可写入。',
    notes: ['验证用客户复盘。'],
  },
  caseResults: [],
};

const saved = await repository.saveRun({
  runId: created.runId,
  userId: created.userId,
  playerName: created.playerName,
  seasonId: created.seasonId,
  state: updatedState,
  expectedSyncVersion: created.syncVersion,
});

assert.equal(saved.syncVersion, 2, 'Expected saveRun to increment syncVersion');
assert.equal(saved.status, 'finished', 'Expected finished state to be persisted');
assert.equal(saved.score, 88, 'Expected final score to be derived');

const runs = await repository.listRuns(created.userId, 8);
assert.equal(runs.length, 1, 'Expected listRuns to return the saved run');
assert.equal(runs[0]?.syncVersion, 2, 'Expected listRuns to return latest sync version');

const leaderboard = await repository.listLeaderboard('season-1', 10);
assert.equal(leaderboard.length, 1, 'Expected finished run to enter leaderboard');
assert.equal(leaderboard[0]?.runId, created.runId, 'Expected leaderboard to reference saved run');
assert.equal(leaderboard[0]?.score, 88, 'Expected leaderboard score to match final score');

const verifiedBeforeRebuild = await repository.verifyShadowSync(created.runId, created.userId);
assert.deepEqual(
  verifiedBeforeRebuild.actual,
  verifiedBeforeRebuild.expected,
  'Expected initial file shadow summary to match derived summary',
);

await fs.rm(path.join(baseDir, 'shadow-summaries', `${created.runId}.json`), { force: true });

const verifiedAfterRemoval = await repository.verifyShadowSync(created.runId, created.userId);
assert.notDeepEqual(
  verifiedAfterRemoval.actual,
  verifiedAfterRemoval.expected,
  'Expected missing file shadow summary to be detectable',
);

const rebuilt = await repository.rebuildShadowTables(created.runId, created.userId);
assert.deepEqual(
  rebuilt.actual,
  rebuilt.expected,
  'Expected rebuildShadowTables to restore file shadow summary',
);

let conflictCaught = false;
try {
  await repository.saveRun({
    runId: created.runId,
    userId: created.userId,
    playerName: created.playerName,
    seasonId: created.seasonId,
    state: updatedState,
    expectedSyncVersion: 1,
  });
} catch (error) {
  conflictCaught = error instanceof MaintainerSyncConflictError;
}

assert.equal(conflictCaught, true, 'Expected stale save to throw MaintainerSyncConflictError');

console.log('selling-houses file repository verification passed');
