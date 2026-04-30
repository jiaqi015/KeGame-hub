import assert from 'node:assert/strict';

import { createInitialState, normalizeLoadedState } from '../src/selling-houses/application/gameState.js';
import { seedInitialOpportunities } from '../src/selling-houses/domain/engine.js';
import { getScenarioSnapshotById } from '../src/selling-houses/domain/scenarioCatalog.js';

const snapshot = getScenarioSnapshotById('standard-window-chain');
assert.ok(snapshot, 'Expected standard-window-chain scenario to exist');
if (!snapshot) {
  throw new Error('Expected standard-window-chain scenario to exist');
}

const world = createInitialState(snapshot, 20260430);
seedInitialOpportunities(world);

const validNegotiationProcessResult = {
  managerId: 'negotiation-process-manager',
  owner: 'runtime-process-manager-facade',
  outcomeOwner: 'legacy-deal-closing-engine',
  day: 3,
  phase: 'settled-day',
  processedCount: 1,
  resolvedCount: 1,
  emittedEventIds: ['event-negotiation'],
  closedDealIds: ['deal-negotiation'],
  opportunityIds: ['opp-negotiation'],
  productRunIds: [],
};

const validProductRunProcessResult = {
  managerId: 'product-run-process-manager',
  owner: 'runtime-process-manager',
  day: 4,
  phase: 'next-day-setup',
  processedCount: 1,
  resolvedCount: 0,
  emittedEventIds: ['event-product-run'],
  closedDealIds: [],
  opportunityIds: [],
  productRunIds: ['product-run-open-day'],
};

