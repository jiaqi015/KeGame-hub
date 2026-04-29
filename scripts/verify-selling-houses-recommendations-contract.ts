import assert from 'node:assert/strict';

import { createInitialState, updateDerivedState } from '../src/selling-houses/application/gameState.js';
import { buildOperatingProjection } from '../src/selling-houses/application/projections/operatingProjection.js';
import { buildOwnerPersonaProfile } from '../src/selling-houses/application/projections/ownerPersonaProfile.js';
import { getScenarioSnapshotById } from '../src/selling-houses/domain/scenarioCatalog.js';
import { deriveCaseRecommendations } from '../src/selling-houses/domain/recommendationEngine.js';
import type { GameState, Opportunity } from '../src/selling-houses/domain/models.js';

const snapshot = getScenarioSnapshotById('standard-window-chain');
assert.ok(snapshot, 'Expected standard-window-chain scenario to exist');

function createRecommendationWorld(seed = 20260428): GameState {
  const world = createInitialState(snapshot, seed);
  world.day = 2;
  world.energy = 6;
  world.maxEnergy = 6;
  world.opportunities = [];
  world.productRuns = [];
  world.cases.forEach((caseItem) => {
    caseItem.status = 'active';
    caseItem.hasCompletedFirstVisit = true;
    caseItem.lastOwnerTouchedDay = world.day - 1;
    caseItem.lastTouchedDay = world.day - 1;
    caseItem.touchedToday = false;
    caseItem.touchedOwnerToday = false;
    caseItem.windowDays = 10;
    caseItem.trust = 72;
    caseItem.patience = 72;
    caseItem.urgency = 55;
    caseItem.heat = 62;
    caseItem.qualityStory = 1;
    caseItem.viewings = 0;
    caseItem.offers = 0;
    caseItem.askPrice = caseItem.marketPrice;
  });
  updateDerivedState(world);
  return world;
}

function buildOpportunity(world: GameState, caseId: string, overrides: Partial<Opportunity> = {}): Opportunity {
  return {
    id: overrides.id || `verify-opportunity-${caseId}`,
    caseId,
    customerId: overrides.customerId || `verify-customer-${caseId}`,
    customerName: overrides.customerName || '验证客户',
    profile: overrides.profile || '用于推荐契约验证',
    channelId: overrides.channelId || 'direct',
    channelName: overrides.channelName || '门店自有',
    fit: overrides.fit ?? 88,
    intent: overrides.intent ?? 82,
    confidence: overrides.confidence ?? 76,
    stageIndex: overrides.stageIndex ?? 3,
    stageLabel: overrides.stageLabel || '已看房',
    status: overrides.status || 'active',
    lifecycleStatus: overrides.lifecycleStatus || 'active',
    leadSource: overrides.leadSource || 'direct',
    visibility: overrides.visibility || 'revealed',
    createdDay: overrides.createdDay ?? 1,
    daysLeft: overrides.daysLeft ?? 3,
    touchedToday: overrides.touchedToday ?? false,
    budgetMax: overrides.budgetMax ?? 900,
    priceSensitivity: overrides.priceSensitivity ?? 50,
    stagnationTicks: overrides.stagnationTicks ?? 0,
    pendingClosingEvaluation: overrides.pendingClosingEvaluation,
    pendingClosingStrategyId: overrides.pendingClosingStrategyId,
    pendingClosingRequestedDay: overrides.pendingClosingRequestedDay,
    brokerName: overrides.brokerName,
    history: overrides.history || [],
  };
}

function visibleText(parts: Array<string | undefined>) {
  return parts.filter(Boolean).join(' ');
}

