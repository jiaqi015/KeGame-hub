/**
 * Opportunity Split Write Source v0 — canonical runtime state for CustomerCaseMatch / BrokeredOpportunity.
 *
 * Mother model alignment:
 * - CustomerCaseMatch = AssetCase × Customer × MatchState (the underlying purchase possibility)
 * - BrokeredOpportunity = CustomerCaseMatch × ListingMandate × BuyerMandate × CooperationState (service path)
 * - One customer-case match can have multiple brokered paths
 * - Demand scoring must deduplicate by customer/match
 *
 * This module establishes canonical write sources for opportunity relations.
 * Legacy Opportunity remains as a compatibility mirror.
 *
 * Hard constraints:
 * 1. Pure functions in core — no domain/runtime imports.
 * 2. No Date.now, no Math.random, no crypto, no global state.
 * 3. Deterministic: same input → same output.
 * 4. Write functions return frozen objects — no mutation.
 * 5. Legacy Opportunity is NOT deleted — it's a compatibility mirror.
 */

// ---------------------------------------------------------------------------
// CustomerCaseMatchState: canonical match state
// ---------------------------------------------------------------------------

export interface CustomerCaseMatchState {
  /** Stable match id: match:${customerId}::${caseId} */
  readonly matchId: string;
  /** Customer id */
  readonly customerId: string;
  /** Case id */
  readonly caseId: string;
  /** Match quality score (0-100) */
  readonly fit: number;
  /** Customer interest/intent in this case (0-100) */
  readonly interest: number;
  /** Customer confidence in this case (0-100) */
  readonly confidence: number;
  /** Customer budget max */
  readonly budgetMax: number;
  /** Customer price sensitivity (0-100) */
  readonly priceSensitivity: number;
  /** Whether customer selected this case */
  readonly selected: boolean;
  /** Whether customer received an offer */
  readonly offered: boolean;
  /** Whether customer viewed this case */
  readonly viewed: boolean;
  /** Day match was last updated */
  readonly lastUpdatedDay: number;
  /** Optional: source event refs */
  readonly sourceEventRefs: readonly string[];
  /** Optional: source pressure refs */
  readonly sourcePressureRefs: readonly string[];
}

// ---------------------------------------------------------------------------
// CustomerCaseMatchRecord: immutable record of a match change
// ---------------------------------------------------------------------------

export interface CustomerCaseMatchRecord {
  /** The match id */
  readonly matchId: string;
  /** Day of the change */
  readonly day: number;
  /** Which field changed */
  readonly field: string;
  /** Value before the change */
  readonly previousValue: number | boolean | string;
  /** Value after the change */
  readonly newValue: number | boolean | string;
  /** Reason for the change */
  readonly reason: string;
  /** Source event refs */
  readonly sourceEventRefs: readonly string[];
  /** Source pressure refs */
  readonly sourcePressureRefs: readonly string[];
}

// ---------------------------------------------------------------------------
// BrokeredOpportunityState: canonical brokered opportunity state
// ---------------------------------------------------------------------------

export interface BrokeredOpportunityState {
  /** Stable brokered opportunity id: brokered:${legacyOpportunityId} */
  readonly brokeredOpportunityId: string;
  /** Legacy opportunity id (compatibility ref) */
  readonly legacyOpportunityId: string;
  /** Match id this opportunity is based on */
  readonly matchId: string;
  /** Customer id */
  readonly customerId: string;
  /** Case id */
  readonly caseId: string;
  /** Funnel stage index */
  readonly stageIndex: number;
  /** Funnel stage label */
  readonly stageLabel: string;
  /** Opportunity status */
  readonly status: string;
  /** Lifecycle status */
  readonly lifecycleStatus: string;
  /** Lead source */
  readonly leadSource: string;
  /** Visibility */
  readonly visibility: string;
  /** Channel id */
  readonly channelId: string;
  /** Channel name */
  readonly channelName: string;
  /** Broker name */
  readonly brokerName: string;
  /** Days left */
  readonly daysLeft: number;
  /** Stagnation ticks */
  readonly stagnationTicks: number;
  /** Whether touched today */
  readonly touchedToday: boolean;
  /** Whether pending closing evaluation */
  readonly pendingClosingEvaluation: boolean;
  /** Pending closing strategy id */
  readonly pendingClosingStrategyId: string;
  /** Pending closing requested day */
  readonly pendingClosingRequestedDay: number;
  /** Day this opportunity was created */
  readonly createdDay: number;
  /** Day this opportunity was last updated */
  readonly lastUpdatedDay: number;
  /** Optional: source event refs */
  readonly sourceEventRefs: readonly string[];
  /** Optional: source pressure refs */
  readonly sourcePressureRefs: readonly string[];
}

