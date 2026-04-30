import { describe, expect, it } from 'vitest';

import { buildDecisionSupportEvaluationBoundaryReport } from '../evaluation-boundary-report.js';
import type { GameState } from '../../../domain/models.js';

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
      {
        id: 'case-sold',
        title: '已售房源',
        status: 'sold',
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
      {
        id: 'op-inactive',
        caseId: 'case-active',
        customerId: 'customer-2',
        customerName: '陈女士',
        profile: '刚需',
        channelId: 'direct',
        channelName: '自然来访',
        fit: 60,
        intent: 45,
        confidence: 50,
        stageIndex: 1,
        stageLabel: '初看',
        status: 'lost',
        lifecycleStatus: 'lost',
        leadSource: 'direct',
        visibility: 'revealed',
        createdDay: 1,
        daysLeft: 0,
        touchedToday: false,
        budgetMax: 500,
        priceSensitivity: 50,
        stagnationTicks: 2,
        history: [],
      },
    ],
  } as unknown as GameState;
}

describe('decision-support evaluation boundary report', () => {
  it('summarizes the evaluation snapshots consumed by decision support without changing recommendations', () => {
    const report = buildDecisionSupportEvaluationBoundaryReport(buildState());

    expect(report.source).toBe('decision-support-evaluation-snapshots');
    expect(report.snapshotCount).toBe(5);
    expect(report.statusCounts).toEqual({
      clean: 1,
      'legacy-warning': 4,
      'boundary-violation': 0,
    });
    expect(report.warningModelIds).toEqual([
      'asset-score',
      'opportunity-score',
      'region-open-day-fit',
    ]);
    expect(report.violationModelIds).toEqual([]);
    expect(report.readiness).toBe('watch');
    expect(report.reports.map((entry) => entry.subjectRef.id)).toEqual([
      'case-active',
      'case-active',
      'op-active',
      '浦东',
      '浦东:梧桐苑',
    ]);
    expect(Object.isFrozen(report)).toBe(true);
    expect(Object.isFrozen(report.statusCounts)).toBe(true);
    expect(Object.isFrozen(report.warningModelIds)).toBe(true);
    expect(Object.isFrozen(report.violationModelIds)).toBe(true);
    expect(Object.isFrozen(report.reports)).toBe(true);
  });
});
