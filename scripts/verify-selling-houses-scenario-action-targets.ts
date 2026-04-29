import assert from 'node:assert/strict';

import { createInitialState, updateDerivedState } from '../src/selling-houses/application/gameState.js';
import { executeScenarioAction } from '../src/selling-houses/application/gameTransitions.js';
import type { Settlement } from '../src/selling-houses/domain/actions/templates.js';
import { OPPORTUNITY_STAGES } from '../src/selling-houses/domain/constants.js';
import { seedInitialOpportunities } from '../src/selling-houses/domain/engine.js';
import type { Case, GameState, Opportunity } from '../src/selling-houses/domain/models.js';
import { getScenarioSnapshotById } from '../src/selling-houses/domain/scenarioCatalog.js';

function buildWorld(seed = 20260429) {
  const snapshot = getScenarioSnapshotById('standard-window-chain');
  assert.ok(snapshot, 'Expected standard-window-chain scenario to exist');
  const world = createInitialState(snapshot, seed);
  seedInitialOpportunities(world);
  updateDerivedState(world);
  return world;
}

function buildOpportunity(world: GameState, caseItem: Case, overrides: Partial<Opportunity> = {}): Opportunity {
  const stageIndex = overrides.stageIndex ?? 0;
  return {
    id: overrides.id || `scenario-action-target-${caseItem.id}`,
    caseId: caseItem.id,
    customerId: overrides.customerId || `scenario-action-customer-${caseItem.id}`,
    customerName: overrides.customerName || '场景目标客户',
    profile: overrides.profile || '用于场景动作目标一致性验证',
    channelId: overrides.channelId || 'private-referral',
    channelName: overrides.channelName || '私域转介绍',
    fit: overrides.fit ?? 86,
    intent: overrides.intent ?? 50,
    confidence: overrides.confidence ?? 50,
    stageIndex,
    stageLabel: overrides.stageLabel || OPPORTUNITY_STAGES[stageIndex],
    status: overrides.status || 'active',
    lifecycleStatus: overrides.lifecycleStatus || 'active',
    leadSource: overrides.leadSource || 'direct',
    visibility: overrides.visibility || 'revealed',
    createdDay: overrides.createdDay ?? world.day,
    daysLeft: overrides.daysLeft ?? 5,
    touchedToday: overrides.touchedToday ?? false,
    budgetMax: overrides.budgetMax ?? caseItem.askPrice + 20,
    priceSensitivity: overrides.priceSensitivity ?? 56,
    stagnationTicks: overrides.stagnationTicks ?? 0,
    pendingClosingEvaluation: overrides.pendingClosingEvaluation,
    pendingClosingStrategyId: overrides.pendingClosingStrategyId,
    pendingClosingRequestedDay: overrides.pendingClosingRequestedDay,
    brokerName: overrides.brokerName,
    history: overrides.history || [],
  };
}

const settlement: Settlement = {
  outcome: 'progress',
  title: '验证场景动作目标',
  summary: '验证场景动作目标',
  details: [],
  stateDeltas: [
    { field: 'intent', value: 7, label: '意向' },
    { field: 'confidence', value: 8, label: '信心' },
  ],
  nextActionHint: '',
  finalOptionId: null,
};

{
  const state = buildWorld(20260430);
  const caseItem = state.cases.find((entry) => entry.status === 'active');
  assert.ok(caseItem, 'Expected an active case');
  caseItem.hasCompletedFirstVisit = true;
  caseItem.stageIndex = 1;
  caseItem.lastAction = '';

  state.opportunities = state.opportunities.filter((entry) => entry.caseId !== caseItem.id);
  const linkedInsideWindow = buildOpportunity(state, caseItem, {
    id: 'linked-inside-window',
    customerId: 'target-customer',
    customerName: '绑定且在阶段客户',
    stageIndex: 1,
    intent: 40,
    confidence: 41,
  });
  const otherInsideWindow = buildOpportunity(state, caseItem, {
    id: 'other-inside-window',
    customerId: 'other-customer',
    customerName: '窗口内其他客户',
    stageIndex: 2,
    intent: 95,
    confidence: 96,
  });
  state.opportunities.unshift(otherInsideWindow, linkedInsideWindow);
  state.todayPlan = {
    day: state.day,
    playerItems: [{
      id: 'planned-showing-inside-window',
      day: state.day,
      linkedActionId: 'showing',
      linkedCaseId: caseItem.id,
      linkedCustomerId: linkedInsideWindow.customerId,
      linkedOpportunityId: linkedInsideWindow.id,
      executionMode: 'scenario',
      status: 'planned',
    }],
  };

  const result = executeScenarioAction(
    state,
    'showing',
    caseItem.id,
    settlement,
    undefined,
    'planned-showing-inside-window',
  );

  assert.equal(result.success, true, 'scenario action should execute with an explicit target inside its relation window');
  const nextLinked = result.nextState.opportunities.find((entry) => entry.id === linkedInsideWindow.id);
  const nextOther = result.nextState.opportunities.find((entry) => entry.id === otherInsideWindow.id);
  assert.ok(nextLinked, 'Expected linked opportunity to remain present');
  assert.ok(nextOther, 'Expected other opportunity to remain present');
  assert.equal(nextLinked.intent, 47, 'Scenario delta should write to linked target');
  assert.equal(nextLinked.confidence, 49, 'Scenario delta should write to linked target');
  assert.equal(nextLinked.stageIndex, 2, 'Relation floor should advance the same linked target');
  assert.equal(nextOther.intent, 95, 'Higher-ranked opportunity should not receive linked target delta');
  assert.equal(nextOther.confidence, 96, 'Higher-ranked opportunity should not receive linked target delta');
  assert.equal(nextOther.stageIndex, 2, 'Higher-ranked opportunity should not be advanced by linked target relation floor');
}

