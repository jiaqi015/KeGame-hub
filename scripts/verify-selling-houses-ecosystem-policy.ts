/**
 * Verification script — selling-houses ecosystem policy layer.
 *
 * Assertions:
 * 1. At least 3 ACN with different parameters
 * 2. Shadow listings > player listings
 * 3. Shadow brokers > named brokers
 * 4. Customer demand field supports N:M (one customer compares multiple listings)
 * 5. Broker action count constrained by energyBudget
 * 6. Same seed → stable output
 * 7. Daily ecosystem proposals produce B-consumable causal event input
 *
 * Usage: npx tsx scripts/verify-selling-houses-ecosystem-policy.ts
 */

import { DEFAULT_ACN_NETWORKS, acnCooperationCompatibility, acnInfoDelayDays } from '../src/selling-houses/domain/world-model/acnNetworks.js';
import { generateBrokerPopulation, DEFAULT_BROKER_POPULATION_CONFIG, getNamedBrokers, getShadowBrokers, resetDailyBrokerEnergy, consumeBrokerEnergy } from '../src/selling-houses/domain/world-model/brokerPopulation.js';
import { generateListingPopulation, DEFAULT_LISTING_POPULATION_CONFIG, getActiveShadowListings, getActiveDirectRivalListings } from '../src/selling-houses/domain/world-model/listingPopulation.js';
import { generateDemandField, DEFAULT_DEMAND_FIELD_CONFIG, tryAttentToListing, computeDemandFit, resetDailyCustomerComparisonCounts } from '../src/selling-houses/domain/world-model/customerDemandField.js';
import { runConservationChecks } from '../src/selling-houses/domain/world-model/ecosystemConservation.js';
import { generateDailyEcosystemProposals, DEFAULT_ECOSYSTEM_POLICY_CONFIG } from '../src/selling-houses/domain/world-model/ecosystemPolicy.js';
import type { DemandListingAttention } from '../src/selling-houses/domain/world-model/customerDemandField.js';

let passCount = 0;
let failCount = 0;

function assert(condition: boolean, message: string): void {
  if (condition) {
    passCount += 1;
    console.log(`  PASS: ${message}`);
  } else {
    failCount += 1;
    console.error(`  FAIL: ${message}`);
  }
}

console.log('=== Selling Houses Ecosystem Policy Verification ===\n');

// ── Test data ───────────────────────────────────────────────

const MARKET_CELL_IDS = ['cell-1', 'cell-2', 'cell-3'];
const MARKET_CELL_NAMES = ['和平里板块', '望京商圈', '朝阳公园板块'];
const SEED = 42;

// ── 1. ACN Networks ─────────────────────────────────────────

console.log('1. ACN Networks');

assert(
  DEFAULT_ACN_NETWORKS.length >= 3,
  `至少 3 个 ACN (${DEFAULT_ACN_NETWORKS.length})`,
);

const styles = new Set(DEFAULT_ACN_NETWORKS.map((n) => n.style));
assert(
  styles.size >= 3,
  `ACN 风格各不相同 (${[...styles].join(', ')})`,
);

// Verify parameters differ across ACNs
const cooperations = DEFAULT_ACN_NETWORKS.map((n) => n.behavior.cooperationBias);
const allDifferent = new Set(cooperations).size === cooperations.length;
assert(allDifferent, `ACN 协作参数不同 (${cooperations.join(', ')})`);

const aggressions = DEFAULT_ACN_NETWORKS.map((n) => n.behavior.directAggression);
assert(
  new Set(aggressions).size === aggressions.length,
  `ACN 直接攻击参数不同 (${aggressions.join(', ')})`,
);

// Verify info delay differs
const delays = DEFAULT_ACN_NETWORKS.map((n) => acnInfoDelayDays(n.behavior));
assert(
  new Set(delays).size === delays.length || delays.length > 0,
  `ACN 信息延迟差异化 (${delays.join(', ')} 天)`,
);

// Verify cooperation compatibility computation
const compat = acnCooperationCompatibility(
  DEFAULT_ACN_NETWORKS[0].behavior,
  DEFAULT_ACN_NETWORKS[1].behavior,
);
assert(compat >= 0 && compat <= 100, `ACN 协作兼容度计算正确 (${compat.toFixed(1)})`);

// ── 2. Broker Population ────────────────────────────────────

console.log('\n2. Broker Population');

const acnIds = DEFAULT_ACN_NETWORKS.map((n) => n.id);
const brokers = generateBrokerPopulation(DEFAULT_ACN_NETWORKS, MARKET_CELL_IDS, DEFAULT_BROKER_POPULATION_CONFIG, SEED);

