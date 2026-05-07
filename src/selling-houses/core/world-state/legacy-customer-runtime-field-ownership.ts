/**
 * CustomerRuntimeState and CustomerCaseRuntime field ownership contract.
 *
 * CustomerRuntimeState is the per-customer simulation state that tracks
 * engagement, trust, fatigue, and churn risk across all cases.
 *
 * CustomerCaseRuntime is the per-customer-per-case runtime state that tracks
 * fit, interest, confidence, and buying journey progression for a specific case.
 *
 * Mother-model target concepts:
 * - Customer: static profile entity (budget, urgency, activity, preferences)
 * - CustomerCaseMatch: the formation/identity of a customer-case link
 * - BrokerCustomerRelation: trust and interaction state between broker and customer
 * - CustomerBuyingJourney: funnel progression (stage, interactions, milestones)
 * - CustomerAttentionState: what the customer is paying attention to (interest, selection, competing cases)
 * - CustomerDecisionPressure: pressure signals on the customer's decision (churn risk, fatigue, confidence)
 * - RuntimeScratch: daily scratch state (last touch, last action note)
 * - EvaluationMirror: derived evaluation signals
 */

// ---------------------------------------------------------------------------
// CustomerRuntimeState field ownership
// ---------------------------------------------------------------------------

/** Local field union — avoids core→domain import. Must match CustomerRuntimeState keys. */
export type CustomerRuntimeStateField =
  | 'customerId'
  | 'status'
  | 'decisionStyle'
  | 'advisorTrust'
  | 'fatigue'
  | 'churnRisk'
  | 'activeCaseIds'
  | 'caseStates'
  | 'lastTouchDay'
  | 'lastActionNote';

export type CustomerRuntimeCanonicalOwner =
  | 'customer-entity'
  | 'customer-attention-state'
  | 'customer-decision-pressure'
  | 'broker-customer-relation'
  | 'runtime-scratch';

export type CustomerRuntimeFieldRole =
  | 'canonical-temporary'
  | 'compatibility-mirror'
  | 'future-migration';

export type CustomerRuntimeDomainFacet =
  | 'identity'
  | 'profile'
  | 'attention'
  | 'decision-pressure'
  | 'broker-relation'
  | 'runtime';

export interface CustomerRuntimeFieldOwnership {
  canonicalOwner: CustomerRuntimeCanonicalOwner;
  legacyRole: CustomerRuntimeFieldRole;
  domainFacet: CustomerRuntimeDomainFacet;
  targetConcept?: string;
  migrationNote: string;
}

export type CustomerRuntimeFieldOwnershipEntry = CustomerRuntimeFieldOwnership & {
  field: CustomerRuntimeStateField;
};

export const CUSTOMER_RUNTIME_STATE_FIELD_OWNERSHIP_REGISTRY: Readonly<
  Record<CustomerRuntimeStateField, CustomerRuntimeFieldOwnership>
