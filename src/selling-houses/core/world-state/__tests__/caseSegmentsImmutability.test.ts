import { describe, it, expect } from 'vitest';
import {
  deriveLegacyCaseSegments,
  deriveLegacyCaseSegmentSummary,
} from '../legacy-case-segments.js';
import type { LegacyCaseLike } from '../legacyCaseContracts.js';

const sampleCase: LegacyCaseLike = {
  id: 'test-1',
} as LegacyCaseLike;

// Populate enough fields for meaningful segments
(Object as any).assign(sampleCase, {
  title: 'Test',
  community: 'C',
  district: 'D',
  askPrice: 5000000,
  marketPrice: 4800000,
  bottomPrice: 4500000,
  priceGapPct: 0.04,
  heat: 0.8,
  status: 'active',
  stageIndex: 1,
  stageLabel: 'listed',
  riskFlags: ['risk1'],
  ownerArchetypeId: 'arch-1',
  ownerName: 'Owner',
  ownerMood: 'neutral',
  personality: 'pragmatic',
  trust: 0.6,
  patience: 0.5,
  urgency: 0.7,
  windowDays: 30,
  maintainerName: 'Broker',
  marketCellId: 'mc-1',
  story: 'Story',
  tags: ['tag1'],
  defects: [],
  touchedOwnerToday: false,
  lastOwnerTouchedDay: 0,
  competitionGroupIds: ['g1'],
  axisScores: { x: 1 },
  competitiveness: 0.5,
  d1: 0.6,
  d2: 0.7,
  d3: 0.5,
  actionsToday: 0,
  touchedToday: false,
  lastTouchedDay: 0,
  hasCompletedFirstVisit: false,
  lastAction: '',
  lastPriceActionDay: 0,
  openDayCooldown: 0,
  qualityStory: 0,
  negotiationBonus: 0,
  competitivenessSnapshots: [],
});

describe('Legacy case segment immutability', () => {
  it('segment nested value mutation throws', () => {
    const segments = deriveLegacyCaseSegments(sampleCase);
    const assetCaseSegment = segments.assetCaseFields;
    // Try to mutate the axisScores nested object
    const axisScoresEntry = (assetCaseSegment as any).axisScores;
    if (axisScoresEntry && axisScoresEntry.value) {
      expect(() => { axisScoresEntry.value.x = 999; }).toThrow(TypeError);
    }
  });

  it('segment summary is frozen', () => {
    const summary = deriveLegacyCaseSegmentSummary(sampleCase);
    expect(() => { (summary as any).totalFieldCount = 0; }).toThrow(TypeError);
  });

  it('segments object is frozen', () => {
    const segments = deriveLegacyCaseSegments(sampleCase);
    expect(() => { (segments as any).newField = 'bad'; }).toThrow(TypeError);
  });
});
