import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';

import type { GameState } from '../src/selling-houses/domain/models.js';

const projectionModulePath = '../src/selling-houses/interface/interaction-workspace/processResultBoundary.js';
const projectionSourcePath = 'src/selling-houses/interface/interaction-workspace/processResultBoundary.ts';

function stableSnapshot(value: unknown) {
  return JSON.stringify(value);
}

function assertReadonlyProjectionTypes(projectionForTypes: {
  readonly results: readonly {
    readonly managerId: string;
    readonly emittedEventIds: readonly string[];
  }[];
  readonly settledDayResults: readonly {
    readonly phase: string;
    readonly opportunityIds: readonly string[];
  }[];
  readonly nextDaySetupResults: readonly {
    readonly phase: string;
    readonly productRunIds: readonly string[];
  }[];
}) {
  if (false) {
    const result = projectionForTypes.results[0];
    if (result) {
      // @ts-expect-error process result projection entries are readonly DTOs.
      result.managerId = 'mutated';
      // @ts-expect-error nested process result arrays are readonly DTOs.
      result.emittedEventIds.push('mutated');
      // @ts-expect-error grouped process result entries are readonly DTOs.
      projectionForTypes.settledDayResults[0].phase = 'next-day-setup';
      // @ts-expect-error grouped process result nested arrays are readonly DTOs.
      projectionForTypes.nextDaySetupResults[0].productRunIds.push('mutated');
    }
  }
}

