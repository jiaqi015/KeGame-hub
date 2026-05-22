import type { BigWorldTickPhaseId } from './types.js';

export type PhaseGroup = readonly BigWorldTickPhaseId[];

/**
 * Default phase groups for parallelizable execution.
 *
 * Dependency analysis:
 *   Phase 1 (Environment) — writes marketCellHeats, causalEvents
 *   Phase 2 (RivalBroker) — reads input only, not Phase 1 output → INDEPENDENT of Phase 1
 *   Phase 3 (ListingSupply) — reads Phase 1 MarketHeatShifted causal events
 *   Phase 4 (CustomerDemand) — reads Phase 2+3 rival/reprice causal events
 *   Phase 5 (OwnerPerception) — reads Phase 4 customer causal events
 *   Phase 6 (OpportunityPressure) — reads no causal events → INDEPENDENT of Phase 5
 *   Phase 7 (RecommendationPressure) — reads Phase 5 owner perception events
 *   Phase 8 (Compaction) — validates full chain
 *
 * Groups: [1,2] → [3] → [4] → [5,6] → [7] → [8]
 * Serial steps: 6 (down from 8), with 2 groups containing parallel phases.
 */
export function getDefaultPhaseGroups(): readonly PhaseGroup[] {
  return Object.freeze([
    Object.freeze(['EnvironmentPhase', 'RivalBrokerPhase'] as const),
    Object.freeze(['ListingSupplyPhase'] as const),
    Object.freeze(['CustomerDemandPhase'] as const),
    Object.freeze(['OwnerPerceptionPhase', 'OpportunityPressurePhase'] as const),
    Object.freeze(['RecommendationPressurePhase'] as const),
    Object.freeze(['CompactionPhase'] as const),
  ]);
}
