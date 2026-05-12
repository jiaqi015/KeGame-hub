/**
 * BrokerPopulation — 大世界经纪人生态种群。
 *
 * 分两层：named rival brokers（玩家能感知到的对手经纪人）和
 * shadow brokers（背景噪声经纪人，参与生态但不出现在 UI 中心）。
 *
 * 每个 broker 归属一个 ACN、覆盖若干 market cell、有精力池和客户/房源池上限。
 *
 * 不直接 import runtime / application / UI。
 */

import type { AcnNetwork, AcnStyle } from './acnNetworks.js';

// ── 基础类型 ────────────────────────────────────────────────

/** 经纪人行为风格。 */
export type BrokerStyle =
  | 'price_attacker'
  | 'relationship_keeper'
  | 'speed_runner'
  | 'co_sale_builder'
  | 'local_connector';

/** 经纪人可见性层级。 */
export type BrokerVisibility = 'named' | 'shadow';

/** 单个经纪人实体。 */
export interface BrokerEntity {
  readonly brokerId: string;
  readonly acnId: string;
  readonly visibility: BrokerVisibility;
  readonly name: string;
  readonly style: BrokerStyle;
  /** 覆盖的市场 cell id 列表。 */
  readonly marketCellIds: readonly string[];
  /** 每日精力预算上限（行动点数）。 */
  readonly energyBudget: number;
  /** 当前剩余精力（运行时状态，每日重置）。 */
  energyRemaining: number;
  /** 能管理的挂牌房源池上限。 */
  readonly listingPoolSize: number;
  /** 能服务的客户池上限。 */
  readonly customerPoolSize: number;
  /** 行为偏向：正数偏进攻，负数偏防守。 */
  readonly actionBias: number;
}

// ── 种群参数 ────────────────────────────────────────────────

/** 种群配置。 */
export interface BrokerPopulationConfig {
  /** 每个 ACN 命名经纪人数量。 */
  readonly namedBrokersPerAcn: number;
  /** 每个 ACN 影子经纪人数量。 */
  readonly shadowBrokersPerAcn: number;
  /** 命名经纪人基础精力。 */
  readonly namedBrokerBaseEnergy: number;
  /** 影子经纪人基础精力。 */
  readonly shadowBrokerBaseEnergy: number;
  /** 命名经纪人基础房源池。 */
  readonly namedBrokerListingPool: number;
  /** 影子经纪人基础房源池。 */
  readonly shadowBrokerListingPool: number;
  /** 命名经纪人基础客户池。 */
  readonly namedBrokerCustomerPool: number;
  /** 影子经纪人基础客户池。 */
  readonly shadowBrokerCustomerPool: number;
}

export const DEFAULT_BROKER_POPULATION_CONFIG: BrokerPopulationConfig = {
  namedBrokersPerAcn: 2,
  shadowBrokersPerAcn: 4,
  namedBrokerBaseEnergy: 80,
  shadowBrokerBaseEnergy: 50,
  namedBrokerListingPool: 6,
  shadowBrokerListingPool: 3,
  namedBrokerCustomerPool: 8,
  shadowBrokerCustomerPool: 4,
};

// ── 风格参数映射 ────────────────────────────────────────────

interface BrokerStyleModifiers {
  energyBonus: number;
  listingPoolBonus: number;
  customerPoolBonus: number;
  actionBiasBase: number;
}

const BROKER_STYLE_MODIFIERS: Record<BrokerStyle, BrokerStyleModifiers> = {
  price_attacker: {
    energyBonus: -8,
    listingPoolBonus: 0,
    customerPoolBonus: 2,
    actionBiasBase: 25,
  },
  relationship_keeper: {
    energyBonus: 5,
    listingPoolBonus: 1,
    customerPoolBonus: 1,
    actionBiasBase: -10,
  },
  speed_runner: {
    energyBonus: -5,
    listingPoolBonus: -1,
    customerPoolBonus: 3,
    actionBiasBase: 15,
  },
  co_sale_builder: {
    energyBonus: 8,
    listingPoolBonus: 2,
    customerPoolBonus: 0,
    actionBiasBase: -5,
  },
  local_connector: {
    energyBonus: 3,
    listingPoolBonus: 1,
    customerPoolBonus: 2,
    actionBiasBase: -15,
  },
};

const ALL_BROKER_STYLES: readonly BrokerStyle[] = [
  'price_attacker',
  'relationship_keeper',
  'speed_runner',
  'co_sale_builder',
  'local_connector',
];

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

function seededPick<T>(seed: string, arr: readonly T[]): T {
  return arr[stableHash(seed) % arr.length];
}

// ── 种群生成 ────────────────────────────────────────────────

/**
 * 从 ACN 网络列表和市场 cell 列表生成完整的经纪人种群。
 * 确定性：相同 seed + 相同配置 → 相同输出。
 */
