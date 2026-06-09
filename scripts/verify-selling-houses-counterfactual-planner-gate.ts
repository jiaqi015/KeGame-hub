/**
 * Counterfactual Planner Gate
 *
 * Proves the first "try action futures before acting" slice:
 *   real GameState clone -> candidate action paths -> horizon advance -> ranked outcomes.
 *
 * Usage: npx tsx scripts/verify-selling-houses-counterfactual-planner-gate.ts
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  ROUND17_SEED,
  buildMarketEconomyWorld,
} from './verify-selling-houses-round17-market-economy-gate-core.js';
import {
  buildCounterfactualPlannerProjection,
} from '../src/selling-houses/application/counterfactualPlanner.js';
import { isCaseActiveByCanonicalStatus } from '../src/selling-houses/domain/caseLifecycleStatusRead.js';
import { updateDerivedState } from '../src/selling-houses/application/gameState.js';

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(condition: boolean, message: string) {
  if (condition) {
    passed += 1;
    console.log(`  ✅ ${message}`);
  } else {
    failed += 1;
    failures.push(message);
    console.error(`  ❌ ${message}`);
  }
}

function section(title: string) {
  console.log(`\n━━━ ${title} ━━━`);
}

function readSrc(rel: string): string {
  return readFileSync(resolve(import.meta.dirname ?? '.', '..', rel), 'utf-8');
}

function stablePlanShape(projection: ReturnType<typeof buildCounterfactualPlannerProjection>) {
  return projection.plans.map((plan) => ({
    actions: plan.actionSequence.map((step) => `${step.actionId}:${step.success}`),
    score: plan.delta.score,
    closedDealDelta: plan.delta.closedDealDelta,
    intentDelta: plan.delta.intentDelta,
    confidenceDelta: plan.delta.confidenceDelta,
    failedActionCount: plan.delta.failedActionCount,
  }));
}

console.log('╔══════════════════════════════════════════════════════════════════╗');
console.log('║  Counterfactual Planner Gate                                    ║');
console.log('╚══════════════════════════════════════════════════════════════════╝');

const world = buildMarketEconomyWorld(ROUND17_SEED);
updateDerivedState(world);
const activeCase = world.cases.find((caseItem) => isCaseActiveByCanonicalStatus(world, caseItem));
if (!activeCase) {
  throw new Error('No active case found for counterfactual planner gate');
}

section('1. SINGLE-ACTION FUTURES — compare multiple candidates without mutating input');
const beforeJson = JSON.stringify(world);
const projection = buildCounterfactualPlannerProjection({
  state: world,
  caseId: activeCase.id,
  horizonDays: 3,
  maxPlans: 5,
  candidateActionIds: [
    'first-visit',
    'weekly-feedback',
    'pricing-advice',
    'private-referral',
    'broker-broadcast',
  ],
});
const afterJson = JSON.stringify(world);

check(projection.projectionKind === 'counterfactual_planner', 'projection kind is counterfactual_planner');
check(projection.readOnly === true, 'projection declares readOnly');
check(beforeJson === afterJson, 'planner does not mutate input GameState');
check(projection.comparedPlanCount >= 3, `compares at least 3 plans (${projection.comparedPlanCount})`);
check(projection.baseline !== null, 'no-action baseline exists');
check(projection.topPlan !== null, 'topPlan exists');
check(projection.plans.every((plan) => plan.actionSequence.length >= 1), 'every plan has action trace');
check(projection.plans.some((plan) => plan.actionSequence.some((step) => step.success)), 'at least one simulated action succeeds');
check(projection.plans.some((plan) => plan.delta.newCausalEventCount > 0 || plan.delta.newSourceRecordCount > 0), 'at least one plan emits new evidence');
check(projection.plans.every((plan, index, plans) => index === 0 || plans[index - 1].delta.score >= plan.delta.score), 'plans are ranked by score descending');
check(projection.topPlan?.delta.score === projection.plans[0]?.delta.score, 'topPlan matches first ranked plan');
check(
  projection.topPlan !== null
    && projection.baseline !== null
    && projection.topPlan.delta.score === projection.topPlan.delta.absoluteScore - projection.baseline.delta.absoluteScore,
  'topPlan score is lift over no-action baseline',
);
check(projection.topPlan?.actionSequence.some((step) => step.success) === true, 'topPlan is backed by at least one successful action');
check(projection.topPlan?.startingSnapshot.day === world.day, 'topPlan starts from current day');
check((projection.topPlan?.outcomeSnapshot.day ?? 0) >= world.day, 'topPlan has horizon outcome day');
check((projection.topPlan?.explanation.rationale.length ?? 0) > 0, 'topPlan has rationale');

section('2. MULTI-STEP PATH — can try a short sequence with days between actions');
const sequenceProjection = buildCounterfactualPlannerProjection({
  state: world,
  caseId: activeCase.id,
  horizonDays: 2,
  daysBetweenActions: 1,
  maxPlans: 3,
  candidatePaths: [
    ['first-visit', 'pricing-advice'],
    ['weekly-feedback', 'private-referral'],
    ['broker-broadcast'],
  ],
});

check(sequenceProjection.comparedPlanCount >= 2, `compares sequence plans (${sequenceProjection.comparedPlanCount})`);
check(sequenceProjection.plans.some((plan) => plan.actionSequence.length >= 2), 'at least one plan includes a two-action path');
check(sequenceProjection.plans.every((plan) => plan.horizonDays === 2), 'sequence plans preserve requested horizon');
check(sequenceProjection.plans.some((plan) => plan.delta.failedActionCount === 0), 'at least one sequence path is fully executable');

section('3. DETERMINISM — same input produces same ranked shape');
const projectionAgain = buildCounterfactualPlannerProjection({
  state: world,
  caseId: activeCase.id,
  horizonDays: 3,
  maxPlans: 5,
  candidateActionIds: [
    'first-visit',
    'weekly-feedback',
    'pricing-advice',
    'private-referral',
    'broker-broadcast',
  ],
});
check(
  JSON.stringify(stablePlanShape(projection)) === JSON.stringify(stablePlanShape(projectionAgain)),
  'same input produces same ranked plan shape',
);

section('4. BOUNDARIES — no external truth source or soft-pass gate');
const plannerSrc = readSrc('src/selling-houses/application/counterfactualPlanner.ts');
const gateSrc = readSrc('scripts/verify-selling-houses-counterfactual-planner-gate.ts');
const gateSrcNoComments = gateSrc
  .replace(/\/\/.*$/gm, '')
  .replace(/\/\*[\s\S]*?\*\//g, '');
const softOrPassPattern = ['|', '|', ' true'].join('');
const hardcodedCheckPattern = new RegExp(`check\\(\\s*${['t', 'r', 'u', 'e'].join('')}\\s*,`);

check(!plannerSrc.includes('Math.random'), 'planner has no Math.random');
check(!plannerSrc.includes('Date.now'), 'planner has no Date.now');
check(!plannerSrc.includes('fetch('), 'planner does not fetch external data');
check(!plannerSrc.includes('modelRuntime'), 'planner does not call model runtime');
check(!gateSrcNoComments.includes(softOrPassPattern), 'gate source has no soft OR pass pattern');
check(!gateSrcNoComments.match(hardcodedCheckPattern), 'gate source has no hardcoded passing check');

console.log('\n═══════════════════════════════════════════════════════════════');
console.log(`  Counterfactual Planner Gate Passed: ${passed} | Failed: ${failed}`);
console.log('═══════════════════════════════════════════════════════════════');

if (failed > 0) {
  console.error('\n  ❌ GATE FAILED:');
  for (const failure of failures) console.error(`    • ${failure}`);
  process.exit(1);
}

console.log('\n  ✅ GATE PASSED — counterfactual planner compares action futures');
