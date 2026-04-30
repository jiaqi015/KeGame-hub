import { OPPORTUNITY_STAGES } from '../../../domain/constants.js';
import type { CustomerRuntimeState, GameState, Opportunity } from '../../../domain/models.js';
import { clamp } from '../../../domain/utils.js';
import { toAssetCaseId, toCustomerFromOpportunityId, toCustomerId, toLeadBrokerId } from '../adapters.js';
import type { WorldEntityId } from '../models.js';
import type {
  CanonicalOpportunityRelationMetadata,
  CustomerCaseOpportunityRelationBuildOptions,
  CustomerCaseOpportunityRelationConflictFlags,
  CustomerCaseOpportunityRelationView,
  CustomerRuntimeCaseRelationMetadata,
} from './types.js';

const DEFAULT_FIT_CONFLICT_TOLERANCE = 0;
const DEFAULT_STAGE_CONFLICT_TOLERANCE = 0;
const DEFAULT_INTENT_CONFLICT_TOLERANCE = 0;
const DEFAULT_CONFIDENCE_CONFLICT_TOLERANCE = 0;

function relationKey(customerId: string, caseId: string) {
  return `${customerId}::${caseId}`;
}

function resolveCustomerId(customerId: string | undefined, legacyOpportunityId?: string): WorldEntityId {
  if (customerId) return toCustomerId(customerId);
  return legacyOpportunityId ? toCustomerFromOpportunityId(legacyOpportunityId) : '';
}

function resolveStageLabel(stageIndex: number) {
  return OPPORTUNITY_STAGES[clamp(stageIndex, 0, OPPORTUNITY_STAGES.length - 1)] || OPPORTUNITY_STAGES[0];
}

function buildCanonicalOpportunityMetadata(opportunity: Opportunity): CanonicalOpportunityRelationMetadata {
  return {
    status: opportunity.status,
    lifecycleStatus: opportunity.lifecycleStatus,
    leadSource: opportunity.leadSource,
    visibility: opportunity.visibility,
    channelId: opportunity.channelId,
    channelName: opportunity.channelName,
    createdDay: opportunity.createdDay,
    daysLeft: opportunity.daysLeft,
    touchedToday: opportunity.touchedToday,
    stagnationTicks: opportunity.stagnationTicks,
    brokerId: opportunity.brokerName ? toLeadBrokerId(opportunity.brokerName) : undefined,
  };
}

function buildRuntimeMetadata(
  customerState: CustomerRuntimeState,
  caseId: string,
): CustomerRuntimeCaseRelationMetadata | undefined {
  const runtime = customerState.caseStates[caseId];
  if (!runtime) return undefined;

  return {
    status: customerState.status,
    decisionStyle: customerState.decisionStyle,
    advisorTrust: customerState.advisorTrust,
    fatigue: customerState.fatigue,
    churnRisk: customerState.churnRisk,
    active: customerState.activeCaseIds.includes(caseId),
    interactions: runtime.interactions,
    lastActiveDay: runtime.lastActiveDay,
    viewed: runtime.viewed,
    offered: runtime.offered,
    selected: runtime.selected,
    competingAssetCaseIds: (runtime.competingCaseIds || []).map(toAssetCaseId),
  };
}

function detectConflicts(
  opportunity: Opportunity | undefined,
  runtime: CustomerRuntimeState['caseStates'][string] | undefined,
  options: Required<CustomerCaseOpportunityRelationBuildOptions>,
): CustomerCaseOpportunityRelationConflictFlags {
  if (!opportunity || !runtime) {
    return {
      fit: false,
      stageIndex: false,
      intent: false,
      confidence: false,
    };
  }

  return {
    fit: Math.abs(opportunity.fit - runtime.fit) > options.fitConflictTolerance,
    stageIndex: Math.abs(opportunity.stageIndex - runtime.stageIndex) > options.stageConflictTolerance,
    intent: Math.abs(opportunity.intent - runtime.interest) > options.intentConflictTolerance,
    confidence: Math.abs(opportunity.confidence - runtime.confidence) > options.confidenceConflictTolerance,
  };
}

