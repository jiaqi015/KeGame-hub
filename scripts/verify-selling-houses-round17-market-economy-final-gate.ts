/**
 * Round 17 — Market-Economy-Big Final Gate
 *
 * Proves Big World has moved from MARKET-FORMATION-BIG to MARKET-ECONOMY-BIG:
 * scale + scarcity + runtime economy receipts + strategic product decisions.
 *
 * This gate is deliberately hard against false positives:
 *   - not enough to add customers/listings
 *   - not enough to have a standalone economy summary
 *   - not enough for projection to be non-null
 *   - not enough to read legacy rival listings if long-horizon shadow rivals are inactive
 *
 * Usage: npx tsx scripts/verify-selling-houses-round17-market-economy-final-gate.ts
 */

import {
  ROUND17_SEED,
  advanceMarketEconomyWorld,
  buildMarketEconomyWorld,
  bootstrapOf,
  scaleOf,
  diversityOf,
  buildStrategicProjectionFromState,
  countEconomySourceRecords,
  causalEventIds,
  eventHasSourceKind,
  readSrc,
  sameStringList,
  uniqueSourceKinds,
} from './verify-selling-houses-round17-market-economy-gate-core.js';
import { buildMarketFormationSummary } from '../src/selling-houses/domain/world-model/marketFormationBootstrap.js';
import { buildProductSurfaceCensus, buildProductCensusSummary } from '../src/selling-houses/application/projections/noDeadCornerProductCensus.js';
import type { SourceKind } from '../src/selling-houses/domain/world-model/informationSourceTypes.js';

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(condition: boolean, message: string) {
  if (condition) {
    passed += 1;
    console.log(`  ✅ ${message}`);
  } else {
    failed += 1;
    failures.push(message);
    console.error(`  ❌ ${message}`);
  }
}

function section(title: string) {
  console.log(`\n━━━ ${title} ━━━`);
}

console.log('╔══════════════════════════════════════════════════════════════════╗');
console.log('║  Round 17 — Market-Economy-Big Final Gate                       ║');
console.log('╚══════════════════════════════════════════════════════════════════╝');

section('1. SCALE + DIVERSITY');
const baseState = buildMarketEconomyWorld(ROUND17_SEED);
const bootstrap = bootstrapOf(baseState);
const scale = scaleOf(baseState);
const diversity = diversityOf(baseState);
const formationSummary = buildMarketFormationSummary(bootstrap.hiddenTruth.marketFormation);
const economy = formationSummary.economy;

check(scale.totalListings >= 800, `listings >= 800 (${scale.totalListings})`);
check(scale.totalOwners >= 500, `owners >= 500 (${scale.totalOwners})`);
check(scale.totalCustomers >= 3000, `customers >= 3000 (${scale.totalCustomers})`);
check(scale.totalBrokers >= 150, `brokers >= 150 (${scale.totalBrokers})`);
check(scale.marketCells >= 24, `market cells >= 24 (${scale.marketCells})`);
check(diversity.ownerArchetypeDiversity >= 15, `owner archetypes >= 15 (${diversity.ownerArchetypeDiversity})`);
check(diversity.demandSegmentDiversity >= 10, `demand segments >= 10 (${diversity.demandSegmentDiversity})`);

section('2. MARKET ECONOMY — resource pools, scarcity, opportunity cost');
check(economy.brokerPoolCount >= 150, `broker pools >= 150 (${economy.brokerPoolCount})`);
check(economy.listingPoolCount >= 800, `listing pools >= 800 (${economy.listingPoolCount})`);
check(economy.customerPoolCount >= 1000, `customer pools >= 1000 (${economy.customerPoolCount})`);
check(economy.orgPoolCount >= 8, `org pools >= 8 (${economy.orgPoolCount})`);
check(economy.opportunityCostCount >= 100, `opportunity costs >= 100 (${economy.opportunityCostCount})`);
check(economy.avgBrokerUtilization >= 30 && economy.avgBrokerUtilization <= 85, `broker utilization reasonable (${economy.avgBrokerUtilization})`);
check(economy.bottleneckedBrokerCount >= 5 && economy.bottleneckedBrokerCount < economy.brokerPoolCount, `broker bottlenecks real but not all (${economy.bottleneckedBrokerCount}/${economy.brokerPoolCount})`);
check(economy.atRiskCustomerCount >= 50 && economy.atRiskCustomerCount < economy.customerPoolCount, `customer risk distributed (${economy.atRiskCustomerCount}/${economy.customerPoolCount})`);
check(Object.values(economy.meetsMarketEconomyThresholds).every(Boolean), 'all market economy summary thresholds pass');

section('3. LIVE RUNTIME — long-horizon economic tick');
const state7 = advanceMarketEconomyWorld(7, ROUND17_SEED);
const state14 = advanceMarketEconomyWorld(14, ROUND17_SEED);
const state30 = advanceMarketEconomyWorld(30, ROUND17_SEED);
const state60 = advanceMarketEconomyWorld(60, ROUND17_SEED);