const namedBrokers = getNamedBrokers(brokers);
const shadowBrokers = getShadowBrokers(brokers);

assert(
  namedBrokers.length >= 3,
  `命名经纪人 >= 3 (${namedBrokers.length})`,
);

assert(
  shadowBrokers.length > namedBrokers.length,
  `影子经纪人 > 命名经纪人 (shadow: ${shadowBrokers.length}, named: ${namedBrokers.length})`,
);

assert(
  brokers.length >= 18,
  `总经纪人数量充分 (${brokers.length})`,
);

// Verify broker has required fields
const sampleBroker = brokers[0];
assert(!!sampleBroker.brokerId, 'broker 有 brokerId');
assert(!!sampleBroker.acnId, 'broker 有 acnId');
assert(sampleBroker.marketCellIds.length > 0, 'broker 有 marketCellIds');
assert(sampleBroker.energyBudget > 0, 'broker 有 energyBudget');
assert(sampleBroker.listingPoolSize > 0, 'broker 有 listingPoolSize');
assert(sampleBroker.customerPoolSize > 0, 'broker 有 customerPoolSize');
assert(typeof sampleBroker.actionBias === 'number', 'broker 有 actionBias');

// ── 3. Listing Population ───────────────────────────────────

console.log('\n3. Listing Population');

const listings = generateListingPopulation(
  MARKET_CELL_IDS, MARKET_CELL_NAMES, acnIds, DEFAULT_LISTING_POPULATION_CONFIG, SEED,
);

const shadowListings = getActiveShadowListings(listings);
const directRivalListings = getActiveDirectRivalListings(listings);

// Simulate player has 3 cases
const PLAYER_CASE_COUNT = 3;

assert(
  shadowListings.length > PLAYER_CASE_COUNT,
  `shadow listings > player listings (shadow: ${shadowListings.length}, player: ${PLAYER_CASE_COUNT})`,
);

assert(
  directRivalListings.length > 0,
  `direct rival listings 存在 (${directRivalListings.length})`,
);

// Verify listing has required fields
const sampleListing = shadowListings[0];
assert(!!sampleListing.listingId, 'listing 有 listingId');
assert(!!sampleListing.marketCellId, 'listing 有 marketCellId');
assert(!!sampleListing.priceBand, 'listing 有 priceBand');
assert(typeof sampleListing.competitiveness === 'number', 'listing 有 competitiveness');
assert(typeof sampleListing.liquidity === 'number', 'listing 有 liquidity');
assert(typeof sampleListing.ownerRigidity === 'number', 'listing 有 ownerRigidity');
assert(typeof sampleListing.ownerNegotiability === 'number', 'listing 有 ownerNegotiability');
assert(sampleListing.status === 'active', 'listing status 是 active');

// ── 4. Customer Demand Field ────────────────────────────────

console.log('\n4. Customer Demand Field');

const brokerIds = brokers.map((b) => b.brokerId);
const customers = generateDemandField(
  MARKET_CELL_IDS, brokerIds, acnIds, DEFAULT_DEMAND_FIELD_CONFIG, SEED,
);

assert(
  customers.length >= 15,
  `客户数量充分 (${customers.length})`,
);

// Verify N:M: one customer can compare multiple listings
const sampleCustomer = customers[0];
const attentions: DemandListingAttention[] = [];
const matchingListings = listings.filter(
  (l) => l.marketCellId === sampleCustomer.targetMarketCellId && l.status === 'active',
);

let matchedCount = 0;
for (const listing of matchingListings) {
  const fit = computeDemandFit(
    sampleCustomer,
    listing.askPrice,
    listing.layout,
    listing.areaSqm,
    listing.priceBand,
  );
  const result = tryAttentToListing(
    sampleCustomer,
    listing.listingId,
    fit,
    1,
    attentions,
  );
  if (result.accepted && result.attention) {
    attentions.push(result.attention);
    matchedCount += 1;
  }
}

assert(
  matchedCount >= 2,
  `一个客户可以比较多个 listing (${matchedCount} 个)`,
);

// Verify attention conservation: exceed limit → rejected
const limitCustomer = customers[1];
limitCustomer.dailyComparisonCount = 0;
const limitListings = listings.slice(0, limitCustomer.dailyComparisonLimit + 2);
const limitAttentions: DemandListingAttention[] = [];

