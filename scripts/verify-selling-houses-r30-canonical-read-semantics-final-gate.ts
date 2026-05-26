/**
 * R30 Canonical Read Semantics Final Gate.
 *
 * Proves:
 * 1. Domain truth-decision files do not read terminal mirror fields directly
 * 2. Terminal outcome resolvers derive from canonical state
 * 3. Deal closing reads relation/read-boundary APIs, not local case fallback
 * 4. Old-save fallback is explicit and quarantined (old_save_compatibility, not case-fallback)
 * 5. Trust/readiness hydration has explicit old-save provenance
 * 6. ownerCaseReadinessHelper.ts is gone or quarantine-proven
 * 7. Gate self-audit: no fake-green patterns
 * 8. Prior critical gates pass
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
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

function collectFiles(dir: string, base: string): string[] {
  const results: string[] = [];
  try {
    for (const entry of readdirSync(join(base, dir))) {
      const full = join(dir, entry);
      const abs = join(base, full);
      const stat = statSync(abs);
      if (stat.isDirectory() && entry !== 'node_modules' && entry !== '.git' && entry !== 'testing') {
        results.push(...collectFiles(full, base));
      } else if (entry.endsWith('.ts')) {
        results.push(full);
      }
    }
  } catch { /* skip */ }
  return results;
}

// ── 1. Domain truth-decision files do not read terminal mirror fields directly ──

console.log('\n=== R30-1: No direct terminal mirror reads in truth-decision code ===\n');

{
  const terminalMirrorFields = [
    'ownerSatisfaction',
    'defenseOutcome',
    'endingType',
    'endingBucket',
    'relativeOutcome',
  ];

  // Files that make truth decisions and must NOT read terminal mirrors directly
  const truthDecisionFiles = [
    'src/selling-houses/domain/caseOutcome.ts',
    'src/selling-houses/domain/resultEvaluation.ts',
    'src/selling-houses/domain/caseLifecycle.ts',
    'src/selling-houses/domain/engine/actionResolvers.ts',
    'src/selling-houses/domain/engine/marketEngine.ts',
    'src/selling-houses/domain/dealClosing.ts',
  ];

  // Allowed patterns that are NOT truth-decision reads:
  // - mirror sync functions (asWritableCase writes)
  // - passing to syncLegacyCaseOutcomeMirrorsFromTerminalFact
  // - event payload construction
  // - explicit old_save_compatibility boundaries
  const allowedPatterns = [
    /asWritableCase/,
    /syncLegacyCaseOutcomeMirrorsFromTerminalFact/,
    /markCaseSoldFromContract/,
    /markCaseSoldForFixtureOnly/,
    /markCaseLostToRival/,
    /markCaseWithdrawn/,
    /syncLegacyCaseTerminalMirrorFromOutcome/,
    /recordDomainEvent/,
    /logEvent/,
    /old_save_compatibility/,
    /provenance/,
    /fallback-guard/,
    /source.*case-fallback/,
    /source.*legacy_case_mirror/,
    /relationSource/,
    /trustSource/,
    /readinessSource/,
  ];

  let violations = 0;
  for (const file of truthDecisionFiles) {
    const src = readFileSafe(file);
    if (!src) continue;
    const lines = src.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const stripped = stripCommentsAndStrings(line);

      for (const field of terminalMirrorFields) {
        // Match: caseItem.field read (not assignment, not === comparison in sync boundary)
        const readMatch = stripped.match(new RegExp(`caseItem\\.${field}(?![\\s]*=(?!=))`));
        if (readMatch) {
          // Check if this line is in an allowed pattern context
          const isAllowed = allowedPatterns.some(p => p.test(stripped));
          if (!isAllowed) {
            // Also check surrounding context (previous 5 lines) for allowed function boundary
            const contextStart = Math.max(0, i - 5);
            const context = lines.slice(contextStart, i + 1).map(stripCommentsAndStrings).join('\n');
            const contextAllowed = allowedPatterns.some(p => p.test(context));
            if (!contextAllowed) {
              fail(`${file}:${i + 1}: direct caseItem.${field} read outside allowed boundary`);
              violations++;
            }
          }
        }
      }
    }
  }
  check(violations === 0, `no direct terminal mirror reads in truth-decision code (found ${violations})`);
}

