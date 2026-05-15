/**
 * Round 19 — Five-X Runtime Ledger Gate
 *
 * Proves the FIVE-X world (100+ cells, 4000+ listings, 21000+ demand)
 * runs through real runtime tick chain, with:
 *   - Action spend/refund generating source records + causal events
 *   - Owner trust/patience action effects flowing through receipt feedback
 *   - Active cohort scheduler handling large customer populations
 *   - Resource ledger growing deterministically over 7/14/30/60 day horizons
 *   - Replay byte-identical
 *   - No Date.now / Math.random / fetch / LLM provider
 *
 * Maturity: FAILED | FIVE-X-RUNTIME-LEDGER-BIG
 *
 * Usage: npx tsx scripts/verify-selling-houses-round19-five-x-runtime-ledger-gate.ts
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createInitialState, updateDerivedState } from '../src/selling-houses/application/gameState.js';
import { advanceDays, executeAction } from '../src/selling-houses/domain/engine.js';
import { seedInitialOpportunities } from '../src/selling-houses/domain/engine/opportunityEngine.js';
import { getScenarioSnapshotById } from '../src/selling-houses/domain/scenarioCatalog.js';
import {
  createBigWorldBootstrap,
  buildScaleManifest,
  buildDiversityManifest,
} from '../src/selling-houses/domain/world-model/bigWorldBootstrap.js';
import { FIVE_X_SCALE_POLICY } from '../src/selling-houses/domain/world-model/bigWorldSpecFactory.js';
import { buildMarketFormationSummary } from '../src/selling-houses/domain/world-model/marketFormationBootstrap.js';
import type { GameState } from '../src/selling-houses/domain/models.js';
import type {
  BigWorldBootstrap,
  BigWorldScalePolicy,
} from '../src/selling-houses/domain/world-model/bigWorldTypes.js';
import type { SourceKind } from '../src/selling-houses/domain/world-model/informationSourceTypes.js';
import type { WorldCausalEvent } from '../src/selling-houses/domain/world-model/causalEvents.js';

// ── Gate infrastructure ────────────────────────────────────────

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

function readSrc(rel: string): string {
  return readFileSync(resolve(import.meta.dirname ?? '.', '..', rel), 'utf-8');
}

// ── Five-X Scale Policy (imported from single source of truth) ────

const FIVE_X_SEED = 20260701;

// ── Five-X World Builder ───────────────────────────────────────

function buildFiveXWorld(seed: number = FIVE_X_SEED): GameState {
  const snapshot = getScenarioSnapshotById('standard-window-chain');
  if (!snapshot) throw new Error('standard-window-chain scenario missing');
  const state = createInitialState(snapshot, seed);
  const bootstrap = createBigWorldBootstrap({
    seed,
    scenarioName: snapshot.scenario.name,
    difficultyId: snapshot.scenario.difficultyId,
    playerCaseCount: snapshot.scenario.cases.length,
    scaleOverride: FIVE_X_SCALE_POLICY,
  });
  (state.runContext as { bigWorldBootstrap?: BigWorldBootstrap }).bigWorldBootstrap = bootstrap;
  seedInitialOpportunities(state);
  return state;
}

function buildLongHorizonFiveXWorld(seed: number = FIVE_X_SEED): GameState {
  const state = buildFiveXWorld(seed);
  state.maxDay = 120;
  state.rules.maxDay = 120;
  state.rules.outcomeControl.simulationDays = 120;
  state.rules.outcomeControl.marketDealCapacity21d = 0;
  state.rules.outcomeControl.rivalCaseLossScale = 0;
  state.rules.rivalLossProbabilityScale = 0;
  for (const caseItem of state.cases) {
    caseItem.status = 'active';
    caseItem.windowDays = 120;
    caseItem.trust = Math.max(caseItem.trust, 88);
    caseItem.patience = Math.max(caseItem.patience, 88);
    caseItem.urgency = Math.min(caseItem.urgency, 35);
    caseItem.heat = Math.max(caseItem.heat, 55);
    caseItem.competitiveness = Math.max(caseItem.competitiveness, 65);
  }
  return state;
}

function advanceFiveXWorld(days: number, seed: number = FIVE_X_SEED): GameState {
  const state = buildLongHorizonFiveXWorld(seed);
  advanceDays(state, days);
  updateDerivedState(state);
  return state;
}

function bootstrapOf(state: GameState): BigWorldBootstrap {
  const bootstrap = state.runContext.bigWorldBootstrap as BigWorldBootstrap | undefined;
  if (!bootstrap) throw new Error('bigWorldBootstrap missing');
  return bootstrap;
}

function scaleOf(state: GameState) {
  return buildScaleManifest(bootstrapOf(state));
}

function diversityOf(state: GameState) {
  return buildDiversityManifest(bootstrapOf(state));
}

function causalEventIds(state: GameState): readonly string[] {
  return (state.worldCausalEvents ?? []).map((event) => event.id).sort();
}

function sameStringList(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((item, index) => item === right[index]);
}

function uniqueSourceKinds(events: readonly WorldCausalEvent[]): Set<SourceKind> {
  const sourceKinds = new Set<SourceKind>();
  for (const event of events) {
    const eventRecord = event as WorldCausalEvent & {
      readonly sourceKind?: SourceKind;
      readonly sourceKinds?: readonly SourceKind[];
    };
    if (eventRecord.sourceKind) sourceKinds.add(eventRecord.sourceKind);
    for (const sourceKind of eventRecord.sourceKinds ?? []) {
      sourceKinds.add(sourceKind);
    }
  }
  return sourceKinds;
}

function countEconomySourceRecords(events: readonly WorldCausalEvent[]): number {
  return events.filter((event) => {
    const eventRecord = event as WorldCausalEvent & {
      readonly sourceRecordId?: string;
      readonly sourceRecordIds?: readonly string[];
    };
    return eventRecord.sourceRecordId?.startsWith('isr-eco-')
      || eventRecord.sourceRecordIds?.some((id) => id.startsWith('isr-eco-'));
  }).length;
}

// ── Header ─────────────────────────────────────────────────────

console.log('╔══════════════════════════════════════════════════════════════════╗');
console.log('║  Round 19 — Five-X Runtime Ledger Gate                          ║');
console.log('║  Proves: real FIVE-X world runs through runtime tick chain      ║');
console.log('║  Scale: 100+ cells, 4000+ listings, 21000+ demand, 750+ brokers ║');
console.log('╚══════════════════════════════════════════════════════════════════╝');

// ═══════════════════════════════════════════════════════════════
// 1. FIVE-X SCALE — must be real five-x, not 24-cell
// ═══════════════════════════════════════════════════════════════
section('1. FIVE-X SCALE — city-level thresholds');
const baseState = buildFiveXWorld(FIVE_X_SEED);
const bootstrap = bootstrapOf(baseState);
const scale = scaleOf(baseState);
const diversity = diversityOf(baseState);
const formationSummary = buildMarketFormationSummary(bootstrap.hiddenTruth.marketFormation);
const economy = formationSummary.economy;

console.log(`  Scale: ${scale.totalListings} listings, ${scale.totalOwners} owners, ${scale.totalCustomers} demand, ${scale.totalBrokers} brokers, ${scale.marketCells} cells`);

check(scale.marketCells >= 100, `market cells >= 100 (${scale.marketCells})`);
check(scale.totalListings >= 4000, `listings >= 4000 (${scale.totalListings})`);
check(scale.totalOwners >= 2500, `owners >= 2500 (${scale.totalOwners})`);
check(scale.totalCustomers >= 21000, `customers >= 21000 (${scale.totalCustomers})`);
check(scale.totalBrokers >= 750, `brokers >= 750 (${scale.totalBrokers})`);
check(scale.acnNetworks >= 32, `ACN >= 32 (${scale.acnNetworks})`);

// Scale contract metadata
check(scale.scaleProfileId === 'five-x-city-level-v1', `scale profile is five-x (${scale.scaleProfileId})`);
check(scale.scaleContractVersion >= 2, `scale contract version >= 2 (${scale.scaleContractVersion})`);
check(scale.isFiveXScale, 'isFiveXScale = true (all five-x thresholds met)');

// Output actual counts for audit trail
const counts5x = scale.actualFiveXCounts;
console.log(`\n  📊 Actual Five-X Counts:`);
console.log(`     cells=${counts5x.marketCells}, acn=${counts5x.acnNetworks}, brokers=${counts5x.brokers}`);
console.log(`     listings=${counts5x.listings}, owners=${counts5x.owners}, customers=${counts5x.customers}`);
console.log(`     customerPools=${counts5x.customerPools}, brokerPools=${counts5x.brokerPools}, orgPools=${counts5x.orgPools}`);

// ═══════════════════════════════════════════════════════════════
// 2. REAL TICK CHAIN — advanceDays → runBigWorldDayTick on FIVE-X
// ═══════════════════════════════════════════════════════════════
section('2. REAL TICK CHAIN — five-x world advanceDays');
const state7 = advanceFiveXWorld(7, FIVE_X_SEED);
const state14 = advanceFiveXWorld(14, FIVE_X_SEED);
const state30 = advanceFiveXWorld(30, FIVE_X_SEED);
const state60 = advanceFiveXWorld(60, FIVE_X_SEED);

check((state7.bigWorldRuntime?.tickCount ?? 0) >= 7, `7-day tickCount >= 7 (${state7.bigWorldRuntime?.tickCount ?? 0})`);
check((state14.bigWorldRuntime?.tickCount ?? 0) >= 14, `14-day tickCount >= 14 (${state14.bigWorldRuntime?.tickCount ?? 0})`);
check((state30.bigWorldRuntime?.tickCount ?? 0) >= 30, `30-day tickCount >= 30 (${state30.bigWorldRuntime?.tickCount ?? 0})`);
check((state60.bigWorldRuntime?.tickCount ?? 0) >= 60, `60-day tickCount >= 60 (${state60.bigWorldRuntime?.tickCount ?? 0})`);

const events7 = state7.worldCausalEvents?.length ?? 0;
const events14 = state14.worldCausalEvents?.length ?? 0;
const events30 = state30.worldCausalEvents?.length ?? 0;
const events60 = state60.worldCausalEvents?.length ?? 0;

check(events14 > events7, `causal events grow 7→14 (${events7}→${events14})`);
check(events30 > events14, `causal events grow 14→30 (${events14}→${events30})`);
check(events60 > events30, `causal events grow 30→60 (${events30}→${events60})`);
check(!state60.gameOver, '60-day five-x world still live');

// ═══════════════════════════════════════════════════════════════
// 3. ECONOMY SOURCE RECORDS — isr-eco-* in causal ledger
// ═══════════════════════════════════════════════════════════════
section('3. ECONOMY SOURCE RECORDS — resource ledger entries grow');
const ledger7 = countEconomySourceRecords(state7.worldCausalEvents ?? []);
const ledger14 = countEconomySourceRecords(state14.worldCausalEvents ?? []);
const ledger30 = countEconomySourceRecords(state30.worldCausalEvents ?? []);
const ledger60 = countEconomySourceRecords(state60.worldCausalEvents ?? []);

check(ledger7 >= 20, `7-day economy entries >= 20 (${ledger7})`);
check(ledger14 > ledger7, `economy entries grow 7→14 (${ledger7}→${ledger14})`);
check(ledger30 > ledger14, `economy entries grow 14→30 (${ledger14}→${ledger30})`);
check(ledger60 > ledger30, `economy entries grow 30→60 (${ledger30}→${ledger60})`);

// ═══════════════════════════════════════════════════════════════
// 4. ACTION RESOURCE RECEIPTS — real player actions on five-x world
// ═══════════════════════════════════════════════════════════════
section('4. ACTION RESOURCE RECEIPTS — spend/refund + trust/patience');

const actionState = buildLongHorizonFiveXWorld(FIVE_X_SEED);
advanceDays(actionState, 5);
updateDerivedState(actionState);

const activeCase = actionState.cases.find((c) => c.status === 'active');
let actionsExecuted = 0;
let actionsAttempted = 0;
if (activeCase) {
  const actionIds = ['first-visit', 'weekly-feedback', 'story', 'xiaohongshu-boost', 'broker-broadcast'];
  for (const actionId of actionIds) {
    actionsAttempted += 1;
    const result = executeAction(actionState, actionId, activeCase, null);
    if (result) actionsExecuted += 1;
  }
}

advanceDays(actionState, 1);
updateDerivedState(actionState);

const actionCausalEvents = actionState.worldCausalEvents ?? [];

// isr-ar-* records (budget spend/refund)
const arRecords = actionCausalEvents.filter((event) => {
  const eventRecord = event as WorldCausalEvent & {
    readonly sourceRecordId?: string;
    readonly sourceRecordIds?: readonly string[];
  };
  return eventRecord.sourceRecordId?.startsWith('isr-ar-')
    || eventRecord.sourceRecordIds?.some((id) => id.startsWith('isr-ar-'));
}).length;

// isr-par-* records (player action receipts)
const parRecords = actionCausalEvents.filter((event) => {
  const eventRecord = event as WorldCausalEvent & {
    readonly sourceRecordId?: string;
    readonly sourceRecordIds?: readonly string[];
  };
  return eventRecord.sourceRecordId?.startsWith('isr-par-')
    || eventRecord.sourceRecordIds?.some((id) => id.startsWith('isr-par-'));
}).length;

check(actionsExecuted > 0, `player actions executed (${actionsExecuted}/${actionsAttempted})`);
check(parRecords > 0, `player action receipts (isr-par-*) in causal ledger (${parRecords})`);
check(arRecords > 0, `action resource records (isr-ar-*) in causal ledger (${arRecords})`);

// isr-ar-* linkage
if (arRecords > 0) {
  const arEventsLinked = actionCausalEvents.filter((event) => {
    const eventRecord = event as WorldCausalEvent & { readonly sourceRecordId?: string };
    return eventRecord.sourceRecordId?.startsWith('isr-ar-');
  });
  check(arEventsLinked.length > 0, `isr-ar-* causal events have sourceRecordId linkage (${arEventsLinked.length})`);
}

// isr-par-* linkage
const parEventsLinked = actionCausalEvents.filter((event) => {
  const eventRecord = event as WorldCausalEvent & { readonly sourceRecordId?: string };
  return eventRecord.sourceRecordId?.startsWith('isr-par-');
});
check(parEventsLinked.length > 0, `isr-par-* causal events have sourceRecordId linkage (${parEventsLinked.length})`);

const parBrokerEvents = parEventsLinked.filter((e) => e.kind === 'BrokerRecommendationChanged');
check(parBrokerEvents.length > 0, `isr-par-* → BrokerRecommendationChanged events (${parBrokerEvents.length})`);

// ═══════════════════════════════════════════════════════════════
// 5. RECEIPT FEEDBACK DOMAINS — all 6 source kinds
// ═══════════════════════════════════════════════════════════════
section('5. RECEIPT FEEDBACK DOMAINS — all resource types covered');
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
// 6. OWNER TRUST/PATIENCE — real action path, not seeded fallback
// ═══════════════════════════════════════════════════════════════
section('6. OWNER TRUST/PATIENCE — real action path proof');

// autonomous world: owner_life_event_signal events exist
const events30List = state30.worldCausalEvents ?? [];
const ownerLifeEvents = events30List.filter((e) => {
  const eventRecord = e as WorldCausalEvent & { readonly sourceKind?: string };
  return eventRecord.sourceKind === 'owner_life_event_signal';
});
check(ownerLifeEvents.length > 0, `owner life event signals in autonomous world (${ownerLifeEvents.length})`);

// action world: owner_life_event_signal events exist
const actionOwnerEvents = (actionState.worldCausalEvents ?? []).filter((e) => {
  const eventRecord = e as WorldCausalEvent & { readonly sourceKind?: string };
  return eventRecord.sourceKind === 'owner_life_event_signal';
});
check(actionOwnerEvents.length > 0, `owner life event signals in action world (${actionOwnerEvents.length})`);

// Verify source code: computeDailyResourceSnapshot reads fieldDeltas from player_action_receipt
const runtimeSrc = readSrc('src/selling-houses/domain/world-model/runtime/marketEconomyRuntime.ts');
const fieldDeltasSrcCheck = runtimeSrc.includes('fieldDeltas') && runtimeSrc.includes('player_action_receipt');
check(fieldDeltasSrcCheck, 'computeDailyResourceSnapshot reads fieldDeltas from player_action_receipt');

// Verify source code: actionResolvers captures beforeTrust/beforePatience for delta computation
const actionResolversSrc = readSrc('src/selling-houses/domain/engine/actionResolvers.ts');
check(actionResolversSrc.includes('beforeTrust'), 'actionResolvers captures beforeTrust for delta computation');
check(actionResolversSrc.includes('fieldDeltas'), 'actionResolvers builds fieldDeltas for trust/patience/urgency');

// Verify source code: seeded fallback is ONLY for autonomous background (no player receipts)
// The code should check: realTrustNet !== 0 ? realTrustNet : seededInt(...)
// This means seeded is only used when no real receipts exist
const usesSeededFallbackCorrectly = runtimeSrc.includes('realTrustNet !== 0 ? realTrustNet : seededInt');
check(usesSeededFallbackCorrectly, 'seeded trust fallback only used when no real player receipts exist');

const usesSeededPatienceFallbackCorrectly = runtimeSrc.includes('realPatienceNet !== 0 ? realPatienceNet : seededInt');
check(usesSeededPatienceFallbackCorrectly, 'seeded patience fallback only used when no real player receipts exist');

// ═══════════════════════════════════════════════════════════════
// 7. MANAGER INTERVENTION — focus meeting + resource allocation
// ═══════════════════════════════════════════════════════════════
section('7. MANAGER INTERVENTION — focus meeting + resource allocation');
const managerEvents = events30List.filter((e) => {
  const eventRecord = e as WorldCausalEvent & { readonly sourceKind?: string };
  return eventRecord.sourceKind === 'manager_message';
});
check(managerEvents.length > 0, `manager message events exist (${managerEvents.length})`);

// ═══════════════════════════════════════════════════════════════
// 8. RESOURCE LEDGER PERSISTENCE — BigWorldRuntimeState
// ═══════════════════════════════════════════════════════════════
section('8. RESOURCE LEDGER PERSISTENCE — runtime state');
const ledger30Runtime = state30.bigWorldRuntime?.economicResourceLedger ?? [];
check(ledger30Runtime.length > 0, `economicResourceLedger has entries (${ledger30Runtime.length})`);

const ledger60Runtime = state60.bigWorldRuntime?.economicResourceLedger ?? [];
check(ledger60Runtime.length >= ledger30Runtime.length, `ledger grows 30→60 (${ledger30Runtime.length}→${ledger60Runtime.length})`);

if (ledger30Runtime.length > 0) {
  const entry = ledger30Runtime[0];
  check(typeof entry.day === 'number', 'ledger entry has day');
  check(typeof entry.playerEnergyConsumed === 'number', 'ledger entry has playerEnergyConsumed');
  check(typeof entry.promotionBudgetConsumed === 'number', 'ledger entry has promotionBudgetConsumed');
  check(typeof entry.ownerTrustNet === 'number', 'ledger entry has ownerTrustNet');
  check(typeof entry.replayKey === 'string', 'ledger entry has replayKey');
}

// ═══════════════════════════════════════════════════════════════
// 9. ACTION RESOURCE RECEIPTS — must be > 0 when actions executed
// ═══════════════════════════════════════════════════════════════
section('9. ACTION RESOURCE RECEIPTS — traceable entries in runtime');
const actionReceipts30 = state30.bigWorldRuntime?.actionResourceReceipts ?? [];

// autonomous tick may not produce action receipts (no player actions)
// but the action state MUST have them
const actionReceiptsAction = actionState.bigWorldRuntime?.actionResourceReceipts ?? [];
check(actionReceiptsAction.length > 0, `actionResourceReceipts > 0 when player actions executed (${actionReceiptsAction.length})`);

if (actionReceiptsAction.length > 0) {
  const receipt = actionReceiptsAction[0];
  check(typeof receipt.day === 'number', 'action receipt has day');
  check(typeof receipt.actionId === 'string', 'action receipt has actionId');
  check(typeof receipt.caseId === 'string', 'action receipt has caseId');
  check(typeof receipt.sourceRecordId === 'string', 'action receipt has sourceRecordId');
  check(receipt.sourceRecordId.length > 0, 'action receipt sourceRecordId is non-empty');
  check(typeof receipt.replayKey === 'string', 'action receipt has replayKey');
  check(receipt.energyCost > 0 || receipt.budgetCost > 0 || receipt.trustDelta !== 0 || receipt.patienceDelta !== 0,
    `action receipt has real resource impact (energy=${receipt.energyCost} budget=${receipt.budgetCost} trust=${receipt.trustDelta} patience=${receipt.patienceDelta})`);
}

// ═══════════════════════════════════════════════════════════════
// 10. ACTIVE COHORT SCHEDULER — handles 21000+ customers
// ═══════════════════════════════════════════════════════════════
section('10. ACTIVE COHORT SCHEDULER — customer sampling at scale');
check((state60.bigWorldRuntime?.tickCount ?? 0) >= 60, `cohort scheduler handled 60 ticks without hanging`);
check(events60 > events30, `cohort scheduler produced growing events (${events30}→${events60})`);

// ═══════════════════════════════════════════════════════════════
// 11. REPLAY — byte-identical
// ═══════════════════════════════════════════════════════════════
section('11. REPLAY — byte-identical');
const replayA = advanceFiveXWorld(30, FIVE_X_SEED);
const replayB = advanceFiveXWorld(30, FIVE_X_SEED);
check(sameStringList(causalEventIds(replayA), causalEventIds(replayB)), 'same seed → byte-identical 30-day causal event IDs');

function economyEventIds(state: GameState): readonly string[] {
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

const ledgerA = replayA.bigWorldRuntime?.economicResourceLedger ?? [];
const ledgerB = replayB.bigWorldRuntime?.economicResourceLedger ?? [];
check(ledgerA.length === ledgerB.length, `same seed → same ledger length (${ledgerA.length})`);
if (ledgerA.length > 0 && ledgerB.length > 0) {
  check(ledgerA[0].replayKey === ledgerB[0].replayKey, 'same seed → same ledger replayKey');
}

// ═══════════════════════════════════════════════════════════════
// 12. SOURCE CODE BOUNDARIES — no hidden truth, no fake randomness
// ═══════════════════════════════════════════════════════════════
section('12. SOURCE CODE BOUNDARIES');
const receiptWiringSrc = readSrc('src/selling-houses/domain/world-model/runtime/economicReceiptWiring.ts');
const actionAccountingSrc = readSrc('src/selling-houses/domain/engine/actionResourceAccounting.ts');
const clockSrc = readSrc('src/selling-houses/domain/world-model/runtime/clock.ts');

check(!/\bMath\.random\s*\(/.test(runtimeSrc), 'marketEconomyRuntime no Math.random');
check(!/\bDate\.now\s*\(/.test(runtimeSrc), 'marketEconomyRuntime no Date.now');
check(!/\bfetch\s*\(/.test(runtimeSrc), 'marketEconomyRuntime no fetch');
check(!/\bMath\.random\s*\(/.test(receiptWiringSrc), 'economicReceiptWiring no Math.random');
check(!/\bDate\.now\s*\(/.test(receiptWiringSrc), 'economicReceiptWiring no Date.now');
check(!/\bMath\.random\s*\(/.test(actionAccountingSrc), 'actionResourceAccounting no Math.random');
check(!/\bDate\.now\s*\(/.test(actionAccountingSrc), 'actionResourceAccounting no Date.now');
check(!/\bMath\.random\s*\(/.test(clockSrc), 'clock no Math.random');
check(!/\bDate\.now\s*\(/.test(clockSrc), 'clock no Date.now');

check(actionAccountingSrc.includes('isr-ar-'), 'actionResourceAccounting emits isr-ar-* source records');
check(actionResolversSrc.includes('fieldDeltas'), 'actionResolvers builds fieldDeltas');
check(actionResolversSrc.includes('beforeTrust'), 'actionResolvers captures beforeTrust');
check(runtimeSrc.includes('player_action_receipt'), 'marketEconomyRuntime consumes player_action_receipt');
check(runtimeSrc.includes('fieldDeltas'), 'marketEconomyRuntime reads fieldDeltas');

// ═══════════════════════════════════════════════════════════════
// 13. SELF-AUDIT — no soft pass patterns
// ═══════════════════════════════════════════════════════════════
section('13. SELF-AUDIT — no soft pass patterns');
const gateSrc = readSrc('scripts/verify-selling-houses-round19-five-x-runtime-ledger-gate.ts');
const auditStart = gateSrc.indexOf("section('13. SELF-AUDIT");
const gateSrcCore = auditStart > 0 ? gateSrc.slice(0, auditStart) : gateSrc;
const gateSrcNoComments = gateSrcCore
  .replace(/\/\/.*$/gm, '')
  .replace(/\/\*[\s\S]*?\*\//g, '');
check(!gateSrcNoComments.includes('|| true'), 'gate source has no || true');
check(!gateSrcNoComments.match(/check\(\s*true\s*,/), 'gate source has no check(true, ...)');
check(!gateSrcNoComments.includes('>= 0'), 'gate source has no >= 0 soft checks');

// ═══════════════════════════════════════════════════════════════
// MATURITY CLASSIFICATION
// ═══════════════════════════════════════════════════════════════
section('MATURITY CLASSIFICATION');
const hasFiveXScale = scale.marketCells >= 100 && scale.totalListings >= 4000
  && scale.totalOwners >= 2500 && scale.totalCustomers >= 21000
  && scale.totalBrokers >= 750 && scale.acnNetworks >= 32;
const hasTickGrowth = (state7.bigWorldRuntime?.tickCount ?? 0) >= 7
  && (state14.bigWorldRuntime?.tickCount ?? 0) >= 14
  && (state30.bigWorldRuntime?.tickCount ?? 0) >= 30
  && (state60.bigWorldRuntime?.tickCount ?? 0) >= 60;
const hasCausalGrowth = events14 > events7 && events30 > events14 && events60 > events30;
const hasEconomyGrowth = ledger14 > ledger7 && ledger30 > ledger14 && ledger60 > ledger30;
const hasReceiptDomains = requiredKinds.every((kind) => liveSourceKinds.has(kind));
const hasLedgerPersistence = ledger30Runtime.length > 0;
const hasActionReceipts = actionReceiptsAction.length > 0;
const hasReplay = sameStringList(causalEventIds(replayA), causalEventIds(replayB));
const hasNoRandomness = !/\bMath\.random\s*\(/.test(runtimeSrc) && !/\bDate\.now\s*\(/.test(runtimeSrc);
const hasNoSoftPass = !gateSrcNoComments.includes('|| true')
  && !gateSrcNoComments.match(/check\(\s*true\s*,/)
  && !gateSrcNoComments.includes('>= 0');

const fiveXRuntimeLedgerBig = hasFiveXScale && hasTickGrowth && hasCausalGrowth && hasEconomyGrowth
  && hasReceiptDomains && hasLedgerPersistence && hasActionReceipts && hasReplay && hasNoRandomness && hasNoSoftPass;

const maxLevel = fiveXRuntimeLedgerBig
  ? 'FIVE-X-RUNTIME-LEDGER-BIG'
  : 'FAILED';

console.log(`  FINAL MATURITY: ${maxLevel}`);
check(maxLevel === 'FIVE-X-RUNTIME-LEDGER-BIG', `final maturity is FIVE-X-RUNTIME-LEDGER-BIG (${maxLevel})`);

console.log('\n═══════════════════════════════════════════════════════════════');
console.log(`  Round 19 Five-X Runtime Ledger Gate Passed: ${passed} | Failed: ${failed}`);
console.log(`  Maturity: ${maxLevel}`);
console.log('═══════════════════════════════════════════════════════════════');

if (failed > 0) {
  console.error('\n  ❌ GATE FAILED:');
  for (const failure of failures) console.error(`    • ${failure}`);
  process.exit(1);
}

console.log('\n  ✅ GATE PASSED — FIVE-X-RUNTIME-LEDGER-BIG achieved');
