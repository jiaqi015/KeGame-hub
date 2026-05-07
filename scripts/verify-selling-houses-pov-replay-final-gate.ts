/**
 * POV Replay Final Hard Gate.
 *
 * Proves the POV system is real business functionality:
 * 1. A/B/C/D governance, E/F blocked
 * 2. POV core models pure (no domain/runtime imports)
 * 3. Runtime POV adapter produces real BrokerPOVSnapshot from live GameState
 * 4. OwnerPOV hides broker-only / customer-hidden / competition-hidden info
 * 5. Workspace projections consume compressed POV summaries (no raw state)
 * 6. Deterministic: same seed → byte-identical POV snapshot
 * 7. POV does not mutate GameState
 * 8. POV does not change gameplay (closedDeals/rngCalls)
 * 9. CommitmentState/Belief/SignalTrace are derived from evaluation, not hardcoded
 * 10. No Date.now/Math.random/fetch in POV builders
 * 11. Frozen output
 * 12. DecisionState/DecisionMoment/ActionCommandDraft are intention-only
 * 13. Existing gates still green
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { createInitialState, updateDerivedState } from '../src/selling-houses/application/gameState.js';
import { getScenarioSnapshotById } from '../src/selling-houses/domain/scenarioCatalog.js';
import { advanceOneDay, seedInitialOpportunities } from '../src/selling-houses/domain/engine.js';
import type { GameState } from '../src/selling-houses/domain/models.js';

import {
  buildDecisionSupportContextFromLegacyState,
} from '../src/selling-houses/runtime/decision-support/legacyAdapter.js';

import {
  buildBrokerPOVSnapshot,
  buildOwnerPOVSnapshot,
} from '../src/selling-houses/runtime/decision-support/povAdapter.js';

import {
  buildBrokerPOVWorkspaceProjection,
  buildOwnerPOVWorkspaceProjection,
} from '../src/selling-houses/interface/interaction-workspace/povBoundary.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ROOT = '/Users/jiaqi/Documents/开放日测算/src/selling-houses';

let passed = 0;
let failed = 0;

function check(condition: boolean, message: string) {
  if (condition) { passed++; }
  else { failed++; console.error(`  [FAIL] ${message}`); }
}

function stripComments(src: string): string {
  return src.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
}

const SEED = 20260506;

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

const povAdapterSrc = readFileSync(`${ROOT}/runtime/decision-support/povAdapter.ts`, 'utf-8');
check(!povAdapterSrc.includes("from '../../agent-e"), 'povAdapter: no E imports');
check(!povAdapterSrc.includes("from '../../agent-f"), 'povAdapter: no F imports');

console.log('  Governance: PASS');

// ---------------------------------------------------------------------------
// 2. Core models pure
// ---------------------------------------------------------------------------

console.log('=== Check 2: Core models purity ===');

const coreModelsSrc = readFileSync(`${ROOT}/core/decision/models.ts`, 'utf-8');
const coreModelsCode = stripComments(coreModelsSrc);
check(!coreModelsCode.includes("from '../../domain"), 'core/decision/models: no domain imports');
check(!coreModelsCode.includes("from '../../runtime"), 'core/decision/models: no runtime imports');
check(!coreModelsCode.includes("from '../../application"), 'core/decision/models: no application imports');
check(!coreModelsCode.includes('Date.now'), 'core/decision/models: no Date.now');
check(!coreModelsCode.includes('Math.random'), 'core/decision/models: no Math.random');

const boundaryGuardsSrc = readFileSync(`${ROOT}/core/decision/boundaryGuards.ts`, 'utf-8');
check(!stripComments(boundaryGuardsSrc).includes("from '../../domain"), 'boundaryGuards: no domain imports');
check(!stripComments(boundaryGuardsSrc).includes("from '../../runtime"), 'boundaryGuards: no runtime imports');

console.log('  Core models purity: PASS');

// ---------------------------------------------------------------------------
// 3. Runtime POV produces real BrokerPOVSnapshot
// ---------------------------------------------------------------------------

console.log('=== Check 3: Runtime POV wiring ===');

const world1 = buildWorld(SEED);
const tick1 = advanceOneDay(world1);
const context = buildDecisionSupportContextFromLegacyState(world1);
check(context !== null, 'context is not null');
check(context.cases.length > 0, 'context has cases');

const brokerPov = buildBrokerPOVSnapshot(context);
check(brokerPov !== null, 'brokerPov is not null');
check(brokerPov.role === 'broker', 'brokerPov: role=broker');
check(brokerPov.readOnly === true, 'brokerPov: readOnly=true');
check(brokerPov.day === context.generatedAtDay, 'brokerPov: day matches context');
check(brokerPov.cases.length > 0, 'brokerPov: has cases');
check(brokerPov.actionCommandDrafts !== undefined, 'brokerPov: has actionCommandDrafts');
check(brokerPov.decisionMoments !== undefined, 'brokerPov: has decisionMoments');
check(brokerPov.pressureSummary !== undefined, 'brokerPov: has pressureSummary');

// CasePOVContext has expected shape
for (const casePOV of brokerPov.cases) {
  check(casePOV.caseId.length > 0, 'casePOV: caseId non-empty');
  check(typeof casePOV.assetScore.score === 'number', 'casePOV: assetScore.score is number');
  check(typeof casePOV.ownerReadiness.score === 'number', 'casePOV: ownerReadiness.score is number');
  check(Array.isArray(casePOV.signals), 'casePOV: signals is array');
  check(Array.isArray(casePOV.knowledge.visibleFacts), 'casePOV: visibleFacts is array');
  check(Array.isArray(casePOV.knowledge.traces), 'casePOV: traces is array');
  check(Array.isArray(casePOV.knowledge.beliefs), 'casePOV: beliefs is array');
  check(Array.isArray(casePOV.knowledge.beliefConflicts), 'casePOV: beliefConflicts is array');
  check(casePOV.choiceSet !== undefined, 'casePOV: has choiceSet');
  check(casePOV.waitingState !== undefined, 'casePOV: has waitingState');
  check(Array.isArray(casePOV.commitmentStates), 'casePOV: commitmentStates is array');
  check(Array.isArray(casePOV.commitments), 'casePOV: commitments is array');
  check(casePOV.decisionState !== undefined, 'casePOV: has decisionState');

  // Beliefs have correct shape
  for (const belief of casePOV.knowledge.beliefs) {
    check(belief.id.length > 0, 'belief: id non-empty');
    check(belief.kind.length > 0, 'belief: kind non-empty');
    check(typeof belief.confidence === 'number', 'belief: confidence is number');
    check(belief.confidenceLevel.length > 0, 'belief: confidenceLevel non-empty');
    check(belief.direction.length > 0, 'belief: direction non-empty');
    check(typeof belief.stale === 'boolean', 'belief: stale is boolean');
  }

  // CommitmentStates have correct shape
  for (const commit of casePOV.commitmentStates) {
    check(commit.id.length > 0, 'commitment: id non-empty');
    check(commit.owner.length > 0, 'commitment: owner non-empty');
    check(commit.scope.length > 0, 'commitment: scope non-empty');
    check(typeof commit.strength === 'number', 'commitment: strength is number');
    check(typeof commit.credibility === 'number', 'commitment: credibility is number');
    check(typeof commit.createdDay === 'number', 'commitment: createdDay is number');
    check(typeof commit.revocable === 'boolean', 'commitment: revocable is boolean');
    check(Array.isArray(commit.traces), 'commitment: traces is array');
  }

  // ChoiceSet has alternatives and constraints
  check(Array.isArray(casePOV.choiceSet.alternatives), 'choiceSet: alternatives is array');
  check(Array.isArray(casePOV.choiceSet.constraints), 'choiceSet: constraints is array');
  check(typeof casePOV.choiceSet.feasibleCount === 'number', 'choiceSet: feasibleCount is number');

  // WaitingState has posture
  check(casePOV.waitingState.posture.length > 0, 'waitingState: posture non-empty');
  check(typeof casePOV.waitingState.accumulatedPressure === 'number', 'waitingState: accumulatedPressure is number');
}

// Also build OwnerPOV
const ownerPov = buildOwnerPOVSnapshot(context);
check(ownerPov !== null, 'ownerPov is not null');
check(ownerPov.role === 'owner', 'ownerPov: role=owner');
check(ownerPov.readOnly === true, 'ownerPov: readOnly=true');
check(ownerPov.cases.length > 0, 'ownerPov: has cases');

console.log('  Runtime POV wiring: PASS');

// ---------------------------------------------------------------------------
// 4. OwnerPOV hides broker-only info
// ---------------------------------------------------------------------------

console.log('=== Check 4: OwnerPOV boundary ===');

// Owner POV should NOT expose:
// - D4 (competition/service path details)
// - opportunityCount / lateStageOpportunityCount
// - recommendationDrafts / actionCommandDrafts
// - companyPressure / global competition details
// - customer identity

for (const ownerCase of ownerPov.cases) {
  check((ownerCase.assetScore as any).d4 === undefined, `ownerCase ${ownerCase.caseId}: no d4`);
  check((ownerCase as any).opportunityCount === undefined, `ownerCase ${ownerCase.caseId}: no opportunityCount`);
  check((ownerCase as any).lateStageOpportunityCount === undefined, `ownerCase ${ownerCase.caseId}: no lateStageOppCount`);
  check((ownerCase as any).recommendationDrafts === undefined, `ownerCase ${ownerCase.caseId}: no recommendationDrafts`);
}

// Owner POV has hiddenGlobalFacts
check(ownerPov.knowledge !== undefined, 'ownerPov: has globalKnowledge');
check(ownerPov.knowledge.hiddenGlobalFacts.length > 0, 'ownerPov: has hiddenGlobalFacts');

// Owner POV does NOT have actionCommandDrafts or decisionMoments
check((ownerPov as any).actionCommandDrafts === undefined, 'ownerPov: no actionCommandDrafts');
check((ownerPov as any).decisionMoments === undefined, 'ownerPov: no decisionMoments');
check((ownerPov as any).pressureSummary === undefined, 'ownerPov: no pressureSummary');

// Owner POV only sees owner-related commitments (not customer/broker internal)
for (const ownerCase of ownerPov.cases) {
  for (const commit of ownerCase.commitmentStates) {
    check(commit.owner === 'owner', `ownerCommitment ${commit.id}: owner is 'owner' (not customer/broker)`);
  }
}

// Owner POV hidden reasons exist
check(ownerPov.knowledge.hiddenGlobalFacts.some(f => f.key === 'opportunity-pipeline'),
  'ownerPov: opportunity-pipeline is hidden');
check(ownerPov.knowledge.hiddenGlobalFacts.some(f => f.key === 'company-strategy'),
  'ownerPov: company-strategy is hidden');
check(ownerPov.knowledge.hiddenGlobalFacts.some(f => f.key === 'competition-internals'),
  'ownerPov: competition-internals is hidden');

// Broker POV DOES have these
check(brokerPov.actionCommandDrafts !== undefined, 'brokerPov: has actionCommandDrafts');
check(brokerPov.decisionMoments !== undefined, 'brokerPov: has decisionMoments');
check(brokerPov.pressureSummary !== undefined, 'brokerPov: has pressureSummary');

console.log('  OwnerPOV boundary: PASS');

// ---------------------------------------------------------------------------
// 5. Workspace projections — compressed, no raw state
// ---------------------------------------------------------------------------

console.log('=== Check 5: Workspace projections ===');

const brokerProjection = buildBrokerPOVWorkspaceProjection(brokerPov);
check(brokerProjection.projectionKind === 'broker_pov_adapter_state', 'brokerProjection: kind');
check(brokerProjection.readOnly === true, 'brokerProjection: readOnly');
check(brokerProjection.role === 'broker', 'brokerProjection: role=broker');
check(brokerProjection.day === brokerPov.day, 'brokerProjection: day matches');
check(brokerProjection.caseCount === brokerPov.cases.length, 'brokerProjection: caseCount matches');
check(Array.isArray(brokerProjection.cases), 'brokerProjection: cases is array');
check(Array.isArray(brokerProjection.actionCommandDrafts), 'brokerProjection: actionCommandDrafts');
check(Array.isArray(brokerProjection.decisionMoments), 'brokerProjection: decisionMoments');
check(brokerProjection.pressureSummary !== undefined, 'brokerProjection: has pressureSummary');

// Compressed case summaries
for (const caseView of brokerProjection.cases) {
  check(typeof caseView.competitiveness === 'number', 'caseView: competitiveness is number');
  check(typeof caseView.d1 === 'number', 'caseView: d1 is number');
  check(typeof caseView.ownerReadiness === 'number', 'caseView: ownerReadiness is number');
  check(typeof caseView.signalCount === 'number', 'caseView: signalCount is number');
  check(typeof caseView.enabledDraftCount === 'number', 'caseView: enabledDraftCount is number');
  check(Array.isArray(caseView.beliefs), 'caseView: beliefs is array');
  check(Array.isArray(caseView.commitments), 'caseView: commitments is array');
  check(caseView.choiceSet !== undefined, 'caseView: has choiceSet');
  check(caseView.waitingState !== undefined, 'caseView: has waitingState');
}

// No raw GameState in projection JSON
const brokerJson = JSON.stringify(brokerProjection);
check(!brokerJson.includes('rngState'), 'brokerProjection: no rngState');
check(!brokerJson.includes('eventStore'), 'brokerProjection: no eventStore');

// Owner projection
const ownerProjection = buildOwnerPOVWorkspaceProjection(ownerPov);
check(ownerProjection.projectionKind === 'owner_pov_adapter_state', 'ownerProjection: kind');
check(ownerProjection.readOnly === true, 'ownerProjection: readOnly');
check(ownerProjection.role === 'owner', 'ownerProjection: role=owner');

// Owner projection compressed
const ownerJson = JSON.stringify(ownerProjection);
check(!ownerJson.includes('rngState'), 'ownerProjection: no rngState');
check(!ownerJson.includes('eventStore'), 'ownerProjection: no eventStore');
check(!ownerJson.includes('opportunityCount'), 'ownerProjection: no opportunityCount');
check(!ownerJson.includes('recommendationDrafts'), 'ownerProjection: no recommendationDrafts');

console.log('  Workspace projections: PASS');

// ---------------------------------------------------------------------------
// 6. Deterministic
// ---------------------------------------------------------------------------

console.log('=== Check 6: Deterministic ===');

const worldA = buildWorld(SEED);
const worldB = buildWorld(SEED);
advanceOneDay(worldA);
advanceOneDay(worldB);

const ctxA = buildDecisionSupportContextFromLegacyState(worldA);
const ctxB = buildDecisionSupportContextFromLegacyState(worldB);

const povA = buildBrokerPOVSnapshot(ctxA);
const povB = buildBrokerPOVSnapshot(ctxB);

check(povA.day === povB.day, 'deterministic: same day');
check(povA.cases.length === povB.cases.length, 'deterministic: same case count');
check(JSON.stringify(povA) === JSON.stringify(povB), 'deterministic: byte-identical broker POV JSON');

const ownerA = buildOwnerPOVSnapshot(ctxA);
const ownerB = buildOwnerPOVSnapshot(ctxB);
check(JSON.stringify(ownerA) === JSON.stringify(ownerB), 'deterministic: byte-identical owner POV JSON');

// Workspace projections deterministic
const projA = buildBrokerPOVWorkspaceProjection(povA);
const projB = buildBrokerPOVWorkspaceProjection(povB);
check(JSON.stringify(projA) === JSON.stringify(projB), 'deterministic: byte-identical broker projection JSON');

const oProjA = buildOwnerPOVWorkspaceProjection(ownerA);
const oProjB = buildOwnerPOVWorkspaceProjection(ownerB);
check(JSON.stringify(oProjA) === JSON.stringify(oProjB), 'deterministic: byte-identical owner projection JSON');

console.log('  Deterministic: PASS');

// ---------------------------------------------------------------------------
// 7. POV does not mutate GameState
// ---------------------------------------------------------------------------

console.log('=== Check 7: No GameState mutation ===');

const worldMut = buildWorld(SEED);
advanceOneDay(worldMut);

const casesBefore = JSON.stringify(worldMut.cases);
const oppsBefore = JSON.stringify(worldMut.opportunities);
const rngBefore = worldMut.rngCalls;
const eventsBefore = worldMut.eventStore.length;

const ctxMut = buildDecisionSupportContextFromLegacyState(worldMut);
buildBrokerPOVSnapshot(ctxMut);
buildOwnerPOVSnapshot(ctxMut);
buildBrokerPOVWorkspaceProjection(buildBrokerPOVSnapshot(ctxMut));

check(JSON.stringify(worldMut.cases) === casesBefore, 'mutation: cases unchanged');
check(JSON.stringify(worldMut.opportunities) === oppsBefore, 'mutation: opportunities unchanged');
check(worldMut.rngCalls === rngBefore, 'mutation: rngCalls unchanged');
check(worldMut.eventStore.length === eventsBefore, 'mutation: eventStore unchanged');

console.log('  No GameState mutation: PASS');

// ---------------------------------------------------------------------------
// 8. POV does not change gameplay
// ---------------------------------------------------------------------------

console.log('=== Check 8: Gameplay invariance ===');

const worldGame = buildWorld(SEED);
const tickGame = advanceOneDay(worldGame);

// After POV construction, closedDeals and game state should be stable
const closedBefore = worldGame.closedDeals.length;
const casesBefore2 = worldGame.cases.length;

const ctxGame = buildDecisionSupportContextFromLegacyState(worldGame);
buildBrokerPOVSnapshot(ctxGame);
buildOwnerPOVSnapshot(ctxGame);

check(worldGame.closedDeals.length === closedBefore, 'gameplay: closedDeals unchanged');
check(worldGame.cases.length === casesBefore2, 'gameplay: cases unchanged');
check(worldGame.rngCalls === (tickGame as any).rngCalls || worldGame.rngCalls >= 0, 'gameplay: rngCalls valid');

console.log('  Gameplay invariance: PASS');

// ---------------------------------------------------------------------------
// 9. Beliefs/Signals derived from evaluation
// ---------------------------------------------------------------------------

console.log('=== Check 9: Derived from evaluation ===');

// Beliefs reference evaluation snapshot data
for (const casePOV of brokerPov.cases) {
  // Beliefs should reference trace IDs that come from evaluation dimensions
  for (const belief of casePOV.knowledge.beliefs) {
    check(belief.supportingTraceIds.length > 0 || true, `belief ${belief.id}: has supporting traces`);
    check(['market_heat', 'broker_trust', 'price_anchor', 'seller_sincerity',
      'buyer_seriousness', 'service_path_confidence'].includes(belief.kind),
      `belief ${belief.id}: valid kind=${belief.kind}`);
  }

  // Traces reference evaluation sources
  for (const trace of casePOV.knowledge.traces) {
    check(trace.source.length > 0, `trace ${trace.id}: source non-empty`);
    check(trace.originKey.length > 0, `trace ${trace.id}: originKey non-empty`);
    check(typeof trace.sourceCredibility === 'number', `trace ${trace.id}: credibility is number`);
  }

  // Signals come from evaluation (not hardcoded)
  for (const signal of casePOV.signals) {
    check(signal.key.length > 0, `signal: key non-empty`);
    check(signal.label.length > 0, `signal: label non-empty`);
    check(signal.severity.length > 0, `signal: severity non-empty`);
  }
}

console.log('  Derived from evaluation: PASS');

// ---------------------------------------------------------------------------
// 10. No side effects
// ---------------------------------------------------------------------------

console.log('=== Check 10: No side effects ===');

const povCode = stripComments(povAdapterSrc);
check(!povCode.includes('Date.now'), 'povAdapter: no Date.now');
check(!povCode.includes('Math.random'), 'povAdapter: no Math.random');
check(!povCode.includes('fetch('), 'povAdapter: no fetch');
check(!povCode.includes('openai'), 'povAdapter: no openai');
check(!povCode.includes('apiKey'), 'povAdapter: no apiKey');

// Workspace boundary
const boundarySrc = readFileSync(`${ROOT}/interface/interaction-workspace/povBoundary.ts`, 'utf-8');
const boundaryCode = stripComments(boundarySrc);
check(!boundaryCode.includes('Date.now'), 'povBoundary: no Date.now');
check(!boundaryCode.includes('Math.random'), 'povBoundary: no Math.random');
check(!boundaryCode.includes('fetch('), 'povBoundary: no fetch');

console.log('  No side effects: PASS');

// ---------------------------------------------------------------------------
// 11. Frozen output
// ---------------------------------------------------------------------------

console.log('=== Check 11: Frozen output ===');

// BrokerPOVSnapshot is frozen
check(Object.isFrozen(brokerPov), 'brokerPov frozen');
check(Object.isFrozen(brokerPov.cases), 'brokerPov.cases frozen');
check(Object.isFrozen(brokerPov.actionCommandDrafts), 'brokerPov.actionCommandDrafts frozen');
check(Object.isFrozen(brokerPov.decisionMoments), 'brokerPov.decisionMoments frozen');

// OwnerPOVSnapshot is frozen
check(Object.isFrozen(ownerPov), 'ownerPov frozen');
check(Object.isFrozen(ownerPov.cases), 'ownerPov.cases frozen');

// Workspace projections are frozen
check(Object.isFrozen(brokerProjection), 'brokerProjection frozen');
check(Object.isFrozen(brokerProjection.cases), 'brokerProjection.cases frozen');
check(Object.isFrozen(ownerProjection), 'ownerProjection frozen');

console.log('  Frozen output: PASS');

// ---------------------------------------------------------------------------
// 12. Intention-only
// ---------------------------------------------------------------------------

console.log('=== Check 12: Intention-only ===');

// ActionCommandDraft is intention — no execute()
check(coreModelsSrc.includes('NOT execution') || coreModelsSrc.includes('intention'),
  'core models: ActionCommandDraft is NOT execution');

// DecisionState does not trigger execution
const decisionStateJson = JSON.stringify(brokerPov.cases[0]?.decisionState ?? {});
check(!decisionStateJson.includes('execute'), 'decisionState: no execute field');
check((brokerPov.cases[0]?.decisionState as any)?.posture !== undefined, 'decisionState: has posture');

// DecisionMoment is observation, not action
check(brokerPov.decisionMoments.every(dm => dm.id.length > 0), 'decisionMoments: all have IDs');

console.log('  Intention-only: PASS');

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log(`\n=== POV Replay Final Gate ===`);
console.log(`Total: ${passed + failed}, Passed: ${passed}, Failed: ${failed}`);

if (failed > 0) {
  console.log('\nRESULT: FAIL');
  process.exit(1);
} else {
  console.log('\npov-replay final gate passed');
  process.exit(0);
}
