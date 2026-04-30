import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';

import { ACTIONS } from '../src/selling-houses/domain/constants.js';
import {
  ACTION_MIGRATION_PLAN,
  buildActionMigrationPlan,
} from '../src/selling-houses/runtime/simulation/action-migration-plan.js';

const SOURCE_PATH = 'src/selling-houses/runtime/simulation/action-split-plan.ts';
const IMPORT_PATH = '../src/selling-houses/runtime/simulation/action-split-plan.js';

if (!existsSync(SOURCE_PATH)) {
  console.log(
    `selling-houses action split plan contract skipped: ${SOURCE_PATH} not present yet`,
  );
  process.exit(0);
}

type ActionSplitPlanFamily = {
  readonly id?: string;
  readonly familyId: string;
  readonly actionIds: readonly string[];
  readonly processBlocked?: boolean;
  readonly processBlockedActionIds?: readonly string[];
};

type ActionSplitPlan = {
  readonly source: string;
  readonly families: readonly ActionSplitPlanFamily[];
  readonly recommendedFirstSplitFamilyIds: readonly string[];
  readonly blockedFamilyIds?: readonly string[];
  readonly summary?: Readonly<{
    familyCount?: number;
    actionCount?: number;
    blockedFamilyCount?: number;
    processBlockedFamilyCount?: number;
    recommendedFirstSplitFamilyCount?: number;
  }>;
};

const actionSplitPlanModule = await import(IMPORT_PATH) as {
  ACTION_SPLIT_PLAN?: ActionSplitPlan;
  buildActionSplitPlan?: () => ActionSplitPlan;
};

assert.equal(
  typeof actionSplitPlanModule.buildActionSplitPlan,
  'function',
  'Expected buildActionSplitPlan export',
);
assert.ok(
  actionSplitPlanModule.ACTION_SPLIT_PLAN,
  'Expected ACTION_SPLIT_PLAN export',
);

const buildActionSplitPlan = actionSplitPlanModule.buildActionSplitPlan as () => ActionSplitPlan;
const ACTION_SPLIT_PLAN = actionSplitPlanModule.ACTION_SPLIT_PLAN as ActionSplitPlan;

function expectMutationBlocked(label: string, mutate: () => void) {
  assert.throws(mutate, TypeError, `${label} should be read-only`);
}

const plan = buildActionSplitPlan();
const actionIds = ACTIONS.map((entry) => entry.id).sort();
const familyActionIds = plan.families.flatMap((family) => family.actionIds).sort();
const duplicatedActionIds = familyActionIds.filter((actionId, index) => familyActionIds.indexOf(actionId) !== index);
const missingActionIds = actionIds.filter((actionId) => !familyActionIds.includes(actionId));
const unknownActionIds = familyActionIds.filter((actionId) => !actionIds.includes(actionId));
const migrationPlan = buildActionMigrationPlan();
const processManagerRequiredActionIds = migrationPlan.processManagerRequired.all.map((entry) => entry.actionId).sort();
const processBlockedActionIds = plan.families
  .flatMap((family) => family.processBlockedActionIds || (
    family.processBlocked
      ? family.actionIds.filter((actionId) => processManagerRequiredActionIds.includes(actionId))
      : []
  ))
  .sort();
const familiesById = Object.fromEntries(plan.families.map((family) => [family.familyId || family.id, family]));

assert.deepEqual(plan, ACTION_SPLIT_PLAN, 'Expected exported action split plan to match builder output');
assert.ok(plan.families.length > 0, 'Expected action split plan to include families');
assert.deepEqual(
  familyActionIds,
  actionIds,
  `Action split families must cover every ACTIONS id exactly once; missing: ${missingActionIds.join(', ') || '<none>'}; unknown: ${unknownActionIds.join(', ') || '<none>'}; duplicated: ${duplicatedActionIds.join(', ') || '<none>'}`,
);
assert.deepEqual(
  processBlockedActionIds,
  processManagerRequiredActionIds,
  'Expected processBlocked family coverage to match action migration plan processManagerRequired actions',
);

