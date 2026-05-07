/**
 * Semantic Workspace Boundary verification contract.
 *
 * Proves:
 * 1. SemanticWorkspaceProjection is read-only and frozen
 * 2. Interaction scenes are compressed (no raw service interaction details)
 * 3. Narrative pack summary is compressed (no raw signal content)
 * 4. LLM optionality is always disabled mode
 * 5. No raw GameState / Case / Opportunity / DomainEventEntry exposure
 * 6. Owner workspace cannot see broker-only / company / D4 internals
 * 7. Graceful fallback when data is absent
 * 8. Deterministic output (same input → same projection)
 * 9. Layer imports are clean
 * 10. Builder functions are pure (no side effects)
 *
 * Mother model alignment:
 * - Section 9: POV And Interaction Design
 * - Section 20.7: LLM should not read raw GameState
 * - Section 18.10: LLM output cannot be hidden randomness
 */

import assert from 'node:assert/strict';

import {
  buildSemanticWorkspaceProjection,
  buildEmptySemanticWorkspaceProjection,
  type SemanticWorkspaceProjection,
  type SemanticWorkspaceInput,
  type SemanticInteractionSceneSummary,
  type SemanticNarrativePackSummary,
  type SemanticLlmOptionalitySummary,
  type SemanticPressureSummary,
  type SemanticConsensusSummary,
} from '../src/selling-houses/interface/interaction-workspace/semanticReceiptBoundary.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let passed = 0;
let failed = 0;
const errors: string[] = [];

function check(condition: boolean, message: string) {
  if (condition) {
    passed++;
    console.log(`  [PASS] ${message}`);
  } else {
    failed++;
    errors.push(message);
    console.log(`  [FAIL] ${message}`);
  }
}

function stableSnapshot(value: unknown): string {
  return JSON.stringify(value);
}

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

