/**
 * AttentionState v0 — pure read model builder.
 *
 * Derives AttentionState from relation views, pressure receipts, and owner data.
 * Maps legacy fields to the 6 attention dimensions:
 *   awareness, salience, priority, confidenceToAct, allocatedCapacity, freshness
 *
 * This is a READ-ONLY projection. It does NOT mutate GameState.
 * core/world-state cannot import domain/runtime.
 */

import type {
  AttentionBrokeredPathInput,
  AttentionDeriveOptions,
  AttentionDimensions,
  AttentionOwnerInput,
  AttentionPressureInput,
  AttentionRelationInput,
  AttentionState,
  AttentionSummary,
  AttentionWarningFlag,
} from './types.js';

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const DEFAULT_STALE_THRESHOLD_DAYS = 3;
const DEFAULT_HIGH_FIT_THRESHOLD = 75;
const DEFAULT_LOW_ATTENTION_THRESHOLD = 30;
const DEFAULT_HIGH_PRESSURE_THRESHOLD = 5;
const DEFAULT_CAPACITY_THRESHOLD = 80;

// ---------------------------------------------------------------------------
// Dimension derivation from relation input
// ---------------------------------------------------------------------------

function deriveCustomerAwareness(rel: AttentionRelationInput): number {
  // awareness = how much the customer knows about this case
  // driven by: viewed, interactions, interest
  const viewBonus = rel.matchViewed ? 30 : 0;
  const interactionBonus = Math.min(30, rel.matchInteractions * 10);
  const interestSignal = rel.matchInterest * 0.4;
  return clamp(viewBonus + interactionBonus + interestSignal, 0, 100);
}

function deriveCustomerSalience(rel: AttentionRelationInput): number {
  // salience = how prominent this case is in the customer's mind
  // driven by: selected, interest, fit
  const selectedBonus = rel.matchSelected ? 30 : 0;
  const interestSignal = rel.matchInterest * 0.4;
  const fitSignal = rel.matchFit * 0.3;
  return clamp(selectedBonus + interestSignal + fitSignal, 0, 100);
}

function deriveCustomerPriority(rel: AttentionRelationInput, currentDay: number): number {
  // priority = how urgently the customer needs to act
  // driven by: active status, daysLeft, stage, churnRisk
  const activeBonus = rel.matchActive ? 20 : 0;
  const daysLeftSignal = rel.brokeredPaths.length > 0
    ? Math.max(0, 30 - rel.brokeredPaths[0].daysLeft * 5)
    : 0;
  const stageSignal = rel.brokeredPaths.length > 0
    ? rel.brokeredPaths[0].stageIndex * 8
    : 0;
  const churnSignal = rel.matchChurnRisk * 0.2;
  return clamp(activeBonus + daysLeftSignal + stageSignal + churnSignal, 0, 100);
}

function deriveCustomerConfidenceToAct(rel: AttentionRelationInput): number {
  // confidenceToAct = how confident the customer is in taking action
  // driven by: confidence, advisorTrust, fatigue (negative)
  const confidenceSignal = rel.matchConfidence * 0.5;
  const trustSignal = rel.matchAdvisorTrust * 0.3;
  const fatiguePenalty = rel.matchFatigue * 0.2;
  return clamp(confidenceSignal + trustSignal - fatiguePenalty, 0, 100);
}

function deriveCustomerAllocatedCapacity(rel: AttentionRelationInput): number {
  // allocatedCapacity = how much of the customer's attention budget is used here
  // driven by: selected, interactions, active
  const selectedBonus = rel.matchSelected ? 40 : 0;
  const interactionBonus = Math.min(30, rel.matchInteractions * 8);
  const activeBonus = rel.matchActive ? 20 : 0;
  return clamp(selectedBonus + interactionBonus + activeBonus, 0, 100);
}

