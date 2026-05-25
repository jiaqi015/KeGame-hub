export * from './adapters.js';
export * from './attention/index.js';
export * from './consensus/index.js';
export * from './interactions/index.js';
export * from './processes/index.js';
export * from './semantic-receipt/index.js';
export * from './strategy/index.js';
export * from './trustWriteSource.js';
export * from './ownerCaseReadinessWriteSource.js';
export * from './legacy-case-field-ownership.js';
export * from './legacy-case-migration-plan.js';
export * from './legacy-case-owned-read-models.js';
export * from './legacy-case-segments.js';
export * from './legacy-closed-deal-field-ownership.js';
export * from './legacy-customer-runtime-field-ownership.js';
export * from './legacy-gamestate-field-ownership.js';
export * from './legacy-opportunity-field-ownership.js';
export * from './models.js';
export * from './legacyCompatibilityContracts.js';
export * from './legacyCompatibilityValidation.js';
export * from './caseOutcomeTypes.js';
export * from './caseOutcomeProjection.js';
export { buildCustomerCaseOpportunityRelationView } from './opportunity-relations/readModel.js';
export { buildCustomerCaseOpportunityRelationV0View } from './opportunity-relations/v0ReadModel.js';
export type {
  CustomerCaseOpportunityRelationSource,
  CustomerCaseOpportunityRelationConflictFlags,
  CustomerRuntimeCaseRelationMetadata,
  CanonicalOpportunityRelationMetadata,
  LegacyOpportunityRelationMetadata,
  CustomerCaseOpportunityRelationView,
  CustomerCaseOpportunityRelationBuildOptions,
  CustomerCaseRuntimeEntry,
} from './opportunity-relations/types.js';
// LegacyOpportunityShape from v0ReadModel is intentionally NOT re-exported
// to avoid collision with consensus/legacyAdapter.LegacyOpportunityShape.
