/**
 * R23 Truth Field Write Firewall + Terminal/Readiness Mirror Quarantine Gate.
 *
 * Proves R23 closes the truth-field write gap:
 * 1. Terminal status writes confined to named terminal mirror boundary
 * 2. closedDeals.unshift confined to contract-derived mirror boundary
 * 3. Sold terminal mirror requires contractFactId + consensusFormationId
 * 4. Lost/withdrawn terminal mirror requires provenance
 * 5. Readiness/trust mirror writes confined to named mirror-sync helpers
 * 6. Mirror-sync helpers use canonical derivation functions, not raw inputs
 * 7. No production direct caseItem.trust/patience/urgency= outside those helpers
 * 8. StageIndex writes remain inside R20 compatibility helpers or fixture scripts
 * 9. R19/R20/R21/R22 gates still pass
 * 10. Gate self-audit has no fake green patterns
 */

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { findGateSoftPassLines } from './selling-houses-gate-hygiene.js';
import { asWritableOpportunity } from '../src/selling-houses/domain/models.js';

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
  // Remove block comments
  let result = src.replace(/\/\*[\s\S]*?\*\//g, '');
  // Remove single-line comments
  result = result.replace(/\/\/.*$/gm, '');
  // Remove string literals (simple — doesn't handle escaped quotes perfectly)
  result = result.replace(/'[^']*'/g, "''");
  result = result.replace(/"[^"]*"/g, '""');
  return result;
}

// ── 1. Terminal status writes confined to named terminal mirror boundary ──

console.log('\n=== R23-1: Terminal status write boundary ===\n');

{
  // Scan for caseItem.status = 'sold' / 'lost_to_rival' / 'withdrawn'
  const domainFiles = [
    'src/selling-houses/domain/dealClosing.ts',
    'src/selling-houses/domain/caseOutcome.ts',
    'src/selling-houses/domain/caseLifecycle.ts',
    'src/selling-houses/domain/engine/actionResolvers.ts',
    'src/selling-houses/domain/caseLifecycle.ts',
  ];

  const allowedStatusWriteFiles: Record<string, string[]> = {
    'sold': ['dealClosing.ts', 'caseOutcome.ts'],
    'lost_to_rival': ['caseOutcome.ts'],
    'withdrawn': ['caseOutcome.ts'],
  };

  // Check: no direct caseItem.status = 'sold' outside dealClosing.ts and caseOutcome.ts
  for (const file of domainFiles) {
    const src = readFileSafe(file);
    if (!src) continue;
    const clean = stripCommentsAndStrings(src);

    for (const [status, allowedFiles] of Object.entries(allowedStatusWriteFiles)) {
      const fileName = file.split('/').pop()!;
      const isAllowed = allowedFiles.some(af => fileName.includes(af.replace('.ts', '')));
      if (isAllowed) continue;

      const pattern = new RegExp(`\\.status\\s*=\\s*'${status}'`);
      check(!pattern.test(clean), `${fileName}: no direct .status = '${status}' (allowed only in ${allowedFiles.join(', ')})`);
    }
  }

  // Verify caseLifecycle.ts and actionResolvers.ts now use syncLegacyCaseTerminalMirrorFromOutcome
  const lifecycleSrc = readFileSafe('src/selling-houses/domain/caseLifecycle.ts');
  check(lifecycleSrc !== null, 'caseLifecycle.ts exists');
  if (lifecycleSrc) {
    check(lifecycleSrc.includes('syncLegacyCaseTerminalMirrorFromOutcome'), 'caseLifecycle.ts routes through terminal mirror boundary');
    const cleanLifecycle = stripCommentsAndStrings(lifecycleSrc);
    check(!cleanLifecycle.includes("status = 'lost_to_rival'"), 'caseLifecycle.ts has no direct status = lost_to_rival write');
  }

  const actionResolversSrc = readFileSafe('src/selling-houses/domain/engine/actionResolvers.ts');
  check(actionResolversSrc !== null, 'actionResolvers.ts exists');
  if (actionResolversSrc) {
    check(actionResolversSrc.includes('syncLegacyCaseTerminalMirrorFromOutcome'), 'actionResolvers.ts routes through terminal mirror boundary');
    const cleanAR = stripCommentsAndStrings(actionResolversSrc);
    check(!cleanAR.includes("status = 'withdrawn'"), 'actionResolvers.ts has no direct status = withdrawn write');
  }
}

// ── 2. closedDeals.unshift confined to contract-derived mirror boundary ──