function deriveCustomerFreshness(rel: AttentionRelationInput, currentDay: number): number {
  // freshness = how recent the last interaction was
  // driven by: lastActiveDay, touchedToday
  const daysSinceActive = Math.max(0, currentDay - rel.matchLastActiveDay);
  const recency = Math.max(0, 100 - daysSinceActive * 20);
  const todayBonus = rel.brokeredPaths.some((p) => p.touchedToday) ? 20 : 0;
  return clamp(recency + todayBonus, 0, 100);
}

// ---------------------------------------------------------------------------
// Broker attention dimensions
// ---------------------------------------------------------------------------

function deriveBrokerAwareness(path: AttentionBrokeredPathInput): number {
  // broker awareness = how much the broker knows about this opportunity
  const stageSignal = path.stageIndex * 15;
  const visibilityBonus = path.visibility === 'revealed' ? 20 : 0;
  return clamp(stageSignal + visibilityBonus, 0, 100);
}

function deriveBrokerSalience(path: AttentionBrokeredPathInput): number {
  // broker salience = how prominent this opportunity is for the broker
  const pendingBonus = path.pendingClosingEvaluation ? 30 : 0;
  const stageSignal = path.stageIndex * 12;
  return clamp(pendingBonus + stageSignal, 0, 100);
}

function deriveBrokerPriority(path: AttentionBrokeredPathInput): number {
  // broker priority = how urgent this opportunity is
  const daysLeftSignal = Math.max(0, 40 - path.daysLeft * 8);
  const stagnationPenalty = path.stagnationTicks * 5;
  return clamp(daysLeftSignal - stagnationPenalty, 0, 100);
}

function deriveBrokerConfidenceToAct(path: AttentionBrokeredPathInput): number {
  // broker confidence = how confident the broker is in acting on this
  const stageSignal = path.stageIndex * 15;
  const statusBonus = path.status === 'active' ? 20 : 0;
  return clamp(stageSignal + statusBonus, 0, 100);
}

function deriveBrokerAllocatedCapacity(path: AttentionBrokeredPathInput): number {
  // broker capacity = how much of the broker's time is allocated here
  const pendingBonus = path.pendingClosingEvaluation ? 40 : 0;
  const stageSignal = path.stageIndex * 10;
  return clamp(pendingBonus + stageSignal, 0, 100);
}

function deriveBrokerFreshness(path: AttentionBrokeredPathInput, currentDay: number): number {
  // broker freshness = how recent the broker's activity is
  const touchedBonus = path.touchedToday ? 40 : 0;
  const stagnationPenalty = path.stagnationTicks * 10;
  return clamp(touchedBonus + 60 - stagnationPenalty, 0, 100);
}

// ---------------------------------------------------------------------------
// Owner attention dimensions
// ---------------------------------------------------------------------------

function deriveOwnerAwareness(owner: AttentionOwnerInput): number {
  // owner awareness = how much the owner knows about the selling process
  const heatSignal = owner.heat * 0.6;
  const trustSignal = owner.trust * 0.4;
  return clamp(heatSignal + trustSignal, 0, 100);
}

function deriveOwnerSalience(owner: AttentionOwnerInput): number {
  // owner salience = how prominent the sale is in the owner's mind
  const urgencySignal = owner.urgency * 0.5;
  const heatSignal = owner.heat * 0.5;
  return clamp(urgencySignal + heatSignal, 0, 100);
}

function deriveOwnerPriority(owner: AttentionOwnerInput): number {
  // owner priority = how urgently the owner needs to sell
  return clamp(owner.urgency, 0, 100);
}

function deriveOwnerConfidenceToAct(owner: AttentionOwnerInput): number {
  // owner confidence = how confident the owner is in the broker/process
  return clamp(owner.trust, 0, 100);
}

function deriveOwnerAllocatedCapacity(owner: AttentionOwnerInput): number {
  // owner capacity = how much attention the owner is giving to this sale
  const heatSignal = owner.heat * 0.5;
  const patienceSignal = (100 - owner.patience) * 0.5;
  return clamp(heatSignal + patienceSignal, 0, 100);
}

