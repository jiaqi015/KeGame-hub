import type { ClosedDealRecord } from '../../domain/models.js';

export type LegacyClosedDealField = keyof ClosedDealRecord;

export type LegacyClosedDealCanonicalOwner =
  | 'contract-fact'
  | 'deal-price'
  | 'consensus-outcome'
  | 'market-snapshot'
  | 'deprecated-legacy';

export type LegacyClosedDealFieldRole =
  | 'canonical-temporary'
  | 'compatibility-mirror'
  | 'future-migration';

export type LegacyClosedDealDomainFacet =
  | 'identity'
  | 'price'
  | 'consensus'
  | 'market-fact'
  | 'legacy';

export interface LegacyClosedDealFieldOwnership {
  canonicalOwner: LegacyClosedDealCanonicalOwner;
  legacyRole: LegacyClosedDealFieldRole;
  domainFacet: LegacyClosedDealDomainFacet;
  targetConcept?: string;
  migrationNote: string;
}

export type LegacyClosedDealFieldOwnershipEntry = LegacyClosedDealFieldOwnership & {
  field: LegacyClosedDealField;
};

export const LEGACY_CLOSED_DEAL_FIELD_OWNERSHIP_REGISTRY: Readonly<
  Record<LegacyClosedDealField, LegacyClosedDealFieldOwnership>
> = {
  dealId: {
    canonicalOwner: 'contract-fact',
    legacyRole: 'canonical-temporary',
    domainFacet: 'identity',
    targetConcept: 'ContractFact.dealId',
    migrationNote: 'Deal id is the contract fact identity.',
  },
  caseId: {
    canonicalOwner: 'contract-fact',
    legacyRole: 'canonical-temporary',
    domainFacet: 'identity',
    targetConcept: 'ContractFact.assetCaseId',
    migrationNote: 'Case reference links the contract fact to the asset.',
  },
  customerId: {
    canonicalOwner: 'contract-fact',
    legacyRole: 'canonical-temporary',
    domainFacet: 'identity',
    targetConcept: 'ContractFact.customerId',
    migrationNote: 'Customer reference links the contract fact to the buyer.',
  },
  sourceRelationId: {
    canonicalOwner: 'contract-fact',
    legacyRole: 'canonical-temporary',
    domainFacet: 'identity',
    targetConcept: 'ContractFact.sourceOpportunityId / CustomerCaseMatch.id',
    migrationNote: 'Source relation links the contract fact back to the originating match/opportunity.',
  },
  opportunityId: {
    canonicalOwner: 'deprecated-legacy',
    legacyRole: 'compatibility-mirror',
    domainFacet: 'legacy',
    targetConcept: 'ContractFact.sourceOpportunityId',
    migrationNote: 'Legacy alias for sourceRelationId. Kept for older persisted saves.',
  },
  dayIndex: {
    canonicalOwner: 'contract-fact',
    legacyRole: 'canonical-temporary',
    domainFacet: 'identity',
    targetConcept: 'ContractFact.closeDay',
    migrationNote: 'Close day index is a contract fact timestamp.',
  },
  day: {
    canonicalOwner: 'deprecated-legacy',
    legacyRole: 'compatibility-mirror',
    domainFacet: 'legacy',
    targetConcept: 'ContractFact.closeDay',
    migrationNote: 'Legacy alias for dayIndex. Kept for older persisted saves.',
  },
  closedAt: {
    canonicalOwner: 'contract-fact',
    legacyRole: 'canonical-temporary',
    domainFacet: 'identity',
    targetConcept: 'ContractFact.closedAt',
    migrationNote: 'Close timestamp is a contract fact.',
  },
  dealType: {
    canonicalOwner: 'contract-fact',
    legacyRole: 'canonical-temporary',
    domainFacet: 'identity',
    targetConcept: 'ContractFact.dealType',
    migrationNote: 'Deal type is a contract classification fact.',
  },
  dealPrice: {
    canonicalOwner: 'deal-price',
    legacyRole: 'canonical-temporary',
    domainFacet: 'price',
    targetConcept: 'ContractFact.dealPrice / SellerPriceState.finalPrice',
    migrationNote: 'Deal price is the settled contract price — the primary price fact.',
  },
  price: {
    canonicalOwner: 'deprecated-legacy',
    legacyRole: 'compatibility-mirror',
    domainFacet: 'legacy',
    targetConcept: 'ContractFact.dealPrice',
    migrationNote: 'Legacy alias for dealPrice. Kept for older persisted saves.',
  },
  closeReadiness: {
    canonicalOwner: 'consensus-outcome',
    legacyRole: 'compatibility-mirror',
    domainFacet: 'consensus',
    targetConcept: 'ConsensusFormationReceipt.closeReadiness',
    migrationNote: 'Close readiness mirrors consensus formation outcome at time of deal.',
  },
  closeProbability: {
    canonicalOwner: 'consensus-outcome',
    legacyRole: 'compatibility-mirror',
    domainFacet: 'consensus',
    targetConcept: 'ConsensusFormationReceipt.closeProbability',
    migrationNote: 'Close probability mirrors consensus formation outcome at time of deal.',
  },
  blockingReasons: {
    canonicalOwner: 'consensus-outcome',
    legacyRole: 'compatibility-mirror',
    domainFacet: 'consensus',
    targetConcept: 'ConsensusFormationReceipt.blockers',
    migrationNote: 'Blocking reasons mirror consensus formation blockers at time of deal.',
  },
  supportingReasons: {
    canonicalOwner: 'consensus-outcome',
    legacyRole: 'compatibility-mirror',
    domainFacet: 'consensus',
    targetConcept: 'ConsensusFormationReceipt.supportingFactors',
    migrationNote: 'Supporting reasons mirror consensus formation supporting factors at time of deal.',
  },
  caseTitle: {
    canonicalOwner: 'deprecated-legacy',
    legacyRole: 'compatibility-mirror',
    domainFacet: 'legacy',
    targetConcept: 'AssetCase.title',
    migrationNote: 'Case title is denormalized for convenience. Canonical source is AssetCase.',
  },
  customerName: {
    canonicalOwner: 'deprecated-legacy',
    legacyRole: 'compatibility-mirror',
    domainFacet: 'legacy',
    targetConcept: 'Customer.name',
    migrationNote: 'Customer name is denormalized for convenience. Canonical source is Customer.',
  },
  ownerName: {
    canonicalOwner: 'deprecated-legacy',
    legacyRole: 'compatibility-mirror',
    domainFacet: 'legacy',
    targetConcept: 'Owner.name',
    migrationNote: 'Owner name is denormalized for convenience. Canonical source is Owner.',
  },
  maintainerName: {
    canonicalOwner: 'deprecated-legacy',
    legacyRole: 'compatibility-mirror',
    domainFacet: 'legacy',
    targetConcept: 'Broker.name',
    migrationNote: 'Maintainer name is denormalized for convenience. Canonical source is Broker.',
  },
  marketSnapshot: {
    canonicalOwner: 'market-snapshot',
    legacyRole: 'compatibility-mirror',
    domainFacet: 'market-fact',
    targetConcept: 'ContractFact.marketSnapshot / EvaluationMirror.dealSnapshot',
    migrationNote: 'Market snapshot captures market state at time of deal — a frozen evaluation fact.',
  },
  priceSnapshot: {
    canonicalOwner: 'deal-price',
    legacyRole: 'compatibility-mirror',
    domainFacet: 'price',
    targetConcept: 'ContractFact.priceSnapshot / SellerPriceState.dealSnapshot',
    migrationNote: 'Price snapshot captures price state at time of deal — a frozen pricing fact.',
  },
};