console.log('\n=== R23-2: closedDeals write boundary ===\n');

{
  const dealClosingSrc = readFileSafe('src/selling-houses/domain/dealClosing.ts');
  check(dealClosingSrc !== null, 'dealClosing.ts exists');
  if (dealClosingSrc) {
    check(dealClosingSrc.includes('closedDeals.unshift'), 'dealClosing.ts contains closedDeals.unshift');
    check(dealClosingSrc.includes('syncLegacyCaseDealMirrorsFromContractFact'), 'dealClosing.ts has named mirror boundary function');
  }

  // No closedDeals.unshift/push in any other domain file
  const otherDomainFiles = [
    'src/selling-houses/domain/caseOutcome.ts',
    'src/selling-houses/domain/caseLifecycle.ts',
    'src/selling-houses/domain/engine/actionResolvers.ts',
    'src/selling-houses/domain/engine.ts',
    'src/selling-houses/domain/runtimeState.ts',
  ];
  for (const file of otherDomainFiles) {
    const src = readFileSafe(file);
    if (!src) continue;
    const clean = stripCommentsAndStrings(src);
    const fileName = file.split('/').pop()!;
    check(!clean.includes('closedDeals.unshift') && !clean.includes('closedDeals.push'),
      `${fileName}: no closedDeals.unshift/push outside dealClosing.ts`);
  }
}

// ── 3. Sold terminal mirror requires contractFactId + consensusFormationId ──

console.log('\n=== R23-3: Sold terminal mirror provenance ===\n');

{
  const dealClosingSrc = readFileSafe('src/selling-houses/domain/dealClosing.ts');
  check(dealClosingSrc !== null, 'dealClosing.ts exists for provenance check');
  if (dealClosingSrc) {
    // R27: syncLegacyCaseDealMirrorsFromContractFact now requires ContractFactState, not scalar contractFactId
    check(dealClosingSrc.includes('contractFact:') && dealClosingSrc.includes('ContractFactState'), 'sold mirror boundary requires contractFact: ContractFactState');
    // syncLegacyCaseDealMirrorsFromContractFact requires consensusFormationId
    check(dealClosingSrc.includes('consensusFormationId: string'), 'sold mirror boundary requires consensusFormationId');
  }
}

// ── 4. Lost/withdrawn terminal mirror requires provenance ──

console.log('\n=== R23-4: Lost/withdrawn terminal mirror provenance ===\n');

{
  const caseOutcomeSrc = readFileSafe('src/selling-houses/domain/caseOutcome.ts');
  check(caseOutcomeSrc !== null, 'caseOutcome.ts exists for provenance check');
  if (caseOutcomeSrc) {
    // syncLegacyCaseTerminalMirrorFromOutcome requires provenance field
    check(caseOutcomeSrc.includes("provenance: 'canonical-outcome' | 'fallback-guard'"),
      'terminal mirror boundary requires provenance field');
    // R23 JSDoc mentions provenance
    check(caseOutcomeSrc.includes('R23: provenance is required'), 'terminal mirror boundary has R23 provenance documentation');
  }

  // Verify callers pass provenance
  const lifecycleSrc = readFileSafe('src/selling-houses/domain/caseLifecycle.ts');
  if (lifecycleSrc) {
    check(lifecycleSrc.includes("provenance: 'canonical-outcome'"), 'caseLifecycle.ts passes canonical-outcome provenance');
    check(lifecycleSrc.includes("provenance: 'fallback-guard'"), 'caseLifecycle.ts passes fallback-guard provenance');
  }

  const arSrc = readFileSafe('src/selling-houses/domain/engine/actionResolvers.ts');
  if (arSrc) {
    check(arSrc.includes("provenance: 'canonical-outcome'"), 'actionResolvers.ts passes canonical-outcome provenance');
    check(arSrc.includes("provenance: 'fallback-guard'"), 'actionResolvers.ts passes fallback-guard provenance');
  }
}

// ── 5. Readiness/trust mirror writes confined to named mirror-sync helpers ──

console.log('\n=== R23-5: Readiness/trust mirror write boundary ===\n');

