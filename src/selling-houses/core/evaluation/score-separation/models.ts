export type LegacyAssetScoreSignalSource =
  | 'legacy-d1'
  | 'legacy-d2'
  | 'legacy-d3'
  | 'case-asset'
  | 'case-owner-readiness';

export interface LegacyAssetScoreSignalView {
  key: string;
  label: string;
  value: number | string | boolean | null;
  source: LegacyAssetScoreSignalSource;
  assetFact: boolean;
  note?: string;
}

export interface AssetIntrinsicQualityView {
  caseId: string;
  signals: {
    askPrice: LegacyAssetScoreSignalView;
    marketPrice: LegacyAssetScoreSignalView;
    bottomPrice: LegacyAssetScoreSignalView;
    priceGapPct: LegacyAssetScoreSignalView;
    priceFlexPct: LegacyAssetScoreSignalView;
    priceFlexScore: LegacyAssetScoreSignalView;
    axisCompositeScore: LegacyAssetScoreSignalView;
    qualityStory: LegacyAssetScoreSignalView;
    heat: LegacyAssetScoreSignalView;
  };
  axisScores: Record<string, number>;
  tags: string[];
  defects: string[];
  story: string;
  note: string;
}

export interface OwnerReadinessInfluenceView {
  caseId: string;
  trust: LegacyAssetScoreSignalView;
  patience: LegacyAssetScoreSignalView;
  urgency: LegacyAssetScoreSignalView;
  windowDays: LegacyAssetScoreSignalView;
  touchedOwnerToday: LegacyAssetScoreSignalView;
  lastOwnerTouchedDay: LegacyAssetScoreSignalView;
  ownerArchetypeId: LegacyAssetScoreSignalView;
  note: string;
}

export interface LegacyD3MixedScoreView {
  score: number;
  isMixedLegacyScore: true;
  assetSignals: {
    priceFlexScore: LegacyAssetScoreSignalView;
    consistencyBaseline: LegacyAssetScoreSignalView;
  };
  ownerReadinessSignals: {
    patience: LegacyAssetScoreSignalView;
    urgency: LegacyAssetScoreSignalView;
    trust: LegacyAssetScoreSignalView;
  };
  legacyWeights: {
    priceFlex: number;
    patience: number;
    urgency: number;
    recentCooperation: number;
    consistency: number;
  };
  canonicalWarning: string;
}

export interface LegacyAssetScoreDecomposition {
  caseId: string;
  day: number;
  legacyTotal: number;
  legacyD1: number;
  legacyD2: number;
  legacyD3: LegacyD3MixedScoreView;
  assetIntrinsicQuality: AssetIntrinsicQualityView;
  ownerReadiness: OwnerReadinessInfluenceView;
  notes: string[];
}

export interface AssetScoreInputDraft {
  caseId: string;
  day: number;
  price: {
    askPrice: number;
    marketPrice: number;
    bottomPrice: number;
    priceGapPct: number;
    priceFlexPct: number;
  };
  axisScores: Record<string, number>;
  story: {
    qualityStory: number;
    tags: string[];
    defects: string[];
    text: string;
  };
  marketFacing: {
    heat: number;
    activeOpportunityCount: number;
    lateStageOpportunityCount: number;
  };
  ownerReadinessContext: {
    trust: number;
    urgency: number;
    patience: number;
    windowDays: number;
    excludedFromIntrinsicAssetQuality: true;
  };
  legacyReference: {
    competitiveness: number;
    d1: number;
    d2: number;
    d3: number;
  };
}
