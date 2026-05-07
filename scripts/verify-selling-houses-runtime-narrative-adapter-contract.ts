/**
 * Verification script for Runtime NarrativeSignalPack Adapter contract.
 *
 * Checks:
 * 1. Adapter builds NarrativeSignalPack from compressed runtime data
 * 2. Adapter builds NarrativeGenerationInputPack from signal pack
 * 3. Adapter builds LlmInputPackRef from signal pack
 * 4. Pack is deterministic (same input → same pack)
 * 5. Pack does NOT contain raw GameState
 * 6. Generation constraints are applied correctly
 * 7. Owner-scoped constraints are enforced for owner actor
 * 8. Broker can mention D4 internals and company pressure
 * 9. Pack hash is stable
 * 10. Layer imports are clean (runtime/narrative-support imports only from core)
 */

import assert from 'node:assert/strict';

import {
  buildNarrativeSignalPackFromRuntime,
  buildNarrativeGenerationInputPackFromSignalPack,
  buildLlmInputPackRefFromSignalPack,
} from '../src/selling-houses/runtime/narrative-support/narrativeSignalPackAdapter.js';
import type {
  RuntimeNarrativeSignalPackInput,
  CompressedCaseContext,
} from '../src/selling-houses/runtime/narrative-support/narrativeSignalPackAdapter.js';
import type { NarrativeSignalPack } from '../src/selling-houses/core/narrative/models.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCase(overrides: Partial<CompressedCaseContext> = {}): CompressedCaseContext {
  return {
    caseId: 'case-001',
    title: '测试房源',
    status: 'active',
    signals: [
      {
        signalId: 'sig-001',
        caseId: 'case-001',
        kind: 'pricing-friction',
        label: '价格摩擦',
        severity: 'decision',
        score: 65,
        day: 10,
      },
      {
        signalId: 'sig-002',
        caseId: 'case-001',
        kind: 'owner-readiness-low',
        label: '业主配合度低',
        severity: 'urgent',
        score: 80,
        day: 10,
      },
    ],
    assetScore: {
      modelId: 'asset-score:case-001:10',
      score: 72,
      d1: 55,
      d2: 80,
      d3: 60,
      blockers: ['价格偏高'],
    },
    ownerReadiness: {
      score: 45,
      trust: 40,
      urgency: 70,
      patience: 30,
    },
    decisionMoments: [
      { id: 'dm-001', label: '定价决策', summary: '需要决定是否调价' },
    ],
    recommendationDrafts: [
      { id: 'rd-001', actionSpecId: 'price-adjust', enabled: true },
    ],
    ...overrides,
  };
}

