/**
 * R46 — Actor Identity / Evidence Ref Alignment Gate
 *
 * Verifies that owner_interview and customer_interaction source records
 * use the same identity refs (ownerId, customerId, caseId) that
 * finalizeClosedDeal passes to the canonical builder.
 *
 * Also verifies that mismatched refs cause the builder to reject evidence.
 */

import { buildCanonicalPriceTrajectoryFromEvidence, createEvidenceStateView } from '../src/selling-houses/core/world-state/consensus/canonicalEvidenceBuilder.js';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// ════════════════════════════════════════════════════════════════════════════
// Gate infrastructure
// ════════════════════════════════════════════════════════════════════════════

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(condition: boolean, message: string) {
  if (condition) {
    passed++;
    console.log(`  ✅ ${message}`);
  } else {
    failed++;
    failures.push(message);
    console.error(`  ❌ ${message}`);
  }
}

function section(name: string) {
  console.log(`\n━━━ ${name} ━━━`);
}

// ════════════════════════════════════════════════════════════════════════════
// §1: Source code audit — ownerId/caseId origins
// ════════════════════════════════════════════════════════════════════════════

section('§1: Source code audit — ownerId/caseId origins');

const actionCommandReceiptSrc = readFileSync(
  resolve('src/selling-houses/domain/world-model/runtime/actionCommandReceipt.ts'),
  'utf-8',
);
const actionReceiptWiringSrc = readFileSync(
  resolve('src/selling-houses/domain/world-model/runtime/actionReceiptWiring.ts'),
  'utf-8',
);
const dealClosingSrc = readFileSync(
  resolve('src/selling-houses/domain/dealClosing.ts'),
  'utf-8',
);
const actionReceiptSnapshotSrc = readFileSync(
  resolve('src/selling-houses/domain/engine/actionReceiptSnapshot.ts'),
  'utf-8',
);

// Check that ActionReceiptSnapshot has ownerName
check(
  actionReceiptSnapshotSrc.includes('readonly ownerName: string'),
  'ActionReceiptSnapshot has ownerName field',
);

// Check that captureActionReceiptSnapshot sets ownerName from caseItem
check(
  actionReceiptSnapshotSrc.includes('ownerName: caseItem.ownerName'),
  'captureActionReceiptSnapshot sets ownerName from caseItem.ownerName',
);

// Check that enrichment in actionReceiptWiring overwrites ownerId
check(
  actionReceiptWiringSrc.includes("ownerId: snapshot.ownerName"),
  'enrichment overwrites ownerId with snapshot.ownerName',
);

// Check that enrichment overwrites caseId
check(
  actionReceiptWiringSrc.includes("caseId: snapshot.caseId"),
  'enrichment overwrites caseId with snapshot.caseId',
);

// Check that finalizeClosedDeal uses caseItem.ownerName as ownerId
check(
  dealClosingSrc.includes("const ownerId = caseItem.ownerName || `owner:${caseItem.id}`"),
  'finalizeClosedDeal uses caseItem.ownerName as ownerId',
);

// Check that emitBuyerOfferSourceRecord uses opportunity.customerId
check(
  dealClosingSrc.includes('customerId: opportunity.customerId'),
  'emitBuyerOfferSourceRecord uses opportunity.customerId',
);

// Check that emitBuyerOfferSourceRecord uses caseItem.id
check(
  dealClosingSrc.includes('caseId: caseItem.id'),
  'emitBuyerOfferSourceRecord uses caseItem.id',
);

// ════════════════════════════════════════════════════════════════════════════
// §2: Canonical builder identity matching — positive path
// ════════════════════════════════════════════════════════════════════════════

section('§2: Canonical builder identity matching — positive path');

const testOwnerId = 'owner-test-001';
const testCustomerId = 'cust-test-001';
const testCaseId = 'case-test-001';

const matchingSourceRecords = [
  {
    sourceId: 'isr-offer-1',
    sourceKind: 'customer_interaction',
    day: 1,
    payload: {
      subtype: 'offer_submitted',
      customerId: testCustomerId,
      caseId: testCaseId,
      offerPrice: 480,
    },
    confidence: 0.9,
  },
  {
    sourceId: 'isr-concession-1',
    sourceKind: 'owner_interview',
    day: 2,
    payload: {
      subtype: 'price_discussed',
      ownerId: testOwnerId,
      caseId: testCaseId,
      concessionPrice: 500,
    },
    confidence: 0.85,
  },
];

const positiveResult = buildCanonicalPriceTrajectoryFromEvidence({
  state: {
    pendingSourceRecords: matchingSourceRecords,
  },
  caseId: testCaseId,
  customerId: testCustomerId,
  ownerId: testOwnerId,
  opportunityId: 'opp-test-001',
  day: 5,
});