const legacyPersistedState = {
  ...world,
  version: 6,
  lastDailyTickResult: {
    day: 3,
    nextDay: 4,
    report: null,
    emittedEvents: [],
    closedDeals: [],
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
};

const normalized = normalizeLoadedState(legacyPersistedState);
assert.ok(normalized, 'Expected legacy persisted state to hydrate through normalizeLoadedState');
if (!normalized) {
  throw new Error('Expected legacy persisted state to hydrate');
}

assert.ok(normalized.lastDailyTickResult, 'Expected lastDailyTickResult to be preserved during hydration');
assert.equal(normalized.lastDailyTickResult?.day, 3);
assert.equal(normalized.lastDailyTickResult?.nextDay, 4);
assert.ok(
  Array.isArray(normalized.lastDailyTickResult?.processResults),
  'Expected legacy lastDailyTickResult without processResults to normalize processResults to []',
);
assert.deepEqual(
  normalized.lastDailyTickResult?.processResults,
  [],
  'Expected legacy lastDailyTickResult processResults compatibility default to be empty',
);
assert.deepEqual(
  normalized.lastDailyTickResult?.settledDayProcessResults,
  [],
  'Expected legacy lastDailyTickResult settledDayProcessResults compatibility default to be empty',
);
assert.deepEqual(
  normalized.lastDailyTickResult?.nextDaySetupProcessResults,
  [],
  'Expected legacy lastDailyTickResult nextDaySetupProcessResults compatibility default to be empty',
);

const legacyFlatOnlyPersistedState = {
  ...world,
  version: 6,
  lastDailyTickResult: {
    ...legacyPersistedState.lastDailyTickResult,
    processResults: [
      validNegotiationProcessResult,
      validProductRunProcessResult,
    ],
  },
};

const normalizedLegacyFlatOnly = normalizeLoadedState(legacyFlatOnlyPersistedState);
assert.ok(
  normalizedLegacyFlatOnly,
  'Expected legacy flat-only process result persisted state to hydrate through normalizeLoadedState',
);
assert.deepEqual(
  normalizedLegacyFlatOnly?.lastDailyTickResult?.processResults.map((entry) => entry.managerId),
  ['negotiation-process-manager', 'product-run-process-manager'],
  'Expected legacy flat processResults to remain available after hydration',
);
assert.deepEqual(
  normalizedLegacyFlatOnly?.lastDailyTickResult?.settledDayProcessResults.map((entry) => entry.managerId),
  ['negotiation-process-manager'],
  'Expected legacy flat processResults to derive settled-day grouped results during hydration',
);
assert.deepEqual(
  normalizedLegacyFlatOnly?.lastDailyTickResult?.nextDaySetupProcessResults.map((entry) => entry.managerId),
  ['product-run-process-manager'],
  'Expected legacy flat processResults to derive next-day setup grouped results during hydration',
);

const groupedOnlyPersistedState = {
  ...world,
  version: 6,
  lastDailyTickResult: {
    ...legacyPersistedState.lastDailyTickResult,
    settledDayProcessResults: [validNegotiationProcessResult],
    nextDaySetupProcessResults: [validProductRunProcessResult],
  },
};

const normalizedGroupedOnly = normalizeLoadedState(groupedOnlyPersistedState);
assert.ok(
  normalizedGroupedOnly,
  'Expected grouped-only process result persisted state to hydrate through normalizeLoadedState',
);
assert.deepEqual(
  normalizedGroupedOnly?.lastDailyTickResult?.processResults.map((entry) => entry.managerId),
  ['negotiation-process-manager', 'product-run-process-manager'],
  'Expected grouped-only process result persisted state to rebuild the flat compatibility mirror',
);

const mixedOwnershipPersistedState = {
  ...world,
  version: 6,
  lastDailyTickResult: {
    ...legacyPersistedState.lastDailyTickResult,
    processResults: [
      validNegotiationProcessResult,
      {
        ...validNegotiationProcessResult,
        owner: 'runtime-process-manager',
        emittedEventIds: ['event-invalid-negotiation-owner'],
        closedDealIds: ['deal-invalid-negotiation-owner'],
        opportunityIds: ['opp-invalid-negotiation-owner'],
        productRunIds: ['product-run-invalid-negotiation-owner'],
      },
      {
        ...validNegotiationProcessResult,
        phase: 'next-day-setup',
        emittedEventIds: ['event-invalid-negotiation-phase'],
        closedDealIds: ['deal-invalid-negotiation-phase'],
        opportunityIds: ['opp-invalid-negotiation-phase'],
        productRunIds: ['product-run-invalid-negotiation-phase'],
      },
      {
        ...validProductRunProcessResult,
        outcomeOwner: 'legacy-deal-closing-engine',
        emittedEventIds: ['event-invalid-product-run-outcome-owner'],
        closedDealIds: ['deal-invalid-product-run-outcome-owner'],
        opportunityIds: ['opp-invalid-product-run-outcome-owner'],
        productRunIds: ['product-run-invalid-product-run-outcome-owner'],
      },
      {
        ...validProductRunProcessResult,
        phase: 'settled-day',
        emittedEventIds: ['event-invalid-product-run-phase'],
        closedDealIds: ['deal-invalid-product-run-phase'],
        opportunityIds: ['opp-invalid-product-run-phase'],
        productRunIds: ['product-run-invalid-product-run-phase'],
      },
      {
        ...validNegotiationProcessResult,
        day: 4,
        emittedEventIds: ['event-invalid-negotiation-day'],
        closedDealIds: ['deal-invalid-negotiation-day'],
        opportunityIds: ['opp-invalid-negotiation-day'],
        productRunIds: ['product-run-invalid-negotiation-day'],
      },
      {
        ...validProductRunProcessResult,
        day: 3,
        emittedEventIds: ['event-invalid-product-run-day'],
        closedDealIds: ['deal-invalid-product-run-day'],
        opportunityIds: ['opp-invalid-product-run-day'],
        productRunIds: ['product-run-invalid-product-run-day'],
      },
      validProductRunProcessResult,
    ],
    settledDayProcessResults: [
      validNegotiationProcessResult,
      {
        ...validNegotiationProcessResult,
        phase: 'next-day-setup',
        emittedEventIds: ['event-invalid-grouped-negotiation-phase'],
      },
      {
        ...validNegotiationProcessResult,
        day: 4,
        emittedEventIds: ['event-invalid-grouped-negotiation-day'],
      },
    ],
    nextDaySetupProcessResults: [
      validProductRunProcessResult,
      {
        ...validProductRunProcessResult,
        phase: 'settled-day',
        emittedEventIds: ['event-invalid-grouped-product-run-phase'],
      },
      {
        ...validProductRunProcessResult,
        day: 3,
        emittedEventIds: ['event-invalid-grouped-product-run-day'],
      },
    ],
  },
};

const normalizedMixedOwnership = normalizeLoadedState(mixedOwnershipPersistedState);
assert.ok(
  normalizedMixedOwnership,
  'Expected persisted state with mixed process result ownership to hydrate through normalizeLoadedState',
);
assert.deepEqual(
  normalizedMixedOwnership?.lastDailyTickResult?.processResults.map((entry) => entry.managerId),
  ['negotiation-process-manager', 'product-run-process-manager'],
  'Expected hydration to preserve only process result rows with valid ownership combinations',
);
assert.deepEqual(
  normalizedMixedOwnership?.lastDailyTickResult?.processResults.map((entry) => entry.day),
  [3, 4],
  'Expected hydration to preserve explicit process result day values',
);
assert.deepEqual(
  normalizedMixedOwnership?.lastDailyTickResult?.processResults.map((entry) => entry.phase),
  ['settled-day', 'next-day-setup'],
  'Expected hydration to preserve explicit process result phases',
);
assert.deepEqual(
  normalizedMixedOwnership?.lastDailyTickResult?.settledDayProcessResults.map((entry) => entry.managerId),
  ['negotiation-process-manager'],
  'Expected hydration to preserve only valid settled-day grouped process rows',
);
assert.deepEqual(
  normalizedMixedOwnership?.lastDailyTickResult?.nextDaySetupProcessResults.map((entry) => entry.managerId),
  ['product-run-process-manager'],
  'Expected hydration to preserve only valid next-day setup grouped process rows',
);
assert.equal(
  normalizedMixedOwnership?.lastDailyTickResult?.processResults.some((entry) =>
    entry.opportunityIds.includes('opp-invalid-negotiation-owner')),
  false,
  'Expected hydration to drop ids from invalid negotiation ownership rows',
);
assert.equal(
  normalizedMixedOwnership?.lastDailyTickResult?.processResults.some((entry) =>
    entry.opportunityIds.includes('opp-invalid-negotiation-phase')),
  false,
  'Expected hydration to drop ids from negotiation rows with the product-run phase',
);
assert.equal(
  normalizedMixedOwnership?.lastDailyTickResult?.processResults.some((entry) =>
    entry.productRunIds.includes('product-run-invalid-product-run-outcome-owner')),
  false,
  'Expected hydration to drop ids from invalid product run ownership rows',
);
assert.equal(
  normalizedMixedOwnership?.lastDailyTickResult?.processResults.some((entry) =>
    entry.productRunIds.includes('product-run-invalid-product-run-phase')),
  false,
  'Expected hydration to drop ids from product run rows with the negotiation phase',
);
assert.equal(
  normalizedMixedOwnership?.lastDailyTickResult?.processResults.some((entry) =>
    entry.emittedEventIds.includes('event-invalid-negotiation-day')),
  false,
  'Expected hydration to drop negotiation rows with the product-run day',
);
assert.equal(
  normalizedMixedOwnership?.lastDailyTickResult?.processResults.some((entry) =>
    entry.emittedEventIds.includes('event-invalid-product-run-day')),
  false,
  'Expected hydration to drop product run rows with the negotiation day',
);
assert.equal(
  normalizedMixedOwnership?.lastDailyTickResult?.settledDayProcessResults.some((entry) =>
    entry.emittedEventIds.includes('event-invalid-grouped-negotiation-phase')
      || entry.emittedEventIds.includes('event-invalid-grouped-negotiation-day')),
  false,
  'Expected hydration to drop invalid settled-day grouped process rows',
);
assert.equal(
  normalizedMixedOwnership?.lastDailyTickResult?.nextDaySetupProcessResults.some((entry) =>
    entry.emittedEventIds.includes('event-invalid-grouped-product-run-phase')
      || entry.emittedEventIds.includes('event-invalid-grouped-product-run-day')),
  false,
  'Expected hydration to drop invalid next-day setup grouped process rows',
);

const finalDayPersistedState = {
  ...world,
  version: 6,
  lastDailyTickResult: {
    ...legacyPersistedState.lastDailyTickResult,
    day: 14,
    nextDay: 14,
  },
};

const normalizedFinalDay = normalizeLoadedState(finalDayPersistedState);
assert.ok(normalizedFinalDay, 'Expected final-day persisted state to hydrate through normalizeLoadedState');
assert.equal(
  normalizedFinalDay?.lastDailyTickResult?.nextDay,
  14,
  'Expected final-day lastDailyTickResult nextDay === day to be preserved during hydration',
);

const normalizedWithoutTick = normalizeLoadedState({
  ...world,
  version: 6,
  lastDailyTickResult: null,
});
assert.ok(normalizedWithoutTick, 'Expected state without lastDailyTickResult to hydrate');
assert.equal(
  normalizedWithoutTick?.lastDailyTickResult,
  null,
  'Expected null lastDailyTickResult to stay null instead of fabricating a tick result',
);

console.log('selling-houses process results persistence contract verification passed');
