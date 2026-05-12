/**
 * EcosystemPolicy — 大世界生态每日行动提案生成器。
 *
 * 基于 MarketOpeningSnapshot 生成 DailyEcosystemActionProposal，
 * 转换为 Agent B 的 WorldCausalEvent 输入。
 *
 * 这些 proposal 是 proposal / causal input，不直接改 UI。
 *
 * 不直接 import runtime / application / UI。
 */

import type { AcnNetwork, AcnBehaviorProfile } from './acnNetworks.js';
import type { BrokerEntity } from './brokerPopulation.js';
import type { ListingPopulationEntity } from './listingPopulation.js';
import type { CustomerDemandEntity, DemandListingAttention } from './customerDemandField.js';
import type { MarketOpeningSnapshot } from './marketWorldTypes.js';
import type {
  WorldCausalEvent,
  RivalBrokerActionTakenPayload,
  CustomerComparedListingsPayload,
  CustomerAttentionShiftedPayload,
  OwnerMarketPressurePerceivedPayload,
  MarketHeatShiftedPayload,
} from './causalEvents.js';
import {
  buildRivalBrokerActionTaken,
  buildCustomerComparedListings,
  buildCustomerAttentionShifted,
  buildOwnerMarketPressurePerceived,
  buildMarketHeatShifted,
  buildRivalListingRepriced,
} from './causalEvents.js';

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
  return min + (stableHash(seed) % (max - min + 1));
}

function seededChance(seed: string, threshold: number): boolean {
  return (stableHash(seed) / 4294967296) < threshold;
}

// ── 每日行动提案类型 ────────────────────────────────────────

export type EcosystemProposalKind =
  | 'rival_repricing'
  | 'rival_broker_followup'
  | 'customer_comparison'
  | 'customer_attention_shift'
  | 'listing_exposure_shift'
  | 'owner_pressure_signal'
  | 'market_heat_drift';

/** 单个生态行动提案。 */
export interface DailyEcosystemActionProposal {
  readonly proposalId: string;
  readonly kind: EcosystemProposalKind;
  readonly day: number;
  /** 相关 ACN id。 */
  readonly acnId: string;
  /** 相关经纪人 id（如有）。 */
  readonly brokerId?: string;
  /** 相关 listing id（如有）。 */
  readonly listingId?: string;
  /** 相关客户 id（如有）。 */
  readonly customerId?: string;
  /** 相关市场 cell id。 */
  readonly marketCellId?: string;
  /** 描述。 */
  readonly description: string;
  /** 生成的 causal event 输入（可直接被 B 的 causal ledger 消费）。 */
  readonly causalEvent: WorldCausalEvent;
}

/** 每日生态提案集合。 */
export interface DailyEcosystemProposalBundle {
  readonly day: number;
  readonly proposals: readonly DailyEcosystemActionProposal[];
  readonly causalEvents: readonly WorldCausalEvent[];
  readonly brokerEnergyConsumed: Map<string, number>;
}

// ── 提案生成器 ──────────────────────────────────────────────

export interface EcosystemPolicyConfig {
  /** 每日竞品调价概率。 */
  readonly rivalRepriceChance: number;
  /** 每日经纪人跟进概率。 */
  readonly brokerFollowupChance: number;
  /** 每日客户比较概率。 */
  readonly customerComparisonChance: number;
  /** 每日客户注意力转移概率。 */
  readonly customerAttentionShiftChance: number;
  /** 每日房源曝光变动概率。 */
  readonly listingExposureShiftChance: number;
  /** 每日业主压力信号概率。 */
  readonly ownerPressureChance: number;
  /** 每日市场热度漂移概率。 */
  readonly marketHeatDriftChance: number;
}

export const DEFAULT_ECOSYSTEM_POLICY_CONFIG: EcosystemPolicyConfig = {
  rivalRepriceChance: 0.25,
  brokerFollowupChance: 0.40,
  customerComparisonChance: 0.35,
  customerAttentionShiftChance: 0.20,
  listingExposureShiftChance: 0.15,
  ownerPressureChance: 0.22,
  marketHeatDriftChance: 0.18,
};

function makeProposalId(kind: string, day: number, entity: string): string {
  return `eco-${kind}-${day}-${entity}`;
}

/**
 * 生成竞品调价提案。
 * 从 active shadow/rival listing 中选一个，模拟调价。
 */
