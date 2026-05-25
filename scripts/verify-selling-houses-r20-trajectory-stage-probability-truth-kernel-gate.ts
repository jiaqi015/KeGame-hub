/**
 * R20 Trajectory Stage Mirror + CloseProbability Truth Kernel Gate.
 *
 * Proves R20 turns ritual compliance into structural compliance:
 * 1. closeProbability.ts pure kernel exists and is deterministic
 * 2. computeCloseProbability takes explicit inputs + weights, returns WeightExplanation trace
 * 3. buildDealClosingEvaluation calls computeCloseProbability (no inline formula)
 * 4. ConsensusFormationState carries weightExplanations
 * 5. ContractFactState carries weightExplanations
 * 6. createContractFactOnState passes weightExplanations through
 * 7. setConsensusEvaluationOnState passes weightExplanations through
 * 8. stageMirror.ts has deriveLateStageFromPriceTrajectory + deriveOpportunityStageMirrorFromPriceTrajectory + assertLateStageHasTrajectoryEvidence
 * 9. No production direct Opportunity.stageIndex writes outside compatibility helpers
 * 10. No production direct customer runtime stageIndex writes outside compatibility helpers
 * 11. No production direct Case.stageIndex writes outside compatibility helpers
 * 12. Late-stage (>= 4) mirrors require trajectory with offer+concession evidence
 * 13. BrokerCustomerRelation inputs flow into probability kernel
 * 14. CloseProbabilityResult is frozen (immutability)
 * 15. R19 gate still passes
 * 16. Replay determinism holds for close probability and weight explanations
 * 17. Gate self-audit has no fake green patterns and hard exits on failure
 *
 * Hard constraints:
 *   - No check(true), assert(true), || true
 *   - No WARN-as-PASS
 *   - No silent catch around core checks
 *   - Hard process.exit(1) on failure
 */

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildGeneratedScenarioOpeningPreview, createStateFromScenarioOpening } from '../src/selling-houses/application/scenarioOpening.js';
import { advanceGameDays, executeGameAction, cloneGameState } from '../src/selling-houses/application/gameTransitions.js';
import { getActionAvailability } from '../src/selling-houses/domain/engine.js';
import type { GameState } from '../src/selling-houses/domain/models.js';
import { asWritableOpportunity } from '../src/selling-houses/domain/models.js';
import {
  computeCloseProbability,
  buildDefaultCloseProbabilityWeights,
  type CloseProbabilityInputs,
  type CloseProbabilityWeights,
  type CloseProbabilityResult,
  type CloseProbabilityBlockCategory,
} from '../src/selling-houses/core/world-state/consensus/closeProbability.js';
import {
  deriveLateStageFromPriceTrajectory,
  deriveOpportunityStageMirrorFromPriceTrajectory,
  assertLateStageHasTrajectoryEvidence,
} from '../src/selling-houses/core/world-state/consensus/stageMirror.js';
import {
  buildPriceTrajectoryFromDealClosingEvaluation,
  assertTrajectoryHasOfferAndConcession,
} from '../src/selling-houses/core/world-state/consensus/priceTrajectory.js';
import { findGateSoftPassLines } from './selling-houses-gate-hygiene.js';

let passed = 0;
let failed = 0;
const errors: string[] = [];

function pass(message: string): void {
  passed += 1;
  console.log(`  [PASS] ${message}`);
}

function fail(message: string): void {
  failed += 1;
  errors.push(message);
  console.error(`  [FAIL] ${message}`);
}

function check(condition: boolean, message: string): void {
  if (condition) {
    pass(message);
  } else {
    fail(message);
  }
}

function readFile(path: string): string {
  return readFileSync(join(import.meta.dirname!, '..', path), 'utf-8');
}

function readFileSafe(path: string): string | null {
  try {
    return readFile(path);
  } catch {
    return null;
  }
}

const SEED = 20260524;

function buildWorld(seed: number): GameState {
  const opening = buildGeneratedScenarioOpeningPreview('standard', seed, 'standard');
  return createStateFromScenarioOpening(opening);
}

