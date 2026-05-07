/**
 * AttentionState / AttentionLedger v0 — pure read model types.
 *
 * Mother model alignment (Section 5, Section 18.5):
 * - Attention is a scarce, decaying, allocatable state, not only a numeric resource.
 * - AttentionLedger records attention events.
 * - AttentionState tracks awareness, salience, priority, confidence-to-act, and allocated capacity.
 * - Trust can attract attention; repeated valuable attention can also build trust.
 *   They are coupled but not identical.
 *
 * This module is a READ-ONLY projection. It does NOT mutate GameState.
 * core/world-state cannot import domain/runtime.
 */

// ---------------------------------------------------------------------------
// AttentionActorKind: who is paying attention
// ---------------------------------------------------------------------------

export type AttentionActorKind = 'customer' | 'owner' | 'broker' | 'manager';

// ---------------------------------------------------------------------------
// AttentionTargetKind: what the attention is directed at
// ---------------------------------------------------------------------------

export type AttentionTargetKind =
  | 'asset_case'
  | 'customer_case_match'
  | 'brokered_opportunity'
  | 'owner_relation'
  | 'market_signal';

// ---------------------------------------------------------------------------
// AttentionSource: where the attention signal originates
// ---------------------------------------------------------------------------

export type AttentionSource =
  | 'customer_runtime'
  | 'opportunity_stage'
  | 'pressure_receipt'
  | 'broker_action'
  | 'market_signal'
  | 'consensus_receipt';

// ---------------------------------------------------------------------------
// AttentionEvent: a single attention event in the ledger
// ---------------------------------------------------------------------------

export interface AttentionEvent {
  readonly id: string;
  readonly day: number;
  readonly actorKind: AttentionActorKind;
  readonly actorId: string;
  readonly targetKind: AttentionTargetKind;
  readonly targetId: string;
  readonly source: AttentionSource;
  readonly dimension: AttentionDimension;
  readonly delta: number;
  readonly reason: string;
}

// ---------------------------------------------------------------------------
// AttentionDimension: the 6 attention dimensions from the mother model
// ---------------------------------------------------------------------------

export type AttentionDimension =
  | 'awareness'
  | 'salience'
  | 'priority'
  | 'confidenceToAct'
  | 'allocatedCapacity'
  | 'freshness';

// ---------------------------------------------------------------------------
// AttentionState: the current attention state for an actor-target pair
// ---------------------------------------------------------------------------

export interface AttentionState {
  readonly actorKind: AttentionActorKind;
  readonly actorId: string;
  readonly targetKind: AttentionTargetKind;
  readonly targetId: string;
  readonly dimensions: AttentionDimensions;
  readonly warnings: readonly AttentionWarningFlag[];
}

// ---------------------------------------------------------------------------
// AttentionDimensions: the 6 dimensions (all 0-100)
// ---------------------------------------------------------------------------

export interface AttentionDimensions {
  readonly awareness: number;
  readonly salience: number;
  readonly priority: number;
  readonly confidenceToAct: number;
  readonly allocatedCapacity: number;
  readonly freshness: number;
}

// ---------------------------------------------------------------------------
// AttentionWarningFlag: conflict / warning detection
// ---------------------------------------------------------------------------

export type AttentionWarningKind =
  | 'high_fit_low_attention'
  | 'high_pressure_no_capacity'
  | 'stale_attention'
  | 'duplicate_service_path_attention'
  | 'owner_attention_without_broker_followup';

export interface AttentionWarningFlag {
  readonly kind: AttentionWarningKind;
  readonly actorId: string;
  readonly targetId: string;
  readonly detail: string;
}

// ---------------------------------------------------------------------------
// AttentionLedger: collection of attention events
// ---------------------------------------------------------------------------

export interface AttentionLedger {
  readonly events: readonly AttentionEvent[];
  readonly byActor: ReadonlyMap<string, readonly AttentionEvent[]>;
  readonly byTarget: ReadonlyMap<string, readonly AttentionEvent[]>;
  readonly byActorTarget: ReadonlyMap<string, readonly AttentionEvent[]>;
}

// ---------------------------------------------------------------------------
// AttentionSummary: aggregated attention for a case across all actors
// ---------------------------------------------------------------------------

export interface AttentionSummary {
  readonly caseId: string;
  readonly customerAttention: readonly AttentionState[];
  readonly brokerAttention: readonly AttentionState[];
  readonly ownerAttention: readonly AttentionState[];
  readonly managerAttention: readonly AttentionState[];
  readonly totalAwareness: number;
  readonly totalSalience: number;
  readonly totalPriority: number;
  readonly warningCount: number;
  readonly warnings: readonly AttentionWarningFlag[];
}

// ---------------------------------------------------------------------------
// Plain input shapes for builders (no domain import)
// ---------------------------------------------------------------------------

export interface AttentionRelationInput {
  readonly relationKey: string;
  readonly customerId: string;
  readonly caseId: string;
  readonly matchFit: number;
  readonly matchInterest: number;
  readonly matchConfidence: number;
  readonly matchSelected: boolean;
  readonly matchOffered: boolean;
  readonly matchInteractions: number;
  readonly matchLastActiveDay: number;
  readonly matchViewed: boolean;
  readonly matchActive: boolean;
  readonly matchChurnRisk: number;
  readonly matchFatigue: number;
  readonly matchAdvisorTrust: number;
  readonly matchCustomerStatus: string;
  readonly brokeredPaths: readonly AttentionBrokeredPathInput[];
}

export interface AttentionBrokeredPathInput {
  readonly opportunityId: string;
  readonly stageIndex: number;
  readonly stageLabel: string;
  readonly status: string;
  readonly visibility: string;
  readonly leadSource: string;
  readonly brokerName: string | undefined;
  readonly daysLeft: number;
  readonly touchedToday: boolean;
  readonly stagnationTicks: number;
  readonly pendingClosingEvaluation: boolean;
}

export interface AttentionPressureInput {
  readonly caseId: string;
  readonly source: AttentionSource;
  readonly dimension: AttentionDimension;
  readonly magnitude: number;
  readonly reason: string;
  readonly day: number;
}

export interface AttentionOwnerInput {
  readonly caseId: string;
  readonly ownerName: string;
  readonly trust: number;
  readonly patience: number;
  readonly urgency: number;
  readonly heat: number;
}

export interface AttentionDeriveOptions {
  readonly currentDay?: number;
  readonly staleThresholdDays?: number;
  readonly highFitThreshold?: number;
  readonly lowAttentionThreshold?: number;
  readonly highPressureThreshold?: number;
  readonly capacityThreshold?: number;
}
