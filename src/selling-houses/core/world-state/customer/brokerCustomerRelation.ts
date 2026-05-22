/**
 * BrokerCustomerRelation v0 — trust/familiarity/influence between broker and customer.
 *
 * Mother model alignment:
 * - BrokerCustomerRelation: trust and interaction state between broker and customer.
 * - advisorTrust in CustomerRuntimeState is a compatibility mirror of this relation.
 *
 * Pure types + pure builder functions, no runtime side-effects.
 */

// ---------------------------------------------------------------------------
// BrokerCustomerRelation: canonical relation state
// ---------------------------------------------------------------------------

export interface BrokerCustomerRelation {
  /** Stable relation id: brokerId::customerId */
  readonly relationId: string;
  readonly brokerId: string;
  readonly customerId: string;
  readonly trust: number;
  readonly familiarity: number;
  readonly influence: number;
  readonly firstContactDay: number;
  readonly lastInteractionDay: number;
  readonly evidenceRefs: readonly string[];
  readonly sourceRecordIds: readonly string[];
  /** Source: 'canonical' when created from direct relation, 'legacy_compatibility_projection' when built from opportunity/CustomerRuntimeState */
  readonly source: 'canonical' | 'legacy_compatibility_projection';
}

// ---------------------------------------------------------------------------
// Stable relation id builder
// ---------------------------------------------------------------------------

/**
 * Builds a stable relation id from broker and customer ids.
 * Format: brokerId::customerId
 */
export function buildBrokerCustomerRelationId(brokerId: string, customerId: string): string {
  return `${brokerId}::${customerId}`;
}

// ---------------------------------------------------------------------------
// Relation create (pure)
// ---------------------------------------------------------------------------

/**
 * Creates a new BrokerCustomerRelation for a broker-customer pair.
 * Pure function — no mutation, no side-effects.
 */
export function createBrokerCustomerRelation(
  brokerId: string,
  customerId: string,
  day: number,
  opts?: {
    trust?: number;
    familiarity?: number;
    influence?: number;
    source?: 'canonical' | 'legacy_compatibility_projection';
    evidenceRefs?: readonly string[];
    sourceRecordIds?: readonly string[];
  },
): BrokerCustomerRelation {
  return Object.freeze({
    relationId: buildBrokerCustomerRelationId(brokerId, customerId),
    brokerId,
    customerId,
    trust: clamp01(opts?.trust ?? 48),
    familiarity: clamp01(opts?.familiarity ?? 20),
    influence: clamp01(opts?.influence ?? 30),
    firstContactDay: day,
    lastInteractionDay: day,
    evidenceRefs: Object.freeze([...(opts?.evidenceRefs ?? [])]),
    sourceRecordIds: Object.freeze([...(opts?.sourceRecordIds ?? [])]),
    source: opts?.source ?? 'canonical',
  });
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(100, Math.round(v)));
}
