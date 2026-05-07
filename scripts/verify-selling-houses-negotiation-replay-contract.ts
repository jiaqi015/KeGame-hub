/**
 * NegotiationReplay v0 contract verification.
 *
 * Validates:
 * 1. All types compile
 * 2. buildNegotiationReplay builds correctly
 * 3. Steps and turns work
 * 4. Outcome types work
 * 5. Deterministic and frozen
 * 6. Core boundary clean
 * 7. Business test cases
 */

import { readFileSync } from 'node:fs';

import {
  buildNegotiationReplay,
  type NegotiationReplay,
  type NegotiationReplayStep,
  type NegotiationReplayTurn,
  type NegotiationReplayOutcome,
  type NegotiationReplayBlocker,
} from '../src/selling-houses/core/world-state/strategy/index.js';

let passed = 0;
let failed = 0;

function check(condition: boolean, message: string) {
  if (condition) { passed++; }
  else { failed++; console.error(`  [FAIL] ${message}`); }
}

// ---------------------------------------------------------------------------
// 1. Type compilation
// ---------------------------------------------------------------------------

console.log('=== Check 1: Type compilation ===');

const turn: NegotiationReplayTurn = {
  turnId: 'turn-1',
  day: 5,
  actorId: 'broker:current',
  actorKind: 'broker',
  actionKind: 'owner_call',
  actionDescription: '调价沟通',
  evidenceRefs: ['receipt-1'],
  beliefChanges: [{
    beliefKind: 'broker_trust',
    previousConfidence: 0.5,
    newConfidence: 0.7,
    direction: 'strengthened',
  }],
  commitmentChanges: [{
    commitmentId: 'cm-1',
    kind: 'timeline_agreement',
    action: 'created',
  }],
  outcome: 'positive',
};
check(typeof turn.turnId === 'string', 'NegotiationReplayTurn compiles');

const blocker: NegotiationReplayBlocker = {
  blockerId: 'b1',
  kind: 'owner_hesitation',
  description: '业主犹豫',
  severity: 'medium',
  resolved: false,
};
check(typeof blocker.blockerId === 'string', 'NegotiationReplayBlocker compiles');

console.log('  Type compilation: PASS');

// ---------------------------------------------------------------------------
// 2. buildNegotiationReplay
// ---------------------------------------------------------------------------

console.log('=== Check 2: buildNegotiationReplay ===');

const replay = buildNegotiationReplay({
  caseId: 'case-1',
  processRunId: 'run-1',
  startedDay: 5,
  endedDay: 10,
  steps: [
    {
      stepId: 'step-1',
      day: 5,
      phase: 'price-gap-identified',
      turns: [{
        turnId: 'turn-1',
        day: 5,
        actorId: 'broker:current',
        actorKind: 'broker',
        actionKind: 'price_report',
        actionDescription: '展示市场数据',
        evidenceRefs: ['eval-1'],
        beliefChanges: [],
        commitmentChanges: [],
        outcome: 'positive',
      }],
      blockers: [],
      outcome: 'proceeded',
    },
    {
      stepId: 'step-2',
      day: 7,
      phase: 'owner-considering',
      turns: [{
        turnId: 'turn-2',
        day: 7,
        actorId: 'owner:case-1',
        actorKind: 'owner',
        actionKind: 'observation',
        actionDescription: '业主考虑中',
        evidenceRefs: [],
        beliefChanges: [{
          beliefKind: 'price_anchor',
          previousConfidence: 0.8,
          newConfidence: 0.5,
          direction: 'weakened',
        }],
        commitmentChanges: [],
        outcome: 'neutral',
      }],
      blockers: [{
        blockerId: 'b-1',
        kind: 'owner_hesitation',
        description: '业主犹豫',
        severity: 'medium',
        resolved: false,
      }],
      outcome: 'stalled',
    },
    {
      stepId: 'step-3',
      day: 10,
      phase: 'price-adjusted',
      turns: [{
        turnId: 'turn-3',
        day: 10,
        actorId: 'broker:current',
        actorKind: 'broker',
        actionKind: 'owner_call',
        actionDescription: '最终确认',
        evidenceRefs: ['receipt-1'],
        beliefChanges: [],
        commitmentChanges: [{
          commitmentId: 'cm-1',
          kind: 'timeline_agreement',
          action: 'created',
        }],
        outcome: 'positive',
      }],
      blockers: [],
      outcome: 'proceeded',
    },
  ],
  outcome: {
    outcomeType: 'signed',
    description: '成交签约',
    totalDays: 5,
    totalTurns: 3,
    totalBlockers: 1,
    resolvedBlockers: 0,
    relatedConsensusId: 'consensus-1',
    relatedContractFactId: 'contract-1',
  },
});

