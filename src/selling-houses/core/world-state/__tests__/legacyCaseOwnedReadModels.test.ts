import { describe, expect, it } from 'vitest';
import type { Case } from '../../../domain/models.js';
import { deriveLegacyCaseSegments } from '../legacy-case-segments.js';
import {
  deriveLegacyCaseOwnedReadModels,
  deriveLegacyCaseOwnedReadModelSummary,
} from '../legacy-case-owned-read-models.js';

function buildLegacyCase(overrides: Partial<Case> = {}): Case {
  return {
    id: 'case-1',
    housePrototypeId: 'house-1',
    ownerArchetypeId: 'owner-archetype-1',
    title: '滨江两房',
    community: '滨江花园',
    district: '滨江',
    layout: '两室一厅',
    area: 89,
    askPrice: 510,
    marketPrice: 495,
    bottomPrice: 480,
    patience: 62,
    trust: 71,
    heat: 58,
    competitiveness: 66,
    d1: 60,
    d2: 70,
    d3: 68,
    axisScores: { price: 62 },
    urgency: 74,
    windowDays: 9,
    ownerName: '李阿姨',
    ownerMood: '担心价格谈低',
    maintainerName: '小张',
    marketCellId: 'market-1',
    story: '临江次新，业主换房',
    tags: ['次新'],
    defects: ['临街'],
    status: 'active',
    stageIndex: 2,
    stageLabel: '集中带看',
    riskFlags: ['要价偏高'],
    actionsApplied: ['owner-call'],
    actionsToday: 1,
    touchedToday: true,
    touchedOwnerToday: false,
    lastTouchedDay: 4,
    lastOwnerTouchedDay: 3,
    hasCompletedFirstVisit: true,
    lastAction: '做了一轮价格反馈',
    lastPriceActionDay: 3,
    openDayCooldown: 0,
    qualityStory: 12,
    negotiationBonus: 4,
    viewings: 3,
    offers: 1,
    soldPrice: null,
    priceGapPct: 3,
    competitivenessSnapshots: [],
    competitionGroupIds: ['competition-1'],
    lastAskPrice: 515,
    lastRivalThreatDay: 3,
    goalTier: 'core',
    storylineState: 'fragile',
    isFocused: true,
    personality: 'emotional',
    ...overrides,
  };
}

function countFieldsByRole(
  fields: ReturnType<typeof deriveLegacyCaseSegments>[keyof ReturnType<typeof deriveLegacyCaseSegments>],
  legacyRole: 'compatibility-mirror' | 'future-migration',
) {
  return Object.values(fields).filter((entry) => entry.metadata.legacyRole === legacyRole).length;
}

describe('legacy Case owned read models', () => {
  it('derives frozen owner-oriented read models from legacy case segments without leaking case references', () => {
    const legacyCase = buildLegacyCase();
    const readModels = deriveLegacyCaseOwnedReadModels(legacyCase);
    const segments = deriveLegacyCaseSegments(legacyCase);

    expect(readModels.assetCase).toMatchObject({
      source: 'legacy-case-segments',
      legacyCaseId: 'case-1',
      fieldCount: Object.values(segments.assetCaseFields).length,
      compatibilityMirrorCount: countFieldsByRole(segments.assetCaseFields, 'compatibility-mirror'),
      futureMigrationCount: countFieldsByRole(segments.assetCaseFields, 'future-migration'),
    });
    expect(readModels.owner.fields.ownerName?.value).toBe('李阿姨');
    expect(readModels.owner.fields.title).toBeUndefined();
    expect(readModels.ownerCaseRelation.fields.askPrice?.value).toBe(510);
    expect(readModels.brokerOwnerRelation.fields.trust?.value).toBe(71);
    expect(readModels.evaluationMirror.fields.axisScores?.value).toEqual({ price: 62 });
    expect(readModels.processMirror.fields.stageLabel?.value).toBe('集中带看');
    expect(readModels.runtimeScratch.fields.actionsApplied?.value).toEqual(['owner-call']);
    expect(readModels.projectionUi.fields.riskFlags?.value).toEqual(['要价偏高']);
    expect(readModels.deprecatedLegacy.fields.ownerSatisfaction).toBeUndefined();

    legacyCase.tags.push('源对象后续变更');
    legacyCase.axisScores.price = 1;
    legacyCase.actionsApplied?.push('source-mutation');

    expect(readModels.assetCase.fields.tags?.value).toEqual(['次新']);
    expect(readModels.evaluationMirror.fields.axisScores?.value).toEqual({ price: 62 });
    expect(readModels.runtimeScratch.fields.actionsApplied?.value).toEqual(['owner-call']);
    expect(Object.isFrozen(readModels)).toBe(true);
    expect(Object.isFrozen(readModels.assetCase)).toBe(true);
    expect(Object.isFrozen(readModels.assetCase.fields)).toBe(true);
    expect(Object.isFrozen(readModels.assetCase.fields.tags?.value)).toBe(true);
  });

  it('summarizes the supported owned read models with aggregate counts', () => {
    const summary = deriveLegacyCaseOwnedReadModelSummary(buildLegacyCase());
    const readModels = deriveLegacyCaseOwnedReadModels(buildLegacyCase());

    expect(summary).toMatchObject({
      source: 'legacy-case-segments',
      legacyCaseId: 'case-1',
      assetCase: {
        fieldCount: readModels.assetCase.fieldCount,
        compatibilityMirrorCount: readModels.assetCase.compatibilityMirrorCount,
        futureMigrationCount: readModels.assetCase.futureMigrationCount,
      },
      runtimeScratch: {
        fieldCount: readModels.runtimeScratch.fieldCount,
        compatibilityMirrorCount: readModels.runtimeScratch.compatibilityMirrorCount,
        futureMigrationCount: readModels.runtimeScratch.futureMigrationCount,
      },
    });
    expect(summary.totalFieldCount).toBe(
      summary.assetCase.fieldCount
        + summary.owner.fieldCount
        + summary.ownerCaseRelation.fieldCount
        + summary.brokerOwnerRelation.fieldCount
        + summary.evaluationMirror.fieldCount
        + summary.processMirror.fieldCount
        + summary.runtimeScratch.fieldCount
        + summary.projectionUi.fieldCount
        + summary.deprecatedLegacy.fieldCount,
    );
    expect(Object.isFrozen(summary)).toBe(true);
    expect(Object.isFrozen(summary.assetCase)).toBe(true);
  });
});
