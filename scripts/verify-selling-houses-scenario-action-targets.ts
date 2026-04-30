import assert from 'node:assert/strict';

import { createInitialState, updateDerivedState } from '../src/selling-houses/application/gameState.js';
import { executeScenarioAction } from '../src/selling-houses/application/gameTransitions.js';
import { deriveCaseProgression } from '../src/selling-houses/domain/actionStageRelations.js';
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
  const state = buildWorld(20260429);
  const caseItem = state.cases.find((entry) => entry.status === 'active');
  assert.ok(caseItem, 'Expected an active case');
  caseItem.hasCompletedFirstVisit = false;
  caseItem.stageIndex = 0;
  caseItem.touchedOwnerToday = false;
  caseItem.lastOwnerTouchedDay = 0;
  updateDerivedState(state);

  const result = executeScenarioAction(
    state,
    'first-visit',
    caseItem.id,
    {
      ...settlement,
      title: '验证场景首次面访',
      summary: '验证场景首次面访',
      stateDeltas: [],
      finalOptionId: 'plan-first',
    },
  );

  assert.equal(result.success, true, 'scenario first visit should execute');
  const nextCase = result.nextState.cases.find((entry) => entry.id === caseItem.id);
  assert.ok(nextCase, 'Expected first visit case to remain present');
  assert.equal(nextCase.hasCompletedFirstVisit, true, 'Scenario first visit should complete the first visit gate');
  assert.notEqual(deriveCaseProgression(result.nextState, nextCase).phase, 'pre_visit', 'Scenario first visit should leave pre-visit');
  assert.equal(deriveCaseProgression(result.nextState, nextCase).ownerStateVisible, true, 'Scenario first visit should reveal owner state');
  assert.equal(nextCase.touchedOwnerToday, true, 'Scenario first visit should touch owner today');
  assert.equal(nextCase.lastOwnerTouchedDay, result.nextState.day, 'Scenario first visit should record owner touch day');
}

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
  const beforeEnergy = state.energy;
  const beforePromotionBudget = state.auxiliaryStats.promotionBudget;
  const beforeBudgetLedgerLength = state.budgetLedger.length;
  const beforeActionsToday = caseItem.actionsToday;

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
  assert.equal(result.nextState.energy, beforeEnergy, 'Rejected target should not spend energy');
  assert.equal(result.nextState.auxiliaryStats.promotionBudget, beforePromotionBudget, 'Rejected target should not spend promotion budget');
  assert.equal(result.nextState.budgetLedger.length, beforeBudgetLedgerLength, 'Rejected target should not append budget ledger entries');
  assert.equal(result.nextState.cases.find((entry) => entry.id === caseItem.id)?.actionsToday, beforeActionsToday, 'Rejected target should not count as an action');
  assert.equal(
    result.nextState.todayPlan.playerItems.find((entry) => entry.id === 'planned-showing-outside-window')?.status,
    'planned',
    'Rejected target should leave today plan item planned',
  );
}

{
  const state = buildWorld(20260432);
  const caseItem = state.cases.find((entry) => entry.status === 'active');
  assert.ok(caseItem, 'Expected an active case');
  caseItem.hasCompletedFirstVisit = true;
  caseItem.stageIndex = 1;
  caseItem.lastAction = '';

  state.opportunities = state.opportunities.filter((entry) => entry.caseId !== caseItem.id);
  const sourceMatterOutsideWindow = buildOpportunity(state, caseItem, {
    id: 'source-matter-outside-window',
    customerId: 'source-matter-customer',
    customerName: '事项绑定但已过阶段客户',
    stageIndex: 4,
    intent: 44,
    confidence: 45,
  });
  const fallbackInsideWindow = buildOpportunity(state, caseItem, {
    id: 'source-matter-fallback-inside-window',
    customerId: 'source-matter-other-customer',
    customerName: '窗口内其他客户',
    stageIndex: 1,
    intent: 83,
    confidence: 84,
  });
  state.opportunities.unshift(sourceMatterOutsideWindow, fallbackInsideWindow);
  state.schedule.unshift({
    key: 'source-matter-showing-schedule',
    caseId: caseItem.id,
    title: '事项绑定带看',
    badge: '客户',
    note: '验证 sourceMatter 显式目标',
    urgency: 96,
    actionId: 'showing',
    opportunityId: sourceMatterOutsideWindow.id,
  });
  state.matters.unshift({
    id: 'matter-source-showing-outside-window',
    source: 'schedule',
    sourceKey: 'source-matter-showing-schedule',
    caseId: caseItem.id,
    scene: 'showing',
    lifecycleCategory: 'execute',
    title: '事项绑定带看',
    detail: '验证 sourceMatter 显式目标',
    stage: 'pending',
    template: 'schedule',
    presentation: 'inline-card',
    kind: 'opportunity',
    openedAtDay: state.day,
  });
  state.todayPlan = {
    day: state.day,
    playerItems: [{
      id: 'planned-source-matter-showing-outside-window',
      day: state.day,
      sourceMatterId: 'matter-source-showing-outside-window',
      linkedActionId: 'showing',
      linkedCaseId: caseItem.id,
      executionMode: 'scenario',
      status: 'planned',
    }],
  };
  const beforeEnergy = state.energy;
  const beforePromotionBudget = state.auxiliaryStats.promotionBudget;
  const beforeBudgetLedgerLength = state.budgetLedger.length;
  const beforeActionsToday = caseItem.actionsToday;

  const result = executeScenarioAction(
    state,
    'showing',
    caseItem.id,
    settlement,
    undefined,
    'planned-source-matter-showing-outside-window',
  );

  assert.equal(result.success, false, 'scenario action should reject a sourceMatter target outside its relation window');
  const nextSourceTarget = result.nextState.opportunities.find((entry) => entry.id === sourceMatterOutsideWindow.id);
  const nextFallback = result.nextState.opportunities.find((entry) => entry.id === fallbackInsideWindow.id);
  assert.ok(nextSourceTarget, 'Expected sourceMatter target opportunity to remain present');
  assert.ok(nextFallback, 'Expected fallback opportunity to remain present');
  assert.equal(nextSourceTarget.intent, 44, 'Rejected sourceMatter target should not receive scenario delta');
  assert.equal(nextSourceTarget.confidence, 45, 'Rejected sourceMatter target should not receive scenario delta');
  assert.equal(nextSourceTarget.stageIndex, 4, 'Rejected sourceMatter target should not be stage-floored');
  assert.equal(nextFallback.intent, 83, 'Rejected sourceMatter action should not fall back to another opportunity');
  assert.equal(nextFallback.confidence, 84, 'Rejected sourceMatter action should not fall back to another opportunity');
  assert.equal(nextFallback.stageIndex, 1, 'Rejected sourceMatter action should not stage-floor fallback opportunity');
  assert.equal(result.nextState.energy, beforeEnergy, 'Rejected sourceMatter target should not spend energy');
  assert.equal(result.nextState.auxiliaryStats.promotionBudget, beforePromotionBudget, 'Rejected sourceMatter target should not spend promotion budget');
  assert.equal(result.nextState.budgetLedger.length, beforeBudgetLedgerLength, 'Rejected sourceMatter target should not append budget ledger entries');
  assert.equal(result.nextState.cases.find((entry) => entry.id === caseItem.id)?.actionsToday, beforeActionsToday, 'Rejected sourceMatter target should not count as an action');
  assert.equal(
    result.nextState.todayPlan.playerItems.find((entry) => entry.id === 'planned-source-matter-showing-outside-window')?.status,
    'planned',
    'Rejected sourceMatter target should leave today plan item planned',
  );
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
