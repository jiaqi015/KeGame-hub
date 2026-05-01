export type {
  AssetScoreDecisionMoment,
  AssetScoreDimensionDriver,
  AssetScoreSnapshot,
  D4ReceiptCoverageReport,
  D4SourceCategory,
  D4SourceCoverageEntry,
  EvaluationDimensionSnapshot,
  EvaluationInputs,
  EvaluationSnapshotBase,
  EvaluationSubjectKind,
  EvaluationSubjectRef,
  OpportunityScoreSnapshot,
  OwnerDecisionReadinessSnapshot,
  RegionOpenDayFitSnapshot,
  SellingHousesEvaluationSnapshot,
} from './models.js';

export {
  EVALUATION_MODEL_BOUNDARIES,
  getEvaluationModelBoundary,
} from './evaluation-model-boundaries.js';

export type {
  EvaluationBoundarySubjectKind,
  EvaluationModelBoundary,
  EvaluationModelForbiddenInputFacet,
  EvaluationModelId,
  EvaluationModelInputFacetBoundary,
  EvaluationModelLegacyMirrorField,
} from './evaluation-model-boundaries.js';

export {
  validateEvaluationSnapshotBoundary,
  validateEvaluationSnapshotsBoundaries,
} from './evaluation-boundary-guards.js';

export type {
  EvaluationBoundaryGuardStatus,
  EvaluationForbiddenInputHit,
  EvaluationLegacyMirrorHit,
  EvaluationSnapshotBoundaryReport,
} from './evaluation-boundary-guards.js';

export {
  buildAssetScoreSnapshotFromLegacyCase,
  buildAssetScoreSnapshotFromLegacyCaseWithCompetition,
  buildAssetScoreSnapshotFromLegacyCaseWithPressureReceipts,
  buildCaseEvaluationSnapshotsFromLegacyState,
  buildD4CompetitionServicePathDimension,
  buildD4ConfidenceFromCoverage,
  buildD4ReceiptCoverageReport,
  buildOpportunityEvaluationSnapshotsFromLegacyState,
  buildOpportunityScoreSnapshotFromLegacyOpportunity,
  buildOwnerDecisionReadinessSnapshotFromLegacyCase,
  buildRegionOpenDayFitSnapshotFromLegacyState,
  findCompetitionPressureSnapshotForCase,
} from './legacyAdapters.js';

export * from './score-separation/index.js';

export {
  compareAllActiveCases,
  compareLegacyFieldsToOwnerReadinessSnapshot,
  compareLegacyScoresToAssetSnapshot,
} from './comparison-helpers.js';

export type {
  AssetScoreComparison,
  LegacyDimensionMapping,
  OwnerReadinessComparison,
} from './comparison-helpers.js';