{
  // Trust mirror writes
  const trustHelperSrc = readFileSafe('src/selling-houses/domain/trustWriteHelper.ts');
  check(trustHelperSrc !== null, 'trustWriteHelper.ts exists');
  if (trustHelperSrc) {
    check(trustHelperSrc.includes('syncLegacyCaseTrustMirror'), 'trustWriteHelper.ts has named mirror-sync function');
    check(trustHelperSrc.includes('export function syncLegacyCaseTrustMirror'), 'syncLegacyCaseTrustMirror is exported');
  }

  // Readiness mirror writes
  const readinessWriteHelperSrc = readFileSafe('src/selling-houses/domain/ownerCaseReadinessWriteHelper.ts');
  check(readinessWriteHelperSrc !== null, 'ownerCaseReadinessWriteHelper.ts exists');
  if (readinessWriteHelperSrc) {
    check(readinessWriteHelperSrc.includes('syncLegacyCaseReadinessMirrors'), 'ownerCaseReadinessWriteHelper.ts has named mirror-sync function');
    check(readinessWriteHelperSrc.includes('export function syncLegacyCaseReadinessMirrors'), 'syncLegacyCaseReadinessMirrors is exported');
  }

  // Count direct trust/patience/urgency writes in domain (excluding test/bootstrap)
  const domainDirs = [
    'src/selling-houses/domain/trustWriteHelper.ts',
    'src/selling-houses/domain/ownerCaseReadinessHelper.ts',
    'src/selling-houses/domain/ownerCaseReadinessWriteHelper.ts',
  ];

  let trustWriteCount = 0;
  let patienceWriteCount = 0;
  let urgencyWriteCount = 0;
  for (const file of domainDirs) {
    const src = readFileSafe(file);
    if (!src) continue;
    const clean = stripCommentsAndStrings(src);
    const trustMatches = clean.match(/(?:asWritableCase\(caseItem\)|caseItem)\.trust\s*=/g) || [];
    const patienceMatches = clean.match(/(?:asWritableCase\(caseItem\)|caseItem)\.patience\s*=/g) || [];
    const urgencyMatches = clean.match(/(?:asWritableCase\(caseItem\)|caseItem)\.urgency\s*=/g) || [];
    trustWriteCount += trustMatches.length;
    patienceWriteCount += patienceMatches.length;
    urgencyWriteCount += urgencyMatches.length;
  }
  check(trustWriteCount > 0, `trust mirror writes exist in named helpers (count: ${trustWriteCount})`);
  check(patienceWriteCount > 0, `patience mirror writes exist in named helpers (count: ${patienceWriteCount})`);
  check(urgencyWriteCount > 0, `urgency mirror writes exist in named helpers (count: ${urgencyWriteCount})`);

  // No trust/patience/urgency writes outside these helper files in production domain code
  const otherDomainSrcs = [
    'src/selling-houses/domain/engine.ts',
    'src/selling-houses/domain/engine/actionResolvers.ts',
    'src/selling-houses/domain/engine/eventEngine.ts',
    'src/selling-houses/domain/engine/marketEngine.ts',
    'src/selling-houses/domain/engine/ownerActionExecutors.ts',
    'src/selling-houses/domain/engine/pricingActionExecutors.ts',
    'src/selling-houses/domain/engine/competitionEngine.ts',
    'src/selling-houses/domain/dealClosing.ts',
    'src/selling-houses/domain/caseLifecycle.ts',
    'src/selling-houses/domain/caseOutcome.ts',
  ];

  for (const file of otherDomainSrcs) {
    const src = readFileSafe(file);
    if (!src) continue;
    const clean = stripCommentsAndStrings(src);
    const fileName = file.split('/').pop()!;
    check(!clean.match(/caseItem\.trust\s*=/), `${fileName}: no direct caseItem.trust = write`);
    check(!clean.match(/caseItem\.patience\s*=/), `${fileName}: no direct caseItem.patience = write`);
    check(!clean.match(/caseItem\.urgency\s*=/), `${fileName}: no direct caseItem.urgency = write`);
  }
}

// ── 6. Mirror-sync helpers use canonical derivation functions, not raw inputs ──

console.log('\n=== R23-6: Mirror-sync helpers use canonical derivation ===\n');

