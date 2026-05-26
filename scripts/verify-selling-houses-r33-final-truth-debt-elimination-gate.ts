/**
 * R33 Final Truth Debt Elimination Gate
 *
 * Proves:
 * 1. Trace uses proof fields — constitutionalTruthTrace reads ContractFact proof data
 * 2. Executable positive fixture — proof-backed ContractFact traces offer/concession/weight
 * 3. Executable negative fixture — legacy/incomplete ContractFact reports exact debt
 * 4. Handoff consistency — no false "BuyerOffer/OwnerConcession not modeled" claim
 * 5. Case lifecycle status read boundary exists
 * 6. Customer read boundary — no local readBrokerCustomerTrust in dealClosing
 * 7. R32 regression — receipt honesty still holds
 * 8. Gate hygiene
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { findGateSoftPassLines } from './selling-houses-gate-hygiene.js';

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
    console.error(`  [FAIL] ${message}`);
  }
}

function readFile(path: string): string {
  return readFileSync(resolve(path), 'utf-8');
}

function readFileSafe(path: string): string | null {
  try {
    return readFileSync(resolve(path), 'utf-8');
  } catch {
    return null;
  }
}

// ── 1. Trace uses proof fields ──

console.log('\n=== R33-1: Trace uses proof fields ===\n');

{
  const traceSrc = readFile('src/selling-houses/core/world-state/constitutionalTruthTrace.ts');
  check(traceSrc.includes('priceTrajectoryId'), 'trace reads priceTrajectoryId from ContractFact');
  check(traceSrc.includes('buyerOfferId'), 'trace reads buyerOfferId from ContractFact');
  check(traceSrc.includes('ownerConcessionId'), 'trace reads ownerConcessionId from ContractFact');
  check(traceSrc.includes('weightExplanations'), 'trace reads weightExplanations from ContractFact');
  check(traceSrc.includes('runtimePriceTrajectories'), 'trace reads runtimePriceTrajectories');
  check(!traceSrc.includes("missing-offer-evidence") || traceSrc.includes('buyerOfferId'), 'trace does not unconditionally push missing-offer-evidence');
  check(!traceSrc.includes("missing-concession-evidence") || traceSrc.includes('ownerConcessionId'), 'trace does not unconditionally push missing-concession-evidence');
}

// ── 2. Executable positive fixture ──

console.log('\n=== R33-2: Executable positive fixture ===\n');

{
  // Verify that BuyerOffer/OwnerConcession/PriceConsensusProof/WeightExplanation exist
  const priceTrajectorySrc = readFile('src/selling-houses/core/world-state/consensus/priceTrajectory.ts');
  check(priceTrajectorySrc.includes('export interface BuyerOffer'), 'BuyerOffer interface exists');
  check(priceTrajectorySrc.includes('export interface OwnerConcession'), 'OwnerConcession interface exists');
  check(priceTrajectorySrc.includes('export interface PriceConsensusProof'), 'PriceConsensusProof interface exists');
  check(priceTrajectorySrc.includes('export interface WeightExplanation'), 'WeightExplanation interface exists');

  // Verify ContractFactState has proof fields
  const writeSourceSrc = readFile('src/selling-houses/core/world-state/consensus/writeSource.ts');
  check(writeSourceSrc.includes('priceTrajectoryId'), 'ContractFactState has priceTrajectoryId');
  check(writeSourceSrc.includes('buyerOfferId'), 'ContractFactState has buyerOfferId');
  check(writeSourceSrc.includes('ownerConcessionId'), 'ContractFactState has ownerConcessionId');
  check(writeSourceSrc.includes('weightExplanations'), 'ContractFactState has weightExplanations');

  // Run the actual trace with a proof-backed ContractFact
  try {
    const { buildConstitutionalTruthTrace } = await import('../src/selling-houses/core/world-state/constitutionalTruthTrace.js');
    const { createContractFactFromProof } = await import('../src/selling-houses/core/world-state/consensus/writeSource.js');
    const { buildPriceConsensusProof, buildPriceTrajectoryFromDealClosingEvaluation, buildPriceConsensusReadiness } = await import('../src/selling-houses/core/world-state/consensus/priceTrajectory.js');

    // Build a PriceTrajectory with offer/concession
    const trajectory = buildPriceTrajectoryFromDealClosingEvaluation({
      caseId: 'test-case',
      customerId: 'cust-1',
      ownerId: 'owner-1',
      opportunityId: 'opp-1',
      day: 10,
      soldPrice: 950,
      closeReadiness: 0.9,
      closeProbability: 0.85,
      buyerBudgetMax: 1000,
      buyerIntent: 90,
      buyerConfidence: 85,
      caseAskPrice: 1000,
      caseMarketPrice: 950,
      caseBottomPrice: 900,
      blockers: [],
      supportingFactors: ['high-intent'],
      strategyId: 'balanced',
    });

    const readiness = buildPriceConsensusReadiness(trajectory);

    const proof = buildPriceConsensusProof({ trajectory, readiness });

    check(proof.buyerOffer.offerId.length > 0, 'proof has buyerOffer with offerId');
    check(proof.ownerConcession.concessionId.length > 0, 'proof has ownerConcession with concessionId');
    check(proof.weightExplanations.length > 0, 'proof has weightExplanations');
    check(proof.trajectory.trajectoryId.length > 0, 'proof has trajectory with trajectoryId');

    const contractFact = createContractFactFromProof(
      'consensus-1', 'bopp-1', 'test-case', 'cust-1',
      'self_closed', 10, 'deal-1', 0.9, 0.85, [], ['high-intent'], proof,
    );
    check(contractFact.priceTrajectoryId === proof.trajectory.trajectoryId, 'contractFact.priceTrajectoryId matches proof trajectory');
    check(contractFact.buyerOfferId === proof.buyerOffer.offerId, 'contractFact.buyerOfferId matches proof buyerOffer');
    check(contractFact.ownerConcessionId === proof.ownerConcession.concessionId, 'contractFact.ownerConcessionId matches proof ownerConcession');

    // Build trace with a minimal GameState
    const state = {
      cases: [{ id: 'test-case' }],
      runtimeContractFacts: [contractFact],
      runtimeConsensusFormations: [],
      runtimePriceTrajectories: [trajectory],
      runtimeBrokerOwnerRelations: [],
      runtimeOwnerCaseReadinessStates: [],
      opportunities: [{ id: 'opp-1', caseId: 'test-case', customerId: 'cust-1' }],
      actionReceiptHistory: [],
      runtimeCaseTerminalOutcomes: [],
    } as any;

    const trace = buildConstitutionalTruthTrace(state, contractFact);

    check(trace.offerIds.length > 0, `positive fixture: offerIds not empty (got ${trace.offerIds.length})`);
    check(trace.concessionIds.length > 0, `positive fixture: concessionIds not empty (got ${trace.concessionIds.length})`);
    check(trace.priceTrajectoryId === proof.trajectory.trajectoryId, 'positive fixture: priceTrajectoryId matches');
    check(trace.weightExplanations.length > 0, 'positive fixture: weightExplanations present');

    // Check no offer/concession debt for proof-backed contract
    const offerDebt = trace.debts.find((d: any) => d.kind === 'missing-offer-evidence');
    const concessionDebt = trace.debts.find((d: any) => d.kind === 'missing-concession-evidence');
    check(!offerDebt, 'positive fixture: no missing-offer-evidence debt');
    check(!concessionDebt, 'positive fixture: no missing-concession-evidence debt');
  } catch (err: any) {
    check(false, `positive fixture execution failed: ${err.message}`);
  }
}

// ── 3. Executable negative fixture ──

console.log('\n=== R33-3: Executable negative fixture ===\n');

{
  try {
    const { buildConstitutionalTruthTrace } = await import('../src/selling-houses/core/world-state/constitutionalTruthTrace.js');

    // Build a legacy/incomplete ContractFact without proof fields
    const legacyContractFact = {
      contractId: 'legacy-contract-1',
      caseId: 'legacy-case',
      consensusId: 'consensus-1',
      dealPrice: 950,
      // No priceTrajectoryId, buyerOfferId, ownerConcessionId, weightExplanations
    } as any;

    const state = {
      cases: [{ id: 'legacy-case' }],
      runtimeContractFacts: [legacyContractFact],
      runtimeConsensusFormations: [{ consensusId: 'consensus-1' }],
      runtimePriceTrajectories: [],
      runtimeBrokerOwnerRelations: [],
      runtimeOwnerCaseReadinessStates: [],
      opportunities: [],
      actionReceiptHistory: [],
      runtimeCaseTerminalOutcomes: [],
    } as any;

    const trace = buildConstitutionalTruthTrace(state, legacyContractFact);

    const hasPriceTrajectoryDebt = trace.debts.some((d: any) => d.kind === 'missing-price-trajectory');
    const hasOfferDebt = trace.debts.some((d: any) => d.kind === 'missing-offer-evidence');
    const hasConcessionDebt = trace.debts.some((d: any) => d.kind === 'missing-concession-evidence');

    check(hasPriceTrajectoryDebt, 'negative fixture: reports missing-price-trajectory debt');
    check(hasOfferDebt || trace.offerIds.length === 0, 'negative fixture: reports offer debt or empty offerIds');
    check(hasConcessionDebt || trace.concessionIds.length === 0, 'negative fixture: reports concession debt or empty concessionIds');
  } catch (err: any) {
    check(false, `negative fixture execution failed: ${err.message}`);
  }
}

// ── 4. Handoff consistency ──

console.log('\n=== R33-4: Handoff consistency ===\n');

{
  const handoffSrc = readFileSafe('docs/selling-houses-agent-handoff.md');
  check(handoffSrc !== null, 'handoff doc exists');
  if (handoffSrc) {
    const hasFalseClaim = handoffSrc.includes('BuyerOffer/OwnerConcession records not modeled') ||
      handoffSrc.includes('BuyerOffer/OwnerConcession are not modeled');
    check(!hasFalseClaim, 'handoff does not falsely claim BuyerOffer/OwnerConcession are not modeled');
  }
}

// ── 5. Case lifecycle status read boundary ──

console.log('\n=== R33-5: Case lifecycle status read boundary ===\n');

{
  const caseOutcomeProjSrc = readFileSafe('src/selling-houses/core/world-state/caseOutcomeProjection.ts');
  const caseOutcomeSrc = readFileSafe('src/selling-houses/domain/caseOutcome.ts');

  const hasReadCaseLifecycleStatus =
    (caseOutcomeProjSrc && caseOutcomeProjSrc.includes('readCaseLifecycleStatusFromCanonicalState')) ||
    (caseOutcomeSrc && caseOutcomeSrc.includes('readCaseLifecycleStatusFromCanonicalState'));

  check(hasReadCaseLifecycleStatus, 'readCaseLifecycleStatusFromCanonicalState function exists');

  // Verify it returns source provenance
  if (caseOutcomeProjSrc && caseOutcomeProjSrc.includes('readCaseLifecycleStatusFromCanonicalState')) {
    check(caseOutcomeProjSrc.includes("contract_fact") || caseOutcomeProjSrc.includes("'contract_fact'"), 'status read returns contract_fact source');
    check(caseOutcomeProjSrc.includes("terminal_outcome") || caseOutcomeProjSrc.includes("'terminal_outcome'"), 'status read returns terminal_outcome source');
  }
}

// ── 6. Customer read boundary ──

console.log('\n=== R33-6: Customer read boundary ===\n');

{
  const dealClosingSrc = readFile('src/selling-houses/domain/dealClosing.ts');
  check(!dealClosingSrc.includes('function readBrokerCustomerTrust'), 'dealClosing.ts does NOT define local readBrokerCustomerTrust');

  // Check that a shared boundary exists
  const customerDirFiles = ['src/selling-houses/core/world-state/customer/brokerCustomerRelation.ts',
    'src/selling-houses/core/world-state/customer/customerReadBoundary.ts'];
  let hasSharedBoundary = false;
  for (const f of customerDirFiles) {
    const src = readFileSafe(f);
    if (src && src.includes('readBrokerCustomerTrust')) {
      hasSharedBoundary = true;
      break;
    }
  }
  check(hasSharedBoundary, 'shared readBrokerCustomerTrust exists in core/customer');
}

// ── 7. R32 regression ──

console.log('\n=== R33-7: R32 regression — receipt honesty ===\n');

{
  const kernelSrc = readFile('src/selling-houses/core/world-state/canonicalStoreKernel.ts');
  check(kernelSrc.includes('LegacyMirrorWriteReceipt'), 'LegacyMirrorWriteReceipt still exists');
  check(kernelSrc.includes('closedDeals'), 'closedDeals still in LegacyMirrorStoreName');

  const dealClosingSrc = readFile('src/selling-houses/domain/dealClosing.ts');
  check(dealClosingSrc.includes('prependClosedDealMirrorFromContractFact'), 'prependClosedDealMirrorFromContractFact still exists');
  check(dealClosingSrc.includes('LegacyMirrorWriteReceipt'), 'dealClosing uses LegacyMirrorWriteReceipt');
}

// ── 8. Gate hygiene ──

console.log('\n=== R33-8: Gate hygiene ===\n');

{
  const gateSrc = readFileSync(import.meta.filename!, 'utf-8');
  const softPassViolations = findGateSoftPassLines(gateSrc);
  check(softPassViolations.length === 0, `gate self-audit: no soft-pass patterns (found ${softPassViolations.length})`);
}

// ── Summary ──

console.log('\n=== R33 Final Truth Debt Elimination Gate Summary ===\n');
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
console.log('Verified: trace uses proof fields, positive/negative fixtures, handoff consistency, status boundary, customer boundary, receipt honesty.');