export const LEGACY_CLOSED_DEAL_FIELD_OWNERSHIP_ENTRIES: readonly LegacyClosedDealFieldOwnershipEntry[] =
  Object.freeze(
    Object.entries(LEGACY_CLOSED_DEAL_FIELD_OWNERSHIP_REGISTRY).map(([field, ownership]) =>
      Object.freeze({
        field: field as LegacyClosedDealField,
        ...ownership,
      })),
  );

export const LEGACY_CLOSED_DEAL_COMPATIBILITY_MIRROR_FIELDS: readonly LegacyClosedDealField[] =
  Object.freeze(
    LEGACY_CLOSED_DEAL_FIELD_OWNERSHIP_ENTRIES
      .filter((entry) => entry.legacyRole === 'compatibility-mirror')
      .map((entry) => entry.field),
  );

export function getLegacyClosedDealFieldOwnership(field: LegacyClosedDealField): LegacyClosedDealFieldOwnership {
  return LEGACY_CLOSED_DEAL_FIELD_OWNERSHIP_REGISTRY[field];
}

export function getLegacyClosedDealFieldsByCanonicalOwner(
  owner: LegacyClosedDealCanonicalOwner,
): readonly LegacyClosedDealFieldOwnershipEntry[] {
  return LEGACY_CLOSED_DEAL_FIELD_OWNERSHIP_ENTRIES.filter((entry) => entry.canonicalOwner === owner);
}