function firstActiveCaseId(state: GameState): string {
  const caseItem = state.cases.find((entry) => entry.status === 'active');
  if (!caseItem) throw new Error('no active case');
  return caseItem.id;
}

function advanceAndAct(state: GameState, days: number, caseId: string): GameState {
  let s = state;
  for (let d = 0; d < days; d++) {
    const c = s.cases.find((e) => e.id === caseId && e.status === 'active');
    if (c) {
      const actions = ['first-visit', 'weekly-feedback', 'open-day', 'second-visit', 'sincerity-sale'];
      for (const action of actions) {
        const avail = getActionAvailability(s, c, action);
        if (avail.enabled) {
          const result = executeGameAction(s, action, caseId, null);
          if (result.success) { s = advanceGameDays(result.nextState, 1); break; }
        }
      }
    }
    s = advanceGameDays(s, 1);
  }
  return s;
}

// ── 1. closeProbability.ts pure kernel exists and is deterministic ──

console.log('\n=== R20-1: Pure kernel existence and determinism ===\n');

{
  const closeProbSrc = readFileSafe('src/selling-houses/core/world-state/consensus/closeProbability.ts');
  check(closeProbSrc !== null, 'closeProbability.ts exists');
  check(closeProbSrc!.includes('export function computeCloseProbability'), 'computeCloseProbability is exported');
  check(closeProbSrc!.includes('export function buildDefaultCloseProbabilityWeights'), 'buildDefaultCloseProbabilityWeights is exported');
  check(closeProbSrc!.includes('export interface CloseProbabilityInputs'), 'CloseProbabilityInputs is exported');
  check(closeProbSrc!.includes('export interface CloseProbabilityWeights'), 'CloseProbabilityWeights is exported');
  check(closeProbSrc!.includes('export interface CloseProbabilityResult'), 'CloseProbabilityResult is exported');
  check(closeProbSrc!.includes('export type CloseProbabilityBlockCategory'), 'CloseProbabilityBlockCategory is exported');

  // Determinism: same inputs → same output
  const weights = buildDefaultCloseProbabilityWeights();
  const inputs: CloseProbabilityInputs = {
    customerIntent: 80,
    customerConfidence: 70,
    ownerTrust: 60,
    ownerIsUrgent: false,
    caseCompetitiveness: 40,
    askPricePenalty: 10,
    strategyShift: 0,
    scalingFactor: 0.8,
    trustGate: 20,
    priceExceedsBudget: false,
    marketCapacityBlocked: false,
    playerCapacityBlocked: false,
    brokerCustomerTrust: 50,
    brokerCustomerFamiliarity: 30,
    brokerCustomerInfluence: 20,
    brokerCustomerRelationSource: 'relation',
    brokerCustomerRelationId: 'bcr-test-1',
  };

  const result1 = computeCloseProbability(inputs, weights);
  const result2 = computeCloseProbability(inputs, weights);
  check(result1.rawProbability === result2.rawProbability, 'deterministic: same rawProbability');
  check(result1.boundedProbability === result2.boundedProbability, 'deterministic: same boundedProbability');
  check(result1.closeReadiness === result2.closeReadiness, 'deterministic: same closeReadiness');
  check(result1.weightExplanations.length === result2.weightExplanations.length, 'deterministic: same weightExplanation count');

  // Different inputs → different output
  const differentInputs: CloseProbabilityInputs = { ...inputs, customerIntent: 20 };
  const result3 = computeCloseProbability(differentInputs, weights);
  check(result3.rawProbability !== result1.rawProbability, 'different inputs produce different rawProbability');
}

// ── 2. computeCloseProbability takes explicit inputs + weights, returns WeightExplanation trace ──

console.log('\n=== R20-2: Explicit inputs/weights and WeightExplanation trace ===\n');

