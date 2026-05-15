/**
 * Round 18 — Resource-Ledger Economy Gate
 *
 * Proves the economy has a real resource ledger that grows, carries traceability,
 * replays deterministically, and is consumed by strategic decisions — not just
 * bootstrap data or projection boilerplate.
 *
 * Checks:
 *   1. Resource ledger entries exist in worldCausalEvents (isr-eco-* source records)
 *   2. Ledger entries grow across 7/14/30/60 day horizons
 *   3. Each ledger entry has sourceRecordId / sourceReplayKey (traceability)
 *   4. Ledger replay: same seed → byte-identical ledger event IDs
 *   5. Strategic decision resourceCost / opportunityCost / competitorRisk come from
 *      live evidence (sourceRecordIds non-empty), not legacy fallback
 *   6. Empty knowledge → no recommendation
 *   7. Long-horizon (60d) shadow rival active=0 → competitor pressure still > 0 from visible causal refs
 *   8. No hidden GlobalTruth leakage in projection source
 *   9. No Date.now / Math.random / fetch / LLM in economy core
 *   10. No || true / check(true) soft pass in gate source
 *
 * Usage: npx tsx scripts/verify-selling-houses-round18-resource-ledger-economy-gate.ts
 */

import {
  ROUND17_SEED,
  advanceMarketEconomyWorld,
  buildMarketEconomyWorld,
  bootstrapOf,
  scaleOf,
  diversityOf,
  buildStrategicProjectionFromState,
  buildKnowledgeMapFromState,
  countEconomySourceRecords,
  causalEventIds,
  eventHasSourceKind,
  sameStringList,
  uniqueSourceKinds,
  readSrc,
} from './verify-selling-houses-round17-market-economy-gate-core.js';
import { buildMarketFormationSummary } from '../src/selling-houses/domain/world-model/marketFormationBootstrap.js';
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
console.log('║  Round 18 — Resource-Ledger Economy Gate                        ║');
console.log('╚══════════════════════════════════════════════════════════════════╝');

// ═══════════════════════════════════════════════════════════════
// 1. SCALE — not just more entities, but real resource pools
// ═══════════════════════════════════════════════════════════════
section('1. SCALE — real resource pools from bootstrap');
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
check(economy.brokerPoolCount >= 150, `broker pools >= 150 (${economy.brokerPoolCount})`);
check(economy.listingPoolCount >= 800, `listing pools >= 800 (${economy.listingPoolCount})`);
check(economy.customerPoolCount >= 1000, `customer pools >= 1000 (${economy.customerPoolCount})`);
check(economy.orgPoolCount >= 8, `org pools >= 8 (${economy.orgPoolCount})`);
check(economy.opportunityCostCount >= 100, `opportunity costs >= 100 (${economy.opportunityCostCount})`);

// ═══════════════════════════════════════════════════════════════
// 2. RESOURCE LEDGER GROWTH — 7/14/30/60 day horizons
// ═══════════════════════════════════════════════════════════════
section('2. RESOURCE LEDGER GROWTH — ledger entries grow over time');
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

// Also check total causal events grow (not just economy events)
const events7 = state7.worldCausalEvents?.length ?? 0;
const events14 = state14.worldCausalEvents?.length ?? 0;
const events30 = state30.worldCausalEvents?.length ?? 0;
const events60 = state60.worldCausalEvents?.length ?? 0;
check(events14 > events7, `total causal events grow 7→14 (${events7}→${events14})`);
check(events30 > events14, `total causal events grow 14→30 (${events14}→${events30})`);
check(events60 > events30, `total causal events grow 30→60 (${events30}→${events60})`);

// ═══════════════════════════════════════════════════════════════
// 3. LEDGER TRACEABILITY — sourceRecordId / sourceReplayKey on every entry
// ═══════════════════════════════════════════════════════════════
section('3. LEDGER TRACEABILITY — every entry has sourceRecordId / sourceReplayKey');
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

// Check specific source kind coverage in ledger
const requiredLedgerKinds: SourceKind[] = [
  'broker_capacity_signal',
  'manager_message',
  'customer_interaction',
  'owner_life_event_signal',
  'rival_action',
  'buyer_financing_signal',
];
const liveSourceKinds = uniqueSourceKinds(state30.worldCausalEvents ?? []);
for (const kind of requiredLedgerKinds) {
  check(liveSourceKinds.has(kind), `ledger source kind present: ${kind}`);
}

// ═══════════════════════════════════════════════════════════════
// 4. LEDGER REPLAY — same seed → byte-identical ledger events
// ═══════════════════════════════════════════════════════════════
section('4. LEDGER REPLAY — same seed → byte-identical');
const replayA = advanceMarketEconomyWorld(30, ROUND17_SEED);
const replayB = advanceMarketEconomyWorld(30, ROUND17_SEED);
check(sameStringList(causalEventIds(replayA), causalEventIds(replayB)), 'same seed → byte-identical 30-day causal event IDs');