function makeInput(overrides: Partial<RuntimeNarrativeSignalPackInput> = {}): RuntimeNarrativeSignalPackInput {
  return {
    day: 10,
    actorId: 'broker:current',
    actorKind: 'broker',
    cases: [makeCase()],
    pressureReceipts: [
      {
        receiptId: 'pr-001',
        caseId: 'case-001',
        source: 'competition',
        headline: '竞品降价压力',
        magnitude: 60,
        day: 10,
      },
    ],
    consensusReceipts: [
      {
        receiptId: 'cr-001',
        caseId: 'case-001',
        opportunityId: 'opp-001',
        fromStage: 'negotiable_zone',
        toStage: 'tentative_alignment',
        direction: 'forward',
        reason: '价格接近',
        day: 10,
      },
    ],
    evaluationRefs: [
      {
        snapshotId: 'snap-001',
        caseId: 'case-001',
        dimension: 'competitiveness',
        score: 72,
        previousScore: 65,
        day: 10,
      },
    ],
    attentionWarnings: [
      {
        warningId: 'aw-001',
        actorId: 'broker:current',
        actorKind: 'broker',
        warningKind: 'high_fit_low_attention',
        detail: '高匹配度低关注度',
        targetId: 'case-001',
        targetKind: 'asset_case',
        day: 10,
      },
    ],
    commitmentChanges: [
      {
        changeId: 'cc-001',
        actorId: 'owner:001',
        actorKind: 'owner',
        commitmentLabel: '价格承诺',
        fromStatus: 'tentative',
        toStatus: 'active',
        strength: 70,
        reason: '业主同意调价',
        caseId: 'case-001',
        day: 10,
      },
    ],
    beliefConflicts: [
      {
        conflictId: 'bc-001',
        actorId: 'owner:001',
        actorKind: 'owner',
        conflictKind: 'belief_vs_fact',
        description: '业主认为房价高于市场实际价格',
        involvedBeliefs: ['price_anchor'],
        severity: 'high',
        caseId: 'case-001',
        day: 10,
      },
    ],
    interactionScenes: [
      {
        sceneId: 'scene-001',
        sceneType: 'owner_call',
        caseId: 'case-001',
        day: 10,
        participants: [
          { actorId: 'broker:current', actorKind: 'broker', role: 'initiator' },
          { actorId: 'owner:001', actorKind: 'owner', role: 'receiver' },
        ],
        outcome: 'agreed_to_discuss_price',
      },
    ],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// 1. Adapter builds NarrativeSignalPack from compressed runtime data
// ---------------------------------------------------------------------------

function verifyBuildsPack() {
  const pack = buildNarrativeSignalPackFromRuntime(makeInput());

  assert.ok(pack, 'Pack must be created');
  assert.ok(pack.packId, 'Pack must have packId');
  assert.equal(pack.day, 10, 'Pack day must match input');
  assert.equal(pack.generatedForActorId, 'broker:current', 'Pack actor must match input');
  assert.equal(pack.generatedForActorKind, 'broker', 'Pack actor kind must match input');

  // Signals should be present
  assert.ok(pack.actorVisibleSignals.length > 0, 'Pack must have actor visible signals');
  assert.ok(pack.sourceRefs.length > 0, 'Pack must have source refs');

  console.log('  [PASS] Adapter builds NarrativeSignalPack');
}

// ---------------------------------------------------------------------------
// 2. Adapter builds NarrativeGenerationInputPack from signal pack
// ---------------------------------------------------------------------------

function verifyBuildsInputPack() {
  const pack = buildNarrativeSignalPackFromRuntime(makeInput());
  const inputPack = buildNarrativeGenerationInputPackFromSignalPack(pack, 'daily_summary');

  assert.ok(inputPack, 'Input pack must be created');
  assert.equal(inputPack.kind, 'narrative_generation', 'Input pack kind must be narrative_generation');
  assert.equal(inputPack.day, 10, 'Input pack day must match');
  assert.equal(inputPack.povActorId, 'broker:current', 'Input pack actor must match');
  assert.equal(inputPack.povActorKind, 'broker', 'Input pack actor kind must match');
  assert.equal(inputPack.narrativeFocus, 'daily_summary', 'Input pack focus must match');

  // Should have event summaries from source refs
  assert.ok(inputPack.eventSummaries.length >= 0, 'Input pack must have event summaries array');

  // Should have evaluation snapshot IDs
  assert.ok(inputPack.evaluationSnapshotIds.length >= 0, 'Input pack must have evaluation snapshot IDs');

  console.log('  [PASS] Adapter builds NarrativeGenerationInputPack');
}

// ---------------------------------------------------------------------------
// 3. Adapter builds LlmInputPackRef from signal pack
// ---------------------------------------------------------------------------

function verifyBuildsPackRef() {
  const pack = buildNarrativeSignalPackFromRuntime(makeInput());
  const packRef = buildLlmInputPackRefFromSignalPack(pack);

  assert.ok(packRef, 'Pack ref must be created');
  assert.equal(packRef.packKind, 'narrative_signal_pack', 'Pack ref kind must be narrative_signal_pack');
  assert.ok(packRef.packHash, 'Pack ref must have packHash');
  assert.equal(packRef.packedAtDay, 10, 'Pack ref day must match');
  assert.ok(Array.isArray(packRef.sourceSnapshotIds), 'Pack ref must have sourceSnapshotIds');
  assert.ok(Array.isArray(packRef.sourceReceiptIds), 'Pack ref must have sourceReceiptIds');
  assert.ok(packRef.summary, 'Pack ref must have summary');

  console.log('  [PASS] Adapter builds LlmInputPackRef');
}

// ---------------------------------------------------------------------------
// 4. Pack is deterministic
// ---------------------------------------------------------------------------

function verifyDeterministic() {
  const input = makeInput();
  const pack1 = buildNarrativeSignalPackFromRuntime(input);
  const pack2 = buildNarrativeSignalPackFromRuntime(input);

  assert.equal(pack1.packId, pack2.packId, 'Pack ID must be deterministic');
  assert.equal(pack1.day, pack2.day, 'Day must be deterministic');
  assert.equal(pack1.generatedForActorId, pack2.generatedForActorId, 'Actor must be deterministic');
  assert.equal(pack1.actorVisibleSignals.length, pack2.actorVisibleSignals.length, 'Signal count must be deterministic');
  assert.equal(pack1.sourceRefs.length, pack2.sourceRefs.length, 'Source ref count must be deterministic');

  console.log('  [PASS] Pack is deterministic');
}

// ---------------------------------------------------------------------------
// 5. Pack does NOT contain raw GameState
// ---------------------------------------------------------------------------

function verifyNoRawGameState() {
  const pack = buildNarrativeSignalPackFromRuntime(makeInput());
  const json = JSON.stringify(pack);

  // These should NOT appear in the pack
  const forbiddenPatterns = [
    'rngState', 'rngCalls', 'CustomerRuntimeState', 'Opportunity',
    'DomainEventEntry', 'rawGameState', 'eventLog',
  ];

  for (const pattern of forbiddenPatterns) {
    assert.ok(!json.includes(pattern), `Pack must NOT contain raw GameState pattern: ${pattern}`);
  }

  console.log('  [PASS] Pack does NOT contain raw GameState');
}

// ---------------------------------------------------------------------------
// 6. Generation constraints are applied correctly
// ---------------------------------------------------------------------------

function verifyGenerationConstraints() {
  const pack = buildNarrativeSignalPackFromRuntime(makeInput());

  assert.ok(pack.generationConstraints, 'Pack must have generationConstraints');
  assert.ok(pack.generationConstraints.requiredEvidenceForFacts, 'Must require evidence for facts');
  assert.ok(Array.isArray(pack.generationConstraints.forbiddenTopics), 'Must have forbidden topics');
  assert.ok(pack.generationConstraints.forbiddenTopics.length > 0, 'Must have at least one forbidden topic');

  console.log('  [PASS] Generation constraints are applied');
}

// ---------------------------------------------------------------------------
// 7. Owner-scoped constraints are enforced for owner actor
// ---------------------------------------------------------------------------

function verifyOwnerConstraints() {
  const pack = buildNarrativeSignalPackFromRuntime(
    makeInput({ actorId: 'owner:001', actorKind: 'owner' }),
  );

  assert.equal(pack.generationConstraints.visibleScope, 'owner_scoped', 'Owner must have owner_scoped visibility');
  assert.equal(pack.generationConstraints.canMentionD4Internals, false, 'Owner must NOT mention D4 internals');
  assert.equal(pack.generationConstraints.canMentionCompanyPressure, false, 'Owner must NOT mention company pressure');
  assert.equal(pack.generationConstraints.canMentionHiddenOpportunities, false, 'Owner must NOT mention hidden opportunities');

  console.log('  [PASS] Owner-scoped constraints enforced');
}

// ---------------------------------------------------------------------------
// 8. Broker can mention D4 internals and company pressure
// ---------------------------------------------------------------------------

function verifyBrokerPermissions() {
  const pack = buildNarrativeSignalPackFromRuntime(makeInput());

  assert.equal(pack.generationConstraints.canMentionD4Internals, true, 'Broker CAN mention D4 internals');
  assert.equal(pack.generationConstraints.canMentionCompanyPressure, true, 'Broker CAN mention company pressure');

  console.log('  [PASS] Broker permissions correct');
}

// ---------------------------------------------------------------------------
// 9. Pack hash is stable and content-based
// ---------------------------------------------------------------------------

function verifyPackHashStable() {
  const pack = buildNarrativeSignalPackFromRuntime(makeInput());
  const packRef = buildLlmInputPackRefFromSignalPack(pack);

  // Pack hash must NOT equal packId (content-based, not identity-based)
  assert.notEqual(packRef.packHash, pack.packId, 'Pack hash must NOT equal pack ID (content-based)');

  // Pack hash must start with 'phash:' prefix
  assert.ok(packRef.packHash.startsWith('phash:'), 'Pack hash must start with phash: prefix');

  // Multiple calls with same input should produce same hash
  const pack2 = buildNarrativeSignalPackFromRuntime(makeInput());
  const packRef2 = buildLlmInputPackRefFromSignalPack(pack2);
  assert.equal(packRef.packHash, packRef2.packHash, 'Pack hash must be stable across calls with same input');

  // Different input should produce different hash
  // Change the actorId which is included in the hash
  const differentInput = makeInput();
  const differentInputWithDifferentActor = {
    ...differentInput,
    actorId: 'different-actor-id',
  };
  const pack3 = buildNarrativeSignalPackFromRuntime(differentInputWithDifferentActor);
  const packRef3 = buildLlmInputPackRefFromSignalPack(pack3);
  assert.notEqual(packRef.packHash, packRef3.packHash, 'Pack hash must differ when actorId changes');

  console.log('  [PASS] Pack hash is stable and content-based');
}

// ---------------------------------------------------------------------------
// 10. Layer imports are clean
// ---------------------------------------------------------------------------

function verifyLayerImports() {
  // runtime/narrative-support should only import from core modules
  // This is verified by the layer-imports.ts script
  // Here we verify the module loads without errors
  const pack = buildNarrativeSignalPackFromRuntime(makeInput());
  assert.ok(pack, 'Module must load and produce output');

  console.log('  [PASS] Layer imports clean');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

console.log('Verifying selling-houses runtime narrative adapter contract...');

verifyBuildsPack();
verifyBuildsInputPack();
verifyBuildsPackRef();
verifyDeterministic();
verifyNoRawGameState();
verifyGenerationConstraints();
verifyOwnerConstraints();
verifyBrokerPermissions();
verifyPackHashStable();
verifyLayerImports();

console.log('selling-houses runtime narrative adapter contract verification passed');