function deriveOwnerFreshness(owner: AttentionOwnerInput): number {
  // owner freshness = how recently the owner was engaged
  // In v0, we approximate from heat (high heat = recent engagement)
  return clamp(owner.heat, 0, 100);
}

// ---------------------------------------------------------------------------
// Warning detection
// ---------------------------------------------------------------------------

function detectWarnings(
  rel: AttentionRelationInput,
  customerDims: AttentionDimensions,
  brokerDims: AttentionDimensions | undefined,
  ownerDims: AttentionDimensions | undefined,
  options: Required<AttentionDeriveOptions>,
): readonly AttentionWarningFlag[] {
  const warnings: AttentionWarningFlag[] = [];

  // high_fit_low_attention: customer has high fit but low awareness/salience
  if (rel.matchFit >= options.highFitThreshold) {
    const avgAttention = (customerDims.awareness + customerDims.salience) / 2;
    if (avgAttention < options.lowAttentionThreshold) {
      warnings.push(Object.freeze({
        kind: 'high_fit_low_attention' as const,
        actorId: rel.customerId,
        targetId: rel.caseId,
        detail: `Customer has high fit (${rel.matchFit}) but low attention (awareness=${customerDims.awareness}, salience=${customerDims.salience})`,
      }));
    }
  }

  // stale_attention: customer hasn't been active recently
  if (customerDims.freshness < options.lowAttentionThreshold) {
    warnings.push(Object.freeze({
      kind: 'stale_attention' as const,
      actorId: rel.customerId,
      targetId: rel.caseId,
      detail: `Customer attention is stale (freshness=${customerDims.freshness}, lastActiveDay=${rel.matchLastActiveDay})`,
    }));
  }

  // duplicate_service_path_attention: multiple brokered paths for same match
  if (rel.brokeredPaths.length > 1) {
    warnings.push(Object.freeze({
      kind: 'duplicate_service_path_attention' as const,
      actorId: rel.customerId,
      targetId: rel.caseId,
      detail: `${rel.brokeredPaths.length} service paths competing for attention: ${rel.brokeredPaths.map((p) => p.opportunityId).join(', ')}`,
    }));
  }

  // high_pressure_no_capacity: high churn risk but low allocated capacity
  if (rel.matchChurnRisk >= options.highPressureThreshold && customerDims.allocatedCapacity < options.lowAttentionThreshold) {
    warnings.push(Object.freeze({
      kind: 'high_pressure_no_capacity' as const,
      actorId: rel.customerId,
      targetId: rel.caseId,
      detail: `High churn risk (${rel.matchChurnRisk}) but low allocated capacity (${customerDims.allocatedCapacity})`,
    }));
  }

  // owner_attention_without_broker_followup: owner has high attention but broker hasn't followed up
  if (ownerDims && brokerDims) {
    if (ownerDims.priority > options.capacityThreshold && brokerDims.freshness < options.lowAttentionThreshold) {
      warnings.push(Object.freeze({
        kind: 'owner_attention_without_broker_followup' as const,
        actorId: rel.customerId,
        targetId: rel.caseId,
        detail: `Owner has high priority (${ownerDims.priority}) but broker freshness is low (${brokerDims.freshness})`,
      }));
    }
  }

  return Object.freeze(warnings);
}

// ---------------------------------------------------------------------------
// Main builder: derive customer attention state from relation
// ---------------------------------------------------------------------------