const events7 = state7.worldCausalEvents?.length ?? 0;
const events14 = state14.worldCausalEvents?.length ?? 0;
const events30 = state30.worldCausalEvents?.length ?? 0;
const events60 = state60.worldCausalEvents?.length ?? 0;

check((state60.bigWorldRuntime?.tickCount ?? 0) >= 60, `60-day tickCount reached (${state60.bigWorldRuntime?.tickCount ?? 0})`);
check(!state60.gameOver, 'long-horizon world still live at day 60');
check(events14 > events7 && events30 > events14 && events60 > events30, `causal events grow 7→14→30→60 (${events7}→${events14}→${events30}→${events60})`);

const economyEvents7 = countEconomySourceRecords(state7.worldCausalEvents ?? []);
const economyEvents14 = countEconomySourceRecords(state14.worldCausalEvents ?? []);
const economyEvents30 = countEconomySourceRecords(state30.worldCausalEvents ?? []);
check(economyEvents7 >= 20, `economy source causal events >= 20 by day 7 (${economyEvents7})`);
check(economyEvents14 > economyEvents7 && economyEvents30 > economyEvents14, `economy source causal events grow (${economyEvents7}→${economyEvents14}→${economyEvents30})`);

const requiredKinds: SourceKind[] = [
  'broker_capacity_signal',
  'manager_message',
  'customer_interaction',
  'owner_life_event_signal',
  'rival_action',
  'buyer_financing_signal',
];
const liveSourceKinds = uniqueSourceKinds(state30.worldCausalEvents ?? []);
for (const sourceKind of requiredKinds) {
  check(liveSourceKinds.has(sourceKind), `runtime source kind present: ${sourceKind}`);
}

section('4. STRATEGIC DECISION — cost/risk/horizon/evidence');
const strategic14 = buildStrategicProjectionFromState(state14);
const strategic30 = buildStrategicProjectionFromState(state30);

for (const [label, strategic, state] of [
  ['14d', strategic14, state14],
  ['30d', strategic30, state30],
] as const) {
  const activeShadowRivals = state.marketShadow.rivalListings.filter((rivalListing) => rivalListing.status === 'active').length;
  check(strategic.brokerOpportunity.topActions.length > 0, `${label} strategic topActions > 0`);
  check(strategic.sharedCausalRefs !== undefined, `${label} has shared causal refs`);
  check(strategic.competitivePressure.activeRivalCount > 0, `${label} competitor pressure survives shadow rival depletion (${strategic.competitivePressure.activeRivalCount}, shadow=${activeShadowRivals})`);
  check(strategic.competitivePressure.topRivalAction !== null, `${label} top rival evidence exists`);
  check(strategic.brokerOpportunity.topActions.every((action) => action.sourceRecordIds.length > 0), `${label} all actions have sourceRecordIds`);
  check(strategic.brokerOpportunity.topActions.every((action) => action.safeRefs.length > 0), `${label} all actions have safeRefs`);
  check(strategic.brokerOpportunity.topActions.every((action) => action.opportunityCost.foregoneAction !== '无替代方案'), `${label} no action uses empty opportunity cost`);
  check(strategic.brokerOpportunity.topActions.every((action) => action.competitorRisk.rivalCount > 0 && action.competitorRisk.riskMagnitude > 0), `${label} all actions have competitor risk`);
  check(strategic.brokerOpportunity.topActions.every((action) => action.timeHorizonImpact.length === 4), `${label} all actions carry 3/7/14/30 impact`);
}

section('5. RECEIPT DOMAINS — economy feedback is not standalone');
const events30List = state30.worldCausalEvents ?? [];
check(events30List.some((event) => eventHasSourceKind(event, 'broker_capacity_signal')), 'broker capacity receipt feedback exists');
check(events30List.some((event) => eventHasSourceKind(event, 'manager_message')), 'manager/budget receipt feedback exists');
check(events30List.some((event) => eventHasSourceKind(event, 'customer_interaction')), 'customer attention receipt feedback exists');
check(events30List.some((event) => eventHasSourceKind(event, 'owner_life_event_signal')), 'owner trust/patience receipt feedback exists');
check(events30List.some((event) => eventHasSourceKind(event, 'rival_action')), 'rival competition receipt feedback exists');
check(events30List.some((event) => eventHasSourceKind(event, 'buyer_financing_signal')), 'buyer financing receipt feedback exists');

section('6. REPLAY + PRODUCT CENSUS');
const replayA = advanceMarketEconomyWorld(30, ROUND17_SEED);
const replayB = advanceMarketEconomyWorld(30, ROUND17_SEED);
check(sameStringList(causalEventIds(replayA), causalEventIds(replayB)), 'same seed → byte-identical 30-day causal event IDs');

