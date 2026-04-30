import {
  LEGACY_CASE_FIELD_OWNERSHIP_ENTRIES,
  type LegacyCaseCanonicalOwner,
  type LegacyCaseField,
  type LegacyCaseFieldOwnershipEntry,
} from './legacy-case-field-ownership.js';

export type LegacyCaseMigrationPlanSource = 'legacy-case-field-ownership-registry';

export type LegacyCaseMigrationWave =
  | 'first-read-model-only'
  | 'adapter-mirror'
  | 'requires-process-owner'
  | 'requires-projection-owner'
  | 'keep-legacy-temporary';

export interface LegacyCaseMigrationPlanGroup<Id extends string> {
  readonly id: Id;
  readonly fieldCount: number;
  readonly fieldNames: readonly LegacyCaseField[];
}

export type LegacyCaseMigrationPlanOwnerGroups = Readonly<{
  assetCase: LegacyCaseMigrationPlanGroup<'asset-case'>;
  owner: LegacyCaseMigrationPlanGroup<'owner'>;
  ownerCaseRelation: LegacyCaseMigrationPlanGroup<'owner-case-relation'>;
  brokerOwnerRelation: LegacyCaseMigrationPlanGroup<'broker-owner-relation'>;
  evaluationMirror: LegacyCaseMigrationPlanGroup<'evaluation-mirror'>;
  processMirror: LegacyCaseMigrationPlanGroup<'process-mirror'>;
  runtimeScratch: LegacyCaseMigrationPlanGroup<'runtime-scratch'>;
  projectionUi: LegacyCaseMigrationPlanGroup<'projection-ui'>;
  deprecatedLegacy: LegacyCaseMigrationPlanGroup<'deprecated-legacy'>;
}>;

export type LegacyCaseMigrationPlanWaveGroups = Readonly<
  Record<LegacyCaseMigrationWave, LegacyCaseMigrationPlanGroup<LegacyCaseMigrationWave>>
>;

export interface LegacyCaseMigrationPlan {
  readonly source: LegacyCaseMigrationPlanSource;
  readonly fieldCount: number;
  readonly byCanonicalOwner: LegacyCaseMigrationPlanOwnerGroups;
  readonly byMigrationWave: LegacyCaseMigrationPlanWaveGroups;
  readonly firstWaveFieldNames: readonly LegacyCaseField[];
  readonly blockedFieldNames: readonly LegacyCaseField[];
  readonly riskNotes: readonly string[];
}

const OWNER_GROUP_KEYS = Object.freeze({
  'asset-case': 'assetCase',
  owner: 'owner',
  'owner-case-relation': 'ownerCaseRelation',
  'broker-owner-relation': 'brokerOwnerRelation',
  'evaluation-mirror': 'evaluationMirror',
  'process-mirror': 'processMirror',
  'runtime-scratch': 'runtimeScratch',
  'projection-ui': 'projectionUi',
  'deprecated-legacy': 'deprecatedLegacy',
} satisfies Record<LegacyCaseCanonicalOwner, keyof LegacyCaseMigrationPlanOwnerGroups>);

function freezeFieldNames(fieldNames: LegacyCaseField[]): readonly LegacyCaseField[] {
  return Object.freeze([...fieldNames]);
}

function buildGroup<Id extends string>(
  id: Id,
  fieldNames: LegacyCaseField[],
): LegacyCaseMigrationPlanGroup<Id> {
  const frozenFieldNames = freezeFieldNames(fieldNames);

  return Object.freeze({
    id,
    fieldCount: frozenFieldNames.length,
    fieldNames: frozenFieldNames,
  });
}

function resolveMigrationWave(entry: LegacyCaseFieldOwnershipEntry): LegacyCaseMigrationWave {
  if (entry.canonicalOwner === 'process-mirror') {
    return 'requires-process-owner';
  }

  if (entry.canonicalOwner === 'projection-ui') {
    return 'requires-projection-owner';
  }

  if (entry.canonicalOwner === 'runtime-scratch' || entry.canonicalOwner === 'deprecated-legacy') {
    return 'keep-legacy-temporary';
  }

  if (entry.legacyRole === 'compatibility-mirror' || entry.legacyRole === 'future-migration') {
    return 'adapter-mirror';
  }

  return 'first-read-model-only';
}

