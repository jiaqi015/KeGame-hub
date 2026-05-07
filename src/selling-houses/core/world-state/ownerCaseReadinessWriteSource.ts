/**
 * OwnerCaseRelation Readiness Write Source v0 — canonical patience/urgency state.
 *
 * Mother model alignment:
 * - Section 8: owner-side decision readiness and pressure
 * - Section 19.1: patience/urgency are owner beliefs about selling, not asset facts
 *
 * This module establishes OwnerCaseRelation as the canonical write source for
 * patience and urgency. Case.patience and Case.urgency remain as compatibility mirrors.
 *
 * Hard constraints:
 * 1. Pure functions in core — no domain/runtime imports.
 * 2. No Date.now, no Math.random, no crypto, no global state.
 * 3. Deterministic: same input → same output.
 * 4. Write functions return frozen objects — no mutation.
 * 5. Case.patience/urgency are NOT deleted — they are compatibility mirrors.
 */

// ---------------------------------------------------------------------------
// OwnerCaseReadinessState: canonical patience/urgency state
// ---------------------------------------------------------------------------

export interface OwnerCaseReadinessState {
  /** Stable relation id: owner-case:${caseId} */
  readonly relationId: string;
  /** The owner id: owner:${caseId} */
  readonly ownerId: string;
  /** The asset case id: case:${caseId} */
  readonly assetCaseId: string;
  /** Current patience value (0-100) */
  readonly patience: number;
  /** Current urgency value (0-100) */
  readonly urgency: number;
  /** Day patience/urgency was last updated */
  readonly lastUpdatedDay: number;
  /** Optional: source event refs that affected readiness */
  readonly sourceEventRefs: readonly string[];
  /** Optional: source pressure refs that affected readiness */
  readonly sourcePressureRefs: readonly string[];
}

// ---------------------------------------------------------------------------
// OwnerCaseReadinessRecord: immutable record of a readiness change
// ---------------------------------------------------------------------------

export interface OwnerCaseReadinessRecord {
  /** The relation id */
  readonly relationId: string;
  /** Day of the change */
  readonly day: number;
  /** Which dimension changed */
  readonly dimension: 'patience' | 'urgency';
  /** Value before the change */
  readonly previousValue: number;
  /** Value after the change */
  readonly newValue: number;
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
 * Builds a stable relation id from case id.
 * Format: owner-case:${caseId}
 */
export function buildOwnerCaseRelationId(caseId: string): string {
  return `owner-case:${caseId}`;
}

// ---------------------------------------------------------------------------
// Readiness write functions (pure, no mutation)
// ---------------------------------------------------------------------------

/**
 * Creates a new OwnerCaseReadinessState.
 */
export function createReadinessState(
  caseId: string,
  initialPatience: number = 50,
  initialUrgency: number = 50,
  day: number = 0,
): OwnerCaseReadinessState {
  return Object.freeze({
    relationId: buildOwnerCaseRelationId(caseId),
    ownerId: `owner:${caseId}`,
    assetCaseId: `case:${caseId}`,
    patience: clampValue(initialPatience),
    urgency: clampValue(initialUrgency),
    lastUpdatedDay: day,
    sourceEventRefs: Object.freeze([]),
    sourcePressureRefs: Object.freeze([]),
  });
}

/**
 * Sets patience to an absolute value. Returns a new frozen state and record.
 */
export function setPatience(
  state: OwnerCaseReadinessState,
  newPatience: number,
  day: number,
  reason: string,
  sourceEventRefs: readonly string[] = [],
  sourcePressureRefs: readonly string[] = [],
): { state: OwnerCaseReadinessState; record: OwnerCaseReadinessRecord } {
  const clamped = clampValue(newPatience);
  const newState: OwnerCaseReadinessState = Object.freeze({
    ...state,
    patience: clamped,
    lastUpdatedDay: day,
    sourceEventRefs: Object.freeze([...sourceEventRefs]),
    sourcePressureRefs: Object.freeze([...sourcePressureRefs]),
  });
  const record: OwnerCaseReadinessRecord = Object.freeze({
    relationId: state.relationId,
    day,
    dimension: 'patience',
    previousValue: state.patience,
    newValue: clamped,
    delta: clamped - state.patience,
    reason,
    sourceEventRefs: Object.freeze([...sourceEventRefs]),
    sourcePressureRefs: Object.freeze([...sourcePressureRefs]),
  });
  return { state: newState, record };
}

/**
 * Adds a delta to patience. Returns a new frozen state and record.
 */
export function addPatienceDelta(
  state: OwnerCaseReadinessState,
  delta: number,
  day: number,
  reason: string,
  sourceEventRefs: readonly string[] = [],
  sourcePressureRefs: readonly string[] = [],
): { state: OwnerCaseReadinessState; record: OwnerCaseReadinessRecord } {
  return setPatience(state, state.patience + delta, day, reason, sourceEventRefs, sourcePressureRefs);
}

/**
 * Sets urgency to an absolute value. Returns a new frozen state and record.
 */
export function setUrgency(
  state: OwnerCaseReadinessState,
  newUrgency: number,
  day: number,
  reason: string,
  sourceEventRefs: readonly string[] = [],
  sourcePressureRefs: readonly string[] = [],
): { state: OwnerCaseReadinessState; record: OwnerCaseReadinessRecord } {
  const clamped = clampValue(newUrgency);
  const newState: OwnerCaseReadinessState = Object.freeze({
    ...state,
    urgency: clamped,
    lastUpdatedDay: day,
    sourceEventRefs: Object.freeze([...sourceEventRefs]),
    sourcePressureRefs: Object.freeze([...sourcePressureRefs]),
  });
  const record: OwnerCaseReadinessRecord = Object.freeze({
    relationId: state.relationId,
    day,
    dimension: 'urgency',
    previousValue: state.urgency,
    newValue: clamped,
    delta: clamped - state.urgency,
    reason,
    sourceEventRefs: Object.freeze([...sourceEventRefs]),
    sourcePressureRefs: Object.freeze([...sourcePressureRefs]),
  });
  return { state: newState, record };
}

/**
 * Adds a delta to urgency. Returns a new frozen state and record.
 */
export function addUrgencyDelta(
  state: OwnerCaseReadinessState,
  delta: number,
  day: number,
  reason: string,
  sourceEventRefs: readonly string[] = [],
  sourcePressureRefs: readonly string[] = [],
): { state: OwnerCaseReadinessState; record: OwnerCaseReadinessRecord } {
  return setUrgency(state, state.urgency + delta, day, reason, sourceEventRefs, sourcePressureRefs);
}

/**
 * Derives Case.patience compatibility mirror value from the canonical state.
 */
export function deriveCasePatienceMirror(state: OwnerCaseReadinessState): number {
  return state.patience;
}

/**
 * Derives Case.urgency compatibility mirror value from the canonical state.
 */
export function deriveCaseUrgencyMirror(state: OwnerCaseReadinessState): number {
  return state.urgency;
}

/**
 * Initializes a readiness state from legacy Case.patience and Case.urgency values.
 * Used during hydration when runtimeOwnerCaseReadinessStates is missing.
 */
export function hydrateReadinessStateFromCase(
  caseId: string,
  casePatience: number,
  caseUrgency: number,
  day: number,
): OwnerCaseReadinessState {
  return createReadinessState(caseId, casePatience, caseUrgency, day);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function clampValue(value: number, min: number = 0, max: number = 100): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}
