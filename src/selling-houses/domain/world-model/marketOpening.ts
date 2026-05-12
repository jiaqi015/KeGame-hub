// ---------------------------------------------------------------------------
// marketOpening — integration helpers for MarketOpeningSnapshot on GameState
//
// This module provides helpers to safely read the opening snapshot from
// GameState. It does NOT mutate GameState; it only reads from runContext.
//
// Architecture boundary:
//   - domain/world-model/ may only import domain/utils
//   - it must NOT import runtime/*, application/*, or UI/*
// ---------------------------------------------------------------------------

import type { MarketOpeningSnapshot } from './marketWorldTypes.js';

/**
 * Try to read the MarketOpeningSnapshot from a GameState-like object.
 * Returns null if not present (e.g. legacy save without the snapshot).
 *
 * Usage:
 *   const snapshot = readMarketOpeningSnapshot(state);
 *   if (snapshot) { ... }
 */
export function readMarketOpeningSnapshot(state: {
  runContext?: { marketOpeningSnapshot?: unknown };
}): MarketOpeningSnapshot | null {
  const raw = state?.runContext?.marketOpeningSnapshot;
  if (!raw || typeof raw !== 'object') return null;

  const obj = raw as Record<string, unknown>;
  if (obj.version !== 1) return null;

  return raw as MarketOpeningSnapshot;
}

/**
 * Assert invariants on a MarketOpeningSnapshot.
 * Throws if any invariant is violated. Used by verification scripts.
 */
export function assertMarketOpeningInvariants(snapshot: MarketOpeningSnapshot): string[] {
  const errors: string[] = [];

  if (snapshot.version !== 1) {
    errors.push(`Expected version 1, got ${snapshot.version}`);
  }

  if (snapshot.acnNetworks.length < 3) {
    errors.push(`ACN networks must be >= 3, got ${snapshot.acnNetworks.length}`);
  }

  if (snapshot.marketCells.length < 3) {
    errors.push(`Market cells must be >= 3, got ${snapshot.marketCells.length}`);
  }

  if (snapshot.listingInventory.shadowListingCount <= snapshot.playerCaseCount) {
    errors.push(
      `Shadow listing count (${snapshot.listingInventory.shadowListingCount}) must be > player case count (${snapshot.playerCaseCount})`,
    );
  }

  if (snapshot.customerDemand.shadowCustomerCount <= 0) {
    errors.push('Shadow customer count must be > 0');
  }

  if (snapshot.brokerNetwork.shadowBrokerCount <= snapshot.brokerNetwork.namedBrokers.length) {
    errors.push(
      `Shadow broker count (${snapshot.brokerNetwork.shadowBrokerCount}) must be > named broker count (${snapshot.brokerNetwork.namedBrokers.length})`,
    );
  }

  if (snapshot.brokerNetwork.namedBrokers.length < 3) {
    errors.push(`Named brokers must be >= 3, got ${snapshot.brokerNetwork.namedBrokers.length}`);
  }

  // Validate market cell heat is numeric 0-100
  for (const cell of snapshot.marketCells) {
    if (cell.heat < 0 || cell.heat > 100) {
      errors.push(`MarketCell ${cell.id} heat out of range: ${cell.heat}`);
    }
    if (cell.inventoryPressure < 0 || cell.inventoryPressure > 100) {
      errors.push(`MarketCell ${cell.id} inventoryPressure out of range: ${cell.inventoryPressure}`);
    }
  }

  // Validate ACN fields are numeric 0-100
  for (const acn of snapshot.acnNetworks) {
    if (acn.collaborationLevel < 0 || acn.collaborationLevel > 100) {
      errors.push(`ACN ${acn.id} collaborationLevel out of range: ${acn.collaborationLevel}`);
    }
    if (acn.competitionAggression < 0 || acn.competitionAggression > 100) {
      errors.push(`ACN ${acn.id} competitionAggression out of range: ${acn.competitionAggression}`);
    }
  }

  // Validate customer demand segments have weights summing to ~100
  const segmentWeightSum = snapshot.customerDemand.segments.reduce((s, seg) => s + seg.weight, 0);
  if (Math.abs(segmentWeightSum - 100) > 5) {
    errors.push(`Demand segment weights sum to ${segmentWeightSum}, expected ~100`);
  }

  return errors;
}
