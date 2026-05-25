/**
 * Opportunity Split Helper v0 — GameState persistence facade for CustomerCaseMatch / BrokeredOpportunity.
 *
 * Bridges domain engine with core opportunity split write source, persisting
 * canonical match/opportunity state in GameState.runtimeCustomerCaseMatches
 * and GameState.runtimeBrokeredOpportunities.
 *
 * Mother model alignment:
 * - CustomerCaseMatch = AssetCase × Customer × MatchState
 * - BrokeredOpportunity = CustomerCaseMatch × service path
 * - One customer-case match can have multiple brokered paths
 *
 * Hard constraints:
 * 1. No balance constant changes.
 * 2. No tick order changes.
 * 3. No deal probability formula changes.
 * 4. No UI text changes.
 * 5. Legacy Opportunity is NOT deleted — it's a compatibility mirror.
 * 6. No new randomness introduced.
 * 7. No Date.now / Math.random.
 */

import {
  createCustomerCaseMatchState,
  createBrokeredOpportunityState,
  buildCustomerCaseMatchId,
  buildBrokeredOpportunityId,
  setCustomerCaseMatchScores,
  applyCustomerCaseMatchDelta,
  setBrokeredOpportunityStage,
  setBrokeredOpportunityLifecycle,
  setBrokeredOpportunityPendingClosing,
  applyBrokeredOpportunityProgressDelta,
  deriveLegacyOpportunityMirror,
  type CustomerCaseMatchState,
  type BrokeredOpportunityState,
} from '../core/world-state/opportunity-relations/writeSource.js';

import type { GameState, Opportunity, CustomerRuntimeState } from './models.js';
import { asWritableOpportunity } from './models.js';
import { OPPORTUNITY_STAGES } from './constants.js';
import { clamp } from './utils.js';

// ---------------------------------------------------------------------------
// ensureCustomerCaseMatchState: get or create match for a customer-case pair
// ---------------------------------------------------------------------------

export function ensureCustomerCaseMatchState(
  state: GameState,
  customerId: string,
  caseId: string,
  fit: number,
  interest: number,
  confidence: number,
  budgetMax: number,
  priceSensitivity: number,
): CustomerCaseMatchState {
  if (!state.runtimeCustomerCaseMatches) {
    state.runtimeCustomerCaseMatches = [];
  }

  const matchId = buildCustomerCaseMatchId(customerId, caseId);
  const existing = state.runtimeCustomerCaseMatches.find((m) => m.matchId === matchId);
  if (existing) return existing;

  const newMatch = createCustomerCaseMatchState(
    customerId, caseId, fit, interest, confidence, budgetMax, priceSensitivity, state.day,
  );
  state.runtimeCustomerCaseMatches.push(newMatch);
  return newMatch;
}

// ---------------------------------------------------------------------------
// ensureBrokeredOpportunityState: get or create opportunity
// ---------------------------------------------------------------------------

export function ensureBrokeredOpportunityState(
  state: GameState,
  opportunity: Opportunity,
  matchId: string,
): BrokeredOpportunityState {
  if (!state.runtimeBrokeredOpportunities) {
    state.runtimeBrokeredOpportunities = [];
  }

  const brokeredId = buildBrokeredOpportunityId(opportunity.id);
  const existing = state.runtimeBrokeredOpportunities.find((o) => o.brokeredOpportunityId === brokeredId);
  if (existing) return existing;

  const newOpp = createBrokeredOpportunityState(
    opportunity.id,
    matchId,
    opportunity.customerId,
    opportunity.caseId,
    opportunity.stageIndex,
    opportunity.stageLabel,
    opportunity.status,
    opportunity.lifecycleStatus,
    opportunity.leadSource,
    opportunity.visibility,
    opportunity.channelId,
    opportunity.channelName,
    opportunity.brokerName ?? '',
    opportunity.daysLeft,
    opportunity.createdDay,
  );
  state.runtimeBrokeredOpportunities.push(newOpp);
  return newOpp;
}

// ---------------------------------------------------------------------------
// initializeOpportunityRelations: populate from legacy opportunities + customerStates
// ---------------------------------------------------------------------------

/**
 * Initializes runtimeCustomerCaseMatches and runtimeBrokeredOpportunities
 * from legacy opportunities and customerStates.
 * Used during createInitialState and old-save hydration.
 * Does NOT overwrite existing states.
 */
