/**
 * verify-selling-houses-action-replay-big-gate.ts
 *
 * Verifies the deterministic replay loop:
 *   ActionCommand → ActionReceipt → SourceRecord → CausalEvent → Replay
 *
 * Gates:
 * 1. Replay produces identical command replay key
 * 2. Replay produces identical source record IDs
 * 3. Replay produces identical causal event IDs
 * 4. Replay produces identical belief refs
 * 5. Replay is deterministic (same seed → same result)
 * 6. Replay does NOT mutate any state
 * 7. Cross-action replay: all three action types replay correctly
 * 8. Replay catches tampered commands (different seed → mismatch)
 * 9. Full chain: seed + source records + action commands + receipts → replay
 * 10. Replay output is bounded and structured
 */

// ── Imports ──────────────────────────────────────────────────────────────

import type {
  InformationSourceRecord,
  SourceKind,
  ActorRole,
} from '../src/selling-houses/domain/world-model/informationSourceTypes.js';

import type {
  InformationSourceRegistry,
} from '../src/selling-houses/domain/world-model/informationSourceRegistry.js';

import {
  createEmptyRegistry,
  appendSourceRecord,
} from '../src/selling-houses/domain/world-model/informationSourceRegistry.js';

import {
  buildActorKnowledgeSnapshot,
  buildDecisionEvidenceEnvelope,
  BROKER_COMMAND_CATALOG,
} from '../src/selling-houses/application/projections/actorKnowledgeProjection.js';

import type {
  ActorKnowledgeSnapshot,
  ActionCommand,
  ActionReceipt,
  ActionReplayReceipt,
} from '../src/selling-houses/domain/world-model/actorKnowledgeTypes.js';

import {
  buildActionCommand,
  buildActionReceipt,
} from '../src/selling-houses/domain/world-model/runtime/actionCommandReceipt.js';

import {
  replayActionCommand,
  verifyActionChainDeterminism,
} from '../src/selling-houses/domain/world-model/runtime/actionReplay.js';

// ── Test helpers ──────────────────────────────────────────────────────────

let failures = 0;
let passed = 0;

function assert(cond: boolean, msg: string): void {
  if (!cond) {
    console.error(`  FAIL: ${msg}`);
    failures += 1;
  } else {
    passed += 1;
  }
}

function assertEqual<T>(actual: T, expected: T, msg: string): void {
  if (actual !== expected) {
    console.error(`  FAIL: ${msg} (expected ${expected}, got ${actual})`);
    failures += 1;
  } else {
    passed += 1;
  }
}

// ── Test data builders ────────────────────────────────────────────────────

let recordCounter = 4000;

function buildRegistry(records: InformationSourceRecord[]): InformationSourceRegistry {
  let registry = createEmptyRegistry();
  for (const r of records) {
    const result = appendSourceRecord(registry, r);
    if (result.ok) registry = result.registry;
  }
  return registry;
}

function makeSourceRecord(overrides: Partial<InformationSourceRecord> & { sourceKind: SourceKind }): InformationSourceRecord {
  recordCounter += 1;
  return {
    sourceId: overrides.sourceId ?? `isr-replay-${recordCounter}`,
    sourceKind: overrides.sourceKind,
    day: overrides.day ?? 1,
    phase: overrides.phase ?? 'morning',
    entityRefs: overrides.entityRefs ?? [{ id: 'entity-1', kind: 'case' }],
    actorRefs: overrides.actorRefs ?? [{ id: 'actor-1', role: 'system' }],
    visibility: overrides.visibility ?? { scope: 'all_actors', baseDelayDays: 0 },
    confidence: overrides.confidence ?? 0.8,
    delayDays: overrides.delayDays ?? 0,
    replayKey: overrides.replayKey ?? `rk-replay-${recordCounter}`,
    origin: overrides.origin ?? 'ecosystem_tick',
    payload: overrides.payload ?? { summary: 'test source', subtype: 'heat_shift', marketCellId: 'cell-1', before: 50, after: 60, unit: 'heat', isPublic: true },
  } as InformationSourceRecord;
}

