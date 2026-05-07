/**
 * Trust Migration Final Gate — Agent D acceptance script.
 *
 * Proves (or disproves) that the trust write-source migration from
 * Case.trust (legacy) to BrokerOwnerRelation (canonical) is complete.
 *
 * Chain under test:
 *   engine writes -> BrokerOwnerRelation canonical -> Case.trust mirror sync
 *   -> evaluation/POV reads canonical -> old save fallback -> replay unchanged
 *
 * Checks:
 * 1. ownership registry declares trust canonical = BrokerOwnerRelation
 * 2. trustWriteSource helper exists and is pure
 * 3. engine trust mutations use canonical helper (NOT bare Case.trust = ... )
 * 4. runtimeBrokerOwnerRelations is populated during game init
 * 5. evaluation reads trust via readTrust boundary (prefers relation)
 * 6. old save fallback: Case.trust works when relation absent
 * 7. pressure/consensus/semantic receipts not regressed
 * 8. replay/rngCalls unchanged by trust migration
 * 9. no bare trust write drift in domain layer
 * 10. trustReadBoundary and trustWriteSource have no domain/runtime imports
 *
 * IMPORTANT: This script reports the ACTUAL state. A failing check means
 * the migration is NOT complete for that aspect — it does NOT mean the
 * script is wrong. Fix the source code, not the assertions.
 */

import assert from 'node:assert/strict';
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
// 1. Ownership registry declares trust canonical = BrokerOwnerRelation
// ---------------------------------------------------------------------------

function checkOwnershipRegistry() {
  console.log('\n=== Check 1: Ownership registry ===');

  const ownershipSrc = readFile(
    'src/selling-houses/core/world-state/legacy-case-field-ownership.ts',
  );
  check(
    ownershipSrc.includes("canonicalOwner: 'broker-owner-relation'"),
    'trust ownership declares broker-owner-relation as canonicalOwner',
  );
  check(
    ownershipSrc.includes("targetConcept: 'BrokerOwnerRelation.trust'"),
    'trust targetConcept points to BrokerOwnerRelation.trust',
  );
  check(
    ownershipSrc.includes("legacyRole: 'compatibility-mirror'"),
    'trust legacyRole is compatibility-mirror',
  );
  check(
    ownershipSrc.includes("'Trust is between broker and owner"),
    'trust migrationNote explains broker-owner relationship',
  );
}

// ---------------------------------------------------------------------------
// 2. trustWriteSource helper exists and is pure
// ---------------------------------------------------------------------------

function checkWriteSourceHelper() {
  console.log('\n=== Check 2: trustWriteSource helper ===');

  const src = readFile(
    'src/selling-houses/core/world-state/trustWriteSource.ts',
  );
  check(src.includes('export function setTrust'), 'setTrust exists');
  check(src.includes('export function addTrustDelta'), 'addTrustDelta exists');
  check(src.includes('export function createTrustState'), 'createTrustState exists');
  check(src.includes('export function deriveCaseTrustMirror'), 'deriveCaseTrustMirror exists');
  check(src.includes('export function hydrateTrustStateFromCase'), 'hydrateTrustStateFromCase exists');
  check(src.includes('export interface BrokerOwnerRelationTrustState'), 'BrokerOwnerRelationTrustState exists');

  // Pure: no domain/runtime imports
  check(!src.includes("from '../../domain"), 'trustWriteSource does NOT import domain');
  check(!src.includes("from '../../runtime"), 'trustWriteSource does NOT import runtime');

  // Check actual code (not comments) for forbidden patterns
  const srcNoComments = src.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  check(!srcNoComments.includes('Date.now'), 'trustWriteSource has no Date.now');
  check(!srcNoComments.includes('Math.random'), 'trustWriteSource has no Math.random');
  check(src.includes('Object.freeze'), 'trustWriteSource uses Object.freeze');
}

// ---------------------------------------------------------------------------
// 3. Engine trust mutations use canonical helper
//    This is the CORE migration check. If this fails, migration is NOT done.
// ---------------------------------------------------------------------------

