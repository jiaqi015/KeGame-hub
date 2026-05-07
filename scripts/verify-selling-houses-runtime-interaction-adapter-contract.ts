/**
 * Runtime InteractionScene Adapter v0 contract verification.
 *
 * Validates:
 * 1. buildInteractionScenesForCase derives scenes from signals.
 * 2. Each scene has stable sceneId, day, povActorId.
 * 3. Scene types map correctly from signal kinds.
 * 4. BrokerServiceInteraction contains semantic payload only.
 * 5. All refs are string IDs, not embedded objects.
 * 6. Deterministic: same input → same output.
 * 7. No mutation of input data.
 */

import assert from 'node:assert/strict';

import {
  buildInteractionScenesForCase,
  type InteractionSceneCaseInput,
} from '../src/selling-houses/runtime/interaction-support/index.js';

import type {
  InteractionScene,
  InteractionSceneType,
} from '../src/selling-houses/core/world-state/interactions/index.js';

import type {
  DecisionSupportSignal,
  DecisionSupportRecommendationDraft,
} from '../src/selling-houses/runtime/decision-support/types.js';

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

function makeSignal(overrides: Partial<DecisionSupportSignal> = {}): DecisionSupportSignal {
  return {
    id: 'signal-test',
    caseId: 'case-test',
    kind: 'owner-readiness-low',
    severity: 'watch',
    label: '测试信号',
    sourceModelIds: [],
    decisionMomentIds: [],
    actionSpecIds: [],
    ...overrides,
  };
}

function makeDraft(overrides: Partial<DecisionSupportRecommendationDraft> = {}): DecisionSupportRecommendationDraft {
  return {
    id: 'draft-test',
    caseId: 'case-test',
    actionSpecId: 'first-visit',
    legacyActionId: 'first-visit',
    decisionMomentIds: [],
    supportingSignalIds: [],
    priority: 50,
    confidence: 0.7,
    availability: { enabled: true, reason: '' },
    source: 'legacy-game-state-read-model',
    ...overrides,
  };
}