function buildOpportunityRelation(
  opportunity: Opportunity,
  runtimeState: CustomerRuntimeState | undefined,
  options: Required<CustomerCaseOpportunityRelationBuildOptions>,
): CustomerCaseOpportunityRelationView {
  const runtime = runtimeState?.caseStates[opportunity.caseId];
  const source = runtime ? 'merged' : 'opportunity';
  const canonicalOpportunityMetadata = buildCanonicalOpportunityMetadata(opportunity);

  return {
    id: source === 'merged'
      ? `customer-case-opportunity-relation:merged:${opportunity.id}`
      : `customer-case-opportunity-relation:opportunity:${opportunity.id}`,
    source,
    customerId: resolveCustomerId(opportunity.customerId, opportunity.id),
    caseId: opportunity.caseId,
    assetCaseId: toAssetCaseId(opportunity.caseId),
    legacyOpportunityId: opportunity.id,
    fit: opportunity.fit,
    intent: opportunity.intent,
    confidence: opportunity.confidence,
    stageIndex: opportunity.stageIndex,
    stageLabel: opportunity.stageLabel,
    conflictFlags: detectConflicts(opportunity, runtime, options),
    canonicalOpportunityMetadata,
    legacyOpportunity: canonicalOpportunityMetadata,
    customerRuntime: runtimeState ? buildRuntimeMetadata(runtimeState, opportunity.caseId) : undefined,
  };
}

function buildRuntimeOnlyRelation(
  customerState: CustomerRuntimeState,
  caseId: string,
): CustomerCaseOpportunityRelationView | undefined {
  const runtime = customerState.caseStates[caseId];
  if (!runtime) return undefined;

  return {
    id: `customer-case-opportunity-relation:customer-runtime:${customerState.customerId}:${caseId}`,
    source: 'customer-runtime',
    customerId: resolveCustomerId(customerState.customerId),
    caseId,
    assetCaseId: toAssetCaseId(caseId),
    fit: runtime.fit,
    intent: runtime.interest,
    confidence: runtime.confidence,
    stageIndex: runtime.stageIndex,
    stageLabel: resolveStageLabel(runtime.stageIndex),
    conflictFlags: {
      fit: false,
      stageIndex: false,
      intent: false,
      confidence: false,
    },
    customerRuntime: buildRuntimeMetadata(customerState, caseId),
  };
}

export function buildCustomerCaseOpportunityRelationView(
  state: GameState,
  options: CustomerCaseOpportunityRelationBuildOptions = {},
): CustomerCaseOpportunityRelationView[] {
  const resolvedOptions: Required<CustomerCaseOpportunityRelationBuildOptions> = {
    fitConflictTolerance: options.fitConflictTolerance ?? DEFAULT_FIT_CONFLICT_TOLERANCE,
    stageConflictTolerance: options.stageConflictTolerance ?? DEFAULT_STAGE_CONFLICT_TOLERANCE,
    intentConflictTolerance: options.intentConflictTolerance ?? DEFAULT_INTENT_CONFLICT_TOLERANCE,
    confidenceConflictTolerance: options.confidenceConflictTolerance ?? DEFAULT_CONFIDENCE_CONFLICT_TOLERANCE,
  };
  const runtimeStatesByRelationKey = new Map<string, CustomerRuntimeState>();
  const consumedRuntimeKeys = new Set<string>();

  (state.customerStates || []).forEach((customerState) => {
    Object.keys(customerState.caseStates || {}).forEach((caseId) => {
      runtimeStatesByRelationKey.set(relationKey(customerState.customerId, caseId), customerState);
    });
  });

  const views = (state.opportunities || []).map((opportunity) => {
    const key = relationKey(opportunity.customerId, opportunity.caseId);
    const runtimeState = runtimeStatesByRelationKey.get(key);
    if (runtimeState) consumedRuntimeKeys.add(key);
    return buildOpportunityRelation(opportunity, runtimeState, resolvedOptions);
  });

  (state.customerStates || []).forEach((customerState) => {
    Object.keys(customerState.caseStates || {}).forEach((caseId) => {
      const key = relationKey(customerState.customerId, caseId);
      if (consumedRuntimeKeys.has(key)) return;
      const runtimeOnlyRelation = buildRuntimeOnlyRelation(customerState, caseId);
      if (runtimeOnlyRelation) views.push(runtimeOnlyRelation);
    });
  });

  return views;
}
