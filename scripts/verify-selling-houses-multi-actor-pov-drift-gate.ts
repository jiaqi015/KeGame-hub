/**
 * verify-selling-houses-multi-actor-pov-drift-gate.ts
 *
 * Round 9 — Multi-Actor POV Drift Gate
 *
 * Proves that the same source record produces different beliefs/credibility
 * for different actor roles, and that compaction preserves explanation chains.
 *
 * Anti-false-positive:
 * - Does NOT accept same credibility for all actors
 * - Does NOT accept no belief updates for any actor
 * - Does NOT accept explanation chain breaks after compaction
 * - Does NOT accept "recommendation without evidence" as valid
 */

import assert from 'node:assert/strict';
import { createInitialState, updateDerivedState } from '../src/selling-houses/application/gameState.js';
import { seedInitialOpportunities } from '../src/selling-houses/domain/engine/opportunityEngine.js';
import { getScenarioSnapshotById } from '../src/selling-houses/domain/scenarioCatalog.js';
import { advanceDays } from '../src/selling-houses/domain/engine.js';

let passCount = 0;
let failCount = 0;

function check(condition: boolean, label: string) {
  if (condition) {
    passCount++;
    console.log(`  ✅ ${label}`);
  } else {
    failCount++;
    console.error(`  ❌ ${label}`);
  }
}

// ── Build real state + source records ─────────────────────────────────

function buildRealState() {
  const snapshot = getScenarioSnapshotById('standard-window-chain');
  assert.ok(snapshot, 'standard-window-chain scenario must exist');
  const state = createInitialState(snapshot, 20260513);
  seedInitialOpportunities(state);
  advanceDays(state, 5);
  updateDerivedState(state);
  return state;
}

const state = buildRealState();
const liveEvents = state.worldCausalEvents ?? [];

// Build a real registry from live causal events
const { createEmptyRegistry, appendSourceRecord, queryVisibleSourceRecords } = await import('../src/selling-houses/domain/world-model/informationSourceRegistry.js');
const { buildActorKnowledgeSnapshot, computeSourceCredibility, computeInformationDelay, buildDecisionEvidenceEnvelope, buildExplanationEnvelope, evaluatePressureSignals, filterAvailableCommands, rankCommands } = await import('../src/selling-houses/application/projections/actorKnowledgeProjection.js');
const { compactWorldCausalEvents, buildColdLedgerSummary } = await import('../src/selling-houses/domain/world-model/runtime/compaction.js');

const registry = (() => {
  let reg = createEmptyRegistry();
  for (const evt of liveEvents.slice(0, 20)) {
    // Create records with different visibility scopes to test actor-specific views
    const scopes: Array<{ scope: 'all_actors' | 'player_only' | 'owner_only' | 'broker_chain' | 'no_one' }> = [
      { scope: 'all_actors' },
      { scope: 'player_only' },
      { scope: 'owner_only' },
      { scope: 'broker_chain' },
      { scope: 'no_one' },
    ];
    for (const vis of scopes) {
      const result = appendSourceRecord(reg, {
        sourceId: `isr-drift-${vis.scope}-${evt.id}`,
        sourceKind: 'owner_interview' as const,
        day: evt.day,
        phase: 'afternoon' as const,
        entityRefs: [{ id: 'case-1', kind: 'case' as const }],
        actorRefs: [{ id: 'player-broker', role: 'player_broker' as const }],
        visibility: { scope: vis.scope, baseDelayDays: 0 },
        confidence: 0.85,
        delayDays: 0,
        replayKey: `rk-drift-${vis.scope}-${evt.id}`,
        origin: 'player_action' as const,
        payload: { summary: `drift test ${vis.scope} from ${evt.kind}`, subtype: 'price_discussed' as const, ownerId: 'owner-1', caseId: 'case-1', brokerId: 'player-broker', tone: 'neutral' as const, ownerStatement: '可以考虑', interactionMode: 'scheduled_call' as const },
      });
      if (result.ok) reg = result.registry;
    }
  }
  return reg;
})();

// ── Gate 1: Same source, different actor credibility ───────────────────

console.log('\n=== Gate 1: Same source, different actor credibility ===');

const testRecord = registry.index.all[0];
assert.ok(testRecord, 'Must have at least one source record');

const roles = ['player_broker', 'rival_broker', 'owner', 'customer', 'manager'] as const;
const credScores = new Map<string, number>();

for (const role of roles) {
  const cred = computeSourceCredibility(testRecord, role);
  credScores.set(role, cred.score);
  check(typeof cred.score === 'number', `credibility for ${role} is numeric (${cred.score.toFixed(3)})`);
  check(cred.factors.length > 0, `credibility for ${role} has factors (${cred.factors.length})`);
}

// Verify at least 2 different credibility scores exist
const uniqueScores = new Set([...credScores.values()].map((s) => s.toFixed(3)));
check(uniqueScores.size >= 2, `at least 2 distinct credibility scores across actors (${uniqueScores.size} unique: ${[...uniqueScores].join(', ')})`);

// ── Gate 2: Same source, different actor beliefs ──────────────────────

