import type { LegacyCaseLike } from './legacyCaseContracts.js';
import type { LegacyCaseCanonicalOwner } from './legacy-case-field-ownership.js';
import {
  deriveLegacyCaseSegments,
  type LegacyCaseFieldSegment,
} from './legacy-case-segments.js';

export type LegacyCaseOwnedReadModelSource = 'legacy-case-segments';

export interface LegacyCaseOwnedReadModel {
  readonly source: LegacyCaseOwnedReadModelSource;
  readonly canonicalOwner: LegacyCaseCanonicalOwner;
  readonly legacyCaseId: string;
  readonly fields: LegacyCaseFieldSegment;
  readonly fieldCount: number;
  readonly compatibilityMirrorCount: number;
  readonly futureMigrationCount: number;
}

export interface LegacyAssetCaseReadModel extends LegacyCaseOwnedReadModel {
  readonly canonicalOwner: 'asset-case';
}

export interface LegacyOwnerReadModel extends LegacyCaseOwnedReadModel {
  readonly canonicalOwner: 'owner';
}

export interface LegacyOwnerCaseRelationReadModel extends LegacyCaseOwnedReadModel {
  readonly canonicalOwner: 'owner-case-relation';
}

export interface LegacyBrokerOwnerRelationReadModel extends LegacyCaseOwnedReadModel {
  readonly canonicalOwner: 'broker-owner-relation';
}

export interface LegacyCaseEvaluationMirrorReadModel extends LegacyCaseOwnedReadModel {
  readonly canonicalOwner: 'evaluation-mirror';
}

export interface LegacyCaseProcessMirrorReadModel extends LegacyCaseOwnedReadModel {
  readonly canonicalOwner: 'process-mirror';
}

export interface LegacyCaseRuntimeScratchReadModel extends LegacyCaseOwnedReadModel {
  readonly canonicalOwner: 'runtime-scratch';
}

export interface LegacyCaseProjectionUiReadModel extends LegacyCaseOwnedReadModel {
  readonly canonicalOwner: 'projection-ui';
}

export interface LegacyCaseDeprecatedLegacyReadModel extends LegacyCaseOwnedReadModel {
  readonly canonicalOwner: 'deprecated-legacy';
}

export interface LegacyCaseOwnedReadModels {
  readonly source: LegacyCaseOwnedReadModelSource;
  readonly legacyCaseId: string;
  readonly assetCase: LegacyAssetCaseReadModel;
  readonly owner: LegacyOwnerReadModel;
  readonly ownerCaseRelation: LegacyOwnerCaseRelationReadModel;
  readonly brokerOwnerRelation: LegacyBrokerOwnerRelationReadModel;
  readonly evaluationMirror: LegacyCaseEvaluationMirrorReadModel;
  readonly processMirror: LegacyCaseProcessMirrorReadModel;
  readonly runtimeScratch: LegacyCaseRuntimeScratchReadModel;
  readonly projectionUi: LegacyCaseProjectionUiReadModel;
  readonly deprecatedLegacy: LegacyCaseDeprecatedLegacyReadModel;
}

export interface LegacyCaseOwnedReadModelSummaryEntry {
  readonly fieldCount: number;
  readonly compatibilityMirrorCount: number;
  readonly futureMigrationCount: number;
}

export interface LegacyCaseOwnedReadModelSummary {
  readonly source: LegacyCaseOwnedReadModelSource;
  readonly legacyCaseId: string;
  readonly assetCase: LegacyCaseOwnedReadModelSummaryEntry;
  readonly owner: LegacyCaseOwnedReadModelSummaryEntry;
  readonly ownerCaseRelation: LegacyCaseOwnedReadModelSummaryEntry;
  readonly brokerOwnerRelation: LegacyCaseOwnedReadModelSummaryEntry;
  readonly evaluationMirror: LegacyCaseOwnedReadModelSummaryEntry;
  readonly processMirror: LegacyCaseOwnedReadModelSummaryEntry;
  readonly runtimeScratch: LegacyCaseOwnedReadModelSummaryEntry;
  readonly projectionUi: LegacyCaseOwnedReadModelSummaryEntry;
  readonly deprecatedLegacy: LegacyCaseOwnedReadModelSummaryEntry;
  readonly totalFieldCount: number;
  readonly compatibilityMirrorCount: number;
  readonly futureMigrationCount: number;
}

