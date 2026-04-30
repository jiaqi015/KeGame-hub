import assert from 'node:assert/strict';

import { createProductRun } from '../src/selling-houses/domain/productRuns.js';
import type { GameState, Opportunity } from '../src/selling-houses/domain/models.js';
import {
  buildProcessLifecycleMigrationPlan,
} from '../src/selling-houses/runtime/simulation/processes/index.js';

function buildMinimalState(): GameState {
  return {
    day: 5,
    productRuns: [],
    opportunities: [],
    eventStore: [],
  } as unknown as GameState;
}

function buildPendingOpportunity(): Opportunity {
  return {
    id: 'opp-lifecycle-plan',
    caseId: 'case-1',
    customerId: 'customer-1',
    customerName: '流程迁移客户',
    profile: 'lifecycle migration verification',
    channelId: 'private-referral',
    channelName: '私域转介绍',
    fit: 90,
    intent: 93,
    confidence: 88,
    stageIndex: 4,
    stageLabel: '报价斡旋',
    status: 'active',
    lifecycleStatus: 'active',
    leadSource: 'direct',
    visibility: 'revealed',
    createdDay: 4,
    daysLeft: 2,
    touchedToday: true,
    budgetMax: 530,
    priceSensitivity: 41,
    stagnationTicks: 0,
    pendingClosingEvaluation: true,
    pendingClosingStrategyId: 'balanced',
    pendingClosingRequestedDay: 5,
    history: [],
  };
}

const state = buildMinimalState();
state.productRuns.push(
  createProductRun(state, 'open-day', ['case-1', 'case-2']),
  createProductRun(state, 'sincere-sale', ['case-1']),
);
state.opportunities.push(buildPendingOpportunity());

const before = JSON.stringify(state);
const plan = buildProcessLifecycleMigrationPlan(state);
const after = JSON.stringify(state);

assert.equal(after, before, 'Expected lifecycle migration plan builder not to mutate GameState');
assert.equal(plan.source, 'runtime-simulation-processes');
assert.equal(plan.readOnly, true);
assert.equal(plan.processCount, 3, 'Expected open-day, sincerity-sale, and negotiation lifecycle items');
assert.equal(plan.activeProcessCount, 3, 'Expected fixture to expose three active process instances');
assert.equal(plan.readyProcessCount, 2, 'Expected product run process lifecycles to be ready after runtime manager transition ownership moved');
assert.equal(plan.watchProcessCount, 1, 'Expected only negotiation lifecycle ownership to remain in watch');
assert.equal(plan.blockedProcessCount, 0, 'Expected process lifecycle plan to avoid blocking while read-model/action entry boundaries exist');

const byType = Object.fromEntries(plan.items.map((item) => [item.processType, item]));
assert.deepEqual(Object.keys(byType).sort(), ['negotiation', 'open-day', 'sincerity-sale']);

for (const item of plan.items) {
  assert.equal(item.targetOwner, 'runtime-process-manager');
  const productRunProcess = item.processType === 'open-day' || item.processType === 'sincerity-sale';
  assert.equal(
    item.managerMutableTransitionCount,
    productRunProcess ? 1 : 0,
    'Expected product run transitions, but not negotiation, to be manager-mutable',
  );
  const expectedCompletedStepCount = productRunProcess ? 4 : 3;
  assert.equal(item.completedStepCount, expectedCompletedStepCount, 'Expected completed step count to reflect process facade progress');
  assert.equal(item.pendingStepCount, productRunProcess ? 0 : 2, 'Expected only negotiation ownership steps to remain pending');
  assert.equal(item.readiness, productRunProcess ? 'ready' : 'watch');
  assert.ok(item.steps.some((step) => step.stepId === 'read-model-boundary' && step.status === 'done'));
  assert.ok(item.steps.some((step) => step.stepId === 'action-entry-boundary' && step.status === 'done'));
}

assert.equal(byType['open-day'].currentOwner, 'legacy-product-run');
assert.equal(byType['sincerity-sale'].currentOwner, 'legacy-product-run');
assert.equal(byType.negotiation.currentOwner, 'legacy-opportunity-pending-closing');
assert.ok(
  byType['open-day'].steps.some((step) => step.stepId === 'transition-facade' && step.status === 'done'),
  'Expected open-day to expose a completed transition facade step',
);
assert.ok(
  byType['open-day'].steps.some((step) =>
    step.stepId === 'transition-owner'
    && step.status === 'done'
    && step.currentOwner === 'runtime-process-manager'),
  'Expected open-day transition ownership to be marked done under runtime-process-manager',
);
assert.ok(
  byType['sincerity-sale'].steps.some((step) => step.stepId === 'transition-facade' && step.status === 'done'),
  'Expected sincerity-sale to expose a completed transition facade step',
);
assert.ok(
  byType['sincerity-sale'].steps.some((step) =>
    step.stepId === 'transition-owner'
    && step.status === 'done'
    && step.currentOwner === 'runtime-process-manager'),
  'Expected sincerity-sale transition ownership to be marked done under runtime-process-manager',
);
assert.ok(
  byType.negotiation.steps.some((step) => step.stepId === 'transition-owner' && step.status === 'pending'),
  'Expected negotiation transition ownership to remain pending',
);
assert.ok(
  byType.negotiation.steps.some((step) =>
    step.stepId === 'settlement-facade'
    && step.status === 'done'
    && step.currentOwner === 'legacy-opportunity-pending-closing'),
  'Expected negotiation to expose a completed runtime settlement facade step before outcome ownership migrates',
);
assert.ok(
  byType.negotiation.steps.some((step) => step.stepId === 'outcome-owner' && step.status === 'pending'),
  'Expected negotiation to keep outcome ownership pending separately from transition ownership',
);

assert.ok(Object.isFrozen(plan), 'Expected lifecycle migration plan root to be frozen');
assert.ok(Object.isFrozen(plan.items), 'Expected lifecycle migration plan items to be frozen');
assert.ok(Object.isFrozen(plan.items[0]), 'Expected lifecycle migration plan item to be frozen');
assert.ok(Object.isFrozen(plan.items[0]?.steps), 'Expected lifecycle migration steps to be frozen');
assert.ok(Object.isFrozen(plan.items[0]?.steps[0]), 'Expected lifecycle migration step to be frozen');
assert.ok(Object.isFrozen(plan.items[0]?.steps[0]?.evidence), 'Expected lifecycle migration step evidence to be frozen');

assert.throws(() => {
  (plan.items as unknown[]).push({});
}, TypeError, 'Expected lifecycle migration item list to be immutable');

console.log('selling-houses process lifecycle migration plan contract verification passed');