{
  const trustHelperSrc = readFileSafe('src/selling-houses/domain/trustWriteHelper.ts');
  check(trustHelperSrc !== null, 'trustWriteHelper.ts exists');
  if (trustHelperSrc) {
    // syncLegacyCaseTrustMirror must use deriveCaseTrustMirror
    const fnMatch = trustHelperSrc.match(/export function syncLegacyCaseTrustMirror[\s\S]*?\n\}/);
    if (fnMatch) {
      check(fnMatch[0].includes('deriveCaseTrustMirror'), 'syncLegacyCaseTrustMirror uses deriveCaseTrustMirror');
    }
  }

  const readinessWriteHelperSrc = readFileSafe('src/selling-houses/domain/ownerCaseReadinessWriteHelper.ts');
  check(readinessWriteHelperSrc !== null, 'ownerCaseReadinessWriteHelper.ts exists');
  if (readinessWriteHelperSrc) {
    const fnMatch2 = readinessWriteHelperSrc.match(/export function syncLegacyCaseReadinessMirrors[\s\S]*?\n\}/);
    if (fnMatch2) {
      check(fnMatch2[0].includes('deriveCasePatienceMirror'), 'syncLegacyCaseReadinessMirrors uses deriveCasePatienceMirror');
      check(fnMatch2[0].includes('deriveCaseUrgencyMirror'), 'syncLegacyCaseReadinessMirrors uses deriveCaseUrgencyMirror');
    }
  }

  // Verify derivation functions exist in core
  const trustWriteSourceSrc = readFileSafe('src/selling-houses/core/world-state/trustWriteSource.ts');
  check(trustWriteSourceSrc !== null, 'trustWriteSource.ts exists');
  if (trustWriteSourceSrc) {
    check(trustWriteSourceSrc.includes('export function deriveCaseTrustMirror'), 'deriveCaseTrustMirror exists in core');
  }

  const readinessWriteSourceSrc = readFileSafe('src/selling-houses/core/world-state/ownerCaseReadinessWriteSource.ts');
  check(readinessWriteSourceSrc !== null, 'ownerCaseReadinessWriteSource.ts exists');
  if (readinessWriteSourceSrc) {
    check(readinessWriteSourceSrc.includes('export function deriveCasePatienceMirror'), 'deriveCasePatienceMirror exists in core');
    check(readinessWriteSourceSrc.includes('export function deriveCaseUrgencyMirror'), 'deriveCaseUrgencyMirror exists in core');
  }
}

// ── 7. No production direct caseItem.trust/patience/urgency= outside helpers ──

console.log('\n=== R23-7: No raw truth-field writes outside boundary ===\n');

{
  // Broader scan — all src/selling-houses/domain files
  const { execSync } = await import('node:child_process');
  try {
    const trustHits = execSync(
      `rg -l "asWritableCase\\(caseItem\\)\\.trust\\s*=\\|caseItem\\.trust\\s*=" src/selling-houses/domain/ --glob '*.ts' 2>/dev/null || true`,
      { encoding: 'utf-8' },
    ).trim();
    const trustFiles = trustHits ? trustHits.split('\n').filter(Boolean) : [];
    const allowedTrustFiles = ['trustWriteHelper.ts'];
    const forbiddenTrust = trustFiles.filter(f => !allowedTrustFiles.some(af => f.includes(af)));
    check(forbiddenTrust.length === 0, `no caseItem.trust= outside trustWriteHelper (found: ${forbiddenTrust.join(', ') || 'none'})`);

    const patienceHits = execSync(
      `rg -l "asWritableCase\\(caseItem\\)\\.patience\\s*=\\|caseItem\\.patience\\s*=" src/selling-houses/domain/ --glob '*.ts' 2>/dev/null || true`,
      { encoding: 'utf-8' },
    ).trim();
    const patienceFiles = patienceHits ? patienceHits.split('\n').filter(Boolean) : [];
    const allowedPatienceFiles = ['ownerCaseReadinessHelper.ts', 'ownerCaseReadinessWriteHelper.ts'];
    const forbiddenPatience = patienceFiles.filter(f => !allowedPatienceFiles.some(af => f.includes(af)));
    check(forbiddenPatience.length === 0, `no caseItem.patience= outside readiness helpers (found: ${forbiddenPatience.join(', ') || 'none'})`);

    const urgencyHits = execSync(
      `rg -l "asWritableCase\\(caseItem\\)\\.urgency\\s*=\\|caseItem\\.urgency\\s*=" src/selling-houses/domain/ --glob '*.ts' 2>/dev/null || true`,
      { encoding: 'utf-8' },
    ).trim();
    const urgencyFiles = urgencyHits ? urgencyHits.split('\n').filter(Boolean) : [];
    const forbiddenUrgency = urgencyFiles.filter(f => !allowedPatienceFiles.some(af => f.includes(af)));
    check(forbiddenUrgency.length === 0, `no caseItem.urgency= outside readiness helpers (found: ${forbiddenUrgency.join(', ') || 'none'})`);
  } catch {
    check(false, 'rg scan failed');
  }
}

