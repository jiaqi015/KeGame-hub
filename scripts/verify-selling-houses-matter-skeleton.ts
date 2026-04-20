import assert from 'node:assert/strict';

import { createInitialState, updateDerivedState } from '../src/selling-houses/application/gameState.js';
import { seedInitialOpportunities } from '../src/selling-houses/domain/engine.js';
import { getScenarioSnapshotById } from '../src/selling-houses/domain/scenarioCatalog.js';

const snapshot = getScenarioSnapshotById('standard-window-chain');
if (!snapshot) {
  throw new Error('Missing builtin scenario for matter skeleton verification');
}

const world = createInitialState(snapshot, 20260420);
seedInitialOpportunities(world);
updateDerivedState(world);

assert.ok(Array.isArray(world.matters), 'expected matters to exist on game state');
assert.ok(world.matters.length > 0, 'expected derived matters to be created from current operating state');
assert.ok(
  world.matters.some((entry) => entry.source === 'priority'),
  'expected at least one priority-derived matter',
);
assert.ok(
  world.matters.every((entry) => entry.stage === 'pending'),
  'expected skeleton matters to start in pending stage',
);
assert.ok(
  world.matters.every((entry) =>
    entry.template === 'dialog'
    || entry.template === 'form'
    || entry.template === 'schedule'
    || entry.template === 'realtime'),
  'expected every matter to expose a runtime template',
);
assert.ok(
  world.matters.every((entry) =>
    entry.presentation === 'inline-card'
    || entry.presentation === 'detail-page'
    || entry.presentation === 'full-screen'),
  'expected every matter to expose a presentation mode',
);
assert.ok(
  world.matters.every((entry) => entry.title.trim().length > 0 && entry.detail.trim().length > 0),
  'expected every matter to contain title and detail',
);

console.log('selling-houses matter skeleton verification passed');
