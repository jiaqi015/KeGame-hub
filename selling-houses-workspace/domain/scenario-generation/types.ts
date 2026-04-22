import type {
  BoardPressureProfile,
  DifficultyId,
  GameRuleOverrides,
  GoalContextId,
  GoalTier,
  ScoreThresholds,
  ScenarioDefinition,
  ScenarioSnapshot,
  WorldSpec,
} from '../models.js';

export interface NumberRange {
  min: number;
  max: number;
}

export type CaseRole =
  | 'anchor'
  | 'fragile'
  | 'traffic'
  | 'grind'
  | 'spoiler'
  | 'sacrifice';

export type PricePosition = 'below' | 'market' | 'premium';
export type WindowPressure = 'wide' | 'normal' | 'tight';
export type TrustBias = 'stable' | 'normal' | 'fragile';
export type HeatBias = 'cold' | 'warm' | 'hot';
export type UrgencyBias = 'low' | 'medium' | 'high';

export type CompetitionTopology = 'district_clusters' | 'paired_pressure' | 'chain_clusters';

export type EventArcId =
  | 'relationship_recovery'
  | 'weekend_burst'
  | 'double_market_balance'
  | 'cross_pressure'
  | 'window_squeeze'
  | 'competition_collapse';

export interface ScenarioGenerationRequest {
  difficultyId: DifficultyId;
  seed: number;
  world?: WorldSpec;
  generationVersion?: string;
}

export interface DifficultyProfile {
  id: DifficultyId;
  label: string;
  playerTargetScore: number;
  caseCount: number;
  maxDayRange: NumberRange;
  startDayRange: NumberRange;
  startMonthPool: number[];
  windowDaysRange: NumberRange;
  initialTrustRange: NumberRange;
  initialPatienceRange: NumberRange;
  initialHeatRange: NumberRange;
  initialUrgencyRange: NumberRange;
  scriptedEventCountRange: NumberRange;
  competitionGroupCountRange: NumberRange;
  randomEventWeights: Record<string, number>;
  ruleAdjustments: GameRuleOverrides;
  generationDifficultyBand: NumberRange;
}

export interface CaseRoleSlot {
  id: string;
  role: CaseRole;
  allowedMarketCellIds?: string[];
  allowedOwnerArchetypeIds?: string[];
  allowedLayouts?: string[];
  pricePosition: PricePosition;
  windowPressure: WindowPressure;
  trustBias: TrustBias;
  heatBias: HeatBias;
  urgencyBias: UrgencyBias;
  mustJoinCompetitionGroup?: boolean;
}

export interface ScenarioBlueprint {
  id: string;
  difficultyId: DifficultyId;
  label: string;
  summary: string;
  weight: number;
  caseRoleSlots: CaseRoleSlot[];
  competitionTopology: CompetitionTopology;
  eventArcId: EventArcId;
  focusMarketCellIds?: string[];
  ruleAdjustments?: GameRuleOverrides;
  randomEventWeightBias?: Record<string, number>;
  naming: {
    titlePool: string[];
    themeFragments: string[];
    descriptionFragments: string[];
  };
}

export interface GeneratedRoleAssignment {
  slotId: string;
  role: CaseRole;
  goalTier: GoalTier;
  caseId: string;
  housePrototypeId: string;
  ownerArchetypeId: string;
  marketCellId: string;
  layout: string;
}

export interface GeneratedGoalContext {
  goalContext: GoalContextId;
  targetScore: number;
  scoreThresholds: ScoreThresholds;
  boardPressureProfile: BoardPressureProfile;
}

export interface DifficultyScoreBreakdown {
  windowPressureScore: number;
  relationshipFragilityScore: number;
  competitionCouplingScore: number;
  pricingMisfitScore: number;
  eventBurstScore: number;
  totalScore: number;
}

export interface ScenarioValidationResult {
  valid: boolean;
  findings: string[];
  breakdown: DifficultyScoreBreakdown;
}

export interface GeneratedScenarioBundle {
  scenario: ScenarioDefinition;
  snapshot: ScenarioSnapshot;
  blueprint: ScenarioBlueprint;
  profile: DifficultyProfile;
  assignments: GeneratedRoleAssignment[];
  validation: ScenarioValidationResult;
  seed: number;
  generationVersion: string;
  attemptCount: number;
}