function makeCaseInput(overrides: Partial<InteractionSceneCaseInput> = {}): InteractionSceneCaseInput {
  return {
    caseId: 'case-test',
    title: '测试房源',
    ownerName: '张业主',
    maintainerName: '李经纪',
    status: 'active',
    askPrice: 500,
    marketPrice: 480,
    trust: 65,
    urgency: 50,
    patience: 60,
    competitiveness: 70,
    d1: 55,
    d2: 65,
    d3: 60,
    signals: [],
    recommendationDrafts: [],
    lateStageOpportunityCount: 0,
    day: 5,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// 1. Basic scene derivation from signals
// ---------------------------------------------------------------------------

const ownerSignal = makeSignal({ id: 'sig-owner', kind: 'owner-readiness-low', severity: 'urgent' });
const priceSignal = makeSignal({ id: 'sig-price', kind: 'pricing-friction', severity: 'decision' });

const basicScenes = buildInteractionScenesForCase(
  makeCaseInput({ signals: [ownerSignal, priceSignal] }),
);

check(basicScenes.length === 2, `basic: 2 scenes, got: ${basicScenes.length}`);

const ownerScene = basicScenes.find((s) => s.sceneType === 'owner_call');
const priceScene = basicScenes.find((s) => s.sceneType === 'price_report');

check(ownerScene !== undefined, 'basic: owner_call scene exists');
check(priceScene !== undefined, 'basic: price_report scene exists');

console.log('  Basic scene derivation: PASS');

// ---------------------------------------------------------------------------
// 2. Stable sceneId, day, povActorId
// ---------------------------------------------------------------------------

const scene = basicScenes[0];
check(scene.sceneId.startsWith('scene:'), `sceneId format: ${scene.sceneId}`);
check(scene.day === 5, `day: ${scene.day}`);
check(scene.povActorId === '李经纪', `povActorId: ${scene.povActorId}`);
check(scene.caseId === 'case-test', `caseId: ${scene.caseId}`);

// Determinism: same input → same output
const scenes2 = buildInteractionScenesForCase(
  makeCaseInput({ signals: [ownerSignal, priceSignal] }),
);
check(scenes2[0].sceneId === basicScenes[0].sceneId, 'deterministic: same sceneId');
check(scenes2.length === basicScenes.length, 'deterministic: same count');

console.log('  Stable IDs and determinism: PASS');

// ---------------------------------------------------------------------------
// 3. Scene type mapping from signal kinds
// ---------------------------------------------------------------------------

const signalKindTests: Array<{ kind: DecisionSupportSignal['kind']; expectedType: InteractionSceneType }> = [
  { kind: 'owner-readiness-low', expectedType: 'owner_call' },
  { kind: 'owner-discovery-missing', expectedType: 'owner_call' },
  { kind: 'pricing-friction', expectedType: 'price_report' },
  { kind: 'open-day-fit', expectedType: 'showing' },
  { kind: 'opportunity-close-ready', expectedType: 'offer_negotiation' },
  { kind: 'lead-pipeline-thin', expectedType: 'customer_follow_up' },
  { kind: 'asset-positioning-gap', expectedType: 'price_report' },
];

for (const test of signalKindTests) {
  const scenes = buildInteractionScenesForCase(
    makeCaseInput({ signals: [makeSignal({ kind: test.kind })] }),
  );
  const found = scenes.some((s) => s.sceneType === test.expectedType);
  check(found, `signal kind ${test.kind} → ${test.expectedType}`);
}

console.log('  Scene type mapping: PASS');

// ---------------------------------------------------------------------------
// 4. BrokerServiceInteraction semantic payload
// ---------------------------------------------------------------------------

const ownerSceneWithInteraction = buildInteractionScenesForCase(
  makeCaseInput({ signals: [makeSignal({ kind: 'owner-readiness-low' })] }),
)[0];

check(ownerSceneWithInteraction.serviceInteraction !== undefined, 'service interaction exists');
const si = ownerSceneWithInteraction.serviceInteraction!;
check(si.sceneId === ownerSceneWithInteraction.sceneId, 'si.sceneId matches');
check(si.brokerId === '李经纪', `si.brokerId: ${si.brokerId}`);
check(si.day === 5, `si.day: ${si.day}`);
check(si.rawInformationCollected.length > 0, 'si has information items');
check(si.interpretationProvided.length > 0, 'si has interpretation items');
check(si.counterpartyQuestions.length > 0, 'si has questions');
check(si.actorBeliefChanged.length > 0, 'si has belief changes');
check(si.actorCommitmentChanged.length > 0, 'si has commitment changes');
check(ownerSceneWithInteraction.resultingEventRefs.length === si.actorBeliefChanged.length, 'belief changes are reflected as event refs');
check(ownerSceneWithInteraction.commitmentRefs.length === si.actorCommitmentChanged.length, 'commitment changes are reflected as commitment refs');

// Check that information items are semantic, not results
const info = si.rawInformationCollected[0];
check(info.kind === 'observation', `info.kind: ${info.kind}`);
check(info.source === 'observed', `info.source: ${info.source}`);
check(typeof info.label === 'string', 'info.label is string');

console.log('  BrokerServiceInteraction payload: PASS');

// ---------------------------------------------------------------------------
// 5. All refs are string IDs
// ---------------------------------------------------------------------------

function assertAllRefsAreStrings(scene: InteractionScene) {
  for (const ref of scene.visibleFactRefs) {
    check(typeof ref === 'string', `visibleFactRef is string: ${ref}`);
  }
  for (const ref of scene.inferredSignalRefs) {
    check(typeof ref === 'string', `inferredSignalRef is string: ${ref}`);
  }
  for (const ref of scene.pressureRefs) {
    check(typeof ref === 'string', `pressureRef is string: ${ref}`);
  }
  for (const ref of scene.availableActionRefs) {
    check(typeof ref === 'string', `availableActionRef is string: ${ref}`);
  }
  for (const ref of scene.resultingEventRefs) {
    check(typeof ref === 'string', `resultingEventRef is string: ${ref}`);
  }
  for (const ref of scene.commitmentRefs) {
    check(typeof ref === 'string', `commitmentRef is string: ${ref}`);
  }
  for (const actorId of scene.actorIds) {
    check(typeof actorId === 'string', `actorId is string: ${actorId}`);
  }
  for (const actorId of scene.counterpartyActorIds) {
    check(typeof actorId === 'string', `counterpartyActorId is string: ${actorId}`);
  }
}

for (const scene of basicScenes) {
  assertAllRefsAreStrings(scene);
}

console.log('  All refs are strings: PASS');

// ---------------------------------------------------------------------------
// 6. No mutation of input data
// ---------------------------------------------------------------------------

const inputSignals = [makeSignal({ id: 'sig-mut', kind: 'owner-readiness-low' })];
const inputDrafts = [makeDraft({ id: 'draft-mut' })];
const input = makeCaseInput({ signals: inputSignals, recommendationDrafts: inputDrafts });

const inputSignalsBefore = JSON.stringify(inputSignals);
const inputDraftsBefore = JSON.stringify(inputDrafts);

buildInteractionScenesForCase(input);

check(JSON.stringify(inputSignals) === inputSignalsBefore, 'no mutation: signals unchanged');
check(JSON.stringify(inputDrafts) === inputDraftsBefore, 'no mutation: drafts unchanged');

console.log('  No mutation: PASS');

// ---------------------------------------------------------------------------
// 7. Default scene when no signals
// ---------------------------------------------------------------------------

const noSignalScenes = buildInteractionScenesForCase(makeCaseInput({ signals: [] }));
check(noSignalScenes.length === 1, `no signals: 1 default scene, got: ${noSignalScenes.length}`);
check(noSignalScenes[0].sceneType === 'owner_call', 'no signals: default owner_call');

// With late-stage opportunity → offer_negotiation
const noSignalWithOpp = buildInteractionScenesForCase(
  makeCaseInput({ signals: [], lateStageOpportunityCount: 2 }),
);
check(noSignalWithOpp[0].sceneType === 'offer_negotiation', 'no signals + late stage → offer_negotiation');

console.log('  Default scene derivation: PASS');

// ---------------------------------------------------------------------------
// 8. Scene type filter
// ---------------------------------------------------------------------------

const filteredScenes = buildInteractionScenesForCase(
  makeCaseInput({ signals: [makeSignal({ kind: 'owner-readiness-low' }), makeSignal({ kind: 'pricing-friction' })] }),
  'owner_call',
);
check(filteredScenes.length === 1, `filter: 1 scene, got: ${filteredScenes.length}`);
check(filteredScenes[0].sceneType === 'owner_call', 'filter: owner_call only');

console.log('  Scene type filter: PASS');

// ---------------------------------------------------------------------------
// 9. Expected reaction from trust level
// ---------------------------------------------------------------------------

const highTrustScenes = buildInteractionScenesForCase(
  makeCaseInput({ signals: [makeSignal()], trust: 70 }),
);
check(highTrustScenes[0].expectedCounterpartyReaction?.reactionType === 'accept', 'high trust → accept');

const lowTrustScenes = buildInteractionScenesForCase(
  makeCaseInput({ signals: [makeSignal()], trust: 30 }),
);
check(lowTrustScenes[0].expectedCounterpartyReaction?.reactionType === 'reject', 'low trust → reject');

console.log('  Expected reaction: PASS');

// ---------------------------------------------------------------------------
// 10. Price scene has decision frame
// ---------------------------------------------------------------------------

const priceScenes = buildInteractionScenesForCase(
  makeCaseInput({ signals: [makeSignal({ kind: 'pricing-friction' })] }),
);
const priceSceneWithFrame = priceScenes.find((s) => s.sceneType === 'price_report');
check(priceSceneWithFrame?.serviceInteraction?.decisionFrameCreated !== undefined, 'price scene has decision frame');
check(priceSceneWithFrame?.serviceInteraction?.decisionFrameCreated?.frameType === 'price_anchor', 'frame type is price_anchor');
check((priceSceneWithFrame?.serviceInteraction?.actorBeliefChanged ?? []).some((change) => change.beliefKind === 'price_anchor'), 'price scene changes price_anchor belief');
check((priceSceneWithFrame?.visibleFactRefs ?? []).some((ref) => ref.startsWith('fact:price:')), 'price scene carries price fact ref');

console.log('  Price decision frame: PASS');

// ---------------------------------------------------------------------------
// 11. Offer negotiation produces commitment/event bridge
// ---------------------------------------------------------------------------

const closeReadyScene = buildInteractionScenesForCase(
  makeCaseInput({
    signals: [makeSignal({ id: 'sig-close', kind: 'opportunity-close-ready', severity: 'urgent' })],
    lateStageOpportunityCount: 2,
  }),
).find((s) => s.sceneType === 'offer_negotiation');

check(closeReadyScene !== undefined, 'opportunity-close-ready → offer_negotiation');
check((closeReadyScene?.serviceInteraction?.actorBeliefChanged ?? []).some((change) => change.beliefKind === 'buyer_seriousness'), 'offer negotiation changes buyer_seriousness belief');
check((closeReadyScene?.serviceInteraction?.actorCommitmentChanged ?? []).some((change) => change.commitmentType === 'offer_readiness'), 'offer negotiation changes offer_readiness commitment');
check((closeReadyScene?.resultingEventRefs.length ?? 0) > 0, 'offer negotiation has resulting event refs');
check((closeReadyScene?.commitmentRefs.length ?? 0) > 0, 'offer negotiation has commitment refs');

console.log('  Offer negotiation business bridge: PASS');

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
console.log('selling-houses runtime interaction adapter contract verification passed');
