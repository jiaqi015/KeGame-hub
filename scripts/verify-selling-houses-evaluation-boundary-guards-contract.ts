import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';

import type {
  AssetScoreSnapshot,
  OwnerDecisionReadinessSnapshot,
  SellingHousesEvaluationSnapshot,
} from '../src/selling-houses/core/evaluation/index.js';

const SOURCE_PATH = 'src/selling-houses/core/evaluation/evaluation-boundary-guards.ts';
const IMPORT_PATH = '../src/selling-houses/core/evaluation/evaluation-boundary-guards.js';

if (!existsSync(SOURCE_PATH)) {
  console.log(
    `selling-houses evaluation boundary guards contract skipped: ${SOURCE_PATH} not present yet`,
  );
  process.exit(0);
}

const boundaryGuardsModule = await import(IMPORT_PATH) as {
  validateEvaluationSnapshotBoundary?: (snapshot: SellingHousesEvaluationSnapshot) => EvaluationBoundaryGuardReport;
  validateEvaluationSnapshotsBoundaries?: (
    snapshots: readonly SellingHousesEvaluationSnapshot[]
  ) => readonly EvaluationBoundaryGuardReport[];
};

type EvaluationBoundaryGuardReport = {
  modelId: string;
  status: 'clean' | 'legacy-warning' | 'boundary-violation';
  forbiddenInputHits: readonly {
    facet: string;
    field: string;
    reason: string;
  }[];
  legacyMirrorHits: readonly {
    field: string;
    concept: string;
    warningLevel: string;
    note: string;
  }[];
  unknownInputFields: readonly string[];
};

assert.equal(
  typeof boundaryGuardsModule.validateEvaluationSnapshotBoundary,
  'function',
  'Expected validateEvaluationSnapshotBoundary export',
);
assert.equal(
  typeof boundaryGuardsModule.validateEvaluationSnapshotsBoundaries,
  'function',
  'Expected validateEvaluationSnapshotsBoundaries export',
);

const validateEvaluationSnapshotBoundary = boundaryGuardsModule.validateEvaluationSnapshotBoundary as (
  snapshot: SellingHousesEvaluationSnapshot
) => EvaluationBoundaryGuardReport;
const validateEvaluationSnapshotsBoundaries = boundaryGuardsModule.validateEvaluationSnapshotsBoundaries as (
  snapshots: readonly SellingHousesEvaluationSnapshot[]
) => readonly EvaluationBoundaryGuardReport[];

function buildAssetScoreSnapshot(inputs: AssetScoreSnapshot['inputs']): AssetScoreSnapshot {
  return {
    subjectRef: {
      kind: 'case',
      id: 'case-1',
      label: '滨江两房',
    },
    modelId: 'asset-score',
    modelVersion: 'test',
    day: 1,
    score: 72,
    total: 100,
    dimensions: {
      d1: { key: 'd1', label: 'D1', score: 70, total: 100 },
      d2: { key: 'd2', label: 'D2', score: 75, total: 100 },
      d3: { key: 'd3', label: 'D3', score: 71, total: 100 },
    },
    inputs,
    confidence: 0.9,
    blockers: [],
    topDrivers: [],
    recommendedDecisionMoments: [],
  };
}

function buildOwnerReadinessSnapshot(
  inputs: OwnerDecisionReadinessSnapshot['inputs'],
): OwnerDecisionReadinessSnapshot {
  return {
    subjectRef: {
      kind: 'case',
      id: 'case-1',
      label: '滨江两房',
    },
    modelId: 'owner-decision-readiness',
    modelVersion: 'test',
    day: 1,
    score: 66,
    total: 100,
    dimensions: {
      trust: { key: 'trust', label: '信任', score: 70, total: 100 },
      urgency: { key: 'urgency', label: '紧迫度', score: 64, total: 100 },
      patience: { key: 'patience', label: '耐心', score: 62, total: 100 },
      willingnessToAdjust: { key: 'willingnessToAdjust', label: '调价意愿', score: 65, total: 100 },
      decisionLoad: { key: 'decisionLoad', label: '决策负荷', score: 67, total: 100 },
    },
    inputs,
    confidence: 0.86,
  };
}

