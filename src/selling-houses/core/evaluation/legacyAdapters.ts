import { BALANCE } from '../../domain/config/balance.js';
import type { Case, GameState, Opportunity } from '../../domain/models.js';
import type {
  AssetScoreSnapshot,
  EvaluationDimensionSnapshot,
  EvaluationSubjectRef,
  OpportunityScoreSnapshot,
  OwnerDecisionReadinessSnapshot,
  RegionOpenDayFitSnapshot,
} from './models.js';

const MODEL_VERSION = '1.0.0';

function clampScore(value: number, min = 0, max = 100) {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.max(min, Math.min(max, value));
}

function roundedScore(value: number) {
  return Math.round(clampScore(value));
}

function average(values: number[], fallback = 0) {
  const validValues = values.filter(Number.isFinite);
  if (validValues.length === 0) {
    return fallback;
  }
  return validValues.reduce((sum, value) => sum + value, 0) / validValues.length;
}

function dimension(
  key: string,
  label: string,
  score: number,
  weight?: number,
  inputs?: EvaluationDimensionSnapshot['inputs'],
  note?: string,
): EvaluationDimensionSnapshot {
  return {
    key,
    label,
    score: roundedScore(score),
    total: 100,
    ...(typeof weight === 'number' ? { weight } : {}),
    ...(inputs ? { inputs: { ...inputs } } : {}),
    ...(note ? { note } : {}),
  };
}

function caseSubjectRef(caseItem: Case): EvaluationSubjectRef {
  return {
    kind: 'case',
    id: caseItem.id,
    label: caseItem.title,
    parentId: caseItem.community,
    parentLabel: caseItem.community,
  };
}

function opportunitySubjectRef(opportunity: Opportunity): EvaluationSubjectRef {
  return {
    kind: 'opportunity',
    id: opportunity.id,
    label: opportunity.customerName,
    parentId: opportunity.caseId,
  };
}

function ownerGapDays(day: number, lastOwnerTouchedDay: number) {
  if (!lastOwnerTouchedDay || lastOwnerTouchedDay <= 0) {
    return Math.max(1, day);
  }
  return Math.max(0, day - lastOwnerTouchedDay);
}

function priceFlexScore(caseItem: Case) {
  const priceFlex = (caseItem.askPrice - caseItem.bottomPrice) / Math.max(1, caseItem.askPrice);
  return clampScore(priceFlex * BALANCE.scoring.d3Normalization.priceFlexFullScale * 100);
}

function willingnessToAdjustScore(caseItem: Case) {
  const gapPressure = Number.isFinite(caseItem.priceGapPct)
    ? caseItem.priceGapPct
    : ((caseItem.askPrice - caseItem.marketPrice) / Math.max(1, caseItem.marketPrice)) * 100;
  return clampScore(priceFlexScore(caseItem) * 0.65 + clampScore(100 - gapPressure * 8) * 0.35);
}

function decisionLoadScore(caseItem: Case, day: number) {
  const gapPenalty = ownerGapDays(day, caseItem.lastOwnerTouchedDay) * 8;
  const windowPenalty = Math.max(0, 7 - caseItem.windowDays) * 7;
  const riskPenalty = caseItem.storylineState === 'critical'
    ? 22
    : caseItem.storylineState === 'sliding'
      ? 12
      : caseItem.storylineState === 'fragile'
        ? 6
        : 0;
  return clampScore(100 - gapPenalty - windowPenalty - riskPenalty);
}

export function buildAssetScoreSnapshotFromLegacyCase(
  state: Pick<GameState, 'day' | 'opportunities'>,
  caseItem: Case,
): AssetScoreSnapshot {
  const activeOpportunities = state.opportunities.filter(
    (entry) => entry.caseId === caseItem.id && entry.status === 'active',
  );
  const lateStageOpportunityCount = activeOpportunities.filter((entry) => entry.stageIndex >= 3).length;
  const weights = BALANCE.scoring.competitivenessWeights;
  const axisScores = { ...caseItem.axisScores };

  const dimensions = {
    d1: dimension(
      'd1',
      'D1 客户需求与漏斗',
      caseItem.d1,
      weights.d1,
      {
        activeOpportunityCount: activeOpportunities.length,
        lateStageOpportunityCount,
        heat: caseItem.heat,
      },
    ),
    d2: dimension(
      'd2',
      'D2 房源基础资产',
      caseItem.d2,
      weights.d2,
      axisScores,
    ),
    d3: dimension(
      'd3',
      'D3 成交条件（legacy，含业主关系信号）',
      caseItem.d3,
      weights.d3,
      {
        priceFlexScore: priceFlexScore(caseItem),
        patience: caseItem.patience,
        urgency: caseItem.urgency,
        trust: caseItem.trust,
      },
      'Legacy D3 currently mixes pricing flexibility with owner relation signals; owner readiness is evaluated separately.',
    ),
  };

  return {
    subjectRef: caseSubjectRef(caseItem),
    modelId: 'asset-score',
    modelVersion: MODEL_VERSION,
    day: state.day,
    score: roundedScore(caseItem.competitiveness),
    total: 100,
    dimensions,
    inputs: {
      legacyCompetitiveness: caseItem.competitiveness,
      legacyD1: caseItem.d1,
      legacyD2: caseItem.d2,
      legacyD3: caseItem.d3,
      askPrice: caseItem.askPrice,
      marketPrice: caseItem.marketPrice,
      bottomPrice: caseItem.bottomPrice,
      heat: caseItem.heat,
      axisScores: { ...axisScores },
      activeOpportunityCount: activeOpportunities.length,
      lateStageOpportunityCount,
      legacyD3OwnerRelationSignals: {
        patience: caseItem.patience,
        urgency: caseItem.urgency,
        trust: caseItem.trust,
      },
    },
    confidence: 0.92,
  };
}

