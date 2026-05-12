// ---------------------------------------------------------------------------
// seededMarketWorld — deterministic MarketOpeningSnapshot factory
//
// Same seed + same config = identical output. No randomness leaks.
// Uses domain/utils.ts RandomSource for all RNG.
// ---------------------------------------------------------------------------

import {
  clamp,
  normalizeSeed,
  nextRandom,
  randomInt,
  randomFloat,
  pickRandom,
  type RandomSource,
} from '../utils.js';

import type {
  CityCycleState,
  CityCyclePhase,
  MarketHeatDirection,
  MarketCellSnapshot,
  MarketCellHeatBand,
  MarketCellPriceTrend,
  MarketCellSignalStrength,
  ACNNetworkSnapshot,
  ACNNetworkRole,
  ListingInventorySnapshot,
  CustomerDemandFieldSnapshot,
  DemandSegment,
  DemandSegmentEntry,
  DemandPreferenceTag,
  PriceBandEntry,
  BrokerNetworkSnapshot,
  NamedRivalBrokerSummary,
  BrokerStyle,
  BrokerStyleDistribution,
  RecentWorldEvent,
  RecentWorldEventType,
  MarketOpeningSnapshot,
} from './marketWorldTypes.js';

// --- Input contract ---------------------------------------------------------

export interface MarketOpeningInput {
  /** Primary seed — must be deterministic per run. */
  seed: number;
  /** Scenario name for provenance. */
  scenarioName: string;
  /** Difficulty id for provenance. */
  difficultyId: string;
  /** Number of player cases at game start. */
  playerCaseCount: number;
}

// --- Constants --------------------------------------------------------------

const CELL_NAMES = [
  '和平里板块', '望京商圈', '朝阳公园板块', '中关村学区',
  '亚运村板块', '回龙观商圈', '通州副中心', '大兴新城',
  '西城学区带', '丰台科技园',
];

const ACN_NAMES = [
  '贝壳合作网', '链家优势网', '我爱我家联盟',
  '中原合作圈', '21世纪联盟', '麦田合作网',
];

const BROKER_FAMILY_NAMES = [
  '张', '王', '李', '赵', '刘', '陈', '杨', '黄', '周', '吴',
  '徐', '孙', '马', '朱', '胡', '林', '郭', '何', '高', '罗',
];

const BROKER_GIVEN_NAMES = [
  '强', '伟', '芳', '娜', '敏', '静', '丽', '涛', '明', '军',
  '磊', '洋', '勇', '艳', '杰', '娟', '超', '秀英', '华', '飞',
];

// --- Internal helpers -------------------------------------------------------

function deriveHeatBand(heat: number): MarketCellHeatBand {
  if (heat < 15) return 'ice';
  if (heat < 35) return 'cold';
  if (heat < 60) return 'warm';
  if (heat < 82) return 'hot';
  return 'frenzy';
}

function derivePriceTrend(heat: number, inventoryPressure: number, rng: RandomSource): MarketCellPriceTrend {
  const net = heat - inventoryPressure * 0.6 + randomInt(-8, 8, rng);
  if (net > 65) return 'surging';
  if (net > 45) return 'rising';
  if (net > 25) return 'stable';
  if (net > 10) return 'stagnant';
  return 'declining';
}

function deriveSignalStrength(value: number): MarketCellSignalStrength {
  if (value < 15) return 'none';
  if (value < 38) return 'weak';
  if (value < 65) return 'moderate';
  return 'strong';
}

// --- City Cycle -------------------------------------------------------------

const CYCLE_PHASES: { phase: CityCyclePhase; label: string; heatBase: number }[] = [
  { phase: 'cold',                   label: '市场冷淡期', heatBase: 18 },
  { phase: 'flat',                   label: '市场平稳期', heatBase: 42 },
  { phase: 'hot',                    label: '市场火热期', heatBase: 76 },
  { phase: 'structural_divergence',  label: '结构性分化期', heatBase: 50 },
  { phase: 'school_season',          label: '学区季', heatBase: 62 },
  { phase: 'rental_season',          label: '租赁季', heatBase: 48 },
];

