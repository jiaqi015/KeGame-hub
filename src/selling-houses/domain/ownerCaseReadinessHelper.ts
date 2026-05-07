/**
 * Owner Case Readiness Helper v1 — GameState relation persistence facade.
 *
 * Bridges domain engine with core owner-case readiness write source, persisting
 * canonical patience/urgency state in GameState.runtimeOwnerCaseReadinessStates.
 *
 * Mother model alignment:
 * - Section 8: owner-side decision readiness and pressure
 * - Section 19.1: patience/urgency are owner beliefs about selling, not asset facts
 *
 * Hard constraints:
 * 1. No balance constant changes.
 * 2. No tick order changes.
 * 3. No deal probability formula changes.
 * 4. No UI text changes.
 * 5. Case.patience/urgency are NOT deleted — they are compatibility mirrors.
 * 6. Numeric results must be legacy-equivalent: same seed + same action → same Case values.
 * 7. No new randomness introduced.
 * 8. No Date.now / Math.random.
 */

import {
  createReadinessState,
  addPatienceDelta,
  addUrgencyDelta,
  setPatience,
  setUrgency,
  deriveCasePatienceMirror,
  deriveCaseUrgencyMirror,
  buildOwnerCaseRelationId,
  type OwnerCaseReadinessState,
  type OwnerCaseReadinessRecord,
} from '../core/world-state/ownerCaseReadinessWriteSource.js';

import type { GameState, Case } from './models.js';

// ---------------------------------------------------------------------------
// ReadinessWriteResult: returned by all readiness mutation helpers
// ---------------------------------------------------------------------------

export interface ReadinessWriteResult {
  /** New patience value for Case.patience mirror sync */
  readonly mirrorPatience: number;
  /** New urgency value for Case.urgency mirror sync */
  readonly mirrorUrgency: number;
  /** Canonical OwnerCaseReadinessState */
  readonly canonicalState: OwnerCaseReadinessState;
  /** Immutable record of this change */
  readonly record: OwnerCaseReadinessRecord;
}

// ---------------------------------------------------------------------------
// ensureOwnerCaseReadinessState: get or create readiness for a case
// ---------------------------------------------------------------------------

/**
 * Ensures an OwnerCaseReadinessState exists for the given case.
 * If not found in runtimeOwnerCaseReadinessStates, hydrates from Case.patience/urgency.
 * If found, returns the existing state (does NOT overwrite).
 */
export function ensureOwnerCaseReadinessState(
  state: GameState,
  caseItem: Case,
): OwnerCaseReadinessState {
  if (!state.runtimeOwnerCaseReadinessStates) {
    state.runtimeOwnerCaseReadinessStates = [];
  }

  const relationId = buildOwnerCaseRelationId(caseItem.id);

  const existing = state.runtimeOwnerCaseReadinessStates.find((r) => r.relationId === relationId);
  if (existing) {
    return existing;
  }

  // Hydrate from Case.patience/urgency
  const hydrated = createReadinessState(caseItem.id, caseItem.patience, caseItem.urgency, state.day);
  state.runtimeOwnerCaseReadinessStates.push(hydrated);
  return hydrated;
}

// ---------------------------------------------------------------------------
// readOwnerCaseReadinessState: read canonical readiness for a case
// ---------------------------------------------------------------------------

/**
 * Reads the canonical OwnerCaseReadinessState for a case.
 * Returns undefined if no state exists and no hydration is performed.
 */
export function readOwnerCaseReadinessState(
  state: GameState,
  caseItem: Case,
): OwnerCaseReadinessState | undefined {
  if (!state.runtimeOwnerCaseReadinessStates) return undefined;

  const relationId = buildOwnerCaseRelationId(caseItem.id);
  return state.runtimeOwnerCaseReadinessStates.find((r) => r.relationId === relationId);
}

// ---------------------------------------------------------------------------
// setOwnerCasePatience: set absolute patience value
// ---------------------------------------------------------------------------

