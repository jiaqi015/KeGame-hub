// LegacyCaseField is derived from LegacyWorldCaseLike (the core contract for the
// legacy Case shape) instead of the domain Case aggregate, so core does not
// depend on domain. When Case gains a new field, LegacyWorldCaseLike must be
// updated to match — the compiler will then flag any missing ownership entry.
import type { LegacyWorldCaseLike } from './legacyWorldAdapterContracts.js';

export type LegacyCaseField = keyof LegacyWorldCaseLike;

export type LegacyCaseCanonicalOwner =
  | 'asset-case'
  | 'owner'
  | 'owner-case-relation'
  | 'broker-owner-relation'
  | 'evaluation-mirror'
  | 'process-mirror'
  | 'runtime-scratch'
  | 'projection-ui'
  | 'deprecated-legacy';

export type LegacyCaseFieldRole =
  | 'canonical-temporary'
  | 'compatibility-mirror'
  | 'future-migration';

export type LegacyCaseDomainFacet =
  | 'asset-profile'
  | 'asset-pricing'
  | 'owner-profile'
  | 'owner-decision'
  | 'broker-relationship'
  | 'evaluation'
  | 'lifecycle'
  | 'runtime'
  | 'projection'
  | 'legacy';

export interface LegacyCaseFieldOwnership {
  canonicalOwner: LegacyCaseCanonicalOwner;
  legacyRole: LegacyCaseFieldRole;
  domainFacet: LegacyCaseDomainFacet;
  targetOwner?: LegacyCaseCanonicalOwner;
  targetConcept?: string;
  migrationNote: string;
}

export type LegacyCaseFieldOwnershipEntry = LegacyCaseFieldOwnership & {
  field: LegacyCaseField;
};

export const LEGACY_CASE_FIELD_OWNERSHIP_REGISTRY: Readonly<
  Record<LegacyCaseField, LegacyCaseFieldOwnership>
