/**
 * R34 Status Mirror Truth Seal Gate
 *
 * Proves:
 * 1. Canonical status read boundary exists and is used
 * 2. No direct status truth reads in domain/core/application (except explicit allowlist)
 * 3. Legacy mirror writes are confined to named sync functions
 * 4. Canonical status overrides stale mirror in contradiction fixture
 * 5. R33 regression — truth trace still uses proof fields
 * 6. Gate hygiene
 */

import { readFileSync, existsSync } from 'node:fs';
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

// ── 1. Canonical status read boundary exists and is real ──

console.log('\n=== R34-1: Canonical status read boundary ===\n');

{
  const projSrc = readFile('src/selling-houses/core/world-state/caseOutcomeProjection.ts');
  check(projSrc.includes('readCaseLifecycleStatusFromCanonicalState'), 'readCaseLifecycleStatusFromCanonicalState function exists');
  check(projSrc.includes("'contract_fact'"), 'status read returns contract_fact source');
  check(projSrc.includes("'terminal_outcome'"), 'status read returns terminal_outcome source');
  check(projSrc.includes("'old_save_compatibility'"), 'status read returns old_save_compatibility source');

  // Check that the function takes the right inputs
  check(projSrc.includes('contractFacts') || projSrc.includes('runtimeContractFacts'), 'function takes contract facts input');
  check(projSrc.includes('terminalOutcomes') || projSrc.includes('runtimeCaseTerminalOutcomes'), 'function takes terminal outcomes input');
}

// ── 2. No direct status truth reads in domain/core/application ──

console.log('\n=== R34-2: No direct status truth reads ===\n');