// ── 2. Terminal outcome resolvers derive from canonical state ──

console.log('\n=== R30-2: Terminal outcome resolvers use canonical state ===\n');

{
  // resultEvaluation.ts must have a function that derives outcome from canonical state
  const resultEvalSrc = readFileSafe('src/selling-houses/domain/resultEvaluation.ts');
  check(resultEvalSrc !== null, 'resultEvaluation.ts exists');
  if (resultEvalSrc) {
    // Must have a canonical-deriving function that accepts GameState
    const hasCanonicalResolver = resultEvalSrc.includes('buildCaseFinalResultFromCanonicalState')
      || resultEvalSrc.includes('deriveOutcomeFromCanonical');
    check(hasCanonicalResolver,
      'resultEvaluation.ts has canonical-deriving outcome function');

    // Must NOT prefer caseItem.ownerSatisfaction as truth before deriving
    const stripped = stripCommentsAndStrings(resultEvalSrc);
    const prefersMirrorSatisfaction = stripped.match(/if\s*\(\s*caseItem\.ownerSatisfaction\s*\)/);
    check(prefersMirrorSatisfaction === null,
      'resultEvaluation.ts does not prefer caseItem.ownerSatisfaction mirror as truth');
  }

  // caseOutcome.ts must derive from canonical state, not prefer mirrors
  const caseOutcomeSrc = readFileSafe('src/selling-houses/domain/caseOutcome.ts');
  check(caseOutcomeSrc !== null, 'caseOutcome.ts exists');
  if (caseOutcomeSrc) {
    const stripped = stripCommentsAndStrings(caseOutcomeSrc);
    // resolveOwnerSatisfaction must NOT early-return on caseItem.ownerSatisfaction
    const prefersMirrorSatisfaction = stripped.match(/if\s*\(\s*caseItem\.ownerSatisfaction\s*\)/);
    check(prefersMirrorSatisfaction === null,
      'caseOutcome.ts resolveOwnerSatisfaction does not prefer mirror');
    // resolveEndingType must NOT early-return on caseItem.endingType
    const prefersMirrorEndingType = stripped.match(/if\s*\(\s*caseItem\.endingType\s*\)/);
    check(prefersMirrorEndingType === null,
      'caseOutcome.ts resolveEndingType does not prefer mirror');
  }

  // caseOutcomeProjection.ts must exist and derive from canonical state
  const projectionSrc = readFileSafe('src/selling-houses/core/world-state/caseOutcomeProjection.ts');
  check(projectionSrc !== null, 'caseOutcomeProjection.ts exists');
  if (projectionSrc) {
    check(projectionSrc.includes('deriveCaseOutcomeProjection') || projectionSrc.includes('deriveCaseTerminalStatus'),
      'caseOutcomeProjection.ts has canonical derivation function');
  }
}

// ── 3. Deal closing reads relation/read-boundary APIs, not local case fallback ──

console.log('\n=== R30-3: Deal closing uses shared read boundaries ===\n');

{
  const dealClosingSrc = readFileSafe('src/selling-houses/domain/dealClosing.ts');
  check(dealClosingSrc !== null, 'dealClosing.ts exists');
  if (dealClosingSrc) {
    const stripped = stripCommentsAndStrings(dealClosingSrc);

    // Must NOT have local readRelationTrustForCase
    const hasLocalReadTrust = stripped.includes('function readRelationTrustForCase');
    check(!hasLocalReadTrust,
      'dealClosing.ts does not have local readRelationTrustForCase');

    // Must NOT have local readRelationReadinessForCase
    const hasLocalReadReadiness = stripped.includes('function readRelationReadinessForCase');
    check(!hasLocalReadReadiness,
      'dealClosing.ts does not have local readRelationReadinessForCase');

    // Must use shared read boundary (imported from core or domain)
    const usesSharedReadBoundary = stripped.includes('readTrustFromState')
      || stripped.includes('readOwnerCaseValuesFromState')
      || stripped.includes('readBrokerOwnerTrustFromState')
      || stripped.includes('readCaseRelationBusinessContextFromRuntime')
      || stripped.includes('readBrokerOwnerTrustState')
      || stripped.includes('readOwnerCaseReadinessState')
      || stripped.includes('readCaseTerminalOutcomeForCase');
    check(usesSharedReadBoundary,
      'dealClosing.ts uses shared read boundary API');

    // Must NOT have generic 'case-fallback' as a normal evaluation source
    const hasCaseFallback = stripped.includes("'case-fallback'");
    check(!hasCaseFallback,
      "dealClosing.ts does not use generic 'case-fallback' source");
  }
}

