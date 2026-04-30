import assert from 'node:assert/strict';

import { createInitialState, updateDerivedState } from '../src/selling-houses/application/gameState.js';
import { buildArchitectureParityProjection } from '../src/selling-houses/application/projections/architectureParityProjection.js';
import { seedInitialOpportunities } from '../src/selling-houses/domain/engine.js';
import type { GameState, Opportunity } from '../src/selling-houses/domain/models.js';
import { createProductRun } from '../src/selling-houses/domain/productRuns.js';
import { getScenarioSnapshotById } from '../src/selling-houses/domain/scenarioCatalog.js';

type ArchitectureParityProjectionContract = ReturnType<typeof buildArchitectureParityProjection> & {
  readonly eventStreamParity: {
    readonly legacyEventStoreCount: number;
    readonly receiptEventCount: number;
    readonly workspaceReceiptEventCount: number;
    readonly recentReceiptEventCount: number;
    readonly journalEventCount: number;
    readonly missingEventCount: number;
  };
  readonly worldForkParity: {
    readonly baseCaseCount: number;
    readonly forkReceiptCaseCount: number;
    readonly workspaceForkReceiptCaseCount: number;
    readonly baseOpportunityCount: number;
    readonly forkReceiptOpportunityCount: number;
    readonly workspaceForkReceiptOpportunityCount: number;
    readonly baseEventCount: number;
    readonly forkReceiptEventCount: number;
    readonly workspaceForkReceiptEventCount: number;
    readonly forkMutationPolicy: 'clone-before-simulate';
  };
};

function stableStateJson(world: GameState) {
  return JSON.stringify(world);
}

function assertOwnField(target: object, field: string, message: string) {
  assert.equal(Object.hasOwn(target, field), true, message);
}

function assertEventStreamParityContract(projection: ArchitectureParityProjectionContract) {
  assert.ok(projection.eventStreamParity, 'Expected architecture parity projection to include event stream parity');
  for (const field of [
    'legacyEventStoreCount',
    'receiptEventCount',
    'workspaceReceiptEventCount',
    'recentReceiptEventCount',
    'journalEventCount',
    'missingEventCount',
  ]) {
    assertOwnField(
      projection.eventStreamParity,
      field,
      `Expected event stream parity to expose ${field}`,
    );
  }
  assert.equal(
    projection.eventStreamParity.legacyEventStoreCount,
    projection.eventStreamParity.receiptEventCount,
    'Expected event stream receipt to cover every legacy event store entry',
  );
  assert.equal(
    projection.eventStreamParity.receiptEventCount,
    projection.eventStreamParity.workspaceReceiptEventCount,
    'Expected event stream workspace receipt count to match runtime receipt count',
  );
  assert.equal(
    typeof projection.eventStreamParity.journalEventCount,
    'number',
    'Expected event stream parity journalEventCount to be numeric',
  );
  assert.equal(
    typeof projection.eventStreamParity.recentReceiptEventCount,
    'number',
    'Expected event stream parity recentReceiptEventCount to be numeric',
  );
  assert.ok(
    projection.eventStreamParity.recentReceiptEventCount <= projection.eventStreamParity.receiptEventCount,
    'Expected event stream recent receipt count not to exceed total receipt event count',
  );
  assert.equal(
    projection.eventStreamParity.missingEventCount,
    0,
    'Expected event stream parity to expose no missing events',
  );
}

