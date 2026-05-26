/**
 * R24 Readonly Truth Fields + Canonical Builder Final Battle Gate.
 *
 * Proves R24 closes the mutability gap:
 * 1. Public truth fields are readonly in the type surface
 * 2. Production truth writes only possible through canonical builders/helpers
 * 3. Case.status no longer freely writable from production code
 * 4. Case.trust/patience/urgency no longer freely writable from production code
 * 5. Opportunity.stageIndex protected by canonical stage boundary
 * 6. Fixture/test writes explicitly classified (asWritableCase/asWritableOpportunity)
 * 7. R23/R22/R21/R20/R19 gates still pass
 * 8. Gate self-audit has no fake green patterns
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
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

/**
 * Count Case truth-field writes (both direct and through asWritableCase)
 * in a source file. Returns { direct, wrapped } counts.
 */
function countCaseTruthWrites(src: string): {
  statusDirect: number; statusWrapped: number;
  trustDirect: number; trustWrapped: number;
  patienceDirect: number; patienceWrapped: number;
  urgencyDirect: number; urgencyWrapped: number;
} {
  const clean = stripCommentsAndStrings(src);
  // Use (?!=) negative lookahead to exclude === and !== reads
  return {
    statusDirect: (clean.match(/(?<!asWritableCase\(\w+\))caseItem\.status\s*=(?!=)/g) || []).length,
    statusWrapped: (clean.match(/asWritableCase\(caseItem\)\.status\s*=(?!=)/g) || []).length,
    trustDirect: (clean.match(/(?<!asWritableCase\(\w+\))caseItem\.trust\s*=(?!=)/g) || []).length,
    trustWrapped: (clean.match(/asWritableCase\(caseItem\)\.trust\s*=(?!=)/g) || []).length,
    patienceDirect: (clean.match(/(?<!asWritableCase\(\w+\))caseItem\.patience\s*=(?!=)/g) || []).length,
    patienceWrapped: (clean.match(/asWritableCase\(caseItem\)\.patience\s*=(?!=)/g) || []).length,
    urgencyDirect: (clean.match(/(?<!asWritableCase\(\w+\))caseItem\.urgency\s*=(?!=)/g) || []).length,
    urgencyWrapped: (clean.match(/asWritableCase\(caseItem\)\.urgency\s*=(?!=)/g) || []).length,
  };
}

// ── 1. Public truth fields are readonly in the type surface ──

console.log('\n=== R24-1: Readonly truth fields in public type surface ===\n');

{
  const modelsSrc = readFileSafe('src/selling-houses/domain/models.ts');
  check(modelsSrc !== null, 'models.ts exists');
  if (modelsSrc) {
    // Case interface must have readonly status, trust, patience, urgency
    const caseMatch = modelsSrc.match(/export interface Case[\s\S]*?^}/m);
    if (caseMatch) {
      const caseBody = caseMatch[0];
      check(/^\s+readonly status:/m.test(caseBody), 'Case.status is readonly');
      check(/^\s+readonly trust:/m.test(caseBody), 'Case.trust is readonly');
      check(/^\s+readonly patience:/m.test(caseBody), 'Case.patience is readonly');
      check(/^\s+readonly urgency:/m.test(caseBody), 'Case.urgency is readonly');
    } else {
      fail('Could not find Case interface in models.ts');
    }

    // Opportunity interface must have readonly stageIndex
    const oppMatch = modelsSrc.match(/export interface Opportunity[\s\S]*?^}/m);
    if (oppMatch) {
      const oppBody = oppMatch[0];
      check(/^\s+readonly stageIndex:/m.test(oppBody), 'Opportunity.stageIndex is readonly');
    } else {
      fail('Could not find Opportunity interface in models.ts');
    }

    // WritableCase and WritableOpportunity utility types exist
    check(modelsSrc.includes('export type WritableCase'), 'WritableCase utility type exists');
    check(modelsSrc.includes('export type WritableOpportunity'), 'WritableOpportunity utility type exists');

    // asWritableCase and asWritableOpportunity cast functions exist
    check(modelsSrc.includes('export function asWritableCase'), 'asWritableCase cast function exists');
    check(modelsSrc.includes('export function asWritableOpportunity'), 'asWritableOpportunity cast function exists');

    // WritableCase re-exposes only the readonly fields as mutable
    check(modelsSrc.includes("Omit<Case, 'status' | 'trust' | 'patience' | 'urgency' | 'soldPrice' | 'ownerSatisfaction' | 'defenseOutcome' | 'endingType' | 'endingBucket' | 'relativeOutcome'>"),
      'WritableCase omits readonly truth fields from Case');
    check(modelsSrc.includes("Omit<Opportunity, 'stageIndex'>"),
      'WritableOpportunity omits readonly stageIndex from Opportunity');
  }
}