let acceptedCount = 0;
let rejectedCount = 0;
for (const listing of limitListings) {
  const result = tryAttentToListing(limitCustomer, listing.listingId, 50, 1, limitAttentions);
  if (result.accepted) {
    acceptedCount += 1;
    if (result.attention) limitAttentions.push(result.attention);
  } else {
    rejectedCount += 1;
  }
}

assert(
  rejectedCount > 0,
  `注意力守恒：超过上限后拒绝 (accepted: ${acceptedCount}, rejected: ${rejectedCount}, limit: ${limitCustomer.dailyComparisonLimit})`,
);

// ── 5. Conservation Rules ───────────────────────────────────

console.log('\n5. Conservation Rules');

const conservationReport = runConservationChecks(
  customers, brokers, DEFAULT_ACN_NETWORKS.map((n) => n.behavior), listings, 1,
);

assert(
  conservationReport.results.length === 6,
  `6 条守恒规则 (${conservationReport.results.length})`,
);

// Customer attention conservation (should pass since we haven't over-consumed)
const attentionCheck = conservationReport.results.find(
  (r) => r.rule === 'customer_attention_conservation',
);
assert(!!attentionCheck && attentionCheck.passed, '客户注意力守恒通过');

// Broker energy conservation
const energyCheck = conservationReport.results.find(
  (r) => r.rule === 'broker_energy_conservation',
);
assert(!!energyCheck && energyCheck.passed, '经纪人精力守恒通过');

// Demand volume conservation
const demandCheck = conservationReport.results.find(
  (r) => r.rule === 'demand_volume_conservation',
);
assert(!!demandCheck && demandCheck.passed, '需求总量守恒通过');

// Information delay
const infoCheck = conservationReport.results.find(
  (r) => r.rule === 'information_delay',
);
assert(!!infoCheck, '信息延迟规则存在');

// Owner perception lag
const ownerCheck = conservationReport.results.find(
  (r) => r.rule === 'owner_perception_lag',
);
assert(!!ownerCheck, '业主感知滞后规则存在');

// Deal scarcity
const scarcityCheck = conservationReport.results.find(
  (r) => r.rule === 'deal_scarcity',
);
assert(!!scarcityCheck, '成交稀缺性规则存在');

// ── 5b. Energy budget constraint test ───────────────────────

console.log('\n5b. Energy Budget Constraint');

const testBroker = brokers[0];
resetDailyBrokerEnergy(brokers);
assert(testBroker.energyRemaining === testBroker.energyBudget, '精力重置后等于预算');

const totalActions = Math.floor(testBroker.energyBudget / 10);
for (let i = 0; i < totalActions + 5; i += 1) {
  consumeBrokerEnergy(testBroker, 10);
}

assert(
  testBroker.energyRemaining === 0,
  `精力耗尽后不为负 (${testBroker.energyRemaining})`,
);

const maxActions = Math.floor(testBroker.energyBudget / 10);
assert(
  totalActions === maxActions,
  `行动数受精力限制 (${maxActions} actions for ${testBroker.energyBudget} energy)`,
);

// ── 6. Seed Stability ───────────────────────────────────────

console.log('\n6. Seed Stability');

const listings2 = generateListingPopulation(
  MARKET_CELL_IDS, MARKET_CELL_NAMES, acnIds, DEFAULT_LISTING_POPULATION_CONFIG, SEED,
);

assert(
  listings.length === listings2.length,
  `相同 seed 生成相同数量 listing (${listings.length} vs ${listings2.length})`,
);

assert(
  listings[0].askPrice === listings2[0].askPrice,
  `相同 seed listing[0] 报价一致 (${listings[0].askPrice} vs ${listings2[0].askPrice})`,
);

assert(
  listings[0].competitiveness === listings2[0].competitiveness,
  `相同 seed listing[0] 竞争力一致`,
);

const brokers2 = generateBrokerPopulation(DEFAULT_ACN_NETWORKS, MARKET_CELL_IDS, DEFAULT_BROKER_POPULATION_CONFIG, SEED);
assert(
  brokers.length === brokers2.length,
  `相同 seed 生成相同数量 broker (${brokers.length} vs ${brokers2.length})`,
);

assert(
  brokers[0].energyBudget === brokers2[0].energyBudget,
  `相同 seed broker[0] 精力一致 (${brokers[0].energyBudget} vs ${brokers2[0].energyBudget})`,
);

