/**
 * Trust Write Helper v1 — GameState relation persistence facade.
 *
 * Bridges domain engine with core trust write source, persisting
 * canonical trust state in GameState.runtimeBrokerOwnerRelations.
 *
 * Mother model alignment:
 * - Section 8: "trust belongs to BrokerOwnerRelation, not Owner or AssetCase"
 * - Section 19.1: trust is an actor belief, not an asset fact
 *
 * Hard constraints:
 * 1. No balance constant changes.
 * 2. No tick order changes.
 * 3. No deal probability formula changes.
 * 4. No UI text changes.
 * 5. Case.trust is NOT deleted — it's a compatibility mirror.
 * 6. Numeric results must be legacy-equivalent: same seed + same action → same Case.trust.
 * 7. Pressure/evidence receipts continue to be collected by callers.
 * 8. No new randomness introduced.
 * 9. No Date.now / Math.random.
 */

import {
  createTrustState,
  addTrustDelta,
  setTrust,
  deriveCaseTrustMirror,
  buildBrokerOwnerRelationId,
  type BrokerOwnerRelationTrustState,
  type BrokerOwnerRelationTrustRecord,
} from '../core/world-state/trustWriteSource.js';

import type { GameState, Case } from './models.js';

// ---------------------------------------------------------------------------
// TrustWriteResult: returned by all trust mutation helpers
// ---------------------------------------------------------------------------

export interface TrustWriteResult {
  /** New trust value for Case.trust mirror sync */
  readonly mirrorTrust: number;
  /** Canonical BrokerOwnerRelation trust state */
  readonly canonicalState: BrokerOwnerRelationTrustState;
  /** Immutable record of this trust change */
  readonly record: BrokerOwnerRelationTrustRecord;
}

// ---------------------------------------------------------------------------
// Stable relation id builder
// ---------------------------------------------------------------------------

function buildRelationIds(caseItem: Case) {
  const brokerId = `broker:${caseItem.maintainerName || 'current'}`;
  const ownerId = `owner:${caseItem.id}`;
  return { brokerId, ownerId };
}

// ---------------------------------------------------------------------------
// ensureBrokerOwnerTrustState: get or create relation for a case
// ---------------------------------------------------------------------------

/**
 * Ensures a BrokerOwnerRelationTrustState exists for the given case.
 * If not found in runtimeBrokerOwnerRelations, hydrates from Case.trust.
 * If found, returns the existing state (does NOT overwrite).
 */
export function ensureBrokerOwnerTrustState(
  state: GameState,
  caseItem: Case,
): BrokerOwnerRelationTrustState {
  if (!state.runtimeBrokerOwnerRelations) {
    state.runtimeBrokerOwnerRelations = [];
  }

  const { brokerId, ownerId } = buildRelationIds(caseItem);
  const relationId = buildBrokerOwnerRelationId(brokerId, ownerId);

  const existing = state.runtimeBrokerOwnerRelations.find((r) => r.relationId === relationId);
  if (existing) {
    return existing;
  }

  // Hydrate from Case.trust
  const hydrated = createTrustState(brokerId, ownerId, caseItem.trust, state.day);
  state.runtimeBrokerOwnerRelations.push(hydrated);
  return hydrated;
}

// ---------------------------------------------------------------------------
// readBrokerOwnerTrustState: read canonical trust for a case
// ---------------------------------------------------------------------------

/**
 * Reads the canonical BrokerOwnerRelation trust state for a case.
 * Returns undefined if no relation exists and no hydration is performed.
 */
export function readBrokerOwnerTrustState(
  state: GameState,
  caseItem: Case,
): BrokerOwnerRelationTrustState | undefined {
  if (!state.runtimeBrokerOwnerRelations) return undefined;

  const { brokerId, ownerId } = buildRelationIds(caseItem);
  const relationId = buildBrokerOwnerRelationId(brokerId, ownerId);

  return state.runtimeBrokerOwnerRelations.find((r) => r.relationId === relationId);
}

// ---------------------------------------------------------------------------
// setBrokerOwnerTrust: set absolute trust value
// ---------------------------------------------------------------------------

/**
 * Sets trust to an absolute value on a case, persisting to GameState.
 * Updates both the canonical relation and Case.trust mirror.
 * Returns the write result.
 */
export function setBrokerOwnerTrust(
  state: GameState,
  caseItem: Case,
  newTrust: number,
  reason: string,
  clampMin: number = 0,
  clampMax: number = 100,
  sourceEventRefs: readonly string[] = [],
  sourcePressureRefs: readonly string[] = [],
): TrustWriteResult {
  const current = ensureBrokerOwnerTrustState(state, caseItem);
  const { state: newState, record } = setTrust(
    current,
    newTrust,
    state.day,
    reason,
    sourceEventRefs,
    sourcePressureRefs,
  );

  // Apply clamping
  const clampedTrust = Math.max(clampMin, Math.min(clampMax, Math.round(newState.trust)));
  const clampedState = clampedTrust === newState.trust
    ? newState
    : setTrust(newState, clampedTrust, state.day, reason, sourceEventRefs, sourcePressureRefs).state;

  // Persist to GameState
  persistTrustState(state, clampedState);

  // Sync Case.trust mirror
  caseItem.trust = deriveCaseTrustMirror(clampedState);

  return {
    mirrorTrust: caseItem.trust,
    canonicalState: clampedState,
    record,
  };
}

// ---------------------------------------------------------------------------
// applyBrokerOwnerTrustDelta: apply delta to trust
// ---------------------------------------------------------------------------