function* generateRivalRepricingProposals(
  listings: readonly ListingPopulationEntity[],
  brokers: readonly BrokerEntity[],
  acnNetworks: readonly AcnNetwork[],
  day: number,
  config: EcosystemPolicyConfig,
  seed: number,
): Generator<DailyEcosystemActionProposal> {
  const activeRivals = listings.filter(
    (l) => (l.layer === 'shadow' || l.layer === 'direct_rival') && l.status === 'active',
  );

  for (const listing of activeRivals) {
    const salt = `reprice-${seed}-${day}-${listing.listingId}`;
    if (!seededChance(salt, config.rivalRepriceChance)) continue;

    const priceDirection = seededChance(`${salt}-dir`, 0.4) ? -1 : 1;
    const priceDelta = priceDirection * seededInt(`${salt}-delta`, 2, 15);
    const newPrice = Math.max(100, listing.askPrice + priceDelta);

    listing.askPrice = newPrice;

    const causalEvent = buildRivalListingRepriced(
      makeProposalId('repricing', day, listing.listingId),
      day,
      {
        listingId: listing.listingId,
        acnId: listing.acnId,
        brokerId: listing.brokerId,
        oldPrice: listing.askPrice - priceDelta,
        newPrice,
        priceDelta,
        affectedMarketCellIds: [listing.marketCellId],
      },
    );

    yield {
      proposalId: makeProposalId('repricing', day, listing.listingId),
      kind: 'rival_repricing',
      day,
      acnId: listing.acnId,
      brokerId: listing.brokerId,
      listingId: listing.listingId,
      marketCellId: listing.marketCellId,
      description: `${listing.district} ${listing.layout} 调价 ${priceDelta > 0 ? '+' : ''}${priceDelta}万`,
      causalEvent,
    };
  }
}

/**
 * 生成经纪人跟进提案。
 * 从有精力的经纪人中选一个执行跟进动作。
 */
function* generateBrokerFollowupProposals(
  brokers: readonly BrokerEntity[],
  listings: readonly ListingPopulationEntity[],
  acnNetworks: readonly AcnNetwork[],
  day: number,
  config: EcosystemPolicyConfig,
  seed: number,
): Generator<DailyEcosystemActionProposal> {
  for (const broker of brokers) {
    const salt = `followup-${seed}-${day}-${broker.brokerId}`;
    if (!seededChance(salt, config.brokerFollowupChance)) continue;
    if (broker.energyRemaining < 10) continue;

    const acn = acnNetworks.find((a) => a.id === broker.acnId);
    const followupIntensity = Math.round(
      (acn?.behavior.customerFollowupStrength ?? 50) * (broker.energyRemaining / broker.energyBudget),
    );

    const brokerListings = listings.filter(
      (l) => l.brokerId === broker.brokerId && l.status === 'active',
    );
    const targetListing = brokerListings[0];

    const actionKind: RivalBrokerActionTakenPayload['actionKind'] =
      broker.style === 'price_attacker' ? 'reprice'
      : broker.style === 'speed_runner' ? 'follow_customer'
      : broker.style === 'relationship_keeper' ? 'owner_pitch'
      : broker.style === 'co_sale_builder' ? 'push_listing'
      : 'hold_open_day';

    broker.energyRemaining = Math.max(0, broker.energyRemaining - 10);

    const causalEvent = buildRivalBrokerActionTaken(
      makeProposalId('followup', day, broker.brokerId),
      day,
      {
        brokerId: broker.brokerId,
        acnId: broker.acnId,
        actionKind,
        energyCost: 10,
        actionIntensity: followupIntensity,
        targetListingId: targetListing?.listingId,
        targetMarketCellId: targetListing?.marketCellId,
      },
    );

    yield {
      proposalId: makeProposalId('followup', day, broker.brokerId),
      kind: 'rival_broker_followup',
      day,
      acnId: broker.acnId,
      brokerId: broker.brokerId,
      listingId: targetListing?.listingId,
      marketCellId: targetListing?.marketCellId,
      description: `${broker.name} 执行 ${actionKind}，强度 ${followupIntensity}`,
      causalEvent,
    };
  }
}

/**
 * 生成客户比较提案。
 * 从活跃客户中选一个，模拟比较多套房源。
 */
