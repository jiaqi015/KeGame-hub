import assert from 'node:assert/strict';

import { createInitialState, updateDerivedState } from '../src/selling-houses/application/gameState.js';
import { executeScenarioAction } from '../src/selling-houses/application/gameTransitions.js';
import {
  deriveCaseProgression,
  ACTION_STAGE_RELATIONS,
  getActionStageRelation,
} from '../src/selling-houses/domain/actionStageRelations.js';
import type { Settlement } from '../src/selling-houses/domain/actions/templates.js';
import { ACTIONS, OPPORTUNITY_STAGES } from '../src/selling-houses/domain/constants.js';
import { ACTION_EXECUTOR_CONTRACTS } from '../src/selling-houses/domain/engine/actionExecutorContract.js';
import { executeAction, getActionAvailability, seedInitialOpportunities } from '../src/selling-houses/domain/engine.js';
import { asWritableOpportunity } from '../src/selling-houses/domain/models.js';
import type { Case, GameState, Opportunity } from '../src/selling-houses/domain/models.js';
import { getScenarioSnapshotById } from '../src/selling-houses/domain/scenarioCatalog.js';

function buildWorld(seed = 20260429, withOpportunities = true) {
  const snapshot = getScenarioSnapshotById('standard-window-chain');
  assert.ok(snapshot, 'Expected standard-window-chain scenario to exist');
  const world = createInitialState(snapshot, seed);
  if (withOpportunities) {
    seedInitialOpportunities(world);
  }
  updateDerivedState(world);
  return world;
}

