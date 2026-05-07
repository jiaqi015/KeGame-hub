import type {
  Case,
  CompetitionGroup,
  CustomerProfile,
  DomainEventKind,
  GoalTier,
  LeadSourceType,
  ListingEndingBucket,
  ListingEndingType,
  Opportunity,
  OwnerSatisfactionState,
  ProductRunMilestone,
  ProductRunScope,
  ProductRunStatus,
  StorylineState,
  Tone,
} from '../../domain/models.js';

export type WorldEntityId = string;
export type LegacyEntityId = string;

export type AssetCaseStatus = Case['status'];

export interface AssetCase {
  id: WorldEntityId;
  legacyCaseId: LegacyEntityId;
  housePrototypeId: string;
  title: string;
  community: string;
  district: string;
  layout: string;
  area: number;
  marketCellId: string;
  regionId?: WorldEntityId;
  story: string;
  tags: readonly string[];
  defects: readonly string[];
  askPrice: number;
  marketPrice: number;
  bottomPrice: number;
  lastAskPrice: number;
  priceGapPct: number;
  heat: number;
  status: AssetCaseStatus;
  stageIndex: number;
  stageLabel: string;
  riskFlags: readonly string[];
  goalTier: GoalTier;
  storylineState: StorylineState;
  viewings: number;
  offers: number;
  soldPrice: number | null;
  endingType?: ListingEndingType;
  endingBucket?: ListingEndingBucket;
  endingSummary?: string;
}

export interface Owner {
  id: WorldEntityId;
  legacyCaseId: LegacyEntityId;
  archetypeId: string;
  name: string;
  mood: string;
  personality: Case['personality'];
  trust: number;
  patience: number;
  urgency: number;
  windowDays: number;
  satisfaction?: OwnerSatisfactionState;
}

export interface Broker {
  id: WorldEntityId;
  name: string;
  source: 'maintainer' | 'lead';
}

export interface Customer {
  id: WorldEntityId;
  legacyCustomerId?: LegacyEntityId;
  sourceOpportunityId?: LegacyEntityId;
  name: string;
  profile: string;
  budgetMin?: number;
  budgetMax?: number;
  targetDistrict?: string;
  layouts: readonly string[];
  activity?: number;
  urgency?: number;
  priceSensitivity?: number;
  preferences: readonly string[];
}

export interface Region {
  id: WorldEntityId;
  legacyMarketCellId: LegacyEntityId;
  name: string;
  demandHeat: number;
  supplyPressure: number;
  competitivePressure: number;
  sentiment: number;
  monthlyFactors?: readonly number[];
}

export interface Store {
  id: WorldEntityId;
  name: string;
  kind: 'player';
  brokerIds: readonly WorldEntityId[];
}

export interface BrokerOwnerRelation {
  id: WorldEntityId;
  brokerId: WorldEntityId;
  ownerId: WorldEntityId;
  assetCaseIds: readonly WorldEntityId[];
  trust: number;
  lastOwnerTouchedDay: number;
  touchedOwnerToday: boolean;
}

export interface OwnerCaseRelation {
  id: WorldEntityId;
  ownerId: WorldEntityId;
  assetCaseId: WorldEntityId;
  role: 'seller';
  ownerMood: string;
  askPrice: number;
  bottomPrice: number;
  windowDays: number;
  status: AssetCaseStatus;
  /** Owner-side decision readiness: how long owner will wait before acting. */
  patience: number;
  /** Owner-side decision pressure: how urgently owner wants to sell. */
  urgency: number;
}

export interface CustomerCaseOpportunity {
  id: WorldEntityId;
  legacyOpportunityId: LegacyEntityId;
  customerId: WorldEntityId;
  assetCaseId: WorldEntityId;
  brokerId?: WorldEntityId;
  channelId: string;
  channelName: string;
  fit: number;
  intent: number;
  confidence: number;
  stageIndex: number;
  stageLabel: string;
  status: Opportunity['status'];
  lifecycleStatus: Opportunity['lifecycleStatus'];
  leadSource: LeadSourceType;
  visibility: Opportunity['visibility'];
  createdDay: number;
  daysLeft: number;
  touchedToday: boolean;
  budgetMax: number;
  priceSensitivity: number;
  stagnationTicks: number;
  history: ReadonlyArray<Opportunity['history'][number]>;
}