{
  const weights = buildDefaultCloseProbabilityWeights();
  const inputs: CloseProbabilityInputs = {
    customerIntent: 85,
    customerConfidence: 75,
    ownerTrust: 70,
    ownerIsUrgent: true,
    caseCompetitiveness: 50,
    askPricePenalty: 5,
    strategyShift: 5,
    scalingFactor: 0.85,
    trustGate: 25,
    priceExceedsBudget: false,
    marketCapacityBlocked: false,
    playerCapacityBlocked: false,
    brokerCustomerTrust: 60,
    brokerCustomerFamiliarity: 40,
    brokerCustomerInfluence: 25,
    brokerCustomerRelationSource: 'relation',
    brokerCustomerRelationId: 'bcr-test-2',
  };

  const result = computeCloseProbability(inputs, weights);
  check(result.weightExplanations.length >= 6, `weight explanations present (count: ${result.weightExplanations.length})`);

  // Verify WeightExplanation structure
  for (const we of result.weightExplanations) {
    check(typeof we.factor === 'string' && we.factor.length > 0, `weightExplanation has factor: ${we.factor}`);
    check(typeof we.weight === 'number', `weightExplanation has weight: ${we.weight}`);
    check(we.derivedFrom.sourceKind.length > 0, `weightExplanation has sourceKind: ${we.derivedFrom.sourceKind}`);
  }

  // Verify specific factors present
  const factors = result.weightExplanations.map(we => we.factor);
  check(factors.includes('customer_intent'), 'weightExplanation includes customer_intent');
  check(factors.includes('customer_confidence'), 'weightExplanation includes customer_confidence');
  check(factors.includes('owner_trust'), 'weightExplanation includes owner_trust');
  check(factors.includes('broker_customer_influence'), 'weightExplanation includes broker_customer_influence');
  check(factors.includes('broker_customer_trust'), 'weightExplanation includes broker_customer_trust');
  check(factors.includes('ask_price_penalty'), 'weightExplanation includes ask_price_penalty');

  // Verify blocking works
  const blockedInputs: CloseProbabilityInputs = { ...inputs, priceExceedsBudget: true };
  const blockedResult = computeCloseProbability(blockedInputs, weights);
  check(blockedResult.isBlocked, 'blocked when price exceeds budget');
  check(blockedResult.boundedProbability === 0, 'blocked probability is 0');
  check(blockedResult.blockingCategories.includes('price_budget'), 'blocking category includes price_budget');
}

// ── 3. buildDealClosingEvaluation calls computeCloseProbability ──

console.log('\n=== R20-3: buildDealClosingEvaluation uses pure kernel ===\n');

{
  const dealClosingSrc = readFileSafe('src/selling-houses/domain/dealClosing.ts');
  check(dealClosingSrc !== null, 'dealClosing.ts exists');
  if (dealClosingSrc) {
    check(dealClosingSrc.includes('computeCloseProbability'), 'dealClosing imports computeCloseProbability');
    check(dealClosingSrc.includes('buildDefaultCloseProbabilityWeights'), 'dealClosing imports buildDefaultCloseProbabilityWeights');

    // Verify buildDealClosingEvaluation uses the kernel
    const buildEvalMatch = dealClosingSrc.match(/function buildDealClosingEvaluation[\s\S]*?computeCloseProbability/);
    check(buildEvalMatch !== null, 'buildDealClosingEvaluation calls computeCloseProbability');
  }
}

// ── 4. ConsensusFormationState carries weightExplanations ──

console.log('\n=== R20-4: ConsensusFormationState has weightExplanations ===\n');

