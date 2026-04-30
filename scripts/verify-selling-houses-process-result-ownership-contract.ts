import assert from 'node:assert/strict';

import { normalizeLoadedState, createInitialState } from '../src/selling-houses/application/gameState.js';
import {
  normalizeDailyProcessResultReadModel,
  readDailyProcessResultReadModels,
} from '../src/selling-houses/runtime/simulation/dailyProcessResult.js';
import { buildDailyTickReceipt } from '../src/selling-houses/runtime/simulation/dailyTickReceipt.js';
import { buildProcessResultWorkspaceProjection } from '../src/selling-houses/interface/interaction-workspace/processResultBoundary.js';
import { getScenarioSnapshotById } from '../src/selling-houses/domain/scenarioCatalog.js';
import type { GameState } from '../src/selling-houses/domain/models.js';

const validNegotiation = {
  managerId: 'negotiation-process-manager',
  owner: 'runtime-process-manager-facade',
  outcomeOwner: 'legacy-deal-closing-engine',
  day: 3,
  phase: 'settled-day',
  processedCount: 1,
  resolvedCount: 1,
  emittedEventIds: ['event-negotiation'],
  closedDealIds: ['deal-1'],
  opportunityIds: ['opp-1'],
  productRunIds: [],
};

const validProductRun = {
  managerId: 'product-run-process-manager',
  owner: 'runtime-process-manager',
  day: 4,
  phase: 'next-day-setup',
  processedCount: 1,
  resolvedCount: 0,
  emittedEventIds: ['event-product-run'],
  closedDealIds: [],
  opportunityIds: [],
  productRunIds: ['run-1'],
};

function withInvalidIds<T extends typeof validNegotiation | typeof validProductRun>(result: T, id: string): T {
  return {
    ...result,
    emittedEventIds: [`event-invalid-${id}`],
    closedDealIds: [`deal-invalid-${id}`],
    opportunityIds: [`opp-invalid-${id}`],
    productRunIds: [`run-invalid-${id}`],
  };
}

const invalidOwnershipCases = [
  {
    name: 'negotiation process result with direct runtime owner',
    result: withInvalidIds(
      {
        ...validNegotiation,
        owner: 'runtime-process-manager',
      },
      'negotiation-runtime-owner',
    ),
  },
  {
    name: 'negotiation process result without legacy outcome owner',
    result: withInvalidIds(
      {
        ...validNegotiation,
        outcomeOwner: undefined,
      },
      'negotiation-missing-outcome-owner',
    ),
  },
  {
    name: 'negotiation process result with direct runtime owner and no outcome owner',
    result: withInvalidIds(
      {
        ...validNegotiation,
        owner: 'runtime-process-manager',
        outcomeOwner: undefined,
      },
      'negotiation-runtime-owner-missing-outcome-owner',
    ),
  },
  {
    name: 'product run process result with facade owner',
    result: withInvalidIds(
      {
        ...validProductRun,
        owner: 'runtime-process-manager-facade',
      },
      'product-run-facade-owner',
    ),
  },
  {
    name: 'product run process result with legacy outcome owner',
    result: withInvalidIds(
      {
        ...validProductRun,
        outcomeOwner: 'legacy-deal-closing-engine',
      },
      'product-run-legacy-outcome-owner',
    ),
  },
  {
    name: 'product run process result with facade owner and legacy outcome owner',
    result: withInvalidIds(
      {
        ...validProductRun,
        owner: 'runtime-process-manager-facade',
        outcomeOwner: 'legacy-deal-closing-engine',
      },
      'product-run-facade-owner-legacy-outcome-owner',
    ),
  },
] as const;

const invalidPhaseCases = [
  {
    name: 'negotiation process result with next-day setup phase',
    result: withInvalidIds(
      {
        ...validNegotiation,
        phase: 'next-day-setup',
      },
      'negotiation-next-day-setup-phase',
    ),
  },
  {
    name: 'product run process result with settled-day phase',
    result: withInvalidIds(
      {
        ...validProductRun,
        phase: 'settled-day',
      },
      'product-run-settled-day-phase',
    ),
  },
] as const;

const invalidDayCases = [
  {
    name: 'negotiation process result with next-day setup day',
    result: withInvalidIds(
      {
        ...validNegotiation,
        day: 4,
      },
      'negotiation-next-day-setup-day',
    ),
  },
  {
    name: 'product run process result with settled-day day',
    result: withInvalidIds(
      {
        ...validProductRun,
        day: 3,
      },
      'product-run-settled-day',
    ),
  },
] as const;

const invalidResultCases = [
  ...invalidOwnershipCases,
  ...invalidPhaseCases,
] as const;