/**
 * Sets patience to an absolute value on a case, persisting to GameState.
 * Updates both the canonical state and Case.patience mirror.
 */
export function setOwnerCasePatience(
  state: GameState,
  caseItem: Case,
  newPatience: number,
  reason: string,
  clampMin: number = 0,
  clampMax: number = 100,
  sourceEventRefs: readonly string[] = [],
  sourcePressureRefs: readonly string[] = [],
): ReadinessWriteResult {
  const current = ensureOwnerCaseReadinessState(state, caseItem);
  const { state: newState, record } = setPatience(
    current,
    newPatience,
    state.day,
    reason,
    sourceEventRefs,
    sourcePressureRefs,
  );

  // Apply clamping
  const clampedPatience = Math.max(clampMin, Math.min(clampMax, Math.round(newState.patience)));
  const clampedState = clampedPatience === newState.patience
    ? newState
    : setPatience(newState, clampedPatience, state.day, reason, sourceEventRefs, sourcePressureRefs).state;

  // Persist to GameState
  persistReadinessState(state, clampedState);

  // Sync Case mirrors
  caseItem.patience = deriveCasePatienceMirror(clampedState);
  caseItem.urgency = deriveCaseUrgencyMirror(clampedState);

  return {
    mirrorPatience: caseItem.patience,
    mirrorUrgency: caseItem.urgency,
    canonicalState: clampedState,
    record,
  };
}

// ---------------------------------------------------------------------------
// applyOwnerCasePatienceDelta: apply delta to patience
// ---------------------------------------------------------------------------

/**
 * Applies a patience delta to a case, persisting to GameState.
 * Updates both the canonical state and Case.patience mirror.
 */
export function applyOwnerCasePatienceDelta(
  state: GameState,
  caseItem: Case,
  delta: number,
  reason: string,
  clampMin: number = 0,
  clampMax: number = 100,
  sourceEventRefs: readonly string[] = [],
  sourcePressureRefs: readonly string[] = [],
): ReadinessWriteResult {
  const current = ensureOwnerCaseReadinessState(state, caseItem);
  const { state: newState, record } = addPatienceDelta(
    current,
    delta,
    state.day,
    reason,
    sourceEventRefs,
    sourcePressureRefs,
  );

  // Apply clamping
  const clampedPatience = Math.max(clampMin, Math.min(clampMax, Math.round(newState.patience)));
  const clampedState = clampedPatience === newState.patience
    ? newState
    : setPatience(newState, clampedPatience, state.day, reason, sourceEventRefs, sourcePressureRefs).state;

  // Persist to GameState
  persistReadinessState(state, clampedState);

  // Sync Case mirrors
  caseItem.patience = deriveCasePatienceMirror(clampedState);
  caseItem.urgency = deriveCaseUrgencyMirror(clampedState);

  return {
    mirrorPatience: caseItem.patience,
    mirrorUrgency: caseItem.urgency,
    canonicalState: clampedState,
    record,
  };
}

// ---------------------------------------------------------------------------
// setOwnerCaseUrgency: set absolute urgency value
// ---------------------------------------------------------------------------

/**
 * Sets urgency to an absolute value on a case, persisting to GameState.
 * Updates both the canonical state and Case.urgency mirror.
 */
export function setOwnerCaseUrgency(
  state: GameState,
  caseItem: Case,
  newUrgency: number,
  reason: string,
  clampMin: number = 0,
  clampMax: number = 100,
  sourceEventRefs: readonly string[] = [],
  sourcePressureRefs: readonly string[] = [],
): ReadinessWriteResult {
  const current = ensureOwnerCaseReadinessState(state, caseItem);
  const { state: newState, record } = setUrgency(
    current,
    newUrgency,
    state.day,
    reason,
    sourceEventRefs,
    sourcePressureRefs,
  );

  // Apply clamping
  const clampedUrgency = Math.max(clampMin, Math.min(clampMax, Math.round(newState.urgency)));
  const clampedState = clampedUrgency === newState.urgency
    ? newState
    : setUrgency(newState, clampedUrgency, state.day, reason, sourceEventRefs, sourcePressureRefs).state;

  // Persist to GameState
  persistReadinessState(state, clampedState);

  // Sync Case mirrors
  caseItem.patience = deriveCasePatienceMirror(clampedState);
  caseItem.urgency = deriveCaseUrgencyMirror(clampedState);

  return {
    mirrorPatience: caseItem.patience,
    mirrorUrgency: caseItem.urgency,
    canonicalState: clampedState,
    record,
  };
}

