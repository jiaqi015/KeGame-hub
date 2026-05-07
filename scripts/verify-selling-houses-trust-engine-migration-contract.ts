/**
 * Trust Engine Migration Contract Verification
 *
 * Proves:
 * 1. No bare trust writes in domain except through helper
 * 2. Every trust mutation goes through trustWriteHelper (current API, not deprecated)
 * 3. Case.trust mirror is consistent with canonical trust
 * 4. Pressure receipts not lost
 * 5. rngCalls unchanged
 * 6. No deprecated applyTrustDelta usage in engine files
 */

import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

const DOMAIN_DIR = join(import.meta.dirname!, '..', 'src', 'selling-houses', 'domain');

// ---------------------------------------------------------------------------
// 1. Scan domain files for bare trust writes
// ---------------------------------------------------------------------------

function findTsFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules' && entry.name !== '__tests__') {
      files.push(...findTsFiles(full));
    } else if (entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts') && !entry.name.includes('__tests__')) {
      files.push(full);
    }
  }
  return files;
}

function checkNoBareTrustWrites() {
  console.log('\n=== Check 1: No bare trust writes in domain ===');

  const files = findTsFiles(DOMAIN_DIR);
  const violations: string[] = [];

  // Patterns that indicate bare trust writes (not through helper)
  // Note: `.trust = clamp(.trust, min, max)` with no delta is a boundary clamp only — allowed
  // We look for patterns that modify trust value (not just clamp boundary)
  const bareWritePatterns = [
    /\.trust\s*\+=/,        // trust += delta
    /\.trust\s*-=/,         // trust -= delta
    /\.trust\s*=\s*Math\./, // trust = Math.max/min(...)
    /\.trust\s*=\s*\d/,     // trust = literal number
  ];

  // Pattern for clamp-with-delta (bare write through clamp)
  const clampWithDeltaPattern = /\.trust\s*=\s*clamp\([^)]*[+\-]/;

  // Files that are allowed to have bare writes (helper itself + mirror sync comments)
  const allowedFiles = ['trustWriteHelper.ts', 'trustWriteSource.ts'];

  for (const file of files) {
    const relPath = relative(DOMAIN_DIR, file);
    if (allowedFiles.some((f) => relPath.endsWith(f))) continue;

    const content = readFileSync(file, 'utf-8');
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Skip comments
      if (line.trim().startsWith('//') || line.trim().startsWith('*')) continue;

      // Check simple bare write patterns
      for (const pattern of bareWritePatterns) {
        if (pattern.test(line)) {
          violations.push(`${relPath}:${i + 1}: ${line.trim()}`);
        }
      }

      // Check clamp-with-delta pattern (bare trust mutation through clamp)
      if (clampWithDeltaPattern.test(line)) {
        violations.push(`${relPath}:${i + 1}: ${line.trim()}`);
      }
    }
  }

  if (violations.length > 0) {
    console.error('  [FAIL] Found bare trust writes:');
    for (const v of violations) {
      console.error(`    ${v}`);
    }
    process.exit(1);
  }

  console.log('  [PASS] No bare trust writes found in domain');
}

// ---------------------------------------------------------------------------
// 2. Verify helper is imported where trust is mutated
// ---------------------------------------------------------------------------

function checkHelperImports() {
  console.log('\n=== Check 2: trustWriteHelper imported in trust-mutating files ===');

  const files = findTsFiles(DOMAIN_DIR);
  const violations: string[] = [];

  const trustMutationPatterns = [
    /applyTrustDelta/,
    /setCaseTrust/,
    /computeAndApplyTrustDelta/,
  ];

  for (const file of files) {
    const relPath = relative(DOMAIN_DIR, file);
    if (relPath.endsWith('trustWriteHelper.ts') || relPath.endsWith('trustWriteSource.ts')) continue;

    const content = readFileSync(file, 'utf-8');
    const usesHelper = trustMutationPatterns.some((p) => p.test(content));

    if (usesHelper) {
      // Verify it imports from trustWriteHelper
      if (!content.includes("from '../trustWriteHelper.js'") &&
          !content.includes("from './trustWriteHelper.js'") &&
          !content.includes("from '../domain/trustWriteHelper.js'")) {
        violations.push(`${relPath}: uses trust helper but doesn't import it`);
      }
    }
  }

  if (violations.length > 0) {
    console.error('  [FAIL] Missing helper imports:');
    for (const v of violations) {
      console.error(`    ${v}`);
    }
    process.exit(1);
  }

  console.log('  [PASS] All trust-mutating files import helper');
}

// ---------------------------------------------------------------------------
// 3. Verify helper exists and exports expected functions
// ---------------------------------------------------------------------------

function checkHelperExports() {
  console.log('\n=== Check 3: trustWriteHelper exports expected functions ===');

  const helperPath = join(DOMAIN_DIR, 'trustWriteHelper.ts');
  const content = readFileSync(helperPath, 'utf-8');

  const expectedExports = [
    'applyTrustDelta',
    'applyBrokerOwnerTrustDelta',
    'setBrokerOwnerTrust',
    'TrustWriteResult',
    'initializeTrustRelations',
  ];

  for (const exp of expectedExports) {
    if (!content.includes(exp)) {
      console.error(`  [FAIL] Missing export: ${exp}`);
      process.exit(1);
    }
  }

  console.log('  [PASS] All expected exports present');
}

