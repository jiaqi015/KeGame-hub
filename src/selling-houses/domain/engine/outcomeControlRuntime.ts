import type { GameState, OutcomeControlRules, RivalListing } from '../models.js';
import {
  ensureMarketOutcomeState,
  getAvailableMarketDealSlots,
  setDelayedMarketDealConversionObserver,
} from '../models.js';
import { clamp } from '../utils.js';

export type RivalOutcomeControlKey =
  | 'rivalStoreCapabilityScale'
  | 'rivalDealShareScale'
  | 'rivalListingSpawnScale'
  | 'rivalCustomerPullScale'
  | 'rivalOwnerPressureScale'
  | 'rivalCaseLossScale';

export type RivalOutcomeControlScales = Pick<OutcomeControlRules, RivalOutcomeControlKey>;

export interface RivalMarketClaimOptions {
  allowFutureSlot?: boolean;
}

export interface RivalMarketClaimResult {
  claimed: boolean;
  blockedByCapacity: boolean;
  waitingForRelease?: boolean;
}

export interface RivalOutcomeDiagnostics {
  rivalClaimAttempts: number;
  rivalClaimSuccesses: number;
  noSlotRivalAttempts: number;
  failedRivalClaimRolls: number;
  rivalListingsCreated: number;
  rivalListingsExpired: number;
  rivalListingsSold: number;
  rivalListingsWithdrawn: number;
  rivalListingsDelayed: number;
  activeRivalListingSamples: number;
  activeRivalListingTotal: number;
  rivalClaimDayTotal: number;
  rivalClaimDayCount: number;
  rivalClaimDayBuckets: Record<string, number>;
  rivalClaimedDealDayTotal: number;
  rivalClaimedDealDayCount: number;
  rivalClaimedDealDayBuckets: Record<string, number>;
  rivalListingLifespanTotal: number;
  rivalListingLifespanCount: number;
  delayedDealsCreated: number;
  delayedDealsConverted: number;
}

const EMPTY_RIVAL_OUTCOME_DIAGNOSTICS: RivalOutcomeDiagnostics = {
  rivalClaimAttempts: 0,
  rivalClaimSuccesses: 0,
  noSlotRivalAttempts: 0,
  failedRivalClaimRolls: 0,
  rivalListingsCreated: 0,
  rivalListingsExpired: 0,
  rivalListingsSold: 0,
  rivalListingsWithdrawn: 0,
  rivalListingsDelayed: 0,
  activeRivalListingSamples: 0,
  activeRivalListingTotal: 0,
  rivalClaimDayTotal: 0,
  rivalClaimDayCount: 0,
  rivalClaimDayBuckets: {},
  rivalClaimedDealDayTotal: 0,
  rivalClaimedDealDayCount: 0,
  rivalClaimedDealDayBuckets: {},
  rivalListingLifespanTotal: 0,
  rivalListingLifespanCount: 0,
  delayedDealsCreated: 0,
  delayedDealsConverted: 0,
};

const rivalOutcomeDiagnosticsByState = new WeakMap<GameState, RivalOutcomeDiagnostics>();
const rivalListingBirthDayByState = new WeakMap<GameState, Map<string, number>>();

function createEmptyRivalOutcomeDiagnostics(): RivalOutcomeDiagnostics {
  return {
    ...EMPTY_RIVAL_OUTCOME_DIAGNOSTICS,
    rivalClaimDayBuckets: {},
    rivalClaimedDealDayBuckets: {},
  };
}

function finitePositiveScale(value: number, fallback: number) {
  if (!Number.isFinite(value) || value < 0) {
    return fallback;
  }
  return value;
}

function getMutableRivalOutcomeDiagnostics(state: GameState) {
  const existing = rivalOutcomeDiagnosticsByState.get(state);
  if (existing) {
    return existing;
  }
  const created = createEmptyRivalOutcomeDiagnostics();
  rivalOutcomeDiagnosticsByState.set(state, created);
  return created;
}

function getMutableRivalListingBirthDays(state: GameState) {
  const existing = rivalListingBirthDayByState.get(state);
  if (existing) {
    return existing;
  }
  const created = new Map<string, number>();
  rivalListingBirthDayByState.set(state, created);
  return created;
}

export function resetRivalOutcomeDiagnostics(state: GameState) {
  rivalOutcomeDiagnosticsByState.set(state, createEmptyRivalOutcomeDiagnostics());
  const birthDays = new Map<string, number>();
  state.marketShadow.rivalListings.forEach((listing) => {
    birthDays.set(listing.id, state.day);
  });
  rivalListingBirthDayByState.set(state, birthDays);
}

export function readRivalOutcomeDiagnostics(state: GameState): RivalOutcomeDiagnostics {
  const diagnostics = rivalOutcomeDiagnosticsByState.get(state);
  return {
    ...EMPTY_RIVAL_OUTCOME_DIAGNOSTICS,
    ...diagnostics,
    rivalClaimDayBuckets: {
      ...(diagnostics?.rivalClaimDayBuckets || {}),
    },
    rivalClaimedDealDayBuckets: {
      ...(diagnostics?.rivalClaimedDealDayBuckets || {}),
    },
  };
}

export function recordRivalListingCreated(state: GameState, listing?: RivalListing) {
  getMutableRivalOutcomeDiagnostics(state).rivalListingsCreated += 1;
  if (listing) {
    getMutableRivalListingBirthDays(state).set(listing.id, state.day);
  }
}

export function recordRivalListingExpired(state: GameState) {
  getMutableRivalOutcomeDiagnostics(state).rivalListingsExpired += 1;
}

