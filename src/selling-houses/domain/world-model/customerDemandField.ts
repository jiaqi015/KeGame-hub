/**
 * CustomerDemandField — 大世界客户需求场。
 *
 * 核心约束：
 * - N:M 关系：一个客户可以比较多个 listing，一个 listing 可以被多个客户关注。
 * - 注意力守恒：一个客户每天认真比较的房源数量有限。
 * - 客户偏好维度：school / commute / improvement / low_total_price / liquidity / rent_option。
 *
 * 不直接 import runtime / application / UI。
 */

// ── 基础类型 ────────────────────────────────────────────────

/** 客户偏好维度。 */
export type CustomerPreferenceDimension =
  | 'school'
  | 'commute'
  | 'improvement'
  | 'low_total_price'
  | 'liquidity'
  | 'rent_option';

/** 客户在生态中的可见性。 */
export type DemandEntityVisibility = 'active' | 'dormant' | 'churned';

/** 客户决策风格。 */
export type DemandDecisionStyle = 'decisive' | 'comparison_heavy' | 'cautious' | 'broker_guided';

/** 单个客户需求实体。 */
export interface CustomerDemandEntity {
  readonly customerId: string;
  readonly acnId: string;
  readonly brokerId: string;
  /** 目标商圈。 */
  readonly targetDistrict: string;
  /** 目标市场 cell id。 */
  readonly targetMarketCellId: string;
  /** 预算下限（万元）。 */
  readonly budgetMin: number;
  /** 预算上限（万元）。 */
  readonly budgetMax: number;
  /** 偏好户型。 */
  readonly preferredLayouts: readonly string[];
  /** 偏好面积范围。 */
  readonly areaMin: number;
  readonly areaMax: number;
  /** 偏好维度权重（各维度 0-100）。 */
  readonly preferenceWeights: Readonly<Record<CustomerPreferenceDimension, number>>;
  /** 决策风格。 */
  readonly decisionStyle: DemandDecisionStyle;
  /** 紧迫度 0-100。 */
  urgency: number;
  /** 价格敏感度 0-100。 */
  readonly priceSensitivity: number;
  /** 状态。 */
  visibility: DemandEntityVisibility;
  /** 今日已认真比较的 listing 数量（每日重置）。 */
  dailyComparisonCount: number;
  /** 每天认真比较的上限。 */
  readonly dailyComparisonLimit: number;
  /** 活跃天数。 */
  activeDays: number;
}

/** 客户-房源关注关系。 */
export interface DemandListingAttention {
  /** 关系 id。 */
  readonly attentionId: string;
  /** 客户 id。 */
  readonly customerId: string;
  /** listing id（可以是 player、rival、shadow 任何一层）。 */
  readonly listingId: string;
  /** 匹配度 0-100。 */
  fit: number;
  /** 关注强度 0-100。 */
  interest: number;
  /** 信息置信度 0-100。 */
  confidence: number;
  /** 首次关注日。 */
  readonly firstAttentionDay: number;
  /** 最后活跃日。 */
  lastActiveDay: number;
}

// ── 偏好计算 ────────────────────────────────────────────────

/**
 * 计算客户对一个 listing 的匹配度。
 * 不依赖任何 runtime 状态。
 */
export function computeDemandFit(
  customer: CustomerDemandEntity,
  listingAskPrice: number,
  listingLayout: string,
  listingArea: number,
  listingPriceBand: string,
): number {
  // 户型匹配
  const layoutMatch = customer.preferredLayouts.includes(listingLayout) ? 25 : 5;

  // 面积匹配
  const areaMid = (customer.areaMin + customer.areaMax) / 2;
  const areaGap = Math.abs(listingArea - areaMid) / areaMid;
  const areaScore = Math.max(0, 20 - areaGap * 40);

  // 价格匹配
  const budgetMid = (customer.budgetMin + customer.budgetMax) / 2;
  const priceGap = Math.abs(listingAskPrice - budgetMid) / budgetMid;
  const priceScore = Math.max(0, 30 - priceGap * 60);

  // 价格带偏好（低价偏好加分）
  const lowPriceBonus = customer.preferenceWeights.low_total_price > 60 && listingAskPrice <= customer.budgetMax * 0.9
    ? 10
    : 0;

  // 流动性偏好（liquidity 高的 listing 加分）
  const liquidityBonus = customer.preferenceWeights.liquidity > 50 ? 5 : 0;

  return Math.min(100, Math.max(0, layoutMatch + areaScore + priceScore + lowPriceBonus + liquidityBonus));
}

// ── 需求场生成 ──────────────────────────────────────────────

export interface DemandFieldConfig {
  /** 每个市场 cell 生成的客户数量。 */
  readonly customersPerCell: number;
  /** 基础每日比较上限。 */
  readonly baseDailyComparisonLimit: number;
}

export const DEFAULT_DEMAND_FIELD_CONFIG: DemandFieldConfig = {
  customersPerCell: 5,
  baseDailyComparisonLimit: 4,
};

const ALL_PREFERENCE_DIMENSIONS: readonly CustomerPreferenceDimension[] = [
  'school', 'commute', 'improvement', 'low_total_price', 'liquidity', 'rent_option',
];

const ALL_DECISION_STYLES: readonly DemandDecisionStyle[] = [
  'decisive', 'comparison_heavy', 'cautious', 'broker_guided',
];

const DISTRICTS = ['东城', '西城', '朝阳', '海淀', '丰台', '大兴'];

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

function seededPick<T>(seed: string, arr: readonly T[]): T {
  return arr[stableHash(seed) % arr.length];
}

/**
 * 生成客户需求数。每个客户归属一个 broker/acn。
 */