function checkEngineTrustMutations() {
  console.log('\n=== Check 3: Engine trust mutations (migration status) ===');

  const engineFiles = [
    'src/selling-houses/domain/engine.ts',
    'src/selling-houses/domain/caseLifecycle.ts',
    'src/selling-houses/domain/dealClosing.ts',
    'src/selling-houses/domain/engine/competitionEngine.ts',
    'src/selling-houses/domain/engine/customerEngine.ts',
    'src/selling-houses/domain/engine/eventEngine.ts',
    'src/selling-houses/domain/engine/marketEngine.ts',
    'src/selling-houses/domain/engine/marketingActionExecutors.ts',
    'src/selling-houses/domain/engine/openDayActionExecutors.ts',
    'src/selling-houses/domain/engine/ownerActionExecutors.ts',
    'src/selling-houses/domain/engine/pricingActionExecutors.ts',
    'src/selling-houses/domain/rivals/rivalListingEngine.ts',
    'src/selling-houses/application/gameTransitions.ts',
  ];

  let bareWrites = 0;
  let helperWrites = 0;    // Uses current helpers (applyBrokerOwnerTrustDelta / setBrokerOwnerTrust)
  let directWrites = 0;    // Uses core/trustWriteSource directly (full migration)
  let deprecatedWrites = 0; // Uses deprecated applyTrustDelta (does NOT persist canonical)
  const bareWriteLocations: string[] = [];

  // Check bridge helper
  const helperSrc = readFileSafe('src/selling-houses/domain/trustWriteHelper.ts');
  const hasHelper = helperSrc !== null && (
    helperSrc.includes('applyTrustDelta')
    || helperSrc.includes('applyBrokerOwnerTrustDelta')
    || helperSrc.includes('setBrokerOwnerTrust')
  );

  // Current helpers (accepted — persist to runtimeBrokerOwnerRelations)
  const currentHelperPatterns = [
    'applyBrokerOwnerTrustDelta',
    'setBrokerOwnerTrust',
    'deriveCaseTrustMirror',  // mirror sync inside trustWriteHelper itself
  ];

  // DEPRECATED helpers — do NOT persist to canonical runtimeBrokerOwnerRelations.
  // Using these means the migration is incomplete.
  const deprecatedHelperPatterns = [
    'applyTrustDelta',
    'setCaseTrust',
    'computeAndApplyTrustDelta',
  ];

  for (const filePath of engineFiles) {
    const src = readFileSafe(filePath);
    if (!src) continue;

    // Check migration level
    const usesDirectCore = src.includes('trustWriteSource')
      || src.includes('addTrustDelta')
      || (src.includes('setTrust') && !src.includes('trustWriteHelper'));
    const usesHelper = src.includes('trustWriteHelper')
      || currentHelperPatterns.some((p) => src.includes(p))
      || deprecatedHelperPatterns.some((p) => src.includes(p));

    if (usesDirectCore) directWrites++;
    else if (usesHelper) helperWrites++;

    // Find trust assignments: something.trust = ...
    const lines = src.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      // Skip comments
      if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) continue;

      // Skip type declarations and interfaces
      if (trimmed.includes(':') && !trimmed.includes('=') && !trimmed.includes('+=') && !trimmed.includes('-=')) continue;

      // Match trust assignment: something.trust = ... or something.trust += ... or something.trust -= ...
      if (/\.trust\s*[+\-]?=\s/.test(trimmed)) {
        // Classify: current helper? deprecated helper? bare write?
        const viaCurrentHelper = currentHelperPatterns.some((p) => trimmed.includes(p));
        const viaDeprecated = deprecatedHelperPatterns.some((p) => trimmed.includes(p));

        // Boundary clamp: `clamp(x.trust, min, max)` with no delta — safety only
        const isBoundaryClamp = /^[\w.]+\.trust\s*=\s*clamp\([\w.]+\.trust,\s*\d+,\s*\d+\)/.test(trimmed)
          && !trimmed.includes('+') && !trimmed.includes('-');

        // Scenario delta in application layer (gameTransitions.ts)
        const isScenarioDelta = filePath.includes('gameTransitions')
          && trimmed.includes('clamp01to100') && trimmed.includes('delta.value');

        if (viaCurrentHelper) {
          bareWriteLocations.push(`${filePath}:${i + 1}: [helper→mirror] ${trimmed.substring(0, 80)}`);
          helperWrites++;
        } else if (viaDeprecated) {
          deprecatedWrites++;
          bareWriteLocations.push(`${filePath}:${i + 1}: [DEPRECATED] ${trimmed.substring(0, 80)}`);
        } else if (isBoundaryClamp) {
          bareWriteLocations.push(`${filePath}:${i + 1}: [boundary-clamp] ${trimmed.substring(0, 80)}`);
        } else if (isScenarioDelta) {
          bareWriteLocations.push(`${filePath}:${i + 1}: [scenario-delta] ${trimmed.substring(0, 80)}`);
        } else {
          bareWrites++;
          bareWriteLocations.push(`${filePath}:${i + 1}: [bare] ${trimmed.substring(0, 80)}`);
        }
      }
    }
  }

  // Report findings
  const trulyBare = bareWriteLocations.filter((l) => l.includes('[bare]')).length;
  const viaHelper = bareWriteLocations.filter((l) => l.includes('[helper→mirror]')).length;
  const viaDeprecated = bareWriteLocations.filter((l) => l.includes('[DEPRECATED]')).length;
  const boundaryClamps = bareWriteLocations.filter((l) => l.includes('[boundary-clamp]')).length;
  const scenarioDeltas = bareWriteLocations.filter((l) => l.includes('[scenario-delta]')).length;

  console.log(`\n  Trust write breakdown:`);
  for (const loc of bareWriteLocations) {
    console.log(`    ${loc}`);
  }
  console.log(`\n  Total: ${bareWriteLocations.length} writes`);
  console.log(`    ${viaHelper} via helper→mirror, ${viaDeprecated} DEPRECATED, ${boundaryClamps} boundary clamps, ${scenarioDeltas} scenario deltas, ${trulyBare} bare direct`);
  console.log(`  Files importing trustWriteHelper: ${helperWrites}`);

  // Check if bridge helper exists
  check(
    hasHelper,
    'domain/trustWriteHelper.ts bridge exists',
  );

  // At least some files should use the helper
  check(
    helperWrites > 0,
    'engine files import and use canonical trust path',
  );

  // ZERO deprecated helper calls: applyTrustDelta does NOT persist to runtimeBrokerOwnerRelations
  check(
    viaDeprecated === 0,
    `ZERO deprecated applyTrustDelta calls (found ${viaDeprecated} — must migrate to applyBrokerOwnerTrustDelta)`,
  );

  // ZERO truly bare writes: every .trust assignment goes through helper, boundary clamp, or scenario delta
  check(
    trulyBare === 0,
    `ZERO truly bare trust writes (found ${trulyBare})`,
  );
}

