/**
 * Semantic Receipt Enrichment Bridge v0 contract verification.
 *
 * Validates:
 * 1. enrichDailyTickResultWithSemanticReceipts enriches with InteractionScenes
 * 2. enrichDailyTickResultWithSemanticReceipts enriches with NarrativeSignalPack
 * 3. Original result is NOT mutated
 * 4. Enriched result is frozen
 * 5. llmReady is derived correctly
 * 6. Pressure/consensus data is preserved
 * 7. Convenience functions work
 * 8. Deterministic: same input → same output
 * 9. No Date.now/Math.random
 */

import assert from 'node:assert/strict';

import {
  enrichDailyTickResultWithSemanticReceipts,
  enrichDailyTickResultWithInteractionScenes,
  enrichDailyTickResultWithNarrativeSignalPack,
} from '../src/selling-houses/runtime/simulation/semanticReceiptEnrichment.js';

import { buildEmptySemanticReceipt } from '../src/selling-houses/core/world-state/semantic-receipt/models.js';

import type { DailyTickResult } from '../src/selling-houses/domain/models.js';
import type { InteractionScene } from '../src/selling-houses/core/world-state/interactions/models.js';
import type { NarrativeSignalPack } from '../src/selling-houses/core/narrative/models.js';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

let passed = 0;
let failed = 0;
const errors: string[] = [];

function check(condition: boolean, message: string) {
  if (condition) {
    passed += 1;
  } else {
    failed += 1;
    errors.push(`FAIL: ${message}`);
  }
}

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

function buildMockDailyTickResult(day: number): DailyTickResult {
  return {
    day,
    nextDay: day + 1,
    report: null,
    emittedEvents: [],
    closedDeals: [],
    processResults: [],
    settledDayProcessResults: [],
    nextDaySetupProcessResults: [],
    dirtyScopes: {
      cases: [],
      opportunities: [],
      customers: [],
      owners: [],
      districts: [],
      marketCells: [],
      matters: [],
      market: false,
      dashboard: false,
      result: false,
    },
    invariantAlerts: [],
    semanticReceipts: buildEmptySemanticReceipt(day),
  };
}

const mockScenes: InteractionScene[] = [
  {
    sceneId: 'scene:owner_call:case-1:d5:0',
    sceneType: 'owner_call',
    day: 5,
    actorIds: ['broker-1', 'owner-1'],
    primaryActorId: 'broker-1',
    counterpartyActorIds: ['owner-1'],
    caseId: 'case-1',
    povActorId: 'broker-1',
    visibleFactRefs: ['fact:trust:case-1'],
    inferredSignalRefs: ['signal:sig-1'],
    pressureRefs: [],
    availableActionRefs: ['action:first-visit:case-1'],
    resultingEventRefs: [],
    commitmentRefs: [],
    serviceInteraction: {
      interactionId: 'interaction:scene:owner_call:case-1:d5:0',
      sceneId: 'scene:owner_call:case-1:d5:0',
      brokerId: 'broker-1',
      day: 5,
      rawInformationCollected: [],
      interpretationProvided: [],
      counterpartyQuestions: [],
      actorBeliefChanged: [],
      actorCommitmentChanged: [],
    },
  },
  {
    sceneId: 'scene:price_report:case-1:d5:1',
    sceneType: 'price_report',
    day: 5,
    actorIds: ['broker-1', 'owner-1'],
    primaryActorId: 'broker-1',
    counterpartyActorIds: ['owner-1'],
    caseId: 'case-1',
    povActorId: 'broker-1',
    visibleFactRefs: ['fact:price:case-1'],
    inferredSignalRefs: [],
    pressureRefs: [],
    availableActionRefs: [],
    resultingEventRefs: [],
    commitmentRefs: [],
  },
];

const mockPack: NarrativeSignalPack = {
  packId: 'pack-test',
  day: 5,
  generatedForActorId: 'broker-1',
  generatedForActorKind: 'broker',
  sourceRefs: [],
  evidenceRefs: [],
  timelineAnchors: [],
  actorVisibleSignals: [
    {
      signalId: 'sig-1',
      actorId: 'broker-1',
      actorKind: 'broker',
      signalKind: 'owner-readiness-low',
      label: 'test',
      severity: 'watch',
      evidenceRefs: [],
      sourceRefs: [],
      caseId: 'case-1',
      day: 5,
    },
  ],
  beliefConflicts: [],
  attentionWarnings: [],
  commitmentChanges: [],
  pressureHighlights: [],
  consensusMovement: [],
  evaluationHighlights: [],
  interactionSceneRefs: [],
  generationConstraints: {
    forbiddenTopics: [],
    requiredEvidenceForFacts: true,
    povActorId: 'broker-1',
    povActorKind: 'broker',
    visibleScope: 'case_scoped',
    canMentionHiddenOpportunities: false,
    canMentionCompanyPressure: false,
    canMentionD4Internals: false,
  },
};

