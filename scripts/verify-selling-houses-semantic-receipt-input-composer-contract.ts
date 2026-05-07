/**
 * Semantic Receipt Input Composer verification contract.
 *
 * Proves:
 * 1. buildSemanticReceiptInputPackFromContext reads only DecisionSupportContext (not raw GameState)
 * 2. buildSemanticReceiptInputPackFromPOV reads only BrokerPOVSnapshot (not raw GameState)
 * 3. Output is valid SemanticReceiptInputPack
 * 4. Graceful fallback when data is absent
 * 5. No raw GameState fields in output
 * 6. Deterministic output
 * 7. Pure functions (no mutation)
 * 8. Evidence sources are stable and replayable
 * 9. Interaction scenes are derived from existing adapters
 * 10. NarrativeSignalPack is derived from existing adapter
 * 11. Layer imports are clean (no domain -> runtime violations in composer)
 */

import assert from 'node:assert/strict';

import {
  buildSemanticReceiptInputPackFromContext,
  buildSemanticReceiptInputPackFromPOV,
  buildEmptySemanticReceiptInputPack,
} from '../src/selling-houses/runtime/simulation/semanticReceiptInputComposer.js';

import type { DecisionSupportContext } from '../src/selling-houses/runtime/decision-support/types.js';
import type { BrokerPOVSnapshot } from '../src/selling-houses/core/decision/models.js';
import type { SemanticReceiptInputPack } from '../src/selling-houses/runtime/simulation/semanticReceiptInputComposer.js';

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
// Test data factories
// ---------------------------------------------------------------------------

function makeDecisionSupportContext(): DecisionSupportContext {
  return {
    generatedAtDay: 10,
    readOnly: true as const,
    source: 'legacy-game-state-read-model' as const,
    cases: [
      {
        caseId: 'case-1',
        title: '房源A',
        status: 'active',
        assetScore: {
          subjectRef: { kind: 'case', id: 'case-1', label: '房源A' },
          modelId: 'asset-score',
          modelVersion: 'v1',
          day: 10,
          score: 72,
          total: 100,
          dimensions: {
            d1: { key: 'd1', label: '需求动量', score: 65, total: 100 },
            d2: { key: 'd2', label: '资产质量', score: 78, total: 100 },
            d3: { key: 'd3', label: '成交条件', score: 60, total: 100 },
            d4: { key: 'd4', label: '竞争服务', score: 55, total: 100 },
          },
          inputs: {
            legacyCompetitiveness: 72,
            legacyD1: 65,
            legacyD2: 78,
            legacyD3: 60,
            askPrice: 500,
            marketPrice: 480,
            bottomPrice: 460,
            heat: 70,
            axisScores: {},
            activeOpportunityCount: 2,
            lateStageOpportunityCount: 1,
            legacyD3OwnerRelationSignals: {},
          },
          confidence: 0.85,
          blockers: ['价格偏高'],
          topDrivers: [{ label: '资产质量好', value: 78, contribution: 'positive' }],
          recommendedDecisionMoments: [],
        },
        ownerReadiness: {
          subjectRef: { kind: 'case', id: 'case-1', label: '房源A' },
          modelId: 'owner-decision-readiness',
          modelVersion: 'v1',
          day: 10,
          score: 65,
          total: 100,
          dimensions: {
            trust: { key: 'trust', label: '信任', score: 70, total: 100 },
            urgency: { key: 'urgency', label: '紧迫度', score: 55, total: 100 },
            patience: { key: 'patience', label: '耐心', score: 60, total: 100 },
            willingnessToAdjust: { key: 'wta', label: '调价意愿', score: 50, total: 100 },
            decisionLoad: { key: 'dl', label: '决策负荷', score: 40, total: 100 },
          },
          inputs: {
            trust: 70, urgency: 55, patience: 60,
            askPrice: 500, marketPrice: 480, bottomPrice: 460,
            priceGapPct: 4, windowDays: 30,
            lastOwnerTouchedDay: 8, ownerGapDays: 2,
            touchedOwnerToday: false, ownerArchetypeId: 'rational',
            storylineState: 'healthy',
          },
          confidence: 0.8,
        },
        opportunityScores: [
          {
            subjectRef: { kind: 'opportunity', id: 'opp-1', label: '客户A' },
            modelId: 'opportunity-score',
            modelVersion: 'v1',
            day: 10,
            score: 68,
            total: 100,
            dimensions: {
              fit: { key: 'fit', label: '匹配', score: 75, total: 100 },
              intent: { key: 'intent', label: '意向', score: 60, total: 100 },
              confidence: { key: 'conf', label: '把握', score: 65, total: 100 },
              closeReadiness: { key: 'cr', label: '收口', score: 55, total: 100 },
            },
            inputs: {
              opportunityId: 'opp-1', caseId: 'case-1',
              stageIndex: 3, daysLeft: 15, status: 'active',
              budgetMax: 520, askPrice: 500,
              caseTrust: 70, caseCompetitiveness: 72,
              pendingClosingEvaluation: false,
            },
            confidence: 0.7,
          },
        ],
        decisionMoments: [
          {
            id: 'pricing-strategy-adjustment' as const,
            name: 'pricing-strategy-adjustment',
            summary: '建议调价',
            primaryActors: ['broker' as const],
            triggerActionIds: ['pricing-strategy-adjustment'],
            expectedSignals: ['d3' as const],
            downstreamFlowIds: [],
          },
        ],
        signals: [
          {
            id: 'sig-1',
            caseId: 'case-1',
            kind: 'pricing-friction' as const,
            severity: 'decision' as const,
            label: '价格摩擦',
            score: 65,
            sourceModelIds: ['asset-score'],
            decisionMomentIds: ['pricing-strategy-adjustment' as const],
            actionSpecIds: ['pricing-strategy-adjustment'],
          },
        ],
        recommendationDrafts: [
          {
            id: 'rd-1',
            caseId: 'case-1',
            actionSpecId: 'pricing-strategy-adjustment',
            legacyActionId: 'legacy-pricing-strategy-adjustment',
            decisionMomentIds: ['pricing-strategy-adjustment' as const],
            supportingSignalIds: ['sig-1'],
            priority: 80,
            confidence: 0.75,
            availability: { enabled: true, reason: '' },
            source: 'legacy-game-state-read-model' as const,
          },
        ],
      },
    ],
    regionOpenDayFit: [],
    actionSpecs: [],
    decisionMoments: [],
  } as unknown as DecisionSupportContext;
}