function createOwnerBuckets(): Record<keyof LegacyCaseMigrationPlanOwnerGroups, LegacyCaseField[]> {
  return {
    assetCase: [],
    owner: [],
    ownerCaseRelation: [],
    brokerOwnerRelation: [],
    evaluationMirror: [],
    processMirror: [],
    runtimeScratch: [],
    projectionUi: [],
    deprecatedLegacy: [],
  };
}

function createWaveBuckets(): Record<LegacyCaseMigrationWave, LegacyCaseField[]> {
  return {
    'first-read-model-only': [],
    'adapter-mirror': [],
    'requires-process-owner': [],
    'requires-projection-owner': [],
    'keep-legacy-temporary': [],
  };
}

export function buildLegacyCaseMigrationPlan(): LegacyCaseMigrationPlan {
  const ownerBuckets = createOwnerBuckets();
  const waveBuckets = createWaveBuckets();

  for (const entry of LEGACY_CASE_FIELD_OWNERSHIP_ENTRIES) {
    ownerBuckets[OWNER_GROUP_KEYS[entry.canonicalOwner]].push(entry.field);
    waveBuckets[resolveMigrationWave(entry)].push(entry.field);
  }

  const byCanonicalOwner: LegacyCaseMigrationPlanOwnerGroups = Object.freeze({
    assetCase: buildGroup('asset-case', ownerBuckets.assetCase),
    owner: buildGroup('owner', ownerBuckets.owner),
    ownerCaseRelation: buildGroup('owner-case-relation', ownerBuckets.ownerCaseRelation),
    brokerOwnerRelation: buildGroup('broker-owner-relation', ownerBuckets.brokerOwnerRelation),
    evaluationMirror: buildGroup('evaluation-mirror', ownerBuckets.evaluationMirror),
    processMirror: buildGroup('process-mirror', ownerBuckets.processMirror),
    runtimeScratch: buildGroup('runtime-scratch', ownerBuckets.runtimeScratch),
    projectionUi: buildGroup('projection-ui', ownerBuckets.projectionUi),
    deprecatedLegacy: buildGroup('deprecated-legacy', ownerBuckets.deprecatedLegacy),
  });

  const byMigrationWave: LegacyCaseMigrationPlanWaveGroups = Object.freeze({
    'first-read-model-only': buildGroup('first-read-model-only', waveBuckets['first-read-model-only']),
    'adapter-mirror': buildGroup('adapter-mirror', waveBuckets['adapter-mirror']),
    'requires-process-owner': buildGroup('requires-process-owner', waveBuckets['requires-process-owner']),
    'requires-projection-owner': buildGroup('requires-projection-owner', waveBuckets['requires-projection-owner']),
    'keep-legacy-temporary': buildGroup('keep-legacy-temporary', waveBuckets['keep-legacy-temporary']),
  });

  const blockedFieldNames = [
    ...waveBuckets['requires-process-owner'],
    ...waveBuckets['requires-projection-owner'],
    ...waveBuckets['keep-legacy-temporary'],
    ...ownerBuckets.evaluationMirror,
  ];

  return Object.freeze({
    source: 'legacy-case-field-ownership-registry',
    fieldCount: LEGACY_CASE_FIELD_OWNERSHIP_ENTRIES.length,
    byCanonicalOwner,
    byMigrationWave,
    firstWaveFieldNames: byMigrationWave['first-read-model-only'].fieldNames,
    blockedFieldNames: freezeFieldNames(blockedFieldNames),
    riskNotes: Object.freeze([
      'trust is a broker-owner-relation field and must not migrate as an asset-case fact.',
      'D1/D2/D3/competitiveness are evaluation mirror fields; keep them adapter-backed until evaluation ownership is independent.',
      'stage/viewings/offers are process mirror fields; keep them blocked until process ownership is independent.',
    ]),
  });
}

export const LEGACY_CASE_MIGRATION_PLAN = buildLegacyCaseMigrationPlan();
