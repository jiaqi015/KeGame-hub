import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import type { Case, GameState, Opportunity } from '../src/selling-houses/domain/models.js';
import {
  settleNegotiationProcessesForDay,
} from '../src/selling-houses/runtime/simulation/processes/index.js';

const engineSource = readFileSync('src/selling-houses/domain/engine.ts', 'utf8');
const managerSource = readFileSync(
  'src/selling-houses/runtime/simulation/processes/negotiationProcessManager.ts',
  'utf8',
);

function buildCase(): Case {
  return {
    id: 'case-negotiation-manager',
    title: '流程经理验证房源',
    district: '静安',
    marketCellId: 'cell-jingan',
    ownerName: '流程业主',
    maintainerName: '流程经纪人',
    status: 'active',
    askPrice: 500,
    marketPrice: 500,
    bottomPrice: 470,
    trust: 100,
    competitiveness: 100,
    personality: 'pragmatic',
    d1: 80,
    d2: 80,
    d3: 80,
  } as Case;
}

function buildOpportunity(): Opportunity {
  return {
    id: 'opp-negotiation-manager',
    caseId: 'case-negotiation-manager',
    customerId: 'customer-negotiation-manager',
    customerName: '流程客户',
    profile: 'ready to close',
    channelId: 'private-referral',
    channelName: '私域转介绍',
    fit: 100,
    intent: 100,
    confidence: 100,
    stageIndex: 4,
    stageLabel: '报价斡旋',
    status: 'active',
    lifecycleStatus: 'active',
    leadSource: 'direct',
    visibility: 'revealed',
    createdDay: 1,
    daysLeft: 3,
    touchedToday: true,
    budgetMax: 520,
    priceSensitivity: 30,
    stagnationTicks: 0,
    pendingClosingEvaluation: true,
    pendingClosingStrategyId: 'close',
    pendingClosingRequestedDay: 2,
    history: [],
  } as Opportunity;
}

function buildMinimalState(): GameState {
  return {
    day: 2,
    currentDate: '2026-04-30',
    cases: [buildCase()],
    opportunities: [buildOpportunity()],
    customerStates: [],
    closedDeals: [],
    eventStore: [],
    eventLog: [],
    auxiliaryStats: {
      soldCount: 0,
      commission: 0,
      wordOfMouth: 50,
    },
    budgetLedger: [],
    marketOutcome: {
      totalCapacity21d: 1,
      playerBaseDealSlots: 1,
      playerBonusDealSlots: 0,
      playerClaimedDeals: 0,
      rivalClaimedDeals: 0,
      delayedDeals: 0,
      releasedSlots: 1,
      slotSchedule: [],
    },
    rules: {
      outcomeControl: {
        playerDealClosingScale: 1,
        playerBonusDealUnlockScore: 100,
      },
      promotionRebateFloor: 0,
      promotionRebateRatio: 0,
    },
  } as unknown as GameState;
}

const state = buildMinimalState();
const result = settleNegotiationProcessesForDay(state);

assert.equal(result.managerId, 'negotiation-process-manager');
assert.equal(result.settlementEntryOwner, 'runtime-process-manager-facade');
assert.equal(result.settlementOutcomeOwner, 'legacy-deal-closing-engine');
assert.deepEqual(result.pendingBefore, ['opp-negotiation-manager']);
assert.deepEqual(result.pendingAfter, []);
assert.deepEqual(result.resolvedOpportunityIds, ['opp-negotiation-manager']);
assert.equal(result.closedDeals.length, 1, 'Expected facade result to expose legacy closed deals');
assert.equal(result.closedDeals[0]?.sourceRelationId, 'opp-negotiation-manager');
assert.ok(result.emittedEvents.length > 0, 'Expected facade result to expose legacy settlement events');
assert.equal(
  state.opportunities[0]?.pendingClosingEvaluation,
  false,
  'Expected legacy settlement to clear the pending closing flag through the facade',
);
assert.equal(state.cases[0]?.status, 'sold', 'Expected legacy settlement outcome to remain effective through the facade');
assert.ok(Object.isFrozen(result), 'Expected negotiation process manager result to be frozen');
assert.ok(Object.isFrozen(result.pendingBefore), 'Expected pendingBefore list to be frozen');
assert.ok(Object.isFrozen(result.pendingAfter), 'Expected pendingAfter list to be frozen');
assert.ok(Object.isFrozen(result.resolvedOpportunityIds), 'Expected resolvedOpportunityIds list to be frozen');
assert.ok(Object.isFrozen(result.emittedEvents), 'Expected emittedEvents list to be frozen');
assert.ok(Object.isFrozen(result.closedDeals), 'Expected closedDeals list to be frozen');
assert.ok(
  engineSource.includes('settleNegotiationProcessesForDay(state)'),
  'Expected daily engine tick to settle negotiations through the runtime process manager facade',
);
assert.ok(
  !engineSource.includes('settlePendingDealClosings(state)'),
  'Expected daily engine tick not to call legacy settlePendingDealClosings directly',
);
assert.ok(
  managerSource.includes('settlePendingDealClosings(state)'),
  'Expected NegotiationProcessManager facade to delegate outcomes to legacy settlement for now',
);

assert.throws(() => {
  (result.resolvedOpportunityIds as string[]).push('polluted');
}, TypeError, 'Expected negotiation process manager result arrays to be immutable');

console.log('selling-houses negotiation process manager contract verification passed');