// ---------------------------------------------------------------------------
// BrokeredOpportunityRecord: immutable record of an opportunity change
// ---------------------------------------------------------------------------

export interface BrokeredOpportunityRecord {
  /** The brokered opportunity id */
  readonly brokeredOpportunityId: string;
  /** Day of the change */
  readonly day: number;
  /** Which field changed */
  readonly field: string;
  /** Value before the change */
  readonly previousValue: number | boolean | string;
  /** Value after the change */
  readonly newValue: number | boolean | string;
  /** Reason for the change */
  readonly reason: string;
  /** Source event refs */
  readonly sourceEventRefs: readonly string[];
  /** Source pressure refs */
  readonly sourcePressureRefs: readonly string[];
}

// ---------------------------------------------------------------------------
// Deterministic ID builders
// ---------------------------------------------------------------------------

/**
 * Builds a stable customer-case match id.
 * Format: match:${customerId}::${caseId}
 */
export function buildCustomerCaseMatchId(customerId: string, caseId: string): string {
  return `match:${customerId}::${caseId}`;
}

/**
 * Builds a stable brokered opportunity id.
 * Format: brokered:${legacyOpportunityId}
 */
export function buildBrokeredOpportunityId(legacyOpportunityId: string): string {
  return `brokered:${legacyOpportunityId}`;
}

// ---------------------------------------------------------------------------
// CustomerCaseMatchState write functions (pure, no mutation)
// ---------------------------------------------------------------------------

/**
 * Creates a new CustomerCaseMatchState.
 */
export function createCustomerCaseMatchState(
  customerId: string,
  caseId: string,
  fit: number,
  interest: number,
  confidence: number,
  budgetMax: number,
  priceSensitivity: number,
  day: number,
): CustomerCaseMatchState {
  return Object.freeze({
    matchId: buildCustomerCaseMatchId(customerId, caseId),
    customerId,
    caseId,
    fit: clampValue(fit),
    interest: clampValue(interest),
    confidence: clampValue(confidence),
    budgetMax,
    priceSensitivity: clampValue(priceSensitivity),
    selected: false,
    offered: false,
    viewed: false,
    lastUpdatedDay: day,
    sourceEventRefs: Object.freeze([]),
    sourcePressureRefs: Object.freeze([]),
  });
}

/**
 * Sets fit/interest/confidence on a match. Returns a new frozen state and record.
 */
export function setCustomerCaseMatchScores(
  state: CustomerCaseMatchState,
  scores: { fit?: number; interest?: number; confidence?: number },
  day: number,
  reason: string,
  sourceEventRefs: readonly string[] = [],
  sourcePressureRefs: readonly string[] = [],
): { state: CustomerCaseMatchState; record: CustomerCaseMatchRecord } {
  let newState = state;
  let lastRecord: CustomerCaseMatchRecord | undefined;

  if (scores.fit !== undefined) {
    const clamped = clampValue(scores.fit);
    newState = Object.freeze({ ...newState, fit: clamped, lastUpdatedDay: day });
    lastRecord = Object.freeze({
      matchId: state.matchId, day, field: 'fit',
      previousValue: state.fit, newValue: clamped, reason,
      sourceEventRefs: Object.freeze([...sourceEventRefs]),
      sourcePressureRefs: Object.freeze([...sourcePressureRefs]),
    });
  }

  if (scores.interest !== undefined) {
    const clamped = clampValue(scores.interest);
    newState = Object.freeze({ ...newState, interest: clamped, lastUpdatedDay: day });
    lastRecord = Object.freeze({
      matchId: state.matchId, day, field: 'interest',
      previousValue: state.interest, newValue: clamped, reason,
      sourceEventRefs: Object.freeze([...sourceEventRefs]),
      sourcePressureRefs: Object.freeze([...sourcePressureRefs]),
    });
  }

  if (scores.confidence !== undefined) {
    const clamped = clampValue(scores.confidence);
    newState = Object.freeze({ ...newState, confidence: clamped, lastUpdatedDay: day });
    lastRecord = Object.freeze({
      matchId: state.matchId, day, field: 'confidence',
      previousValue: state.confidence, newValue: clamped, reason,
      sourceEventRefs: Object.freeze([...sourceEventRefs]),
      sourcePressureRefs: Object.freeze([...sourcePressureRefs]),
    });
  }

  // Sync refs
  newState = Object.freeze({
    ...newState,
    sourceEventRefs: Object.freeze([...sourceEventRefs]),
    sourcePressureRefs: Object.freeze([...sourcePressureRefs]),
  });

  return {
    state: newState,
    record: lastRecord ?? Object.freeze({
      matchId: state.matchId, day, field: 'none',
      previousValue: 0, newValue: 0, reason,
      sourceEventRefs: Object.freeze([...sourceEventRefs]),
      sourcePressureRefs: Object.freeze([...sourcePressureRefs]),
    }),
  };
}