function buildOpportunity(world: GameState, caseItem: Case, overrides: Partial<Opportunity> = {}): Opportunity {
  return {
    id: overrides.id || `stage-relation-${caseItem.id}`,
    caseId: caseItem.id,
    customerId: overrides.customerId || `stage-relation-customer-${caseItem.id}`,
    customerName: overrides.customerName || '阶段验证客户',
    profile: overrides.profile || '用于动作阶段关系验证',
    channelId: overrides.channelId || 'private-referral',
    channelName: overrides.channelName || '私域转介绍',
    fit: overrides.fit ?? 86,
    intent: overrides.intent ?? 88,
    confidence: overrides.confidence ?? 82,
    stageIndex: overrides.stageIndex ?? 0,
    stageLabel: overrides.stageLabel || OPPORTUNITY_STAGES[overrides.stageIndex ?? 0],
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

{
  const actionRelationIds = ACTION_STAGE_RELATIONS.map((entry) => entry.actionId);
  const actionExecutorIds = ACTIONS.map((entry) => entry.executorId || entry.id);
  assert.equal(new Set(actionRelationIds).size, actionRelationIds.length, 'Expected action-stage relation ids to be unique');
  actionExecutorIds.forEach((actionId) => {
    assert.ok(getActionStageRelation(actionId), `Expected action ${actionId} to have an action-stage relation`);
  });
  actionRelationIds.forEach((actionId) => {
    assert.ok(actionExecutorIds.includes(actionId), `Expected action-stage relation ${actionId} to map to an action definition`);
  });

  const firstVisit = getActionStageRelation('first-visit');
  const weeklyFeedback = getActionStageRelation('weekly-feedback');
  const showing = getActionStageRelation('showing');
  const negotiation = getActionStageRelation('invite-customer-negotiation');

  assert.equal(firstVisit?.completesPhaseIds.includes('pre_visit'), true, 'Expected first visit to complete the pre-visit phase');
  assert.equal(firstVisit?.revealsOwnerState, true, 'Expected first visit to reveal owner state');
  assert.equal(weeklyFeedback?.availabilityKind, 'stage-independent', 'Expected weekly feedback to stay available across case phases');
  assert.deepEqual(showing?.opportunityStageWindow, { min: 0, max: 2 }, 'Expected showing to bind to early opportunities');
  assert.equal(negotiation?.opportunityStageFloor, 5, 'Expected negotiation to move the opportunity into closing range');
}

{
  const opportunityBoundContracts = ACTION_EXECUTOR_CONTRACTS.filter((entry) => entry.opportunityBound);
  opportunityBoundContracts.forEach((contract) => {
    assert.ok(
      contract.stageRelation.opportunityStageWindow,
      `Expected opportunity-bound contract ${contract.executorId} to keep a stage relation window`,
    );
  });
  assert.deepEqual(
    ACTION_EXECUTOR_CONTRACTS.filter((entry) => entry.revealsOwnerState).map((entry) => entry.executorId),
    ['first-visit'],
    'Expected executor contract not to duplicate revealsOwnerState actions',
  );
}

{
  const world = buildWorld(20260429, false);
  const caseItem = world.cases[0];
  assert.ok(caseItem, 'Expected a case for first-visit progression');

  const before = deriveCaseProgression(world, caseItem);
  assert.equal(before.phase, 'pre_visit', 'Expected unvisited case to stay in pre-visit phase');
  assert.equal(before.ownerStateVisible, false, 'Expected owner state to be hidden before first visit');

  assert.ok(executeAction(world, 'first-visit', caseItem, 'plan-first'), 'Expected first visit to execute');

  const after = deriveCaseProgression(world, caseItem);
  assert.notEqual(after.phase, 'pre_visit', 'Expected first visit to advance out of pre-visit phase');
  assert.equal(after.ownerStateVisible, true, 'Expected owner state to be visible after first visit');
  assert.equal(caseItem.hasCompletedFirstVisit, true, 'Expected direct first visit to complete owner visibility gate');
  assert.equal(caseItem.touchedOwnerToday, true, 'Expected direct first visit to count as owner contact');
  assert.equal(caseItem.lastOwnerTouchedDay, world.day, 'Expected direct first visit to record owner contact day');
  assert.equal(caseItem.stageIndex, after.legacyStageIndex, 'Expected direct first visit case stage to match derived progression');
  assert.equal(caseItem.stageLabel, after.legacyStageLabel, 'Expected direct first visit case label to match derived progression');
  assert.equal(executeAction(world, 'first-visit', caseItem, 'plan-first'), false, 'Expected first visit not to repeat after completion');
}

{
  const world = buildWorld(20260430, true);
  const caseItem = world.cases[0];
  const opportunity = world.opportunities.find((entry) => entry.caseId === caseItem.id && entry.status === 'active');
  assert.ok(opportunity, 'Expected seeded opportunity for sincerity sale progression');

  caseItem.hasCompletedFirstVisit = true;
  caseItem.stageIndex = 0;
  caseItem.viewings = 1;
  caseItem.offers = 0;
  asWritableOpportunity(opportunity).stageIndex = 2;
  opportunity.stageLabel = OPPORTUNITY_STAGES[2];
  opportunity.intent = 88;
  opportunity.confidence = 82;
  updateDerivedState(world);

  assert.ok(executeAction(world, 'sincerity-sale', caseItem, 'balanced-sincerity'), 'Expected sincerity sale to execute');
  assert.ok(opportunity.stageIndex >= 4, `Expected sincerity sale to move opportunity toward offer stage, got ${opportunity.stageIndex}`);
  assert.ok(caseItem.stageIndex >= 4, `Expected sincerity sale to move case toward price stage, got ${caseItem.stageIndex}`);
  assert.ok(caseItem.offers >= 1, 'Expected sincerity sale to mark an offer-side fact for the case');
}

{
  const world = buildWorld(20260439, false);
  const caseItem = world.cases[0];
  assert.ok(caseItem, 'Expected a case for scenario first-visit progression');

  const settlement: Settlement = {
    outcome: 'progress',
    title: '验证情景首次面访',
    summary: '验证情景首次面访',
    details: [],
    stateDeltas: [],
    nextActionHint: '',
    finalOptionId: 'plan-first',
  };

  const result = executeScenarioAction(world, 'first-visit', caseItem.id, settlement);
  const nextCase = result.nextState.cases.find((entry) => entry.id === caseItem.id);
  assert.equal(result.success, true, 'Expected scenario first visit to execute');
  assert.ok(nextCase, 'Expected scenario first visit case to remain present');
  assert.equal(nextCase?.hasCompletedFirstVisit, true, 'Expected scenario first visit to complete owner visibility gate');
  assert.equal(nextCase?.touchedOwnerToday, true, 'Expected scenario first visit to count as owner contact');
  assert.equal(nextCase?.lastOwnerTouchedDay, result.nextState.day, 'Expected scenario first visit to record owner contact day');
  assert.equal(deriveCaseProgression(result.nextState, nextCase as Case).phase, 'positioning', 'Expected scenario first visit to leave pre-visit phase');
  assert.equal(
    getActionAvailability(result.nextState, nextCase as Case, 'first-visit').enabled,
    false,
    'Expected scenario first visit to close repeat first-visit availability',
  );
}

{
  const world = buildWorld(20260436, false);
  const caseItem = world.cases[0];
  assert.ok(caseItem, 'Expected a case for direct opportunity target consistency');
  caseItem.hasCompletedFirstVisit = true;
  caseItem.stageIndex = 3;
  caseItem.viewings = 1;
  caseItem.offers = 0;
  const selectedOpportunity = buildOpportunity(world, caseItem, {
    id: 'stage-relation-direct-sincerity-selected',
    stageIndex: 2,
    stageLabel: OPPORTUNITY_STAGES[2],
    intent: 96,
    confidence: 94,
  });
  const otherOpportunity = buildOpportunity(world, caseItem, {
    id: 'stage-relation-direct-sincerity-other',
    stageIndex: 2,
    stageLabel: OPPORTUNITY_STAGES[2],
    intent: 52,
    confidence: 48,
  });
  world.opportunities = [otherOpportunity, selectedOpportunity];
  updateDerivedState(world);

  assert.ok(executeAction(world, 'sincerity-sale', caseItem, 'balanced-sincerity'), 'Expected direct sincerity sale to execute');
  assert.ok(selectedOpportunity.stageIndex >= 4, `Expected selected opportunity to advance, got ${selectedOpportunity.stageIndex}`);
  assert.ok(otherOpportunity.stageIndex < 4, 'Expected relation floor to stay on executor-selected opportunity, not another eligible line');
}

{
  const world = buildWorld(20260437, false);
  const caseItem = world.cases[0];
  assert.ok(caseItem, 'Expected a case for direct showing target verification');
  caseItem.hasCompletedFirstVisit = true;
  caseItem.stageIndex = 1;
  caseItem.viewings = 0;
  world.opportunities = [
    buildOpportunity(world, caseItem, {
      id: 'stage-relation-direct-showing-primary',
      customerId: 'stage-relation-direct-showing-primary-customer',
      stageIndex: 2,
      stageLabel: OPPORTUNITY_STAGES[2],
      intent: 95,
      confidence: 90,
    }),
    buildOpportunity(world, caseItem, {
      id: 'stage-relation-direct-showing-secondary',
      customerId: 'stage-relation-direct-showing-secondary-customer',
      stageIndex: 1,
      stageLabel: OPPORTUNITY_STAGES[1],
      intent: 60,
      confidence: 50,
    }),
  ];
  updateDerivedState(world);

  assert.equal(executeAction(world, 'showing', caseItem, 'experience-showing'), true, 'Expected direct showing to execute');
  const primary = world.opportunities.find((entry) => entry.id === 'stage-relation-direct-showing-primary');
  const secondary = world.opportunities.find((entry) => entry.id === 'stage-relation-direct-showing-secondary');
  assert.equal(primary?.stageIndex, 3, 'Expected direct showing to advance the selected opportunity');
  assert.equal(secondary?.stageIndex, 1, 'Expected direct showing relation floor not to advance another opportunity');
}

{
  const world = buildWorld(20260441, false);
  const caseItem = world.cases[0];
  assert.ok(caseItem, 'Expected a case for failed direct relation verification');
  caseItem.hasCompletedFirstVisit = true;
  caseItem.stageIndex = 1;
  caseItem.viewings = 0;
  world.opportunities = [];
  updateDerivedState(world);
  const beforeEnergy = world.energy;

  assert.equal(executeAction(world, 'showing', caseItem, 'experience-showing'), false, 'Expected direct showing to fail without an opportunity');
  assert.equal(world.energy, beforeEnergy, 'Expected failed direct showing not to spend energy');
  assert.equal(caseItem.viewings, 0, 'Expected failed direct showing not to increment viewings');
  assert.equal(caseItem.stageIndex, 1, 'Expected failed direct showing not to apply the case stage relation floor');
}

{
  const world = buildWorld(20260440, false);
  const caseItem = world.cases[0];
  assert.ok(caseItem, 'Expected a case for direct negotiation target consistency');
  caseItem.hasCompletedFirstVisit = true;
  caseItem.stageIndex = 4;
  caseItem.offers = 1;
  const selectedOpportunity = buildOpportunity(world, caseItem, {
    id: 'stage-relation-direct-negotiation-selected',
    customerId: 'stage-relation-direct-negotiation-selected-customer',
    stageIndex: 3,
    stageLabel: OPPORTUNITY_STAGES[3],
    intent: 97,
    confidence: 94,
  });
  const otherOpportunity = buildOpportunity(world, caseItem, {
    id: 'stage-relation-direct-negotiation-other',
    customerId: 'stage-relation-direct-negotiation-other-customer',
    stageIndex: 3,
    stageLabel: OPPORTUNITY_STAGES[3],
    intent: 58,
    confidence: 54,
  });
  world.opportunities = [otherOpportunity, selectedOpportunity];
  updateDerivedState(world);

  assert.ok(executeAction(world, 'invite-customer-negotiation', caseItem, 'balanced'), 'Expected direct negotiation invite to execute');
  assert.equal(selectedOpportunity.pendingClosingEvaluation, true, 'Expected selected opportunity to receive closing evaluation');
  assert.equal(otherOpportunity.pendingClosingEvaluation, undefined, 'Expected another eligible opportunity not to receive closing evaluation');
  assert.ok(selectedOpportunity.stageIndex >= 5, `Expected selected opportunity to advance into closing range, got ${selectedOpportunity.stageIndex}`);
  assert.equal(otherOpportunity.stageIndex, 3, 'Expected relation floor to stay on executor-selected negotiation opportunity');
}

{
  const world = buildWorld(20260435, false);
  const caseItem = world.cases[0];
  assert.ok(caseItem, 'Expected a case for phase-bound availability');
  caseItem.hasCompletedFirstVisit = false;
  world.opportunities = [
    buildOpportunity(world, caseItem, {
      id: 'stage-relation-unvisited-showing',
      stageIndex: 1,
      stageLabel: OPPORTUNITY_STAGES[1],
      intent: 86,
      confidence: 82,
    }),
  ];
  updateDerivedState(world);

  assert.equal(getActionAvailability(world, caseItem, 'first-visit').enabled, true, 'Expected first visit to remain available before owner state is visible');
  assert.equal(getActionAvailability(world, caseItem, 'showing').enabled, false, 'Expected showing to wait for first visit even with a warm customer');
  assert.equal(getActionAvailability(world, caseItem, 'invite-customer-negotiation').enabled, false, 'Expected negotiation to wait for first visit and matching phase');
}

{
  const world = buildWorld(20260431, true);
  const caseItem = world.cases[0];
  const opportunity = world.opportunities.find((entry) => entry.caseId === caseItem.id && entry.status === 'active');
  assert.ok(opportunity, 'Expected seeded opportunity for negotiation progression');

  caseItem.hasCompletedFirstVisit = true;
  caseItem.stageIndex = 0;
  caseItem.offers = 0;
  asWritableOpportunity(opportunity).stageIndex = 3;
  opportunity.stageLabel = OPPORTUNITY_STAGES[3];
  opportunity.intent = 94;
  opportunity.confidence = 88;
  updateDerivedState(world);

  assert.ok(executeAction(world, 'invite-customer-negotiation', caseItem, 'balanced'), 'Expected negotiation invite to execute');
  assert.equal(opportunity.pendingClosingEvaluation, true, 'Expected negotiation invite to queue closing evaluation');
  assert.ok(opportunity.stageIndex >= 5, `Expected negotiation invite to move opportunity into closing range, got ${opportunity.stageIndex}`);
  assert.ok(caseItem.stageIndex >= 5, `Expected negotiation invite to move case into closing range, got ${caseItem.stageIndex}`);
}

{
  const world = buildWorld(20260434, false);
  const caseItem = world.cases[0];
  assert.ok(caseItem, 'Expected a case for scenario action progression');

  caseItem.hasCompletedFirstVisit = true;
  caseItem.stageIndex = 0;
  caseItem.viewings = 0;
  caseItem.offers = 0;
  world.opportunities = [
    buildOpportunity(world, caseItem, {
      id: 'stage-relation-scenario-showing',
      stageIndex: 1,
      stageLabel: OPPORTUNITY_STAGES[1],
      intent: 84,
      confidence: 78,
    }),
  ];
  updateDerivedState(world);

  const settlement: Settlement = {
    outcome: 'progress',
    title: '验证情景带看',
    summary: '验证情景带看',
    details: [],
    stateDeltas: [],
    nextActionHint: '',
    finalOptionId: null,
  };

  const result = executeScenarioAction(world, 'showing', caseItem.id, settlement);
  assert.equal(result.success, true, 'Expected scenario showing to execute');

  const nextCase = result.nextState.cases.find((entry) => entry.id === caseItem.id);
  const nextOpportunity = result.nextState.opportunities.find((entry) => entry.id === 'stage-relation-scenario-showing');
  assert.ok(nextCase, 'Expected scenario case to remain present');
  assert.ok(nextOpportunity, 'Expected scenario opportunity to remain present');
  assert.ok(nextOpportunity.stageIndex >= 2, `Expected scenario showing to move the opportunity into showing range, got ${nextOpportunity.stageIndex}`);
  assert.ok(nextCase.stageIndex >= 2, `Expected scenario showing to move the case into showing range, got ${nextCase.stageIndex}`);
  assert.equal(deriveCaseProgression(result.nextState, nextCase).phase, 'showing_validation', 'Expected scenario showing to advance the progression phase');
}

{
  const world = buildWorld(20260438, false);
  const caseItem = world.cases[0];
  assert.ok(caseItem, 'Expected a case for scenario linked target verification');

  caseItem.hasCompletedFirstVisit = true;
  caseItem.stageIndex = 1;
  world.opportunities = [
    buildOpportunity(world, caseItem, {
      id: 'stage-relation-scenario-showing-early',
      customerId: 'stage-relation-scenario-showing-early-customer',
      stageIndex: 1,
      stageLabel: OPPORTUNITY_STAGES[1],
      intent: 62,
      confidence: 58,
    }),
    buildOpportunity(world, caseItem, {
      id: 'stage-relation-scenario-showing-late',
      customerId: 'stage-relation-scenario-showing-late-customer',
      stageIndex: 4,
      stageLabel: OPPORTUNITY_STAGES[4],
      intent: 92,
      confidence: 88,
    }),
  ];
  world.todayPlan = {
    day: world.day,
    playerItems: [{
      id: 'stage-relation-invalid-linked-showing',
      day: world.day,
      linkedActionId: 'showing',
      linkedCaseId: caseItem.id,
      linkedCustomerId: 'stage-relation-scenario-showing-late-customer',
      linkedOpportunityId: 'stage-relation-scenario-showing-late',
      executionMode: 'scenario',
      status: 'planned',
    }],
  };
  updateDerivedState(world);
  const beforeEnergy = world.energy;
  const beforePromotionBudget = world.auxiliaryStats.promotionBudget;

  const settlement: Settlement = {
    outcome: 'progress',
    title: '验证情景带看目标',
    summary: '验证情景带看目标',
    details: [],
    stateDeltas: [{ field: 'intent', value: 5, label: '客户意向' }],
    nextActionHint: '',
    finalOptionId: null,
  };

  const result = executeScenarioAction(world, 'showing', caseItem.id, settlement, undefined, 'stage-relation-invalid-linked-showing');
  const early = result.nextState.opportunities.find((entry) => entry.id === 'stage-relation-scenario-showing-early');
  const late = result.nextState.opportunities.find((entry) => entry.id === 'stage-relation-scenario-showing-late');
  assert.equal(result.success, false, 'Expected scenario showing to reject an explicitly linked opportunity outside the action window');
  assert.equal(result.nextState.energy, beforeEnergy, 'Expected rejected scenario showing not to spend energy');
  assert.equal(result.nextState.auxiliaryStats.promotionBudget, beforePromotionBudget, 'Expected rejected scenario showing not to spend promotion budget');
  assert.equal(early?.stageIndex, 1, 'Expected rejected scenario showing not to advance a fallback opportunity');
  assert.equal(late?.intent, 92, 'Expected rejected scenario showing not to write deltas to the invalid linked opportunity');
}

{
  const world = buildWorld(20260432, false);
  const caseItem = world.cases[0];
  assert.ok(caseItem, 'Expected a case for opportunity-to-case stage mapping');
  caseItem.hasCompletedFirstVisit = true;
  caseItem.stageIndex = 0;
  caseItem.stageLabel = '';
  world.opportunities = [
    buildOpportunity(world, caseItem, {
      id: 'stage-relation-offer',
      stageIndex: 6,
      stageLabel: OPPORTUNITY_STAGES[6],
      intent: 96,
      confidence: 90,
    }),
  ];

  updateDerivedState(world);
  const progression = deriveCaseProgression(world, caseItem);
  assert.equal(caseItem.status, 'active', 'Expected case to remain active while customer has only made an offer');
  assert.equal(progression.legacyStageIndex, 5, 'Expected active offer to map to closing range, not sold');
  assert.equal(caseItem.stageIndex, 5, 'Expected active offer to keep legacy case below sold stage');
  assert.notEqual(caseItem.stageLabel, '已成交', 'Expected active offer not to render as sold');
}

console.log('selling-houses action-stage relation contract verification passed');