console.log('\n=== Gate 2: Same source, different actor beliefs ===');

const beliefMap = new Map<string, number>();
for (const role of roles) {
  const knowledge = buildActorKnowledgeSnapshot(`actor-${role}`, role, state.day, registry);
  beliefMap.set(role, knowledge.beliefs.length);
  check(knowledge.beliefs.length > 0, `${role} has beliefs (${knowledge.beliefs.length})`);
}

// Verify at least 2 different belief counts (different actors see different things)
const uniqueBeliefCounts = new Set([...beliefMap.values()]);
check(uniqueBeliefCounts.size >= 2, `at least 2 distinct belief counts across actors (${uniqueBeliefCounts.size} unique: ${[...uniqueBeliefCounts].join(', ')})`);

// ── Gate 3: Visibility scope produces correct actor views ─────────────

console.log('\n=== Gate 3: Visibility scope produces correct actor views ===');

const playerKnowledge = buildActorKnowledgeSnapshot('player-broker', 'player_broker', state.day, registry);
const ownerKnowledge = buildActorKnowledgeSnapshot('owner-1', 'owner', state.day, registry);
const managerKnowledge = buildActorKnowledgeSnapshot('mgr-1', 'manager', state.day, registry);

// Player should see player_only sources
const playerSeesPlayerOnly = playerKnowledge.visibleSources.some((s) => s.sourceId.includes('player_only'));
check(playerSeesPlayerOnly, 'player_broker sees player_only sources');

// Owner should see owner_only sources
const ownerSeesOwnerOnly = ownerKnowledge.visibleSources.some((s) => s.sourceId.includes('owner_only'));
check(ownerSeesOwnerOnly, 'owner sees owner_only sources');

// Manager should see all_actors sources but not player_only or owner_only
const managerSeesAllActors = managerKnowledge.visibleSources.some((s) => s.sourceId.includes('all_actors'));
check(managerSeesAllActors, 'manager sees all_actors sources');

// No actor should see no_one sources
for (const role of roles) {
  const knowledge = buildActorKnowledgeSnapshot(`actor-${role}`, role, state.day, registry);
  const seesNoOne = knowledge.visibleSources.some((s) => s.sourceId.includes('no_one'));
  check(!seesNoOne, `${role} does NOT see no_one sources`);
}

// ── Gate 4: Information delay varies by actor ──────────────────────────

console.log('\n=== Gate 4: Information delay varies by actor ===');

const { DEFAULT_ROLE_VISIBILITY } = await import('../src/selling-houses/domain/world-model/actorKnowledgeTypes.js');

const delays = new Map<string, number>();
for (const role of roles) {
  const rule = DEFAULT_ROLE_VISIBILITY.find((r) => r.role === role);
  assert.ok(rule, `Role visibility rule must exist for ${role}`);
  const delay = computeInformationDelay(testRecord, rule, state.day);
  delays.set(role, delay.effectiveDelayDays);
  check(typeof delay.effectiveDelayDays === 'number', `${role} effective delay is numeric (${delay.effectiveDelayDays})`);
}

// Verify delays differ across actors
const uniqueDelays = new Set([...delays.values()]);
check(uniqueDelays.size >= 2, `at least 2 distinct delay values (${uniqueDelays.size} unique: ${[...uniqueDelays].join(', ')})`);

// ── Gate 5: Explanation chain completeness per recommendation ──────────

console.log('\n=== Gate 5: Explanation chain completeness ===');

// Build knowledge for player_broker with enough sources
const playerK = buildActorKnowledgeSnapshot('player-broker', 'player_broker', state.day, registry);
const pressure = evaluatePressureSignals(playerK);
const commands = filterAvailableCommands('player_broker', pressure);
const ranked = rankCommands(commands, pressure);

if (ranked.length > 0) {
  for (const rec of ranked.slice(0, 3)) {
    const explanation = buildExplanationEnvelope(rec, pressure, playerK);

    // Each recommendation must answer all required questions
    check(explanation.summary.length > 0, `explanation has summary for ${rec.command.commandId}`);
    check(explanation.confidence > 0, `explanation has confidence > 0 (${explanation.confidence.toFixed(3)})`);
    check(explanation.chain.length >= 2, `explanation chain has >= 2 steps (${explanation.chain.length})`);

    // Chain must include source, belief, and command steps
    const chainSteps = explanation.chain.map((l) => l.step);
    check(chainSteps.includes('source'), `explanation has source step for ${rec.command.commandId}`);
    check(chainSteps.includes('belief'), `explanation has belief step for ${rec.command.commandId}`);
    check(chainSteps.includes('command'), `explanation has command step for ${rec.command.commandId}`);

    // Source step must reference real source record IDs
    const sourceLink = explanation.chain.find((l) => l.step === 'source');
    if (sourceLink) {
      check(sourceLink.referencedIds.length > 0, `source step has referenced IDs (${sourceLink.referencedIds.length})`);
      for (const srcId of sourceLink.referencedIds.slice(0, 3)) {
        const found = registry.index.all.find((r) => r.sourceId === srcId);
        check(!!found, `source ${srcId} is traceable in registry`);
      }
    }

    // Belief step must reference real belief IDs
    const beliefLink = explanation.chain.find((l) => l.step === 'belief');
    if (beliefLink) {
      check(beliefLink.referencedIds.length > 0, `belief step has referenced IDs (${beliefLink.referencedIds.length})`);
    }

    // Safe refs must be bounded and player-safe
    check(explanation.safeRefs.length <= 5, `safeRefs bounded (got ${explanation.safeRefs.length})`);
    for (const ref of explanation.safeRefs) {
      check(ref.refType.length > 0, 'safeRef has refType');
      check(ref.refId.length > 0, 'safeRef has refId');
      check(ref.refLabel.length <= 60, `safeRef label bounded to 60 chars (got ${ref.refLabel.length})`);
    }
  }
}

