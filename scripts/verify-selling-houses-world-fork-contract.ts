import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';

import { createInitialState } from '../src/selling-houses/application/gameState.js';
import { seedInitialOpportunities } from '../src/selling-houses/domain/engine.js';
import type { GameState } from '../src/selling-houses/domain/models.js';
import { getScenarioSnapshotById } from '../src/selling-houses/domain/scenarioCatalog.js';

const worldForkModulePath = '../src/selling-houses/runtime/decision-support/worldFork.js';
const worldForkSourcePath = 'src/selling-houses/runtime/decision-support/worldFork.ts';
const fixedForkCreatedAt = '2026-04-30T00:00:00.000Z';

interface WorldForkReceipt {
  readonly receiptKind: 'world_fork_receipt';
  readonly source: 'legacy-game-state-clone';
  readonly readOnly: true;
  readonly forkKind: 'counterfactual-preview';
  readonly mutationPolicy: 'clone-before-simulate';
  readonly baseRunId: string;
  readonly baseDay: number;
  readonly rngState: number;
  readonly rngCalls: number;
  readonly caseCount: number;
  readonly opportunityCount: number;
  readonly eventCount: number;
  readonly closedDealCount: number;
  readonly productRunCount: number;
  readonly forkCreatedAt: string;
}

interface WorldForkResult {
  readonly receipt: WorldForkReceipt;
  readonly forkState: GameState;
}

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

if (!existsSync(worldForkSourcePath)) {
  console.log('selling-houses world fork contract skipped: world fork runtime adapter is not present yet');
  process.exit(0);
}

const { createCounterfactualWorldFork } = await import(worldForkModulePath);
assert.equal(
  typeof createCounterfactualWorldFork,
  'function',
  'Expected createCounterfactualWorldFork to be exported',
);

const state = buildState();
const beforeFork = stableSnapshot(state);
const fork = await createCounterfactualWorldFork(state, { forkCreatedAt: fixedForkCreatedAt }) as WorldForkResult;
assert.equal(
  stableSnapshot(state),
  beforeFork,
  'Expected createCounterfactualWorldFork not to write back to base GameState',
);

assert.ok(fork && typeof fork === 'object', 'Expected world fork adapter to return a result object');
assert.ok(fork.receipt, 'Expected world fork result to expose a receipt');
assert.ok(fork.forkState, 'Expected world fork result to expose forkState');

const { receipt, forkState } = fork;

assert.equal(receipt.receiptKind, 'world_fork_receipt');
assert.equal(receipt.source, 'legacy-game-state-clone');
assert.equal(receipt.readOnly, true);
assert.equal(receipt.forkKind, 'counterfactual-preview');
assert.equal(receipt.mutationPolicy, 'clone-before-simulate');
assert.equal(receipt.baseRunId, state.runId);
assert.equal(receipt.baseDay, state.day);
assert.deepEqual({
  rngState: receipt.rngState,
  rngCalls: receipt.rngCalls,
}, {
  rngState: state.rngState,
  rngCalls: state.rngCalls,
});
assert.deepEqual({
  cases: receipt.caseCount,
  opportunities: receipt.opportunityCount,
  eventStore: receipt.eventCount,
  closedDeals: receipt.closedDealCount,
  productRuns: receipt.productRunCount,
}, {
  cases: state.cases.length,
  opportunities: state.opportunities.length,
  eventStore: state.eventStore.length,
  closedDeals: state.closedDeals.length,
  productRuns: state.productRuns.length,
});
assert.equal(receipt.forkCreatedAt, fixedForkCreatedAt);

assert.ok(Object.isFrozen(receipt), 'Expected world fork receipt to be frozen');
assert.throws(
  () => {
    (receipt as { baseDay: number }).baseDay = 99;
  },
  TypeError,
  'Expected world fork receipt mutation to be blocked by freeze',
);

assert.notEqual(forkState, state, 'Expected forkState to be a distinct GameState object');
assert.notEqual(forkState.cases, state.cases, 'Expected forkState.cases not to alias base state cases');
assert.notEqual(
  forkState.opportunities,
  state.opportunities,
  'Expected forkState.opportunities not to alias base state opportunities',
);
assert.notEqual(
  forkState.eventStore,
  state.eventStore,
  'Expected forkState.eventStore not to alias base state eventStore',
);
assert.notEqual(
  forkState.closedDeals,
  state.closedDeals,
  'Expected forkState.closedDeals not to alias base state closedDeals',
);
assert.notEqual(
  forkState.productRuns,
  state.productRuns,
  'Expected forkState.productRuns not to alias base state productRuns',
);

const baseCase = state.cases[0];
const forkCase = forkState.cases[0];
assert.ok(baseCase, 'Expected base state to include at least one case');
assert.ok(forkCase, 'Expected fork state to include at least one case');
const originalBaseCaseTitle = baseCase.title;
forkCase.title = `${originalBaseCaseTitle} fork mutation`;

assert.equal(
  baseCase.title,
  originalBaseCaseTitle,
  'Expected mutating forkState.cases[0] not to affect base state case',
);
assert.equal(
  stableSnapshot(state),
  beforeFork,
  'Expected forkState mutation probe not to write back to base GameState',
);

console.log('selling-houses world fork contract verification passed');
