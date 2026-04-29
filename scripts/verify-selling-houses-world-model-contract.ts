import assert from 'node:assert/strict';

import { createInitialState, updateDerivedState } from '../src/selling-houses/application/gameState.js';
import {
  buildAssetScoreSnapshotFromLegacyCase,
  buildCaseEvaluationSnapshotsFromLegacyState,
  buildOwnerDecisionReadinessSnapshotFromLegacyCase,
  deriveWorldStateFromLegacyGameState,
} from '../src/selling-houses/core/index.js';
import { seedInitialOpportunities } from '../src/selling-houses/domain/engine.js';
import type { GameState, Opportunity } from '../src/selling-houses/domain/models.js';
import { getScenarioSnapshotById } from '../src/selling-houses/domain/scenarioCatalog.js';
import type { CustomerCaseOpportunity } from '../src/selling-houses/core/world-state/index.js';
import {
  buildBrokerWorkspaceView,
  buildManagerWorkspaceView,
  buildMatterWorkspaceProjection,
  buildOwnerWorkspaceView,
  buildTodayPlanWorkspaceProjection,
} from '../src/selling-houses/interface/interaction-workspace/index.js';

function stableSnapshot(value: unknown) {
  return JSON.stringify(value);
}

function assertDoesNotMutate<T>(name: string, state: GameState, fn: () => T): T {
  const before = stableSnapshot(state);
  const result = fn();
  assert.equal(stableSnapshot(state), before, `${name} should not mutate legacy GameState`);
  return result;
}

function assertDeepFrozen(value: unknown, label: string) {
  assert.ok(Object.isFrozen(value), `${label} should be frozen`);
  if (!value || typeof value !== 'object') return;
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    if (nested && typeof nested === 'object') {
      assertDeepFrozen(nested, `${label}.${key}`);
    }
  }
}

function buildWorld() {
  const snapshot = getScenarioSnapshotById('standard-window-chain');
  assert.ok(snapshot, 'Expected standard-window-chain scenario to exist');
  const world = createInitialState(snapshot, 20260429);
  seedInitialOpportunities(world);
  updateDerivedState(world);
  return world;
}

const world = buildWorld();
const caseItem = world.cases[0];
assert.ok(caseItem, 'Expected at least one case');

const worldState = assertDoesNotMutate('deriveWorldStateFromLegacyGameState', world, () =>
  deriveWorldStateFromLegacyGameState(world));

assert.equal(worldState.assets.length, world.cases.length, 'Expected AssetCase count to match legacy cases');

for (const legacyCase of world.cases) {
  const assetId = `asset-case:${legacyCase.id}`;
  const ownerId = `owner:${legacyCase.id}`;

  assert.ok(
    worldState.brokerOwnerRelations.some((relation) =>
      relation.ownerId === ownerId && relation.assetCaseIds.includes(assetId)),
    `Expected BrokerOwnerRelation for case ${legacyCase.id}`,
  );
  assert.ok(
    worldState.ownerCaseRelations.some((relation) =>
      relation.ownerId === ownerId && relation.assetCaseId === assetId),
    `Expected OwnerCaseRelation for case ${legacyCase.id}`,
  );
}

const opportunityCase = world.cases[0];
assert.ok(opportunityCase, 'Expected case for synthetic opportunity verification');
const runtimeCustomer = world.customerStates[0];
assert.ok(runtimeCustomer, 'Expected runtime customer state to exist');

runtimeCustomer.caseStates = {};
runtimeCustomer.activeCaseIds = [];

