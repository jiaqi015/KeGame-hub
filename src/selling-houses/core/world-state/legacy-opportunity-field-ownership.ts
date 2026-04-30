import type { Opportunity } from '../../domain/models.js';

export type LegacyOpportunityField = keyof Opportunity;

export type LegacyOpportunityCanonicalOwner =
  | 'customer-case-match'
  | 'customer-profile'
  | 'channel'
  | 'match-evaluation'
  | 'broker-opportunity-relation'
  | 'opportunity-lifecycle'
  | 'runtime-scratch'
  | 'closing-evaluation'
  | 'deprecated-legacy';

export type LegacyOpportunityFieldRole =
  | 'canonical-temporary'
  | 'compatibility-mirror'
  | 'future-migration';

export type LegacyOpportunityDomainFacet =
  | 'identity'
  | 'customer-profile'
  | 'channel'
  | 'match-quality'
  | 'lifecycle'
  | 'broker-relation'
  | 'runtime'
  | 'closing'
  | 'legacy';

export interface LegacyOpportunityFieldOwnership {
  canonicalOwner: LegacyOpportunityCanonicalOwner;
  legacyRole: LegacyOpportunityFieldRole;
  domainFacet: LegacyOpportunityDomainFacet;
  targetConcept?: string;
  migrationNote: string;
}

export type LegacyOpportunityFieldOwnershipEntry = LegacyOpportunityFieldOwnership & {
  field: LegacyOpportunityField;
};

export const LEGACY_OPPORTUNITY_FIELD_OWNERSHIP_REGISTRY: Readonly<
  Record<LegacyOpportunityField, LegacyOpportunityFieldOwnership>