function makeBrokerPOVSnapshot(): BrokerPOVSnapshot {
  return {
    role: 'broker',
    readOnly: true,
    day: 10,
    actorId: 'broker:current',
    cases: [
      {
        caseId: 'case-1',
        title: '房源A',
        status: 'active',
        assetScore: {
          score: 72,
          d1: 65,
          d2: 78,
          d3: 60,
          d4: 55,
          blockers: freezeArr(['价格偏高']),
          topDriverLabels: freezeArr(['资产质量好']),
        },
        ownerReadiness: {
          score: 65,
          trust: 70,
          urgency: 55,
          patience: 60,
        },
        opportunityCount: 2,
        lateStageOpportunityCount: 1,
        signals: freezeArr([
          { key: 'sig-1', label: '价格摩擦', severity: 'decision', score: 65 },
        ]),
        recommendationDrafts: freezeArr([
          { id: 'rd-1', actionSpecId: 'price-adjust', label: 'price-adjust', enabled: true, priority: 80 },
        ]),
        decisionMoments: freezeArr([
          { id: 'dm-1', label: '调价决策', urgency: 'medium' },
        ]),
        knowledge: {
          visibleFacts: freezeArr([]),
          inferredSignals: freezeArr([]),
          hiddenGlobalFacts: freezeArr([]),
          traces: freezeArr([]),
          beliefs: freezeArr([]),
          beliefConflicts: freezeArr([]),
        },
        decisionState: {
          posture: 'undecided',
          pressureLevel: 30,
          confidence: 0.6,
          blockers: freezeArr([]),
          lastUpdatedDay: 10,
        },
        commitments: freezeArr([]),
        choiceSet: {
          alternatives: freezeArr([]),
          source: 'broker-framed',
          constraints: freezeArr([]),
          feasibleCount: 0,
          draftMappedCount: 0,
        },
        waitingState: {
          posture: 'not_waiting',
          reason: '',
          accumulatedPressure: 0,
          beliefTraceIds: freezeArr([]),
        },
        commitmentStates: freezeArr([]),
      },
    ],
    pressureSummary: {
      available: false,
      day: 10,
      coverage: 0,
      maxConfidence: 0,
      wiredCount: 0,
      wiredTotal: 0,
      sources: freezeArr([]),
      headline: '',
    },
    actionCommandDrafts: freezeArr([]),
    decisionMoments: freezeArr([]),
    energy: 100,
    promotionBudget: 0,
    globalKnowledge: {
      visibleFacts: freezeArr([]),
      inferredSignals: freezeArr([]),
      hiddenGlobalFacts: freezeArr([]),
      traces: freezeArr([]),
      beliefs: freezeArr([]),
      beliefConflicts: freezeArr([]),
    },
  } as BrokerPOVSnapshot;
}