export function deriveCustomerAttentionState(
  rel: AttentionRelationInput,
  currentDay: number,
): AttentionState {
  const dimensions: AttentionDimensions = Object.freeze({
    awareness: deriveCustomerAwareness(rel),
    salience: deriveCustomerSalience(rel),
    priority: deriveCustomerPriority(rel, currentDay),
    confidenceToAct: deriveCustomerConfidenceToAct(rel),
    allocatedCapacity: deriveCustomerAllocatedCapacity(rel),
    freshness: deriveCustomerFreshness(rel, currentDay),
  });

  const options: Required<AttentionDeriveOptions> = {
    currentDay,
    staleThresholdDays: DEFAULT_STALE_THRESHOLD_DAYS,
    highFitThreshold: DEFAULT_HIGH_FIT_THRESHOLD,
    lowAttentionThreshold: DEFAULT_LOW_ATTENTION_THRESHOLD,
    highPressureThreshold: DEFAULT_HIGH_PRESSURE_THRESHOLD,
    capacityThreshold: DEFAULT_CAPACITY_THRESHOLD,
  };

  const warnings = detectWarnings(rel, dimensions, undefined, undefined, options);

  return Object.freeze({
    actorKind: 'customer',
    actorId: rel.customerId,
    targetKind: 'customer_case_match',
    targetId: rel.relationKey,
    dimensions,
    warnings,
  });
}

// ---------------------------------------------------------------------------
// Builder: derive broker attention state from a brokered path
// ---------------------------------------------------------------------------

export function deriveBrokerAttentionState(
  rel: AttentionRelationInput,
  path: AttentionBrokeredPathInput,
  currentDay: number,
): AttentionState {
  const dimensions: AttentionDimensions = Object.freeze({
    awareness: deriveBrokerAwareness(path),
    salience: deriveBrokerSalience(path),
    priority: deriveBrokerPriority(path),
    confidenceToAct: deriveBrokerConfidenceToAct(path),
    allocatedCapacity: deriveBrokerAllocatedCapacity(path),
    freshness: deriveBrokerFreshness(path, currentDay),
  });

  return Object.freeze({
    actorKind: 'broker',
    actorId: path.brokerName ?? 'direct',
    targetKind: 'brokered_opportunity',
    targetId: path.opportunityId,
    dimensions,
    warnings: Object.freeze([]),
  });
}

// ---------------------------------------------------------------------------
// Builder: derive owner attention state from owner input
// ---------------------------------------------------------------------------

export function deriveOwnerAttentionState(
  owner: AttentionOwnerInput,
): AttentionState {
  const dimensions: AttentionDimensions = Object.freeze({
    awareness: deriveOwnerAwareness(owner),
    salience: deriveOwnerSalience(owner),
    priority: deriveOwnerPriority(owner),
    confidenceToAct: deriveOwnerConfidenceToAct(owner),
    allocatedCapacity: deriveOwnerAllocatedCapacity(owner),
    freshness: deriveOwnerFreshness(owner),
  });

  return Object.freeze({
    actorKind: 'owner',
    actorId: owner.ownerName,
    targetKind: 'asset_case',
    targetId: owner.caseId,
    dimensions,
    warnings: Object.freeze([]),
  });
}

// ---------------------------------------------------------------------------
// Builder: derive all attention states for a relation
// ---------------------------------------------------------------------------

export function deriveAttentionStateFromRelationView(
  rel: AttentionRelationInput,
  ownerInput: AttentionOwnerInput | undefined,
  options: AttentionDeriveOptions = {},
): AttentionState[] {
  const currentDay = options.currentDay ?? 0;
  const states: AttentionState[] = [];

  // Customer attention
  const customerState = deriveCustomerAttentionState(rel, currentDay);
  states.push(customerState);

  // Broker attention (one per brokered path)
  for (const path of rel.brokeredPaths) {
    states.push(deriveBrokerAttentionState(rel, path, currentDay));
  }

  // Owner attention
  if (ownerInput) {
    const ownerState = deriveOwnerAttentionState(ownerInput);
    // Re-detect warnings with owner context
    const opts: Required<AttentionDeriveOptions> = {
      currentDay,
      staleThresholdDays: options.staleThresholdDays ?? DEFAULT_STALE_THRESHOLD_DAYS,
      highFitThreshold: options.highFitThreshold ?? DEFAULT_HIGH_FIT_THRESHOLD,
      lowAttentionThreshold: options.lowAttentionThreshold ?? DEFAULT_LOW_ATTENTION_THRESHOLD,
      highPressureThreshold: options.highPressureThreshold ?? DEFAULT_HIGH_PRESSURE_THRESHOLD,
      capacityThreshold: options.capacityThreshold ?? DEFAULT_CAPACITY_THRESHOLD,
    };
    const brokerDims = rel.brokeredPaths.length > 0
      ? deriveBrokerAttentionState(rel, rel.brokeredPaths[0], currentDay).dimensions
      : undefined;
    const warnings = detectWarnings(rel, customerState.dimensions, brokerDims, ownerState.dimensions, opts);

    // Update customer state with owner-aware warnings
    const updatedCustomer: AttentionState = Object.freeze({
      ...customerState,
      warnings,
    });
    states[0] = updatedCustomer;
    states.push(ownerState);
  }

  return states;
}

