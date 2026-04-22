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
  runOwnerId: 'verify-user',
  accountId: 'acct-unified-owner',
  playerProfileId: 'profile_selling_houses_acct_unified_owner',
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
  soldCount: 0,
});
updatedState.energy = Math.max(0, updatedState.energy - 2);
updatedState.closedDeals = [{
  dealId: 'deal-file-repo-1',
  caseId: updatedState.cases[0]?.id || 'case-1',
  customerId: 'customer-file-repo-1',
  sourceRelationId: 'relation-file-repo-1',
  opportunityId: 'relation-file-repo-1',
  dayIndex: updatedState.day,
  day: updatedState.day,
  closedAt: new Date().toISOString(),
  dealType: 'self_closed',
  dealPrice: 888,
  price: 888,
  closeReadiness: 93,
  closeProbability: 87,
  blockingReasons: [],
  supportingReasons: ['验证 file repository 成交桥接'],
}];
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
  runOwnerId: created.userId,
  accountId: 'acct-unified-owner',
  playerProfileId: 'profile_selling_houses_acct_unified_owner',
  playerName: created.playerName,
  seasonId: created.seasonId,
  state: updatedState,
  expectedSyncVersion: created.syncVersion,
});

assert.equal(saved.syncVersion, 2, 'Expected saveRun to increment syncVersion');
assert.equal(saved.status, 'finished', 'Expected finished state to be persisted');
assert.equal(saved.score, 88, 'Expected final score to be derived');
assert.equal(saved.auxiliaryStats.soldCount, 1, 'Expected repository save to prefer formal closed deals');

const runs = await repository.listRuns(created.userId, 8);
assert.equal(runs.length, 1, 'Expected listRuns to return the saved run');
assert.equal(runs[0]?.syncVersion, 2, 'Expected listRuns to return latest sync version');
assert.equal(runs[0]?.auxiliaryStats.soldCount, 1, 'Expected listRuns to expose formal closed deal count');

const leaderboard = await repository.listLeaderboard('season-1', 10);
assert.equal(leaderboard.length, 1, 'Expected finished run to enter leaderboard');
assert.equal(leaderboard[0]?.runId, created.runId, 'Expected leaderboard to reference saved run');
assert.equal(leaderboard[0]?.score, 88, 'Expected leaderboard score to match final score');
assert.equal(leaderboard[0]?.finalStats.auxiliaryStats.soldCount, 1, 'Expected leaderboard detail to expose formal closed deal count');

const secondRunState = createInitialState(snapshot, 20260419);
secondRunState.day = 4;
secondRunState.gameOver = true;
secondRunState.finalResult = {
  title: '第二局验证通关',
  summary: '同一账号跨 legacy userId 的排行榜聚合验证。',
  reason: '验证 accountId 优先聚合。',
  score: 66,
  goalContext: 'ability',
  dimensions: {
    ability: { score: 24, maxScore: 35, label: '控盘力', summary: '验证用' },
    defense: { score: 22, maxScore: 35, label: '守盘力', summary: '验证用' },
    satisfaction: { score: 20, maxScore: 30, label: '业主满意度', summary: '验证用' },
  },
  stats: [{ label: '验证', value: '账号聚合' }],
  grade: 'B',
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
  scoreBreakdown: [{ label: '节奏', value: 22, maxValue: 35, summary: '验证用' }],
  highlights: ['第二局用于聚合验证。'],
  improvements: [],
  promotionNotes: [],
  coachNotes: [],
  nextRunAdvice: [],
  customerReview: {
    engaged: 0,
    comparing: 0,
    atRisk: 0,
    rivalPulled: 0,
    strongestCaseTitle: null,
    mostComparedCaseTitle: null,
    mostAtRiskCaseTitle: null,
    summary: '验证聚合路径。',
    notes: [],
  },
  caseResults: [],
};

await repository.createRun({
  runId: 'verify-run-2',
  runOwnerId: 'legacy-device-user-2',
  accountId: 'acct-unified-owner',
  playerProfileId: 'profile_selling_houses_acct_unified_owner',
  playerName: '验证维护人',
  seasonId: 'season-1',
  state: secondRunState,
});

const detail = await repository.getLeaderboardDetail('season-1', 10);
assert.equal(
  detail.totalScore.length,
  1,
  'Expected same accountId across different legacy userIds to collapse into one leaderboard owner',
);
assert.equal(
  detail.totalScore[0]?.accountId,
  'acct-unified-owner',
  'Expected collapsed leaderboard owner to keep the canonical accountId',
);
assert.equal(
  detail.totalScore[0]?.value,
  154,
  'Expected total-score leaderboard to sum both runs for the same account owner',
);

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
    runOwnerId: created.userId,
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
