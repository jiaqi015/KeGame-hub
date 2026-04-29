import type {
  Case,
  CompetitionGroup,
  CustomerProfile,
  DomainEventEntry,
  GameState,
  MarketCell,
  Opportunity,
  ProductRun,
} from '../../domain/models.js';
import type {
  AssetCase,
  Broker,
  BrokerOwnerRelation,
  CaseCompetitionRelation,
  Customer,
  CustomerCaseOpportunity,
  NegotiationProcess,
  OpenDayRun,
  Owner,
  OwnerCaseRelation,
  Region,
  SinceritySaleRun,
  Store,
  WorldDomainEvent,
  WorldEntityId,
  WorldStateSnapshot,
} from './models.js';

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

export function mapLegacyCaseToAssetCase(caseItem: Case): AssetCase {
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
    status: caseItem.status,
    stageIndex: caseItem.stageIndex,
    stageLabel: caseItem.stageLabel,
    riskFlags: [...caseItem.riskFlags],
    goalTier: caseItem.goalTier,
    storylineState: caseItem.storylineState,
    viewings: caseItem.viewings,
    offers: caseItem.offers,
    soldPrice: caseItem.soldPrice,
    endingType: caseItem.endingType,
    endingBucket: caseItem.endingBucket,
    endingSummary: caseItem.endingSummary,
  };
}

export function mapLegacyCaseToOwner(caseItem: Case): Owner {
  return {
    id: toOwnerId(caseItem.id),
    legacyCaseId: caseItem.id,
    archetypeId: caseItem.ownerArchetypeId,
    name: caseItem.ownerName,
    mood: caseItem.ownerMood,
    personality: caseItem.personality,
    trust: caseItem.trust,
    patience: caseItem.patience,
    urgency: caseItem.urgency,
    windowDays: caseItem.windowDays,
    satisfaction: caseItem.ownerSatisfaction,
  };
}

export function mapLegacyCaseToMaintainerBroker(caseItem: Case): Broker {
  return {
    id: toMaintainerBrokerId(caseItem.maintainerName),
    name: caseItem.maintainerName,
    source: 'maintainer',
  };
}

export function mapLegacyCustomerToCustomer(customer: CustomerProfile): Customer {
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

export function mapLegacyOpportunityToCustomer(opportunity: Opportunity): Customer {
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

export function mapLegacyMarketToRegion(market: MarketCell): Region {
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

export function mapLegacyCaseToBrokerOwnerRelation(caseItem: Case): BrokerOwnerRelation {
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

export function mapLegacyCaseToOwnerCaseRelation(caseItem: Case): OwnerCaseRelation {
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
    status: caseItem.status,
  };
}

export function mapLegacyOpportunityToCustomerCaseOpportunity(opportunity: Opportunity): CustomerCaseOpportunity {
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
    status: opportunity.status,
    lifecycleStatus: opportunity.lifecycleStatus,
    leadSource: opportunity.leadSource,
    visibility: opportunity.visibility,
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
  group: CompetitionGroup,
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

export function mapLegacyProductRunToOpenDayRun(run: ProductRun): OpenDayRun {
  return {
    ...mapProductRunBase(run),
    id: `open-day-run:${run.id}`,
    processType: 'open-day',
  };
}

export function mapLegacyProductRunToSinceritySaleRun(run: ProductRun): SinceritySaleRun {
  return {
    ...mapProductRunBase(run),
    id: `sincerity-sale-run:${run.id}`,
    processType: 'sincerity-sale',
  };
}

export function mapLegacyOpportunityToNegotiationProcess(opportunity: Opportunity): NegotiationProcess | null {
  if (!opportunity.pendingClosingEvaluation) {
    return null;
  }

  return {
    id: `negotiation:${opportunity.id}`,
    sourceOpportunityId: opportunity.id,
    assetCaseId: toAssetCaseId(opportunity.caseId),
    customerId: opportunity.customerId ? toCustomerId(opportunity.customerId) : toCustomerFromOpportunityId(opportunity.id),
    brokerId: opportunity.brokerName ? toLeadBrokerId(opportunity.brokerName) : undefined,
    status: opportunity.status,
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

export function mapLegacyDomainEventToWorldDomainEvent(event: DomainEventEntry): WorldDomainEvent {
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
    tone: event.tone,
    payload: { ...event.payload },
    schemaVersion: 1,
  };
}

export function deriveWorldStateFromLegacyGameState(state: GameState): WorldStateSnapshot {
  const assets = state.cases.map(mapLegacyCaseToAssetCase);
  const owners = state.cases.map(mapLegacyCaseToOwner);
  const opportunities = state.opportunities || [];
  const customers = mergeCustomers([
    ...(state.customers || []).map(mapLegacyCustomerToCustomer),
    ...opportunities.map(mapLegacyOpportunityToCustomer),
  ]);
  const brokers = mergeBrokers([
    ...state.cases.map(mapLegacyCaseToMaintainerBroker),
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
    brokerOwnerRelations: state.cases.map(mapLegacyCaseToBrokerOwnerRelation),
    ownerCaseRelations: state.cases.map(mapLegacyCaseToOwnerCaseRelation),
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
  };
}

function mapProductRunBase(run: ProductRun) {
  return {
    legacyProductRunId: run.id,
    scope: run.scope,
    status: run.status,
    startDay: run.startDay,
    endDay: run.endDay,
    targetAssetCaseIds: run.targetIds.map(toAssetCaseId),
    nextMilestone: run.nextMilestone,
    linkedEventIds: [...(run.linkedEventIds || [])],
    milestones: (run.milestones || []).map((milestone) => ({ ...milestone })),
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

function resolveEventAggregate(event: DomainEventEntry): WorldDomainEvent['aggregate'] {
  if (event.caseId) {
    return { type: 'asset-case', id: toAssetCaseId(event.caseId) };
  }
  if (event.customerId) {
    return { type: 'customer', id: toCustomerId(event.customerId) };
  }
  return { type: 'world', id: 'world:legacy' };
}