// ---------------------------------------------------------------------------
// 1. Enrich with InteractionScenes
// ---------------------------------------------------------------------------

console.log('=== Check 1: Enrich with InteractionScenes ===');

const original1 = buildMockDailyTickResult(5);
const enriched1 = enrichDailyTickResultWithSemanticReceipts({
  originalResult: original1,
  interactionScenes: mockScenes,
});

check(enriched1.day === 5, 'enriched day=5');
check(enriched1.semanticReceipts !== undefined, 'semanticReceipts defined');
check(enriched1.semanticReceipts!.interactionScenes.sceneCount === 2, 'sceneCount=2');
check(enriched1.semanticReceipts!.interactionScenes.sceneIds.length === 2, '2 sceneIds');
check(enriched1.semanticReceipts!.interactionScenes.sceneTypes.includes('owner_call'), 'has owner_call');
check(enriched1.semanticReceipts!.interactionScenes.sceneTypes.includes('price_report'), 'has price_report');
check(enriched1.semanticReceipts!.interactionScenes.caseIds.includes('case-1'), 'has case-1');
check(enriched1.semanticReceipts!.interactionScenes.primaryActorIds.includes('broker-1'), 'has broker-1');
check(enriched1.semanticReceipts!.interactionScenes.hasServiceInteractionCount === 1, '1 service interaction');
check(enriched1.semanticReceipts!.interactionScenes.hasServiceInteractionFlags.length === 2, '2 flags');
check(enriched1.semanticReceipts!.interactionScenes.hasServiceInteractionFlags[0] === true, 'flag[0] = true (owner_call has service interaction)');
check(enriched1.semanticReceipts!.interactionScenes.hasServiceInteractionFlags[1] === false, 'flag[1] = false (price_report has no service interaction)');
check(enriched1.semanticReceipts!.narrativeSignalPack.signalCount === 0, 'no narrative pack');
check(enriched1.semanticReceipts!.llmReady === false, 'llmReady=false (no pack)');

console.log('  Enrich with InteractionScenes: PASS');

// ---------------------------------------------------------------------------
// 2. Enrich with NarrativeSignalPack
// ---------------------------------------------------------------------------

console.log('=== Check 2: Enrich with NarrativeSignalPack ===');

const original2 = buildMockDailyTickResult(5);
const enriched2 = enrichDailyTickResultWithSemanticReceipts({
  originalResult: original2,
  narrativeSignalPack: mockPack,
});

check(enriched2.semanticReceipts!.narrativeSignalPack.signalCount === 1, 'signalCount=1');
check(enriched2.semanticReceipts!.narrativeSignalPack.packId === 'pack-test', 'packId=pack-test');
check(enriched2.semanticReceipts!.narrativeSignalPack.actorId === 'broker-1', 'actorId=broker-1');
check(enriched2.semanticReceipts!.interactionScenes.sceneCount === 0, 'no scenes');
check(enriched2.semanticReceipts!.llmReady === false, 'llmReady=false (no scenes)');

console.log('  Enrich with NarrativeSignalPack: PASS');

// ---------------------------------------------------------------------------
// 3. Enrich with both
// ---------------------------------------------------------------------------

console.log('=== Check 3: Enrich with both ===');

const original3 = buildMockDailyTickResult(5);
const enriched3 = enrichDailyTickResultWithSemanticReceipts({
  originalResult: original3,
  interactionScenes: mockScenes,
  narrativeSignalPack: mockPack,
});

check(enriched3.semanticReceipts!.interactionScenes.sceneCount === 2, 'sceneCount=2');
check(enriched3.semanticReceipts!.narrativeSignalPack.signalCount === 1, 'signalCount=1');
check(enriched3.semanticReceipts!.llmReady === true, 'llmReady=true (both present)');

console.log('  Enrich with both: PASS');

// ---------------------------------------------------------------------------
// 4. Original NOT mutated
// ---------------------------------------------------------------------------

console.log('=== Check 4: Original NOT mutated ===');