// ---------------------------------------------------------------------------
// applyOwnerCaseUrgencyDelta: apply delta to urgency
// ---------------------------------------------------------------------------

/**
 * Applies an urgency delta to a case, persisting to GameState.
 * Updates both the canonical state and Case.urgency mirror.
 */
export function applyOwnerCaseUrgencyDelta(
  state: GameState,
  caseItem: Case,
  delta: number,
  reason: string,
  clampMin: number = 0,
  clampMax: number = 100,
  sourceEventRefs: readonly string[] = [],
  sourcePressureRefs: readonly string[] = [],
): ReadinessWriteResult {
  const current = ensureOwnerCaseReadinessState(state, caseItem);
  const { state: newState, record } = addUrgencyDelta(
    current,
    delta,
    state.day,
    reason,
    sourceEventRefs,
    sourcePressureRefs,
  );

  // Apply clamping
  const clampedUrgency = Math.max(clampMin, Math.min(clampMax, Math.round(newState.urgency)));
  const clampedState = clampedUrgency === newState.urgency
    ? newState
    : setUrgency(newState, clampedUrgency, state.day, reason, sourceEventRefs, sourcePressureRefs).state;

  // Persist to GameState
  persistReadinessState(state, clampedState);

  // Sync Case mirrors
  caseItem.patience = deriveCasePatienceMirror(clampedState);
  caseItem.urgency = deriveCaseUrgencyMirror(clampedState);

  return {
    mirrorPatience: caseItem.patience,
    mirrorUrgency: caseItem.urgency,
    canonicalState: clampedState,
    record,
  };
}

// ---------------------------------------------------------------------------
// applyOwnerCaseReadinessDelta: apply deltas to both patience and urgency
// ---------------------------------------------------------------------------

/**
 * Applies patience and/or urgency deltas to a case, persisting to GameState.
 * Updates both the canonical state and Case mirrors.
 * Only applies deltas for dimensions that are provided (non-undefined).
 */
export function applyOwnerCaseReadinessDelta(
  state: GameState,
  caseItem: Case,
  deltas: { patienceDelta?: number; urgencyDelta?: number },
  reason: string,
  clampMin: number = 0,
  clampMax: number = 100,
  sourceEventRefs: readonly string[] = [],
  sourcePressureRefs: readonly string[] = [],
): ReadinessWriteResult {
  const current = ensureOwnerCaseReadinessState(state, caseItem);
  let workingState = current;
  let lastRecord: OwnerCaseReadinessRecord | undefined;

  // Apply patience delta if provided
  if (deltas.patienceDelta !== undefined) {
    const result = addPatienceDelta(
      workingState,
      deltas.patienceDelta,
      state.day,
      reason,
      sourceEventRefs,
      sourcePressureRefs,
    );
    workingState = result.state;
    lastRecord = result.record;
  }

  // Apply urgency delta if provided
  if (deltas.urgencyDelta !== undefined) {
    const result = addUrgencyDelta(
      workingState,
      deltas.urgencyDelta,
      state.day,
      reason,
      sourceEventRefs,
      sourcePressureRefs,
    );
    workingState = result.state;
    lastRecord = result.record;
  }

  // Apply clamping
  const clampedPatience = Math.max(clampMin, Math.min(clampMax, Math.round(workingState.patience)));
  const clampedUrgency = Math.max(clampMin, Math.min(clampMax, Math.round(workingState.urgency)));
  let clampedState = workingState;

  if (clampedPatience !== workingState.patience) {
    clampedState = setPatience(clampedState, clampedPatience, state.day, reason, sourceEventRefs, sourcePressureRefs).state;
  }
  if (clampedUrgency !== workingState.urgency) {
    clampedState = setUrgency(clampedState, clampedUrgency, state.day, reason, sourceEventRefs, sourcePressureRefs).state;
  }

  // Persist to GameState
  persistReadinessState(state, clampedState);

  // Sync Case mirrors
  caseItem.patience = deriveCasePatienceMirror(clampedState);
  caseItem.urgency = deriveCaseUrgencyMirror(clampedState);

  // Build a synthetic record if no dimension was changed
  const record = lastRecord ?? Object.freeze({
    relationId: current.relationId,
    day: state.day,
    dimension: 'patience' as const,
    previousValue: current.patience,
    newValue: current.patience,
    delta: 0,
    reason,
    sourceEventRefs: Object.freeze([...sourceEventRefs]),
    sourcePressureRefs: Object.freeze([...sourcePressureRefs]),
  });

  return {
    mirrorPatience: caseItem.patience,
    mirrorUrgency: caseItem.urgency,
    canonicalState: clampedState,
    record,
  };
}

