/**
 * Brand ID derivation — explicit fallback for same-brand-different-ACN detection.
 *
 * The ACN data model (AcnNetwork / ACNNetworkSnapshot) has no explicit brandId field.
 * Brand identity is derived from ACN ID naming convention: `acn-{suffix}` → brand = `acn`.
 *
 * Convention:
 *   acn-cooperative → brand "acn"
 *   acn-aggressive  → brand "acn"  (same brand, different network)
 *   acn-local       → brand "acn"  (same brand, different network)
 *   acn-extra-N     → brand "acn-extra"
 *   acn-N           → brand "acn"
 *
 * This is a fallback heuristic. If the ACN data model gains an explicit brandId,
 * this function should be replaced with a direct read from that field.
 *
 * Deterministic: same input → same output. No side effects.
 */

/**
 * Derive a brand ID from an ACN ID by stripping the last hyphen-delimited segment.
 * Returns undefined if acnId is falsy.
 */
export function deriveBrandId(acnId: string | undefined): string | undefined {
  if (!acnId) return undefined;
  const lastHyphen = acnId.lastIndexOf('-');
  if (lastHyphen === -1) return acnId;
  if (lastHyphen === 0) return undefined;
  return acnId.slice(0, lastHyphen);
}

/**
 * Resolve a store's ACN ID from its data, with single-source fallback.
 * Never uses `acn-${store.type}` — falls back to store ID if no acnId.
 */
export function resolveStoreAcnId(store: { readonly acnId?: string; readonly id: string; readonly type?: string }): string {
  return store.acnId ?? `fallback-acn-${store.id}`;
}

/**
 * Resolve the player broker's ACN ID.
 * Priority: existingRuntime.playerBrokerAcnId > fallback.
 * Never uses bare 'player-broker-acn' placeholder.
 */
export function resolvePlayerBrokerAcnId(existingRuntime?: { readonly playerBrokerAcnId?: string }): string {
  return existingRuntime?.playerBrokerAcnId ?? 'acn-cooperative';
}

/**
 * Resolve the initial player broker ACN ID from bootstrap data.
 * Priority: bootstrap.openingPOV.playerBroker.acnId > 'acn-cooperative'.
 * Used at game initialization to set the canonical player identity.
 */
export function resolveInitialPlayerBrokerAcnId(bootstrap?: {
  readonly openingPOV?: { readonly playerBroker?: { readonly acnId?: string } };
}): string {
  return bootstrap?.openingPOV?.playerBroker?.acnId ?? 'acn-cooperative';
}