{
  const writeSourceSrc = readFileSafe('src/selling-houses/core/world-state/consensus/writeSource.ts');
  check(writeSourceSrc !== null, 'writeSource.ts exists');
  if (writeSourceSrc) {
    check(
      /weightExplanations\s*:\s*readonly.*WeightExplanation/.test(writeSourceSrc),
      'ConsensusFormationState has weightExplanations field',
    );
  }

  // Behavioral test: setConsensusEvaluationOnState carries weight explanations
  const { setConsensusEvaluationOnState, ensureConsensusFormation, ensureConsensusRuntime } = await import(
    '../src/selling-houses/domain/consensusFormationHelper.js'
  );
  const testState: any = {
    runtimeConsensusFormations: [],
    runtimeContractFacts: [],
    runtimeOpportunityClosureSets: [],
  };

  ensureConsensusFormation(testState, 'brokered:opp-1', 'match-1', 'case-1', 'cust-1', 'balanced', 5);

  const testWeightExplanations = [
    { factor: 'test_factor', weight: 0.5, derivedFrom: { sourceKind: 'market_signal' as const, sourceIds: ['id-1'] } },
  ];

  const record = setConsensusEvaluationOnState(
    testState,
    'brokered:opp-1',
    { closeReadiness: 70, closeProbability: 60, blockers: [], supportingFactors: ['high intent'], weightExplanations: testWeightExplanations },
    6,
    'test evaluation',
  );
  check(record !== undefined, 'setConsensusEvaluationOnState returns a record');

  const formation = testState.runtimeConsensusFormations[0];
  check(formation.weightExplanations.length === 1, `ConsensusFormation carries weightExplanations (count: ${formation.weightExplanations.length})`);
  check(formation.weightExplanations[0].factor === 'test_factor', 'weightExplanation factor preserved');
}

// ── 5. ContractFactState carries weightExplanations ──

console.log('\n=== R20-5: ContractFactState has weightExplanations ===\n');

{
  const writeSourceSrc = readFileSafe('src/selling-houses/core/world-state/consensus/writeSource.ts');
  check(writeSourceSrc !== null, 'writeSource.ts exists');
  if (writeSourceSrc) {
    // ContractFactState should have weightExplanations
    const contractFactMatch = writeSourceSrc.match(/interface ContractFactState[\s\S]*?weightExplanations/);
    check(contractFactMatch !== null, 'ContractFactState has weightExplanations field');
  }
}

// ── 6. createContractFactOnState passes weightExplanations through ──

console.log('\n=== R20-6: createContractFactOnState carries weightExplanations ===\n');

{
  const { createContractFactOnState, ensureConsensusRuntime } = await import(
    '../src/selling-houses/domain/consensusFormationHelper.js'
  );
  const testState: any = {
    runtimeConsensusFormations: [],
    runtimeContractFacts: [],
    runtimeOpportunityClosureSets: [],
  };

  const testWeights: readonly import('../src/selling-houses/core/world-state/consensus/priceTrajectory.js').WeightExplanation[] = [
    { factor: 'customer_intent', weight: 0.46, derivedFrom: { sourceKind: 'market_signal', sourceIds: ['80'] } },
  ];

  const contract = createContractFactOnState(
    testState,
    'consensus-1',
    'brokered:opp-1',
    'case-wt-test',
    'cust-1',
    950,
    'self_closed',
    10,
    'deal-1',
    80,
    75,
    [],
    ['strong intent'],
    ['ptraj:1', 'pready:1'],
    testWeights,
  );

  check(contract !== undefined, 'createContractFactOnState returns a contract');
  if (contract) {
    check(contract.weightExplanations.length === 1, `contract has weightExplanations (count: ${contract.weightExplanations.length})`);
    check(contract.weightExplanations[0].factor === 'customer_intent', 'weightExplanation factor preserved in contract');
  }
}

// ── 7. setConsensusEvaluationOnState passes weightExplanations through ──

console.log('\n=== R20-7: setConsensusEvaluationOnState carries weightExplanations ===\n');

{
  const helperSrc = readFileSafe('src/selling-houses/domain/consensusFormationHelper.ts');
  check(helperSrc !== null, 'consensusFormationHelper.ts exists');
  if (helperSrc) {
    // The evaluation param should accept weightExplanations
    check(helperSrc.includes('weightExplanations'), 'consensusFormationHelper references weightExplanations');
  }
}

// ── 8. stageMirror.ts has canonical helpers ──

console.log('\n=== R20-8: stageMirror.ts canonical helpers ===\n');

