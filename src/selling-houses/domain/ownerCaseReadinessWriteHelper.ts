/**
 * Owner Case Readiness Write Helper — single write boundary.
 *
 * All readiness write operations live here. The legacy ownerCaseReadinessHelper
 * is a read-only/re-export facade with no local write implementation.
 *
 * Mother model alignment:
 * - Agent A field ownership: Case.patience → Owner.patience (canonical)
 * - Agent A field ownership: Case.urgency → Owner.urgency (canonical)
 * - patience/urgency are owner-decision fields, NOT asset-case facts
 * - Case.patience and Case.urgency are legacy compatibility mirrors
 *
 * Hard constraints:
 * 1. No balance constant changes.
 * 2. No tick order changes.
 * 3. No UI text changes.
 * 4. Case.patience / Case.urgency are NOT deleted — they are compatibility mirrors.
 * 5. Numeric results must be legacy-equivalent: same seed + same action → same Case values.
 * 6. No new randomness introduced.
 * 7. No Date.now / Math.random.
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
import { asWritableCase, asWritableGameState } from './models.js';
import {
  type CanonicalStoreWriteProvenance,
  type CanonicalStoreWriteReceipt,
  makeStoreWriteReceipt,
} from '../core/world-state/canonicalStoreKernel.js';

// ---------------------------------------------------------------------------
// R23: Named mirror-sync boundary for Case.patience / Case.urgency
// ---------------------------------------------------------------------------

/**
 * Sync legacy Case patience/urgency mirrors from canonical OwnerCaseReadinessState.
 *
 * R23: This is the ONLY allowed write path for Case.patience and Case.urgency
 * mirror fields. All readiness mutation helpers must call this function instead
 * of writing `caseItem.patience =` or `caseItem.urgency =` directly.
 *
 * @param caseItem - the legacy Case object to sync
 * @param canonicalState - the canonical readiness state (source of truth)
 * @param provenance - 'canonical-delta' for normal mutations, 'clamp' for boundary clamps
 */
export function syncLegacyCaseReadinessMirrors(
  caseItem: Case,
  canonicalState: OwnerCaseReadinessState,
  provenance: 'canonical-delta' | 'clamp',
): void {
  asWritableCase(caseItem).patience = deriveCasePatienceMirror(canonicalState);
  asWritableCase(caseItem).urgency = deriveCaseUrgencyMirror(canonicalState);
}

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
// Store-level ensure helper
// ---------------------------------------------------------------------------

/**
 * Store-level ensure helper for readiness store.
 * Returns a CanonicalStoreWriteReceipt for audit.
 */
export function ensureOwnerCaseReadinessStore(
  state: GameState,
  provenance: CanonicalStoreWriteProvenance = 'canonical-bootstrap',
): CanonicalStoreWriteReceipt {
  if (!state.runtimeOwnerCaseReadinessStates) {
    asWritableGameState(state).runtimeOwnerCaseReadinessStates = [];
  }
  return makeStoreWriteReceipt('runtimeOwnerCaseReadinessStates', 'ensure', provenance, {
    nextCount: state.runtimeOwnerCaseReadinessStates.length,
  });
}

// ---------------------------------------------------------------------------
// ensureOwnerCaseReadinessState: get or create readiness state for a case
// ---------------------------------------------------------------------------

export function ensureOwnerCaseReadinessState(
  state: GameState,
  caseItem: Case,
  /** R30: hydration provenance — 'old_save_compatibility' when hydrating from Case mirrors */
  _hydrationProvenance: 'canonical-bootstrap' | 'old_save_compatibility' = 'old_save_compatibility',
): OwnerCaseReadinessState {
  if (!state.runtimeOwnerCaseReadinessStates) {
    asWritableGameState(state).runtimeOwnerCaseReadinessStates = [];
  }

  const relationId = buildOwnerCaseRelationId(caseItem.id);

  const existing = state.runtimeOwnerCaseReadinessStates.find((r) => r.relationId === relationId);
  if (existing) {
    return existing;
  }

  const hydrated = createReadinessState(caseItem.id, caseItem.patience, caseItem.urgency, state.day);
  asWritableGameState(state).runtimeOwnerCaseReadinessStates.push(hydrated);
  return hydrated;
}