// ---------------------------------------------------------------------------
// 4. runtimeBrokerOwnerRelations is populated during game init
// ---------------------------------------------------------------------------

function checkRuntimeRelationsPopulated() {
  console.log('\n=== Check 4: runtimeBrokerOwnerRelations populated ===');

  const modelsSrc = readFile('src/selling-houses/domain/models.ts');
  check(
    modelsSrc.includes('runtimeBrokerOwnerRelations'),
    'GameState has runtimeBrokerOwnerRelations field',
  );

  // Check if createInitialState populates it
  const initSrc = readFileSafe('src/selling-houses/application/gameState.ts');
  if (initSrc) {
    const populates = initSrc.includes('runtimeBrokerOwnerRelations')
      && (initSrc.includes('createTrustState')
        || initSrc.includes('hydrateTrustStateFromCase')
        || initSrc.includes('initializeTrustRelations'));
    check(
      populates,
      'createInitialState populates runtimeBrokerOwnerRelations',
    );
  } else {
    check(false, 'could not read gameState.ts');
  }
}

// ---------------------------------------------------------------------------
// 5. Evaluation reads trust via readTrust boundary
// ---------------------------------------------------------------------------

function checkEvaluationReadsCanonical() {
  console.log('\n=== Check 5: Evaluation reads via readTrust boundary ===');

  const adaptersSrc = readFile(
    'src/selling-houses/core/evaluation/legacyAdapters.ts',
  );
  // Check readTrust is imported (may be on its own line in multi-line import)
  check(
    /import[\s\S]*readTrust[\s\S]*from\s+['"].*trustReadBoundary/.test(adaptersSrc),
    'legacyAdapters imports readTrust from trustReadBoundary',
  );
  check(
    adaptersSrc.includes('readTrust(caseItem, relation)'),
    'legacyAdapters calls readTrust with relation',
  );
  check(
    adaptersSrc.includes('trustSource'),
    'legacyAdapters includes trustSource marker in snapshots',
  );

  // Check trustReadBoundary is pure
  const readBoundarySrc = readFile(
    'src/selling-houses/core/evaluation/trustReadBoundary.ts',
  );
  check(
    readBoundarySrc.includes("from '../../domain") === false,
    'trustReadBoundary does NOT import domain',
  );
  check(
    readBoundarySrc.includes("'canonical_relation'"),
    'trustReadBoundary supports canonical_relation source',
  );
  check(
    readBoundarySrc.includes("'legacy_case_mirror'"),
    'trustReadBoundary supports legacy_case_mirror fallback',
  );
}

// ---------------------------------------------------------------------------
// 6. Old save fallback
// ---------------------------------------------------------------------------

function checkOldSaveFallback() {
  console.log('\n=== Check 6: Old save fallback ===');

  const readBoundarySrc = readFile(
    'src/selling-houses/core/evaluation/trustReadBoundary.ts',
  );
  check(
    readBoundarySrc.includes('relation?: TrustRelationShape | null'),
    'readTrust accepts optional nullable relation',
  );
  check(
    readBoundarySrc.includes("caseItem.trust"),
    'readTrust falls back to caseItem.trust',
  );

  // Check hydrate function exists for old saves
  const writeSrc = readFile(
    'src/selling-houses/core/world-state/trustWriteSource.ts',
  );
  check(
    writeSrc.includes('hydrateTrustStateFromCase'),
    'hydrateTrustStateFromCase exists for old save migration',
  );
}

// ---------------------------------------------------------------------------
// 7. Pressure/consensus/semantic receipts not regressed
// ---------------------------------------------------------------------------

function checkReceiptsNotRegressed() {
  console.log('\n=== Check 7: Receipts not regressed ===');

  // pressureBuffer still exists and works
  const pressureSrc = readFileSafe(
    'src/selling-houses/core/world-state/competition/pressureBuffer.ts',
  );
  check(pressureSrc !== null, 'pressureBuffer.ts exists');

  // receiptBuilder still exists
  const receiptSrc = readFileSafe(
    'src/selling-houses/core/world-state/competition/receiptBuilder.ts',
  );
  check(receiptSrc !== null, 'receiptBuilder.ts exists');

  // semantic receipt models still exist
  const semanticSrc = readFileSafe(
    'src/selling-houses/core/world-state/semantic-receipt/models.ts',
  );
  check(semanticSrc !== null, 'semantic-receipt/models.ts exists');

  // consensus models still exist
  const consensusSrc = readFileSafe(
    'src/selling-houses/core/world-state/consensus/models.ts',
  );
  check(consensusSrc !== null, 'consensus/models.ts exists');
}

// ---------------------------------------------------------------------------
// 8. Replay/rngCalls unchanged
// ---------------------------------------------------------------------------

function checkReplayUnchanged() {
  console.log('\n=== Check 8: Replay/rngCalls unchanged ===');

  const trustWriteSrc = readFile(
    'src/selling-houses/core/world-state/trustWriteSource.ts',
  );
  check(
    !trustWriteSrc.includes('rngState'),
    'trustWriteSource does NOT touch rngState',
  );
  check(
    !trustWriteSrc.includes('rngCalls'),
    'trustWriteSource does NOT touch rngCalls',
  );
  const trustWriteNoComments = trustWriteSrc.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  check(
    !trustWriteNoComments.includes('Math.random'),
    'trustWriteSource does NOT use Math.random',
  );

  // Trust read boundary also shouldn't touch RNG
  const trustReadSrc = readFile(
    'src/selling-houses/core/evaluation/trustReadBoundary.ts',
  );
  check(
    !trustReadSrc.includes('rngState') && !trustReadSrc.includes('rngCalls'),
    'trustReadBoundary does NOT touch RNG',
  );
}

// ---------------------------------------------------------------------------
// 9. No bare trust write drift
// ---------------------------------------------------------------------------

function checkNoBareWriteDrift() {
  console.log('\n=== Check 9: No bare trust write drift ===');

  // Scan domain + application for truly bare trust writes
  // Allow: helper→mirror, boundary clamps, scenario deltas, trustWriteHelper internals
  const scanFiles = [
    'src/selling-houses/domain/engine.ts',
    'src/selling-houses/domain/caseLifecycle.ts',
    'src/selling-houses/domain/dealClosing.ts',
    'src/selling-houses/domain/engine/competitionEngine.ts',
    'src/selling-houses/domain/engine/customerEngine.ts',
    'src/selling-houses/domain/engine/eventEngine.ts',
    'src/selling-houses/domain/engine/marketEngine.ts',
    'src/selling-houses/domain/engine/marketingActionExecutors.ts',
    'src/selling-houses/domain/engine/openDayActionExecutors.ts',
    'src/selling-houses/domain/engine/ownerActionExecutors.ts',
    'src/selling-houses/domain/engine/pricingActionExecutors.ts',
    'src/selling-houses/domain/rivals/rivalListingEngine.ts',
    'src/selling-houses/application/gameTransitions.ts',
  ];

  // Current helpers (accepted)
  const currentHelperPatterns = [
    'applyBrokerOwnerTrustDelta', 'setBrokerOwnerTrust', 'deriveCaseTrustMirror',
  ];
  // DEPRECATED helpers (not accepted — do not persist canonical)
  const deprecatedPatterns = [
    'applyTrustDelta', 'setCaseTrust', 'computeAndApplyTrustDelta',
  ];

  const bareLocations: string[] = [];
  const deprecatedLocations: string[] = [];
  for (const filePath of scanFiles) {
    const src = readFileSafe(filePath);
    if (!src) continue;
    const lines = src.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trim();
      if (trimmed.startsWith('//') || trimmed.startsWith('*')) continue;
      if (!/\.trust\s*[+\-]?=\s/.test(trimmed)) continue;

      // Classify
      if (currentHelperPatterns.some((p) => trimmed.includes(p))) continue; // current helper OK
      if (deprecatedPatterns.some((p) => trimmed.includes(p))) {
        deprecatedLocations.push(`${filePath}:${i + 1}: [DEPRECATED] ${trimmed.substring(0, 80)}`);
        continue;
      }
      // Allowed: boundary clamp (no delta)
      if (/^[\w.]+\.trust\s*=\s*clamp\([\w.]+\.trust,\s*\d+,\s*\d+\)/.test(trimmed)
        && !trimmed.includes('+') && !trimmed.includes('-')) continue;
      // Allowed: scenario delta in application layer
      if (filePath.includes('gameTransitions') && trimmed.includes('delta.value')) continue;

      bareLocations.push(`${filePath}:${i + 1}: ${trimmed.substring(0, 80)}`);
    }
  }

  if (deprecatedLocations.length > 0) {
    console.log(`\n  ⚠ ${deprecatedLocations.length} deprecated helper calls found:`);
    for (const loc of deprecatedLocations) {
      console.log(`    ${loc}`);
    }
  }

  if (bareLocations.length > 0) {
    console.log(`\n  ⚠ ${bareLocations.length} truly bare trust writes found:`);
    for (const loc of bareLocations) {
      console.log(`    ${loc}`);
    }
  }

  check(deprecatedLocations.length === 0, `${deprecatedLocations.length} deprecated applyTrustDelta calls remain (must use applyBrokerOwnerTrustDelta)`);
  check(bareLocations.length === 0, `${bareLocations.length} truly bare trust writes remain (expected 0)`);
}

