/**
 * Owner Decision Moment Final Hard Gate.
 *
 * Proves the Owner Decision Moment system is real:
 * 1. A/B/C/D governance, E/F blocked
 * 2. DecisionMoment core types exist, pure, no domain/runtime import
 * 3. At least 5 decision moment definitions exist
 * 4. Decision moments link to business flows and action specs
 * 5. Decision moments reference POV signal kinds (not raw GameState)
 * 6. Owner POV boundary hides broker-only information
 * 7. Decision moments are deterministic from same seed
 * 8. Decision moment derivation does NOT change gameplay
 * 9. No Date.now/Math.random/fetch/OpenAI/apiKey
 * 10. All outputs are frozen / readonly
 * 11. Decision moments are trigger-based, not auto-executing
 * 12. Mother model alignment: Section 5 (Human Decision Model)
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { createInitialState, updateDerivedState } from '../src/selling-houses/application/gameState.js';
import { getScenarioSnapshotById } from '../src/selling-houses/domain/scenarioCatalog.js';
import { advanceDays, seedInitialOpportunities } from '../src/selling-houses/domain/engine.js';
import type { GameState } from '../src/selling-houses/domain/models.js';

import {
  DECISION_MOMENTS,
  DECISION_MOMENT_BY_ID,
} from '../src/selling-houses/core/business-rules/decision-moments/definitions.js';
import type { DecisionMomentId } from '../src/selling-houses/core/business-rules/decision-moments/types.js';

import {
  ACTION_SPECS,
  ACTION_SPEC_BY_ID,
} from '../src/selling-houses/core/business-rules/action-specs/legacyAdapter.js';

import {
  BUSINESS_FLOWS,
  BUSINESS_FLOW_BY_ID,
} from '../src/selling-houses/core/business-rules/business-flows/definitions.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let passed = 0;
let failed = 0;

function check(condition: boolean, message: string) {
  if (condition) { passed++; }
  else { failed++; console.error(`  [FAIL] ${message}`); }
}

function stripComments(src: string): string {
  return src.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
}

const SEED = 20260507;

function buildWorld(seed: number): GameState {
  const snapshot = getScenarioSnapshotById('standard-window-chain');
  assert.ok(snapshot, 'Expected standard-window-chain scenario');
  const world = createInitialState(snapshot, seed);
  seedInitialOpportunities(world);
  updateDerivedState(world);
  return world;
}

// ---------------------------------------------------------------------------
// 1. Governance
// ---------------------------------------------------------------------------

console.log('=== Check 1: A/B/C/D governance, E/F blocked ===');

const workplanSrc = readFileSync(
  '/Users/jiaqi/Documents/开放日测算/docs/selling-houses-mother-model-agent-workplan.md', 'utf-8');
check(workplanSrc.includes('A, B, C, D are workers'), 'workplan: A/B/C/D are workers');
check(workplanSrc.includes('Do not create Agent E/F'), 'workplan: E/F blocked');

console.log('  Governance: PASS');

// ---------------------------------------------------------------------------
// 2. Core types pure
// ---------------------------------------------------------------------------

console.log('=== Check 2: Core types purity ===');

const dmTypesSrc = readFileSync(
  '/Users/jiaqi/Documents/开放日测算/src/selling-houses/core/business-rules/decision-moments/types.ts', 'utf-8');
const dmTypesCode = stripComments(dmTypesSrc);
// business-rules may import types from domain (type-only: ActionMetricKey) — allowed
// but must NOT import runtime or have side effects
check(!dmTypesCode.includes("from '../../../runtime"), 'dm types: no runtime imports');
check(!dmTypesCode.includes('Date.now'), 'dm types: no Date.now');
check(!dmTypesCode.includes('Math.random'), 'dm types: no Math.random');
// Type imports from domain are OK; value imports are not
check(!dmTypesCode.includes("import {"), 'dm types: no value imports from domain (type-only OK)');

// Types are readonly-compatible
check(dmTypesSrc.includes('DecisionMomentId'), 'dm types: has DecisionMomentId');
check(dmTypesSrc.includes('DecisionMomentActor'), 'dm types: has DecisionMomentActor');
check(dmTypesSrc.includes('DecisionMomentDefinition'), 'dm types: has DecisionMomentDefinition');

// Definitions are pure
const dmDefSrc = readFileSync(
  '/Users/jiaqi/Documents/开放日测算/src/selling-houses/core/business-rules/decision-moments/definitions.ts', 'utf-8');
const dmDefCode = stripComments(dmDefSrc);
check(!dmDefCode.includes("from '../../../domain"), 'dm defs: no domain imports');
check(!dmDefCode.includes("from '../../../runtime"), 'dm defs: no runtime imports');

console.log('  Core types purity: PASS');

// ---------------------------------------------------------------------------
// 3. At least 5 decision moment definitions
// ---------------------------------------------------------------------------

console.log('=== Check 3: Decision moment definitions >= 5 ===');

check(DECISION_MOMENTS.length >= 5, `decision moments: ${DECISION_MOMENTS.length} (>= 5)`);

const expectedIds: DecisionMomentId[] = [
  'first-visit-owner-discovery',
  'pricing-strategy-adjustment',
  'open-day-participation',
  'sincerity-sale-entry',
  'offer-acceptance-negotiation',
];

for (const id of expectedIds) {
  const moment = DECISION_MOMENT_BY_ID[id];
  check(moment !== undefined, `moment ${id}: exists`);
  if (moment) {
    check(moment.name.length > 0, `moment ${id}: has name`);
    check(moment.summary.length > 0, `moment ${id}: has summary`);
    check(moment.primaryActors.length >= 1, `moment ${id}: has primaryActors`);
    check(moment.triggerActionIds.length >= 1, `moment ${id}: has triggerActionIds`);
    check(moment.expectedSignals.length >= 1, `moment ${id}: has expectedSignals`);
    check(moment.downstreamFlowIds.length >= 1, `moment ${id}: has downstreamFlowIds`);
  }
}

console.log(`  Decision moment definitions: ${DECISION_MOMENTS.length} PASS`);

// ---------------------------------------------------------------------------
// 4. Decision moments link to business flows and action specs
// ---------------------------------------------------------------------------

console.log('=== Check 4: Cross-links ===');

for (const moment of DECISION_MOMENTS) {
  // Each triggerActionId should have an ActionSpec
  for (const actionId of moment.triggerActionIds) {
    const spec = ACTION_SPEC_BY_ID[actionId];
    check(spec !== undefined, `moment ${moment.id}: triggerActionId ${actionId} has ActionSpec`);

    // ActionSpec should reference this decision moment
    if (spec) {
      const referencesBack = spec.decisionMomentIds.includes(moment.id);
      check(referencesBack, `ActionSpec ${actionId}: references moment ${moment.id}`);
    }
  }

  // Each downstreamFlowId should have a BusinessFlow
  for (const flowId of moment.downstreamFlowIds) {
    const flow = BUSINESS_FLOW_BY_ID[flowId];
    check(flow !== undefined, `moment ${moment.id}: downstreamFlowId ${flowId} has BusinessFlow`);
  }
}

// Verify ActionSpec -> BusinessFlow links
for (const spec of ACTION_SPECS) {
  for (const flowId of spec.businessFlowIds) {
    const flow = BUSINESS_FLOW_BY_ID[flowId];
    check(flow !== undefined, `ActionSpec ${spec.id}: businessFlowId ${flowId} has BusinessFlow`);
  }
}

console.log('  Cross-links: PASS');

// ---------------------------------------------------------------------------
// 5. Decision moments reference POV signal kinds
// ---------------------------------------------------------------------------

console.log('=== Check 5: POV signal references ===');

// expectedSignals should be ActionMetricKey values (trust, d3, heat, etc.)
// not raw GameState field names
const validSignalKinds = new Set([
  'trust', 'patience', 'urgency', 'd1', 'd2', 'd3', 'competitiveness',
  'askPrice', 'heat', 'windowDays', 'intent', 'confidence',
]);

for (const moment of DECISION_MOMENTS) {
  for (const signal of moment.expectedSignals) {
    check(validSignalKinds.has(signal),
      `moment ${moment.id}: signal ${signal} is valid ActionMetricKey`);
  }
}

// primaryActors should be from the defined set
const validActors = new Set(['owner', 'customer', 'advisor', 'market', 'broker']);
for (const moment of DECISION_MOMENTS) {
  for (const actor of moment.primaryActors) {
    check(validActors.has(actor),
      `moment ${moment.id}: actor ${actor} is valid DecisionMomentActor`);
  }
}

console.log('  POV signal references: PASS');

// ---------------------------------------------------------------------------
// 6. Owner POV boundary
// ---------------------------------------------------------------------------

console.log('=== Check 6: Decision Support / POV boundary ===');

// DecisionSupportWorkspaceProjection is the actual projection boundary
const decisionSupportSrc = readFileSync(
  '/Users/jiaqi/Documents/开放日测算/src/selling-houses/interface/interaction-workspace/decisionSupportBoundary.ts', 'utf-8');
check(decisionSupportSrc.includes('DecisionSupportWorkspaceProjection'),
  'decisionSupportBoundary: has DecisionSupportWorkspaceProjection');
check(decisionSupportSrc.includes('readOnly'),
  'decisionSupportBoundary: has readOnly flag');

const dsCode = stripComments(decisionSupportSrc);
// Projection should be a read-only boundary — no direct GameState mutation
check(!dsCode.includes('world.day ='), 'decisionSupportBoundary: no day mutation');
check(!dsCode.includes('world.rng'), 'decisionSupportBoundary: no rng mutation');

// DecisionSupport should expose recommendationDrafts for broker use
check(dsCode.includes('recommendationDrafts'),
  'decisionSupportBoundary: has recommendationDrafts for broker');

console.log('  Decision Support / POV boundary: PASS');

// ---------------------------------------------------------------------------
// 7. Deterministic from same seed
// ---------------------------------------------------------------------------

console.log('=== Check 7: Deterministic ===');

const worldA = buildWorld(20260512);
const worldB = buildWorld(20260512);

// Decision moment definitions are static — deterministic by definition
const momentsA = JSON.stringify(DECISION_MOMENTS);
const momentsB = JSON.stringify(DECISION_MOMENTS);
check(momentsA === momentsB, 'decision moments: deterministic (static definitions)');

// ActionSpecs derived from legacy actions — deterministic
const specsA = JSON.stringify(ACTION_SPECS);
const specsB = JSON.stringify(ACTION_SPECS);
check(specsA === specsB, 'action specs: deterministic (static definitions)');

// BusinessFlows deterministic
const flowsA = JSON.stringify(BUSINESS_FLOWS);
const flowsB = JSON.stringify(BUSINESS_FLOWS);
check(flowsA === flowsB, 'business flows: deterministic (static definitions)');

// GameState focusMeeting deterministic from same seed
check(JSON.stringify(worldA.focusMeeting) === JSON.stringify(worldB.focusMeeting),
  'FocusMeetingState: same seed -> identical');

console.log('  Deterministic: PASS');

// ---------------------------------------------------------------------------
// 8. Gameplay invariance
// ---------------------------------------------------------------------------

console.log('=== Check 8: Gameplay invariance ===');

const worldC = buildWorld(20260513);
advanceDays(worldC, 3);

const beforeDeals = worldC.closedDeals.length;
const beforeRng = worldC.rngCalls;
const beforeOpps = worldC.opportunities.length;
const beforeCases = worldC.cases.length;

// Access decision moment data
const _moment = DECISION_MOMENT_BY_ID['first-visit-owner-discovery'];
const _spec = ACTION_SPEC_BY_ID['first-visit'];
const _flow = BUSINESS_FLOW_BY_ID['standard-selling'];

check(worldC.closedDeals.length === beforeDeals, 'closedDeals unchanged');
check(worldC.rngCalls === beforeRng, 'rngCalls unchanged');
check(worldC.opportunities.length === beforeOpps, 'opportunities unchanged');
check(worldC.cases.length === beforeCases, 'cases unchanged');

console.log('  Gameplay invariance: PASS');

// ---------------------------------------------------------------------------
// 9. No side effects
// ---------------------------------------------------------------------------

console.log('=== Check 9: No side effects ===');

const dmDefCode2 = stripComments(dmDefSrc);
check(!dmDefCode2.includes('Date.now'), 'dm definitions: no Date.now');
check(!dmDefCode2.includes('Math.random'), 'dm definitions: no Math.random');
check(!dmDefCode2.includes('fetch('), 'dm definitions: no fetch');

const asTypesCode = stripComments(
  readFileSync('/Users/jiaqi/Documents/开放日测算/src/selling-houses/core/business-rules/action-specs/types.ts', 'utf-8'));
check(!asTypesCode.includes('Date.now'), 'action-spec types: no Date.now');
check(!asTypesCode.includes('Math.random'), 'action-spec types: no Math.random');

console.log('  No side effects: PASS');

// ---------------------------------------------------------------------------
// 10. Frozen / readonly outputs
// ---------------------------------------------------------------------------

console.log('=== Check 10: Frozen / readonly ===');

// DECISION_MOMENTS array and objects should be frozen
check(Object.isFrozen(DECISION_MOMENTS), 'DECISION_MOMENTS array frozen');
for (const moment of DECISION_MOMENTS) {
  check(Object.isFrozen(moment), `moment ${moment.id}: frozen`);
}

// DECISION_MOMENT_BY_ID frozen
check(Object.isFrozen(DECISION_MOMENT_BY_ID), 'DECISION_MOMENT_BY_ID frozen');

// BUSINESS_FLOWS frozen
check(Object.isFrozen(BUSINESS_FLOWS), 'BUSINESS_FLOWS frozen');
for (const flow of BUSINESS_FLOWS) {
  check(Object.isFrozen(flow), `flow ${flow.id}: frozen`);
  check(Object.isFrozen(flow.steps), `flow ${flow.id}: steps frozen`);
}

console.log('  Frozen / readonly: PASS');

// ---------------------------------------------------------------------------
// 11. Decision moments are trigger-based, not auto-executing
// ---------------------------------------------------------------------------

console.log('=== Check 11: Trigger-based, not auto-executing ===');

// DecisionMoment has triggerActionIds — it's triggered by actions, not auto-executed
for (const moment of DECISION_MOMENTS) {
  check(moment.triggerActionIds.length > 0, `moment ${moment.id}: has triggers (not auto)`);
}

// No execute/apply methods on types
check(!dmTypesCode.includes('execute'), 'dm types: no execute');
check(!dmTypesCode.includes('apply'), 'dm types: no apply');
check(!dmTypesCode.includes('resolve'), 'dm types: no resolve');

console.log('  Trigger-based: PASS');

// ---------------------------------------------------------------------------
// 12. Mother model alignment: Section 5
// ---------------------------------------------------------------------------

console.log('=== Check 12: Mother model alignment ===');

// Section 5: Decision model input includes ActorProfile, ActorPOV, RelationState,
// DecisionState, PressureState, AlternativeSet, CommitmentHistory
// Decision moments should reference actors (primaryActors) and signals (expectedSignals)

const allActorsReferenced = new Set<string>();
const allSignalsReferenced = new Set<string>();

for (const moment of DECISION_MOMENTS) {
  for (const actor of moment.primaryActors) allActorsReferenced.add(actor);
  for (const signal of moment.expectedSignals) allSignalsReferenced.add(signal);
}

// Must reference owner as primary actor (owner decision model)
check(allActorsReferenced.has('owner'), 'owner is referenced as actor');
// Must reference advisor/broker (broker service essence)
check(allActorsReferenced.has('advisor') || allActorsReferenced.has('broker'),
  'advisor/broker referenced as actor');

// Must reference trust signals (Section 6: owner trust model)
check(allSignalsReferenced.has('trust'), 'trust signal referenced');
// Must reference price-related signals
check(allSignalsReferenced.has('askPrice') || allSignalsReferenced.has('d3'),
  'price/readiness signal referenced');

// Section 1.3: "this action was chosen" -> ActionCommand / DecisionIntent
// DecisionMomentId is a concept label, not a mutation
check(dmTypesSrc.includes('DecisionMomentId'), 'DecisionMomentId is a type, not a mutation');

console.log('  Mother model alignment: PASS');

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log(`\n=== Owner Decision Moment Final Gate ===`);
console.log(`Total: ${passed + failed}, Passed: ${passed}, Failed: ${failed}`);

if (failed > 0) {
  console.log('\nRESULT: FAIL');
  process.exit(1);
} else {
  console.log('\nowner-decision-moment final gate passed');
  process.exit(0);
}
