import assert from 'node:assert/strict';

import { createInitialState, updateDerivedState } from '../src/selling-houses/application/gameState.js';
import { buildFinalStats } from '../src/selling-houses/application/cloudSync.js';
import { buildResultProjection } from '../src/selling-houses/application/projections/resultProjection.js';
import { executeAction, seedInitialOpportunities } from '../src/selling-houses/domain/engine.js';
import { evaluateFinalResult } from '../src/selling-houses/domain/resultEvaluation.js';
import { getScenarioSnapshotById } from '../src/selling-houses/domain/scenarioCatalog.js';

const snapshot = getScenarioSnapshotById('standard-window-chain');
assert.ok(snapshot, 'Expected standard-window-chain scenario to exist');

const world = createInitialState(snapshot, 20260420);
seedInitialOpportunities(world);
updateDerivedState(world);

const caseItem = world.cases[0];
assert.ok(caseItem, 'Expected at least one case');

let opportunity = world.opportunities.find((entry) => entry.caseId === caseItem.id);
assert.ok(opportunity, 'Expected seeded opportunity for target case');

caseItem.askPrice = caseItem.marketPrice;
caseItem.trust = 100;
caseItem.competitiveness = 100;
opportunity.intent = 100;
opportunity.confidence = 100;
opportunity.stageIndex = 4;
opportunity.daysLeft = 3;
updateDerivedState(world);

const sold = executeAction(world, 'invite-customer-negotiation', caseItem, 'close');
assert.equal(sold, true, 'Expected high-confidence negotiation action to execute');
assert.equal(world.closedDeals.length, 1, 'Expected exactly one closed deal record after sale');

const deal = world.closedDeals[0];
assert.ok(deal, 'Expected closed deal record to exist');
assert.equal(deal.caseId, caseItem.id, 'Expected deal to reference sold case');
assert.equal(deal.customerId, opportunity.customerId, 'Expected deal to reference buying customer');
assert.equal(deal.sourceRelationId, opportunity.id, 'Expected deal to reference source customer-case relation');
assert.equal(deal.opportunityId, opportunity.id, 'Expected legacy opportunity id alias to be preserved');
assert.equal(deal.dayIndex, world.day, 'Expected deal day index to match world day');
assert.equal(deal.dealPrice, caseItem.soldPrice, 'Expected deal price to mirror sold price');
assert.equal(deal.dealType, 'self_closed', 'Expected player-negotiated sale to be self_closed');
assert.ok(deal.closedAt.length > 0, 'Expected deal to have a durable timestamp');
assert.ok(deal.supportingReasons.length > 0, 'Expected deal to store supporting reasons');
assert.ok(
  world.eventStore.some((entry) => entry.kind === 'case_sold' && entry.payload.dealId === deal.dealId),
  'Expected case_sold event to reference closed deal id',
);

const soldAgain = executeAction(world, 'invite-customer-negotiation', caseItem, 'close');
assert.equal(soldAgain, false, 'Expected sold case to reject repeated sale action');
assert.equal(world.closedDeals.length, 1, 'Expected repeated sale attempt not to duplicate deal record');

world.auxiliaryStats.soldCount = 0;
world.soldCount = 0;
world.finalResult = evaluateFinalResult(world, '验证成交事实口径。');
const resultProjection = buildResultProjection(world);
const dealCard = resultProjection.summaryCards.find((entry) => entry.label === '本局成交');
assert.ok(dealCard, 'Expected result projection to include deal summary card');
assert.equal(dealCard.value, '1 套', 'Expected result projection to count closedDeals instead of auxiliary soldCount');
assert.ok(
  world.finalResult.stats.some((entry) => entry.label === '正式成交' && entry.value === '1 套'),
  'Expected final result stats to expose closed deal count from closedDeals',
);

const finalStats = buildFinalStats(world);
assert.equal(finalStats.auxiliaryStats.soldCount, 1, 'Expected cloud final stats to prefer formal closed deals');

console.log('selling-houses deal fact verification passed');
