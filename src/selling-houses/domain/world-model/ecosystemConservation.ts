/**
 * EcosystemConservation — 大世界生态守恒规则。
 *
 * 六条守恒规则，确保生态不是"随机热闹"而是有约束的真实行为：
 * 1. customer attention conservation — 客户注意力守恒
 * 2. broker energy conservation — 经纪人精力守恒
 * 3. demand volume conservation — 需求总量守恒
 * 4. information delay — 信息延迟
 * 5. owner perception lag — 业主感知滞后
 * 6. deal scarcity — 成交稀缺性
 *
 * 不直接 import runtime / application / UI。
 */

import type { BrokerEntity } from './brokerPopulation.js';
import type { CustomerDemandEntity } from './customerDemandField.js';
import type { ListingPopulationEntity } from './listingPopulation.js';
import type { AcnBehaviorProfile } from './acnNetworks.js';

// ── 守恒验证结果 ────────────────────────────────────────────

export interface ConservationCheckResult {
  readonly rule: ConservationRuleId;
  readonly passed: boolean;
  readonly detail: string;
  readonly measuredValue: number;
  readonly boundValue: number;
}

export type ConservationRuleId =
  | 'customer_attention_conservation'
  | 'broker_energy_conservation'
  | 'demand_volume_conservation'
  | 'information_delay'
  | 'owner_perception_lag'
  | 'deal_scarcity';

// ── 守恒规则实现 ────────────────────────────────────────────

/**
 * 客户注意力守恒：
 * 每个客户每天认真比较的 listing 数量 <= dailyComparisonLimit。
 */
export function checkCustomerAttentionConservation(
  customers: readonly CustomerDemandEntity[],
): ConservationCheckResult {
  const violations = customers.filter(
    (c) => c.visibility === 'active' && c.dailyComparisonCount > c.dailyComparisonLimit,
  );
  const maxOverflow = violations.reduce(
    (max, c) => Math.max(max, c.dailyComparisonCount - c.dailyComparisonLimit),
    0,
  );
  return {
    rule: 'customer_attention_conservation',
    passed: violations.length === 0,
    detail: violations.length === 0
      ? `所有 ${customers.length} 个客户注意力守恒。`
      : `${violations.length} 个客户超出注意力上限，最大超出 ${maxOverflow}。`,
    measuredValue: violations.length,
    boundValue: 0,
  };
}

/**
 * 经纪人精力守恒：
 * 每个经纪人消耗精力 <= energyBudget。
 * energyRemaining >= 0 且 energyRemaining <= energyBudget。
 */
export function checkBrokerEnergyConservation(
  brokers: readonly BrokerEntity[],
): ConservationCheckResult {
  const violations = brokers.filter(
    (b) => b.energyRemaining < 0 || b.energyRemaining > b.energyBudget,
  );
  const totalOverdraft = violations.reduce(
    (sum, b) => sum + Math.max(0, -b.energyRemaining),
    0,
  );
  return {
    rule: 'broker_energy_conservation',
    passed: violations.length === 0,
    detail: violations.length === 0
      ? `所有 ${brokers.length} 个经纪人精力守恒。`
      : `${violations.length} 个经纪人精力违规，总透支 ${totalOverdraft}。`,
    measuredValue: violations.length,
    boundValue: 0,
  };
}

/**
 * 需求总量守恒：
 * 活跃客户总数在合理范围内（不会一天内无限膨胀）。
 * 约束：活跃客户数 <= 总客户数 * maxGrowthRatio（默认 1.0，即不能增长超过存量）。
 */
export function checkDemandVolumeConservation(
  customers: readonly CustomerDemandEntity[],
  maxGrowthRatio: number = 1.0,
): ConservationCheckResult {
  const total = customers.length;
  const active = customers.filter((c) => c.visibility === 'active').length;
  const bound = Math.ceil(total * maxGrowthRatio);
  return {
    rule: 'demand_volume_conservation',
    passed: active <= bound,
    detail: `活跃 ${active} / 总量 ${total} / 上限 ${bound}`,
    measuredValue: active,
    boundValue: bound,
  };
}