// ---------------------------------------------------------------------------
// Summarize attention by case
// ---------------------------------------------------------------------------

export function summarizeAttentionByCase(
  attentionStates: readonly AttentionState[],
  caseId: string,
  relatedOpportunityIds: readonly string[] = [],
): AttentionSummary {
  const customerAttention = attentionStates.filter(
    (s) => s.targetKind === 'customer_case_match' && s.targetId.includes(caseId),
  );
  const brokerAttention = attentionStates.filter(
    (s) => s.targetKind === 'brokered_opportunity' && (
      s.targetId.includes(caseId) || relatedOpportunityIds.includes(s.targetId)
    ),
  );
  const ownerAttention = attentionStates.filter(
    (s) => s.targetKind === 'asset_case' && s.targetId === caseId,
  );
  const managerAttention = attentionStates.filter(
    (s) => s.actorKind === 'manager',
  );

  const allWarnings = attentionStates.flatMap((s) => s.warnings);
  const totalAwareness = avg(attentionStates.map((s) => s.dimensions.awareness));
  const totalSalience = avg(attentionStates.map((s) => s.dimensions.salience));
  const totalPriority = avg(attentionStates.map((s) => s.dimensions.priority));

  return Object.freeze({
    caseId,
    customerAttention: Object.freeze(customerAttention),
    brokerAttention: Object.freeze(brokerAttention),
    ownerAttention: Object.freeze(ownerAttention),
    managerAttention: Object.freeze(managerAttention),
    totalAwareness,
    totalSalience,
    totalPriority,
    warningCount: allWarnings.length,
    warnings: Object.freeze(allWarnings),
  });
}

// ---------------------------------------------------------------------------
// Apply pressure signals to attention dimensions
// ---------------------------------------------------------------------------

export function applyPressureToAttention(
  base: AttentionDimensions,
  pressureSignals: readonly AttentionPressureInput[],
): AttentionDimensions {
  let awareness = base.awareness;
  let salience = base.salience;
  let priority = base.priority;
  let confidenceToAct = base.confidenceToAct;
  let allocatedCapacity = base.allocatedCapacity;
  let freshness = base.freshness;

  for (const signal of pressureSignals) {
    switch (signal.dimension) {
      case 'awareness':
        awareness = clamp(awareness + signal.magnitude, 0, 100);
        break;
      case 'salience':
        salience = clamp(salience + signal.magnitude, 0, 100);
        break;
      case 'priority':
        priority = clamp(priority + signal.magnitude, 0, 100);
        break;
      case 'confidenceToAct':
        confidenceToAct = clamp(confidenceToAct + signal.magnitude, 0, 100);
        break;
      case 'allocatedCapacity':
        allocatedCapacity = clamp(allocatedCapacity + signal.magnitude, 0, 100);
        break;
      case 'freshness':
        freshness = clamp(freshness + signal.magnitude, 0, 100);
        break;
    }
  }

  return Object.freeze({
    awareness,
    salience,
    priority,
    confidenceToAct,
    allocatedCapacity,
    freshness,
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function avg(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return Math.round(values.reduce((sum, v) => sum + v, 0) / values.length);
}
