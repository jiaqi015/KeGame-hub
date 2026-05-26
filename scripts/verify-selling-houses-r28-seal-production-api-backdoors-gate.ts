/**
 * R28 Seal Production API Backdoors Gate.
 *
 * Proves that production-looking scalar/loose contract creation and sold marking
 * APIs are sealed. Only proof-based APIs may be used in production.
 * Fixture-only escape hatches must be unmistakably named and gated.
 *
 * 1. consensusFormationHelper does not export production-looking createContractFactOnState
 * 2. writeSource does not export production-looking scalar createContractFactState
 * 3. caseOutcome does not export production-looking loose markCaseSold
 * 4. No production src/selling-houses/** imports or calls fixture-only helpers
 * 5. No production file calls scalar/loose API names
 * 6. Fixture-only helpers live under /testing/ with FixtureOnly/TestOnly naming
 * 7. Proof-based APIs are present and used
 * 8. R27 gate no longer permissive about fixture compatibility scalar exports
 * 9. Gate self-audit has no fake green patterns
 * 10. Prior gates (R27, R26, R25, R24, contract-terminal-fact) pass
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { spawnSync } from 'node:child_process';
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

function readFileSafe(path: string): string | null {
  try {
    return readFileSync(join(import.meta.dirname!, '..', path), 'utf-8');
  } catch {
    return null;
  }
}

function stripCommentsAndStrings(src: string): string {
  let result = src.replace(/\/\*[\s\S]*?\*\//g, '');
  result = result.replace(/\/\/.*$/gm, '');
  result = result.replace(/'[^']*'/g, "''");
  result = result.replace(/"[^"]*"/g, '""');
  return result;
}

/** Recursively collect all .ts files under a directory, excluding /testing/ */
function collectTsFiles(dir: string, baseDir: string, excludeTesting = true): string[] {
  const results: string[] = [];
  try {
    const entries = readdirSync(join(baseDir, dir));
    for (const entry of entries) {
      const fullPath = join(dir, entry);
      const absPath = join(baseDir, fullPath);
      const stat = statSync(absPath);
      if (stat.isDirectory()) {
        if (excludeTesting && entry === 'testing') continue;
        if (entry === 'node_modules' || entry === '.git') continue;
        results.push(...collectTsFiles(fullPath, baseDir, excludeTesting));
      } else if (entry.endsWith('.ts')) {
        results.push(fullPath);
      }
    }
  } catch {
    // directory may not exist
  }
  return results;
}

const projectRoot = join(import.meta.dirname!, '..');

// ── 1. consensusFormationHelper does not export production-looking createContractFactOnState ──

console.log('\n=== R28-1: No production-looking createContractFactOnState export ===\n');

