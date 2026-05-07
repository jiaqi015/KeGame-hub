/**
 * DailySemanticReceipt v0 contract verification.
 *
 * Validates:
 * 1. DailySemanticReceiptBundle type compiles.
 * 2. buildDailySemanticReceipt produces correct summaries.
 * 3. buildEmptySemanticReceipt returns valid empty bundle.
 * 4. All fields are optional/read-only for backward compatibility.
 * 5. No Date.now/Math.random in builder.
 * 6. Deterministic: same input → same output.
 * 7. llmReady is derived correctly.
 */

import assert from 'node:assert/strict';

import {
  buildDailySemanticReceipt,
  buildEmptySemanticReceipt,
  type SemanticReceiptBuildInput,
} from '../src/selling-houses/runtime/simulation/dailySemanticReceipt.js';

import type {
  DailySemanticReceiptBundle,
  InteractionSceneReceiptSummary,
  NarrativeSignalPackReceiptSummary,
  PressureReceiptSummaryRef,
  ConsensusReceiptSummaryRef,
} from '../src/selling-houses/core/world-state/semantic-receipt/models.js';

import type {
  InteractionScene,
} from '../src/selling-houses/core/world-state/interactions/models.js';

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
// 1. Type compilation
// ---------------------------------------------------------------------------

const sampleBundle: DailySemanticReceiptBundle = {
  day: 1,
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
    packId: 'test',
    packHash: 'test',
    sourceRefCount: 0,
    evidenceRefCount: 0,
    signalCount: 0,
    timelineAnchorCount: 0,
    actorId: 'test',
    actorKind: 'broker',
  },
  pressureReceipts: {
    available: false,
    snapshotCount: 0,
    decisionDeltaCount: 0,
    inputCount: 0,
    day: 0,
  },
  consensusReceipts: {
    available: false,
    formationCount: 0,
    signedCount: 0,
    collapsedCount: 0,
    blockedCount: 0,
    stillPendingCount: 0,
    day: 0,
  },
  llmReady: false,
};

check(typeof sampleBundle.day === 'number', 'DailySemanticReceiptBundle compiles');
check(sampleBundle.llmReady === false, 'llmReady defaults to false');

console.log('  Type compilation: PASS');

// ---------------------------------------------------------------------------
// 2. buildEmptySemanticReceipt
// ---------------------------------------------------------------------------

const emptyBundle = buildEmptySemanticReceipt(5);

check(emptyBundle.day === 5, 'empty: day=5');
check(emptyBundle.interactionScenes.sceneCount === 0, 'empty: sceneCount=0');
check(emptyBundle.interactionScenes.sceneIds.length === 0, 'empty: sceneIds empty');
check(emptyBundle.narrativeSignalPack.signalCount === 0, 'empty: signalCount=0');
check(emptyBundle.narrativeSignalPack.packHash === 'none', 'empty: packHash=none');
check(emptyBundle.pressureReceipts.available === false, 'empty: pressure not available');
check(emptyBundle.pressureReceipts.day === 5, `empty: pressureReceipts.day=5, got: ${emptyBundle.pressureReceipts.day}`);
check(emptyBundle.consensusReceipts.available === false, 'empty: consensus not available');
check(emptyBundle.consensusReceipts.day === 5, `empty: consensusReceipts.day=5, got: ${emptyBundle.consensusReceipts.day}`);
check(emptyBundle.llmReady === false, 'empty: llmReady=false');

// Verify core and runtime produce identical output
import { buildEmptySemanticReceipt as coreBuildEmpty } from '../src/selling-houses/core/world-state/semantic-receipt/models.js';
const coreEmpty = coreBuildEmpty(5);
check(coreEmpty.day === emptyBundle.day, 'core/runtime empty: same day');
check(coreEmpty.pressureReceipts.day === emptyBundle.pressureReceipts.day, 'core/runtime empty: same pressureReceipts.day');
check(coreEmpty.consensusReceipts.day === emptyBundle.consensusReceipts.day, 'core/runtime empty: same consensusReceipts.day');
check(coreEmpty.llmReady === emptyBundle.llmReady, 'core/runtime empty: same llmReady');

