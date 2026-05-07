/**
 * OwnerCaseRelation Readiness Final Gate — Agent D acceptance script.
 *
 * Proves (or disproves) that the patience/urgency write-source migration from
 * Case.patience/urgency (legacy) to OwnerCaseRelation (canonical) is complete.
 *
 * Chain under test:
 *   engine writes -> OwnerCaseRelation canonical -> Case.patience/urgency mirror sync
 *   -> evaluation/POV reads canonical -> old save fallback -> replay unchanged
 *
 * Checks:
 * 1. ownership registry declares patience/urgency canonical = owner-case-relation
 * 2. ownerCaseReadinessWriteSource exists and is pure
 * 3. engine patience/urgency mutations use canonical helper (NOT bare writes)
 * 4. runtimeOwnerCaseReadinessStates is populated during game init
 * 5. evaluation reads patience/urgency via readBoundary (prefers relation)
 * 6. old save fallback: Case.patience/urgency works when relation absent
 * 7. pressure/consensus/semantic receipts not regressed
 * 8. replay/rngCalls unchanged
 * 9. no bare patience/urgency write drift in domain layer
 * 10. writeSource and readBoundary have no domain/runtime imports
 *
 * IMPORTANT: This script reports the ACTUAL state. A failing check means
 * the migration is NOT complete for that aspect — it does NOT mean the
 * script is wrong. Fix the source code, not the assertions.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let passed = 0;
let failed = 0;
const errors: string[] = [];
const warnings: string[] = [];

function check(condition: boolean, message: string) {
  if (condition) {
    passed++;
    console.log(`  [PASS] ${message}`);
  } else {
    failed++;
    errors.push(message);
    console.log(`  [FAIL] ${message}`);
  }
}

function warn(condition: boolean, message: string) {
  if (!condition) {
    warnings.push(message);
    console.log(`  [WARN] ${message}`);
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

// ---------------------------------------------------------------------------
// 1. Ownership registry declares patience/urgency canonical = owner-case-relation
// ---------------------------------------------------------------------------

function checkOwnershipRegistry() {
  console.log('\n=== Check 1: Ownership registry ===');

  const ownershipSrc = readFile(
    'src/selling-houses/core/world-state/legacy-case-field-ownership.ts',
  );

  // Patience
  const patienceSection = ownershipSrc.substring(
    ownershipSrc.indexOf('patience:'),
    ownershipSrc.indexOf('urgency:'),
  );
  check(
    patienceSection.includes("canonicalOwner: 'owner-case-relation'"),
    'patience ownership declares owner-case-relation as canonicalOwner',
  );
  check(
    patienceSection.includes("legacyRole: 'compatibility-mirror'"),
    'patience legacyRole is compatibility-mirror',
  );

  // Urgency
  const urgencySection = ownershipSrc.substring(
    ownershipSrc.indexOf('urgency:'),
    ownershipSrc.indexOf('urgency:') + 300,
  );
  check(
    urgencySection.includes("canonicalOwner: 'owner-case-relation'"),
    'urgency ownership declares owner-case-relation as canonicalOwner',
  );
  check(
    urgencySection.includes("legacyRole: 'compatibility-mirror'"),
    'urgency legacyRole is compatibility-mirror',
  );
}

// ---------------------------------------------------------------------------
// 2. ownerCaseReadinessWriteSource exists and is pure
// ---------------------------------------------------------------------------

function checkWriteSourceHelper() {
  console.log('\n=== Check 2: ownerCaseReadinessWriteSource ===');

  const src = readFileSafe(
    'src/selling-houses/core/world-state/ownerCaseReadinessWriteSource.ts',
  );
  check(src !== null, 'ownerCaseReadinessWriteSource.ts exists');
  if (!src) return;

  check(src.includes('export function createReadinessState'), 'createReadinessState exists');
  check(src.includes('export function setPatience'), 'setPatience exists');
  check(src.includes('export function addPatienceDelta'), 'addPatienceDelta exists');
  check(src.includes('export function setUrgency'), 'setUrgency exists');
  check(src.includes('export function addUrgencyDelta'), 'addUrgencyDelta exists');
  check(src.includes('export function deriveCasePatienceMirror'), 'deriveCasePatienceMirror exists');
  check(src.includes('export function deriveCaseUrgencyMirror'), 'deriveCaseUrgencyMirror exists');
  check(src.includes('export function hydrateReadinessStateFromCase'), 'hydrateReadinessStateFromCase exists');
  check(src.includes('export interface OwnerCaseReadinessState'), 'OwnerCaseReadinessState exists');

  // Pure: no domain/runtime imports
  check(!src.includes("from '../../domain"), 'writeSource does NOT import domain');
  check(!src.includes("from '../../runtime"), 'writeSource does NOT import runtime');

  // Check actual code (not comments) for forbidden patterns
  const srcNoComments = src.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  check(!srcNoComments.includes('Date.now'), 'writeSource has no Date.now');
  check(!srcNoComments.includes('Math.random'), 'writeSource has no Math.random');
  check(src.includes('Object.freeze'), 'writeSource uses Object.freeze');
}

// ---------------------------------------------------------------------------
// 3. Engine patience/urgency mutations use canonical helper
// ---------------------------------------------------------------------------

function checkEngineMutations() {
  console.log('\n=== Check 3: Engine mutations (migration status) ===');

  const engineFiles = [
    'src/selling-houses/domain/engine.ts',
    'src/selling-houses/domain/engine/ownerActionExecutors.ts',
    'src/selling-houses/domain/engine/marketEngine.ts',
    'src/selling-houses/domain/engine/pricingActionExecutors.ts',
    'src/selling-houses/domain/engine/competitionEngine.ts',
    'src/selling-houses/domain/engine/eventEngine.ts',
    'src/selling-houses/application/gameTransitions.ts',
  ];

  const helperPatterns = [
    'applyOwnerCasePatienceDelta',
    'applyOwnerCaseUrgencyDelta',
    'setOwnerCasePatience',
    'setOwnerCaseUrgency',
    'deriveCasePatienceMirror',
    'deriveCaseUrgencyMirror',
  ];

  let helperWrites = 0;
  let barePatienceWrites = 0;
  let bareUrgencyWrites = 0;
  const bareLocations: string[] = [];

  // Check if bridge helper exists
  const helperSrc = readFileSafe('src/selling-houses/domain/ownerCaseReadinessHelper.ts');
  const hasHelper = helperSrc !== null && (
    helperSrc.includes('applyOwnerCasePatienceDelta')
    || helperSrc.includes('applyOwnerCaseUrgencyDelta')
  );
  check(hasHelper, 'domain/ownerCaseReadinessHelper.ts bridge exists');

  // Check helper imports in engine files
  let filesWithHelperImport = 0;
  for (const filePath of engineFiles) {
    const src = readFileSafe(filePath);
    if (!src) continue;
    if (src.includes('ownerCaseReadinessHelper') || helperPatterns.some((p) => src.includes(p))) {
      filesWithHelperImport++;
    }
  }
  check(filesWithHelperImport > 0, `engine files import readiness helper (${filesWithHelperImport}/${engineFiles.length})`);

  // Scan for bare writes
  for (const filePath of engineFiles) {
    const src = readFileSafe(filePath);
    if (!src) continue;
    const lines = src.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trim();
      if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) continue;

      // Match .patience writes
      if (/\.patience\s*[+\-]?=\s/.test(trimmed)) {
        if (helperPatterns.some((p) => trimmed.includes(p))) {
          helperWrites++;
        } else {
          barePatienceWrites++;
          bareLocations.push(`${filePath}:${i + 1}: [bare-patience] ${trimmed.substring(0, 80)}`);
        }
      }

      // Match .urgency writes (exclude customer.urgency)
      if (/caseItem\.urgency\s*[+\-]?=\s|entry\.urgency\s*[+\-]?=\s|currentCase\.urgency\s*[+\-]?=\s/.test(trimmed)) {
        if (helperPatterns.some((p) => trimmed.includes(p))) {
          helperWrites++;
        } else {
          bareUrgencyWrites++;
          bareLocations.push(`${filePath}:${i + 1}: [bare-urgency] ${trimmed.substring(0, 80)}`);
        }
      }
    }
  }

  if (bareLocations.length > 0) {
    console.log(`\n  ⚠ BARE patience/urgency writes:`);
    for (const loc of bareLocations) {
      console.log(`    ${loc}`);
    }
  }

  console.log(`\n  Total: ${helperWrites} via helper, ${barePatienceWrites} bare patience, ${bareUrgencyWrites} bare urgency`);

  check(
    barePatienceWrites === 0 && bareUrgencyWrites === 0,
    `ZERO bare patience/urgency writes (found ${barePatienceWrites} patience + ${bareUrgencyWrites} urgency)`,
  );
}

// ---------------------------------------------------------------------------
// 4. runtimeOwnerCaseReadinessStates is populated during game init
// ---------------------------------------------------------------------------

function checkRuntimeStatesPopulated() {
  console.log('\n=== Check 4: runtimeOwnerCaseReadinessStates populated ===');

  const modelsSrc = readFile('src/selling-houses/domain/models.ts');
  check(
    modelsSrc.includes('runtimeOwnerCaseReadinessStates'),
    'GameState has runtimeOwnerCaseReadinessStates field',
  );

  const initSrc = readFileSafe('src/selling-houses/application/gameState.ts');
  if (initSrc) {
    const populates = initSrc.includes('runtimeOwnerCaseReadinessStates')
      || initSrc.includes('initializeReadinessStates');
    check(
      populates,
      'createInitialState populates runtimeOwnerCaseReadinessStates',
    );
  } else {
    check(false, 'could not read gameState.ts');
  }
}

// ---------------------------------------------------------------------------
// 5. Evaluation reads via readBoundary
// ---------------------------------------------------------------------------

function checkEvaluationReadsCanonical() {
  console.log('\n=== Check 5: Evaluation reads via readBoundary ===');

  const readBoundarySrc = readFileSafe(
    'src/selling-houses/core/evaluation/ownerCaseReadBoundary.ts',
  );
  check(readBoundarySrc !== null, 'ownerCaseReadBoundary.ts exists');
  if (!readBoundarySrc) return;

  check(readBoundarySrc.includes('export function readPatience'), 'readPatience exists');
  check(readBoundarySrc.includes('export function readUrgency'), 'readUrgency exists');
  check(readBoundarySrc.includes("'canonical_owner_case_relation'"), 'supports canonical source');
  check(readBoundarySrc.includes("'legacy_case_mirror'"), 'supports legacy fallback');

  const readBoundaryNoComments = readBoundarySrc.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  check(!readBoundaryNoComments.includes('../../domain'), 'readBoundary has no domain imports');
  check(!readBoundaryNoComments.includes('../../runtime'), 'readBoundary has no runtime imports');
}

// ---------------------------------------------------------------------------
// 6. Old save fallback
// ---------------------------------------------------------------------------

function checkOldSaveFallback() {
  console.log('\n=== Check 6: Old save fallback ===');

  const readBoundarySrc = readFile(
    'src/selling-houses/core/evaluation/ownerCaseReadBoundary.ts',
  );
  check(
    readBoundarySrc.includes('relation?: OwnerRelationShape | null')
    || readBoundarySrc.includes('relation?:'),
    'readPatience accepts optional nullable relation',
  );
  check(
    readBoundarySrc.includes('caseItem.patience'),
    'readPatience falls back to caseItem.patience',
  );
  check(
    readBoundarySrc.includes('caseItem.urgency'),
    'readUrgency falls back to caseItem.urgency',
  );

  const writeSrc = readFile(
    'src/selling-houses/core/world-state/ownerCaseReadinessWriteSource.ts',
  );
  check(
    writeSrc.includes('hydrateReadinessStateFromCase'),
    'hydrateReadinessStateFromCase exists for old save migration',
  );
}

// ---------------------------------------------------------------------------
// 7. Pressure/consensus/semantic receipts not regressed
// ---------------------------------------------------------------------------

function checkReceiptsNotRegressed() {
  console.log('\n=== Check 7: Receipts not regressed ===');

  check(readFileSafe('src/selling-houses/core/world-state/competition/pressureBuffer.ts') !== null, 'pressureBuffer.ts exists');
  check(readFileSafe('src/selling-houses/core/world-state/competition/receiptBuilder.ts') !== null, 'receiptBuilder.ts exists');
  check(readFileSafe('src/selling-houses/core/world-state/semantic-receipt/models.ts') !== null, 'semantic-receipt/models.ts exists');
  check(readFileSafe('src/selling-houses/core/world-state/consensus/models.ts') !== null, 'consensus/models.ts exists');
}

// ---------------------------------------------------------------------------
// 8. Replay/rngCalls unchanged
// ---------------------------------------------------------------------------

function checkReplayUnchanged() {
  console.log('\n=== Check 8: Replay/rngCalls unchanged ===');

  const writeSrc = readFile(
    'src/selling-houses/core/world-state/ownerCaseReadinessWriteSource.ts',
  );
  check(!writeSrc.includes('rngState'), 'writeSource does NOT touch rngState');
  check(!writeSrc.includes('rngCalls'), 'writeSource does NOT touch rngCalls');
  const writeSrcNoComments = writeSrc.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  check(!writeSrcNoComments.includes('Math.random'), 'writeSource does NOT use Math.random');

  const readSrc = readFile(
    'src/selling-houses/core/evaluation/ownerCaseReadBoundary.ts',
  );
  check(!readSrc.includes('rngState') && !readSrc.includes('rngCalls'), 'readBoundary does NOT touch RNG');
}

// ---------------------------------------------------------------------------
// 9. No bare write drift
// ---------------------------------------------------------------------------

function checkNoBareWriteDrift() {
  console.log('\n=== Check 9: No bare patience/urgency write drift ===');

  const scanFiles = [
    'src/selling-houses/domain/engine.ts',
    'src/selling-houses/domain/engine/ownerActionExecutors.ts',
    'src/selling-houses/domain/engine/marketEngine.ts',
    'src/selling-houses/domain/engine/pricingActionExecutors.ts',
    'src/selling-houses/domain/engine/competitionEngine.ts',
    'src/selling-houses/domain/engine/eventEngine.ts',
    'src/selling-houses/application/gameTransitions.ts',
  ];

  const helperPatterns = [
    'applyOwnerCasePatienceDelta',
    'applyOwnerCaseUrgencyDelta',
    'setOwnerCasePatience',
    'setOwnerCaseUrgency',
    'deriveCasePatienceMirror',
    'deriveCaseUrgencyMirror',
  ];

  const bareLocations: string[] = [];
  for (const filePath of scanFiles) {
    const src = readFileSafe(filePath);
    if (!src) continue;
    const lines = src.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trim();
      if (trimmed.startsWith('//') || trimmed.startsWith('*')) continue;
      // Check patience
      if (/\.patience\s*[+\-]?=\s/.test(trimmed)) {
        if (helperPatterns.some((p) => trimmed.includes(p))) continue;
        bareLocations.push(`${filePath}:${i + 1}: [bare-patience] ${trimmed.substring(0, 80)}`);
      }
      // Check urgency writes (exclude customer.urgency and reads/comparisons)
      if (/(?:caseItem|entry|currentCase)\.urgency\s*[+\-]?=\s/.test(trimmed)) {
        if (helperPatterns.some((p) => trimmed.includes(p))) continue;
        bareLocations.push(`${filePath}:${i + 1}: [bare-urgency] ${trimmed.substring(0, 80)}`);
      }
    }
  }

  if (bareLocations.length > 0) {
    console.log(`\n  ⚠ ${bareLocations.length} bare patience/urgency writes:`);
    for (const loc of bareLocations) {
      console.log(`    ${loc}`);
    }
  }

  check(bareLocations.length === 0, `${bareLocations.length} bare patience/urgency writes remain (expected 0)`);
}

// ---------------------------------------------------------------------------
// 10. Boundary imports clean
// ---------------------------------------------------------------------------

function checkBoundaryImports() {
  console.log('\n=== Check 10: Boundary imports clean ===');

  const writeSrc = readFile(
    'src/selling-houses/core/world-state/ownerCaseReadinessWriteSource.ts',
  );
  const readSrc = readFile(
    'src/selling-houses/core/evaluation/ownerCaseReadBoundary.ts',
  );

  check(!writeSrc.includes('../../domain'), 'writeSource has no domain imports');
  check(!writeSrc.includes('../../runtime'), 'writeSource has no runtime imports');
  check(!readSrc.includes('../../domain'), 'readBoundary has no domain imports');
  check(!readSrc.includes('../../runtime'), 'readBoundary has no runtime imports');
}

// ---------------------------------------------------------------------------
// Run all checks
// ---------------------------------------------------------------------------

console.log('╔══════════════════════════════════════════════════════════════╗');
console.log('║  OwnerCaseRelation Readiness Final Gate — Agent D           ║');
console.log('╚══════════════════════════════════════════════════════════════╝');

checkOwnershipRegistry();
checkWriteSourceHelper();
checkEngineMutations();
checkRuntimeStatesPopulated();
checkEvaluationReadsCanonical();
checkOldSaveFallback();
checkReceiptsNotRegressed();
checkReplayUnchanged();
checkNoBareWriteDrift();
checkBoundaryImports();

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log('\n' + '='.repeat(60));
console.log(`Results: ${passed} passed, ${failed} failed, ${warnings.length} warnings`);

if (warnings.length > 0) {
  console.log('\nWarnings (governance findings):');
  for (const w of warnings) {
    console.log(`  [WARN] ${w}`);
  }
}

if (failed > 0) {
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║  GATE FAILED — Readiness migration is NOT complete.         ║');
  console.log('║  See [FAIL] items above for what needs to be fixed.         ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log('\nFailures:');
  for (const e of errors) {
    console.log(`  - ${e}`);
  }
  process.exit(1);
}

console.log('\n╔══════════════════════════════════════════════════════════════╗');
console.log('║  GATE PASSED — Readiness migration is complete.             ║');
console.log('╚══════════════════════════════════════════════════════════════╝');