/**
 * Applies deltas to fit/interest/confidence on a match. Returns a new frozen state and record.
 */
export function applyCustomerCaseMatchDelta(
  state: CustomerCaseMatchState,
  deltas: { fitDelta?: number; interestDelta?: number; confidenceDelta?: number },
  day: number,
  reason: string,
  sourceEventRefs: readonly string[] = [],
  sourcePressureRefs: readonly string[] = [],
): { state: CustomerCaseMatchState; record: CustomerCaseMatchRecord } {
  return setCustomerCaseMatchScores(
    state,
    {
      fit: deltas.fitDelta !== undefined ? state.fit + deltas.fitDelta : undefined,
      interest: deltas.interestDelta !== undefined ? state.interest + deltas.interestDelta : undefined,
      confidence: deltas.confidenceDelta !== undefined ? state.confidence + deltas.confidenceDelta : undefined,
    },
    day,
    reason,
    sourceEventRefs,
    sourcePressureRefs,
  );
}

// ---------------------------------------------------------------------------
// BrokeredOpportunityState write functions (pure, no mutation)
// ---------------------------------------------------------------------------

/**
 * Creates a new BrokeredOpportunityState.
 */
export function createBrokeredOpportunityState(
  legacyOpportunityId: string,
  matchId: string,
  customerId: string,
  caseId: string,
  stageIndex: number,
  stageLabel: string,
  status: string,
  lifecycleStatus: string,
  leadSource: string,
  visibility: string,
  channelId: string,
  channelName: string,
  brokerName: string,
  daysLeft: number,
  createdDay: number,
): BrokeredOpportunityState {
  return Object.freeze({
    brokeredOpportunityId: buildBrokeredOpportunityId(legacyOpportunityId),
    legacyOpportunityId,
    matchId,
    customerId,
    caseId,
    stageIndex,
    stageLabel,
    status,
    lifecycleStatus,
    leadSource,
    visibility,
    channelId,
    channelName,
    brokerName,
    daysLeft,
    stagnationTicks: 0,
    touchedToday: false,
    pendingClosingEvaluation: false,
    pendingClosingStrategyId: '',
    pendingClosingRequestedDay: 0,
    createdDay,
    lastUpdatedDay: createdDay,
    sourceEventRefs: Object.freeze([]),
    sourcePressureRefs: Object.freeze([]),
  });
}

/**
 * Sets stage on a brokered opportunity. Returns a new frozen state and record.
 */
export function setBrokeredOpportunityStage(
  state: BrokeredOpportunityState,
  stageIndex: number,
  stageLabel: string,
  day: number,
  reason: string,
  sourceEventRefs: readonly string[] = [],
  sourcePressureRefs: readonly string[] = [],
): { state: BrokeredOpportunityState; record: BrokeredOpportunityRecord } {
  const newState = Object.freeze({
    ...state,
    stageIndex,
    stageLabel,
    lastUpdatedDay: day,
    sourceEventRefs: Object.freeze([...sourceEventRefs]),
    sourcePressureRefs: Object.freeze([...sourcePressureRefs]),
  });

  const record: BrokeredOpportunityRecord = Object.freeze({
    brokeredOpportunityId: state.brokeredOpportunityId,
    day,
    field: 'stage',
    previousValue: `${state.stageIndex}:${state.stageLabel}`,
    newValue: `${stageIndex}:${stageLabel}`,
    reason,
    sourceEventRefs: Object.freeze([...sourceEventRefs]),
    sourcePressureRefs: Object.freeze([...sourcePressureRefs]),
  });

  return { state: newState, record };
}

/**
 * Sets lifecycle status on a brokered opportunity. Returns a new frozen state and record.
 */
export function setBrokeredOpportunityLifecycle(
  state: BrokeredOpportunityState,
  status: string,
  lifecycleStatus: string,
  day: number,
  reason: string,
  sourceEventRefs: readonly string[] = [],
  sourcePressureRefs: readonly string[] = [],
): { state: BrokeredOpportunityState; record: BrokeredOpportunityRecord } {
  const newState = Object.freeze({
    ...state,
    status,
    lifecycleStatus,
    lastUpdatedDay: day,
    sourceEventRefs: Object.freeze([...sourceEventRefs]),
    sourcePressureRefs: Object.freeze([...sourcePressureRefs]),
  });

  const record: BrokeredOpportunityRecord = Object.freeze({
    brokeredOpportunityId: state.brokeredOpportunityId,
    day,
    field: 'lifecycle',
    previousValue: `${state.status}:${state.lifecycleStatus}`,
    newValue: `${status}:${lifecycleStatus}`,
    reason,
    sourceEventRefs: Object.freeze([...sourceEventRefs]),
    sourcePressureRefs: Object.freeze([...sourcePressureRefs]),
  });

  return { state: newState, record };
}

