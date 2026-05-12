/**
 * ACN (Agent Cooperation Network) — 大世界生态中的经纪网络行为差异模型。
 *
 * Mother model: ACN-style coopetition (Section 10), organization / ACNRuleSet.
 * 三类 ACN 风格，每类有独立参数：协作、信息、竞争、节奏、信任。
 *
 * 不直接 import runtime / application / UI。
 */

// ── 基础类型 ────────────────────────────────────────────────

/** ACN 风格标识。 */
export type AcnStyle =
  | 'cooperative_player_acn'
  | 'aggressive_competitor_acn'
  | 'local_relationship_acn';

/** ACN 行为参数向量。所有值 0-100。 */
export interface AcnBehaviorProfile {
  /** 协作倾向：与其他 ACN 的 co-sale / 共享信息意愿。 */
  readonly cooperationBias: number;
  /** 挂牌开放度：分享房源信息 / 接受外部门店带看的意愿。 */
  readonly listingOpenness: number;
  /** 信息传递速度：市场信号 / 成交事实向内传播的速度。 */
  readonly infoSpeed: number;
  /** co-sale 倾向：愿意与其他 ACN 经纪人合作成交。 */
  readonly coSaleBias: number;
  /** 直接竞争攻击性：截客、抢先跟进、报价动作的激进程度。 */
  readonly directAggression: number;
  /** 客户跟进强度：经纪人对客户的跟进频率和深度。 */
  readonly customerFollowupStrength: number;
  /** 价格反应速度：对市场信号调价的反应快慢。 */
  readonly priceReactionSpeed: number;
  /** 信息不透明度：对玩家可见的信息遮蔽程度。 */
  readonly infoOpacity: number;
  /** 本地关系深度：与业主的熟人关系积累。 */
  readonly localRelationshipDepth: number;
  /** 数据完整度：ACN 内部数据标准化程度。 */
  readonly dataCompleteness: number;
  /** 节奏稳定性：日常行为是否可预测。 */
  readonly rhythmStability: number;
  /** 业主信任维护能力。 */
  readonly ownerTrustMaintenance: number;
  /** 标准化运营效率。 */
  readonly operationalEfficiency: number;
}

/** 完整 ACN 网络定义。 */
export interface AcnNetwork {
  readonly id: string;
  readonly name: string;
  readonly style: AcnStyle;
  readonly behavior: AcnBehaviorProfile;
}

// ── 三类 ACN 预设 ─────────────────────────────────────────

const COOPERATIVE_PLAYER_ACN: AcnBehaviorProfile = {
  cooperationBias: 82,
  listingOpenness: 78,
  infoSpeed: 76,
  coSaleBias: 74,
  directAggression: 28,
  customerFollowupStrength: 58,
  priceReactionSpeed: 52,
  infoOpacity: 18,
  localRelationshipDepth: 55,
  dataCompleteness: 80,
  rhythmStability: 72,
  ownerTrustMaintenance: 62,
  operationalEfficiency: 75,
};

const AGGRESSIVE_COMPETITOR_ACN: AcnBehaviorProfile = {
  cooperationBias: 22,
  listingOpenness: 30,
  infoSpeed: 82,
  coSaleBias: 15,
  directAggression: 85,
  customerFollowupStrength: 88,
  priceReactionSpeed: 90,
  infoOpacity: 72,
  localRelationshipDepth: 35,
  dataCompleteness: 55,
  rhythmStability: 42,
  ownerTrustMaintenance: 40,
  operationalEfficiency: 68,
};

const LOCAL_RELATIONSHIP_ACN: AcnBehaviorProfile = {
  cooperationBias: 55,
  listingOpenness: 42,
  infoSpeed: 38,
  coSaleBias: 48,
  directAggression: 35,
  customerFollowupStrength: 62,
  priceReactionSpeed: 30,
  infoOpacity: 52,
  localRelationshipDepth: 88,
  dataCompleteness: 32,
  rhythmStability: 28,
  ownerTrustMaintenance: 85,
  operationalEfficiency: 40,
};

// ── 默认 ACN 网络实例 ─────────────────────────────────────

export const DEFAULT_ACN_NETWORKS: readonly AcnNetwork[] = Object.freeze([
  {
    id: 'acn-cooperative',
    name: '联卖协作网',
    style: 'cooperative_player_acn',
    behavior: COOPERATIVE_PLAYER_ACN,
  },
  {
    id: 'acn-aggressive',
    name: '快攻竞争网',
    style: 'aggressive_competitor_acn',
    behavior: AGGRESSIVE_COMPETITOR_ACN,
  },
  {
    id: 'acn-local',
    name: '熟人关系网',
    style: 'local_relationship_acn',
    behavior: LOCAL_RELATIONSHIP_ACN,
  },
]);

// ── 查询工具 ─────────────────────────────────────────────

export function getAcnById(networks: readonly AcnNetwork[], id: string): AcnNetwork | undefined {
  return networks.find((n) => n.id === id);
}

export function getAcnByStyle(networks: readonly AcnNetwork[], style: AcnStyle): AcnNetwork | undefined {
  return networks.find((n) => n.style === style);
}

/**
 * 两个 ACN 之间的协作兼容度。
 * 取两者 cooperationBias 的几何平均。
 */
export function acnCooperationCompatibility(a: AcnBehaviorProfile, b: AcnBehaviorProfile): number {
  return Math.sqrt(a.cooperationBias * b.cooperationBias);
}

/**
 * ACN 对信息的传播延迟天数。
 * infoSpeed 越高，延迟越低。
 * 返回 0-5 天。
 */
export function acnInfoDelayDays(profile: AcnBehaviorProfile): number {
  return Math.max(0, Math.round(5 - (profile.infoSpeed / 100) * 5));
}
