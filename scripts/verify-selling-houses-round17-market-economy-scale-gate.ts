/**
 * Round 17 — Market-Economy Scale Gate
 *
 * Proves R17 is not only "more entities": market scale now has scarce resource
 * pools, opportunity costs, bottlenecked brokers, at-risk customers, and
 * replayable economy summaries.
 *
 * Usage: npx tsx scripts/verify-selling-houses-round17-market-economy-scale-gate.ts
 */

import {
  ROUND17_SEED,
  buildMarketEconomyWorld,
  bootstrapOf,
  scaleOf,
  diversityOf,
  readSrc,
} from './verify-selling-houses-round17-market-economy-gate-core.js';
import { buildMarketFormationSummary } from '../src/selling-houses/domain/world-model/marketFormationBootstrap.js';

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
console.log('║  Round 17 — Market-Economy Scale Gate                           ║');
console.log('╚══════════════════════════════════════════════════════════════════╝');

section('1. ENTITY SCALE — hundreds-scale market');
const state = buildMarketEconomyWorld(ROUND17_SEED);
const bootstrap = bootstrapOf(state);
const scale = scaleOf(state);
const diversity = diversityOf(state);

console.log(`  Scale: ${scale.totalListings} listings, ${scale.totalOwners} owners, ${scale.totalCustomers} customers, ${scale.totalBrokers} brokers, ${scale.marketCells} cells`);

check(scale.totalListings >= 800, `listings >= 800 (${scale.totalListings})`);
check(scale.totalOwners >= 500, `owners >= 500 (${scale.totalOwners})`);
check(scale.totalCustomers >= 3000, `customers >= 3000 (${scale.totalCustomers})`);
check(scale.totalBrokers >= 150, `brokers >= 150 (${scale.totalBrokers})`);
check(scale.marketCells >= 24, `market cells >= 24 (${scale.marketCells})`);
check(scale.acnNetworks >= 8, `ACN networks >= 8 (${scale.acnNetworks})`);
check(diversity.ownerArchetypeDiversity >= 15, `owner archetypes >= 15 (${diversity.ownerArchetypeDiversity})`);
check(diversity.demandSegmentDiversity >= 10, `demand segments >= 10 (${diversity.demandSegmentDiversity})`);

section('2. ECONOMY SCALE — resource pools and opportunity costs');
const formationSummary = buildMarketFormationSummary(bootstrap.hiddenTruth.marketFormation);
const economy = formationSummary.economy;
console.log(`  Economy: ${economy.brokerPoolCount} broker pools, ${economy.listingPoolCount} listing pools, ${economy.customerPoolCount} customer pools, ${economy.orgPoolCount} org pools, ${economy.opportunityCostCount} opportunity costs`);

check(economy.brokerPoolCount >= 150, `broker resource pools >= 150 (${economy.brokerPoolCount})`);
check(economy.listingPoolCount >= 800, `listing resource pools >= 800 (${economy.listingPoolCount})`);
check(economy.customerPoolCount >= 1000, `customer resource pools >= 1000 (${economy.customerPoolCount})`);
check(economy.orgPoolCount >= 8, `org resource pools >= 8 (${economy.orgPoolCount})`);
check(economy.opportunityCostCount >= 100, `opportunity cost entries >= 100 (${economy.opportunityCostCount})`);

section('3. SCARCITY — not flat, not all-zero, not all-same');
check(economy.avgBrokerUtilization >= 30, `avg broker utilization >= 30 (${economy.avgBrokerUtilization})`);
check(economy.avgBrokerUtilization <= 85, `avg broker utilization <= 85 (${economy.avgBrokerUtilization})`);
check(economy.bottleneckedBrokerCount >= 5, `bottlenecked brokers >= 5 (${economy.bottleneckedBrokerCount})`);
check(economy.bottleneckedBrokerCount < economy.brokerPoolCount, `not every broker bottlenecked (${economy.bottleneckedBrokerCount}/${economy.brokerPoolCount})`);
check(economy.atRiskCustomerCount >= 50, `at-risk customers >= 50 (${economy.atRiskCustomerCount})`);
check(economy.atRiskCustomerCount < economy.customerPoolCount, `not every customer at-risk (${economy.atRiskCustomerCount}/${economy.customerPoolCount})`);
check(economy.totalDailyEnergyInflow > 0 && economy.totalDailyEnergyOutflow > 0, `energy flow non-zero (${economy.totalDailyEnergyInflow}/${economy.totalDailyEnergyOutflow})`);
check(economy.totalWeeklyBudgetInflow > 0 && economy.totalWeeklyBudgetOutflow > 0, `budget flow non-zero (${economy.totalWeeklyBudgetInflow}/${economy.totalWeeklyBudgetOutflow})`);

section('4. SELF-AUDIT — no soft pass patterns');
const gateSrc = readSrc('scripts/verify-selling-houses-round17-market-economy-scale-gate.ts');
const auditStart = gateSrc.indexOf("section('4. SELF-AUDIT");
const gateSrcCore = auditStart > 0 ? gateSrc.slice(0, auditStart) : gateSrc;
const gateSrcNoComments = gateSrcCore
  .replace(/\/\/.*$/gm, '')
  .replace(/\/\*[\s\S]*?\*\//g, '');
check(!gateSrcNoComments.includes('|| true'), 'gate source has no || true');
check(!gateSrcNoComments.match(/check\(\s*true\s*,/), 'gate source has no check(true, ...)');

console.log('\n═══════════════════════════════════════════════════════════════');
console.log(`  Round 17 Scale Gate Passed: ${passed} | Failed: ${failed}`);
console.log('═══════════════════════════════════════════════════════════════');

if (failed > 0) {
  console.error('\n  ❌ GATE FAILED:');
  for (const failure of failures) console.error(`    • ${failure}`);
  process.exit(1);
}

console.log('\n  ✅ GATE PASSED — market-economy scale is real');