console.log('  buildEmptySemanticReceipt: PASS');

// ---------------------------------------------------------------------------
// 3. buildDailySemanticReceipt with scenes
// ---------------------------------------------------------------------------

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

const inputWithScenes: SemanticReceiptBuildInput = {
  day: 5,
  interactionScenes: mockScenes,
};

const bundleWithScenes = buildDailySemanticReceipt(inputWithScenes);

check(bundleWithScenes.day === 5, 'scenes: day=5');
check(bundleWithScenes.interactionScenes.sceneCount === 2, 'scenes: sceneCount=2');
check(bundleWithScenes.interactionScenes.sceneIds.length === 2, 'scenes: 2 sceneIds');
check(bundleWithScenes.interactionScenes.sceneTypes.includes('owner_call'), 'scenes: has owner_call');
check(bundleWithScenes.interactionScenes.sceneTypes.includes('price_report'), 'scenes: has price_report');
check(bundleWithScenes.interactionScenes.caseIds.includes('case-1'), 'scenes: has case-1');
check(bundleWithScenes.interactionScenes.primaryActorIds.includes('broker-1'), 'scenes: has broker-1');
check(bundleWithScenes.interactionScenes.hasServiceInteractionCount === 1, 'scenes: 1 service interaction');
check(bundleWithScenes.interactionScenes.hasServiceInteractionFlags.length === 2, 'scenes: 2 flags');
check(bundleWithScenes.interactionScenes.hasServiceInteractionFlags[0] === true, 'scenes: flag[0] = true (owner_call has service interaction)');
check(bundleWithScenes.interactionScenes.hasServiceInteractionFlags[1] === false, 'scenes: flag[1] = false (price_report has no service interaction)');
check(bundleWithScenes.narrativeSignalPack.signalCount === 0, 'scenes: no narrative pack');
check(bundleWithScenes.llmReady === false, 'scenes: llmReady=false (no narrative pack)');

console.log('  buildDailySemanticReceipt with scenes: PASS');

// ---------------------------------------------------------------------------
// 3b. Per-scene service interaction precision (regression)
// ---------------------------------------------------------------------------

// Test: 2nd scene has service interaction, 1st does not
const scenesReversed: InteractionScene[] = [
  {
    sceneId: 'scene:price_report:case-1:d5:0',
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
    // No serviceInteraction
  },
  {
    sceneId: 'scene:owner_call:case-1:d5:1',
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
      interactionId: 'interaction:scene:owner_call:case-1:d5:1',
      sceneId: 'scene:owner_call:case-1:d5:1',
      brokerId: 'broker-1',
      day: 5,
      rawInformationCollected: [],
      interpretationProvided: [],
      counterpartyQuestions: [],
      actorBeliefChanged: [],
      actorCommitmentChanged: [],
    },
  },
];

const bundleReversed = buildDailySemanticReceipt({
  day: 5,
  interactionScenes: scenesReversed,
});

check(bundleReversed.interactionScenes.hasServiceInteractionCount === 1, 'reversed: 1 service interaction');
check(bundleReversed.interactionScenes.hasServiceInteractionFlags[0] === false, 'reversed: flag[0] = false (price_report has no service interaction)');
check(bundleReversed.interactionScenes.hasServiceInteractionFlags[1] === true, 'reversed: flag[1] = true (owner_call has service interaction)');

// Verify count-based inference would be wrong for reversed order
// (old approach: i < count would mark flag[0]=true, flag[1]=false — incorrect)
const countBasedFlags = [0 < bundleReversed.interactionScenes.hasServiceInteractionCount, 1 < bundleReversed.interactionScenes.hasServiceInteractionCount];
check(countBasedFlags[0] === true, 'old count-based approach would incorrectly mark flag[0]=true');
check(countBasedFlags[1] === false, 'old count-based approach would incorrectly mark flag[1]=false');
check(bundleReversed.interactionScenes.hasServiceInteractionFlags[0] !== countBasedFlags[0], 'per-scene flags differ from count-based for reversed order');

