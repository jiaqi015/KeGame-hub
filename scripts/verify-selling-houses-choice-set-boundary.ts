/**
 * Verification script for ChoiceSet v0 and WaitingPosture v0 boundary contract.
 *
 * Checks:
 * 1. BrokerPOVSnapshot includes ChoiceSet with broker-visible alternatives
 * 2. OwnerPOVSnapshot includes ChoiceSet with owner-visible alternatives only
 * 3. WaitingPosture is correctly derived from signals and readiness
 * 4. OwnerPOV ChoiceSet does NOT expose hidden alternatives
 * 5. NoDecision/waiting state is read-only, does not mutate GameState
 * 6. ChoiceSet alternatives map to ActionCommandDrafts correctly
 * 7. Boundary guards validate ChoiceSet/WaitingPosture fields
 * 8. Layer imports are clean
 */

import assert from 'node:assert/strict';
import { buildBrokerPOVSnapshot, buildOwnerPOVSnapshot } from '../src/selling-houses/runtime/decision-support/povAdapter.js';
import { validateAllPOVBoundaries } from '../src/selling-houses/core/decision/boundaryGuards.js';
import type { DecisionSupportContext, CaseDecisionSupportContext } from '../src/selling-houses/runtime/decision-support/types.js';

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
          {
            id: 'sig-002',
            caseId: 'case-001',
            kind: 'open-day-fit',
            severity: 'info',
            label: '开放日适配信号',
            score: 50,
            sourceModelIds: ['asset-score'],
            decisionMomentIds: ['dm-001' as any],
            actionSpecIds: ['open-day'],
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
          {
            id: 'draft-002',
            caseId: 'case-001',
            actionSpecId: 'open-day',
            legacyActionId: 'open-day',
            decisionMomentIds: ['dm-001' as any],
            supportingSignalIds: ['sig-002'],
            priority: 50,
            confidence: 0.6,
            availability: { enabled: true, reason: '' },
            source: 'legacy-game-state-read-model',
          },
        ],
      },
      {
        caseId: 'case-002',
        title: '测试房源B',
        status: 'active',
        assetScore: {
          subjectRef: { kind: 'case', id: 'case-002', label: '测试房源B' },
          modelId: 'asset-score',
          modelVersion: '1.0.0',
          day: 100,
          score: 45,
          total: 100,
          dimensions: {
            d1: { key: 'd1', label: '需求动量', score: 30, total: 100 },
            d2: { key: 'd2', label: '资产质量', score: 60, total: 100 },
            d3: { key: 'd3', label: '成交条件', score: 40, total: 100 },
          },
          inputs: { legacyCompetitiveness: 45, legacyD1: 30, legacyD2: 60, legacyD3: 40, askPrice: 400, marketPrice: 380, bottomPrice: 350, heat: 40, axisScores: {}, activeOpportunityCount: 0, lateStageOpportunityCount: 0, legacyD3OwnerRelationSignals: {} },
          confidence: 0.7,
          blockers: ['需求信号弱', '业主配合度低'],
          topDrivers: [{ label: '需求不足', value: 30, contribution: 'negative' }],
          recommendedDecisionMoments: [],
        },
        ownerReadiness: {
          subjectRef: { kind: 'case', id: 'case-002', label: '测试房源B' },
          modelId: 'owner-decision-readiness',
          modelVersion: '1.0.0',
          day: 100,
          score: 35,
          total: 100,
          dimensions: {
            trust: { key: 'trust', label: '信任', score: 25, total: 100 },
            urgency: { key: 'urgency', label: '紧迫度', score: 30, total: 100 },
            patience: { key: 'patience', label: '耐心', score: 20, total: 100 },
            willingnessToAdjust: { key: 'willingnessToAdjust', label: '调价意愿', score: 30, total: 100 },
            decisionLoad: { key: 'decisionLoad', label: '决策负荷', score: 50, total: 100 },
          },
          inputs: { trust: 25, urgency: 30, patience: 20, askPrice: 400, marketPrice: 380, bottomPrice: 350, priceGapPct: 5, windowDays: 60, lastOwnerTouchedDay: 80, ownerGapDays: 20, touchedOwnerToday: false, ownerArchetypeId: 'emotional', storylineState: 'fragile' },
          confidence: 0.6,
        },
        opportunityScores: [],
        decisionMoments: [],
        signals: [
          {
            id: 'sig-003',
            caseId: 'case-002',
            kind: 'owner-readiness-low',
            severity: 'urgent',
            label: '业主配合度低',
            score: 80,
            sourceModelIds: ['owner-decision-readiness'],
            decisionMomentIds: [],
            actionSpecIds: [],
          },
        ],
        recommendationDrafts: [
          {
            id: 'draft-003',
            caseId: 'case-002',
            actionSpecId: 'first-visit',
            legacyActionId: 'first-visit',
            decisionMomentIds: [],
            supportingSignalIds: ['sig-003'],
            priority: 80,
            confidence: 0.8,
            availability: { enabled: false, reason: '业主不配合' },
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
// Test 1: BrokerPOV ChoiceSet structure
// ---------------------------------------------------------------------------

function verifyBrokerChoiceSetStructure() {
  const context = createMockDecisionSupportContext();
  const brokerPOV = buildBrokerPOVSnapshot(context, null);

  assert.ok(brokerPOV.cases.length === 2, 'Should have 2 cases');

  const case1 = brokerPOV.cases[0];
  assert.ok(case1.choiceSet, 'Case 1 must have choiceSet');
  assert.ok(Array.isArray(case1.choiceSet.alternatives), 'choiceSet.alternatives must be array');
  assert.ok(Array.isArray(case1.choiceSet.constraints), 'choiceSet.constraints must be array');
  assert.ok(typeof case1.choiceSet.feasibleCount === 'number', 'feasibleCount must be number');
  assert.ok(typeof case1.choiceSet.draftMappedCount === 'number', 'draftMappedCount must be number');
  assert.ok(case1.choiceSet.alternatives.length > 0, 'Should have alternatives');

  // Check that alternatives have required fields
  for (const alt of case1.choiceSet.alternatives) {
    assert.ok(alt.id, 'Alternative must have id');
    assert.ok(alt.label, 'Alternative must have label');
    assert.ok(alt.description, 'Alternative must have description');
    assert.ok(typeof alt.attractiveness === 'number', 'attractiveness must be number');
    assert.ok(typeof alt.feasible === 'boolean', 'feasible must be boolean');
    assert.ok(alt.source, 'Alternative must have source');
  }

  console.log('  [PASS] BrokerPOV ChoiceSet structure');
}

// ---------------------------------------------------------------------------
// Test 2: OwnerPOV ChoiceSet does NOT expose hidden alternatives
// ---------------------------------------------------------------------------

function verifyOwnerChoiceSetBoundary() {
  const context = createMockDecisionSupportContext();
  const ownerPOV = buildOwnerPOVSnapshot(context);

  assert.ok(ownerPOV.cases.length === 2, 'Should have 2 cases');

  const case1 = ownerPOV.cases[0];
  assert.ok(case1.choiceSet, 'Case 1 must have choiceSet');
  assert.ok(Array.isArray(case1.choiceSet.alternatives), 'choiceSet.alternatives must be array');

  // Owner alternatives should NOT include broker-internal alternatives
  const altLabels = case1.choiceSet.alternatives.map((a) => a.label);
  assert.ok(!altLabels.includes('升级经理'), 'Owner should NOT see escalate-to-manager alternative');

  // Owner alternatives should include owner-visible options
  assert.ok(altLabels.includes('继续等待'), 'Owner should see continue-waiting option');
  assert.ok(altLabels.includes('接受调价沟通'), 'Owner should see price-communication option');
  assert.ok(altLabels.includes('考虑报价'), 'Owner should see consider-offers option');
  assert.ok(altLabels.includes('撤回房源'), 'Owner should see withdraw option');

  console.log('  [PASS] OwnerPOV ChoiceSet boundary');
}

// ---------------------------------------------------------------------------
// Test 3: WaitingPosture derivation
// ---------------------------------------------------------------------------

function verifyWaitingPostureDerivation() {
  const context = createMockDecisionSupportContext();
  const brokerPOV = buildBrokerPOVSnapshot(context, null);

  const case1 = brokerPOV.cases[0];
  assert.ok(case1.waitingState, 'Case 1 must have waitingState');
  assert.ok(case1.waitingState.posture, 'waitingState must have posture');
  assert.ok(case1.waitingState.reason, 'waitingState must have reason');
  assert.ok(typeof case1.waitingState.accumulatedPressure === 'number', 'accumulatedPressure must be number');

  // Case 2 has urgent signal + disabled draft → should be stuck_conflicted
  const case2 = brokerPOV.cases[1];
  assert.ok(case2.waitingState, 'Case 2 must have waitingState');
  assert.equal(case2.waitingState.posture, 'stuck_conflicted',
    'Case 2 with urgent signal + disabled draft should be stuck_conflicted');

  console.log('  [PASS] WaitingPosture derivation');
}

// ---------------------------------------------------------------------------
// Test 4: ChoiceSet alternatives map to ActionCommandDrafts
// ---------------------------------------------------------------------------

function verifyAlternativeDraftMapping() {
  const context = createMockDecisionSupportContext();
  const brokerPOV = buildBrokerPOVSnapshot(context, null);

  const case1 = brokerPOV.cases[0];

  // Find alternatives with actionCommandDraftId
  const mappedAlts = case1.choiceSet.alternatives.filter((a) => a.actionCommandDraftId);
  assert.ok(mappedAlts.length > 0, 'Should have alternatives mapped to drafts');

  // Verify the mapping is correct
  for (const alt of mappedAlts) {
    const draft = brokerPOV.actionCommandDrafts.find((d) => d.id === alt.actionCommandDraftId);
    assert.ok(draft, `Draft ${alt.actionCommandDraftId} must exist in actionCommandDrafts`);
  }

  console.log('  [PASS] ChoiceSet alternatives map to ActionCommandDrafts');
}

// ---------------------------------------------------------------------------
// Test 5: ChoiceSet constraints reflect readiness
// ---------------------------------------------------------------------------

function verifyChoiceSetConstraints() {
  const context = createMockDecisionSupportContext();
  const brokerPOV = buildBrokerPOVSnapshot(context, null);

  // Case 2 has low trust (25) → should have trust constraint
  const case2 = brokerPOV.cases[1];
  const trustConstraint = case2.choiceSet.constraints.find((c) => c.kind === 'trust');
  assert.ok(trustConstraint, 'Case 2 should have trust constraint');
  assert.ok(trustConstraint.blocking, 'Low trust constraint should be blocking');

  console.log('  [PASS] ChoiceSet constraints reflect readiness');
}

// ---------------------------------------------------------------------------
// Test 6: No mutation of GameState
// ---------------------------------------------------------------------------

function verifyNoMutation() {
  const context = createMockDecisionSupportContext();

  // Build POVs
  buildBrokerPOVSnapshot(context, null);
  buildOwnerPOVSnapshot(context);

  // Context should be unchanged
  assert.ok(context.cases.length === 2, 'Context cases count unchanged');
  assert.ok(context.cases[0].caseId === 'case-001', 'Case 1 ID unchanged');
  assert.ok(context.cases[0].signals.length === 2, 'Case 1 signals unchanged');
  assert.ok(context.cases[1].recommendationDrafts.length === 1, 'Case 2 drafts unchanged');

  console.log('  [PASS] No mutation of GameState');
}

// ---------------------------------------------------------------------------
// Test 7: Boundary guards validate ChoiceSet/WaitingPosture
// ---------------------------------------------------------------------------

function verifyBoundaryGuards() {
  const context = createMockDecisionSupportContext();
  const brokerPOV = buildBrokerPOVSnapshot(context, null);
  const ownerPOV = buildOwnerPOVSnapshot(context);

  const violations = validateAllPOVBoundaries(brokerPOV, ownerPOV);

  // Should have no violations for ChoiceSet/WaitingPosture
  const choiceSetViolations = violations.filter((v) =>
    v.rule.includes('choiceSet') || v.rule.includes('waitingState') ||
    v.rule.includes('choiceset') || v.rule.includes('waitingstate')
  );
  assert.ok(choiceSetViolations.length === 0,
    `Should have no ChoiceSet/WaitingPosture violations, got: ${JSON.stringify(choiceSetViolations)}`);

  console.log('  [PASS] Boundary guards validate ChoiceSet/WaitingPosture');
}

// ---------------------------------------------------------------------------
// Test 8: WaitingPosture kinds are valid
// ---------------------------------------------------------------------------

function verifyWaitingPostureKinds() {
  const validPostures = [
    'not_waiting',
    'wait_observe',
    'wait_for_better_offer',
    'wait_for_family',
    'wait_for_market_signal',
    'avoid_decision',
    'stuck_conflicted',
  ];

  const context = createMockDecisionSupportContext();
  const brokerPOV = buildBrokerPOVSnapshot(context, null);

  for (const caseCtx of brokerPOV.cases) {
    assert.ok(
      validPostures.includes(caseCtx.waitingState.posture),
      `WaitingPosture ${caseCtx.waitingState.posture} must be valid`
    );
  }

  console.log('  [PASS] WaitingPosture kinds are valid');
}

// ---------------------------------------------------------------------------
// Test 9: ChoiceSetSource kinds are valid
// ---------------------------------------------------------------------------

function verifyChoiceSetSourceKinds() {
  const validSources = ['self', 'broker-framed', 'system-default', 'inferred-from-pressure'];

  const context = createMockDecisionSupportContext();
  const brokerPOV = buildBrokerPOVSnapshot(context, null);

  for (const caseCtx of brokerPOV.cases) {
    assert.ok(
      validSources.includes(caseCtx.choiceSet.source),
      `ChoiceSetSource ${caseCtx.choiceSet.source} must be valid`
    );
    for (const alt of caseCtx.choiceSet.alternatives) {
      assert.ok(
        validSources.includes(alt.source),
        `Alternative source ${alt.source} must be valid`
      );
    }
  }

  console.log('  [PASS] ChoiceSetSource kinds are valid');
}

// ---------------------------------------------------------------------------
// Test 10: Layer imports are clean
// ---------------------------------------------------------------------------

function verifyLayerImports() {
  // This test verifies that the import structure is correct
  // The actual layer import verification is done by verify-selling-houses-layer-imports.ts
  // Here we just verify that the modules can be imported without errors
  assert.ok(buildBrokerPOVSnapshot, 'buildBrokerPOVSnapshot must be importable');
  assert.ok(buildOwnerPOVSnapshot, 'buildOwnerPOVSnapshot must be importable');
  assert.ok(validateAllPOVBoundaries, 'validateAllPOVBoundaries must be importable');

  console.log('  [PASS] Layer imports are clean');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

console.log('Verifying selling-houses ChoiceSet/WaitingPosture boundary contract...');

verifyBrokerChoiceSetStructure();
verifyOwnerChoiceSetBoundary();
verifyWaitingPostureDerivation();
verifyAlternativeDraftMapping();
verifyChoiceSetConstraints();
verifyNoMutation();
verifyBoundaryGuards();
verifyWaitingPostureKinds();
verifyChoiceSetSourceKinds();
verifyLayerImports();

console.log('selling-houses ChoiceSet/WaitingPosture boundary verification passed');
