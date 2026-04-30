import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';

import { createInitialState } from '../src/selling-houses/application/gameState.js';
import { seedInitialOpportunities } from '../src/selling-houses/domain/engine.js';
import { getScenarioSnapshotById } from '../src/selling-houses/domain/scenarioCatalog.js';

const projectionModulePath = '../src/selling-houses/interface/interaction-workspace/worldForkBoundary.js';
const projectionSourcePath = 'src/selling-houses/interface/interaction-workspace/worldForkBoundary.ts';
const fixedForkCreatedAt = '2026-04-30T00:00:00.000Z';

function stableSnapshot(value: unknown) {
  return JSON.stringify(value);
}

function buildState() {
  const snapshot = getScenarioSnapshotById('standard-window-chain');
  assert.ok(snapshot, 'Expected standard-window-chain scenario to exist');

  const state = createInitialState(snapshot, 20260430);
  seedInitialOpportunities(state);
  return state;
}

if (!existsSync(projectionSourcePath)) {
  console.log(
    'selling-houses workspace world fork contract skipped: world fork workspace projection is not present yet',
  );
  process.exit(0);
}

const { buildWorldForkWorkspaceProjection } = await import(projectionModulePath);
assert.equal(
  typeof buildWorldForkWorkspaceProjection,
  'function',
  'Expected buildWorldForkWorkspaceProjection to be exported',
);

const state = buildState();
const beforeProjection = stableSnapshot(state);
const projection = await buildWorldForkWorkspaceProjection(state, { forkCreatedAt: fixedForkCreatedAt });

assert.equal(
  stableSnapshot(state),
  beforeProjection,
  'Expected world fork workspace projection not to mutate GameState',
);

assert.equal(projection.projectionKind, 'world_fork_adapter_state');
assert.equal(projection.source, 'runtime-decision-support-world-fork');
assert.equal(projection.readOnly, true);
assert.equal(projection.day, state.day);
assert.ok(projection.receipt, 'Expected world fork workspace projection to expose a receipt');
assert.equal(projection.receipt.receiptKind, 'world_fork_receipt');
assert.equal(projection.receipt.forkCreatedAt, fixedForkCreatedAt);
assert.equal(projection.receipt.baseRunId, state.runId);
assert.equal(projection.receipt.baseDay, state.day);

assert.equal(
  Object.hasOwn(projection, 'forkState'),
  false,
  'Expected world fork workspace projection not to expose forkState',
);
assert.equal(
  Object.hasOwn(projection.receipt, 'forkState'),
  false,
  'Expected world fork workspace receipt not to expose forkState',
);

assert.ok(Object.isFrozen(projection), 'Expected world fork workspace projection to be frozen');
assert.ok(Object.isFrozen(projection.receipt), 'Expected world fork workspace receipt to be frozen');
assert.throws(
  () => {
    (projection.receipt as { baseDay: number }).baseDay = 99;
  },
  TypeError,
  'Expected projected world fork receipt mutation to be blocked by freeze',
);
assert.equal(
  stableSnapshot(state),
  beforeProjection,
  'Expected failed projection mutation probe not to write back to GameState',
);

console.log('selling-houses workspace world fork contract verification passed');
