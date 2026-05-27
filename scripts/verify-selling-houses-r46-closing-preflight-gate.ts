/**
 * R46 — Closing Preflight / Player Explanation Gate
 *
 * Proves:
 * 1. ClosingPreflightResult type exists in core (pure, deterministic)
 * 2. buildClosingPreflight exists as pure function
 * 3. Preflight correctly identifies missing buyer offer
 * 4. Preflight correctly identifies missing owner concession
 * 5. Preflight correctly identifies canonical evidence
 * 6. Preflight correctly identifies legacy-only evidence
 * 7. Preflight generates player-facing explanation (not AI slop)
 * 8. Preflight does NOT create canonical facts
 * 9. Preflight does NOT reference soldPrice/expectedPrice to fabricate
 * 10. Layer boundary compliance
 * 11. Gate self-audit
 *
 * Usage: npx tsx scripts/verify-selling-houses-r46-closing-preflight-gate.ts
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  buildClosingPreflight,
  type ClosingPreflightResult,
} from '../src/selling-houses/core/world-state/consensus/closingPreflight.js';
import type { GameStateForEvidence } from '../src/selling-houses/core/world-state/consensus/canonicalEvidenceBuilder.js';

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

function fileExists(path: string): boolean {
  return existsSync(resolve(path));
}

// ════════════════════════════════════════════════════════════════════════════
// 1. Type Existence
// ════════════════════════════════════════════════════════════════════════════

console.log('\n=== R46-1: Type Existence ===\n');

const preflightExists = fileExists('src/selling-houses/core/world-state/consensus/closingPreflight.ts');
check(preflightExists, 'closingPreflight.ts exists in core layer');

if (preflightExists) {
  const preflightCode = readFile('src/selling-houses/core/world-state/consensus/closingPreflight.ts');

  check(preflightCode.includes('export interface ClosingPreflightResult'), 'ClosingPreflightResult interface exported');
  check(preflightCode.includes('export function buildClosingPreflight'), 'buildClosingPreflight exported');

  // Must NOT import from domain
  check(!preflightCode.includes("from '../../domain/"), 'core preflight does NOT import from domain layer');
  check(!preflightCode.includes("from '../domain/"), 'core preflight does NOT import from domain layer');
}

// ════════════════════════════════════════════════════════════════════════════
// 2. Missing Buyer Offer
// ════════════════════════════════════════════════════════════════════════════

console.log('\n=== R46-2: Missing Buyer Offer ===\n');

{
  const state: GameStateForEvidence = {
    pendingSourceRecords: [],
  };

  const result = buildClosingPreflight({
    state,
    caseId: 'case-1',
    customerId: 'cust-1',
    ownerId: 'owner-1',
    day: 10,
    caseTitle: 'A房',
    customerName: '李女士',
    ownerName: '王先生',
  });

  check(!result.hasBuyerOffer, 'no buyer offer found');
  check(!result.hasOwnerConcession, 'no owner concession found');
  check(!result.canSign, 'cannot sign without evidence');
  check(result.evidenceQuality === 'no_evidence', 'evidence quality is no_evidence');
  check(result.blockers.length >= 2, 'has blockers for missing evidence');
  check(result.playerExplanation.includes('李女士'), 'explanation mentions customer name');
  check(result.playerExplanation.includes('A房'), 'explanation mentions case title');
  check(result.playerExplanation.includes('出价'), 'explanation mentions offer');
  check(result.convergenceTrend === 'no_data', 'convergence trend is no_data');
}

// ════════════════════════════════════════════════════════════════════════════
// 3. Missing Owner Concession
// ════════════════════════════════════════════════════════════════════════════

console.log('\n=== R46-3: Missing Owner Concession ===\n');

{
  const state: GameStateForEvidence = {
    pendingSourceRecords: [
      {
        sourceId: 'isr-offer-1',
        sourceKind: 'customer_interaction',
        day: 5,
        payload: {
          subtype: 'offer_submitted',
          customerId: 'cust-1',
          caseId: 'case-1',
          offerPrice: 880,
        },
        confidence: 0.8,
      },
    ],
  };

  const result = buildClosingPreflight({
    state,
    caseId: 'case-1',
    customerId: 'cust-1',
    ownerId: 'owner-1',
    day: 10,
    caseTitle: 'A房',
    customerName: '李女士',
    ownerName: '王先生',
  });

  check(result.hasBuyerOffer, 'buyer offer found');
  check(result.buyerOfferPrice === 880, 'buyer offer price is 880');
  check(!result.hasOwnerConcession, 'no owner concession found');
  check(!result.canSign, 'cannot sign without owner concession');
  check(result.evidenceQuality === 'legacy_compatibility_projection', 'evidence quality is legacy (partial)');
  check(result.playerExplanation.includes('王先生'), 'explanation mentions owner name');
  check(result.playerExplanation.includes('让价'), 'explanation mentions concession');
}

// ════════════════════════════════════════════════════════════════════════════
// 4. Canonical Evidence — Gap Too Large
// ════════════════════════════════════════════════════════════════════════════

console.log('\n=== R46-4: Canonical Evidence — Gap Too Large ===\n');

{
  const state: GameStateForEvidence = {
    pendingSourceRecords: [
      {
        sourceId: 'isr-offer-1',
        sourceKind: 'customer_interaction',
        day: 5,
        payload: {
          subtype: 'offer_submitted',
          customerId: 'cust-1',
          caseId: 'case-1',
          offerPrice: 880,
        },
        confidence: 0.8,
      },
      {
        sourceId: 'isr-concession-1',
        sourceKind: 'owner_interview',
        day: 7,
        payload: {
          subtype: 'price_discussed',
          ownerId: 'owner-1',
          caseId: 'case-1',
          priceMentioned: 950,
          tone: 'neutral',
        },
        confidence: 0.7,
      },
    ],
  };

  const result = buildClosingPreflight({
    state,
    caseId: 'case-1',
    customerId: 'cust-1',
    ownerId: 'owner-1',
    day: 10,
    caseTitle: 'A房',
    customerName: '李女士',
    ownerName: '王先生',
    marketPrice: 920,
    askPrice: 980,
  });

  check(result.hasBuyerOffer, 'buyer offer found');
  check(result.hasOwnerConcession, 'owner concession found');
  check(result.buyerOfferPrice === 880, 'buyer offer price is 880');
  check(result.ownerConcessionPrice === 950, 'owner concession price is 950');
  check(result.evidenceQuality === 'canonical', 'evidence quality is canonical');
  check(!result.canSign, 'cannot sign (gap too large)');
  check(result.currentGap > result.requiredGap, `gap ${result.currentGap} > required ${result.requiredGap}`);
  check(result.playerExplanation.includes('880'), 'explanation mentions buyer price');
  check(result.playerExplanation.includes('950'), 'explanation mentions owner price');
  check(result.playerExplanation.includes('920'), 'explanation mentions market price');
  check(result.playerExplanation.includes('980'), 'explanation mentions ask price');
}

// ════════════════════════════════════════════════════════════════════════════
// 5. Canonical Evidence — Gap Closed
// ════════════════════════════════════════════════════════════════════════════

console.log('\n=== R46-5: Canonical Evidence — Gap Closed ===\n');

{
  const state: GameStateForEvidence = {
    pendingSourceRecords: [
      {
        sourceId: 'isr-offer-1',
        sourceKind: 'customer_interaction',
        day: 5,
        payload: {
          subtype: 'offer_submitted',
          customerId: 'cust-1',
          caseId: 'case-1',
          offerPrice: 940,
        },
        confidence: 0.8,
      },
      {
        sourceId: 'isr-concession-1',
        sourceKind: 'owner_interview',
        day: 7,
        payload: {
          subtype: 'price_discussed',
          ownerId: 'owner-1',
          caseId: 'case-1',
          priceMentioned: 945,
          tone: 'positive',
        },
        confidence: 0.7,
      },
    ],
  };

  const result = buildClosingPreflight({
    state,
    caseId: 'case-1',
    customerId: 'cust-1',
    ownerId: 'owner-1',
    day: 10,
    caseTitle: 'A房',
    customerName: '李女士',
    ownerName: '王先生',
  });

  check(result.hasBuyerOffer, 'buyer offer found');
  check(result.hasOwnerConcession, 'owner concession found');
  check(result.evidenceQuality === 'canonical', 'evidence quality is canonical');
  check(result.currentGap <= result.requiredGap, `gap ${result.currentGap} <= required ${result.requiredGap}`);
  check(result.canSign, 'can sign (gap closed)');
  check(result.playerExplanation.includes('可以签约'), 'explanation says can sign');
}

// ════════════════════════════════════════════════════════════════════════════
// 6. Does NOT Fabricate Prices
// ════════════════════════════════════════════════════════════════════════════

console.log('\n=== R46-6: Does NOT Fabricate Prices ===\n');

{
  const preflightCode = readFile('src/selling-houses/core/world-state/consensus/closingPreflight.ts');

  // Must NOT reference soldPrice
  check(!preflightCode.includes('soldPrice'), 'preflight does NOT reference soldPrice');
  // Must NOT reference expectedPrice
  check(!preflightCode.includes('expectedPrice'), 'preflight does NOT reference expectedPrice');
  // Must NOT create canonical facts
  check(!preflightCode.includes('proofKind'), 'preflight does NOT create proofKind');
  check(!preflightCode.includes('ContractFact'), 'preflight does NOT create ContractFact');
}

// ════════════════════════════════════════════════════════════════════════════
// 7. Layer Boundary Compliance
// ════════════════════════════════════════════════════════════════════════════

console.log('\n=== R46-7: Layer Boundary Compliance ===\n');

{
  const preflightCode = readFile('src/selling-houses/core/world-state/consensus/closingPreflight.ts');

  // Only imports from core layer
  check(
    preflightCode.includes("from './priceTrajectory.js'"),
    'imports from priceTrajectory.js (core)',
  );
  check(
    preflightCode.includes("from './negotiationProcessBridge.js'"),
    'imports from negotiationProcessBridge.js (core)',
  );
  check(
    preflightCode.includes("from './canonicalEvidenceBuilder.js'"),
    'imports from canonicalEvidenceBuilder.js (core)',
  );

  // No domain imports
  check(!preflightCode.includes("from '../../domain/"), 'no domain imports');
  check(!preflightCode.includes("from '../domain/"), 'no domain imports');

  // Pure functions
  check(!preflightCode.includes('Date.now'), 'no Date.now');
  check(!preflightCode.includes('Math.random'), 'no Math.random');
  check(!preflightCode.includes('fetch('), 'no fetch');
}

// ════════════════════════════════════════════════════════════════════════════
// 8. Gate Self-Audit
// ════════════════════════════════════════════════════════════════════════════

console.log('\n=== R46-8: Gate Self-Audit ===\n');

// Strip comments and string literals before checking for soft-pass patterns
function stripCommentsAndStrings(src: string): string {
  let result = src.replace(/\/\*[\s\S]*?\*\//g, '');
  result = result.replace(/\/\/.*$/gm, '');
  result = result.replace(/'[^']*'/g, "''");
  result = result.replace(/"[^"]*"/g, '""');
  result = result.replace(/`[^`]*`/g, '``');
  return result;
}

const gateSrc = readFile('scripts/verify-selling-houses-r46-closing-preflight-gate.ts');
const gateSrcClean = stripCommentsAndStrings(gateSrc);

check(!gateSrcClean.includes('check(true,'), 'no check(true) in gate');
check(!gateSrcClean.includes('|| true'), 'no || true in gate');
check(!gateSrcClean.includes('warn('), 'no warn() soft pass in gate');

// ════════════════════════════════════════════════════════════════════════════
// Summary
// ════════════════════════════════════════════════════════════════════════════

console.log('\n═══════════════════════════════════════════════════════════════');
console.log(`  R46 Closing Preflight / Player Explanation Gate`);
console.log(`  Passed: ${passed} | Failed: ${failed}`);
console.log('═══════════════════════════════════════════════════════════════');

if (failed > 0) {
  console.error('\n  Failed checks:');
  for (const err of errors) {
    console.error(`    - ${err}`);
  }
  process.exit(1);
}

console.log('\n  ✅ All checks passed.');
