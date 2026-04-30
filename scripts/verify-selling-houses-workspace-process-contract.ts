import assert from 'node:assert/strict';

import { createProductRun } from '../src/selling-houses/domain/productRuns.js';
import type { GameState, Opportunity } from '../src/selling-houses/domain/models.js';
import {
  buildProcessWorkspaceProjection,
  type ProcessWorkspaceProjection,
} from '../src/selling-houses/interface/interaction-workspace/processWorkspaceBoundary.js';

function stableSnapshot(value: unknown) {
  return JSON.stringify(value);
}

function assertMutationProbeDoesNotMutateState(name: string, state: GameState, fn: () => void) {
  const before = stableSnapshot(state);
  assert.throws(fn, TypeError, `${name} should be blocked by projection freeze`);
  assert.equal(stableSnapshot(state), before, `${name} should not mutate legacy GameState`);
}

function assertReadonlyProcessProjectionTypes(projectionForTypes: ProcessWorkspaceProjection) {
  if (false) {
    const process = projectionForTypes.processes[0];
    if (process) {
      // @ts-expect-error process entries are deeply readonly DTOs.
      process.processId = 'mutated';
      // @ts-expect-error nested transition views are deeply readonly DTOs.
      process.transitionView.currentStepId = 'mutated';
    }

    const contract = projectionForTypes.contracts[0];
    if (contract) {
      // @ts-expect-error contract entries are deeply readonly DTOs.
      contract.displayName = 'mutated';
      // @ts-expect-error nested lifecycle ownership is deeply readonly.
      contract.lifecycleOwnership.note = 'mutated';
      const transition = contract.transitions[0];
      if (transition) {
        // @ts-expect-error nested contract transition entries are deeply readonly.
        transition.currentStepId = 'mutated';
      }
    }
  }
}

function buildMinimalState(): GameState {
  return {
    day: 4,
    productRuns: [],
    opportunities: [],
    eventStore: [],
  } as unknown as GameState;
}

function buildPendingClosingOpportunity(): Opportunity {
  return {
    id: 'opp-pending-close-workspace',
    caseId: 'case-1',
    customerId: 'customer-1',
    customerName: '流程工作台客户',
    profile: 'pending closing workspace verification',
    channelId: 'private-referral',
    channelName: '私域转介绍',
    fit: 89,
    intent: 92,
    confidence: 86,
    stageIndex: 4,
    stageLabel: '报价斡旋',
    status: 'active',
    lifecycleStatus: 'active',
    leadSource: 'direct',
    visibility: 'revealed',
    createdDay: 3,
    daysLeft: 2,
    touchedToday: true,
    budgetMax: 528,
    priceSensitivity: 43,
    stagnationTicks: 0,
    pendingClosingEvaluation: true,
    pendingClosingStrategyId: 'balanced',
    pendingClosingRequestedDay: 4,
    history: [],
  };
}

const state = buildMinimalState();
state.productRuns.push(
  createProductRun(state, 'open-day', ['case-1', 'case-2']),
  createProductRun(state, 'sincere-sale', ['case-1']),
);
state.opportunities.push(buildPendingClosingOpportunity());

const beforeProjectionState = JSON.stringify(state);
const projection = buildProcessWorkspaceProjection(state);
const afterProjectionState = JSON.stringify(state);
assertReadonlyProcessProjectionTypes(projection);

