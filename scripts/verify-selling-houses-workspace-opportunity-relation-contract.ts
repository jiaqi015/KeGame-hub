import assert from 'node:assert/strict';

import {
  buildOpportunityRelationWorkspaceProjection,
  type OpportunityRelationWorkspaceProjection,
} from '../src/selling-houses/interface/interaction-workspace/opportunityRelationBoundary.js';
import type { GameState, Opportunity } from '../src/selling-houses/domain/models.js';

function stableSnapshot(value: unknown) {
  return JSON.stringify(value);
}

function assertDoesNotMutate<T>(name: string, state: GameState, fn: () => T): T {
  const before = stableSnapshot(state);
  const result = fn();
  assert.equal(stableSnapshot(state), before, `${name} should not mutate legacy GameState`);
  return result;
}

function assertMutationProbeDoesNotMutateState(name: string, state: GameState, fn: () => void) {
  const before = stableSnapshot(state);
  assert.throws(fn, TypeError, `${name} should be blocked by projection freeze`);
  assert.equal(stableSnapshot(state), before, `${name} should not mutate legacy GameState`);
}

function assertReadonlyOpportunityProjectionTypes(projectionForTypes: OpportunityRelationWorkspaceProjection) {
  if (false) {
    const relation = projectionForTypes.relations[0];
    if (relation) {
      // @ts-expect-error relation entries are deeply readonly DTOs.
      relation.stageIndex = 99;
      // @ts-expect-error nested conflict flags are deeply readonly DTOs.
      relation.conflictFlags.stageIndex = false;
      if (relation.legacyOpportunity) {
        // @ts-expect-error nested legacy opportunity metadata is deeply readonly.
        relation.legacyOpportunity.daysLeft = 9;
      }
      if (relation.customerRuntime) {
        // @ts-expect-error nested customer runtime metadata is deeply readonly.
        relation.customerRuntime.advisorTrust = 0;
      }
    }
  }
}

function buildOpportunity(overrides: Partial<Opportunity>): Opportunity {
  return {
    id: 'opp-merged-conflict',
    caseId: 'case-merged-conflict',
    customerId: 'customer-merged-conflict',
    customerName: '合同验证客户',
    profile: 'contract customer',
    channelId: 'private-referral',
    channelName: '私域转介绍',
    fit: 80,
    intent: 82,
    confidence: 74,
    stageIndex: 3,
    stageLabel: '已看房',
    status: 'active',
    lifecycleStatus: 'active',
    leadSource: 'direct',
    visibility: 'revealed',
    createdDay: 2,
    daysLeft: 4,
    touchedToday: false,
    budgetMax: 620,
    priceSensitivity: 55,
    stagnationTicks: 0,
    history: [],
    ...overrides,
  };
}

const state = {
  version: 1,
  runId: 'workspace-opportunity-relation-contract',
  localRevision: 7,
  clientUpdatedAt: '2026-04-29T00:00:00.000Z',
  saveSource: 'manual',
  runContext: {},
  day: 5,
  maxDay: 21,
  currentDate: '2026-04-29',
  maxEnergy: 10,
  energy: 10,
  cash: 0,
  auxiliaryStats: {},
  selectedCaseId: null,
  gameOver: false,
  finalResult: null,
  lastMessage: '',
  rules: {},
  scheduledEvents: [],
  competitionGroups: [],
  rngState: 1,
  rngCalls: 0,
  cases: [],
  opportunities: [
    buildOpportunity({
      id: 'opp-merged-conflict',
      caseId: 'case-merged-conflict',
      customerId: 'customer-merged-conflict',
      status: 'active',
      lifecycleStatus: 'active',
      intent: 82,
      confidence: 74,
      stageIndex: 3,
    }),
    buildOpportunity({
      id: 'opp-opportunity-only-lost',
      caseId: 'case-opportunity-only-lost',
      customerId: 'customer-opportunity-only',
      status: 'lost',
      lifecycleStatus: 'lost',
      daysLeft: 0,
      intent: 41,
      confidence: 38,
      stageIndex: 1,
      stageLabel: '初步沟通',
    }),
    buildOpportunity({
      id: 'opp-opportunity-only-closed',
      caseId: 'case-opportunity-only-closed',
      customerId: 'customer-opportunity-only',
      status: 'closed',
      lifecycleStatus: 'closed_by_deal',
      daysLeft: 0,
      intent: 92,
      confidence: 88,
      stageIndex: 5,
      stageLabel: '成交',
    }),
  ],
  budgetLedger: [],
  eventLog: [],
  eventStore: [],
  weeklyReviews: [],
  markets: [],
  customers: [],
  customerStates: [
    {
      customerId: 'customer-merged-conflict',
      status: 'engaged',
      decisionStyle: 'balanced',
      advisorTrust: 60,
      fatigue: 14,
      churnRisk: 20,
      activeCaseIds: ['case-merged-conflict'],
      caseStates: {
        'case-merged-conflict': {
          caseId: 'case-merged-conflict',
          fit: 77,
          interest: 66,
          confidence: 51,
          stageIndex: 2,
          interactions: 2,
          lastActiveDay: 5,
          viewed: true,
          offered: false,
          selected: true,
          competingCaseIds: ['case-rival-merged'],
        },
      },
      lastTouchDay: 5,
      lastActionNote: '合同验证',
    },
    {
      customerId: 'customer-runtime-only',
      status: 'browsing',
      decisionStyle: 'decisive',
      advisorTrust: 58,
      fatigue: 8,
      churnRisk: 18,
      activeCaseIds: ['case-runtime-only'],
      caseStates: {
        'case-runtime-only': {
          caseId: 'case-runtime-only',
          fit: 72,
          interest: 70,
          confidence: 64,
          stageIndex: 1,
          interactions: 1,
          lastActiveDay: 5,
          viewed: false,
          offered: false,
          selected: true,
          competingCaseIds: ['case-rival-runtime-only'],
        },
      },
      lastTouchDay: 5,
    },
  ],
  channels: [],
} as unknown as GameState;

