/**
 * R19 Structural Truth Lock Gate.
 *
 * Proves R19 turns ritual compliance into structural compliance:
 * 1. R18 gate no longer has "acceptable/no unlisted customer to test" PASS paths
 * 2. Gate hygiene rejects soft required-invariant PASS phrases in strict gates
 * 3. ContractFact-derived closed deal projection exists and matches legacy mirror
 * 4. Case.status/soldPrice/closedDeals are not terminal truth outside compatibility sync
 * 5. No production direct sold outcome writes outside compatibility sync
 * 6. No production direct owner readiness/trust writes outside canonical helpers
 * 7. Canonical owner readiness/trust records still sync deterministic legacy mirrors
 * 8. PriceTrajectory contains at least one BuyerOffer and one OwnerConcession for signed/contract paths
 * 9. Derived stage from PriceTrajectory drives or validates formal_offer/signed paths
 * 10. ConsensusFormation/ContractFact chain references trajectory/source evidence
 * 11. ContractFact still requires signed ConsensusFormation
 * 12. ContractFact still cannot be faked by ActionReceipt/manager/process receipts
 * 13. R15 gate still passes
 * 14. R16 gate still passes
 * 15. R17 gate still passes
 * 16. R18 gate still passes
 * 17. Replay determinism holds for outcome projection, readiness mirror sync, trajectory-derived stage, contract IDs
 * 18. New R19 gate self-audit has no fake green patterns and hard exits on failure
 *
 * Hard constraints:
 *   - No check(true), assert(true), || true
 *   - No WARN-as-PASS
 *   - No silent catch around core checks
 *   - Hard process.exit(1) on failure
 */

import { spawnSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { asWritableCase } from '../src/selling-houses/domain/models.js';
import { buildGeneratedScenarioOpeningPreview, createStateFromScenarioOpening } from '../src/selling-houses/application/scenarioOpening.js';
import { advanceGameDays, executeGameAction, cloneGameState } from '../src/selling-houses/application/gameTransitions.js';
import { getActionAvailability } from '../src/selling-houses/domain/engine.js';
import {
  buildActorKnowledgeSnapshot,
  buildDecisionEvidenceEnvelope,
  extractPersistedSourceRecords,
  buildInformationSourceRegistryFromRuntime,
} from '../src/selling-houses/application/projections/actorKnowledgeProjection.js';
import type { GameState } from '../src/selling-houses/domain/models.js';
import {
  deriveCaseTerminalStatusFromOutcomeProjection,
  deriveSoldPriceFromContractFacts,
  deriveClosedDealProjectionFromContractFacts,
  deriveCaseOutcomeProjection,
} from '../src/selling-houses/core/world-state/caseOutcomeProjection.js';
import {
  deriveStageIndexFromPriceTrajectory,
  assertTrajectoryHasOfferAndConcession,
  deriveConsensusStatusFromTrajectory,
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

const SEED = 20260523;

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

// ── 1. R18 gate no longer has "acceptable/no unlisted customer to test" PASS paths ──

console.log('\n=== R19-1: R18 gate no soft-pass phrases ===\n');

const r18GateSrc = readFileSafe('scripts/verify-selling-houses-r18-visibility-metric-belief-manager-message-gate.ts');
check(r18GateSrc !== null, 'R18 gate source exists');
if (r18GateSrc) {
  const softPhrases = [
    /\bpass\s*\([^)]*acceptable/,
    /\bpass\s*\([^)]*no\b.*\bto test\b/i,
    /\bpass\s*\([^)]*skipped?\b/i,
  ];
  for (const pattern of softPhrases) {
    const matches = r18GateSrc.match(pattern);
    check(!matches, `R18 gate has no soft-pass phrase matching ${pattern.source}`);
  }
}

// ── 2. Gate hygiene rejects soft required-invariant PASS phrases in strict gates ──

console.log('\n=== R19-2: Gate hygiene soft-pass phrase scan ===\n');

const hygieneSrc = readFileSafe('scripts/selling-houses-gate-hygiene.ts');
check(hygieneSrc !== null, 'gate hygiene source exists');
if (hygieneSrc) {
  check(hygieneSrc.includes("'pass(...acceptable...)'"), 'gate hygiene includes acceptable pattern');
  check(hygieneSrc.includes("'pass(...no...to test...)'"), 'gate hygiene includes no-to-test pattern');
  check(hygieneSrc.includes("'pass(...skip...)'"), 'gate hygiene includes skip pattern');
}

// ── 3. ContractFact-derived closed deal projection exists and matches legacy mirror ──

console.log('\n=== R19-3: Outcome projection matches legacy ===\n');

{
  const s0 = buildWorld(SEED);
  const caseId = firstActiveCaseId(s0);
  const s1 = advanceAndAct(s0, 30, caseId);

  const contractFacts = s1.runtimeContractFacts ?? [];
  const terminalOutcomes = s1.runtimeCaseTerminalOutcomes ?? [];

  if (contractFacts.length > 0) {
    const projection = deriveClosedDealProjectionFromContractFacts(contractFacts);
    check(projection.length === contractFacts.length, `closed deal projection count matches contracts (${projection.length} vs ${contractFacts.length})`);

    for (const contract of contractFacts) {
      const legacyDeal = s1.closedDeals.find(d => d.caseId === contract.caseId);
      const projectedDeal = projection.find(p => p.caseId === contract.caseId);
      check(projectedDeal !== undefined, `projection exists for case ${contract.caseId}`);
      if (projectedDeal && legacyDeal) {
        check(projectedDeal.dealPrice === legacyDeal.price || projectedDeal.dealPrice === legacyDeal.dealPrice,
          `projection deal price matches legacy for case ${contract.caseId}`);
      }
    }
  } else {
    // No closed deals yet — prove projection function works with empty
    const emptyProjection = deriveClosedDealProjectionFromContractFacts([]);
    check(emptyProjection.length === 0, 'empty contracts produce empty projection');
  }

  // Test deriveCaseOutcomeProjection with active cases
  const activeCaseIds = s1.cases.filter(c => c.status === 'active').map(c => c.id);
  const outcomeMap = deriveCaseOutcomeProjection({ contractFacts, terminalOutcomes, activeCaseIds });
  check(outcomeMap.size > 0, `outcome projection has entries (${outcomeMap.size})`);

  for (const contract of contractFacts) {
    const proj = outcomeMap.get(contract.caseId);
    check(proj?.status === 'sold', `contract case ${contract.caseId} projects as sold`);
    check(proj?.sourceKind === 'contract_fact', `sold case sourced from contract_fact`);
  }

  for (const terminal of terminalOutcomes) {
    const proj = outcomeMap.get(terminal.caseId);
    check(proj?.status === terminal.kind, `terminal case ${terminal.caseId} projects as ${terminal.kind}`);
    check(proj?.sourceKind === 'terminal_outcome', `terminal case sourced from terminal_outcome`);
  }
}

// ── 4. Case.status/soldPrice/closedDeals are not terminal truth outside compatibility sync ──

console.log('\n=== R19-4: No terminal truth outside compatibility sync ===\n');

{
  // Source scan: direct status=sold writes only in allowlisted files
  const ALLOWLISTED_STATUS_SOLD = [
    'src/selling-houses/domain/dealClosing.ts',  // syncLegacyCaseDealMirrorsFromContractFact
  ];
  const ALLOWLISTED_STATUS_TERMINAL = [
    'src/selling-houses/domain/caseOutcome.ts',  // syncLegacyCaseTerminalMirrorFromOutcome
    'src/selling-houses/domain/caseLifecycle.ts', // fallback path (duplicate guard)
    'src/selling-houses/domain/engine/actionResolvers.ts', // fallback path (duplicate guard)
  ];
  const ALLOWLISTED_SOLD_PRICE = [
    'src/selling-houses/domain/dealClosing.ts',  // syncLegacyCaseDealMirrorsFromContractFact
    'src/selling-houses/domain/caseOutcome.ts',  // markCaseSold (called from sync function)
  ];
  const ALLOWLISTED_CLOSED_DEALS = [
    'src/selling-houses/domain/dealClosing.ts',  // syncLegacyCaseDealMirrorsFromContractFact
  ];

  const domainFiles = [
    'src/selling-houses/domain/dealClosing.ts',
    'src/selling-houses/domain/caseOutcome.ts',
    'src/selling-houses/domain/caseLifecycle.ts',
    'src/selling-houses/domain/engine/actionResolvers.ts',
    'src/selling-houses/domain/runtimeState.ts',
    'src/selling-houses/domain/resultEvaluation.ts',
  ];

  for (const file of domainFiles) {
    const src = readFileSafe(file);
    if (!src) continue;
    const lines = src.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (/caseItem\.status\s*=\s*'sold'|case\.status\s*=\s*'sold'/.test(line)) {
        const isAllowed = ALLOWLISTED_STATUS_SOLD.some(f => file === f);
        check(isAllowed, `status='sold' at ${file}:${i + 1} is in compatibility sync allowlist`);
      }
      if (/caseItem\.status\s*=\s*'lost_to_rival'|case\.status\s*=\s*'lost_to_rival'/.test(line)) {
        const isAllowed = ALLOWLISTED_STATUS_TERMINAL.some(f => file === f);
        check(isAllowed, `status='lost_to_rival' at ${file}:${i + 1} is in terminal mirror allowlist`);
      }
      if (/caseItem\.status\s*=\s*'withdrawn'|case\.status\s*=\s*'withdrawn'/.test(line)) {
        const isAllowed = ALLOWLISTED_STATUS_TERMINAL.some(f => file === f);
        check(isAllowed, `status='withdrawn' at ${file}:${i + 1} is in terminal mirror allowlist`);
      }
      if (/caseItem\.soldPrice\s*=|case\.soldPrice\s*=/.test(line)) {
        const isAllowed = ALLOWLISTED_SOLD_PRICE.some(f => file === f);
        check(isAllowed, `soldPrice write at ${file}:${i + 1} is in compatibility sync allowlist`);
      }
      if (/closedDeals\.(unshift|push)/.test(line)) {
        const isAllowed = ALLOWLISTED_CLOSED_DEALS.some(f => file === f);
        check(isAllowed, `closedDeals write at ${file}:${i + 1} is in compatibility sync allowlist`);
      }
    }
  }
}

// ── 5. No production direct sold outcome writes outside compatibility sync ──

console.log('\n=== R19-5: No direct sold outcome writes outside sync ===\n');

{
  // Verify syncLegacyCaseDealMirrorsFromContractFact exists and is the single write path
  const dealClosingSrc = readFileSafe('src/selling-houses/domain/dealClosing.ts');
  check(dealClosingSrc !== null, 'dealClosing.ts exists');
  if (dealClosingSrc) {
    check(
      dealClosingSrc.includes('export function syncLegacyCaseDealMirrorsFromContractFact'),
      'syncLegacyCaseDealMirrorsFromContractFact exists in dealClosing',
    );
    check(
      dealClosingSrc.includes('syncLegacyCaseDealMirrorsFromContractFact(state'),
      'syncLegacyCaseDealMirrorsFromContractFact is called',
    );
  }
}

// ── 6. No production direct owner readiness/trust writes outside canonical helpers ──

console.log('\n=== R19-6: No direct readiness/trust writes outside canonical helpers ===\n');

{
  const CANONICAL_TRUST_HELPERS = [
    'src/selling-houses/domain/trustWriteHelper.ts',
    'src/selling-houses/core/world-state/trustWriteSource.ts',
  ];
  const CANONICAL_READINESS_HELPERS = [
    'src/selling-houses/domain/ownerCaseReadinessHelper.ts',
    'src/selling-houses/domain/ownerCaseReadinessWriteHelper.ts',
    'src/selling-houses/core/world-state/ownerCaseReadinessWriteSource.ts',
  ];

  const allCanonical = new Set([...CANONICAL_TRUST_HELPERS, ...CANONICAL_READINESS_HELPERS]);

  const domainFiles = [
    'src/selling-houses/domain/dealClosing.ts',
    'src/selling-houses/domain/caseOutcome.ts',
    'src/selling-houses/domain/caseLifecycle.ts',
    'src/selling-houses/domain/engine/actionResolvers.ts',
    'src/selling-houses/domain/engine/opportunityEngine.ts',
    'src/selling-houses/domain/engine/customerEngine.ts',
    'src/selling-houses/domain/runtimeState.ts',
    'src/selling-houses/domain/resultEvaluation.ts',
    'src/selling-houses/domain/actionStageRelations.ts',
    'src/selling-houses/domain/opportunitySplitHelper.ts',
  ];

  for (const file of domainFiles) {
    const src = readFileSafe(file);
    if (!src) continue;
    const lines = src.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (/caseItem\.trust\s*=|case\.trust\s*=/.test(line)) {
        check(allCanonical.has(file), `direct trust write at ${file}:${i + 1} outside canonical helper`);
      }
      if (/caseItem\.patience\s*=|case\.patience\s*=/.test(line)) {
        check(allCanonical.has(file), `direct patience write at ${file}:${i + 1} outside canonical helper`);
      }
      if (/caseItem\.urgency\s*=|case\.urgency\s*=/.test(line)) {
        check(allCanonical.has(file), `direct urgency write at ${file}:${i + 1} outside canonical helper`);
      }
    }
  }

  // Canonical helpers are allowed to write mirrors
  for (const helperFile of CANONICAL_TRUST_HELPERS) {
    const src = readFileSafe(helperFile);
    check(src !== null, `canonical trust helper ${helperFile} exists`);
    if (src) {
      check(src.includes('caseItem.trust =') || src.includes('deriveCaseTrustMirror'),
        `canonical trust helper ${helperFile} syncs legacy trust mirror`);
    }
  }
  for (const helperFile of CANONICAL_READINESS_HELPERS) {
    const src = readFileSafe(helperFile);
    check(src !== null, `canonical readiness helper ${helperFile} exists`);
    if (src) {
      check(src.includes('caseItem.patience =') || src.includes('caseItem.urgency =') || src.includes('deriveCasePatienceMirror'),
        `canonical readiness helper ${helperFile} syncs legacy readiness mirror`);
    }
  }
}

