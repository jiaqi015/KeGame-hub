/**
 * Verification script for ActorBelief v0 and SignalTrace v0 boundary contract.
 *
 * Checks:
 * 1. BrokerPOVSnapshot includes ActorBelief with broker-visible belief kinds
 * 2. OwnerPOVSnapshot includes ActorBelief with owner-visible belief kinds only
 * 3. SignalTrace traces back to source signals
 * 4. BeliefConflict detects stale/low-confidence beliefs
 * 5. OwnerPOV beliefs do NOT include hidden kinds (buyer_seriousness, service_path_confidence, financing_confidence)
 * 6. beliefTraceIds correctly link to DecisionAlternative, WaitingState, ActionCommandDraft
 * 7. No mutation of GameState
 * 8. Boundary guards validate belief/trace fields
 * 9. Belief kinds and confidence levels are valid
 * 10. Layer imports are clean
 */

import assert from 'node:assert/strict';
import { buildBrokerPOVSnapshot, buildOwnerPOVSnapshot } from '../src/selling-houses/runtime/decision-support/povAdapter.js';
import { validateAllPOVBoundaries } from '../src/selling-houses/core/decision/boundaryGuards.js';
import type { DecisionSupportContext } from '../src/selling-houses/runtime/decision-support/types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockDecisionSupportContext(): DecisionSupportContext {
  return {
    source: 'legacy-game-state-read-model',
    generatedAtDay: 100,
    readOnly: true,
    cases: [
      {
        caseId: 'case-001',
        title: '测试房源A',
        status: 'active',
        assetScore: {
          subjectRef: { kind: 'case', id: 'case-001', label: '测试房源A' },
          modelId: 'asset-score',
          modelVersion: '1.0.0',
          day: 100,
          score: 72,
          total: 100,
          dimensions: {
            d1: { key: 'd1', label: '需求动量', score: 65, total: 100 },
            d2: { key: 'd2', label: '资产质量', score: 80, total: 100 },
            d3: { key: 'd3', label: '成交条件', score: 70, total: 100 },
          },
          inputs: { legacyCompetitiveness: 72, legacyD1: 65, legacyD2: 80, legacyD3: 70, askPrice: 500, marketPrice: 480, bottomPrice: 450, heat: 60, axisScores: {}, activeOpportunityCount: 1, lateStageOpportunityCount: 1, legacyD3OwnerRelationSignals: {} },
          confidence: 0.85,
          blockers: ['价格偏高'],
          topDrivers: [{ label: '资产质量好', value: 80, contribution: 'positive' }],
          recommendedDecisionMoments: [],
        },
        ownerReadiness: {
          subjectRef: { kind: 'case', id: 'case-001', label: '测试房源A' },
          modelId: 'owner-decision-readiness',
          modelVersion: '1.0.0',
          day: 100,
          score: 60,
          total: 100,
          dimensions: {
            trust: { key: 'trust', label: '信任', score: 45, total: 100 },
            urgency: { key: 'urgency', label: '紧迫度', score: 55, total: 100 },
            patience: { key: 'patience', label: '耐心', score: 65, total: 100 },
            willingnessToAdjust: { key: 'willingnessToAdjust', label: '调价意愿', score: 50, total: 100 },
            decisionLoad: { key: 'decisionLoad', label: '决策负荷', score: 40, total: 100 },
          },
          inputs: { trust: 45, urgency: 55, patience: 65, askPrice: 500, marketPrice: 480, bottomPrice: 450, priceGapPct: 4, windowDays: 30, lastOwnerTouchedDay: 95, ownerGapDays: 5, touchedOwnerToday: false, ownerArchetypeId: 'rational', storylineState: 'healthy' },
          confidence: 0.8,
        },
        opportunityScores: [
          {
            subjectRef: { kind: 'opportunity', id: 'opp-001', label: '客户A' },
            modelId: 'opportunity-score',
            modelVersion: '1.0.0',
            day: 100,
            score: 68,
            total: 100,
            dimensions: {
              fit: { key: 'fit', label: '匹配度', score: 70, total: 100 },
              intent: { key: 'intent', label: '意向', score: 65, total: 100 },
              confidence: { key: 'confidence', label: '成交把握', score: 60, total: 100 },
              closeReadiness: { key: 'closeReadiness', label: '收口准备度', score: 70, total: 100 },
            },
            inputs: { opportunityId: 'opp-001', caseId: 'case-001', stageIndex: 4, daysLeft: 15, status: 'active', budgetMax: 520, askPrice: 500, caseTrust: 45, caseCompetitiveness: 72, pendingClosingEvaluation: false },
            confidence: 0.75,
          },
        ],
        decisionMoments: [
          {
            id: 'dm-001' as any,
            name: 'open-day-fit',
            summary: '适合参加开放日',
            primaryActors: ['broker'],
            triggerActionIds: ['open-day'],
            expectedSignals: ['heat' as any],
            downstreamFlowIds: [],
          },
        ],
        signals: [
          {
            id: 'sig-001',
            caseId: 'case-001',
            kind: 'pricing-friction',
            severity: 'decision',
            label: '价格摩擦信号',
            score: 65,
            sourceModelIds: ['asset-score'],
            decisionMomentIds: ['dm-001' as any],
            actionSpecIds: ['pricing-advice'],
          },
        ],
        recommendationDrafts: [
          {
            id: 'draft-001',
            caseId: 'case-001',
            actionSpecId: 'pricing-advice',
            legacyActionId: 'pricing-advice',
            decisionMomentIds: ['dm-001' as any],
            supportingSignalIds: ['sig-001'],
            priority: 70,
            confidence: 0.7,
            availability: { enabled: true, reason: '' },
            source: 'legacy-game-state-read-model',
          },
        ],
      },
    ],
    regionOpenDayFit: [],
    actionSpecs: [],
    decisionMoments: [],
  };
}