const legacyWarningReport = validateEvaluationSnapshotBoundary(buildAssetScoreSnapshot({
  askPrice: 510,
  marketPrice: 495,
  bottomPrice: 480,
  heat: 58,
  activeOpportunityCount: 2,
  lateStageOpportunityCount: 1,
  axisScores: { price: 62 },
  legacyCompetitiveness: 72,
  legacyD1: 70,
  legacyD2: 75,
  legacyD3: 71,
  legacyD3OwnerRelationSignals: { trust: 80 },
}));

assert.equal(
  legacyWarningReport.status,
  'legacy-warning',
  'legacyD3OwnerRelationSignals should be a warning, not a boundary violation',
);
assert.deepEqual(
  legacyWarningReport.forbiddenInputHits,
  [],
  'legacyD3OwnerRelationSignals warning must not count as a forbidden input hit',
);
assert.ok(
  legacyWarningReport.legacyMirrorHits.some((entry) => (
    entry.field === 'legacyD3OwnerRelationSignals'
    && entry.warningLevel === 'legacy-warning'
  )),
  'Expected legacyD3OwnerRelationSignals to be reported as a legacy warning',
);

const violationReport = validateEvaluationSnapshotBoundary(buildAssetScoreSnapshot({
  askPrice: 510,
  marketPrice: 495,
  bottomPrice: 480,
  heat: 58,
  activeOpportunityCount: 2,
  lateStageOpportunityCount: 1,
  axisScores: { price: 62 },
  legacyCompetitiveness: 72,
  legacyD1: 70,
  legacyD2: 75,
  legacyD3: 71,
  legacyD3OwnerRelationSignals: { trust: 80 },
  trust: 80,
}));

assert.equal(
  violationReport.status,
  'boundary-violation',
  'asset-score direct forbidden keys should produce boundary-violation',
);
assert.ok(
  violationReport.forbiddenInputHits.some((entry) => (
    entry.facet === 'broker-owner-relation'
    && entry.field === 'trust'
  )),
  'Expected asset-score direct trust input to be reported as a broker-owner-relation violation',
);

const cleanOwnerReadiness = buildOwnerReadinessSnapshot({
  trust: 70,
  urgency: 64,
  patience: 62,
  askPrice: 510,
  marketPrice: 495,
  bottomPrice: 480,
  priceGapPct: 3,
  windowDays: 9,
  lastOwnerTouchedDay: 3,
  ownerGapDays: 1,
  touchedOwnerToday: false,
  ownerArchetypeId: 'owner-1',
  storylineState: 'fragile',
});

assert.equal(
  validateEvaluationSnapshotBoundary(cleanOwnerReadiness).status,
  'clean',
  'owner-decision-readiness should accept trust/urgency/patience/window inputs',
);
assert.deepEqual(
  validateEvaluationSnapshotsBoundaries([
    cleanOwnerReadiness,
    buildAssetScoreSnapshot({
      askPrice: 510,
      marketPrice: 495,
      bottomPrice: 480,
      heat: 58,
      activeOpportunityCount: 2,
      lateStageOpportunityCount: 1,
      axisScores: { price: 62 },
      legacyCompetitiveness: 72,
      legacyD1: 70,
      legacyD2: 75,
      legacyD3: 71,
      legacyD3OwnerRelationSignals: { trust: 80 },
      trust: 80,
    }),
  ])
    .map((entry) => entry.modelId),
  ['owner-decision-readiness', 'asset-score'],
  'Expected snapshot array validation to preserve order',
);

console.log('selling-houses evaluation boundary guards contract verification passed');