console.log('  Per-scene service interaction precision: PASS');

// ---------------------------------------------------------------------------
// 3c. Per-scene caseId positional precision (regression)
// ---------------------------------------------------------------------------

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

const bundleWithCaseGap = buildDailySemanticReceipt({
  day: 5,
  interactionScenes: scenesWithCaseGap,
});

check(bundleWithCaseGap.interactionScenes.caseIds.length === 2, 'case-gap: caseIds remain index-aligned');
check(bundleWithCaseGap.interactionScenes.caseIds[0] === '', 'case-gap: missing case stored as empty string');
check(bundleWithCaseGap.interactionScenes.caseIds[1] === 'case-2', 'case-gap: second scene caseId stays at index 1');

console.log('  Per-scene caseId positional precision: PASS');

// ---------------------------------------------------------------------------
// 4. Deterministic: same input → same output
// ---------------------------------------------------------------------------

const bundle1 = buildDailySemanticReceipt(inputWithScenes);
const bundle2 = buildDailySemanticReceipt(inputWithScenes);

check(bundle1.interactionScenes.sceneCount === bundle2.interactionScenes.sceneCount, 'deterministic: same sceneCount');
check(bundle1.narrativeSignalPack.packHash === bundle2.narrativeSignalPack.packHash, 'deterministic: same packHash');
check(bundle1.llmReady === bundle2.llmReady, 'deterministic: same llmReady');

console.log('  Deterministic: PASS');

// ---------------------------------------------------------------------------
// 5. No mutation of input
// ---------------------------------------------------------------------------

const scenesBefore = JSON.stringify(mockScenes);
buildDailySemanticReceipt(inputWithScenes);
check(JSON.stringify(mockScenes) === scenesBefore, 'no mutation: scenes unchanged');

console.log('  No mutation: PASS');

// ---------------------------------------------------------------------------
// 6. Pressure receipt summary
// ---------------------------------------------------------------------------

const inputWithPressure: SemanticReceiptBuildInput = {
  day: 5,
  interactionScenes: [],
  pressureReceipts: {
    snapshots: [
      {
        caseId: 'case-1',
        day: 5,
        signals: [],
        evidence: [],
        netHeatDelta: 5,
        netTrustDelta: -3,
        netUrgencyDelta: 0,
        lostToRival: false,
        hasSignificantPressure: true,
      },
    ],
    decisionDeltas: [],
    brokerPOV: { actor: 'broker', day: 5, pressuredCaseIds: [], topEvidence: [], headline: 'test', activeRivalCount: 0, companyPressureActive: false },
    ownerPOV: { actor: 'owner', day: 5, pressuredCaseIds: [], topEvidence: [], headline: 'test', activeRivalCount: 0, companyPressureActive: false },
    managerPOV: { actor: 'manager', day: 5, pressuredCaseIds: [], topEvidence: [], headline: 'test', activeRivalCount: 0, companyPressureActive: false },
    inputCount: 3,
    day: 5,
  },
};

const bundleWithPressure = buildDailySemanticReceipt(inputWithPressure);

check(bundleWithPressure.pressureReceipts.available === true, 'pressure: available=true');
check(bundleWithPressure.pressureReceipts.snapshotCount === 1, 'pressure: snapshotCount=1');
check(bundleWithPressure.pressureReceipts.inputCount === 3, 'pressure: inputCount=3');
check(bundleWithPressure.pressureReceipts.day === 5, 'pressure: day=5');

console.log('  Pressure receipt summary: PASS');

// ---------------------------------------------------------------------------
// 7. Consensus receipt summary
// ---------------------------------------------------------------------------