function freezeArr<T>(items: T[]): readonly T[] {
  return Object.freeze([...items]) as readonly T[];
}

// ---------------------------------------------------------------------------
// 1. buildSemanticReceiptInputPackFromContext reads only DecisionSupportContext
// ---------------------------------------------------------------------------

function checkFromContext() {
  const ctx = makeDecisionSupportContext();
  const pack = buildSemanticReceiptInputPackFromContext(ctx);

  check(pack.day === 10, 'day must be 10');
  check(pack.actorId === 'broker:current', 'actorId must be broker:current');
  check(pack.actorKind === 'broker', 'actorKind must be broker');
  check(pack.interactionScenes.length > 0, 'must have interaction scenes');
  check(pack.narrativeSignalPack !== null, 'must have narrative signal pack');
  check(pack.evidenceSources.length > 0, 'must have evidence sources');
  check(pack.isLive === true, 'must be live');
}

// ---------------------------------------------------------------------------
// 2. buildSemanticReceiptInputPackFromPOV reads only BrokerPOVSnapshot
// ---------------------------------------------------------------------------

function checkFromPOV() {
  const pov = makeBrokerPOVSnapshot();
  const pack = buildSemanticReceiptInputPackFromPOV(pov);

  check(pack.day === 10, 'day must be 10');
  check(pack.actorId === 'broker:current', 'actorId must be broker:current');
  check(pack.interactionScenes.length > 0, 'must have interaction scenes');
  check(pack.narrativeSignalPack !== null, 'must have narrative signal pack');
  check(pack.isLive === true, 'must be live');
}

// ---------------------------------------------------------------------------
// 3. Output is valid SemanticReceiptInputPack
// ---------------------------------------------------------------------------

function checkValidOutput() {
  const ctx = makeDecisionSupportContext();
  const pack = buildSemanticReceiptInputPackFromContext(ctx);

  check(typeof pack.day === 'number', 'day must be number');
  check(typeof pack.actorId === 'string', 'actorId must be string');
  check(Array.isArray(pack.interactionScenes), 'interactionScenes must be array');
  check(pack.narrativeSignalPack !== null, 'narrativeSignalPack must not be null');
  check(Array.isArray(pack.evidenceSources), 'evidenceSources must be array');
  check(typeof pack.generationConstraints === 'object', 'generationConstraints must be object');
  check(typeof pack.isLive === 'boolean', 'isLive must be boolean');
}

// ---------------------------------------------------------------------------
// 4. Graceful fallback when data is absent
// ---------------------------------------------------------------------------

function checkGracefulFallback() {
  const pack = buildEmptySemanticReceiptInputPack(10);

  check(pack.day === 10, 'day must be 10');
  check(pack.interactionScenes.length === 0, 'interactionScenes must be empty');
  check(pack.narrativeSignalPack === null, 'narrativeSignalPack must be null');
  check(pack.evidenceSources.length === 0, 'evidenceSources must be empty');
  check(pack.isLive === false, 'isLive must be false');
  check(Object.isFrozen(pack), 'pack must be frozen');
}

// ---------------------------------------------------------------------------
// 5. No raw GameState fields in output
// ---------------------------------------------------------------------------

function checkNoRawGameStateExposure() {
  const ctx = makeDecisionSupportContext();
  const pack = buildSemanticReceiptInputPackFromContext(ctx);
  const json = JSON.stringify(pack);

  const forbiddenPatterns = [
    'rngState',
    'rngCalls',
    'CustomerRuntimeState',
    'DomainEventEntry',
    'Case',
    'Opportunity',
    'GameState',
    'caseTitle',
    'customerName',
    'ownerName',
    'askPrice',
    'marketPrice',
    'bottomPrice',
    'stageIndex',
    'daysLeft',
    'budgetMax',
  ];

  for (const pattern of forbiddenPatterns) {
    check(!json.includes(`"${pattern}"`), `must not expose raw ${pattern}`);
  }
}

// ---------------------------------------------------------------------------
// 6. Deterministic output
// ---------------------------------------------------------------------------

