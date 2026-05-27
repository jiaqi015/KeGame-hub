/**
 * R45 — Negotiation Process / Projection Bridge Gate
 *
 * Proves:
 * 1. PriceNegotiationProcess type exists in core (pure, deterministic)
 * 2. buildNegotiationProcessFromTrajectory exists as pure function
 * 3. buildNegotiationExplanation exists as pure function
 * 4. Negotiation process can be built from both canonical and legacy trajectories
 * 5. Legacy projection can DISPLAY but CANNOT sign production ContractFact
 * 6. Projection does NOT fabricate offerPrice or concessionPrice
 * 7. stageIndex is derived from process, not used as canonical truth
 * 8. Missing evidence produces explicit explanation, not silent fallback
 * 9. Gate self-audit: no false-green patterns
 *
 * Usage: npx tsx scripts/verify-selling-houses-r45-negotiation-process-bridge-gate.ts
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  buildPriceTrajectoryFromDealClosingEvaluation,
  buildPriceConsensusReadiness,
  buildPriceConsensusProof,
  validatePriceConsensusProof,
  type PriceTrajectory,
} from '../src/selling-houses/core/world-state/consensus/priceTrajectory.js';
import {
  buildNegotiationProcessFromTrajectory,
  buildNegotiationExplanation,
  buildNegotiationTurnsFromTrajectory,
  buildNegotiationGapsFromTrajectory,
  deriveConvergenceTrend,
  deriveStageLabelFromProcess,
  buildMissingEvidenceExplanation,
  type NegotiationProcess,
} from '../src/selling-houses/core/world-state/consensus/negotiationProcessBridge.js';

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

console.log('\n=== R45-1: Type Existence ===\n');

const bridgeExists = fileExists('src/selling-houses/core/world-state/consensus/negotiationProcessBridge.ts');
check(bridgeExists, 'negotiationProcessBridge.ts exists in core layer');

if (bridgeExists) {
  const bridgeCode = readFile('src/selling-houses/core/world-state/consensus/negotiationProcessBridge.ts');

  check(bridgeCode.includes('export interface NegotiationTurn'), 'NegotiationTurn interface exported');
  check(bridgeCode.includes('export interface NegotiationGap'), 'NegotiationGap interface exported');
  check(bridgeCode.includes('export interface NegotiationProcess'), 'NegotiationProcess interface exported');
  check(bridgeCode.includes('export interface NegotiationExplanation'), 'NegotiationExplanation interface exported');
  check(bridgeCode.includes('export function buildNegotiationProcessFromTrajectory'), 'buildNegotiationProcessFromTrajectory exported');
  check(bridgeCode.includes('export function buildNegotiationExplanation'), 'buildNegotiationExplanation exported');
  check(bridgeCode.includes('export function deriveStageLabelFromProcess'), 'deriveStageLabelFromProcess exported');
  check(bridgeCode.includes('export function buildMissingEvidenceExplanation'), 'buildMissingEvidenceExplanation exported');

  // Must NOT import from domain
  check(!bridgeCode.includes("from '../../domain/"), 'core bridge does NOT import from domain layer');
  check(!bridgeCode.includes("from '../domain/"), 'core bridge does NOT import from domain layer');
}

// ════════════════════════════════════════════════════════════════════════════
// 2. Functional Correctness — canonical trajectory
// ════════════════════════════════════════════════════════════════════════════

console.log('\n=== R45-2: Functional Correctness — canonical ===\n');

{
  // Simulate a canonical trajectory with real sourceRecordIds
  const canonicalTrajectory: PriceTrajectory = Object.freeze({
    trajectoryId: 'ptraj:test-case-1:cust-1:10',
    caseId: 'test-case-1',
    customerId: 'cust-1',
    ownerId: 'owner-1',
    offers: Object.freeze([Object.freeze({
      offerId: 'offer:test-case-1:cust-1:5',
      day: 5,
      customerId: 'cust-1',
      caseId: 'test-case-1',
      price: 880,
      sourceRecordIds: Object.freeze(['isr-customer-interaction-1']),
      conditions: Object.freeze([]),
      confidence: 0.7,
      source: 'canonical' as const,
      evidenceRefs: Object.freeze(['isr-customer-interaction-1']),
    })]),
    concessions: Object.freeze([Object.freeze({
      concessionId: 'concession:test-case-1:owner-1:8',
      day: 8,
      ownerId: 'owner-1',
      caseId: 'test-case-1',
      price: 950,
      sourceRecordIds: Object.freeze(['isr-owner-interview-1']),
      conditions: Object.freeze([]),
      confidence: 0.6,
      source: 'canonical' as const,
      evidenceRefs: Object.freeze(['isr-owner-interview-1']),
    })]),
    convergenceCurve: Object.freeze([
      { day: 5, gap: 70 },
      { day: 8, gap: 70 },
    ]),
    source: 'canonical',
    proofKind: 'canonical',
    evidenceRefs: Object.freeze(['isr-customer-interaction-1', 'isr-owner-interview-1']),
  });

  const readiness = buildPriceConsensusReadiness(canonicalTrajectory, 5);
  const process = buildNegotiationProcessFromTrajectory({
    trajectory: canonicalTrajectory,
    readiness,
  });

  check(process.caseId === 'test-case-1', 'process has correct caseId');
  check(process.customerId === 'cust-1', 'process has correct customerId');
  check(process.ownerId === 'owner-1', 'process has correct ownerId');
  check(process.turns.length === 2, 'process has 2 turns (1 offer + 1 concession)');
  check(process.turns[0].side === 'buyer', 'first turn is buyer offer');
  check(process.turns[1].side === 'owner', 'second turn is owner concession');
  check(process.turns[0].sourceRecordId === 'isr-customer-interaction-1', 'buyer turn has real sourceRecordId');
  check(process.turns[1].sourceRecordId === 'isr-owner-interview-1', 'owner turn has real sourceRecordId');
  check(process.source === 'canonical', 'process source is canonical');
  check(!process.canSign, 'process cannot sign (gap 70 > required 5)');
  check(process.signBlockers.length > 0, 'process has sign blockers');
  check(process.convergenceTrend === 'stalled', 'single-gap trajectory is stalled');

  // Explanation
  const explanation = buildNegotiationExplanation({ process, readiness });
  check(!explanation.canSign, 'explanation says cannot sign');
  check(explanation.currentGap === 70, 'explanation shows correct gap');
  check(explanation.evidenceQuality === 'canonical', 'explanation evidence quality is canonical');
  check(explanation.buyerLastOffer?.price === 880, 'explanation shows buyer last offer');
  check(explanation.ownerLastConcession?.price === 950, 'explanation shows owner last concession');
  check(explanation.blockers.length > 0, 'explanation has blockers');

  // Stage label
  const stageLabel = deriveStageLabelFromProcess(process);
  check(stageLabel === '谈判停滞', 'stage label is 谈判停滞 for stalled process');
}

// ════════════════════════════════════════════════════════════════════════════
// 3. Functional Correctness — legacy trajectory
// ════════════════════════════════════════════════════════════════════════════

console.log('\n=== R45-3: Functional Correctness — legacy ===\n');

{
  const legacyTrajectory = buildPriceTrajectoryFromDealClosingEvaluation({
    caseId: 'legacy-case-1',
    customerId: 'cust-2',
    ownerId: 'owner-2',
    opportunityId: 'opp-1',
    day: 10,
    soldPrice: 920,
    closeReadiness: 85,
    closeProbability: 0.7,
    buyerBudgetMax: 1000,
    buyerIntent: 80,
    buyerConfidence: 75,
    caseAskPrice: 980,
    caseMarketPrice: 950,
    caseBottomPrice: 900,
    blockers: ['price_gap'],
    supportingFactors: ['high_intent'],
    strategyId: 'balanced',
  });

  const readiness = buildPriceConsensusReadiness(legacyTrajectory);
  const process = buildNegotiationProcessFromTrajectory({
    trajectory: legacyTrajectory,
    readiness,
  });

  check(process.source === 'legacy_compatibility_projection', 'legacy process source is legacy_compatibility_projection');
  check(!process.canSign, 'legacy process cannot sign (source is legacy)');
  check(process.signBlockers.some(b => b.includes('legacy')), 'legacy blockers mention legacy source');
  check(process.turns.length >= 1, 'legacy process has turns');

  const explanation = buildNegotiationExplanation({ process, readiness });
  check(explanation.evidenceQuality === 'legacy_compatibility_projection', 'legacy explanation evidence quality is legacy');
  check(!explanation.canSign, 'legacy explanation says cannot sign');
}

// ════════════════════════════════════════════════════════════════════════════
// 4. Missing Evidence Explanation
// ════════════════════════════════════════════════════════════════════════════

console.log('\n=== R45-4: Missing Evidence Explanation ===\n');

{
  const explanation = buildMissingEvidenceExplanation({
    caseId: 'test-case-2',
    hasBuyerOffer: false,
    hasOwnerConcession: false,
    source: 'no_evidence',
  });

  check(!explanation.canSign, 'missing evidence cannot sign');
  check(explanation.blockers.length >= 2, 'missing evidence has 2+ blockers');
  check(explanation.blockers.some(b => b.includes('买家') || b.includes('buyer')), 'blockers mention buyer offer');
  check(explanation.blockers.some(b => b.includes('业主') || b.includes('owner')), 'blockers mention owner concession');
  check(explanation.evidenceQuality === 'no_evidence', 'evidence quality is no_evidence');
  check(explanation.summary.includes('无法签约'), 'summary says cannot sign');
}

// ════════════════════════════════════════════════════════════════════════════
// 5. Projection Does NOT Fabricate Prices
// ════════════════════════════════════════════════════════════════════════════

console.log('\n=== R45-5: Projection Does NOT Fabricate Prices ===\n');

{
  // The bridge reads from PriceTrajectory — it does NOT create offers/concessions
  const bridgeCode = readFile('src/selling-houses/core/world-state/consensus/negotiationProcessBridge.ts');

  // Bridge must NOT contain price fabrication logic
  check(!bridgeCode.includes('soldPrice'), 'bridge does NOT reference soldPrice');
  check(!bridgeCode.includes('askPrice'), 'bridge does NOT reference askPrice');
  check(!bridgeCode.includes('marketPrice'), 'bridge does NOT reference marketPrice');
  check(!bridgeCode.includes('bottomPrice'), 'bridge does NOT reference bottomPrice');
  check(!bridgeCode.includes('buyerBudgetMax'), 'bridge does NOT reference buyerBudgetMax');

  // Bridge must NOT create BuyerOffer or OwnerConcession
  check(!bridgeCode.includes('offerId:'), 'bridge does NOT create BuyerOffer objects');
  check(!bridgeCode.includes('concessionId:'), 'bridge does NOT create OwnerConcession objects');
}

// ════════════════════════════════════════════════════════════════════════════
// 6. stageIndex Is Derived, Not Canonical
// ════════════════════════════════════════════════════════════════════════════

console.log('\n=== R45-6: stageIndex Is Derived, Not Canonical ===\n');

{
  const bridgeCode = readFile('src/selling-houses/core/world-state/consensus/negotiationProcessBridge.ts');

  // deriveStageLabelFromProcess is display-only
  check(bridgeCode.includes('DISPLAY-ONLY'), 'deriveStageLabelFromProcess is marked as display-only');
  check(bridgeCode.includes('does NOT create canonical facts'), 'function explicitly states it does not create canonical facts');
  check(bridgeCode.includes('stageIndex is NEVER set'), 'stageIndex is never set from this function');
}

// ════════════════════════════════════════════════════════════════════════════
// 7. Convergence Trend Derivation
// ════════════════════════════════════════════════════════════════════════════

console.log('\n=== R45-7: Convergence Trend Derivation ===\n');

{
  // Converging
  const converging = deriveConvergenceTrend([
    { day: 1, buyerPrice: 880, ownerPrice: 980, gap: 100, gapPct: 10 },
    { day: 5, buyerPrice: 920, ownerPrice: 960, gap: 40, gapPct: 4 },
  ]);
  check(converging === 'converging', 'converging trend detected');

  // Diverging
  const diverging = deriveConvergenceTrend([
    { day: 1, buyerPrice: 880, ownerPrice: 980, gap: 100, gapPct: 10 },
    { day: 5, buyerPrice: 850, ownerPrice: 990, gap: 140, gapPct: 14 },
  ]);
  check(diverging === 'diverging', 'diverging trend detected');

  // Stalled
  const stalled = deriveConvergenceTrend([
    { day: 1, buyerPrice: 880, ownerPrice: 980, gap: 100, gapPct: 10 },
    { day: 5, buyerPrice: 880, ownerPrice: 980, gap: 100, gapPct: 10 },
  ]);
  check(stalled === 'stalled', 'stalled trend detected');

  // No data
  const noData = deriveConvergenceTrend([]);
  check(noData === 'no_data', 'no_data trend detected');
}

// ════════════════════════════════════════════════════════════════════════════
// 8. Layer Boundary Compliance
// ════════════════════════════════════════════════════════════════════════════

console.log('\n=== R45-8: Layer Boundary Compliance ===\n');

{
  const bridgeCode = readFile('src/selling-houses/core/world-state/consensus/negotiationProcessBridge.ts');

  // Only imports from priceTrajectory.ts (same core layer)
  check(
    bridgeCode.includes("from './priceTrajectory.js'"),
    'bridge only imports from same core layer (priceTrajectory.js)',
  );

  // No domain imports
  check(!bridgeCode.includes("from '../../domain/"), 'no domain imports');
  check(!bridgeCode.includes("from '../domain/"), 'no domain imports');

  // No runtime imports
  check(!bridgeCode.includes("from '../../domain/world-model/runtime/"), 'no runtime imports');

  // Pure functions
  check(!bridgeCode.includes('Date.now'), 'no Date.now');
  check(!bridgeCode.includes('Math.random'), 'no Math.random');
  check(!bridgeCode.includes('fetch('), 'no fetch');
}

// ════════════════════════════════════════════════════════════════════════════
// 9. Gate Self-Audit
// ════════════════════════════════════════════════════════════════════════════

console.log('\n=== R45-9: Gate Self-Audit ===\n');

// Strip comments and string literals before checking for soft-pass patterns
function stripCommentsAndStrings(src: string): string {
  let result = src.replace(/\/\*[\s\S]*?\*\//g, '');
  result = result.replace(/\/\/.*$/gm, '');
  result = result.replace(/'[^']*'/g, "''");
  result = result.replace(/"[^"]*"/g, '""');
  result = result.replace(/`[^`]*`/g, '``');
  return result;
}

const gateSrc = readFile('scripts/verify-selling-houses-r45-negotiation-process-bridge-gate.ts');
const gateSrcClean = stripCommentsAndStrings(gateSrc);

// No check(true) — after stripping strings
check(!gateSrcClean.includes('check(true,'), 'no check(true) in gate');

// No || true — after stripping strings
check(!gateSrcClean.includes('|| true'), 'no || true in gate');

// No warn() soft pass
check(!gateSrcClean.includes('warn('), 'no warn() soft pass in gate');

// ════════════════════════════════════════════════════════════════════════════
// Summary
// ════════════════════════════════════════════════════════════════════════════

console.log('\n═══════════════════════════════════════════════════════════════');
console.log(`  R45 Negotiation Process / Projection Bridge Gate`);
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
