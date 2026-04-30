import assert from 'node:assert/strict';

import { createInitialState, updateDerivedState } from '../src/selling-houses/application/gameState.js';
import { advanceOneDay, executeAction, seedInitialOpportunities } from '../src/selling-houses/domain/engine.js';
import { createProductRun } from '../src/selling-houses/domain/productRuns.js';
import { getScenarioSnapshotById } from '../src/selling-houses/domain/scenarioCatalog.js';
import { normalizeDailyProcessResultReadModel } from '../src/selling-houses/runtime/simulation/dailyProcessResult.js';

const snapshot = getScenarioSnapshotById('standard-window-chain');
assert.ok(snapshot, 'Expected standard-window-chain scenario to exist');

const world = createInitialState(snapshot, 20260430);
seedInitialOpportunities(world);
updateDerivedState(world);

const caseItem = world.cases[0];
assert.ok(caseItem, 'Expected at least one case for daily process result verification');
const opportunity = world.opportunities.find((entry) => entry.caseId === caseItem.id && entry.status === 'active');
assert.ok(opportunity, 'Expected active opportunity for daily process result verification');
if (!caseItem || !opportunity) {
  throw new Error('Expected case and opportunity fixtures');
}

caseItem.askPrice = caseItem.marketPrice;
caseItem.trust = 100;
caseItem.competitiveness = 100;
caseItem.hasCompletedFirstVisit = true;
caseItem.stageIndex = 5;
caseItem.offers = Math.max(1, caseItem.offers || 0);
opportunity.intent = 100;
opportunity.confidence = 100;
opportunity.stageIndex = 5;
opportunity.daysLeft = 3;

const productRun = createProductRun(world, 'open-day', [caseItem.id]);
world.productRuns.push(productRun);
updateDerivedState(world);

assert.equal(
  executeAction(world, 'invite-customer-negotiation', caseItem, 'close'),
  true,
  'Expected negotiation action to queue a pending process before daily process result verification',
);

const settledDay = world.day;
const result = advanceOneDay(world);
assert.ok(result, 'Expected advanceOneDay to return a DailyTickResult');
if (!result) {
  throw new Error('Expected DailyTickResult');
}

assert.ok(Array.isArray(result.processResults), 'Expected DailyTickResult to expose processResults');
assert.ok(
  Array.isArray(result.settledDayProcessResults),
  'Expected DailyTickResult to expose settledDayProcessResults',
);
assert.ok(
  Array.isArray(result.nextDaySetupProcessResults),
  'Expected DailyTickResult to expose nextDaySetupProcessResults',
);
assert.equal(
  world.lastDailyTickResult?.processResults,
  result.processResults,
  'Expected lastDailyTickResult to retain the same process result summary array',
);
assert.equal(
  world.lastDailyTickResult?.settledDayProcessResults,
  result.settledDayProcessResults,
  'Expected lastDailyTickResult to retain the same settled-day process result summary array',
);
assert.equal(
  world.lastDailyTickResult?.nextDaySetupProcessResults,
  result.nextDaySetupProcessResults,
  'Expected lastDailyTickResult to retain the same next-day setup process result summary array',
);
assert.equal(result.processResults.length, 2, 'Expected daily process results to include both process manager summaries');
assert.equal(
  result.settledDayProcessResults.length,
  1,
  'Expected settled-day process results to contain the negotiation manager summary',
);
assert.equal(
  result.nextDaySetupProcessResults.length,
  1,
  'Expected next-day setup process results to contain the product-run manager summary',
);
assert.deepEqual(
  result.processResults.map((entry) => entry.managerId),
  ['negotiation-process-manager', 'product-run-process-manager'],
  'Expected process result summaries to preserve settlement ordering',
);
assert.deepEqual(
  result.settledDayProcessResults.map((entry) => entry.managerId),
  ['negotiation-process-manager'],
  'Expected negotiation summary to be grouped under settled-day process results',
);
assert.deepEqual(
  result.nextDaySetupProcessResults.map((entry) => entry.managerId),
  ['product-run-process-manager'],
  'Expected product-run summary to be grouped under next-day setup process results',
);
assert.equal(
  result.processResults.every((entry) => normalizeDailyProcessResultReadModel(entry)),
  true,
  'Expected daily process results to satisfy the runtime process ownership read-model contract',
);

const negotiation = result.processResults.find((entry) => entry.managerId === 'negotiation-process-manager');
assert.ok(negotiation, 'Expected daily process results to include negotiation process manager summary');
assert.equal(
  result.settledDayProcessResults[0],
  negotiation,
  'Expected grouped settled-day mirror to reference the same negotiation process summary row',
);
assert.equal(negotiation?.owner, 'runtime-process-manager-facade');
assert.equal(negotiation?.outcomeOwner, 'legacy-deal-closing-engine');
assert.equal(negotiation?.day, result.day, 'Expected negotiation process summary day to match the settled tick day');
assert.equal(negotiation?.phase, 'settled-day', 'Expected negotiation process summary to be marked as settled-day');
assert.equal(negotiation?.processedCount, 1, 'Expected negotiation summary to count the pending process it settled');
assert.equal(negotiation?.resolvedCount, 1, 'Expected negotiation summary to count the resolved pending process');
assert.ok(
  negotiation?.emittedEventIds.length ?? 0 > 0,
  'Expected negotiation summary to expose emitted event ids',
);
assert.deepEqual(negotiation?.opportunityIds, [opportunity.id], 'Expected negotiation summary to expose resolved opportunity ids');
assert.ok(
  negotiation?.closedDealIds.some((dealId) => dealId.includes(caseItem.id)),
  'Expected negotiation summary to expose closed deal ids from the legacy outcome engine',
);

const productRunSummary = result.processResults.find((entry) => entry.managerId === 'product-run-process-manager');
assert.ok(productRunSummary, 'Expected daily process results to include product run process manager summary');
assert.equal(
  result.nextDaySetupProcessResults[0],
  productRunSummary,
  'Expected grouped next-day setup mirror to reference the same product-run process summary row',
);
assert.equal(productRunSummary?.owner, 'runtime-process-manager');
assert.equal(productRunSummary?.day, result.nextDay, 'Expected product run process summary day to match the next-day setup day');
assert.equal(productRunSummary?.phase, 'next-day-setup', 'Expected product run process summary to be marked as next-day-setup');
assert.ok(
  productRunSummary?.productRunIds.includes(productRun.id),
  'Expected product run summary to expose advanced product run ids',
);
assert.ok(
  productRunSummary?.emittedEventIds.length ?? 0 > 0,
  'Expected product run summary to expose transition event ids',
);
assert.deepEqual(
  productRunSummary?.opportunityIds,
  [],
  'Expected product run summary not to claim opportunity resolution ids',
);
assert.deepEqual(
  productRunSummary?.closedDealIds,
  [],
  'Expected product run summary not to claim closed deal ids',
);

assert.equal(result.day, settledDay, 'Expected process summaries to belong to the settled day result');
assert.equal(result.nextDay, world.day, 'Expected process summaries to travel with the same daily tick result');

console.log('selling-houses daily process results contract verification passed');
