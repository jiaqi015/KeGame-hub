/**
 * sourceKinds.ts — canonical definition of information source categories.
 *
 * Architecture position:
 *   This is the single authority for the SourceKind type.
 *   Domain re-exports from here; core imports from here.
 *   This prevents core→domain layer boundary violations.
 *
 * The 15 information source categories in the selling-houses world.
 * Each kind maps to a specific canonical payload and a set of
 * possible causal event outputs.
 */

// ══════════════════════════════════════════════════════════════════════════
// SOURCE_KINDS — runtime ontology (as const tuple)
// ══════════════════════════════════════════════════════════════════════════

export const SOURCE_KINDS = [
  'market_signal',
  'rival_action',
  'customer_interaction',
  'owner_interview',
  'manager_message',
  'player_action_receipt',
  'process_receipt',
  'comparable_transaction',
  'platform_traffic',
  'acn_network_signal',
  'supporting_facility_signal',
  'broker_capacity_signal',
  'owner_life_event_signal',
  'buyer_financing_signal',
  'micro_market_signal',
] as const;

// ══════════════════════════════════════════════════════════════════════════
// SourceKind — derived from SOURCE_KINDS, single authority
// ══════════════════════════════════════════════════════════════════════════

export type SourceKind = (typeof SOURCE_KINDS)[number];

// ══════════════════════════════════════════════════════════════════════════
// isSourceKind — runtime type guard
// ══════════════════════════════════════════════════════════════════════════

const SOURCE_KIND_SET: ReadonlySet<string> = new Set(SOURCE_KINDS);

export function isSourceKind(value: unknown): value is SourceKind {
  return typeof value === 'string' && SOURCE_KIND_SET.has(value);
}

// ══════════════════════════════════════════════════════════════════════════
// assertSourceKind — throws with value on invalid
// ══════════════════════════════════════════════════════════════════════════

export function assertSourceKind(value: unknown, context?: string): asserts value is SourceKind {
  if (!isSourceKind(value)) {
    const ctx = context ? ` (${context})` : '';
    throw new Error(`Invalid SourceKind: ${String(value)}${ctx}`);
  }
}