const syntheticOpportunities: Opportunity[] = [
  {
    id: 'opp-contract-active',
    caseId: opportunityCase.id,
    customerId: runtimeCustomer.customerId,
    customerName: '合同验证活跃客户',
    profile: 'active opportunity outside runtime caseStates',
    channelId: 'private-referral',
    channelName: '私域转介绍',
    fit: 82,
    intent: 84,
    confidence: 76,
    stageIndex: 3,
    stageLabel: '已看房',
    status: 'active',
    lifecycleStatus: 'active',
    leadSource: 'direct',
    visibility: 'revealed',
    createdDay: world.day,
    daysLeft: 4,
    touchedToday: false,
    budgetMax: opportunityCase.askPrice + 20,
    priceSensitivity: 50,
    stagnationTicks: 0,
    history: [],
  },
  {
    id: 'opp-contract-legacy-lost',
    caseId: opportunityCase.id,
    customerId: 'contract-legacy-customer',
    customerName: '合同验证历史客户',
    profile: 'legacy opportunity outside runtime caseStates',
    channelId: 'broker-network',
    channelName: '经纪人网络',
    fit: 61,
    intent: 54,
    confidence: 48,
    stageIndex: 2,
    stageLabel: '初步沟通',
    status: 'lost',
    lifecycleStatus: 'lost',
    leadSource: 'direct',
    visibility: 'revealed',
    createdDay: world.day - 1,
    daysLeft: 0,
    touchedToday: false,
    budgetMax: opportunityCase.askPrice - 30,
    priceSensitivity: 72,
    stagnationTicks: 3,
    history: [],
  },
  {
    id: 'opp-contract-pending-closing',
    caseId: opportunityCase.id,
    customerId: runtimeCustomer.customerId,
    customerName: '合同验证待成交客户',
    profile: 'pending closing opportunity outside runtime caseStates',
    channelId: 'private-referral',
    channelName: '私域转介绍',
    fit: 88,
    intent: 91,
    confidence: 86,
    stageIndex: 4,
    stageLabel: '成交斡旋',
    status: 'active',
    lifecycleStatus: 'active',
    leadSource: 'direct',
    visibility: 'revealed',
    createdDay: world.day - 2,
    daysLeft: 1,
    touchedToday: true,
    budgetMax: opportunityCase.askPrice + 10,
    priceSensitivity: 44,
    stagnationTicks: 0,
    pendingClosingEvaluation: true,
    pendingClosingStrategyId: 'balanced-close',
    pendingClosingRequestedDay: world.day,
    history: [],
  },
];

world.opportunities = syntheticOpportunities;
const opportunityWorld = deriveWorldStateFromLegacyGameState(world);
const opportunityById = new Map(
  opportunityWorld.customerCaseOpportunities.map((entry: CustomerCaseOpportunity) => [entry.legacyOpportunityId, entry]),
);

assert.equal(
  opportunityWorld.customerCaseOpportunities.length,
  syntheticOpportunities.length,
  'Expected CustomerCaseOpportunity adapter to account for active and legacy opportunities',
);
assert.equal(
  opportunityById.get('opp-contract-active')?.lifecycleStatus,
  'active',
  'Expected active opportunity to derive without relying on CustomerRuntimeState.caseStates',
);
assert.equal(
  opportunityById.get('opp-contract-legacy-lost')?.lifecycleStatus,
  'lost',
  'Expected legacy/lost opportunity to derive without relying on CustomerRuntimeState.caseStates',
);
const negotiationProcessBySourceId = new Map(
  opportunityWorld.negotiationProcesses.map((entry) => [entry.sourceOpportunityId, entry]),
);
assert.equal(
  opportunityWorld.negotiationProcesses.length,
  1,
  'Expected only pendingClosingEvaluation opportunities to derive NegotiationProcess entries',
);
assert.equal(
  negotiationProcessBySourceId.get('opp-contract-pending-closing')?.pendingClosingEvaluation,
  true,
  'Expected pending closing opportunity to derive a NegotiationProcess',
);
assert.equal(
  negotiationProcessBySourceId.has('opp-contract-active'),
  false,
  'Expected non-pending active opportunity to stay out of negotiationProcesses',
);
assert.equal(
  negotiationProcessBySourceId.has('opp-contract-legacy-lost'),
  false,
  'Expected non-pending legacy/lost opportunity to stay out of negotiationProcesses',
);

const assetScore = assertDoesNotMutate('buildAssetScoreSnapshotFromLegacyCase', world, () =>
  buildAssetScoreSnapshotFromLegacyCase(world, caseItem));
