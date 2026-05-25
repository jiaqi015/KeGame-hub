import type {
  LegacyCanonicalCaseLike,
  LegacyCanonicalCompetitionGroupLike,
  LegacyCanonicalCustomerLike,
  LegacyCanonicalDomainEventLike,
  LegacyCanonicalGameStateLike,
  LegacyCanonicalMarketCellLike,
  LegacyCanonicalOpportunityLike,
  LegacyCanonicalProductRunLike,
} from './legacyCompatibilityContracts.js';
import type {
  AssetCase,
  AssetCaseStatus,
  Broker,
  BrokerOwnerRelation,
  CaseCompetitionRelation,
  Customer,
  CustomerCaseOpportunity,
  NegotiationProcess,
  OpenDayRun,
  OpportunityLifecycleStatus,
  OpportunityStatus,
  OpportunityVisibility,
  Owner,
  OwnerCaseRelation,
  Region,
  SinceritySaleRun,
  Store,
  WorldDomainEvent,
  WorldEntityId,
  WorldStateSnapshot,
} from './models.js';
import type { GoalTier, StorylineState } from './caseNarrativeTypes.js';
import type { ListingEndingBucket, ListingEndingType, OwnerSatisfactionState } from './caseOutcomeTypes.js';
import type { OwnerPersonality } from './caseTypeFragments.js';
import type { LeadSourceType } from '../business-rules/archetypes/archetypeTaxonomy.js';
import {
  isAssetCaseStatus,
  isOwnerPersonality,
  isOpportunityStatus,
  isOpportunityLifecycleStatus,
  isOpportunityVisibility,
} from './caseTypeFragments.js';
import { isGoalTier, isStorylineState, isTone } from './caseNarrativeTypes.js';
import type { Tone } from './caseNarrativeTypes.js';
import { isListingEndingType, isListingEndingBucket, isOwnerSatisfactionState } from './caseOutcomeTypes.js';
import { isLeadSourceType } from '../business-rules/archetypes/archetypeTaxonomy.js';
import { isProductRunMilestoneKind, isProductRunScope, isProductRunStatus } from './productRunTypes.js';
import type { ProductRunMilestone, ProductRunScope, ProductRunStatus } from './productRunTypes.js';
import { validateLegacyCanonicalGameStateLike, type CompatibilityValidationResult } from './legacyCompatibilityValidation.js';

// Legacy compatibility fallbacks — these are NOT simulation truth;
// they prevent illegal legacy strings from entering canonical projections.
const FALLBACK_CASE_STATUS: AssetCaseStatus = 'active';
const FALLBACK_GOAL_TIER: GoalTier = 'normal';
const FALLBACK_STORYLINE_STATE: StorylineState = 'healthy';
const FALLBACK_OWNER_PERSONALITY: OwnerPersonality = 'pragmatic';
const FALLBACK_OPP_STATUS: OpportunityStatus = 'active';
const FALLBACK_OPP_LIFECYCLE: OpportunityLifecycleStatus = 'active';
const FALLBACK_OPP_VISIBILITY: OpportunityVisibility = 'shadow';
const FALLBACK_LEAD_SOURCE: LeadSourceType = 'direct';
const FALLBACK_PRODUCT_RUN_SCOPE: ProductRunScope = 'listing';
const FALLBACK_PRODUCT_RUN_STATUS: ProductRunStatus = 'running';
const FALLBACK_NEG_STATUS: NegotiationProcess['status'] = 'active';

export function toAssetCaseId(legacyCaseId: string): WorldEntityId {
  return `asset-case:${legacyCaseId}`;
}

export function toOwnerId(legacyCaseId: string): WorldEntityId {
  return `owner:${legacyCaseId}`;
}

export function toCustomerId(legacyCustomerId: string): WorldEntityId {
  return legacyCustomerId ? `customer:${legacyCustomerId}` : '';
}

export function toCustomerFromOpportunityId(legacyOpportunityId: string): WorldEntityId {
  return `customer-from-opportunity:${legacyOpportunityId}`;
}

export function toMaintainerBrokerId(name: string): WorldEntityId {
  return `broker:maintainer:${name}`;
}

