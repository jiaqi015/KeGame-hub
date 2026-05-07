/**
 * Consensus / ContractFact / OpportunityClosureSet Write-Source Contract.
 *
 * Proves the write-source foundation for deal consensus is:
 * - Pure (no domain/runtime imports in core)
 * - Deterministic (no Date.now, Math.random, rngCalls)
 * - Frozen (Object.freeze on all returned objects)
 * - Complete (all exported write functions exist)
 * - Compatible (legacy ClosedDealRecord mirror preserved)
 * - Migration-ready (pendingClosing* → ConsensusFormation direction documented)
 *
 * Checks:
 *  1. writeSource.ts exists and exports canonical types
 *  2. writeSource.ts is pure (no domain/runtime imports)
 *  3. writeSource.ts has no Date.now / Math.random / rngCalls
 *  4. writeSource.ts uses Object.freeze
 *  5. writeSource.ts exports expected write functions
 *  6. writeSource.ts exports deterministic ID builders
 *  7. domain/consensusFormationHelper.ts exists and imports from core
 *  8. consensusFormationHelper.ts handles GameState persistence
 *  9. consensusFormationHelper.ts re-exports core types
 * 10. Legacy ClosedDealRecord mirror derivation exists
 * 11. consensus/index.ts exports writeSource
 * 12. ConsensusFormation stage lifecycle is complete (9 stages)
 * 13. ContractFactState has required fields
 * 14. OpportunityClosureSetState has required fields
 * 15. Migration direction documented (pendingClosing* → ConsensusFormation)
 * 16. npm run build passes
 */

import { execSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

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
  return readFileSync(join(import.meta.dirname!, '..', path), 'utf-8');
}

function readFileSafe(path: string): string | null {
  try {
    return readFile(path);
  } catch {
    return null;
  }
}

function fileExists(path: string): boolean {
  return existsSync(join(import.meta.dirname!, '..', path));
}

function runCommand(cmd: string): { ok: boolean; output: string } {
  try {
    const output = execSync(cmd, { cwd: join(import.meta.dirname!, '..'), encoding: 'utf-8', timeout: 60_000, stdio: ['pipe', 'pipe', 'pipe'] });
    return { ok: true, output };
  } catch (err: any) {
    return { ok: false, output: err.stderr || err.stdout || String(err) };
  }
}

const WS_PATH = 'src/selling-houses/core/world-state/consensus/writeSource.ts';
const HELPER_PATH = 'src/selling-houses/domain/consensusFormationHelper.ts';

// ---------------------------------------------------------------------------
// 1. writeSource.ts exists and exports canonical types
// ---------------------------------------------------------------------------

function checkWriteSourceExists() {
  console.log('\n=== Check 1: writeSource.ts exists and exports types ===');

  const src = readFileSafe(WS_PATH);
  check(src !== null, `${WS_PATH} exists`);

  if (!src) return;

  check(src.includes('ConsensusFormationState'), 'ConsensusFormationState defined');
  check(src.includes('ContractFactState'), 'ContractFactState defined');
  check(src.includes('OpportunityClosureSetState'), 'OpportunityClosureSetState defined');
  check(src.includes('ConsensusFormationRecord'), 'ConsensusFormationRecord defined');
  check(src.includes('ConsensusStage'), 'ConsensusStage type defined');
}

// ---------------------------------------------------------------------------
// 2. writeSource.ts is pure
// ---------------------------------------------------------------------------

function checkPurity() {
  console.log('\n=== Check 2: writeSource.ts purity ===');

  const src = readFileSafe(WS_PATH);
  if (!src) { check(false, 'writeSource.ts not found'); return; }

  check(!src.includes("from '../../../domain"), 'no domain imports');
  check(!src.includes("from '../../../runtime"), 'no runtime imports');
  check(!src.includes("from '../../domain"), 'no domain imports (relative)');
  check(!src.includes("from '../../runtime"), 'no runtime imports (relative)');
}

// ---------------------------------------------------------------------------
// 3. No Date.now / Math.random / rngCalls
// ---------------------------------------------------------------------------

function checkDeterministic() {
  console.log('\n=== Check 3: writeSource.ts deterministic ===');

  const src = readFileSafe(WS_PATH);
  if (!src) { check(false, 'writeSource.ts not found'); return; }

  const noComment = src.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  check(!noComment.includes('Date.now'), 'no Date.now');
  check(!noComment.includes('Math.random'), 'no Math.random');
  check(!noComment.includes('rngCalls'), 'no rngCalls');
  check(!noComment.includes('rngState'), 'no rngState');
  check(!noComment.includes('crypto.'), 'no crypto');
}

// ---------------------------------------------------------------------------
// 4. Object.freeze
// ---------------------------------------------------------------------------

function checkFrozen() {
  console.log('\n=== Check 4: writeSource.ts uses Object.freeze ===');

  const src = readFileSafe(WS_PATH);
  if (!src) { check(false, 'writeSource.ts not found'); return; }

  check(src.includes('Object.freeze'), 'uses Object.freeze');
  // Count freeze calls — should be many (one per write function return)
  const freezeCount = (src.match(/Object\.freeze/g) || []).length;
  check(freezeCount >= 10, `at least 10 Object.freeze calls (found ${freezeCount})`);
}

