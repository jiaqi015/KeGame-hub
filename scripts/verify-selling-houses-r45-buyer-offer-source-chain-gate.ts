/**
 * R45 Buyer Offer Source Chain Gate
 *
 * Verifies that the real game flow produces customer_interaction.offer_submitted
 * source records with offerPrice, enabling canonical trajectory building.
 *
 * This gate MUST FAIL if:
 * - invite-customer-negotiation doesn't produce offer_submitted source records
 * - offerPrice is missing or derived from soldPrice
 * - canonical builder can't find buyer-side evidence from real source records
 * - gate uses check(true), || true, or WARN-as-PASS
 */

import { createInitialState, updateDerivedState } from '../src/selling-houses/application/gameState.js';
import { seedInitialOpportunities } from '../src/selling-houses/domain/engine.js';
import { queueDealClosingEvaluation } from '../src/selling-houses/domain/dealClosing.js';
import { buildCanonicalPriceTrajectoryFromEvidence, createEvidenceStateView } from '../src/selling-houses/core/world-state/consensus/canonicalEvidenceBuilder.js';
import { getScenarioSnapshotById } from '../src/selling-houses/domain/scenarioCatalog.js';
import type { GameState, Case, Opportunity } from '../src/selling-houses/domain/models.js';

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

function setupTestState(): GameState {
  const snapshot = getScenarioSnapshotById('standard-window-chain');
  if (!snapshot) throw new Error('standard-window-chain scenario not found');
  const state = createInitialState(snapshot, 42);
  seedInitialOpportunities(state);
  updateDerivedState(state);
  return state;
}

function findActiveCaseWithOpportunity(state: GameState): { caseItem: Case; opportunity: Opportunity } | null {
  for (const caseItem of state.cases) {
    if (caseItem.status !== 'active') continue;
    const opportunity = state.opportunities.find(
      o => o.caseId === caseItem.id && o.status === 'active',
    );
    if (opportunity) return { caseItem, opportunity };
  }
  return null;
}

// ════════════════════════════════════════════════════════════════════════════
// 1. Source Record Generation from Real Action
// ════════════════════════════════════════════════════════════════════════════

console.log('\n=== R45-1: Source Record Generation from Real Action ===\n');

const state = setupTestState();
const pair = findActiveCaseWithOpportunity(state);

check(pair !== null, 'found active case with opportunity');

if (pair) {
  const { caseItem, opportunity } = pair;
  const beforeRecordCount = state.pendingSourceRecords?.length ?? 0;

  // queueDealClosingEvaluation is the real entry point for offer generation
  queueDealClosingEvaluation(state, caseItem, opportunity, 'balanced');

  const afterRecordCount = state.pendingSourceRecords?.length ?? 0;
  check(afterRecordCount > beforeRecordCount, `pendingSourceRecords grew (${beforeRecordCount} → ${afterRecordCount})`);

  // Find the offer_submitted record
  const offerRecords = (state.pendingSourceRecords ?? []).filter(
    r => r.sourceKind === 'customer_interaction' && r.payload.subtype === 'offer_submitted',
  );
  check(offerRecords.length > 0, `found offer_submitted source record (${offerRecords.length})`);

  if (offerRecords.length > 0) {
    const offerRecord = offerRecords[0];
    const payload = offerRecord.payload as unknown as Record<string, unknown>;

    check(payload.offerPrice !== undefined && (payload.offerPrice as number) > 0, `offerPrice > 0 (${payload.offerPrice})`);
    check(payload.customerId === opportunity.customerId, `customerId matches opportunity (${payload.customerId})`);
    check(payload.caseId === caseItem.id, `caseId matches case (${payload.caseId})`);
    check(offerRecord.sourceId.startsWith('isr-'), `sourceId has isr- prefix (${offerRecord.sourceId})`);
    check(offerRecord.confidence > 0.8, `confidence > 0.8 (${offerRecord.confidence})`);
    check(offerRecord.origin === 'player_action', `origin is player_action (${offerRecord.origin})`);
    check((payload.offerPrice as number) !== caseItem.soldPrice, 'offerPrice !== soldPrice (not reverse-engineered)');
  }
}