// ---------------------------------------------------------------------------
// setOwnerCaseReadiness: set absolute patience and/or urgency values
// ---------------------------------------------------------------------------

/**
 * Sets patience and/or urgency to absolute values on a case, persisting to GameState.
 * Updates both the canonical state and Case mirrors.
 * Only sets dimensions that are provided (non-undefined).
 */
export function setOwnerCaseReadiness(
  state: GameState,
  caseItem: Case,
  values: { patience?: number; urgency?: number },
  reason: string,
  clampMin: number = 0,
  clampMax: number = 100,
  sourceEventRefs: readonly string[] = [],
  sourcePressureRefs: readonly string[] = [],
): ReadinessWriteResult {
  const current = ensureOwnerCaseReadinessState(state, caseItem);
  let workingState = current;
  let lastRecord: OwnerCaseReadinessRecord | undefined;

  // Set patience if provided
  if (values.patience !== undefined) {
    const result = setPatience(
      workingState,
      values.patience,
      state.day,
      reason,
      sourceEventRefs,
      sourcePressureRefs,
    );
    workingState = result.state;
    lastRecord = result.record;
  }

  // Set urgency if provided
  if (values.urgency !== undefined) {
    const result = setUrgency(
      workingState,
      values.urgency,
      state.day,
      reason,
      sourceEventRefs,
      sourcePressureRefs,
    );
    workingState = result.state;
    lastRecord = result.record;
  }

  // Apply clamping
  const clampedPatience = Math.max(clampMin, Math.min(clampMax, Math.round(workingState.patience)));
  const clampedUrgency = Math.max(clampMin, Math.min(clampMax, Math.round(workingState.urgency)));
  let clampedState = workingState;

  if (clampedPatience !== workingState.patience) {
    clampedState = setPatience(clampedState, clampedPatience, state.day, reason, sourceEventRefs, sourcePressureRefs).state;
  }
  if (clampedUrgency !== workingState.urgency) {
    clampedState = setUrgency(clampedState, clampedUrgency, state.day, reason, sourceEventRefs, sourcePressureRefs).state;
  }

  // Persist to GameState
  persistReadinessState(state, clampedState);

  // Sync Case mirrors
  caseItem.patience = deriveCasePatienceMirror(clampedState);
  caseItem.urgency = deriveCaseUrgencyMirror(clampedState);

  // Build a synthetic record if no dimension was changed
  const record = lastRecord ?? Object.freeze({
    relationId: current.relationId,
    day: state.day,
    dimension: 'patience' as const,
    previousValue: current.patience,
    newValue: current.patience,
    delta: 0,
    reason,
    sourceEventRefs: Object.freeze([...sourceEventRefs]),
    sourcePressureRefs: Object.freeze([...sourcePressureRefs]),
  });

  return {
    mirrorPatience: caseItem.patience,
    mirrorUrgency: caseItem.urgency,
    canonicalState: clampedState,
    record,
  };
}