function buildCityCycle(rng: RandomSource): CityCycleState {
  const entry = CYCLE_PHASES[randomInt(0, CYCLE_PHASES.length - 1, rng)];
  const heatDirection: MarketHeatDirection = pickRandom(['rising', 'stable', 'declining'], rng);
  const heatJitter = randomInt(-12, 12, rng);
  return {
    phase: entry.phase,
    heatIndex: clamp(entry.heatBase + heatJitter, 5, 98),
    heatDirection,
    label: entry.label,
  };
}

// --- Market Cells -----------------------------------------------------------

function buildMarketCells(rng: RandomSource): MarketCellSnapshot[] {
  const count = randomInt(3, 5, rng);
  const usedNames = new Set<string>();
  const cells: MarketCellSnapshot[] = [];

  for (let i = 0; i < count; i++) {
    let name = CELL_NAMES[i % CELL_NAMES.length];
    // Ensure uniqueness by appending index if collision
    if (usedNames.has(name)) {
      name = `${name}${i + 1}`;
    }
    usedNames.add(name);

    const heat = randomInt(15, 88, rng);
    const inventoryPressure = randomInt(12, 85, rng);
    const schoolSignal = randomInt(0, 85, rng);
    const commuteSignal = randomInt(15, 90, rng);

    cells.push({
      id: `cell-${i + 1}`,
      name,
      heat,
      heatBand: deriveHeatBand(heat),
      inventoryPressure,
      dealVelocity: clamp(100 - inventoryPressure + randomInt(-15, 15, rng), 8, 95),
      rentHeat: randomInt(10, 78, rng),
      priceTrend: derivePriceTrend(heat, inventoryPressure, rng),
      schoolSignal: deriveSignalStrength(schoolSignal),
      commuteSignal: deriveSignalStrength(commuteSignal),
    });
  }

  return cells;
}

// --- ACN Networks -----------------------------------------------------------

function buildACNNetworks(rng: RandomSource): ACNNetworkSnapshot[] {
  const roles: ACNNetworkRole[] = ['player_acn', 'strong_rival_acn', 'local_relational'];
  const networks: ACNNetworkSnapshot[] = [];

  for (let i = 0; i < roles.length; i++) {
    const name = ACN_NAMES[i % ACN_NAMES.length];
    const role = roles[i];

    // Player ACN: moderate collaboration, moderate aggression
    // Strong rival: high aggression, low collaboration
    // Local relational: high collaboration, low aggression
    const collabBase = role === 'player_acn' ? 55 : role === 'strong_rival_acn' ? 28 : 72;
    const aggrBase = role === 'player_acn' ? 45 : role === 'strong_rival_acn' ? 78 : 25;

    networks.push({
      id: `acn-${i + 1}`,
      name,
      role,
      collaborationLevel: clamp(collabBase + randomInt(-12, 12, rng), 10, 95),
      listingOpenness: clamp(role === 'local_relational' ? 70 : 45 + randomInt(-15, 15, rng), 10, 95),
      infoSpeed: clamp(50 + randomInt(-20, 20, rng), 10, 95),
      competitionAggression: clamp(aggrBase + randomInt(-12, 12, rng), 10, 95),
      coSaleBias: clamp(role === 'local_relational' ? 68 : 40 + randomInt(-15, 15, rng), 8, 92),
    });
  }

  return networks;
}

// --- Listing Inventory ------------------------------------------------------