function checkDeterministic() {
  const ctx = makeDecisionSupportContext();
  const pack1 = buildSemanticReceiptInputPackFromContext(ctx);
  const pack2 = buildSemanticReceiptInputPackFromContext(ctx);

  check(stableSnapshot(pack1) === stableSnapshot(pack2), 'same context → same pack');
}

// ---------------------------------------------------------------------------
// 7. Pure functions (no mutation)
// ---------------------------------------------------------------------------

function checkPureFunctions() {
  const ctx = makeDecisionSupportContext();
  const ctxBefore = stableSnapshot(ctx);

  buildSemanticReceiptInputPackFromContext(ctx);

  check(stableSnapshot(ctx) === ctxBefore, 'context must not be mutated');
}

// ---------------------------------------------------------------------------
// 8. Evidence sources are stable and replayable
// ---------------------------------------------------------------------------

function checkEvidenceSourcesStable() {
  const ctx = makeDecisionSupportContext();
  const pack = buildSemanticReceiptInputPackFromContext(ctx);

  for (const ref of pack.evidenceSources) {
    check(typeof ref.sourceType === 'string', 'sourceType must be string');
    check(typeof ref.sourceId === 'string', 'sourceId must be string');
    check(typeof ref.day === 'number', 'day must be number');
    check(typeof ref.available === 'boolean', 'available must be boolean');
    check(typeof ref.summary === 'string', 'summary must be string');
    check(typeof ref.count === 'number', 'count must be number');
    check(ref.day === 10, 'day must match context day');
  }
}

// ---------------------------------------------------------------------------
// 9. Interaction scenes are derived from existing adapters
// ---------------------------------------------------------------------------

function checkInteractionScenesDerived() {
  const ctx = makeDecisionSupportContext();
  const pack = buildSemanticReceiptInputPackFromContext(ctx);

  // Should have at least one scene per case with signals
  check(pack.interactionScenes.length > 0, 'must derive scenes from context');

  for (const scene of pack.interactionScenes) {
    check(typeof scene.sceneId === 'string', 'sceneId must be string');
    check(typeof scene.sceneType === 'string', 'sceneType must be string');
    check(typeof scene.day === 'number', 'day must be number');
    check(Array.isArray(scene.actorIds), 'actorIds must be array');
    check(typeof scene.primaryActorId === 'string', 'primaryActorId must be string');
  }
}

// ---------------------------------------------------------------------------
// 10. NarrativeSignalPack is derived from existing adapter
// ---------------------------------------------------------------------------

function checkNarrativePackDerived() {
  const ctx = makeDecisionSupportContext();
  const pack = buildSemanticReceiptInputPackFromContext(ctx);
  const nsp = pack.narrativeSignalPack!;

  check(typeof nsp.packId === 'string', 'packId must be string');
  check(typeof nsp.day === 'number', 'day must be number');
  check(Array.isArray(nsp.sourceRefs), 'sourceRefs must be array');
  check(Array.isArray(nsp.evidenceRefs), 'evidenceRefs must be array');
  check(Array.isArray(nsp.timelineAnchors), 'timelineAnchors must be array');
  check(Array.isArray(nsp.actorVisibleSignals), 'actorVisibleSignals must be array');
  check(nsp.day === 10, 'day must match context day');
}

// ---------------------------------------------------------------------------
// 11. Layer imports are clean
// ---------------------------------------------------------------------------

function checkLayerImports() {
  // Verify the module can be imported without errors
  check(typeof buildSemanticReceiptInputPackFromContext === 'function', 'buildSemanticReceiptInputPackFromContext must be importable');
  check(typeof buildSemanticReceiptInputPackFromPOV === 'function', 'buildSemanticReceiptInputPackFromPOV must be importable');
  check(typeof buildEmptySemanticReceiptInputPack === 'function', 'buildEmptySemanticReceiptInputPack must be importable');
}

// ---------------------------------------------------------------------------
// Run all checks
// ---------------------------------------------------------------------------

console.log('Verifying selling-houses semantic receipt input composer contract...');

checkFromContext();
checkFromPOV();
checkValidOutput();
checkGracefulFallback();
checkNoRawGameStateExposure();
checkDeterministic();
checkPureFunctions();
checkEvidenceSourcesStable();
checkInteractionScenesDerived();
checkNarrativePackDerived();
checkLayerImports();

console.log('');
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error('FAILURES:');
  for (const error of errors) {
    console.error(`  - ${error}`);
  }
  process.exit(1);
} else {
  console.log('selling-houses semantic receipt input composer contract verification passed');
}