const projection = assertDoesNotMutate('buildOpportunityRelationWorkspaceProjection', state, () =>
  buildOpportunityRelationWorkspaceProjection(state));
assertReadonlyOpportunityProjectionTypes(projection);

assert.equal(projection.projectionKind, 'opportunity_relation_adapter_state');
assert.equal(projection.source, 'legacy-game-state');
assert.equal(projection.readOnly, true);
assert.equal(projection.day, 5);
assert.equal(projection.summary.total, 4);
assert.equal(projection.summary.merged, 1);
assert.equal(projection.summary.opportunityOnly, 2);
assert.equal(projection.summary.runtimeOnly, 1);
assert.equal(projection.summary.conflictCount, 1);
assert.equal(projection.summary.activeCount, 2);
assert.equal(projection.summary.lostOrClosedCount, 2);
assert.equal(projection.relations.length, 4);

const byId = new Map(projection.relations.map((entry) => [entry.id, entry]));
const merged = byId.get('customer-case-opportunity-relation:merged:opp-merged-conflict');
assert.ok(merged, 'Expected merged conflict relation to surface');
assert.equal(merged.source, 'merged');
assert.deepEqual(merged.conflictFlags, {
  fit: true,
  stageIndex: true,
  intent: true,
  confidence: true,
});
assert.equal(merged.fit, 80, 'Expected workspace relation to keep canonical Opportunity fit');
assert.equal(merged.canonicalOpportunityMetadata?.status, 'active');
assert.equal(merged.legacyOpportunity?.status, merged.canonicalOpportunityMetadata?.status);

const opportunityOnlyLost = byId.get('customer-case-opportunity-relation:opportunity:opp-opportunity-only-lost');
assert.ok(opportunityOnlyLost, 'Expected opportunity-only lost relation to surface');
assert.equal(opportunityOnlyLost.source, 'opportunity');
assert.equal(opportunityOnlyLost.legacyOpportunity?.status, 'lost');
assert.equal(opportunityOnlyLost.legacyOpportunity?.lifecycleStatus, 'lost');

const opportunityOnlyClosed = byId.get('customer-case-opportunity-relation:opportunity:opp-opportunity-only-closed');
assert.ok(opportunityOnlyClosed, 'Expected opportunity-only closed relation to surface');
assert.equal(opportunityOnlyClosed.legacyOpportunity?.status, 'closed');
assert.equal(opportunityOnlyClosed.legacyOpportunity?.lifecycleStatus, 'closed_by_deal');

const runtimeOnly = byId.get('customer-case-opportunity-relation:customer-runtime:customer-runtime-only:case-runtime-only');
assert.ok(runtimeOnly, 'Expected runtime-only relation to surface');
assert.equal(runtimeOnly.source, 'customer-runtime');
assert.equal(runtimeOnly.legacyOpportunityId, undefined);
assert.equal(runtimeOnly.canonicalOpportunityMetadata, undefined);
assert.equal(runtimeOnly.customerRuntime?.active, true);

assert.ok(Object.isFrozen(projection), 'Expected workspace projection to be frozen');
assert.ok(Object.isFrozen(projection.summary), 'Expected projection summary to be frozen');
assert.ok(Object.isFrozen(projection.relations), 'Expected relation list to be frozen');
assert.ok(Object.isFrozen(merged), 'Expected relation entries to be frozen');
assert.ok(Object.isFrozen(merged.conflictFlags), 'Expected relation conflict flags to be frozen');
assert.ok(Object.isFrozen(merged.legacyOpportunity), 'Expected nested legacy opportunity metadata to be frozen');
assert.ok(Object.isFrozen(merged.customerRuntime), 'Expected nested customer runtime metadata to be frozen');
assert.ok(
  Object.isFrozen(merged.customerRuntime?.competingAssetCaseIds),
  'Expected nested relation arrays to be frozen',
);

assertMutationProbeDoesNotMutateState('relation entry mutation probe', state, () => {
  (merged as unknown as { stageIndex: number }).stageIndex = 99;
});
assertMutationProbeDoesNotMutateState('relation nested object mutation probe', state, () => {
  (merged.conflictFlags as unknown as { stageIndex: boolean }).stageIndex = false;
});
assertMutationProbeDoesNotMutateState('relation nested array mutation probe', state, () => {
  (merged.customerRuntime?.competingAssetCaseIds as unknown as string[]).push('case-mutated');
});

console.log('selling-houses workspace opportunity relation contract verification passed');