export function initializeOpportunityRelations(state: GameState): void {
  if (!state.runtimeCustomerCaseMatches) {
    state.runtimeCustomerCaseMatches = [];
  }
  if (!state.runtimeBrokeredOpportunities) {
    state.runtimeBrokeredOpportunities = [];
  }

  // Build customer runtime lookup
  const customerRuntimeMap = new Map<string, CustomerRuntimeState>();
  for (const cs of state.customerStates ?? []) {
    customerRuntimeMap.set(cs.customerId, cs);
  }

  // Hydrate from opportunities
  for (const opp of state.opportunities ?? []) {
    const customerRuntime = customerRuntimeMap.get(opp.customerId);
    const caseRuntime = customerRuntime?.caseStates[opp.caseId];

    // Create or get match state
    const match = ensureCustomerCaseMatchState(
      state,
      opp.customerId,
      opp.caseId,
      caseRuntime?.fit ?? opp.fit,
      caseRuntime?.interest ?? opp.intent,
      caseRuntime?.confidence ?? opp.confidence,
      opp.budgetMax,
      opp.priceSensitivity,
    );

    // Create or get brokered opportunity
    ensureBrokeredOpportunityState(state, opp, match.matchId);
  }

  // Hydrate from customerStates (customer-only matches without opportunities)
  for (const cs of state.customerStates ?? []) {
    for (const [caseId, caseRuntime] of Object.entries(cs.caseStates ?? {})) {
      const matchId = buildCustomerCaseMatchId(cs.customerId, caseId);
      const existingMatch = state.runtimeCustomerCaseMatches.find((m) => m.matchId === matchId);
      if (existingMatch) continue; // already hydrated from opportunity

      ensureCustomerCaseMatchState(
        state,
        cs.customerId,
        caseId,
        caseRuntime.fit,
        caseRuntime.interest,
        caseRuntime.confidence,
        0, // budgetMax unknown from runtime
        0, // priceSensitivity unknown from runtime
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Canonical write helpers: update canonical state + sync legacy Opportunity mirror
// ---------------------------------------------------------------------------

/**
 * Replace a CustomerCaseMatchState in the GameState array.
 * Returns the new state.
 */
function replaceMatchState(
  state: GameState,
  newMatch: CustomerCaseMatchState,
): CustomerCaseMatchState {
  if (!state.runtimeCustomerCaseMatches) return newMatch;
  const idx = state.runtimeCustomerCaseMatches.findIndex((m) => m.matchId === newMatch.matchId);
  if (idx >= 0) {
    state.runtimeCustomerCaseMatches[idx] = newMatch;
  }
  return newMatch;
}

/**
 * Replace a BrokeredOpportunityState in the GameState array and sync legacy Opportunity mirror.
 * Returns the new state.
 */
function replaceBrokeredState(
  state: GameState,
  newBrokered: BrokeredOpportunityState,
): BrokeredOpportunityState {
  if (!state.runtimeBrokeredOpportunities) return newBrokered;
  const idx = state.runtimeBrokeredOpportunities.findIndex(
    (o) => o.brokeredOpportunityId === newBrokered.brokeredOpportunityId,
  );
  if (idx >= 0) {
    state.runtimeBrokeredOpportunities[idx] = newBrokered;
  }

  // Sync legacy Opportunity mirror
  const mirror = deriveLegacyOpportunityMirror(newBrokered);
  const legacyOpp = state.opportunities.find(
    (o) => o.id === newBrokered.legacyOpportunityId,
  );
  if (legacyOpp) {
    asWritableOpportunity(legacyOpp).stageIndex = mirror.stageIndex;
    legacyOpp.stageLabel = mirror.stageLabel;
    legacyOpp.status = mirror.status as Opportunity['status'];
    legacyOpp.lifecycleStatus = mirror.lifecycleStatus as Opportunity['lifecycleStatus'];
    legacyOpp.visibility = mirror.visibility as Opportunity['visibility'];
    legacyOpp.daysLeft = mirror.daysLeft;
    legacyOpp.stagnationTicks = mirror.stagnationTicks;
    legacyOpp.touchedToday = mirror.touchedToday;
    legacyOpp.pendingClosingEvaluation = mirror.pendingClosingEvaluation;
    legacyOpp.pendingClosingStrategyId = mirror.pendingClosingStrategyId;
    legacyOpp.pendingClosingRequestedDay = mirror.pendingClosingRequestedDay;
  }

  return newBrokered;
}

/**
 * Apply intent delta to a CustomerCaseMatch (canonical) and sync legacy Opportunity.
 * Returns the new match state.
 */
export function applyMatchIntentDelta(
  state: GameState,
  match: CustomerCaseMatchState,
  delta: number,
  day: number,
  reason: string,
): CustomerCaseMatchState {
  const { state: newMatch } = applyCustomerCaseMatchDelta(
    match,
    { interestDelta: delta },
    day,
    reason,
  );
  replaceMatchState(state, newMatch);

  // Sync legacy Opportunity intent
  const legacyOpp = state.opportunities.find(
    (o) => o.customerId === match.customerId && o.caseId === match.caseId,
  );
  if (legacyOpp) {
    legacyOpp.intent = clamp(newMatch.interest, 0, 100);
  }

  return newMatch;
}

/**
 * Apply confidence delta to a CustomerCaseMatch (canonical) and sync legacy Opportunity.
 * Returns the new match state.
 */
export function applyMatchConfidenceDelta(
  state: GameState,
  match: CustomerCaseMatchState,
  delta: number,
  day: number,
  reason: string,
): CustomerCaseMatchState {
  const { state: newMatch } = applyCustomerCaseMatchDelta(
    match,
    { confidenceDelta: delta },
    day,
    reason,
  );
  replaceMatchState(state, newMatch);

  // Sync legacy Opportunity confidence
  const legacyOpp = state.opportunities.find(
    (o) => o.customerId === match.customerId && o.caseId === match.caseId,
  );
  if (legacyOpp) {
    legacyOpp.confidence = clamp(newMatch.confidence, 0, 100);
  }

  return newMatch;
}

/**
 * Set stage on a BrokeredOpportunity (canonical) and sync legacy Opportunity.
 * Returns the new brokered state.
 */
export function setOpportunityStageViaSplit(
  state: GameState,
  brokered: BrokeredOpportunityState,
  stageIndex: number,
  day: number,
  reason: string,
): BrokeredOpportunityState {
  const stageLabel = OPPORTUNITY_STAGES[stageIndex] || brokered.stageLabel;
  const { state: newBrokered } = setBrokeredOpportunityStage(
    brokered, stageIndex, stageLabel, day, reason,
  );
  return replaceBrokeredState(state, newBrokered);
}

/**
 * Set lifecycle on a BrokeredOpportunity (canonical) and sync legacy Opportunity.
 * Returns the new brokered state.
 */
export function setOpportunityLifecycleViaSplit(
  state: GameState,
  brokered: BrokeredOpportunityState,
  status: string,
  lifecycleStatus: string,
  day: number,
  reason: string,
): BrokeredOpportunityState {
  const { state: newBrokered } = setBrokeredOpportunityLifecycle(
    brokered, status, lifecycleStatus, day, reason,
  );
  return replaceBrokeredState(state, newBrokered);
}

/**
 * Set pending closing on a BrokeredOpportunity (canonical) and sync legacy Opportunity.
 * Returns the new brokered state.
 */
export function setOpportunityPendingClosingViaSplit(
  state: GameState,
  brokered: BrokeredOpportunityState,
  pendingClosingEvaluation: boolean,
  pendingClosingStrategyId: string,
  pendingClosingRequestedDay: number,
  day: number,
  reason: string,
): BrokeredOpportunityState {
  const { state: newBrokered } = setBrokeredOpportunityPendingClosing(
    brokered, pendingClosingEvaluation, pendingClosingStrategyId, pendingClosingRequestedDay, day, reason,
  );
  return replaceBrokeredState(state, newBrokered);
}

/**
 * Apply progress delta to a BrokeredOpportunity (canonical) and sync legacy Opportunity.
 * Returns the new brokered state.
 */
export function applyOpportunityProgressDeltaViaSplit(
  state: GameState,
  brokered: BrokeredOpportunityState,
  deltas: { daysLeftDelta?: number; stagnationTicksDelta?: number },
  day: number,
  reason: string,
): BrokeredOpportunityState {
  const { state: newBrokered } = applyBrokeredOpportunityProgressDelta(
    brokered, deltas, day, reason,
  );
  return replaceBrokeredState(state, newBrokered);
}

/**
 * Set visibility on a BrokeredOpportunity (canonical) and sync legacy Opportunity.
 * Returns the new brokered state.
 */
export function setOpportunityVisibilityViaSplit(
  state: GameState,
  brokered: BrokeredOpportunityState,
  visibility: string,
  day: number,
  reason: string,
): BrokeredOpportunityState {
  const newBrokered = Object.freeze({
    ...brokered,
    visibility,
    lastUpdatedDay: day,
  });
  return replaceBrokeredState(state, newBrokered);
}

/**
 * Set touchedToday on a BrokeredOpportunity (canonical) and sync legacy Opportunity.
 * Returns the new brokered state.
 */
export function setOpportunityTouchedTodayViaSplit(
  state: GameState,
  brokered: BrokeredOpportunityState,
  touchedToday: boolean,
  day: number,
  reason: string,
): BrokeredOpportunityState {
  const newBrokered = Object.freeze({
    ...brokered,
    touchedToday,
    lastUpdatedDay: day,
  });
  return replaceBrokeredState(state, newBrokered);
}

/**
 * Find the canonical BrokeredOpportunityState for a legacy Opportunity.
 * Returns undefined if not found.
 */
export function findBrokeredStateForOpportunity(
  state: GameState,
  opportunityId: string,
): BrokeredOpportunityState | undefined {
  if (!state.runtimeBrokeredOpportunities) return undefined;
  const brokeredId = buildBrokeredOpportunityId(opportunityId);
  return state.runtimeBrokeredOpportunities.find(
    (o) => o.brokeredOpportunityId === brokeredId,
  );
}

/**
 * Find the canonical CustomerCaseMatchState for a customer-case pair.
 * Returns undefined if not found.
 */
export function findMatchStateForPair(
  state: GameState,
  customerId: string,
  caseId: string,
): CustomerCaseMatchState | undefined {
  if (!state.runtimeCustomerCaseMatches) return undefined;
  const matchId = buildCustomerCaseMatchId(customerId, caseId);
  return state.runtimeCustomerCaseMatches.find((m) => m.matchId === matchId);
}

// ---------------------------------------------------------------------------
// New stateful helpers: write canonical + sync legacy mirror
// ---------------------------------------------------------------------------

/**
 * Set stagnationTicks on a BrokeredOpportunity (canonical) and sync legacy Opportunity.
 */
export function setOpportunityStagnationTicks(
  state: GameState,
  brokered: BrokeredOpportunityState,
  value: number,
  reason: string,
): BrokeredOpportunityState {
  const newBrokered = Object.freeze({
    ...brokered,
    stagnationTicks: Math.max(0, Math.round(value)),
    lastUpdatedDay: state.day,
  });
  return replaceBrokeredState(state, newBrokered);
}

/**
 * Set stageLabel on a BrokeredOpportunity (canonical) and sync legacy Opportunity.
 */
export function setOpportunityStageLabel(
  state: GameState,
  brokered: BrokeredOpportunityState,
  stageLabel: string,
  reason: string,
): BrokeredOpportunityState {
  const newBrokered = Object.freeze({
    ...brokered,
    stageLabel,
    lastUpdatedDay: state.day,
  });
  return replaceBrokeredState(state, newBrokered);
}

/**
 * Set fit on a CustomerCaseMatch (canonical) and sync legacy Opportunity.
 */
export function setOpportunityFit(
  state: GameState,
  match: CustomerCaseMatchState,
  fit: number,
  reason: string,
): CustomerCaseMatchState {
  const { state: newMatch } = setCustomerCaseMatchScores(
    match,
    { fit },
    state.day,
    reason,
  );
  replaceMatchState(state, newMatch);

  // Sync legacy Opportunity fit
  const legacyOpp = state.opportunities.find(
    (o) => o.customerId === match.customerId && o.caseId === match.caseId,
  );
  if (legacyOpp) {
    legacyOpp.fit = clamp(newMatch.fit, 0, 100);
  }

  return newMatch;
}

// ---------------------------------------------------------------------------
// Pure lifecycle/label resolver (no mutation)
// ---------------------------------------------------------------------------

export interface ResolvedOpportunityLifecycle {
  readonly status: string;
  readonly lifecycleStatus: string;
  readonly stageLabel: string;
}

/**
 * Pure function: resolves lifecycle status and stage label from opportunity state.
 * Does NOT mutate any object.
 *
 * Rules (preserving legacy behavior):
 * - status === 'won' → lifecycleStatus 'closed_by_deal', stageLabel '已成交'
 * - status === 'lost' → lifecycleStatus 'lost', stageLabel '已流失'
 * - status === 'closed' → lifecycleStatus 'closed_by_case', stageLabel '已关闭'
 * - active + stagnated → lifecycleStatus 'stagnated', stageLabel from OPPORTUNITY_STAGES
 * - active + not stagnated → lifecycleStatus 'active', stageLabel from OPPORTUNITY_STAGES
 */
export function resolveOpportunityLifecycleLabel(
  status: string,
  currentLifecycleStatus: string,
  stageIndex: number,
): ResolvedOpportunityLifecycle {
  if (status === 'won') {
    return { status, lifecycleStatus: 'closed_by_deal', stageLabel: '已成交' };
  }
  if (status === 'lost') {
    return { status, lifecycleStatus: 'lost', stageLabel: '已流失' };
  }
  if (status === 'closed') {
    return { status, lifecycleStatus: 'closed_by_case', stageLabel: '已关闭' };
  }
  // active
  const lifecycleStatus = currentLifecycleStatus === 'stagnated' ? 'stagnated' : 'active';
  const stageLabel = OPPORTUNITY_STAGES[clamp(stageIndex, 0, OPPORTUNITY_STAGES.length - 1)];
  return { status, lifecycleStatus, stageLabel };
}

/**
 * Canonical lifecycle/label refresh: resolves lifecycle/label, writes to canonical
 * BrokeredOpportunity state, then syncs to legacy Opportunity mirror.
 *
 * Replaces the old mirror-only refreshOpportunityLabel.
 * NOT an OnState mutation helper — it's a label resolver that writes through canonical path.
 */
export function refreshOpportunityLabelViaCanonical(
  state: GameState,
  opportunity: Opportunity,
  reason: string = 'refresh label',
): void {
  const resolved = resolveOpportunityLifecycleLabel(
    opportunity.status,
    opportunity.lifecycleStatus,
    opportunity.stageIndex,
  );

  // Find or ensure canonical brokered state
  const match = findMatchStateForPair(state, opportunity.customerId, opportunity.caseId);
  if (!match) return; // no canonical state — skip (old save without init)

  const brokered = ensureBrokeredOpportunityState(state, opportunity, match.matchId);

  // Write lifecycle via canonical path
  setOpportunityLifecycleViaSplit(state, brokered, resolved.status, resolved.lifecycleStatus, state.day, reason);

  // Write stageLabel via canonical path
  const brokeredAfter = findBrokeredStateForOpportunity(state, opportunity.id);
  if (brokeredAfter) {
    setOpportunityStageLabel(state, brokeredAfter, resolved.stageLabel, reason);
  }
}

/**
 * Map terminal status to canonical lifecycleStatus.
 * Used by closeOpportunityViaSplit to avoid status=lifecycle drift.
 */
function mapStatusToLifecycle(status: string): string {
  switch (status) {
    case 'won': return 'closed_by_deal';
    case 'lost': return 'lost';
    case 'closed': return 'closed_by_case';
    default: return status;
  }
}

/**
 * Close an opportunity via split (set status to lost/closed) and sync legacy.
 * Maps terminal status to canonical lifecycleStatus to prevent drift.
 */
export function closeOpportunityViaSplit(
  state: GameState,
  brokered: BrokeredOpportunityState,
  status: string,
  reason: string,
): BrokeredOpportunityState {
  const lifecycleStatus = mapStatusToLifecycle(status);
  const { state: newBrokered } = setBrokeredOpportunityLifecycle(
    brokered, status, lifecycleStatus, state.day, reason,
  );
  // Also set stageLabel via canonical path
  const resolved = resolveOpportunityLifecycleLabel(status, lifecycleStatus, newBrokered.stageIndex);
  const brokeredAfter = replaceBrokeredState(state, newBrokered);
  setOpportunityStageLabel(state, brokeredAfter, resolved.stageLabel, reason);
  return brokeredAfter;
}

/**
 * Mark opportunity as won or closed via split and sync legacy.
 * Maps terminal status to canonical lifecycleStatus to prevent drift.
 */
export function markOpportunityWonOrClosedViaSplit(
  state: GameState,
  brokered: BrokeredOpportunityState,
  status: string,
  reason: string,
): BrokeredOpportunityState {
  const lifecycleStatus = mapStatusToLifecycle(status);
  const { state: newBrokered } = setBrokeredOpportunityLifecycle(
    brokered, status, lifecycleStatus, state.day, reason,
  );
  const resolved = resolveOpportunityLifecycleLabel(status, lifecycleStatus, newBrokered.stageIndex);
  const brokeredAfter = replaceBrokeredState(state, newBrokered);
  setOpportunityStageLabel(state, brokeredAfter, resolved.stageLabel, reason);
  return brokeredAfter;
}

/**
 * Reset pendingClosing on a BrokeredOpportunity (canonical) and sync legacy Opportunity.
 */
export function resetOpportunityPendingClosingViaSplit(
  state: GameState,
  brokered: BrokeredOpportunityState,
  reason: string,
): BrokeredOpportunityState {
  const { state: newBrokered } = setBrokeredOpportunityPendingClosing(
    brokered, false, '', 0, state.day, reason,
  );
  return replaceBrokeredState(state, newBrokered);
}

// ---------------------------------------------------------------------------
// @deprecated unsafe legacy mirror-only wrappers
// These write directly to Opportunity without going through canonical state.
// Engine/application code MUST NOT use these. Use ViaSplit helpers instead.
// ---------------------------------------------------------------------------

/** @deprecated Use setOpportunityFit(state, match, ...) instead. */
export function deprecatedUnsafeLegacyMirrorOnly_applyOpportunityIntentDelta(
  opportunity: Opportunity,
  delta: number,
  reason: string,
  clampMin: number = 0,
  clampMax: number = 100,
): void {
  opportunity.intent = clamp(opportunity.intent + delta, clampMin, clampMax);
}

/** @deprecated Use applyMatchConfidenceDelta(state, match, ...) instead. */
export function deprecatedUnsafeLegacyMirrorOnly_applyOpportunityConfidenceDelta(
  opportunity: Opportunity,
  delta: number,
  reason: string,
  clampMin: number = 0,
  clampMax: number = 100,
): void {
  opportunity.confidence = clamp(opportunity.confidence + delta, clampMin, clampMax);
}

/** @deprecated Use setOpportunityStageViaSplit(state, brokered, ...) instead. */
export function deprecatedUnsafeLegacyMirrorOnly_setOpportunityStageIndex(
  opportunity: Opportunity,
  newStageIndex: number,
  reason: string,
  clampMin: number = 0,
  clampMax: number = 4,
): void {
  asWritableOpportunity(opportunity).stageIndex = clamp(newStageIndex, clampMin, clampMax);
  opportunity.stageLabel = OPPORTUNITY_STAGES[opportunity.stageIndex] || opportunity.stageLabel;
}

/** @deprecated Use applyOpportunityProgressDeltaViaSplit(state, brokered, ...) instead. */
export function deprecatedUnsafeLegacyMirrorOnly_setOpportunityDaysLeft(
  opportunity: Opportunity,
  newDaysLeft: number,
  reason: string,
): void {
  opportunity.daysLeft = Math.max(0, Math.round(newDaysLeft));
}

/** @deprecated Use setOpportunityTouchedTodayViaSplit(state, brokered, ...) instead. */
export function deprecatedUnsafeLegacyMirrorOnly_setOpportunityTouchedToday(
  opportunity: Opportunity,
  value: boolean,
  reason: string,
): void {
  opportunity.touchedToday = value;
}

/** @deprecated Use setOpportunityVisibilityViaSplit(state, brokered, ...) instead. */
export function deprecatedUnsafeLegacyMirrorOnly_setOpportunityVisibility(
  opportunity: Opportunity,
  value: 'shadow' | 'revealed',
  reason: string,
): void {
  opportunity.visibility = value;
}

/** @deprecated Use setOpportunityLifecycleViaSplit(state, brokered, ...) instead. */
export function deprecatedUnsafeLegacyMirrorOnly_setOpportunityStatus(
  opportunity: Opportunity,
  value: Opportunity['status'],
  reason: string,
): void {
  opportunity.status = value;
}

/** @deprecated Use setOpportunityLifecycleViaSplit(state, brokered, ...) instead. */
export function deprecatedUnsafeLegacyMirrorOnly_setOpportunityLifecycleStatus(
  opportunity: Opportunity,
  value: Opportunity['lifecycleStatus'],
  reason: string,
): void {
  opportunity.lifecycleStatus = value;
}

/** @deprecated Use setOpportunityPendingClosingViaSplit(state, brokered, ...) instead. */
export function deprecatedUnsafeLegacyMirrorOnly_setOpportunityPendingClosing(
  opportunity: Opportunity,
  evaluation: boolean,
  strategyId?: string,
  requestedDay?: number,
  reason?: string,
): void {
  opportunity.pendingClosingEvaluation = evaluation;
  opportunity.pendingClosingStrategyId = strategyId;
  opportunity.pendingClosingRequestedDay = requestedDay;
}

// ---------------------------------------------------------------------------
// Parity helpers: read-only drift report
// ---------------------------------------------------------------------------

export interface OpportunityMirrorDriftEntry {
  readonly opportunityId: string;
  readonly field: string;
  readonly canonicalValue: string | number | boolean;
  readonly legacyValue: string | number | boolean;
}

export interface OpportunityMirrorDriftReport {
  readonly totalOpportunities: number;
  readonly totalMatches: number;
  readonly totalBrokered: number;
  readonly drifts: readonly OpportunityMirrorDriftEntry[];
  readonly isConsistent: boolean;
}

/**
 * Builds a read-only drift report comparing canonical state to legacy Opportunity mirrors.
 * Does NOT mutate state.
 */
export function buildOpportunitySplitMirrorDriftReport(
  state: GameState,
): OpportunityMirrorDriftReport {
  const drifts: OpportunityMirrorDriftEntry[] = [];

  const matches = state.runtimeCustomerCaseMatches ?? [];
  const brokered = state.runtimeBrokeredOpportunities ?? [];

  for (const opp of state.opportunities ?? []) {
    const brokeredState = brokered.find(
      (o) => o.legacyOpportunityId === opp.id,
    );
    const matchState = matches.find(
      (m) => m.customerId === opp.customerId && m.caseId === opp.caseId,
    );

    if (matchState) {
      if (Math.round(matchState.interest) !== Math.round(opp.intent)) {
        drifts.push({
          opportunityId: opp.id,
          field: 'interest/intent',
          canonicalValue: Math.round(matchState.interest),
          legacyValue: Math.round(opp.intent),
        });
      }
      if (Math.round(matchState.confidence) !== Math.round(opp.confidence)) {
        drifts.push({
          opportunityId: opp.id,
          field: 'confidence',
          canonicalValue: Math.round(matchState.confidence),
          legacyValue: Math.round(opp.confidence),
        });
      }
      if (Math.round(matchState.fit) !== Math.round(opp.fit)) {
        drifts.push({
          opportunityId: opp.id,
          field: 'fit',
          canonicalValue: Math.round(matchState.fit),
          legacyValue: Math.round(opp.fit),
        });
      }
    }

    if (brokeredState) {
      if (brokeredState.stageIndex !== opp.stageIndex) {
        drifts.push({
          opportunityId: opp.id,
          field: 'stageIndex',
          canonicalValue: brokeredState.stageIndex,
          legacyValue: opp.stageIndex,
        });
      }
      if (brokeredState.status !== opp.status) {
        drifts.push({
          opportunityId: opp.id,
          field: 'status',
          canonicalValue: brokeredState.status,
          legacyValue: opp.status,
        });
      }
      if (brokeredState.daysLeft !== opp.daysLeft) {
        drifts.push({
          opportunityId: opp.id,
          field: 'daysLeft',
          canonicalValue: brokeredState.daysLeft,
          legacyValue: opp.daysLeft,
        });
      }
      if (brokeredState.stagnationTicks !== opp.stagnationTicks) {
        drifts.push({
          opportunityId: opp.id,
          field: 'stagnationTicks',
          canonicalValue: brokeredState.stagnationTicks,
          legacyValue: opp.stagnationTicks,
        });
      }
      if (brokeredState.stageLabel !== opp.stageLabel) {
        drifts.push({
          opportunityId: opp.id,
          field: 'stageLabel',
          canonicalValue: brokeredState.stageLabel,
          legacyValue: opp.stageLabel,
        });
      }
      if (brokeredState.lifecycleStatus !== opp.lifecycleStatus) {
        drifts.push({
          opportunityId: opp.id,
          field: 'lifecycleStatus',
          canonicalValue: brokeredState.lifecycleStatus,
          legacyValue: opp.lifecycleStatus,
        });
      }
    }
  }

  return Object.freeze({
    totalOpportunities: (state.opportunities ?? []).length,
    totalMatches: matches.length,
    totalBrokered: brokered.length,
    drifts: Object.freeze(drifts),
    isConsistent: drifts.length === 0,
  });
}

/**
 * Asserts that canonical state and legacy mirrors are consistent.
 * Throws if drift is detected. Read-only.
 */
export function assertOpportunitySplitMirrorConsistency(state: GameState): void {
  const report = buildOpportunitySplitMirrorDriftReport(state);
  if (!report.isConsistent) {
    const details = report.drifts
      .map((d) => `${d.opportunityId}.${d.field}: canonical=${d.canonicalValue} legacy=${d.legacyValue}`)
      .join('; ');
    throw new Error(`Opportunity split mirror drift detected: ${details}`);
  }
}

// ---------------------------------------------------------------------------
// Stateful OnState helpers: accept (state, opportunity, ...) and internally
// ensure canonical state, apply mutation, sync legacy mirror.
// These are the PRIMARY API for runtime/domain callers.
// ---------------------------------------------------------------------------

/**
 * Apply intent delta via canonical CustomerCaseMatch. Ensures match exists first.
 * Clamp is integrated into the canonical delta: the target is clamped before writing.
 */
export function applyOpportunityIntentDeltaOnState(
  state: GameState,
  opportunity: Opportunity,
  delta: number,
  reason: string,
  clampMin: number = 0,
  clampMax: number = 100,
): void {
  const match = ensureCustomerCaseMatchState(
    state, opportunity.customerId, opportunity.caseId,
    opportunity.fit, opportunity.intent, opportunity.confidence,
    opportunity.budgetMax, opportunity.priceSensitivity,
  );
  const matchForWrite = findMatchStateForPair(state, opportunity.customerId, opportunity.caseId) ?? match;
  // Integrate clamp into canonical delta: target = clamp(current + delta, min, max)
  const currentIntent = opportunity.intent;
  const clampedTarget = clamp(currentIntent + delta, clampMin, clampMax);
  const clampedDelta = clampedTarget - currentIntent;
  if (clampedDelta !== 0) {
    applyMatchIntentDelta(state, matchForWrite, clampedDelta, state.day, reason);
  }
}

/**
 * Apply confidence delta via canonical CustomerCaseMatch. Ensures match exists first.
 * Clamp is integrated into the canonical delta: the target is clamped before writing.
 */
export function applyOpportunityConfidenceDeltaOnState(
  state: GameState,
  opportunity: Opportunity,
  delta: number,
  reason: string,
  clampMin: number = 0,
  clampMax: number = 100,
): void {
  const match = ensureCustomerCaseMatchState(
    state, opportunity.customerId, opportunity.caseId,
    opportunity.fit, opportunity.intent, opportunity.confidence,
    opportunity.budgetMax, opportunity.priceSensitivity,
  );
  const matchForWrite = findMatchStateForPair(state, opportunity.customerId, opportunity.caseId) ?? match;
  // Integrate clamp into canonical delta: target = clamp(current + delta, min, max)
  const currentConfidence = opportunity.confidence;
  const clampedTarget = clamp(currentConfidence + delta, clampMin, clampMax);
  const clampedDelta = clampedTarget - currentConfidence;
  if (clampedDelta !== 0) {
    applyMatchConfidenceDelta(state, matchForWrite, clampedDelta, state.day, reason);
  }
}

/**
 * Set stage index via canonical BrokeredOpportunity. Ensures brokered exists first.
 */
export function setOpportunityStageIndexOnState(
  state: GameState,
  opportunity: Opportunity,
  newStageIndex: number,
  reason: string,
  clampMin: number = 0,
  clampMax: number = 6,
): void {
  const match = ensureCustomerCaseMatchState(
    state, opportunity.customerId, opportunity.caseId,
    opportunity.fit, opportunity.intent, opportunity.confidence,
    opportunity.budgetMax, opportunity.priceSensitivity,
  );
  const brokered = ensureBrokeredOpportunityState(state, opportunity, match.matchId);
  const clamped = clamp(newStageIndex, clampMin, clampMax);
  setOpportunityStageViaSplit(state, brokered, clamped, state.day, reason);
}

/**
 * Set daysLeft via canonical BrokeredOpportunity. Ensures brokered exists first.
 */
export function setOpportunityDaysLeftOnState(
  state: GameState,
  opportunity: Opportunity,
  newDaysLeft: number,
  reason: string,
): void {
  const match = ensureCustomerCaseMatchState(
    state, opportunity.customerId, opportunity.caseId,
    opportunity.fit, opportunity.intent, opportunity.confidence,
    opportunity.budgetMax, opportunity.priceSensitivity,
  );
  const brokered = ensureBrokeredOpportunityState(state, opportunity, match.matchId);
  const delta = Math.max(0, Math.round(newDaysLeft)) - opportunity.daysLeft;
  applyOpportunityProgressDeltaViaSplit(state, brokered, { daysLeftDelta: delta }, state.day, reason);
}

/**
 * Set touchedToday via canonical BrokeredOpportunity. Ensures brokered exists first.
 */
export function setOpportunityTouchedTodayOnState(
  state: GameState,
  opportunity: Opportunity,
  value: boolean,
  reason: string,
): void {
  const match = ensureCustomerCaseMatchState(
    state, opportunity.customerId, opportunity.caseId,
    opportunity.fit, opportunity.intent, opportunity.confidence,
    opportunity.budgetMax, opportunity.priceSensitivity,
  );
  const brokered = ensureBrokeredOpportunityState(state, opportunity, match.matchId);
  setOpportunityTouchedTodayViaSplit(state, brokered, value, state.day, reason);
}

/**
 * Set visibility via canonical BrokeredOpportunity. Ensures brokered exists first.
 */
export function setOpportunityVisibilityOnState(
  state: GameState,
  opportunity: Opportunity,
  value: 'shadow' | 'revealed',
  reason: string,
): void {
  const match = ensureCustomerCaseMatchState(
    state, opportunity.customerId, opportunity.caseId,
    opportunity.fit, opportunity.intent, opportunity.confidence,
    opportunity.budgetMax, opportunity.priceSensitivity,
  );
  const brokered = ensureBrokeredOpportunityState(state, opportunity, match.matchId);
  setOpportunityVisibilityViaSplit(state, brokered, value, state.day, reason);
}

/**
 * Set status via canonical BrokeredOpportunity. Ensures brokered exists first.
 * Maps status to canonical lifecycleStatus and syncs stageLabel to prevent drift.
 */
export function setOpportunityStatusOnState(
  state: GameState,
  opportunity: Opportunity,
  status: string,
  reason: string,
): void {
  const match = ensureCustomerCaseMatchState(
    state, opportunity.customerId, opportunity.caseId,
    opportunity.fit, opportunity.intent, opportunity.confidence,
    opportunity.budgetMax, opportunity.priceSensitivity,
  );
  const brokered = ensureBrokeredOpportunityState(state, opportunity, match.matchId);
  const lifecycleStatus = mapStatusToLifecycle(status);
  setOpportunityLifecycleViaSplit(state, brokered, status, lifecycleStatus, state.day, reason);
  // Sync stageLabel via canonical path to prevent drift
  const brokeredAfter = findBrokeredStateForOpportunity(state, opportunity.id);
  if (brokeredAfter) {
    const resolved = resolveOpportunityLifecycleLabel(status, lifecycleStatus, brokeredAfter.stageIndex);
    setOpportunityStageLabel(state, brokeredAfter, resolved.stageLabel, reason);
  }
}

/**
 * Set lifecycleStatus via canonical BrokeredOpportunity. Ensures brokered exists first.
 * Also syncs stageLabel to prevent status/lifecycle/label drift.
 */
export function setOpportunityLifecycleStatusOnState(
  state: GameState,
  opportunity: Opportunity,
  lifecycleStatus: string,
  reason: string,
): void {
  const match = ensureCustomerCaseMatchState(
    state, opportunity.customerId, opportunity.caseId,
    opportunity.fit, opportunity.intent, opportunity.confidence,
    opportunity.budgetMax, opportunity.priceSensitivity,
  );
  const brokered = ensureBrokeredOpportunityState(state, opportunity, match.matchId);
  setOpportunityLifecycleViaSplit(state, brokered, opportunity.status, lifecycleStatus, state.day, reason);
  // Sync stageLabel via canonical path to prevent drift
  const brokeredAfter = findBrokeredStateForOpportunity(state, opportunity.id);
  if (brokeredAfter) {
    const resolved = resolveOpportunityLifecycleLabel(opportunity.status, lifecycleStatus, brokeredAfter.stageIndex);
    setOpportunityStageLabel(state, brokeredAfter, resolved.stageLabel, reason);
  }
}

/**
 * Set pendingClosing via canonical BrokeredOpportunity. Ensures brokered exists first.
 */
export function setOpportunityPendingClosingOnState(
  state: GameState,
  opportunity: Opportunity,
  evaluation: boolean,
  strategyId: string,
  requestedDay: number,
  reason: string,
): void {
  const match = ensureCustomerCaseMatchState(
    state, opportunity.customerId, opportunity.caseId,
    opportunity.fit, opportunity.intent, opportunity.confidence,
    opportunity.budgetMax, opportunity.priceSensitivity,
  );
  const brokered = ensureBrokeredOpportunityState(state, opportunity, match.matchId);
  setOpportunityPendingClosingViaSplit(state, brokered, evaluation, strategyId, requestedDay, state.day, reason);
}

// ---------------------------------------------------------------------------
// R20 Compatibility Stage Mirror Sync Helpers
// ---------------------------------------------------------------------------
// These are the ONLY allowed production write paths for late-stage (>= 4)
// Opportunity/Customer/Case stage mirrors.
// Late-stage mirrors must be backed by PriceTrajectory evidence.
// ---------------------------------------------------------------------------

import {
  deriveOpportunityStageMirrorFromPriceTrajectory,
  deriveLateStageFromPriceTrajectory,
  assertLateStageHasTrajectoryEvidence,
} from '../core/world-state/consensus/stageMirror.js';
import type { PriceTrajectory } from '../core/world-state/consensus/priceTrajectory.js';

/**
 * Sync Opportunity stageIndex mirror from PriceTrajectory evidence.
 * This is the canonical write path for negotiation/closing stage (>= 4).
 * Lower stages may use setOpportunityStageIndexOnState directly.
 *
 * If trajectory provides no offer+concession evidence, stageIndex is capped at 3.
 */
export function syncOpportunityStageMirrorFromTrajectoryOnState(
  state: GameState,
  opportunity: Opportunity,
  trajectory: PriceTrajectory | undefined,
  lowerStageFallback: number,
  reason: string,
): number {
  const derivedStage = deriveOpportunityStageMirrorFromPriceTrajectory(trajectory, lowerStageFallback);
  setOpportunityStageIndexOnState(state, opportunity, derivedStage, reason);
  return derivedStage;
}

/**
 * Sync customer runtime stageIndex mirror from Opportunity stage.
 * This is the canonical write path for customer runtime stage mirror.
 * Caps runtime stage at opportunity's stage (bidirectional max sync).
 */
export function syncCustomerRuntimeStageMirrorFromOpportunityOnState(
  state: GameState,
  opportunity: Opportunity,
  runtime: { stageIndex: number },
  reason: string,
): void {
  const synced = Math.max(runtime.stageIndex, Math.min(5, opportunity.stageIndex));
  runtime.stageIndex = synced;
  // Also sync opportunity up if runtime was higher
  if (synced > opportunity.stageIndex) {
    setOpportunityStageIndexOnState(state, opportunity, synced, reason);
  }
}

/**
 * Sync Case stageIndex mirror from case progression / outcome state.
 * This is the canonical write path for Case.stageIndex mirror.
 * Sold/lost/withdrawn cases get terminal stage from outcome.
 */
export function syncCaseStageMirrorFromCaseProgressionOnState(
  caseItem: { stageIndex: number; status: string },
  progression: { legacyStageIndex: number },
  maxStage: number,
): void {
  if (caseItem.status === 'sold' || caseItem.status === 'lost_to_rival' || caseItem.status === 'withdrawn') {
    caseItem.stageIndex = progression.legacyStageIndex;
  } else {
    caseItem.stageIndex = Math.max(Math.min(caseItem.stageIndex, maxStage), progression.legacyStageIndex);
  }
}

/**
 * Validate that a late-stage write is backed by trajectory evidence.
 * Use in gates and assertions — not in production hot paths.
 */
export { assertLateStageHasTrajectoryEvidence, deriveLateStageFromPriceTrajectory };