check(replay.replayId.startsWith('replay:'), 'replay: replayId format');
check(replay.caseId === 'case-1', 'replay: caseId');
check(replay.processRunId === 'run-1', 'replay: processRunId');
check(replay.startedDay === 5, 'replay: startedDay=5');
check(replay.endedDay === 10, 'replay: endedDay=10');
check(replay.steps.length === 3, 'replay: 3 steps');
check(replay.outcome !== undefined, 'replay: has outcome');
check(replay.outcome!.outcomeType === 'signed', 'replay: outcome signed');
check(replay.outcome!.totalDays === 5, 'replay: totalDays=5');
check(replay.outcome!.totalTurns === 3, 'replay: totalTurns=3');
check(replay.outcome!.relatedConsensusId === 'consensus-1', 'replay: relatedConsensusId');
check(replay.outcome!.relatedContractFactId === 'contract-1', 'replay: relatedContractFactId');
check(Object.isFrozen(replay), 'replay: frozen');
check(Object.isFrozen(replay.steps), 'replay: steps frozen');

// Check step details
const step0 = replay.steps[0];
check(step0.stepId === 'step-1', 'step0: stepId');
check(step0.phase === 'price-gap-identified', 'step0: phase');
check(step0.turns.length === 1, 'step0: 1 turn');
check(step0.blockers.length === 0, 'step0: no blockers');
check(step0.outcome === 'proceeded', 'step0: outcome=proceeded');

const step1 = replay.steps[1];
check(step1.turns[0].beliefChanges.length === 1, 'step1: 1 belief change');
check(step1.turns[0].beliefChanges[0].direction === 'weakened', 'step1: belief weakened');
check(step1.blockers.length === 1, 'step1: 1 blocker');
check(step1.outcome === 'stalled', 'step1: outcome=stalled');

console.log('  buildNegotiationReplay: PASS');

// ---------------------------------------------------------------------------
// 3. All outcome types
// ---------------------------------------------------------------------------

console.log('=== Check 3: All outcome types ===');

const allOutcomeTypes: NegotiationReplayOutcome['outcomeType'][] = [
  'signed', 'collapsed', 'blocked', 'expired', 'withdrawn',
];

for (const outcomeType of allOutcomeTypes) {
  const r = buildNegotiationReplay({
    caseId: 'case-test',
    startedDay: 1,
    steps: [],
    outcome: {
      outcomeType,
      description: `test ${outcomeType}`,
      totalDays: 1,
      totalTurns: 0,
      totalBlockers: 0,
      resolvedBlockers: 0,
    },
  });
  check(r.outcome!.outcomeType === outcomeType, `outcome ${outcomeType}: compiles`);
}

console.log('  All outcome types: PASS');

// ---------------------------------------------------------------------------
// 4. All turn outcomes
// ---------------------------------------------------------------------------

console.log('=== Check 4: All turn outcomes ===');

const allTurnOutcomes: NegotiationReplayTurn['outcome'][] = [
  'positive', 'negative', 'neutral', 'blocked',
];

for (const outcome of allTurnOutcomes) {
  const r = buildNegotiationReplay({
    caseId: 'case-test',
    startedDay: 1,
    steps: [{
      stepId: 'step-test',
      day: 1,
      phase: 'test',
      turns: [{
        turnId: `turn-${outcome}`,
        day: 1,
        actorId: 'broker:current',
        actorKind: 'broker',
        actionKind: 'test',
        actionDescription: 'test',
        evidenceRefs: [],
        beliefChanges: [],
        commitmentChanges: [],
        outcome,
      }],
      blockers: [],
      outcome: 'proceeded',
    }],
  });
  check(r.steps[0].turns[0].outcome === outcome, `turn outcome ${outcome}: compiles`);
}

