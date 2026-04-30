import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';

import type { DailyTickResult, GameState } from '../src/selling-houses/domain/models.js';

const projectionModulePath = '../src/selling-houses/interface/interaction-workspace/dailyTickReceiptBoundary.js';
const projectionSourcePath = 'src/selling-houses/interface/interaction-workspace/dailyTickReceiptBoundary.ts';

function stableSnapshot(value: unknown) {
  return JSON.stringify(value);
}

function makeDailyTickResult(): DailyTickResult {
  return {
    day: 6,
    nextDay: 7,
    report: null,
    emittedEvents: [
      {
        id: 'event-1',
      },
    ],
    closedDeals: [
      {
        dealId: 'deal-1',
      },
    ],
    processResults: [
      {
        managerId: 'negotiation-process-manager',
        owner: 'runtime-process-manager-facade',
        outcomeOwner: 'legacy-deal-closing-engine',
        day: 6,
        phase: 'settled-day',
        processedCount: 1,
        resolvedCount: 1,
        emittedEventIds: ['event-1'],
        closedDealIds: ['deal-1'],
        opportunityIds: ['opp-1'],
        productRunIds: [],
      },
      {
        managerId: 'product-run-process-manager',
        owner: 'runtime-process-manager',
        day: 7,
        phase: 'next-day-setup',
        processedCount: 1,
        resolvedCount: 1,
        emittedEventIds: ['event-product-run-1'],
        closedDealIds: [],
        opportunityIds: [],
        productRunIds: ['product-run-1'],
      },
      {
        managerId: 'negotiation-process-manager',
        owner: 'runtime-process-manager-facade',
        outcomeOwner: 'legacy-deal-closing-engine',
        day: 7,
        phase: 'settled-day',
        processedCount: 1,
        resolvedCount: 1,
        emittedEventIds: ['event-invalid-negotiation-day'],
        closedDealIds: ['deal-invalid-negotiation-day'],
        opportunityIds: ['opp-invalid-negotiation-day'],
        productRunIds: ['product-run-invalid-negotiation-day'],
      },
      {
        managerId: 'product-run-process-manager',
        owner: 'runtime-process-manager',
        day: 6,
        phase: 'next-day-setup',
        processedCount: 1,
        resolvedCount: 1,
        emittedEventIds: ['event-invalid-product-run-day'],
        closedDealIds: ['deal-invalid-product-run-day'],
        opportunityIds: ['opp-invalid-product-run-day'],
        productRunIds: ['product-run-invalid-product-run-day'],
      },
      {
        managerId: 'product-run-process-manager',
        owner: 'runtime-process-manager',
        day: 7,
        phase: 'settled-day',
        processedCount: 1,
        resolvedCount: 1,
        emittedEventIds: ['event-invalid-product-run-phase'],
        closedDealIds: ['deal-invalid-product-run-phase'],
        opportunityIds: ['opp-invalid-product-run-phase'],
        productRunIds: ['product-run-invalid-product-run-phase'],
      },
    ],
    dirtyScopes: {
      cases: ['case-1'],
      opportunities: ['opp-1'],
      customers: ['customer-1'],
      owners: ['owner-1'],
      districts: ['district-1'],
      marketCells: ['market-cell-1'],
      matters: ['matter-1'],
      market: false,
      dashboard: true,
      result: false,
    },
    invariantAlerts: [],
  } as DailyTickResult;
}

if (!existsSync(projectionSourcePath)) {
  console.log(
    'selling-houses workspace daily tick receipt contract skipped: receipt workspace projection is not present yet',
  );
  process.exit(0);
}

const { buildDailyTickReceiptWorkspaceProjection } = await import(projectionModulePath);
assert.equal(
  typeof buildDailyTickReceiptWorkspaceProjection,
  'function',
  'Expected buildDailyTickReceiptWorkspaceProjection to be exported',
);

const state = {
  day: 7,
  lastDailyTickResult: makeDailyTickResult(),
} as unknown as GameState;

