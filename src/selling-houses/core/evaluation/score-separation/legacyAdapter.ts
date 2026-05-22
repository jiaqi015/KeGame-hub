import { SCORING_BALANCE } from '../../business-rules/scoring/scoringBalance.js';
import type {
  LegacyScoreSeparationCaseLike,
  LegacyScoreSeparationStateLike,
  LegacyScoreSeparationOpportunityLike,
} from '../legacyEvaluationContracts.js';
import type {
  AssetScoreInputDraft,
  LegacyAssetScoreDecomposition,
  LegacyAssetScoreSignalSource,
  LegacyAssetScoreSignalView,
} from './models.js';

const LEGACY_D3_WARNING = 'Legacy D3 mixes pricing flexibility with owner readiness signals; it is not the future canonical good-house score.';

function clampScore(value: number, min = 0, max = 100) {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.max(min, Math.min(max, value));
}

function signal(
  key: string,
  label: string,
  value: LegacyAssetScoreSignalView['value'],
  source: LegacyAssetScoreSignalSource,
  assetFact: boolean,
  note?: string,
): LegacyAssetScoreSignalView {
  return {
    key,
    label,
    value,
    source,
    assetFact,
    ...(note ? { note } : {}),
  };
}

function priceFlexPct(caseItem: LegacyScoreSeparationCaseLike) {
  return ((caseItem.askPrice - caseItem.bottomPrice) / Math.max(1, caseItem.askPrice)) * 100;
}

function priceFlexScore(caseItem: LegacyScoreSeparationCaseLike) {
  return clampScore((priceFlexPct(caseItem) / 100) * SCORING_BALANCE.d3Normalization.priceFlexFullScale * 100);
}

function priceGapPct(caseItem: LegacyScoreSeparationCaseLike) {
  if (Number.isFinite(caseItem.priceGapPct)) {
    return caseItem.priceGapPct;
  }
  return ((caseItem.askPrice - caseItem.marketPrice) / Math.max(1, caseItem.marketPrice)) * 100;
}

function axisCompositeScore(caseItem: LegacyScoreSeparationCaseLike) {
  return Object.entries(SCORING_BALANCE.d2AxisWeights).reduce((sum, [axis, weight]) => {
    return sum + (caseItem.axisScores[axis] ?? 50) * weight;
  }, 0);
}

function activeOpportunitiesForCase(state: Pick<LegacyScoreSeparationStateLike, 'opportunities'>, caseId: string) {
  return state.opportunities.filter((entry) => entry.caseId === caseId && entry.status === 'active');
}

function lateStageOpportunityCount(opportunities: readonly LegacyScoreSeparationOpportunityLike[]) {
  return opportunities.filter((entry) => entry.stageIndex >= 3).length;
}