> = {
  customerId: {
    canonicalOwner: 'customer-entity',
    legacyRole: 'canonical-temporary',
    domainFacet: 'identity',
    targetConcept: 'Customer.id / CustomerRuntimeState.customerId',
    migrationNote: 'Customer id is the entity identity reference.',
  },
  status: {
    canonicalOwner: 'customer-attention-state',
    legacyRole: 'compatibility-mirror',
    domainFacet: 'attention',
    targetConcept: 'CustomerAttentionState.status',
    migrationNote: 'Customer status (idle/browsing/comparing/engaged/negotiating/lost) mirrors current attention state. Derived from caseStates.',
  },
  decisionStyle: {
    canonicalOwner: 'customer-entity',
    legacyRole: 'canonical-temporary',
    domainFacet: 'profile',
    targetConcept: 'Customer.decisionStyle',
    migrationNote: 'Decision style is derived from Customer profile (urgency, activity) and is immutable per customer.',
  },
  advisorTrust: {
    canonicalOwner: 'broker-customer-relation',
    legacyRole: 'compatibility-mirror',
    domainFacet: 'broker-relation',
    targetConcept: 'BrokerCustomerRelation.trust',
    migrationNote: 'Advisor trust is the broker-customer relationship state, analogous to BrokerOwnerRelation.trust for owners.',
  },
  fatigue: {
    canonicalOwner: 'customer-decision-pressure',
    legacyRole: 'compatibility-mirror',
    domainFacet: 'decision-pressure',
    targetConcept: 'CustomerDecisionPressure.fatigue',
    migrationNote: 'Fatigue accumulates from engagement and affects decision-making. Part of decision pressure.',
  },
  churnRisk: {
    canonicalOwner: 'customer-decision-pressure',
    legacyRole: 'compatibility-mirror',
    domainFacet: 'decision-pressure',
    targetConcept: 'CustomerDecisionPressure.churnRisk',
    migrationNote: 'Churn risk is a decision pressure signal — the higher it is, the more likely the customer walks away. Maps to C receipt dimension "churn-risk".',
  },
  activeCaseIds: {
    canonicalOwner: 'customer-attention-state',
    legacyRole: 'compatibility-mirror',
    domainFacet: 'attention',
    targetConcept: 'CustomerAttentionState.activeCaseIds',
    migrationNote: 'Active case ids are derived from caseStates — which cases this customer is paying attention to.',
  },
  caseStates: {
    canonicalOwner: 'customer-attention-state',
    legacyRole: 'compatibility-mirror',
    domainFacet: 'attention',
    targetConcept: 'CustomerCaseRuntime[] / CustomerAttentionState.caseStates',
    migrationNote: 'Case states container maps to per-case runtime data. See CustomerCaseRuntime registry for field-level ownership.',
  },
  lastTouchDay: {
    canonicalOwner: 'runtime-scratch',
    legacyRole: 'future-migration',
    domainFacet: 'runtime',
    targetConcept: 'DailyTouchLedger.customerLastTouchDay',
    migrationNote: 'Last touch day is daily scratch state and should be ledger-backed.',
  },
  lastActionNote: {
    canonicalOwner: 'runtime-scratch',
    legacyRole: 'future-migration',
    domainFacet: 'runtime',
    targetConcept: 'ActionLedger.lastCustomerActionNote',
    migrationNote: 'Last action note is runtime scratch state — records what was last done to this customer.',
  },
};

// ---------------------------------------------------------------------------
// CustomerCaseRuntime field ownership
// ---------------------------------------------------------------------------

/** Local field union — avoids core→domain import. Must match CustomerCaseRuntime keys. */
export type CustomerCaseRuntimeField =
  | 'caseId'
  | 'fit'
  | 'interest'
  | 'confidence'
  | 'stageIndex'
  | 'interactions'
  | 'lastActiveDay'
  | 'viewed'
  | 'offered'
  | 'selected'
  | 'competingCaseIds';

export type CustomerCaseRuntimeCanonicalOwner =
  | 'customer-case-match'
  | 'customer-attention-state'
  | 'customer-decision-pressure'
  | 'customer-buying-journey'
  | 'runtime-scratch';

export type CustomerCaseRuntimeFieldRole =
  | 'canonical-temporary'
  | 'compatibility-mirror'
  | 'future-migration';

export type CustomerCaseRuntimeDomainFacet =
  | 'identity'
  | 'match-quality'
  | 'attention'
  | 'decision-pressure'
  | 'journey'
  | 'runtime';

export interface CustomerCaseRuntimeFieldOwnership {
  canonicalOwner: CustomerCaseRuntimeCanonicalOwner;
  legacyRole: CustomerCaseRuntimeFieldRole;
  domainFacet: CustomerCaseRuntimeDomainFacet;
  targetConcept?: string;
  migrationNote: string;
}

export type CustomerCaseRuntimeFieldOwnershipEntry = CustomerCaseRuntimeFieldOwnership & {
  field: CustomerCaseRuntimeField;
};

export const CUSTOMER_CASE_RUNTIME_FIELD_OWNERSHIP_REGISTRY: Readonly<
  Record<CustomerCaseRuntimeField, CustomerCaseRuntimeFieldOwnership>