const invalidOwnershipIds = invalidResultCases.flatMap(({ result }) => [
  ...result.emittedEventIds,
  ...result.closedDealIds,
  ...result.opportunityIds,
  ...result.productRunIds,
]);

function assertNoInvalidOwnershipIds(actualIds: readonly string[], label: string) {
  for (const id of invalidOwnershipIds) {
    assert.equal(actualIds.includes(id), false, `Expected ${label} to drop invalid ownership id ${id}`);
  }
}

function withoutExplicitDay<T extends { readonly day: number }>(result: T): Omit<T, 'day'> {
  return Object.fromEntries(
    Object.entries(result).filter(([key]) => key !== 'day'),
  ) as Omit<T, 'day'>;
}

assert.ok(
  normalizeDailyProcessResultReadModel(validNegotiation),
  'Expected valid negotiation process ownership to normalize',
);
assert.equal(
  normalizeDailyProcessResultReadModel(validNegotiation)?.day,
  3,
  'Expected valid negotiation process day to normalize from the explicit summary field',
);
assert.equal(
  normalizeDailyProcessResultReadModel(validNegotiation)?.phase,
  'settled-day',
  'Expected valid negotiation process phase to normalize from the explicit summary field',
);
assert.ok(
  normalizeDailyProcessResultReadModel(validProductRun),
  'Expected valid product run process ownership to normalize',
);
assert.equal(
  normalizeDailyProcessResultReadModel(validProductRun)?.day,
  4,
  'Expected valid product run process day to normalize from the explicit summary field',
);
assert.equal(
  normalizeDailyProcessResultReadModel(validProductRun)?.phase,
  'next-day-setup',
  'Expected valid product run process phase to normalize from the explicit summary field',
);

for (const { name, result } of invalidOwnershipCases) {
  assert.equal(
    normalizeDailyProcessResultReadModel(result),
    null,
    `Expected normalizer to reject ${name}`,
  );
}
for (const { name, result } of invalidPhaseCases) {
  assert.equal(
    normalizeDailyProcessResultReadModel(result),
    null,
    `Expected normalizer to reject ${name}`,
  );
}
assert.equal(
  normalizeDailyProcessResultReadModel(invalidDayCases[0].result, { expectedDay: 3 }),
  null,
  `Expected normalizer to reject ${invalidDayCases[0].name} when the settled day is known`,
);
assert.equal(
  normalizeDailyProcessResultReadModel(invalidDayCases[1].result, { expectedDay: 4 }),
  null,
  `Expected normalizer to reject ${invalidDayCases[1].name} when nextDay is known`,
);
assert.deepEqual(
  readDailyProcessResultReadModels({
    day: 3,
    processResults: [withoutExplicitDay(validProductRun)],
  }),
  [],
  'Expected source-level read model to reject product-run rows without explicit day when nextDay is missing',
);
assert.deepEqual(
  readDailyProcessResultReadModels({
    nextDay: 4,
    processResults: [withoutExplicitDay(validNegotiation)],
  }),
  [],
  'Expected source-level read model to reject negotiation rows without explicit day when settled day is missing',
);

const tickResult = {
  day: 3,
  nextDay: 4,
  report: null,
  emittedEvents: [],
  closedDeals: [],
  processResults: [
    validNegotiation,
    ...invalidResultCases.map((entry) => entry.result),
    validProductRun,
  ],
  dirtyScopes: {
    cases: [],
    opportunities: [],
    customers: [],
    owners: [],
    districts: [],
    marketCells: [],
    matters: [],
    market: false,
    dashboard: false,
    result: false,
  },
  invariantAlerts: [],
};