function buildListingInventory(
  playerCaseCount: number,
  rng: RandomSource,
): ListingInventorySnapshot {
  const shadowListingCount = playerCaseCount + randomInt(8, 22, rng);
  const directRivalListingCount = Math.max(1, Math.round(playerCaseCount * randomFloat(1.2, 2.0, rng)));

  return {
    playerListingCount: playerCaseCount,
    directRivalListingCount,
    shadowListingCount,
    recentTransactionCount: randomInt(5, 18, rng),
    avgDaysOnMarket: randomInt(18, 52, rng),
    avgDiscountPct: randomInt(2, 12, rng),
  };
}

// --- Customer Demand Field --------------------------------------------------

function buildDemandSegments(rng: RandomSource): DemandSegmentEntry[] {
  const allSegments: { segment: DemandSegment; prefs: DemandPreferenceTag[] }[] = [
    { segment: 'first_home',      prefs: ['low_price', 'commute'] },
    { segment: 'upgrade',         prefs: ['quality_community', 'improvement'] },
    { segment: 'school_district', prefs: ['school', 'quality_community'] },
    { segment: 'investment',      prefs: ['investment', 'liquidity'] },
    { segment: 'liquidity',       prefs: ['liquidity', 'low_price'] },
    { segment: 'commute',         prefs: ['commute', 'quality_community'] },
    { segment: 'rental_yield',    prefs: ['investment', 'low_price'] },
  ];

  // Pick 4-5 segments for this market
  const count = randomInt(4, 5, rng);
  const shuffled = [...allSegments].sort(() => nextRandom(rng) - 0.5);
  const selected = shuffled.slice(0, count);

  let remainingWeight = 100;
  return selected.map((entry, i) => {
    const isLast = i === selected.length - 1;
    const weight = isLast ? remainingWeight : clamp(randomInt(12, 35, rng), 8, remainingWeight - (selected.length - i - 1) * 8);
    remainingWeight -= weight;
    return {
      segment: entry.segment,
      weight,
      preferences: entry.prefs,
    };
  });
}

function buildPriceBands(rng: RandomSource): PriceBandEntry[] {
  const bands = [
    { label: '150-250万', minPrice: 150, maxPrice: 250 },
    { label: '250-400万', minPrice: 250, maxPrice: 400 },
    { label: '400-600万', minPrice: 400, maxPrice: 600 },
    { label: '600-800万', minPrice: 600, maxPrice: 800 },
    { label: '800万以上', minPrice: 800, maxPrice: 1500 },
  ];

  let remainingDemand = 100;
  let remainingSupply = 100;

  return bands.map((band, i) => {
    const isLast = i === bands.length - 1;
    const demand = isLast ? remainingDemand : clamp(randomInt(12, 32, rng), 5, remainingDemand - (bands.length - i - 1) * 5);
    const supply = isLast ? remainingSupply : clamp(randomInt(10, 30, rng), 5, remainingSupply - (bands.length - i - 1) * 5);
    remainingDemand -= demand;
    remainingSupply -= supply;
    return {
      ...band,
      demandConcentration: demand,
      supplyConcentration: supply,
    };
  });
}

function buildCustomerDemandField(
  playerCaseCount: number,
  rng: RandomSource,
): CustomerDemandFieldSnapshot {
  const shadowCustomerCount = playerCaseCount * randomInt(3, 8, rng) + randomInt(5, 15, rng);
  return {
    shadowCustomerCount,
    segments: buildDemandSegments(rng),
    priceBands: buildPriceBands(rng),
    demandMomentum: randomInt(25, 82, rng),
  };
}

// --- Broker Network ---------------------------------------------------------

function buildBrokerName(rng: RandomSource): string {
  return pickRandom(BROKER_FAMILY_NAMES, rng) + pickRandom(BROKER_GIVEN_NAMES, rng);
}