function buildTestKnowledge(): ActorKnowledgeSnapshot {
  const records = [
    makeSourceRecord({ sourceId: 'isr-replay-market-1', sourceKind: 'market_signal', day: 2, confidence: 0.9, visibility: { scope: 'all_actors', baseDelayDays: 0 } }),
    makeSourceRecord({ sourceId: 'isr-replay-rival-1', sourceKind: 'rival_action', day: 3, confidence: 0.85, visibility: { scope: 'all_actors', baseDelayDays: 0 }, payload: { summary: '竞品降价', subtype: 'reprice', rivalBrokerId: 'r-1', rivalAcnId: 'acn-1', priceBefore: 400, priceAfter: 380, evidenceStrength: 'direct' } }),
    makeSourceRecord({ sourceId: 'isr-replay-rival-2', sourceKind: 'rival_action', day: 3, confidence: 0.88, visibility: { scope: 'all_actors', baseDelayDays: 0 }, payload: { summary: '同板块竞品继续下调', subtype: 'reprice', rivalBrokerId: 'r-2', rivalAcnId: 'acn-1', priceBefore: 420, priceAfter: 390, evidenceStrength: 'direct' } }),
    makeSourceRecord({ sourceId: 'isr-replay-rival-3', sourceKind: 'rival_action', day: 4, confidence: 0.9, visibility: { scope: 'all_actors', baseDelayDays: 0 }, payload: { summary: '竞品释放成交让价', subtype: 'reprice', rivalBrokerId: 'r-3', rivalAcnId: 'acn-2', priceBefore: 415, priceAfter: 385, evidenceStrength: 'direct' } }),
    makeSourceRecord({ sourceId: 'isr-replay-owner-1', sourceKind: 'owner_interview', day: 3, confidence: 0.8, visibility: { scope: 'owner_only', baseDelayDays: 0 }, payload: { summary: '业主表达降价意愿', subtype: 'expectation_adjusted', ownerId: 'owner-1', caseId: 'case-1', brokerId: 'b-1', tone: 'neutral', ownerStatement: '可以考虑降价', interactionMode: 'scheduled_call' } }),
  ];

  const registry = buildRegistry(records);
  return buildActorKnowledgeSnapshot('broker-1', 'player_broker', 5, registry);
}

function buildOwnerKnowledge(): ActorKnowledgeSnapshot {
  const records = [
    makeSourceRecord({ sourceId: 'isr-replay-owner-market-1', sourceKind: 'market_signal', day: 2, confidence: 0.9, visibility: { scope: 'all_actors', baseDelayDays: 0 } }),
    makeSourceRecord({ sourceId: 'isr-replay-owner-interview-1', sourceKind: 'owner_interview', day: 3, confidence: 0.8, visibility: { scope: 'owner_only', baseDelayDays: 0 }, payload: { summary: '业主沟通记录', subtype: 'price_discussed', ownerId: 'owner-1', caseId: 'case-1', brokerId: 'b-1', tone: 'neutral', ownerStatement: '降价5万', interactionMode: 'meeting' } }),
  ];

  const registry = buildRegistry(records);
  return buildActorKnowledgeSnapshot('owner-1', 'owner', 5, registry);
}

// ════════════════════════════════════════════════════════════════════════════
// Tests
// ════════════════════════════════════════════════════════════════════════════

console.log('=== Action Replay Big Gate ===\n');

// --- Test 1: Replay produces identical command replay key ---
console.log('--- 1. Replay produces identical command replay key ---');
{
  const knowledge = buildTestKnowledge();
  const cmd = buildActionCommand(
    { command: BROKER_COMMAND_CATALOG.find((c) => c.commandId === 'cmd-owner-visit')!, reasoning: 'test', confidence: 0.8, pressureSignalIds: [], beliefSourceIds: ['b-1'], sourceRecordIds: ['s-1'] },
    knowledge, 5, 42,
  );
  const receipt = buildActionReceipt(cmd, 42);

  const replay = replayActionCommand(cmd, knowledge, receipt, 5, 42);

  assertEqual(replay.commandReplayKey, cmd.replayKey, 'replay commandReplayKey matches original');
  assertEqual(replay.sourceRecordIdsMatched, true, 'source record IDs match');
  assertEqual(replay.causalEventIdsMatched, true, 'causal event IDs match');
  assertEqual(replay.beliefRefsMatched, true, 'belief refs match');
  assertEqual(replay.matched, true, 'replay fully matched');

  console.log('  [PASS] replay produces identical command replay key');
}