> = {
  caseId: {
    canonicalOwner: 'customer-case-match',
    legacyRole: 'canonical-temporary',
    domainFacet: 'identity',
    targetConcept: 'CustomerCaseMatch.caseId / CustomerCaseRuntime.caseId',
    migrationNote: 'Case reference is the asset side of the customer-case match relation.',
  },
  fit: {
    canonicalOwner: 'customer-case-match',
    legacyRole: 'compatibility-mirror',
    domainFacet: 'match-quality',
    targetConcept: 'CustomerCaseMatch.fit / MatchEvaluation.fit',
    migrationNote: 'Fit is computed at match formation (layout, district, budget, preferences). Remains a match quality attribute. Corresponds to Opportunity.fit.',
  },
  interest: {
    canonicalOwner: 'customer-attention-state',
    legacyRole: 'compatibility-mirror',
    domainFacet: 'attention',
    targetConcept: 'CustomerAttentionState.caseInterest',
    migrationNote: 'Interest is the customer engagement signal for this specific case. Drives CustomerAttentionState.status. Maps to C receipt dimension "demand-heat" when aggregated. Corresponds to Opportunity.intent.',
  },
  confidence: {
    canonicalOwner: 'customer-decision-pressure',
    legacyRole: 'compatibility-mirror',
    domainFacet: 'decision-pressure',
    targetConcept: 'CustomerDecisionPressure.caseConfidence',
    migrationNote: 'Confidence is the customer certainty signal for this case. Affected by case trust, d3, price sensitivity. Maps to C receipt dimension "confidence". Corresponds to Opportunity.confidence.',
  },
  stageIndex: {
    canonicalOwner: 'customer-buying-journey',
    legacyRole: 'compatibility-mirror',
    domainFacet: 'journey',
    targetConcept: 'CustomerBuyingJourney.stageIndex',
    migrationNote: 'Stage index is the funnel progression (0-5). Maps to Opportunity.stageIndex via syncOpportunityFromCustomer.',
  },
  interactions: {
    canonicalOwner: 'customer-buying-journey',
    legacyRole: 'compatibility-mirror',
    domainFacet: 'journey',
    targetConcept: 'CustomerBuyingJourney.interactions',
    migrationNote: 'Interaction count tracks engagement depth. Used for interest boost and stage advancement.',
  },
  lastActiveDay: {
    canonicalOwner: 'runtime-scratch',
    legacyRole: 'future-migration',
    domainFacet: 'runtime',
    targetConcept: 'CustomerBuyingJourney.lastActiveDay / DailyTouchLedger.customerCaseLastActiveDay',
    migrationNote: 'Last active day is runtime scratch state tracking recency of engagement.',
  },
  viewed: {
    canonicalOwner: 'customer-buying-journey',
    legacyRole: 'compatibility-mirror',
    domainFacet: 'journey',
    targetConcept: 'CustomerBuyingJourney.viewed',
    migrationNote: 'Viewed is a funnel milestone — customer has seen this case (stageIndex >= 2).',
  },
  offered: {
    canonicalOwner: 'customer-buying-journey',
    legacyRole: 'compatibility-mirror',
    domainFacet: 'journey',
    targetConcept: 'CustomerBuyingJourney.offered',
    migrationNote: 'Offered is a funnel milestone — customer has received an offer on this case (stageIndex >= 4).',
  },
  selected: {
    canonicalOwner: 'customer-attention-state',
    legacyRole: 'compatibility-mirror',
    domainFacet: 'attention',
    targetConcept: 'CustomerAttentionState.selectedCaseId',
    migrationNote: 'Selected flag marks which case this customer is focusing on. Derived from activeCaseIds[0].',
  },
  competingCaseIds: {
    canonicalOwner: 'customer-attention-state',
    legacyRole: 'compatibility-mirror',
    domainFacet: 'attention',
    targetConcept: 'CustomerAttentionState.competingCaseIds',
    migrationNote: 'Competing case ids represent the competitive landscape this customer is considering.',
  },
};