// ── 4. Old-save fallback is explicit and quarantined ──

console.log('\n=== R30-4: Old-save fallback is explicit and quarantined ===\n');

{
  // Search production code for generic fallback patterns
  const projectRoot = join(import.meta.dirname!, '..');
  const domainFiles = collectFiles('src/selling-houses/domain', projectRoot);
  const coreFiles = collectFiles('src/selling-houses/core', projectRoot);
  const allFiles = [...domainFiles, ...coreFiles];

  // Allowed files for fallback patterns
  const allowedFallbackFiles = new Set([
    'src/selling-houses/core/evaluation/trustReadBoundary.ts',
    'src/selling-houses/core/evaluation/ownerCaseReadBoundary.ts',
    'src/selling-houses/core/world-state/relationReadProjection.ts',
    'src/selling-houses/core/evaluation/legacyAdapters.ts',
    'src/selling-houses/domain/ownerCaseReadinessWriteHelper.ts',
    'src/selling-houses/domain/trustWriteHelper.ts',
  ]);

  let genericFallbackCount = 0;
  for (const file of allFiles) {
    if (allowedFallbackFiles.has(file)) continue;
    const src = readFileSafe(file);
    if (!src) continue;
    const stripped = stripCommentsAndStrings(src);

    // Check for generic 'case-fallback' string
    if (stripped.includes("'case-fallback'") || stripped.includes('"case-fallback"')) {
      fail(`${file}: uses generic 'case-fallback' outside allowed boundary`);
      genericFallbackCount++;
    }
  }
  check(genericFallbackCount === 0,
    `no generic 'case-fallback' outside allowed boundaries (found ${genericFallbackCount})`);

  // Fallback source types should be renamed to old_save_compatibility in shared boundaries
  const trustReadSrc = readFileSafe('src/selling-houses/core/evaluation/trustReadBoundary.ts');
  if (trustReadSrc) {
    check(trustReadSrc.includes('old_save_compatibility') || trustReadSrc.includes('legacy_case_mirror'),
      'trustReadBoundary.ts has explicit fallback provenance type');
  }

  const readProjSrc = readFileSafe('src/selling-houses/core/world-state/relationReadProjection.ts');
  if (readProjSrc) {
    // relationReadProjection should use old_save_compatibility, not generic case-fallback
    const hasOldSaveCompat = readProjSrc.includes('old_save_compatibility');
    const hasGenericCaseFallback = readProjSrc.includes("'case-fallback'");
    check(hasOldSaveCompat || !hasGenericCaseFallback,
      'relationReadProjection uses old_save_compatibility or no generic case-fallback');
  }
}

// ── 5. Trust/readiness hydration has explicit old-save provenance ──

console.log('\n=== R30-5: Hydration has explicit old-save provenance ===\n');

{
  const writeHelperSrc = readFileSafe('src/selling-houses/domain/ownerCaseReadinessWriteHelper.ts');
  check(writeHelperSrc !== null, 'ownerCaseReadinessWriteHelper.ts exists');
  if (writeHelperSrc) {
    // ensureOwnerCaseReadinessState should have explicit provenance for old-save hydration
    const hasProvenance = writeHelperSrc.includes('provenance') || writeHelperSrc.includes('old_save_compatibility');
    check(hasProvenance,
      'ownerCaseReadinessWriteHelper hydration has provenance tracking');
  }

  const trustHelperSrc = readFileSafe('src/selling-houses/domain/trustWriteHelper.ts');
  check(trustHelperSrc !== null, 'trustWriteHelper.ts exists');
  if (trustHelperSrc) {
    const hasProvenance = trustHelperSrc.includes('provenance') || trustHelperSrc.includes('old_save_compatibility');
    check(hasProvenance,
      'trustWriteHelper hydration has provenance tracking');
  }
}