// ---------------------------------------------------------------------------
// 5. Exported write functions
// ---------------------------------------------------------------------------

function checkExports() {
  console.log('\n=== Check 5: writeSource.ts exports ===');

  const src = readFileSafe(WS_PATH);
  if (!src) { check(false, 'writeSource.ts not found'); return; }

  const expectedFns = [
    'createConsensusFormationState',
    'setConsensusStage',
    'setConsensusEvaluation',
    'markConsensusSigned',
    'markConsensusCollapsed',
    'createContractFactState',
    'createOpportunityClosureSetState',
  ];

  for (const fn of expectedFns) {
    check(src.includes(`export function ${fn}`), `exports ${fn}`);
  }
}

// ---------------------------------------------------------------------------
// 6. ID builders
// ---------------------------------------------------------------------------

function checkIdBuilders() {
  console.log('\n=== Check 6: deterministic ID builders ===');

  const src = readFileSafe(WS_PATH);
  if (!src) { check(false, 'writeSource.ts not found'); return; }

  check(src.includes('export function buildConsensusFormationId'), 'exports buildConsensusFormationId');
  check(src.includes('export function buildContractFactId'), 'exports buildContractFactId');
  check(src.includes('export function buildOpportunityClosureSetId'), 'exports buildOpportunityClosureSetId');

  // Verify deterministic format (no randomness)
  const noComment = src.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  check(!noComment.includes('Math.random'), 'ID builders are deterministic');
}

// ---------------------------------------------------------------------------
// 7. domain/consensusFormationHelper.ts exists
// ---------------------------------------------------------------------------

function checkHelperExists() {
  console.log('\n=== Check 7: consensusFormationHelper.ts exists ===');

  const src = readFileSafe(HELPER_PATH);
  check(src !== null, `${HELPER_PATH} exists`);

  if (!src) return;

  check(src.includes('writeSource'), 'imports from core writeSource');
  check(src.includes('ConsensusFormationState'), 'references ConsensusFormationState');
  check(src.includes('ContractFactState'), 'references ContractFactState');
  check(src.includes('OpportunityClosureSetState'), 'references OpportunityClosureSetState');
}

// ---------------------------------------------------------------------------
// 8. Helper handles GameState persistence
// ---------------------------------------------------------------------------

function checkHelperPersistence() {
  console.log('\n=== Check 8: helper handles GameState persistence ===');

  const src = readFileSafe(HELPER_PATH);
  if (!src) { check(false, 'helper not found'); return; }

  check(src.includes('GameState'), 'references GameState');
  check(src.includes('ensureConsensusRuntime'), 'has ensureConsensusRuntime');
  check(src.includes('findConsensusForOpportunity'), 'has findConsensusForOpportunity');
  check(src.includes('ensureConsensusFormation'), 'has ensureConsensusFormation');
  check(src.includes('createContractFactOnState'), 'has createContractFactOnState');
  check(src.includes('createOpportunityClosureOnState'), 'has createOpportunityClosureOnState');
}

// ---------------------------------------------------------------------------
// 9. Helper re-exports core types
// ---------------------------------------------------------------------------

function checkHelperReExports() {
  console.log('\n=== Check 9: helper re-exports core types ===');

  const src = readFileSafe(HELPER_PATH);
  if (!src) { check(false, 'helper not found'); return; }

  check(src.includes("export type {"), 're-exports types');
  check(src.includes('ConsensusFormationState'), 're-exports ConsensusFormationState');
  check(src.includes('ContractFactState'), 're-exports ContractFactState');
  check(src.includes('OpportunityClosureSetState'), 're-exports OpportunityClosureSetState');
}

// ---------------------------------------------------------------------------
// 10. Legacy ClosedDealRecord mirror
// ---------------------------------------------------------------------------

function checkLegacyMirror() {
  console.log('\n=== Check 10: legacy ClosedDealRecord mirror ===');

  const src = readFileSafe(WS_PATH);
  if (!src) { check(false, 'writeSource.ts not found'); return; }

  check(src.includes('deriveLegacyClosedDealMirror'), 'exports deriveLegacyClosedDealMirror');
  check(src.includes('sourceClosedDealId'), 'ContractFactState has sourceClosedDealId');

  const helperSrc = readFileSafe(HELPER_PATH);
  if (helperSrc) {
    check(helperSrc.includes('syncLegacyClosedDealMirror'), 'helper has syncLegacyClosedDealMirror');
    check(helperSrc.includes('deriveLegacyClosedDealMirror'), 'helper uses deriveLegacyClosedDealMirror');
  }
}

// ---------------------------------------------------------------------------
// 11. consensus/index.ts exports writeSource
// ---------------------------------------------------------------------------

function checkIndexExports() {
  console.log('\n=== Check 11: consensus/index.ts exports ===');

  const src = readFileSafe('src/selling-houses/core/world-state/consensus/index.ts');
  check(src !== null, 'consensus/index.ts exists');

  if (!src) return;

  check(src.includes('writeSource'), 'index.ts exports writeSource');
}

