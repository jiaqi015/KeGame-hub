import assert from 'node:assert/strict';

import { createInitialState, updateDerivedState } from '../src/selling-houses/application/gameState.js';
import { advanceOneDay, seedInitialOpportunities } from '../src/selling-houses/domain/engine.js';
import { getScenarioSnapshotById } from '../src/selling-houses/domain/scenarioCatalog.js';

const snapshot = getScenarioSnapshotById('standard-window-chain');
assert.ok(snapshot, 'Expected standard-window-chain scenario to exist');

const world = createInitialState(snapshot, 20260421);
seedInitialOpportunities(world);
updateDerivedState(world);

const firstTick = advanceOneDay(world);
assert.ok(firstTick?.report, 'Expected first day settlement to create a daily summary');
assert.ok(world.currentReport, 'Expected world state to retain daily summary after ordinary settlement');
assert.equal(world.gameOver, false, 'Expected game to remain active after ordinary settlement');

world.maxDay = world.day;

const finalTick = advanceOneDay(world);
assert.ok(finalTick, 'Expected final day settlement to return a tick result');
assert.equal(world.gameOver, true, 'Expected final day settlement to close the run');
assert.ok(world.finalResult, 'Expected final day settlement to produce a final result');
assert.equal(
  world.currentReport,
  null,
  'Expected final settlement to clear stale daily summary so result overlay is not stacked with yesterday summary',
);
assert.equal(
  finalTick.report,
  null,
  'Expected final tick result to avoid carrying stale daily summary into the game-over frame',
);
assert.equal(
  world.lastDailyTickResult?.report,
  null,
  'Expected persisted last daily tick result to stay aligned with cleared final settlement report',
);

console.log('selling-houses endgame transition contract verification passed');