function buildBrokerNetwork(
  acnNetworks: readonly ACNNetworkSnapshot[],
  rng: RandomSource,
): BrokerNetworkSnapshot {
  const namedCount = randomInt(3, 5, rng);
  const namedBrokers: NamedRivalBrokerSummary[] = [];

  for (let i = 0; i < namedCount; i++) {
    const acn = acnNetworks[i % acnNetworks.length];
    const style: BrokerStyle = pickRandom(['aggressive', 'steady', 'relationship', 'traffic'], rng);
    namedBrokers.push({
      id: `broker-${i + 1}`,
      name: buildBrokerName(rng),
      acnId: acn.id,
      style,
      infoSpeed: randomInt(30, 88, rng),
      actionIntensity: randomInt(25, 90, rng),
      cooperationTendency: randomInt(20, 80, rng),
      competitionAggression: randomInt(20, 85, rng),
    });
  }

  const shadowBrokerCount = namedCount + randomInt(8, 20, rng);

  const styles: BrokerStyle[] = ['aggressive', 'steady', 'relationship', 'traffic'];
  const styleDistribution: BrokerStyleDistribution[] = styles.map((style) => ({
    style,
    count: Math.max(1, Math.round((namedCount + shadowBrokerCount) * randomFloat(0.15, 0.35, rng))),
  }));

  return {
    namedBrokers,
    shadowBrokerCount,
    styleDistribution,
    totalBrokerCount: namedCount + shadowBrokerCount,
  };
}

// --- Recent World Events ----------------------------------------------------

const EVENT_TEMPLATES: { type: RecentWorldEventType; summaryTemplate: string }[] = [
  { type: 'rival_listing_repriced',   summaryTemplate: '周边竞品房源调价' },
  { type: 'market_heat_shift',        summaryTemplate: '板块热度出现变化' },
  { type: 'customer_demand_shift',    summaryTemplate: '客户需求偏好出现偏移' },
  { type: 'listing_withdrawn',        summaryTemplate: '有业主撤牌不卖了' },
  { type: 'transaction_closed',       summaryTemplate: '近期有一笔成交' },
  { type: 'policy_signal',            summaryTemplate: '政策面出现新信号' },
  { type: 'new_listing_inflow',       summaryTemplate: '新增挂牌量上升' },
];

function buildRecentWorldEvents(
  marketCells: readonly MarketCellSnapshot[],
  rng: RandomSource,
): RecentWorldEvent[] {
  const count = randomInt(3, 6, rng);
  const events: RecentWorldEvent[] = [];

  for (let i = 0; i < count; i++) {
    const template = EVENT_TEMPLATES[i % EVENT_TEMPLATES.length];
    const cellId = nextRandom(rng) > 0.4
      ? marketCells[randomInt(0, marketCells.length - 1, rng)].id
      : undefined;

    events.push({
      type: template.type,
      summary: template.summaryTemplate,
      marketCellId: cellId,
      daysAgo: randomInt(1, 7, rng),
    });
  }

  return events;
}

// --- Public factory ---------------------------------------------------------

/**
 * Create a deterministic MarketOpeningSnapshot from seed + config.
 *
 * Same seed + same input = byte-identical output.
 * The world exists before the player enters; the player is a local POV.
 */
export function createMarketOpeningSnapshot(input: MarketOpeningInput): MarketOpeningSnapshot {
  const seed = normalizeSeed(input.seed);
  const rng: RandomSource = { rngState: seed, rngCalls: 0 };

  const cityCycle = buildCityCycle(rng);
  const marketCells = buildMarketCells(rng);
  const acnNetworks = buildACNNetworks(rng);
  const listingInventory = buildListingInventory(input.playerCaseCount, rng);
  const customerDemand = buildCustomerDemandField(input.playerCaseCount, rng);
  const brokerNetwork = buildBrokerNetwork(acnNetworks, rng);
  const recentWorldEvents = buildRecentWorldEvents(marketCells, rng);

  return {
    version: 1,
    seed,
    scenarioName: input.scenarioName,
    difficultyId: input.difficultyId,
    playerCaseCount: input.playerCaseCount,
    cityCycle,
    marketCells,
    acnNetworks,
    listingInventory,
    customerDemand,
    brokerNetwork,
    recentWorldEvents,
  };
}
