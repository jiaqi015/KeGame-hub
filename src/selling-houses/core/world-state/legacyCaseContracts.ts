/**
 * Minimal contract for the legacy Case shape that core legacy-case utilities
 * actually need. This avoids importing the full domain Case aggregate.
 *
 * Consumers that have a full domain Case can pass it directly since Case
 * satisfies this contract (Case has id: string). The contract exists so core
 * does not depend on the domain aggregate at the type level.
 *
 * Internal field access uses `as Record<string, unknown>` since the full
 * Case type is not available here.
 */

export type LegacyCaseLike = { id: string };