// --- Test 2: Replay produces identical source record IDs ---
console.log('\n--- 2. Replay produces identical source record IDs ---');
{
  const knowledge = buildTestKnowledge();
  const cmd = buildActionCommand(
    { command: BROKER_COMMAND_CATALOG.find((c) => c.commandId === 'cmd-defend-listing')!, reasoning: 'test', confidence: 0.8, pressureSignalIds: [], beliefSourceIds: ['b-1'], sourceRecordIds: ['s-1'] },
    knowledge, 5, 42,
  );
  const receipt = buildActionReceipt(cmd, 42);

  const replay = replayActionCommand(cmd, knowledge, receipt, 5, 42);

  assert(replay.originalSourceRecordIds.length > 0, 'original has source records');
  assert(replay.replayedSourceRecordIds.length > 0, 'replayed has source records');
  assertEqual(replay.originalSourceRecordIds.length, replay.replayedSourceRecordIds.length, 'source record count matches');
  assertEqual(replay.sourceRecordIdsMatched, true, 'source record IDs are identical');

  console.log('  [PASS] replay produces identical source record IDs');
}

// --- Test 3: Replay produces identical causal event IDs ---
console.log('\n--- 3. Replay produces identical causal event IDs ---');
{
  const knowledge = buildTestKnowledge();
  const cmd = buildActionCommand(
    { command: BROKER_COMMAND_CATALOG.find((c) => c.commandId === 'cmd-customer-acquisition')!, reasoning: 'test', confidence: 0.8, pressureSignalIds: [], beliefSourceIds: ['b-1'], sourceRecordIds: ['s-1'] },
    knowledge, 5, 42,
  );
  const receipt = buildActionReceipt(cmd, 42);

  const replay = replayActionCommand(cmd, knowledge, receipt, 5, 42);

  assert(replay.originalCausalEventIds.length > 0, 'original has causal events');
  assert(replay.replayedCausalEventIds.length > 0, 'replayed has causal events');
  assertEqual(replay.originalCausalEventIds.length, replay.replayedCausalEventIds.length, 'causal event count matches');
  assertEqual(replay.causalEventIdsMatched, true, 'causal event IDs are identical');

  console.log('  [PASS] replay produces identical causal event IDs');
}

// --- Test 4: Replay produces identical belief refs ---
console.log('\n--- 4. Replay produces identical belief refs ---');
{
  const knowledge = buildTestKnowledge();
  const cmd = buildActionCommand(
    { command: BROKER_COMMAND_CATALOG.find((c) => c.commandId === 'cmd-owner-visit')!, reasoning: 'test', confidence: 0.8, pressureSignalIds: [], beliefSourceIds: ['b-1'], sourceRecordIds: ['s-1'] },
    knowledge, 5, 42,
  );
  const receipt = buildActionReceipt(cmd, 42);

  const replay = replayActionCommand(cmd, knowledge, receipt, 5, 42);

  assert(replay.originalBeliefRefs.length > 0, 'original has belief refs');
  assert(replay.replayedBeliefRefs.length > 0, 'replayed has belief refs');
  assertEqual(replay.originalBeliefRefs.length, replay.replayedBeliefRefs.length, 'belief ref count matches');
  assertEqual(replay.beliefRefsMatched, true, 'belief refs are identical');

  console.log('  [PASS] replay produces identical belief refs');
}

// --- Test 5: Replay is deterministic ---
console.log('\n--- 5. Replay is deterministic ---');
{
  const knowledge = buildTestKnowledge();
  const cmd = buildActionCommand(
    { command: BROKER_COMMAND_CATALOG.find((c) => c.commandId === 'cmd-owner-visit')!, reasoning: 'test', confidence: 0.8, pressureSignalIds: [], beliefSourceIds: ['b-1'], sourceRecordIds: ['s-1'] },
    knowledge, 5, 42,
  );
  const receipt = buildActionReceipt(cmd, 42);

  const replay1 = replayActionCommand(cmd, knowledge, receipt, 5, 42);
  const replay2 = replayActionCommand(cmd, knowledge, receipt, 5, 42);

  assertEqual(replay1.matched, replay2.matched, 'two replays produce same match result');
  assertEqual(replay1.commandReplayKey, replay2.commandReplayKey, 'two replays produce same command replay key');
  assertEqual(replay1.sourceRecordIdsMatched, replay2.sourceRecordIdsMatched, 'two replays produce same source record match');
  assertEqual(replay1.causalEventIdsMatched, replay2.causalEventIdsMatched, 'two replays produce same causal event match');
  assertEqual(replay1.mismatches.length, replay2.mismatches.length, 'two replays produce same mismatch count');

  console.log('  [PASS] replay is deterministic');
}