function* generateCustomerComparisonProposals(
  customers: readonly CustomerDemandEntity[],
  listings: readonly ListingPopulationEntity[],
  attentions: readonly DemandListingAttention[],
  day: number,
  config: EcosystemPolicyConfig,
  seed: number,
): Generator<DailyEcosystemActionProposal> {
  const activeCustomers = customers.filter((c) => c.visibility === 'active');

  for (const customer of activeCustomers) {
    const salt = `compare-${seed}-${day}-${customer.customerId}`;
    if (!seededChance(salt, config.customerComparisonChance)) continue;
    if (customer.dailyComparisonCount >= customer.dailyComparisonLimit) continue;

    // 选 2-3 个同一 cell 的 listing 进行比较
    const cellListings = listings.filter(
      (l) => l.marketCellId === customer.targetMarketCellId && l.status === 'active',
    ).slice(0, 3);
    if (cellListings.length < 2) continue;

    const comparedIds = cellListings.map((l) => l.listingId);
    customer.dailyComparisonCount += Math.min(comparedIds.length, customer.dailyComparisonLimit - customer.dailyComparisonCount);

    const causalEvent = buildCustomerComparedListings(
      makeProposalId('compare', day, customer.customerId),
      day,
      {
        customerId: customer.customerId,
        comparedListingIds: comparedIds,
        attentionDelta: 5,
        reasonSignals: ['价格', '户型', '位置'],
      },
    );

    yield {
      proposalId: makeProposalId('compare', day, customer.customerId),
      kind: 'customer_comparison',
      day,
      acnId: customer.acnId,
      brokerId: customer.brokerId,
      customerId: customer.customerId,
      marketCellId: customer.targetMarketCellId,
      description: `客户 ${customer.customerId} 比较了 ${comparedIds.length} 套房源`,
      causalEvent,
    };
  }
}

/**
 * 生成客户注意力转移提案。
 * 从有活跃注意力关系的客户中选一个，模拟注意力从一个 listing 转移到另一个。
 */
function* generateCustomerAttentionShiftProposals(
  customers: readonly CustomerDemandEntity[],
  listings: readonly ListingPopulationEntity[],
  attentions: readonly DemandListingAttention[],
  day: number,
  config: EcosystemPolicyConfig,
  seed: number,
): Generator<DailyEcosystemActionProposal> {
  for (const customer of customers) {
    if (customer.visibility !== 'active') continue;
    const salt = `shift-${seed}-${day}-${customer.customerId}`;
    if (!seededChance(salt, config.customerAttentionShiftChance)) continue;

    const customerAttentions = attentions.filter((a) => a.customerId === customer.customerId);
    if (customerAttentions.length < 2) continue;

    // 找到 interest 最低的和一个新的 listing
    const sorted = [...customerAttentions].sort((a, b) => a.interest - b.interest);
    const fromListingIds = [sorted[0].listingId];

    const cellListings = listings.filter(
      (l) => l.marketCellId === customer.targetMarketCellId
        && l.status === 'active'
        && !fromListingIds.includes(l.listingId),
    );
    if (cellListings.length === 0) continue;

    const toListing = cellListings[stableHash(`${salt}-to`) % cellListings.length];

    const causalEvent = buildCustomerAttentionShifted(
      makeProposalId('attshift', day, customer.customerId),
      day,
      {
        fromListingIds,
        toListingIds: [toListing.listingId],
        segment: customer.targetDistrict,
        causeEventId: sorted[0].attentionId,
      },
    );

    yield {
      proposalId: makeProposalId('attshift', day, customer.customerId),
      kind: 'customer_attention_shift',
      day,
      acnId: customer.acnId,
      brokerId: customer.brokerId,
      customerId: customer.customerId,
      marketCellId: customer.targetMarketCellId,
      description: `客户注意力从 ${fromListingIds[0]} 转向 ${toListing.listingId}`,
      causalEvent,
    };
  }
}

/**
 * 生成业主压力信号提案。
 * 从高刚性或高在市天数的 listing 中选一个，模拟业主感知到市场压力。
 */
function* generateOwnerPressureProposals(
  listings: readonly ListingPopulationEntity[],
  acnNetworks: readonly AcnNetwork[],
  day: number,
  config: EcosystemPolicyConfig,
  seed: number,
): Generator<DailyEcosystemActionProposal> {
  const activeListings = listings.filter(
    (l) => l.status === 'active' && (l.ownerRigidity >= 60 || l.daysOnMarket >= 20),
  );

  for (const listing of activeListings) {
    const salt = `ownerpress-${seed}-${day}-${listing.listingId}`;
    if (!seededChance(salt, config.ownerPressureChance)) continue;

    const acn = acnNetworks.find((a) => a.id === listing.acnId);
    const delayDays = Math.max(0, Math.round(5 - ((acn?.behavior.infoSpeed ?? 50) / 100) * 5));
    const pressureDelta = Math.round(
      (100 - listing.ownerNegotiability) * 0.2 + listing.daysOnMarket * 0.5,
    );

    const causalEvent = buildOwnerMarketPressurePerceived(
      makeProposalId('ownerpress', day, listing.listingId),
      day,
      {
        caseId: listing.linkedCaseId || listing.listingId,
        perceivedSignalIds: [`market-signal-${listing.marketCellId}`],
        pressureDelta,
        delayDays,
        confidence: 0.7,
      },
    );

    yield {
      proposalId: makeProposalId('ownerpress', day, listing.listingId),
      kind: 'owner_pressure_signal',
      day,
      acnId: listing.acnId,
      listingId: listing.listingId,
      marketCellId: listing.marketCellId,
      description: `${listing.district} 业主感知到市场压力，刚性 ${listing.ownerRigidity}`,
      causalEvent,
    };
  }
}