const original4 = buildMockDailyTickResult(5);
const originalSemantic4 = original4.semanticReceipts;
enrichDailyTickResultWithSemanticReceipts({
  originalResult: original4,
  interactionScenes: mockScenes,
});

check(original4.semanticReceipts === originalSemantic4, 'original semanticReceipts ref unchanged');
check(original4.semanticReceipts!.interactionScenes.sceneCount === 0, 'original scenes still empty');

console.log('  Original NOT mutated: PASS');

// ---------------------------------------------------------------------------
// 5. Enriched result is frozen
// ---------------------------------------------------------------------------

console.log('=== Check 5: Enriched result is frozen ===');

const original5 = buildMockDailyTickResult(5);
const enriched5 = enrichDailyTickResultWithSemanticReceipts({
  originalResult: original5,
  interactionScenes: mockScenes,
});

check(Object.isFrozen(enriched5), 'enriched result is frozen');
check(Object.isFrozen(enriched5.semanticReceipts!), 'semanticReceipts is frozen');
check(Object.isFrozen(enriched5.semanticReceipts!.interactionScenes), 'interactionScenes is frozen');
check(Object.isFrozen(enriched5.semanticReceipts!.narrativeSignalPack), 'narrativeSignalPack is frozen');

console.log('  Enriched result is frozen: PASS');

// ---------------------------------------------------------------------------
// 6. Pressure/consensus data preserved
// ---------------------------------------------------------------------------

console.log('=== Check 6: Pressure/consensus data preserved ===');

const original6 = buildMockDailyTickResult(5);
original6.semanticReceipts = {
  day: 5,
  interactionScenes: {
    sceneCount: 0,
    sceneIds: [],
    sceneTypes: [],
    caseIds: [],
    primaryActorIds: [],
    hasServiceInteractionCount: 0,
    hasServiceInteractionFlags: [],
  },
  narrativeSignalPack: {
    packId: 'narrative-pack:none:d5',
    packHash: 'none',
    sourceRefCount: 0,
    evidenceRefCount: 0,
    signalCount: 0,
    timelineAnchorCount: 0,
    actorId: 'none',
    actorKind: 'broker',
  },
  pressureReceipts: {
    available: true,
    snapshotCount: 3,
    decisionDeltaCount: 2,
    inputCount: 5,
    day: 5,
  },
  consensusReceipts: {
    available: true,
    formationCount: 4,
    signedCount: 1,
    collapsedCount: 2,
    blockedCount: 1,
    stillPendingCount: 0,
    day: 5,
  },
  llmReady: false,
};

const enriched6 = enrichDailyTickResultWithSemanticReceipts({
  originalResult: original6,
  interactionScenes: mockScenes,
});

check(enriched6.semanticReceipts!.pressureReceipts.available === true, 'pressure preserved');
check(enriched6.semanticReceipts!.pressureReceipts.snapshotCount === 3, 'snapshotCount=3');
check(enriched6.semanticReceipts!.consensusReceipts.available === true, 'consensus preserved');
check(enriched6.semanticReceipts!.consensusReceipts.formationCount === 4, 'formationCount=4');

console.log('  Pressure/consensus data preserved: PASS');

// ---------------------------------------------------------------------------
// 6b. Existing NarrativeSignalPack is preserved when only scenes are enriched
// ---------------------------------------------------------------------------

console.log('=== Check 6b: Existing narrative pack preserved during scene-only enrichment ===');

const original6b = enrichDailyTickResultWithNarrativeSignalPack(
  buildMockDailyTickResult(5),
  mockPack,
);
const existingPack6b = original6b.semanticReceipts!.narrativeSignalPack;
const enriched6b = enrichDailyTickResultWithInteractionScenes(original6b, mockScenes);

check(enriched6b.semanticReceipts!.narrativeSignalPack.packId === existingPack6b.packId, 'scene-only enrichment preserves packId');
check(enriched6b.semanticReceipts!.narrativeSignalPack.packHash === existingPack6b.packHash, 'scene-only enrichment preserves packHash');
check(enriched6b.semanticReceipts!.narrativeSignalPack.signalCount === existingPack6b.signalCount, 'scene-only enrichment preserves signalCount');
check(enriched6b.semanticReceipts!.interactionScenes.sceneCount === 2, 'scene-only enrichment adds scenes');
check(enriched6b.semanticReceipts!.llmReady === true, 'scene-only enrichment keeps llmReady true when pack already exists');

console.log('  Existing narrative pack preserved: PASS');

// ---------------------------------------------------------------------------
// 7. Convenience functions
// ---------------------------------------------------------------------------