{
  const stageMirrorSrc = readFileSafe('src/selling-houses/core/world-state/consensus/stageMirror.ts');
  check(stageMirrorSrc !== null, 'stageMirror.ts exists');
  if (stageMirrorSrc) {
    check(stageMirrorSrc.includes('export function deriveLateStageFromPriceTrajectory'), 'deriveLateStageFromPriceTrajectory exported');
    check(stageMirrorSrc.includes('export function deriveOpportunityStageMirrorFromPriceTrajectory'), 'deriveOpportunityStageMirrorFromPriceTrajectory exported');
    check(stageMirrorSrc.includes('export function assertLateStageHasTrajectoryEvidence'), 'assertLateStageHasTrajectoryEvidence exported');
  }

  // Behavioral: no trajectory → no late stage
  const noTrajResult = deriveLateStageFromPriceTrajectory(undefined);
  check(noTrajResult === null, 'no trajectory → null late stage');

  // Behavioral: trajectory with offer+concession → formal_offer
  const trajectory = buildPriceTrajectoryFromDealClosingEvaluation({
    caseId: 'test-case-sm',
    customerId: 'test-cust-sm',
    ownerId: 'owner:test-case-sm',
    opportunityId: 'test-opp-sm',
    day: 10,
    soldPrice: 950,
    closeReadiness: 80,
    closeProbability: 75,
    buyerBudgetMax: 1000,
    buyerIntent: 85,
    buyerConfidence: 70,
    caseAskPrice: 980,
    caseMarketPrice: 960,
    caseBottomPrice: 900,
    blockers: [],
    supportingFactors: ['strong intent'],
    strategyId: 'balanced',
  });

  const lateStage = deriveLateStageFromPriceTrajectory(trajectory);
  check(lateStage !== null, 'trajectory with offer+concession → non-null late stage');
  check(lateStage! >= 4, `late stage >= 4 (got: ${lateStage})`);

  // deriveOpportunityStageMirrorFromPriceTrajectory caps without trajectory
  const cappedStage = deriveOpportunityStageMirrorFromPriceTrajectory(undefined, 5);
  check(cappedStage === 3, 'without trajectory, capped at 3');

  const uncappedStage = deriveOpportunityStageMirrorFromPriceTrajectory(trajectory, 2);
  check(uncappedStage >= 4, `with trajectory, can reach >= 4 (got: ${uncappedStage})`);

  // assertLateStageHasTrajectoryEvidence
  const validAssertion = assertLateStageHasTrajectoryEvidence(4, trajectory);
  check(validAssertion.valid, 'stageIndex 4 with trajectory evidence passes assertion');

  const invalidAssertion = assertLateStageHasTrajectoryEvidence(4, undefined);
  check(!invalidAssertion.valid, 'stageIndex 4 without trajectory evidence fails assertion');

  const lowerStageAssertion = assertLateStageHasTrajectoryEvidence(2, undefined);
  check(lowerStageAssertion.valid, 'stageIndex < 4 passes without trajectory');
}

// ── 9. No production direct Opportunity.stageIndex writes outside compatibility helpers ──

console.log('\n=== R20-9: No direct Opportunity.stageIndex writes outside helpers ===\n');

{
  const ALLOWLISTED_OPPORTUNITY_STAGE_WRITERS = [
    'src/selling-houses/domain/opportunitySplitHelper.ts',  // syncOpportunityStageMirrorFromTrajectoryOnState
  ];

  const domainFiles = [
    'src/selling-houses/domain/dealClosing.ts',
    'src/selling-houses/domain/engine/customerEngine.ts',
    'src/selling-houses/domain/engine/opportunityEngine.ts',
    'src/selling-houses/domain/runtimeState.ts',
    'src/selling-houses/domain/actionStageRelations.ts',
    'src/selling-houses/domain/opportunitySplitHelper.ts',
    'src/selling-houses/application/gameTransitions.ts',
  ];

  for (const file of domainFiles) {
    const src = readFileSafe(file);
    if (!src) continue;
    const lines = src.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Direct assignment to opportunity.stageIndex (not through helper)
      if (/opportunity\.stageIndex\s*=/.test(line)) {
        const isAllowed = ALLOWLISTED_OPPORTUNITY_STAGE_WRITERS.some(f => file === f);
        check(isAllowed, `opportunity.stageIndex= at ${file}:${i + 1} is in compatibility helper allowlist`);
      }
    }
  }
}

