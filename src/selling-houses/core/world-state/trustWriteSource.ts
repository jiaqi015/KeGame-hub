/**
 * Trust Write Source v0 — canonical trust state for BrokerOwnerRelation.
 *
 * Mother model alignment:
 * - Section 8 (Broker Service Essence): "trust, service freshness, communication quality,
 *   interpretation credibility" — trust is a broker-owner relation attribute.
 * - Section 19.1 (Knowing vs Believing): trust is an actor belief, not an asset fact.
 *
 * This module establishes BrokerOwnerRelation as the canonical trust write source.
 * Case.trust remains as a compatibility mirror — it is NOT the canonical source.
 *
 * Hard constraints:
 * 1. Pure functions in core — no domain/runtime imports.
 * 2. No Date.now, no Math.random, no crypto, no global state.
 * 3. Deterministic: same input → same output.
 * 4. Write functions return frozen objects — no mutation.
 * 5. Case.trust is NOT deleted — it's a compatibility mirror.
 * 6. Trust belongs to BrokerOwnerRelation, not Owner or AssetCase.
 */

// ---------------------------------------------------------------------------
// BrokerOwnerRelationTrustState: canonical trust state
// ---------------------------------------------------------------------------

export interface BrokerOwnerRelationTrustState {
  /** Stable relation id: brokerId::ownerId */
  readonly relationId: string;
  /** The broker id */
  readonly brokerId: string;
  /** The owner id */
  readonly ownerId: string;
  /** Current trust value (0-100) */
  readonly trust: number;
  /** Day trust was last updated */
  readonly lastUpdatedDay: number;
  /** Optional: source event refs that affected trust */
  readonly sourceEventRefs: readonly string[];
  /** Optional: source pressure refs that affected trust */
  readonly sourcePressureRefs: readonly string[];
}

// ---------------------------------------------------------------------------
// BrokerOwnerRelationTrustRecord: immutable record of a trust change
// ---------------------------------------------------------------------------

export interface BrokerOwnerRelationTrustRecord {
  /** The relation id */
  readonly relationId: string;
  /** Day of the change */
  readonly day: number;
  /** Trust value before the change */
  readonly previousTrust: number;
  /** Trust value after the change */
  readonly newTrust: number;
  /** Delta applied */
  readonly delta: number;
  /** Reason for the change */
  readonly reason: string;
  /** Source event refs */
  readonly sourceEventRefs: readonly string[];
  /** Source pressure refs */
  readonly sourcePressureRefs: readonly string[];
}

// ---------------------------------------------------------------------------
// Stable relation id builder
// ---------------------------------------------------------------------------

/**
 * Builds a stable relation id from broker and owner ids.
 * Format: brokerId::ownerId
 */
export function buildBrokerOwnerRelationId(brokerId: string, ownerId: string): string {
  return `${brokerId}::${ownerId}`;
}

// ---------------------------------------------------------------------------
// Trust write functions (pure, no mutation)
// ---------------------------------------------------------------------------

/**
 * Creates a new BrokerOwnerRelationTrustState.
 * If no initial trust is provided, defaults to 50.
 */
export function createTrustState(
  brokerId: string,
  ownerId: string,
  initialTrust: number = 50,
  day: number = 0,
): BrokerOwnerRelationTrustState {
  return Object.freeze({
    relationId: buildBrokerOwnerRelationId(brokerId, ownerId),
    brokerId,
    ownerId,
    trust: clampTrust(initialTrust),
    lastUpdatedDay: day,
    sourceEventRefs: Object.freeze([]),
    sourcePressureRefs: Object.freeze([]),
  });
}

/**
 * Sets trust to an absolute value. Returns a new frozen state.
 */
export function setTrust(
  state: BrokerOwnerRelationTrustState,
  newTrust: number,
  day: number,
  reason: string,
  sourceEventRefs: readonly string[] = [],
  sourcePressureRefs: readonly string[] = [],
): { state: BrokerOwnerRelationTrustState; record: BrokerOwnerRelationTrustRecord } {
  const clamped = clampTrust(newTrust);
  const newState: BrokerOwnerRelationTrustState = Object.freeze({
    ...state,
    trust: clamped,
    lastUpdatedDay: day,
    sourceEventRefs: Object.freeze([...sourceEventRefs]),
    sourcePressureRefs: Object.freeze([...sourcePressureRefs]),
  });
  const record: BrokerOwnerRelationTrustRecord = Object.freeze({
    relationId: state.relationId,
    day,
    previousTrust: state.trust,
    newTrust: clamped,
    delta: clamped - state.trust,
    reason,
    sourceEventRefs: Object.freeze([...sourceEventRefs]),
    sourcePressureRefs: Object.freeze([...sourcePressureRefs]),
  });
  return { state: newState, record };
}

/**
 * Adds a delta to trust. Returns a new frozen state.
 */
export function addTrustDelta(
  state: BrokerOwnerRelationTrustState,
  delta: number,
  day: number,
  reason: string,
  sourceEventRefs: readonly string[] = [],
  sourcePressureRefs: readonly string[] = [],
): { state: BrokerOwnerRelationTrustState; record: BrokerOwnerRelationTrustRecord } {
  return setTrust(state, state.trust + delta, day, reason, sourceEventRefs, sourcePressureRefs);
}

/**
 * Clamps trust to [0, 100]. Returns a new frozen state.
 */
export function clampTrustState(
  state: BrokerOwnerRelationTrustState,
  min: number = 0,
  max: number = 100,
): BrokerOwnerRelationTrustState {
  const clamped = clampTrust(state.trust, min, max);
  if (clamped === state.trust) return state;
  return Object.freeze({
    ...state,
    trust: clamped,
  });
}

/**
 * Derives Case.trust compatibility mirror value from the canonical trust state.
 * This is for backward compatibility — Case.trust should be synced from this value.
 */
export function deriveCaseTrustMirror(
  state: BrokerOwnerRelationTrustState,
): number {
  return state.trust;
}

/**
 * Initializes a trust state from a legacy Case.trust value.
 * Used during hydration when runtimeBrokerOwnerRelations is missing.
 */
export function hydrateTrustStateFromCase(
  brokerId: string,
  ownerId: string,
  caseTrust: number,
  day: number,
): BrokerOwnerRelationTrustState {
  return createTrustState(brokerId, ownerId, caseTrust, day);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function clampTrust(value: number, min: number = 0, max: number = 100): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}