export function toLeadBrokerId(name: string): WorldEntityId {
  return `broker:lead:${name}`;
}

export function toRegionId(legacyMarketCellId: string): WorldEntityId {
  return `region:${legacyMarketCellId}`;
}

export function mapLegacyCaseToAssetCase(caseItem: LegacyCanonicalCaseLike): AssetCase {
  return {
    id: toAssetCaseId(caseItem.id),
    legacyCaseId: caseItem.id,
    housePrototypeId: caseItem.housePrototypeId,
    title: caseItem.title,
    community: caseItem.community,
    district: caseItem.district,
    layout: caseItem.layout,
    area: caseItem.area,
    marketCellId: caseItem.marketCellId,
    regionId: caseItem.marketCellId ? toRegionId(caseItem.marketCellId) : undefined,
    story: caseItem.story,
    tags: [...caseItem.tags],
    defects: [...caseItem.defects],
    askPrice: caseItem.askPrice,
    marketPrice: caseItem.marketPrice,
    bottomPrice: caseItem.bottomPrice,
    lastAskPrice: caseItem.lastAskPrice,
    priceGapPct: caseItem.priceGapPct,
    heat: caseItem.heat,
    status: isAssetCaseStatus(caseItem.status) ? caseItem.status : FALLBACK_CASE_STATUS,
    stageIndex: caseItem.stageIndex,
    stageLabel: caseItem.stageLabel,
    riskFlags: [...caseItem.riskFlags],
    goalTier: isGoalTier(caseItem.goalTier) ? caseItem.goalTier : FALLBACK_GOAL_TIER,
    storylineState: isStorylineState(caseItem.storylineState) ? caseItem.storylineState : FALLBACK_STORYLINE_STATE,
    viewings: caseItem.viewings,
    offers: caseItem.offers,
    soldPrice: caseItem.soldPrice,
    endingType: isListingEndingType(caseItem.endingType) ? caseItem.endingType : undefined,
    endingBucket: isListingEndingBucket(caseItem.endingBucket) ? caseItem.endingBucket : undefined,
    endingSummary: caseItem.endingSummary,
  };
}

export function mapLegacyCaseToOwner(caseItem: LegacyCanonicalCaseLike): Owner {
  return {
    id: toOwnerId(caseItem.id),
    legacyCaseId: caseItem.id,
    archetypeId: caseItem.ownerArchetypeId,
    name: caseItem.ownerName,
    mood: caseItem.ownerMood,
    personality: isOwnerPersonality(caseItem.personality) ? caseItem.personality : FALLBACK_OWNER_PERSONALITY,
    trust: caseItem.trust,
    patience: caseItem.patience,
    urgency: caseItem.urgency,
    windowDays: caseItem.windowDays,
    satisfaction: isOwnerSatisfactionState(caseItem.ownerSatisfaction) ? caseItem.ownerSatisfaction : undefined,
  };
}

export function mapLegacyCaseToMaintainerBroker(caseItem: LegacyCanonicalCaseLike): Broker {
  return {
    id: toMaintainerBrokerId(caseItem.maintainerName),
    name: caseItem.maintainerName,
    source: 'maintainer',
  };
}

export function mapLegacyCustomerToCustomer(customer: LegacyCanonicalCustomerLike): Customer {
  return {
    id: toCustomerId(customer.id),
    legacyCustomerId: customer.id,
    name: customer.name,
    profile: customer.profile,
    budgetMin: customer.budgetMin,
    budgetMax: customer.budgetMax,
    targetDistrict: customer.targetDistrict,
    layouts: [...customer.layouts],
    activity: customer.activity,
    urgency: customer.urgency,
    priceSensitivity: customer.priceSensitivity,
    preferences: [...customer.preferences],
  };
}

export function mapLegacyOpportunityToCustomer(opportunity: LegacyCanonicalOpportunityLike): Customer {
  return {
    id: opportunity.customerId ? toCustomerId(opportunity.customerId) : toCustomerFromOpportunityId(opportunity.id),
    legacyCustomerId: opportunity.customerId || undefined,
    sourceOpportunityId: opportunity.id,
    name: opportunity.customerName,
    profile: opportunity.profile,
    budgetMax: opportunity.budgetMax,
    layouts: [],
    priceSensitivity: opportunity.priceSensitivity,
    preferences: [],
  };
}