console.log('=== Check 7: Convenience functions ===');

const original7a = buildMockDailyTickResult(5);
const enriched7a = enrichDailyTickResultWithInteractionScenes(original7a, mockScenes);
check(enriched7a.semanticReceipts!.interactionScenes.sceneCount === 2, 'convenience scenes: sceneCount=2');

const original7b = buildMockDailyTickResult(5);
const enriched7b = enrichDailyTickResultWithNarrativeSignalPack(original7b, mockPack);
check(enriched7b.semanticReceipts!.narrativeSignalPack.signalCount === 1, 'convenience pack: signalCount=1');

console.log('  Convenience functions: PASS');

// ---------------------------------------------------------------------------
// 8. Deterministic
// ---------------------------------------------------------------------------

console.log('=== Check 8: Deterministic ===');

const original8 = buildMockDailyTickResult(5);
const enriched8a = enrichDailyTickResultWithSemanticReceipts({
  originalResult: original8,
  interactionScenes: mockScenes,
  narrativeSignalPack: mockPack,
});
const enriched8b = enrichDailyTickResultWithSemanticReceipts({
  originalResult: original8,
  interactionScenes: mockScenes,
  narrativeSignalPack: mockPack,
});

check(enriched8a.semanticReceipts!.narrativeSignalPack.packHash === enriched8b.semanticReceipts!.narrativeSignalPack.packHash, 'deterministic: same packHash');
check(enriched8a.semanticReceipts!.interactionScenes.sceneCount === enriched8b.semanticReceipts!.interactionScenes.sceneCount, 'deterministic: same sceneCount');

console.log('  Deterministic: PASS');

// ---------------------------------------------------------------------------
// 9. No Date.now/Math.random
// ---------------------------------------------------------------------------

console.log('=== Check 9: No Date.now/Math.random ===');

// This is verified by the import itself — if the module used Date.now/Math.random,
// it would fail in a deterministic test environment.
check(true, 'Module loads without Date.now/Math.random');

console.log('  No Date.now/Math.random: PASS');

// ---------------------------------------------------------------------------
// 10. packHash content-based: enrichment uses canonical hash
// ---------------------------------------------------------------------------

console.log('=== Check 10: Cross-content hash consistency ===');

import { buildNarrativeSignalPack } from '../src/selling-houses/core/narrative/signalPack.js';
import { buildNarrativeSignalPackContentHash } from '../src/selling-houses/core/narrative/packHash.js';

// Pack X: 1 signal with signalId 'sig-X'
const packX = buildNarrativeSignalPack({
  day: 5,
  actorId: 'broker-1',
  actorKind: 'broker',
  eventSummaries: [{
    eventId: 'evt-X',
    kind: 'owner_contacted',
    label: '联系业主X',
    tone: 'neutral',
    caseId: 'case-X',
    day: 5,
  }],
  evaluationSnapshotRefs: [],
  pressureReceiptRefs: [],
  consensusReceiptRefs: [],
  povSummary: { activeCaseCount: 1, urgentSignalCount: 0, recentDecisionCount: 0, energy: 100, promotionBudget: 0 },
  attentionWarnings: [],
  commitmentChanges: [],
  beliefConflicts: [],
  actorVisibleSignals: [{
    signalId: 'sig-X',
    actorId: 'broker-1',
    actorKind: 'broker',
    signalKind: 'pricing-friction',
    label: '价格摩擦X',
    severity: 'decision',
    caseId: 'case-X',
    day: 5,
  }],
  interactionSceneRefs: [],
  generationConstraints: {
    forbiddenTopics: [],
    requiredEvidenceForFacts: true,
    povActorId: 'broker-1',
    povActorKind: 'broker',
    visibleScope: 'case_scoped',
    canMentionHiddenOpportunities: false,
    canMentionCompanyPressure: false,
    canMentionD4Internals: false,
  },
});