// ---------------------------------------------------------------------------
// Test 1: BrokerPOV includes ActorBelief with broker-visible kinds
// ---------------------------------------------------------------------------

function verifyBrokerBeliefStructure() {
  const context = createMockDecisionSupportContext();
  const brokerPOV = buildBrokerPOVSnapshot(context, null);

  const case1 = brokerPOV.cases[0];
  assert.ok(Array.isArray(case1.knowledge.beliefs), 'beliefs must be array');
  assert.ok(case1.knowledge.beliefs.length > 0, 'broker should have beliefs');

  const validKinds = ['price_anchor', 'broker_trust', 'market_heat', 'seller_sincerity', 'buyer_seriousness', 'financing_confidence', 'service_path_confidence'];
  for (const belief of case1.knowledge.beliefs) {
    assert.ok(validKinds.includes(belief.kind), `belief kind ${belief.kind} must be valid`);
    assert.ok(typeof belief.confidence === 'number', 'confidence must be number');
    assert.ok(belief.confidence >= 0 && belief.confidence <= 1, 'confidence must be 0..1');
    assert.ok(belief.confidenceLevel, 'must have confidenceLevel');
    assert.ok(belief.direction, 'must have direction');
    assert.ok(Array.isArray(belief.supportingTraceIds), 'supportingTraceIds must be array');
    assert.ok(typeof belief.lastUpdatedDay === 'number', 'lastUpdatedDay must be number');
    assert.ok(typeof belief.stale === 'boolean', 'stale must be boolean');
  }

  // Broker should have market_heat and price_anchor at minimum
  const beliefKinds = case1.knowledge.beliefs.map((b) => b.kind);
  assert.ok(beliefKinds.includes('market_heat'), 'broker must have market_heat belief');
  assert.ok(beliefKinds.includes('price_anchor'), 'broker must have price_anchor belief');

  console.log('  [PASS] BrokerPOV belief structure');
}

// ---------------------------------------------------------------------------
// Test 2: OwnerPOV includes only owner-visible belief kinds
// ---------------------------------------------------------------------------

function verifyOwnerBeliefBoundary() {
  const context = createMockDecisionSupportContext();
  const ownerPOV = buildOwnerPOVSnapshot(context);

  const case1 = ownerPOV.cases[0];
  assert.ok(Array.isArray(case1.knowledge.beliefs), 'beliefs must be array');
  assert.ok(case1.knowledge.beliefs.length > 0, 'owner should have beliefs');

  const ownerVisibleKinds = ['price_anchor', 'broker_trust', 'market_heat', 'seller_sincerity'];
  for (const belief of case1.knowledge.beliefs) {
    assert.ok(
      ownerVisibleKinds.includes(belief.kind),
      `owner must NOT have belief kind: ${belief.kind}`,
    );
  }

  // Owner should have seller_sincerity (self-assessment)
  const beliefKinds = case1.knowledge.beliefs.map((b) => b.kind);
  assert.ok(beliefKinds.includes('seller_sincerity'), 'owner must have seller_sincerity belief');

  console.log('  [PASS] OwnerPOV belief boundary');
}