export function mapLegacyMarketToRegion(market: LegacyCanonicalMarketCellLike): Region {
  return {
    id: toRegionId(market.id),
    legacyMarketCellId: market.id,
    name: market.name,
    demandHeat: market.demandHeat,
    supplyPressure: market.supplyPressure,
    competitivePressure: market.competitivePressure,
    sentiment: market.sentiment,
    monthlyFactors: market.monthlyFactors ? [...market.monthlyFactors] : undefined,
  };
}

export function mapLegacyCaseToBrokerOwnerRelation(caseItem: LegacyCanonicalCaseLike): BrokerOwnerRelation {
  const brokerId = toMaintainerBrokerId(caseItem.maintainerName);
  const ownerId = toOwnerId(caseItem.id);
  return {
    id: `broker-owner:${brokerId}:${ownerId}`,
    brokerId,
    ownerId,
    assetCaseIds: [toAssetCaseId(caseItem.id)],
    trust: caseItem.trust,
    lastOwnerTouchedDay: caseItem.lastOwnerTouchedDay,
    touchedOwnerToday: caseItem.touchedOwnerToday,
  };
}

export function mapLegacyCaseToOwnerCaseRelation(caseItem: LegacyCanonicalCaseLike): OwnerCaseRelation {
  const ownerId = toOwnerId(caseItem.id);
  const assetCaseId = toAssetCaseId(caseItem.id);
  return {
    id: `owner-case:${ownerId}:${assetCaseId}`,
    ownerId,
    assetCaseId,
    role: 'seller',
    ownerMood: caseItem.ownerMood,
    askPrice: caseItem.askPrice,
    bottomPrice: caseItem.bottomPrice,
    windowDays: caseItem.windowDays,
    status: isAssetCaseStatus(caseItem.status) ? caseItem.status : FALLBACK_CASE_STATUS,
    patience: caseItem.patience,
    urgency: caseItem.urgency,
  };
}

export function mapLegacyOpportunityToCustomerCaseOpportunity(opportunity: LegacyCanonicalOpportunityLike): CustomerCaseOpportunity {
  const customerId = opportunity.customerId
    ? toCustomerId(opportunity.customerId)
    : toCustomerFromOpportunityId(opportunity.id);
  return {
    id: `customer-case-opportunity:${opportunity.id}`,
    legacyOpportunityId: opportunity.id,
    customerId,
    assetCaseId: toAssetCaseId(opportunity.caseId),
    brokerId: opportunity.brokerName ? toLeadBrokerId(opportunity.brokerName) : undefined,
    channelId: opportunity.channelId,
    channelName: opportunity.channelName,
    fit: opportunity.fit,
    intent: opportunity.intent,
    confidence: opportunity.confidence,
    stageIndex: opportunity.stageIndex,
    stageLabel: opportunity.stageLabel,
    status: isOpportunityStatus(opportunity.status) ? opportunity.status : FALLBACK_OPP_STATUS,
    lifecycleStatus: isOpportunityLifecycleStatus(opportunity.lifecycleStatus) ? opportunity.lifecycleStatus : FALLBACK_OPP_LIFECYCLE,
    leadSource: isLeadSourceType(opportunity.leadSource) ? opportunity.leadSource : FALLBACK_LEAD_SOURCE,
    visibility: isOpportunityVisibility(opportunity.visibility) ? opportunity.visibility : FALLBACK_OPP_VISIBILITY,
    createdDay: opportunity.createdDay,
    daysLeft: opportunity.daysLeft,
    touchedToday: opportunity.touchedToday,
    budgetMax: opportunity.budgetMax,
    priceSensitivity: opportunity.priceSensitivity,
    stagnationTicks: opportunity.stagnationTicks,
    history: opportunity.history.map((entry) => ({ ...entry })),
  };
}