function assertWorldForkParityContract(projection: ArchitectureParityProjectionContract) {
  assert.ok(projection.worldForkParity, 'Expected architecture parity projection to include world fork parity');
  for (const field of [
    'baseCaseCount',
    'forkReceiptCaseCount',
    'workspaceForkReceiptCaseCount',
    'baseOpportunityCount',
    'forkReceiptOpportunityCount',
    'workspaceForkReceiptOpportunityCount',
    'baseEventCount',
    'forkReceiptEventCount',
    'workspaceForkReceiptEventCount',
    'forkMutationPolicy',
  ]) {
    assertOwnField(
      projection.worldForkParity,
      field,
      `Expected world fork parity to expose ${field}`,
    );
  }
  assert.equal(
    projection.worldForkParity.baseCaseCount,
    projection.worldForkParity.forkReceiptCaseCount,
    'Expected world fork receipt case count to match base case count',
  );
  assert.equal(
    projection.worldForkParity.forkReceiptCaseCount,
    projection.worldForkParity.workspaceForkReceiptCaseCount,
    'Expected world fork workspace receipt case count to match runtime receipt case count',
  );
  assert.equal(
    projection.worldForkParity.baseOpportunityCount,
    projection.worldForkParity.forkReceiptOpportunityCount,
    'Expected world fork receipt opportunity count to match base opportunity count',
  );
  assert.equal(
    projection.worldForkParity.forkReceiptOpportunityCount,
    projection.worldForkParity.workspaceForkReceiptOpportunityCount,
    'Expected world fork workspace receipt opportunity count to match runtime receipt opportunity count',
  );
  assert.equal(
    projection.worldForkParity.baseEventCount,
    projection.worldForkParity.forkReceiptEventCount,
    'Expected world fork receipt event count to match base event count',
  );
  assert.equal(
    projection.worldForkParity.forkReceiptEventCount,
    projection.worldForkParity.workspaceForkReceiptEventCount,
    'Expected world fork workspace receipt event count to match runtime receipt event count',
  );
  assert.equal(
    projection.worldForkParity.forkMutationPolicy,
    'clone-before-simulate',
    'Expected world fork parity to preserve clone-before-simulate mutation policy',
  );
}

function buildSeededWorld(seed: number) {
  const snapshot = getScenarioSnapshotById('standard-window-chain');
  assert.ok(snapshot, 'Expected standard-window-chain scenario to exist');

  const world = createInitialState(snapshot, seed);
  seedInitialOpportunities(world);
  updateDerivedState(world);
  return world;
}

function buildPendingClosingOpportunity(world: GameState): Opportunity {
  const caseItem = world.cases.find((entry) => entry.status === 'active') || world.cases[0];
  assert.ok(caseItem, 'Expected a case to attach pending negotiation');
  return {
    id: 'parity-pending-negotiation',
    caseId: caseItem.id,
    customerId: 'parity-customer',
    customerName: '架构对照客户',
    profile: 'architecture parity verification',
    channelId: 'private-referral',
    channelName: '私域转介绍',
    fit: 90,
    intent: 92,
    confidence: 87,
    stageIndex: 5,
    stageLabel: '报价斡旋',
    status: 'active',
    lifecycleStatus: 'active',
    leadSource: 'direct',
    visibility: 'revealed',
    createdDay: world.day,
    daysLeft: 2,
    touchedToday: false,
    budgetMax: caseItem.askPrice + 30,
    priceSensitivity: 45,
    stagnationTicks: 0,
    pendingClosingEvaluation: true,
    pendingClosingStrategyId: 'balanced',
    pendingClosingRequestedDay: world.day,
    history: [],
  };
}

const cleanWorld = buildSeededWorld(20260429);
const beforeClean = stableStateJson(cleanWorld);
const cleanProjection = buildArchitectureParityProjection(cleanWorld) as ArchitectureParityProjectionContract;
const afterClean = stableStateJson(cleanWorld);

assert.equal(afterClean, beforeClean, 'Expected clean architecture parity projection not to mutate GameState');
assert.equal(cleanProjection.projectionKind, 'architecture_parity_projection');
assert.equal(cleanProjection.source, 'legacy-game-state');
assert.equal(cleanProjection.readOnly, true);
assert.equal(cleanProjection.day, cleanWorld.day);
assert.equal(cleanProjection.status, 'aligned', 'Expected clean parity fixture to be aligned');
assert.equal(cleanProjection.summary.warnings, 0, 'Expected clean parity fixture to report no warnings');
assert.deepEqual(cleanProjection.warnings, [], 'Expected clean parity fixture to expose no warnings');
assert.equal(cleanProjection.opportunityRelationParity.conflictCount, 0, 'Expected clean parity fixture to have no relation conflicts');
assert.equal(
  cleanProjection.processParity.processViewCount,
  cleanProjection.processParity.legacyProductRunCount + cleanProjection.processParity.pendingNegotiationCount,
  'Expected clean process workspace to cover product runs plus pending negotiations',
);
assertEventStreamParityContract(cleanProjection);
assertWorldForkParityContract(cleanProjection);
assert.ok(Object.isFrozen(cleanProjection), 'Expected clean architecture parity projection to be frozen');
assert.ok(Object.isFrozen(cleanProjection.warnings), 'Expected clean architecture parity warnings array to be frozen');