export interface CaseCompetitionRelation {
  id: WorldEntityId;
  competitionGroupId: LegacyEntityId;
  competitionGroupName: string;
  assetCaseId: WorldEntityId;
  competingAssetCaseIds: readonly WorldEntityId[];
  priceElasticity: number;
  customerSpillover: number;
}

export interface ProductRunProcessBase {
  legacyProductRunId: LegacyEntityId;
  scope: ProductRunScope;
  status: ProductRunStatus;
  startDay: number;
  endDay?: number;
  targetAssetCaseIds: readonly WorldEntityId[];
  nextMilestone: string;
  linkedEventIds: readonly LegacyEntityId[];
  milestones: readonly ProductRunMilestone[];
}

export interface OpenDayRun extends ProductRunProcessBase {
  id: WorldEntityId;
  processType: 'open-day';
}

export interface SinceritySaleRun extends ProductRunProcessBase {
  id: WorldEntityId;
  processType: 'sincerity-sale';
}

export interface NegotiationProcess {
  id: WorldEntityId;
  sourceOpportunityId: LegacyEntityId;
  assetCaseId: WorldEntityId;
  customerId: WorldEntityId;
  brokerId?: WorldEntityId;
  status: 'active' | 'won' | 'lost' | 'closed';
  stageIndex: number;
  stageLabel: string;
  intent: number;
  confidence: number;
  daysLeft: number;
  pendingClosingEvaluation: boolean;
  pendingClosingStrategyId?: string;
  pendingClosingRequestedDay?: number;
}

export type DomainEventAggregateRef =
  | { type: 'asset-case'; id: WorldEntityId }
  | { type: 'owner'; id: WorldEntityId }
  | { type: 'customer'; id: WorldEntityId }
  | { type: 'broker'; id: WorldEntityId }
  | { type: 'region'; id: WorldEntityId }
  | { type: 'process'; id: WorldEntityId }
  | { type: 'world'; id: WorldEntityId };

export interface DomainEventActorRef {
  type: 'broker' | 'owner' | 'customer' | 'market' | 'system' | 'legacy';
  id?: WorldEntityId;
  label: string;
}

export interface WorldDomainEvent<TPayload extends Record<string, unknown> = Record<string, unknown>> {
  id: WorldEntityId;
  day: number;
  date: string;
  kind: DomainEventKind | string;
  aggregate: DomainEventAggregateRef;
  actor: DomainEventActorRef;
  title: string;
  detail: string;
  tone?: Tone;
  payload: TPayload;
  legacyEventId?: LegacyEntityId;
  schemaVersion: 1;
}

export type AppendDomainEventInput<TPayload extends Record<string, unknown> = Record<string, unknown>> =
  Omit<WorldDomainEvent<TPayload>, 'id' | 'schemaVersion'> & {
    id?: WorldEntityId;
  };

export interface WorldStateSnapshot {
  source: 'legacy-game-state';
  legacyRunId: string;
  version: number;
  day: number;
  date: string;
  assets: readonly AssetCase[];
  owners: readonly Owner[];
  brokers: readonly Broker[];
  customers: readonly Customer[];
  regions: readonly Region[];
  stores: readonly Store[];
  brokerOwnerRelations: readonly BrokerOwnerRelation[];
  ownerCaseRelations: readonly OwnerCaseRelation[];
  customerCaseOpportunities: readonly CustomerCaseOpportunity[];
  caseCompetitionRelations: readonly CaseCompetitionRelation[];
  openDayRuns: readonly OpenDayRun[];
  sinceritySaleRuns: readonly SinceritySaleRun[];
  negotiationProcesses: readonly NegotiationProcess[];
  events: readonly WorldDomainEvent[];
}

export type LegacyCaseMapper<T> = (caseItem: Case) => T;
export type LegacyOpportunityMapper<T> = (opportunity: Opportunity) => T;
export type LegacyCustomerMapper<T> = (customer: CustomerProfile) => T;
export type LegacyCompetitionMapper<T> = (group: CompetitionGroup) => T;
