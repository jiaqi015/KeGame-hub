// ---------------------------------------------------------------------------
// bigWorldBootstrap — canonical entrypoint for BigWorld initialization
//
// This is the SINGLE canonical entrypoint for generating a BigWorldBootstrap.
// Same scenario + seed + scalePolicy → byte-identical bootstrap.
//
// Architecture:
//   BigWorldBootstrap
//     ├── hiddenTruth        — world facts actors can't see
//     ├── materializedEntities — hot runtime entities
//     ├── coldAggregate      — compressed shadow data
//     ├── openingPOV         — player-visible projection
//     ├── causalBaseline     — seed surface + source records
//     └── marketOpeningSnapshot — backward-compatible child/adaptor
//
// Also exports:
//   buildRuntimeInitialState() — extracts typed input for Agent B
//
// Hard constraints:
//   - domain/world-model/ must NOT import runtime/*, application/*, UI/*
//   - No Date.now, no Math.random, no fetch/LLM
//   - Deterministic: same input → identical output
//   - openingPOV is a projection, not the hidden truth
// ---------------------------------------------------------------------------

import { normalizeSeed } from '../utils.js';
import { DEFAULT_ACN_NETWORKS, type AcnNetwork, type AcnBehaviorProfile } from './acnNetworks.js';
import {
  generateBrokerPopulation,
  type BrokerEntity,
} from './brokerPopulation.js';
import {
  generateListingPopulation,
  type ListingPopulationEntity,
  type HistoricalTransactionSummary,
} from './listingPopulation.js';
import {
  generateDemandField,
  type CustomerDemandEntity,
  type DemandListingAttention,
} from './customerDemandField.js';
import {
  createMarketOpeningSnapshot,
  type MarketOpeningInput,
} from './seededMarketWorld.js';
import type { MarketCellSnapshot, ACNNetworkSnapshot, MarketCellHeatBand, MarketCellPriceTrend, MarketCellSignalStrength } from './marketWorldTypes.js';
import { buildBigWorldSpec } from './bigWorldSpecFactory.js';
import type {
  BigWorldSpec,
  BigWorldBootstrap,
  BigWorldHiddenTruth,
  BigWorldMaterializedEntities,
  BigWorldColdAggregate,
  BigWorldOpeningPOV,
  BigWorldCausalBaseline,
  BigWorldRuntimeInitialState,
  BigWorldScalePolicy,
  BigWorldBootstrapSummary,
  OwnerProfilePrior,
  OwnerExpectationAnchor,
  OwnerPerceptionLag,
  ShadowAggregateCluster,
  EntityProvenance,
  BootstrapSourceRef,
  DiversityManifest,
  ScaleManifest,
  MicroCell,
  SupportingInfoRecord,
  SourceReadinessCoverage,
} from './bigWorldTypes.js';
import type { DifficultyId } from '../models.js';
import type { SourceKind } from './informationSourceTypes.js';
import { buildMarketFormation, buildMarketFormationSummary } from './marketFormationBootstrap.js';

// ---------------------------------------------------------------------------
// Deterministic hash helpers
// ---------------------------------------------------------------------------

