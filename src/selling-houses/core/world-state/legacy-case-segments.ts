import type { LegacyCaseLike } from './legacyCaseContracts.js';
import {
  LEGACY_CASE_FIELD_OWNERSHIP_ENTRIES,
  type LegacyCaseCanonicalOwner,
  type LegacyCaseField,
  type LegacyCaseFieldOwnershipEntry,
  type LegacyCaseFieldRole,
} from './legacy-case-field-ownership.js';
import { deepFreeze, type DeepReadonly } from '../util/deepFreeze.js';

/** @deprecated Use DeepReadonly<T> from core/util/deepFreeze.js instead */
export type LegacyCaseReadonlyDeep<T> = DeepReadonly<T>;

export const LEGACY_CASE_SEGMENT_KEYS = [
  'assetCaseFields',
  'ownerFields',
  'ownerCaseRelationFields',
  'brokerOwnerRelationFields',
  'evaluationMirrorFields',
  'processMirrorFields',
  'runtimeScratchFields',
  'projectionUiFields',
  'deprecatedLegacyFields',
] as const;

export type LegacyCaseSegmentKey = typeof LEGACY_CASE_SEGMENT_KEYS[number];

export interface LegacyCaseSegmentMetadata {
  canonicalOwner: LegacyCaseCanonicalOwner;
  legacyRole: LegacyCaseFieldRole;
  targetConcept: string | undefined;
}

export interface LegacyCaseSegmentField<Field extends LegacyCaseField = LegacyCaseField> {
  field: Field;
  value: unknown;
  metadata: Readonly<LegacyCaseSegmentMetadata>;
}

export type LegacyCaseFieldSegment = Readonly<Partial<{
  [Field in LegacyCaseField]: LegacyCaseSegmentField<Field>;
}>>;

export interface LegacyCaseSegments {
  assetCaseFields: LegacyCaseFieldSegment;
  ownerFields: LegacyCaseFieldSegment;
  ownerCaseRelationFields: LegacyCaseFieldSegment;
  brokerOwnerRelationFields: LegacyCaseFieldSegment;
  evaluationMirrorFields: LegacyCaseFieldSegment;
  processMirrorFields: LegacyCaseFieldSegment;
  runtimeScratchFields: LegacyCaseFieldSegment;
  projectionUiFields: LegacyCaseFieldSegment;
  deprecatedLegacyFields: LegacyCaseFieldSegment;
}

export interface LegacyCaseSegmentSummaryEntry {
  fieldCount: number;
  compatibilityMirrorCount: number;
  futureMigrationCount: number;
}

export type LegacyCaseSegmentSummary = {
  readonly [Key in LegacyCaseSegmentKey]: LegacyCaseSegmentSummaryEntry;
} & {
  readonly totalFieldCount: number;
  readonly compatibilityMirrorCount: number;
  readonly futureMigrationCount: number;
};

const LEGACY_CASE_OWNER_TO_SEGMENT_KEY: Readonly<Record<LegacyCaseCanonicalOwner, LegacyCaseSegmentKey>> = Object.freeze({
  'asset-case': 'assetCaseFields',
  owner: 'ownerFields',
  'owner-case-relation': 'ownerCaseRelationFields',
  'broker-owner-relation': 'brokerOwnerRelationFields',
  'evaluation-mirror': 'evaluationMirrorFields',
  'process-mirror': 'processMirrorFields',
  'runtime-scratch': 'runtimeScratchFields',
  'projection-ui': 'projectionUiFields',
  'deprecated-legacy': 'deprecatedLegacyFields',
});

function createEmptySegments(): Record<LegacyCaseSegmentKey, Record<string, LegacyCaseSegmentField>> {
  return {
    assetCaseFields: {},
    ownerFields: {},
    ownerCaseRelationFields: {},
    brokerOwnerRelationFields: {},
    evaluationMirrorFields: {},
    processMirrorFields: {},
    runtimeScratchFields: {},
    projectionUiFields: {},
    deprecatedLegacyFields: {},
  };
}