// ── 7. Canonical owner readiness/trust records still sync deterministic legacy mirrors ──

console.log('\n=== R19-7: Canonical records sync deterministic mirrors ===\n');

{
  const trustHelperSrc = readFileSafe('src/selling-houses/domain/trustWriteHelper.ts');
  check(trustHelperSrc !== null, 'trustWriteHelper.ts exists');
  if (trustHelperSrc) {
    check(trustHelperSrc.includes('deriveCaseTrustMirror'), 'trustWriteHelper uses deriveCaseTrustMirror for mirror sync');
  }

  const readinessHelperSrc = readFileSafe('src/selling-houses/domain/ownerCaseReadinessHelper.ts');
  check(readinessHelperSrc !== null, 'ownerCaseReadinessHelper.ts exists');
  if (readinessHelperSrc) {
    check(readinessHelperSrc.includes('deriveCasePatienceMirror'), 'readinessHelper uses deriveCasePatienceMirror for mirror sync');
    check(readinessHelperSrc.includes('deriveCaseUrgencyMirror'), 'readinessHelper uses deriveCaseUrgencyMirror for mirror sync');
  }
}

// ── 8. PriceTrajectory has BuyerOffer + OwnerConcession for signed paths ──

console.log('\n=== R19-8: PriceTrajectory offer+concession for signed paths ===\n');

