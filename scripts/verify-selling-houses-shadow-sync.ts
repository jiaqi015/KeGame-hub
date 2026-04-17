import assert from 'node:assert/strict';

import { NeonGameRunRepository } from '../src/selling-houses/infrastructure/neonGameRunRepository.js';

async function main() {
  const runId = process.argv[2];
  const userId = process.argv[3];

  if (!runId || !userId) {
    throw new Error('Usage: tsx scripts/verify-selling-houses-shadow-sync.ts <runId> <userId>');
  }

  const repository = new NeonGameRunRepository();
  const summary = await repository.verifyShadowSync(runId, userId);

  assert.equal(
    summary.actual.listingCount,
    summary.expected.listingCount,
    `run_listings count mismatch: expected ${summary.expected.listingCount}, got ${summary.actual.listingCount}`,
  );

  assert.equal(
    summary.actual.leadCount,
    summary.expected.leadCount,
    `listing_leads count mismatch: expected ${summary.expected.leadCount}, got ${summary.actual.leadCount}`,
  );

  assert.equal(
    summary.actual.leadFeedbackCount,
    summary.expected.leadFeedbackCount,
    `lead_feedbacks count mismatch: expected ${summary.expected.leadFeedbackCount}, got ${summary.actual.leadFeedbackCount}`,
  );

  assert.equal(
    summary.actual.eventCount,
    summary.expected.eventCount,
    `events count mismatch: expected ${summary.expected.eventCount}, got ${summary.actual.eventCount}`,
  );

  assert.equal(
    summary.actual.listingResultCount,
    summary.expected.listingResultCount,
    `listing result count mismatch: expected ${summary.expected.listingResultCount}, got ${summary.actual.listingResultCount}`,
  );

  assert.equal(
    summary.actual.listingFinalResultCount,
    summary.expected.listingFinalResultCount,
    `listing final result count mismatch: expected ${summary.expected.listingFinalResultCount}, got ${summary.actual.listingFinalResultCount}`,
  );

  assert.equal(
    summary.actual.sellerStateCount,
    summary.expected.sellerStateCount,
    `seller state count mismatch: expected ${summary.expected.sellerStateCount}, got ${summary.actual.sellerStateCount}`,
  );

  assert.equal(
    summary.actual.competitivenessCount,
    summary.expected.competitivenessCount,
    `competitiveness count mismatch: expected ${summary.expected.competitivenessCount}, got ${summary.actual.competitivenessCount}`,
  );

  assert.equal(
    summary.actual.matterCount,
    summary.expected.matterCount,
    `matter count mismatch: expected ${summary.expected.matterCount}, got ${summary.actual.matterCount}`,
  );

  assert.equal(
    summary.actual.weekCycleCount,
    summary.expected.weekCycleCount,
    `week cycle count mismatch: expected ${summary.expected.weekCycleCount}, got ${summary.actual.weekCycleCount}`,
  );

  assert.equal(
    summary.actual.recommendationCount,
    summary.expected.recommendationCount,
    `recommendation count mismatch: expected ${summary.expected.recommendationCount}, got ${summary.actual.recommendationCount}`,
  );

  assert.equal(
    summary.actual.listingFlagCount,
    summary.expected.listingFlagCount,
    `listing flag count mismatch: expected ${summary.expected.listingFlagCount}, got ${summary.actual.listingFlagCount}`,
  );

  assert.equal(
    summary.actual.focusMeetingEntryCount,
    summary.expected.focusMeetingEntryCount,
    `focus meeting entry count mismatch: expected ${summary.expected.focusMeetingEntryCount}, got ${summary.actual.focusMeetingEntryCount}`,
  );

  assert.equal(
    summary.actual.matterInteractionCount,
    summary.expected.matterInteractionCount,
    `matter interaction count mismatch: expected ${summary.expected.matterInteractionCount}, got ${summary.actual.matterInteractionCount}`,
  );

  console.log('selling-houses shadow sync verification passed');
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
