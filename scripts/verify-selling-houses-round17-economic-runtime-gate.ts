/**
 * Round 17 — Economic Runtime Gate
 *
 * Proves resource economy is in the real daily tick chain: economy source
 * records enter the source ingestion adapter, produce causal events, grow
 * across long horizons, and replay deterministically.
 *
 * Usage: npx tsx scripts/verify-selling-houses-round17-economic-runtime-gate.ts
 */

import {
  ROUND17_SEED,
  advanceMarketEconomyWorld,
  countEconomySourceRecords,
  causalEventIds,
  eventHasSourceKind,
  sameStringList,
  uniqueSourceKinds,
  readSrc,
} from './verify-selling-houses-round17-market-economy-gate-core.js';
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
console.log('║  Round 17 — Economic Runtime Gate                               ║');
console.log('╚══════════════════════════════════════════════════════════════════╝');

section('1. REAL TICK CHAIN — 7/14/30/60 days');
const state7 = advanceMarketEconomyWorld(7, ROUND17_SEED);
const state14 = advanceMarketEconomyWorld(14, ROUND17_SEED);
const state30 = advanceMarketEconomyWorld(30, ROUND17_SEED);
const state60 = advanceMarketEconomyWorld(60, ROUND17_SEED);

const events7 = state7.worldCausalEvents?.length ?? 0;
const events14 = state14.worldCausalEvents?.length ?? 0;
const events30 = state30.worldCausalEvents?.length ?? 0;
const events60 = state60.worldCausalEvents?.length ?? 0;

check((state7.bigWorldRuntime?.tickCount ?? 0) >= 7, `tickCount >= 7 (${state7.bigWorldRuntime?.tickCount ?? 0})`);
check((state14.bigWorldRuntime?.tickCount ?? 0) >= 14, `tickCount >= 14 (${state14.bigWorldRuntime?.tickCount ?? 0})`);
check((state30.bigWorldRuntime?.tickCount ?? 0) >= 30, `tickCount >= 30 (${state30.bigWorldRuntime?.tickCount ?? 0})`);
check((state60.bigWorldRuntime?.tickCount ?? 0) >= 60, `tickCount >= 60 (${state60.bigWorldRuntime?.tickCount ?? 0})`);
check(!state60.gameOver, '60-day economic runtime is not a short-game plateau');
check(events14 > events7, `events grow 7→14 (${events7}→${events14})`);
check(events30 > events14, `events grow 14→30 (${events14}→${events30})`);
check(events60 > events30, `events grow 30→60 (${events30}→${events60})`);

section('2. ECONOMY SOURCE RECORDS — resource receipts enter causal ledger');
const economyEvents7 = countEconomySourceRecords(state7.worldCausalEvents ?? []);
const economyEvents14 = countEconomySourceRecords(state14.worldCausalEvents ?? []);
const economyEvents30 = countEconomySourceRecords(state30.worldCausalEvents ?? []);
check(economyEvents7 >= 20, `7-day economy causal events >= 20 (${economyEvents7})`);
check(economyEvents14 > economyEvents7, `economy events grow 7→14 (${economyEvents7}→${economyEvents14})`);
check(economyEvents30 > economyEvents14, `economy events grow 14→30 (${economyEvents14}→${economyEvents30})`);

const sourceKinds = uniqueSourceKinds(state30.worldCausalEvents ?? []);
const requiredKinds: SourceKind[] = [
  'broker_capacity_signal',
  'manager_message',
  'customer_interaction',
  'owner_life_event_signal',
  'rival_action',
  'buyer_financing_signal',
];
for (const sourceKind of requiredKinds) {
  check(sourceKinds.has(sourceKind), `source kind present: ${sourceKind}`);
}

section('3. RESOURCE DOMAINS — energy/budget/org/customer/owner/rival');
const events30List = state30.worldCausalEvents ?? [];
check(events30List.some((event) => eventHasSourceKind(event, 'broker_capacity_signal')), 'energy/capacity feedback exists');
check(events30List.some((event) => eventHasSourceKind(event, 'manager_message')), 'budget/org feedback exists');
check(events30List.some((event) => eventHasSourceKind(event, 'customer_interaction')), 'customer attention feedback exists');
check(events30List.some((event) => eventHasSourceKind(event, 'owner_life_event_signal')), 'owner trust/patience feedback exists');
check(events30List.some((event) => eventHasSourceKind(event, 'rival_action')), 'rival resource competition exists');
check(events30List.some((event) => eventHasSourceKind(event, 'buyer_financing_signal')), 'buyer financing feedback exists');

section('4. REPLAY — same seed, same causal IDs');
const replayA = advanceMarketEconomyWorld(30, ROUND17_SEED);
const replayB = advanceMarketEconomyWorld(30, ROUND17_SEED);
check(sameStringList(causalEventIds(replayA), causalEventIds(replayB)), 'same seed → byte-identical causal event IDs');

section('5. SELF-AUDIT — no soft pass patterns');
const gateSrc = readSrc('scripts/verify-selling-houses-round17-economic-runtime-gate.ts');
const auditStart = gateSrc.indexOf("section('5. SELF-AUDIT");
const gateSrcCore = auditStart > 0 ? gateSrc.slice(0, auditStart) : gateSrc;
const gateSrcNoComments = gateSrcCore
  .replace(/\/\/.*$/gm, '')
  .replace(/\/\*[\s\S]*?\*\//g, '');
check(!gateSrcNoComments.includes('|| true'), 'gate source has no || true');
check(!gateSrcNoComments.match(/check\(\s*true\s*,/), 'gate source has no check(true, ...)');

console.log('\n═══════════════════════════════════════════════════════════════');
console.log(`  Round 17 Runtime Gate Passed: ${passed} | Failed: ${failed}`);
console.log('═══════════════════════════════════════════════════════════════');

if (failed > 0) {
  console.error('\n  ❌ GATE FAILED:');
  for (const failure of failures) console.error(`    • ${failure}`);
  process.exit(1);
}

console.log('\n  ✅ GATE PASSED — market economy runs in live runtime');