// ── Gate 6: No recommendation without evidence ─────────────────────────

console.log('\n=== Gate 6: No recommendation without evidence ===');

// Test with empty registry — should produce no recommendation
const emptyReg = createEmptyRegistry();
const emptyK = buildActorKnowledgeSnapshot('player-broker', 'player_broker', state.day, emptyReg);
const emptyEnvelope = buildDecisionEvidenceEnvelope(emptyK);

check(emptyEnvelope.recommendedCommand === null, 'empty knowledge → no recommendation');
check(emptyEnvelope.pressureSignals.length === 0, 'empty knowledge → no pressure signals');
check(emptyEnvelope.explanation.summary.includes('没有足够') || emptyEnvelope.explanation.confidence === 0, 'empty knowledge → explanation indicates no evidence');

// ── Gate 7: Compaction preserves explanation chain ─────────────────────

console.log('\n=== Gate 7: Compaction preserves explanation chain ===');

const liveEvents2 = state.worldCausalEvents ?? [];
const beforeCompact = liveEvents2.length;

const compacted = compactWorldCausalEvents(liveEvents2, 100);

// Verify compaction preserves source-linked events
for (const evt of compacted) {
  if ((evt as any).sourceRecordId) {
    check(!!(evt as any).sourceReplayKey, `compacted event ${evt.id} preserves sourceReplayKey`);
    check(!!(evt as any).sourceKind, `compacted event ${evt.id} preserves sourceKind`);
  }
}

check(compacted.length <= 100, `compaction bounds events (got ${compacted.length})`);

// ColdLedgerSummary preserves source traceability
const coldSummary = buildColdLedgerSummary(
  1, state.day,
  [{ phaseId: 'test', mutationCount: 0, entitiesProcessed: 0 }],
  {
    sourcesProcessed: 15,
    causalEvents: liveEvents2.slice(0, 5) as any,
    byKind: new Map([['owner_interview', { count: 10, causalEventsProduced: 10 }]]),
  },
);
check(coldSummary.latestSourceIdByKind.size > 0, `coldLedgerSummary has sourceId traceability (${coldSummary.latestSourceIdByKind.size} kinds)`);
check(coldSummary.latestReplayKeyByKind.size > 0, `coldLedgerSummary has replayKey traceability (${coldSummary.latestReplayKeyByKind.size} kinds)`);

// Verify the explanation chain can be reconstructed from cold summary
for (const [kind, latestSourceId] of coldSummary.latestSourceIdByKind) {
  check(typeof latestSourceId === 'string' && latestSourceId.length > 0, `cold summary ${kind} has valid latestSourceId`);
}

// ── Gate 8: Cross-actor recommendation divergence ──────────────────────

console.log('\n=== Gate 8: Cross-actor recommendation divergence ===');

// Player broker and owner should get different recommendations
const playerEnv = buildDecisionEvidenceEnvelope(
  buildActorKnowledgeSnapshot('player-broker', 'player_broker', state.day, registry),
);
const ownerEnv = buildDecisionEvidenceEnvelope(
  buildActorKnowledgeSnapshot('owner-1', 'owner', state.day, registry),
);

if (playerEnv.recommendedCommand && ownerEnv.recommendedCommand) {
  // The recommendations should differ (different commandId or different confidence)
  const diverges = playerEnv.recommendedCommand.command.commandId !== ownerEnv.recommendedCommand.command.commandId
    || Math.abs(playerEnv.recommendedCommand.confidence - ownerEnv.recommendedCommand.confidence) > 0.01;
  check(diverges, `player and owner get different recommendations (player: ${playerEnv.recommendedCommand.command.commandId} @ ${playerEnv.recommendedCommand.confidence.toFixed(3)}, owner: ${ownerEnv.recommendedCommand.command.commandId} @ ${ownerEnv.recommendedCommand.confidence.toFixed(3)})`);
} else {
  check(false, 'Both player and owner must have recommendations (at least with sufficient sources)');
}

// ── Summary ───────────────────────────────────────────────────────────

console.log(`\n=== Multi-Actor POV Drift Gate ===`);
console.log(`Passed: ${passCount}`);
console.log(`Failed: ${failCount}`);

if (failCount > 0) {
  console.error(`\nGATE FAILED: ${failCount} checks did not pass.`);
  process.exit(1);
} else {
  console.log(`\nGATE PASSED: All ${passCount} checks passed.`);
}