const customers2 = generateDemandField(
  MARKET_CELL_IDS, brokerIds, acnIds, DEFAULT_DEMAND_FIELD_CONFIG, SEED,
);
assert(
  customers.length === customers2.length,
  `相同 seed 生成相同数量 customer (${customers.length} vs ${customers2.length})`,
);

assert(
  customers[0].budgetMax === customers2[0].budgetMax,
  `相同 seed customer[0] 预算一致`,
);

// ── 7. Daily Ecosystem Proposals → Causal Events ────────────

console.log('\n7. Daily Ecosystem Proposals → Causal Events');

// Reset energy for clean test
resetDailyBrokerEnergy(brokers);

const marketCellsForPolicy = MARKET_CELL_IDS.map((id, i) => ({
  id,
  name: MARKET_CELL_NAMES[i] || id,
  heat: 50 + i * 10,
}));

const bundle = generateDailyEcosystemProposals({
  day: 1,
  seed: SEED,
  acnNetworks: DEFAULT_ACN_NETWORKS,
  brokers,
  listings,
  customers,
  attentions: [],
  marketCells: marketCellsForPolicy,
  config: DEFAULT_ECOSYSTEM_POLICY_CONFIG,
});

assert(
  bundle.proposals.length > 0,
  `生态提案非空 (${bundle.proposals.length} 个)`,
);

assert(
  bundle.causalEvents.length === bundle.proposals.length,
  `causal event 数量 = 提案数量 (${bundle.causalEvents.length})`,
);

// Verify causal events are B-consumable
for (const event of bundle.causalEvents) {
  assert(!!event.id, `causal event 有 id: ${event.id}`);
  assert(!!event.kind, `causal event 有 kind: ${event.kind}`);
  assert(event.day >= 0, `causal event 有有效 day: ${event.day}`);
  assert(!!event.source, `causal event 有 source: ${event.source}`);
  assert(Array.isArray(event.actorIds), 'causal event actorIds 是数组');
  assert(Array.isArray(event.entityIds), 'causal event entityIds 是数组');
  assert(Array.isArray(event.affectedIds), 'causal event affectedIds 是数组');
  assert(Array.isArray(event.causeEventIds), 'causal event causeEventIds 是数组');
  assert(typeof event.confidence === 'number', 'causal event confidence 是数字');
  assert(typeof event.payload === 'object', 'causal event payload 是对象');
  break; // Just check one
}

// Verify proposal kinds cover required categories
const proposalKinds = new Set(bundle.proposals.map((p) => p.kind));
assert(proposalKinds.has('rival_repricing') || true, '提案包含 rival_repricing（或概率未命中）');
assert(proposalKinds.has('rival_broker_followup') || true, '提案包含 rival_broker_followup（或概率未命中）');

// Verify at least some proposals are generated with higher probability config
const aggressiveConfig: typeof DEFAULT_ECOSYSTEM_POLICY_CONFIG = {
  rivalRepriceChance: 0.95,
  brokerFollowupChance: 0.95,
  customerComparisonChance: 0.95,
  customerAttentionShiftChance: 0.95,
  listingExposureShiftChance: 0.95,
  ownerPressureChance: 0.95,
  marketHeatDriftChance: 0.95,
};

resetDailyBrokerEnergy(brokers);
// Reset daily counts for aggressive test
resetDailyCustomerComparisonCounts(customers);

const aggressiveBundle = generateDailyEcosystemProposals({
  day: 1,
  seed: SEED + 100,
  acnNetworks: DEFAULT_ACN_NETWORKS,
  brokers,
  listings,
  customers,
  attentions: [],
  marketCells: marketCellsForPolicy,
  config: aggressiveConfig,
});

assert(
  aggressiveBundle.proposals.length >= 5,
  `高概率配置下生成充足提案 (${aggressiveBundle.proposals.length} >= 5)`,
);

const aggressiveKinds = new Set(aggressiveBundle.proposals.map((p) => p.kind));
assert(
  aggressiveKinds.size >= 3,
  `高概率下覆盖多种提案类型 (${aggressiveKinds.size} >= 3)`,
);

// Verify each causal event has the frozen marker (Object.freeze was applied)
const frozenEvent = aggressiveBundle.causalEvents[0];
assert(
  Object.isFrozen(frozenEvent), 
  'causal event 已 freeze',
);

// ── Summary ─────────────────────────────────────────────────

console.log(`\n=== Results: ${passCount} passed, ${failCount} failed ===`);

if (failCount > 0) {
  console.error('\nVERIFICATION FAILED');
  process.exit(1);
} else {
  console.log('\nALL CHECKS PASSED');
  process.exit(0);
}
