import { BALANCE } from '../../domain/config/balance.js';
import type { Case, GameState, Opportunity } from '../../domain/models.js';
import type {
  CompetitionPressureSnapshot,
  PressureReceiptBundle,
} from '../world-state/competition/models.js';
import type {
  AssetScoreDecisionMoment,
  AssetScoreDimensionDriver,
  AssetScoreSnapshot,
  D4ReceiptCoverageReport,
  D4SourceCategory,
  D4SourceCoverageEntry,
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

function buildAssetBlockers(
  caseItem: Case,
  activeOppCount: number,
  lateStageOppCount: number,
): readonly string[] {
  const blockers: string[] = [];
  if (activeOppCount === 0) {
    blockers.push('无活跃客户机会');
  }
  if (lateStageOppCount === 0 && activeOppCount > 0) {
    blockers.push('有活跃机会但无后段漏斗客户');
  }
  if (caseItem.heat < 30) {
    blockers.push('市场热度低');
  }
  if (caseItem.trust < 40) {
    blockers.push('业主信任度不足');
  }
  if (caseItem.urgency < 30) {
    blockers.push('业主紧迫度低');
  }
  const priceGap = ((caseItem.askPrice - caseItem.marketPrice) / Math.max(1, caseItem.marketPrice)) * 100;
  if (priceGap > 15) {
    blockers.push('报价明显高于市场价');
  }
  if (caseItem.storylineState === 'critical') {
    blockers.push('房源故事线处于危机状态');
  }
  return Object.freeze(blockers);
}

function buildAssetTopDrivers(
  dimensions: { d1: EvaluationDimensionSnapshot; d2: EvaluationDimensionSnapshot; d3: EvaluationDimensionSnapshot },
  caseItem: Case,
): readonly AssetScoreDimensionDriver[] {
  const drivers: AssetScoreDimensionDriver[] = [];

  if (dimensions.d1.score >= 70) {
    drivers.push({ label: '客户需求与漏斗', value: dimensions.d1.score, contribution: 'positive' });
  } else if (dimensions.d1.score < 40) {
    drivers.push({ label: '客户需求与漏斗', value: dimensions.d1.score, contribution: 'negative' });
  }

  if (dimensions.d2.score >= 70) {
    drivers.push({ label: '房源基础资产', value: dimensions.d2.score, contribution: 'positive' });
  } else if (dimensions.d2.score < 40) {
    drivers.push({ label: '房源基础资产', value: dimensions.d2.score, contribution: 'negative' });
  }

  if (dimensions.d3.score >= 70) {
    drivers.push({ label: '成交条件', value: dimensions.d3.score, contribution: 'positive' });
  } else if (dimensions.d3.score < 40) {
    drivers.push({ label: '成交条件', value: dimensions.d3.score, contribution: 'negative' });
  }

  if (caseItem.heat >= 70) {
    drivers.push({ label: '市场热度', value: caseItem.heat, contribution: 'positive' });
  }

  if (caseItem.trust >= 70) {
    drivers.push({ label: '业主信任', value: caseItem.trust, contribution: 'positive' });
  }

  return Object.freeze(drivers.sort((a, b) => {
    const order = { positive: 0, neutral: 1, negative: 2 };
    return order[a.contribution] - order[b.contribution];
  }));
}

function buildAssetDecisionMoments(
  caseItem: Case,
  activeOppCount: number,
): readonly AssetScoreDecisionMoment[] {
  const moments: AssetScoreDecisionMoment[] = [];

  if (activeOppCount >= 3) {
    moments.push({
      label: '多客户关注',
      trigger: `${activeOppCount}个活跃机会`,
      urgency: 'high',
    });
  }

  if (caseItem.urgency >= 70 && caseItem.trust >= 50) {
    moments.push({
      label: '业主配合窗口',
      trigger: '高紧迫度+中高信任',
      urgency: 'high',
    });
  }

  if (caseItem.heat >= 60 && caseItem.d1 >= 50) {
    moments.push({
      label: '市场热度窗口',
      trigger: '高热度+中高需求',
      urgency: 'medium',
    });
  }

  const priceGap = ((caseItem.askPrice - caseItem.marketPrice) / Math.max(1, caseItem.marketPrice)) * 100;
  if (priceGap > 10 && caseItem.patience >= 50) {
    moments.push({
      label: '建议调价沟通',
      trigger: '报价偏高+业主有耐心',
      urgency: 'medium',
    });
  }

  if (caseItem.storylineState === 'critical') {
    moments.push({
      label: '紧急维护',
      trigger: '故事线危机',
      urgency: 'high',
    });
  }

  return Object.freeze(moments);
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

  const blockers = buildAssetBlockers(caseItem, activeOpportunities.length, lateStageOpportunityCount);
  const topDrivers = buildAssetTopDrivers(dimensions, caseItem);
  const recommendedDecisionMoments = buildAssetDecisionMoments(caseItem, activeOpportunities.length);

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
    blockers,
    topDrivers,
    recommendedDecisionMoments,
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

// ---------------------------------------------------------------------------
// D4 Competition / Service-Path Advantage
// ---------------------------------------------------------------------------

/**
 * Derive a D4 dimension snapshot from a CompetitionPressureSnapshot.
 *
 * D4 is a penalty-oriented evaluation dimension. It starts at a neutral baseline
 * (50) and adjusts based on competition signals. This matches the mother model's
 * intent: D4 answers "how much is competition hurting this case's deal path?"
 *
 * Pure function. Does not mutate the input snapshot.
 */
export function buildD4CompetitionServicePathDimension(
  pressure: CompetitionPressureSnapshot,
): EvaluationDimensionSnapshot {
  const BASELINE = 50;

  // Trust erosion is the most damaging signal for deal path
  const trustEffect = pressure.netTrustDelta * 2.0;
  // Heat loss means losing buyer attention
  const heatEffect = pressure.netHeatDelta * 1.5;
  // Urgency shift is a weaker signal
  const urgencyEffect = pressure.netUrgencyDelta * 1.0;

  // Terminal event: lost to rival
  const lostPenalty = pressure.lostToRival ? 30 : 0;

  // Significant pressure flag
  const significantPenalty = pressure.hasSignificantPressure ? 10 : 0;

  // Evidence strength: more evidence means more verifiable pressure
  const avgEvidenceStrength = pressure.evidence.length > 0
    ? pressure.evidence.reduce((sum, e) => sum + e.strength, 0) / pressure.evidence.length
    : 0;
  const evidenceEffect = avgEvidenceStrength * 0.1;

  const raw = BASELINE + trustEffect + heatEffect + urgencyEffect
    - lostPenalty - significantPenalty + evidenceEffect;

  const inputs: EvaluationDimensionSnapshot['inputs'] = {
    netHeatDelta: Math.round(pressure.netHeatDelta * 100) / 100,
    netTrustDelta: Math.round(pressure.netTrustDelta * 100) / 100,
    netUrgencyDelta: Math.round(pressure.netUrgencyDelta * 100) / 100,
    lostToRival: pressure.lostToRival,
    hasSignificantPressure: pressure.hasSignificantPressure,
    evidenceCount: pressure.evidence.length,
    avgEvidenceStrength: Math.round(avgEvidenceStrength),
  };

  const note = pressure.lostToRival
    ? 'Case lost to rival — competition pressure is terminal.'
    : pressure.hasSignificantPressure
      ? 'Significant competition pressure detected.'
      : 'Competition pressure evaluated from receipt data.';

  return dimension('d4', 'D4 竞争与服务路径优势', raw, undefined, inputs, note);
}

/**
 * Extend an existing AssetScoreSnapshot with a D4 dimension derived from
 * a CompetitionPressureSnapshot.
 *
 * This function wraps buildAssetScoreSnapshotFromLegacyCase and adds D4.
 * The original function is NOT modified — this is a pure composition.
 *
 * The snapshot's total score (competitiveness) does NOT include D4 in Round 1,
 * because D4 is a new dimension without legacy equivalent. The total remains
 * the legacy D1/D2/D3 weighted sum for backward compatibility.
 *
 * Blockers and topDrivers are updated to reflect D4 signals when present.
 */
export function buildAssetScoreSnapshotFromLegacyCaseWithCompetition(
  state: Pick<GameState, 'day' | 'opportunities'>,
  caseItem: Case,
  pressure: CompetitionPressureSnapshot,
): AssetScoreSnapshot {
  const baseSnapshot = buildAssetScoreSnapshotFromLegacyCase(state, caseItem);
  const d4 = buildD4CompetitionServicePathDimension(pressure);

  // Extend blockers with D4 signals
  const extraBlockers: string[] = [];
  if (pressure.lostToRival) {
    extraBlockers.push('已流失给竞品');
  }
  if (pressure.hasSignificantPressure && d4.score < 30) {
    extraBlockers.push('竞争压力严重');
  }

  // Extend topDrivers with D4
  const extraDrivers: AssetScoreDimensionDriver[] = [];
  if (d4.score >= 70) {
    extraDrivers.push({ label: '竞争与服务路径', value: d4.score, contribution: 'positive' });
  } else if (d4.score < 30) {
    extraDrivers.push({ label: '竞争与服务路径', value: d4.score, contribution: 'negative' });
  }

  // D4 contract: `score` is intentionally NOT recalculated. D4 does not
  // participate in the total in Round 1 — it's a read-only evaluation signal
  // derived from C's CompetitionPressureSnapshot, not a Case truth.
  return {
    ...baseSnapshot,
    dimensions: {
      ...baseSnapshot.dimensions,
      d4,
    },
    blockers: Object.freeze([...baseSnapshot.blockers, ...extraBlockers]),
    topDrivers: Object.freeze([...baseSnapshot.topDrivers, ...extraDrivers]),
  };
}

// ---------------------------------------------------------------------------
// D4 from live PressureReceiptBundle (DailyTickResult.pressureReceipts)
// ---------------------------------------------------------------------------

/**
 * Find the CompetitionPressureSnapshot for a specific case from a
 * PressureReceiptBundle. Returns undefined if no matching snapshot exists.
 *
 * Pure function. Does not mutate the bundle.
 */
export function findCompetitionPressureSnapshotForCase(
  receipts: PressureReceiptBundle | null | undefined,
  caseId: string,
): CompetitionPressureSnapshot | undefined {
  if (!receipts) return undefined;
  return receipts.snapshots.find((snap) => snap.caseId === caseId);
}

/**
 * Build an AssetScoreSnapshot with D4 derived from live pressure receipts
 * (e.g. DailyTickResult.pressureReceipts).
 *
 * Behavior:
 * - No receipts or no matching snapshot for this case: D4 is undefined
 * - Matching snapshot found: D4 is computed and attached
 * - snapshot.score (total) is NOT affected by D4 in Round 1
 * - Case is NOT mutated
 *
 * Pure function. Does not mutate state, caseItem, or receipts.
 */
export function buildAssetScoreSnapshotFromLegacyCaseWithPressureReceipts(
  state: Pick<GameState, 'day' | 'opportunities'>,
  caseItem: Case,
  receipts: PressureReceiptBundle | null | undefined,
): AssetScoreSnapshot {
  const pressure = findCompetitionPressureSnapshotForCase(receipts, caseItem.id);
  if (!pressure) {
    return buildAssetScoreSnapshotFromLegacyCase(state, caseItem);
  }
  return buildAssetScoreSnapshotFromLegacyCaseWithCompetition(state, caseItem, pressure);
}

// ---------------------------------------------------------------------------
// D4 Receipt Coverage / Confidence
// ---------------------------------------------------------------------------

/**
 * Sources that have runtime mutation hooks wired (Agent C).
 * These are ConstraintSignalSource values (what actually appears in signals),
 * not PressureInputSource values. The receipt builder maps:
 *   rival-pressure → rival-listing
 *   competition-group / competition-rival-loss → competition-group
 *   (others map 1:1)
 */
const D4_WIRED_SOURCES: readonly string[] = [
  'customer-feedback',
  'rival-customer-pull',
  'rival-listing',
  'competition-group',
];

/** Sources that have legacy mutation sites but no receipt hooks yet. */
const D4_PENDING_SOURCES: readonly string[] = [
  'company-pressure',
  'random-event',
  'scripted-event',
];

/** Sources that are informational-only (no Case/Opportunity mutation). */
const D4_INFORMATIONAL_SOURCES: readonly string[] = [
  'market-signal',
];

/** D4 baseline confidence when all wired sources are present. */
const D4_BASELINE_CONFIDENCE = 0.75;

/**
 * Build a coverage report explaining which pressure sources are feeding D4
 * and which are still missing.
 *
 * Pure function. Does not mutate receipts.
 */
export function buildD4ReceiptCoverageReport(
  receipts: PressureReceiptBundle | null | undefined,
): D4ReceiptCoverageReport {
  const presentSources = new Set<string>();
  if (receipts) {
    for (const snap of receipts.snapshots) {
      for (const signal of snap.signals) {
        presentSources.add(signal.source);
      }
    }
  }

  const sources: D4SourceCoverageEntry[] = [];
  let wiredCount = 0;

  for (const source of D4_WIRED_SOURCES) {
    const present = presentSources.has(source);
    if (present) wiredCount++;
    sources.push({ source, category: 'wired', present });
  }

  for (const source of D4_PENDING_SOURCES) {
    sources.push({ source, category: 'pending', present: presentSources.has(source) });
  }

  for (const source of D4_INFORMATIONAL_SOURCES) {
    sources.push({ source, category: 'informational', present: presentSources.has(source) });
  }

  const coverage = wiredCount / D4_WIRED_SOURCES.length;

  return Object.freeze({
    sources: Object.freeze(sources),
    wiredCount,
    wiredTotal: D4_WIRED_SOURCES.length,
    pendingSources: Object.freeze([...D4_PENDING_SOURCES]),
    coverage,
    maxConfidence: D4_BASELINE_CONFIDENCE * coverage,
  });
}

/**
 * Compute the D4 confidence value, capped by receipt coverage.
 *
 * D4 confidence = baseline (0.75) × coverage ratio.
 * This ensures D4 confidence never exceeds what the available data can support.
 *
 * Pure function.
 */
export function buildD4ConfidenceFromCoverage(
  coverage: D4ReceiptCoverageReport,
): number {
  return coverage.maxConfidence;
}