// ---------------------------------------------------------------------------
// readOwnerCaseReadinessState: read canonical readiness for a case
// ---------------------------------------------------------------------------

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

  const clampedPatience = Math.max(clampMin, Math.min(clampMax, Math.round(newState.patience)));
  const clampedState = clampedPatience === newState.patience
    ? newState
    : setPatience(newState, clampedPatience, state.day, reason, sourceEventRefs, sourcePressureRefs).state;

  persistReadinessState(state, clampedState);
  syncLegacyCaseReadinessMirrors(caseItem, clampedState, 'canonical-delta');

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

  const clampedPatience = Math.max(clampMin, Math.min(clampMax, Math.round(newState.patience)));
  const clampedState = clampedPatience === newState.patience
    ? newState
    : setPatience(newState, clampedPatience, state.day, reason, sourceEventRefs, sourcePressureRefs).state;

  persistReadinessState(state, clampedState);
  syncLegacyCaseReadinessMirrors(caseItem, clampedState, 'canonical-delta');

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

  const clampedUrgency = Math.max(clampMin, Math.min(clampMax, Math.round(newState.urgency)));
  const clampedState = clampedUrgency === newState.urgency
    ? newState
    : setUrgency(newState, clampedUrgency, state.day, reason, sourceEventRefs, sourcePressureRefs).state;

  persistReadinessState(state, clampedState);
  syncLegacyCaseReadinessMirrors(caseItem, clampedState, 'canonical-delta');

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

  const clampedUrgency = Math.max(clampMin, Math.min(clampMax, Math.round(newState.urgency)));
  const clampedState = clampedUrgency === newState.urgency
    ? newState
    : setUrgency(newState, clampedUrgency, state.day, reason, sourceEventRefs, sourcePressureRefs).state;

  persistReadinessState(state, clampedState);
  syncLegacyCaseReadinessMirrors(caseItem, clampedState, 'canonical-delta');

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

  if (deltas.patienceDelta !== undefined) {
    const result = addPatienceDelta(workingState, deltas.patienceDelta, state.day, reason, sourceEventRefs, sourcePressureRefs);
    workingState = result.state;
    lastRecord = result.record;
  }

  if (deltas.urgencyDelta !== undefined) {
    const result = addUrgencyDelta(workingState, deltas.urgencyDelta, state.day, reason, sourceEventRefs, sourcePressureRefs);
    workingState = result.state;
    lastRecord = result.record;
  }

  const clampedPatience = Math.max(clampMin, Math.min(clampMax, Math.round(workingState.patience)));
  const clampedUrgency = Math.max(clampMin, Math.min(clampMax, Math.round(workingState.urgency)));
  let clampedState = workingState;

  if (clampedPatience !== workingState.patience) {
    clampedState = setPatience(clampedState, clampedPatience, state.day, reason, sourceEventRefs, sourcePressureRefs).state;
  }
  if (clampedUrgency !== workingState.urgency) {
    clampedState = setUrgency(clampedState, clampedUrgency, state.day, reason, sourceEventRefs, sourcePressureRefs).state;
  }

  persistReadinessState(state, clampedState);
  syncLegacyCaseReadinessMirrors(caseItem, clampedState, 'canonical-delta');

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

  if (values.patience !== undefined) {
    const result = setPatience(workingState, values.patience, state.day, reason, sourceEventRefs, sourcePressureRefs);
    workingState = result.state;
    lastRecord = result.record;
  }

  if (values.urgency !== undefined) {
    const result = setUrgency(workingState, values.urgency, state.day, reason, sourceEventRefs, sourcePressureRefs);
    workingState = result.state;
    lastRecord = result.record;
  }

  const clampedPatience = Math.max(clampMin, Math.min(clampMax, Math.round(workingState.patience)));
  const clampedUrgency = Math.max(clampMin, Math.min(clampMax, Math.round(workingState.urgency)));
  let clampedState = workingState;

  if (clampedPatience !== workingState.patience) {
    clampedState = setPatience(clampedState, clampedPatience, state.day, reason, sourceEventRefs, sourcePressureRefs).state;
  }
  if (clampedUrgency !== workingState.urgency) {
    clampedState = setUrgency(clampedState, clampedUrgency, state.day, reason, sourceEventRefs, sourcePressureRefs).state;
  }

  persistReadinessState(state, clampedState);
  syncLegacyCaseReadinessMirrors(caseItem, clampedState, 'canonical-delta');

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

  persistReadinessState(state, newState);
  syncLegacyCaseReadinessMirrors(caseItem, newState, 'clamp');

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
// initializeReadinessStates: populate runtimeOwnerCaseReadinessStates from cases
// ---------------------------------------------------------------------------

export function initializeReadinessStates(state: GameState): void {
  if (!state.runtimeOwnerCaseReadinessStates) {
    asWritableGameState(state).runtimeOwnerCaseReadinessStates = [];
  }

  for (const caseItem of state.cases) {
    ensureOwnerCaseReadinessState(state, caseItem);
  }
}

// ---------------------------------------------------------------------------
// Internal: persist readiness state to GameState
// ---------------------------------------------------------------------------

function persistReadinessState(
  state: GameState,
  readinessState: OwnerCaseReadinessState,
): void {
  if (!state.runtimeOwnerCaseReadinessStates) {
    asWritableGameState(state).runtimeOwnerCaseReadinessStates = [];
  }

  const index = state.runtimeOwnerCaseReadinessStates.findIndex(
    (r) => r.relationId === readinessState.relationId,
  );

  if (index >= 0) {
    asWritableGameState(state).runtimeOwnerCaseReadinessStates[index] = readinessState;
  } else {
    asWritableGameState(state).runtimeOwnerCaseReadinessStates.push(readinessState);
  }
}