check(positiveResult.success, 'canonical builder succeeds with matching IDs');
check(positiveResult.trajectory !== undefined, 'trajectory is defined');
check(positiveResult.trajectory?.offers[0]?.customerId === testCustomerId, 'trajectory offer has correct customerId');
check(positiveResult.trajectory?.concessions[0]?.ownerId === testOwnerId, 'trajectory concession has correct ownerId');

// ════════════════════════════════════════════════════════════════════════════
// §3: Negative path — ownerId mismatch → rejection
// ════════════════════════════════════════════════════════════════════════════

section('§3: Negative path — ownerId mismatch → rejection');

// Owner source record uses isr-xxx as ownerId (the old bug)
const mismatchedOwnerRecord = [
  {
    sourceId: 'isr-offer-1',
    sourceKind: 'customer_interaction',
    day: 1,
    payload: {
      subtype: 'offer_submitted',
      customerId: testCustomerId,
      caseId: testCaseId,
      offerPrice: 480,
    },
    confidence: 0.9,
  },
  {
    sourceId: 'isr-concession-1',
    sourceKind: 'owner_interview',
    day: 2,
    payload: {
      subtype: 'price_discussed',
      ownerId: 'isr-owner_interview-player-broker-5-42',  // WRONG: source record ID as ownerId
      caseId: testCaseId,
      concessionPrice: 500,
    },
    confidence: 0.85,
  },
];

const mismatchResult = buildCanonicalPriceTrajectoryFromEvidence({
  state: {
    pendingSourceRecords: mismatchedOwnerRecord,
  },
  caseId: testCaseId,
  customerId: testCustomerId,
  ownerId: testOwnerId,
  opportunityId: 'opp-test-001',
  day: 5,
});

check(!mismatchResult.success, 'builder rejects ownerId mismatch (isr-xxx vs owner-test-001)');
check(
  mismatchResult.reason?.includes('no owner-side concession evidence') ?? false,
  'failure reason mentions missing owner evidence',
);

// ════════════════════════════════════════════════════════════════════════════
// §4: Negative path — customerId mismatch → rejection
// ════════════════════════════════════════════════════════════════════════════

section('§4: Negative path — customerId mismatch → rejection');

const mismatchedCustomerRecord = [
  {
    sourceId: 'isr-offer-1',
    sourceKind: 'customer_interaction',
    day: 1,
    payload: {
      subtype: 'offer_submitted',
      customerId: 'isr-customer_interaction-wrong-id',  // WRONG: source record ID as customerId
      caseId: testCaseId,
      offerPrice: 480,
    },
    confidence: 0.9,
  },
  {
    sourceId: 'isr-concession-1',
    sourceKind: 'owner_interview',
    day: 2,
    payload: {
      subtype: 'price_discussed',
      ownerId: testOwnerId,
      caseId: testCaseId,
      concessionPrice: 500,
    },
    confidence: 0.85,
  },
];

const custMismatchResult = buildCanonicalPriceTrajectoryFromEvidence({
  state: {
    pendingSourceRecords: mismatchedCustomerRecord,
  },
  caseId: testCaseId,
  customerId: testCustomerId,
  ownerId: testOwnerId,
  opportunityId: 'opp-test-001',
  day: 5,
});

check(!custMismatchResult.success, 'builder rejects customerId mismatch');
check(
  custMismatchResult.reason?.includes('no buyer-side offer evidence') ?? false,
  'failure reason mentions missing buyer evidence',
);

// ════════════════════════════════════════════════════════════════════════════
// §5: Negative path — caseId mismatch → rejection
// ════════════════════════════════════════════════════════════════════════════

section('§5: Negative path — caseId mismatch → rejection');

const mismatchedCaseRecord = [
  {
    sourceId: 'isr-offer-1',
    sourceKind: 'customer_interaction',
    day: 1,
    payload: {
      subtype: 'offer_submitted',
      customerId: testCustomerId,
      caseId: testCaseId,
      offerPrice: 480,
    },
    confidence: 0.9,
  },
  {
    sourceId: 'isr-concession-1',
    sourceKind: 'owner_interview',
    day: 2,
    payload: {
      subtype: 'price_discussed',
      ownerId: testOwnerId,
      caseId: 'isr-owner_interview-wrong-case',  // WRONG: source record ID as caseId
      concessionPrice: 500,
    },
    confidence: 0.85,
  },
];

