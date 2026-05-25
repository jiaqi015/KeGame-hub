/**
 * Owner Case Readiness Write Helper v1 — GameState relation persistence facade.
 *
 * Bridges domain engine with core owner-case readiness write source, persisting
 * canonical patience/urgency state in GameState.runtimeOwnerCaseReadinessStates.
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
  deriveCasePatienceMirror,
  deriveCaseUrgencyMirror,
  buildOwnerCaseRelationId,
  type OwnerCaseReadinessState,
  type OwnerCaseReadinessRecord,
} from '../core/world-state/ownerCaseReadinessWriteSource.js';

import type { GameState, Case } from './models.js';
import { asWritableCase } from './models.js';

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
// OwnerCaseReadinessWriteResult: returned by all readiness mutation helpers
// ---------------------------------------------------------------------------

export interface OwnerCaseReadinessWriteResult {
  /** New patience value for Case.patience mirror sync */
  readonly mirrorPatience: number;
  /** New urgency value for Case.urgency mirror sync */
  readonly mirrorUrgency: number;
  /** Canonical OwnerCaseRelation readiness state */
  readonly canonicalState: OwnerCaseReadinessState;
  /** Immutable record of this change (if patience or urgency changed) */
  readonly record?: OwnerCaseReadinessRecord;
}

// ---------------------------------------------------------------------------
// ensureOwnerCaseReadinessState: get or create readiness state for a case
// ---------------------------------------------------------------------------

/**
 * Ensures an OwnerCaseReadinessState exists for the given case.
 * If not found in runtimeOwnerCaseReadinessStates, hydrates from Case values.
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

  // Hydrate from Case values
  const hydrated = createReadinessState(caseItem.id, caseItem.patience, caseItem.urgency, state.day);
  state.runtimeOwnerCaseReadinessStates.push(hydrated);
  return hydrated;
}

// ---------------------------------------------------------------------------
// applyPatienceDelta: apply a patience delta with canonical persistence
// ---------------------------------------------------------------------------

/**
 * Applies a patience delta to a case, persisting to GameState.
 * Updates both the canonical relation and Case.patience mirror.
 * Returns the write result.
 */
export function applyPatienceDelta(
  state: GameState,
  caseItem: Case,
  delta: number,
  reason: string,
  clampMin: number = 0,
  clampMax: number = 100,
): OwnerCaseReadinessWriteResult {
  const current = ensureOwnerCaseReadinessState(state, caseItem);
  // addPatienceDelta doesn't take clampMin/clampMax — clamping is done by setPatience internally
  const { state: newState, record } = addPatienceDelta(current, delta, state.day, reason);

  // Update canonical state in-place
  const idx = state.runtimeOwnerCaseReadinessStates!.indexOf(current);
  if (idx >= 0) {
    state.runtimeOwnerCaseReadinessStates![idx] = newState;
  }

  // Sync Case mirror via named boundary (R23)
  syncLegacyCaseReadinessMirrors(caseItem, newState, 'canonical-delta');
  const mirrorPatience = deriveCasePatienceMirror(newState);

  return {
    mirrorPatience,
    mirrorUrgency: caseItem.urgency,
    canonicalState: newState,
    record,
  };
}

// ---------------------------------------------------------------------------
// applyUrgencyDelta: apply an urgency delta with canonical persistence
// ---------------------------------------------------------------------------

/**
 * Applies an urgency delta to a case, persisting to GameState.
 * Updates both the canonical relation and Case.urgency mirror.
 * Returns the write result.
 */
export function applyUrgencyDelta(
  state: GameState,
  caseItem: Case,
  delta: number,
  reason: string,
  clampMin: number = 0,
  clampMax: number = 100,
): OwnerCaseReadinessWriteResult {
  const current = ensureOwnerCaseReadinessState(state, caseItem);
  const { state: newState, record } = addUrgencyDelta(current, delta, state.day, reason);

  // Update canonical state in-place
  const idx = state.runtimeOwnerCaseReadinessStates!.indexOf(current);
  if (idx >= 0) {
    state.runtimeOwnerCaseReadinessStates![idx] = newState;
  }

  // Sync Case mirror via named boundary (R23)
  syncLegacyCaseReadinessMirrors(caseItem, newState, 'canonical-delta');
  const mirrorUrgency = deriveCaseUrgencyMirror(newState);

  return {
    mirrorPatience: caseItem.patience,
    mirrorUrgency,
    canonicalState: newState,
    record,
  };
}