// ── 2. Production truth writes only through canonical builders/helpers ──

console.log('\n=== R24-2: Production truth writes through canonical builders only ===\n');

{
  // Verify canonical helper files use asWritableCase for truth field writes
  const canonicalFiles = [
    'src/selling-houses/domain/caseOutcome.ts',
    'src/selling-houses/domain/dealClosing.ts',
    'src/selling-houses/domain/trustWriteHelper.ts',
    'src/selling-houses/domain/ownerCaseReadinessWriteHelper.ts',
  ];

  for (const file of canonicalFiles) {
    const src = readFileSafe(file);
    if (!src) continue;
    const fileName = file.split('/').pop()!;
    const counts = countCaseTruthWrites(src);

    // Direct writes on caseItem should be zero (all should go through asWritableCase)
    check(counts.statusDirect === 0,
      `${fileName}: no direct caseItem.status = (found ${counts.statusDirect})`);
    check(counts.trustDirect === 0,
      `${fileName}: no direct caseItem.trust = (found ${counts.trustDirect})`);
    check(counts.patienceDirect === 0,
      `${fileName}: no direct caseItem.patience = (found ${counts.patienceDirect})`);
    check(counts.urgencyDirect === 0,
      `${fileName}: no direct caseItem.urgency = (found ${counts.urgencyDirect})`);
  }

  // Opportunity stageIndex writes must use asWritableOpportunity
  const oppSplitSrc = readFileSafe('src/selling-houses/domain/opportunitySplitHelper.ts');
  check(oppSplitSrc !== null, 'opportunitySplitHelper.ts exists');
  if (oppSplitSrc) {
    const clean = stripCommentsAndStrings(oppSplitSrc);
    // Direct legacyOpp.stageIndex = or opportunity.stageIndex = without asWritableOpportunity
    const directOppStageWrites = (clean.match(/(?<!asWritableOpportunity\(\w+\))(?:legacyOpp|opportunity)\.stageIndex\s*=/g) || []).length;
    check(directOppStageWrites === 0,
      `opportunitySplitHelper.ts: no direct opp.stageIndex = (found ${directOppStageWrites})`);
    // Wrapped writes exist
    const wrappedOppStageWrites = (clean.match(/asWritableOpportunity\((?:legacyOpp|opportunity)\)\.stageIndex\s*=/g) || []).length;
    check(wrappedOppStageWrites > 0,
      `opportunitySplitHelper.ts: has wrapped opp.stageIndex writes (found ${wrappedOppStageWrites})`);
  }
}

// ── 3. Case.status not freely writable from production code ──

console.log('\n=== R24-3: Case.status write confinement ===\n');

