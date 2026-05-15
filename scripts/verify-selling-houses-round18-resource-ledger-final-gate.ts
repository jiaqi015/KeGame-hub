/**
 * Round 18 — Resource-Ledger Final Gate
 *
 * Proves the market economy is not just bootstrap data + projection boilerplate,
 * but has a real resource ledger running in the tick chain that is traceable,
 * replayable, and consumed by strategic decisions.
 *
 * This gate catches 5 false-positive classes:
 *   1. Standalone ledger — ledger entries exist but strategic decisions don't consume them
 *   2. Projection non-null — projection exists but fields are empty/fallback
 *   3. Legacy fallback — resourceCost comes from hardcoded map, not evidence
 *   4. Empty knowledge bypass — empty knowledge still produces recommendations
 *   5. Soft pass — gate uses || true / check(true) to pass core assertions
 *
 * Combines R17 market-economy checks with R18 resource-ledger checks.
 *
 * Maturity: FAILED | MARKET-ECONOMY-BIG | RESOURCE-LEDGER-ECONOMY-BIG
 *
 * Usage: npx tsx scripts/verify-selling-houses-round18-resource-ledger-final-gate.ts
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
  sameStringList,
  uniqueSourceKinds,
  readSrc,
} from './verify-selling-houses-round17-market-economy-gate-core.js';
import { buildMarketFormationSummary } from '../src/selling-houses/domain/world-model/marketFormationBootstrap.js';
import { buildProductSurfaceCensus, buildProductCensusSummary } from '../src/selling-houses/application/projections/noDeadCornerProductCensus.js';
import { buildStrategicMarketDecisionProjection } from '../src/selling-houses/application/projections/strategicMarketDecisionProjection.js';
import type { SourceKind } from '../src/selling-houses/domain/world-model/informationSourceTypes.js';
import type { WorldCausalEvent } from '../src/selling-houses/domain/world-model/causalEvents.js';

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
console.log('║  Round 18 — Resource-Ledger Final Gate                          ║');
console.log('║  Catches: standalone ledger, projection null, legacy fallback,   ║');
console.log('║           empty knowledge bypass, soft pass                      ║');
console.log('╚══════════════════════════════════════════════════════════════════╝');

// ═══════════════════════════════════════════════════════════════
// 1. SCALE + DIVERSITY
// ═══════════════════════════════════════════════════════════════
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

// ═══════════════════════════════════════════════════════════════
// 2. MARKET ECONOMY — resource pools, scarcity, opportunity cost
// ═══════════════════════════════════════════════════════════════
section('2. MARKET ECONOMY — resource pools and scarcity');
check(economy.brokerPoolCount >= 150, `broker pools >= 150 (${economy.brokerPoolCount})`);
check(economy.listingPoolCount >= 800, `listing pools >= 800 (${economy.listingPoolCount})`);
check(economy.customerPoolCount >= 1000, `customer pools >= 1000 (${economy.customerPoolCount})`);
check(economy.orgPoolCount >= 8, `org pools >= 8 (${economy.orgPoolCount})`);
check(economy.opportunityCostCount >= 100, `opportunity costs >= 100 (${economy.opportunityCostCount})`);
check(economy.avgBrokerUtilization >= 30 && economy.avgBrokerUtilization <= 85, `broker utilization reasonable (${economy.avgBrokerUtilization})`);
check(economy.bottleneckedBrokerCount >= 5, `broker bottlenecks >= 5 (${economy.bottleneckedBrokerCount})`);
check(economy.atRiskCustomerCount >= 50, `at-risk customers >= 50 (${economy.atRiskCustomerCount})`);
check(Object.values(economy.meetsMarketEconomyThresholds).every(Boolean), 'all economy thresholds pass');

// ═══════════════════════════════════════════════════════════════
// 3. RESOURCE LEDGER — entries grow across 7/14/30/60 day horizons
// ═══════════════════════════════════════════════════════════════
section('3. RESOURCE LEDGER — entries grow over time');
const state7 = advanceMarketEconomyWorld(7, ROUND17_SEED);
const state14 = advanceMarketEconomyWorld(14, ROUND17_SEED);
const state30 = advanceMarketEconomyWorld(30, ROUND17_SEED);
const state60 = advanceMarketEconomyWorld(60, ROUND17_SEED);

const ledger7 = countEconomySourceRecords(state7.worldCausalEvents ?? []);
const ledger14 = countEconomySourceRecords(state14.worldCausalEvents ?? []);
const ledger30 = countEconomySourceRecords(state30.worldCausalEvents ?? []);
const ledger60 = countEconomySourceRecords(state60.worldCausalEvents ?? []);

check(ledger7 >= 20, `7-day ledger entries >= 20 (${ledger7})`);
check(ledger14 > ledger7, `ledger grows 7→14 (${ledger7}→${ledger14})`);
check(ledger30 > ledger14, `ledger grows 14→30 (${ledger14}→${ledger30})`);
check(ledger60 > ledger30, `ledger grows 30→60 (${ledger30}→${ledger60})`);

const events7 = state7.worldCausalEvents?.length ?? 0;
const events14 = state14.worldCausalEvents?.length ?? 0;
const events30 = state30.worldCausalEvents?.length ?? 0;
const events60 = state60.worldCausalEvents?.length ?? 0;
check(events14 > events7, `total causal events grow 7→14 (${events7}→${events14})`);
check(events30 > events14, `total causal events grow 14→30 (${events14}→${events30})`);
check(events60 > events30, `total causal events grow 30→60 (${events30}→${events60})`);

check((state60.bigWorldRuntime?.tickCount ?? 0) >= 60, `60-day tickCount reached (${state60.bigWorldRuntime?.tickCount ?? 0})`);
check(!state60.gameOver, 'long-horizon world still live at day 60');

// ═══════════════════════════════════════════════════════════════
// 4. LEDGER TRACEABILITY — sourceRecordId / sourceReplayKey on every entry
// ═══════════════════════════════════════════════════════════════
section('4. LEDGER TRACEABILITY — every entry traceable');
const events30List = state30.worldCausalEvents ?? [];
let traceableLedgerEntries = 0;
let untraceableLedgerEntries = 0;
for (const event of events30List) {
  const eventRecord = event as WorldCausalEvent & {
    readonly sourceRecordId?: string;
    readonly sourceRecordIds?: readonly string[];
    readonly sourceReplayKey?: string;
  };
  const isLedgerEntry = eventRecord.sourceRecordId?.startsWith('isr-eco-')
    || eventRecord.sourceRecordIds?.some((id) => id.startsWith('isr-eco-'));
  if (!isLedgerEntry) continue;

  const hasSourceRecordId = !!(eventRecord.sourceRecordId || eventRecord.sourceRecordIds?.length);
  const hasSourceReplayKey = !!eventRecord.sourceReplayKey;
  if (hasSourceRecordId && hasSourceReplayKey) {
    traceableLedgerEntries += 1;
  } else {
    untraceableLedgerEntries += 1;
  }
}
check(traceableLedgerEntries > 0, `traceable ledger entries > 0 (${traceableLedgerEntries})`);
check(untraceableLedgerEntries === 0, `untraceable ledger entries = 0 (${untraceableLedgerEntries})`);

// ═══════════════════════════════════════════════════════════════
// 5. RECEIPT DOMAINS — all resource types produce causal events
// ═══════════════════════════════════════════════════════════════
section('5. RECEIPT DOMAINS — all resource types covered');
const requiredKinds: SourceKind[] = [
  'broker_capacity_signal',
  'manager_message',
  'customer_interaction',
  'owner_life_event_signal',
  'rival_action',
  'buyer_financing_signal',
];
const liveSourceKinds = uniqueSourceKinds(state30.worldCausalEvents ?? []);
for (const kind of requiredKinds) {
  check(liveSourceKinds.has(kind), `source kind present: ${kind}`);
}

// ═══════════════════════════════════════════════════════════════
// 6. STRATEGIC DECISION — resourceCost/opportunityCost/competitorRisk from evidence
// ═══════════════════════════════════════════════════════════════
section('6. STRATEGIC DECISION — evidence-backed, not legacy fallback');
const strategic14 = buildStrategicProjectionFromState(state14);
const strategic30 = buildStrategicProjectionFromState(state30);

for (const [label, strategic] of [['14d', strategic14], ['30d', strategic30]] as const) {
  check(strategic.brokerOpportunity.topActions.length > 0, `${label} topActions > 0`);
  check(strategic.sharedCausalRefs !== undefined, `${label} sharedCausalRefs exists`);

  for (const action of strategic.brokerOpportunity.topActions) {
    // resourceCost must have real values (not all zero)
    check(
      action.resourceCost.energyCost > 0 || action.resourceCost.budgetCost > 0,
      `${label} "${action.actionLabel}" has real resourceCost (energy=${action.resourceCost.energyCost}, budget=${action.resourceCost.budgetCost})`,
    );

    // opportunityCost must not be empty fallback
    check(
      action.opportunityCost.foregoneAction !== '无替代方案',
      `${label} "${action.actionLabel}" has real opportunityCost (foregone=${action.opportunityCost.foregoneAction})`,
    );
    check(
      action.opportunityCost.foregoneConfidence > 0,
      `${label} opportunityCost has confidence (${action.opportunityCost.foregoneConfidence})`,
    );

    // competitorRisk must come from visible causal refs, not just legacy shadow
    check(
      action.competitorRisk.rivalCount > 0,
      `${label} "${action.actionLabel}" has competitorRisk rivalCount (${action.competitorRisk.rivalCount})`,
    );
    check(
      action.competitorRisk.riskMagnitude > 0,
      `${label} "${action.actionLabel}" has competitorRisk magnitude (${action.competitorRisk.riskMagnitude})`,
    );

    // sourceRecordIds must be non-empty (from evidence pipeline)
    check(
      action.sourceRecordIds.length > 0,
      `${label} "${action.actionLabel}" has sourceRecordIds (${action.sourceRecordIds.length})`,
    );

    // safeRefs must be non-empty
    check(
      action.safeRefs.length > 0,
      `${label} "${action.actionLabel}" has safeRefs (${action.safeRefs.length})`,
    );

    // timeHorizonImpact must have 3/7/14/30
    check(
      action.timeHorizonImpact.length === 4,
      `${label} action has 3/7/14/30 horizon impact (${action.timeHorizonImpact.length})`,
    );
  }
}

// ═══════════════════════════════════════════════════════════════
// 7. LONG-HORIZON RIVAL DEPLETION — competitor pressure survives
// ═══════════════════════════════════════════════════════════════
section('7. LONG-HORIZON RIVAL DEPLETION — pressure from visible causal refs');
const activeShadowRivals60 = state60.marketShadow.rivalListings.filter(
  (r) => r.status === 'active',
).length;
const strategic60 = buildStrategicProjectionFromState(state60);

check(strategic60.competitivePressure.activeRivalCount > 0, `60d competitor pressure > 0 (shadow rivals=${activeShadowRivals60}, pressure=${strategic60.competitivePressure.activeRivalCount})`);
check(strategic60.competitivePressure.topRivalAction !== null, '60d top rival evidence exists');
check(strategic60.brokerOpportunity.topActions.length > 0, '60d topActions > 0 even with rival depletion');

for (const action of strategic60.brokerOpportunity.topActions) {
  check(
    action.competitorRisk.riskMagnitude > 0,
    `60d "${action.actionLabel}" has competitor risk from visible causal refs (${action.competitorRisk.riskMagnitude})`,
  );
}

// ═══════════════════════════════════════════════════════════════
// 8. EMPTY KNOWLEDGE — no recommendation, no legacy bypass
// ═══════════════════════════════════════════════════════════════
section('8. EMPTY KNOWLEDGE — no recommendation');
const emptyState = buildMarketEconomyWorld(ROUND17_SEED);
const emptyStrategic = buildStrategicMarketDecisionProjection(emptyState);
check(emptyStrategic.brokerOpportunity.topActions.length === 0, 'empty knowledge → no strategic topActions');
check(emptyStrategic.sharedCausalRefs === undefined, 'empty knowledge → no sharedCausalRefs');

// ═══════════════════════════════════════════════════════════════
// 9. REPLAY — byte-identical ledger events
// ═══════════════════════════════════════════════════════════════
section('9. REPLAY — byte-identical');
const replayA = advanceMarketEconomyWorld(30, ROUND17_SEED);
const replayB = advanceMarketEconomyWorld(30, ROUND17_SEED);
check(sameStringList(causalEventIds(replayA), causalEventIds(replayB)), 'same seed → byte-identical 30-day causal event IDs');

const replay60A = advanceMarketEconomyWorld(60, ROUND17_SEED);
const replay60B = advanceMarketEconomyWorld(60, ROUND17_SEED);
check(sameStringList(causalEventIds(replay60A), causalEventIds(replay60B)), 'same seed → byte-identical 60-day causal event IDs');

function economyEventIds(state: ReturnType<typeof advanceMarketEconomyWorld>): readonly string[] {
  return (state.worldCausalEvents ?? [])
    .filter((event) => {
      const eventRecord = event as WorldCausalEvent & { readonly sourceRecordId?: string };
      return eventRecord.sourceRecordId?.startsWith('isr-eco-');
    })
    .map((event) => event.id)
    .sort();
}
check(
  sameStringList(economyEventIds(replayA), economyEventIds(replayB)),
  'same seed → byte-identical economy ledger event IDs',
);

// ═══════════════════════════════════════════════════════════════
// 10. SOURCE CODE BOUNDARIES — no hidden truth, no fake randomness
// ═══════════════════════════════════════════════════════════════
section('10. SOURCE CODE BOUNDARIES');
const strategicSrc = readSrc('src/selling-houses/application/projections/strategicMarketDecisionProjection.ts');
const actorKnowledgeSrc = readSrc('src/selling-houses/application/projections/actorKnowledgeProjection.ts');
const runtimeSrc = readSrc('src/selling-houses/domain/world-model/runtime/marketEconomyRuntime.ts');
const bootstrapSrc = readSrc('src/selling-houses/domain/world-model/marketEconomyBootstrap.ts');
const receiptWiringSrc = readSrc('src/selling-houses/domain/world-model/runtime/economicReceiptWiring.ts');

check(!strategicSrc.includes('queryHiddenSourceRecords'), 'strategic projection no hidden truth');
check(!actorKnowledgeSrc.includes('queryHiddenSourceRecords'), 'actorKnowledge no hidden truth');
check(!/\bMath\.random\s*\(/.test(runtimeSrc), 'runtime no Math.random');
check(!/\bDate\.now\s*\(/.test(runtimeSrc), 'runtime no Date.now');
check(!/\bfetch\s*\(/.test(runtimeSrc), 'runtime no fetch');
check(!/\bMath\.random\s*\(/.test(bootstrapSrc), 'bootstrap no Math.random');
check(!/\bDate\.now\s*\(/.test(bootstrapSrc), 'bootstrap no Date.now');
check(!/\bfetch\s*\(/.test(bootstrapSrc), 'bootstrap no fetch');
check(!/\bMath\.random\s*\(/.test(receiptWiringSrc), 'receiptWiring no Math.random');
check(!/\bDate\.now\s*\(/.test(receiptWiringSrc), 'receiptWiring no Date.now');

// ═══════════════════════════════════════════════════════════════
// 11. PRODUCT CENSUS + NO-DEAD-CORNER
// ═══════════════════════════════════════════════════════════════
section('11. PRODUCT CENSUS — no significant gaps');
const census = buildProductSurfaceCensus();
const censusSummary = buildProductCensusSummary(census);
check(censusSummary.totalSurfaces >= 16, `product census surfaces >= 16 (${censusSummary.totalSurfaces})`);
check(censusSummary.connectedSurfaces >= 12, `connected surfaces >= 12 (${censusSummary.connectedSurfaces})`);
check(censusSummary.disconnectedSurfaceIds.every((id) => ['leaderboard', 'architecture-migration-readiness', 'architecture-parity'].includes(id)), 'all disconnected surfaces are intentional exemptions');

// ═══════════════════════════════════════════════════════════════
// 12. SELF-AUDIT — no soft pass patterns
// ═══════════════════════════════════════════════════════════════
section('12. SELF-AUDIT — no soft pass patterns');
const gateSrc = readSrc('scripts/verify-selling-houses-round18-resource-ledger-final-gate.ts');
const auditStart = gateSrc.indexOf("section('12. SELF-AUDIT");
const gateSrcCore = auditStart > 0 ? gateSrc.slice(0, auditStart) : gateSrc;
const gateSrcNoComments = gateSrcCore
  .replace(/\/\/.*$/gm, '')
  .replace(/\/\*[\s\S]*?\*\//g, '');
check(!gateSrcNoComments.includes('|| true'), 'gate source has no || true');
check(!gateSrcNoComments.match(/check\(\s*true\s*,/), 'gate source has no check(true, ...)');

// ═══════════════════════════════════════════════════════════════
// MATURITY CLASSIFICATION
// ═══════════════════════════════════════════════════════════════
section('MATURITY CLASSIFICATION');
const hasScale = scale.totalListings >= 800 && scale.totalOwners >= 500 && scale.totalCustomers >= 3000 && scale.totalBrokers >= 150;
const hasLedgerGrowth = ledger14 > ledger7 && ledger30 > ledger14 && ledger60 > ledger30;
const hasLedgerTraceability = traceableLedgerEntries > 0 && untraceableLedgerEntries === 0;
const hasLedgerReplay = sameStringList(economyEventIds(replayA), economyEventIds(replayB));
const hasStrategicEvidence = strategic30.brokerOpportunity.topActions.length > 0
  && strategic30.brokerOpportunity.topActions.every((a) => a.sourceRecordIds.length > 0 && a.opportunityCost.foregoneAction !== '无替代方案');
const hasEmptyKnowledgeBypass = emptyStrategic.brokerOpportunity.topActions.length === 0;
const hasLongHorizonPressure = strategic60.competitivePressure.activeRivalCount > 0;
const hasAllReceiptDomains = requiredKinds.every((kind) => liveSourceKinds.has(kind));
const hasNoLeakage = !strategicSrc.includes('queryHiddenSourceRecords') && !actorKnowledgeSrc.includes('queryHiddenSourceRecords');
const hasNoFakeRandomness = !/\bMath\.random\s*\(/.test(runtimeSrc) && !/\bDate\.now\s*\(/.test(runtimeSrc);
const hasNoSoftPass = !gateSrcNoComments.includes('|| true') && !gateSrcNoComments.match(/check\(\s*true\s*,/);
const hasCensusClean = censusSummary.connectedSurfaces >= 12
  && censusSummary.disconnectedSurfaceIds.every((id) => ['leaderboard', 'architecture-migration-readiness', 'architecture-parity'].includes(id));

const resourceLedgerEconomyBig = hasScale && hasLedgerGrowth && hasLedgerTraceability && hasLedgerReplay
  && hasStrategicEvidence && hasEmptyKnowledgeBypass && hasLongHorizonPressure && hasAllReceiptDomains
  && hasNoLeakage && hasNoFakeRandomness && hasNoSoftPass && hasCensusClean;

const marketEconomyBig = hasScale && events30 > events14 && liveSourceKinds.size >= 8 && hasLedgerReplay && hasNoLeakage;
const maxLevel = resourceLedgerEconomyBig
  ? 'RESOURCE-LEDGER-ECONOMY-BIG'
  : marketEconomyBig
    ? 'MARKET-ECONOMY-BIG'
    : hasScale
      ? 'SCALE-BIG'
      : 'FAILED';

console.log(`  FINAL MATURITY: ${maxLevel}`);
check(maxLevel === 'RESOURCE-LEDGER-ECONOMY-BIG', `final maturity is RESOURCE-LEDGER-ECONOMY-BIG (${maxLevel})`);

console.log('\n═══════════════════════════════════════════════════════════════');
console.log(`  Round 18 Resource-Ledger Final Gate Passed: ${passed} | Failed: ${failed}`);
console.log(`  Maturity: ${maxLevel}`);
console.log('═══════════════════════════════════════════════════════════════');

if (failed > 0) {
  console.error('\n  ❌ GATE FAILED:');
  for (const failure of failures) console.error(`    • ${failure}`);
  process.exit(1);
}

console.log('\n  ✅ GATE PASSED — RESOURCE-LEDGER-ECONOMY-BIG achieved');
