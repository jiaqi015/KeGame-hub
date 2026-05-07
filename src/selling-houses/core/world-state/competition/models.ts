/**
 * Competition and pressure types aligned with the mother model (Section 10).
 *
 * Mother model competition flow:
 *   CompetitionEvidence -> CompetitionPressureSnapshot -> CompetitionPOV -> DecisionPressureDelta
 *
 * These types are READ-ONLY snapshots. They do not mutate legacy GameState.
 * They explain "where did the pressure come from and what did it affect."
 */

// ---------------------------------------------------------------------------
// ConstraintSignal: a single measurable force acting on an entity
// ---------------------------------------------------------------------------

export type ConstraintSignalSource =
  | 'rival-listing'
  | 'competition-group'
  | 'company-pressure'
  | 'customer-feedback'
  | 'rival-customer-pull'
  | 'random-event'
  | 'scripted-event'
  | 'market-signal'
  | 'seasonality';

export type ConstraintSignalTargetEntityKind =
  | 'case'
  | 'opportunity'
  | 'market-cell'
  | 'customer-runtime';

export type ConstraintSignalDimension =
  | 'heat'
  | 'trust'
  | 'patience'
  | 'urgency'
  | 'intent'
  | 'confidence'
  | 'churn-risk'
  | 'competitive-pressure'
  | 'sentiment'
  | 'demand-heat';

/**
 * A single constraint signal represents one pressure vector:
 * "source X pushed dimension Y on target Z by magnitude M because of evidence E."
 */
export interface ConstraintSignal {
  readonly id: string;
  readonly source: ConstraintSignalSource;
  readonly targetEntityKind: ConstraintSignalTargetEntityKind;
  readonly targetEntityId: string;
  readonly dimension: ConstraintSignalDimension;
  /** Signed delta. Negative means pressure reduced the value. */
  readonly magnitude: number;
  /** Human-readable explanation. */
  readonly evidence: string;
  readonly day: number;
}

// ---------------------------------------------------------------------------
// CompetitionEvidence: structured evidence for why competition mattered
// ---------------------------------------------------------------------------

export type CompetitionEvidenceKind =
  | 'rival-price-overlap'
  | 'rival-lead-siphon'
  | 'rival-owner-anchor'
  | 'group-premium-penalty'
  | 'group-price-cutter'
  | 'group-sold-spillover'
  | 'company-shared-lead-pressure'
  | 'company-internal-competition'
  | 'customer-no-active-leads'
  | 'customer-comparing'
  | 'customer-high-intent-feedback'
  | 'rival-customer-pull-attention'
  | 'random-event-policy-shift'
  | 'random-event-school-boom'
  | 'random-event-competitor-activity'
  | 'scripted-event-effect'
  | 'rival-loss-window'
  | 'rival-loss-relationship-gap'
  | 'rival-loss-trust-collapse'
  | 'rival-loss-pipeline-opening'
  | 'rival-loss-price-trap';

export interface CompetitionEvidence {
  readonly id: string;
  readonly kind: CompetitionEvidenceKind;
  /** The entity that produced this evidence (rival listing id, competition group id, etc.) */
  readonly sourceEntityId: string;
  /** Human-readable label for the source. */
  readonly sourceLabel: string;
  readonly day: number;
  /** Numeric strength of this evidence, 0-100. */
  readonly strength: number;
  readonly detail: string;
}

// ---------------------------------------------------------------------------
// CompetitionPressureSnapshot: aggregated pressure on one Case at one tick
// ---------------------------------------------------------------------------

export interface CompetitionPressureSnapshot {
  readonly caseId: string;
  readonly day: number;
  /** All constraint signals that affected this case in this tick. */
  readonly signals: readonly ConstraintSignal[];
  /** All competition evidence gathered for this case in this tick. */
  readonly evidence: readonly CompetitionEvidence[];
  /** Net heat delta from all pressure sources. */
  readonly netHeatDelta: number;
  /** Net trust delta from all pressure sources. */
  readonly netTrustDelta: number;
  /** Net urgency delta from all pressure sources. */
  readonly netUrgencyDelta: number;
  /** Net intent delta from all pressure sources (opportunity-level). Optional in Round 1. */
  readonly netIntentDelta?: number;
  /** Whether this case was lost to a rival in this tick. */
  readonly lostToRival: boolean;
  /** Whether this case experienced significant pressure (any signal > threshold). */
  readonly hasSignificantPressure: boolean;
}

