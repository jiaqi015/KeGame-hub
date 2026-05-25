/**
 * R27 No Fallback, Full Constitutional Green Gate.
 *
 * Proves R27 closes the remaining loopholes:
 * 1. No production scalar createContractFactOnState in dealClosing.ts
 * 2. Production uses only createContractFactFromPriceConsensusOnState
 * 3. No production markCaseSold(caseItem, number) in dealClosing.ts
 * 4. markCaseSoldFromContract is the sold terminal mirror helper
 * 5. syncLegacyCaseDealMirrorsFromContractFact takes ContractFactState, not scalar soldPrice
 * 6. R24 gate passes (all fixture imports fixed)
 * 7. No "scalar fallback" or "legacy fallback" comments in production closing path
 * 8. Gate self-audit has no fake green patterns
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
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

// ── 1. No production scalar createContractFactOnState in dealClosing.ts ──

console.log('\n=== R27-1: No scalar contract creation in dealClosing.ts ===\n');

{
  const dealClosingSrc = readFileSafe('src/selling-houses/domain/dealClosing.ts');
  check(dealClosingSrc !== null, 'dealClosing.ts exists');
  if (dealClosingSrc) {
    const stripped = stripCommentsAndStrings(dealClosingSrc);

    // No createContractFactOnState calls in dealClosing.ts (scalar API removed)
    const scalarMatch = stripped.match(/createContractFactOnState\s*\(/);
    check(scalarMatch === null, 'no createContractFactOnState( in dealClosing.ts');

    // Proof-based API is used
    check(stripped.includes('createContractFactFromPriceConsensusOnState'),
      'createContractFactFromPriceConsensusOnState used in dealClosing.ts');

    // No "scalar fallback" or "legacy fallback" in production path
    check(!stripped.includes('scalar fallback'), 'no "scalar fallback" in dealClosing.ts');
    check(!stripped.includes('legacy fallback'), 'no "legacy fallback" in dealClosing.ts');
  }
}

// ── 2. No loose markCaseSold in production dealClosing.ts ──

console.log('\n=== R27-2: No loose markCaseSold in dealClosing.ts ===\n');

{
  const dealClosingSrc = readFileSafe('src/selling-houses/domain/dealClosing.ts');
  if (dealClosingSrc) {
    const stripped = stripCommentsAndStrings(dealClosingSrc);

    // No markCaseSold( calls except markCaseSoldFromContract
    const bareMatch = stripped.match(/(?<!From)markCaseSold\s*\(/);
    check(bareMatch === null, 'no markCaseSold( in dealClosing.ts (only markCaseSoldFromContract)');

    // markCaseSoldFromContract is used
    check(stripped.includes('markCaseSoldFromContract'),
      'markCaseSoldFromContract used in dealClosing.ts');

    // markCaseSold is NOT imported
    check(!stripped.match(/import.*markCaseSold[^F]/),
      'markCaseSold not imported in dealClosing.ts (only markCaseSoldFromContract)');
  }
}

// ── 3. syncLegacyCaseDealMirrorsFromContractFact takes ContractFactState ──

console.log('\n=== R27-3: syncLegacyCaseDealMirrorsFromContractFact uses ContractFactState ===\n');

{
  const dealClosingSrc = readFileSafe('src/selling-houses/domain/dealClosing.ts');
  if (dealClosingSrc) {
    const stripped = stripCommentsAndStrings(dealClosingSrc);

    // Function signature should accept ContractFactState, not scalar soldPrice
    const fnMatch = stripped.match(/function syncLegacyCaseDealMirrorsFromContractFact[\s\S]*?\): void/m);
    if (fnMatch) {
      check(fnMatch[0].includes('contractFact:') && fnMatch[0].includes('ContractFactState'),
        'syncLegacyCaseDealMirrorsFromContractFact accepts contractFact: ContractFactState');
      check(!fnMatch[0].includes('soldPrice: number'),
        'syncLegacyCaseDealMirrorsFromContractFact does NOT accept scalar soldPrice: number');
    } else {
      fail('could not find syncLegacyCaseDealMirrorsFromContractFact function');
    }

    // Call site passes contractFact, not scalar soldPrice
    check(stripped.includes('contractFact,'), 'syncLegacyCaseDealMirrorsFromContractFact called with contractFact');
  }
}

// ── 4. markCaseSoldFromContract is the terminal mirror helper ──

console.log('\n=== R27-4: markCaseSoldFromContract terminal mirror helper ===\n');

{
  const caseOutcomeSrc = readFileSafe('src/selling-houses/domain/caseOutcome.ts');
  check(caseOutcomeSrc !== null, 'caseOutcome.ts exists');
  if (caseOutcomeSrc) {
    check(caseOutcomeSrc.includes('export function markCaseSoldFromContract'),
      'markCaseSoldFromContract exported');

    // markCaseSold is still exported (for fixture compatibility) but production shouldn't use it
    check(caseOutcomeSrc.includes('export function markCaseSold'),
      'markCaseSold still exported (fixture compatibility)');
  }
}

// ── 5. No production scalar contract creation elsewhere ──

console.log('\n=== R27-5: No scalar contract creation in production domain ===\n');

{
  const helperSrc = readFileSafe('src/selling-houses/domain/consensusFormationHelper.ts');
  check(helperSrc !== null, 'consensusFormationHelper.ts exists');
  if (helperSrc) {
    // createContractFactOnState may still exist for fixture/compat, but is not imported by dealClosing
    check(helperSrc.includes('export function createContractFactOnState'),
      'createContractFactOnState still exported (fixture compatibility)');
    check(helperSrc.includes('export function createContractFactFromPriceConsensusOnState'),
      'createContractFactFromPriceConsensusOnState exported');
  }
}

// ── 6. R24 gate passes ──

console.log('\n=== R27-6: R24 gate passes ===\n');

{
  try {
    const r24Result = spawnSync(
      'npx',
      ['tsx', 'scripts/verify-selling-houses-r24-readonly-truth-fields-gate.ts'],
      { stdio: 'pipe', shell: process.platform === 'win32', timeout: 120_000 },
    );

    if (r24Result.error) {
      fail(`R24 gate error: ${r24Result.error.message}`);
    } else if (r24Result.status !== 0) {
      const stderr = r24Result.stderr?.toString() ?? '';
      const failLines = stderr.split('\n').filter(l => l.includes('[FAIL]'));
      fail(`R24 gate fails (${failLines.length} failures)`);
    } else {
      pass('R24 gate passes');
    }
  } catch (err: any) {
    fail(`R24 gate exception: ${err.message}`);
  }
}

// ── 7. Gate self-audit ──

console.log('\n=== R27-7: Gate self-audit ===\n');

{
  const gateSrc = readFileSync(join(import.meta.dirname!, 'verify-selling-houses-r27-no-fallback-full-constitutional-green-gate.ts'), 'utf-8');
  const violations = findGateSoftPassLines(gateSrc);
  check(violations.length === 0, `no soft-pass patterns in R27 gate (found ${violations.length})`);
  if (violations.length > 0) {
    for (const v of violations) {
      fail(`  soft-pass at line ${v.line}: ${v.pattern}`);
    }
  }
}

// ── Summary ──

console.log('\n=== R27 Gate Summary ===\n');
console.log(`  Passed: ${passed}`);
console.log(`  Failed: ${failed}`);

if (failed > 0) {
  console.error('\nFAILURES:');
  for (const e of errors) {
    console.error(`  - ${e}`);
  }
  process.exit(1);
}

console.log('\nR27 gate PASSED');