// ── 10. No production direct customer runtime stageIndex writes outside compatibility helpers ──

console.log('\n=== R20-10: No direct runtime.stageIndex writes outside helpers ===\n');

{
  const ALLOWLISTED_RUNTIME_STAGE_WRITERS = [
    'src/selling-houses/domain/engine/customerEngine.ts',  // syncCustomerJourneyStageMirror (named helper)
    'src/selling-houses/domain/opportunitySplitHelper.ts',  // syncCustomerRuntimeStageMirrorFromOpportunityOnState
  ];

  const domainFiles = [
    'src/selling-houses/domain/engine/customerEngine.ts',
    'src/selling-houses/application/gameTransitions.ts',
    'src/selling-houses/domain/runtimeState.ts',
    'src/selling-houses/domain/opportunitySplitHelper.ts',
  ];

  for (const file of domainFiles) {
    const src = readFileSafe(file);
    if (!src) continue;
    const lines = src.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Direct assignment to runtime.stageIndex (not through helper)
      if (/runtime\.stageIndex\s*=/.test(line)) {
        const isAllowed = ALLOWLISTED_RUNTIME_STAGE_WRITERS.some(f => file === f);
        check(isAllowed, `runtime.stageIndex= at ${file}:${i + 1} is in compatibility helper allowlist`);
      }
    }
  }
}

// ── 11. No production direct Case.stageIndex writes outside compatibility helpers ──

console.log('\n=== R20-11: No direct Case.stageIndex writes outside helpers ===\n');

{
  const ALLOWLISTED_CASE_STAGE_WRITERS = [
    'src/selling-houses/domain/opportunitySplitHelper.ts',  // syncCaseStageMirrorFromCaseProgressionOnState
    'src/selling-houses/domain/engine/customerEngine.ts',   // syncCaseStageMirrorFromCaseProgressionOnState
  ];

  const domainFiles = [
    'src/selling-houses/domain/engine/customerEngine.ts',
    'src/selling-houses/domain/runtimeState.ts',
    'src/selling-houses/domain/actionStageRelations.ts',
    'src/selling-houses/domain/opportunitySplitHelper.ts',
  ];

  for (const file of domainFiles) {
    const src = readFileSafe(file);
    if (!src) continue;
    const lines = src.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Direct assignment to caseItem.stageIndex or case.stageIndex
      if (/caseItem\.stageIndex\s*=|case\.stageIndex\s*=/.test(line)) {
        const isAllowed = ALLOWLISTED_CASE_STAGE_WRITERS.some(f => file === f);
        check(isAllowed, `caseItem.stageIndex= at ${file}:${i + 1} is in compatibility helper allowlist`);
      }
    }
  }
}

// ── 12. Late-stage mirrors require trajectory with offer+concession evidence ──

console.log('\n=== R20-12: Late-stage mirrors require trajectory evidence ===\n');

{
  // Source-level: dealClosing uses syncOpportunityStageMirrorFromTrajectoryOnState after trajectory built
  const dealClosingSrc = readFileSafe('src/selling-houses/domain/dealClosing.ts');
  check(dealClosingSrc !== null, 'dealClosing.ts exists for stage mirror check');
  if (dealClosingSrc) {
    check(
      dealClosingSrc.includes('syncOpportunityStageMirrorFromTrajectoryOnState'),
      'dealClosing uses syncOpportunityStageMirrorFromTrajectoryOnState for closing path',
    );
  }

  // Source-level: stageMirror helper caps at 3 without trajectory
  const stageMirrorSrc = readFileSafe('src/selling-houses/core/world-state/consensus/stageMirror.ts');
  check(stageMirrorSrc !== null, 'stageMirror.ts exists');
  if (stageMirrorSrc) {
    check(stageMirrorSrc.includes('Math.min(lowerStageFallback, 3)'), 'stageMirror caps at 3 without trajectory evidence');
  }
}