export function buildOwnerDecisionReadinessSnapshotFromLegacyCase(
  state: Pick<GameState, 'day'>,
  caseItem: Case,
): OwnerDecisionReadinessSnapshot {
  const gapDays = ownerGapDays(state.day, caseItem.lastOwnerTouchedDay);
  const willingnessToAdjust = willingnessToAdjustScore(caseItem);
  const decisionLoad = decisionLoadScore(caseItem, state.day);
  const dimensions = {
    trust: dimension('trust', '信任', caseItem.trust),
    urgency: dimension('urgency', '紧迫度', caseItem.urgency),
    patience: dimension('patience', '耐心', caseItem.patience),
    willingnessToAdjust: dimension(
      'willingnessToAdjust',
      '调价/配合意愿',
      willingnessToAdjust,
      undefined,
      {
        askPrice: caseItem.askPrice,
        marketPrice: caseItem.marketPrice,
        bottomPrice: caseItem.bottomPrice,
        priceFlexScore: priceFlexScore(caseItem),
      },
    ),
    decisionLoad: dimension(
      'decisionLoad',
      '决策负荷',
      decisionLoad,
      undefined,
      {
        windowDays: caseItem.windowDays,
        ownerGapDays: gapDays,
        storylineState: caseItem.storylineState,
      },
      'Higher score means lower current decision friction.',
    ),
  };
  const score = (
    dimensions.trust.score * 0.26
    + dimensions.urgency.score * 0.18
    + dimensions.patience.score * 0.2
    + dimensions.willingnessToAdjust.score * 0.2
    + dimensions.decisionLoad.score * 0.16
  );

  return {
    subjectRef: caseSubjectRef(caseItem),
    modelId: 'owner-decision-readiness',
    modelVersion: MODEL_VERSION,
    day: state.day,
    score: roundedScore(score),
    total: 100,
    dimensions,
    inputs: {
      trust: caseItem.trust,
      urgency: caseItem.urgency,
      patience: caseItem.patience,
      askPrice: caseItem.askPrice,
      marketPrice: caseItem.marketPrice,
      bottomPrice: caseItem.bottomPrice,
      priceGapPct: caseItem.priceGapPct,
      windowDays: caseItem.windowDays,
      lastOwnerTouchedDay: caseItem.lastOwnerTouchedDay,
      ownerGapDays: gapDays,
      touchedOwnerToday: caseItem.touchedOwnerToday,
      ownerArchetypeId: caseItem.ownerArchetypeId,
      storylineState: caseItem.storylineState,
    },
    confidence: 0.86,
  };
}

export function buildOpportunityScoreSnapshotFromLegacyOpportunity(
  state: Pick<GameState, 'day' | 'cases'>,
  opportunity: Opportunity,
): OpportunityScoreSnapshot {
  const caseItem = state.cases.find((entry) => entry.id === opportunity.caseId) || null;
  const priceBudgetFit = caseItem
    ? Math.max(0, 100 - Math.max(0, caseItem.askPrice - opportunity.budgetMax) * 0.25)
    : 50;
  const closeReadiness = caseItem
    ? Math.round(
      opportunity.intent * 0.34
      + opportunity.confidence * 0.26
      + caseItem.trust * 0.2
      + caseItem.competitiveness * 0.12
      + priceBudgetFit * 0.08,
    )
    : Math.round(opportunity.intent * 0.45 + opportunity.confidence * 0.35 + opportunity.fit * 0.2);

  const dimensions = {
    fit: dimension('fit', '匹配度', opportunity.fit),
    intent: dimension('intent', '意向', opportunity.intent),
    confidence: dimension('confidence', '成交把握', opportunity.confidence),
    closeReadiness: dimension(
      'closeReadiness',
      '收口准备度',
      closeReadiness,
      undefined,
      {
        stageIndex: opportunity.stageIndex,
        daysLeft: opportunity.daysLeft,
        priceBudgetFit,
      },
    ),
  };
  const score = (
    dimensions.fit.score * 0.22
    + dimensions.intent.score * 0.28
    + dimensions.confidence.score * 0.24
    + dimensions.closeReadiness.score * 0.26
  );

  return {
    subjectRef: opportunitySubjectRef(opportunity),
    modelId: 'opportunity-score',
    modelVersion: MODEL_VERSION,
    day: state.day,
    score: roundedScore(score),
    total: 100,
    dimensions,
    inputs: {
      opportunityId: opportunity.id,
      caseId: opportunity.caseId,
      stageIndex: opportunity.stageIndex,
      daysLeft: opportunity.daysLeft,
      status: opportunity.status,
      budgetMax: opportunity.budgetMax,
      askPrice: caseItem?.askPrice ?? null,
      caseTrust: caseItem?.trust ?? null,
      caseCompetitiveness: caseItem?.competitiveness ?? null,
      pendingClosingEvaluation: Boolean(opportunity.pendingClosingEvaluation),
    },
    confidence: caseItem ? 0.88 : 0.7,
  };
}