console.log('  All turn outcomes: PASS');

// ---------------------------------------------------------------------------
// 5. All step outcomes
// ---------------------------------------------------------------------------

console.log('=== Check 5: All step outcomes ===');

const allStepOutcomes: NegotiationReplayStep['outcome'][] = [
  'proceeded', 'stalled', 'blocked', 'collapsed',
];

for (const outcome of allStepOutcomes) {
  const r = buildNegotiationReplay({
    caseId: 'case-test',
    startedDay: 1,
    steps: [{
      stepId: `step-${outcome}`,
      day: 1,
      phase: 'test',
      turns: [],
      blockers: [],
      outcome,
    }],
  });
  check(r.steps[0].outcome === outcome, `step outcome ${outcome}: compiles`);
}

console.log('  All step outcomes: PASS');

// ---------------------------------------------------------------------------
// 6. Deterministic and frozen
// ---------------------------------------------------------------------------

console.log('=== Check 6: Deterministic and frozen ===');

const input = {
  caseId: 'case-det',
  startedDay: 1,
  steps: [{
    stepId: 'step-det',
    day: 1,
    phase: 'test',
    turns: [{
      turnId: 'turn-det',
      day: 1,
      actorId: 'broker:current',
      actorKind: 'broker' as const,
      actionKind: 'test',
      actionDescription: 'test',
      evidenceRefs: [],
      beliefChanges: [],
      commitmentChanges: [],
      outcome: 'positive' as const,
    }],
    blockers: [],
    outcome: 'proceeded' as const,
  }],
};

const a = buildNegotiationReplay(input);
const b = buildNegotiationReplay(input);
check(a.caseId === b.caseId, 'deterministic: same caseId');
check(a.startedDay === b.startedDay, 'deterministic: same startedDay');
check(a.steps.length === b.steps.length, 'deterministic: same steps');

check(Object.isFrozen(a), 'frozen: replay frozen');
check(Object.isFrozen(a.steps), 'frozen: steps frozen');
check(Object.isFrozen(a.steps[0].turns), 'frozen: turns frozen');
check(Object.isFrozen(a.steps[0].blockers), 'frozen: blockers frozen');

console.log('  Deterministic and frozen: PASS');

// ---------------------------------------------------------------------------
// 7. Core boundary
// ---------------------------------------------------------------------------

console.log('=== Check 7: Core boundary ===');

const src = readFileSync(
  '/Users/jiaqi/Documents/开放日测算/src/selling-houses/core/world-state/strategy/models.ts', 'utf-8');
const srcWithoutComments = src.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
check(!srcWithoutComments.includes("from '../../domain"), 'no domain imports');
check(!srcWithoutComments.includes("from '../../runtime"), 'no runtime imports');
check(!srcWithoutComments.includes('Date.now'), 'no Date.now');
check(!srcWithoutComments.includes('Math.random'), 'no Math.random');

console.log('  Core boundary: PASS');

// ---------------------------------------------------------------------------
// 8. Business test cases
// ---------------------------------------------------------------------------

console.log('=== Check 8: Business test cases ===');