/**
 * 信息延迟守恒检查：
 * ACN 的 infoSpeed 越低，信息传播延迟越高。
 * 返回平均延迟天数和最大延迟天数。
 * 这是一个度量函数，不判定 pass/fail，而是记录约束状态。
 */
export function measureInformationDelay(
  acnProfiles: readonly AcnBehaviorProfile[],
): ConservationCheckResult {
  if (acnProfiles.length === 0) {
    return {
      rule: 'information_delay',
      passed: true,
      detail: '无 ACN 数据。',
      measuredValue: 0,
      boundValue: 5,
    };
  }

  const delays = acnProfiles.map((p) => Math.max(0, Math.round(5 - (p.infoSpeed / 100) * 5)));
  const avgDelay = delays.reduce((s, d) => s + d, 0) / delays.length;
  const maxDelay = Math.max(...delays);

  return {
    rule: 'information_delay',
    passed: maxDelay <= 5,
    detail: `平均延迟 ${avgDelay.toFixed(1)} 天，最大延迟 ${maxDelay} 天。`,
    measuredValue: maxDelay,
    boundValue: 5,
  };
}

/**
 * 业主感知滞后守恒检查：
 * shadow listing 的 ownerRigidity 越高，业主对市场信号的反应越慢。
 * 返回平均刚性和高刚性占比。
 */
export function measureOwnerPerceptionLag(
  listings: readonly ListingPopulationEntity[],
  rigidityThreshold: number = 70,
): ConservationCheckResult {
  const activeListings = listings.filter((l) => l.status === 'active');
  if (activeListings.length === 0) {
    return {
      rule: 'owner_perception_lag',
      passed: true,
      detail: '无活跃房源。',
      measuredValue: 0,
      boundValue: 100,
    };
  }

  const avgRigidity = activeListings.reduce((s, l) => s + l.ownerRigidity, 0) / activeListings.length;
  const highRigidityCount = activeListings.filter((l) => l.ownerRigidity >= rigidityThreshold).length;
  const highRigidityRatio = highRigidityCount / activeListings.length;

  return {
    rule: 'owner_perception_lag',
    passed: true, // 度量，非硬约束
    detail: `平均刚性 ${avgRigidity.toFixed(1)}，高刚性占比 ${(highRigidityRatio * 100).toFixed(0)}%。`,
    measuredValue: avgRigidity,
    boundValue: 100,
  };
}

/**
 * 成交稀缺性守恒检查：
 * 市场上活跃 listing 总量 vs 历史成交比例，衡量成交稀缺度。
 * 成交比例越高，市场越紧张。
 */
export function measureDealScarcity(
  listings: readonly ListingPopulationEntity[],
): ConservationCheckResult {
  const total = listings.length;
  const sold = listings.filter((l) => l.status === 'sold').length;
  const active = listings.filter((l) => l.status === 'active').length;
  const soldRatio = total > 0 ? sold / total : 0;

  return {
    rule: 'deal_scarcity',
    passed: true, // 度量
    detail: `总量 ${total}，活跃 ${active}，已售 ${sold}，成交率 ${(soldRatio * 100).toFixed(0)}%。`,
    measuredValue: soldRatio * 100,
    boundValue: 100,
  };
}

// ── 综合守恒报告 ────────────────────────────────────────────

export interface ConservationReport {
  readonly day: number;
  readonly results: readonly ConservationCheckResult[];
  readonly allPassed: boolean;
  readonly violatedRules: readonly ConservationRuleId[];
}

/**
 * 运行所有守恒检查，生成综合报告。
 */
export function runConservationChecks(
  customers: readonly CustomerDemandEntity[],
  brokers: readonly BrokerEntity[],
  acnProfiles: readonly AcnBehaviorProfile[],
  listings: readonly ListingPopulationEntity[],
  day: number,
): ConservationReport {
  const results: ConservationCheckResult[] = [
    checkCustomerAttentionConservation(customers),
    checkBrokerEnergyConservation(brokers),
    checkDemandVolumeConservation(customers),
    measureInformationDelay(acnProfiles),
    measureOwnerPerceptionLag(listings),
    measureDealScarcity(listings),
  ];

  const violatedRules = results.filter((r) => !r.passed).map((r) => r.rule);

  return {
    day,
    results,
    allPassed: violatedRules.length === 0,
    violatedRules,
  };
}
