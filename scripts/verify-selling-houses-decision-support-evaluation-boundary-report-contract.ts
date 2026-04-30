import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';

import type { GameState } from '../src/selling-houses/domain/models.js';

const SOURCE_PATH = 'src/selling-houses/runtime/decision-support/evaluation-boundary-report.ts';
const IMPORT_PATH = '../src/selling-houses/runtime/decision-support/evaluation-boundary-report.js';

if (!existsSync(SOURCE_PATH)) {
  console.log(
    `selling-houses decision-support evaluation boundary report contract skipped: ${SOURCE_PATH} not present yet`,
  );
  process.exit(0);
}

type EvaluationBoundaryReportStatus = 'clean' | 'legacy-warning' | 'boundary-violation';
type EvaluationBoundaryReportReadiness = 'ready' | 'watch' | 'blocked';

type DecisionSupportEvaluationBoundaryReport = {
  readonly source: 'decision-support-evaluation-snapshots';
  readonly snapshotCount: number;
  readonly statusCounts: Readonly<Record<EvaluationBoundaryReportStatus, number>>;
  readonly warningModelIds: readonly string[];
  readonly violationModelIds: readonly string[];
  readonly readiness: EvaluationBoundaryReportReadiness;
  readonly reports: readonly {
    readonly modelId: string;
    readonly status: EvaluationBoundaryReportStatus;
    readonly forbiddenInputHits: readonly unknown[];
    readonly legacyMirrorHits: readonly unknown[];
    readonly subjectRef?: {
      readonly id: string;
    };
  }[];
};

const boundaryReportModule = await import(IMPORT_PATH) as {
  buildDecisionSupportEvaluationBoundaryReport?: (
    state: GameState
  ) => DecisionSupportEvaluationBoundaryReport;
};

assert.equal(
  typeof boundaryReportModule.buildDecisionSupportEvaluationBoundaryReport,
  'function',
  'Expected buildDecisionSupportEvaluationBoundaryReport export',
);

const buildDecisionSupportEvaluationBoundaryReport = boundaryReportModule.buildDecisionSupportEvaluationBoundaryReport as (
  state: GameState
) => DecisionSupportEvaluationBoundaryReport;

function buildState(): GameState {
  return {
    day: 6,
    cases: [
      {
        id: 'case-active',
        housePrototypeId: 'house-1',
        ownerArchetypeId: 'steady-owner',
        title: '梧桐苑 88 平',
        community: '梧桐苑',
        district: '浦东',
        layout: '两房',
        area: 88,
        askPrice: 510,
        marketPrice: 495,
        bottomPrice: 480,
        patience: 62,
        trust: 72,
        heat: 68,
        competitiveness: 74,
        d1: 70,
        d2: 76,
        d3: 71,
        axisScores: { price: 66, layout: 78 },
        urgency: 58,
        windowDays: 9,
        ownerName: '王女士',
        ownerMood: 'stable',
        maintainerName: '李经纪',
        marketCellId: 'market-1',
        story: '近地铁，维护好。',
        tags: ['地铁'],
        defects: [],
        status: 'active',
        stageIndex: 1,
        stageLabel: '维护中',
        riskFlags: [],
        actionsToday: 0,
        touchedToday: false,
        touchedOwnerToday: false,
        lastTouchedDay: 4,
        lastOwnerTouchedDay: 3,
        hasCompletedFirstVisit: true,
        lastAction: '',
        lastPriceActionDay: 0,
        openDayCooldown: 0,
        qualityStory: 72,
        negotiationBonus: 0,
        viewings: 1,
        offers: 0,
        soldPrice: null,
        priceGapPct: 3,
        competitivenessSnapshots: [],
        competitionGroupIds: [],
        lastAskPrice: 510,
        goalTier: 'core',
        storylineState: 'healthy',
        personality: 'pragmatic',
      },
    ],
    opportunities: [
      {
        id: 'op-active',
        caseId: 'case-active',
        customerId: 'customer-1',
        customerName: '张先生',
        profile: '改善',
        channelId: 'direct',
        channelName: '自然来访',
        fit: 76,
        intent: 70,
        confidence: 68,
        stageIndex: 2,
        stageLabel: '复看',
        status: 'active',
        lifecycleStatus: 'active',
        leadSource: 'direct',
        visibility: 'revealed',
        createdDay: 2,
        daysLeft: 5,
        touchedToday: false,
        budgetMax: 530,
        priceSensitivity: 44,
        stagnationTicks: 0,
        history: [],
      },
    ],
  } as unknown as GameState;
}

function expectMutationBlocked(label: string, mutate: () => void) {
  assert.throws(mutate, TypeError, `${label} should be read-only`);
}

const state = buildState();
const before = structuredClone(state);
const report = buildDecisionSupportEvaluationBoundaryReport(state);
const warningCount = report.statusCounts['legacy-warning'];
const violationCount = report.statusCounts['boundary-violation'];

assert.deepEqual(state, before, 'Expected decision-support boundary report not to mutate GameState');
assert.equal(report.source, 'decision-support-evaluation-snapshots');
assert.ok(report.snapshotCount > 0, 'Expected report to include at least one evaluation snapshot');
assert.equal(
  report.snapshotCount,
  report.reports.length,
  'Expected snapshotCount to mirror report entries',
);
assert.equal(
  report.statusCounts.clean + warningCount + violationCount,
  report.snapshotCount,
  'Expected statusCounts to partition all evaluation reports',
);
assert.ok(
  warningCount > 0,
  'Expected legacy compatibility mirrors to produce warnings in the test GameState',
);
assert.equal(
  violationCount,
  0,
  'Expected legacy warnings not to be counted as boundary violations',
);
assert.deepEqual(
  report.violationModelIds,
  [],
  'Expected no violation model ids when only legacy warnings are present',
);
assert.ok(
  report.warningModelIds.length > 0,
  'Expected warning model ids to identify legacy-warning evaluation models',
);
assert.notEqual(
  report.readiness,
  'blocked',
  'Expected readiness not to be blocked unless boundary violations exist',
);
assert.ok(
  report.reports.some((entry) => entry.status === 'legacy-warning' && entry.forbiddenInputHits.length === 0),
  'Expected at least one legacy warning that is not a forbidden-input violation',
);

assert.ok(Object.isFrozen(report), 'Expected evaluation boundary report root to be frozen');
assert.ok(Object.isFrozen(report.statusCounts), 'Expected statusCounts to be frozen');
assert.ok(Object.isFrozen(report.warningModelIds), 'Expected warningModelIds to be frozen');
assert.ok(Object.isFrozen(report.violationModelIds), 'Expected violationModelIds to be frozen');
assert.ok(Object.isFrozen(report.reports), 'Expected reports to be frozen');

expectMutationBlocked('evaluation boundary report root', () => {
  (report as unknown as Record<string, unknown>).polluted = true;
});
expectMutationBlocked('evaluation boundary report entries', () => {
  (report.reports as unknown[]).push({});
});

console.log('selling-houses decision-support evaluation boundary report contract verification passed');
