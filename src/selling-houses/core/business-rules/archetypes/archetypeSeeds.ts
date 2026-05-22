/**
 * archetypeSeeds.ts — canonical archetype seed data.
 *
 * Architecture position:
 *   This is the single authority for the raw archetype seed arrays that
 *   populate the built-in world. Domain imports from here; core imports
 *   from here. This prevents core→domain layer boundary violations.
 *
 * Data was extracted verbatim from BUILT_IN_WORLD (domain/worlds/builtinWorld.ts)
 * as part of the R8 constitutional migration.
 */

import type {
  OwnerArchetype,
  CustomerProfile,
  ChannelProfile,
  RivalStoreArchetype,
  RivalListingArchetype,
} from './archetypeTaxonomy.js';
import { deepFreeze } from '../../util/deepFreeze.js';

export const OWNER_ARCHETYPE_SEEDS: readonly OwnerArchetype[] = deepFreeze([
  {
    id: 'anxious',
    label: '焦虑型',
    description: '推进感强，愿意为了速度做更明显的价格动作。',
    trustDecayMultiplier: 1.4,
    priceElasticity: 1.25,
    urgencyGrowthBonus: 2,
    heatSensitivity: 0.9,
    patienceDelta: -2,
    preferredTactic: 'deep-cut',
  },
  {
    id: 'fair-value',
    label: '等价型',
    description: '强调合理价值，对无依据的压价更敏感。',
    trustDecayMultiplier: 0.9,
    priceElasticity: 0.7,
    urgencyGrowthBonus: 0,
    heatSensitivity: 0.6,
    patienceDelta: 1,
    preferredTactic: 'hold-story',
  },
  {
    id: 'trial-balloon',
    label: '试水型',
    description: '试水心态强，推进耐心短，核销倾向高。',
    trustDecayMultiplier: 1.15,
    priceElasticity: 0.95,
    urgencyGrowthBonus: 1,
    heatSensitivity: 1.1,
    patienceDelta: -3,
    preferredTactic: 'small-cut',
  },
  {
    id: 'game-player',
    label: '博弈型',
    description: '喜欢试探市场，对竞品和政策信息极其敏感。',
    trustDecayMultiplier: 1.05,
    priceElasticity: 0.85,
    urgencyGrowthBonus: 1,
    heatSensitivity: 1.2,
    patienceDelta: 0,
    preferredTactic: 'hold-story',
  },
]);

export const CUSTOMER_ARCHETYPE_SEEDS: readonly CustomerProfile[] = deepFreeze([
  { id: 'cus-01', name: '林家改善客', profile: '孩子今年入学，决策速度快', budgetMin: 780, budgetMax: 860, targetDistrict: '浦东前滩', layouts: ['2室2厅1卫', '3室2厅2卫'], activity: 82, urgency: 78, priceSensitivity: 68, preferences: ['地铁近', '学区', '采光好'] },
  { id: 'cus-02', name: '陈先生新婚客', profile: '两个月内想落定婚房', budgetMin: 590, budgetMax: 660, targetDistrict: '静安寺北', layouts: ['1室1厅1卫', '2室2厅1卫'], activity: 79, urgency: 86, priceSensitivity: 72, preferences: ['地段强', '出租回报'] },
  { id: 'cus-03', name: '冯女士改善客', profile: '想在暑假前完成置换', budgetMin: 880, budgetMax: 980, targetDistrict: '浦东前滩', layouts: ['3室2厅2卫'], activity: 74, urgency: 72, priceSensitivity: 58, preferences: ['改善', '采光好', '车位'] },
  { id: 'cus-04', name: '孙先生学区客', profile: '对学区敏感，愿意多看几套', budgetMin: 760, budgetMax: 820, targetDistrict: '浦东前滩', layouts: ['2室2厅1卫'], activity: 56, urgency: 69, priceSensitivity: 74, preferences: ['学区', '采光好'] },
  { id: 'cus-05', name: '方女士投资客', profile: '追求出租回报和总价控制', budgetMin: 610, budgetMax: 690, targetDistrict: '静安寺北', layouts: ['1室1厅1卫'], activity: 61, urgency: 52, priceSensitivity: 65, preferences: ['出租回报', '地段强'] },
  { id: 'cus-06', name: '高女士首置客', profile: '需要更容易成交的两房盘', budgetMin: 780, budgetMax: 835, targetDistrict: '浦东前滩', layouts: ['2室2厅1卫'], activity: 76, urgency: 67, priceSensitivity: 78, preferences: ['地铁近', '采光好'] },
  { id: 'cus-07', name: '许先生资产客', profile: '重视地段和转手效率', budgetMin: 600, budgetMax: 650, targetDistrict: '静安寺北', layouts: ['1室1厅1卫'], activity: 66, urgency: 73, priceSensitivity: 55, preferences: ['地段强', '总价友好'] },
  { id: 'cus-08', name: '董先生换房客', profile: '持币等议价机会', budgetMin: 900, budgetMax: 980, targetDistrict: '静安寺北', layouts: ['2室2厅1卫', '3室2厅2卫'], activity: 63, urgency: 58, priceSensitivity: 49, preferences: ['地段强', '改善'] },
  { id: 'cus-09', name: '周先生改善客', profile: '在徐汇工作，想在滨江附近换一套品质房', budgetMin: 860, budgetMax: 950, targetDistrict: '徐汇滨江', layouts: ['2室2厅1卫', '3室2厅2卫'], activity: 70, urgency: 62, priceSensitivity: 60, preferences: ['品质改善', '滨江', '采光好'] },
]);