/**
 * 生成市场热度漂移提案。
 * 对每个市场 cell 产生微小的热度变化。
 */
function* generateMarketHeatDriftProposals(
  marketCells: readonly { id: string; name: string; heat: number }[],
  day: number,
  config: EcosystemPolicyConfig,
  seed: number,
): Generator<DailyEcosystemActionProposal> {
  for (const cell of marketCells) {
    const salt = `heatdrift-${seed}-${day}-${cell.id}`;
    if (!seededChance(salt, config.marketHeatDriftChance)) continue;

    const drift = seededInt(`${salt}-dir`, -5, 5);
    const after = Math.max(0, Math.min(100, cell.heat + drift));

    const causalEvent = buildMarketHeatShifted(
      makeProposalId('heatdrift', day, cell.id),
      day,
      {
        marketCellId: cell.id,
        before: cell.heat,
        after,
        sourceSignalId: `ecosystem-drift-${cell.id}-${day}`,
        sourceSignalType: 'ecosystem-policy',
        confidence: 0.6,
      },
    );

    yield {
      proposalId: makeProposalId('heatdrift', day, cell.id),
      kind: 'market_heat_drift',
      day,
      acnId: '',
      marketCellId: cell.id,
      description: `${cell.name} 热度漂移 ${drift > 0 ? '+' : ''}${drift}`,
      causalEvent,
    };
  }
}

// ── 主入口 ──────────────────────────────────────────────────

/** 运行生态策略的输入快照。 */
export interface EcosystemPolicyInput {
  readonly day: number;
  readonly seed: number;
  readonly acnNetworks: readonly AcnNetwork[];
  readonly brokers: BrokerEntity[];
  readonly listings: ListingPopulationEntity[];
  readonly customers: CustomerDemandEntity[];
  readonly attentions: DemandListingAttention[];
  readonly marketCells: readonly { id: string; name: string; heat: number }[];
  readonly config?: EcosystemPolicyConfig;
}

/**
 * 生成每日生态行动提案。
 * 确定性：相同 day + seed + 输入状态 → 相同提案。
 *
 * 注意：此函数会修改 broker.energyRemaining 和 listing.askPrice 等运行时状态。
 * 如果需要纯读取，应在调用前 snapshot。
 */
export function generateDailyEcosystemProposals(
  input: EcosystemPolicyInput,
): DailyEcosystemProposalBundle {
  const config = input.config ?? DEFAULT_ECOSYSTEM_POLICY_CONFIG;
  const proposals: DailyEcosystemActionProposal[] = [];
  const causalEvents: WorldCausalEvent[] = [];
  const energyConsumed = new Map<string, number>();

  function collect(items: Generator<DailyEcosystemActionProposal>): void {
    for (const item of items) {
      proposals.push(item);
      causalEvents.push(item.causalEvent);
      if (item.brokerId) {
        energyConsumed.set(
          item.brokerId,
          (energyConsumed.get(item.brokerId) ?? 0) + 10,
        );
      }
    }
  }

  collect(generateRivalRepricingProposals(
    input.listings, input.brokers, input.acnNetworks,
    input.day, config, input.seed,
  ));

  collect(generateBrokerFollowupProposals(
    input.brokers, input.listings, input.acnNetworks,
    input.day, config, input.seed,
  ));

  collect(generateCustomerComparisonProposals(
    input.customers, input.listings, input.attentions,
    input.day, config, input.seed,
  ));

  collect(generateCustomerAttentionShiftProposals(
    input.customers, input.listings, input.attentions,
    input.day, config, input.seed,
  ));

  collect(generateOwnerPressureProposals(
    input.listings, input.acnNetworks,
    input.day, config, input.seed,
  ));

  collect(generateMarketHeatDriftProposals(
    input.marketCells, input.day, config, input.seed,
  ));

  return {
    day: input.day,
    proposals,
    causalEvents,
    brokerEnergyConsumed: energyConsumed,
  };
}

// ── 查询工具 ─────────────────────────────────────────────

export function getProposalsByKind(
  bundle: DailyEcosystemProposalBundle,
  kind: EcosystemProposalKind,
): DailyEcosystemActionProposal[] {
  return bundle.proposals.filter((p) => p.kind === kind);
}

export function getProposalsByAcn(
  bundle: DailyEcosystemProposalBundle,
  acnId: string,
): DailyEcosystemActionProposal[] {
  return bundle.proposals.filter((p) => p.acnId === acnId);
}