> = {
  id: {
    canonicalOwner: 'customer-case-match',
    legacyRole: 'canonical-temporary',
    domainFacet: 'identity',
    targetConcept: 'CustomerCaseOpportunity.id',
    migrationNote: 'Opportunity id is the match identity. Remains canonical until CustomerCaseMatch is authored.',
  },
  caseId: {
    canonicalOwner: 'customer-case-match',
    legacyRole: 'canonical-temporary',
    domainFacet: 'identity',
    targetConcept: 'CustomerCaseMatch.assetCaseId / CustomerCaseOpportunity.caseId',
    migrationNote: 'Case reference is the asset side of the customer-case match relation.',
  },
  customerId: {
    canonicalOwner: 'customer-case-match',
    legacyRole: 'canonical-temporary',
    domainFacet: 'identity',
    targetConcept: 'CustomerCaseMatch.customerId / CustomerCaseOpportunity.customerId',
    migrationNote: 'Customer reference is the demand side of the customer-case match relation.',
  },
  customerName: {
    canonicalOwner: 'customer-profile',
    legacyRole: 'compatibility-mirror',
    domainFacet: 'customer-profile',
    targetConcept: 'Customer.name',
    migrationNote: 'Customer name is a profile fact, not part of the match relation itself.',
  },
  profile: {
    canonicalOwner: 'customer-profile',
    legacyRole: 'compatibility-mirror',
    domainFacet: 'customer-profile',
    targetConcept: 'Customer.profile',
    migrationNote: 'Customer profile summary is a customer fact mirrored onto the opportunity for convenience.',
  },
  channelId: {
    canonicalOwner: 'channel',
    legacyRole: 'canonical-temporary',
    domainFacet: 'channel',
    targetConcept: 'CustomerCaseMatch.channelId',
    migrationNote: 'Channel is part of the match formation — how this customer found this case.',
  },
  channelName: {
    canonicalOwner: 'channel',
    legacyRole: 'compatibility-mirror',
    domainFacet: 'channel',
    targetConcept: 'Channel.name',
    migrationNote: 'Channel name is a display mirror of the channel entity.',
  },
  fit: {
    canonicalOwner: 'match-evaluation',
    legacyRole: 'compatibility-mirror',
    domainFacet: 'match-quality',
    targetConcept: 'CustomerCaseMatch.fitScore / MatchEvaluation.fit',
    migrationNote: 'Fit is a match evaluation output — how well this customer suits this case.',
  },
  intent: {
    canonicalOwner: 'match-evaluation',
    legacyRole: 'compatibility-mirror',
    domainFacet: 'match-quality',
    targetConcept: 'CustomerCaseMatch.intentScore / MatchEvaluation.intent',
    migrationNote: 'Intent is a match evaluation output — how actively the customer wants this case.',
  },
  confidence: {
    canonicalOwner: 'match-evaluation',
    legacyRole: 'compatibility-mirror',
    domainFacet: 'match-quality',
    targetConcept: 'MatchEvaluation.confidence',
    migrationNote: 'Confidence is a match evaluation output — certainty of the fit/intent assessment.',
  },
  stageIndex: {
    canonicalOwner: 'opportunity-lifecycle',
    legacyRole: 'compatibility-mirror',
    domainFacet: 'lifecycle',
    targetConcept: 'OfferThread.stageIndex / NegotiationProcess.stageIndex',
    migrationNote: 'Stage index mirrors negotiation/offer thread progression.',
  },
  stageLabel: {
    canonicalOwner: 'opportunity-lifecycle',
    legacyRole: 'compatibility-mirror',
    domainFacet: 'lifecycle',
    targetConcept: 'OfferThread.stageLabel',
    migrationNote: 'Stage label is a lifecycle display mirror.',
  },
  status: {
    canonicalOwner: 'opportunity-lifecycle',
    legacyRole: 'compatibility-mirror',
    domainFacet: 'lifecycle',
    targetConcept: 'OfferThread.status / CustomerCaseMatch.status',
    migrationNote: 'Status mirrors match/offer thread lifecycle state.',
  },
  lifecycleStatus: {
    canonicalOwner: 'opportunity-lifecycle',
    legacyRole: 'compatibility-mirror',
    domainFacet: 'lifecycle',
    targetConcept: 'OfferThread.lifecycleStatus',
    migrationNote: 'Lifecycle status is a more granular lifecycle mirror for stagnation/loss tracking.',
  },
  leadSource: {
    canonicalOwner: 'customer-case-match',
    legacyRole: 'canonical-temporary',
    domainFacet: 'identity',
    targetConcept: 'CustomerCaseMatch.leadSource',
    migrationNote: 'Lead source (direct vs broker) is part of match formation context.',
  },
  visibility: {
    canonicalOwner: 'broker-opportunity-relation',
    legacyRole: 'compatibility-mirror',
    domainFacet: 'broker-relation',
    targetConcept: 'BrokeredOpportunity.visibility',
    migrationNote: 'Visibility (shadow vs revealed) is broker-side opportunity state.',
  },
  brokerName: {
    canonicalOwner: 'broker-opportunity-relation',
    legacyRole: 'compatibility-mirror',
    domainFacet: 'broker-relation',
    targetConcept: 'BrokeredOpportunity.brokerId / Broker.name',
    migrationNote: 'Broker reference is part of the broker-opportunity relation.',
  },
  createdDay: {
    canonicalOwner: 'opportunity-lifecycle',
    legacyRole: 'canonical-temporary',
    domainFacet: 'lifecycle',
    targetConcept: 'CustomerCaseMatch.createdAtDay',
    migrationNote: 'Creation day is a lifecycle fact — when this match was formed.',
  },
  daysLeft: {
    canonicalOwner: 'opportunity-lifecycle',
    legacyRole: 'compatibility-mirror',
    domainFacet: 'lifecycle',
    targetConcept: 'OfferThread.daysRemaining',
    migrationNote: 'Days left mirrors offer thread countdown state.',
  },
  touchedToday: {
    canonicalOwner: 'runtime-scratch',
    legacyRole: 'future-migration',
    domainFacet: 'runtime',
    targetConcept: 'DailyTouchLedger.opportunityTouchedToday',
    migrationNote: 'Daily touch marker is run scratch state and should be ledger-backed.',
  },
  budgetMax: {
    canonicalOwner: 'customer-profile',
    legacyRole: 'compatibility-mirror',
    domainFacet: 'customer-profile',
    targetConcept: 'Customer.budgetMax / BuyerPriceState.budgetCeiling',
    migrationNote: 'Budget is a customer profile/fact and buyer price state input.',
  },
  priceSensitivity: {
    canonicalOwner: 'customer-profile',
    legacyRole: 'compatibility-mirror',
    domainFacet: 'customer-profile',
    targetConcept: 'Customer.priceSensitivity / BuyerPriceState.sensitivity',
    migrationNote: 'Price sensitivity is a customer profile fact and buyer price state input.',
  },
  stagnationTicks: {
    canonicalOwner: 'opportunity-lifecycle',
    legacyRole: 'compatibility-mirror',
    domainFacet: 'lifecycle',
    targetConcept: 'OfferThread.stagnationTicks',
    migrationNote: 'Stagnation ticks mirror offer thread inactivity tracking.',
  },
  pendingClosingEvaluation: {
    canonicalOwner: 'closing-evaluation',
    legacyRole: 'future-migration',
    domainFacet: 'closing',
    targetConcept: 'ConsensusFormation.pendingEvaluation',
    migrationNote: 'Pending closing evaluation flag is consensus formation process state.',
  },
  pendingClosingStrategyId: {
    canonicalOwner: 'closing-evaluation',
    legacyRole: 'future-migration',
    domainFacet: 'closing',
    targetConcept: 'ConsensusFormation.pendingStrategyId',
    migrationNote: 'Pending strategy id is consensus formation process state.',
  },
  pendingClosingRequestedDay: {
    canonicalOwner: 'closing-evaluation',
    legacyRole: 'future-migration',
    domainFacet: 'closing',
    targetConcept: 'ConsensusFormation.pendingRequestedDay',
    migrationNote: 'Pending requested day is consensus formation process state.',
  },
  history: {
    canonicalOwner: 'opportunity-lifecycle',
    legacyRole: 'future-migration',
    domainFacet: 'lifecycle',
    targetConcept: 'OfferThread.stageHistory / event stream',
    migrationNote: 'Stage history should be derived from event stream or offer thread log.',
  },
};

