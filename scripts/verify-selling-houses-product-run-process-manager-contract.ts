import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { createProductRun } from '../src/selling-houses/domain/productRuns.js';
import type { GameState } from '../src/selling-houses/domain/models.js';
import {
  advanceProductRunProcessesForDay,
} from '../src/selling-houses/runtime/simulation/processes/index.js';

const engineSource = readFileSync('src/selling-houses/domain/engine.ts', 'utf8');
const facadeSource = readFileSync('src/selling-houses/domain/engine/processManagerFacade.ts', 'utf8');
const applicationTransitionsSource = readFileSync('src/selling-houses/application/gameTransitions.ts', 'utf8');
const managerSource = readFileSync(
  'src/selling-houses/runtime/simulation/processes/productRunProcessManager.ts',
  'utf8',
);

function buildMinimalState(): GameState {
  return {
    day: 1,
    currentDate: '2026-04-29',
    productRuns: [],
    eventStore: [],
    eventLog: [],
  } as unknown as GameState;
}

const state = buildMinimalState();
const run = createProductRun(state, 'open-day', ['case-1', 'case-2']);
state.productRuns.push(run);
state.day = 2;
state.currentDate = '2026-04-30';

const result = advanceProductRunProcessesForDay(state);

assert.equal(result.managerId, 'product-run-process-manager');
assert.equal(result.transitionOwner, 'runtime-process-manager');
assert.equal(result.transitions.length, 1, 'Expected product run manager to expose one milestone transition');
assert.equal(result.eventIds.length, 1, 'Expected product run manager to expose the journal event it linked to the run');
assert.equal(run.nextMilestone, 'audience-invite', 'Expected product run manager to keep legacy milestone movement semantics');
assert.deepEqual(run.linkedEventIds, [result.eventIds[0]], 'Expected product run manager to link transition event ids back to the run');
assert.equal(state.eventLog.length, 1, 'Expected product run manager to preserve visible journal logging');
const transition = result.transitions[0];
const transitionEvent = state.eventStore.find((entry) => entry.id === result.eventIds[0]);
assert.ok(transition, 'Expected product run manager to expose the transition it applied');
assert.ok(transitionEvent, 'Expected product run manager to expose a linked structured event');
assert.equal(
  state.eventStore.filter((entry) => entry.payload?.runId === run.id).length,
  1,
  'Expected product run manager to write one structured run transition event',
);
assert.equal(
  transitionEvent.payload?.transitionOwner,
  'runtime-process-manager',
  'Expected structured run event to name the runtime process manager owner',
);
assert.deepEqual(
  {
    runId: transitionEvent.payload?.runId,
    productType: transitionEvent.payload?.productType,
    fromMilestone: transitionEvent.payload?.fromMilestone,
    toMilestone: transitionEvent.payload?.toMilestone,
    completed: transitionEvent.payload?.completed,
    transitionOwner: transitionEvent.payload?.transitionOwner,
  },
  {
    runId: transition.runId,
    productType: transition.productType,
    fromMilestone: transition.fromMilestone,
    toMilestone: transition.toMilestone,
    completed: transition.completed,
    transitionOwner: result.transitionOwner,
  },
  'Expected structured event payload to mirror the runtime process manager transition',
);
assert.ok(Object.isFrozen(result), 'Expected product run manager result to be frozen');
assert.ok(Object.isFrozen(result.transitions), 'Expected product run manager transitions to be frozen');
assert.ok(Object.isFrozen(result.eventIds), 'Expected product run manager event ids to be frozen');
assert.ok(
  engineSource.includes('callAdvanceProductRunProcesses(state)'),
  'Expected daily engine tick to advance product runs through the domain process-manager facade',
);
assert.ok(
  facadeSource.includes('registerProcessManagers'),
  'Expected domain process-manager facade to expose runtime registration',
);
assert.ok(
  applicationTransitionsSource.includes('advanceProductRunProcessesForDay(state)'),
  'Expected application layer to register the runtime product-run process manager',
);
assert.ok(
  !engineSource.includes('advanceProductRunsForDay(state)'),
  'Expected daily engine tick not to call legacy advanceProductRunsForDay directly',
);
assert.ok(
  !engineSource.includes('../runtime/'),
  'Expected daily engine tick not to import runtime process managers directly',
);
assert.ok(
  !managerSource.includes('advanceProductRunsForDay'),
  'Expected ProductRunProcessManager to own product run transition mutation without calling legacy advanceProductRunsForDay',
);

assert.throws(() => {
  (result.eventIds as string[]).push('polluted');
}, TypeError, 'Expected product run manager result arrays to be immutable');

console.log('selling-houses product run process manager contract verification passed');