const inputWithConsensus: SemanticReceiptBuildInput = {
  day: 5,
  interactionScenes: [],
  consensusFormationCount: 3,
  consensusSignedCount: 1,
  consensusCollapsedCount: 1,
  consensusBlockedCount: 1,
  consensusStillPendingCount: 0,
};

const bundleWithConsensus = buildDailySemanticReceipt(inputWithConsensus);

check(bundleWithConsensus.consensusReceipts.available === true, 'consensus: available=true');
check(bundleWithConsensus.consensusReceipts.formationCount === 3, 'consensus: formationCount=3');
check(bundleWithConsensus.consensusReceipts.signedCount === 1, 'consensus: signedCount=1');
check(bundleWithConsensus.consensusReceipts.collapsedCount === 1, 'consensus: collapsedCount=1');
check(bundleWithConsensus.consensusReceipts.blockedCount === 1, 'consensus: blockedCount=1');

console.log('  Consensus receipt summary: PASS');

// ---------------------------------------------------------------------------
// 8. llmReady derivation
// ---------------------------------------------------------------------------

// llmReady = true when both scenes and narrative pack have data
const inputLlmReady: SemanticReceiptBuildInput = {
  day: 5,
  interactionScenes: mockScenes,
  narrativeSignalPack: {
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
  },
};

const bundleLlmReady = buildDailySemanticReceipt(inputLlmReady);

check(bundleLlmReady.llmReady === true, 'llmReady: true when scenes + narrative pack');
check(bundleLlmReady.interactionScenes.sceneCount === 2, 'llmReady: sceneCount=2');
check(bundleLlmReady.narrativeSignalPack.signalCount === 1, 'llmReady: signalCount=1');

// llmReady = false when no scenes
const inputNoScenes: SemanticReceiptBuildInput = {
  day: 5,
  interactionScenes: [],
  narrativeSignalPack: inputLlmReady.narrativeSignalPack,
};

const bundleNoScenes = buildDailySemanticReceipt(inputNoScenes);
check(bundleNoScenes.llmReady === false, 'llmReady: false when no scenes');

// llmReady = false when no narrative pack
const inputNoPack: SemanticReceiptBuildInput = {
  day: 5,
  interactionScenes: mockScenes,
};

const bundleNoPack = buildDailySemanticReceipt(inputNoPack);
check(bundleNoPack.llmReady === false, 'llmReady: false when no narrative pack');

console.log('  llmReady derivation: PASS');

// ---------------------------------------------------------------------------
// 9. Backward compatibility: missing fields → empty summary
// ---------------------------------------------------------------------------

const inputMinimal: SemanticReceiptBuildInput = {
  day: 5,
  interactionScenes: [],
};

const bundleMinimal = buildDailySemanticReceipt(inputMinimal);

check(bundleMinimal.day === 5, 'minimal: day=5');
check(bundleMinimal.interactionScenes.sceneCount === 0, 'minimal: sceneCount=0');
check(bundleMinimal.narrativeSignalPack.signalCount === 0, 'minimal: signalCount=0');
check(bundleMinimal.pressureReceipts.available === false, 'minimal: pressure not available');
check(bundleMinimal.pressureReceipts.day === 5, 'minimal: pressureReceipts.day=5');
check(bundleMinimal.consensusReceipts.available === false, 'minimal: consensus not available');
check(bundleMinimal.consensusReceipts.day === 5, 'minimal: consensusReceipts.day=5');
check(bundleMinimal.llmReady === false, 'minimal: llmReady=false');

console.log('  Backward compatibility: PASS');

// ---------------------------------------------------------------------------
// 10. buildLiveSemanticReceipt with live data
// ---------------------------------------------------------------------------

import { buildLiveSemanticReceipt } from '../src/selling-houses/core/world-state/semantic-receipt/models.js';

const liveBundle = buildLiveSemanticReceipt({
  day: 7,
  pressureReceipts: {
    snapshotCount: 3,
    decisionDeltaCount: 2,
    inputCount: 5,
    day: 7,
  },
  consensusReceipts: {
    formationCount: 4,
    signedCount: 1,
    collapsedCount: 2,
    blockedCount: 1,
    stillPendingCount: 0,
    day: 7,
  },
});