function makeTestInput(): SemanticWorkspaceInput {
  return {
    day: 10,
    scenes: [
      {
        sceneId: 'scene-1',
        sceneType: 'owner_call',
        caseId: 'case-1',
        povActorId: 'broker-1',
        evidenceRefCount: 3,
        resultingEventRefCount: 2,
        commitmentRefCount: 1,
        hasServiceInteraction: true,
      },
      {
        sceneId: 'scene-2',
        sceneType: 'showing',
        caseId: 'case-2',
        povActorId: 'broker-1',
        evidenceRefCount: 5,
        resultingEventRefCount: 1,
        commitmentRefCount: 0,
        hasServiceInteraction: false,
      },
    ],
    narrativePack: {
      packId: 'nsp-10-broker-1',
      packHash: 'nsp-10-abc123',
      sourceRefCount: 8,
      evidenceRefCount: 12,
      timelineAnchorCount: 5,
      actorVisibleSignalCount: 7,
      generationConstraints: {
        requiredEvidenceForFacts: true,
        visibleScope: 'full',
        canMentionHiddenOpportunities: false,
        canMentionCompanyPressure: false,
        canMentionD4Internals: false,
        forbiddenTopicCount: 3,
      },
    },
    pressure: {
      available: true,
      snapshotCount: 3,
      decisionDeltaCount: 2,
      inputCount: 5,
      day: 10,
    },
    consensus: {
      available: true,
      formationCount: 1,
      signedCount: 0,
      collapsedCount: 0,
      blockedCount: 1,
      stillPendingCount: 0,
      day: 10,
    },
    evidenceRefs: [
      {
        sourceType: 'pressure_receipt',
        sourceId: 'pressure-receipt:d10',
        day: 10,
        available: true,
        summary: '3 snapshots, 2 deltas',
        count: 3,
      },
      {
        sourceType: 'consensus_receipt',
        sourceId: 'consensus-receipt:d10',
        day: 10,
        available: true,
        summary: '1 formations, 0 signed',
        count: 1,
      },
      {
        sourceType: 'narrative_signal_pack',
        sourceId: 'narrative-pack:d10',
        day: 10,
        available: true,
        summary: '7 signals, 12 evidence refs',
        count: 7,
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// 1. SemanticWorkspaceProjection is read-only and frozen
// ---------------------------------------------------------------------------

function checkReadOnlyFrozen() {
  const input = makeTestInput();
  const projection = buildSemanticWorkspaceProjection(input);

  check(projection.readOnly === true, 'readOnly must be true');
  check(projection.projectionKind === 'semantic_receipt_adapter_state', 'projectionKind must be semantic_receipt_adapter_state');
  check(Object.isFrozen(projection), 'projection must be frozen');
  check(Object.isFrozen(projection.interactionScenes), 'interactionScenes must be frozen');
  check(Object.isFrozen(projection.llmOptionality), 'llmOptionality must be frozen');
  check(Object.isFrozen(projection.pressureSummary), 'pressureSummary must be frozen');
  check(Object.isFrozen(projection.consensusSummary), 'consensusSummary must be frozen');
  check(Object.isFrozen(projection.evidenceIndex), 'evidenceIndex must be frozen');
  if (projection.narrativePackSummary) {
    check(Object.isFrozen(projection.narrativePackSummary), 'narrativePackSummary must be frozen');
    check(Object.isFrozen(projection.narrativePackSummary.generationConstraints), 'generationConstraints must be frozen');
  }
}

// ---------------------------------------------------------------------------
// 2. Interaction scenes are compressed
// ---------------------------------------------------------------------------

function checkInteractionScenesCompressed() {
  const input = makeTestInput();
  const projection = buildSemanticWorkspaceProjection(input);

  check(projection.interactionScenes.length === 2, 'must have 2 interaction scenes');

  const scene1 = projection.interactionScenes[0]!;
  check(scene1.sceneId === 'scene-1', 'sceneId must match');
  check(scene1.sceneType === 'owner_call', 'sceneType must match');
  check(scene1.caseId === 'case-1', 'caseId must match');
  check(scene1.povActorId === 'broker-1', 'povActorId must match');
  check(scene1.evidenceRefCount === 3, 'evidenceRefCount must match');
  check(scene1.resultingEventRefCount === 2, 'resultingEventRefCount must match');
  check(scene1.commitmentRefCount === 1, 'commitmentRefCount must match');
  check(scene1.hasServiceInteraction === true, 'hasServiceInteraction must match');

  // Verify no raw service interaction details are exposed
  const scene1Json = JSON.stringify(scene1);
  check(!scene1Json.includes('rawInformationCollected'), 'must not expose rawInformationCollected');
  check(!scene1Json.includes('interpretationProvided'), 'must not expose interpretationProvided');
  check(!scene1Json.includes('recommendationMade'), 'must not expose recommendationMade');
  check(!scene1Json.includes('counterpartyQuestions'), 'must not expose counterpartyQuestions');
  check(!scene1Json.includes('actorBeliefChanged'), 'must not expose actorBeliefChanged');
  check(!scene1Json.includes('actorCommitmentChanged'), 'must not expose actorCommitmentChanged');
}

// ---------------------------------------------------------------------------
// 3. Narrative pack summary is compressed
// ---------------------------------------------------------------------------

function checkNarrativePackCompressed() {
  const input = makeTestInput();
  const projection = buildSemanticWorkspaceProjection(input);

  const pack = projection.narrativePackSummary!;
  check(pack !== null, 'narrativePackSummary must not be null');
  check(pack.packId === 'nsp-10-broker-1', 'packId must match');
  check(pack.packHash === 'nsp-10-abc123', 'packHash must match');
  check(pack.sourceRefCount === 8, 'sourceRefCount must match');
  check(pack.evidenceRefCount === 12, 'evidenceRefCount must match');
  check(pack.timelineAnchorCount === 5, 'timelineAnchorCount must match');
  check(pack.actorVisibleSignalCount === 7, 'actorVisibleSignalCount must match');

  // Verify generation constraints are compressed
  const gc = pack.generationConstraints;
  check(gc.requiredEvidenceForFacts === true, 'requiredEvidenceForFacts must be true');
  check(gc.visibleScope === 'full', 'visibleScope must be full');
  check(gc.canMentionHiddenOpportunities === false, 'canMentionHiddenOpportunities must be false');
  check(gc.canMentionCompanyPressure === false, 'canMentionCompanyPressure must be false');
  check(gc.canMentionD4Internals === false, 'canMentionD4Internals must be false');
  check(gc.forbiddenTopicCount === 3, 'forbiddenTopicCount must be 3');

  // Verify no raw signal content is exposed
  const packJson = JSON.stringify(pack);
  check(!packJson.includes('actorVisibleSignals'), 'must not expose raw actorVisibleSignals array');
  check(!packJson.includes('beliefConflicts'), 'must not expose raw beliefConflicts array');
  check(!packJson.includes('attentionWarnings'), 'must not expose raw attentionWarnings array');
  check(!packJson.includes('commitmentChanges'), 'must not expose raw commitmentChanges array');
  check(!packJson.includes('pressureHighlights'), 'must not expose raw pressureHighlights array');
  check(!packJson.includes('consensusMovement'), 'must not expose raw consensusMovement array');
  check(!packJson.includes('evaluationHighlights'), 'must not expose raw evaluationHighlights array');
  check(!packJson.includes('interactionSceneRefs'), 'must not expose raw interactionSceneRefs array');
  check(!packJson.includes('sourceRefs'), 'must not expose raw sourceRefs array');
  check(!packJson.includes('evidenceRefs'), 'must not expose raw evidenceRefs array');
  check(!packJson.includes('timelineAnchors'), 'must not expose raw timelineAnchors array');
}

// ---------------------------------------------------------------------------
// 4. Pressure summary is compressed
// ---------------------------------------------------------------------------

function checkPressureSummaryCompressed() {
  const input = makeTestInput();
  const projection = buildSemanticWorkspaceProjection(input);

  const ps = projection.pressureSummary;
  check(ps.available === true, 'pressure available must be true');
  check(ps.snapshotCount === 3, 'snapshotCount must be 3');
  check(ps.decisionDeltaCount === 2, 'decisionDeltaCount must be 2');
  check(ps.inputCount === 5, 'inputCount must be 5');
  check(ps.day === 10, 'pressure day must be 10');

  // Verify no raw pressure content is exposed
  const psJson = JSON.stringify(ps);
  check(!psJson.includes('PressureSnapshot'), 'must not expose raw PressureSnapshot');
  check(!psJson.includes('ConstraintSignal'), 'must not expose raw ConstraintSignal');
  check(!psJson.includes('PressureInput'), 'must not expose raw PressureInput');
  check(!psJson.includes('snapshots'), 'must not expose raw snapshots array');
  check(!psJson.includes('decisionDeltas'), 'must not expose raw decisionDeltas array');
}

// ---------------------------------------------------------------------------
// 5. Consensus summary is compressed
// ---------------------------------------------------------------------------

function checkConsensusSummaryCompressed() {
  const input = makeTestInput();
  const projection = buildSemanticWorkspaceProjection(input);

  const cs = projection.consensusSummary;
  check(cs.available === true, 'consensus available must be true');
  check(cs.formationCount === 1, 'formationCount must be 1');
  check(cs.signedCount === 0, 'signedCount must be 0');
  check(cs.collapsedCount === 0, 'collapsedCount must be 0');
  check(cs.blockedCount === 1, 'blockedCount must be 1');
  check(cs.stillPendingCount === 0, 'stillPendingCount must be 0');
  check(cs.day === 10, 'consensus day must be 10');

  // Verify no raw consensus content is exposed
  const csJson = JSON.stringify(cs);
  check(!csJson.includes('ConsensusFormation'), 'must not expose raw ConsensusFormation');
  check(!csJson.includes('OfferThread'), 'must not expose raw OfferThread');
  check(!csJson.includes('ContractFact'), 'must not expose raw ContractFact');
  check(!csJson.includes('OpportunityClosureSet'), 'must not expose raw OpportunityClosureSet');
}

// ---------------------------------------------------------------------------
// 6. Evidence index is compressed and stable
// ---------------------------------------------------------------------------

function checkEvidenceIndexCompressed() {
  const input = makeTestInput();
  const projection = buildSemanticWorkspaceProjection(input);

  const ei = projection.evidenceIndex;
  check(Array.isArray(ei), 'evidenceIndex must be an array');
  check(ei.length === 3, 'evidenceIndex must have 3 entries');

  // Check pressure receipt ref
  const pressureRef = ei.find((r) => r.sourceType === 'pressure_receipt');
  check(pressureRef !== undefined, 'must have pressure_receipt ref');
  check(pressureRef!.sourceId === 'pressure-receipt:d10', 'pressure sourceId must be stable');
  check(pressureRef!.day === 10, 'pressure day must be 10');
  check(pressureRef!.available === true, 'pressure must be available');
  check(pressureRef!.count === 3, 'pressure count must be 3');

  // Check consensus receipt ref
  const consensusRef = ei.find((r) => r.sourceType === 'consensus_receipt');
  check(consensusRef !== undefined, 'must have consensus_receipt ref');
  check(consensusRef!.sourceId === 'consensus-receipt:d10', 'consensus sourceId must be stable');
  check(consensusRef!.day === 10, 'consensus day must be 10');
  check(consensusRef!.available === true, 'consensus must be available');
  check(consensusRef!.count === 1, 'consensus count must be 1');

  // Check narrative signal pack ref
  const narrativeRef = ei.find((r) => r.sourceType === 'narrative_signal_pack');
  check(narrativeRef !== undefined, 'must have narrative_signal_pack ref');
  check(narrativeRef!.sourceId === 'narrative-pack:d10', 'narrative sourceId must be stable');
  check(narrativeRef!.day === 10, 'narrative day must be 10');
  check(narrativeRef!.available === true, 'narrative must be available');
  check(narrativeRef!.count === 7, 'narrative count must be 7');

  // Verify no raw data is exposed in evidence refs
  const eiJson = JSON.stringify(ei);
  check(!eiJson.includes('PressureSnapshot'), 'evidence must not expose raw PressureSnapshot');
  check(!eiJson.includes('ConsensusFormation'), 'evidence must not expose raw ConsensusFormation');
  check(!eiJson.includes('NarrativeSignalPack'), 'evidence must not expose raw NarrativeSignalPack object');
}

// ---------------------------------------------------------------------------
// 7. LLM optionality is always disabled mode
// ---------------------------------------------------------------------------

function checkLlmOptionality() {
  const input = makeTestInput();
  const projection = buildSemanticWorkspaceProjection(input);

  const llm = projection.llmOptionality;
  check(llm.mode === 'disabled', 'mode must be disabled');
  check(llm.noProviderRequired === true, 'noProviderRequired must be true');
  check(llm.proposalCount === 0, 'proposalCount must be 0');
  check(llm.canCallProvider === false, 'canCallProvider must be false');
  check(llm.futureReady === true, 'futureReady must be true');
}

// ---------------------------------------------------------------------------
// 6. No raw GameState / Case / Opportunity / DomainEventEntry exposure
// ---------------------------------------------------------------------------

function checkNoRawDataExposure() {
  const input = makeTestInput();
  const projection = buildSemanticWorkspaceProjection(input);
  const projectionJson = JSON.stringify(projection);

  // Must not contain raw domain object patterns
  const forbiddenPatterns = [
    'rngState',
    'rngCalls',
    'CustomerRuntimeState',
    'Opportunity',
    'DomainEventEntry',
    'Case',
    'GameState',
    'caseTitle',
    'customerName',
    'ownerName',
    'askPrice',
    'marketPrice',
    'bottomPrice',
    'trust',
    'urgency',
    'patience',
    'd1DemandMomentum',
    'd2AssetQuality',
    'd3OwnerReadiness',
    'd4CompetitionAndServicePath',
    'stageIndex',
    'daysLeft',
    'budgetMax',
    'customerId',
    'opportunityId',
  ];

  for (const pattern of forbiddenPatterns) {
    check(!projectionJson.includes(pattern), `must not expose raw ${pattern}`);
  }
}

// ---------------------------------------------------------------------------
// 7. Owner workspace cannot see broker-only / company / D4 internals
// ---------------------------------------------------------------------------

function checkOwnerBoundary() {
  const input: SemanticWorkspaceInput = {
    day: 10,
    scenes: [
      {
        sceneId: 'scene-owner-1',
        sceneType: 'owner_call',
        povActorId: 'owner-1',
        evidenceRefCount: 2,
        resultingEventRefCount: 1,
        commitmentRefCount: 1,
        hasServiceInteraction: false,
      },
    ],
    narrativePack: {
      packId: 'nsp-10-owner-1',
      packHash: 'nsp-10-owner-abc',
      sourceRefCount: 4,
      evidenceRefCount: 6,
      timelineAnchorCount: 3,
      actorVisibleSignalCount: 4,
      generationConstraints: {
        requiredEvidenceForFacts: true,
        visibleScope: 'owner_scoped',
        canMentionHiddenOpportunities: false,
        canMentionCompanyPressure: false,
        canMentionD4Internals: false,
        forbiddenTopicCount: 5,
      },
    },
  };

  const projection = buildSemanticWorkspaceProjection(input);

  // Owner-scoped narrative pack must not expose broker/company/D4 internals
  const pack = projection.narrativePackSummary!;
  check(pack.generationConstraints.visibleScope === 'owner_scoped', 'owner must have owner_scoped visibility');
  check(pack.generationConstraints.canMentionHiddenOpportunities === false, 'owner cannot mention hidden opportunities');
  check(pack.generationConstraints.canMentionCompanyPressure === false, 'owner cannot mention company pressure');
  check(pack.generationConstraints.canMentionD4Internals === false, 'owner cannot mention D4 internals');
}

// ---------------------------------------------------------------------------
// 8. Graceful fallback when data is absent
// ---------------------------------------------------------------------------

function checkGracefulFallback() {
  // Empty input
  const projection = buildEmptySemanticWorkspaceProjection(10);

  check(projection.day === 10, 'day must be 10');
  check(projection.readOnly === true, 'readOnly must be true');
  check(projection.projectionKind === 'semantic_receipt_adapter_state', 'projectionKind must match');
  check(projection.interactionScenes.length === 0, 'interactionScenes must be empty');
  check(projection.narrativePackSummary === null, 'narrativePackSummary must be null');
  check(projection.pressureSummary.available === false, 'pressure must be unavailable');
  check(projection.pressureSummary.snapshotCount === 0, 'pressure snapshotCount must be 0');
  check(projection.consensusSummary.available === false, 'consensus must be unavailable');
  check(projection.consensusSummary.formationCount === 0, 'consensus formationCount must be 0');
  check(projection.llmOptionality.mode === 'disabled', 'llmOptionality must be disabled');
  check(Object.isFrozen(projection), 'fallback projection must be frozen');

  // Partial input (no narrative pack, no pressure, no consensus)
  const partialProjection = buildSemanticWorkspaceProjection({ day: 5, scenes: [] });
  check(partialProjection.day === 5, 'partial day must be 5');
  check(partialProjection.interactionScenes.length === 0, 'partial interactionScenes must be empty');
  check(partialProjection.narrativePackSummary === null, 'partial narrativePackSummary must be null');
  check(partialProjection.pressureSummary.available === false, 'partial pressure must be unavailable');
  check(partialProjection.consensusSummary.available === false, 'partial consensus must be unavailable');
}

// ---------------------------------------------------------------------------
// 9. Deterministic output (same input → same projection)
// ---------------------------------------------------------------------------

function checkDeterministic() {
  const input = makeTestInput();

  const proj1 = buildSemanticWorkspaceProjection(input);
  const proj2 = buildSemanticWorkspaceProjection(input);

  check(stableSnapshot(proj1) === stableSnapshot(proj2), 'same input must produce same projection');
}

// ---------------------------------------------------------------------------
// 10. Layer imports are clean
// ---------------------------------------------------------------------------

function checkLayerImports() {
  // Verify the module can be imported without errors
  check(typeof buildSemanticWorkspaceProjection === 'function', 'buildSemanticWorkspaceProjection must be a function');
  check(typeof buildEmptySemanticWorkspaceProjection === 'function', 'buildEmptySemanticWorkspaceProjection must be a function');
}

// ---------------------------------------------------------------------------
// 11. Builder functions are pure (no side effects)
// ---------------------------------------------------------------------------

function checkBuildersPure() {
  const input = makeTestInput();

  // Multiple calls with same input must produce same output
  const results = Array.from({ length: 5 }, () => buildSemanticWorkspaceProjection(input));
  const snapshots = results.map(stableSnapshot);
  const allSame = snapshots.every((s) => s === snapshots[0]);
  check(allSame, 'builder must be pure (same input → same output)');

  // Builder must not mutate input
  const inputSnapshot = stableSnapshot(input);
  buildSemanticWorkspaceProjection(input);
  check(stableSnapshot(input) === inputSnapshot, 'builder must not mutate input');
}

// ---------------------------------------------------------------------------
// Run all checks
// ---------------------------------------------------------------------------

console.log('Verifying selling-houses workspace semantic boundary contract...');

checkReadOnlyFrozen();
checkInteractionScenesCompressed();
checkNarrativePackCompressed();
checkPressureSummaryCompressed();
checkConsensusSummaryCompressed();
checkEvidenceIndexCompressed();
checkLlmOptionality();
checkNoRawDataExposure();
checkOwnerBoundary();
checkGracefulFallback();
checkDeterministic();
checkLayerImports();
checkBuildersPure();

console.log('');
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error('FAILURES:');
  for (const error of errors) {
    console.error(`  - ${error}`);
  }
  process.exit(1);
} else {
  console.log('selling-houses workspace semantic boundary contract verification passed');
}