// ---------------------------------------------------------------------------
// CompetitionPOV: how an actor perceives competition around them
// ---------------------------------------------------------------------------

export type CompetitionPOVActor = 'broker' | 'owner' | 'manager';

export interface CompetitionPOV {
  readonly actor: CompetitionPOVActor;
  readonly day: number;
  /** Cases under pressure that this actor can see. */
  readonly pressuredCaseIds: readonly string[];
  /** Top evidence items ranked by strength. */
  readonly topEvidence: readonly CompetitionEvidence[];
  /** Summary line for display. */
  readonly headline: string;
  /** Number of active rival listings in relevant market cells. */
  readonly activeRivalCount: number;
  /** Whether company pressure is above threshold. */
  readonly companyPressureActive: boolean;
}

// ---------------------------------------------------------------------------
// DecisionPressureDelta: how competition changes an actor's decision pressure
// ---------------------------------------------------------------------------

export type DecisionPressureDimension =
  | 'price-adjustment-pressure'
  | 'speed-pressure'
  | 'service-quality-pressure'
  | 'trust-repair-pressure'
  | 'resource-allocation-pressure';

export interface DecisionPressureDelta {
  readonly caseId: string;
  readonly dimension: DecisionPressureDimension;
  /** Signed delta. Positive means more pressure to act. */
  readonly delta: number;
  readonly sourceEvidenceIds: readonly string[];
  readonly day: number;
  readonly summary: string;
}

// ---------------------------------------------------------------------------
// PressureInput: what legacy pressure code produces to explain a mutation
// ---------------------------------------------------------------------------

export type PressureInputSource =
  | 'rival-pressure'
  | 'competition-group'
  | 'competition-rival-loss'
  | 'company-pressure'
  | 'customer-feedback'
  | 'rival-customer-pull'
  | 'random-event'
  | 'scripted-event';

export interface PressureInput {
  readonly source: PressureInputSource;
  readonly caseId: string;
  readonly day: number;
  readonly dimension: ConstraintSignalDimension;
  /** Signed delta applied to the target. */
  readonly magnitude: number;
  /** Human-readable explanation. */
  readonly evidence: string;
  readonly sourceEntityId?: string;
  readonly sourceEntityLabel?: string;
  readonly evidenceKind?: CompetitionEvidenceKind;
  readonly evidenceStrength?: number;
  readonly evidenceDetail?: string;
  readonly opportunityIds?: readonly string[];
  readonly customerRuntimeIds?: readonly string[];
}

// ---------------------------------------------------------------------------
// PressureReceiptSink: abstract interface for domain code to collect inputs
// ---------------------------------------------------------------------------

/**
 * Domain code calls sink.collectPressure(input) to record a pressure event.
 * The actual implementation (buffer) lives in runtime; domain only sees this interface.
 * This keeps domain -> core dependency clean (no domain -> runtime).
 */
export interface PressureReceiptSink {
  collectPressure(input: PressureInput): void;
}

// ---------------------------------------------------------------------------
// PressureReceiptBundle: finalized receipts from one tick
// ---------------------------------------------------------------------------

/**
 * Immutable bundle of all pressure receipts produced from one tick.
 * Placed in core so that domain types (e.g. DailyTickResult) can reference it
 * without importing from runtime.
 */
export interface PressureReceiptBundle {
  readonly snapshots: readonly CompetitionPressureSnapshot[];
  readonly decisionDeltas: readonly DecisionPressureDelta[];
  readonly brokerPOV: CompetitionPOV;
  readonly ownerPOV: CompetitionPOV;
  readonly managerPOV: CompetitionPOV;
  readonly inputCount: number;
  readonly day: number;
}