export function mapLegacyCompetitionToCaseCompetitionRelations(
  group: LegacyCanonicalCompetitionGroupLike,
): CaseCompetitionRelation[] {
  return group.members.map((caseId) => {
    const assetCaseId = toAssetCaseId(caseId);
    return {
      id: `case-competition:${group.id}:${assetCaseId}`,
      competitionGroupId: group.id,
      competitionGroupName: group.name,
      assetCaseId,
      competingAssetCaseIds: group.members
        .filter((memberId) => memberId !== caseId)
        .map(toAssetCaseId),
      priceElasticity: group.priceElasticity,
      customerSpillover: group.customerSpillover,
    };
  });
}

export function mapLegacyProductRunToOpenDayRun(run: LegacyCanonicalProductRunLike): OpenDayRun {
  return {
    ...mapProductRunBase(run),
    id: `open-day-run:${run.id}`,
    processType: 'open-day',
  };
}

export function mapLegacyProductRunToSinceritySaleRun(run: LegacyCanonicalProductRunLike): SinceritySaleRun {
  return {
    ...mapProductRunBase(run),
    id: `sincerity-sale-run:${run.id}`,
    processType: 'sincerity-sale',
  };
}

export function mapLegacyOpportunityToNegotiationProcess(opportunity: LegacyCanonicalOpportunityLike): NegotiationProcess | null {
  if (!opportunity.pendingClosingEvaluation) {
    return null;
  }

  // NegotiationProcess status uses the same values as OpportunityStatus
  const negStatus: NegotiationProcess['status'] = isOpportunityStatus(opportunity.status)
    ? opportunity.status
    : FALLBACK_NEG_STATUS;

  return {
    id: `negotiation:${opportunity.id}`,
    sourceOpportunityId: opportunity.id,
    assetCaseId: toAssetCaseId(opportunity.caseId),
    customerId: opportunity.customerId ? toCustomerId(opportunity.customerId) : toCustomerFromOpportunityId(opportunity.id),
    brokerId: opportunity.brokerName ? toLeadBrokerId(opportunity.brokerName) : undefined,
    status: negStatus,
    stageIndex: opportunity.stageIndex,
    stageLabel: opportunity.stageLabel,
    intent: opportunity.intent,
    confidence: opportunity.confidence,
    daysLeft: opportunity.daysLeft,
    pendingClosingEvaluation: true,
    pendingClosingStrategyId: opportunity.pendingClosingStrategyId,
    pendingClosingRequestedDay: opportunity.pendingClosingRequestedDay,
  };
}

export function mapLegacyDomainEventToWorldDomainEvent(event: LegacyCanonicalDomainEventLike): WorldDomainEvent {
  return {
    id: `legacy-domain-event:${event.id}`,
    legacyEventId: event.id,
    day: event.day,
    date: event.date,
    kind: event.kind,
    aggregate: resolveEventAggregate(event),
    actor: {
      type: 'legacy',
      label: event.actor,
    },
    title: event.title,
    detail: event.detail,
    tone: isTone(event.tone) ? event.tone : undefined,
    payload: { ...event.payload },
    schemaVersion: 1,
  };
}