function countFieldsByRole(
  fields: LegacyCaseFieldSegment,
  legacyRole: 'compatibility-mirror' | 'future-migration',
) {
  return Object.values(fields).filter((entry) => entry.metadata.legacyRole === legacyRole).length;
}

function summarizeFields(fields: LegacyCaseFieldSegment): LegacyCaseOwnedReadModelSummaryEntry {
  return Object.freeze({
    fieldCount: Object.values(fields).length,
    compatibilityMirrorCount: countFieldsByRole(fields, 'compatibility-mirror'),
    futureMigrationCount: countFieldsByRole(fields, 'future-migration'),
  });
}

function buildReadModel<CanonicalOwner extends LegacyCaseCanonicalOwner>(
  legacyCaseId: string,
  canonicalOwner: CanonicalOwner,
  fields: LegacyCaseFieldSegment,
): LegacyCaseOwnedReadModel & { readonly canonicalOwner: CanonicalOwner } {
  return Object.freeze({
    source: 'legacy-case-segments',
    canonicalOwner,
    legacyCaseId,
    fields,
    ...summarizeFields(fields),
  });
}

function summarizeReadModel(readModel: LegacyCaseOwnedReadModel): LegacyCaseOwnedReadModelSummaryEntry {
  return Object.freeze({
    fieldCount: readModel.fieldCount,
    compatibilityMirrorCount: readModel.compatibilityMirrorCount,
    futureMigrationCount: readModel.futureMigrationCount,
  });
}

export function deriveLegacyCaseOwnedReadModels(caseItem: LegacyCaseLike): LegacyCaseOwnedReadModels {
  const segments = deriveLegacyCaseSegments(caseItem);
  const assetCase = buildReadModel(caseItem.id, 'asset-case', segments.assetCaseFields);
  const owner = buildReadModel(caseItem.id, 'owner', segments.ownerFields);
  const ownerCaseRelation = buildReadModel(caseItem.id, 'owner-case-relation', segments.ownerCaseRelationFields);
  const brokerOwnerRelation = buildReadModel(caseItem.id, 'broker-owner-relation', segments.brokerOwnerRelationFields);
  const evaluationMirror = buildReadModel(caseItem.id, 'evaluation-mirror', segments.evaluationMirrorFields);
  const processMirror = buildReadModel(caseItem.id, 'process-mirror', segments.processMirrorFields);
  const runtimeScratch = buildReadModel(caseItem.id, 'runtime-scratch', segments.runtimeScratchFields);
  const projectionUi = buildReadModel(caseItem.id, 'projection-ui', segments.projectionUiFields);
  const deprecatedLegacy = buildReadModel(caseItem.id, 'deprecated-legacy', segments.deprecatedLegacyFields);

  return Object.freeze({
    source: 'legacy-case-segments',
    legacyCaseId: caseItem.id,
    assetCase,
    owner,
    ownerCaseRelation,
    brokerOwnerRelation,
    evaluationMirror,
    processMirror,
    runtimeScratch,
    projectionUi,
    deprecatedLegacy,
  });
}

export function deriveLegacyCaseOwnedReadModelSummary(
  caseItem: LegacyCaseLike,
): LegacyCaseOwnedReadModelSummary {
  const readModels = deriveLegacyCaseOwnedReadModels(caseItem);
  const summaryEntries = {
    assetCase: summarizeReadModel(readModels.assetCase),
    owner: summarizeReadModel(readModels.owner),
    ownerCaseRelation: summarizeReadModel(readModels.ownerCaseRelation),
    brokerOwnerRelation: summarizeReadModel(readModels.brokerOwnerRelation),
    evaluationMirror: summarizeReadModel(readModels.evaluationMirror),
    processMirror: summarizeReadModel(readModels.processMirror),
    runtimeScratch: summarizeReadModel(readModels.runtimeScratch),
    projectionUi: summarizeReadModel(readModels.projectionUi),
    deprecatedLegacy: summarizeReadModel(readModels.deprecatedLegacy),
  };
  const allSummaries = Object.values(summaryEntries);

  return Object.freeze({
    source: 'legacy-case-segments',
    legacyCaseId: caseItem.id,
    ...summaryEntries,
    totalFieldCount: allSummaries.reduce((sum, entry) => sum + entry.fieldCount, 0),
    compatibilityMirrorCount: allSummaries.reduce(
      (sum, entry) => sum + entry.compatibilityMirrorCount,
      0,
    ),
    futureMigrationCount: allSummaries.reduce((sum, entry) => sum + entry.futureMigrationCount, 0),
  });
}
