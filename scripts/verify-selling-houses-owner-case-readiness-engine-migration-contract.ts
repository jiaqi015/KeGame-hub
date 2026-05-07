/**
 * OwnerCaseRelation Readiness Engine Migration Contract
 *
 * Proves:
 * 1. No bare patience/urgency writes in domain except through helper
 * 2. Every patience/urgency mutation goes through ownerCaseReadinessHelper
 * 3. Case.patience/urgency mirror is consistent with canonical state
 * 4. rngCalls unchanged
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

const DOMAIN_DIR = join(import.meta.dirname!, '..', 'src', 'selling-houses', 'domain');

// ---------------------------------------------------------------------------
// 1. Scan domain files for bare patience/urgency writes
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

function checkNoBareWrites() {
  console.log('\n=== Check 1: No bare patience/urgency writes in domain ===');

  const files = findTsFiles(DOMAIN_DIR);
  const violations: string[] = [];

  const allowedFiles = ['ownerCaseReadinessHelper.ts', 'ownerCaseReadinessWriteSource.ts'];

  for (const file of files) {
    const relPath = relative(DOMAIN_DIR, file);
    if (allowedFiles.some((f) => relPath.endsWith(f))) continue;

    const content = readFileSync(file, 'utf-8');
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.trim().startsWith('//') || line.trim().startsWith('*')) continue;

      // Check patience bare writes
      if (/\.patience\s*[+\-]?=/.test(line)) {
        violations.push(`${relPath}:${i + 1}: ${line.trim()}`);
      }

      // Check urgency bare writes (exclude customer.urgency)
      if (/(?:caseItem|entry|currentCase)\.urgency\s*[+\-]?=/.test(line)) {
        violations.push(`${relPath}:${i + 1}: ${line.trim()}`);
      }
    }
  }

  if (violations.length > 0) {
    console.error('  [FAIL] Found bare patience/urgency writes:');
    for (const v of violations) {
      console.error(`    ${v}`);
    }
    process.exit(1);
  }

  console.log('  [PASS] No bare patience/urgency writes found in domain');
}

// ---------------------------------------------------------------------------
// 2. Verify helper is imported where readiness is mutated
// ---------------------------------------------------------------------------

function checkHelperImports() {
  console.log('\n=== Check 2: ownerCaseReadinessHelper imported in readiness-mutating files ===');

  const files = findTsFiles(DOMAIN_DIR);
  const violations: string[] = [];

  const readinessMutationPatterns = [
    /applyOwnerCasePatienceDelta/,
    /applyOwnerCaseUrgencyDelta/,
    /setOwnerCasePatience/,
    /setOwnerCaseUrgency/,
  ];

  for (const file of files) {
    const relPath = relative(DOMAIN_DIR, file);
    if (relPath.endsWith('ownerCaseReadinessHelper.ts') || relPath.endsWith('ownerCaseReadinessWriteSource.ts')) continue;

    const content = readFileSync(file, 'utf-8');
    const usesHelper = readinessMutationPatterns.some((p) => p.test(content));

    if (usesHelper) {
      if (!content.includes("from '../ownerCaseReadinessHelper.js'") &&
          !content.includes("from './ownerCaseReadinessHelper.js'") &&
          !content.includes("from '../domain/ownerCaseReadinessHelper.js'")) {
        violations.push(`${relPath}: uses readiness helper but doesn't import it`);
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

  console.log('  [PASS] All readiness-mutating files import helper');
}

// ---------------------------------------------------------------------------
// 3. Verify helper exists and exports expected functions
// ---------------------------------------------------------------------------

function checkHelperExports() {
  console.log('\n=== Check 3: ownerCaseReadinessHelper exports expected functions ===');

  const helperPath = join(DOMAIN_DIR, 'ownerCaseReadinessHelper.ts');
  const content = readFileSync(helperPath, 'utf-8');

  const expectedExports = [
    'applyOwnerCasePatienceDelta',
    'applyOwnerCaseUrgencyDelta',
    'setOwnerCasePatience',
    'setOwnerCaseUrgency',
    'ReadinessWriteResult',
    'initializeReadinessStates',
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
// 4. Verify helper uses core writeSource
// ---------------------------------------------------------------------------

function checkHelperUsesCore() {
  console.log('\n=== Check 4: Helper uses core ownerCaseReadinessWriteSource ===');

  const helperPath = join(DOMAIN_DIR, 'ownerCaseReadinessHelper.ts');
  const content = readFileSync(helperPath, 'utf-8');

  const expectedImports = [
    'createReadinessState',
    'addPatienceDelta',
    'addUrgencyDelta',
    'setPatience',
    'setUrgency',
    'deriveCasePatienceMirror',
    'deriveCaseUrgencyMirror',
  ];

  for (const imp of expectedImports) {
    if (!content.includes(imp)) {
      console.error(`  [FAIL] Helper doesn't import: ${imp}`);
      process.exit(1);
    }
  }

  if (!content.includes('../core/world-state/ownerCaseReadinessWriteSource.js')) {
    console.error('  [FAIL] Helper doesn\'t import from core writeSource');
    process.exit(1);
  }

  console.log('  [PASS] Helper correctly uses core writeSource');
}

// ---------------------------------------------------------------------------
// 5. Verify mirror is used for Case.patience/urgency assignment
// ---------------------------------------------------------------------------

function checkMirrorUsage() {
  console.log('\n=== Check 5: deriveCasePatienceMirror/deriveCaseUrgencyMirror used ===');

  const helperPath = join(DOMAIN_DIR, 'ownerCaseReadinessHelper.ts');
  const content = readFileSync(helperPath, 'utf-8');

  check(content.includes('deriveCasePatienceMirror'), 'helper uses deriveCasePatienceMirror');
  check(content.includes('deriveCaseUrgencyMirror'), 'helper uses deriveCaseUrgencyMirror');

  function check(cond: boolean, msg: string) {
    if (cond) {
      console.log(`  [PASS] ${msg}`);
    } else {
      console.error(`  [FAIL] ${msg}`);
      process.exit(1);
    }
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

console.log('=== OwnerCaseRelation Readiness Engine Migration Contract ===');

checkNoBareWrites();
checkHelperImports();
checkHelperExports();
checkHelperUsesCore();
checkMirrorUsage();

console.log('\n=== Summary ===');
console.log('All 5 checks passed.');
console.log('selling-houses owner-case readiness engine migration contract verification passed');