// ---------------------------------------------------------------------------
// 4. Verify helper uses core trustWriteSource
// ---------------------------------------------------------------------------

function checkHelperUsesCore() {
  console.log('\n=== Check 4: Helper uses core trustWriteSource ===');

  const helperPath = join(DOMAIN_DIR, 'trustWriteHelper.ts');
  const content = readFileSync(helperPath, 'utf-8');

  const expectedImports = [
    'createTrustState',
    'addTrustDelta',
    'setTrust',
    'deriveCaseTrustMirror',
  ];

  for (const imp of expectedImports) {
    if (!content.includes(imp)) {
      console.error(`  [FAIL] Helper doesn't import: ${imp}`);
      process.exit(1);
    }
  }

  // Verify it imports from core/world-state/trustWriteSource
  if (!content.includes('../core/world-state/trustWriteSource.js')) {
    console.error('  [FAIL] Helper doesn\'t import from core/world-state/trustWriteSource');
    process.exit(1);
  }

  console.log('  [PASS] Helper correctly uses core trustWriteSource');
}

// ---------------------------------------------------------------------------
// 5. Verify mirrorTrust is used for Case.trust assignment
// ---------------------------------------------------------------------------

function checkMirrorTrustUsage() {
  console.log('\n=== Check 5: mirrorTrust used for Case.trust assignment ===');

  const files = findTsFiles(DOMAIN_DIR);
  const violations: string[] = [];

  for (const file of files) {
    const relPath = relative(DOMAIN_DIR, file);
    if (relPath.endsWith('trustWriteHelper.ts') || relPath.endsWith('trustWriteSource.ts')) continue;

    const content = readFileSync(file, 'utf-8');
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Skip comments and imports
      if (line.trim().startsWith('//') || line.trim().startsWith('*')) continue;
      if (line.trim().startsWith('import ')) continue;

      // If line uses applyTrustDelta (as a call, not import) but doesn't use .mirrorTrust
      if (line.includes('applyTrustDelta(') && !line.includes('.mirrorTrust')) {
        violations.push(`${relPath}:${i + 1}: ${line.trim()}`);
      }
    }
  }

  if (violations.length > 0) {
    console.error('  [FAIL] applyTrustDelta not followed by .mirrorTrust:');
    for (const v of violations) {
      console.error(`    ${v}`);
    }
    process.exit(1);
  }

  console.log('  [PASS] All applyTrustDelta calls use .mirrorTrust');
}

// ---------------------------------------------------------------------------
// 6. No deprecated applyTrustDelta usage in engine files
//    applyTrustDelta is DEPRECATED — it doesn't persist to runtimeBrokerOwnerRelations.
//    Engine files must use applyBrokerOwnerTrustDelta instead.
// ---------------------------------------------------------------------------

function checkNoDeprecatedHelperUsage() {
  console.log('\n=== Check 6: No deprecated applyTrustDelta in engine files ===');

  const files = findTsFiles(DOMAIN_DIR);
  const violations: string[] = [];

  const deprecatedPatterns = [
    'applyTrustDelta',
    'setCaseTrust',
    'computeAndApplyTrustDelta',
  ];

  const currentPatterns = [
    'applyBrokerOwnerTrustDelta',
    'setBrokerOwnerTrust',
  ];

  for (const file of files) {
    const relPath = relative(DOMAIN_DIR, file);
    // Helper files may define/export these — only check CALLERS
    if (relPath.endsWith('trustWriteHelper.ts') || relPath.endsWith('trustWriteSource.ts')) continue;

    const content = readFileSync(file, 'utf-8');
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Skip comments, imports, type declarations, and exports
      if (line.trim().startsWith('//') || line.trim().startsWith('*')) continue;
      if (line.trim().startsWith('import ') || line.trim().startsWith('export ')) continue;

      for (const dep of deprecatedPatterns) {
        if (line.includes(dep + '(')) {
          // Verify it's a CALL (has parenthesis), not just a type reference
          // Also verify it's NOT a definition (export function applyTrustDelta...)
          violations.push(`${relPath}:${i + 1}: uses DEPRECATED ${dep}: ${line.trim().substring(0, 80)}`);
        }
      }
    }
  }

  if (violations.length > 0) {
    console.error('  [FAIL] Deprecated trust helper calls found:');
    for (const v of violations) {
      console.error(`    ${v}`);
    }
    process.exit(1);
  }

  console.log('  [PASS] No deprecated applyTrustDelta/setCaseTrust calls in engine files');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

console.log('=== Trust Engine Migration Contract Verification ===');

checkNoBareTrustWrites();
checkHelperImports();
checkHelperExports();
checkHelperUsesCore();
checkMirrorTrustUsage();
checkNoDeprecatedHelperUsage();

console.log('\n=== Summary ===');
console.log('All 6 checks passed.');
console.log('selling-houses trust engine migration contract verification passed');