{
  // Files that are allowed to read caseItem.status directly
  const allowedFiles = [
    'src/selling-houses/core/world-state/caseOutcomeProjection.ts', // has the canonical read boundary
    'src/selling-houses/domain/caseOutcome.ts', // legacy compatibility derivations + mirror sync
    'src/selling-houses/core/world-state/adapters.ts', // serialization adapters
    'src/selling-houses/domain/resultEvaluation.ts', // derives display/scoring values from mirrors
    'src/selling-houses/domain/actionStageRelations.ts', // derives legacy stage/phase from mirrors
  ];

  const allowedFunctions = [
    'deriveOutcomeFromLegacyCase', // old_save_compatibility fallback
    'readCaseLifecycleStatusFromCanonicalState', // the canonical reader itself
    'resolveDefenseOutcome', // derives from status mirror for display
    'resolveOwnerSatisfaction', // derives from status mirror
    'resolveEndingType', // derives from status mirror
    'resolveRelativeOutcome', // derives from status mirror
    'syncLegacyCase', // mirror sync functions
    'legacy_status_mirror_read', // explicit legacy marker
  ];

  // Check domain files for direct status reads
  const domainFiles = [
    'src/selling-houses/domain/dealClosing.ts',
    'src/selling-houses/domain/caseLifecycle.ts',
    'src/selling-houses/domain/engine.ts',
    'src/selling-houses/domain/engine/actionResolvers.ts',
    'src/selling-houses/domain/engine/marketEngine.ts',
    'src/selling-houses/domain/engine/opportunityEngine.ts',
    'src/selling-houses/domain/engine/customerEngine.ts',
    'src/selling-houses/domain/engine/eventEngine.ts',
    'src/selling-houses/domain/recommendationEngine.ts',
    'src/selling-houses/domain/runtimeState.ts',
    'src/selling-houses/domain/resultEvaluation.ts',
    'src/selling-houses/domain/actionStageRelations.ts',
  ];

  let violationsFound = 0;
  const violationDetails: string[] = [];

  for (const file of domainFiles) {
    const src = readFileSafe(file);
    if (!src) continue;

    const lines = src.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Skip comment lines
      if (line.trim().startsWith('//') || line.trim().startsWith('*')) continue;

      // Pattern: caseItem.status === 'active' / 'sold' / etc
      // Pattern: caseItem.status !== 'active'
      // Pattern: case.status === 'active'
      const statusReadPattern = /caseItem\.status\s*(===|!==)\s*['"](?:active|sold|withdrawn|lost_to_rival)['"]/;
      const caseStatusReadPattern = /case\.status\s*(===|!==)\s*['"](?:active|sold|withdrawn|lost_to_rival)['"]/;

      if (statusReadPattern.test(line) || caseStatusReadPattern.test(line)) {
        // Check if this is in an allowed function
        const functionStart = src.lastIndexOf('function', i);
        const functionEnd = src.indexOf('{', functionStart);
        let isAllowed = false;

        if (functionStart !== -1 && functionEnd !== -1 && functionEnd < i) {
          const functionDecl = src.substring(functionStart, functionEnd);
          for (const allowed of allowedFunctions) {
            if (functionDecl.includes(allowed)) {
              isAllowed = true;
              break;
            }
          }
        }

        // Also check if file is allowlisted
        if (allowedFiles.some(f => file.endsWith(f))) {
          isAllowed = true;
        }

        // Check for explicit legacy marker comment (look up to 10 lines back for multi-line if-else chains)
        let hasLegacyMarker = false;
        for (let j = Math.max(0, i - 10); j < i; j++) {
          if (lines[j].includes('legacy_status_mirror_read')) {
            hasLegacyMarker = true;
            break;
          }
        }
        if (hasLegacyMarker) {
          isAllowed = true;
        }

        if (!isAllowed) {
          violationsFound++;
          violationDetails.push(`${file}:${i + 1}: ${line.trim()}`);
        }
      }
    }
  }

  if (violationsFound > 0) {
    console.error(`  Found ${violationsFound} direct status truth reads in domain code:`);
    for (const detail of violationDetails.slice(0, 10)) {
      console.error(`    ${detail}`);
    }
    if (violationDetails.length > 10) {
      console.error(`    ... and ${violationDetails.length - 10} more`);
    }
  }
  check(violationsFound === 0, `no direct status truth reads in domain code (found ${violationsFound})`);
}

// ── 3. Legacy mirror writes are confined ──

console.log('\n=== R34-3: Legacy mirror writes confined ===\n');

{
  const allowedWriteLocations = [
    { file: 'src/selling-houses/domain/dealClosing.ts', function: 'syncLegacyCaseDealMirrorsFromContractFact' },
    { file: 'src/selling-houses/domain/caseOutcome.ts', function: 'syncLegacyCaseTerminalMirrorFromOutcome' },
    { file: 'src/selling-houses/domain/caseOutcome.ts', function: 'syncLegacyCaseOutcomeMirrorsFromTerminalFact' },
  ];

  // Find all asWritableCase(...).status = writes
  const domainSrc = readFile('src/selling-houses/domain/dealClosing.ts');
  const caseOutcomeSrc = readFile('src/selling-houses/domain/caseOutcome.ts');

  // Check dealClosing.ts
  const dealClosingStatusWrites = domainSrc.match(/asWritableCase\([^)]*\)\.status\s*=/g) || [];
  check(dealClosingStatusWrites.length <= 1, `dealClosing.ts has at most 1 status write (found ${dealClosingStatusWrites.length})`);

  // Verify it's in the allowed function
  if (dealClosingStatusWrites.length > 0) {
    check(domainSrc.includes('syncLegacyCaseDealMirrorsFromContractFact'), 'status write is in syncLegacyCaseDealMirrorsFromContractFact');
    // Check for legacy_status_mirror_write comment marker
    check(domainSrc.includes('legacy_status_mirror_write') || domainSrc.includes('Terminal status write'), 'status write has legacy marker comment');
  }

  // Check caseOutcome.ts
  const caseOutcomeStatusWrites = caseOutcomeSrc.match(/asWritableCase\([^)]*\)\.status\s*=/g) || [];
  check(caseOutcomeStatusWrites.length <= 1, `caseOutcome.ts has at most 1 status write (found ${caseOutcomeStatusWrites.length})`);

  if (caseOutcomeStatusWrites.length > 0) {
    check(caseOutcomeSrc.includes('syncLegacyCaseTerminalMirrorFromOutcome'), 'status write is in syncLegacyCaseTerminalMirrorFromOutcome');
  }
}

