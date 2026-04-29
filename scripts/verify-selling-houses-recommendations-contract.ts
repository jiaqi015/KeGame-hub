import assert from 'node:assert/strict';

import { createInitialState, updateDerivedState } from '../src/selling-houses/application/gameState.js';
import { buildOperatingProjection } from '../src/selling-houses/application/projections/operatingProjection.js';
import { buildOwnerPersonaProfile } from '../src/selling-houses/application/projections/ownerPersonaProfile.js';
import {
  deriveCaseProgression,
  getActionStageRelation,
} from '../src/selling-houses/domain/actionStageRelations.js';
import { getActionAvailability } from '../src/selling-houses/domain/engine.js';
import { getScenarioSnapshotById } from '../src/selling-houses/domain/scenarioCatalog.js';
import { REC_BALANCE, deriveCaseRecommendations } from '../src/selling-houses/domain/recommendationEngine.js';
import type { GameState, Opportunity } from '../src/selling-houses/domain/models.js';

const snapshot = getScenarioSnapshotById('standard-window-chain');
assert.ok(snapshot, 'Expected standard-window-chain scenario to exist');

assert.deepEqual(
  REC_BALANCE.candidateTierOrder,
  { DEFEND: 0, ACCELERATE: 1, PROGRESS: 2 },
  'Expected same-case action picking to prefer defense, then mature customer actions, then progress fillers',
);
assert.equal(REC_BALANCE.actionRegret.firstVisit, 70, 'Expected first-visit weight to live in REC_BALANCE');
assert.equal(REC_BALANCE.opportunityRegret.hotOpportunityDaysLeft, 3, 'Expected hot opportunity window to live in REC_BALANCE');
assert.equal(REC_BALANCE.scoring.defenseSignalWeightThreshold, 30, 'Expected defense signal threshold to live in REC_BALANCE');
assert.equal(REC_BALANCE.scoring.alternativeActionLimit, 2, 'Expected alternative action count to live in REC_BALANCE');

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

const FRONTSTAGE_FORBIDDEN_COPY = /\[推进\]|\btier\b|\bscore\b|\bdebug\b|需要|今天要|必须|应该|先处理|推进|后段|值得排前面|经营节奏/i;
const INSTRUCTIONAL_CANDIDATE_COPY = /^(先|请|快|赶紧|立刻)|先把|要把|要接住|稳住授权|适合推进|直接推进|排前面/;
const FRONTSTAGE_VISIBLE_KEYS = new Set([
  'label',
  'title',
  'detail',
  'headline',
  'summary',
  'statusLabel',
  'weekFocusLabel',
  'todayHeadline',
  'leadReason',
  'mainProblemLabel',
  'nextStepLine',
  'phaseLabel',
  'coreProblemLabel',
  'primaryActionLabel',
  'phaseRiskHint',
  'countLabel',
  'reasonLabel',
  'subline',
]);

function assertNoForbiddenFrontstageCopy(
  label: string,
  items: Array<{ label?: string; title?: string; detail?: string; headline?: string; statusLabel?: string }>,
) {
  items.forEach((item) => {
    const text = visibleText([item.label, item.title, item.detail, item.headline, item.statusLabel]);
    assert.ok(
      !FRONTSTAGE_FORBIDDEN_COPY.test(text),
      `Expected ${label} copy to hide internal/debug/instructional wording: ${text}`,
    );
  });
}

function assertGentleCandidateCopy(items: Array<{ label?: string; title?: string; detail?: string }>) {
  items.forEach((item) => {
    const text = visibleText([item.label, item.title, item.detail]);
    assert.ok(
      !FRONTSTAGE_FORBIDDEN_COPY.test(text) && !INSTRUCTIONAL_CANDIDATE_COPY.test(text),
      `Expected candidate copy to stay factual, not instructive: ${text}`,
    );
  });
}

function assertProjectionVisibleCopyClean(value: unknown, path = 'projection', key = '') {
  if (typeof value === 'string') {
    if (!FRONTSTAGE_VISIBLE_KEYS.has(key)) return;
    assert.ok(
      !FRONTSTAGE_FORBIDDEN_COPY.test(value),
      `Expected visible projection copy to avoid forbidden wording at ${path}: ${value}`,
    );
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertProjectionVisibleCopyClean(item, `${path}[${index}]`, key));
    return;
  }
  if (value && typeof value === 'object') {
    Object.entries(value).forEach(([childKey, item]) => {
      assertProjectionVisibleCopyClean(item, `${path}.${childKey}`, childKey);
    });
  }
}

function assertRecommendationActionsFollowStageRelations(world: GameState) {
  deriveCaseRecommendations(world).forEach((recommendation) => {
    const caseItem = world.cases.find((entry) => entry.id === recommendation.caseId);
    assert.ok(caseItem, `Expected case for recommendation ${recommendation.caseId}`);
    const progression = deriveCaseProgression(world, caseItem);
    assert.equal(
      recommendation.phase,
      progression.phase,
      `Expected recommendation phase for ${caseItem.title} to come from action-stage progression`,
    );

    [recommendation.primaryAction, ...recommendation.alternativeActions].forEach((action) => {
      const relation = getActionStageRelation(action.actionId);
      assert.ok(relation, `Expected recommended action ${action.actionId} to be registered in action-stage relations`);
      assert.ok(
        relation.phaseIds.includes(recommendation.phase),
        `Expected ${action.actionId} to be valid in recommendation phase ${recommendation.phase}`,
      );
    });
  });
}