for (const family of plan.families) {
  const hasProcessRequiredAction = family.actionIds.some((actionId) => (
    processManagerRequiredActionIds.includes(actionId)
  ));
  const processBlocked = family.processBlocked ?? Boolean(family.processBlockedActionIds?.length);
  assert.equal(
    processBlocked,
    hasProcessRequiredAction,
    `Expected ${family.familyId || family.id} processBlocked to reflect processManagerRequired action membership`,
  );
  if (family.processBlockedActionIds) {
    assert.deepEqual(
      family.processBlockedActionIds.slice().sort(),
      family.actionIds.filter((actionId) => processManagerRequiredActionIds.includes(actionId)).sort(),
      `Expected ${family.familyId || family.id} processBlockedActionIds to mirror processManagerRequired membership`,
    );
    assert.ok(Object.isFrozen(family.processBlockedActionIds), `Expected ${family.familyId || family.id} processBlockedActionIds to be frozen`);
  }
  assert.ok(Object.isFrozen(family), `Expected ${family.familyId || family.id} family to be frozen`);
  assert.ok(Object.isFrozen(family.actionIds), `Expected ${family.familyId || family.id} actionIds to be frozen`);
}

for (const familyId of plan.recommendedFirstSplitFamilyIds) {
  const family = familiesById[familyId];
  assert.ok(family, `Expected recommended first split family ${familyId} to exist`);
  assert.equal(
    family.processBlocked ?? Boolean(family.processBlockedActionIds?.length),
    false,
    `Expected recommended first split family ${familyId} not to be process blocked`,
  );
}

if (plan.blockedFamilyIds) {
  assert.deepEqual(
    plan.blockedFamilyIds.slice().sort(),
    plan.families
      .filter((family) => family.processBlocked ?? Boolean(family.processBlockedActionIds?.length))
      .map((family) => family.familyId || family.id || '')
      .sort(),
    'Expected blockedFamilyIds to mirror processBlocked families',
  );
  assert.ok(Object.isFrozen(plan.blockedFamilyIds), 'Expected blockedFamilyIds to be frozen');
}

if (plan.summary) {
  assert.equal(plan.summary.familyCount, plan.families.length, 'Expected summary familyCount to match families');
  assert.equal(plan.summary.actionCount, ACTIONS.length, 'Expected summary actionCount to match ACTIONS');
  const blockedFamilyCount = plan.families
    .filter((family) => family.processBlocked ?? Boolean(family.processBlockedActionIds?.length))
    .length;
  if ('processBlockedFamilyCount' in plan.summary) {
    assert.equal(
      plan.summary.processBlockedFamilyCount,
      blockedFamilyCount,
      'Expected summary processBlockedFamilyCount to match processBlocked families',
    );
  }
  if ('blockedFamilyCount' in plan.summary) {
    assert.equal(
      plan.summary.blockedFamilyCount,
      blockedFamilyCount,
      'Expected summary blockedFamilyCount to match processBlocked families',
    );
  }
  assert.equal(
    plan.summary.recommendedFirstSplitFamilyCount,
    plan.recommendedFirstSplitFamilyIds.length,
    'Expected summary recommendedFirstSplitFamilyCount to match recommendations',
  );
  assert.ok(Object.isFrozen(plan.summary), 'Expected summary to be frozen');
}

assert.deepEqual(
  ACTION_MIGRATION_PLAN.processManagerRequired.all.map((entry) => entry.actionId).sort(),
  processManagerRequiredActionIds,
  'Expected action migration plan export and builder to agree on processManagerRequired',
);
assert.ok(Object.isFrozen(plan), 'Expected action split plan root to be frozen');
assert.ok(Object.isFrozen(plan.families), 'Expected families to be frozen');
assert.ok(Object.isFrozen(plan.recommendedFirstSplitFamilyIds), 'Expected recommendedFirstSplitFamilyIds to be frozen');

expectMutationBlocked('action split plan root', () => {
  (plan as unknown as Record<string, unknown>).polluted = true;
});
expectMutationBlocked('action split plan families', () => {
  (plan.families as unknown[]).push({});
});
expectMutationBlocked('action split plan family actionIds', () => {
  (plan.families[0].actionIds as unknown[]).push('polluted');
});

console.log('selling-houses action split plan contract verification passed');