/**
 * Applies a trust delta to a case, persisting to GameState.
 * Updates both the canonical relation and Case.trust mirror.
 * Returns the write result.
 */
export function applyBrokerOwnerTrustDelta(
  state: GameState,
  caseItem: Case,
  delta: number,
  reason: string,
  clampMin: number = 0,
  clampMax: number = 100,
  sourceEventRefs: readonly string[] = [],
  sourcePressureRefs: readonly string[] = [],
): TrustWriteResult {
  const current = ensureBrokerOwnerTrustState(state, caseItem);
  const { state: newState, record } = addTrustDelta(
    current,
    delta,
    state.day,
    reason,
    sourceEventRefs,
    sourcePressureRefs,
  );

  // Apply clamping
  const clampedTrust = Math.max(clampMin, Math.min(clampMax, Math.round(newState.trust)));
  const clampedState = clampedTrust === newState.trust
    ? newState
    : setTrust(newState, clampedTrust, state.day, reason, sourceEventRefs, sourcePressureRefs).state;

  // Persist to GameState
  persistTrustState(state, clampedState);

  // Sync Case.trust mirror
  caseItem.trust = deriveCaseTrustMirror(clampedState);

  return {
    mirrorTrust: caseItem.trust,
    canonicalState: clampedState,
    record,
  };
}

// ---------------------------------------------------------------------------
// clampBrokerOwnerTrust: clamp trust to a range
// ---------------------------------------------------------------------------

/**
 * Clamps trust to [min, max] on a case, persisting to GameState.
 * Updates both the canonical relation and Case.trust mirror.
 * Returns the write result.
 */
export function clampBrokerOwnerTrust(
  state: GameState,
  caseItem: Case,
  reason: string,
  clampMin: number = 0,
  clampMax: number = 100,
): TrustWriteResult {
  const current = ensureBrokerOwnerTrustState(state, caseItem);
  const clampedTrust = Math.max(clampMin, Math.min(clampMax, Math.round(current.trust)));

  if (clampedTrust === current.trust) {
    // No change needed
    return {
      mirrorTrust: deriveCaseTrustMirror(current),
      canonicalState: current,
      record: Object.freeze({
        relationId: current.relationId,
        day: state.day,
        previousTrust: current.trust,
        newTrust: current.trust,
        delta: 0,
        reason,
        sourceEventRefs: Object.freeze([]),
        sourcePressureRefs: Object.freeze([]),
      }),
    };
  }

  const { state: newState, record } = setTrust(
    current,
    clampedTrust,
    state.day,
    reason,
  );

  // Persist to GameState
  persistTrustState(state, newState);

  // Sync Case.trust mirror
  caseItem.trust = deriveCaseTrustMirror(newState);

  return {
    mirrorTrust: caseItem.trust,
    canonicalState: newState,
    record,
  };
}

// ---------------------------------------------------------------------------
// Deprecated compatibility: applyTrustDelta (stateless)
// ---------------------------------------------------------------------------

/**
 * @deprecated Use applyBrokerOwnerTrustDelta(state, caseItem, ...) instead.
 * Kept for backward compatibility with existing engine code.
 * Does NOT persist to runtimeBrokerOwnerRelations.
 * WARNING: engine/application code MUST NOT use this function. It is a legacy shim only.
 */
export function applyTrustDelta(
  caseId: string,
  currentTrust: number,
  delta: number,
  day: number,
  reason: string,
  clampMin: number = 0,
  clampMax: number = 100,
  sourceEventRefs: readonly string[] = [],
  sourcePressureRefs: readonly string[] = [],
): TrustWriteResult {
  const brokerId = `broker:${caseId}`;
  const ownerId = `owner:${caseId}`;
  const canonicalState = createTrustState(brokerId, ownerId, currentTrust, day);
  const result = addTrustDelta(canonicalState, delta, day, reason, sourceEventRefs, sourcePressureRefs);

  // Apply clamping
  const clampedTrust = Math.max(clampMin, Math.min(clampMax, Math.round(result.state.trust)));
  const clampedState = clampedTrust === result.state.trust
    ? result.state
    : setTrust(result.state, clampedTrust, day, reason, sourceEventRefs, sourcePressureRefs).state;

  return {
    mirrorTrust: deriveCaseTrustMirror(clampedState),
    canonicalState: clampedState,
    record: result.record,
  };
}

// ---------------------------------------------------------------------------
// Internal: persist trust state to GameState
// ---------------------------------------------------------------------------

function persistTrustState(
  state: GameState,
  trustState: BrokerOwnerRelationTrustState,
): void {
  if (!state.runtimeBrokerOwnerRelations) {
    state.runtimeBrokerOwnerRelations = [];
  }

  const index = state.runtimeBrokerOwnerRelations.findIndex(
    (r) => r.relationId === trustState.relationId,
  );

  if (index >= 0) {
    state.runtimeBrokerOwnerRelations[index] = trustState;
  } else {
    state.runtimeBrokerOwnerRelations.push(trustState);
  }
}

// ---------------------------------------------------------------------------
// initializeTrustRelations: populate runtimeBrokerOwnerRelations from cases
// ---------------------------------------------------------------------------

/**
 * Initializes runtimeBrokerOwnerRelations from all cases in GameState.
 * Used during createInitialState and old-save hydration.
 * Does NOT overwrite existing relations.
 */
export function initializeTrustRelations(state: GameState): void {
  if (!state.runtimeBrokerOwnerRelations) {
    state.runtimeBrokerOwnerRelations = [];
  }

  for (const caseItem of state.cases) {
    ensureBrokerOwnerTrustState(state, caseItem);
  }
}