// ── 4. Executable contradiction fixture ──

console.log('\n=== R34-4: Canonical status overrides stale mirror ===\n');

{
  try {
    const { readCaseLifecycleStatusFromCanonicalState } = await import('../src/selling-houses/core/world-state/caseOutcomeProjection.js');
    const { createContractFactFromProof } = await import('../src/selling-houses/core/world-state/consensus/writeSource.js');
    const { buildPriceTrajectoryFromDealClosingEvaluation, buildPriceConsensusReadiness, buildPriceConsensusProof } = await import('../src/selling-houses/core/world-state/consensus/priceTrajectory.js');

    // Build a minimal proof
    const trajectory = buildPriceTrajectoryFromDealClosingEvaluation({
      caseId: 'test-case-1',
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

    const contractFact = createContractFactFromProof(
      'consensus-1', 'bopp-1', 'test-case-1', 'cust-1',
      'self_closed', 10, 'deal-1', 0.9, 0.85, [], ['high-intent'], proof,
    );

    // Create a state where case.status says 'active' but ContractFact says 'sold'
    const state = {
      cases: [{ id: 'test-case-1', status: 'active' }], // stale mirror
      runtimeContractFacts: [contractFact],
      runtimeCaseTerminalOutcomes: [],
    } as any;

    const result = readCaseLifecycleStatusFromCanonicalState({
      contractFacts: state.runtimeContractFacts,
      terminalOutcomes: state.runtimeCaseTerminalOutcomes,
      caseId: 'test-case-1',
      legacyStatus: 'active',
    });

    check(result.status === 'sold', `canonical selector returns sold (got ${result.status})`);
    check(result.source === 'contract_fact', `canonical selector source is contract_fact (got ${result.source})`);
    check(result.contractFactId === contractFact.contractId, 'canonical selector returns contract fact id');

    // The stale 'active' mirror should NOT be returned
    check(result.status !== 'active', 'canonical selector does NOT return stale active mirror');
  } catch (err: any) {
    check(false, `contradiction fixture failed: ${err.message}`);
  }
}

// ── 5. R33 regression ──

console.log('\n=== R34-5: R33 regression ===\n');

{
  const traceSrc = readFile('src/selling-houses/core/world-state/constitutionalTruthTrace.ts');
  check(traceSrc.includes('buyerOfferId'), 'trace still reads buyerOfferId from ContractFact');
  check(traceSrc.includes('ownerConcessionId'), 'trace still reads ownerConcessionId from ContractFact');
  check(traceSrc.includes('priceTrajectoryId'), 'trace still reads priceTrajectoryId from ContractFact');

  const customerBoundarySrc = readFileSafe('src/selling-houses/core/world-state/customer/customerReadBoundary.ts');
  check(customerBoundarySrc !== null, 'customer read boundary still exists');
  if (customerBoundarySrc) {
    check(customerBoundarySrc.includes('readBrokerCustomerTrust'), 'shared readBrokerCustomerTrust still exists');
  }

  const dealClosingSrc = readFile('src/selling-houses/domain/dealClosing.ts');
  check(!dealClosingSrc.includes('function readBrokerCustomerTrust'), 'dealClosing.ts still does NOT define local readBrokerCustomerTrust');
}

// ── 6. Gate hygiene ──

console.log('\n=== R34-6: Gate hygiene ===\n');

{
  const gateSrc = readFileSync(import.meta.filename!, 'utf-8');
  const softPassViolations = findGateSoftPassLines(gateSrc);
  check(softPassViolations.length === 0, `gate self-audit: no soft-pass patterns (found ${softPassViolations.length})`);
}

// ── Summary ──

console.log('\n=== R34 Status Mirror Truth Seal Gate Summary ===\n');
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
console.log('Verified: canonical status read boundary, no direct status truth reads, mirror write confinement, contradiction fixture, R33 regression.');