// --- Test 6: Replay does NOT mutate any state ---
console.log('\n--- 6. Replay does NOT mutate state ---');
{
  const knowledge = buildTestKnowledge();
  const cmd = buildActionCommand(
    { command: BROKER_COMMAND_CATALOG.find((c) => c.commandId === 'cmd-owner-visit')!, reasoning: 'test', confidence: 0.8, pressureSignalIds: [], beliefSourceIds: ['b-1'], sourceRecordIds: ['s-1'] },
    knowledge, 5, 42,
  );
  const receipt = buildActionReceipt(cmd, 42);

  // Snapshot state before replay
  const knowledgeBefore = JSON.stringify(knowledge);
  const cmdBefore = JSON.stringify(cmd);
  const receiptBefore = JSON.stringify(receipt);

  // Execute replay
  replayActionCommand(cmd, knowledge, receipt, 5, 42);

  // Verify nothing changed
  assertEqual(JSON.stringify(knowledge), knowledgeBefore, 'knowledge unchanged after replay');
  assertEqual(JSON.stringify(cmd), cmdBefore, 'command unchanged after replay');
  assertEqual(JSON.stringify(receipt), receiptBefore, 'receipt unchanged after replay');

  console.log('  [PASS] replay does NOT mutate state');
}

// --- Test 7: Cross-action replay for all three types ---
console.log('\n--- 7. Cross-action replay for all three types ---');
{
  const knowledge = buildTestKnowledge();
  const actionTypes: Array<{ commandId: string; expectedType: string }> = [
    { commandId: 'cmd-owner-visit', expectedType: 'owner_interview' },
    { commandId: 'cmd-defend-listing', expectedType: 'defend_listing' },
    { commandId: 'cmd-customer-acquisition', expectedType: 'customer_followup' },
  ];

  for (const { commandId, expectedType } of actionTypes) {
    const cmd = buildActionCommand(
      { command: BROKER_COMMAND_CATALOG.find((c) => c.commandId === commandId)!, reasoning: 'test', confidence: 0.8, pressureSignalIds: [], beliefSourceIds: ['b-1'], sourceRecordIds: ['s-1'] },
      knowledge, 5, 42,
    );
    const receipt = buildActionReceipt(cmd, 42);
    const replay = replayActionCommand(cmd, knowledge, receipt, 5, 42);

    assertEqual(replay.matched, true, `${expectedType}: replay matched`);
    assertEqual(replay.sourceRecordIdsMatched, true, `${expectedType}: source records matched`);
    assertEqual(replay.causalEventIdsMatched, true, `${expectedType}: causal events matched`);
    assertEqual(replay.beliefRefsMatched, true, `${expectedType}: belief refs matched`);
  }

  console.log('  [PASS] all three action types replay correctly');
}

// --- Test 8: Replay catches tampered commands ---
console.log('\n--- 8. Replay catches tampered commands ---');
{
  const knowledge = buildTestKnowledge();
  const cmd = buildActionCommand(
    { command: BROKER_COMMAND_CATALOG.find((c) => c.commandId === 'cmd-owner-visit')!, reasoning: 'test', confidence: 0.8, pressureSignalIds: [], beliefSourceIds: ['b-1'], sourceRecordIds: ['s-1'] },
    knowledge, 5, 42,
  );
  const receipt = buildActionReceipt(cmd, 42);

  // Tamper: use a different seed (simulating wrong seed)
  const tamperedReplay = replayActionCommand(cmd, knowledge, receipt, 5, 99);

  // Tampered replay should produce different source record IDs
  // (because the source record IDs depend on the seed)
  // The command replay key comparison should still match (it's from the original command)
  // But the receipt comparison will show mismatches because the re-execution used seed=99

  // The key assertion: tampered replay detects mismatch
  assert(
    tamperedReplay.sourceRecordIdsMatched === false || tamperedReplay.causalEventIdsMatched === false || tamperedReplay.mismatches.length > 0,
    'tampered replay detects mismatch',
  );

  console.log('  [PASS] replay catches tampered commands');
}