// Case 1: successful negotiation replay
const successReplay = buildNegotiationReplay({
  caseId: 'case-success',
  processRunId: 'run-success',
  startedDay: 5,
  endedDay: 12,
  steps: [
    {
      stepId: 'step-1',
      day: 5,
      phase: 'consensus-formed',
      turns: [{
        turnId: 'turn-1',
        day: 5,
        actorId: 'broker:current',
        actorKind: 'broker',
        actionKind: 'negotiation',
        actionDescription: '报价沟通',
        evidenceRefs: ['receipt-1'],
        beliefChanges: [{ beliefKind: 'price_anchor', previousConfidence: 0.8, newConfidence: 0.6, direction: 'weakened' }],
        commitmentChanges: [],
        outcome: 'positive',
      }],
      blockers: [],
      outcome: 'proceeded',
    },
    {
      stepId: 'step-2',
      day: 8,
      phase: 'negotiation-active',
      turns: [{
        turnId: 'turn-2',
        day: 8,
        actorId: 'owner:case-1',
        actorKind: 'owner',
        actionKind: 'observation',
        actionDescription: '业主考虑',
        evidenceRefs: [],
        beliefChanges: [],
        commitmentChanges: [{ commitmentId: 'cm-1', kind: 'price_hold', action: 'weakened', previousStrength: 80, newStrength: 50 }],
        outcome: 'neutral',
      }],
      blockers: [{
        blockerId: 'b-1',
        kind: 'owner_hesitation',
        description: '业主犹豫',
        severity: 'medium',
        resolvedDay: 10,
        resolved: true,
      }],
      outcome: 'stalled',
    },
    {
      stepId: 'step-3',
      day: 12,
      phase: 'contract-signed',
      turns: [{
        turnId: 'turn-3',
        day: 12,
        actorId: 'broker:current',
        actorKind: 'broker',
        actionKind: 'negotiation',
        actionDescription: '最终签约',
        evidenceRefs: ['contract-1'],
        beliefChanges: [],
        commitmentChanges: [{ commitmentId: 'cm-2', kind: 'offer_readiness', action: 'created' }],
        outcome: 'positive',
      }],
      blockers: [],
      outcome: 'proceeded',
    },
  ],
  outcome: {
    outcomeType: 'signed',
    description: '成交签约',
    totalDays: 7,
    totalTurns: 3,
    totalBlockers: 1,
    resolvedBlockers: 1,
    relatedConsensusId: 'consensus-1',
    relatedContractFactId: 'contract-1',
  },
});

check(successReplay.outcome!.outcomeType === 'signed', 'success: signed');
check(successReplay.steps.length === 3, 'success: 3 steps');
check(successReplay.steps[1].blockers[0].resolved === true, 'success: blocker resolved');
check(successReplay.outcome!.resolvedBlockers === 1, 'success: 1 resolved blocker');

// Case 2: collapsed negotiation replay
const collapsedReplay = buildNegotiationReplay({
  caseId: 'case-collapsed',
  startedDay: 1,
  endedDay: 5,
  steps: [
    {
      stepId: 'step-1',
      day: 1,
      phase: 'consensus-formed',
      turns: [{
        turnId: 'turn-1',
        day: 1,
        actorId: 'broker:current',
        actorKind: 'broker',
        actionKind: 'negotiation',
        actionDescription: '报价沟通',
        evidenceRefs: [],
        beliefChanges: [],
        commitmentChanges: [],
        outcome: 'positive',
      }],
      blockers: [],
      outcome: 'proceeded',
    },
    {
      stepId: 'step-2',
      day: 3,
      phase: 'negotiation-active',
      turns: [{
        turnId: 'turn-2',
        day: 3,
        actorId: 'owner:case-1',
        actorKind: 'owner',
        actionKind: 'observation',
        actionDescription: '业主拒绝',
        evidenceRefs: [],
        beliefChanges: [{ beliefKind: 'price_anchor', previousConfidence: 0.6, newConfidence: 0.9, direction: 'strengthened' }],
        commitmentChanges: [],
        outcome: 'negative',
      }],
      blockers: [{
        blockerId: 'b-1',
        kind: 'price_gap_irreconcilable',
        description: '价格差距不可调和',
        severity: 'high',
        resolved: false,
      }],
      outcome: 'collapsed',
    },
  ],
  outcome: {
    outcomeType: 'collapsed',
    description: '共识破裂',
    totalDays: 2,
    totalTurns: 2,
    totalBlockers: 1,
    resolvedBlockers: 0,
  },
});

check(collapsedReplay.outcome!.outcomeType === 'collapsed', 'collapsed: outcome');
check(collapsedReplay.steps[1].outcome === 'collapsed', 'collapsed: step outcome');
check(collapsedReplay.steps[1].blockers[0].resolved === false, 'collapsed: blocker unresolved');

console.log('  Business test cases: PASS');

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log(`\n=== Summary ===`);
console.log(`Total: ${passed + failed}, Passed: ${passed}, Failed: ${failed}`);

if (failed > 0) {
  console.log('\nRESULT: FAIL');
  process.exit(1);
} else {
  console.log('\nselling-houses negotiation-replay contract verification passed');
  process.exit(0);
}