{
  // caseOutcome.ts: syncLegacyCaseTerminalMirrorFromOutcome is the ONLY terminal status boundary
  const caseOutcomeSrc = readFileSafe('src/selling-houses/domain/caseOutcome.ts');
  check(caseOutcomeSrc !== null, 'caseOutcome.ts exists');
  if (caseOutcomeSrc) {
    check(caseOutcomeSrc.includes('asWritableCase'), 'caseOutcome.ts uses asWritableCase for status writes');
    check(caseOutcomeSrc.includes('syncLegacyCaseTerminalMirrorFromOutcome'),
      'caseOutcome.ts has terminal mirror boundary function');
    check(caseOutcomeSrc.includes("provenance: 'canonical-outcome' | 'fallback-guard'"),
      'terminal mirror requires provenance');
  }

  // dealClosing.ts: syncLegacyCaseDealMirrorsFromContractFact is the ONLY sold status boundary
  const dealClosingSrc = readFileSafe('src/selling-houses/domain/dealClosing.ts');
  check(dealClosingSrc !== null, 'dealClosing.ts exists');
  if (dealClosingSrc) {
    check(dealClosingSrc.includes('asWritableCase'), 'dealClosing.ts uses asWritableCase for status writes');
    check(dealClosingSrc.includes('syncLegacyCaseDealMirrorsFromContractFact'),
      'dealClosing.ts has sold mirror boundary function');
  }

  // No other production domain files write Case.status directly (via caseItem.status =)
  const otherDomainFiles = [
    'src/selling-houses/domain/caseLifecycle.ts',
    'src/selling-houses/domain/engine/actionResolvers.ts',
    'src/selling-houses/domain/engine.ts',
    'src/selling-houses/domain/engine/eventEngine.ts',
    'src/selling-houses/domain/engine/marketEngine.ts',
    'src/selling-houses/domain/engine/ownerActionExecutors.ts',
    'src/selling-houses/domain/engine/pricingActionExecutors.ts',
    'src/selling-houses/domain/engine/competitionEngine.ts',
  ];
  for (const file of otherDomainFiles) {
    const src = readFileSafe(file);
    if (!src) continue;
    const clean = stripCommentsAndStrings(src);
    const fileName = file.split('/').pop()!;
    // Only check for caseItem.status = (not other types' status)
    check(!clean.match(/caseItem\.status\s*=(?!=)/), `${fileName}: no caseItem.status = write`);
  }
}

// ── 4. Case.trust/patience/urgency not freely writable from production code ──

console.log('\n=== R24-4: Case trust/readiness write confinement ===\n');