{
  const state = buildWorld();
  const caseItem = state.cases.find((entry) => entry.status === 'active');
  assert.ok(caseItem, 'Expected an active case');
  caseItem.hasCompletedFirstVisit = true;
  caseItem.stageIndex = 1;
  caseItem.lastAction = '';

  state.opportunities = state.opportunities.filter((entry) => entry.caseId !== caseItem.id);
  const linkedOutsideWindow = buildOpportunity(state, caseItem, {
    id: 'linked-outside-window',
    customerId: 'target-customer',
    customerName: '绑定但已过阶段客户',
    stageIndex: 4,
    intent: 40,
    confidence: 41,
  });
  const fallbackInsideWindow = buildOpportunity(state, caseItem, {
    id: 'fallback-inside-window',
    customerId: 'other-customer',
    customerName: '窗口内其他客户',
    stageIndex: 1,
    intent: 80,
    confidence: 81,
  });
  state.opportunities.unshift(linkedOutsideWindow, fallbackInsideWindow);
  state.todayPlan = {
    day: state.day,
    playerItems: [{
      id: 'planned-showing-outside-window',
      day: state.day,
      linkedActionId: 'showing',
      linkedCaseId: caseItem.id,
      linkedCustomerId: linkedOutsideWindow.customerId,
      linkedOpportunityId: linkedOutsideWindow.id,
      executionMode: 'scenario',
      status: 'planned',
    }],
  };

  const result = executeScenarioAction(
    state,
    'showing',
    caseItem.id,
    settlement,
    undefined,
    'planned-showing-outside-window',
  );

  assert.equal(result.success, false, 'scenario action should reject an explicit target outside its relation window');
  const nextLinked = result.nextState.opportunities.find((entry) => entry.id === linkedOutsideWindow.id);
  const nextFallback = result.nextState.opportunities.find((entry) => entry.id === fallbackInsideWindow.id);
  assert.ok(nextLinked, 'Expected linked opportunity to remain present');
  assert.ok(nextFallback, 'Expected fallback opportunity to remain present');
  assert.equal(nextLinked.intent, 40, 'Rejected action should not write scenario delta to linked outside-window opportunity');
  assert.equal(nextLinked.confidence, 41, 'Rejected action should not write scenario delta to linked outside-window opportunity');
  assert.equal(nextLinked.stageIndex, 4, 'Rejected action should not stage-floor linked outside-window opportunity');
  assert.equal(nextFallback.intent, 80, 'Rejected action should not write scenario delta to fallback opportunity');
  assert.equal(nextFallback.confidence, 81, 'Rejected action should not write scenario delta to fallback opportunity');
  assert.equal(nextFallback.stageIndex, 1, 'Rejected action should not stage-floor a different window opportunity');
}

{
  const state = buildWorld(20260431);
  const caseItem = state.cases.find((entry) => entry.status === 'active');
  assert.ok(caseItem, 'Expected an active case');
  caseItem.hasCompletedFirstVisit = true;
  caseItem.stageIndex = 4;
  caseItem.offers = 1;
  caseItem.lastAction = '';

  state.opportunities = state.opportunities.filter((entry) => entry.caseId !== caseItem.id);
  const negotiationTarget = buildOpportunity(state, caseItem, {
    id: 'scenario-negotiation-target',
    customerId: 'scenario-negotiation-customer',
    customerName: '场景议价客户',
    stageIndex: 4,
    intent: 94,
    confidence: 88,
  });
  state.opportunities.unshift(negotiationTarget);
  state.todayPlan = {
    day: state.day,
    playerItems: [{
      id: 'planned-scenario-negotiation',
      day: state.day,
      linkedActionId: 'invite-customer-negotiation',
      linkedCaseId: caseItem.id,
      linkedCustomerId: negotiationTarget.customerId,
      linkedOpportunityId: negotiationTarget.id,
      executionMode: 'scenario',
      status: 'planned',
    }],
  };

  const negotiationSettlement: Settlement = {
    outcome: 'progress',
    title: '验证场景议价',
    summary: '验证场景议价',
    details: [],
    stateDeltas: [],
    nextActionHint: '',
    finalOptionId: 'firm',
  };

  const result = executeScenarioAction(
    state,
    'invite-customer-negotiation',
    caseItem.id,
    negotiationSettlement,
    undefined,
    'planned-scenario-negotiation',
  );

  assert.equal(result.success, true, 'scenario negotiation should execute with an explicit target inside its relation window');
  const nextTarget = result.nextState.opportunities.find((entry) => entry.id === negotiationTarget.id);
  assert.ok(nextTarget, 'Expected negotiation target to remain present');
  assert.equal(nextTarget.pendingClosingEvaluation, true, 'Scenario negotiation should queue deal closing evaluation');
  assert.equal(nextTarget.pendingClosingStrategyId, 'firm', 'Scenario negotiation should preserve the selected negotiation strategy');
  assert.equal(nextTarget.pendingClosingRequestedDay, result.nextState.day, 'Scenario negotiation should queue closing for the current day');
  assert.ok(nextTarget.stageIndex >= 5, `Scenario negotiation should advance target into closing range, got ${nextTarget.stageIndex}`);
}

console.log('✓ scenario action targets stay consistent');
