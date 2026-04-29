import assert from 'node:assert/strict';

import { createProductRun } from '../src/selling-houses/domain/productRuns.js';
import type { GameState, Opportunity } from '../src/selling-houses/domain/models.js';
import { buildProcessWorkspaceProjection } from '../src/selling-houses/interface/interaction-workspace/processWorkspaceBoundary.js';

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
assert.equal(projection.managerMutableCount, 0, 'Expected runtime process managers to expose no mutable transitions yet');
assert.equal(projection.processes.length, 3, 'Expected open-day, sincerity-sale, and negotiation process projections');
assert.equal(projection.contracts.length, 3, 'Expected all process manager contracts in the workspace projection');
assert.ok(
  projection.contracts.every((contract) => contract.writes.length === 0),
  'Expected process workspace contracts to expose no writes',
);
assert.ok(
  projection.contracts.every((contract) => (
    contract.transitions.every((transition) => transition.managerCanMutateNow === false)
  )),
  'Expected process workspace transitions to remain manager read-only',
);
assert.ok(Object.isFrozen(projection), 'Expected workspace process projection to be frozen');
assert.ok(Object.isFrozen(projection.contracts[0]), 'Expected contract entries to be frozen');

console.log('selling-houses workspace process contract verification passed');