function assertArrangementCandidatesExecutable(
  world: GameState,
  candidates: Array<{ caseId?: string; actionId?: string }>,
) {
  candidates.forEach((item) => {
    assert.ok(item.caseId, 'Expected arrangement candidate to point to a case');
    assert.ok(item.actionId, 'Expected arrangement candidate to point to an action');
    const caseItem = world.cases.find((entry) => entry.id === item.caseId);
    assert.ok(caseItem, `Expected candidate case ${item.caseId} to exist`);
    const relation = getActionStageRelation(item.actionId);
    assert.ok(relation, `Expected candidate action ${item.actionId} to have an action-stage relation`);
    const progression = deriveCaseProgression(world, caseItem);
    assert.ok(
      relation.phaseIds.includes(progression.phase),
      `Expected candidate action ${item.actionId} to match case phase ${progression.phase}`,
    );
    assert.equal(
      getActionAvailability(world, caseItem, item.actionId).enabled,
      true,
      `Expected arrangement candidate ${item.actionId} for ${caseItem.title} to be executable`,
    );
  });
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
  assertProjectionVisibleCopyClean(projection);
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
  assert.ok(candidates[0]?.detail.includes('业主待面访'), 'Expected arrangement candidate to present factual first-visit state');
  candidates.forEach((item) => {
    const text = visibleText([item.label, item.title, item.detail]);
    assert.ok(!/\[(推进|守盘|收口)\]|DEFEND|PROGRESS|ACCELERATE/.test(text), 'Expected candidate copy not to expose recommendation tiers');
  });
  assertNoForbiddenFrontstageCopy('arrangement headline', [{ headline: projection.dashboard.arrangement.headline }]);
  assertNoForbiddenFrontstageCopy('arrangement candidates', candidates);
  assertGentleCandidateCopy(candidates);
  assertArrangementCandidatesExecutable(world, candidates);
  assertRecommendationActionsFollowStageRelations(world);

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
  const world = createRecommendationWorld(20260433);
  const target = world.cases[0];
  assert.ok(target, 'Expected an unvisited mature-opportunity target case');
  target.hasCompletedFirstVisit = false;
  target.lastOwnerTouchedDay = 0;
  target.viewings = 2;
  target.offers = 1;
  world.opportunities = [
    buildOpportunity(world, target.id, {
      id: 'verify-unvisited-mature-opportunity',
      customerName: '未面访高意向客户',
      intent: 96,
      confidence: 90,
      stageIndex: 6,
      stageLabel: '出价',
      daysLeft: 1,
    }),
  ];
  updateDerivedState(world);

  const lead = deriveCaseRecommendations(world)[0];
  assert.ok(lead, 'Expected recommendation for unvisited mature-opportunity case');
  assert.equal(lead.caseId, target.id, 'Expected unvisited mature-opportunity case to lead the ranking');
  assert.equal(lead.phase, 'pre_visit', 'Expected recommendation to stay in pre-visit phase until first visit is complete');
  assert.equal(lead.primaryAction.actionId, 'first-visit', 'Expected recommendation not to skip first visit for a mature opportunity');
  assertRecommendationActionsFollowStageRelations(world);
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
  assert.ok(!FRONTSTAGE_FORBIDDEN_COPY.test(lead.reason), `Expected recommendation reason to avoid forbidden frontstage wording: ${lead.reason}`);
}

{
  const world = createRecommendationWorld(20260430);
  const matureCase = world.cases[2];
  assert.ok(matureCase, 'Expected a mature opportunity case');
  matureCase.viewings = 2;
  matureCase.offers = 0;
  matureCase.lastOwnerTouchedDay = world.day - 3;
  matureCase.trust = 74;
  matureCase.patience = 72;
  matureCase.windowDays = 10;
  world.opportunities = [
    buildOpportunity(world, matureCase.id, {
      id: 'verify-mature-opportunity',
      customerName: '已见面客户',
      intent: 84,
      confidence: 82,
      stageIndex: 5,
      stageLabel: '见面沟通',
      daysLeft: 3,
    }),
  ];
  updateDerivedState(world);

  const lead = deriveCaseRecommendations(world)[0];
  assert.ok(lead, 'Expected recommendation for mature opportunity case');
  assert.equal(lead.caseId, matureCase.id, 'Expected mature opportunity case to lead the ranking');
  assert.equal(lead.primaryAction.actionId, 'invite-customer-negotiation', 'Expected mature opportunity to outrank routine owner feedback');
}

{
  const world = createRecommendationWorld(20260431);
  const slidingCase = world.cases[3];
  assert.ok(slidingCase, 'Expected a sliding-label opportunity case');
  slidingCase.viewings = 2;
  slidingCase.lastOwnerTouchedDay = world.day - 3;
  slidingCase.trust = 74;
  slidingCase.patience = 72;
  slidingCase.urgency = 55;
  slidingCase.windowDays = 10;
  world.opportunities = [
    buildOpportunity(world, slidingCase.id, {
      id: 'verify-sliding-label-opportunity',
      customerName: '待谈客户',
      intent: 82,
      confidence: 80,
      stageIndex: 5,
      stageLabel: '见面沟通',
      daysLeft: 5,
    }),
  ];
  updateDerivedState(world);
  slidingCase.storylineState = 'sliding';

  const recommendation = deriveCaseRecommendations(world).find((entry) => entry.caseId === slidingCase.id);
  assert.ok(recommendation, 'Expected recommendation for sliding-label opportunity case');
  assert.equal(recommendation.primaryAction.actionId, 'invite-customer-negotiation', 'Expected a healthy sliding label not to override a mature customer action');
}

console.log('selling-houses recommendation contract verification passed');