export function generateDemandField(
  marketCellIds: readonly string[],
  brokerIds: readonly string[],
  acnIds: readonly string[],
  config: DemandFieldConfig = DEFAULT_DEMAND_FIELD_CONFIG,
  seed: number = 42,
): CustomerDemandEntity[] {
  const customers: CustomerDemandEntity[] = [];
  let counter = 0;

  for (let ci = 0; ci < marketCellIds.length; ci += 1) {
    const cellId = marketCellIds[ci];

    for (let i = 0; i < config.customersPerCell; i += 1) {
      counter += 1;
      const salt = `cust-${seed}-${cellId}-${i}`;
      const brokerId = brokerIds[stableHash(`${salt}-broker`) % brokerIds.length];
      const acnId = acnIds[stableHash(`${salt}-acn`) % acnIds.length];
      const district = DISTRICTS[stableHash(`${salt}-district`) % DISTRICTS.length];
      const budgetBase = seededInt(`${salt}-budget`, 200, 800);
      const budgetMin = Math.round(budgetBase * 0.85);
      const budgetMax = Math.round(budgetBase * 1.15);

      const prefWeights: Record<CustomerPreferenceDimension, number> = {} as Record<CustomerPreferenceDimension, number>;
      // 给每个维度分配权重，确保至少一个高权重
      for (const dim of ALL_PREFERENCE_DIMENSIONS) {
        prefWeights[dim] = seededInt(`${salt}-pref-${dim}`, 10, 80);
      }
      // 提升一个主偏好
      const primaryDim = seededPick(`${salt}-primary`, ALL_PREFERENCE_DIMENSIONS);
      prefWeights[primaryDim] = Math.min(100, prefWeights[primaryDim] + 30);

      const layoutCount = seededInt(`${salt}-lcount`, 1, 3);
      const LAYOUTS = ['1室1厅', '2室1厅', '2室2厅', '3室1厅', '3室2厅', '4室2厅'];
      const layouts: string[] = [];
      for (let l = 0; l < layoutCount; l += 1) {
        const lay = LAYOUTS[stableHash(`${salt}-lay-${l}`) % LAYOUTS.length];
        if (!layouts.includes(lay)) layouts.push(lay);
      }

      customers.push({
        customerId: `cust-${counter}`,
        acnId,
        brokerId,
        targetDistrict: district,
        targetMarketCellId: cellId,
        budgetMin,
        budgetMax,
        preferredLayouts: layouts,
        areaMin: seededInt(`${salt}-amin`, 50, 90),
        areaMax: seededInt(`${salt}-amax`, 90, 180),
        preferenceWeights: prefWeights,
        decisionStyle: seededPick(`${salt}-style`, ALL_DECISION_STYLES),
        urgency: seededInt(`${salt}-urgency`, 20, 85),
        priceSensitivity: seededInt(`${salt}-sens`, 30, 90),
        visibility: 'active',
        dailyComparisonCount: 0,
        dailyComparisonLimit: config.baseDailyComparisonLimit + seededInt(`${salt}-limit`, -1, 2),
        activeDays: 0,
      });
    }
  }

  return customers;
}

// ── 注意力操作 ──────────────────────────────────────────────

/**
 * 尝试让客户关注一个 listing。
 * 受注意力守恒限制：超过每日比较上限时拒绝。
 * 返回是否成功。
 */
export function tryAttentToListing(
  customer: CustomerDemandEntity,
  listingId: string,
  fit: number,
  currentDay: number,
  existingAttentions: DemandListingAttention[],
): { accepted: boolean; attention?: DemandListingAttention } {
  // 注意力守恒检查
  if (customer.dailyComparisonCount >= customer.dailyComparisonLimit) {
    return { accepted: false };
  }

  // 重复检查
  if (existingAttentions.some((a) => a.customerId === customer.customerId && a.listingId === listingId)) {
    return { accepted: false };
  }

  const attention: DemandListingAttention = {
    attentionId: `${customer.customerId}-${listingId}`,
    customerId: customer.customerId,
    listingId,
    fit,
    interest: Math.min(100, Math.max(0, fit + customer.urgency * 0.2)),
    confidence: Math.min(100, Math.max(0, 30 + fit * 0.4 + customer.urgency * 0.1)),
    firstAttentionDay: currentDay,
    lastActiveDay: currentDay,
  };

  customer.dailyComparisonCount += 1;
  return { accepted: true, attention };
}

// ── 查询工具 ─────────────────────────────────────────────

export function getActiveDemandEntities(customers: readonly CustomerDemandEntity[]): CustomerDemandEntity[] {
  return customers.filter((c) => c.visibility === 'active');
}

export function getAttentionsForCustomer(
  attentions: readonly DemandListingAttention[],
  customerId: string,
): DemandListingAttention[] {
  return attentions.filter((a) => a.customerId === customerId);
}

export function getAttentionsForListing(
  attentions: readonly DemandListingAttention[],
  listingId: string,
): DemandListingAttention[] {
  return attentions.filter((a) => a.listingId === listingId);
}

/**
 * 每日重置客户注意力计数。
 */
export function resetDailyCustomerComparisonCounts(customers: CustomerDemandEntity[]): void {
  for (const c of customers) {
    c.dailyComparisonCount = 0;
    if (c.visibility === 'active') {
      c.activeDays += 1;
    }
  }
}

/**
 * 每日衰减注意力关系。
 * 超过 3 天未活跃的关系 interest 衰减。
 */
export function decayStaleAttentions(
  attentions: DemandListingAttention[],
  currentDay: number,
): void {
  for (const a of attentions) {
    const staleDays = currentDay - a.lastActiveDay;
    if (staleDays > 3) {
      a.interest = Math.max(0, a.interest - staleDays * 2);
      a.confidence = Math.max(0, a.confidence - staleDays);
    }
  }
}