const world = buildSeededWorld(20260429);
world.productRuns.push(createProductRun(world, 'open-day', [world.cases[0]?.id || 'case-1']));
const pendingClosingOpportunity = buildPendingClosingOpportunity(world);
world.opportunities.push(pendingClosingOpportunity);
world.customerStates.push({
  customerId: pendingClosingOpportunity.customerId,
  status: 'engaged',
  decisionStyle: 'balanced',
  advisorTrust: 62,
  fatigue: 8,
  churnRisk: 18,
  activeCaseIds: [pendingClosingOpportunity.caseId],
  caseStates: {
    [pendingClosingOpportunity.caseId]: {
      caseId: pendingClosingOpportunity.caseId,
      fit: 63,
      interest: 41,
      confidence: 36,
      stageIndex: 1,
      interactions: 1,
      lastActiveDay: world.day,
      viewed: false,
      offered: false,
      selected: true,
    },
  },
  lastTouchDay: world.day,
  lastActionNote: 'architecture parity conflict probe',
});
updateDerivedState(world);

const before = stableStateJson(world);
const projection = buildArchitectureParityProjection(world) as ArchitectureParityProjectionContract;
const after = stableStateJson(world);

assert.equal(after, before, 'Expected architecture parity projection not to mutate GameState');
assert.equal(projection.projectionKind, 'architecture_parity_projection');
assert.equal(projection.source, 'legacy-game-state');
assert.equal(projection.readOnly, true);
assert.equal(projection.day, world.day);
assert.equal(
  projection.summary.activeCaseCount,
  world.cases.filter((caseItem) => caseItem.status === 'active').length,
  'Expected parity summary to mirror active case count',
);
assert.equal(
  projection.recommendationParity.decisionSupportCaseCount,
  projection.summary.activeCaseCount,
  'Expected decision-support workspace to cover every active case',
);
assert.ok(
  projection.recommendationParity.decisionSupportDraftCount > 0,
  'Expected decision-support workspace to expose recommendation drafts',
);
assert.ok(
  projection.opportunityRelationParity.relationViewCount >= projection.opportunityRelationParity.legacyOpportunityCount,
  'Expected opportunity relation workspace not to drop legacy opportunities',
);
assert.ok(
  projection.opportunityRelationParity.conflictCount > 0,
  'Expected parity fixture to include an opportunity relation conflict',
);
assert.ok(
  projection.warnings.some((warning) => warning.code === 'opportunity_relation_conflict_detected'),
  'Expected opportunity relation conflicts to be promoted to architecture parity warnings',
);
assert.equal(
  projection.status,
  'watch',
  'Expected architecture parity status to be watch when relation conflicts are present without hard gaps',
);
assert.equal(projection.summary.warnings, projection.warnings.length, 'Expected summary warning count to match warnings');
assert.deepEqual(
  projection.warnings.map((warning) => warning.code),
  ['opportunity_relation_conflict_detected'],
  'Expected conflict fixture to expose only the relation conflict warning',
);
assert.equal(
  projection.processParity.processViewCount,
  projection.processParity.legacyProductRunCount + projection.processParity.pendingNegotiationCount,
  'Expected process workspace to cover product runs plus pending negotiations',
);
assert.equal(
  projection.processParity.managerMutableCount,
  projection.processParity.legacyProductRunCount,
  'Expected parity projection mutable count to reflect runtime-owned product run transitions',
);
assert.equal(
  projection.processParity.negotiationPendingMigrationCount,
  projection.processParity.pendingNegotiationCount,
  'Expected parity projection to keep negotiation transitions pending migration',
);
assertEventStreamParityContract(projection);
assertWorldForkParityContract(projection);
assert.ok(Object.isFrozen(projection), 'Expected architecture parity projection to be frozen');
assert.ok(Object.isFrozen(projection.recommendationParity), 'Expected recommendation parity section to be frozen');

console.log('selling-houses architecture parity contract verification passed');