const beforeProjection = stableSnapshot(state);
const projection = buildDailyTickReceiptWorkspaceProjection(state);
assert.equal(
  stableSnapshot(state),
  beforeProjection,
  'Expected daily tick receipt workspace projection not to mutate GameState',
);

assert.equal(projection.projectionKind, 'daily_tick_receipt_adapter_state');
assert.equal(projection.source, 'runtime-daily-tick-receipt');
assert.equal(projection.readOnly, true);
assert.equal(projection.day, 6);
assert.ok(projection.receipt, 'Expected projection receipt to be present when state has lastDailyTickResult');
assert.notEqual(
  projection.receipt,
  state.lastDailyTickResult,
  'Expected projection receipt to be a read-only adapter DTO instead of raw state',
);
assert.equal(projection.receipt.processResultCount, 2);
assert.deepEqual(projection.receipt.processManagerCounts, {
  'negotiation-process-manager': 1,
  'product-run-process-manager': 1,
});
assert.deepEqual(
  projection.receipt.processResults.map((entry) => ({
    managerId: entry.managerId,
    owner: entry.owner,
    outcomeOwner: entry.outcomeOwner,
    day: entry.day,
    phase: entry.phase,
    emittedEventIds: entry.emittedEventIds,
    closedDealIds: entry.closedDealIds,
    opportunityIds: entry.opportunityIds,
    productRunIds: entry.productRunIds,
  })),
  [
    {
      managerId: 'negotiation-process-manager',
      owner: 'runtime-process-manager-facade',
      outcomeOwner: 'legacy-deal-closing-engine',
      day: 6,
      phase: 'settled-day',
      emittedEventIds: ['event-1'],
      closedDealIds: ['deal-1'],
      opportunityIds: ['opp-1'],
      productRunIds: [],
    },
    {
      managerId: 'product-run-process-manager',
      owner: 'runtime-process-manager',
      outcomeOwner: undefined,
      day: 7,
      phase: 'next-day-setup',
      emittedEventIds: ['event-product-run-1'],
      closedDealIds: [],
      opportunityIds: [],
      productRunIds: ['product-run-1'],
    },
  ],
  'Expected workspace receipt to expose structured process results with managerId/owner/day/phase/ids',
);
assert.deepEqual(
  projection.receipt.settledDayProcessResults.map((entry) => ({
    managerId: entry.managerId,
    day: entry.day,
    phase: entry.phase,
    opportunityIds: entry.opportunityIds,
    productRunIds: entry.productRunIds,
  })),
  [
    {
      managerId: 'negotiation-process-manager',
      day: 6,
      phase: 'settled-day',
      opportunityIds: ['opp-1'],
      productRunIds: [],
    },
  ],
  'Expected workspace receipt to expose grouped settled-day process results',
);
assert.deepEqual(
  projection.receipt.nextDaySetupProcessResults.map((entry) => ({
    managerId: entry.managerId,
    day: entry.day,
    phase: entry.phase,
    opportunityIds: entry.opportunityIds,
    productRunIds: entry.productRunIds,
  })),
  [
    {
      managerId: 'product-run-process-manager',
      day: 7,
      phase: 'next-day-setup',
      opportunityIds: [],
      productRunIds: ['product-run-1'],
    },
  ],
  'Expected workspace receipt to expose grouped next-day setup process results',
);
assert.equal(
  projection.receipt.processResults.find((entry) => entry.managerId === 'product-run-process-manager')?.day,
  projection.receipt.nextDay,
  'Expected workspace product-run receipt row to be assigned to nextDay',
);
assert.equal(
  projection.receipt.processResults.find((entry) => entry.managerId === 'product-run-process-manager')?.phase,
  'next-day-setup',
  'Expected workspace product-run receipt row to use the next-day setup phase',
);
assert.equal(
  projection.receipt.processResults.some((entry) => entry.emittedEventIds.includes('event-invalid-negotiation-day')),
  false,
  'Expected workspace receipt.processResults to drop negotiation rows with the product-run day',
);
assert.equal(
  projection.receipt.processResults.some((entry) => entry.emittedEventIds.includes('event-invalid-product-run-day')),
  false,
  'Expected workspace receipt.processResults to drop product run rows with the negotiation day',
);
assert.equal(
  projection.receipt.processResults.some((entry) => entry.emittedEventIds.includes('event-invalid-product-run-phase')),
  false,
  'Expected workspace receipt.processResults to drop product run rows with the negotiation phase',
);
assert.equal(
  projection.receipt.settledDayProcessResults.some((entry) =>
    entry.emittedEventIds.some((id) => id.includes('invalid'))
      || entry.closedDealIds.some((id) => id.includes('invalid'))
      || entry.opportunityIds.some((id) => id.includes('invalid'))
      || entry.productRunIds.some((id) => id.includes('invalid'))),
  false,
  'Expected workspace receipt settled-day group to exclude invalid wrong-day and wrong-phase rows',
);
assert.equal(
  projection.receipt.nextDaySetupProcessResults.some((entry) =>
    entry.emittedEventIds.some((id) => id.includes('invalid'))
      || entry.closedDealIds.some((id) => id.includes('invalid'))
      || entry.opportunityIds.some((id) => id.includes('invalid'))
      || entry.productRunIds.some((id) => id.includes('invalid'))),
  false,
  'Expected workspace receipt next-day setup group to exclude invalid wrong-day and wrong-phase rows',
);
assert.deepEqual(projection.receipt.processOpportunityIds, ['opp-1']);
assert.deepEqual(projection.receipt.processProductRunIds, ['product-run-1']);
assert.equal(
  projection.receipt.processOpportunityIds.includes('opp-invalid-negotiation-day'),
  false,
  'Expected workspace legacy opportunity ids to drop wrong-day rows',
);
assert.equal(
  projection.receipt.processProductRunIds.includes('product-run-invalid-product-run-day'),
  false,
  'Expected workspace legacy product run ids to drop wrong-day rows',
);
assert.equal(
  projection.receipt.processProductRunIds.includes('product-run-invalid-product-run-phase'),
  false,
  'Expected workspace legacy product run ids to drop wrong-phase rows',
);
assert.notEqual(
  projection.receipt.processResults,
  state.lastDailyTickResult?.processResults,
  'Expected workspace receipt processResults to be copied instead of aliasing state processResults',
);
assert.notEqual(
  projection.receipt.processResults[0],
  state.lastDailyTickResult?.processResults[0],
  'Expected workspace receipt process result rows to be copied instead of aliasing state rows',
);
assert.notEqual(
  projection.receipt.processResults[0]?.opportunityIds,
  state.lastDailyTickResult?.processResults[0]?.opportunityIds,
  'Expected workspace receipt structured id arrays to be copied instead of aliasing state ids',
);
assert.notEqual(
  projection.receipt.settledDayProcessResults,
  projection.receipt.processResults,
  'Expected workspace receipt settled-day group to be a distinct copied array',
);
assert.notEqual(
  projection.receipt.settledDayProcessResults[0],
  projection.receipt.processResults[0],
  'Expected workspace receipt settled-day grouped row to be copied instead of aliasing flat receipt row',
);
assert.notEqual(
  projection.receipt.settledDayProcessResults[0]?.opportunityIds,
  state.lastDailyTickResult?.processResults[0]?.opportunityIds,
  'Expected workspace receipt settled-day grouped ids to be copied instead of aliasing state ids',
);
assert.notEqual(
  projection.receipt.nextDaySetupProcessResults,
  projection.receipt.processResults,
  'Expected workspace receipt next-day setup group to be a distinct copied array',
);
assert.notEqual(
  projection.receipt.nextDaySetupProcessResults[0],
  projection.receipt.processResults[1],
  'Expected workspace receipt next-day setup grouped row to be copied instead of aliasing flat receipt row',
);
assert.notEqual(
  projection.receipt.nextDaySetupProcessResults[0]?.productRunIds,
  state.lastDailyTickResult?.processResults[1]?.productRunIds,
  'Expected workspace receipt next-day setup grouped ids to be copied instead of aliasing state ids',
);
assert.ok(Object.isFrozen(projection), 'Expected daily tick receipt workspace projection to be frozen');
assert.ok(Object.isFrozen(projection.receipt), 'Expected projected daily tick receipt to be frozen');
assert.ok(
  Object.isFrozen(projection.receipt?.processResults),
  'Expected projected daily tick receipt process results to be frozen',
);
assert.ok(
  Object.isFrozen(projection.receipt?.settledDayProcessResults),
  'Expected projected daily tick receipt settled-day process results to be frozen',
);
assert.ok(
  Object.isFrozen(projection.receipt?.nextDaySetupProcessResults),
  'Expected projected daily tick receipt next-day setup process results to be frozen',
);
assert.ok(
  Object.isFrozen(projection.receipt?.processResults[0]),
  'Expected projected daily tick receipt process result rows to be frozen',
);
assert.ok(
  Object.isFrozen(projection.receipt?.processResults[0]?.opportunityIds),
  'Expected projected daily tick receipt process result id arrays to be frozen',
);
assert.ok(
  Object.isFrozen(projection.receipt?.emittedEventIds),
  'Expected projected daily tick receipt arrays to be frozen',
);
assert.ok(
  Object.isFrozen(projection.receipt?.processProductRunIds),
  'Expected projected daily tick receipt process product run ids to be frozen',
);