const caseMismatchResult = buildCanonicalPriceTrajectoryFromEvidence({
  state: {
    pendingSourceRecords: mismatchedCaseRecord,
  },
  caseId: testCaseId,
  customerId: testCustomerId,
  ownerId: testOwnerId,
  opportunityId: 'opp-test-001',
  day: 5,
});

check(!caseMismatchResult.success, 'builder rejects caseId mismatch on owner record');
check(
  caseMismatchResult.reason?.includes('no owner-side concession evidence') ?? false,
  'failure reason mentions missing owner evidence for caseId mismatch',
);

// ════════════════════════════════════════════════════════════════════════════
// §6: ownerName fallback — owner:${caseId} pattern
// ════════════════════════════════════════════════════════════════════════════

section('§6: ownerName fallback — owner:${caseId} pattern');

const fallbackOwnerId = `owner:${testCaseId}`;
const fallbackRecords = [
  {
    sourceId: 'isr-offer-2',
    sourceKind: 'customer_interaction',
    day: 1,
    payload: {
      subtype: 'offer_submitted',
      customerId: testCustomerId,
      caseId: testCaseId,
      offerPrice: 470,
    },
    confidence: 0.85,
  },
  {
    sourceId: 'isr-concession-2',
    sourceKind: 'owner_interview',
    day: 2,
    payload: {
      subtype: 'price_discussed',
      ownerId: fallbackOwnerId,  // Matches 'owner:case-test-001' pattern
      caseId: testCaseId,
      concessionPrice: 490,
    },
    confidence: 0.8,
  },
];

const fallbackResult = buildCanonicalPriceTrajectoryFromEvidence({
  state: {
    pendingSourceRecords: fallbackRecords,
  },
  caseId: testCaseId,
  customerId: testCustomerId,
  ownerId: fallbackOwnerId,
  opportunityId: 'opp-test-002',
  day: 5,
});

check(fallbackResult.success, 'builder accepts owner:${caseId} fallback pattern');
check(fallbackResult.trajectory?.concessions[0]?.ownerId === fallbackOwnerId, 'trajectory uses fallback ownerId');

// ════════════════════════════════════════════════════════════════════════════
// §7: Enrichment logic — ownerName → ownerId mapping
// ════════════════════════════════════════════════════════════════════════════

section('§7: Enrichment logic — ownerName → ownerId mapping');

// The enrichment in actionReceiptWiring.ts does:
//   ownerId: snapshot.ownerName || `owner:${snapshot.caseId}`,
//   caseId: snapshot.caseId,
// This matches finalizeClosedDeal's:
//   ownerId: caseItem.ownerName || `owner:${caseItem.id}`

// Verify the enrichment uses snapshot.ownerName
check(
  actionReceiptWiringSrc.includes("ownerId: snapshot.ownerName || `owner:${snapshot.caseId}`"),
  'enrichment uses snapshot.ownerName with owner:${caseId} fallback',
);

// Verify the enrichment uses snapshot.caseId for caseId
check(
  actionReceiptWiringSrc.includes("caseId: snapshot.caseId"),
  'enrichment uses snapshot.caseId for caseId',
);

// Verify finalizeClosedDeal uses the same pattern
check(
  dealClosingSrc.includes("caseItem.ownerName || `owner:${caseItem.id}`"),
  'finalizeClosedDeal uses same owner:${caseId} fallback pattern',
);

// ════════════════════════════════════════════════════════════════════════════
// §8: No soft-pass / false-green audit
// ════════════════════════════════════════════════════════════════════════════

section('§8: Gate self-audit');

const gateSrc = readFileSync(
  resolve('scripts/verify-selling-houses-r46-identity-alignment-gate.ts'),
  'utf-8',
);

// Self-audit: exclude the self-audit section itself from the search
const gateSrcWithoutAudit = gateSrc.slice(0, gateSrc.indexOf('§8: Gate self-audit'));
check(!gateSrcWithoutAudit.includes('check(true,'), 'no check(true) in gate logic');
check(!gateSrcWithoutAudit.includes('|| true'), 'no || true in gate logic');
check(!gateSrcWithoutAudit.includes('WARN-as-PASS'), 'no WARN-as-PASS in gate logic');

// ════════════════════════════════════════════════════════════════════════════
// Summary
// ════════════════════════════════════════════════════════════════════════════

console.log('\n═══════════════════════════════════════════════════════════════');
console.log(`  R46 Identity Alignment Gate: ${passed} passed, ${failed} failed`);
console.log('═══════════════════════════════════════════════════════════════');

if (failed > 0) {
  console.error('\nFAILURES:');
  for (const f of failures) {
    console.error(`  - ${f}`);
  }
  process.exit(1);
}

console.log('\n  ✅ ALL CHECKS PASSED — identity refs are aligned.');
