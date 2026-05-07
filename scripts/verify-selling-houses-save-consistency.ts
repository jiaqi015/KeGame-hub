import assert from 'node:assert/strict';

import { createInitialState, updateDerivedState } from '../src/selling-houses/application/gameState.js';
import { advanceGameDaysWithSummary, executeGameAction } from '../src/selling-houses/application/gameTransitions.js';
import {
  buildKeepLocalWarning,
  compareGameProgress,
  markHydratedState,
  markLocalStateChange,
  shouldHydrateRemote,
} from '../src/selling-houses/application/saveConsistency.js';
import { seedInitialOpportunities } from '../src/selling-houses/domain/engine.js';
import { getScenarioSnapshotById } from '../src/selling-houses/domain/scenarioCatalog.js';
import { addDays } from '../src/selling-houses/domain/utils.js';
import type { GameState } from '../src/selling-houses/domain/models.js';

function createWorld(seed: number) {
  const snapshot = getScenarioSnapshotById('standard-window-chain');
  assert.ok(snapshot, 'Expected standard-window-chain scenario to exist');

  const world = createInitialState(snapshot, seed);
  seedInitialOpportunities(world);
  updateDerivedState(world);
  return world;
}

function withSaveFields(state: GameState, input: Partial<Pick<GameState, 'runId' | 'localRevision' | 'clientUpdatedAt' | 'day' | 'currentDate' | 'currentReport'>>) {
  return {
    ...state,
    ...input,
  };
}

{
  const world = createWorld(20260430);
  assert.equal(world.localRevision, 0, 'Expected new game local revision to start at zero');
  assert.ok(world.runId.startsWith('selling-houses-'), 'Expected new game to have a client run id');

  const changed = markLocalStateChange(world);
  assert.equal(changed.localRevision, world.localRevision + 1, 'Expected local state change to increment revision');
  assert.notEqual(changed.clientUpdatedAt, '', 'Expected local state change to stamp clientUpdatedAt');
}

{
  const world = createWorld(20260501);
  const summary = advanceGameDaysWithSummary(world, 1);
  const advanced = markLocalStateChange(summary.nextState);

  assert.equal(advanced.day, world.day + 1, 'Expected advance to move to next day');
  assert.equal(advanced.currentDate, addDays(world.currentDate, 1), 'Expected advance to move date');
  assert.equal(advanced.localRevision, world.localRevision + 1, 'Expected advance wrapper to increment revision');
}

{
  const world = createWorld(20260502);
  const summary = advanceGameDaysWithSummary(world, 1);
  const advanced = markLocalStateChange(summary.nextState);
  assert.ok(advanced.currentReport, 'Expected daily advance to create report before clear');

  const cleared = markLocalStateChange({ ...advanced, currentReport: null });
  assert.equal(cleared.currentReport, null, 'Expected clear report to remove report');
  assert.equal(cleared.localRevision, advanced.localRevision + 1, 'Expected clear report to increment revision');
}

{
  const world = createWorld(202605025);
  const targetCase = world.cases[0];
  assert.ok(targetCase, 'Expected case for action revision verification');

  const result = executeGameAction(world, 'first-visit', targetCase.id);
  assert.equal(result.success, true, 'Expected executable action for revision verification');

  const changed = markLocalStateChange(result.nextState);
  assert.equal(changed.localRevision, world.localRevision + 1, 'Expected action execution wrapper to increment revision');
  assert.ok(changed.energy < world.energy, 'Expected action execution to consume energy');
}

{
  const world = createWorld(20260503);
  const dayTwo = markLocalStateChange(advanceGameDaysWithSummary(world, 1).nextState);
  const localAfterAction = markLocalStateChange({
    ...dayTwo,
    energy: Math.max(0, dayTwo.energy - 1),
    currentReport: null,
  });
  const olderRemoteSameDay = markHydratedState(withSaveFields(localAfterAction, {
    localRevision: localAfterAction.localRevision - 1,
    clientUpdatedAt: '2026-01-01T00:00:00.000Z',
    currentReport: dayTwo.currentReport,
  }));

  const comparison = compareGameProgress(localAfterAction, olderRemoteSameDay);
  assert.equal(comparison.decision, 'local_newer', 'Expected same-day older remote revision to keep local');
  assert.equal(shouldHydrateRemote(comparison), false, 'Expected older remote not to hydrate');
  assert.ok(buildKeepLocalWarning(comparison)?.includes('本地'), 'Expected local-newer warning');
}

{
  const world = createWorld(20260504);
  const local = markLocalStateChange(world);
  const remote = markHydratedState(withSaveFields(local, {
    day: local.day + 1,
    currentDate: addDays(local.currentDate, 1),
    localRevision: 0,
  }));

  const comparison = compareGameProgress(local, remote);
  assert.equal(comparison.decision, 'remote_newer', 'Expected remote higher day to hydrate');
  assert.equal(shouldHydrateRemote(comparison), true, 'Expected remote newer to hydrate');
}

{
  const world = createWorld(20260505);
  const local = markLocalStateChange(world);
  const remote = markHydratedState(withSaveFields(local, {
    runId: `${local.runId}-other`,
    day: local.day + 1,
    currentDate: addDays(local.currentDate, 1),
    localRevision: local.localRevision + 10,
  }));

  const comparison = compareGameProgress(local, remote);
  assert.equal(comparison.decision, 'conflict', 'Expected different run ids to conflict');
  assert.equal(shouldHydrateRemote(comparison), false, 'Expected run-id conflict not to hydrate silently');
  assert.equal(buildKeepLocalWarning(comparison), '检测到云端进度冲突，已保留本地进度。', 'Expected conflict to default to local warning');
}

{
  const world = createWorld(20260506);
  const local = markLocalStateChange(world);
  const remote = markHydratedState(withSaveFields(local, {
    localRevision: local.localRevision,
    clientUpdatedAt: local.clientUpdatedAt,
  }));

  const comparison = compareGameProgress(local, remote);
  assert.equal(comparison.decision, 'same', 'Expected identical revision and timestamp to compare as same');
  assert.equal(shouldHydrateRemote(comparison), false, 'Expected same state not to force hydration');
}

console.log('selling-houses save consistency verification passed');
