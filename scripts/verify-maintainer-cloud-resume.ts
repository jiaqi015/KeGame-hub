import assert from 'node:assert/strict';

import type { MaintainerCloudMeta } from '../src/selling-houses/application/cloudState.js';
import type { MaintainerRunRecord } from '../src/selling-houses/application/cloudSync.js';
import { loadPreferredMaintainerCloudRun } from '../src/selling-houses/application/cloudResume.js';

function buildRunRecord(overrides: Partial<MaintainerRunRecord> = {}): MaintainerRunRecord {
  const now = new Date().toISOString();
  return {
    runId: overrides.runId || 'run-default',
    userId: overrides.userId || 'user-default',
    playerName: overrides.playerName || '测试顾问',
    status: overrides.status || 'active',
    seasonId: overrides.seasonId || 'season-1',
    scenarioId: overrides.scenarioId ?? 'scenario-1',
    difficultyId: overrides.difficultyId ?? 'standard',
    worldId: overrides.worldId ?? 'world-1',
    worldVersion: overrides.worldVersion ?? 1,
    rngSeed: overrides.rngSeed ?? 123,
    schemaVersion: overrides.schemaVersion ?? 1,
    day: overrides.day ?? 1,
    cash: overrides.cash ?? 0,
    energy: overrides.energy ?? 10,
    auxiliaryStats: overrides.auxiliaryStats ?? {
      commission: 0,
      promotionBudget: 0,
      wordOfMouth: 0,
      soldCount: 0,
      withdrawnCount: 0,
    },
    score: overrides.score ?? 0,
    syncVersion: overrides.syncVersion ?? 1,
    saveData: overrides.saveData ?? ({} as MaintainerRunRecord['saveData']),
    dailyLogs: overrides.dailyLogs ?? [],
    startedAt: overrides.startedAt || now,
    finishedAt: overrides.finishedAt ?? null,
    lastPlayedAt: overrides.lastPlayedAt || now,
    clientUpdatedAt: overrides.clientUpdatedAt ?? now,
    updatedAt: overrides.updatedAt || now,
  };
}

{
  const requestedRunIds: string[] = [];
  const requestedListUserIds: string[] = [];
  const localMeta: MaintainerCloudMeta = {
    runId: 'run-local',
    syncVersion: 3,
    updatedAt: '2026-04-20T07:00:00.000Z',
  };
  const expected = buildRunRecord({
    runId: 'run-local',
    userId: 'acct-session',
    updatedAt: '2026-04-20T07:05:00.000Z',
    syncVersion: 4,
  });

  const result = await loadPreferredMaintainerCloudRun({
    userId: 'legacy-browser-user',
    localMeta,
    fetchRun: async (runId) => {
      requestedRunIds.push(runId);
      return expected;
    },
    listRuns: async (userId) => {
      requestedListUserIds.push(userId);
      return [];
    },
  });

  assert.equal(result?.run.runId, 'run-local', 'expected local meta run to be fetched first');
  assert.deepEqual(requestedRunIds, ['run-local']);
  assert.deepEqual(requestedListUserIds, []);
}

{
  const recent = buildRunRecord({
    runId: 'run-recent',
    updatedAt: '2026-04-20T09:00:00.000Z',
    syncVersion: 6,
  });
  const older = buildRunRecord({
    runId: 'run-older',
    updatedAt: '2026-04-19T09:00:00.000Z',
    syncVersion: 2,
  });
  const requestedRunIds: string[] = [];

  const result = await loadPreferredMaintainerCloudRun({
    userId: 'legacy-browser-user',
    localMeta: null,
    fetchRun: async (runId) => {
      requestedRunIds.push(runId);
      return runId === 'run-recent' ? recent : older;
    },
    listRuns: async (userId) => {
      assert.equal(userId, 'legacy-browser-user', 'expected bootstrap to list runs with local browser user id');
      return [older, recent];
    },
  });

  assert.equal(result?.run.runId, 'run-recent', 'expected latest updated run to be selected when local meta is missing');
  assert.equal(result?.meta.runId, 'run-recent');
  assert.equal(result?.meta.syncVersion, 6);
  assert.deepEqual(requestedRunIds, ['run-recent']);
}

{
  const fallback = buildRunRecord({
    runId: 'run-fallback',
    updatedAt: '2026-04-20T11:00:00.000Z',
    syncVersion: 8,
  });
  let listCalled = 0;

  const result = await loadPreferredMaintainerCloudRun({
    userId: 'legacy-browser-user',
    localMeta: {
      runId: 'missing-run',
      syncVersion: 2,
      updatedAt: '2026-04-19T12:00:00.000Z',
    },
    fetchRun: async (runId) => {
      if (runId === 'missing-run') {
        throw new Error('not found');
      }
      return fallback;
    },
    listRuns: async () => {
      listCalled += 1;
      return [fallback];
    },
  });

  assert.equal(listCalled, 1, 'expected stale local meta to fall back to list runs');
  assert.equal(result?.run.runId, 'run-fallback');
}

{
  const result = await loadPreferredMaintainerCloudRun({
    userId: 'legacy-browser-user',
    localMeta: null,
    fetchRun: async () => {
      throw new Error('should not fetch when no runs exist');
    },
    listRuns: async () => [],
  });

  assert.equal(result, null, 'expected null when cloud has no runs');
}

console.log('maintainer cloud resume verification passed');