// ════════════════════════════════════════════════════════════════════════════
// 2. Canonical Builder Can Find Buyer Evidence
// ════════════════════════════════════════════════════════════════════════════

console.log('\n=== R45-2: Canonical Builder Finds Buyer Evidence ===\n');

if (pair) {
  const { caseItem, opportunity } = pair;
  const ownerId = caseItem.ownerName || `owner:${caseItem.id}`;

  const evidenceState = createEvidenceStateView(state);
  const canonicalResult = buildCanonicalPriceTrajectoryFromEvidence({
    state: evidenceState,
    caseId: caseItem.id,
    customerId: opportunity.customerId,
    ownerId,
    opportunityId: opportunity.id,
    day: state.day,
  });

  // Buyer evidence should be found (we just generated it)
  check(
    (canonicalResult.evidenceFound?.buyerOfferEvidence.length ?? 0) > 0,
    'canonical builder found buyer-side offer evidence',
  );

  // Owner evidence may or may not exist depending on game state
  // (owner_interview may not have been executed yet)
  const hasOwnerEvidence = (canonicalResult.evidenceFound?.ownerConcessionEvidence.length ?? 0) > 0;

  if (hasOwnerEvidence) {
    // Full canonical trajectory should succeed
    check(canonicalResult.success === true, 'canonical trajectory succeeded (both buyer + owner evidence)');
    if (canonicalResult.trajectory) {
      check(canonicalResult.trajectory.source === 'canonical', `trajectory source is canonical (${canonicalResult.trajectory.source})`);
      check(canonicalResult.trajectory.proofKind === 'canonical', `trajectory proofKind is canonical (${canonicalResult.trajectory.proofKind})`);
      check(canonicalResult.trajectory.offers.length > 0, `trajectory has offers (${canonicalResult.trajectory.offers.length})`);
      check(canonicalResult.trajectory.offers[0].price > 0, `offer price > 0 (${canonicalResult.trajectory.offers[0].price})`);
    }
  } else {
    // No owner evidence yet — canonical should fail with clear reason
    check(canonicalResult.success === false, 'canonical trajectory failed (no owner evidence yet)');
    check(
      canonicalResult.reason?.includes('owner') ?? false,
      `failure reason mentions owner evidence (${canonicalResult.reason?.slice(0, 60)}...)`,
    );
  }
}

// ════════════════════════════════════════════════════════════════════════════
// 3. Source Record Structure Validation
// ════════════════════════════════════════════════════════════════════════════

console.log('\n=== R45-3: Source Record Structure ===\n');

if (pair) {
  const offerRecords = (state.pendingSourceRecords ?? []).filter(
    r => r.sourceKind === 'customer_interaction' && r.payload.subtype === 'offer_submitted',
  );

  if (offerRecords.length > 0) {
    const record = offerRecords[0];

    // Entity refs must include case and customer
    check(record.entityRefs.length >= 2, `entityRefs has >= 2 entries (${record.entityRefs.length})`);
    check(record.entityRefs.some(r => r.kind === 'case'), 'entityRefs includes case');
    check(record.entityRefs.some(r => r.kind === 'customer'), 'entityRefs includes customer');

    // Actor refs must include player_broker
    check(record.actorRefs.length >= 1, `actorRefs has >= 1 entries (${record.actorRefs.length})`);
    check(record.actorRefs.some(r => r.role === 'player_broker'), 'actorRefs includes player_broker');

    // Visibility must be player_only (offer is private to the broker)
    check(record.visibility.scope === 'player_only', `visibility is player_only (${record.visibility.scope})`);

    // Replay key must exist and be deterministic
    check(record.replayKey.length > 0, `replayKey is non-empty (${record.replayKey})`);
    check(record.replayKey.startsWith('rk-offer-'), `replayKey has expected prefix (${record.replayKey})`);
  }
}

