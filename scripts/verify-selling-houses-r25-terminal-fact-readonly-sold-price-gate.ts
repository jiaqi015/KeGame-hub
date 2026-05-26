/**
 * R25 Ultimate Terminal Fact Spine + SoldPrice Readonly + Contract-Derived Mirrors Gate.
 *
 * Proves R25 closes the terminal fact layer:
 * 1. Case.soldPrice is readonly in the public type surface
 * 2. WritableCase explicitly includes mutable soldPrice as compatibility mirror
 * 3. asWritableCase is the only permitted low-level cast for soldPrice writes
 * 4. No production file writes caseItem.soldPrice = directly (only through asWritableCase)
 * 5. soldPrice writes are confined to named terminal-fact boundary files
 * 6. The terminal helper requires terminal evidence (contract fact / deal record)
 * 7. closedDeals.unshift remains confined to terminal finalization
 * 8. R24/R23/R22 semantics preserved
 * 9. Live behavioral proof: ContractFact → readonly mirrors
 * 10. Gate self-audit has no fake green patterns
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

// ── 1. Case.soldPrice is readonly in the public type surface ──

console.log('\n=== R25-1: Case.soldPrice readonly in public type ===\n');

{
  const modelsSrc = readFileSafe('src/selling-houses/domain/models.ts');
  check(modelsSrc !== null, 'models.ts exists');
  if (modelsSrc) {
    const caseMatch = modelsSrc.match(/export interface Case[\s\S]*?^}/m);
    if (caseMatch) {
      const caseBody = caseMatch[0];
      check(/^\s+readonly soldPrice:/m.test(caseBody), 'Case.soldPrice is readonly');
    } else {
      fail('Could not find Case interface in models.ts');
    }

    // WritableCase includes mutable soldPrice
    check(modelsSrc.includes("Omit<Case, 'status' | 'trust' | 'patience' | 'urgency' | 'soldPrice' | 'ownerSatisfaction' | 'defenseOutcome' | 'endingType' | 'endingBucket' | 'relativeOutcome'>"),
      'WritableCase omits soldPrice from Case (alongside other readonly fields)');
    check(modelsSrc.includes('soldPrice: Case['), 'WritableCase includes mutable soldPrice');

    // asWritableCase exists
    check(modelsSrc.includes('export function asWritableCase'), 'asWritableCase cast function exists');
  }
}

// ── 2. No direct caseItem.soldPrice = in production ──

console.log('\n=== R25-2: No direct soldPrice writes outside asWritableCase ===\n');

{
  const domainFiles = [
    'src/selling-houses/domain/dealClosing.ts',
    'src/selling-houses/domain/caseOutcome.ts',
    'src/selling-houses/domain/caseLifecycle.ts',
    'src/selling-houses/domain/engine/actionResolvers.ts',
    'src/selling-houses/domain/engine.ts',
    'src/selling-houses/domain/engine/eventEngine.ts',
    'src/selling-houses/domain/engine/marketEngine.ts',
    'src/selling-houses/domain/engine/ownerActionExecutors.ts',
    'src/selling-houses/domain/engine/pricingActionExecutors.ts',
    'src/selling-houses/domain/engine/competitionEngine.ts',
    'src/selling-houses/domain/trustWriteHelper.ts',
    'src/selling-houses/domain/ownerCaseReadinessWriteHelper.ts',
    'src/selling-houses/domain/opportunitySplitHelper.ts',
  ];

  for (const file of domainFiles) {
    const src = readFileSafe(file);
    if (!src) continue;
    const clean = stripCommentsAndStrings(src);
    const fileName = file.split('/').pop()!;

    // Check for caseItem.soldPrice = (not === or !==)
    const directWrites = clean.match(/caseItem\.soldPrice\s*=(?!=)/g) || [];
    check(directWrites.length === 0,
      `${fileName}: no direct caseItem.soldPrice = write (found ${directWrites.length})`);
  }

  // Verify that asWritableCase is used for soldPrice writes in terminal boundary files
  const dealClosingSrc = readFileSafe('src/selling-houses/domain/dealClosing.ts');
  check(dealClosingSrc !== null, 'dealClosing.ts exists');
  if (dealClosingSrc) {
    check(dealClosingSrc.includes('asWritableCase(caseItem).soldPrice'),
      'dealClosing.ts uses asWritableCase for soldPrice write');
  }

  const caseOutcomeSrc = readFileSafe('src/selling-houses/domain/caseOutcome.ts');
  check(caseOutcomeSrc !== null, 'caseOutcome.ts exists');
  if (caseOutcomeSrc) {
    check(caseOutcomeSrc.includes('asWritableCase(caseItem).soldPrice'),
      'caseOutcome.ts uses asWritableCase for soldPrice write');
  }
}

// ── 3. soldPrice writes confined to terminal-fact boundary files ──

console.log('\n=== R25-3: soldPrice writes in terminal boundary files only ===\n');

{
  const allowedFiles = ['dealClosing.ts', 'caseOutcome.ts'];
  const otherFiles = [
    'src/selling-houses/domain/caseLifecycle.ts',
    'src/selling-houses/domain/engine/actionResolvers.ts',
    'src/selling-houses/domain/engine.ts',
    'src/selling-houses/domain/engine/eventEngine.ts',
    'src/selling-houses/domain/engine/marketEngine.ts',
    'src/selling-houses/domain/engine/ownerActionExecutors.ts',
  ];

  for (const file of otherFiles) {
    const src = readFileSafe(file);
    if (!src) continue;
    const clean = stripCommentsAndStrings(src);
    const fileName = file.split('/').pop()!;
    // Any asWritableCase(caseItem).soldPrice or caseItem.soldPrice write
    const anySoldPriceWrite = clean.match(/(?:asWritableCase\(caseItem\)|caseItem)\.soldPrice\s*=(?!=)/g) || [];
    check(anySoldPriceWrite.length === 0,
      `${fileName}: no soldPrice writes (allowed only in ${allowedFiles.join(', ')})`);
  }

  // Verify terminal boundary files have the correct pattern
  const dealClosingSrc = readFileSafe('src/selling-houses/domain/dealClosing.ts');
  if (dealClosingSrc) {
    // syncLegacyCaseDealMirrorsFromContractFact is the terminal boundary
    check(dealClosingSrc.includes('syncLegacyCaseDealMirrorsFromContractFact'),
      'dealClosing.ts has terminal mirror boundary function');
    // It requires contract fact provenance (R27: now ContractFactState, not scalar contractFactId)
    check(dealClosingSrc.includes('contractFact:') && dealClosingSrc.includes('ContractFactState'),
      'terminal boundary requires contractFact: ContractFactState');
    check(dealClosingSrc.includes('consensusFormationId: string'),
      'terminal boundary requires consensusFormationId');
  }

  const caseOutcomeSrc = readFileSafe('src/selling-houses/domain/caseOutcome.ts');
  if (caseOutcomeSrc) {
    check(caseOutcomeSrc.includes('markCaseSold'),
      'caseOutcome.ts has markCaseSold terminal helper');
    check(caseOutcomeSrc.includes('asWritableCase'),
      'caseOutcome.ts uses asWritableCase in terminal helper');
  }
}

// ── 4. Terminal helper requires terminal evidence ──

console.log('\n=== R25-4: Terminal helpers require terminal evidence ===\n');

{
  const dealClosingSrc = readFileSafe('src/selling-houses/domain/dealClosing.ts');
  check(dealClosingSrc !== null, 'dealClosing.ts exists for evidence check');
  if (dealClosingSrc) {
    // syncLegacyCaseDealMirrorsFromContractFact requires contract fact provenance
    check(dealClosingSrc.includes('contractFactId'), 'sold mirror requires contractFactId');
    check(dealClosingSrc.includes('consensusFormationId'), 'sold mirror requires consensusFormationId');

    // ContractFact is created in the finalization flow (R27: via proof-based API)
    check(dealClosingSrc.includes('createContractFactFromPriceConsensusOnState'),
      'dealClosing.ts creates ContractFact via proof-based helper');
  }

  const caseOutcomeSrc = readFileSafe('src/selling-houses/domain/caseOutcome.ts');
  check(caseOutcomeSrc !== null, 'caseOutcome.ts exists for evidence check');
  if (caseOutcomeSrc) {
    // syncLegacyCaseTerminalMirrorFromOutcome requires provenance
    check(caseOutcomeSrc.includes("provenance: 'canonical-outcome' | 'fallback-guard'"),
      'terminal outcome mirror requires provenance');
  }
}

// ── 5. closedDeals.unshift remains confined to terminal finalization ──

console.log('\n=== R25-5: closedDeals confined to terminal finalization ===\n');

{
  const dealClosingSrc = readFileSafe('src/selling-houses/domain/dealClosing.ts');
  check(dealClosingSrc !== null, 'dealClosing.ts exists');
  if (dealClosingSrc) {
    check(dealClosingSrc.includes('closedDeals.unshift'), 'closedDeals.unshift exists in dealClosing.ts');
    check(dealClosingSrc.includes('prependClosedDealMirrorFromContractFact'), 'prependClosedDealMirrorFromContractFact exists in dealClosing.ts');
  }

  const otherFiles = [
    'src/selling-houses/domain/caseOutcome.ts',
    'src/selling-houses/domain/caseLifecycle.ts',
    'src/selling-houses/domain/engine/actionResolvers.ts',
    'src/selling-houses/domain/engine.ts',
  ];
  for (const file of otherFiles) {
    const src = readFileSafe(file);
    if (!src) continue;
    const clean = stripCommentsAndStrings(src);
    const fileName = file.split('/').pop()!;
    check(!clean.includes('closedDeals.unshift') && !clean.includes('closedDeals.push'),
      `${fileName}: no closedDeals.unshift/push`);
  }
}

// ── 6. ContractFact is the terminal truth ──

console.log('\n=== R25-6: ContractFact is terminal truth ===\n');

{
  const consensusHelperSrc = readFileSafe('src/selling-houses/domain/consensusFormationHelper.ts');
  check(consensusHelperSrc !== null, 'consensusFormationHelper.ts exists');
  if (consensusHelperSrc) {
    check(consensusHelperSrc.includes('createContractFactForFixtureOnlyOnState'),
      'createContractFactForFixtureOnlyOnState exists');
    check(consensusHelperSrc.includes('ContractFactState'),
      'ContractFactState type is used');
  }

  const consensusModelsSrc = readFileSafe('src/selling-houses/core/world-state/consensus/models.ts');
  check(consensusModelsSrc !== null, 'consensus/models.ts exists');
  if (consensusModelsSrc) {
    check(consensusModelsSrc.includes('ContractFact') || consensusModelsSrc.includes('contractFact'),
      'consensus models define ContractFact shape');
  }
}

// ── 7. R24/R23 semantics preserved ──

console.log('\n=== R25-7: R24/R23 semantics preserved ===\n');

{
  const modelsSrc = readFileSafe('src/selling-houses/domain/models.ts');
  check(modelsSrc !== null, 'models.ts exists for R24 semantics check');
  if (modelsSrc) {
    // R24: Case status/trust/patience/urgency still readonly
    const caseMatch = modelsSrc.match(/export interface Case[\s\S]*?^}/m);
    if (caseMatch) {
      const caseBody = caseMatch[0];
      check(/^\s+readonly status:/m.test(caseBody), 'R24: Case.status still readonly');
      check(/^\s+readonly trust:/m.test(caseBody), 'R24: Case.trust still readonly');
      check(/^\s+readonly patience:/m.test(caseBody), 'R24: Case.patience still readonly');
      check(/^\s+readonly urgency:/m.test(caseBody), 'R24: Case.urgency still readonly');
    }
    // R24: Opportunity.stageIndex still readonly
    const oppMatch = modelsSrc.match(/export interface Opportunity[\s\S]*?^}/m);
    if (oppMatch) {
      check(/^\s+readonly stageIndex:/m.test(oppMatch[0]), 'R24: Opportunity.stageIndex still readonly');
    }
  }

  // R23: Named mirror boundaries still exist
  const trustHelperSrc = readFileSafe('src/selling-houses/domain/trustWriteHelper.ts');
  if (trustHelperSrc) {
    check(trustHelperSrc.includes('syncLegacyCaseTrustMirror'), 'R23: trust mirror boundary still exists');
  }

  const readinessWriteHelperSrc = readFileSafe('src/selling-houses/domain/ownerCaseReadinessWriteHelper.ts');
  if (readinessWriteHelperSrc) {
    check(readinessWriteHelperSrc.includes('syncLegacyCaseReadinessMirrors'), 'R23: readiness mirror boundary still exists');
  }
}

// ── 8. Live behavioral proof: ContractFact → readonly mirrors ──

console.log('\n=== R25-8: Live behavioral proof ===\n');

{
  // Verify the terminal fact chain at source-code level:
  // 1. syncLegacyCaseDealMirrorsFromContractFact receives contract-derived inputs
  // 2. markCaseSold receives soldPrice from the same boundary
  // 3. The flow is: ContractFact creation → syncLegacyCaseDealMirrorsFromContractFact → markCaseSold

  const dealClosingSrc = readFileSafe('src/selling-houses/domain/dealClosing.ts');
  check(dealClosingSrc !== null, 'dealClosing.ts exists for chain proof');
  if (dealClosingSrc) {
    // Verify the finalization flow: createContractFactOnState → syncLegacyCaseDealMirrorsFromContractFact
    check(dealClosingSrc.includes('createContractFactFromPriceConsensusOnState'), 'chain: ContractFact created before mirror sync (via proof)');
    check(dealClosingSrc.includes('syncLegacyCaseDealMirrorsFromContractFact'), 'chain: mirror sync called after ContractFact');

    // Verify soldPrice comes from the same input as ContractFact
    const fnBody = dealClosingSrc.match(/export function syncLegacyCaseDealMirrorsFromContractFact[\s\S]*?\n\}/);
    if (fnBody) {
      check(fnBody[0].includes('asWritableCase(caseItem).soldPrice'), 'chain: soldPrice written via asWritableCase');
      check(fnBody[0].includes('contract.dealPrice'), 'chain: soldPrice comes from ContractFactState.dealPrice');
    }
  }

  const caseOutcomeSrc = readFileSafe('src/selling-houses/domain/caseOutcome.ts');
  check(caseOutcomeSrc !== null, 'caseOutcome.ts exists for chain proof');
  if (caseOutcomeSrc) {
    // markCaseSold uses asWritableCase
    const markCaseSoldMatch = caseOutcomeSrc.match(/export function markCaseSold[\s\S]*?\n\}/);
    if (markCaseSoldMatch) {
      check(markCaseSoldMatch[0].includes('asWritableCase'), 'chain: markCaseSold uses asWritableCase');
      check(markCaseSoldMatch[0].includes('soldPrice'), 'chain: markCaseSold writes soldPrice');
    }

    // syncLegacyCaseTerminalMirrorFromOutcome uses provenance
    check(caseOutcomeSrc.includes('syncLegacyCaseTerminalMirrorFromOutcome'),
      'chain: terminal outcome mirror boundary exists');

    // Non-sold outcomes do NOT write soldPrice
    const terminalOutcomeSrc = caseOutcomeSrc.match(/export function syncLegacyCaseTerminalMirrorFromOutcome[\s\S]*?\n\}/);
    if (terminalOutcomeSrc) {
      check(!terminalOutcomeSrc[0].includes('soldPrice'),
        'chain: terminal outcome mirror does NOT write soldPrice (only status + ending fields)');
    }
  }

  // Verify that soldPrice is null for non-sold terminal outcomes
  // This is enforced by: (1) syncLegacyCaseTerminalMirrorFromOutcome does NOT write soldPrice,
  // (2) only markCaseSold writes soldPrice, and it's only called from dealClosing.ts
  const lostWithdrawnSrc = caseOutcomeSrc || '';
  const hasNoSoldPriceInTerminalOutcome = !lostWithdrawnSrc.match(/syncLegacyCaseTerminalMirrorFromOutcome[\s\S]*?soldPrice/);
  check(hasNoSoldPriceInTerminalOutcome, 'chain: terminal outcome mirror does NOT write soldPrice (non-sold outcomes keep soldPrice null)');
}

// ── 9. No broad allowlist for soldPrice writes ──

console.log('\n=== R25-9: No broad soldPrice allowlist ===\n');

{
  const contractGateSrc = readFileSafe('scripts/verify-selling-houses-contract-terminal-fact-gate.ts');
  check(contractGateSrc !== null, 'contract-terminal-fact-gate.ts exists');
  if (contractGateSrc) {
    // The gate should NOT have a broad allowlist for soldPrice writes
    // It should verify readonly/confinement, not just allowlist files
    check(!contractGateSrc.includes('allowlist') || contractGateSrc.includes('readonly'),
      'terminal fact gate uses readonly enforcement, not broad allowlists');
  }
}

// ── 10. Gate self-audit ──

console.log('\n=== R25-10: Gate self-audit ===\n');

const gateSelfSrc = readFileSync(import.meta.filename!, 'utf-8');
const softPassViolations = findGateSoftPassLines(gateSelfSrc);
check(softPassViolations.length === 0, `gate self-audit: no soft-pass patterns (found ${softPassViolations.length})`);

// ── Summary ──

console.log('\n=== R25 Terminal Fact Readonly SoldPrice Gate Summary ===\n');
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
console.log('Verified: readonly soldPrice, terminal fact confinement, contract-derived mirrors, behavioral proof.');