export const CHANNEL_ARCHETYPE_SEEDS: readonly ChannelProfile[] = deepFreeze([
  { id: 'xiaohongshu', name: '小红书推广', quality: 0.56, controllability: 0.48, leadSource: 'direct' },
  { id: 'broker-network', name: '经纪人投放', quality: 0.67, controllability: 0.36, leadSource: 'broker' },
  { id: 'open-day', name: '开放日', quality: 0.74, controllability: 0.76, leadSource: 'direct' },
  { id: 'private-referral', name: '私域转介绍', quality: 0.72, controllability: 0.72, leadSource: 'direct' },
]);

export const RIVAL_STORE_ARCHETYPE_SEEDS: readonly RivalStoreArchetype[] = deepFreeze([
  {
    id: 'same-company-traffic',
    name: '同店流量组',
    type: 'same_company',
    style: 'traffic',
    districtFocus: ['浦东前滩', '静安寺北'],
    leadCapturePower: 48,
    sellerInfluencePower: 34,
    pricingPressurePower: 30,
  },
  {
    id: 'external-aggressive',
    name: '外部门店急售组',
    type: 'external_company',
    style: 'aggressive',
    districtFocus: ['浦东前滩'],
    leadCapturePower: 62,
    sellerInfluencePower: 56,
    pricingPressurePower: 68,
  },
  {
    id: 'external-relationship',
    name: '外部熟人盘门店',
    type: 'external_company',
    style: 'relationship',
    districtFocus: ['静安寺北', '徐汇滨江'],
    leadCapturePower: 42,
    sellerInfluencePower: 68,
    pricingPressurePower: 44,
  },
]);

export const RIVAL_LISTING_ARCHETYPE_SEEDS: readonly RivalListingArchetype[] = deepFreeze([
  {
    id: 'urgent-cut',
    titlePrefix: '急售平替盘',
    segment: '急售',
    sourceBias: 'external_company',
    baseHeat: 68,
    freshness: 88,
    storyStrength: 48,
    leadSiphonPower: 58,
    ownerAnchorPower: 62,
  },
  {
    id: 'same-company-focus',
    titlePrefix: '同公司重点盘',
    segment: '内部重点',
    sourceBias: 'same_company',
    baseHeat: 60,
    freshness: 74,
    storyStrength: 58,
    leadSiphonPower: 50,
    ownerAnchorPower: 42,
  },
  {
    id: 'premium-story',
    titlePrefix: '强卖点竞品',
    segment: '卖点强',
    sourceBias: 'mixed',
    baseHeat: 64,
    freshness: 78,
    storyStrength: 72,
    leadSiphonPower: 54,
    ownerAnchorPower: 50,
  },
]);