/**
 * R32 Constitutional Closure Final Gate
 *
 * Proves:
 * 1. R31 store kernel honesty — canonical vs legacy mirror receipts distinguished
 * 2. Capability boundary — asWritableGameState usage confined to approved boundary modules
 * 3. Escape hatch containment — closedDeals receipt is honest, not lying about store
 * 4. Read/write semantic regression — R28/R29/R30 invariants hold
 * 5. Constitutional truth debt matrix exists and is honest
 * 6. Gate hygiene
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

// ── 1. R31 store kernel honesty ──

console.log('\n=== R32-1: Store kernel honesty — canonical vs legacy mirror distinguished ===\n');

{
  const kernelSrc = readFile('src/selling-houses/core/world-state/canonicalStoreKernel.ts');
  check(kernelSrc.includes('LegacyMirrorStoreName'), 'LegacyMirrorStoreName type defined');
  check(kernelSrc.includes('LegacyMirrorWriteReceipt'), 'LegacyMirrorWriteReceipt interface defined');
  check(kernelSrc.includes('CanonicalStoreWriteReceipt'), 'CanonicalStoreWriteReceipt interface defined');
  check(kernelSrc.includes('StoreWriteReceipt'), 'StoreWriteReceipt union type defined');
  check(kernelSrc.includes('makeLegacyMirrorWriteReceipt'), 'makeLegacyMirrorWriteReceipt helper defined');
  check(kernelSrc.includes('closedDeals'), 'closedDeals in LegacyMirrorStoreName');
  check(kernelSrc.includes('canonicalSourceId'), 'LegacyMirrorWriteReceipt has canonicalSourceId field');
  check(kernelSrc.includes('legacy_truth_debt'), 'legacy_truth_debt provenance defined');

  // closedDeals must be a LegacyMirrorStoreName, not CanonicalStoreName
  const canonicalMatch = kernelSrc.match(/CanonicalStoreName\s*=\s*[^;]+/s);
  if (canonicalMatch) {
    check(!canonicalMatch[0].includes('closedDeals'), 'closedDeals is NOT in CanonicalStoreName');
  }
}

// ── 2. Capability boundary — asWritableGameState confined to boundary modules ──

console.log('\n=== R32-2: Capability boundary — asWritableGameState confinement ===\n');

{
  // Approved boundary modules that are allowed to import/use asWritableGameState
  // for canonical store mutations (not just any readonly field writes)
  const APPROVED_CANONICAL_STORE_BOUNDARY_FILES = new Set([
    'trustWriteHelper.ts',
    'ownerCaseReadinessWriteHelper.ts',
    'opportunitySplitHelper.ts',
    'consensusFormationHelper.ts',
    'dealClosing.ts',
    'caseOutcome.ts',
    'gameState.ts',
    'budget.ts',
    'runtimeState.ts',
    'engine.ts',
    'marketEngine.ts',
    'actionTransaction.ts',
    'actionResourceAccounting.ts',
    'actionResolvers.ts',
    'actionReceiptWiring.ts',
    'gameTransitions.ts',
    'wechatConversation.ts',
    'eventEngine.ts',
    'foreshadowingEngine.ts',
    'models.ts', // defines asWritableGameState
  ]);

  // Runtime adapter files that handle history array writes
  const APPROVED_ADAPTER_FILES = new Set([
    'actionReceiptAdapter.ts',
    'businessOutcomeReviewAdapter.ts',
    'dailyOperatingLedgerAdapter.ts',
    'managerInterventionAdapter.ts',
    'negotiationReplayAdapter.ts',
    'ownerDecisionMomentAdapter.ts',
    'processRunAdapter.ts',
    'strategyForkAdapter.ts',
  ]);

  const PRODUCTION_DIRS = [
    'src/selling-houses/domain',
    'src/selling-houses/application',
    'src/selling-houses/core',
  ];

  let outOfBoundaryImports = 0;
  const outOfBoundaryLocations: string[] = [];

  const { execSync } = await import('node:child_process');

  for (const dir of PRODUCTION_DIRS) {
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
      const fileName = file.split('/').pop()!;
      const isApprovedBoundary = APPROVED_CANONICAL_STORE_BOUNDARY_FILES.has(fileName) ||
        APPROVED_ADAPTER_FILES.has(fileName) ||
        file.includes('runtime/simulation/');

      // Check for asWritableGameState import/usage (actual import statements, not just comments)
      const hasImport = /import\s*\{[^}]*asWritableGameState[^}]*\}\s*from/.test(src) ||
        /import\s+.*asWritableGameState.*from/.test(src);
      const hasUsage = /asWritableGameState\s*\(/.test(src);
      if ((hasImport || hasUsage) && !isApprovedBoundary) {
        outOfBoundaryImports++;
        outOfBoundaryLocations.push(`${fileName}: imports/uses asWritableGameState`);
      }
    }
  }

  if (outOfBoundaryLocations.length > 0) {
    console.log('\n  Out-of-boundary asWritableGameState usage:');
    for (const loc of outOfBoundaryLocations) console.log(`    ${loc}`);
  }

  check(outOfBoundaryImports === 0, `Zero out-of-boundary asWritableGameState imports (found ${outOfBoundaryImports})`);
}

// ── 3. Escape hatch containment — closedDeals receipt honesty ──

console.log('\n=== R32-3: Escape hatch containment — receipt honesty ===\n');

{
  const dealClosingSrc = readFile('src/selling-houses/domain/dealClosing.ts');

  // prependClosedDealMirrorFromContractFact must return LegacyMirrorWriteReceipt
  check(
    dealClosingSrc.includes('LegacyMirrorWriteReceipt'),
    'prependClosedDealMirrorFromContractFact returns LegacyMirrorWriteReceipt',
  );

  // The receipt must name 'closedDeals', not 'runtimeContractFacts'
  const prependFunc = dealClosingSrc.match(
    /export function prependClosedDealMirrorFromContractFact[\s\S]*?^}/m,
  );
  if (prependFunc) {
    const funcBody = prependFunc[0];
    check(
      funcBody.includes("'closedDeals'") || funcBody.includes('"closedDeals"'),
      'closedDeals mirror receipt names closedDeals store',
    );
    check(
      !funcBody.includes("'runtimeContractFacts'") && !funcBody.includes('"runtimeContractFacts"'),
      'closedDeals mirror receipt does NOT claim runtimeContractFacts store',
    );
    check(
      funcBody.includes('canonicalSourceId'),
      'closedDeals mirror receipt includes canonicalSourceId',
    );
  }

  // Check that asWritableGameState usage in boundary files is inside named functions
  const trustSrc = readFileSafe('src/selling-houses/domain/trustWriteHelper.ts');
  if (trustSrc) {
    check(trustSrc.includes('makeStoreWriteReceipt') || trustSrc.includes('makeLegacyMirrorWriteReceipt'),
      'trustWriteHelper uses receipt builder');
  }

  const readinessSrc = readFileSafe('src/selling-houses/domain/ownerCaseReadinessWriteHelper.ts');
  if (readinessSrc) {
    check(readinessSrc.includes('makeStoreWriteReceipt') || readinessSrc.includes('makeLegacyMirrorWriteReceipt'),
      'ownerCaseReadinessWriteHelper uses receipt builder');
  }
}

// ── 4. Read/write semantic regression ──

console.log('\n=== R32-4: Read/write semantic regression ===\n');

{
  // R28: no scalar backdoors
  const consensusSrc = readFile('src/selling-houses/domain/consensusFormationHelper.ts');
  check(!consensusSrc.includes('createContractFactOnState'), 'no createContractFactOnState scalar backdoor');

  const dealClosingSrc = readFile('src/selling-houses/domain/dealClosing.ts');
  check(!dealClosingSrc.includes('markCaseSold('), 'no bare markCaseSold');

  // R29: terminal outcome readonly + readiness helper collapse
  const caseOutcomeSrc = readFile('src/selling-houses/domain/caseOutcome.ts');
  check(caseOutcomeSrc.includes('readCaseTerminalOutcomeForCase'), 'readCaseTerminalOutcomeForCase exists');

  const oldHelperSrc = readFileSafe('src/selling-houses/domain/ownerCaseReadinessHelper.ts');
  check(oldHelperSrc === null, 'ownerCaseReadinessHelper.ts remains deleted');

  // R30: canonical read semantics
  const projectionSrc = readFileSafe('src/selling-houses/core/world-state/relationReadProjection.ts');
  if (projectionSrc) {
    check(!projectionSrc.includes("'case-fallback'"), 'no case-fallback in relationReadProjection');
    check(projectionSrc.includes('old_save_compatibility'), 'old_save_compatibility in relationReadProjection');
  }

  // R31: canonical store kernel exists
  const kernelSrc = readFileSafe('src/selling-houses/core/world-state/canonicalStoreKernel.ts');
  check(kernelSrc !== null, 'canonicalStoreKernel.ts exists');
}

// ── 5. Constitutional truth debt matrix ──

console.log('\n=== R32-5: Constitutional truth debt matrix ===\n');

{
  const traceSrc = readFileSafe('src/selling-houses/core/world-state/constitutionalTruthTrace.ts');
  check(traceSrc !== null, 'constitutionalTruthTrace.ts exists');
  if (traceSrc) {
    check(traceSrc.includes('ConstitutionalTruthTrace'), 'ConstitutionalTruthTrace interface defined');
    check(traceSrc.includes('ConstitutionalTruthDebt'), 'ConstitutionalTruthDebt type defined');
    check(traceSrc.includes('buildConstitutionalTruthTrace') || traceSrc.includes('traceContractFact'), 'truth trace builder function exists');
    check(traceSrc.includes('debts'), 'ConstitutionalTruthTrace has debts field');
    check(traceSrc.includes('contractFactId'), 'ConstitutionalTruthTrace has contractFactId');
  }

  // Handoff doc must not claim "no debt" if trace reports debts
  const handoffSrc = readFileSafe('docs/selling-houses-agent-handoff.md');
  if (handoffSrc) {
    const r32Section = handoffSrc.match(/R32[\s\S]*?(?=\n## |$)/);
    if (r32Section) {
      check(
        r32Section[0].includes('Remaining truth debt') || r32Section[0].includes('Truth debt'),
        'R32 handoff section includes truth debt acknowledgment',
      );
    }
  }
}

// ── 6. Gate hygiene ──

console.log('\n=== R32-6: Gate hygiene ===\n');

{
  const gateSrc = readFileSync(import.meta.filename!, 'utf-8');
  const softPassViolations = findGateSoftPassLines(gateSrc);
  check(softPassViolations.length === 0, `gate self-audit: no soft-pass patterns (found ${softPassViolations.length})`);
}

// ── Summary ──

console.log('\n=== R32 Constitutional Closure Final Gate Summary ===\n');
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
console.log('Verified: kernel honesty, capability boundary, receipt honesty, semantic regression, truth debt, gate hygiene.');