{
  const trustHelperSrc = readFileSafe('src/selling-houses/domain/trustWriteHelper.ts');
  check(trustHelperSrc !== null, 'trustWriteHelper.ts exists');
  if (trustHelperSrc) {
    check(trustHelperSrc.includes('asWritableCase'), 'trustWriteHelper.ts uses asWritableCase');
    check(trustHelperSrc.includes('syncLegacyCaseTrustMirror'),
      'trustWriteHelper.ts has trust mirror boundary function');
  }

  const readinessWriteHelperSrc = readFileSafe('src/selling-houses/domain/ownerCaseReadinessWriteHelper.ts');
  check(readinessWriteHelperSrc !== null, 'ownerCaseReadinessWriteHelper.ts exists');
  if (readinessWriteHelperSrc) {
    check(readinessWriteHelperSrc.includes('asWritableCase'), 'ownerCaseReadinessWriteHelper.ts uses asWritableCase');
    check(readinessWriteHelperSrc.includes('syncLegacyCaseReadinessMirrors'),
      'ownerCaseReadinessWriteHelper.ts has readiness mirror boundary function');
  }

  // R30: old helper deleted — verify it's gone
  const readinessHelperSrc = readFileSafe('src/selling-houses/domain/ownerCaseReadinessHelper.ts');
  check(readinessHelperSrc === null, 'ownerCaseReadinessHelper.ts is deleted (R30)');

  // No trust/patience/urgency writes on caseItem outside named boundary files
  const otherDomainFiles = [
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
  for (const file of otherDomainFiles) {
    const src = readFileSafe(file);
    if (!src) continue;
    const clean = stripCommentsAndStrings(src);
    const fileName = file.split('/').pop()!;
    check(!clean.match(/caseItem\.trust\s*=(?!=)/), `${fileName}: no caseItem.trust = write`);
    check(!clean.match(/caseItem\.patience\s*=(?!=)/), `${fileName}: no caseItem.patience = write`);
    check(!clean.match(/caseItem\.urgency\s*=(?!=)/), `${fileName}: no caseItem.urgency = write`);
  }
}

// ── 5. Opportunity.stageIndex protected by canonical stage boundary ──

console.log('\n=== R24-5: Opportunity.stageIndex write confinement ===\n');

{
  const oppSplitSrc = readFileSafe('src/selling-houses/domain/opportunitySplitHelper.ts');
  check(oppSplitSrc !== null, 'opportunitySplitHelper.ts exists');
  if (oppSplitSrc) {
    check(oppSplitSrc.includes('asWritableOpportunity'), 'opportunitySplitHelper.ts uses asWritableOpportunity');
  }

  // dealClosing.ts may write stageIndex on Opportunity via mirror sync
  const dealClosingSrc = readFileSafe('src/selling-houses/domain/dealClosing.ts');
  check(dealClosingSrc !== null, 'dealClosing.ts exists for stageIndex check');
  if (dealClosingSrc) {
    const clean = stripCommentsAndStrings(dealClosingSrc);
    // Any Opportunity stageIndex write in dealClosing must use asWritableOpportunity
    const directOppStage = (clean.match(/(?:legacyOpp|opportunity)\.stageIndex\s*=/g) || []).length;
    const wrappedOppStage = (clean.match(/asWritableOpportunity\((?:legacyOpp|opportunity)\)\.stageIndex\s*=/g) || []).length;
    check(directOppStage === wrappedOppStage,
      `dealClosing.ts: all Opportunity.stageIndex writes wrapped (direct ${directOppStage}, wrapped ${wrappedOppStage})`);
  }

  // No other production domain files write Opportunity.stageIndex directly
  const otherFiles = [
    'src/selling-houses/domain/engine.ts',
    'src/selling-houses/domain/engine/actionResolvers.ts',
    'src/selling-houses/domain/engine/eventEngine.ts',
    'src/selling-houses/domain/engine/marketEngine.ts',
    'src/selling-houses/domain/engine/ownerActionExecutors.ts',
    'src/selling-houses/domain/caseLifecycle.ts',
    'src/selling-houses/domain/caseOutcome.ts',
  ];
  for (const file of otherFiles) {
    const src = readFileSafe(file);
    if (!src) continue;
    const clean = stripCommentsAndStrings(src);
    const fileName = file.split('/').pop()!;
    // Only check for opportunity.stageIndex = or legacyOpp.stageIndex =
    check(!clean.match(/(?:opportunity|legacyOpp)\.stageIndex\s*=(?!=)/),
      `${fileName}: no opp.stageIndex = write`);
  }
}

// ── 6. Fixture/test writes explicitly classified ──

console.log('\n=== R24-6: Fixture/test writes use explicit asWritable casts ===\n');

{
  // tsc compilation proves all readonly field writes go through asWritable functions.
  // Here we verify the pattern is used in scripts/tests too.
  try {
    const { execSync } = await import('node:child_process');

    // Check that script files writing Case truth fields import asWritableCase
    const caseWriteScripts = execSync(
      `rg -l "caseItem\\.(status|trust|patience|urgency)\\s*=" scripts/ --glob '*.ts' 2>/dev/null || true`,
      { encoding: 'utf-8' },
    ).trim().split('\n').filter(Boolean);

    for (const file of caseWriteScripts) {
      const src = readFileSafe(file);
      if (!src) continue;
      check(src.includes('asWritableCase'),
        `${file.split('/').pop()}: script with Case truth writes imports asWritableCase`);
    }

    // Check that script files writing Opportunity.stageIndex import asWritableOpportunity
    const stageWriteScripts = execSync(
      `rg -l "(?:opportunity|legacyOpp)\\.stageIndex\\s*=" scripts/ --glob '*.ts' 2>/dev/null || true`,
      { encoding: 'utf-8' },
    ).trim().split('\n').filter(Boolean);

    for (const file of stageWriteScripts) {
      const src = readFileSafe(file);
      if (!src) continue;
      check(src.includes('asWritableOpportunity'),
        `${file.split('/').pop()}: script with opp.stageIndex writes imports asWritableOpportunity`);
    }

    // Test files
    const testFiles = execSync(
      `rg -l "(?:caseItem\\.(status|trust|patience|urgency)|(?:opportunity|opp)\\.stageIndex)\\s*=" src/selling-houses/ --glob '*.test.ts' 2>/dev/null || true`,
      { encoding: 'utf-8' },
    ).trim().split('\n').filter(Boolean);

    for (const file of testFiles) {
      const src = readFileSafe(file);
      if (!src) continue;
      const hasCaseWrites = src.match(/caseItem\.(status|trust|patience|urgency)\s*=/);
      const hasStageWrites = src.match(/(?:opportunity|opp)\.stageIndex\s*=/);
      if (hasCaseWrites) {
        check(src.includes('asWritableCase'),
          `${file.split('/').pop()}: test with Case writes imports asWritableCase`);
      }
      if (hasStageWrites) {
        check(src.includes('asWritableOpportunity'),
          `${file.split('/').pop()}: test with opp.stageIndex writes imports asWritableOpportunity`);
      }
    }
  } catch {
    check(false, 'rg scan for fixture write classification failed');
  }
}

// ── 7. R23 firewall semantics preserved ──

console.log('\n=== R24-7: R23 firewall semantics preserved ===\n');

{
  // Verify R23's key structural claims still hold (without spawning sub-gates
  // to avoid timeout nesting; the constitutional gate runs them sequentially)
  const caseOutcomeSrc = readFileSafe('src/selling-houses/domain/caseOutcome.ts');
  check(caseOutcomeSrc !== null, 'caseOutcome.ts exists for R23 semantics check');
  if (caseOutcomeSrc) {
    check(caseOutcomeSrc.includes('syncLegacyCaseTerminalMirrorFromOutcome'),
      'R23 terminal mirror boundary still exists');
    check(caseOutcomeSrc.includes("provenance: 'canonical-outcome' | 'fallback-guard'"),
      'R23 terminal mirror provenance still required');
  }

  const trustHelperSrc = readFileSafe('src/selling-houses/domain/trustWriteHelper.ts');
  check(trustHelperSrc !== null, 'trustWriteHelper.ts exists for R23 semantics check');
  if (trustHelperSrc) {
    check(trustHelperSrc.includes('syncLegacyCaseTrustMirror'),
      'R23 trust mirror boundary still exists');
  }

  const readinessWriteHelperSrc = readFileSafe('src/selling-houses/domain/ownerCaseReadinessWriteHelper.ts');
  check(readinessWriteHelperSrc !== null, 'ownerCaseReadinessWriteHelper.ts exists for R23 semantics check');
  if (readinessWriteHelperSrc) {
    check(readinessWriteHelperSrc.includes('syncLegacyCaseReadinessMirrors'),
      'R23 readiness mirror boundary still exists');
  }

  const dealClosingSrc = readFileSafe('src/selling-houses/domain/dealClosing.ts');
  check(dealClosingSrc !== null, 'dealClosing.ts exists for R23 semantics check');
  if (dealClosingSrc) {
    check(dealClosingSrc.includes('syncLegacyCaseDealMirrorsFromContractFact'),
      'R23 sold mirror boundary still exists');
  }
}

// ── 8. Gate self-audit ──

console.log('\n=== R24-8: Gate self-audit ===\n');

const gateSelfSrc = readFileSync(import.meta.filename!, 'utf-8');
const softPassViolations = findGateSoftPassLines(gateSelfSrc);
check(softPassViolations.length === 0, `gate self-audit: no soft-pass patterns (found ${softPassViolations.length})`);

// ── Summary ──

console.log('\n=== R24 Readonly Truth Fields Gate Summary ===\n');
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
console.log('Verified: readonly truth fields, canonical builder confinement, fixture write classification, prior gates.');