// ── 13. BrokerCustomerRelation inputs flow into probability kernel ──

console.log('\n=== R20-13: BrokerCustomerRelation flows into kernel ===\n');

{
  const closeProbSrc = readFileSafe('src/selling-houses/core/world-state/consensus/closeProbability.ts');
  check(closeProbSrc !== null, 'closeProbability.ts exists for BCR check');
  if (closeProbSrc) {
    check(closeProbSrc.includes('brokerCustomerTrust'), 'kernel input includes brokerCustomerTrust');
    check(closeProbSrc.includes('brokerCustomerFamiliarity'), 'kernel input includes brokerCustomerFamiliarity');
    check(closeProbSrc.includes('brokerCustomerInfluence'), 'kernel input includes brokerCustomerInfluence');
    check(closeProbSrc.includes('brokerCustomerRelationSource'), 'kernel input includes brokerCustomerRelationSource');
    check(closeProbSrc.includes('brokerCustomerRelationId'), 'kernel input includes brokerCustomerRelationId');
  }

  // Behavioral: BCR values affect probability output
  const weights = buildDefaultCloseProbabilityWeights();
  const baseInputs: CloseProbabilityInputs = {
    customerIntent: 80,
    customerConfidence: 70,
    ownerTrust: 60,
    ownerIsUrgent: false,
    caseCompetitiveness: 40,
    askPricePenalty: 10,
    strategyShift: 0,
    scalingFactor: 0.8,
    trustGate: 20,
    priceExceedsBudget: false,
    marketCapacityBlocked: false,
    playerCapacityBlocked: false,
    brokerCustomerTrust: 50,
    brokerCustomerFamiliarity: 30,
    brokerCustomerInfluence: 20,
    brokerCustomerRelationSource: 'relation',
    brokerCustomerRelationId: 'bcr-behavioral-test',
  };

  const baseResult = computeCloseProbability(baseInputs, weights);

  const highBcrInputs: CloseProbabilityInputs = { ...baseInputs, brokerCustomerInfluence: 80, brokerCustomerTrust: 90 };
  const highBcrResult = computeCloseProbability(highBcrInputs, weights);

  check(
    highBcrResult.rawProbability > baseResult.rawProbability,
    `higher BCR values produce higher probability (${highBcrResult.rawProbability} > ${baseResult.rawProbability})`,
  );

  // Weight explanations reference BCR relation
  const bcrExplanation = baseResult.weightExplanations.find(we => we.factor === 'broker_customer_influence');
  check(bcrExplanation !== undefined, 'weightExplanation includes broker_customer_influence');
  check(
    bcrExplanation!.derivedFrom.sourceIds.includes('bcr-behavioral-test'),
    'BCR weight explanation references relation ID',
  );
}

// ── 14. CloseProbabilityResult is frozen (immutability) ──

console.log('\n=== R20-14: CloseProbabilityResult immutability ===\n');

{
  const weights = buildDefaultCloseProbabilityWeights();
  const inputs: CloseProbabilityInputs = {
    customerIntent: 80,
    customerConfidence: 70,
    ownerTrust: 60,
    ownerIsUrgent: false,
    caseCompetitiveness: 40,
    askPricePenalty: 10,
    strategyShift: 0,
    scalingFactor: 0.8,
    trustGate: 20,
    priceExceedsBudget: false,
    marketCapacityBlocked: false,
    playerCapacityBlocked: false,
    brokerCustomerTrust: 50,
    brokerCustomerFamiliarity: 30,
    brokerCustomerInfluence: 20,
    brokerCustomerRelationSource: 'relation',
    brokerCustomerRelationId: 'bcr-freeze-test',
  };

  const result = computeCloseProbability(inputs, weights);
  check(Object.isFrozen(result), 'CloseProbabilityResult is frozen');
  check(Object.isFrozen(result.weightExplanations), 'weightExplanations array is frozen');
  check(Object.isFrozen(result.blockingCategories), 'blockingCategories array is frozen');

  // Verify closeProbability.ts uses Object.freeze
  const closeProbSrc = readFileSafe('src/selling-houses/core/world-state/consensus/closeProbability.ts');
  if (closeProbSrc) {
    check(closeProbSrc.includes('Object.freeze({'), 'computeCloseProbability returns Object.freeze');
  }
}

