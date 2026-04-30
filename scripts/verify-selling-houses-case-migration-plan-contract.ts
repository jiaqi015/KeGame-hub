import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';

import {
  LEGACY_CASE_FIELD_OWNERSHIP_ENTRIES,
  type LegacyCaseField,
} from '../src/selling-houses/core/world-state/legacy-case-field-ownership.js';

const SOURCE_PATH = 'src/selling-houses/core/world-state/legacy-case-migration-plan.ts';
const IMPORT_PATH = '../src/selling-houses/core/world-state/legacy-case-migration-plan.js';

if (!existsSync(SOURCE_PATH)) {
  console.log(
    `selling-houses legacy Case migration plan contract skipped: ${SOURCE_PATH} not present yet`,
  );
  process.exit(0);
}

type LegacyCaseMigrationPlanGroup = {
  readonly id: string;
  readonly fieldCount: number;
  readonly fieldNames: readonly LegacyCaseField[];
};

type LegacyCaseMigrationPlan = {
  readonly source: 'legacy-case-field-ownership-registry';
  readonly fieldCount: number;
  readonly byCanonicalOwner: Readonly<Record<string, LegacyCaseMigrationPlanGroup>>;
  readonly byMigrationWave: Readonly<Record<string, LegacyCaseMigrationPlanGroup>>;
  readonly firstWaveFieldNames: readonly LegacyCaseField[];
  readonly blockedFieldNames: readonly LegacyCaseField[];
  readonly riskNotes: readonly string[];
};

const migrationPlanModule = await import(IMPORT_PATH) as {
  buildLegacyCaseMigrationPlan?: () => LegacyCaseMigrationPlan;
  LEGACY_CASE_MIGRATION_PLAN?: LegacyCaseMigrationPlan;
};

assert.equal(
  typeof migrationPlanModule.buildLegacyCaseMigrationPlan,
  'function',
  'Expected buildLegacyCaseMigrationPlan export',
);
assert.ok(
  migrationPlanModule.LEGACY_CASE_MIGRATION_PLAN,
  'Expected LEGACY_CASE_MIGRATION_PLAN export',
);

const buildLegacyCaseMigrationPlan = migrationPlanModule.buildLegacyCaseMigrationPlan as () => LegacyCaseMigrationPlan;
const LEGACY_CASE_MIGRATION_PLAN = migrationPlanModule.LEGACY_CASE_MIGRATION_PLAN as LegacyCaseMigrationPlan;

function fieldsFromGroups(groups: Readonly<Record<string, LegacyCaseMigrationPlanGroup>>) {
  return Object.values(groups).flatMap((group) => group.fieldNames);
}

function expectMutationBlocked(label: string, mutate: () => void) {
  assert.throws(mutate, TypeError, `${label} should be read-only`);
}

const plan = buildLegacyCaseMigrationPlan();
const registryFieldNames = LEGACY_CASE_FIELD_OWNERSHIP_ENTRIES.map((entry) => entry.field).sort();
const ownerGroupFieldNames = fieldsFromGroups(plan.byCanonicalOwner).sort();
const waveGroupFieldNames = fieldsFromGroups(plan.byMigrationWave).sort();
const duplicatedOwnerFields = ownerGroupFieldNames.filter((field, index) => ownerGroupFieldNames.indexOf(field) !== index);
const duplicatedWaveFields = waveGroupFieldNames.filter((field, index) => waveGroupFieldNames.indexOf(field) !== index);
const missingOwnerFields = registryFieldNames.filter((field) => !ownerGroupFieldNames.includes(field));
const missingWaveFields = registryFieldNames.filter((field) => !waveGroupFieldNames.includes(field));

assert.deepEqual(plan, LEGACY_CASE_MIGRATION_PLAN, 'Expected exported migration plan to match builder output');
assert.equal(plan.source, 'legacy-case-field-ownership-registry');
assert.equal(
  plan.fieldCount,
  LEGACY_CASE_FIELD_OWNERSHIP_ENTRIES.length,
  'Expected migration plan fieldCount to match ownership registry',
);
assert.deepEqual(
  ownerGroupFieldNames,
  registryFieldNames,
  `Canonical owner groups must cover every ownership registry field exactly once; missing: ${missingOwnerFields.join(', ') || '<none>'}; duplicated: ${duplicatedOwnerFields.join(', ') || '<none>'}`,
);
assert.deepEqual(
  waveGroupFieldNames,
  registryFieldNames,
  `Migration wave groups must cover every ownership registry field exactly once; missing: ${missingWaveFields.join(', ') || '<none>'}; duplicated: ${duplicatedWaveFields.join(', ') || '<none>'}`,
);
assert.deepEqual(
  plan.firstWaveFieldNames,
  plan.byMigrationWave['first-read-model-only']?.fieldNames,
  'Expected firstWaveFieldNames to mirror the first-read-model-only migration wave',
);

for (const group of [
  ...Object.values(plan.byCanonicalOwner),
  ...Object.values(plan.byMigrationWave),
]) {
  assert.equal(group.fieldCount, group.fieldNames.length, `Expected ${group.id} fieldCount to mirror fieldNames`);
  assert.ok(Object.isFrozen(group), `Expected ${group.id} group to be frozen`);
  assert.ok(Object.isFrozen(group.fieldNames), `Expected ${group.id} fieldNames to be frozen`);
}

for (const requiredField of ['d1', 'd2', 'd3', 'competitiveness', 'stageIndex'] as const) {
  assert.ok(
    plan.blockedFieldNames.includes(requiredField),
    `Expected high-risk field ${requiredField} to remain blocked in the migration plan`,
  );
}

for (const expectedNote of ['trust', 'D1/D2/D3/competitiveness', 'stage']) {
  assert.ok(
    plan.riskNotes.some((note) => note.includes(expectedNote)),
    `Expected migration plan risk notes to mention ${expectedNote}`,
  );
}

assert.ok(Object.isFrozen(plan), 'Expected migration plan root to be frozen');
assert.ok(Object.isFrozen(plan.byCanonicalOwner), 'Expected canonical owner groups to be frozen');
assert.ok(Object.isFrozen(plan.byMigrationWave), 'Expected migration wave groups to be frozen');
assert.ok(Object.isFrozen(plan.firstWaveFieldNames), 'Expected firstWaveFieldNames to be frozen');
assert.ok(Object.isFrozen(plan.blockedFieldNames), 'Expected blockedFieldNames to be frozen');
assert.ok(Object.isFrozen(plan.riskNotes), 'Expected riskNotes to be frozen');

expectMutationBlocked('migration plan root', () => {
  (plan as unknown as Record<string, unknown>).polluted = true;
});
expectMutationBlocked('migration plan field list', () => {
  (plan.blockedFieldNames as unknown[]).push('polluted');
});
expectMutationBlocked('migration plan owner group', () => {
  (plan.byCanonicalOwner.assetCase as { fieldCount: number }).fieldCount = 0;
});

console.log('selling-houses legacy Case migration plan contract verification passed');