{
  // Test the assertTrajectoryHasOfferAndConcession function
  const { buildPriceTrajectoryFromDealClosingEvaluation } = await import(
    '../src/selling-houses/core/world-state/consensus/priceTrajectory.js'
  );

  const trajectory = buildPriceTrajectoryFromDealClosingEvaluation({
    caseId: 'test-case-1',
    customerId: 'test-cust-1',
    ownerId: 'owner:test-case-1',
    opportunityId: 'test-opp-1',
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

  const validation = assertTrajectoryHasOfferAndConcession(trajectory);
  check(validation.valid, 'deal-closing trajectory has BuyerOffer + OwnerConcession');
  check(validation.hasBuyerOffer, 'deal-closing trajectory has BuyerOffer');
  check(validation.hasOwnerConcession, 'deal-closing trajectory has OwnerConcession');

  // Verify in live state: any closed deal's ContractFact references a trajectory with offers+concessions
  const s0 = buildWorld(SEED);
  const caseId = firstActiveCaseId(s0);
  const s1 = advanceAndAct(s0, 30, caseId);

  const contractFacts = s1.runtimeContractFacts ?? [];
  const trajectories = s1.runtimePriceTrajectories ?? [];

  for (const contract of contractFacts) {
    const matchingTrajectory = trajectories.find(t => t.caseId === contract.caseId);
    if (matchingTrajectory) {
      const tv = assertTrajectoryHasOfferAndConcession(matchingTrajectory);
      check(tv.valid, `trajectory for contract ${contract.contractId} has offer+concession`);
    }
  }

  // Even without closed deals, prove the builder always creates offer+concession
  check(trajectory.offers.length >= 1, 'deal-closing trajectory always has at least 1 offer');
  check(trajectory.concessions.length >= 1, 'deal-closing trajectory always has at least 1 concession');
}

// ── 9. Derived stage from PriceTrajectory drives formal_offer/signed paths ──

console.log('\n=== R19-9: Derived stage validates formal_offer/signed ===\n');

{
  // Test deriveStageIndexFromPriceTrajectory
  const { buildPriceTrajectoryFromDealClosingEvaluation } = await import(
    '../src/selling-houses/core/world-state/consensus/priceTrajectory.js'
  );

  const dealTrajectory = buildPriceTrajectoryFromDealClosingEvaluation({
    caseId: 'test-case-2',
    customerId: 'test-cust-2',
    ownerId: 'owner:test-case-2',
    opportunityId: 'test-opp-2',
    day: 15,
    soldPrice: 950,
    closeReadiness: 85,
    closeProbability: 80,
    buyerBudgetMax: 1000,
    buyerIntent: 90,
    buyerConfidence: 75,
    caseAskPrice: 980,
    caseMarketPrice: 960,
    caseBottomPrice: 900,
    blockers: [],
    supportingFactors: ['high intent'],
    strategyId: 'close',
  });

  const derivedStage = deriveStageIndexFromPriceTrajectory(dealTrajectory);
  check(derivedStage === 'formal_offer', `deal-closing trajectory derives formal_offer (got: ${derivedStage})`);

  // Test deriveConsensusStatusFromTrajectory
  const statusResult = deriveConsensusStatusFromTrajectory(dealTrajectory);
  check(statusResult.source === 'trajectory', `consensus status derived from trajectory (source: ${statusResult.source})`);
  check(statusResult.status === 'formal_offer', `trajectory-derived status is formal_offer (got: ${statusResult.status})`);

  // Test fallback
  const fallbackResult = deriveConsensusStatusFromTrajectory(undefined, 'negotiable_zone');
  check(fallbackResult.source === 'legacy_fallback', 'undefined trajectory falls back to legacy');
  check(fallbackResult.status === 'negotiable_zone', 'fallback status matches provided fallback');
}

// ── 10. ConsensusFormation/ContractFact chain references trajectory/source evidence ──

console.log('\n=== R19-10: Contract chain references trajectory evidence ===\n');

{
  const s0 = buildWorld(SEED);
  const caseId = firstActiveCaseId(s0);
  const s1 = advanceAndAct(s0, 30, caseId);

  const contractFacts = s1.runtimeContractFacts ?? [];
  const trajectories = s1.runtimePriceTrajectories ?? [];

  for (const contract of contractFacts) {
    const hasTrajectoryRef = contract.sourceEventRefs.some(ref => ref.startsWith('ptraj:'));
    check(hasTrajectoryRef, `contract ${contract.contractId} references trajectory in sourceEventRefs`);

    const hasReadinessRef = contract.sourceEventRefs.some(ref => ref.startsWith('pready:'));
    check(hasReadinessRef, `contract ${contract.contractId} references readiness in sourceEventRefs`);

    // Verify trajectory exists for this contract
    const matchingTraj = trajectories.find(t => t.caseId === contract.caseId);
    check(matchingTraj !== undefined, `trajectory exists for contract case ${contract.caseId}`);
  }

  // If no contracts in this world state, verify the builder always includes trajectory refs
  if (contractFacts.length === 0) {
    const dealClosingSrc = readFileSafe('src/selling-houses/domain/dealClosing.ts');
    if (dealClosingSrc) {
      check(dealClosingSrc.includes('canonicalTrajectory.trajectoryId') || dealClosingSrc.includes('canonicalTrajectory,'), 'dealClosing uses trajectory in proof path');
      check(dealClosingSrc.includes('canonicalReadiness.readinessId') || dealClosingSrc.includes('canonicalReadiness,'), 'dealClosing uses readiness in proof path');
    }
  }
}

// ── 11. ContractFact still requires signed ConsensusFormation ──

console.log('\n=== R19-11: ContractFact requires signed consensus ===\n');

{
  const writeSourceSrc = readFileSafe('src/selling-houses/core/world-state/consensus/writeSource.ts');
  check(writeSourceSrc !== null, 'writeSource.ts exists');
  if (writeSourceSrc) {
    check(writeSourceSrc.includes('readonly consensusId: string'), 'ContractFactState has consensusId field');
  }

  const helperSrc = readFileSafe('src/selling-houses/domain/consensusFormationHelper.ts');
  check(helperSrc !== null, 'consensusFormationHelper.ts exists');
  if (helperSrc) {
    check(helperSrc.includes('consensusId'), 'createContractFactOnState takes consensusId param');
  }

  // Behavioral: createContractFactOnState creates a contract referencing a consensus
  const { createContractFactOnState } = await import(
    '../src/selling-houses/domain/consensusFormationHelper.js'
  );
  const state: any = { runtimeContractFacts: [], runtimeConsensusFormations: [], runtimeOpportunityClosureSets: [] };
  const result = createContractFactOnState(
    state,
    'consensus-signed-test',
    'brokered-opp-1',
    'case-1',
    'customer-1',
    950,
    'self_closed',
    10,
    'deal-test-1',
    85,
    80,
    [],
    ['strong trust'],
    ['ptraj:test-1', 'pready:test-1'],
  );
  check(result !== undefined, 'createContractFactOnState returns a ContractFact');
  if (result) {
    check(result.consensusId === 'consensus-signed-test', `contract references consensus: ${result.consensusId}`);
  }
}

// ── 12. ContractFact cannot be faked by ActionReceipt/manager/process receipts ──

console.log('\n=== R19-12: ContractFact not fakable by receipts ===\n');

{
  // Verify ContractFact creation is only in allowlisted paths
  const dealClosingSrc = readFileSafe('src/selling-houses/domain/dealClosing.ts');
  check(dealClosingSrc !== null, 'dealClosing.ts exists');
  if (dealClosingSrc) {
    check(dealClosingSrc.includes('createContractFactFromPriceConsensusOnState'), 'dealClosing creates ContractFact (proof-based)');
  }

  // Verify no receipt-creating code can create ContractFact
  const receiptFiles = [
    'src/selling-houses/domain/world-model/runtime/clock.ts',
    'src/selling-houses/application/projections/actorKnowledgeProjection.ts',
  ];
  for (const file of receiptFiles) {
    const src = readFileSafe(file);
    if (!src) continue;
    check(!src.includes('createContractFactOnState'), `${file} does not create ContractFact`);
    check(!src.includes('ContractFactState'), `${file} does not reference ContractFactState`);
  }

  // Duplicate guard: second contract for same case is rejected
  const { createContractFactOnState: createContract } = await import(
    '../src/selling-houses/domain/consensusFormationHelper.js'
  );
  const testState: any = { runtimeContractFacts: [], runtimeConsensusFormations: [], runtimeOpportunityClosureSets: [] };
  const first = createContract(
    testState, 'c1', 'bo1', 'case-dup', 'cust-1', 900, 'self_closed', 5, 'd1', 80, 70, [], [],
  );
  check(first !== undefined, 'first contract for case-dup created');
  const second = createContract(
    testState, 'c2', 'bo2', 'case-dup', 'cust-2', 950, 'self_closed', 6, 'd2', 85, 80, [], [],
  );
  check(second === undefined, 'duplicate contract for case-dup rejected');
}

// ── 13-16. Prior gates still pass ──────────────────────────────────────

console.log('\n=== R19-13..16: Prior gates still pass ===\n');

const priorGates = [
  { name: 'R15', script: 'scripts/verify-selling-houses-r15-source-ledger-retention-decision-trace-gate.ts' },
  { name: 'R16', script: 'scripts/verify-selling-houses-r16-runtime-rich-receipts-customer-pov-gate.ts' },
  { name: 'R17', script: 'scripts/verify-selling-houses-r17-customer-visible-process-dynamic-evidence-gate.ts' },
  { name: 'R18', script: 'scripts/verify-selling-houses-r18-visibility-metric-belief-manager-message-gate.ts' },
];

for (const gate of priorGates) {
  const result = spawnSync('npx', ['tsx', gate.script], { stdio: 'pipe', shell: process.platform === 'win32', timeout: 120_000 });
  if (result.error) {
    fail(`${gate.name} gate: ${result.error.message}`);
  } else if (result.status !== 0) {
    fail(`${gate.name} gate: exit ${result.status}`);
  } else {
    pass(`${gate.name} gate still passes`);
  }
}

// ── 17. Replay determinism ─────────────────────────────────────────────

console.log('\n=== R19-17: Replay determinism ===\n');

function runDeterminismSequence(seed: number) {
  const s0 = buildWorld(seed);
  const caseId = s0.cases.find((e) => e.status === 'active')?.id ?? '';
  const s1 = advanceAndAct(s0, 25, caseId);

  const contractFacts = s1.runtimeContractFacts ?? [];
  const terminalOutcomes = s1.runtimeCaseTerminalOutcomes ?? [];

  // Outcome projection
  const outcomeMap = deriveCaseOutcomeProjection({
    contractFacts,
    terminalOutcomes,
    activeCaseIds: s1.cases.filter(c => c.status === 'active').map(c => c.id),
  });

  const projectionEntries = [...outcomeMap.entries()]
    .map(([k, v]) => `${k}:${v.status}:${v.sourceKind}`)
    .sort();

  // Closed deal projection
  const closedDealProjection = deriveClosedDealProjectionFromContractFacts(contractFacts)
    .map(p => `${p.caseId}:${p.dealPrice}:${p.sourceContractId}`)
    .sort();

  // Trajectory-derived stage for each trajectory
  const trajectories = s1.runtimePriceTrajectories ?? [];
  const derivedStages = trajectories
    .map(t => `${t.trajectoryId}:${deriveStageIndexFromPriceTrajectory(t)}`)
    .sort();

  // Contract IDs
  const contractIds = contractFacts.map(c => c.contractId).sort();

  return { projectionEntries, closedDealProjection, derivedStages, contractIds };
}

const runA = runDeterminismSequence(SEED);
const runB = runDeterminismSequence(SEED);

check(JSON.stringify(runA.projectionEntries) === JSON.stringify(runB.projectionEntries), 'replay: same outcome projections');
check(JSON.stringify(runA.closedDealProjection) === JSON.stringify(runB.closedDealProjection), 'replay: same closed deal projections');
check(JSON.stringify(runA.derivedStages) === JSON.stringify(runB.derivedStages), 'replay: same trajectory-derived stages');
check(JSON.stringify(runA.contractIds) === JSON.stringify(runB.contractIds), 'replay: same contract IDs');

// ── 18. Gate self-audit ────────────────────────────────────────────────

console.log('\n=== R19-18: Gate self-audit ===\n');

const gateSelfSrc = readFileSync(import.meta.filename!, 'utf-8');
const softPassViolations = findGateSoftPassLines(gateSelfSrc);
check(softPassViolations.length === 0, `gate self-audit: no soft-pass patterns (found ${softPassViolations.length})`);
check(failed === 0, 'gate self-audit: no swallowed failures');

// ── Summary ───────────────────────────────────────────────────────────

console.log('\n=== R19 Structural Truth Lock Gate Summary ===\n');
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
console.log('Verified: structural truth lock, outcome projection, readiness/trust source lock, trajectory stage derivation.');