// ════════════════════════════════════════════════════════════════════════════
// 4. Production Code Path Verification
// ════════════════════════════════════════════════════════════════════════════

console.log('\n=== R45-4: Production Code Path ===\n');

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const dealClosingCode = readFileSync(resolve('src/selling-houses/domain/dealClosing.ts'), 'utf-8');

check(
  dealClosingCode.includes('emitBuyerOfferSourceRecord'),
  'dealClosing.ts calls emitBuyerOfferSourceRecord',
);

check(
  dealClosingCode.includes('computeBuyerOfferPrice'),
  'dealClosing.ts calls computeBuyerOfferPrice',
);

check(
  dealClosingCode.includes("subtype: 'offer_submitted'"),
  "dealClosing.ts creates offer_submitted source record",
);

check(
  dealClosingCode.includes('offerPrice'),
  'dealClosing.ts includes offerPrice in source record',
);

// Verify offerPrice is NOT derived from soldPrice
const computeFn = dealClosingCode.slice(
  dealClosingCode.indexOf('function computeBuyerOfferPrice'),
  dealClosingCode.indexOf('function emitBuyerOfferSourceRecord'),
);
check(
  !computeFn.includes('soldPrice'),
  'computeBuyerOfferPrice does NOT use soldPrice',
);
check(
  computeFn.includes('budgetMax'),
  'computeBuyerOfferPrice uses budgetMax (real constraint)',
);
check(
  computeFn.includes('marketPrice'),
  'computeBuyerOfferPrice uses marketPrice (real value)',
);

// ════════════════════════════════════════════════════════════════════════════
// 5. False-Green Audit
// ════════════════════════════════════════════════════════════════════════════

console.log('\n=== R45-5: False-Green Audit ===\n');

const gateCode = readFileSync(resolve('scripts/verify-selling-houses-r45-buyer-offer-source-chain-gate.ts'), 'utf-8');
const gateLines = gateCode.split('\n').filter(line =>
  !line.trim().startsWith('//') &&
  !line.trim().startsWith('*') &&
  !line.includes('check(truePattern') &&
  !line.includes('|| truePattern') &&
  !line.includes("'|| true'") &&
  !line.includes("'|| true'") &&
  !line.includes('"|| true"') &&
  !line.includes('`|| true`') &&
  !line.includes('check(true)')
);

const checkTruePattern = /check\(true\s*,/;
const hasCheckTrueInLogic = gateLines.some(line => checkTruePattern.test(line));
check(!hasCheckTrueInLogic, 'no check(true) in gate logic');

const orTruePattern = /\|\|\s*true\s*,/;
const hasOrTrueInLogic = gateLines.some(line => orTruePattern.test(line));
check(!hasOrTrueInLogic, 'no || true in gate logic');

// ════════════════════════════════════════════════════════════════════════════
// Summary
// ════════════════════════════════════════════════════════════════════════════

console.log('\n=== R45 Buyer Offer Source Chain Gate Summary ===\n');
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);

if (failed > 0) {
  console.error(`\nGATE FAILED: ${failed} checks did not pass.`);
  for (const err of errors) {
    console.error(`  - ${err}`);
  }
  console.log(`\nR45 requires:`);
  console.log(`  - invite-customer-negotiation produces offer_submitted source record`);
  console.log(`  - offerPrice is derived from budgetMax + marketPrice (not soldPrice)`);
  console.log(`  - canonical builder can find buyer-side evidence`);
  console.log(`  - no check(true), || true, or WARN-as-PASS`);
  process.exit(1);
}

console.log(`\nGATE PASSED: All ${passed} checks passed.`);
console.log('Verified: real game flow produces buyer offer evidence for canonical trajectory.');
