import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';

import type { Case } from '../src/selling-houses/domain/models.js';
import {
  deriveLegacyCaseSegments,
  LEGACY_CASE_FIELD_OWNERSHIP_ENTRIES,
} from '../src/selling-houses/core/world-state/index.js';

const SOURCE_PATH = 'src/selling-houses/core/world-state/legacy-case-owned-read-models.ts';
const IMPORT_PATH = '../src/selling-houses/core/world-state/legacy-case-owned-read-models.js';

if (!existsSync(SOURCE_PATH)) {
  console.log(
    `selling-houses legacy Case owned read models contract skipped: ${SOURCE_PATH} not present yet`,
  );
  process.exit(0);
}

const ownedReadModelsModule = await import(IMPORT_PATH) as {
  deriveLegacyCaseOwnedReadModels?: (caseItem: Case) => Record<string, unknown>;
  deriveLegacyCaseOwnedReadModelSummary?: (caseItem: Case) => Record<string, unknown>;
};

assert.equal(
  typeof ownedReadModelsModule.deriveLegacyCaseOwnedReadModels,
  'function',
  'Expected deriveLegacyCaseOwnedReadModels export',
);
assert.equal(
  typeof ownedReadModelsModule.deriveLegacyCaseOwnedReadModelSummary,
  'function',
  'Expected deriveLegacyCaseOwnedReadModelSummary export',
);

const deriveLegacyCaseOwnedReadModels = ownedReadModelsModule.deriveLegacyCaseOwnedReadModels as (
  caseItem: Case
) => Record<string, unknown>;
const deriveLegacyCaseOwnedReadModelSummary = ownedReadModelsModule.deriveLegacyCaseOwnedReadModelSummary as (
  caseItem: Case
) => Record<string, unknown>;

function buildCase(): Case {
  return {
    id: 'case-owned-read-models-1',
    housePrototypeId: 'house-1',
    ownerArchetypeId: 'owner-1',
    title: '合同验证房源',
    community: '开放日小区',
    district: '浦东',
    layout: '三室两厅',
    area: 116,
    askPrice: 730,
    marketPrice: 700,
    bottomPrice: 690,
    patience: 58,
    trust: 76,
    heat: 64,
    competitiveness: 71,
    d1: 68,
    d2: 73,
    d3: 69,
    axisScores: { layout: 78, light: 82 },
    urgency: 66,
    windowDays: 12,
    ownerName: '陈女士',
    ownerMood: '想快点卖但怕亏',
    maintainerName: '经纪人A',
    marketCellId: 'market-cell-1',
    story: '次新改善盘，挂牌初期反馈集中。',
    tags: ['次新', '改善'],
    defects: ['临高架'],
    status: 'active',
    stageIndex: 3,
    stageLabel: '开放日蓄客',
    riskFlags: ['同小区竞品上新'],
    actionsApplied: ['owner-feedback'],
    actionsToday: 1,
    touchedToday: true,
    touchedOwnerToday: true,
    lastTouchedDay: 4,
    lastOwnerTouchedDay: 4,
    hasCompletedFirstVisit: true,
    lastAction: '同步竞品反馈',
    lastPriceActionDay: 2,
    openDayCooldown: 0,
    qualityStory: 5,
    negotiationBonus: 2,
    viewings: 9,
    offers: 2,
    soldPrice: null,
    priceGapPct: 4.2,
    competitivenessSnapshots: [
      {
        day: 4,
        total: 71,
        d1: 68,
        d2: 73,
        d3: 69,
        delta: 3,
        breakdown: {
          d1_delta: 1,
          d1_drivers: [{ signal: 'viewing', contribution: 1, reason: '带看增加' }],
          d2_delta: 0,
          d3_delta: 2,
          d3_drivers: [{ signal: 'trust', contribution: 2, reason: '业主配合提升' }],
        },
      },
    ],
    competitionGroupIds: ['competition-1'],
    lastAskPrice: 735,
    lastRivalThreatDay: 3,
    goalTier: 'core',
    storylineState: 'fragile',
    relativeOutcome: 'flat',
    ownerSatisfaction: 'neutral',
    defenseOutcome: 'held',
    endingType: 'not_sold_no_regret',
    endingBucket: 'neutral',
    endingSummary: '合同验证摘要',
    isFocused: true,
    personality: 'pragmatic',
  };
}

function expectMutationBlocked(label: string, mutate: () => void) {
  assert.throws(mutate, TypeError, `${label} should be read-only`);
}

function getModelEntries(readModels: Record<string, unknown>) {
  return Object.entries(readModels).filter(([, value]) => (
    value
    && typeof value === 'object'
    && 'fieldCount' in value
    && 'fields' in value
  ));
}