const state = {
  day: 9,
  lastDailyTickResult: {
    day: 8,
    nextDay: 9,
    report: null,
    emittedEvents: [],
    closedDeals: [],
    processResults: [
      {
        managerId: 'negotiation-process-manager',
        owner: 'runtime-process-manager-facade',
        outcomeOwner: 'legacy-deal-closing-engine',
        day: 8,
        phase: 'settled-day',
        processedCount: 2,
        resolvedCount: 1,
        emittedEventIds: ['event-negotiation-1'],
        closedDealIds: ['deal-case-1-customer-1'],
        opportunityIds: ['opp-1'],
        productRunIds: [],
      },
      {
        managerId: 'product-run-process-manager',
        owner: 'runtime-process-manager',
        day: 9,
        phase: 'next-day-setup',
        processedCount: 1,
        resolvedCount: 0,
        emittedEventIds: ['event-product-run-1'],
        closedDealIds: [],
        opportunityIds: [],
        productRunIds: ['product-run-open-day-1'],
      },
      {
        managerId: 'negotiation-process-manager',
        owner: 'runtime-process-manager',
        outcomeOwner: 'legacy-deal-closing-engine',
        day: 8,
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
        day: 8,
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
        day: 9,
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
        day: 9,
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
        day: 8,
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
        day: 9,
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
  },
} as unknown as GameState;

if (!existsSync(projectionSourcePath)) {
  console.log('selling-houses process results projection contract skipped: projection boundary is not present yet');
  process.exit(0);
}

const { buildProcessResultWorkspaceProjection } = await import(projectionModulePath);
assert.equal(
  typeof buildProcessResultWorkspaceProjection,
  'function',
  'Expected process result workspace projection builder to be exported',
);

const beforeProjection = stableSnapshot(state);
const projection = buildProcessResultWorkspaceProjection(state);
assert.equal(
  stableSnapshot(state),
  beforeProjection,
  'Expected process result workspace projection not to mutate GameState',
);
assertReadonlyProjectionTypes(projection);

assert.equal(projection.projectionKind, 'process_result_adapter_state');
assert.equal(projection.source, 'last_daily_tick_result');
assert.equal(projection.readOnly, true);
assert.equal(projection.day, 8, 'Expected projection day to derive from lastDailyTickResult');
assert.equal(projection.settledDay, 8, 'Expected projection to expose the settled day explicitly');
assert.equal(projection.nextDay, 9, 'Expected projection to expose the next-day setup day explicitly');
assert.equal(projection.processResultCount, 2);
assert.equal(
  projection.processResultCount,
  projection.results.length,
  'Expected processResultCount to mirror projected result entries',
);
assert.deepEqual(projection.byManager, {
  'negotiation-process-manager': 1,
  'product-run-process-manager': 1,
});
assert.deepEqual(
  projection.results.map((entry: { managerId: string }) => entry.managerId),
  ['negotiation-process-manager', 'product-run-process-manager'],
  'Expected projection results to preserve daily process result ordering',
);
assert.deepEqual(
  projection.settledDayResults.map((entry: { managerId: string; day: number; phase: string }) => ({
    managerId: entry.managerId,
    day: entry.day,
    phase: entry.phase,
  })),
  [{ managerId: 'negotiation-process-manager', day: 8, phase: 'settled-day' }],
  'Expected projection to group settled-day process rows separately from next-day setup rows',
);
assert.deepEqual(
  projection.nextDaySetupResults.map((entry: { managerId: string; day: number; phase: string }) => ({
    managerId: entry.managerId,
    day: entry.day,
    phase: entry.phase,
  })),
  [{ managerId: 'product-run-process-manager', day: 9, phase: 'next-day-setup' }],
  'Expected projection to group next-day setup process rows separately from settled-day rows',
);

const negotiation = projection.results[0];
assert.equal(negotiation.owner, 'runtime-process-manager-facade');
assert.equal(negotiation.outcomeOwner, 'legacy-deal-closing-engine');
assert.equal(negotiation.day, 8);
assert.equal(negotiation.phase, 'settled-day');
assert.deepEqual(negotiation.emittedEventIds, ['event-negotiation-1']);
assert.deepEqual(negotiation.closedDealIds, ['deal-case-1-customer-1']);
assert.deepEqual(negotiation.opportunityIds, ['opp-1']);
assert.deepEqual(negotiation.productRunIds, []);

const productRun = projection.results[1];
assert.equal(productRun.managerId, 'product-run-process-manager');
assert.equal(productRun.owner, 'runtime-process-manager');
assert.equal(productRun.outcomeOwner, undefined);
assert.equal(productRun.day, 9);
assert.equal(productRun.phase, 'next-day-setup');
assert.deepEqual(productRun.emittedEventIds, ['event-product-run-1']);
assert.deepEqual(productRun.closedDealIds, []);
assert.deepEqual(productRun.opportunityIds, []);
assert.deepEqual(productRun.productRunIds, ['product-run-open-day-1']);
assert.equal(
  projection.results.some((entry: { emittedEventIds: readonly string[] }) =>
    entry.emittedEventIds.includes('event-invalid-negotiation-owner')),
  false,
  'Expected projection to drop invalid negotiation ownership rows',
);
assert.equal(
  projection.results.some((entry: { emittedEventIds: readonly string[] }) =>
    entry.emittedEventIds.includes('event-invalid-negotiation-phase')),
  false,
  'Expected projection to drop negotiation rows with the product-run phase',
);
assert.equal(
  projection.results.some((entry: { productRunIds: readonly string[] }) =>
    entry.productRunIds.includes('product-run-invalid-product-run-outcome-owner')),
  false,
  'Expected projection to drop invalid product run ownership rows',
);
assert.equal(
  projection.results.some((entry: { productRunIds: readonly string[] }) =>
    entry.productRunIds.includes('product-run-invalid-product-run-phase')),
  false,
  'Expected projection to drop product run rows with the negotiation phase',
);
assert.equal(
  projection.settledDayResults.some((entry: { emittedEventIds: readonly string[]; closedDealIds: readonly string[]; opportunityIds: readonly string[]; productRunIds: readonly string[] }) =>
    entry.emittedEventIds.some((id) => id.includes('invalid'))
      || entry.closedDealIds.some((id) => id.includes('invalid'))
      || entry.opportunityIds.some((id) => id.includes('invalid'))
      || entry.productRunIds.some((id) => id.includes('invalid'))),
  false,
  'Expected settled-day projection group to exclude every invalid wrong-owner, wrong-day, and wrong-phase row',
);
assert.equal(
  projection.nextDaySetupResults.some((entry: { emittedEventIds: readonly string[]; closedDealIds: readonly string[]; opportunityIds: readonly string[]; productRunIds: readonly string[] }) =>
    entry.emittedEventIds.some((id) => id.includes('invalid'))
      || entry.closedDealIds.some((id) => id.includes('invalid'))
      || entry.opportunityIds.some((id) => id.includes('invalid'))
      || entry.productRunIds.some((id) => id.includes('invalid'))),
  false,
  'Expected next-day setup projection group to exclude every invalid wrong-owner, wrong-day, and wrong-phase row',
);

const originalFirstResult = state.lastDailyTickResult?.processResults[0];
const originalSecondResult = state.lastDailyTickResult?.processResults[1];
assert.notEqual(
  negotiation,
  originalFirstResult,
  'Expected projection item to be derived as a read-only DTO instead of exposing raw state entries',
);
assert.notEqual(
  negotiation.emittedEventIds,
  originalFirstResult?.emittedEventIds,
  'Expected projection arrays to be copied instead of aliasing lastDailyTickResult.processResults',
);
assert.notEqual(
  projection.settledDayResults,
  projection.results,
  'Expected settled-day projection group to be a distinct copied array',
);
assert.notEqual(
  projection.settledDayResults[0],
  negotiation,
  'Expected settled-day projection grouped row to be copied instead of aliasing flat projection row',
);
assert.notEqual(
  projection.settledDayResults[0]?.opportunityIds,
  originalFirstResult?.opportunityIds,
  'Expected settled-day projection grouped ids to be copied instead of aliasing source ids',
);
assert.notEqual(
  projection.nextDaySetupResults,
  projection.results,
  'Expected next-day setup projection group to be a distinct copied array',
);
assert.notEqual(
  projection.nextDaySetupResults[0],
  productRun,
  'Expected next-day setup projection grouped row to be copied instead of aliasing flat projection row',
);
assert.notEqual(
  projection.nextDaySetupResults[0]?.productRunIds,
  originalSecondResult?.productRunIds,
  'Expected next-day setup projection grouped ids to be copied instead of aliasing source ids',
);

assert.ok(Object.isFrozen(projection), 'Expected process result projection to be frozen');
assert.ok(Object.isFrozen(projection.byManager), 'Expected process result manager counts to be frozen');
assert.ok(Object.isFrozen(projection.results), 'Expected process result list to be frozen');
assert.ok(Object.isFrozen(projection.settledDayResults), 'Expected settled-day process result list to be frozen');
assert.ok(Object.isFrozen(projection.nextDaySetupResults), 'Expected next-day setup process result list to be frozen');
assert.ok(Object.isFrozen(projection.results[0]), 'Expected process result entries to be frozen');
assert.ok(Object.isFrozen(projection.results[0]?.emittedEventIds), 'Expected emitted event ids to be frozen');
assert.ok(Object.isFrozen(projection.results[0]?.closedDealIds), 'Expected closed deal ids to be frozen');
assert.ok(Object.isFrozen(projection.results[0]?.opportunityIds), 'Expected opportunity ids to be frozen');
assert.ok(Object.isFrozen(projection.results[0]?.productRunIds), 'Expected product run ids to be frozen');

assert.throws(
  () => {
    (projection.results[0] as { processedCount: number }).processedCount = 99;
  },
  TypeError,
  'Expected process result projection mutation to be blocked by freeze',
);
assert.throws(
  () => {
    (projection.settledDayResults as unknown[]).push({});
  },
  TypeError,
  'Expected settled-day process result projection group mutation to be blocked by freeze',
);
assert.throws(
  () => {
    (projection.nextDaySetupResults[0]?.productRunIds as string[]).push('mutated');
  },
  TypeError,
  'Expected next-day setup process result projection grouped ids mutation to be blocked by freeze',
);
assert.equal(
  stableSnapshot(state),
  beforeProjection,
  'Expected failed process result projection mutation probe not to write back to GameState',
);

console.log('selling-houses process results projection contract verification passed');