export function recordRivalListingSold(state: GameState, listing?: RivalListing) {
  getMutableRivalOutcomeDiagnostics(state).rivalListingsSold += 1;
  recordRivalListingLifespan(state, listing);
}

export function recordRivalListingWithdrawn(state: GameState, listing?: RivalListing) {
  getMutableRivalOutcomeDiagnostics(state).rivalListingsWithdrawn += 1;
  recordRivalListingLifespan(state, listing);
}

export function recordRivalListingDelayed(state: GameState) {
  getMutableRivalOutcomeDiagnostics(state).rivalListingsDelayed += 1;
}

export function recordActiveRivalListingSample(state: GameState, activeCount: number) {
  const diagnostics = getMutableRivalOutcomeDiagnostics(state);
  diagnostics.activeRivalListingSamples += 1;
  diagnostics.activeRivalListingTotal += Math.max(0, activeCount);
}

export function recordFailedRivalClaimRoll(state: GameState) {
  const diagnostics = getMutableRivalOutcomeDiagnostics(state);
  diagnostics.rivalClaimAttempts += 1;
  diagnostics.failedRivalClaimRolls += 1;
}

function recordActualRivalClaimDay(state: GameState, count = 1) {
  if (count <= 0) {
    return;
  }
  const diagnostics = getMutableRivalOutcomeDiagnostics(state);
  diagnostics.rivalClaimedDealDayTotal += state.day * count;
  diagnostics.rivalClaimedDealDayCount += count;
  diagnostics.rivalClaimedDealDayBuckets[state.day] = (diagnostics.rivalClaimedDealDayBuckets[state.day] || 0) + count;
}

export function recordDelayedDealsConverted(state: GameState, convertedDeals: number) {
  if (convertedDeals <= 0) {
    return;
  }
  const diagnostics = getMutableRivalOutcomeDiagnostics(state);
  diagnostics.delayedDealsConverted += convertedDeals;
  recordActualRivalClaimDay(state, convertedDeals);
}

export function getRivalOutcomeControl(state: GameState): RivalOutcomeControlScales {
  const outcomeControl = state.rules.outcomeControl;
  return {
    rivalStoreCapabilityScale: finitePositiveScale(outcomeControl.rivalStoreCapabilityScale, 1),
    rivalDealShareScale: finitePositiveScale(outcomeControl.rivalDealShareScale, 1),
    rivalListingSpawnScale: finitePositiveScale(outcomeControl.rivalListingSpawnScale, 1),
    rivalCustomerPullScale: finitePositiveScale(outcomeControl.rivalCustomerPullScale, 1),
    rivalOwnerPressureScale: finitePositiveScale(outcomeControl.rivalOwnerPressureScale, 1),
    rivalCaseLossScale: finitePositiveScale(outcomeControl.rivalCaseLossScale, 1),
  };
}

export function scaleProbability(probability: number, scale: number, max = 0.95) {
  return clamp(probability * scale, 0, max);
}

export function tryClaimRivalMarketDealSlot(
  state: GameState,
  options: RivalMarketClaimOptions = {},
): RivalMarketClaimResult {
  const diagnostics = getMutableRivalOutcomeDiagnostics(state);
  diagnostics.rivalClaimAttempts += 1;
  const marketOutcome = ensureMarketOutcomeState(state);
  const availableSlots = getAvailableMarketDealSlots(state);
  if (availableSlots > 0) {
    marketOutcome.rivalClaimedDeals += 1;
    diagnostics.rivalClaimSuccesses += 1;
    diagnostics.rivalClaimDayTotal += state.day;
    diagnostics.rivalClaimDayCount += 1;
    diagnostics.rivalClaimDayBuckets[state.day] = (diagnostics.rivalClaimDayBuckets[state.day] || 0) + 1;
    recordActualRivalClaimDay(state);
    return {
      claimed: true,
      blockedByCapacity: false,
    };
  }

  const consumedCapacity = marketOutcome.playerClaimedDeals
    + marketOutcome.rivalClaimedDeals
    + marketOutcome.delayedDeals;
  diagnostics.noSlotRivalAttempts += 1;
  if (options.allowFutureSlot && consumedCapacity < marketOutcome.totalCapacity21d) {
    marketOutcome.delayedDeals += 1;
    diagnostics.delayedDealsCreated += 1;
    diagnostics.rivalClaimSuccesses += 1;
    diagnostics.rivalClaimDayTotal += state.day;
    diagnostics.rivalClaimDayCount += 1;
    diagnostics.rivalClaimDayBuckets[state.day] = (diagnostics.rivalClaimDayBuckets[state.day] || 0) + 1;
    return {
      claimed: true,
      blockedByCapacity: false,
      waitingForRelease: true,
    };
  }
  if (consumedCapacity < marketOutcome.totalCapacity21d) {
    return {
      claimed: false,
      blockedByCapacity: false,
      waitingForRelease: true,
    };
  }

  return {
    claimed: false,
    blockedByCapacity: true,
  };
}

function recordRivalListingLifespan(state: GameState, listing?: RivalListing) {
  if (!listing) {
    return;
  }
  const birthDays = getMutableRivalListingBirthDays(state);
  const birthDay = birthDays.get(listing.id) ?? state.day;
  const diagnostics = getMutableRivalOutcomeDiagnostics(state);
  diagnostics.rivalListingLifespanTotal += Math.max(1, state.day - birthDay + 1);
  diagnostics.rivalListingLifespanCount += 1;
  birthDays.delete(listing.id);
}

setDelayedMarketDealConversionObserver(recordDelayedDealsConverted);