{
  const world = createRecommendationWorld();
  const target = world.cases[0];
  assert.ok(target, 'Expected a target case');
  target.hasCompletedFirstVisit = false;
  target.lastOwnerTouchedDay = 0;
  updateDerivedState(world);

  const recommendations = deriveCaseRecommendations(world);
  const lead = recommendations[0];
  assert.ok(lead, 'Expected recommendations to include a lead item');
  assert.equal(lead.caseId, target.id, 'Expected first unvisited listing to be the lead recommendation');
  assert.equal(lead.primaryAction.actionId, 'first-visit', 'Expected first visit to be the primary action before owner state is visible');
  assert.ok(lead.reason.includes('业主分型'), 'Expected first-visit reason to mention owner profiling');

  const projection = buildOperatingProjection(world);
  const targetProjection = projection.cases.find((entry) => entry.caseId === target.id);
  const ownerProfile = buildOwnerPersonaProfile(target);
  assert.ok(targetProjection, 'Expected target case projection');
  assert.equal(targetProjection?.ownerSummary.isRevealed, false, 'Expected owner state to stay hidden before first visit');
  assert.equal(ownerProfile.isRevealed, false, 'Expected owner persona to stay hidden before first visit');
  assert.equal(ownerProfile.label, '待面访分型', 'Expected hidden owner persona label before first visit');
  assert.ok(!targetProjection?.ownerSummary.detail.includes(target.ownerMood), 'Expected hidden owner summary not to expose owner mood');

  const candidates = projection.dashboard.arrangement.candidateItems;
  assert.ok(candidates.length > 0 && candidates.length <= 4, 'Expected arrangement candidates to render recommendation Top4 only');
  assert.equal(candidates[0]?.caseId, target.id, 'Expected arrangement first candidate to come from the lead recommendation');
  assert.equal(candidates[0]?.actionId, 'first-visit', 'Expected arrangement first candidate to schedule first visit');
  assert.ok(candidates[0]?.detail.includes('业主分型'), 'Expected arrangement candidate to preserve first-visit operating reason');
  candidates.forEach((item) => {
    const text = visibleText([item.label, item.title, item.detail]);
    assert.ok(!/\[(推进|守盘|收口)\]|DEFEND|PROGRESS|ACCELERATE/.test(text), 'Expected candidate copy not to expose recommendation tiers');
  });

  target.hasCompletedFirstVisit = true;
  target.lastOwnerTouchedDay = world.day;
  updateDerivedState(world);
  const afterVisit = deriveCaseRecommendations(world).find((entry) => entry.caseId === target.id);
  assert.notEqual(afterVisit?.primaryAction.actionId, 'first-visit', 'Expected first visit not to be recommended after completion');
  const revealedProjection = buildOperatingProjection(world).cases.find((entry) => entry.caseId === target.id);
  const revealedOwnerProfile = buildOwnerPersonaProfile(target);
  assert.equal(revealedProjection?.ownerSummary.isRevealed, true, 'Expected owner state to be visible after first visit');
  assert.equal(revealedOwnerProfile.isRevealed, true, 'Expected owner persona to be visible after first visit');
  assert.notEqual(revealedOwnerProfile.label, '待面访分型', 'Expected owner persona label to resolve after first visit');
}

{
  const world = createRecommendationWorld(20260429);
  const offerCase = world.cases[1];
  assert.ok(offerCase, 'Expected an offer case');
  offerCase.viewings = 2;
  offerCase.offers = 1;
  world.opportunities = [
    buildOpportunity(world, offerCase.id, {
      id: 'verify-hot-offer',
      customerName: '高意向客户',
      intent: 94,
      confidence: 88,
      stageIndex: 6,
      stageLabel: '出价',
      daysLeft: 1,
    }),
  ];
  updateDerivedState(world);

  const lead = deriveCaseRecommendations(world)[0];
  assert.ok(lead, 'Expected recommendation for hot offer case');
  assert.equal(lead.caseId, offerCase.id, 'Expected opportunity facts to drive the lead recommendation');
  assert.equal(lead.primaryAction.actionId, 'invite-customer-negotiation', 'Expected hot offer to recommend negotiation');
  assert.ok(/出价|谈判/.test(lead.reason), 'Expected negotiation reason to be grounded in opportunity stage facts');
}

console.log('selling-houses recommendation contract verification passed');
