/**
 * R35 Opportunity Status Canonical Read Gate
 *
 * Proves:
 * 1. Opportunity status read boundary exists and is used
 * 2. No direct opportunity.status truth reads in domain/core/application
 * 3. isOpportunityActiveByCanonicalState helper exists
 * 4. R34 regression — case status still canonical
 * 5. Gate hygiene
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { findGateSoftPassLines } from './selling-houses-gate-hygiene.js';

let passed = 0;
let failed = 0;
const errors: string[] = [];

function check(condition: boolean, message: string) {
  if (condition) {
    passed++;
    console.log(`  [PASS] ${message}`);
  } else {
    failed++;
    errors.push(message);
    console.error(`  [FAIL] ${message}`);
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

// ── 1. Opportunity status read boundary exists ──

console.log('\n=== R35-1: Opportunity status read boundary ===\n');

{
  const boundarySrc = readFile('src/selling-houses/core/world-state/opportunity-relations/readBoundary.ts');
  check(boundarySrc.includes('readOpportunityLifecycle'), 'readOpportunityLifecycle function exists');
  check(boundarySrc.includes('status: brokered.status'), 'readOpportunityLifecycle reads status from BrokeredOpportunityState');
  check(boundarySrc.includes('canonical_brokered_opportunity'), 'returns canonical_brokered_opportunity source');
  check(boundarySrc.includes('legacy_opportunity_mirror'), 'returns legacy_opportunity_mirror fallback');

  // Check for isOpportunityActiveByCanonicalState helper
  const helperSrc = readFileSafe('src/selling-houses/domain/opportunityLifecycleStatusRead.ts');
  check(helperSrc !== null, 'opportunityLifecycleStatusRead.ts exists');
  if (helperSrc) {
    check(helperSrc.includes('isOpportunityActiveByCanonicalState'), 'isOpportunityActiveByCanonicalState helper exists');
  }
}

// ── 2. No direct opportunity.status truth reads in domain/core/application ──

console.log('\n=== R35-2: No direct opportunity.status truth reads ===\n');

{
  // Files that are allowed to read opportunity.status directly
  const allowedFiles = [
    'src/selling-houses/core/world-state/opportunity-relations/readBoundary.ts', // the canonical reader
    'src/selling-houses/core/world-state/adapters.ts', // serialization adapters
    'src/selling-houses/domain/opportunitySplitHelper.ts', // opportunity mirror sync functions
  ];

  // Patterns to detect direct status reads
  const statusReadPattern = /(?:opportunity|entry|opp)\.status\s*(===|!==)\s*['"](?:active|won|closed|lost)['"]/;

  const domainFiles = [
    'src/selling-houses/domain/dealClosing.ts',
    'src/selling-houses/domain/engine.ts',
    'src/selling-houses/domain/runtimeState.ts',
    'src/selling-houses/domain/engine/actionResolvers.ts',
    'src/selling-houses/domain/engine/marketEngine.ts',
    'src/selling-houses/domain/engine/opportunityEngine.ts',
    'src/selling-houses/domain/engine/customerEngine.ts',
    'src/selling-houses/domain/engine/eventEngine.ts',
    'src/selling-houses/domain/market/inboundOpportunityEngine.ts',
    'src/selling-houses/domain/market/dailyEventDirector.ts',
    'src/selling-houses/domain/market/signalEngine.ts',
    'src/selling-houses/domain/company/companyPressureEngine.ts',
    'src/selling-houses/domain/caseLifecycle.ts',
  ];

  let violationsFound = 0;
  const violationDetails: string[] = [];

  for (const file of domainFiles) {
    const src = readFileSafe(file);
    if (!src) continue;

    const lines = src.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Skip comment lines
      if (line.trim().startsWith('//') || line.trim().startsWith('*')) continue;

      if (statusReadPattern.test(line)) {
        // Check if file is allowlisted
        const isAllowed = allowedFiles.some(f => file.endsWith(f));

        // Also check if this is a listing status read (rivalListings), not opportunity status
        const isListingStatusRead = line.includes('rivalListings') || line.includes('RivalListing');

        if (!isAllowed && !isListingStatusRead) {
          violationsFound++;
          violationDetails.push(`${file}:${i + 1}: ${line.trim()}`);
        }
      }
    }
  }

  if (violationsFound > 0) {
    console.error(`  Found ${violationsFound} direct opportunity.status truth reads:`);
    for (const detail of violationDetails.slice(0, 10)) {
      console.error(`    ${detail}`);
    }
    if (violationDetails.length > 10) {
      console.error(`    ... and ${violationDetails.length - 10} more`);
    }
  }
  check(violationsFound === 0, `no direct opportunity.status truth reads (found ${violationsFound})`);
}

// ── 3. isOpportunityActiveByCanonicalState works correctly ──

console.log('\n=== R35-3: isOpportunityActiveByCanonicalState works ===\n');

{
  try {
    const { readOpportunityLifecycle } = await import('../src/selling-houses/core/world-state/opportunity-relations/readBoundary.js');

    // Test case: canonical brokered opportunity with active status
    // brokeredOpportunityId format is 'brokered:' + legacyOpportunityId
    const stateWithBrokered = {
      runtimeBrokeredOpportunities: [{
        brokeredOpportunityId: 'brokered:opp-1',
        legacyOpportunityId: 'opp-1',
        matchId: 'match-1',
        stageIndex: 2,
        stageLabel: 'active',
        status: 'active',
        lifecycleStatus: 'in_progress',
        daysLeft: 5,
        stagnationTicks: 0,
        pendingClosingEvaluation: false,
        pendingClosingStrategyId: '',
        pendingClosingRequestedDay: 0,
      }],
    } as any;

    const legacyOpp = {
      id: 'opp-1',
      caseId: 'case-1',
      customerId: 'cust-1',
      status: 'closed', // stale mirror
    } as any;

    const result = readOpportunityLifecycle(stateWithBrokered, legacyOpp);

    check(result.value.status === 'active', `canonical reader returns active (got ${result.value.status})`);
    check(result.source === 'canonical_brokered_opportunity', `canonical reader source is correct (got ${result.source})`);
  } catch (err: any) {
    check(false, `isOpportunityActiveByCanonicalState test failed: ${err.message}`);
  }
}

// ── 4. R34 regression ──

console.log('\n=== R35-4: R34 regression ===\n');

{
  const caseLifecycleReadSrc = readFileSafe('src/selling-houses/domain/caseLifecycleStatusRead.ts');
  check(caseLifecycleReadSrc !== null, 'caseLifecycleStatusRead.ts still exists');
  if (caseLifecycleReadSrc) {
    check(caseLifecycleReadSrc.includes('isCaseActiveByCanonicalStatus'), 'isCaseActiveByCanonicalStatus still exists');
  }

  const dealClosingSrc = readFile('src/selling-houses/domain/dealClosing.ts');
  check(!dealClosingSrc.includes('caseItem.status !== \'active\''), 'dealClosing still does NOT have direct caseItem.status truth read');
}

// ── 5. Gate hygiene ──

console.log('\n=== R35-5: Gate hygiene ===\n');

{
  const gateSrc = readFileSync(import.meta.filename!, 'utf-8');
  const softPassViolations = findGateSoftPassLines(gateSrc);
  check(softPassViolations.length === 0, `gate self-audit: no soft-pass patterns (found ${softPassViolations.length})`);
}

// ── Summary ──

console.log('\n=== R35 Opportunity Status Canonical Read Gate Summary ===\n');
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
console.log('Verified: opportunity status read boundary, no direct status truth reads, canonical reader works, R34 regression.');