// --- Test 9: Full chain replay verification ---
console.log('\n--- 9. Full chain replay verification ---');
{
  const knowledge = buildTestKnowledge();
  const envelope = buildDecisionEvidenceEnvelope(knowledge);
  assert(envelope.recommendedCommand !== null, 'envelope has recommendation for chain verification');

  if (envelope.recommendedCommand) {
    // Full chain: recommendation → command → receipt → replay
    const cmd = buildActionCommand(envelope.recommendedCommand, knowledge, 5, 42);
    const receipt = buildActionReceipt(cmd, 42);
    const replay = replayActionCommand(cmd, knowledge, receipt, 5, 42);

    // Verify the full chain is deterministic
    assertEqual(replay.matched, true, 'full chain replay matched');

    // Verify: seed + source records + action commands + receipts → replay
    assert(replay.originalSourceRecordIds.length > 0, 'chain includes source records');
    assert(replay.originalCausalEventIds.length > 0, 'chain includes causal events');
    assert(replay.originalBeliefRefs.length > 0, 'chain includes belief refs');

    // Verify: command replay key is preserved through the chain
    assertEqual(replay.commandReplayKey, cmd.replayKey, 'chain preserves command replay key');

    console.log('  [PASS] full chain replay is deterministic');
  }
}

// --- Test 10: Replay output is bounded and structured ---
console.log('\n--- 10. Replay output is bounded and structured ---');
{
  const knowledge = buildTestKnowledge();
  const cmd = buildActionCommand(
    { command: BROKER_COMMAND_CATALOG.find((c) => c.commandId === 'cmd-owner-visit')!, reasoning: 'test', confidence: 0.8, pressureSignalIds: [], beliefSourceIds: ['b-1'], sourceRecordIds: ['s-1'] },
    knowledge, 5, 42,
  );
  const receipt = buildActionReceipt(cmd, 42);
  const replay = replayActionCommand(cmd, knowledge, receipt, 5, 42);

  // All fields are present and correctly typed
  assert(typeof replay.matched === 'boolean', 'replay.matched is boolean');
  assert(typeof replay.commandReplayKey === 'string', 'replay.commandReplayKey is string');
  assert(Array.isArray(replay.originalSourceRecordIds), 'replay.originalSourceRecordIds is array');
  assert(Array.isArray(replay.replayedSourceRecordIds), 'replay.replayedSourceRecordIds is array');
  assert(Array.isArray(replay.originalCausalEventIds), 'replay.originalCausalEventIds is array');
  assert(Array.isArray(replay.replayedCausalEventIds), 'replay.replayedCausalEventIds is array');
  assert(Array.isArray(replay.originalBeliefRefs), 'replay.originalBeliefRefs is array');
  assert(Array.isArray(replay.replayedBeliefRefs), 'replay.replayedBeliefRefs is array');
  assert(typeof replay.sourceRecordIdsMatched === 'boolean', 'replay.sourceRecordIdsMatched is boolean');
  assert(typeof replay.causalEventIdsMatched === 'boolean', 'replay.causalEventIdsMatched is boolean');
  assert(typeof replay.beliefRefsMatched === 'boolean', 'replay.beliefRefsMatched is boolean');
  assert(Array.isArray(replay.mismatches), 'replay.mismatches is array');

  // Bounded
  assert(replay.originalSourceRecordIds.length <= 10, 'source records bounded');
  assert(replay.originalCausalEventIds.length <= 20, 'causal events bounded');
  assert(replay.originalBeliefRefs.length <= 5, 'belief refs bounded');

  console.log('  [PASS] replay output is bounded and structured');
}

// --- Summary ---
console.log('\n=== Summary ===');
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failures}`);

if (failures > 0) {
  console.error(`\n${failures} FAILURES`);
  process.exit(1);
} else {
  console.log('\nAll tests passed!');
}
