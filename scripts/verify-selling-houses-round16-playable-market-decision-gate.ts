/**
 * Round 16 — Playable Market Decision Hard Gate
 *
 * Proves market is playable, not just displayable.
 *
 * Beyond R15 (projection non-null), R16 requires:
 *   - topActions > 0 (broker has real actions to take)
 *   - ownerPool.totalActive > 0 (owners are in the game)
 *   - competitivePressure.activeRivalCount > 0 (rivals exist)
 *   - customerPool.activeCount > 0 (customers are active)
 *   - Each recommendation has belief, pressure, command, safeRefs, replayKey, confidence
 *   - Empty knowledge → no recommendation (no legacy bypass)
 *   - No hidden GlobalTruth leakage
 *
 * Anti-false-positive rules:
 *   - Projection null ≠ pass
 *   - topActions = 0 ≠ pass (market not playable)
 *   - Recommendation without safeRefs → FAIL
 *   - Empty knowledge producing recommendation → FAIL
 *   - Static string checks alone ≠ pass
 *
 * Usage: npx tsx scripts/verify-selling-houses-round16-playable-market-decision-gate.ts
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createInitialState, updateDerivedState } from '../src/selling-houses/application/gameState.js';
import { advanceDays } from '../src/selling-houses/domain/engine.js';
import { seedInitialOpportunities } from '../src/selling-houses/domain/engine/opportunityEngine.js';
import { getScenarioSnapshotById } from '../src/selling-houses/domain/scenarioCatalog.js';
import {
  createBigWorldBootstrap,
} from '../src/selling-houses/domain/world-model/bigWorldBootstrap.js';
import {
  buildActorKnowledgeSnapshot,
  buildDecisionEvidenceEnvelope,
  evaluatePressureSignals,
  filterAvailableCommands,
  rankCommands,
  buildExplanationEnvelope,
  computeSourceCredibility,
} from '../src/selling-houses/application/projections/actorKnowledgeProjection.js';
import {
  buildWorkspaceBigWorldModule,
} from '../src/selling-houses/application/projections/bigWorldPOVProjection.js';
import {
  buildPlayableMarketProjection,
} from '../src/selling-houses/application/projections/playableMarketProjection.js';
import {
  createEmptyRegistry,
  appendSourceRecord,
} from '../src/selling-houses/domain/world-model/informationSourceRegistry.js';
import type { GameState } from '../src/selling-houses/domain/models.js';
import type {
  BigWorldScalePolicy,
} from '../src/selling-houses/domain/world-model/bigWorldTypes.js';
import type { WorldCausalEvent } from '../src/selling-houses/domain/world-model/causalEvents.js';
import type { SourceKind, ActorRole } from '../src/selling-houses/domain/world-model/informationSourceTypes.js';

// ── Infrastructure ──────────────────────────────────────────────

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(condition: boolean, msg: string) {
  if (condition) { passed++; console.log(`  ✅ ${msg}`); }
  else { failed++; failures.push(msg); console.error(`  ❌ ${msg}`); }
}

function section(title: string) {
  console.log(`\n━━━ ${title} ━━━`);
}

function readSrc(rel: string): string {
  return readFileSync(resolve(import.meta.dirname ?? '.', '..', rel), 'utf-8');
}

function sourceKindsForEvent(event: WorldCausalEvent): readonly SourceKind[] {
  const eventAny = event as WorldCausalEvent & { readonly sourceKinds?: readonly SourceKind[] };
  const kinds = new Set<SourceKind>();
  if (eventAny.sourceKind) kinds.add(eventAny.sourceKind);
  for (const kind of eventAny.sourceKinds ?? []) kinds.add(kind);
  return [...kinds];
}

// ── Scale policy ────────────────────────────────────────────────

const MARKET_FORMATION_SCALE: BigWorldScalePolicy = {
  minMarketCells: 24,
  maxMarketCells: 24,
  acnCount: 8,
  namedBrokersPerAcn: 5,
  shadowBrokersPerAcn: 15,
  shadowListingsPerCell: 25,
  directRivalListingsPerCell: 8,
  materializedCustomersPerCell: 50,
  shadowAggregateClustersPerCell: 20,
  ownerProfilePriorCount: 500,
  customerCaseRatio: 12,
};

const SEED = 20260620;

// ── Build world ─────────────────────────────────────────────────

function buildMarketFormationWorld(seed: number): GameState {
  const snapshot = getScenarioSnapshotById('standard-window-chain')!;
  const state = createInitialState(snapshot, seed);
  const bootstrap = createBigWorldBootstrap({
    seed,
    scenarioName: snapshot.scenario.name,
    difficultyId: snapshot.scenario.difficultyId,
    playerCaseCount: snapshot.scenario.cases.length,
    scaleOverride: MARKET_FORMATION_SCALE,
  });
  (state.runContext as any).bigWorldBootstrap = bootstrap;
  seedInitialOpportunities(state);
  return state;
}

// ══════════════════════════════════════════════════════════════════════════
// Gate
// ══════════════════════════════════════════════════════════════════════════

console.log('╔══════════════════════════════════════════════════════════════════╗');
console.log('║  Round 16 — Playable Market Decision Hard Gate                  ║');
console.log('║  Proves market is playable with real actions and evidence       ║');
console.log('╚══════════════════════════════════════════════════════════════════╝');

// ═══════════════════════════════════════════════════════════════
// SECTION 1: SCALE + RUNTIME — build and advance
// ═══════════════════════════════════════════════════════════════
section('1. SCALE + RUNTIME — build and advance');

const state1 = buildMarketFormationWorld(SEED);
advanceDays(state1, 7);
updateDerivedState(state1);

check(state1.bigWorldRuntime !== undefined, 'bigWorldRuntime exists after 7 days');
check((state1.bigWorldRuntime?.tickCount ?? 0) >= 5, `tickCount >= 5 (got ${state1.bigWorldRuntime?.tickCount})`);
check((state1.worldCausalEvents?.length ?? 0) > 100, `worldCausalEvents > 100 (${state1.worldCausalEvents?.length})`);

const liveEvents = state1.worldCausalEvents ?? [];

// ═══════════════════════════════════════════════════════════════
// SECTION 2: ACTOR KNOWLEDGE — build from live state
// ═══════════════════════════════════════════════════════════════
section('2. ACTOR KNOWLEDGE — build from live state');

const liveRegistry = (() => {
  let reg = createEmptyRegistry();
  for (const evt of liveEvents) {
    const evtAny = evt as any;
    if (typeof evtAny.sourceKind !== 'string' || evtAny.sourceKind.length === 0) continue;
    const payload = evtAny.payload ?? {};
    const safePayload = typeof payload === 'object' && payload !== null
      ? { summary: typeof payload.summary === 'string' ? payload.summary : `live ${evt.kind}`, ...payload }
      : { summary: `live ${evt.kind}` };
    const result = appendSourceRecord(reg, {
      sourceId: evtAny.sourceRecordId ?? `isr-live-${evt.id}`,
      sourceKind: evtAny.sourceKind,
      payload: safePayload,
      day: evt.day,
      phase: 'morning',
      entityRefs: (evt.entityIds ?? []).map((id: string) => ({ id, kind: 'market_cell' as const })),
      actorRefs: (evt.actorIds ?? []).map((id: string) => ({ id, role: 'system' as const })),
      visibility: { scope: 'all_actors', baseDelayDays: 0 },
      confidence: evt.confidence ?? 0.7,
      delayDays: 0,
      replayKey: evtAny.sourceReplayKey ?? `rk-live-${evt.id}`,
      origin: 'ecosystem_tick',
    } as any);
    if (result.ok) reg = result.registry;
  }
  return reg;
})();

check(liveRegistry.index.count > 0, `live registry has records (${liveRegistry.index.count})`);

const knowledge = buildActorKnowledgeSnapshot('player-1', 'player_broker', state1.day, liveRegistry);
check(knowledge.beliefs.length > 0, `knowledge has beliefs (${knowledge.beliefs.length})`);

// Build actorKnowledgeMap for playableMarketProjection
const actorKnowledgeMap = new Map<string, import('../src/selling-houses/domain/world-model/actorKnowledgeTypes.js').ActorKnowledgeSnapshot>();
for (const caseItem of state1.cases.slice(0, 10)) {
  actorKnowledgeMap.set(caseItem.id, knowledge);
}

// ═══════════════════════════════════════════════════════════════
// SECTION 3: PLAYABLE MARKET — 5 dimensions non-zero
// ═══════════════════════════════════════════════════════════════
section('3. PLAYABLE MARKET — 5 dimensions non-zero');

const playable = buildPlayableMarketProjection(state1, actorKnowledgeMap);

// Market Radar
check(playable.marketRadar.hotCells.length > 0, `marketRadar.hotCells > 0 (${playable.marketRadar.hotCells.length})`);
check(playable.marketRadar.coldCells.length >= 0, `marketRadar.coldCells exists (${playable.marketRadar.coldCells.length})`);

// Competitive Pressure
check(playable.competitivePressure.activeRivalCount > 0, `competitivePressure.activeRivalCount > 0 (${playable.competitivePressure.activeRivalCount})`);
check(playable.competitivePressure.pressureLevel !== undefined, `competitivePressure.pressureLevel defined (${playable.competitivePressure.pressureLevel})`);

// Customer Pool
check(playable.customerPool.activeCount > 0, `customerPool.activeCount > 0 (${playable.customerPool.activeCount})`);

// Owner Pool
check(playable.ownerPool.totalActive > 0, `ownerPool.totalActive > 0 (${playable.ownerPool.totalActive})`);

// Broker Opportunity
check(playable.brokerOpportunity.topActions.length > 0, `brokerOpportunity.topActions > 0 (${playable.brokerOpportunity.topActions.length})`);

// ═══════════════════════════════════════════════════════════════
// SECTION 4: RECOMMENDATION EVIDENCE — belief/pressure/command/safeRefs/replayKey/confidence
// ═══════════════════════════════════════════════════════════════
section('4. RECOMMENDATION EVIDENCE — full evidence chain');

for (const action of playable.brokerOpportunity.topActions) {
  check(action.safeRefs.length >= 1, `action "${action.actionLabel}" has safeRefs (${action.safeRefs.length})`);
  check(action.replayKey.length > 0, `action "${action.actionLabel}" has replayKey`);
  check(action.sourceRecordIds.length >= 1, `action "${action.actionLabel}" has sourceRecordIds (${action.sourceRecordIds.length})`);
  check(action.confidence > 0, `action "${action.actionLabel}" has confidence (${action.confidence.toFixed(3)})`);
  check(action.reasoning.length > 0, `action "${action.actionLabel}" has reasoning (${action.reasoning.length} chars)`);
}

// SharedCausalRefs
check(playable.sharedCausalRefs !== undefined, 'playableMarket has sharedCausalRefs');
if (playable.sharedCausalRefs) {
  check(playable.sharedCausalRefs.allRefs.length >= 1, `sharedCausalRefs has refs (${playable.sharedCausalRefs.allRefs.length})`);
  check(playable.sharedCausalRefs.replayKey.length > 0, 'sharedCausalRefs has replayKey');
}

// ═══════════════════════════════════════════════════════════════
// SECTION 5: DECISION PIPELINE — belief → pressure → command → explanation
// ═══════════════════════════════════════════════════════════════
section('5. DECISION PIPELINE — belief → pressure → command → explanation');

const pressureSignals = evaluatePressureSignals(knowledge);
check(pressureSignals.length > 0, `pressure signals generated (${pressureSignals.length})`);

const availableCommands = filterAvailableCommands('player_broker', pressureSignals);
check(availableCommands.length > 0, `available commands generated (${availableCommands.length})`);

const rankedCommands = rankCommands(availableCommands, pressureSignals);
check(rankedCommands.length >= 1, `at least 1 recommended command (${rankedCommands.length})`);

if (rankedCommands.length > 0) {
  const explanation = buildExplanationEnvelope(rankedCommands[0], pressureSignals, knowledge);
  check(explanation.summary.length > 0, `explanation has summary (${explanation.summary.length} chars)`);
  check(explanation.confidence > 0, `explanation confidence > 0 (${explanation.confidence.toFixed(3)})`);
  check(explanation.chain.length >= 2, `explanation chain >= 2 steps (${explanation.chain.length})`);

  const chainSteps = explanation.chain.map((l) => l.step);
  check(chainSteps.includes('source'), 'chain includes source step');
  check(chainSteps.includes('command'), 'chain includes command step');
  check(explanation.summary.length > 10, `explanation is substantive (${explanation.summary.length} chars)`);
}

// ═══════════════════════════════════════════════════════════════
// SECTION 6: BIG WORLD POV — projection non-null with evidence
// ═══════════════════════════════════════════════════════════════
section('6. BIG WORLD POV — projection non-null with evidence');

const projectionCase = state1.cases.find((c) => c.status === 'active') ?? state1.cases[0];
check(!!projectionCase, 'projection case exists');

if (projectionCase) {
  const pov = buildWorkspaceBigWorldModule(state1, projectionCase.id, 'player-1', knowledge, liveRegistry);
  check(pov !== null, 'BigWorldPOVSummary non-null');

  if (pov) {
    // becauseBigProof must detect world movement
    check(
      pov.becauseBigProof.hasMarketMovement || pov.becauseBigProof.hasRivalMovement || pov.becauseBigProof.hasDemandShift,
      'becauseBigProof detects at least one world movement',
    );
    check(pov.becauseBigProof.movementEvidence.length >= 1, `becauseBigProof has evidence (${pov.becauseBigProof.movementEvidence.length})`);

    // Recommended actions must have evidence
    check(pov.recommendedActionReasons.length >= 1, `recommended actions >= 1 (${pov.recommendedActionReasons.length})`);
    for (const reason of pov.recommendedActionReasons) {
      check(
        reason.safeRefs !== undefined && reason.safeRefs.length >= 1,
        `recommended action has safeRefs (${reason.safeRefs?.length ?? 0})`,
      );
      check(reason.replayKey !== undefined && reason.replayKey.length > 0, 'recommended action has replayKey');
    }
  }
}

// ═══════════════════════════════════════════════════════════════
// SECTION 7: EMPTY KNOWLEDGE → NO RECOMMENDATION
// ═══════════════════════════════════════════════════════════════
section('7. EMPTY KNOWLEDGE — no recommendation (no legacy bypass)');

const emptyReg = createEmptyRegistry();
const emptyK = buildActorKnowledgeSnapshot('player-broker', 'player_broker', state1.day, emptyReg);
const emptyEnvelope = buildDecisionEvidenceEnvelope(emptyK);
check(emptyEnvelope.recommendedCommand === null, 'empty knowledge → no recommendation');

const emptyPlayable = buildPlayableMarketProjection(state1);
check(emptyPlayable.brokerOpportunity.topActions.length === 0, 'empty knowledge → no broker opportunity actions');
check(emptyPlayable.sharedCausalRefs === undefined, 'empty knowledge → no sharedCausalRefs');

// ═══════════════════════════════════════════════════════════════
// SECTION 8: CREDIBILITY DIVERGES — different roles, different scores
// ═══════════════════════════════════════════════════════════════
section('8. CREDIBILITY DIVERGES — different roles, different scores');

const roles: ActorRole[] = ['player_broker', 'rival_broker', 'owner', 'customer', 'manager'];
const roleBeliefs = new Map<string, number>();
for (const role of roles) {
  const k = buildActorKnowledgeSnapshot(`actor-${role}`, role, state1.day, liveRegistry);
  roleBeliefs.set(role, k.beliefs.length);
}
const uniqueBeliefCounts = new Set([...roleBeliefs.values()]);
check(uniqueBeliefCounts.size >= 2, `belief counts diverge across roles (${uniqueBeliefCounts.size} unique)`);

if (liveRegistry.index.all.length > 0) {
  const testRecord = liveRegistry.index.all[0];
  const credPlayer = computeSourceCredibility(testRecord, 'player_broker');
  const credOwner = computeSourceCredibility(testRecord, 'owner');
  check(
    credPlayer.score !== credOwner.score,
    `credibility diverges: player=${credPlayer.score.toFixed(3)} owner=${credOwner.score.toFixed(3)}`,
  );
}

// ═══════════════════════════════════════════════════════════════
// SECTION 9: NO HIDDEN GLOBAL LEAKAGE
// ═══════════════════════════════════════════════════════════════
section('9. NO HIDDEN GLOBAL LEAKAGE');

const projSrc = readSrc('src/selling-houses/application/projections/bigWorldPOVProjection.ts');
check(!projSrc.includes('queryHiddenSourceRecords'), 'bigWorldPOVProjection does NOT call queryHiddenSourceRecords');

const akSrc = readSrc('src/selling-houses/application/projections/actorKnowledgeProjection.ts');
check(!akSrc.includes('queryHiddenSourceRecords'), 'actorKnowledgeProjection does NOT call queryHiddenSourceRecords');
check(akSrc.includes('queryVisibleSourceRecords'), 'actorKnowledgeProjection calls queryVisibleSourceRecords');

const playableSrc = readSrc('src/selling-houses/application/projections/playableMarketProjection.ts');
check(!playableSrc.includes('queryHiddenSourceRecords'), 'playableMarketProjection does NOT call queryHiddenSourceRecords');

// ═══════════════════════════════════════════════════════════════
// SELF-AUDIT
// ═══════════════════════════════════════════════════════════════
section('SELF-AUDIT — no soft patterns');

const gateSrc = readFileSync(resolve(import.meta.dirname ?? '.', '..', 'scripts/verify-selling-houses-round16-playable-market-decision-gate.ts'), 'utf-8');
const auditMarker = '// SELF-AUDIT';
const auditIdx = gateSrc.lastIndexOf(auditMarker);
const gateSrcCore = auditIdx > 0 ? gateSrc.slice(0, auditIdx) : gateSrc;
const gateSrcNoComments = gateSrcCore
  .replace(/\/\/.*$/gm, '')
  .replace(/\/\*[\s\S]*?\*\//g, '');
const hasOrTrue = gateSrcNoComments.includes('|| true');
const hasCheckTrue = gateSrcNoComments.match(/check\(\s*true\s*,/);
check(!hasOrTrue, 'gate source has no || true');
check(!hasCheckTrue, 'gate source has no check(true, ...)');

// ═══════════════════════════════════════════════════════════════
// SUMMARY
// ═══════════════════════════════════════════════════════════════

console.log('\n═══════════════════════════════════════════════════════════════');
console.log(`  Round 16 — Playable Market Decision Gate`);
console.log(`  Passed: ${passed} | Failed: ${failed}`);
console.log('═══════════════════════════════════════════════════════════════');

if (failures.length > 0) {
  console.log('\n  Failures:');
  for (const f of failures) {
    console.log(`    ❌ ${f}`);
  }
}

if (failed === 0) {
  console.log('\n  ✅ PLAYABLE-MARKET-DECISION achieved');
  process.exit(0);
} else {
  console.log('\n  ❌ GATE FAILED');
  process.exit(1);
}