{
  const helperSrc = readFileSafe('src/selling-houses/domain/consensusFormationHelper.ts');
  check(helperSrc !== null, 'consensusFormationHelper.ts exists');
  if (helperSrc) {
    const stripped = stripCommentsAndStrings(helperSrc);

    // Must NOT contain: export function createContractFactOnState
    const scalarExportMatch = stripped.match(/export\s+function\s+createContractFactOnState\s*\(/);
    check(scalarExportMatch === null,
      'no export function createContractFactOnState( in consensusFormationHelper');

    // If a fixture-only helper exists, it must contain FixtureOnly or TestOnly
    const anyCreateOnState = stripped.match(/export\s+function\s+(createContractFact\w*OnState)\s*\(/);
    if (anyCreateOnState && !anyCreateOnState[1].includes('FixtureOnly') && !anyCreateOnState[1].includes('TestOnly')) {
      const fnName = anyCreateOnState[1];
      check(fnName === 'createContractFactFromPriceConsensusOnState',
        `non-fixture export ${fnName} is the proof-based API only`);
    }

    // Proof-based API must be present
    check(stripped.includes('createContractFactFromPriceConsensusOnState'),
      'createContractFactFromPriceConsensusOnState exported');
  }
}

// ── 2. writeSource does not export production-looking scalar createContractFactState ──

console.log('\n=== R28-2: No production-looking createContractFactState export ===\n');

{
  const writeSrc = readFileSafe('src/selling-houses/core/world-state/consensus/writeSource.ts');
  check(writeSrc !== null, 'writeSource.ts exists');
  if (writeSrc) {
    const stripped = stripCommentsAndStrings(writeSrc);

    // Must NOT contain: export function createContractFactState
    const scalarExportMatch = stripped.match(/export\s+function\s+createContractFactState\s*\(/);
    check(scalarExportMatch === null,
      'no export function createContractFactState( in writeSource');

    // If a fixture-only helper exists, it must contain FixtureOnly or TestOnly
    const anyCreateState = stripped.match(/export\s+function\s+(createContractFact\w*State)\s*\(/);
    if (anyCreateState && !anyCreateState[1].includes('FixtureOnly') && !anyCreateState[1].includes('TestOnly')) {
      const fnName = anyCreateState[1];
      check(fnName === 'createContractFactFromProof',
        `non-fixture export ${fnName} is the proof-based API only`);
    }

    // Proof-based API must be present
    check(stripped.includes('createContractFactFromProof'),
      'createContractFactFromProof exported');
  }
}

// ── 3. caseOutcome does not export production-looking loose markCaseSold ──

console.log('\n=== R28-3: No production-looking loose markCaseSold export ===\n');

{
  const caseOutcomeSrc = readFileSafe('src/selling-houses/domain/caseOutcome.ts');
  check(caseOutcomeSrc !== null, 'caseOutcome.ts exists');
  if (caseOutcomeSrc) {
    const stripped = stripCommentsAndStrings(caseOutcomeSrc);

    // Must NOT contain: export function markCaseSold(
    const bareExportMatch = stripped.match(/export\s+function\s+markCaseSold\s*\(/);
    check(bareExportMatch === null,
      'no export function markCaseSold( in caseOutcome');

    // If a fixture-only helper exists, it must contain FixtureOnly or TestOnly
    const anyMarkSold = stripped.match(/export\s+function\s+(markCaseSold\w*)\s*\(/);
    if (anyMarkSold) {
      const fnName = anyMarkSold[1];
      const isProofBased = fnName === 'markCaseSoldFromContract';
      const isFixtureOnly = fnName.includes('FixtureOnly') || fnName.includes('TestOnly');
      check(isProofBased || isFixtureOnly,
        `markCaseSold* export "${fnName}" is either proof-based or fixture-only`);
    }

    // Proof-based API must be present
    check(stripped.includes('markCaseSoldFromContract'),
      'markCaseSoldFromContract exported');
  }
}

// ── 4. No production src/selling-houses/** imports fixture-only helpers ──

console.log('\n=== R28-4: No production file imports fixture-only helpers ===\n');

{
  const productionFiles = collectTsFiles('src/selling-houses', projectRoot, true);
  let violations = 0;

  for (const file of productionFiles) {
    const src = readFileSafe(file);
    if (!src) continue;
    const stripped = stripCommentsAndStrings(src);

    // Check for imports of FixtureOnly/TestOnly helpers
    if (stripped.match(/import.*FixtureOnly/) || stripped.match(/import.*TestOnly/)) {
      fail(`production import of FixtureOnly/TestOnly in ${file}`);
      violations++;
    }

    // Check for imports from testing/ directory
    if (stripped.match(/from.*['"]\..*\/testing\//) || stripped.match(/from.*['"]\.\.\/testing\//)) {
      fail(`production import from /testing/ in ${file}`);
      violations++;
    }
  }

  check(violations === 0,
    `no production file imports fixture-only helpers (found ${violations} violations)`);
}

// ── 5. No production file calls scalar/loose API names ──

console.log('\n=== R28-5: No production file calls scalar/loose names ===\n');

{
  const productionFiles = collectTsFiles('src/selling-houses', projectRoot, true);
  let scalarViolations = 0;

  for (const file of productionFiles) {
    const src = readFileSafe(file);
    if (!src) continue;
    const stripped = stripCommentsAndStrings(src);

    // Check for bare createContractFactOnState( (not FromPriceConsensusOnState)
    const bareOnStateCalls = stripped.match(/createContractFactOnState\s*\(/g);
    const proofOnStateCalls = stripped.match(/createContractFactFromPriceConsensusOnState\s*\(/g);
    if (bareOnStateCalls && bareOnStateCalls.length > (proofOnStateCalls?.length ?? 0)) {
      fail(`${file}: bare createContractFactOnState( calls beyond proof variant`);
      scalarViolations++;
    }

    // Check for bare createContractFactState( (not aliased import)
    const stateCalls = stripped.match(/createContractFactState\s*\(/g);
    const aliasedImports = stripped.match(/createContractFactForFixtureOnlyState\s+as\s+\w+/g);
    const stateExports = stripped.match(/export\s+function\s+createContractFactForFixtureOnlyState\s*\(/g);
    if (stateCalls) {
      const expectedCount = (aliasedImports?.length ?? 0) + (stateExports?.length ?? 0);
      if (stateCalls.length > expectedCount) {
        fail(`${file}: createContractFactState( calls without alias`);
        scalarViolations++;
      }
    }

    // Check for bare markCaseSold( (not FromContract or ForFixtureOnly)
    const bareSoldCalls = stripped.match(/markCaseSold\s*\(/g);
    const fromContractCalls = stripped.match(/markCaseSoldFromContract\s*\(/g);
    const fixtureSoldCalls = stripped.match(/markCaseSoldForFixtureOnly\s*\(/g);
    if (bareSoldCalls) {
      const allowedCount = (fromContractCalls?.length ?? 0) + (fixtureSoldCalls?.length ?? 0);
      if (bareSoldCalls.length > allowedCount) {
        fail(`${file}: bare markCaseSold( calls beyond FromContract/ForFixtureOnly`);
        scalarViolations++;
      }
    }
  }

  check(scalarViolations === 0,
    `no production file calls scalar/loose names (found ${scalarViolations} violations)`);
}

// ── 6. Fixture-only helpers live under /testing/ with proper naming ──

console.log('\n=== R28-6: Fixture-only helpers properly located and named ===\n');

{
  const testingDir = readFileSafe('src/selling-houses/testing/contractFactFixtures.ts')
    ? 'src/selling-houses/testing/contractFactFixtures.ts'
    : null;

  if (testingDir) {
    const fixtureSrc = readFileSafe(testingDir);
    check(fixtureSrc !== null, `fixture-only file exists: ${testingDir}`);
    if (fixtureSrc) {
      // Must contain forbidden-in-production header
      check(
        fixtureSrc.includes('FORBIDDEN') || fixtureSrc.includes('forbidden') || fixtureSrc.includes('fixture-only') || fixtureSrc.includes('FixtureOnly'),
        'fixture file contains forbidden-in-production header/label',
      );

      // Export names must contain FixtureOnly or TestOnly
      const exports = fixtureSrc.match(/export\s*\{[^}]*\}/g) || [];
      for (const exp of exports) {
        const names = exp.match(/\b\w*FixtureOnly\w*\b|\b\w*TestOnly\w*\b/g) || [];
        check(names.length > 0,
          `fixture re-export contains FixtureOnly/TestOnly name: ${names.join(', ') || '(none found in: ' + exp.slice(0, 60) + ')'}`);
      }
    }
  }

  // Gate: no production src/selling-houses/** outside /testing/ imports from /testing/
  const productionFiles = collectTsFiles('src/selling-houses', projectRoot, true);
  let testingImportViolations = 0;
  for (const file of productionFiles) {
    const src = readFileSafe(file);
    if (!src) continue;
    const stripped = stripCommentsAndStrings(src);
    if (stripped.match(/from.*selling-houses\/testing\//)) {
      fail(`production file ${file} imports from /testing/`);
      testingImportViolations++;
    }
  }
  check(testingImportViolations === 0,
    `no production file outside /testing/ imports from /testing/ (found ${testingImportViolations})`);
}

// ── 7. Proof-based APIs are present and used ──

console.log('\n=== R28-7: Proof-based APIs present and used ===\n');

{
  const helperSrc = readFileSafe('src/selling-houses/domain/consensusFormationHelper.ts');
  check(helperSrc !== null, 'consensusFormationHelper.ts exists');
  if (helperSrc) {
    check(helperSrc.includes('createContractFactFromPriceConsensusOnState'),
      'createContractFactFromPriceConsensusOnState exported');
  }

  const writeSrc = readFileSafe('src/selling-houses/core/world-state/consensus/writeSource.ts');
  check(writeSrc !== null, 'writeSource.ts exists');
  if (writeSrc) {
    check(writeSrc.includes('createContractFactFromProof'),
      'createContractFactFromProof exported');
  }

  const caseOutcomeSrc = readFileSafe('src/selling-houses/domain/caseOutcome.ts');
  check(caseOutcomeSrc !== null, 'caseOutcome.ts exists');
  if (caseOutcomeSrc) {
    check(caseOutcomeSrc.includes('markCaseSoldFromContract'),
      'markCaseSoldFromContract exported');
  }

  // dealClosing.ts must use proof-based APIs
  const dealClosingSrc = readFileSafe('src/selling-houses/domain/dealClosing.ts');
  check(dealClosingSrc !== null, 'dealClosing.ts exists');
  if (dealClosingSrc) {
    const stripped = stripCommentsAndStrings(dealClosingSrc);
    check(stripped.includes('createContractFactFromPriceConsensusOnState'),
      'dealClosing.ts uses createContractFactFromPriceConsensusOnState');
    check(stripped.includes('markCaseSoldFromContract'),
      'dealClosing.ts uses markCaseSoldFromContract');
  }
}

// ── 8. R27 gate no longer permissive about fixture compatibility ──

console.log('\n=== R28-8: R27 gate not permissive about fixture compatibility ===\n');

{
  const r27Src = readFileSafe('scripts/verify-selling-houses-r27-no-fallback-full-constitutional-green-gate.ts');
  check(r27Src !== null, 'R27 gate exists');
  if (r27Src) {
    const stripped = stripCommentsAndStrings(r27Src);

    // Must NOT contain pass assertions for fixture compatibility scalar exports
    const hasCreateContractFactOnStatePass = stripped.includes('createContractFactOnState still exported (fixture compatibility)');
    check(!hasCreateContractFactOnStatePass,
      'R27 gate no longer asserts createContractFactOnState still exported (fixture compatibility)');

    const hasMarkCaseSoldPass = stripped.includes('markCaseSold still exported (fixture compatibility)');
    check(!hasMarkCaseSoldPass,
      'R27 gate no longer asserts markCaseSold still exported (fixture compatibility)');
  }
}

// ── 9. Gate self-audit ──

console.log('\n=== R28-9: Gate self-audit ===\n');

{
  const gateSrc = readFileSync(join(import.meta.dirname!, 'verify-selling-houses-r28-seal-production-api-backdoors-gate.ts'), 'utf-8');
  const violations = findGateSoftPassLines(gateSrc);
  check(violations.length === 0, `no soft-pass patterns in R28 gate (found ${violations.length})`);
  if (violations.length > 0) {
    for (const v of violations) {
      fail(`  soft-pass at line ${v.line}: ${v.pattern}`);
    }
  }
}

// ── 10. Prior gates pass ──

console.log('\n=== R28-10: Prior gates pass ===\n');

{
  const priorGates = [
    { name: 'R27', script: 'scripts/verify-selling-houses-r27-no-fallback-full-constitutional-green-gate.ts' },
    { name: 'R26', script: 'scripts/verify-selling-houses-r26-consensus-trajectory-final-gate.ts' },
    { name: 'R25', script: 'scripts/verify-selling-houses-r25-terminal-fact-readonly-sold-price-gate.ts' },
    { name: 'R24', script: 'scripts/verify-selling-houses-r24-readonly-truth-fields-gate.ts' },
    { name: 'Contract-terminal-fact', script: 'scripts/verify-selling-houses-contract-terminal-fact-gate.ts' },
  ];

  for (const gate of priorGates) {
    try {
      const result = spawnSync(
        'npx',
        ['tsx', gate.script],
        { stdio: 'pipe', shell: process.platform === 'win32', timeout: 600_000 },
      );

      if (result.error) {
        fail(`${gate.name} gate error: ${result.error.message}`);
      } else if (result.status !== 0) {
        const stderr = result.stderr?.toString() ?? '';
        const failLines = stderr.split('\n').filter(l => l.includes('[FAIL]')).slice(0, 3);
        fail(`${gate.name} gate fails (${failLines.length} failures): ${failLines.join('; ')}`);
      } else {
        pass(`${gate.name} gate passes`);
      }
    } catch (err: any) {
      fail(`${gate.name} gate exception: ${err.message}`);
    }
  }
}

// ── Summary ──

console.log('\n=== R28 Gate Summary ===\n');
console.log(`  Passed: ${passed}`);
console.log(`  Failed: ${failed}`);

if (failed > 0) {
  console.error('\nFAILURES:');
  for (const e of errors) {
    console.error(`  - ${e}`);
  }
  process.exit(1);
}

console.log('\nR28 gate PASSED');