export function deriveWorldStateFromLegacyGameState(state: LegacyCanonicalGameStateLike): WorldStateSnapshot & { validationReport?: CompatibilityValidationResult } {
  const validationReport = validateLegacyCanonicalGameStateLike(state);
  const cases = Array.isArray(state.cases) ? state.cases : [];
  const opportunities = Array.isArray(state.opportunities) ? state.opportunities : [];
  const assets = cases.map(mapLegacyCaseToAssetCase);
  const owners = cases.map(mapLegacyCaseToOwner);
  const customers = mergeCustomers([
    ...(state.customers || []).map(mapLegacyCustomerToCustomer),
    ...opportunities.map(mapLegacyOpportunityToCustomer),
  ]);
  const brokers = mergeBrokers([
    ...cases.map(mapLegacyCaseToMaintainerBroker),
    ...opportunities
      .filter((opportunity) => Boolean(opportunity.brokerName))
      .map((opportunity) => ({
        id: toLeadBrokerId(opportunity.brokerName || ''),
        name: opportunity.brokerName || '',
        source: 'lead' as const,
      })),
  ]);
  const negotiationProcesses = opportunities
    .map(mapLegacyOpportunityToNegotiationProcess)
    .filter((process): process is NegotiationProcess => Boolean(process));

  return {
    source: 'legacy-game-state',
    legacyRunId: state.runId,
    version: state.version,
    day: state.day,
    date: state.currentDate,
    assets,
    owners,
    brokers,
    customers,
    regions: (state.markets || []).map(mapLegacyMarketToRegion),
    stores: [buildPlayerStore(brokers)],
    brokerOwnerRelations: cases.map(mapLegacyCaseToBrokerOwnerRelation),
    ownerCaseRelations: cases.map(mapLegacyCaseToOwnerCaseRelation),
    customerCaseOpportunities: opportunities.map(mapLegacyOpportunityToCustomerCaseOpportunity),
    caseCompetitionRelations: (state.competitionGroups || []).flatMap(mapLegacyCompetitionToCaseCompetitionRelations),
    openDayRuns: (state.productRuns || [])
      .filter((run) => run.productType === 'open-day')
      .map(mapLegacyProductRunToOpenDayRun),
    sinceritySaleRuns: (state.productRuns || [])
      .filter((run) => run.productType === 'sincere-sale')
      .map(mapLegacyProductRunToSinceritySaleRun),
    negotiationProcesses,
    events: (state.eventStore || []).map(mapLegacyDomainEventToWorldDomainEvent),
    validationReport,
  };
}

function mapProductRunBase(run: LegacyCanonicalProductRunLike) {
  return {
    legacyProductRunId: run.id,
    scope: isProductRunScope(run.scope) ? run.scope : FALLBACK_PRODUCT_RUN_SCOPE,
    status: isProductRunStatus(run.status) ? run.status : FALLBACK_PRODUCT_RUN_STATUS,
    startDay: run.startDay ?? 0,
    endDay: run.endDay,
    targetAssetCaseIds: run.targetIds.map(toAssetCaseId),
    nextMilestone: run.nextMilestone ?? '',
    linkedEventIds: [...(run.linkedEventIds || [])],
    milestones: normalizeProductRunMilestones(run.milestones),
  };
}

function normalizeProductRunMilestones(milestones: readonly unknown[] | undefined): ProductRunMilestone[] {
  if (!milestones) return [];
  return milestones
    .map(normalizeProductRunMilestone)
    .filter((milestone): milestone is ProductRunMilestone => Boolean(milestone));
}

function normalizeProductRunMilestone(value: unknown): ProductRunMilestone | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const { id, title, summary, day, kind, settlementHint } = record;
  if (
    typeof id !== 'string'
    || typeof title !== 'string'
    || typeof summary !== 'string'
    || typeof settlementHint !== 'string'
    || typeof day !== 'number'
    || !Number.isFinite(day)
    || !isProductRunMilestoneKind(kind)
  ) {
    return null;
  }

  return {
    id,
    title,
    summary,
    day,
    kind,
    settlementHint,
  };
}

function mergeBrokers(brokers: Broker[]): Broker[] {
  const byId = new Map<string, Broker>();
  brokers.forEach((broker) => {
    if (!broker.id || byId.has(broker.id)) return;
    byId.set(broker.id, broker);
  });
  return [...byId.values()];
}

function mergeCustomers(customers: Customer[]): Customer[] {
  const byId = new Map<string, Customer>();
  customers.forEach((customer) => {
    if (!customer.id) return;
    const existing = byId.get(customer.id);
    byId.set(customer.id, existing ? { ...customer, ...existing } : customer);
  });
  return [...byId.values()];
}

function buildPlayerStore(brokers: Broker[]): Store {
  return {
    id: 'store:player',
    name: '本店',
    kind: 'player',
    brokerIds: brokers
      .filter((broker) => broker.source === 'maintainer')
      .map((broker) => broker.id),
  };
}

function resolveEventAggregate(event: LegacyCanonicalDomainEventLike): WorldDomainEvent['aggregate'] {
  if (event.caseId) {
    return { type: 'asset-case', id: toAssetCaseId(event.caseId) };
  }
  if (event.customerId) {
    return { type: 'customer', id: toCustomerId(event.customerId) };
  }
  return { type: 'world', id: 'world:legacy' };
}
