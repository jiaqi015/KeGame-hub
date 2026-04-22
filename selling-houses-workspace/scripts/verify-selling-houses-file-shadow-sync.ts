import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

import { getRuntimeTempDir } from '../lib/runtimeTemp.js';
import { createInitialState } from '../src/selling-houses/application/gameState.js';
import { getScenarioSnapshotById } from '../src/selling-houses/domain/scenarioCatalog.js';
import { FileMaintainerRunRepository } from '../src/selling-houses/infrastructure/fileMaintainerRunRepository.js';

async function createFixtureRun(repository: FileMaintainerRunRepository) {
  const snapshot = getScenarioSnapshotById('standard-window-chain');
  if (!snapshot) {
    throw new Error('Missing builtin scenario for file shadow verification');
  }

  const state = createInitialState(snapshot, 20260418);
  return repository.createRun({
    runId: 'verify-file-shadow-run',
    runOwnerId: 'verify-file-shadow-user',
    playerName: '文件影子校验',
    seasonId: 'season-1',
    state,
  });
}

async function main() {
  const inputRunId = process.argv[2];
  const inputUserId = process.argv[3];
  const usingFixture = !inputRunId || !inputUserId;
  const baseDir = usingFixture
    ? getRuntimeTempDir('selling-houses-runtime', 'verify-file-shadow')
    : undefined;

  if (usingFixture && baseDir) {
    await fs.rm(baseDir, { recursive: true, force: true });
  }

  const repository = new FileMaintainerRunRepository(baseDir);
  const fixture = usingFixture ? await createFixtureRun(repository) : null;
  const runId = inputRunId || fixture?.runId;
  const userId = inputUserId || fixture?.userId;

  if (!runId || !userId) {
    throw new Error('Usage: tsx scripts/verify-selling-houses-file-shadow-sync.ts <runId> <userId>');
  }

  const summary = await repository.verifyShadowSync(runId, userId);

  assert.deepEqual(
    summary.actual,
    summary.expected,
    `file shadow summary mismatch for run ${runId}`,
  );

  console.log('selling-houses file shadow sync verification passed');
  console.log(JSON.stringify(summary, null, 2));

  if (usingFixture && baseDir) {
    await fs.rm(baseDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
