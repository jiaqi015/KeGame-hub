/**
 * Process Manager Facade — domain-layer DI for runtime process managers.
 *
 * Breaks the domain→runtime reverse dependency in engine.ts.
 * The application layer registers runtime implementations at startup.
 * Domain engine calls through this facade; when unregistered, returns
 * empty process result summaries (no gameplay effect).
 *
 * This pattern mirrors onTickEnrichment: domain defines the hook shape,
 * application layer injects the runtime implementation.
 *
 * Hard constraints:
 * 1. No runtime imports. Only imports from domain/models.
 * 2. Module-level mutable state is intentional (DI registration).
 * 3. When unregistered, call functions return empty summaries —
 *    processResults array will have empty entries, which is safe.
 * 4. Registration is idempotent (last writer wins).
 */

import type { DailyProcessResultSummary, GameState } from '../models.js';

// ---------------------------------------------------------------------------
// Callback types — return DailyProcessResultSummary only.
// consensusReceipts is computed in resolveOneDay from processResults array,
// not from the negotiation result directly.
// ---------------------------------------------------------------------------

export type SettleNegotiationProcessesCallback = (state: GameState) => DailyProcessResultSummary;
export type AdvanceProductRunProcessesCallback = (state: GameState) => DailyProcessResultSummary;

// ---------------------------------------------------------------------------
// Module-level registration state
// ---------------------------------------------------------------------------

let _settleNegotiation: SettleNegotiationProcessesCallback | null = null;
let _advanceProductRun: AdvanceProductRunProcessesCallback | null = null;

/**
 * Register runtime process manager callbacks.
 * Called once from the application layer at startup.
 * Idempotent — last writer wins.
 */
export function registerProcessManagers(options: {
  settleNegotiationProcesses: SettleNegotiationProcessesCallback;
  advanceProductRunProcesses: AdvanceProductRunProcessesCallback;
}): void {
  _settleNegotiation = options.settleNegotiationProcesses;
  _advanceProductRun = options.advanceProductRunProcesses;
}

/**
 * Returns true if process managers are registered.
 */
export function hasProcessManagers(): boolean {
  return _settleNegotiation !== null && _advanceProductRun !== null;
}

// ---------------------------------------------------------------------------
// Call-through functions used by resolveOneDay
// ---------------------------------------------------------------------------

function buildEmptyProcessResultSummary(
  managerId: DailyProcessResultSummary['managerId'],
  phase: 'settled-day' | 'next-day-setup',
  day: number,
): DailyProcessResultSummary {
  const isNegotiation = managerId === 'negotiation-process-manager';
  return {
    managerId,
    owner: isNegotiation ? 'runtime-process-manager-facade' : 'runtime-process-manager',
    ...(isNegotiation ? { outcomeOwner: 'legacy-deal-closing-engine' as const } : {}),
    day,
    phase,
    processedCount: 0,
    resolvedCount: 0,
    emittedEventIds: [],
    closedDealIds: [],
    opportunityIds: [],
    productRunIds: [],
  };
}

/**
 * Call settleNegotiationProcessesForDay through the facade.
 * When unregistered, returns empty summary (no negotiation settlement).
 */
export function callSettleNegotiationProcesses(state: GameState): DailyProcessResultSummary {
  if (_settleNegotiation) {
    return _settleNegotiation(state);
  }
  return buildEmptyProcessResultSummary('negotiation-process-manager', 'settled-day', state.day);
}

/**
 * Call advanceProductRunProcessesForDay through the facade.
 * When unregistered, returns empty summary (no product run advancement).
 */
export function callAdvanceProductRunProcesses(state: GameState): DailyProcessResultSummary {
  if (_advanceProductRun) {
    return _advanceProductRun(state);
  }
  return buildEmptyProcessResultSummary('product-run-process-manager', 'next-day-setup', state.day);
}
