import assert from 'node:assert/strict';

import { buildCustomerCaseOpportunityRelationView } from '../src/selling-houses/core/world-state/opportunity-relations/index.js';
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

function buildOpportunity(overrides: Partial<Opportunity>): Opportunity {
  return {
    id: 'opp-merged',
    caseId: 'case-merged',
    customerId: 'customer-merged',
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
  runId: 'opportunity-relation-contract',
  localRevision: 1,
  clientUpdatedAt: '2026-04-29T00:00:00.000Z',
  saveSource: 'manual',
  runContext: {},
  day: 3,
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
      id: 'opp-merged',
      caseId: 'case-merged',
      customerId: 'customer-merged',
      intent: 82,
      confidence: 74,
      stageIndex: 3,
      status: 'active',
      lifecycleStatus: 'active',
    }),
    buildOpportunity({
      id: 'opp-only-lost',
      caseId: 'case-opportunity-only',
      customerId: 'customer-opportunity-only',
      intent: 41,
      confidence: 38,
      stageIndex: 1,
      stageLabel: '初步沟通',
      status: 'lost',
      lifecycleStatus: 'lost',
      daysLeft: 0,
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
      customerId: 'customer-merged',
      status: 'engaged',
      decisionStyle: 'balanced',
      advisorTrust: 60,
      fatigue: 14,
      churnRisk: 20,
      activeCaseIds: ['case-merged'],
      caseStates: {
        'case-merged': {
          caseId: 'case-merged',
          fit: 77,
          interest: 66,
          confidence: 51,
          stageIndex: 2,
          interactions: 2,
          lastActiveDay: 3,
          viewed: true,
          offered: false,
          selected: true,
          competingCaseIds: ['case-runtime-only'],
        },
      },
      lastTouchDay: 3,
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
          lastActiveDay: 3,
          viewed: false,
          offered: false,
          selected: true,
        },
      },
      lastTouchDay: 3,
    },
  ],
  channels: [],
} as unknown as GameState;

const relations = assertDoesNotMutate('buildCustomerCaseOpportunityRelationView', state, () =>
  buildCustomerCaseOpportunityRelationView(state));

assert.equal(relations.length, 3, 'Expected merged, opportunity-only, and runtime-only relations');

const byId = new Map(relations.map((entry) => [entry.id, entry]));
const merged = byId.get('customer-case-opportunity-relation:merged:opp-merged');
assert.ok(merged, 'Expected explicit Opportunity plus runtime caseState to merge');
assert.equal(merged.source, 'merged');
assert.equal(merged.legacyOpportunityId, 'opp-merged');
assert.equal(merged.customerId, 'customer:customer-merged');
assert.equal(merged.caseId, 'case-merged');
assert.equal(merged.assetCaseId, 'asset-case:case-merged');
assert.equal(merged.fit, 80, 'Expected explicit Opportunity fit to remain primary');
assert.equal(merged.intent, 82, 'Expected explicit Opportunity intent to remain primary');
assert.equal(merged.confidence, 74, 'Expected explicit Opportunity confidence to remain primary');
assert.equal(merged.stageIndex, 3, 'Expected explicit Opportunity stage to remain primary');
assert.deepEqual(merged.conflictFlags, {
  fit: true,
  stageIndex: true,
  intent: true,
  confidence: true,
});
assert.equal(merged.canonicalOpportunityMetadata?.status, 'active');
assert.equal(merged.legacyOpportunity?.status, merged.canonicalOpportunityMetadata?.status);
assert.equal(merged.customerRuntime?.selected, true);
assert.deepEqual(merged.customerRuntime?.competingAssetCaseIds, ['asset-case:case-runtime-only']);

const opportunityOnly = byId.get('customer-case-opportunity-relation:opportunity:opp-only-lost');
assert.ok(opportunityOnly, 'Expected opportunity-only relation to surface');
assert.equal(opportunityOnly.source, 'opportunity');
assert.equal(opportunityOnly.legacyOpportunity?.status, 'lost');
assert.equal(opportunityOnly.legacyOpportunity?.lifecycleStatus, 'lost');
assert.equal(opportunityOnly.intent, 41, 'Expected lost opportunity to remain visible unless caller filters it');

const runtimeOnly = byId.get('customer-case-opportunity-relation:customer-runtime:customer-runtime-only:case-runtime-only');
assert.ok(runtimeOnly, 'Expected runtime-only caseState relation to surface');
assert.equal(runtimeOnly.source, 'customer-runtime');
assert.equal(runtimeOnly.legacyOpportunityId, undefined);
assert.equal(runtimeOnly.customerId, 'customer:customer-runtime-only');
assert.equal(runtimeOnly.caseId, 'case-runtime-only');
assert.equal(runtimeOnly.intent, 70);
assert.equal(runtimeOnly.confidence, 64);
assert.equal(runtimeOnly.stageIndex, 1);
assert.deepEqual(runtimeOnly.conflictFlags, {
  fit: false,
  stageIndex: false,
  intent: false,
  confidence: false,
});

console.log('selling-houses opportunity relation contract verification passed');
