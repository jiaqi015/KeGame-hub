import assert from 'node:assert/strict';

import type { Case } from '../src/selling-houses/domain/models.js';
import {
  deriveLegacyCaseSegments,
  deriveLegacyCaseSegmentSummary,
  LEGACY_CASE_FIELD_OWNERSHIP_ENTRIES,
  LEGACY_CASE_SEGMENT_KEYS,
  type LegacyCaseSegmentKey,
} from '../src/selling-houses/core/world-state/index.js';

function buildCase(): Case {
  return {
    id: 'case-segments-1',
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

function countSegmentFields(segment: ReturnType<typeof deriveLegacyCaseSegments>[LegacyCaseSegmentKey]) {
  return Object.values(segment);
}

const caseItem = buildCase();
const before = structuredClone(caseItem);
const segments = deriveLegacyCaseSegments(caseItem);
const summary = deriveLegacyCaseSegmentSummary(caseItem);

assert.deepEqual(caseItem, before, 'deriveLegacyCaseSegments must not mutate the legacy Case');

assert.equal(
  segments.brokerOwnerRelationFields.trust?.value,
  caseItem.trust,
  'trust should be exposed through brokerOwnerRelationFields',
);
assert.equal(segments.brokerOwnerRelationFields.trust?.metadata.canonicalOwner, 'broker-owner-relation');
assert.equal(segments.brokerOwnerRelationFields.trust?.metadata.legacyRole, 'compatibility-mirror');
assert.equal(segments.brokerOwnerRelationFields.trust?.metadata.targetConcept, 'BrokerOwnerRelation.trust');

for (const field of ['d1', 'd2', 'd3'] as const) {
  assert.equal(
    segments.evaluationMirrorFields[field]?.value,
    caseItem[field],
    `${field} should be exposed through evaluationMirrorFields`,
  );
  assert.equal(segments.evaluationMirrorFields[field]?.metadata.canonicalOwner, 'evaluation-mirror');
}

for (const field of ['stageIndex', 'viewings', 'offers'] as const) {
  assert.equal(
    segments.processMirrorFields[field]?.value,
    caseItem[field],
    `${field} should be exposed through processMirrorFields`,
  );
  assert.equal(segments.processMirrorFields[field]?.metadata.canonicalOwner, 'process-mirror');
}

assert.notEqual(segments.assetCaseFields.tags?.value, caseItem.tags, 'tags should be defensively copied');
assert.notEqual(segments.assetCaseFields.defects?.value, caseItem.defects, 'defects should be defensively copied');
assert.notEqual(segments.projectionUiFields.riskFlags?.value, caseItem.riskFlags, 'riskFlags should be defensively copied');
assert.notEqual(segments.evaluationMirrorFields.axisScores?.value, caseItem.axisScores, 'axisScores should be defensively copied');
assert.notEqual(
  segments.processMirrorFields.competitionGroupIds?.value,
  caseItem.competitionGroupIds,
  'competitionGroupIds should be defensively copied',
);
assert.notEqual(
  segments.evaluationMirrorFields.competitivenessSnapshots?.value,
  caseItem.competitivenessSnapshots,
  'competitivenessSnapshots should be defensively copied',
);
assert.notEqual(
  segments.evaluationMirrorFields.competitivenessSnapshots?.value?.[0]?.breakdown.d1_drivers,
  caseItem.competitivenessSnapshots[0]?.breakdown.d1_drivers,
  'nested competitiveness snapshot arrays should be defensively copied',
);

expectMutationBlocked('segment field map', () => {
  (segments.assetCaseFields as Record<string, unknown>).newField = true;
});
expectMutationBlocked('segment field entry', () => {
  (segments.assetCaseFields.tags as { field: string }).field = 'polluted';
});
expectMutationBlocked('segment array value', () => {
  (segments.assetCaseFields.tags?.value as string[]).push('污染');
});
expectMutationBlocked('segment object value', () => {
  (segments.evaluationMirrorFields.axisScores?.value as Record<string, number>).layout = 1;
});
expectMutationBlocked('segment nested array value', () => {
  const snapshot = segments.evaluationMirrorFields.competitivenessSnapshots?.value?.[0];
  (snapshot?.breakdown.d1_drivers as unknown as { signal: string }[]).push({ signal: '污染' });
});

assert.deepEqual(caseItem, before, 'mutating a derived segment must not pollute the legacy Case');

for (const segmentKey of LEGACY_CASE_SEGMENT_KEYS) {
  const fields = countSegmentFields(segments[segmentKey]);
  assert.equal(summary[segmentKey].fieldCount, fields.length, `${segmentKey} field count should match segment fields`);
  assert.equal(
    summary[segmentKey].compatibilityMirrorCount,
    fields.filter((entry) => entry.metadata.legacyRole === 'compatibility-mirror').length,
    `${segmentKey} compatibilityMirror count should match segment fields`,
  );
  assert.equal(
    summary[segmentKey].futureMigrationCount,
    fields.filter((entry) => entry.metadata.legacyRole === 'future-migration').length,
    `${segmentKey} futureMigration count should match segment fields`,
  );
}

assert.equal(
  summary.totalFieldCount,
  LEGACY_CASE_FIELD_OWNERSHIP_ENTRIES.length,
  'summary totalFieldCount should match the ownership registry',
);
assert.equal(
  summary.compatibilityMirrorCount,
  LEGACY_CASE_FIELD_OWNERSHIP_ENTRIES.filter((entry) => entry.legacyRole === 'compatibility-mirror').length,
  'summary compatibilityMirrorCount should match the ownership registry',
);
assert.equal(
  summary.futureMigrationCount,
  LEGACY_CASE_FIELD_OWNERSHIP_ENTRIES.filter((entry) => entry.legacyRole === 'future-migration').length,
  'summary futureMigrationCount should match the ownership registry',
);

console.log('selling-houses legacy Case segments contract verification passed');