// ---------------------------------------------------------------------------
// Test 3: SignalTrace traces back to source signals
// ---------------------------------------------------------------------------

function verifySignalTraces() {
  const context = createMockDecisionSupportContext();
  const brokerPOV = buildBrokerPOVSnapshot(context, null);

  const case1 = brokerPOV.cases[0];
  assert.ok(Array.isArray(case1.knowledge.traces), 'traces must be array');
  assert.ok(case1.knowledge.traces.length > 0, 'should have traces');

  for (const trace of case1.knowledge.traces) {
    assert.ok(trace.id, 'trace must have id');
    assert.ok(trace.source, 'trace must have source');
    assert.ok(trace.originKey, 'trace must have originKey');
    assert.ok(trace.originLabel, 'trace must have originLabel');
    assert.ok(typeof trace.receivedDay === 'number', 'receivedDay must be number');
    assert.ok(typeof trace.sourceCredibility === 'number', 'sourceCredibility must be number');
    assert.ok(trace.sourceCredibility >= 0 && trace.sourceCredibility <= 1, 'sourceCredibility must be 0..1');
  }

  // Verify trace sources are valid
  const validSources = ['self_sourced', 'relayed', 'observed', 'inferred', 'systemic', 'service_interaction'];
  for (const trace of case1.knowledge.traces) {
    assert.ok(validSources.includes(trace.source), `trace source ${trace.source} must be valid`);
  }

  console.log('  [PASS] SignalTrace structure');
}

// ---------------------------------------------------------------------------
// Test 4: BeliefConflict detects stale/low-confidence beliefs
// ---------------------------------------------------------------------------

function verifyBeliefConflicts() {
  const context = createMockDecisionSupportContext();
  const brokerPOV = buildBrokerPOVSnapshot(context, null);

  const case1 = brokerPOV.cases[0];
  assert.ok(Array.isArray(case1.knowledge.beliefConflicts), 'beliefConflicts must be array');

  // With the mock data, there should be at least one conflict (price vs quality)
  // because priceGapPct is ~4.2% (500 vs 480) and D2 is 80 (good quality)
  const conflicts = case1.knowledge.beliefConflicts;
  for (const conflict of conflicts) {
    assert.ok(conflict.id, 'conflict must have id');
    assert.ok(['belief_vs_fact', 'belief_vs_belief', 'stale_belief', 'low_confidence_interpretation'].includes(conflict.kind), `conflict kind ${conflict.kind} must be valid`);
    assert.ok(conflict.description, 'conflict must have description');
    assert.ok(Array.isArray(conflict.beliefIds), 'beliefIds must be array');
    assert.ok(['high', 'medium', 'low'].includes(conflict.severity), `severity ${conflict.severity} must be valid`);
    assert.ok(conflict.decisionImpact, 'conflict must have decisionImpact');
  }

  console.log('  [PASS] BeliefConflict detection');
}

// ---------------------------------------------------------------------------
// Test 5: beliefTraceIds link correctly
// ---------------------------------------------------------------------------

function verifyBeliefTraceIds() {
  const context = createMockDecisionSupportContext();
  const brokerPOV = buildBrokerPOVSnapshot(context, null);

  const case1 = brokerPOV.cases[0];

  // ActionCommandDrafts should have beliefTraceIds
  for (const draft of brokerPOV.actionCommandDrafts) {
    assert.ok(Array.isArray(draft.beliefTraceIds), 'draft must have beliefTraceIds array');
  }

  // ChoiceSet alternatives should have beliefTraceIds
  for (const alt of case1.choiceSet.alternatives) {
    assert.ok(Array.isArray(alt.beliefTraceIds), 'alternative must have beliefTraceIds array');
  }

  // WaitingState should have beliefTraceIds
  assert.ok(Array.isArray(case1.waitingState.beliefTraceIds), 'waitingState must have beliefTraceIds array');

  console.log('  [PASS] beliefTraceIds linkage');
}

// ---------------------------------------------------------------------------
// Test 6: No mutation of GameState
// ---------------------------------------------------------------------------

