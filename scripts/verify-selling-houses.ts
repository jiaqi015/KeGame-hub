import assert from 'node:assert/strict';

import { createInitialState, updateDerivedState } from '../src/selling-houses/application/gameState';
import { LocalAdversarialSelfPlayArena } from '../src/selling-houses/application/localAdversarialSelfPlayArena';
import { LocalAdversarialSelfPlayLab } from '../src/selling-houses/application/localAdversarialSelfPlayLab';
import { advanceDays, executeAction, seedInitialOpportunities } from '../src/selling-houses/domain/engine';
import { getScenarioSnapshotById } from '../src/selling-houses/domain/scenarioCatalog';

function buildWorld() {
  const snapshot = getScenarioSnapshotById('standard-window-chain');
  if (!snapshot) {
    throw new Error('Missing builtin scenario for verification');
  }
  const world = createInitialState(snapshot, 123456);
  seedInitialOpportunities(world);
  updateDerivedState(world);
  return world;
}

{
  const world = buildWorld();
  const emotional = world.cases[0];
  const urgent = world.cases[1];

  emotional.personality = 'emotional';
  emotional.trust = 70;
  emotional.heat = 35;
  emotional.windowDays = 9;

  urgent.personality = 'urgent';
  urgent.urgency = 40;
  urgent.windowDays = 9;

  advanceDays(world, 1);

  assert.ok(emotional.trust <= 66, `Expected emotional owner trust to drop aggressively, got ${emotional.trust}`);
  assert.ok(urgent.urgency >= 45, `Expected urgent owner urgency to grow by at least 5, got ${urgent.urgency}`);
}

{
  const world = buildWorld();
  world.rules.randomEventProbability = 1;
  world.runContext.scenarioSnapshot.scenario.randomEventPool = [{ templateId: 'policy-shift', weight: 1 }];
  const before = world.opportunities
    .filter((opportunity) => opportunity.status === 'active')
    .map((opportunity) => opportunity.confidence);

  advanceDays(world, 1);

  const after = world.opportunities
    .filter((opportunity) => opportunity.status === 'active')
    .map((opportunity) => opportunity.confidence);

  assert.ok(after.length > 0, 'Expected active opportunities after policy-shift verification');
  assert.ok(
    after.every((confidence, index) => confidence <= before[index]),
    'Expected policy shift event to reduce confidence for every active opportunity'
  );
}

{
  const world = buildWorld();
  const targetCase = world.cases[0];
  const opportunity = world.opportunities.find((entry) => entry.caseId === targetCase.id && entry.status === 'active');

  assert.ok(opportunity, 'Expected an initial opportunity for showing verification');
  if (!opportunity) {
    throw new Error('Expected an initial opportunity for showing verification');
  }

  opportunity.stageIndex = 0;
  opportunity.stageLabel = '了解';

  const success = executeAction(world, 'showing', targetCase, null);

  assert.ok(success, 'Expected showing action to execute');
  assert.ok(opportunity.stageIndex >= 2, `Expected showing to advance lead into viewing stage, got ${opportunity.stageIndex}`);
}

{
  const world = buildWorld();
  const targetCase = world.cases[0];

  const first = executeAction(world, 'weekly-feedback', targetCase, null);
  const second = executeAction(world, 'weekly-feedback', targetCase, null);

  assert.ok(first, 'Expected first weekly-feedback to execute');
  assert.equal(second, false, 'Expected second weekly-feedback on the same day to be blocked');
}

{
  const world = buildWorld();
  const targetCase = world.cases[0];

  assert.ok(executeAction(world, 'story', targetCase, null), 'Expected first action of the day to execute');
  assert.equal(executeAction(world, 'story', targetCase, null), false, 'Expected repeated story action on the same day to be blocked');
}

{
  const world = buildWorld();
  const targetCase = world.cases[0];

  assert.ok(executeAction(world, 'showing', targetCase, null), 'Expected first showing to execute');
  assert.equal(executeAction(world, 'showing', targetCase, null), false, 'Expected repeated showing on the same day to be blocked');
}

{
  const world = buildWorld();
  const targetCase = world.cases[0];
  const opportunity = world.opportunities.find((entry) => entry.caseId === targetCase.id && entry.status === 'active');

  if (!opportunity) {
    throw new Error('Expected an initial opportunity for negotiation verification');
  }

  opportunity.stageIndex = 3;
  opportunity.stageLabel = '再看';
  opportunity.intent = 92;
  opportunity.confidence = 88;
  updateDerivedState(world);

  assert.ok(executeAction(world, 'invite-customer-negotiation', targetCase, 'balanced'), 'Expected first negotiation invite to execute');
  assert.equal(
    executeAction(world, 'invite-customer-negotiation', targetCase, 'balanced'),
    false,
    'Expected repeated negotiation invite on the same day to be blocked',
  );
}

{
  const world = buildWorld();
  const targetCase = world.cases[0];

  world.day = 10;
  world.opportunities = [
    {
      id: 'closed-opportunity',
      caseId: targetCase.id,
      customerId: 'test-customer',
      customerName: '测试客户',
      profile: '验证 D1',
      channelId: 'search',
      channelName: '搜索流量',
      fit: 80,
      intent: 45,
      confidence: 40,
      stageIndex: 0,
      stageLabel: '了解',
      status: 'closed',
      leadSource: 'direct',
      visibility: 'revealed',
      createdDay: world.day,
      daysLeft: 5,
      touchedToday: false,
      budgetMax: targetCase.askPrice,
      priceSensitivity: 60,
      stagnationTicks: 0,
      history: [],
    },
  ];
  targetCase.competitivenessSnapshots = [];

  updateDerivedState(world);

  assert.ok(targetCase.d1 > 0, `Expected D1 to recognize recently created opportunity, got ${targetCase.d1}`);
}

{
  const arena = new LocalAdversarialSelfPlayArena({
    scenarioId: 'standard-window-chain',
    seed: 123456,
  });
  const report = arena.playOneGame();

  assert.ok(report.finalResult, 'Expected self-play arena to finish a game');
  assert.ok(report.decisions.length > 0, 'Expected self-play arena to produce decisions');
  assert.ok(report.evaluation.verdict.length > 0, 'Expected self-play arena to produce evaluation');
}

{
  const lab = new LocalAdversarialSelfPlayLab({
    scenarioId: 'standard-window-chain',
    seeds: [101, 202],
  });
  const report = lab.runBatch();

  assert.equal(report.runCount, 2, 'Expected self-play lab to run all requested seeds');
  assert.equal(report.runs.length, 2, 'Expected self-play lab to expose run summaries');
  assert.ok(report.findings.length > 0, 'Expected self-play lab to produce aggregate findings');
}

console.log('selling-houses verification passed');