const census = buildProductSurfaceCensus();
const censusSummary = buildProductCensusSummary(census);
const strategicSurface = census.find((surface) => surface.surfaceId === 'strategic-decision');
check(censusSummary.totalSurfaces >= 16, `product census surfaces >= 16 (${censusSummary.totalSurfaces})`);
check(strategicSurface?.verdict === 'connected', 'strategic-decision surface is connected in product census');

section('7. NO GLOBAL LEAKAGE + NO FAKE CORE RANDOMNESS');
const strategicSrc = readSrc('src/selling-houses/application/projections/strategicMarketDecisionProjection.ts');
const actorKnowledgeSrc = readSrc('src/selling-houses/application/projections/actorKnowledgeProjection.ts');
const runtimeSrc = readSrc('src/selling-houses/domain/world-model/runtime/marketEconomyRuntime.ts');
const bootstrapSrc = readSrc('src/selling-houses/domain/world-model/marketEconomyBootstrap.ts');
check(!strategicSrc.includes('queryHiddenSourceRecords'), 'strategic projection does not query hidden source records');
check(!actorKnowledgeSrc.includes('queryHiddenSourceRecords'), 'actorKnowledge projection does not query hidden source records');
check(!/\bMath\.random\s*\(/.test(runtimeSrc) && !/\bMath\.random\s*\(/.test(bootstrapSrc), 'economy core has no Math.random calls');
check(!/\bDate\.now\s*\(/.test(runtimeSrc) && !/\bDate\.now\s*\(/.test(bootstrapSrc), 'economy core has no Date.now calls');
check(!/\bfetch\s*\(/.test(runtimeSrc) && !/\bfetch\s*\(/.test(bootstrapSrc), 'economy core has no fetch calls');

section('8. SELF-AUDIT — no soft pass patterns');
const gateSrc = readSrc('scripts/verify-selling-houses-round17-market-economy-final-gate.ts');
const auditStart = gateSrc.indexOf("section('8. SELF-AUDIT");
const gateSrcCore = auditStart > 0 ? gateSrc.slice(0, auditStart) : gateSrc;
const gateSrcNoComments = gateSrcCore
  .replace(/\/\/.*$/gm, '')
  .replace(/\/\*[\s\S]*?\*\//g, '');
check(!gateSrcNoComments.includes('|| true'), 'gate source has no || true');
check(!gateSrcNoComments.match(/check\(\s*true\s*,/), 'gate source has no check(true, ...)');

section('MATURITY CLASSIFICATION');
const hasScale = scale.totalListings >= 800 && scale.totalOwners >= 500 && scale.totalCustomers >= 3000 && scale.totalBrokers >= 150;
const hasEconomy = economy.opportunityCostCount >= 100 && economy.avgBrokerUtilization >= 30 && economy.bottleneckedBrokerCount >= 5 && economy.atRiskCustomerCount >= 50;
const hasRuntime = (state60.bigWorldRuntime?.tickCount ?? 0) >= 60 && events60 > events30 && economyEvents30 > economyEvents14;
const hasStrategy = strategic30.brokerOpportunity.topActions.length > 0
  && strategic30.brokerOpportunity.topActions.every((action) => action.opportunityCost.foregoneAction !== '无替代方案' && action.competitorRisk.riskMagnitude > 0);
const hasReplay = sameStringList(causalEventIds(replayA), causalEventIds(replayB));
const hasNoLeakage = !strategicSrc.includes('queryHiddenSourceRecords') && !actorKnowledgeSrc.includes('queryHiddenSourceRecords');

const marketFormationBig = hasScale && events30 > events14 && liveSourceKinds.size >= 8 && hasReplay && hasNoLeakage;
const marketEconomyBig = marketFormationBig && hasEconomy && hasRuntime && hasStrategy;
const maxLevel = marketEconomyBig
  ? 'MARKET-ECONOMY-BIG'
  : marketFormationBig
    ? 'MARKET-FORMATION-BIG'
    : hasScale
      ? 'SCALE-BIG'
      : 'FAILED';

console.log(`  FINAL MATURITY: ${maxLevel}`);
check(maxLevel === 'MARKET-ECONOMY-BIG', `final maturity is MARKET-ECONOMY-BIG (${maxLevel})`);

console.log('\n═══════════════════════════════════════════════════════════════');
console.log(`  Round 17 Final Gate Passed: ${passed} | Failed: ${failed}`);
console.log(`  Maturity: ${maxLevel}`);
console.log('═══════════════════════════════════════════════════════════════');

if (failed > 0) {
  console.error('\n  ❌ GATE FAILED:');
  for (const failure of failures) console.error(`    • ${failure}`);
  process.exit(1);
}

console.log('\n  ✅ GATE PASSED — MARKET-ECONOMY-BIG achieved');