function clonePlainValue<T>(value: T): T {
  if (!value || typeof value !== 'object') {
    return value;
  }

  if (typeof structuredClone === 'function') {
    return structuredClone(value);
  }

  if (Array.isArray(value)) {
    return value.map((entry) => clonePlainValue(entry)) as T;
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, nested]) => [key, clonePlainValue(nested)]),
  ) as T;
}

function cloneReadonlyValue<T>(value: T): DeepReadonly<T> {
  return deepFreeze(clonePlainValue(value));
}

function buildSegmentField<Field extends LegacyCaseField>(
  caseItem: LegacyCaseLike,
  entry: LegacyCaseFieldOwnershipEntry & { field: Field },
): LegacyCaseSegmentField<Field> {
  return Object.freeze({
    field: entry.field,
    value: cloneReadonlyValue((caseItem as Record<string, unknown>)[entry.field]),
    metadata: Object.freeze({
      canonicalOwner: entry.canonicalOwner,
      legacyRole: entry.legacyRole,
      targetConcept: entry.targetConcept,
    }),
  });
}

function countLegacyRole(
  fields: readonly LegacyCaseSegmentField[],
  legacyRole: LegacyCaseFieldRole,
) {
  return fields.filter((entry) => entry.metadata.legacyRole === legacyRole).length;
}

function summarizeSegment(segment: LegacyCaseFieldSegment): LegacyCaseSegmentSummaryEntry {
  const fields = Object.values(segment);
  return Object.freeze({
    fieldCount: fields.length,
    compatibilityMirrorCount: countLegacyRole(fields, 'compatibility-mirror'),
    futureMigrationCount: countLegacyRole(fields, 'future-migration'),
  });
}

export function getLegacyCaseSegmentKeyForCanonicalOwner(
  owner: LegacyCaseCanonicalOwner,
): LegacyCaseSegmentKey {
  return LEGACY_CASE_OWNER_TO_SEGMENT_KEY[owner];
}

export function deriveLegacyCaseSegments(caseItem: LegacyCaseLike): Readonly<LegacyCaseSegments> {
  const mutableSegments = createEmptySegments();

  for (const entry of LEGACY_CASE_FIELD_OWNERSHIP_ENTRIES) {
    const segmentKey = getLegacyCaseSegmentKeyForCanonicalOwner(entry.canonicalOwner);
    mutableSegments[segmentKey][entry.field] = buildSegmentField(caseItem, entry);
  }

  const segments: LegacyCaseSegments = {
    assetCaseFields: Object.freeze(mutableSegments.assetCaseFields),
    ownerFields: Object.freeze(mutableSegments.ownerFields),
    ownerCaseRelationFields: Object.freeze(mutableSegments.ownerCaseRelationFields),
    brokerOwnerRelationFields: Object.freeze(mutableSegments.brokerOwnerRelationFields),
    evaluationMirrorFields: Object.freeze(mutableSegments.evaluationMirrorFields),
    processMirrorFields: Object.freeze(mutableSegments.processMirrorFields),
    runtimeScratchFields: Object.freeze(mutableSegments.runtimeScratchFields),
    projectionUiFields: Object.freeze(mutableSegments.projectionUiFields),
    deprecatedLegacyFields: Object.freeze(mutableSegments.deprecatedLegacyFields),
  };

  return Object.freeze(segments);
}

export function deriveLegacyCaseSegmentSummary(caseItem: LegacyCaseLike): LegacyCaseSegmentSummary {
  const segments = deriveLegacyCaseSegments(caseItem);
  const summaryEntries = Object.fromEntries(
    LEGACY_CASE_SEGMENT_KEYS.map((segmentKey) => [segmentKey, summarizeSegment(segments[segmentKey])]),
  ) as Record<LegacyCaseSegmentKey, LegacyCaseSegmentSummaryEntry>;
  const allFields = LEGACY_CASE_SEGMENT_KEYS.flatMap((segmentKey) => Object.values(segments[segmentKey]));

  return Object.freeze({
    ...summaryEntries,
    totalFieldCount: allFields.length,
    compatibilityMirrorCount: countLegacyRole(allFields, 'compatibility-mirror'),
    futureMigrationCount: countLegacyRole(allFields, 'future-migration'),
  });
}