export const LEGACY_OPPORTUNITY_FIELD_OWNERSHIP_ENTRIES: readonly LegacyOpportunityFieldOwnershipEntry[] =
  Object.freeze(
    Object.entries(LEGACY_OPPORTUNITY_FIELD_OWNERSHIP_REGISTRY).map(([field, ownership]) =>
      Object.freeze({
        field: field as LegacyOpportunityField,
        ...ownership,
      })),
  );

export const LEGACY_OPPORTUNITY_COMPATIBILITY_MIRROR_FIELDS: readonly LegacyOpportunityField[] =
  Object.freeze(
    LEGACY_OPPORTUNITY_FIELD_OWNERSHIP_ENTRIES
      .filter((entry) => entry.legacyRole === 'compatibility-mirror')
      .map((entry) => entry.field),
  );

export function getLegacyOpportunityFieldOwnership(field: LegacyOpportunityField): LegacyOpportunityFieldOwnership {
  return LEGACY_OPPORTUNITY_FIELD_OWNERSHIP_REGISTRY[field];
}

export function getLegacyOpportunityFieldsByCanonicalOwner(
  owner: LegacyOpportunityCanonicalOwner,
): readonly LegacyOpportunityFieldOwnershipEntry[] {
  return LEGACY_OPPORTUNITY_FIELD_OWNERSHIP_ENTRIES.filter((entry) => entry.canonicalOwner === owner);
}