// ---------------------------------------------------------------------------
// 12. ConsensusFormation stage lifecycle is complete
// ---------------------------------------------------------------------------

function checkStageLifecycle() {
  console.log('\n=== Check 12: ConsensusFormation stage lifecycle ===');

  const src = readFileSafe(WS_PATH);
  if (!src) { check(false, 'writeSource.ts not found'); return; }

  const expectedStages = [
    'not_started', 'price_gap_visible', 'negotiable_zone',
    'tentative_alignment', 'verbal_acceptance', 'formal_offer',
    'contract_ready', 'signed', 'collapsed',
  ];

  for (const stage of expectedStages) {
    check(src.includes(`'${stage}'`), `stage '${stage}' defined`);
  }
}

// ---------------------------------------------------------------------------
// 13. ContractFactState required fields
// ---------------------------------------------------------------------------

function checkContractFactFields() {
  console.log('\n=== Check 13: ContractFactState required fields ===');

  const src = readFileSafe(WS_PATH);
  if (!src) { check(false, 'writeSource.ts not found'); return; }

  const requiredFields = [
    'contractId', 'consensusId', 'brokeredOpportunityId',
    'caseId', 'customerId', 'dealPrice', 'dealType',
    'signedDay', 'sourceClosedDealId',
  ];

  for (const field of requiredFields) {
    check(src.includes(`readonly ${field}:`), `ContractFactState has ${field}`);
  }
}

// ---------------------------------------------------------------------------
// 14. OpportunityClosureSetState required fields
// ---------------------------------------------------------------------------

function checkClosureSetFields() {
  console.log('\n=== Check 14: OpportunityClosureSetState required fields ===');

  const src = readFileSafe(WS_PATH);
  if (!src) { check(false, 'writeSource.ts not found'); return; }

  const requiredFields = [
    'closureSetId', 'contractId', 'wonOpportunityId',
    'closedOpportunityIds', 'losingCustomerIds', 'reason', 'day',
  ];

  for (const field of requiredFields) {
    check(src.includes(`readonly ${field}:`), `OpportunityClosureSetState has ${field}`);
  }
}

// ---------------------------------------------------------------------------
// 15. Migration direction documented
// ---------------------------------------------------------------------------

function checkMigrationDirection() {
  console.log('\n=== Check 15: migration direction documented ===');

  const src = readFileSafe(WS_PATH);
  if (!src) { check(false, 'writeSource.ts not found'); return; }

  // Check that pendingClosing migration direction is documented
  check(src.includes('pendingClosing'), 'writeSource references pendingClosing migration');
  check(src.includes('ConsensusFormation'), 'writeSource references ConsensusFormation');

  // Check field ownership registry
  const ownershipSrc = readFileSafe('src/selling-houses/core/world-state/legacy-opportunity-field-ownership.ts');
  if (ownershipSrc) {
    check(ownershipSrc.includes('consensus-formation'), 'field ownership marks pendingClosing as consensus-formation');
    check(ownershipSrc.includes('ConsensusFormationV0'), 'field ownership references ConsensusFormationV0');
  }
}

// ---------------------------------------------------------------------------
// 16. npm run build
// ---------------------------------------------------------------------------

function checkBuild() {
  console.log('\n=== Check 16: npm run build ===');

  const result = runCommand('npm run build');
  check(result.ok, 'npm run build passes');
  if (!result.ok) {
    const lines = result.output.split('\n').slice(-15);
    for (const line of lines) {
      if (line.trim()) console.log(`    ${line.trim()}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Run all checks
// ---------------------------------------------------------------------------

console.log('╔══════════════════════════════════════════════════════════════╗');
console.log('║  Consensus / ContractFact Write-Source Contract — Agent D   ║');
console.log('╚══════════════════════════════════════════════════════════════╝');

checkWriteSourceExists();
checkPurity();
checkDeterministic();
checkFrozen();
checkExports();
checkIdBuilders();
checkHelperExists();
checkHelperPersistence();
checkHelperReExports();
checkLegacyMirror();
checkIndexExports();
checkStageLifecycle();
checkContractFactFields();
checkClosureSetFields();
checkMigrationDirection();
checkBuild();

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log('\n' + '='.repeat(60));
console.log(`Results: ${passed} passed, ${failed} failed, ${warnings.length} warnings`);

if (warnings.length > 0) {
  console.log('\nWarnings:');
  for (const w of warnings) {
    console.log(`  [WARN] ${w}`);
  }
}

if (failed > 0) {
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║  CONTRACT FAILED — Consensus write-source has gaps.         ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log('\nFailures:');
  for (const e of errors) {
    console.log(`  - ${e}`);
  }
  process.exit(1);
}

console.log('\n╔══════════════════════════════════════════════════════════════╗');
console.log('║  CONTRACT PASSED — Consensus write-source foundation ready. ║');
console.log('║  ConsensusFormation / ContractFact / ClosureSet complete.   ║');
console.log('╚══════════════════════════════════════════════════════════════╝');