function fieldCountOf(value: unknown) {
  assert.ok(value && typeof value === 'object' && 'fieldCount' in value, 'Expected read model fieldCount');
  return Number((value as { fieldCount: unknown }).fieldCount);
}

function fieldsOf(value: unknown) {
  assert.ok(value && typeof value === 'object' && 'fields' in value, 'Expected read model fields');
  return (value as { fields: Record<string, { value?: unknown }> }).fields;
}

const caseItem = buildCase();
const before = structuredClone(caseItem);
const readModels = deriveLegacyCaseOwnedReadModels(caseItem);
const summary = deriveLegacyCaseOwnedReadModelSummary(caseItem);
const segments = deriveLegacyCaseSegments(caseItem);
const modelEntries = getModelEntries(readModels);
const modelFieldNames = modelEntries.flatMap(([, value]) => Object.keys(fieldsOf(value)));
const uniqueModelFieldNames = Array.from(new Set(modelFieldNames)).sort();
const registryFieldNames = LEGACY_CASE_FIELD_OWNERSHIP_ENTRIES.map((entry) => entry.field).sort();
const missingRegistryFields = registryFieldNames.filter((field) => !uniqueModelFieldNames.includes(field));
const duplicatedModelFields = uniqueModelFieldNames.filter((field) => (
  modelFieldNames.filter((candidate) => candidate === field).length > 1
));

assert.deepEqual(caseItem, before, 'deriveLegacyCaseOwnedReadModels must not mutate the legacy Case');
assert.ok(Object.isFrozen(readModels), 'Expected owned read models root to be frozen');
assert.ok(Object.isFrozen(summary), 'Expected owned read model summary to be frozen');
assert.ok(modelEntries.length > 0, 'Expected at least one owned read model entry');

const totalModelFieldCount = modelEntries.reduce((total, [, value]) => total + fieldCountOf(value), 0);
assert.equal(
  totalModelFieldCount,
  LEGACY_CASE_FIELD_OWNERSHIP_ENTRIES.length,
  `Owned read models total field count must cover the Case ownership registry; missing fields: ${missingRegistryFields.join(', ') || '<none>'}`,
);
assert.deepEqual(
  uniqueModelFieldNames,
  registryFieldNames,
  `Owned read models must expose each Case ownership registry field exactly once; missing fields: ${missingRegistryFields.join(', ') || '<none>'}; duplicated fields: ${duplicatedModelFields.join(', ') || '<none>'}`,
);
assert.equal(
  (summary as { totalFieldCount?: number }).totalFieldCount,
  LEGACY_CASE_FIELD_OWNERSHIP_ENTRIES.length,
  `Owned read model summary totalFieldCount must cover the Case ownership registry; missing fields: ${missingRegistryFields.join(', ') || '<none>'}`,
);

const assetCaseFields = fieldsOf((readModels as Record<string, unknown>).assetCase);
const evaluationMirrorFields = fieldsOf((readModels as Record<string, unknown>).evaluationMirror);
const runtimeScratchFields = fieldsOf((readModels as Record<string, unknown>).runtimeScratch);

assert.deepEqual(assetCaseFields.tags?.value, segments.assetCaseFields.tags?.value);
assert.deepEqual(evaluationMirrorFields.axisScores?.value, segments.evaluationMirrorFields.axisScores?.value);
assert.deepEqual(runtimeScratchFields.actionsApplied?.value, segments.runtimeScratchFields.actionsApplied?.value);
assert.ok(Object.isFrozen(assetCaseFields.tags?.value), 'Expected array read model values to be frozen');
assert.ok(Object.isFrozen(evaluationMirrorFields.axisScores?.value), 'Expected object read model values to be frozen');

expectMutationBlocked('read model root', () => {
  (readModels as Record<string, unknown>).polluted = true;
});
expectMutationBlocked('read model field map', () => {
  assetCaseFields.polluted = { value: true };
});
expectMutationBlocked('read model array value', () => {
  (assetCaseFields.tags?.value as string[]).push('污染');
});
expectMutationBlocked('read model object value', () => {
  (evaluationMirrorFields.axisScores?.value as Record<string, number>).layout = 1;
});

assert.deepEqual(caseItem, before, 'mutating a derived read model must not pollute the legacy Case');

caseItem.tags.push('源对象后续变更');
caseItem.axisScores.layout = 1;
caseItem.actionsApplied?.push('source-mutation');

assert.deepEqual(assetCaseFields.tags?.value, ['次新', '改善'], 'Read model arrays must be defensive copies');
assert.deepEqual(
  evaluationMirrorFields.axisScores?.value,
  { layout: 78, light: 82 },
  'Read model objects must be defensive copies',
);
assert.deepEqual(
  runtimeScratchFields.actionsApplied?.value,
  ['owner-feedback'],
  'Runtime read model arrays must be defensive copies',
);

console.log('selling-houses legacy Case owned read models contract verification passed');
