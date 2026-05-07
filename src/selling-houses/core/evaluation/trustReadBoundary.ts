/**
 * Trust Read Boundary — canonical trust resolution with fallback.
 *
 * Mother model alignment:
 * - Agent A field ownership: Case.trust → BrokerOwnerRelation.trust (canonical)
 * - trust is a broker-owner-relation field, NOT an asset-case fact
 * - Case.trust is a legacy mirror for backward compatibility
 *
 * This module provides a read helper that:
 * 1. Prefers BrokerOwnerRelation.trust (canonical)
 * 2. Falls back to Case.trust (legacy mirror) when relation is absent
 * 3. Returns a source marker so consumers know where the value came from
 *
 * Pure functions. No mutation. No domain/runtime imports.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TrustReadSource = 'canonical_relation' | 'legacy_case_mirror' | 'missing';

export interface TrustReadResult {
  readonly value: number;
  readonly source: TrustReadSource;
}

// ---------------------------------------------------------------------------
// Plain input shapes (no domain import)
// ---------------------------------------------------------------------------

export interface TrustCaseShape {
  readonly trust: number;
}

export interface TrustRelationShape {
  readonly trust: number;
}

// ---------------------------------------------------------------------------
// readTrust — canonical resolution with fallback
// ---------------------------------------------------------------------------

/**
 * Read trust from BrokerOwnerRelation (canonical) with fallback to Case.trust.
 *
 * Priority:
 * 1. relation?.trust → 'canonical_relation'
 * 2. caseItem.trust → 'legacy_case_mirror'
 * 3. neither → 'missing', value = 0
 *
 * Pure function. No mutation.
 */
export function readTrust(
  caseItem: TrustCaseShape,
  relation?: TrustRelationShape | null,
): TrustReadResult {
  if (relation && typeof relation.trust === 'number' && Number.isFinite(relation.trust)) {
    return { value: relation.trust, source: 'canonical_relation' };
  }

  if (typeof caseItem.trust === 'number' && Number.isFinite(caseItem.trust)) {
    return { value: caseItem.trust, source: 'legacy_case_mirror' };
  }

  return { value: 0, source: 'missing' };
}

// ---------------------------------------------------------------------------
// readTrustValue — convenience helper returning just the number
// ---------------------------------------------------------------------------

/**
 * Convenience: returns just the trust value, preferring canonical.
 * Use when source tracking is not needed.
 */
export function readTrustValue(
  caseItem: TrustCaseShape,
  relation?: TrustRelationShape | null,
): number {
  return readTrust(caseItem, relation).value;
}

// ---------------------------------------------------------------------------
// Relation lookup from state
// ---------------------------------------------------------------------------

/**
 * Plain shape for BrokerOwnerRelation trust state.
 * Matches the structure on GameState.runtimeBrokerOwnerRelations.
 * No domain import needed.
 */
export interface BrokerOwnerRelationTrustStateShape {
  readonly relationId: string;
  readonly brokerId: string;
  readonly ownerId: string;
  readonly trust: number;
  readonly lastUpdatedDay: number;
}

/**
 * Plain shape for state that carries runtimeBrokerOwnerRelations.
 * Avoids importing GameState directly.
 */
export interface StateWithRelations {
  readonly runtimeBrokerOwnerRelations?: readonly BrokerOwnerRelationTrustStateShape[];
}

/**
 * Build the canonical relationId for a case.
 * Matches the format used by world-state/adapters.ts:
 *   relationId = `broker:maintainer:${maintainerName}::owner:${caseId}`
 *
 * Pure function. No mutation.
 */
export function buildCaseRelationId(caseId: string, maintainerName: string): string {
  return `broker:maintainer:${maintainerName}::owner:${caseId}`;
}

/**
 * Find the BrokerOwnerRelation trust for a case from state.
 * Returns the relation shape if found, null otherwise.
 *
 * Lookup: match relationId == `broker:maintainer:${maintainerName}::owner:${caseId}`
 *
 * Pure function. No mutation.
 */
export function findRelationTrustForCase(
  state: StateWithRelations,
  caseId: string,
  maintainerName: string,
): BrokerOwnerRelationTrustStateShape | null {
  const relations = state.runtimeBrokerOwnerRelations;
  if (!relations || relations.length === 0) return null;

  const relationId = buildCaseRelationId(caseId, maintainerName);
  return relations.find((r) => r.relationId === relationId) ?? null;
}

/**
 * Read trust for a case, auto-resolving the relation from state.
 *
 * Priority:
 * 1. state.runtimeBrokerOwnerRelations[matching] → 'canonical_relation'
 * 2. caseItem.trust → 'legacy_case_mirror'
 * 3. neither → 'missing'
 *
 * Pure function. No mutation.
 */
export function readTrustFromState(
  caseItem: TrustCaseShape & { readonly id: string; readonly maintainerName: string },
  state: StateWithRelations,
): TrustReadResult {
  const relation = findRelationTrustForCase(state, caseItem.id, caseItem.maintainerName);
  return readTrust(caseItem, relation);
}