export function generateBrokerPopulation(
  acnNetworks: readonly AcnNetwork[],
  marketCellIds: readonly string[],
  config: BrokerPopulationConfig = DEFAULT_BROKER_POPULATION_CONFIG,
  seed: number = 42,
): BrokerEntity[] {
  const brokers: BrokerEntity[] = [];
  let counter = 0;

  for (const acn of acnNetworks) {
    // Named brokers
    for (let i = 0; i < config.namedBrokersPerAcn; i += 1) {
      counter += 1;
      const salt = `named-${seed}-${acn.id}-${i}`;
      const style = seededPick(salt, ALL_BROKER_STYLES);
      const modifiers = BROKER_STYLE_MODIFIERS[style];
      const cellCount = seededInt(`${salt}-cells`, 1, Math.min(3, marketCellIds.length));
      const cells: string[] = [];
      for (let c = 0; c < cellCount; c += 1) {
        const cell = marketCellIds[stableHash(`${salt}-cell-${c}`) % marketCellIds.length];
        if (!cells.includes(cell)) cells.push(cell);
      }
      const energy = Math.max(30, config.namedBrokerBaseEnergy + modifiers.energyBonus + seededInt(`${salt}-e`, -5, 5));
      brokers.push({
        brokerId: `nb-${acn.id}-${i}`,
        acnId: acn.id,
        visibility: 'named',
        name: `${acn.name}经纪人${i + 1}号`,
        style,
        marketCellIds: cells,
        energyBudget: energy,
        energyRemaining: energy,
        listingPoolSize: Math.max(2, config.namedBrokerListingPool + modifiers.listingPoolBonus),
        customerPoolSize: Math.max(3, config.namedBrokerCustomerPool + modifiers.customerPoolBonus),
        actionBias: modifiers.actionBiasBase + seededInt(`${salt}-bias`, -8, 8),
      });
    }

    // Shadow brokers
    for (let i = 0; i < config.shadowBrokersPerAcn; i += 1) {
      counter += 1;
      const salt = `shadow-${seed}-${acn.id}-${i}`;
      const style = seededPick(salt, ALL_BROKER_STYLES);
      const modifiers = BROKER_STYLE_MODIFIERS[style];
      const cellCount = seededInt(`${salt}-cells`, 1, Math.min(2, marketCellIds.length));
      const cells: string[] = [];
      for (let c = 0; c < cellCount; c += 1) {
        const cell = marketCellIds[stableHash(`${salt}-cell-${c}`) % marketCellIds.length];
        if (!cells.includes(cell)) cells.push(cell);
      }
      const energy = Math.max(20, config.shadowBrokerBaseEnergy + modifiers.energyBonus + seededInt(`${salt}-e`, -8, 8));
      brokers.push({
        brokerId: `sb-${acn.id}-${i}`,
        acnId: acn.id,
        visibility: 'shadow',
        name: `${acn.name}影子${i + 1}号`,
        style,
        marketCellIds: cells,
        energyBudget: energy,
        energyRemaining: energy,
        listingPoolSize: Math.max(1, config.shadowBrokerListingPool + modifiers.listingPoolBonus),
        customerPoolSize: Math.max(1, config.shadowBrokerCustomerPool + modifiers.customerPoolBonus),
        actionBias: modifiers.actionBiasBase + seededInt(`${salt}-bias`, -12, 12),
      });
    }
  }

  return brokers;
}

// ── 查询工具 ─────────────────────────────────────────────

export function getNamedBrokers(brokers: readonly BrokerEntity[]): BrokerEntity[] {
  return brokers.filter((b) => b.visibility === 'named');
}

export function getShadowBrokers(brokers: readonly BrokerEntity[]): BrokerEntity[] {
  return brokers.filter((b) => b.visibility === 'shadow');
}

export function getBrokersByAcn(brokers: readonly BrokerEntity[], acnId: string): BrokerEntity[] {
  return brokers.filter((b) => b.acnId === acnId);
}

export function getBrokersByMarketCell(brokers: readonly BrokerEntity[], marketCellId: string): BrokerEntity[] {
  return brokers.filter((b) => b.marketCellIds.includes(marketCellId));
}

/**
 * 消耗经纪人精力。返回实际消耗量（不能超过剩余精力）。
 */
export function consumeBrokerEnergy(broker: BrokerEntity, cost: number): number {
  const actual = Math.min(cost, broker.energyRemaining);
  broker.energyRemaining = Math.max(0, broker.energyRemaining - actual);
  return actual;
}

/**
 * 重置所有经纪人每日精力。
 */
export function resetDailyBrokerEnergy(brokers: BrokerEntity[]): void {
  for (const b of brokers) {
    b.energyRemaining = b.energyBudget;
  }
}