// ── 6. ownerCaseReadinessHelper.ts is gone or quarantine-proven ──

console.log('\n=== R30-6: ownerCaseReadinessHelper gone or quarantined ===\n');

{
  const helperSrc = readFileSafe('src/selling-houses/domain/ownerCaseReadinessHelper.ts');
  if (helperSrc === null) {
    pass('ownerCaseReadinessHelper.ts deleted');
  } else {
    // Must have compatibility-only header
    check(helperSrc.includes('compatibility') || helperSrc.includes('COMPATIBILITY'),
      'ownerCaseReadinessHelper.ts has compatibility-only header');

    // Must NOT have asWritableCase
    check(!helperSrc.includes('asWritableCase'),
      'ownerCaseReadinessHelper.ts has no asWritableCase');

    // Must NOT be imported by production code
    const projectRoot = join(import.meta.dirname!, '..');
    const prodFiles = collectFiles('src/selling-houses', projectRoot);
    let prodImports = 0;
    for (const file of prodFiles) {
      if (file.includes('ownerCaseReadinessHelper.ts') || file.includes('ownerCaseReadinessWriteHelper.ts')) continue;
      const src = readFileSafe(file);
      if (!src) continue;
      const stripped = stripCommentsAndStrings(src);
      if (stripped.includes('ownerCaseReadinessHelper') && !stripped.includes('ownerCaseReadinessWriteHelper')) {
        // Check it's an actual import, not just a string
        const importMatch = stripped.match(new RegExp(`from[^;]*ownerCaseReadinessHelper\\.js`));
        if (importMatch) {
          fail(`${file}: production imports from old ownerCaseReadinessHelper`);
          prodImports++;
        }
      }
    }
    check(prodImports === 0,
      `no production imports from old helper (found ${prodImports})`);
  }
}

// ── 7. Gate self-audit ──

console.log('\n=== R30-7: Gate self-audit ===\n');

{
  const gateSrc = readFileSync(join(import.meta.dirname!, 'verify-selling-houses-r30-canonical-read-semantics-final-gate.ts'), 'utf-8');
  const violations = findGateSoftPassLines(gateSrc);
  check(violations.length === 0, `no soft-pass patterns in R30 gate (found ${violations.length})`);
  if (violations.length > 0) {
    for (const v of violations) {
      fail(`  soft-pass at line ${v.line}: ${v.pattern}`);
    }
  }
}

// ── 8. Prior critical gates ──

console.log('\n=== R30-8: Prior critical gates ===\n');

{
  const priorGates = [
    { name: 'R29', script: 'scripts/verify-selling-houses-r29-terminal-outcome-readonly-readiness-writehelper-gate.ts' },
    { name: 'R28', script: 'scripts/verify-selling-houses-r28-seal-production-api-backdoors-gate.ts' },
    { name: 'R27', script: 'scripts/verify-selling-houses-r27-no-fallback-full-constitutional-green-gate.ts' },
    { name: 'R24', script: 'scripts/verify-selling-houses-r24-readonly-truth-fields-gate.ts' },
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
        fail(`${gate.name} gate fails: ${failLines.join('; ')}`);
      } else {
        pass(`${gate.name} gate passes`);
      }
    } catch (err: any) {
      fail(`${gate.name} gate exception: ${err.message}`);
    }
  }
}

// ── Summary ──

console.log('\n=== R30 Gate Summary ===\n');
console.log(`  Passed: ${passed}`);
console.log(`  Failed: ${failed}`);

if (failed > 0) {
  console.error('\nFAILURES:');
  for (const e of errors) {
    console.error(`  - ${e}`);
  }
  process.exit(1);
}

console.log('\nR30 gate PASSED');