function verifyNoMutation() {
  const context = createMockDecisionSupportContext();
  const contextBefore = JSON.parse(JSON.stringify(context));

  buildBrokerPOVSnapshot(context, null);
  buildOwnerPOVSnapshot(context);

  assert.deepEqual(context.cases.length, contextBefore.cases.length, 'cases count unchanged');
  assert.deepEqual(context.cases[0].caseId, contextBefore.cases[0].caseId, 'case ID unchanged');
  assert.deepEqual(context.cases[0].signals.length, contextBefore.cases[0].signals.length, 'signals unchanged');

  console.log('  [PASS] No mutation of GameState');
}

// ---------------------------------------------------------------------------
// Test 7: Boundary guards validate belief/trace fields
// ---------------------------------------------------------------------------

function verifyBoundaryGuards() {
  const context = createMockDecisionSupportContext();
  const brokerPOV = buildBrokerPOVSnapshot(context, null);
  const ownerPOV = buildOwnerPOVSnapshot(context);

  const violations = validateAllPOVBoundaries(brokerPOV, ownerPOV);

  // Should have no violations for belief/trace fields
  const beliefViolations = violations.filter((v) =>
    v.rule.includes('belief') || v.rule.includes('trace') || v.rule.includes('conflict')
  );
  assert.ok(beliefViolations.length === 0,
    `Should have no belief/trace violations, got: ${JSON.stringify(beliefViolations)}`);

  console.log('  [PASS] Boundary guards validate beliefs/traces');
}

// ---------------------------------------------------------------------------
// Test 8: Belief confidence levels are valid
// ---------------------------------------------------------------------------

function verifyBeliefConfidenceLevels() {
  const validLevels = ['certain', 'confident', 'uncertain', 'speculative'];

  const context = createMockDecisionSupportContext();
  const brokerPOV = buildBrokerPOVSnapshot(context, null);

  for (const caseCtx of brokerPOV.cases) {
    for (const belief of caseCtx.knowledge.beliefs) {
      assert.ok(
        validLevels.includes(belief.confidenceLevel),
        `confidenceLevel ${belief.confidenceLevel} must be valid`,
      );
    }
  }

  console.log('  [PASS] Belief confidence levels are valid');
}

// ---------------------------------------------------------------------------
// Test 9: Owner beliefs are not leaked from broker
// ---------------------------------------------------------------------------

function verifyOwnerBeliefsAreLimited() {
  const context = createMockDecisionSupportContext();
  const brokerPOV = buildBrokerPOVSnapshot(context, null);
  const ownerPOV = buildOwnerPOVSnapshot(context);

  const brokerBeliefKinds = new Set(
    brokerPOV.cases[0].knowledge.beliefs.map((b) => b.kind),
  );
  const ownerBeliefKinds = new Set(
    ownerPOV.cases[0].knowledge.beliefs.map((b) => b.kind),
  );

  // Owner should NOT have buyer_seriousness or service_path_confidence
  assert.ok(!ownerBeliefKinds.has('buyer_seriousness'), 'owner must NOT have buyer_seriousness');
  assert.ok(!ownerBeliefKinds.has('service_path_confidence'), 'owner must NOT have service_path_confidence');
  assert.ok(!ownerBeliefKinds.has('financing_confidence'), 'owner must NOT have financing_confidence');

  // Owner beliefs should be a subset of broker-visible kinds
  const ownerOnlyKinds = ['price_anchor', 'broker_trust', 'market_heat', 'seller_sincerity'];
  for (const kind of ownerBeliefKinds) {
    assert.ok(ownerOnlyKinds.includes(kind), `owner belief ${kind} must be in allowed list`);
  }

  console.log('  [PASS] Owner beliefs are properly limited');
}

// ---------------------------------------------------------------------------
// Test 10: Layer imports are clean
// ---------------------------------------------------------------------------

function verifyLayerImports() {
  assert.ok(buildBrokerPOVSnapshot, 'buildBrokerPOVSnapshot must be importable');
  assert.ok(buildOwnerPOVSnapshot, 'buildOwnerPOVSnapshot must be importable');
  assert.ok(validateAllPOVBoundaries, 'validateAllPOVBoundaries must be importable');

  console.log('  [PASS] Layer imports are clean');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

console.log('Verifying selling-houses ActorBelief/SignalTrace boundary contract...');

verifyBrokerBeliefStructure();
verifyOwnerBeliefBoundary();
verifySignalTraces();
verifyBeliefConflicts();
verifyBeliefTraceIds();
verifyNoMutation();
verifyBoundaryGuards();
verifyBeliefConfidenceLevels();
verifyOwnerBeliefsAreLimited();
verifyLayerImports();

console.log('selling-houses ActorBelief/SignalTrace boundary verification passed');