export function decomposeLegacyAssetScore(
  state: Pick<LegacyScoreSeparationStateLike, 'day' | 'opportunities'>,
  caseItem: LegacyScoreSeparationCaseLike,
): LegacyAssetScoreDecomposition {
  const flexPct = priceFlexPct(caseItem);
  const flexScore = priceFlexScore(caseItem);
  const axisScore = axisCompositeScore(caseItem);
  const d3Weights = SCORING_BALANCE.d3SignalWeights;

  const priceFlexSignal = signal(
    'priceFlexScore',
    '价格灵活度',
    flexScore,
    'legacy-d3',
    true,
    'Legacy D3 asset-side signal derived from askPrice and bottomPrice.',
  );
  const patienceSignal = signal(
    'patience',
    '业主耐心',
    caseItem.patience,
    'case-owner-readiness',
    false,
    'Owner readiness influence currently mixed into legacy D3.',
  );
  const urgencySignal = signal(
    'urgency',
    '业主紧迫度',
    caseItem.urgency,
    'case-owner-readiness',
    false,
    'Owner readiness influence currently mixed into legacy D3.',
  );
  const trustSignal = signal(
    'trust',
    '业主信任',
    caseItem.trust,
    'case-owner-readiness',
    false,
    'Owner relationship influence currently mixed into legacy D3 as recent cooperation.',
  );

  return {
    caseId: caseItem.id,
    day: state.day,
    legacyTotal: caseItem.competitiveness,
    legacyD1: caseItem.d1,
    legacyD2: caseItem.d2,
    legacyD3: {
      score: caseItem.d3,
      isMixedLegacyScore: true,
      assetSignals: {
        priceFlexScore: priceFlexSignal,
        consistencyBaseline: signal(
          'consistencyBaseline',
          '一致性基线',
          SCORING_BALANCE.d3Normalization.consistencyBaseline,
          'legacy-d3',
          true,
          'Static legacy baseline, retained only for compatibility decomposition.',
        ),
      },
      ownerReadinessSignals: {
        patience: patienceSignal,
        urgency: urgencySignal,
        trust: trustSignal,
      },
      legacyWeights: {
        priceFlex: d3Weights.priceFlex,
        patience: d3Weights.patience,
        urgency: d3Weights.urgency,
        recentCooperation: d3Weights.recentCooperation,
        consistency: d3Weights.consistency,
      },
      canonicalWarning: LEGACY_D3_WARNING,
    },
    assetIntrinsicQuality: {
      caseId: caseItem.id,
      signals: {
        askPrice: signal('askPrice', '报价', caseItem.askPrice, 'case-asset', true),
        marketPrice: signal('marketPrice', '市场价', caseItem.marketPrice, 'case-asset', true),
        bottomPrice: signal('bottomPrice', '底价', caseItem.bottomPrice, 'case-asset', true),
        priceGapPct: signal('priceGapPct', '报价偏离市场', priceGapPct(caseItem), 'case-asset', true),
        priceFlexPct: signal('priceFlexPct', '价格弹性比例', flexPct, 'case-asset', true),
        priceFlexScore: priceFlexSignal,
        axisCompositeScore: signal('axisCompositeScore', '基础轴综合分', axisScore, 'legacy-d2', true),
        qualityStory: signal('qualityStory', '房源故事质量', caseItem.qualityStory, 'case-asset', true),
        heat: signal(
          'heat',
          '市场热度',
          caseItem.heat,
          'case-asset',
          true,
          'Market-facing demand signal, not an owner relationship field.',
        ),
      },
      axisScores: { ...caseItem.axisScores },
      tags: [...caseItem.tags],
      defects: [...caseItem.defects],
      story: caseItem.story,
      note: 'Intrinsic asset quality is limited to price, house axes, story, and market-facing signals.',
    },
    ownerReadiness: {
      caseId: caseItem.id,
      trust: trustSignal,
      patience: patienceSignal,
      urgency: urgencySignal,
      windowDays: signal(
        'windowDays',
        '窗口天数',
        caseItem.windowDays,
        'case-owner-readiness',
        false,
        'Decision timing influence, not an intrinsic asset fact.',
      ),
      touchedOwnerToday: signal('touchedOwnerToday', '今日触达业主', caseItem.touchedOwnerToday, 'case-owner-readiness', false),
      lastOwnerTouchedDay: signal('lastOwnerTouchedDay', '上次触达业主日', caseItem.lastOwnerTouchedDay, 'case-owner-readiness', false),
      ownerArchetypeId: signal('ownerArchetypeId', '业主类型', caseItem.ownerArchetypeId, 'case-owner-readiness', false),
      note: 'Owner readiness captures relationship, timing, and decision-state influence kept separate from good-house quality.',
    },
    notes: [
      LEGACY_D3_WARNING,
      'No legacy Case fields are deleted or rewritten by this adapter.',
      'Use AssetScoreInputDraft as the migration input shape for a later scoring rewrite.',
    ],
  };
}

export function buildAssetScoreInputDraftFromLegacyCase(
  state: Pick<LegacyScoreSeparationStateLike, 'day' | 'opportunities'>,
  caseItem: LegacyScoreSeparationCaseLike,
): AssetScoreInputDraft {
  const activeOpportunities = activeOpportunitiesForCase(state, caseItem.id);

  return {
    caseId: caseItem.id,
    day: state.day,
    price: {
      askPrice: caseItem.askPrice,
      marketPrice: caseItem.marketPrice,
      bottomPrice: caseItem.bottomPrice,
      priceGapPct: priceGapPct(caseItem),
      priceFlexPct: priceFlexPct(caseItem),
    },
    axisScores: { ...caseItem.axisScores },
    story: {
      qualityStory: caseItem.qualityStory,
      tags: [...caseItem.tags],
      defects: [...caseItem.defects],
      text: caseItem.story,
    },
    marketFacing: {
      heat: caseItem.heat,
      activeOpportunityCount: activeOpportunities.length,
      lateStageOpportunityCount: lateStageOpportunityCount(activeOpportunities),
    },
    ownerReadinessContext: {
      trust: caseItem.trust,
      urgency: caseItem.urgency,
      patience: caseItem.patience,
      windowDays: caseItem.windowDays,
      excludedFromIntrinsicAssetQuality: true,
    },
    legacyReference: {
      competitiveness: caseItem.competitiveness,
      d1: caseItem.d1,
      d2: caseItem.d2,
      d3: caseItem.d3,
    },
  };
}