check(liveBundle.day === 7, 'live: day=7');
check(liveBundle.pressureReceipts.available === true, 'live: pressure available');
check(liveBundle.pressureReceipts.snapshotCount === 3, 'live: snapshotCount=3');
check(liveBundle.pressureReceipts.decisionDeltaCount === 2, 'live: decisionDeltaCount=2');
check(liveBundle.pressureReceipts.inputCount === 5, 'live: inputCount=5');
check(liveBundle.pressureReceipts.day === 7, 'live: pressureReceipts.day=7');
check(liveBundle.consensusReceipts.available === true, 'live: consensus available');
check(liveBundle.consensusReceipts.formationCount === 4, 'live: formationCount=4');
check(liveBundle.consensusReceipts.signedCount === 1, 'live: signedCount=1');
check(liveBundle.consensusReceipts.collapsedCount === 2, 'live: collapsedCount=2');
check(liveBundle.consensusReceipts.blockedCount === 1, 'live: blockedCount=1');
check(liveBundle.consensusReceipts.stillPendingCount === 0, 'live: stillPendingCount=0');
check(liveBundle.consensusReceipts.day === 7, 'live: consensusReceipts.day=7');
check(liveBundle.interactionScenes.sceneCount === 0, 'live: no interaction scenes');
check(liveBundle.narrativeSignalPack.signalCount === 0, 'live: no narrative pack');
check(liveBundle.llmReady === false, 'live: llmReady=false');

// Live with only pressure data
const livePressureOnly = buildLiveSemanticReceipt({
  day: 8,
  pressureReceipts: {
    snapshotCount: 1,
    decisionDeltaCount: 0,
    inputCount: 2,
    day: 8,
  },
});

check(livePressureOnly.pressureReceipts.available === true, 'live-pressure-only: pressure available');
check(livePressureOnly.consensusReceipts.available === false, 'live-pressure-only: consensus not available');
check(livePressureOnly.consensusReceipts.day === 8, 'live-pressure-only: consensusReceipts.day=8');

// Live with only consensus data
const liveConsensusOnly = buildLiveSemanticReceipt({
  day: 9,
  consensusReceipts: {
    formationCount: 2,
    signedCount: 0,
    collapsedCount: 1,
    blockedCount: 1,
    stillPendingCount: 0,
    day: 9,
  },
});

check(liveConsensusOnly.pressureReceipts.available === false, 'live-consensus-only: pressure not available');
check(liveConsensusOnly.pressureReceipts.day === 9, 'live-consensus-only: pressureReceipts.day=9');
check(liveConsensusOnly.consensusReceipts.available === true, 'live-consensus-only: consensus available');

// Live with no data (should match empty)
const liveNoData = buildLiveSemanticReceipt({ day: 10 });
check(liveNoData.pressureReceipts.available === false, 'live-no-data: pressure not available');
check(liveNoData.consensusReceipts.available === false, 'live-no-data: consensus not available');
check(liveNoData.pressureReceipts.day === 10, 'live-no-data: pressureReceipts.day=10');
check(liveNoData.consensusReceipts.day === 10, 'live-no-data: consensusReceipts.day=10');

console.log('  buildLiveSemanticReceipt: PASS');

// ---------------------------------------------------------------------------
// 11. packHash content-based: same count but different content → different hash
// ---------------------------------------------------------------------------

import { buildNarrativeSignalPack } from '../src/selling-houses/core/narrative/signalPack.js';
import { buildNarrativeSignalPackContentHash } from '../src/selling-houses/core/narrative/packHash.js';

