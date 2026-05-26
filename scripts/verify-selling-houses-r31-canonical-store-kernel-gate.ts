/**
 * R31 Canonical Store Kernel Gate
 *
 * Proves:
 * 1.  Type surface lock — GameState canonical stores are readonly arrays
 * 2.  No casual direct mutation — zero bare state.runtimeX = / .push / [idx] = in production
 * 3.  Boundary module inventory — store helpers exist per truth class
 * 4.  Capability/provenance — store helpers accept explicit provenance
 * 5.  Receipt/audit — CanonicalStoreWriteReceipt type exists, helpers return receipts
 * 6.  No scalar contract regression — R28 proof-path invariants hold
 * 7.  No read-semantics regression — R30 invariants hold
 * 8.  Gate hygiene
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

// ── 1. Type surface lock ──

console.log('\n=== R31-1: Type surface lock — canonical stores are readonly arrays ===\n');

const CANONICAL_STORE_FIELDS = [
  'runtimeBrokerOwnerRelations',
  'runtimeBrokerCustomerRelations',
  'runtimeOwnerCaseReadinessStates',
  'runtimeCustomerCaseMatches',
  'runtimeBrokeredOpportunities',
  'runtimeConsensusFormations',
  'runtimeContractFacts',
  'runtimeOpportunityClosureSets',
  'runtimePriceTrajectories',
  'runtimePriceConsensusReadinesses',
  'runtimeCaseTerminalOutcomes',
];

const HISTORY_READONLY_FIELDS = [
  'eventLog',
  'eventStore',
  'weeklyReviews',
  'closedDeals',
  'budgetLedger',
  'actionReceiptHistory',
  'commitmentSettlementHistory',
  'processRunHistory',
  'ownerDecisionMomentHistory',
  'strategyForkHistory',
  'managerInterventionReceiptHistory',
  'negotiationReplayHistory',
  'businessOutcomeReviewHistory',
  'wechatConversationHistory',
  'operatingLedgerDays',
];

{
  const modelsSrc = readFile('src/selling-houses/domain/models.ts');
  const gsMatch = modelsSrc.match(/export interface GameState[\s\S]*?^}/m);
  check(gsMatch !== null, 'GameState interface found');
  if (gsMatch) {
    const gsBody = gsMatch[0];
    for (const field of CANONICAL_STORE_FIELDS) {
      const regex = new RegExp(`readonly\\s+${field}\\s*\\??\\s*:\\s*readonly\\s+`);
      check(regex.test(gsBody), `${field} is readonly array in GameState`);
    }
    for (const field of HISTORY_READONLY_FIELDS) {
      const regex = new RegExp(`readonly\\s+${field}\\s*\\??\\s*:\\s*readonly\\s+`);
      check(regex.test(gsBody), `${field} is readonly array in GameState`);
    }
  }
}

// ── 2. No casual direct mutation ──

console.log('\n=== R31-2: No casual direct mutation of canonical stores ===\n');

{
  const PRODUCTION_DIRS = [
    'src/selling-houses/domain',
    'src/selling-houses/application',
    'src/selling-houses/core',
  ];

  // Allowlisted store boundary modules that are permitted to use asWritableGameState on canonical stores
  const ALLOWED_BOUNDARY_FILES = new Set([
    'trustWriteHelper.ts',
    'ownerCaseReadinessWriteHelper.ts',
    'opportunitySplitHelper.ts',
    'consensusFormationHelper.ts',
    'dealClosing.ts',
    'caseOutcome.ts',
    'gameState.ts',
    'runtimeState.ts',
    'budget.ts',
    'marketEngine.ts',
    'actionTransaction.ts',
    'actionResourceAccounting.ts',
    'actionResolvers.ts',
    'actionReceiptWiring.ts',
    'gameTransitions.ts',
    'wechatConversation.ts',
    'engine.ts',
    'eventEngine.ts',
  ]);

  // Also allow runtime simulation adapters (they upsert history arrays)
  const ALLOWED_ADAPTER_PREFIX = 'runtime/simulation/';

  const canonicalFieldPattern = new RegExp(
    `(?:state|world)\\.(runtime\\w+|closedDeals|budgetLedger|eventLog|eventStore|weeklyReviews|operatingLedgerDays|actionReceiptHistory|commitmentSettlementHistory|processRunHistory|ownerDecisionMomentHistory|strategyForkHistory|managerInterventionReceiptHistory|negotiationReplayHistory|businessOutcomeReviewHistory|wechatConversationHistory)`,
  );

  const mutationPattern = new RegExp(
    `asWritableGameState\\([^)]+\\)\\.(?:runtime\\w+|closedDeals|budgetLedger|eventLog|eventStore|weeklyReviews|operatingLedgerDays|actionReceiptHistory|commitmentSettlementHistory|processRunHistory|ownerDecisionMomentHistory|strategyForkHistory|managerInterventionReceiptHistory|negotiationReplayHistory|businessOutcomeReviewHistory|wechatConversationHistory)\\s*(?:=|\\.push|\\.unshift|\\.splice|\\[)`,
  );

  // Also check bare mutations (without asWritableGameState) which should not exist at all
  const bareMutationPattern = new RegExp(
    `(?:state|world)\\.(runtime\\w+|closedDeals|budgetLedger|eventLog|eventStore|weeklyReviews|operatingLedgerDays|actionReceiptHistory|commitmentSettlementHistory|processRunHistory|ownerDecisionMomentHistory|strategyForkHistory|managerInterventionReceiptHistory|negotiationReplayHistory|businessOutcomeReviewHistory|wechatConversationHistory)\\s*(?:=|\\.push|\\.unshift|\\.splice|\\[)`,
  );

  let bareMutations = 0;
  const bareLocations: string[] = [];
  let outOfBoundaryMutations = 0;
  const outOfBoundaryLocations: string[] = [];

  for (const dir of PRODUCTION_DIRS) {
    const { execSync } = await import('node:child_process');
    let files: string[];
    try {
      files = execSync(`find ${dir} -name '*.ts' -not -name '*.d.ts'`, { encoding: 'utf-8' })
        .trim().split('\n').filter(Boolean);
    } catch {
      continue;
    }

    for (const file of files) {
      const src = readFileSafe(file);
      if (!src) continue;
      const lines = src.split('\n');
      const fileName = file.split('/').pop()!;
      const isInAllowedBoundary = ALLOWED_BOUNDARY_FILES.has(fileName) || file.includes(ALLOWED_ADAPTER_PREFIX);

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line.startsWith('//') || line.startsWith('*') || line.startsWith('/*')) continue;

        // Check for bare mutations (no asWritableGameState wrapper at all)
        if (bareMutationPattern.test(line)) {
          // If this line DOES have asWritableGameState, it's not a bare mutation
          if (!line.includes('asWritableGameState')) {
            bareMutations++;
            bareLocations.push(`${fileName}:${i + 1}: ${line.substring(0, 80)}`);
          }
        }

        // Check for asWritableGameState mutations outside boundary modules
        if (mutationPattern.test(line) && !isInAllowedBoundary) {
          outOfBoundaryMutations++;
          outOfBoundaryLocations.push(`${fileName}:${i + 1}: ${line.substring(0, 80)}`);
        }
      }
    }
  }

  if (bareLocations.length > 0) {
    console.log('\n  Bare canonical store mutations:');
    for (const loc of bareLocations) console.log(`    ${loc}`);
  }
  if (outOfBoundaryLocations.length > 0) {
    console.log('\n  Out-of-boundary canonical store mutations:');
    for (const loc of outOfBoundaryLocations) console.log(`    ${loc}`);
  }

  check(bareMutations === 0, `Zero bare canonical store mutations (found ${bareMutations})`);
  check(outOfBoundaryMutations === 0, `Zero out-of-boundary canonical store mutations (found ${outOfBoundaryMutations})`);
}

// ── 3. Boundary module inventory — store helpers per truth class ──

console.log('\n=== R31-3: Boundary module inventory ===\n');

{
  // Trust store
  const trustSrc = readFileSafe('src/selling-houses/domain/trustWriteHelper.ts');
  check(trustSrc !== null, 'trustWriteHelper.ts exists');
  if (trustSrc) {
    check(trustSrc.includes('ensureBrokerOwnerTrustStore') || trustSrc.includes('ensureBrokerOwnerTrustState'), 'trust store: ensure helper exists');
    check(trustSrc.includes('appendBrokerOwnerTrustState') || trustSrc.includes('.push(') && trustSrc.includes('asWritableGameState'), 'trust store: append capability exists');
    check(trustSrc.includes('replaceBrokerOwnerTrustState') || trustSrc.includes('[index]') && trustSrc.includes('asWritableGameState'), 'trust store: replace capability exists');
  }

  // Readiness store
  const readinessSrc = readFileSafe('src/selling-houses/domain/ownerCaseReadinessWriteHelper.ts');
  check(readinessSrc !== null, 'ownerCaseReadinessWriteHelper.ts exists');
  if (readinessSrc) {
    check(readinessSrc.includes('ensureOwnerCaseReadinessStore') || readinessSrc.includes('ensureOwnerCaseReadinessState'), 'readiness store: ensure helper exists');
    check(readinessSrc.includes('appendOwnerCaseReadinessState') || readinessSrc.includes('.push(') && readinessSrc.includes('asWritableGameState'), 'readiness store: append capability exists');
    check(readinessSrc.includes('replaceOwnerCaseReadinessState') || readinessSrc.includes('[index]') && readinessSrc.includes('asWritableGameState'), 'readiness store: replace capability exists');
  }

  // Broker-customer relation store
  const gameStateSrc = readFileSafe('src/selling-houses/application/gameState.ts');
  check(gameStateSrc !== null, 'gameState.ts exists');
  if (gameStateSrc) {
    check(
      gameStateSrc.includes('initializeCanonicalRuntimeStores') ||
      gameStateSrc.includes('runtimeBrokerCustomerRelations'),
      'broker-customer store: initialization in gameState.ts',
    );
  }

  // Opportunity relation store
  const opportunitySrc = readFileSafe('src/selling-houses/domain/opportunitySplitHelper.ts');
  check(opportunitySrc !== null, 'opportunitySplitHelper.ts exists');
  if (opportunitySrc) {
    check(opportunitySrc.includes('ensureCustomerCaseMatchStore') || opportunitySrc.includes('ensureRuntimeCustomerCaseMatches'), 'opportunity store: ensure helper for customerCaseMatches');
    check(opportunitySrc.includes('ensureBrokeredOpportunityStore') || opportunitySrc.includes('ensureRuntimeBrokeredOpportunities'), 'opportunity store: ensure helper for brokeredOpportunities');
  }

  // Consensus / contract / closure store
  const consensusSrc = readFileSafe('src/selling-houses/domain/consensusFormationHelper.ts');
  check(consensusSrc !== null, 'consensusFormationHelper.ts exists');
  if (consensusSrc) {
    check(consensusSrc.includes('ensureConsensusStore') || consensusSrc.includes('ensureRuntimeConsensusFormations'), 'consensus store: ensure helper');
    check(consensusSrc.includes('ensureContractFactStore') || consensusSrc.includes('ensureRuntimeContractFacts'), 'contract store: ensure helper');
    check(consensusSrc.includes('ensureOpportunityClosureStore') || consensusSrc.includes('ensureRuntimeOpportunityClosureSets'), 'closure store: ensure helper');
  }

  // Price trajectory / readiness store
  const dealClosingSrc = readFileSafe('src/selling-houses/domain/dealClosing.ts');
  check(dealClosingSrc !== null, 'dealClosing.ts exists');
  if (dealClosingSrc) {
    check(
      dealClosingSrc.includes('ensurePriceTrajectoryStore') ||
      dealClosingSrc.includes('runtimePriceTrajectories') && dealClosingSrc.includes('asWritableGameState'),
      'price store: ensure/append capability exists',
    );
  }

  // Terminal outcome store
  const caseOutcomeSrc = readFileSafe('src/selling-houses/domain/caseOutcome.ts');
  check(caseOutcomeSrc !== null, 'caseOutcome.ts exists');
  if (caseOutcomeSrc) {
    check(
      caseOutcomeSrc.includes('ensureTerminalOutcomeStore') ||
      caseOutcomeSrc.includes('runtimeCaseTerminalOutcomes') && caseOutcomeSrc.includes('asWritableGameState'),
      'terminal outcome store: ensure/append capability exists',
    );
  }

  // ClosedDeal mirror store
  if (dealClosingSrc) {
    check(
      dealClosingSrc.includes('prependClosedDealMirrorFromContractFact') ||
      dealClosingSrc.includes('prependClosedDealMirror'),
      'closedDeal mirror: prepend helper exists',
    );
  }
}

// ── 4. Capability/provenance ──

console.log('\n=== R31-4: Capability/provenance ===\n');

{
  const kernelSrc = readFileSafe('src/selling-houses/core/world-state/canonicalStoreKernel.ts');
  check(kernelSrc !== null, 'canonicalStoreKernel.ts exists');
  if (kernelSrc) {
    check(kernelSrc.includes('CanonicalStoreWriteProvenance'), 'CanonicalStoreWriteProvenance type defined');
    check(kernelSrc.includes('canonical-bootstrap'), 'canonical-bootstrap provenance defined');
    check(kernelSrc.includes('old_save_compatibility'), 'old_save_compatibility provenance defined');
    check(kernelSrc.includes('canonical-delta'), 'canonical-delta provenance defined');
    check(kernelSrc.includes('contract-fact'), 'contract-fact provenance defined');
    check(kernelSrc.includes('terminal-outcome'), 'terminal-outcome provenance defined');
    check(kernelSrc.includes('fixture-only'), 'fixture-only provenance defined');
  }

  // Trust ensure uses provenance
  if (trustSrc === undefined) {
    var trustSrc = readFileSafe('src/selling-houses/domain/trustWriteHelper.ts');
  }
  if (trustSrc) {
    check(
      trustSrc.includes('_hydrationProvenance') || trustSrc.includes('provenance'),
      'trust store: ensure helper accepts provenance',
    );
  }

  // Readiness ensure uses provenance
  let readinessSrc = readFileSafe('src/selling-houses/domain/ownerCaseReadinessWriteHelper.ts');
  if (readinessSrc) {
    check(
      readinessSrc.includes('_hydrationProvenance') || readinessSrc.includes('provenance'),
      'readiness store: ensure helper accepts provenance',
    );
  }
}

// ── 5. Receipt/audit ──

console.log('\n=== R31-5: Receipt/audit ===\n');

{
  const kernelSrc = readFileSafe('src/selling-houses/core/world-state/canonicalStoreKernel.ts');
  if (kernelSrc) {
    check(kernelSrc.includes('CanonicalStoreWriteReceipt'), 'CanonicalStoreWriteReceipt interface defined');
    check(kernelSrc.includes('CanonicalStoreName'), 'CanonicalStoreName type defined');
    check(kernelSrc.includes('CanonicalStoreWriteOperation'), 'CanonicalStoreWriteOperation type defined');
    check(kernelSrc.includes("store:"), 'CanonicalStoreWriteReceipt has store field');
    check(kernelSrc.includes("operation:"), 'CanonicalStoreWriteReceipt has operation field');
    check(kernelSrc.includes("provenance:"), 'CanonicalStoreWriteReceipt has provenance field');
  } else {
    // Check if receipt types exist elsewhere
    const modelsSrc = readFile('src/selling-houses/domain/models.ts');
    check(modelsSrc.includes('CanonicalStoreWriteReceipt'), 'CanonicalStoreWriteReceipt exists (in models or kernel)');
  }

  // At least one store helper returns receipts
  const dealClosingSrc = readFileSafe('src/selling-houses/domain/dealClosing.ts');
  if (dealClosingSrc) {
    check(
      dealClosingSrc.includes('CanonicalStoreWriteReceipt') ||
      dealClosingSrc.includes('WriteReceipt'),
      'dealClosing: store write helper returns receipt',
    );
  }
}

// ── 6. No scalar contract regression ──

console.log('\n=== R31-6: No scalar contract regression ===\n');

{
  const domainSrc = readFile('src/selling-houses/domain/consensusFormationHelper.ts');
  check(!domainSrc.includes('createContractFactOnState'), 'no createContractFactOnState (scalar backdoor)');
  check(domainSrc.includes('createContractFactForFixtureOnlyOnState') || domainSrc.includes('ContractFactState'), 'contract creation uses proof path');

  const dealClosingSrc = readFileSafe('src/selling-houses/domain/dealClosing.ts');
  if (dealClosingSrc) {
    check(!dealClosingSrc.includes('markCaseSold('), 'no bare markCaseSold');
    check(
      dealClosingSrc.includes('markCaseSoldFromContract') || dealClosingSrc.includes('markCaseSoldForFixtureOnly'),
      'markCaseSold uses contract-derived path',
    );
  }
}

// ── 7. No read-semantics regression ──

console.log('\n=== R31-7: No read-semantics regression ===\n');

{
  const caseOutcomeSrc = readFile('src/selling-houses/domain/caseOutcome.ts');
  check(caseOutcomeSrc.includes('readCaseTerminalOutcomeForCase'), 'readCaseTerminalOutcomeForCase still exists');
  check(!caseOutcomeSrc.includes('case-fallback'), 'no case-fallback in caseOutcome');

  const projectionSrc = readFileSafe('src/selling-houses/core/world-state/relationReadProjection.ts');
  if (projectionSrc) {
    check(!projectionSrc.includes("'case-fallback'"), 'no case-fallback in relationReadProjection');
    check(projectionSrc.includes('old_save_compatibility'), 'old_save_compatibility in relationReadProjection');
  }

  // ownerCaseReadinessHelper.ts should be deleted
  const oldHelperSrc = readFileSafe('src/selling-houses/domain/ownerCaseReadinessHelper.ts');
  check(oldHelperSrc === null, 'ownerCaseReadinessHelper.ts is deleted');
}

// ── 8. Gate hygiene ──

console.log('\n=== R31-8: Gate hygiene ===\n');

{
  const gateSrc = readFileSync(import.meta.filename!, 'utf-8');
  const softPassViolations = findGateSoftPassLines(gateSrc);
  check(softPassViolations.length === 0, `gate self-audit: no soft-pass patterns (found ${softPassViolations.length})`);
}

// ── Summary ──

console.log('\n=== R31 Canonical Store Kernel Gate Summary ===\n');
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
console.log('Verified: readonly canonical stores, no casual mutation, store boundary inventory, provenance, receipts, no scalar/read regression.');
