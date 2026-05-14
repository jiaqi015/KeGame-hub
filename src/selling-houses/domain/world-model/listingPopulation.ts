/**
 * ListingPopulation — 大世界房源生态种群。
 *
 * 分四层：player listings、direct rival listings、shadow listings、historical transaction summary。
 * 每个 shadow listing 参与价格带、面积/户型、市场 cell、挂牌状态、竞争力、流动性、
 * 业主刚性/可谈空间评估。
 *
 * 不直接 import runtime / application / UI。
 */

// ── 基础类型 ────────────────────────────────────────────────

/** 房源在生态中的可见性。 */
export type ListingPopulationLayer = 'player' | 'direct_rival' | 'shadow' | 'historical';

/** 挂牌状态。 */
export type ListingPopulationStatus = 'active' | 'sold' | 'withdrawn' | 'expired';

/** 房源生态实体。 */
export interface ListingPopulationEntity {
  readonly listingId: string;
  readonly layer: ListingPopulationLayer;
  /** 关联的经纪人 id（可能是 named 或 shadow）。 */
  readonly brokerId: string;
  /** 关联的 ACN id。 */
  readonly acnId: string;
  /** 市场 cell id。 */
  readonly marketCellId: string;
  /** 商圈。 */
  readonly district: string;
  /** 户型（如 "2室1厅"）。 */
  readonly layout: string;
  /** 面积（平米）。 */
  readonly areaSqm: number;
  /** 报价（万元）。 */
  askPrice: number;
  /** 市场参考价（万元）。 */
  readonly marketPrice: number;
  /** 底价下限（万元）。 */
  readonly bottomPrice: number;
  /** 价格带标签。 */
  readonly priceBand: string;
  /** 竞争力得分 0-100。 */
  competitiveness: number;
  /** 流动性得分 0-100：越高越容易被关注/带看。 */
  liquidity: number;
  /** 业主价格刚性 0-100：越高越难调价。 */
  readonly ownerRigidity: number;
  /** 业主可谈判空间 0-100：越高越容易成交。 */
  readonly ownerNegotiability: number;
  status: ListingPopulationStatus;
  /** 在市天数。 */
  daysOnMarket: number;
  /** 关联的 legacy case id（如果玩家侧对应）。 */
  linkedCaseId?: string;
}

// ── 历史成交摘要 ────────────────────────────────────────────

/** 历史成交记录摘要。 */
export interface HistoricalTransactionSummary {
  readonly id: string;
  readonly marketCellId: string;
  readonly district: string;
  readonly layout: string;
  readonly soldPrice: number;
  readonly askPrice: number;
  readonly discountPct: number;
  readonly soldDay: number;
  readonly acnId: string;
}

// ── 价格带计算 ──────────────────────────────────────────────

export function computePriceBand(price: number): string {
  if (price < 200) return 'under_200w';
  if (price < 400) return '200w_400w';
  if (price < 600) return '400w_600w';
  if (price < 800) return '600w_800w';
  if (price < 1000) return '800w_1000w';
  return 'above_1000w';
}

// ── 确定性 RNG ──────────────────────────────────────────────