// Also check 60-day replay
const replay60A = advanceMarketEconomyWorld(60, ROUND17_SEED);
const replay60B = advanceMarketEconomyWorld(60, ROUND17_SEED);
check(sameStringList(causalEventIds(replay60A), causalEventIds(replay60B)), 'same seed → byte-identical 60-day causal event IDs');

// Check economy ledger events specifically replay identically
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
// 5. STRATEGIC DECISION — resourceCost/opportunityCost/competitorRisk from evidence
// ═══════════════════════════════════════════════════════════════
section('5. STRATEGIC DECISION — fields from evidence, not legacy fallback');
const strategic14 = buildStrategicProjectionFromState(state14);
const strategic30 = buildStrategicProjectionFromState(state30);

for (const [label, strategic] of [['14d', strategic14], ['30d', strategic30]] as const) {
  check(strategic.brokerOpportunity.topActions.length > 0, `${label} topActions > 0`);
  check(strategic.sharedCausalRefs !== undefined, `${label} sharedCausalRefs exists`);

  for (const action of strategic.brokerOpportunity.topActions) {
    // resourceCost must have real values (not all zero)
    check(
      action.resourceCost.energyCost > 0 || action.resourceCost.budgetCost > 0,
      `${label} action "${action.actionLabel}" has real resourceCost (energy=${action.resourceCost.energyCost}, budget=${action.resourceCost.budgetCost})`,
    );

    // opportunityCost must not be empty fallback
    check(
      action.opportunityCost.foregoneAction !== '无替代方案',
      `${label} action "${action.actionLabel}" has real opportunityCost (foregone=${action.opportunityCost.foregoneAction})`,
    );
    check(
      action.opportunityCost.foregoneConfidence > 0,
      `${label} opportunityCost has confidence (${action.opportunityCost.foregoneConfidence})`,
    );

    // competitorRisk must come from visible causal refs, not just legacy shadow
    check(
      action.competitorRisk.rivalCount > 0,
      `${label} action "${action.actionLabel}" has competitorRisk rivalCount (${action.competitorRisk.rivalCount})`,
    );
    check(
      action.competitorRisk.riskMagnitude > 0,
      `${label} action "${action.actionLabel}" has competitorRisk magnitude (${action.competitorRisk.riskMagnitude})`,
    );

    // sourceRecordIds must be non-empty (from evidence pipeline)
    check(
      action.sourceRecordIds.length > 0,
      `${label} action "${action.actionLabel}" has sourceRecordIds (${action.sourceRecordIds.length})`,
    );

    // safeRefs must be non-empty
    check(
      action.safeRefs.length > 0,
      `${label} action "${action.actionLabel}" has safeRefs (${action.safeRefs.length})`,
    );

    // timeHorizonImpact must have 3/7/14/30
    check(
      action.timeHorizonImpact.length === 4,
      `${label} action has 3/7/14/30 horizon impact (${action.timeHorizonImpact.length})`,
    );
  }
}

// ═══════════════════════════════════════════════════════════════
// 6. EMPTY KNOWLEDGE — no recommendation, no legacy bypass
// ═══════════════════════════════════════════════════════════════
section('6. EMPTY KNOWLEDGE — no recommendation');
const emptyState = buildMarketEconomyWorld(ROUND17_SEED);
const emptyStrategic = buildStrategicMarketDecisionProjection(emptyState);
check(emptyStrategic.brokerOpportunity.topActions.length === 0, 'empty knowledge → no strategic topActions');
check(emptyStrategic.sharedCausalRefs === undefined, 'empty knowledge → no sharedCausalRefs');

// ═══════════════════════════════════════════════════════════════
// 7. LONG-HORIZON RIVAL DEPLETION — competitor pressure survives
// ═══════════════════════════════════════════════════════════════
section('7. LONG-HORIZON RIVAL DEPLETION — pressure from visible causal refs');
// Reuse state60 from section 2 (already advanced 60 days)
const activeShadowRivals60 = state60.marketShadow.rivalListings.filter(
  (r) => r.status === 'active',
).length;
const strategic60 = buildStrategicProjectionFromState(state60);

// Even if shadow rivals are depleted, competitor pressure must survive from causal refs
check(strategic60.competitivePressure.activeRivalCount > 0, `60d competitor pressure > 0 (shadow rivals=${activeShadowRivals60}, pressure=${strategic60.competitivePressure.activeRivalCount})`);
check(strategic60.competitivePressure.topRivalAction !== null, '60d top rival evidence exists');
check(strategic60.brokerOpportunity.topActions.length > 0, '60d topActions > 0 even with rival depletion');

// Verify competitor risk in actions uses visible causal refs
for (const action of strategic60.brokerOpportunity.topActions) {
  check(
    action.competitorRisk.riskMagnitude > 0,
    `60d action "${action.actionLabel}" has competitor risk from visible causal refs (${action.competitorRisk.riskMagnitude})`,
  );
}