> = {
  id: {
    canonicalOwner: 'asset-case',
    legacyRole: 'canonical-temporary',
    domainFacet: 'asset-profile',
    targetConcept: 'AssetCase.id / legacyCaseId',
    migrationNote: 'Legacy Case remains the source id while AssetCase is derived from it.',
  },
  housePrototypeId: {
    canonicalOwner: 'asset-case',
    legacyRole: 'canonical-temporary',
    domainFacet: 'asset-profile',
    targetConcept: 'AssetCase.housePrototypeId',
    migrationNote: 'Prototype identity is an asset profile fact.',
  },
  ownerArchetypeId: {
    canonicalOwner: 'owner',
    legacyRole: 'canonical-temporary',
    domainFacet: 'owner-profile',
    targetConcept: 'Owner.archetypeId',
    migrationNote: 'Keep on legacy Case until Owner is authored independently.',
  },
  title: {
    canonicalOwner: 'asset-case',
    legacyRole: 'canonical-temporary',
    domainFacet: 'asset-profile',
    targetConcept: 'AssetCase.title',
    migrationNote: 'House title is an asset profile fact.',
  },
  community: {
    canonicalOwner: 'asset-case',
    legacyRole: 'canonical-temporary',
    domainFacet: 'asset-profile',
    targetConcept: 'AssetCase.community',
    migrationNote: 'Community belongs to the asset profile and market placement.',
  },
  district: {
    canonicalOwner: 'asset-case',
    legacyRole: 'canonical-temporary',
    domainFacet: 'asset-profile',
    targetConcept: 'AssetCase.district',
    migrationNote: 'District is an asset location fact.',
  },
  layout: {
    canonicalOwner: 'asset-case',
    legacyRole: 'canonical-temporary',
    domainFacet: 'asset-profile',
    targetConcept: 'AssetCase.layout',
    migrationNote: 'Layout is an asset profile fact.',
  },
  area: {
    canonicalOwner: 'asset-case',
    legacyRole: 'canonical-temporary',
    domainFacet: 'asset-profile',
    targetConcept: 'AssetCase.area',
    migrationNote: 'Area is an asset profile fact.',
  },
  askPrice: {
    canonicalOwner: 'owner-case-relation',
    legacyRole: 'compatibility-mirror',
    domainFacet: 'asset-pricing',
    targetOwner: 'owner-case-relation',
    targetConcept: 'OwnerCaseRelation.askPrice / listing price',
    migrationNote: 'Current listing price is shaped by selling this asset for this owner.',
  },
  marketPrice: {
    canonicalOwner: 'evaluation-mirror',
    legacyRole: 'compatibility-mirror',
    domainFacet: 'asset-pricing',
    targetOwner: 'evaluation-mirror',
    targetConcept: 'PriceModelOutput.marketEstimatedPrice',
    migrationNote: 'Market price is a pricing model output mirror, not an intrinsic asset fact.',
  },
  bottomPrice: {
    canonicalOwner: 'owner-case-relation',
    legacyRole: 'compatibility-mirror',
    domainFacet: 'asset-pricing',
    targetOwner: 'owner-case-relation',
    targetConcept: 'OwnerCaseRelation.bottomPrice',
    migrationNote: 'Bottom price is the owner-case negotiation floor for this listing.',
  },
  patience: {
    canonicalOwner: 'owner-case-relation',
    legacyRole: 'compatibility-mirror',
    domainFacet: 'owner-decision',
    targetOwner: 'owner-case-relation',
    targetConcept: 'OwnerCaseRelation.patience',
    migrationNote: 'Patience is owner-side decision readiness. Read through relationReadProjection.readRelationReadiness() or readCaseRelationBundle().',
  },
  trust: {
    canonicalOwner: 'broker-owner-relation',
    legacyRole: 'compatibility-mirror',
    domainFacet: 'broker-relationship',
    targetOwner: 'broker-owner-relation',
    targetConcept: 'BrokerOwnerRelation.trust',
    migrationNote: 'Trust is between broker and owner, never an asset-case fact. Read through relationReadProjection.readRelationTrust() or readCaseRelationBundle().',
  },
  heat: {
    canonicalOwner: 'asset-case',
    legacyRole: 'canonical-temporary',
    domainFacet: 'asset-profile',
    targetConcept: 'AssetCase.heat',
    migrationNote: 'Heat is current asset runtime performance until a separate CaseRuntime exists.',
  },
  competitiveness: {
    canonicalOwner: 'evaluation-mirror',
    legacyRole: 'compatibility-mirror',
    domainFacet: 'evaluation',
    targetOwner: 'evaluation-mirror',
    targetConcept: 'AssetScoreSnapshot.score',
    migrationNote: 'Competitiveness mirrors the legacy asset score read model.',
  },
  d1: {
    canonicalOwner: 'evaluation-mirror',
    legacyRole: 'compatibility-mirror',
    domainFacet: 'evaluation',
    targetOwner: 'evaluation-mirror',
    targetConcept: 'AssetScoreSnapshot.dimensions.d1',
    migrationNote: 'D1 mirrors demand and funnel evaluation.',
  },
  d2: {
    canonicalOwner: 'evaluation-mirror',
    legacyRole: 'compatibility-mirror',
    domainFacet: 'evaluation',
    targetOwner: 'evaluation-mirror',
    targetConcept: 'AssetScoreSnapshot.dimensions.d2',
    migrationNote: 'D2 mirrors intrinsic asset quality evaluation.',
  },
  d3: {
    canonicalOwner: 'evaluation-mirror',
    legacyRole: 'compatibility-mirror',
    domainFacet: 'evaluation',
    targetOwner: 'evaluation-mirror',
    targetConcept: 'AssetScoreSnapshot.dimensions.d3',
    migrationNote: 'D3 is a legacy mixed evaluation mirror and still contains owner relation inputs.',
  },
  axisScores: {
    canonicalOwner: 'evaluation-mirror',
    legacyRole: 'compatibility-mirror',
    domainFacet: 'evaluation',
    targetOwner: 'evaluation-mirror',
    targetConcept: 'AssetScoreSnapshot.inputs.axisScores',
    migrationNote: 'Axis scores are evaluation inputs for D2, not mutable asset facts.',
  },
  urgency: {
    canonicalOwner: 'owner-case-relation',
    legacyRole: 'compatibility-mirror',
    domainFacet: 'owner-decision',
    targetOwner: 'owner-case-relation',
    targetConcept: 'OwnerDecisionReadiness',
    migrationNote: 'Urgency is owner-side decision pressure for this sale relation.',
  },
  windowDays: {
    canonicalOwner: 'owner-case-relation',
    legacyRole: 'compatibility-mirror',
    domainFacet: 'owner-decision',
    targetOwner: 'owner-case-relation',
    targetConcept: 'OwnerCaseRelation.windowDays',
    migrationNote: 'Sale window belongs to the owner-case relation and owner decision boundary.',
  },
  ownerName: {
    canonicalOwner: 'owner',
    legacyRole: 'canonical-temporary',
    domainFacet: 'owner-profile',
    targetConcept: 'Owner.name',
    migrationNote: 'Owner name stays on legacy Case until Owner is authored independently.',
  },
  ownerMood: {
    canonicalOwner: 'owner',
    legacyRole: 'canonical-temporary',
    domainFacet: 'owner-profile',
    targetConcept: 'Owner.mood / OwnerCaseRelation.ownerMood',
    migrationNote: 'Current legacy field feeds Owner and OwnerCaseRelation read models.',
  },
  maintainerName: {
    canonicalOwner: 'broker-owner-relation',
    legacyRole: 'future-migration',
    domainFacet: 'broker-relationship',
    targetOwner: 'broker-owner-relation',
    targetConcept: 'BrokerOwnerRelation.brokerId',
    migrationNote: 'Maintainer is a broker relation reference, not an asset field.',
  },
  marketCellId: {
    canonicalOwner: 'asset-case',
    legacyRole: 'canonical-temporary',
    domainFacet: 'asset-profile',
    targetConcept: 'AssetCase.marketCellId / Region.id',
    migrationNote: 'Market cell locates the asset in the world map.',
  },
  story: {
    canonicalOwner: 'asset-case',
    legacyRole: 'canonical-temporary',
    domainFacet: 'asset-profile',
    targetConcept: 'AssetCase.story',
    migrationNote: 'Story is authored asset profile context.',
  },
  tags: {
    canonicalOwner: 'asset-case',
    legacyRole: 'canonical-temporary',
    domainFacet: 'asset-profile',
    targetConcept: 'AssetCase.tags',
    migrationNote: 'Tags are asset profile descriptors.',
  },
  defects: {
    canonicalOwner: 'asset-case',
    legacyRole: 'canonical-temporary',
    domainFacet: 'asset-profile',
    targetConcept: 'AssetCase.defects',
    migrationNote: 'Defects are asset profile descriptors.',
  },
  status: {
    canonicalOwner: 'process-mirror',
    legacyRole: 'compatibility-mirror',
    domainFacet: 'lifecycle',
    targetOwner: 'process-mirror',
    targetConcept: 'ListingLifecycle.status',
    migrationNote: 'Status mirrors listing lifecycle state and is still copied into AssetCase.',
  },
  stageIndex: {
    canonicalOwner: 'process-mirror',
    legacyRole: 'compatibility-mirror',
    domainFacet: 'lifecycle',
    targetOwner: 'process-mirror',
    targetConcept: 'ListingLifecycle.stageIndex',
    migrationNote: 'Stage index is a process/lifecycle mirror, not house profile.',
  },
  stageLabel: {
    canonicalOwner: 'process-mirror',
    legacyRole: 'compatibility-mirror',
    domainFacet: 'lifecycle',
    targetOwner: 'process-mirror',
    targetConcept: 'ListingLifecycle.stageLabel',
    migrationNote: 'Stage label mirrors listing lifecycle presentation.',
  },
  riskFlags: {
    canonicalOwner: 'projection-ui',
    legacyRole: 'future-migration',
    domainFacet: 'projection',
    targetOwner: 'projection-ui',
    targetConcept: 'CaseDetailProjection.riskFlags',
    migrationNote: 'Risk flags are player-facing projection output and should not become world truth.',
  },
  actionsApplied: {
    canonicalOwner: 'runtime-scratch',
    legacyRole: 'future-migration',
    domainFacet: 'runtime',
    targetOwner: 'runtime-scratch',
    targetConcept: 'ActionLedger.appliedActionIds',
    migrationNote: 'Applied action ids should move to an action ledger or event stream.',
  },
  actionsToday: {
    canonicalOwner: 'runtime-scratch',
    legacyRole: 'future-migration',
    domainFacet: 'runtime',
    targetOwner: 'runtime-scratch',
    targetConcept: 'DailyActionBudget.caseUsage',
    migrationNote: 'Daily action counters are run scratch state.',
  },
  touchedToday: {
    canonicalOwner: 'runtime-scratch',
    legacyRole: 'future-migration',
    domainFacet: 'runtime',
    targetOwner: 'runtime-scratch',
    targetConcept: 'DailyTouchLedger.caseTouchedToday',
    migrationNote: 'Touch markers are day scratch state and should be recomputed or ledger-backed.',
  },
  touchedOwnerToday: {
    canonicalOwner: 'broker-owner-relation',
    legacyRole: 'compatibility-mirror',
    domainFacet: 'broker-relationship',
    targetOwner: 'broker-owner-relation',
    targetConcept: 'BrokerOwnerRelation.touchedOwnerToday',
    migrationNote: 'Owner touch state belongs to the broker-owner relation.',
  },
  lastTouchedDay: {
    canonicalOwner: 'runtime-scratch',
    legacyRole: 'future-migration',
    domainFacet: 'runtime',
    targetOwner: 'runtime-scratch',
    targetConcept: 'DailyTouchLedger.lastCaseTouchedDay',
    migrationNote: 'Case touch recency should be ledger-backed.',
  },
  lastOwnerTouchedDay: {
    canonicalOwner: 'broker-owner-relation',
    legacyRole: 'compatibility-mirror',
    domainFacet: 'broker-relationship',
    targetOwner: 'broker-owner-relation',
    targetConcept: 'BrokerOwnerRelation.lastOwnerTouchedDay',
    migrationNote: 'Owner touch recency belongs to the broker-owner relation.',
  },
  hasCompletedFirstVisit: {
    canonicalOwner: 'process-mirror',
    legacyRole: 'future-migration',
    domainFacet: 'lifecycle',
    targetOwner: 'process-mirror',
    targetConcept: 'ListingLifecycle.firstVisitCompleted',
    migrationNote: 'First visit completion is a lifecycle milestone.',
  },
  ownerProfilingMemory: {
    canonicalOwner: 'owner',
    legacyRole: 'future-migration',
    domainFacet: 'owner-profile',
    targetOwner: 'owner',
    targetConcept: 'OwnerProfilingMemory',
    migrationNote: 'First-visit profiling memory should eventually live on the owner memory model, but is persisted on legacy Case during migration.',
  },
  lastAction: {
    canonicalOwner: 'runtime-scratch',
    legacyRole: 'future-migration',
    domainFacet: 'runtime',
    targetOwner: 'runtime-scratch',
    targetConcept: 'ActionLedger.lastCaseAction',
    migrationNote: 'Last action should come from action/event history.',
  },
  lastPriceActionDay: {
    canonicalOwner: 'owner-case-relation',
    legacyRole: 'future-migration',
    domainFacet: 'asset-pricing',
    targetOwner: 'owner-case-relation',
    targetConcept: 'OwnerCaseRelation.lastPriceActionDay',
    migrationNote: 'Pricing action recency belongs with the sale relation.',
  },
  openDayCooldown: {
    canonicalOwner: 'process-mirror',
    legacyRole: 'future-migration',
    domainFacet: 'lifecycle',
    targetOwner: 'process-mirror',
    targetConcept: 'OpenDayProcess.cooldown',
    migrationNote: 'Open-day cooldown is process state.',
  },
  qualityStory: {
    canonicalOwner: 'deprecated-legacy',
    legacyRole: 'future-migration',
    domainFacet: 'legacy',
    targetOwner: 'evaluation-mirror',
    targetConcept: 'AssetScoreSnapshot.inputs.qualityNarrative',
    migrationNote: 'Legacy bonus flag should be replaced by evaluation inputs or events.',
  },
  negotiationBonus: {
    canonicalOwner: 'deprecated-legacy',
    legacyRole: 'future-migration',
    domainFacet: 'legacy',
    targetOwner: 'process-mirror',
    targetConcept: 'NegotiationProcess.bonusSignals',
    migrationNote: 'Legacy negotiation bonus should be replaced by negotiation process state.',
  },
  viewings: {
    canonicalOwner: 'process-mirror',
    legacyRole: 'compatibility-mirror',
    domainFacet: 'lifecycle',
    targetOwner: 'process-mirror',
    targetConcept: 'ListingLifecycle.viewings',
    migrationNote: 'Viewing count mirrors lifecycle/event-derived process facts.',
  },
  offers: {
    canonicalOwner: 'process-mirror',
    legacyRole: 'compatibility-mirror',
    domainFacet: 'lifecycle',
    targetOwner: 'process-mirror',
    targetConcept: 'ListingLifecycle.offers',
    migrationNote: 'Offer count mirrors lifecycle/event-derived process facts.',
  },
  soldPrice: {
    canonicalOwner: 'process-mirror',
    legacyRole: 'compatibility-mirror',
    domainFacet: 'lifecycle',
    targetOwner: 'process-mirror',
    targetConcept: 'ListingLifecycle.soldPrice',
    migrationNote: 'Sold price is a lifecycle result fact, not a live asset profile field.',
  },
  priceGapPct: {
    canonicalOwner: 'evaluation-mirror',
    legacyRole: 'compatibility-mirror',
    domainFacet: 'asset-pricing',
    targetOwner: 'evaluation-mirror',
    targetConcept: 'PriceModelOutput.priceGapToMarket',
    migrationNote: 'Price gap is a pricing model output mirror.',
  },
  competitivenessSnapshots: {
    canonicalOwner: 'evaluation-mirror',
    legacyRole: 'compatibility-mirror',
    domainFacet: 'evaluation',
    targetOwner: 'evaluation-mirror',
    targetConcept: 'AssetScoreSnapshot.history',
    migrationNote: 'Score snapshots are evaluation history.',
  },
  competitionGroupIds: {
    canonicalOwner: 'process-mirror',
    legacyRole: 'compatibility-mirror',
    domainFacet: 'lifecycle',
    targetOwner: 'process-mirror',
    targetConcept: 'CaseCompetitionRelation',
    migrationNote: 'Competition membership is relation state currently mirrored on Case.',
  },
  lastAskPrice: {
    canonicalOwner: 'owner-case-relation',
    legacyRole: 'future-migration',
    domainFacet: 'asset-pricing',
    targetOwner: 'owner-case-relation',
    targetConcept: 'OwnerCaseRelation.priceHistory',
    migrationNote: 'Previous asking price belongs in relation price history.',
  },
  lastRivalThreatDay: {
    canonicalOwner: 'process-mirror',
    legacyRole: 'future-migration',
    domainFacet: 'lifecycle',
    targetOwner: 'process-mirror',
    targetConcept: 'RivalPressureProcess.lastThreatDay',
    migrationNote: 'Rival threat recency is process/event-derived state.',
  },
  goalTier: {
    canonicalOwner: 'projection-ui',
    legacyRole: 'future-migration',
    domainFacet: 'projection',
    targetOwner: 'projection-ui',
    targetConcept: 'ScenarioGoalProjection.goalTier',
    migrationNote: 'Goal tier is run/scenario projection metadata for player-facing evaluation.',
  },
  storylineState: {
    canonicalOwner: 'projection-ui',
    legacyRole: 'future-migration',
    domainFacet: 'projection',
    targetOwner: 'projection-ui',
    targetConcept: 'CaseNarrativeProjection.storylineState',
    migrationNote: 'Storyline state is a derived narrative projection.',
  },
  relativeOutcome: {
    canonicalOwner: 'projection-ui',
    legacyRole: 'future-migration',
    domainFacet: 'projection',
    targetOwner: 'projection-ui',
    targetConcept: 'ResultProjection.relativeOutcome',
    migrationNote: 'Relative outcome is settlement projection output.',
  },
  ownerSatisfaction: {
    canonicalOwner: 'projection-ui',
    legacyRole: 'future-migration',
    domainFacet: 'projection',
    targetOwner: 'projection-ui',
    targetConcept: 'ResultProjection.ownerSatisfaction',
    migrationNote: 'Owner satisfaction is settlement/review projection output in the current legacy model.',
  },
  defenseOutcome: {
    canonicalOwner: 'projection-ui',
    legacyRole: 'future-migration',
    domainFacet: 'projection',
    targetOwner: 'projection-ui',
    targetConcept: 'ResultProjection.defenseOutcome',
    migrationNote: 'Defense outcome is settlement projection output.',
  },
  endingType: {
    canonicalOwner: 'projection-ui',
    legacyRole: 'future-migration',
    domainFacet: 'projection',
    targetOwner: 'projection-ui',
    targetConcept: 'ResultProjection.endingType',
    migrationNote: 'Ending type is result projection output.',
  },
  endingBucket: {
    canonicalOwner: 'projection-ui',
    legacyRole: 'future-migration',
    domainFacet: 'projection',
    targetOwner: 'projection-ui',
    targetConcept: 'ResultProjection.endingBucket',
    migrationNote: 'Ending bucket is result projection output.',
  },
  endingSummary: {
    canonicalOwner: 'projection-ui',
    legacyRole: 'future-migration',
    domainFacet: 'projection',
    targetOwner: 'projection-ui',
    targetConcept: 'ResultProjection.endingSummary',
    migrationNote: 'Ending summary is projection copy and should not drive world state.',
  },
  isFocused: {
    canonicalOwner: 'projection-ui',
    legacyRole: 'future-migration',
    domainFacet: 'projection',
    targetOwner: 'projection-ui',
    targetConcept: 'SessionViewport.focusedCaseIds',
    migrationNote: 'Focus is player viewport/session state.',
  },
  personality: {
    canonicalOwner: 'owner',
    legacyRole: 'canonical-temporary',
    domainFacet: 'owner-profile',
    targetConcept: 'Owner.personality',
    migrationNote: 'Owner personality stays on legacy Case until Owner is authored independently.',
  },
};

export const LEGACY_CASE_FIELD_OWNERSHIP_ENTRIES: readonly LegacyCaseFieldOwnershipEntry[] =
  Object.freeze(
    Object.entries(LEGACY_CASE_FIELD_OWNERSHIP_REGISTRY).map(([field, ownership]) =>
      Object.freeze({
        field: field as LegacyCaseField,
        ...ownership,
      })),
  );

export const LEGACY_CASE_COMPATIBILITY_MIRROR_FIELDS: readonly LegacyCaseField[] =
  Object.freeze(
    LEGACY_CASE_FIELD_OWNERSHIP_ENTRIES
      .filter((entry) => entry.legacyRole === 'compatibility-mirror')
      .map((entry) => entry.field),
  );

export function getLegacyCaseFieldOwnership(field: LegacyCaseField): LegacyCaseFieldOwnership {
  return LEGACY_CASE_FIELD_OWNERSHIP_REGISTRY[field];
}

export function getLegacyCaseFieldsByCanonicalOwner(
  owner: LegacyCaseCanonicalOwner,
): readonly LegacyCaseFieldOwnershipEntry[] {
  return LEGACY_CASE_FIELD_OWNERSHIP_ENTRIES.filter((entry) => entry.canonicalOwner === owner);
}
