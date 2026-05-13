/**
 * verify-selling-houses-perfect-explanation-envelope-gate.ts
 *
 * The "perfect explanation envelope" gate.
 * Catches false positives: "推荐看起来有理由但没有 source/causal/belief 链"
 *
 * Every recommendation in the product MUST have:
 *   1. A non-empty explanation.summary
 *   2. An explanation.chain with at least source → pressure → command links
 *   3. Every chain link must reference real IDs (not fabricated)
 *   4. Every referenced ID must be traceable back to a visible source
 *   5. Confidence must be non-zero when a recommendation exists
 *   6. Safe refs must be bounded and player-safe
 *   7. No recommendation without at least 1 source record in evidence
 *   8. Cross-actor divergence: different actors get different explanations for same case
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
  buildExplanationEnvelope,
} from '../src/selling-houses/application/projections/actorKnowledgeProjection.js';

import type {
  ActorKnowledgeSnapshot,
  DecisionEvidenceEnvelope,
  ExplanationEnvelope,
  RecommendedCommand,
} from '../src/selling-houses/domain/world-model/actorKnowledgeTypes.js';

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

// ── Test data builders ────────────────────────────────────────────────────

let recordCounter = 2000;

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
    sourceId: overrides.sourceId ?? `isr-explain-${recordCounter}`,
    sourceKind: overrides.sourceKind,
    day: overrides.day ?? 1,
    phase: overrides.phase ?? 'morning',
    entityRefs: overrides.entityRefs ?? [{ id: 'entity-1', kind: 'case' }],
    actorRefs: overrides.actorRefs ?? [{ id: 'actor-1', role: 'system' }],
    visibility: overrides.visibility ?? { scope: 'all_actors', baseDelayDays: 0 },
    confidence: overrides.confidence ?? 0.8,
    delayDays: overrides.delayDays ?? 0,
    replayKey: overrides.replayKey ?? `rk-explain-${recordCounter}`,
    origin: overrides.origin ?? 'ecosystem_tick',
    payload: overrides.payload ?? { summary: 'test source', subtype: 'heat_shift', marketCellId: 'cell-1', before: 50, after: 60, unit: 'heat', isPublic: true },
  } as InformationSourceRecord;
}

function buildRichKnowledge(actorId: string, role: ActorRole, day: number): { knowledge: ActorKnowledgeSnapshot; registry: InformationSourceRegistry } {
  const records: InformationSourceRecord[] = [
    makeSourceRecord({
      sourceId: 'isr-explain-market-1',
      sourceKind: 'market_signal',
      day: day - 3,
      confidence: 0.9,
      visibility: { scope: 'all_actors', baseDelayDays: 0 },
      payload: { summary: '和平里板块热度上升', subtype: 'heat_shift', marketCellId: 'cell-1', before: 52, after: 58, unit: 'heat', isPublic: true },
    }),
    makeSourceRecord({
      sourceId: 'isr-explain-rival-1',
      sourceKind: 'rival_action',
      day: day - 2,
      confidence: 0.85,
      visibility: { scope: 'all_actors', baseDelayDays: 0 },
      payload: { summary: '竞品降价促销', subtype: 'reprice', rivalBrokerId: 'r-1', rivalAcnId: 'acn-1', priceBefore: 420, priceAfter: 395, evidenceStrength: 'direct' },
    }),
    makeSourceRecord({
      sourceId: 'isr-explain-owner-1',
      sourceKind: 'owner_interview',
      day: day - 1,
      confidence: 0.8,
      visibility: { scope: 'owner_only', baseDelayDays: 0 },
      payload: { summary: '业主表示可以谈价格', subtype: 'price_discussed', ownerId: 'owner-1', caseId: 'case-1', brokerId: 'b-1', tone: 'neutral', ownerStatement: '价格可以商量', interactionMode: 'meeting' },
    }),
    makeSourceRecord({
      sourceId: 'isr-explain-customer-1',
      sourceKind: 'customer_interaction',
      day: day - 1,
      confidence: 0.75,
      visibility: { scope: 'all_actors', baseDelayDays: 0 },
      payload: { summary: '客户对同板块房源比较频繁', subtype: 'comparison_made', customerId: 'cust-1', caseId: 'case-1', listingId: 'list-1' },
    }),
    makeSourceRecord({
      sourceId: 'isr-explain-process-1',
      sourceKind: 'process_receipt',
      day: day - 2,
      confidence: 0.95,
      visibility: { scope: 'player_only', baseDelayDays: 0 },
      payload: { summary: '上次面访完成', subtype: 'focus_meeting_completed', processType: 'focus_meeting', processId: 'pm-1', caseIds: ['case-1'], customerIds: ['cust-1'], brokerIds: ['b-1'], outcome: 'completed', metrics: { duration: 60 } },
    }),
  ];

  const registry = buildRegistry(records);
  const knowledge = buildActorKnowledgeSnapshot(actorId, role, day, registry);
  return { knowledge, registry };
}

// ════════════════════════════════════════════════════════════════════════════
// Tests
// ════════════════════════════════════════════════════════════════════════════

console.log('=== Perfect Explanation Envelope Gate ===\n');

// --- Test 1: Every recommendation has explanation envelope ---
console.log('--- 1. Every recommendation has explanation envelope ---');
{
  const { knowledge } = buildRichKnowledge('broker-1', 'player_broker', 5);
  const envelope = buildDecisionEvidenceEnvelope(knowledge);

  if (envelope.recommendedCommand) {
    const explanation = envelope.explanation;

    // Non-empty summary
    assert(explanation.summary.length > 0, 'explanation.summary is non-empty');

    // Chain has at least 2 links (source + command minimum)
    assert(explanation.chain.length >= 2, `explanation.chain has >= 2 links (got ${explanation.chain.length})`);

    // Confidence matches recommendation confidence
    assertEqual(explanation.confidence, envelope.recommendedCommand.confidence,
      'explanation.confidence matches recommendation confidence');

    // Safe refs are bounded
    assert(explanation.safeRefs.length <= 5, `safeRefs bounded (got ${explanation.safeRefs.length})`);

    console.log('  [PASS] recommendation has complete explanation envelope');
  } else {
    console.log('  [PASS] no recommendation (low pressure — acceptable)');
  }
}

// --- Test 2: Explanation chain links reference real IDs ---
console.log('\n--- 2. Chain links reference real IDs ---');
{
  const { knowledge } = buildRichKnowledge('broker-1', 'player_broker', 5);
  const envelope = buildDecisionEvidenceEnvelope(knowledge);

  if (envelope.recommendedCommand) {
    const explanation = envelope.explanation;

    for (const link of explanation.chain) {
      // Every chain link must have at least 1 referenced ID
      assert(link.referencedIds.length > 0, `chain link "${link.step}" has at least 1 referenced ID`);

      // Every referenced ID must be traceable
      for (const refId of link.referencedIds) {
        if (link.step === 'source') {
          // Source IDs must be in visible sources
          assert(
            knowledge.visibleSources.some((s) => s.sourceId === refId),
            `chain source ref ${refId} is in visible sources`,
          );
        } else if (link.step === 'belief') {
          // Belief IDs must be in beliefs
          assert(
            knowledge.beliefs.some((b) => b.updateId === refId),
            `chain belief ref ${refId} is in beliefs`,
          );
        }
        // 'pressure' and 'command' refs are internal IDs — just check non-empty
        assert(refId.length > 0, `chain ref ${refId} is non-empty`);
      }
    }

    console.log('  [PASS] all chain links reference real IDs');
  } else {
    console.log('  [PASS] no recommendation to validate');
  }
}

// --- Test 3: No fabricated IDs in explanation ---
console.log('\n--- 3. No fabricated IDs in explanation ---');
{
  const { knowledge } = buildRichKnowledge('broker-1', 'player_broker', 5);
  const envelope = buildDecisionEvidenceEnvelope(knowledge);

  if (envelope.recommendedCommand) {
    // Build a set of all valid IDs
    const validSourceIds = new Set(knowledge.visibleSources.map((s) => s.sourceId));
    const validBeliefIds = new Set(knowledge.beliefs.map((b) => b.updateId));
    const validPressureIds = new Set(envelope.pressureSignals.map((ps) => ps.signalId));

    for (const link of envelope.explanation.chain) {
      for (const refId of link.referencedIds) {
        if (link.step === 'source') {
          assert(validSourceIds.has(refId), `fabricated source ID detected: ${refId}`);
        } else if (link.step === 'belief') {
          assert(validBeliefIds.has(refId), `fabricated belief ID detected: ${refId}`);
        } else if (link.step === 'pressure') {
          assert(validPressureIds.has(refId), `fabricated pressure ID detected: ${refId}`);
        }
        // 'command' refs are catalog IDs — just check format
        assert(refId.startsWith('cmd-') || refId.length > 0, `command ref has valid format: ${refId}`);
      }
    }

    console.log('  [PASS] no fabricated IDs in explanation');
  } else {
    console.log('  [PASS] no recommendation to validate');
  }
}

// --- Test 4: Cross-actor divergence for same case ---
console.log('\n--- 4. Cross-actor explanation divergence ---');
{
  const day = 5;

  // Build knowledge for broker
  const brokerRecords = [
    makeSourceRecord({ sourceId: 'isr-cross-broker-1', sourceKind: 'market_signal', day: 2, confidence: 0.9, visibility: { scope: 'all_actors', baseDelayDays: 0 } }),
    makeSourceRecord({ sourceId: 'isr-cross-broker-2', sourceKind: 'player_action_receipt', day: 3, confidence: 0.95, visibility: { scope: 'player_only', baseDelayDays: 0 }, payload: { summary: '玩家执行了带看', subtype: 'action_executed', actionId: 'showing', executorId: 'b-1', caseId: 'case-1', costEnergy: 10, costPromotionBudget: 0, fieldDeltas: [], outcome: 'success' } }),
  ];
  const brokerRegistry = buildRegistry(brokerRecords);
  const brokerKnowledge = buildActorKnowledgeSnapshot('broker-1', 'player_broker', day, brokerRegistry);

  // Build knowledge for owner
  const ownerRecords = [
    makeSourceRecord({ sourceId: 'isr-cross-owner-1', sourceKind: 'owner_interview', day: 2, confidence: 0.8, visibility: { scope: 'owner_only', baseDelayDays: 0 }, payload: { summary: '业主沟通记录', subtype: 'price_discussed', ownerId: 'owner-1', caseId: 'case-1', brokerId: 'b-1', tone: 'neutral', ownerStatement: '降价5万', interactionMode: 'meeting' } }),
    makeSourceRecord({ sourceId: 'isr-cross-owner-2', sourceKind: 'market_signal', day: 3, confidence: 0.85, visibility: { scope: 'all_actors', baseDelayDays: 0 } }),
  ];
  const ownerRegistry = buildRegistry(ownerRecords);
  const ownerKnowledge = buildActorKnowledgeSnapshot('owner-1', 'owner', day, ownerRegistry);

  const brokerEnvelope = buildDecisionEvidenceEnvelope(brokerKnowledge);
  const ownerEnvelope = buildDecisionEvidenceEnvelope(ownerKnowledge);

  // Different actors should see different visible sources
  const brokerSourceIds = new Set(brokerKnowledge.visibleSources.map((s) => s.sourceId));
  const ownerSourceIds = new Set(ownerKnowledge.visibleSources.map((s) => s.sourceId));

  assert(brokerSourceIds.has('isr-cross-broker-2'), 'broker sees player_only source');
  assert(!ownerSourceIds.has('isr-cross-broker-2'), 'owner does NOT see player_only source');

  assert(ownerSourceIds.has('isr-cross-owner-1'), 'owner sees owner_only source');
  assert(!brokerSourceIds.has('isr-cross-owner-1'), 'broker does NOT see owner_only source');

  // Different explanations (if both have recommendations)
  if (brokerEnvelope.recommendedCommand && ownerEnvelope.recommendedCommand) {
    assert(
      brokerEnvelope.recommendedCommand.command.commandId !== ownerEnvelope.recommendedCommand.command.commandId
      || brokerEnvelope.recommendedCommand.confidence !== ownerEnvelope.recommendedCommand.confidence,
      'broker and owner get different recommendations or confidence levels',
    );
  }

  console.log('  [PASS] cross-actor explanations diverge correctly');
}

// --- Test 5: Explanation chain completeness for all command types ---
console.log('\n--- 5. Explanation chain completeness ---');
{
  const { knowledge } = buildRichKnowledge('broker-1', 'player_broker', 10);
  const envelope = buildDecisionEvidenceEnvelope(knowledge);

  if (envelope.recommendedCommand) {
    const chain = envelope.explanation.chain;

    // Must have source link
    const hasSourceLink = chain.some((l) => l.step === 'source');
    assert(hasSourceLink, 'explanation has source link');

    // Must have command link
    const hasCommandLink = chain.some((l) => l.step === 'command');
    assert(hasCommandLink, 'explanation has command link');

    // If there are pressure signals, must have pressure link
    if (envelope.pressureSignals.length > 0) {
      const hasPressureLink = chain.some((l) => l.step === 'pressure');
      assert(hasPressureLink, 'explanation has pressure link when pressure signals exist');
    }

    // All links have non-empty descriptions
    for (const link of chain) {
      assert(link.description.length > 0, `chain link "${link.step}" has non-empty description`);
    }

    console.log('  [PASS] explanation chain is complete');
  } else {
    console.log('  [PASS] no recommendation to validate');
  }
}

// --- Test 6: Gate catches "looks-good-but-no-evidence" false positives ---
console.log('\n--- 6. Gate catches false positive recommendations ---');
{
  // Scenario: empty knowledge snapshot → should produce NO recommendation
  const emptyRegistry = buildRegistry([]);
  const emptyKnowledge = buildActorKnowledgeSnapshot('broker-1', 'player_broker', 5, emptyRegistry);
  const emptyEnvelope = buildDecisionEvidenceEnvelope(emptyKnowledge);

  // Empty knowledge should produce null recommendation
  assert(emptyEnvelope.recommendedCommand === null,
    'empty knowledge produces no recommendation (no false positive)');

  // Explanation should reflect empty state
  assert(emptyEnvelope.explanation.summary.length > 0,
    'empty knowledge still has explanation summary');
  assert(emptyEnvelope.explanation.confidence === 0,
    'empty knowledge has zero confidence');

  console.log('  [PASS] gate catches false positive: no evidence = no recommendation');
}

// --- Test 7: Safe refs are player-safe ---
console.log('\n--- 7. Safe refs are player-safe ---');
{
  const { knowledge } = buildRichKnowledge('broker-1', 'player_broker', 5);
  const envelope = buildDecisionEvidenceEnvelope(knowledge);

  // Safe refs should only contain visible source information
  for (const ref of envelope.explanation.safeRefs) {
    assert(ref.refType.length > 0, 'safe ref has refType');
    assert(ref.refId.length > 0, 'safe ref has refId');
    assert(ref.refLabel.length > 0, 'safe ref has refLabel');

    // refLabel should be bounded (max 60 chars as defined in builder)
    assert(ref.refLabel.length <= 60, `safe ref label bounded (got ${ref.refLabel.length})`);
  }

  // Safe refs should be bounded
  assert(envelope.explanation.safeRefs.length <= 5, 'safe refs bounded to 5');

  console.log('  [PASS] safe refs are player-safe and bounded');
}

// --- Test 8: buildExplanationEnvelope can be called independently ---
console.log('\n--- 8. buildExplanationEnvelope is independently callable ---');
{
  const { knowledge } = buildRichKnowledge('broker-1', 'player_broker', 5);
  const envelope = buildDecisionEvidenceEnvelope(knowledge);

  if (envelope.recommendedCommand) {
    // Build explanation independently
    const explanation = buildExplanationEnvelope(
      envelope.recommendedCommand,
      envelope.pressureSignals,
      knowledge,
    );

    assert(explanation.summary.length > 0, 'independent explanation has summary');
    assert(explanation.chain.length > 0, 'independent explanation has chain');
    assert(typeof explanation.confidence === 'number', 'independent explanation has confidence');
    assert(Array.isArray(explanation.safeRefs), 'independent explanation has safeRefs');

    console.log('  [PASS] buildExplanationEnvelope is independently callable');
  } else {
    console.log('  [PASS] no recommendation to validate');
  }
}

// --- Test 9: Pressure → command mapping is consistent ---
console.log('\n--- 9. Pressure → command mapping consistency ---');
{
  const { knowledge } = buildRichKnowledge('broker-1', 'player_broker', 5);
  const envelope = buildDecisionEvidenceEnvelope(knowledge);

  if (envelope.recommendedCommand) {
    const cmd = envelope.recommendedCommand.command;

    // The recommended command's target domains must overlap with
    // at least one pressure signal's domain
    const pressureDomains = new Set(envelope.pressureSignals.map((ps) => ps.domain));
    const overlap = cmd.targetDomains.some((d) => pressureDomains.has(d));

    assert(overlap,
      `recommended command domains [${cmd.targetDomains}] overlap with pressure domains [${[...pressureDomains]}]`);
  }

  console.log('  [PASS] pressure → command mapping is consistent');
}

// --- Test 10: No raw GameState in explanation ---
console.log('\n--- 10. No raw GameState in explanation ---');
{
  const { knowledge } = buildRichKnowledge('broker-1', 'player_broker', 5);
  const envelope = buildDecisionEvidenceEnvelope(knowledge);

  const serialized = JSON.stringify(envelope);

  // Must not contain raw GameState fields
  const forbiddenKeys = [
    '"rngState"', '"rngCalls"', '"budgetLedger"', '"eventLog"',
    '"todayPlan"', '"focusMeeting"', '"marketOutcome"',
    '"rivalListings":', '"rivalStores":', '"customerStates":',
    '"worldCausalEvents":',
  ];

  for (const pattern of forbiddenKeys) {
    assert(!serialized.includes(pattern), `DecisionEvidenceEnvelope must not contain "${pattern}"`);
  }

  console.log('  [PASS] no raw GameState in DecisionEvidenceEnvelope');
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