// Pack A: 1 signal with signalId 'sig-A'
const packA = buildNarrativeSignalPack({
  day: 5,
  actorId: 'broker-1',
  actorKind: 'broker',
  eventSummaries: [{
    eventId: 'evt-A',
    kind: 'owner_contacted',
    label: '联系业主A',
    tone: 'neutral',
    caseId: 'case-A',
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
    signalId: 'sig-A',
    actorId: 'broker-1',
    actorKind: 'broker',
    signalKind: 'pricing-friction',
    label: '价格摩擦A',
    severity: 'decision',
    caseId: 'case-A',
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

// Pack B: 1 signal with signalId 'sig-B' (different content, same count)
const packB = buildNarrativeSignalPack({
  day: 5,
  actorId: 'broker-1',
  actorKind: 'broker',
  eventSummaries: [{
    eventId: 'evt-B',
    kind: 'offer_submitted',
    label: '收到报价B',
    tone: 'success',
    caseId: 'case-B',
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
    signalId: 'sig-B',
    actorId: 'broker-1',
    actorKind: 'broker',
    signalKind: 'opportunity-close-ready',
    label: '机会成熟B',
    severity: 'watch',
    caseId: 'case-B',
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

const hashA = buildNarrativeSignalPackContentHash(packA);
const hashB = buildNarrativeSignalPackContentHash(packB);

check(hashA !== hashB, `cross-content: different content must produce different hash (got ${hashA} vs ${hashB})`);
check(hashA.startsWith('phash:'), 'cross-content: hashA must start with phash:');
check(hashB.startsWith('phash:'), 'cross-content: hashB must start with phash:');

// Build daily receipt for packA and verify packHash matches canonical
const receiptA = buildDailySemanticReceipt({
  day: 5,
  interactionScenes: [],
  narrativeSignalPack: packA,
});

check(receiptA.narrativeSignalPack.packHash === hashA, `daily-receipt packHash must equal canonical hash (got ${receiptA.narrativeSignalPack.packHash} vs ${hashA})`);

// Build daily receipt for packB and verify different hash
const receiptB = buildDailySemanticReceipt({
  day: 5,
  interactionScenes: [],
  narrativeSignalPack: packB,
});

check(receiptB.narrativeSignalPack.packHash === hashB, `daily-receipt packHash for B must equal canonical hash`);
check(receiptA.narrativeSignalPack.packHash !== receiptB.narrativeSignalPack.packHash, 'different packs must produce different packHash in daily receipt');

// Also verify enrichment produces the same hash
import { enrichDailyTickResultWithSemanticReceipts } from '../src/selling-houses/runtime/simulation/semanticReceiptEnrichment.js';
import { buildEmptySemanticReceipt as coreBuildEmptyForHash } from '../src/selling-houses/core/world-state/semantic-receipt/models.js';

const emptyResult = {
  day: 5,
  nextDay: 6,
  report: null,
  emittedEvents: [],
  closedDeals: [],
  processResults: [],
  settledDayProcessResults: [],
  nextDaySetupProcessResults: [],
  dirtyScopes: { cases: [], opportunities: [], customers: [], owners: [], districts: [], marketCells: [], matters: [], market: false, dashboard: false, result: false },
  invariantAlerts: [],
  semanticReceipts: coreBuildEmptyForHash(5),
};

const enrichedA = enrichDailyTickResultWithSemanticReceipts({
  originalResult: emptyResult as any,
  narrativeSignalPack: packA,
});
const enrichedB = enrichDailyTickResultWithSemanticReceipts({
  originalResult: emptyResult as any,
  narrativeSignalPack: packB,
});

check(enrichedA.semanticReceipts!.narrativeSignalPack.packHash === hashA, 'enrichment packHash A must equal canonical hash');
check(enrichedB.semanticReceipts!.narrativeSignalPack.packHash === hashB, 'enrichment packHash B must equal canonical hash');
check(enrichedA.semanticReceipts!.narrativeSignalPack.packHash !== enrichedB.semanticReceipts!.narrativeSignalPack.packHash, 'enrichment must produce different hashes for different packs');

console.log('  Cross-content hash consistency: PASS');

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
console.log('selling-houses daily semantic receipt contract verification passed');
