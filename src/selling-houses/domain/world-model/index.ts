// ---------------------------------------------------------------------------
// world-model/index — barrel exports for MarketOpeningSnapshot + Causal Ledger
// ---------------------------------------------------------------------------

// --- MarketOpeningSnapshot layer (Agent A) ----------------------------------

export type {
  CityCyclePhase,
  MarketHeatDirection,
  CityCycleState,
  MarketCellHeatBand,
  MarketCellPriceTrend,
  MarketCellSignalStrength,
  MarketCellSnapshot,
  ACNNetworkRole,
  ACNNetworkSnapshot,
  ListingInventorySnapshot,
  DemandSegment,
  DemandPreferenceTag,
  DemandSegmentEntry,
  PriceBandEntry,
  CustomerDemandFieldSnapshot,
  BrokerStyle,
  NamedRivalBrokerSummary,
  BrokerStyleDistribution,
  BrokerNetworkSnapshot,
  RecentWorldEventType,
  RecentWorldEvent,
  MarketOpeningSnapshot,
} from './marketWorldTypes.js';

export type { MarketOpeningInput } from './seededMarketWorld.js';
export { createMarketOpeningSnapshot } from './seededMarketWorld.js';

export {
  readMarketOpeningSnapshot,
  assertMarketOpeningInvariants,
} from './marketOpening.js';

// --- Causal Events type family (Agent B) ------------------------------------

export type {
  WorldCausalEventKind,
  WorldCausalEventSource,
  WorldCausalEventBase,
  MarketHeatShiftedPayload,
  RivalListingRepricedPayload,
  RivalBrokerActionKind,
  RivalBrokerActionTakenPayload,
  CustomerComparedListingsPayload,
  CustomerAttentionShiftedPayload,
  OwnerMarketPressurePerceivedPayload,
  RecommendationKind,
  BrokerRecommendationChangedPayload,
  MatterPriorityChangedPayload,
  OpeningWorldEventImportedPayload,
  WorldCausalEvent,
  MarketHeatShifted,
  RivalListingRepriced,
  RivalBrokerActionTaken,
  CustomerComparedListings,
  CustomerAttentionShifted,
  OwnerMarketPressurePerceived,
  BrokerRecommendationChanged,
  MatterPriorityChanged,
  OpeningWorldEventImported,
} from './causalEvents.js';

export {
  buildMarketHeatShifted,
  buildRivalListingRepriced,
  buildRivalBrokerActionTaken,
  buildCustomerComparedListings,
  buildCustomerAttentionShifted,
  buildOwnerMarketPressurePerceived,
  buildBrokerRecommendationChanged,
  buildMatterPriorityChanged,
  buildOpeningWorldEventImported,
} from './causalEvents.js';

// --- Causal Ledger (Agent B) ------------------------------------------------

export type { WorldCausalLedger } from './causalLedger.js';

export {
  buildCausalLedger,
  appendToLedger,
  appendManyToLedger,
  getEventsByKind,
  getEventsByDay,
  getEventsAffecting,
  getEventById,
  getDirectCauses,
  getDirectEffects,
  traceCausalChainBackward,
  traceCausalChainForward,
  filterLedgerByDayRange,
  filterLedgerByKind,
  findDanglingCauseRefs,
  validateCausalChain,
  summarizeCausalChain,
} from './causalLedger.js';

// --- Causal Adapters (Agent B) ----------------------------------------------

export type {
  DomainEventLike,
  RivalListingRepriceInput,
  CompetitionPressureLike,
  MarketCellShiftInput,
  BrokerRecommendationInput,
  MatterPriorityInput,
} from './causalAdapters.js';

export {
  adaptOpeningRecentEvents,
  adaptDomainEventToCausal,
  adaptRivalListingReprice,
  adaptCompetitionPressureToOwnerPerception,
  adaptMarketCellHeatShift,
  adaptBrokerRecommendation,
  adaptMatterPriority,
  buildInitialCausalEventsFromOpening,
} from './causalAdapters.js';

// --- Causal Chain Examples (Agent B) -----------------------------------------

export type {
  RivalRepriceChainInput,
  RivalRepriceChainOutput,
  ChainVerificationResult,
} from './causalChainExamples.js';

export {
  buildRivalRepriceCausalChain,
  verifyRivalRepriceChain,
  buildAndVerifyRivalRepriceChain,
} from './causalChainExamples.js';

// --- Ecosystem Policy (Agent C) ---------------------------------------------

export type {
  AcnStyle,
  AcnBehaviorProfile,
  AcnNetwork,
} from './acnNetworks.js';

export {
  DEFAULT_ACN_NETWORKS,
  getAcnById,
  getAcnByStyle,
  acnCooperationCompatibility,
  acnInfoDelayDays,
} from './acnNetworks.js';

export type {
  BrokerVisibility,
  BrokerEntity,
  BrokerPopulationConfig,
} from './brokerPopulation.js';

export {
  DEFAULT_BROKER_POPULATION_CONFIG,
  generateBrokerPopulation,
  getNamedBrokers,
  getShadowBrokers,
  getBrokersByAcn,
  getBrokersByMarketCell,
  consumeBrokerEnergy,
  resetDailyBrokerEnergy,
} from './brokerPopulation.js';

export type {
  ListingPopulationLayer,
  ListingPopulationStatus,
  ListingPopulationEntity,
  HistoricalTransactionSummary,
  ListingPopulationConfig,
} from './listingPopulation.js';

export {
  DEFAULT_LISTING_POPULATION_CONFIG,
  computePriceBand,
  generateListingPopulation,
  getListingsByLayer,
  getActiveShadowListings,
  getActiveDirectRivalListings,
  getListingsByMarketCell,
  getListingsByPriceBand,
  tickListingPopulation,
} from './listingPopulation.js';

export type {
  CustomerPreferenceDimension,
  DemandEntityVisibility,
  DemandDecisionStyle,
  CustomerDemandEntity,
  DemandListingAttention,
  DemandFieldConfig,
} from './customerDemandField.js';

export {
  DEFAULT_DEMAND_FIELD_CONFIG,
  computeDemandFit,
  generateDemandField,
  tryAttentToListing,
  getActiveDemandEntities,
  getAttentionsForCustomer,
  getAttentionsForListing,
  resetDailyCustomerComparisonCounts,
  decayStaleAttentions,
} from './customerDemandField.js';

export type {
  ConservationCheckResult,
  ConservationRuleId,
  ConservationReport,
} from './ecosystemConservation.js';

export {
  checkCustomerAttentionConservation,
  checkBrokerEnergyConservation,
  checkDemandVolumeConservation,
  measureInformationDelay,
  measureOwnerPerceptionLag,
  measureDealScarcity,
  runConservationChecks,
} from './ecosystemConservation.js';

export type {
  EcosystemProposalKind,
  DailyEcosystemActionProposal,
  DailyEcosystemProposalBundle,
  EcosystemPolicyConfig,
  EcosystemPolicyInput,
} from './ecosystemPolicy.js';

export {
  DEFAULT_ECOSYSTEM_POLICY_CONFIG,
  generateDailyEcosystemProposals,
  getProposalsByKind,
  getProposalsByAcn,
} from './ecosystemPolicy.js';