// ---------------------------------------------------------------------------
// Entry lists and helpers
// ---------------------------------------------------------------------------

export const CUSTOMER_RUNTIME_STATE_FIELD_OWNERSHIP_ENTRIES: readonly CustomerRuntimeFieldOwnershipEntry[] =
  Object.freeze(
    Object.entries(CUSTOMER_RUNTIME_STATE_FIELD_OWNERSHIP_REGISTRY).map(([field, ownership]) =>
      Object.freeze({
        field: field as CustomerRuntimeStateField,
        ...ownership,
      })),
  );

export const CUSTOMER_CASE_RUNTIME_FIELD_OWNERSHIP_ENTRIES: readonly CustomerCaseRuntimeFieldOwnershipEntry[] =
  Object.freeze(
    Object.entries(CUSTOMER_CASE_RUNTIME_FIELD_OWNERSHIP_REGISTRY).map(([field, ownership]) =>
      Object.freeze({
        field: field as CustomerCaseRuntimeField,
        ...ownership,
      })),
  );

export function getCustomerRuntimeStateFieldOwnership(field: CustomerRuntimeStateField): CustomerRuntimeFieldOwnership {
  return CUSTOMER_RUNTIME_STATE_FIELD_OWNERSHIP_REGISTRY[field];
}

export function getCustomerCaseRuntimeFieldOwnership(field: CustomerCaseRuntimeField): CustomerCaseRuntimeFieldOwnership {
  return CUSTOMER_CASE_RUNTIME_FIELD_OWNERSHIP_REGISTRY[field];
}

// ---------------------------------------------------------------------------
// C receipt alignment: dimension → field → canonical owner mapping
// ---------------------------------------------------------------------------

export interface CustomerReceiptDimensionMapping {
  readonly dimension: string;
  readonly sourceField: string;
  readonly sourceType: 'CustomerRuntimeState' | 'CustomerCaseRuntime';
  readonly canonicalOwner: CustomerRuntimeCanonicalOwner | CustomerCaseRuntimeCanonicalOwner;
  readonly targetConcept: string;
}

/**
 * Maps Agent C's ConstraintSignalDimension values that target 'customer-runtime'
 * to the canonical owner fields in this contract.
 */
export const CUSTOMER_RECEIPT_DIMENSION_ALIGNMENT: readonly CustomerReceiptDimensionMapping[] =
  Object.freeze([
    {
      dimension: 'churn-risk',
      sourceField: 'churnRisk',
      sourceType: 'CustomerRuntimeState',
      canonicalOwner: 'customer-decision-pressure',
      targetConcept: 'CustomerDecisionPressure.churnRisk',
    },
    {
      dimension: 'interest',
      sourceField: 'interest',
      sourceType: 'CustomerCaseRuntime',
      canonicalOwner: 'customer-attention-state',
      targetConcept: 'CustomerAttentionState.caseInterest',
    },
    {
      dimension: 'confidence',
      sourceField: 'confidence',
      sourceType: 'CustomerCaseRuntime',
      canonicalOwner: 'customer-decision-pressure',
      targetConcept: 'CustomerDecisionPressure.caseConfidence',
    },
    {
      dimension: 'sentiment',
      sourceField: 'advisorTrust',
      sourceType: 'CustomerRuntimeState',
      canonicalOwner: 'broker-customer-relation',
      targetConcept: 'BrokerCustomerRelation.trust',
    },
    {
      dimension: 'demand-heat',
      sourceField: 'interest',
      sourceType: 'CustomerCaseRuntime',
      canonicalOwner: 'customer-attention-state',
      targetConcept: 'CustomerAttentionState.caseInterest (aggregated across active cases)',
    },
    {
      dimension: 'fatigue',
      sourceField: 'fatigue',
      sourceType: 'CustomerRuntimeState',
      canonicalOwner: 'customer-decision-pressure',
      targetConcept: 'CustomerDecisionPressure.fatigue',
    },
  ]);