export function buildRegionOpenDayFitSnapshotFromLegacyState(
  state: Pick<GameState, 'day' | 'cases' | 'opportunities'>,
  scope: { district: string; community?: string },
): RegionOpenDayFitSnapshot {
  const matchingCases = state.cases.filter((entry) => (
    entry.status === 'active'
    && entry.district === scope.district
    && (!scope.community || entry.community === scope.community)
  ));
  const caseIds = matchingCases.map((entry) => entry.id);
  const activeOpportunities = state.opportunities.filter(
    (entry) => caseIds.includes(entry.caseId) && entry.status === 'active',
  );

  const averageCompetitiveness = average(matchingCases.map((entry) => entry.competitiveness));
  const averageD1 = average(matchingCases.map((entry) => entry.d1));
  const averageTrust = average(matchingCases.map((entry) => entry.trust));
  const averageUrgency = average(matchingCases.map((entry) => entry.urgency));
  const averageHeat = average(matchingCases.map((entry) => entry.heat));
  const averageOpenDayCooldown = average(matchingCases.map((entry) => entry.openDayCooldown));

  const assetBase = averageCompetitiveness;
  const demandBase = clampScore(averageD1 * 0.55 + averageHeat * 0.25 + Math.min(100, activeOpportunities.length * 16) * 0.2);
  const ownerReadiness = clampScore(averageTrust * 0.48 + averageUrgency * 0.32 + average(matchingCases.map((entry) => entry.patience)) * 0.2);
  const operationalFit = clampScore(100 - averageOpenDayCooldown * 20);

  const dimensions = {
    assetBase: dimension('assetBase', '房源基础', assetBase),
    demandBase: dimension('demandBase', '区域客需', demandBase, undefined, {
      averageD1,
      averageHeat,
      activeOpportunityCount: activeOpportunities.length,
    }),
    ownerReadiness: dimension('ownerReadiness', '业主配合基础', ownerReadiness),
    operationalFit: dimension('operationalFit', '开放日操作条件', operationalFit, undefined, {
      averageOpenDayCooldown,
    }),
  };
  const score = (
    dimensions.assetBase.score * 0.32
    + dimensions.demandBase.score * 0.3
    + dimensions.ownerReadiness.score * 0.22
    + dimensions.operationalFit.score * 0.16
  );
  const subjectRef: EvaluationSubjectRef = scope.community
    ? {
      kind: 'community',
      id: `${scope.district}:${scope.community}`,
      label: scope.community,
      parentId: scope.district,
      parentLabel: scope.district,
    }
    : {
      kind: 'region',
      id: scope.district,
      label: scope.district,
    };

  return {
    subjectRef,
    modelId: 'region-open-day-fit',
    modelVersion: MODEL_VERSION,
    day: state.day,
    score: roundedScore(score),
    total: 100,
    dimensions,
    inputs: {
      scope: scope.community ? 'community' : 'region',
      community: scope.community ?? null,
      district: scope.district,
      caseIds,
      activeCaseCount: matchingCases.length,
      activeOpportunityCount: activeOpportunities.length,
      averageCompetitiveness,
      averageD1,
      averageTrust,
      averageUrgency,
      averageHeat,
      averageOpenDayCooldown,
    },
    confidence: matchingCases.length > 0 ? 0.82 : 0.35,
  };
}

export function buildCaseEvaluationSnapshotsFromLegacyState(
  state: Pick<GameState, 'day' | 'opportunities'>,
  caseItem: Case,
) {
  return {
    assetScore: buildAssetScoreSnapshotFromLegacyCase(state, caseItem),
    ownerDecisionReadiness: buildOwnerDecisionReadinessSnapshotFromLegacyCase(state, caseItem),
  };
}

export function buildOpportunityEvaluationSnapshotsFromLegacyState(
  state: Pick<GameState, 'day' | 'cases'>,
  opportunity: Opportunity,
) {
  return {
    opportunityScore: buildOpportunityScoreSnapshotFromLegacyOpportunity(state, opportunity),
  };
}