assert.equal(assetScore.score, Math.round(caseItem.competitiveness), 'Expected AssetScoreSnapshot to mirror competitiveness');
assert.equal(assetScore.dimensions.d1.score, Math.round(caseItem.d1), 'Expected AssetScoreSnapshot to mirror legacy d1');
assert.equal(assetScore.dimensions.d2.score, Math.round(caseItem.d2), 'Expected AssetScoreSnapshot to mirror legacy d2');
assert.equal(assetScore.dimensions.d3.score, Math.round(caseItem.d3), 'Expected AssetScoreSnapshot to mirror legacy d3');

const mutationProbeWorld = buildWorld();
const mutationProbeCase = mutationProbeWorld.cases[0];
assert.ok(mutationProbeCase, 'Expected case for AssetScoreSnapshot mutation probe');
const [axisEntry] = Object.entries(mutationProbeCase.axisScores);
assert.ok(axisEntry, 'Expected legacy case axisScores to contain at least one axis');
const [axisKey, axisValue] = axisEntry;
const mutationProbeAssetScore = buildAssetScoreSnapshotFromLegacyCase(mutationProbeWorld, mutationProbeCase);
mutationProbeCase.axisScores[axisKey] = axisValue - 17;
mutationProbeCase.axisScores.__contractProbe = 999;
assert.equal(
  mutationProbeAssetScore.inputs.axisScores[axisKey],
  axisValue,
  'AssetScoreSnapshot inputs.axisScores must be detached from later legacy Case mutation',
);
assert.equal(
  mutationProbeAssetScore.dimensions.d2.inputs?.[axisKey],
  axisValue,
  'AssetScoreSnapshot dimensions.d2.inputs must be detached from later legacy Case mutation',
);
assert.ok(
  !Object.prototype.hasOwnProperty.call(mutationProbeAssetScore.inputs.axisScores, '__contractProbe'),
  'AssetScoreSnapshot inputs.axisScores must not observe later legacy Case axis additions',
);
assert.ok(
  !Object.prototype.hasOwnProperty.call(mutationProbeAssetScore.dimensions.d2.inputs || {}, '__contractProbe'),
  'AssetScoreSnapshot dimensions.d2.inputs must not observe later legacy Case axis additions',
);

const ownerReadiness = assertDoesNotMutate('buildOwnerDecisionReadinessSnapshotFromLegacyCase', world, () =>
  buildOwnerDecisionReadinessSnapshotFromLegacyCase(world, caseItem));
assert.equal(
  ownerReadiness.modelId,
  'owner-decision-readiness',
  'Expected OwnerDecisionReadinessSnapshot to exist separately from AssetScoreSnapshot',
);
assert.equal(ownerReadiness.inputs.trust, caseItem.trust, 'Expected owner readiness inputs to include trust');
assert.equal(ownerReadiness.inputs.urgency, caseItem.urgency, 'Expected owner readiness inputs to include urgency');
assert.equal(ownerReadiness.inputs.patience, caseItem.patience, 'Expected owner readiness inputs to include patience');
assert.ok(ownerReadiness.dimensions.trust, 'Expected owner readiness dimensions to include trust');
assert.ok(ownerReadiness.dimensions.urgency, 'Expected owner readiness dimensions to include urgency');
assert.ok(ownerReadiness.dimensions.patience, 'Expected owner readiness dimensions to include patience');

const caseEvaluations = assertDoesNotMutate('buildCaseEvaluationSnapshotsFromLegacyState', world, () =>
  buildCaseEvaluationSnapshotsFromLegacyState(world, caseItem));
assert.notEqual(
  caseEvaluations.assetScore.modelId,
  caseEvaluations.ownerDecisionReadiness.modelId,
  'Expected owner readiness to remain a separate evaluation snapshot',
);

const projections: Array<readonly [string, () => unknown]> = [
  ['matter workspace projection', () => buildMatterWorkspaceProjection(world)],
  ['today plan workspace projection', () => buildTodayPlanWorkspaceProjection(world)],
  ['broker workspace view', () => buildBrokerWorkspaceView(world)],
  ['owner workspace view', () => buildOwnerWorkspaceView(world)],
  ['manager workspace view', () => buildManagerWorkspaceView(world)],
] as const;

for (const [label, buildProjection] of projections) {
  const projection = assertDoesNotMutate(label, world, buildProjection);
  assertDeepFrozen(projection, label);
}

console.log('selling-houses world model contract verification passed');