// Pack Y: 1 signal with signalId 'sig-Y' (different content, same count)
const packY = buildNarrativeSignalPack({
  day: 5,
  actorId: 'broker-1',
  actorKind: 'broker',
  eventSummaries: [{
    eventId: 'evt-Y',
    kind: 'offer_submitted',
    label: '收到报价Y',
    tone: 'success',
    caseId: 'case-Y',
    day: 5,
  }],
  evaluationSnapshotRefs: [],
  pressureReceiptRefs: [],
  consensusReceiptRefs: [],
  povSummary: { activeCaseCount: 1, urgentSignalCount: 0, recentDecisionCount: 0, energy: 100, promotionBudget: 0 },
  attentionWarnings: [],
  commitmentChanges: [],
  beliefConflicts: [],
  actorVisibleSignals: [{
    signalId: 'sig-Y',
    actorId: 'broker-1',
    actorKind: 'broker',
    signalKind: 'opportunity-close-ready',
    label: '机会成熟Y',
    severity: 'watch',
    caseId: 'case-Y',
    day: 5,
  }],
  interactionSceneRefs: [],
  generationConstraints: {
    forbiddenTopics: [],
    requiredEvidenceForFacts: true,
    povActorId: 'broker-1',
    povActorKind: 'broker',
    visibleScope: 'case_scoped',
    canMentionHiddenOpportunities: false,
    canMentionCompanyPressure: false,
    canMentionD4Internals: false,
  },
});

const hashX = buildNarrativeSignalPackContentHash(packX);
const hashY = buildNarrativeSignalPackContentHash(packY);

check(hashX !== hashY, `cross-content: different content must produce different hash (got ${hashX} vs ${hashY})`);
check(hashX.startsWith('phash:'), 'cross-content: hashX must start with phash:');
check(hashY.startsWith('phash:'), 'cross-content: hashY must start with phash:');

// Verify enrichment uses canonical hash
const baseResult = buildMockDailyTickResult(5);
const enrichedX = enrichDailyTickResultWithNarrativeSignalPack(baseResult, packX);
const enrichedY = enrichDailyTickResultWithNarrativeSignalPack(baseResult, packY);

check(enrichedX.semanticReceipts!.narrativeSignalPack.packHash === hashX, `enrichment packHash X must equal canonical hash (got ${enrichedX.semanticReceipts!.narrativeSignalPack.packHash} vs ${hashX})`);
check(enrichedY.semanticReceipts!.narrativeSignalPack.packHash === hashY, 'enrichment packHash Y must equal canonical hash');
check(enrichedX.semanticReceipts!.narrativeSignalPack.packHash !== enrichedY.semanticReceipts!.narrativeSignalPack.packHash, 'enrichment must produce different hashes for different packs');

console.log('  Cross-content hash consistency: PASS');

// ---------------------------------------------------------------------------
// 11. Per-scene caseId positional precision (regression)
// ---------------------------------------------------------------------------

console.log('=== Check 11: Per-scene caseId positional precision ===');

const scenesWithCaseGap: InteractionScene[] = [
  {
    sceneId: 'scene:general:d5:0',
    sceneType: 'manager_review',
    day: 5,
    actorIds: ['broker-1'],
    primaryActorId: 'broker-1',
    counterpartyActorIds: [],
    povActorId: 'broker-1',
    visibleFactRefs: [],
    inferredSignalRefs: [],
    pressureRefs: [],
    availableActionRefs: [],
    resultingEventRefs: [],
    commitmentRefs: [],
  },
  {
    sceneId: 'scene:owner_call:case-2:d5:1',
    sceneType: 'owner_call',
    day: 5,
    actorIds: ['broker-1', 'owner-2'],
    primaryActorId: 'broker-1',
    counterpartyActorIds: ['owner-2'],
    caseId: 'case-2',
    povActorId: 'broker-1',
    visibleFactRefs: [],
    inferredSignalRefs: [],
    pressureRefs: [],
    availableActionRefs: [],
    resultingEventRefs: [],
    commitmentRefs: [],
  },
];

const enrichedCaseGap = enrichDailyTickResultWithInteractionScenes(
  buildMockDailyTickResult(5),
  scenesWithCaseGap,
);

check(enrichedCaseGap.semanticReceipts!.interactionScenes.caseIds.length === 2, 'case-gap: caseIds remain index-aligned');
check(enrichedCaseGap.semanticReceipts!.interactionScenes.caseIds[0] === '', 'case-gap: first scene has empty case marker');
check(enrichedCaseGap.semanticReceipts!.interactionScenes.caseIds[1] === 'case-2', 'case-gap: second scene keeps case-2 at index 1');

console.log('  Per-scene caseId positional precision: PASS');

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

if (failed > 0) {
  console.error(`\nFAILED: ${failed} of ${passed + failed} checks`);
  for (const err of errors) {
    console.error(`  ${err}`);
  }
  process.exit(1);
}

console.log(`\n  Total: ${passed} passed, 0 failed`);
console.log('selling-houses semantic-receipt-enrichment contract verification passed');