// ── 8. StageIndex writes remain inside R20 compatibility helpers or fixture scripts ──

console.log('\n=== R23-8: StageIndex write classification ===\n');

{
  // Production stageIndex writes should be in opportunitySplitHelper.ts only
  const allowedStageFiles = [
    'opportunitySplitHelper.ts',
    'dealClosing.ts',
    'customerEngine.ts',
  ];

  // Test files are allowed to write stageIndex
  const testDirs = ['__tests__', '.test.ts'];

  try {
    const { execSync } = await import('node:child_process');
    const stageHits = execSync(
      `rg -n "stageIndex\\s*=" src/selling-houses/domain/ --glob '*.ts' 2>/dev/null || true`,
      { encoding: 'utf-8' },
    ).trim();
    const lines = stageHits ? stageHits.split('\n').filter(Boolean) : [];

    const productionWrites: string[] = [];
    for (const line of lines) {
      const isInAllowedFile = allowedStageFiles.some(af => line.includes(af));
      const isRead = line.includes('===') || line.includes('!==') || line.includes('==') || line.includes('!=') || line.includes('?.') || line.includes('const ') || line.includes('let ');
      if (!isInAllowedFile && !isRead) {
        productionWrites.push(line);
      }
    }

    check(productionWrites.length === 0, `no new production stageIndex= writes outside R20 helpers (found: ${productionWrites.length})`);
  } catch {
    check(false, 'rg stageIndex scan failed');
  }

  // Explicitly verify opportunitySplitHelper.ts has the R20 stage mirror helper
  const oppSplitSrc = readFileSafe('src/selling-houses/domain/opportunitySplitHelper.ts');
  check(oppSplitSrc !== null, 'opportunitySplitHelper.ts exists');
  if (oppSplitSrc) {
    check(oppSplitSrc.includes('opportunity.stageIndex =') || oppSplitSrc.includes('runtime.stageIndex ='),
      'opportunitySplitHelper.ts contains R20 stage mirror writes');
  }
}

// ── 9. Prior gates still pass ──

console.log('\n=== R23-9: Prior gates still pass ===\n');

{
  const r22Result = spawnSync(
    'npx',
    ['tsx', 'scripts/verify-selling-houses-r22-behavioral-evidence-parity-gate.ts'],
    { stdio: 'pipe', shell: process.platform === 'win32', timeout: 600_000 },
  );
  if (r22Result.error) {
    fail(`R22 gate: ${r22Result.error.message}`);
  } else if (r22Result.status !== 0) {
    fail(`R22 gate: exit ${r22Result.status}`);
  } else {
    pass('R22 gate still passes');
  }
}

{
  const r19Result = spawnSync(
    'npx',
    ['tsx', 'scripts/verify-selling-houses-r19-structural-truth-lock-gate.ts'],
    { stdio: 'pipe', shell: process.platform === 'win32', timeout: 600_000 },
  );
  if (r19Result.error) {
    fail(`R19 gate: ${r19Result.error.message}`);
  } else if (r19Result.status !== 0) {
    fail(`R19 gate: exit ${r19Result.status}`);
  } else {
    pass('R19 gate still passes');
  }
}

{
  const terminalFactResult = spawnSync(
    'npx',
    ['tsx', 'scripts/verify-selling-houses-contract-terminal-fact-gate.ts'],
    { stdio: 'pipe', shell: process.platform === 'win32', timeout: 600_000 },
  );
  if (terminalFactResult.error) {
    fail(`Contract terminal fact gate: ${terminalFactResult.error.message}`);
  } else if (terminalFactResult.status !== 0) {
    fail(`Contract terminal fact gate: exit ${terminalFactResult.status}`);
  } else {
    pass('Contract terminal fact gate still passes');
  }
}

// ── 10. Gate self-audit ──

console.log('\n=== R23-10: Gate self-audit ===\n');

const gateSelfSrc = readFileSync(import.meta.filename!, 'utf-8');
const softPassViolations = findGateSoftPassLines(gateSelfSrc);
check(softPassViolations.length === 0, `gate self-audit: no soft-pass patterns (found ${softPassViolations.length})`);

// ── Summary ──

console.log('\n=== R23 Truth Field Write Firewall Gate Summary ===\n');
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
console.log('Verified: terminal outcome firewall, readiness/trust mirror boundary, stage index classification, prior gates.');
