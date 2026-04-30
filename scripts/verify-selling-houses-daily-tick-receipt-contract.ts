import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';

import type { DailyTickResult, GameState, TickInvariantAlert } from '../src/selling-houses/domain/models.js';
import { readDailyProcessResultReadModels } from '../src/selling-houses/runtime/simulation/dailyProcessResult.js';

const receiptModulePath = '../src/selling-houses/runtime/simulation/dailyTickReceipt.js';
const receiptSourcePath = 'src/selling-houses/runtime/simulation/dailyTickReceipt.ts';

function stableSnapshot(value: unknown) {
  return JSON.stringify(value);
}

function assertReadonlyReceiptTypes(receiptForTypes: {
  readonly dirtyScopeCounts: {
    readonly cases: number;
  };
  readonly processResults: readonly {
    readonly emittedEventIds: readonly string[];
  }[];
  readonly settledDayProcessResults: readonly {
    readonly phase: string;
    readonly opportunityIds: readonly string[];
  }[];
  readonly nextDaySetupProcessResults: readonly {
    readonly phase: string;
    readonly productRunIds: readonly string[];
  }[];
  readonly emittedEventIds: readonly string[];
}) {
  if (false) {
    // @ts-expect-error receipt count objects are readonly DTOs.
    receiptForTypes.dirtyScopeCounts.cases = 99;
    // @ts-expect-error receipt process result arrays are readonly DTOs.
    receiptForTypes.processResults.push({ emittedEventIds: [] });
    // @ts-expect-error receipt process result rows are readonly DTOs.
    receiptForTypes.processResults[0].emittedEventIds = [];
    // @ts-expect-error receipt process result nested arrays are readonly DTOs.
    receiptForTypes.processResults[0].emittedEventIds.push('mutated');
    // @ts-expect-error receipt grouped rows are readonly DTOs.
    receiptForTypes.settledDayProcessResults[0].phase = 'next-day-setup';
    // @ts-expect-error receipt grouped nested arrays are readonly DTOs.
    receiptForTypes.nextDaySetupProcessResults[0].productRunIds.push('mutated');
    // @ts-expect-error receipt arrays are readonly DTOs.
    receiptForTypes.emittedEventIds.push('mutated');
  }
}