const receipt = buildDailyTickReceipt(tickResult);
assert.equal(
  receipt.processResultCount,
  2,
  'Expected daily tick receipt to count only process results with valid ownership combinations',
);
assert.deepEqual(receipt.processManagerCounts, {
  'negotiation-process-manager': 1,
  'product-run-process-manager': 1,
});
assertNoInvalidOwnershipIds(receipt.processOpportunityIds, 'daily tick receipt process opportunity ids');
assertNoInvalidOwnershipIds(receipt.processProductRunIds, 'daily tick receipt process product run ids');
assert.deepEqual(
  receipt.processResults.map((entry) => ({
    managerId: entry.managerId,
    owner: entry.owner,
    outcomeOwner: entry.outcomeOwner,
    day: entry.day,
    phase: entry.phase,
    opportunityIds: entry.opportunityIds,
    productRunIds: entry.productRunIds,
  })),
  [
    {
      managerId: 'negotiation-process-manager',
      owner: 'runtime-process-manager-facade',
      outcomeOwner: 'legacy-deal-closing-engine',
      day: 3,
      phase: 'settled-day',
      opportunityIds: ['opp-1'],
      productRunIds: [],
    },
    {
      managerId: 'product-run-process-manager',
      owner: 'runtime-process-manager',
      outcomeOwner: undefined,
      day: 4,
      phase: 'next-day-setup',
      opportunityIds: [],
      productRunIds: ['run-1'],
    },
  ],
  'Expected daily tick receipt structured process results to preserve only valid manager ownership, day, and phase combinations',
);
assertNoInvalidOwnershipIds(
  receipt.processResults.flatMap((entry) => entry.emittedEventIds),
  'daily tick receipt structured emitted event ids',
);
assertNoInvalidOwnershipIds(
  receipt.processResults.flatMap((entry) => entry.closedDealIds),
  'daily tick receipt structured closed deal ids',
);
assertNoInvalidOwnershipIds(
  receipt.processResults.flatMap((entry) => entry.opportunityIds),
  'daily tick receipt structured opportunity ids',
);
assertNoInvalidOwnershipIds(
  receipt.processResults.flatMap((entry) => entry.productRunIds),
  'daily tick receipt structured product run ids',
);

const projection = buildProcessResultWorkspaceProjection({
  day: 4,
  lastDailyTickResult: tickResult,
} as unknown as GameState);
assert.equal(
  projection.processResultCount,
  2,
  'Expected process result workspace projection to expose only valid ownership combinations',
);
assert.deepEqual(
  projection.results.map((entry) => entry.managerId),
  ['negotiation-process-manager', 'product-run-process-manager'],
);
assert.deepEqual(
  projection.results.map((entry) => entry.day),
  [3, 4],
  'Expected process result workspace projection to preserve process result day values',
);
assert.deepEqual(
  projection.results.map((entry) => entry.phase),
  ['settled-day', 'next-day-setup'],
  'Expected process result workspace projection to preserve process result phases',
);
assertNoInvalidOwnershipIds(
  projection.results.flatMap((entry) => entry.emittedEventIds),
  'process result projection emitted event ids',
);
assertNoInvalidOwnershipIds(
  projection.results.flatMap((entry) => entry.closedDealIds),
  'process result projection closed deal ids',
);
assertNoInvalidOwnershipIds(
  projection.results.flatMap((entry) => entry.opportunityIds),
  'process result projection opportunity ids',
);
assertNoInvalidOwnershipIds(
  projection.results.flatMap((entry) => entry.productRunIds),
  'process result projection product run ids',
);

const snapshot = getScenarioSnapshotById('standard-window-chain');
assert.ok(snapshot, 'Expected standard-window-chain scenario to exist');
if (!snapshot) {
  throw new Error('Expected standard-window-chain scenario to exist');
}

const state = createInitialState(snapshot, 20260430);
const hydrated = normalizeLoadedState({
  ...state,
  lastDailyTickResult: tickResult,
});
assert.ok(hydrated, 'Expected state with mixed process ownership results to hydrate');
assert.equal(
  hydrated?.lastDailyTickResult?.processResults.length,
  2,
  'Expected save hydration to drop process result rows with invalid ownership combinations',
);
assert.deepEqual(
  hydrated?.lastDailyTickResult?.processResults.map((entry) => entry.managerId),
  ['negotiation-process-manager', 'product-run-process-manager'],
  'Expected save hydration to preserve only valid process result ownership combinations',
);
assert.deepEqual(
  hydrated?.lastDailyTickResult?.processResults.map((entry) => entry.day),
  [3, 4],
  'Expected save hydration to preserve process result day values',
);
assert.deepEqual(
  hydrated?.lastDailyTickResult?.processResults.map((entry) => entry.phase),
  ['settled-day', 'next-day-setup'],
  'Expected save hydration to preserve process result phases',
);
assertNoInvalidOwnershipIds(
  hydrated?.lastDailyTickResult?.processResults.flatMap((entry) => entry.emittedEventIds) ?? [],
  'save hydration emitted event ids',
);
assertNoInvalidOwnershipIds(
  hydrated?.lastDailyTickResult?.processResults.flatMap((entry) => entry.closedDealIds) ?? [],
  'save hydration closed deal ids',
);
assertNoInvalidOwnershipIds(
  hydrated?.lastDailyTickResult?.processResults.flatMap((entry) => entry.opportunityIds) ?? [],
  'save hydration opportunity ids',
);
assertNoInvalidOwnershipIds(
  hydrated?.lastDailyTickResult?.processResults.flatMap((entry) => entry.productRunIds) ?? [],
  'save hydration product run ids',
);

console.log('selling-houses process result ownership contract verification passed');