function stableHash(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededInt(seed: string, min: number, max: number): number {
  const h = stableHash(seed);
  return min + (h % (max - min + 1));
}

function seededFloat(seed: string, min: number, max: number): number {
  return min + (stableHash(seed) / 4294967296) * (max - min);
}

// ── 户型预设 ────────────────────────────────────────────────

const LAYOUTS: readonly string[] = ['1室1厅', '2室1厅', '2室2厅', '3室1厅', '3室2厅', '4室2厅', '5室2厅', '复式', 'LOFT', '别墅', '公寓'];

// ── 种群生成 ────────────────────────────────────────────────

export interface ListingPopulationConfig {
  /** 每个市场 cell 生成的 shadow listing 数量。 */
  readonly shadowListingsPerCell: number;
  /** 每个市场 cell 生成的 direct rival listing 数量。 */
  readonly directRivalListingsPerCell: number;
  /** 挂牌价相对市场价的浮动范围。 */
  readonly askPriceVariationPct: number;
}

export const DEFAULT_LISTING_POPULATION_CONFIG: ListingPopulationConfig = {
  shadowListingsPerCell: 4,
  directRivalListingsPerCell: 2,
  askPriceVariationPct: 12,
};

/**
 * 为给定市场 cell 生成影子和直接竞品房源。
 * 不触碰 player listings（由 legacy runtime 管理）。
 */
export function generateListingPopulation(
  marketCellIds: readonly string[],
  marketCellNames: readonly string[],
  acnIds: readonly string[],
  config: ListingPopulationConfig = DEFAULT_LISTING_POPULATION_CONFIG,
  seed: number = 42,
): ListingPopulationEntity[] {
  const listings: ListingPopulationEntity[] = [];
  let counter = 0;

  for (let ci = 0; ci < marketCellIds.length; ci += 1) {
    const cellId = marketCellIds[ci];
    const cellName = marketCellNames[ci] || `区域${ci}`;

    // Shadow listings
    for (let i = 0; i < config.shadowListingsPerCell; i += 1) {
      counter += 1;
      const salt = `shadow-${seed}-${cellId}-${i}`;
      const acnId = acnIds[stableHash(`${salt}-acn`) % acnIds.length];
      const layout = LAYOUTS[stableHash(`${salt}-layout`) % LAYOUTS.length];
      const area = seededInt(`${salt}-area`, 55, 160);
      const basePrice = seededInt(`${salt}-price`, 200, 900);
      const askVariation = seededFloat(`${salt}-askvar`, -config.askPriceVariationPct, config.askPriceVariationPct);
      const askPrice = Math.round(basePrice * (1 + askVariation / 100));
      const bottomPrice = Math.round(basePrice * seededFloat(`${salt}-bottom`, 0.82, 0.92));
      const marketPrice = Math.round(basePrice * seededFloat(`${salt}-market`, 0.95, 1.05));
      const ownerRigidity = seededInt(`${salt}-rigid`, 20, 90);
      const ownerNegotiability = Math.max(10, 100 - ownerRigidity + seededInt(`${salt}-nego`, -10, 10));
      const brokerId = `sb-${acnId}-${stableHash(`${salt}-broker`) % 4}`;

      listings.push({
        listingId: `shadow-listing-${counter}`,
        layer: 'shadow',
        brokerId,
        acnId,
        marketCellId: cellId,
        district: cellName,
        layout,
        areaSqm: area,
        askPrice,
        marketPrice,
        bottomPrice,
        priceBand: computePriceBand(askPrice),
        competitiveness: seededInt(`${salt}-comp`, 30, 75),
        liquidity: seededInt(`${salt}-liq`, 25, 80),
        ownerRigidity,
        ownerNegotiability,
        status: 'active',
        daysOnMarket: seededInt(`${salt}-dom`, 3, 45),
      });
    }

    // Direct rival listings
    for (let i = 0; i < config.directRivalListingsPerCell; i += 1) {
      counter += 1;
      const salt = `rival-${seed}-${cellId}-${i}`;
      const acnId = acnIds[stableHash(`${salt}-acn`) % acnIds.length];
      const layout = LAYOUTS[stableHash(`${salt}-layout`) % LAYOUTS.length];
      const area = seededInt(`${salt}-area`, 60, 140);
      const basePrice = seededInt(`${salt}-price`, 250, 850);
      const askVariation = seededFloat(`${salt}-askvar`, -config.askPriceVariationPct, config.askPriceVariationPct);
      const askPrice = Math.round(basePrice * (1 + askVariation / 100));
      const bottomPrice = Math.round(basePrice * seededFloat(`${salt}-bottom`, 0.84, 0.94));
      const marketPrice = Math.round(basePrice * seededFloat(`${salt}-market`, 0.96, 1.04));
      const ownerRigidity = seededInt(`${salt}-rigid`, 25, 85);
      const ownerNegotiability = Math.max(10, 100 - ownerRigidity + seededInt(`${salt}-nego`, -10, 10));
      const brokerId = `nb-${acnId}-${stableHash(`${salt}-broker`) % 2}`;

      listings.push({
        listingId: `rival-listing-${counter}`,
        layer: 'direct_rival',
        brokerId,
        acnId,
        marketCellId: cellId,
        district: cellName,
        layout,
        areaSqm: area,
        askPrice,
        marketPrice,
        bottomPrice,
        priceBand: computePriceBand(askPrice),
        competitiveness: seededInt(`${salt}-comp`, 40, 85),
        liquidity: seededInt(`${salt}-liq`, 35, 85),
        ownerRigidity,
        ownerNegotiability,
        status: 'active',
        daysOnMarket: seededInt(`${salt}-dom`, 1, 30),
      });
    }
  }

  return listings;
}

// ── 查询工具 ─────────────────────────────────────────────

export function getListingsByLayer(
  listings: readonly ListingPopulationEntity[],
  layer: ListingPopulationLayer,
): ListingPopulationEntity[] {
  return listings.filter((l) => l.layer === layer);
}

export function getActiveShadowListings(listings: readonly ListingPopulationEntity[]): ListingPopulationEntity[] {
  return listings.filter((l) => l.layer === 'shadow' && l.status === 'active');
}

export function getActiveDirectRivalListings(listings: readonly ListingPopulationEntity[]): ListingPopulationEntity[] {
  return listings.filter((l) => l.layer === 'direct_rival' && l.status === 'active');
}

export function getListingsByMarketCell(
  listings: readonly ListingPopulationEntity[],
  marketCellId: string,
): ListingPopulationEntity[] {
  return listings.filter((l) => l.marketCellId === marketCellId);
}

export function getListingsByPriceBand(
  listings: readonly ListingPopulationEntity[],
  priceBand: string,
): ListingPopulationEntity[] {
  return listings.filter((l) => l.priceBand === priceBand);
}

/**
 * 每日更新所有 listing 生态状态。
 * - daysOnMarket +1
 * - liquidity 自然衰减
 * - 超长在市的 listing 流动性衰减更快
 */
export function tickListingPopulation(listings: ListingPopulationEntity[]): void {
  for (const listing of listings) {
    if (listing.status !== 'active') continue;
    listing.daysOnMarket += 1;
    // 自然衰减
    listing.liquidity = Math.max(0, listing.liquidity - 1);
    // 超过 30 天衰减加速
    if (listing.daysOnMarket > 30) {
      listing.liquidity = Math.max(0, listing.liquidity - 1);
    }
    // 竞争力随流动性同步微降
    listing.competitiveness = Math.max(0, listing.competitiveness - 0.5);
  }
}
