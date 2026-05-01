import { describe, expect, it } from 'vitest';

import {
  validateEvaluationSnapshotBoundary,
  validateEvaluationSnapshotsBoundaries,
} from '../evaluation-boundary-guards.js';
import type { AssetScoreSnapshot, OwnerDecisionReadinessSnapshot } from '../models.js';

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

describe('evaluation boundary guards', () => {
  it('reports forbidden asset-score relationship inputs as boundary violations', () => {
    const report = validateEvaluationSnapshotBoundary(buildAssetScoreSnapshot({
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

    expect(report.modelId).toBe('asset-score');
    expect(report.subjectRef.id).toBe('case-1');
    expect(report.status).toBe('boundary-violation');
    expect(report.forbiddenInputHits).toEqual([
      {
        facet: 'broker-owner-relation',
        field: 'trust',
        reason: expect.stringContaining('broker-owner relationship'),
      },
    ]);
    expect(report.legacyMirrorHits.map((entry) => entry.field)).toEqual(expect.arrayContaining([
      'legacyCompetitiveness',
      'legacyD1',
      'legacyD2',
      'legacyD3',
      'legacyD3OwnerRelationSignals',
      'bottomPrice',
    ]));
    expect(report.legacyMirrorHits).toHaveLength(6);
    expect(report.unknownInputFields).toEqual([]);
  });

  it('treats legacy mirror source fields as warnings without violations', () => {
    const report = validateEvaluationSnapshotBoundary(buildAssetScoreSnapshot({
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

    expect(report.status).toBe('legacy-warning');
    expect(report.forbiddenInputHits).toEqual([]);
    expect(report.legacyMirrorHits).toContainEqual({
      field: 'legacyD3OwnerRelationSignals',
      concept: 'Legacy D3 mixed relationship and pricing signals',
      warningLevel: 'legacy-warning',
      note: expect.stringContaining('explicit warning surface'),
    });
    expect(Object.isFrozen(report)).toBe(true);
    expect(Object.isFrozen(report.forbiddenInputHits)).toBe(true);
    expect(Object.isFrozen(report.legacyMirrorHits)).toBe(true);
    expect(Object.isFrozen(report.unknownInputFields)).toBe(true);
  });

  it('keeps unknown-only inputs visible without escalating the status', () => {
    const report = validateEvaluationSnapshotBoundary(buildOwnerReadinessSnapshot({
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
      experimentalSignal: true,
    }));

    expect(report.status).toBe('clean');
    expect(report.forbiddenInputHits).toEqual([]);
    expect(report.legacyMirrorHits).toEqual([]);
    expect(report.unknownInputFields).toEqual(['experimentalSignal']);
  });

  it('validates snapshot arrays in order', () => {
    const cleanOwner = buildOwnerReadinessSnapshot({
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
    const violatingAsset = buildAssetScoreSnapshot({
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
      urgency: 64,
    });

    const reports = validateEvaluationSnapshotsBoundaries([cleanOwner, violatingAsset]);
    expect(reports.map((entry) => entry.status)).toEqual(['clean', 'boundary-violation']);
    expect(Object.isFrozen(reports)).toBe(true);
  });
});