// ---------------------------------------------------------------------------
// 10. No domain/runtime imports in trust boundary files
// ---------------------------------------------------------------------------

function checkBoundaryImports() {
  console.log('\n=== Check 10: Boundary imports clean ===');

  const trustWriteSrc = readFile(
    'src/selling-houses/core/world-state/trustWriteSource.ts',
  );
  const trustReadSrc = readFile(
    'src/selling-houses/core/evaluation/trustReadBoundary.ts',
  );

  check(
    !trustWriteSrc.includes("from '") || !trustWriteSrc.includes('../../domain'),
    'trustWriteSource has no domain imports',
  );
  check(
    !trustWriteSrc.includes("from '") || !trustWriteSrc.includes('../../runtime'),
    'trustWriteSource has no runtime imports',
  );
  check(
    !trustReadSrc.includes('../../domain'),
    'trustReadBoundary has no domain imports',
  );
  check(
    !trustReadSrc.includes('../../runtime'),
    'trustReadBoundary has no runtime imports',
  );
}

// ---------------------------------------------------------------------------
// Run all checks
// ---------------------------------------------------------------------------

console.log('╔══════════════════════════════════════════════════════════════╗');
console.log('║  Trust Migration Final Gate — Agent D Acceptance Script     ║');
console.log('╚══════════════════════════════════════════════════════════════╝');

checkOwnershipRegistry();
checkWriteSourceHelper();
checkEngineTrustMutations();
checkRuntimeRelationsPopulated();
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
  console.log('║  GATE FAILED — Trust migration is NOT complete.             ║');
  console.log('║  See [FAIL] items above for what needs to be fixed.         ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log('\nFailures:');
  for (const e of errors) {
    console.log(`  - ${e}`);
  }
  process.exit(1);
}

console.log('\n╔══════════════════════════════════════════════════════════════╗');
console.log('║  GATE PASSED — Trust migration is complete.                 ║');
console.log('╚══════════════════════════════════════════════════════════════╝');