/**
 * Sets pending closing on a brokered opportunity. Returns a new frozen state and record.
 */
export function setBrokeredOpportunityPendingClosing(
  state: BrokeredOpportunityState,
  pendingClosingEvaluation: boolean,
  pendingClosingStrategyId: string,
  pendingClosingRequestedDay: number,
  day: number,
  reason: string,
  sourceEventRefs: readonly string[] = [],
  sourcePressureRefs: readonly string[] = [],
): { state: BrokeredOpportunityState; record: BrokeredOpportunityRecord } {
  const newState = Object.freeze({
    ...state,
    pendingClosingEvaluation,
    pendingClosingStrategyId,
    pendingClosingRequestedDay,
    lastUpdatedDay: day,
    sourceEventRefs: Object.freeze([...sourceEventRefs]),
    sourcePressureRefs: Object.freeze([...sourcePressureRefs]),
  });

  const record: BrokeredOpportunityRecord = Object.freeze({
    brokeredOpportunityId: state.brokeredOpportunityId,
    day,
    field: 'pendingClosing',
    previousValue: `${state.pendingClosingEvaluation}:${state.pendingClosingStrategyId}`,
    newValue: `${pendingClosingEvaluation}:${pendingClosingStrategyId}`,
    reason,
    sourceEventRefs: Object.freeze([...sourceEventRefs]),
    sourcePressureRefs: Object.freeze([...sourcePressureRefs]),
  });

  return { state: newState, record };
}

/**
 * Applies progress deltas to a brokered opportunity (daysLeft, stagnationTicks).
 * Returns a new frozen state and record.
 */
export function applyBrokeredOpportunityProgressDelta(
  state: BrokeredOpportunityState,
  deltas: { daysLeftDelta?: number; stagnationTicksDelta?: number },
  day: number,
  reason: string,
  sourceEventRefs: readonly string[] = [],
  sourcePressureRefs: readonly string[] = [],
): { state: BrokeredOpportunityState; record: BrokeredOpportunityRecord } {
  const newDaysLeft = deltas.daysLeftDelta !== undefined
    ? Math.max(0, state.daysLeft + deltas.daysLeftDelta)
    : state.daysLeft;
  const newStagnationTicks = deltas.stagnationTicksDelta !== undefined
    ? Math.max(0, state.stagnationTicks + deltas.stagnationTicksDelta)
    : state.stagnationTicks;

  const newState = Object.freeze({
    ...state,
    daysLeft: newDaysLeft,
    stagnationTicks: newStagnationTicks,
    lastUpdatedDay: day,
    sourceEventRefs: Object.freeze([...sourceEventRefs]),
    sourcePressureRefs: Object.freeze([...sourcePressureRefs]),
  });

  const record: BrokeredOpportunityRecord = Object.freeze({
    brokeredOpportunityId: state.brokeredOpportunityId,
    day,
    field: 'progress',
    previousValue: `daysLeft:${state.daysLeft},stagnation:${state.stagnationTicks}`,
    newValue: `daysLeft:${newDaysLeft},stagnation:${newStagnationTicks}`,
    reason,
    sourceEventRefs: Object.freeze([...sourceEventRefs]),
    sourcePressureRefs: Object.freeze([...sourcePressureRefs]),
  });

  return { state: newState, record };
}

// ---------------------------------------------------------------------------
// Legacy mirror derivation
// ---------------------------------------------------------------------------

/**
 * Derives legacy Opportunity mirror values from a BrokeredOpportunityState.
 * Used for backward compatibility — Opportunity fields should be synced from this.
 */
export function deriveLegacyOpportunityMirror(state: BrokeredOpportunityState) {
  return Object.freeze({
    id: state.legacyOpportunityId,
    caseId: state.caseId,
    customerId: state.customerId,
    stageIndex: state.stageIndex,
    stageLabel: state.stageLabel,
    status: state.status,
    lifecycleStatus: state.lifecycleStatus,
    leadSource: state.leadSource,
    visibility: state.visibility,
    channelId: state.channelId,
    channelName: state.channelName,
    brokerName: state.brokerName,
    daysLeft: state.daysLeft,
    stagnationTicks: state.stagnationTicks,
    touchedToday: state.touchedToday,
    pendingClosingEvaluation: state.pendingClosingEvaluation,
    pendingClosingStrategyId: state.pendingClosingStrategyId,
    pendingClosingRequestedDay: state.pendingClosingRequestedDay,
    createdDay: state.createdDay,
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function clampValue(value: number, min: number = 0, max: number = 100): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}