// ---------------------------------------------------------------------------
// clampOwnerCaseReadiness: clamp patience and urgency to a range
// ---------------------------------------------------------------------------

/**
 * Clamps patience and urgency to [min, max] on a case, persisting to GameState.
 * Updates both the canonical state and Case mirrors.
 */
export function clampOwnerCaseReadiness(
  state: GameState,
  caseItem: Case,
  reason: string,
  clampMin: number = 0,
  clampMax: number = 100,
): ReadinessWriteResult {
  const current = ensureOwnerCaseReadinessState(state, caseItem);
  const clampedPatience = Math.max(clampMin, Math.min(clampMax, Math.round(current.patience)));
  const clampedUrgency = Math.max(clampMin, Math.min(clampMax, Math.round(current.urgency)));

  if (clampedPatience === current.patience && clampedUrgency === current.urgency) {
    return {
      mirrorPatience: deriveCasePatienceMirror(current),
      mirrorUrgency: deriveCaseUrgencyMirror(current),
      canonicalState: current,
      record: Object.freeze({
        relationId: current.relationId,
        day: state.day,
        dimension: 'patience' as const,
        previousValue: current.patience,
        newValue: current.patience,
        delta: 0,
        reason,
        sourceEventRefs: Object.freeze([]),
        sourcePressureRefs: Object.freeze([]),
      }),
    };
  }

  let newState = current;
  if (clampedPatience !== current.patience) {
    newState = setPatience(newState, clampedPatience, state.day, reason).state;
  }
  if (clampedUrgency !== current.urgency) {
    newState = setUrgency(newState, clampedUrgency, state.day, reason).state;
  }

  // Persist to GameState
  persistReadinessState(state, newState);

  // Sync Case mirrors
  caseItem.patience = deriveCasePatienceMirror(newState);
  caseItem.urgency = deriveCaseUrgencyMirror(newState);

  return {
    mirrorPatience: caseItem.patience,
    mirrorUrgency: caseItem.urgency,
    canonicalState: newState,
    record: Object.freeze({
      relationId: current.relationId,
      day: state.day,
      dimension: 'patience' as const,
      previousValue: current.patience,
      newValue: clampedPatience,
      delta: clampedPatience - current.patience,
      reason,
      sourceEventRefs: Object.freeze([]),
      sourcePressureRefs: Object.freeze([]),
    }),
  };
}

// ---------------------------------------------------------------------------
// Internal: persist readiness state to GameState
// ---------------------------------------------------------------------------

function persistReadinessState(
  state: GameState,
  readinessState: OwnerCaseReadinessState,
): void {
  if (!state.runtimeOwnerCaseReadinessStates) {
    state.runtimeOwnerCaseReadinessStates = [];
  }

  const index = state.runtimeOwnerCaseReadinessStates.findIndex(
    (r) => r.relationId === readinessState.relationId,
  );

  if (index >= 0) {
    state.runtimeOwnerCaseReadinessStates[index] = readinessState;
  } else {
    state.runtimeOwnerCaseReadinessStates.push(readinessState);
  }
}

// ---------------------------------------------------------------------------
// initializeReadinessStates: populate runtimeOwnerCaseReadinessStates from cases
// ---------------------------------------------------------------------------

/**
 * Initializes runtimeOwnerCaseReadinessStates from all cases in GameState.
 * Used during createInitialState and old-save hydration.
 * Does NOT overwrite existing states.
 */
export function initializeReadinessStates(state: GameState): void {
  if (!state.runtimeOwnerCaseReadinessStates) {
    state.runtimeOwnerCaseReadinessStates = [];
  }

  for (const caseItem of state.cases) {
    ensureOwnerCaseReadinessState(state, caseItem);
  }
}