assert.equal(
  afterProjectionState,
  beforeProjectionState,
  'Expected process workspace projection adapter not to mutate GameState',
);
assert.equal(projection.projectionKind, 'process_workspace_projection');
assert.equal(projection.source, 'runtime-simulation-processes');
assert.equal(projection.readOnly, true);
assert.equal(projection.day, state.day);
assert.deepEqual(projection.processCountsByType, {
  'open-day': 1,
  'sincerity-sale': 1,
  negotiation: 1,
});
assert.equal(projection.runningCount, 3, 'Expected running product runs and active negotiation to count as running processes');
assert.equal(projection.managerMutableCount, 2, 'Expected open-day and sincerity-sale transitions to be runtime-manager mutable');
assert.equal(projection.processes.length, 3, 'Expected open-day, sincerity-sale, and negotiation process projections');
assert.equal(projection.contracts.length, 3, 'Expected all process manager contracts in the workspace projection');
assert.equal(
  projection.lifecycleMigrationPlan.processCount,
  3,
  'Expected workspace projection to expose lifecycle migration readiness for all process types',
);
assert.equal(
  projection.lifecycleMigrationPlan.watchProcessCount,
  1,
  'Expected only negotiation lifecycle ownership to stay in watch after product run transition ownership moved',
);
assert.equal(
  projection.lifecycleMigrationPlan.readyProcessCount,
  2,
  'Expected open-day and sincerity-sale lifecycle ownership to be ready',
);
assert.equal(
  projection.lifecycleMigrationPlan.activeProcessCount,
  projection.runningCount,
  'Expected lifecycle migration active process count to mirror process workspace running count in the fixture',
);
assert.ok(
  projection.contracts
    .filter((contract) => contract.processType === 'open-day' || contract.processType === 'sincerity-sale')
    .every((contract) => (
      contract.writes.includes('GameState.productRuns.*.nextMilestone')
      && contract.writes.includes('GameState.productRuns.*.linkedEventIds')
      && contract.writes.includes('GameState.eventLog')
    )),
  'Expected product run process contracts to expose runtime-owned legacy mirror writes',
);
assert.ok(
  projection.contracts
    .filter((contract) => contract.processType === 'negotiation')
    .every((contract) => contract.writes.length === 0),
  'Expected negotiation process contracts to expose no writes before settlement ownership migrates',
);
assert.ok(
  projection.contracts
    .filter((contract) => contract.processType === 'open-day' || contract.processType === 'sincerity-sale')
    .every((contract) => contract.transitions.every((transition) =>
      transition.managerCanMutateNow === true
      && transition.nextTransitionOwner === 'runtime-process-manager')),
  'Expected product run process workspace transitions to be runtime-manager mutable',
);
assert.ok(
  projection.contracts
    .filter((contract) => contract.processType === 'negotiation')
    .every((contract) => contract.transitions.every((transition) =>
      transition.managerCanMutateNow === false
      && transition.nextTransitionOwner === 'legacy-opportunity-pending-closing')),
  'Expected negotiation process workspace transitions to remain legacy pending',
);
assert.ok(Object.isFrozen(projection), 'Expected workspace process projection to be frozen');
assert.ok(Object.isFrozen(projection.processCountsByType), 'Expected process count map to be frozen');
assert.ok(Object.isFrozen(projection.processes), 'Expected process list to be frozen');
assert.ok(Object.isFrozen(projection.processes[0]), 'Expected process entries to be frozen');
assert.ok(Object.isFrozen(projection.processes[0]?.transitionView), 'Expected nested transition views to be frozen');
assert.ok(Object.isFrozen(projection.contracts), 'Expected contract list to be frozen');
assert.ok(Object.isFrozen(projection.contracts[0]), 'Expected contract entries to be frozen');
assert.ok(Object.isFrozen(projection.contracts[0]?.observes), 'Expected contract observed sources to be frozen');
assert.ok(Object.isFrozen(projection.contracts[0]?.reads), 'Expected contract reads to be frozen');
assert.ok(Object.isFrozen(projection.contracts[0]?.writes), 'Expected contract writes to be frozen');
assert.ok(Object.isFrozen(projection.contracts[0]?.transitions), 'Expected contract transition list to be frozen');
assert.ok(
  Object.isFrozen(projection.contracts[0]?.lifecycleOwnership),
  'Expected contract lifecycle ownership to be frozen',
);
assert.ok(Object.isFrozen(projection.contracts[0]?.transitions[0]), 'Expected contract transition entries to be frozen');
assert.ok(Object.isFrozen(projection.lifecycleMigrationPlan), 'Expected lifecycle migration plan to be frozen');
assert.ok(Object.isFrozen(projection.lifecycleMigrationPlan.items), 'Expected lifecycle migration plan items to be frozen');
assert.ok(Object.isFrozen(projection.lifecycleMigrationPlan.items[0]), 'Expected lifecycle migration plan item to be frozen');
assert.ok(
  Object.isFrozen(projection.lifecycleMigrationPlan.items[0]?.steps),
  'Expected lifecycle migration plan nested steps to be frozen',
);
assert.ok(
  Object.isFrozen(projection.lifecycleMigrationPlan.items[0]?.steps[0]?.evidence),
  'Expected lifecycle migration plan nested evidence to be frozen',
);

type ProductRunProcessProjection = Extract<
  ProcessWorkspaceProjection['processes'][number],
  { readonly processType: 'open-day' | 'sincerity-sale' }
>;

const productRunProcess = projection.processes.find((process): process is ProductRunProcessProjection =>
  process.processType === 'open-day' || process.processType === 'sincerity-sale');
assert.ok(productRunProcess, 'Expected product-run process projection to be present');
assert.ok(Object.isFrozen(productRunProcess.targetCaseIds), 'Expected process nested target arrays to be frozen');
assert.ok(Object.isFrozen(productRunProcess.linkedEventIds), 'Expected process nested linked event arrays to be frozen');
assert.ok(Object.isFrozen(productRunProcess.milestones), 'Expected process nested milestone arrays to be frozen');
assert.ok(Object.isFrozen(productRunProcess.milestones[0]), 'Expected process nested milestone entries to be frozen');

assertMutationProbeDoesNotMutateState('process entry mutation probe', state, () => {
  (projection.processes[0] as unknown as { processId: string }).processId = 'mutated';
});
assertMutationProbeDoesNotMutateState('process transition mutation probe', state, () => {
  (projection.processes[0]?.transitionView as unknown as { currentStepId: string }).currentStepId = 'mutated';
});
assertMutationProbeDoesNotMutateState('process nested array mutation probe', state, () => {
  (productRunProcess.targetCaseIds as unknown as string[]).push('case-mutated');
});
assertMutationProbeDoesNotMutateState('process milestone mutation probe', state, () => {
  (productRunProcess.milestones[0] as unknown as { title: string }).title = 'mutated';
});
assertMutationProbeDoesNotMutateState('contract nested transition mutation probe', state, () => {
  (projection.contracts[0]?.transitions[0] as unknown as { currentStepId: string }).currentStepId = 'mutated';
});
assertMutationProbeDoesNotMutateState('lifecycle migration step mutation probe', state, () => {
  (projection.lifecycleMigrationPlan.items[0]?.steps[0] as unknown as { title: string }).title = 'mutated';
});

console.log('selling-houses workspace process contract verification passed');
