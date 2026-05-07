/**
 * Owner Case Read Boundary — canonical patience/urgency resolution with fallback.
 *
 * Mother model alignment:
 * - Agent A field ownership: Case.patience → Owner.patience (canonical)
 * - Agent A field ownership: Case.urgency → Owner.urgency (canonical)
 * - patience and urgency are owner-decision fields, NOT asset-case facts
 * - Case.patience and Case.urgency are legacy mirrors for backward compatibility
 *
 * This module provides read helpers that:
 * 1. Prefer Owner/OwnerCaseRelation values (canonical)
 * 2. Fall back to Case values (legacy mirror) when relation is absent
 * 3. Return source markers so consumers know where the value came from
 *
 * Pure functions. No mutation. No domain/runtime imports.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type OwnerCaseReadSource = 'canonical_owner_case_relation' | 'legacy_case_mirror' | 'missing';

export interface OwnerCaseReadResult {
  readonly value: number;
  readonly source: OwnerCaseReadSource;
}

// ---------------------------------------------------------------------------
// Plain input shapes (no domain import)
// ---------------------------------------------------------------------------

export interface OwnerCaseShape {
  readonly patience: number;
  readonly urgency: number;
}

export interface OwnerRelationShape {
  readonly patience: number;
  readonly urgency: number;
}

// ---------------------------------------------------------------------------
// readPatience — canonical resolution with fallback
// ---------------------------------------------------------------------------

/**
 * Read patience from Owner/OwnerCaseRelation (canonical) with fallback to Case.
 *
 * Priority:
 * 1. relation?.patience → 'canonical_owner_case_relation'
 * 2. caseItem.patience → 'legacy_case_mirror'
 * 3. neither → 'missing', value = 0
 *
 * Pure function. No mutation.
 */
export function readPatience(
  caseItem: OwnerCaseShape,
  relation?: OwnerRelationShape | null,
): OwnerCaseReadResult {
  if (relation && typeof relation.patience === 'number' && Number.isFinite(relation.patience)) {
    return { value: relation.patience, source: 'canonical_owner_case_relation' };
  }

  if (typeof caseItem.patience === 'number' && Number.isFinite(caseItem.patience)) {
    return { value: caseItem.patience, source: 'legacy_case_mirror' };
  }

  return { value: 0, source: 'missing' };
}

// ---------------------------------------------------------------------------
// readUrgency — canonical resolution with fallback
// ---------------------------------------------------------------------------

/**
 * Read urgency from Owner/OwnerCaseRelation (canonical) with fallback to Case.
 *
 * Priority:
 * 1. relation?.urgency → 'canonical_owner_case_relation'
 * 2. caseItem.urgency → 'legacy_case_mirror'
 * 3. neither → 'missing', value = 0
 *
 * Pure function. No mutation.
 */
export function readUrgency(
  caseItem: OwnerCaseShape,
  relation?: OwnerRelationShape | null,
): OwnerCaseReadResult {
  if (relation && typeof relation.urgency === 'number' && Number.isFinite(relation.urgency)) {
    return { value: relation.urgency, source: 'canonical_owner_case_relation' };
  }

  if (typeof caseItem.urgency === 'number' && Number.isFinite(caseItem.urgency)) {
    return { value: caseItem.urgency, source: 'legacy_case_mirror' };
  }

  return { value: 0, source: 'missing' };
}

// ---------------------------------------------------------------------------
// readOwnerCaseValues — combined read for both dimensions
// ---------------------------------------------------------------------------

export interface OwnerCaseReadResults {
  readonly patience: OwnerCaseReadResult;
  readonly urgency: OwnerCaseReadResult;
}

/**
 * Read both patience and urgency from Owner/OwnerCaseRelation with fallback.
 * Pure function. No mutation.
 */
export function readOwnerCaseValues(
  caseItem: OwnerCaseShape,
  relation?: OwnerRelationShape | null,
): OwnerCaseReadResults {
  return {
    patience: readPatience(caseItem, relation),
    urgency: readUrgency(caseItem, relation),
  };
}

// ---------------------------------------------------------------------------
// Relation lookup from state
// ---------------------------------------------------------------------------

/**
 * Plain shape for OwnerCaseRelation readiness state.
 * Matches the owner-decision fields on Owner.
 * No domain import needed.
 */
export interface OwnerCaseRelationReadinessShape {
  readonly relationId: string;
  readonly ownerId: string;
  readonly assetCaseId: string;
  readonly patience: number;
  readonly urgency: number;
  readonly windowDays: number;
}

/**
 * Plain shape for state that carries runtimeOwnerCaseRelations.
 * Avoids importing GameState directly.
 */
export interface StateWithOwnerCaseRelations {
  readonly runtimeOwnerCaseRelations?: readonly OwnerCaseRelationReadinessShape[];
}

/**
 * Build the canonical relationId for an owner-case relation.
 * Aligned with Agent A's format in ownerCaseReadinessWriteSource.ts: `owner-case:${caseId}`
 *
 * Pure function. No mutation.
 */
export function buildOwnerCaseRelationId(caseId: string): string {
  return `owner-case:${caseId}`;
}

/**
 * Find the OwnerCaseRelation readiness for a case from state.
 * Returns the relation shape if found, null otherwise.
 *
 * Pure function. No mutation.
 */
export function findOwnerCaseRelationForCase(
  state: StateWithOwnerCaseRelations,
  caseId: string,
): OwnerCaseRelationReadinessShape | null {
  const relations = state.runtimeOwnerCaseRelations;
  if (!relations || relations.length === 0) return null;

  const relationId = buildOwnerCaseRelationId(caseId);
  return relations.find((r) => r.relationId === relationId) ?? null;
}

/**
 * Read patience/urgency for a case, auto-resolving the relation from state.
 *
 * Priority:
 * 1. state.runtimeOwnerCaseRelations[matching] → 'canonical_owner_case_relation'
 * 2. caseItem values → 'legacy_case_mirror'
 * 3. neither → 'missing'
 *
 * Pure function. No mutation.
 */
export function readOwnerCaseValuesFromState(
  caseItem: OwnerCaseShape & { readonly id: string },
  state: StateWithOwnerCaseRelations,
): OwnerCaseReadResults {
  const relation = findOwnerCaseRelationForCase(state, caseItem.id);
  return readOwnerCaseValues(caseItem, relation);
}