assert.throws(
  () => {
    (projection.receipt as { emittedEventIds: string[] }).emittedEventIds.push('mutated');
  },
  TypeError,
  'Expected projected daily tick receipt mutation to be blocked by freeze',
);
assert.throws(
  () => {
    (projection.receipt as { processResults: unknown[] }).processResults.push({});
  },
  TypeError,
  'Expected projected daily tick receipt processResults mutation to be blocked by freeze',
);
assert.throws(
  () => {
    (projection.receipt as { processResults: { phase: string }[] }).processResults[0].phase = 'next-day-setup';
  },
  TypeError,
  'Expected projected daily tick receipt process result row mutation to be blocked by freeze',
);
assert.throws(
  () => {
    (projection.receipt as { processResults: { opportunityIds: string[] }[] }).processResults[0].opportunityIds.push('mutated');
  },
  TypeError,
  'Expected projected daily tick receipt process result nested ids mutation to be blocked by freeze',
);
assert.throws(
  () => {
    (projection.receipt as { settledDayProcessResults: unknown[] }).settledDayProcessResults.push({});
  },
  TypeError,
  'Expected projected daily tick receipt settled-day group mutation to be blocked by freeze',
);
assert.throws(
  () => {
    (projection.receipt as { nextDaySetupProcessResults: { productRunIds: string[] }[] }).nextDaySetupProcessResults[0].productRunIds.push('mutated');
  },
  TypeError,
  'Expected projected daily tick receipt next-day setup grouped ids mutation to be blocked by freeze',
);
assert.equal(
  stableSnapshot(state),
  beforeProjection,
  'Expected failed projection mutation probe not to write back to GameState',
);

const stateWithoutReceipt = {
  day: 12,
  lastDailyTickResult: null,
} as unknown as GameState;
const nullProjection = buildDailyTickReceiptWorkspaceProjection(stateWithoutReceipt);
assert.equal(nullProjection.projectionKind, 'daily_tick_receipt_adapter_state');
assert.equal(nullProjection.source, 'runtime-daily-tick-receipt');
assert.equal(nullProjection.readOnly, true);
assert.equal(nullProjection.day, 12);
assert.equal(
  nullProjection.receipt,
  null,
  'Expected projection.receipt to stay null when state has no lastDailyTickResult',
);

console.log('selling-houses workspace daily tick receipt contract verification passed');