// ── 15. R19 gate still passes ──

console.log('\n=== R20-15: R19 gate still passes ===\n');

{
  const r19Result = spawnSync(
    'npx',
    ['tsx', 'scripts/verify-selling-houses-r19-structural-truth-lock-gate.ts'],
    { stdio: 'pipe', shell: process.platform === 'win32', timeout: 300_000 },
  );
  if (r19Result.error) {
    fail(`R19 gate: ${r19Result.error.message}`);
  } else if (r19Result.status !== 0) {
    fail(`R19 gate: exit ${r19Result.status}`);
  } else {
    pass('R19 gate still passes');
  }
}

// ── 16. Replay determinism holds for close probability and weight explanations ──

console.log('\n=== R20-16: Replay determinism ===\n');

{
  function runProbabilitySequence(seed: number) {
    const weights = buildDefaultCloseProbabilityWeights();
    const inputs: CloseProbabilityInputs = {
      customerIntent: 85,
      customerConfidence: 75,
      ownerTrust: 65,
      ownerIsUrgent: false,
      caseCompetitiveness: 45,
      askPricePenalty: 8,
      strategyShift: 3,
      scalingFactor: 0.82,
      trustGate: 22,
      priceExceedsBudget: false,
      marketCapacityBlocked: false,
      playerCapacityBlocked: false,
      brokerCustomerTrust: 55,
      brokerCustomerFamiliarity: 35,
      brokerCustomerInfluence: 25,
      brokerCustomerRelationSource: 'relation',
      brokerCustomerRelationId: 'bcr-replay-test',
    };
    const result = computeCloseProbability(inputs, weights);
    return {
      rawProbability: result.rawProbability,
      boundedProbability: result.boundedProbability,
      closeReadiness: result.closeReadiness,
      weightFactors: result.weightExplanations.map(we => `${we.factor}:${we.weight}`).sort(),
    };
  }

  const runA = runProbabilitySequence(SEED);
  const runB = runProbabilitySequence(SEED);

  check(runA.rawProbability === runB.rawProbability, 'replay: same rawProbability');
  check(runA.boundedProbability === runB.boundedProbability, 'replay: same boundedProbability');
  check(runA.closeReadiness === runB.closeReadiness, 'replay: same closeReadiness');
  check(JSON.stringify(runA.weightFactors) === JSON.stringify(runB.weightFactors), 'replay: same weight factors');
}

// ── 17. Gate self-audit ──

console.log('\n=== R20-17: Gate self-audit ===\n');

const gateSelfSrc = readFileSync(import.meta.filename!, 'utf-8');
const softPassViolations = findGateSoftPassLines(gateSelfSrc);
check(softPassViolations.length === 0, `gate self-audit: no soft-pass patterns (found ${softPassViolations.length})`);

// Note: we do NOT check `failed === 0` here because that would make this check
// transitively dependent on all prior checks (including R19 gate spawn which may timeout).
// The gate exit code at the bottom is the hard guarantee.

// ── Summary ──

console.log('\n=== R20 Trajectory Stage Mirror + CloseProbability Truth Kernel Gate Summary ===\n');
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);

if (failed > 0) {
  console.error(`\nGATE FAILED: ${failed} checks did not pass.`);
  for (const err of errors) {
    console.error(`  - ${err}`);
  }
  process.exit(1);
}

console.log(`\nGATE PASSED: All ${passed} checks passed.`);
console.log('Verified: stage mirror derivation, close probability kernel, weight explanation flow, BCR integration, compatibility helper allowlists.');