function makeDailyTickResult(invariantAlerts: TickInvariantAlert[] = [
  {
    level: 'warning',
    code: 'sample-warning',
    message: 'sample warning',
  },
]): DailyTickResult {
  return {
    day: 4,
    nextDay: 5,
    report: null,
    emittedEvents: [
      {
        id: 'event-1',
      },
      {
        id: 'event-2',
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
        day: 4,
        phase: 'settled-day',
        processedCount: 2,
        resolvedCount: 1,
        emittedEventIds: ['event-negotiation-1'],
        closedDealIds: ['deal-1'],
        opportunityIds: ['opp-1', 'opp-2'],
        productRunIds: [],
      },
      {
        managerId: 'product-run-process-manager',
        owner: 'runtime-process-manager',
        day: 5,
        phase: 'next-day-setup',
        processedCount: 1,
        resolvedCount: 1,
        emittedEventIds: ['event-product-run-1'],
        closedDealIds: [],
        opportunityIds: [],
        productRunIds: ['product-run-1', 'product-run-2'],
      },
      {
        managerId: 'negotiation-process-manager',
        owner: 'runtime-process-manager',
        outcomeOwner: 'legacy-deal-closing-engine',
        day: 4,
        phase: 'settled-day',
        processedCount: 1,
        resolvedCount: 1,
        emittedEventIds: ['event-invalid-negotiation-owner'],
        closedDealIds: ['deal-invalid-negotiation-owner'],
        opportunityIds: ['opp-invalid-negotiation-owner'],
        productRunIds: ['product-run-invalid-negotiation-owner'],
      },
      {
        managerId: 'negotiation-process-manager',
        owner: 'runtime-process-manager-facade',
        outcomeOwner: 'legacy-deal-closing-engine',
        day: 4,
        phase: 'next-day-setup',
        processedCount: 1,
        resolvedCount: 1,
        emittedEventIds: ['event-invalid-negotiation-phase'],
        closedDealIds: ['deal-invalid-negotiation-phase'],
        opportunityIds: ['opp-invalid-negotiation-phase'],
        productRunIds: ['product-run-invalid-negotiation-phase'],
      },
      {
        managerId: 'negotiation-process-manager',
        owner: 'runtime-process-manager-facade',
        outcomeOwner: 'legacy-deal-closing-engine',
        day: 5,
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
        outcomeOwner: 'legacy-deal-closing-engine',
        day: 5,
        phase: 'next-day-setup',
        processedCount: 1,
        resolvedCount: 1,
        emittedEventIds: ['event-invalid-product-run-outcome-owner'],
        closedDealIds: ['deal-invalid-product-run-outcome-owner'],
        opportunityIds: ['opp-invalid-product-run-outcome-owner'],
        productRunIds: ['product-run-invalid-product-run-outcome-owner'],
      },
      {
        managerId: 'product-run-process-manager',
        owner: 'runtime-process-manager',
        day: 4,
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
        day: 5,
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
      cases: ['case-1', 'case-2'],
      opportunities: ['opp-1'],
      customers: ['customer-1', 'customer-2', 'customer-3'],
      owners: ['owner-1'],
      districts: ['district-1', 'district-2'],
      marketCells: ['market-cell-1'],
      matters: ['matter-1', 'matter-2', 'matter-3', 'matter-4'],
      market: true,
      dashboard: false,
      result: true,
    },
    invariantAlerts,
  } as DailyTickResult;
}

if (!existsSync(receiptSourcePath)) {
  console.log('selling-houses daily tick receipt contract skipped: receipt runtime adapter is not present yet');
  process.exit(0);
}

const {
  buildDailyTickReceipt,
  buildLastDailyTickReceiptFromState,
} = await import(receiptModulePath);
assert.equal(typeof buildDailyTickReceipt, 'function', 'Expected buildDailyTickReceipt to be exported');
assert.equal(
  typeof buildLastDailyTickReceiptFromState,
  'function',
  'Expected buildLastDailyTickReceiptFromState to be exported',
);

const result = makeDailyTickResult();
const beforeReceipt = stableSnapshot(result);
const receipt = buildDailyTickReceipt(result);
assert.equal(stableSnapshot(result), beforeReceipt, 'Expected receipt builder not to mutate DailyTickResult');
assertReadonlyReceiptTypes(receipt);

const receiptProcessResults = readDailyProcessResultReadModels(result);
assert.deepEqual(
  receiptProcessResults.map((entry) => entry.day),
  [4, 5],
  'Expected receipt process result fixture to use explicit day fields instead of fallback tick day',
);
assert.deepEqual(
  receiptProcessResults.map((entry) => entry.phase),
  ['settled-day', 'next-day-setup'],
  'Expected receipt process result fixture to use explicit process phases',
);

assert.equal(receipt.receiptKind, 'daily_tick_receipt');
assert.equal(receipt.source, 'domain-daily-tick-result');
assert.equal(receipt.readOnly, true);
assert.equal(receipt.day, 4);
assert.equal(receipt.nextDay, 5);

assert.equal(receipt.emittedEventCount, 2);
assert.equal(receipt.closedDealCount, 1);
assert.equal(receipt.processResultCount, 2);
assert.equal(receipt.invariantAlertCount, 1);

assert.deepEqual(receipt.dirtyScopeCounts, {
  cases: 2,
  opportunities: 1,
  customers: 3,
  owners: 1,
  districts: 2,
  marketCells: 1,
  matters: 4,
  market: true,
  dashboard: false,
  result: true,
});
assert.deepEqual(receipt.processManagerCounts, {
  'negotiation-process-manager': 1,
  'product-run-process-manager': 1,
});

assert.ok(Array.isArray(receipt.processResults), 'Expected receipt to expose structured process results');
assert.ok(Array.isArray(receipt.settledDayProcessResults), 'Expected receipt to expose grouped settled-day process results');
assert.ok(Array.isArray(receipt.nextDaySetupProcessResults), 'Expected receipt to expose grouped next-day setup process results');
assert.deepEqual(
  receipt.processResults.map((entry) => ({
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
      day: 4,
      phase: 'settled-day',
      emittedEventIds: ['event-negotiation-1'],
      closedDealIds: ['deal-1'],
      opportunityIds: ['opp-1', 'opp-2'],
      productRunIds: [],
    },
    {
      managerId: 'product-run-process-manager',
      owner: 'runtime-process-manager',
      outcomeOwner: undefined,
      day: 5,
      phase: 'next-day-setup',
      emittedEventIds: ['event-product-run-1'],
      closedDealIds: [],
      opportunityIds: [],
      productRunIds: ['product-run-1', 'product-run-2'],
    },
  ],
  'Expected receipt.processResults to preserve managerId/owner/day/phase/ids for valid process rows only',
);
assert.deepEqual(
  receipt.settledDayProcessResults.map((entry) => ({
    managerId: entry.managerId,
    day: entry.day,
    phase: entry.phase,
    opportunityIds: entry.opportunityIds,
    productRunIds: entry.productRunIds,
  })),
  [
    {
      managerId: 'negotiation-process-manager',
      day: 4,
      phase: 'settled-day',
      opportunityIds: ['opp-1', 'opp-2'],
      productRunIds: [],
    },
  ],
  'Expected receipt to group settled-day process rows separately from next-day setup rows',
);
assert.deepEqual(
  receipt.nextDaySetupProcessResults.map((entry) => ({
    managerId: entry.managerId,
    day: entry.day,
    phase: entry.phase,
    opportunityIds: entry.opportunityIds,
    productRunIds: entry.productRunIds,
  })),
  [
    {
      managerId: 'product-run-process-manager',
      day: 5,
      phase: 'next-day-setup',
      opportunityIds: [],
      productRunIds: ['product-run-1', 'product-run-2'],
    },
  ],
  'Expected receipt to group next-day setup process rows separately from settled-day rows',
);
const receiptProductRun = receipt.processResults.find((entry) => entry.managerId === 'product-run-process-manager');
assert.equal(receiptProductRun?.day, receipt.nextDay, 'Expected product-run receipt row to be assigned to nextDay');
assert.equal(
  receiptProductRun?.phase,
  'next-day-setup',
  'Expected product-run receipt row to use the next-day setup phase',
);
assert.equal(
  receipt.processResults.some((entry) => entry.emittedEventIds.includes('event-invalid-negotiation-phase')),
  false,
  'Expected receipt.processResults to drop negotiation rows with the product-run phase',
);
assert.equal(
  receipt.processResults.some((entry) => entry.emittedEventIds.includes('event-invalid-negotiation-day')),
  false,
  'Expected receipt.processResults to drop negotiation rows with the product-run day',
);
assert.equal(
  receipt.processResults.some((entry) => entry.emittedEventIds.includes('event-invalid-product-run-phase')),
  false,
  'Expected receipt.processResults to drop product run rows with the negotiation phase',
);
assert.equal(
  receipt.processResults.some((entry) => entry.emittedEventIds.includes('event-invalid-product-run-day')),
  false,
  'Expected receipt.processResults to drop product run rows with the negotiation day',
);
assert.equal(
  receipt.settledDayProcessResults.some((entry) =>
    entry.emittedEventIds.some((id) => id.includes('invalid'))
      || entry.closedDealIds.some((id) => id.includes('invalid'))
      || entry.opportunityIds.some((id) => id.includes('invalid'))
      || entry.productRunIds.some((id) => id.includes('invalid'))),
  false,
  'Expected receipt settled-day group to exclude every invalid wrong-owner, wrong-day, and wrong-phase row',
);
assert.equal(
  receipt.nextDaySetupProcessResults.some((entry) =>
    entry.emittedEventIds.some((id) => id.includes('invalid'))
      || entry.closedDealIds.some((id) => id.includes('invalid'))
      || entry.opportunityIds.some((id) => id.includes('invalid'))
      || entry.productRunIds.some((id) => id.includes('invalid'))),
  false,
  'Expected receipt next-day setup group to exclude every invalid wrong-owner, wrong-day, and wrong-phase row',
);

assert.deepEqual(receipt.emittedEventIds, ['event-1', 'event-2']);
assert.deepEqual(receipt.closedDealIds, ['deal-1']);
assert.deepEqual(receipt.processOpportunityIds, ['opp-1', 'opp-2']);
assert.deepEqual(receipt.processProductRunIds, ['product-run-1', 'product-run-2']);
assert.equal(
  receipt.processOpportunityIds.includes('opp-invalid-negotiation-owner'),
  false,
  'Expected receipt to drop opportunity ids from invalid negotiation ownership rows',
);
assert.equal(
  receipt.processOpportunityIds.includes('opp-invalid-negotiation-phase'),
  false,
  'Expected receipt to drop opportunity ids from negotiation rows with the product-run phase',
);
assert.equal(
  receipt.processOpportunityIds.includes('opp-invalid-negotiation-day'),
  false,
  'Expected receipt to drop opportunity ids from negotiation rows with the product-run day',
);
assert.equal(
  receipt.processProductRunIds.includes('product-run-invalid-product-run-outcome-owner'),
  false,
  'Expected receipt to drop product run ids from invalid product run ownership rows',
);
assert.equal(
  receipt.processProductRunIds.includes('product-run-invalid-product-run-phase'),
  false,
  'Expected receipt to drop product run ids from product run rows with the negotiation phase',
);
assert.equal(
  receipt.processProductRunIds.includes('product-run-invalid-product-run-day'),
  false,
  'Expected receipt to drop product run ids from product run rows with the negotiation day',
);

assert.notEqual(
  receipt.emittedEventIds,
  result.emittedEvents,
  'Expected emittedEventIds to be a copied array instead of aliasing emittedEvents',
);
assert.notEqual(
  receipt.closedDealIds,
  result.closedDeals,
  'Expected closedDealIds to be a copied array instead of aliasing closedDeals',
);
assert.notEqual(
  receipt.processOpportunityIds,
  result.processResults[0]?.opportunityIds,
  'Expected processOpportunityIds to be copied instead of aliasing process result opportunity ids',
);
assert.notEqual(
  receipt.processProductRunIds,
  result.processResults[1]?.productRunIds,
  'Expected processProductRunIds to be copied instead of aliasing process result product run ids',
);
assert.notEqual(
  receipt.processResults,
  result.processResults,
  'Expected processResults to be a copied array instead of aliasing source processResults',
);
assert.notEqual(
  receipt.processResults[0],
  result.processResults[0],
  'Expected processResults rows to be copied instead of aliasing source process result rows',
);
assert.notEqual(
  receipt.processResults[0]?.opportunityIds,
  result.processResults[0]?.opportunityIds,
  'Expected structured process result opportunity ids to be copied instead of aliasing source ids',
);
assert.notEqual(
  receipt.processResults[1]?.productRunIds,
  result.processResults[1]?.productRunIds,
  'Expected structured process result product run ids to be copied instead of aliasing source ids',
);
assert.notEqual(
  receipt.settledDayProcessResults,
  receipt.processResults,
  'Expected settled-day process result group to be a distinct copied array',
);
assert.notEqual(
  receipt.settledDayProcessResults[0],
  receipt.processResults[0],
  'Expected settled-day grouped row to be copied instead of aliasing flat process result row',
);
assert.notEqual(
  receipt.settledDayProcessResults[0]?.opportunityIds,
  result.processResults[0]?.opportunityIds,
  'Expected settled-day grouped ids to be copied instead of aliasing source process result ids',
);
assert.notEqual(
  receipt.nextDaySetupProcessResults,
  receipt.processResults,
  'Expected next-day setup process result group to be a distinct copied array',
);
assert.notEqual(
  receipt.nextDaySetupProcessResults[0],
  receipt.processResults[1],
  'Expected next-day setup grouped row to be copied instead of aliasing flat process result row',
);
assert.notEqual(
  receipt.nextDaySetupProcessResults[0]?.productRunIds,
  result.processResults[1]?.productRunIds,
  'Expected next-day setup grouped ids to be copied instead of aliasing source process result ids',
);

assert.ok(Object.isFrozen(receipt), 'Expected receipt to be frozen');
assert.ok(Object.isFrozen(receipt.dirtyScopeCounts), 'Expected dirty scope counts to be frozen');
assert.ok(Object.isFrozen(receipt.processManagerCounts), 'Expected process manager counts to be frozen');
assert.ok(Object.isFrozen(receipt.processResults), 'Expected structured process results to be frozen');
assert.ok(Object.isFrozen(receipt.settledDayProcessResults), 'Expected settled-day process results to be frozen');
assert.ok(Object.isFrozen(receipt.nextDaySetupProcessResults), 'Expected next-day setup process results to be frozen');
assert.ok(Object.isFrozen(receipt.processResults[0]), 'Expected structured process result rows to be frozen');
assert.ok(
  Object.isFrozen(receipt.processResults[0]?.emittedEventIds),
  'Expected structured process result emitted event ids to be frozen',
);
assert.ok(
  Object.isFrozen(receipt.processResults[0]?.opportunityIds),
  'Expected structured process result opportunity ids to be frozen',
);
assert.ok(
  Object.isFrozen(receipt.processResults[1]?.productRunIds),
  'Expected structured process result product run ids to be frozen',
);
assert.ok(Object.isFrozen(receipt.emittedEventIds), 'Expected emitted event ids to be frozen');
assert.ok(Object.isFrozen(receipt.closedDealIds), 'Expected closed deal ids to be frozen');
assert.ok(Object.isFrozen(receipt.processOpportunityIds), 'Expected process opportunity ids to be frozen');
assert.ok(Object.isFrozen(receipt.processProductRunIds), 'Expected process product run ids to be frozen');

assert.throws(
  () => {
    (receipt.dirtyScopeCounts as { cases: number }).cases = 99;
  },
  TypeError,
  'Expected dirty scope count mutation to be blocked by freeze',
);
assert.throws(
  () => {
    (receipt.emittedEventIds as string[]).push('mutated');
  },
  TypeError,
  'Expected emitted event id mutation to be blocked by freeze',
);
assert.throws(
  () => {
    (receipt.processResults as unknown[]).push({});
  },
  TypeError,
  'Expected structured process result array mutation to be blocked by freeze',
);
assert.throws(
  () => {
    (receipt.processResults[0] as { phase: string }).phase = 'next-day-setup';
  },
  TypeError,
  'Expected structured process result row mutation to be blocked by freeze',
);
assert.throws(
  () => {
    (receipt.processResults[0]?.opportunityIds as string[]).push('mutated');
  },
  TypeError,
  'Expected structured process result nested id mutation to be blocked by freeze',
);
assert.throws(
  () => {
    (receipt.settledDayProcessResults as unknown[]).push({});
  },
  TypeError,
  'Expected settled-day group mutation to be blocked by freeze',
);
assert.throws(
  () => {
    (receipt.nextDaySetupProcessResults[0]?.productRunIds as string[]).push('mutated');
  },
  TypeError,
  'Expected next-day setup grouped nested ids mutation to be blocked by freeze',
);
assert.equal(
  stableSnapshot(result),
  beforeReceipt,
  'Expected failed receipt mutation probes not to write back to DailyTickResult',
);

result.emittedEvents.push({ id: 'event-added-after-receipt-build' } as DailyTickResult['emittedEvents'][number]);
result.closedDeals.push({ dealId: 'deal-added-after-receipt-build' } as DailyTickResult['closedDeals'][number]);
result.processResults[0]?.opportunityIds.push('opp-added-after-receipt-build');
result.processResults[1]?.productRunIds.push('product-run-added-after-receipt-build');
result.processResults[0]!.phase = 'next-day-setup';
result.processResults.push({
  managerId: 'product-run-process-manager',
  owner: 'runtime-process-manager',
  day: 5,
  phase: 'next-day-setup',
  processedCount: 1,
  resolvedCount: 1,
  emittedEventIds: ['event-added-after-receipt-build'],
  closedDealIds: [],
  opportunityIds: [],
  productRunIds: ['product-run-added-after-receipt-build-2'],
});
assert.deepEqual(
  receipt.emittedEventIds,
  ['event-1', 'event-2'],
  'Expected emittedEventIds to stay stable after source emittedEvents array mutation',
);
assert.deepEqual(
  receipt.closedDealIds,
  ['deal-1'],
  'Expected closedDealIds to stay stable after source closedDeals array mutation',
);
assert.deepEqual(
  receipt.processOpportunityIds,
  ['opp-1', 'opp-2'],
  'Expected processOpportunityIds to stay stable after source process result array mutation',
);
assert.deepEqual(
  receipt.processProductRunIds,
  ['product-run-1', 'product-run-2'],
  'Expected processProductRunIds to stay stable after source process result array mutation',
);
assert.deepEqual(
  receipt.processResults.map((entry) => ({
    managerId: entry.managerId,
    day: entry.day,
    phase: entry.phase,
    opportunityIds: entry.opportunityIds,
    productRunIds: entry.productRunIds,
  })),
  [
    {
      managerId: 'negotiation-process-manager',
      day: 4,
      phase: 'settled-day',
      opportunityIds: ['opp-1', 'opp-2'],
      productRunIds: [],
    },
    {
      managerId: 'product-run-process-manager',
      day: 5,
      phase: 'next-day-setup',
      opportunityIds: [],
      productRunIds: ['product-run-1', 'product-run-2'],
    },
  ],
  'Expected receipt.processResults to stay stable after source process result row and nested array mutation',
);
assert.deepEqual(
  receipt.settledDayProcessResults.map((entry) => entry.opportunityIds),
  [['opp-1', 'opp-2']],
  'Expected grouped settled-day rows to stay stable after source mutation',
);
assert.deepEqual(
  receipt.nextDaySetupProcessResults.map((entry) => entry.productRunIds),
  [['product-run-1', 'product-run-2']],
  'Expected grouped next-day setup rows to stay stable after source mutation',
);

assert.equal(receipt.maxInvariantLevel, 'warning');
assert.equal(
  buildDailyTickReceipt(makeDailyTickResult([
    {
      level: 'error',
      code: 'sample-error',
      message: 'sample error',
    },
  ])).maxInvariantLevel,
  'error',
);
assert.equal(buildDailyTickReceipt(makeDailyTickResult([])).maxInvariantLevel, 'none');
assert.equal(
  buildDailyTickReceipt(makeDailyTickResult([
    {
      level: 'warning',
      code: 'sample-warning',
      message: 'sample warning',
    },
    {
      level: 'error',
      code: 'sample-error',
      message: 'sample error',
    },
  ])).maxInvariantLevel,
  'error',
  'Expected error invariant level to dominate warning',
);

assert.equal(
  buildLastDailyTickReceiptFromState({ day: 5, lastDailyTickResult: null } as unknown as GameState),
  null,
  'Expected buildLastDailyTickReceiptFromState to return null when state has no lastDailyTickResult',
);

console.log('selling-houses daily tick receipt contract verification passed');