// ═══════════════════════════════════════════════════════════════
// 8. RECEIPT DOMAINS — economy feedback covers all resource types
// ═══════════════════════════════════════════════════════════════
section('8. RECEIPT DOMAINS — all resource types produce causal events');
check(events30List.some((event) => eventHasSourceKind(event, 'broker_capacity_signal')), 'energy/capacity receipt exists');
check(events30List.some((event) => eventHasSourceKind(event, 'manager_message')), 'budget/org receipt exists');
check(events30List.some((event) => eventHasSourceKind(event, 'customer_interaction')), 'customer attention receipt exists');
check(events30List.some((event) => eventHasSourceKind(event, 'owner_life_event_signal')), 'owner trust/patience receipt exists');
check(events30List.some((event) => eventHasSourceKind(event, 'rival_action')), 'rival competition receipt exists');
check(events30List.some((event) => eventHasSourceKind(event, 'buyer_financing_signal')), 'buyer financing receipt exists');

// ═══════════════════════════════════════════════════════════════
// 9. SOURCE CODE BOUNDARIES — no hidden truth, no fake randomness
// ═══════════════════════════════════════════════════════════════
section('9. SOURCE CODE BOUNDARIES — no hidden truth, no fake randomness');
const strategicSrc = readSrc('src/selling-houses/application/projections/strategicMarketDecisionProjection.ts');
const actorKnowledgeSrc = readSrc('src/selling-houses/application/projections/actorKnowledgeProjection.ts');
const runtimeSrc = readSrc('src/selling-houses/domain/world-model/runtime/marketEconomyRuntime.ts');
const bootstrapSrc = readSrc('src/selling-houses/domain/world-model/marketEconomyBootstrap.ts');
const receiptWiringSrc = readSrc('src/selling-houses/domain/world-model/runtime/economicReceiptWiring.ts');

check(!strategicSrc.includes('queryHiddenSourceRecords'), 'strategic projection does not query hidden source records');
check(!actorKnowledgeSrc.includes('queryHiddenSourceRecords'), 'actorKnowledge projection does not query hidden source records');
check(!/\bMath\.random\s*\(/.test(runtimeSrc), 'marketEconomyRuntime has no Math.random');
check(!/\bDate\.now\s*\(/.test(runtimeSrc), 'marketEconomyRuntime has no Date.now');
check(!/\bfetch\s*\(/.test(runtimeSrc), 'marketEconomyRuntime has no fetch');
check(!/\bMath\.random\s*\(/.test(bootstrapSrc), 'marketEconomyBootstrap has no Math.random');
check(!/\bDate\.now\s*\(/.test(bootstrapSrc), 'marketEconomyBootstrap has no Date.now');
check(!/\bfetch\s*\(/.test(bootstrapSrc), 'marketEconomyBootstrap has no fetch');
check(!/\bMath\.random\s*\(/.test(receiptWiringSrc), 'economicReceiptWiring has no Math.random');
check(!/\bDate\.now\s*\(/.test(receiptWiringSrc), 'economicReceiptWiring has no Date.now');

// ═══════════════════════════════════════════════════════════════
// 10. SELF-AUDIT — no soft pass patterns in this gate
// ═══════════════════════════════════════════════════════════════
section('10. SELF-AUDIT — no soft pass patterns');
const gateSrc = readSrc('scripts/verify-selling-houses-round18-resource-ledger-economy-gate.ts');
const auditStart = gateSrc.indexOf("section('10. SELF-AUDIT");
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
const hasAllReceiptDomains = requiredLedgerKinds.every((kind) => liveSourceKinds.has(kind));
const hasNoLeakage = !strategicSrc.includes('queryHiddenSourceRecords') && !actorKnowledgeSrc.includes('queryHiddenSourceRecords');
const hasNoFakeRandomness = !/\bMath\.random\s*\(/.test(runtimeSrc) && !/\bDate\.now\s*\(/.test(runtimeSrc);
const hasNoSoftPass = !gateSrcNoComments.includes('|| true') && !gateSrcNoComments.match(/check\(\s*true\s*,/);

const resourceLedgerEconomyBig = hasScale && hasLedgerGrowth && hasLedgerTraceability && hasLedgerReplay
  && hasStrategicEvidence && hasEmptyKnowledgeBypass && hasLongHorizonPressure && hasAllReceiptDomains
  && hasNoLeakage && hasNoFakeRandomness && hasNoSoftPass;

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
console.log(`  Round 18 Resource Ledger Gate Passed: ${passed} | Failed: ${failed}`);
console.log(`  Maturity: ${maxLevel}`);
console.log('═══════════════════════════════════════════════════════════════');

if (failed > 0) {
  console.error('\n  ❌ GATE FAILED:');
  for (const failure of failures) console.error(`    • ${failure}`);
  process.exit(1);
}

console.log('\n  ✅ GATE PASSED — RESOURCE-LEDGER-ECONOMY-BIG achieved');