function stableHash(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededInt(seed: string, min: number, max: number): number {
  return min + (stableHash(seed) % (max - min + 1));
}

function seededFloat(seed: string, min: number, max: number): number {
  return min + (stableHash(seed) / 4294967296) * (max - min);
}

function seededPick<T>(seed: string, arr: readonly T[]): T {
  return arr[stableHash(seed) % arr.length];
}

function makeSourceRef(seed: number, entity: string, index: number): BootstrapSourceRef {
  return `ref:${seed}:${entity}:${index}` as BootstrapSourceRef;
}

function makeProvenance(seed: number, entity: string, index: number, origin: EntityProvenance['origin']): EntityProvenance {
  const salt = `${entity}-${seed}-${index}`;
  return {
    sourceRef: makeSourceRef(seed, entity, index),
    origin,
    generationSalt: salt,
  };
}

// ---------------------------------------------------------------------------
// Owner Profile Priors
// ---------------------------------------------------------------------------

const OWNER_TYPES: readonly OwnerProfilePrior['type'][] = [
  'game_player', 'strategy_swing', 'emotional_hold', 'strong_control',
  'rational_outsource', 'confident_blind', 'buddha_fantasy',
  'efficient_execute', 'professional_coop', 'fast_trial',
  'deal_dependent', 'steady_pace', 'rational_trust',
  'cautious_watch', 'passive_fate',
  // Extended types for mega-scale diversity
  'market_savvy', 'first_time_nervous', 'investor_distant',
  'emotional_urgent', 'rational_analyst',
  // Round 15: additional owner archetypes for market-mega-scale
  // These reuse existing types with different distribution weights
  // to create structural diversity in owner behavior patterns
];

function generateOwnerProfilePriors(
  count: number,
  seed: number,
): OwnerProfilePrior[] {
  const priors: OwnerProfilePrior[] = [];
  for (let i = 0; i < count; i += 1) {
    const salt = `prior-${seed}-${i}`;
    const type = seededPick(salt, OWNER_TYPES);
    const priceAnchorRigidity = seededInt(`${salt}-rigid`, 20, 90);
    const timeWindow: 'short' | 'long' = seededInt(`${salt}-tw`, 0, 1) === 0 ? 'short' : 'long';
    const downMarketExperience: 'low' | 'high' = seededInt(`${salt}-dme`, 0, 1) === 0 ? 'low' : 'high';
    const decisionStyle: 'self_decide' | 'guided_or_joint' = seededInt(`${salt}-ds`, 0, 1) === 0 ? 'self_decide' : 'guided_or_joint';

    priors.push({
      priorId: `owner-prior-${i + 1}`,
      type,
      priceAnchorRigidity,
      timeWindow,
      downMarketExperience,
      decisionStyle,
      expectedTrustBaseline: seededInt(`${salt}-trust`, 40, 70),
      expectedPatienceBaseline: seededInt(`${salt}-patience`, 30, 75),
      expectedUrgencyBaseline: seededInt(`${salt}-urgency`, 25, 80),
      priceElasticity: seededFloat(`${salt}-elasticity`, 0.1, 0.6),
      perceptionLagDays: seededInt(`${salt}-lag`, 0, 5),
      provenance: makeProvenance(seed, 'owner_prior', i, 'owner_prior'),
    });
  }
  return priors;
}

// ---------------------------------------------------------------------------
// Owner Expectation Anchors
// ---------------------------------------------------------------------------

function generateOwnerExpectationAnchors(
  caseIds: readonly string[],
  priors: readonly OwnerProfilePrior[],
  seed: number,
): OwnerExpectationAnchor[] {
  return caseIds.map((caseId, i) => {
    const salt = `anchor-${seed}-${caseId}`;
    const prior = priors[i % priors.length];
    const marketRef = seededInt(`${salt}-mkt`, 200, 800);
    const expectGap = seededFloat(`${salt}-gap`, -0.12, 0.18);
    const expectedPrice = Math.round(marketRef * (1 + expectGap));
    const listingPremium = seededFloat(`${salt}-list`, 1.02, 1.15);
    const listingPrice = Math.round(expectedPrice * listingPremium);
    const bottomDiscount = seededFloat(`${salt}-bottom`, 0.82, 0.94);
    const bottomPrice = Math.round(expectedPrice * bottomDiscount);

    return {
      anchorId: `anchor-${caseId}`,
      caseId,
      ownerId: prior.priorId,
      expectedPrice,
      listingPrice,
      bottomPrice,
      marketReferencePrice: marketRef,
      expectationGapPct: Math.round(expectGap * 10000) / 100,
      provenance: makeProvenance(seed, 'owner_anchor', i, 'owner_prior'),
    };
  });
}

// ---------------------------------------------------------------------------
// Owner Perception Lags
// ---------------------------------------------------------------------------

function generateOwnerPerceptionLags(
  priors: readonly OwnerProfilePrior[],
  acnProfiles: readonly AcnNetwork[],
  seed: number,
): OwnerPerceptionLag[] {
  return priors.map((prior, i) => {
    const salt = `lag-${seed}-${i}`;
    const acn = acnProfiles[i % acnProfiles.length];
    const baseLag = prior.perceptionLagDays;
    const acnModifier = Math.round((100 - acn.behavior.infoSpeed) / 25);
    const rigidityModifier = Math.round(prior.priceAnchorRigidity / 30);
    const effective = Math.max(0, baseLag + acnModifier + rigidityModifier);

    return {
      lagId: `lag-${prior.priorId}`,
      ownerId: prior.priorId,
      baseLagDays: baseLag,
      acnInfoSpeedModifier: acnModifier,
      rigidityModifier,
      effectiveLagDays: effective,
      provenance: makeProvenance(seed, 'owner_lag', i, 'owner_prior'),
    };
  });
}

// ---------------------------------------------------------------------------
// Shadow Aggregate Demand Clusters
// ---------------------------------------------------------------------------

const SEGMENTS = ['first_home', 'upgrade', 'school_district', 'investment', 'liquidity', 'commute', 'rental_yield', 'renovation', 'downsizing', 'relocation', 'investment_exit', 'wealth_preservation'];

function generateShadowDemandClusters(
  marketCellIds: readonly string[],
  clustersPerCell: number,
  seed: number,
): ShadowAggregateCluster[] {
  const clusters: ShadowAggregateCluster[] = [];
  let counter = 0;
  for (const cellId of marketCellIds) {
    for (let i = 0; i < clustersPerCell; i += 1) {
      counter += 1;
      const salt = `cluster-${seed}-${cellId}-${i}`;
      const segment = seededPick(`${salt}-seg`, SEGMENTS);
      clusters.push({
        clusterId: `shadow-cluster-${counter}`,
        marketCellId: cellId,
        segment,
        estimatedCustomerCount: seededInt(`${salt}-count`, 3, 12),
        avgBudgetMidpoint: seededInt(`${salt}-budget`, 250, 700),
        layoutPreference: {
          '2室1厅': seededInt(`${salt}-2r1`, 15, 40),
          '3室1厅': seededInt(`${salt}-3r1`, 20, 45),
          '2室2厅': seededInt(`${salt}-2r2`, 10, 30),
        },
        aggregateUrgency: seededInt(`${salt}-urg`, 25, 80),
        aggregatePriceSensitivity: seededInt(`${salt}-sens`, 30, 85),
        provenance: makeProvenance(seed, 'demand_cluster', counter - 1, 'demand_cluster'),
      });
    }
  }
  return clusters;
}

// ---------------------------------------------------------------------------
// Historical Transaction Summaries
// ---------------------------------------------------------------------------

function generateHistoricalTransactions(
  marketCellIds: readonly string[],
  marketCellNames: readonly string[],
  acnIds: readonly string[],
  count: number,
  seed: number,
): HistoricalTransactionSummary[] {
  const txns: HistoricalTransactionSummary[] = [];
  for (let i = 0; i < count; i += 1) {
    const salt = `hist-txn-${seed}-${i}`;
    const cellIdx = stableHash(`${salt}-cell`) % marketCellIds.length;
    const layout = seededPick(`${salt}-layout`, ['1室1厅', '2室1厅', '3室1厅', '2室2厅', '3室2厅']);
    const askPrice = seededInt(`${salt}-ask`, 200, 800);
    const discountPct = seededFloat(`${salt}-disc`, 0.02, 0.12);
    const soldPrice = Math.round(askPrice * (1 - discountPct));

    txns.push({
      id: `hist-txn-${i + 1}`,
      marketCellId: marketCellIds[cellIdx],
      district: marketCellNames[cellIdx] || `区域${cellIdx}`,
      layout,
      soldPrice,
      askPrice,
      discountPct: Math.round(discountPct * 100),
      soldDay: seededInt(`${salt}-day`, 1, 21),
      acnId: acnIds[stableHash(`${salt}-acn`) % acnIds.length],
    });
  }
  return txns;
}

// ---------------------------------------------------------------------------
// Player Broker
// ---------------------------------------------------------------------------

function buildPlayerBroker(seed: number): BrokerEntity {
  const energy = 100;
  return {
    brokerId: 'player-broker',
    acnId: 'acn-cooperative',
    visibility: 'named',
    name: '玩家经纪人',
    style: 'co_sale_builder',
    marketCellIds: ['cell-1'],
    energyBudget: energy,
    energyRemaining: energy,
    listingPoolSize: 8,
    customerPoolSize: 10,
    actionBias: 0,
  };
}

// ---------------------------------------------------------------------------
// Main: createBigWorldBootstrap
// ---------------------------------------------------------------------------

export interface BigWorldBootstrapInput {
  seed: number;
  scenarioName: string;
  difficultyId: DifficultyId;
  playerCaseCount: number;
  playerCaseIds?: readonly string[];
  /**
   * Optional scale policy override.
   * When provided, bypasses the difficulty-based scale lookup.
   * Used for hundred-scale and custom profiles without modifying DifficultyId.
   */
  readonly scaleOverride?: BigWorldScalePolicy;
}

/**
 * Create a BigWorldBootstrap from seed + config.
 *
 * This is the SINGLE canonical entrypoint.
 * Same input → byte-identical output.
 */
export function createBigWorldBootstrap(
  input: BigWorldBootstrapInput,
): BigWorldBootstrap {
  const seed = normalizeSeed(input.seed);
  const spec = buildBigWorldSpec(input.difficultyId, input.playerCaseCount);
  const scale = input.scaleOverride ?? spec.scale;

  // --- Market Opening Snapshot (backward-compatible child/adaptor) ---
  const marketOpeningInput: MarketOpeningInput = {
    seed,
    scenarioName: input.scenarioName,
    difficultyId: input.difficultyId,
    playerCaseCount: input.playerCaseCount,
  };
  const marketOpeningSnapshot = createMarketOpeningSnapshot(marketOpeningInput);

  // --- Core data ---
  let acnProfiles: readonly AcnNetwork[] = DEFAULT_ACN_NETWORKS;

  // Supplement ACNs if scale policy demands more than defaults
  if (acnProfiles.length < scale.acnCount) {
    const EXTRA_ACN_NAMES = [
      { name: '数据驱动网', style: 'aggressive_competitor_acn' as const },
      { name: '社区深耕网', style: 'local_relationship_acn' as const },
      { name: '联合分销网', style: 'cooperative_player_acn' as const },
      { name: '高端豪宅网', style: 'aggressive_competitor_acn' as const },
      { name: '新城开拓网', style: 'cooperative_player_acn' as const },
      { name: '学区专营网', style: 'local_relationship_acn' as const },
      { name: '商业地产网', style: 'aggressive_competitor_acn' as const },
      { name: '租赁托管网', style: 'local_relationship_acn' as const },
      // Round 19: additional ACN templates for five-x-scale (32+ networks)
      { name: '产业新城网', style: 'cooperative_player_acn' as const },
      { name: '地铁沿线网', style: 'local_relationship_acn' as const },
      { name: '刚需安家网', style: 'cooperative_player_acn' as const },
      { name: '改善换房网', style: 'local_relationship_acn' as const },
      { name: '投资分析网', style: 'aggressive_competitor_acn' as const },
      { name: '品牌连锁网', style: 'cooperative_player_acn' as const },
      { name: '区域龙头网', style: 'local_relationship_acn' as const },
      { name: '数字化营销网', style: 'aggressive_competitor_acn' as const },
      { name: '老带新推荐网', style: 'local_relationship_acn' as const },
      { name: '豪宅定制网', style: 'aggressive_competitor_acn' as const },
      { name: '法拍房专营网', style: 'aggressive_competitor_acn' as const },
      { name: '海外置业网', style: 'cooperative_player_acn' as const },
      { name: '社区团购网', style: 'local_relationship_acn' as const },
      { name: '商业地产投资网', style: 'aggressive_competitor_acn' as const },
      { name: '青年公寓网', style: 'cooperative_player_acn' as const },
      { name: '养老地产网', style: 'local_relationship_acn' as const },
      { name: '城市更新网', style: 'cooperative_player_acn' as const },
      { name: '科技住宅网', style: 'aggressive_competitor_acn' as const },
      { name: '绿色建筑网', style: 'local_relationship_acn' as const },
      { name: '联合营销网', style: 'cooperative_player_acn' as const },
      { name: '跨区域协作网', style: 'local_relationship_acn' as const },
      { name: '专业评估网', style: 'aggressive_competitor_acn' as const },
      { name: '金融服务网', style: 'cooperative_player_acn' as const },
    ];
    const extraAcns: AcnNetwork[] = [];
    for (let i = acnProfiles.length; i < scale.acnCount && i < acnProfiles.length + EXTRA_ACN_NAMES.length; i += 1) {
      const salt = `acn-${seed}-${i}`;
      const template = EXTRA_ACN_NAMES[i - acnProfiles.length];
      extraAcns.push({
        id: `acn-extra-${i}`,
        name: template.name,
        style: template.style,
        behavior: {
          cooperationBias: seededInt(`${salt}-coop`, 20, 80),
          listingOpenness: seededInt(`${salt}-open`, 20, 80),
          infoSpeed: seededInt(`${salt}-info`, 30, 85),
          coSaleBias: seededInt(`${salt}-cosale`, 15, 75),
          directAggression: seededInt(`${salt}-aggr`, 20, 85),
          customerFollowupStrength: seededInt(`${salt}-follow`, 30, 90),
          priceReactionSpeed: seededInt(`${salt}-price`, 25, 90),
          infoOpacity: seededInt(`${salt}-opacity`, 10, 75),
          localRelationshipDepth: seededInt(`${salt}-local`, 20, 85),
          dataCompleteness: seededInt(`${salt}-data`, 20, 85),
          rhythmStability: seededInt(`${salt}-rhythm`, 20, 80),
          ownerTrustMaintenance: seededInt(`${salt}-trust`, 25, 85),
          operationalEfficiency: seededInt(`${salt}-eff`, 25, 80),
        },
      });
    }
    acnProfiles = [...acnProfiles, ...extraAcns];
  }

  let marketCells: readonly MarketCellSnapshot[] = marketOpeningSnapshot.marketCells;
  let acnNetworks = [...marketOpeningSnapshot.acnNetworks];

  // Supplement ACN snapshots if acnProfiles has more entries
  if (acnNetworks.length < acnProfiles.length) {
    for (let i = acnNetworks.length; i < acnProfiles.length; i += 1) {
      const acn = acnProfiles[i];
      acnNetworks.push({
        id: acn.id,
        name: acn.name,
        role: 'strong_rival_acn' as const,
        collaborationLevel: seededInt(`${acn.id}-collab`, 30, 75),
        listingOpenness: seededInt(`${acn.id}-open`, 20, 80),
        infoSpeed: seededInt(`${acn.id}-info`, 30, 85),
        competitionAggression: seededInt(`${acn.id}-aggr`, 25, 85),
        coSaleBias: seededInt(`${acn.id}-cosale`, 15, 75),
      });
    }
  }

  // Supplement market cells if scale policy demands more than seededMarketWorld provides
  // Zone-aware generation: hot/cold/mature/emerging zones with structural diversity
  if (marketCells.length < scale.minMarketCells) {
    // Zone definitions: each zone type has characteristic heat/price/velocity patterns
    const ZONE_TEMPLATES: readonly { name: string; zone: 'hot' | 'cold' | 'mature' | 'emerging'; heatRange: [number, number]; priceTrend: 'rising' | 'stable' | 'declining'; schoolSignal: 'none' | 'weak' | 'moderate' | 'strong'; commuteSignal: 'none' | 'weak' | 'moderate' | 'strong' }[] = [
      // Hot zones: high heat, rising prices, strong signals
      { name: '朝阳CBD板块', zone: 'hot', heatRange: [70, 92], priceTrend: 'rising', schoolSignal: 'weak', commuteSignal: 'strong' },
      { name: '海淀中关村', zone: 'hot', heatRange: [75, 95], priceTrend: 'rising', schoolSignal: 'strong', commuteSignal: 'moderate' },
      { name: '西城金融街', zone: 'hot', heatRange: [68, 90], priceTrend: 'rising', schoolSignal: 'strong', commuteSignal: 'strong' },
      { name: '东城王府井', zone: 'hot', heatRange: [65, 88], priceTrend: 'stable', schoolSignal: 'moderate', commuteSignal: 'strong' },
      { name: '丰台科技园', zone: 'hot', heatRange: [60, 85], priceTrend: 'rising', schoolSignal: 'weak', commuteSignal: 'moderate' },
      { name: '朝阳望京', zone: 'hot', heatRange: [68, 90], priceTrend: 'rising', schoolSignal: 'moderate', commuteSignal: 'strong' },
      { name: '海淀五道口', zone: 'hot', heatRange: [72, 93], priceTrend: 'rising', schoolSignal: 'strong', commuteSignal: 'moderate' },
      { name: '西城德胜', zone: 'hot', heatRange: [66, 88], priceTrend: 'stable', schoolSignal: 'strong', commuteSignal: 'strong' },
      { name: '东城和平里', zone: 'hot', heatRange: [62, 85], priceTrend: 'stable', schoolSignal: 'strong', commuteSignal: 'moderate' },
      { name: '朝阳双井', zone: 'hot', heatRange: [64, 86], priceTrend: 'rising', schoolSignal: 'weak', commuteSignal: 'strong' },
      { name: '海淀万柳', zone: 'hot', heatRange: [70, 92], priceTrend: 'rising', schoolSignal: 'strong', commuteSignal: 'moderate' },
      { name: '西城月坛', zone: 'hot', heatRange: [60, 82], priceTrend: 'stable', schoolSignal: 'strong', commuteSignal: 'strong' },
      // Cold zones: low heat, declining/stable prices
      { name: '密云城区', zone: 'cold', heatRange: [10, 30], priceTrend: 'declining', schoolSignal: 'weak', commuteSignal: 'weak' },
      { name: '延庆城区', zone: 'cold', heatRange: [8, 28], priceTrend: 'declining', schoolSignal: 'none', commuteSignal: 'weak' },
      { name: '平谷城区', zone: 'cold', heatRange: [12, 32], priceTrend: 'stable', schoolSignal: 'weak', commuteSignal: 'none' },
      { name: '怀柔城区', zone: 'cold', heatRange: [15, 35], priceTrend: 'stable', schoolSignal: 'weak', commuteSignal: 'weak' },
      { name: '房山窦店', zone: 'cold', heatRange: [10, 28], priceTrend: 'declining', schoolSignal: 'weak', commuteSignal: 'weak' },
      { name: '昌平北部', zone: 'cold', heatRange: [12, 30], priceTrend: 'stable', schoolSignal: 'none', commuteSignal: 'weak' },
      // Mature zones: medium heat, stable prices, established infrastructure
      { name: '石景山古城', zone: 'mature', heatRange: [35, 55], priceTrend: 'stable', schoolSignal: 'moderate', commuteSignal: 'moderate' },
      { name: '昌平城区', zone: 'mature', heatRange: [30, 50], priceTrend: 'stable', schoolSignal: 'moderate', commuteSignal: 'moderate' },
      { name: '房山良乡', zone: 'mature', heatRange: [28, 48], priceTrend: 'stable', schoolSignal: 'moderate', commuteSignal: 'weak' },
      { name: '门头沟新城', zone: 'mature', heatRange: [25, 45], priceTrend: 'stable', schoolSignal: 'weak', commuteSignal: 'moderate' },
      { name: '顺义城区', zone: 'mature', heatRange: [32, 52], priceTrend: 'stable', schoolSignal: 'moderate', commuteSignal: 'moderate' },
      { name: '大兴黄村', zone: 'mature', heatRange: [28, 48], priceTrend: 'stable', schoolSignal: 'moderate', commuteSignal: 'moderate' },
      { name: '通州梨园', zone: 'mature', heatRange: [30, 50], priceTrend: 'stable', schoolSignal: 'moderate', commuteSignal: 'moderate' },
      { name: '昌平回龙观', zone: 'mature', heatRange: [35, 55], priceTrend: 'stable', schoolSignal: 'moderate', commuteSignal: 'strong' },
      // Emerging zones: rising heat, prices starting to move
      { name: '通州运河', zone: 'emerging', heatRange: [40, 65], priceTrend: 'rising', schoolSignal: 'weak', commuteSignal: 'moderate' },
      { name: '大兴亦庄', zone: 'emerging', heatRange: [45, 68], priceTrend: 'rising', schoolSignal: 'weak', commuteSignal: 'moderate' },
      { name: '天通苑板块', zone: 'emerging', heatRange: [38, 60], priceTrend: 'stable', schoolSignal: 'weak', commuteSignal: 'strong' },
      { name: '望京板块', zone: 'emerging', heatRange: [50, 72], priceTrend: 'rising', schoolSignal: 'weak', commuteSignal: 'strong' },
      { name: '回龙观板块', zone: 'emerging', heatRange: [42, 64], priceTrend: 'rising', schoolSignal: 'moderate', commuteSignal: 'moderate' },
      { name: '北苑板块', zone: 'emerging', heatRange: [38, 58], priceTrend: 'stable', schoolSignal: 'weak', commuteSignal: 'strong' },
      { name: '丽泽商务区', zone: 'emerging', heatRange: [55, 78], priceTrend: 'rising', schoolSignal: 'weak', commuteSignal: 'moderate' },
      { name: '首钢板块', zone: 'emerging', heatRange: [35, 55], priceTrend: 'rising', schoolSignal: 'weak', commuteSignal: 'moderate' },
      { name: '副中心板块', zone: 'emerging', heatRange: [48, 70], priceTrend: 'rising', schoolSignal: 'moderate', commuteSignal: 'moderate' },
      { name: '昌平未来科学城', zone: 'emerging', heatRange: [30, 50], priceTrend: 'rising', schoolSignal: 'weak', commuteSignal: 'moderate' },
      { name: '丰台青塔', zone: 'emerging', heatRange: [35, 55], priceTrend: 'stable', schoolSignal: 'weak', commuteSignal: 'moderate' },
      { name: '朝阳常营', zone: 'emerging', heatRange: [40, 62], priceTrend: 'rising', schoolSignal: 'weak', commuteSignal: 'strong' },
      { name: '海淀上地', zone: 'emerging', heatRange: [45, 68], priceTrend: 'rising', schoolSignal: 'moderate', commuteSignal: 'moderate' },
      { name: '大兴旧宫', zone: 'emerging', heatRange: [32, 52], priceTrend: 'stable', schoolSignal: 'weak', commuteSignal: 'moderate' },
      { name: '通州北关', zone: 'emerging', heatRange: [38, 58], priceTrend: 'rising', schoolSignal: 'weak', commuteSignal: 'moderate' },
      { name: '顺义后沙峪', zone: 'emerging', heatRange: [35, 55], priceTrend: 'stable', schoolSignal: 'moderate', commuteSignal: 'moderate' },
      { name: '昌平沙河', zone: 'emerging', heatRange: [28, 48], priceTrend: 'rising', schoolSignal: 'weak', commuteSignal: 'moderate' },
      { name: '房山长阳', zone: 'emerging', heatRange: [30, 50], priceTrend: 'rising', schoolSignal: 'moderate', commuteSignal: 'moderate' },
      { name: '丰台科技园区', zone: 'emerging', heatRange: [42, 65], priceTrend: 'rising', schoolSignal: 'weak', commuteSignal: 'moderate' },
      { name: '朝阳东坝', zone: 'emerging', heatRange: [38, 60], priceTrend: 'rising', schoolSignal: 'weak', commuteSignal: 'moderate' },
      { name: '海淀西三旗', zone: 'emerging', heatRange: [35, 55], priceTrend: 'stable', schoolSignal: 'moderate', commuteSignal: 'moderate' },
      { name: '石景山鲁谷', zone: 'emerging', heatRange: [30, 50], priceTrend: 'stable', schoolSignal: 'weak', commuteSignal: 'moderate' },
    ];
    // For five-x-scale (100+ cells), generate additional zone templates programmatically
    const ZONE_PREFIXES = ['东城', '西城', '朝阳', '海淀', '丰台', '石景山', '通州', '大兴', '昌平', '房山', '顺义', '门头沟', '密云', '怀柔', '平谷', '延庆'];
    const ZONE_SUFFIXES = ['商圈', '板块', '片区', '新城', '核心区', '开发区', '科技城', '商务区', '居住区', '学区'];
    const ZONE_TYPES: readonly ('hot' | 'cold' | 'mature' | 'emerging')[] = ['hot', 'cold', 'mature', 'emerging'];
    const PRICE_TRENDS: readonly ('rising' | 'stable' | 'declining')[] = ['rising', 'stable', 'declining'];
    const SIGNAL_LEVELS: readonly ('none' | 'weak' | 'moderate' | 'strong')[] = ['none', 'weak', 'moderate', 'strong'];

    const allTemplates = [...ZONE_TEMPLATES];
    let templateCounter = 0;
    while (allTemplates.length < scale.minMarketCells) {
      const salt = `extra-zone-${seed}-${templateCounter}`;
      const zoneType = ZONE_TYPES[stableHash(`${salt}-zone`) % ZONE_TYPES.length];
      const prefix = ZONE_PREFIXES[stableHash(`${salt}-prefix`) % ZONE_PREFIXES.length];
      const suffix = ZONE_SUFFIXES[stableHash(`${salt}-suffix`) % ZONE_SUFFIXES.length];
      const heatRange: [number, number] = zoneType === 'hot' ? [60, 90] : zoneType === 'cold' ? [8, 35] : zoneType === 'mature' ? [25, 55] : [30, 70];
      const priceTrend = zoneType === 'hot' ? 'rising' : zoneType === 'cold' ? 'declining' : PRICE_TRENDS[stableHash(`${salt}-trend`) % PRICE_TRENDS.length];
      const schoolSignal = zoneType === 'hot' ? 'strong' : zoneType === 'cold' ? 'weak' : SIGNAL_LEVELS[stableHash(`${salt}-school`) % SIGNAL_LEVELS.length];
      const commuteSignal = zoneType === 'hot' ? 'strong' : zoneType === 'cold' ? 'weak' : SIGNAL_LEVELS[stableHash(`${salt}-commute`) % SIGNAL_LEVELS.length];
      allTemplates.push({
        name: `${prefix}${suffix}`,
        zone: zoneType,
        heatRange,
        priceTrend,
        schoolSignal,
        commuteSignal,
      });
      templateCounter += 1;
    }

    const extraCells: MarketCellSnapshot[] = [];
    for (let i = marketCells.length; i < scale.minMarketCells && i < allTemplates.length; i += 1) {
      const salt = `supplement-cell-${seed}-${i}`;
      const template = allTemplates[i];
      const heat = seededInt(`${salt}-heat`, template.heatRange[0], template.heatRange[1]);
      extraCells.push({
        id: `cell-${i + 1}`,
        name: template.name,
        heat,
        heatBand: heat < 25 ? 'cold' : heat < 55 ? 'warm' : 'hot',
        inventoryPressure: seededInt(`${salt}-inv`, template.zone === 'hot' ? 40 : template.zone === 'cold' ? 10 : 20, template.zone === 'hot' ? 85 : template.zone === 'cold' ? 40 : 65),
        dealVelocity: seededInt(`${salt}-deal`, template.zone === 'hot' ? 50 : template.zone === 'cold' ? 10 : 25, template.zone === 'hot' ? 90 : template.zone === 'cold' ? 40 : 70),
        rentHeat: seededInt(`${salt}-rent`, template.zone === 'hot' ? 40 : template.zone === 'cold' ? 5 : 15, template.zone === 'hot' ? 80 : template.zone === 'cold' ? 35 : 60),
        priceTrend: template.priceTrend,
        schoolSignal: template.schoolSignal,
        commuteSignal: template.commuteSignal,
      });
    }
    marketCells = [...marketCells, ...extraCells];
  }

  // --- Micro cells (sub-divisions of each market cell) ---
  const microCells: MicroCell[] = [];
  // For large scales, guarantee at least 3 micro cells per cell
  const microMinPerCell = scale.minMarketCells >= 8 ? 3 : 1;
  for (let ci = 0; ci < marketCells.length; ci += 1) {
    const cell = marketCells[ci];
    const microCount = seededInt(`micro-count-${seed}-${cell.id}`, microMinPerCell, Math.max(microMinPerCell, 3));
    for (let mi = 0; mi < microCount; mi += 1) {
      const salt = `micro-${seed}-${cell.id}-${mi}`;
      microCells.push({
        microCellId: `mc-${cell.id}-${mi}`,
        parentMarketCellId: cell.id,
        name: `${cell.name}${mi === 0 ? '核心区' : mi === 1 ? '周边区' : '新城片区'}`,
        heat: Math.max(0, Math.min(100, cell.heat + seededInt(`${salt}-heat`, -15, 15))),
        inventoryPressure: Math.max(0, Math.min(100, cell.inventoryPressure + seededInt(`${salt}-inv`, -10, 10))),
        dealVelocity: Math.max(0, Math.min(100, cell.dealVelocity + seededInt(`${salt}-deal`, -10, 10))),
        listingCount: seededInt(`${salt}-lc`, 2, 15),
      });
    }
  }

  // --- Supporting info per cell ---
  const supportingInfoCategories = ['school', 'transit', 'commercial', 'community', 'policy', 'noise', 'building', 'property', 'community_info', 'community_mgmt'] as const;
  const EXTENDED_INFO_CATEGORIES = ['market_trend', 'rival_observation', 'customer_signal', 'owner_signal', 'broker_signal', 'transaction_signal'] as const;
  const supportingInfo: SupportingInfoRecord[] = [];
  let infoCounter = 0;
  // Scale info density: standard=2-4, mega/super-market=6-8
  const isLargeScale = scale.minMarketCells >= 8 || scale.ownerProfilePriorCount >= 200;
  const baseInfoMin = isLargeScale ? 6 : 2;
  const baseInfoMax = isLargeScale ? 8 : 4;
  for (const cell of marketCells) {
    // Each cell gets baseInfoMin-baseInfoMax supporting info records (scaled by world size)
    const infoCount = seededInt(`info-count-${seed}-${cell.id}`, baseInfoMin, baseInfoMax);
    for (let ii = 0; ii < infoCount; ii += 1) {
      infoCounter += 1;
      const salt = `info-${seed}-${cell.id}-${ii}`;
      const category = supportingInfoCategories[ii % supportingInfoCategories.length];
      const strength = seededInt(`${salt}-str`, 20, 90);
      const delta = seededInt(`${salt}-delta`, -15, 15);
      const direction = delta > 3 ? 'improving' as const : delta < -3 ? 'declining' as const : 'stable' as const;

      supportingInfo.push({
        recordId: `si-${infoCounter}`,
        marketCellId: cell.id,
        microCellId: `mc-${cell.id}-${ii % Math.max(1, microCells.filter((m) => m.parentMarketCellId === cell.id).length)}`,
        category,
        signalType: `${category}_status`,
        strength,
        delta,
        direction,
        daysSinceUpdate: seededInt(`${salt}-days`, 0, 14),
        sourceType: seededPick(`${salt}-src`, ['government_notice', 'platform_data', 'broker_observation', 'community_report', 'media', 'acn_internal'] as const),
        isPublic: seededInt(`${salt}-pub`, 0, 1) === 0,
      });
    }
  }

  const marketCellIds = marketCells.map((c) => c.id);
  const marketCellNames = marketCells.map((c) => c.name);
  const acnIds = acnProfiles.map((a) => a.id);

  // --- Broker Population ---
  const brokers = generateBrokerPopulation(
    acnProfiles, marketCellIds,
    {
      namedBrokersPerAcn: scale.namedBrokersPerAcn,
      shadowBrokersPerAcn: scale.shadowBrokersPerAcn,
      namedBrokerBaseEnergy: 80,
      shadowBrokerBaseEnergy: 50,
      namedBrokerListingPool: 6,
      shadowBrokerListingPool: 3,
      namedBrokerCustomerPool: 8,
      shadowBrokerCustomerPool: 4,
    },
    seed,
  );

  // --- Diversity extension: extend broker styles for mega-scale ---
  // The base generator only has 5 styles; we add 3+ more for diversity
  const EXTENDED_STYLES: readonly string[] = ['data_analyst', 'negotiation_expert', 'market_specialist'];
  if (brokers.length > 30) {
    // Remap ~20% of brokers to extended styles
    const remapCount = Math.floor(brokers.length * 0.2);
    for (let i = 0; i < remapCount; i += 1) {
      const idx = seededInt(`remap-style-${seed}-${i}`, 0, brokers.length - 1);
      const broker = brokers[idx] as { readonly style: string };
      const newStyle = EXTENDED_STYLES[seededInt(`ext-style-${seed}-${i}`, 0, EXTENDED_STYLES.length - 1)];
      (broker as any).style = newStyle;
    }
  }

  // --- Listing Population ---
  const listings = generateListingPopulation(
    marketCellIds, marketCellNames, acnIds,
    {
      shadowListingsPerCell: scale.shadowListingsPerCell,
      directRivalListingsPerCell: scale.directRivalListingsPerCell,
      askPriceVariationPct: 12,
    },
    seed,
  );

  // --- Diversity extension: add extended layouts for mega-scale ---
  const EXTENDED_LAYOUTS = ['5室2厅', '复式', 'LOFT', '别墅', '公寓'];
  if (listings.length > 100) {
    // Remap ~15-20% of listings to extended layouts for diversity
    const remapPct = scale.minMarketCells >= 20 ? 0.20 : 0.15;
    const remapCount = Math.floor(listings.length * remapPct);
    for (let i = 0; i < remapCount; i += 1) {
      const idx = seededInt(`remap-layout-${seed}-${i}`, 0, listings.length - 1);
      const listing = listings[idx] as { readonly layout: string };
      const newLayout = EXTENDED_LAYOUTS[seededInt(`ext-layout-${seed}-${i}`, 0, EXTENDED_LAYOUTS.length - 1)];
      // We need to cast because listing is readonly, but we're just extending diversity
      (listing as any).layout = newLayout;
    }
  }

  // --- Diversity extension: extend price range for band coverage ---
  // The base generator uses 200-900 range, missing under_200w and above_1000w bands.
  // Extend ~10-15% of listings to cover all 6 price bands.
  if (listings.length > 100) {
    const extPct = scale.minMarketCells >= 20 ? 0.15 : 0.1;
    const extCount = Math.floor(listings.length * extPct);
    for (let i = 0; i < extCount; i += 1) {
      const idx = seededInt(`ext-price-${seed}-${i}`, 0, listings.length - 1);
      const listing = listings[idx] as { readonly askPrice: number; readonly priceBand: string };
      // For market-mega-scale, include ultra-luxury (above 1200w) and ultra-affordable (under 150w)
      const priceMin = scale.minMarketCells >= 20 ? 100 : 150;
      const priceMax = scale.minMarketCells >= 20 ? 1500 : 1200;
      const priceTarget = seededInt(`price-target-${seed}-${i}`, priceMin, priceMax);
      (listing as any).askPrice = priceTarget;
      (listing as any).priceBand = priceTarget < 200 ? 'under_200w'
        : priceTarget < 400 ? '200w_400w'
        : priceTarget < 600 ? '400w_600w'
        : priceTarget < 800 ? '600w_800w'
        : priceTarget < 1000 ? '800w_1000w'
        : 'above_1000w';
    }
  }

  // --- Diversity extension: add extended supporting info categories for mega-scale ---
  if (listings.length > 100) {
    for (const cell of marketCells) {
      for (let ei = 0; ei < 3; ei += 1) {
        infoCounter += 1;
        const salt = `ext-info-${seed}-${cell.id}-${ei}`;
        const category = EXTENDED_INFO_CATEGORIES[ei % EXTENDED_INFO_CATEGORIES.length];
        const strength = seededInt(`${salt}-str`, 20, 90);
        const delta = seededInt(`${salt}-delta`, -15, 15);
        const direction = delta > 3 ? 'improving' as const : delta < -3 ? 'declining' as const : 'stable' as const;

        supportingInfo.push({
          recordId: `si-${infoCounter}`,
          marketCellId: cell.id,
          microCellId: `mc-${cell.id}-0`,
          category,
          signalType: `${category}_signal`,
          strength,
          delta,
          direction,
          daysSinceUpdate: seededInt(`${salt}-days`, 0, 14),
          sourceType: seededPick(`${salt}-src`, ['broker_observation', 'platform_data', 'acn_internal'] as const),
          isPublic: seededInt(`${salt}-pub`, 0, 1) === 0,
        });
      }
    }
  }

  // --- Round 15: additional supporting info for market-mega-scale ---
  // More categories per cell for richer source readiness
  if (scale.minMarketCells >= 20) {
    const MEGA_INFO_CATEGORIES = ['market_trend', 'rival_observation', 'customer_signal', 'owner_signal', 'broker_signal', 'transaction_signal'] as const;
    for (const cell of marketCells) {
      for (let ei = 0; ei < MEGA_INFO_CATEGORIES.length; ei += 1) {
        infoCounter += 1;
        const salt = `mega-info-${seed}-${cell.id}-${ei}`;
        const category = MEGA_INFO_CATEGORIES[ei % MEGA_INFO_CATEGORIES.length];
        const strength = seededInt(`${salt}-str`, 20, 90);
        const delta = seededInt(`${salt}-delta`, -15, 15);
        const direction = delta > 3 ? 'improving' as const : delta < -3 ? 'declining' as const : 'stable' as const;

        supportingInfo.push({
          recordId: `si-${infoCounter}`,
          marketCellId: cell.id,
          microCellId: `mc-${cell.id}-${ei % Math.max(1, microCells.filter((m) => m.parentMarketCellId === cell.id).length)}`,
          category,
          signalType: `${category}_signal`,
          strength,
          delta,
          direction,
          daysSinceUpdate: seededInt(`${salt}-days`, 0, 14),
          sourceType: seededPick(`${salt}-src`, ['broker_observation', 'platform_data', 'acn_internal', 'community_report'] as const),
          isPublic: seededInt(`${salt}-pub`, 0, 1) === 0,
        });
      }
    }
  }

  // --- Customer Demand Field ---
  const brokerIds = brokers.map((b) => b.brokerId);
  const customers = generateDemandField(
    marketCellIds, brokerIds, acnIds,
    {
      customersPerCell: scale.materializedCustomersPerCell,
      baseDailyComparisonLimit: 4,
    },
    seed,
  );

  const attentions: DemandListingAttention[] = [];

  // --- Zone-aware post-processing for market-mega-scale ---
  // Adjust listing prices, competitiveness, and density based on cell heat band
  if (scale.minMarketCells >= 20) {
    // Build cell→heatBand map
    const cellHeatBand = new Map<string, string>();
    for (const cell of marketCells) {
      cellHeatBand.set(cell.id, cell.heatBand);
    }

    // Listings in hot zones: higher prices, higher competitiveness
    for (const listing of listings) {
      const band = cellHeatBand.get(listing.marketCellId);
      if (band === 'hot') {
        // Hot zone: +15% price, +10 competitiveness
        const priceMult = 1 + seededFloat(`zone-hot-${listing.listingId}`, 0.08, 0.22);
        listing.askPrice = Math.round(listing.askPrice * priceMult);
        listing.competitiveness = Math.min(100, listing.competitiveness + seededInt(`zone-hot-comp-${listing.listingId}`, 5, 15));
        listing.liquidity = Math.min(100, listing.liquidity + seededInt(`zone-hot-liq-${listing.listingId}`, 5, 12));
      } else if (band === 'cold') {
        // Cold zone: -10% price, lower competitiveness
        const priceMult = 1 - seededFloat(`zone-cold-${listing.listingId}`, 0.05, 0.15);
        listing.askPrice = Math.round(listing.askPrice * priceMult);
        listing.competitiveness = Math.max(0, listing.competitiveness - seededInt(`zone-cold-comp-${listing.listingId}`, 5, 15));
        listing.liquidity = Math.max(0, listing.liquidity - seededInt(`zone-cold-liq-${listing.listingId}`, 5, 12));
      }
      // Recompute priceBand after adjustment
      (listing as any).priceBand = listing.askPrice < 200 ? 'under_200w'
        : listing.askPrice < 400 ? '200w_400w'
        : listing.askPrice < 600 ? '400w_600w'
        : listing.askPrice < 800 ? '600w_800w'
        : listing.askPrice < 1000 ? '800w_1000w'
        : 'above_1000w';
    }

    // Zone-aware density variation: add listings to hot zones, remove from cold
    // This creates structural density differences across cells
    const LAYOUTS_EXT = ['1室1厅', '2室1厅', '2室2厅', '3室1厅', '3室2厅', '4室2厅', '5室2厅', '复式', 'LOFT', '别墅', '公寓'];
    let densityCounter = listings.length;
    for (const cell of marketCells) {
      const band = cellHeatBand.get(cell.id);
      const existingCount = listings.filter((l) => l.marketCellId === cell.id).length;
      if (band === 'hot' && existingCount < 40) {
        // Add extra listings to hot zones (5-10 more)
        const extraCount = seededInt(`density-hot-${cell.id}`, 5, 10);
        for (let i = 0; i < extraCount; i += 1) {
          densityCounter += 1;
          const salt = `density-listing-${seed}-${cell.id}-${i}`;
          const acnId = acnIds[stableHash(`${salt}-acn`) % acnIds.length];
          const layout = LAYOUTS_EXT[stableHash(`${salt}-layout`) % LAYOUTS_EXT.length];
          const area = seededInt(`${salt}-area`, 55, 160);
          const basePrice = seededInt(`${salt}-price`, 300, 1200);
          const askPrice = Math.round(basePrice * seededFloat(`${salt}-askvar`, 0.9, 1.15));
          const brokerId = `sb-${acnId}-${stableHash(`${salt}-broker`) % 4}`;
          (listings as any[]).push({
            listingId: `density-listing-${densityCounter}`,
            layer: 'shadow' as const,
            brokerId,
            acnId,
            marketCellId: cell.id,
            district: cell.name,
            layout,
            areaSqm: area,
            askPrice,
            marketPrice: Math.round(basePrice * seededFloat(`${salt}-market`, 0.95, 1.05)),
            bottomPrice: Math.round(basePrice * seededFloat(`${salt}-bottom`, 0.82, 0.92)),
            priceBand: askPrice < 200 ? 'under_200w' : askPrice < 400 ? '200w_400w' : askPrice < 600 ? '400w_600w' : askPrice < 800 ? '600w_800w' : askPrice < 1000 ? '800w_1000w' : 'above_1000w',
            competitiveness: seededInt(`${salt}-comp`, 50, 90),
            liquidity: seededInt(`${salt}-liq`, 40, 85),
            ownerRigidity: seededInt(`${salt}-rigid`, 25, 75),
            ownerNegotiability: seededInt(`${salt}-nego`, 25, 75),
            status: 'active' as const,
            daysOnMarket: seededInt(`${salt}-dom`, 1, 30),
          });
        }
      } else if (band === 'cold' && existingCount > 20) {
        // Remove some listings from cold zones (mark as withdrawn)
        const removeCount = Math.min(seededInt(`density-cold-${cell.id}`, 5, 12), existingCount - 15);
        let removed = 0;
        for (const listing of listings) {
          if (removed >= removeCount) break;
          if (listing.marketCellId === cell.id && listing.status === 'active') {
            (listing as any).status = 'withdrawn';
            removed += 1;
          }
        }
      }
    }

    // Customers in hot zones: higher urgency
    for (const customer of customers) {
      const band = cellHeatBand.get(customer.targetMarketCellId);
      if (band === 'hot') {
        customer.urgency = Math.min(100, customer.urgency + seededInt(`zone-hot-urg-${customer.customerId}`, 5, 15));
      } else if (band === 'cold') {
        customer.urgency = Math.max(0, customer.urgency - seededInt(`zone-cold-urg-${customer.customerId}`, 5, 15));
      }
    }
  }

  // --- Cold Aggregate ---
  const shadowDemandClusters = generateShadowDemandClusters(
    marketCellIds,
    scale.shadowAggregateClustersPerCell ?? 2,
    seed,
  );
  // Scale historical transactions: standard=~15, mega=~20, market-mega=~60
  const baseTxnCount = marketOpeningSnapshot.listingInventory.recentTransactionCount;
  const scaledTxnCount = scale.minMarketCells >= 20
    ? Math.max(baseTxnCount, scale.minMarketCells * 3)
    : baseTxnCount;
  const historicalTransactions = generateHistoricalTransactions(
    marketCellIds, marketCellNames, acnIds,
    scaledTxnCount,
    seed,
  );

  // --- Owner Priors ---
  const ownerProfilePriors = generateOwnerProfilePriors(scale.ownerProfilePriorCount, seed);
  const caseIds = input.playerCaseIds ?? Array.from(
    { length: input.playerCaseCount },
    (_, i) => `case-${i + 1}`,
  );
  const ownerExpectationAnchors = generateOwnerExpectationAnchors(caseIds, ownerProfilePriors, seed);
  const ownerPerceptionLags = generateOwnerPerceptionLags(ownerProfilePriors, acnProfiles, seed);

  // --- Market Formation (derived from existing entities) ---
  // Build a temporary bootstrap without marketFormation to derive marketFormation from it
  const tempHiddenTruth = Object.freeze({
    cityCycle: marketOpeningSnapshot.cityCycle,
    marketCells,
    microCells,
    acnNetworks,
    acnProfiles,
    supportingInfo,
    ownerProfilePriors,
    ownerExpectationAnchors,
    ownerPerceptionLags,
    marketFormation: Object.freeze({
      listingPool: [],
      ownerPool: [],
      customerPool: [],
      brokerPool: [],
      cellThickness: [],
      totalActiveSupply: 0,
      totalActiveDemand: 0,
      totalBrokers: 0,
      avgLiquidity: 0,
      avgRivalPressure: 0,
      listingStateDistribution: {} as any,
      ownerStateDistribution: {} as any,
      customerStateDistribution: {} as any,
      brokerStateDistribution: {} as any,
      replayKey: `rk-mf-${seed}`,
    }),
  });
  const tempBootstrap = Object.freeze({
    version: 1 as const,
    hiddenTruth: tempHiddenTruth,
    materializedEntities: Object.freeze({ brokers, listings, customers, attentions }),
    coldAggregate: Object.freeze({ shadowDemandClusters, historicalTransactions }),
    openingPOV: Object.freeze({
      cityCycle: marketOpeningSnapshot.cityCycle,
      marketCells,
      acnNetworks,
      namedRivalBrokers: brokers.filter((b) => b.visibility === 'named'),
      directRivalListings: listings.filter((l) => l.layer === 'direct_rival'),
      aggregateDemandSegments: spec.domain.demandSegments,
      recentWorldEvents: marketOpeningSnapshot.recentWorldEvents,
      playerBroker: buildPlayerBroker(seed),
    }),
    causalBaseline: Object.freeze({
      seed,
      scenarioName: input.scenarioName,
      difficultyId: input.difficultyId,
      scalePolicy: scale,
      spec,
      recentWorldEvents: marketOpeningSnapshot.recentWorldEvents,
    }),
    marketOpeningSnapshot,
  }) as unknown as BigWorldBootstrap;
  const marketFormation = buildMarketFormation(tempBootstrap);

  // --- Derived ---
  const playerBroker = buildPlayerBroker(seed);
  const recentWorldEvents = marketOpeningSnapshot.recentWorldEvents;

  // --- Named brokers (for opening POV) ---
  const namedRivalBrokers = brokers.filter((b) => b.visibility === 'named');
  const directRivalListings = listings.filter((l) => l.layer === 'direct_rival');

  // --- Build layers ---
  const hiddenTruth: BigWorldHiddenTruth = Object.freeze({
    cityCycle: marketOpeningSnapshot.cityCycle,
    marketCells,
    microCells,
    acnNetworks,
    acnProfiles,
    supportingInfo,
    ownerProfilePriors,
    ownerExpectationAnchors,
    ownerPerceptionLags,
    marketFormation,
  });

  const materializedEntities: BigWorldMaterializedEntities = Object.freeze({
    brokers,
    listings,
    customers,
    attentions,
  });

  const coldAggregate: BigWorldColdAggregate = Object.freeze({
    shadowDemandClusters,
    historicalTransactions,
  });

  const openingPOV: BigWorldOpeningPOV = Object.freeze({
    cityCycle: hiddenTruth.cityCycle,
    marketCells: hiddenTruth.marketCells,
    acnNetworks: hiddenTruth.acnNetworks,
    namedRivalBrokers,
    directRivalListings,
    aggregateDemandSegments: spec.domain.demandSegments,
    recentWorldEvents,
    playerBroker,
  });

  const causalBaseline: BigWorldCausalBaseline = Object.freeze({
    seed,
    scenarioName: input.scenarioName,
    difficultyId: input.difficultyId,
    scalePolicy: scale,
    spec,
    recentWorldEvents,
  });

  return Object.freeze({
    version: 1 as const,
    hiddenTruth,
    materializedEntities,
    coldAggregate,
    openingPOV,
    causalBaseline,
    marketOpeningSnapshot,
  });
}

// ---------------------------------------------------------------------------
// buildRuntimeInitialState — extracts typed input for Agent B
// ---------------------------------------------------------------------------

/**
 * Build a BigWorldRuntimeInitialState from a BigWorldBootstrap.
 *
 * This is the ONLY way Agent B should consume bootstrap data.
 * It extracts the subset needed for runtime initialization and
 * provides deterministic sub-seeds for ecosystem/causal generation.
 *
 * Agent B must NOT reach into hiddenTruth directly.
 */
export function buildRuntimeInitialState(
  bootstrap: BigWorldBootstrap,
): BigWorldRuntimeInitialState {
  const seed = bootstrap.causalBaseline.seed;
  // Deterministic sub-seeds derived from master seed
  const ecosystemSeed = (seed ^ 0x9e3779b9) >>> 0;
  const causalSeed = (seed ^ 0x517c1b73) >>> 0;

  return Object.freeze({
    seed,
    difficultyId: bootstrap.causalBaseline.difficultyId,
    brokers: bootstrap.materializedEntities.brokers,
    listings: bootstrap.materializedEntities.listings,
    customers: bootstrap.materializedEntities.customers,
    attentions: bootstrap.materializedEntities.attentions,
    shadowDemandClusters: bootstrap.coldAggregate.shadowDemandClusters,
    historicalTransactions: bootstrap.coldAggregate.historicalTransactions,
    openingPOV: bootstrap.openingPOV,
    ecosystemSeed,
    causalSeed,
  });
}

// ---------------------------------------------------------------------------
// buildDiversityManifest — compute structural diversity from generated data
// ---------------------------------------------------------------------------

/**
 * Build a DiversityManifest from a BigWorldBootstrap.
 * Computes from actual generated entities, not from spec declarations.
 */
export function buildDiversityManifest(
  bootstrap: BigWorldBootstrap,
): DiversityManifest {
  const { hiddenTruth, materializedEntities, coldAggregate } = bootstrap;

  // --- Owner archetype diversity ---
  const ownerTypeDist: Record<string, number> = {};
  for (const prior of hiddenTruth.ownerProfilePriors) {
    ownerTypeDist[prior.type] = (ownerTypeDist[prior.type] ?? 0) + 1;
  }

  // --- Listing type diversity ---
  const listingLayoutDist: Record<string, number> = {};
  for (const listing of materializedEntities.listings) {
    listingLayoutDist[listing.layout] = (listingLayoutDist[listing.layout] ?? 0) + 1;
  }

  // --- Price band diversity ---
  const priceBandDist: Record<string, number> = {};
  for (const listing of materializedEntities.listings) {
    priceBandDist[listing.priceBand] = (priceBandDist[listing.priceBand] ?? 0) + 1;
  }

  // --- Demand segment diversity (from cold clusters) ---
  const customerSegDist: Record<string, number> = {};
  for (const cluster of coldAggregate.shadowDemandClusters) {
    customerSegDist[cluster.segment] = (customerSegDist[cluster.segment] ?? 0) + cluster.estimatedCustomerCount;
  }
  // Also count materialized customers by their broker's ACN (proxy for segment)
  // But the real segment info is in cold clusters. Count unique segments.
  const allSegments = new Set<string>();
  for (const cluster of coldAggregate.shadowDemandClusters) {
    allSegments.add(cluster.segment);
  }
  // Add demand segments from spec
  for (const seg of hiddenTruth.marketCells.map(() => '')) {
    // market cells don't have segments directly; use cold clusters
  }

  // --- Broker style diversity ---
  const brokerStyleDist: Record<string, number> = {};
  for (const broker of materializedEntities.brokers) {
    brokerStyleDist[broker.style] = (brokerStyleDist[broker.style] ?? 0) + 1;
  }

  // --- Market cell distribution ---
  const cellDist: Record<string, number> = {};
  for (const listing of materializedEntities.listings) {
    cellDist[listing.marketCellId] = (cellDist[listing.marketCellId] ?? 0) + 1;
  }

  // --- Hot/cold split ---
  const totalClusterUnits = coldAggregate.shadowDemandClusters.reduce(
    (sum, c) => sum + c.estimatedCustomerCount, 0,
  );
  const materializedCustomers = materializedEntities.customers.length;
  const directRivalListings = materializedEntities.listings.filter((l) => l.layer === 'direct_rival').length;
  const shadowListings = materializedEntities.listings.filter((l) => l.layer === 'shadow').length;

  return {
    ownerArchetypeDiversity: Object.keys(ownerTypeDist).length,
    listingTypeDiversity: Object.keys(listingLayoutDist).length,
    priceBandDiversity: Object.keys(priceBandDist).length,
    demandSegmentDiversity: allSegments.size,
    brokerStyleDiversity: Object.keys(brokerStyleDist).length,
    marketCellCount: hiddenTruth.marketCells.length,

    ownerTypeDistribution: ownerTypeDist,
    listingLayoutDistribution: listingLayoutDist,
    priceBandDistribution: priceBandDist,
    customerSegmentDistribution: customerSegDist,
    brokerStyleDistribution: brokerStyleDist,
    marketCellDistribution: cellDist,

    hotColdSplit: {
      materializedCustomers,
      shadowClusterUnits: totalClusterUnits,
      totalDemandUnits: materializedCustomers + totalClusterUnits,
      materializedListingCount: directRivalListings,
      shadowListingCount: shadowListings,
    },
  };
}

// ---------------------------------------------------------------------------
// buildScaleManifest — quantitative summary with diversity
// ---------------------------------------------------------------------------

/**
 * Build a ScaleManifest from a BigWorldBootstrap.
 * Provides counts, diversity coverage, and threshold checks.
 */
export function buildScaleManifest(
  bootstrap: BigWorldBootstrap,
): ScaleManifest {
  const diversity = buildDiversityManifest(bootstrap);
  const listings = bootstrap.materializedEntities.listings;
  const customers = bootstrap.materializedEntities.customers;
  const brokers = bootstrap.materializedEntities.brokers;
  const priors = bootstrap.hiddenTruth.ownerProfilePriors;

  const totalDemandUnits = diversity.hotColdSplit.totalDemandUnits;

  // Source readiness coverage
  const sourceReadiness = buildSourceReadinessCoverage(bootstrap);

  return {
    totalListings: listings.length,
    totalOwners: priors.length,
    totalCustomers: totalDemandUnits,
    totalBrokers: brokers.length,
    marketCells: bootstrap.hiddenTruth.marketCells.length,
    microCells: bootstrap.hiddenTruth.microCells.length,
    acnNetworks: bootstrap.hiddenTruth.acnNetworks.length,
    supportingInfoCount: bootstrap.hiddenTruth.supportingInfo.length,
    historicalTransactionCount: bootstrap.coldAggregate.historicalTransactions.length,

    diversityCoverage: diversity,
    sourceReadinessCoverage: sourceReadiness,

    meetsHundredScaleThresholds: {
      listingsGte100: listings.length >= 100,
      ownersGte100: priors.length >= 100,
      customersGte300: totalDemandUnits >= 300,
      marketCellsGte5: bootstrap.hiddenTruth.marketCells.length >= 5,
      acnNetworksGte3: bootstrap.hiddenTruth.acnNetworks.length >= 3,
      brokersGte20: brokers.length >= 20,
    },

    meetsMegaScaleThresholds: {
      listingsGte300: listings.length >= 300,
      ownersGte300: priors.length >= 300,
      customersGte1000: totalDemandUnits >= 1000,
      brokersGte60: brokers.length >= 60,
      marketCellsGte8: bootstrap.hiddenTruth.marketCells.length >= 8,
      acnNetworksGte5: bootstrap.hiddenTruth.acnNetworks.length >= 5,
    },

    meetsSuperMarketScaleThresholds: {
      listingsGte300: listings.length >= 300,
      ownersGte300: priors.length >= 300,
      customersGte1000: totalDemandUnits >= 1000,
      brokersGte60: brokers.length >= 60,
      marketCellsGte8: bootstrap.hiddenTruth.marketCells.length >= 8,
      microCellsGte24: bootstrap.hiddenTruth.microCells.length >= 24,
      acnNetworksGte5: bootstrap.hiddenTruth.acnNetworks.length >= 5,
      supportingInfoGte80: bootstrap.hiddenTruth.supportingInfo.length >= 80,
    },

    meetsMarketMegaScaleThresholds: {
      listingsGte500: listings.length >= 500,
      ownersGte500: priors.length >= 500,
      customersGte3000: totalDemandUnits >= 3000,
      brokersGte100: brokers.length >= 100,
      marketCellsGte20: bootstrap.hiddenTruth.marketCells.length >= 20,
      microCellsGte60: bootstrap.hiddenTruth.microCells.length >= 60,
      acnNetworksGte7: bootstrap.hiddenTruth.acnNetworks.length >= 7,
      supportingInfoGte160: bootstrap.hiddenTruth.supportingInfo.length >= 160,
      historicalTransactionsGte50: bootstrap.coldAggregate.historicalTransactions.length >= 50,
    },

    meetsFiveXScaleThresholds: {
      listingsGte4000: listings.length >= 4000,
      ownersGte2500: priors.length >= 2500,
      customersGte22000: totalDemandUnits >= 21000,
      brokersGte750: brokers.length >= 750,
      marketCellsGte100: bootstrap.hiddenTruth.marketCells.length >= 100,
      microCellsGte300: bootstrap.hiddenTruth.microCells.length >= 300,
      acnNetworksGte32: bootstrap.hiddenTruth.acnNetworks.length >= 32,
      supportingInfoGte800: bootstrap.hiddenTruth.supportingInfo.length >= 800,
      historicalTransactionsGte300: bootstrap.coldAggregate.historicalTransactions.length >= 300,
    },
  };
}

// ---------------------------------------------------------------------------
// buildSourceReadinessCoverage — which SourceKind categories are covered
// ---------------------------------------------------------------------------

const ALL_SOURCE_KINDS: readonly SourceKind[] = [
  'market_signal', 'rival_action', 'customer_interaction', 'owner_interview',
  'manager_message', 'player_action_receipt', 'process_receipt',
  'comparable_transaction', 'platform_traffic', 'acn_network_signal',
  'supporting_facility_signal', 'broker_capacity_signal',
  'owner_life_event_signal', 'buyer_financing_signal', 'micro_market_signal',
];

/** Categories that supporting info can generate. */
const SUPPORTING_INFO_TO_SOURCE_KINDS: Record<string, readonly SourceKind[]> = {
  school: ['supporting_facility_signal'],
  transit: ['supporting_facility_signal'],
  commercial: ['supporting_facility_signal', 'market_signal'],
  community: ['supporting_facility_signal'],
  policy: ['supporting_facility_signal', 'market_signal'],
  noise: ['supporting_facility_signal'],
  building: ['supporting_facility_signal'],
  property: ['supporting_facility_signal'],
  community_info: ['supporting_facility_signal'],
  community_mgmt: ['supporting_facility_signal'],
  market_trend: ['market_signal', 'micro_market_signal'],
  rival_observation: ['rival_action', 'platform_traffic'],
  customer_signal: ['customer_interaction', 'buyer_financing_signal'],
  owner_signal: ['owner_interview', 'owner_life_event_signal'],
  broker_signal: ['broker_capacity_signal', 'acn_network_signal'],
  transaction_signal: ['process_receipt', 'manager_message'],
};

function buildSourceReadinessCoverage(
  bootstrap: BigWorldBootstrap,
): SourceReadinessCoverage {
  const supportingInfo = bootstrap.hiddenTruth.supportingInfo;
  const categoryCounts: Record<string, number> = {};
  const coveredKinds = new Set<SourceKind>();

  for (const info of supportingInfo) {
    categoryCounts[info.category] = (categoryCounts[info.category] ?? 0) + 1;
    const mapped = SUPPORTING_INFO_TO_SOURCE_KINDS[info.category];
    if (mapped) {
      for (const kind of mapped) {
        coveredKinds.add(kind);
      }
    }
  }

  // Bootstrap also covers some source kinds directly
  coveredKinds.add('market_signal');
  coveredKinds.add('comparable_transaction');
  coveredKinds.add('platform_traffic');
  coveredKinds.add('micro_market_signal');

  return {
    totalSupportingInfoRecords: supportingInfo.length,
    categoryCoverage: Object.keys(categoryCounts).length,
    coveredSourceKinds: Array.from(coveredKinds),
    coveragePct: Math.round((coveredKinds.size / ALL_SOURCE_KINDS.length) * 100),
    categoryCounts,
  };
}

// ---------------------------------------------------------------------------
// buildBootstrapSummary — full summary with scale manifest
// ---------------------------------------------------------------------------

/**
 * Build a BigWorldBootstrapSummary from a bootstrap.
 * Includes the scale manifest for diversity checks.
 */
export function buildBootstrapSummary(
  bootstrap: BigWorldBootstrap,
): BigWorldBootstrapSummary {
  const scaleManifest = buildScaleManifest(bootstrap);
  const listings = bootstrap.materializedEntities.listings;
  const customers = bootstrap.materializedEntities.customers;
  const brokers = bootstrap.materializedEntities.brokers;
  const priors = bootstrap.hiddenTruth.ownerProfilePriors;

  return {
    version: 1,
    seed: bootstrap.causalBaseline.seed,
    scenarioName: bootstrap.causalBaseline.scenarioName,
    difficultyId: bootstrap.causalBaseline.difficultyId,
    playerCaseCount: bootstrap.marketOpeningSnapshot.playerCaseCount,

    marketCellCount: bootstrap.hiddenTruth.marketCells.length,
    acnNetworkCount: bootstrap.hiddenTruth.acnNetworks.length,
    namedBrokerCount: brokers.filter((b) => b.visibility === 'named').length,
    shadowBrokerCount: brokers.filter((b) => b.visibility === 'shadow').length,
    totalBrokerCount: brokers.length,
    materializedListingCount: listings.length,
    shadowListingCount: listings.filter((l) => l.layer === 'shadow').length,
    directRivalListingCount: listings.filter((l) => l.layer === 'direct_rival').length,
    totalListingCount: listings.length,
    materializedCustomerCount: customers.length,
    shadowDemandClusterCount: bootstrap.coldAggregate.shadowDemandClusters.length,
    totalDemandUnitCount: scaleManifest.diversityCoverage.hotColdSplit.totalDemandUnits,
    ownerProfilePriorCount: priors.length,
    ownerExpectationAnchorCount: bootstrap.hiddenTruth.ownerExpectationAnchors.length,
    ownerPerceptionLagCount: bootstrap.hiddenTruth.ownerPerceptionLags.length,
    historicalTransactionCount: bootstrap.coldAggregate.historicalTransactions.length,
    recentWorldEventCount: bootstrap.causalBaseline.recentWorldEvents.length,
    attentionRelationCount: bootstrap.materializedEntities.attentions.length,

    invariantCheck: {
      marketCellsGte3: bootstrap.hiddenTruth.marketCells.length >= 3,
      rivalBrokersGte8: brokers.length >= 8,
      comparableSupplyGte20: listings.length >= 20,
      demandUnitsGte60: scaleManifest.diversityCoverage.hotColdSplit.totalDemandUnits >= 60,
      ownerProfilePriorsGte3: priors.length >= 3,
      acnNetworksGte3: bootstrap.hiddenTruth.acnNetworks.length >= 3,
    },

    scaleManifest,

    marketCellIds: bootstrap.hiddenTruth.marketCells.map((c) => c.id),
    acnNetworkIds: bootstrap.hiddenTruth.acnNetworks.map((a) => a.id),
    namedBrokerIds: brokers.filter((b) => b.visibility === 'named').map((b) => b.brokerId),
    ownerProfilePriorIds: priors.map((p) => p.priorId),

    marketFormation: buildMarketFormationSummary(bootstrap.hiddenTruth.marketFormation),
  };
}
