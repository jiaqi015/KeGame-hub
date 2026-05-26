import assert from 'node:assert/strict';

import {
  createInitialState,
  loadSavedState,
  saveGameState,
  normalizeLoadedState,
  updateDerivedState,
} from '../src/selling-houses/application/gameState';
import { LocalAdversarialSelfPlayArena } from '../src/selling-houses/application/localAdversarialSelfPlayArena';
import { LocalAdversarialSelfPlayLab } from '../src/selling-houses/application/localAdversarialSelfPlayLab';
import { buildFinalStats } from '../src/selling-houses/application/cloudSync';
import {
  buildSelfPlayGoldenReport,
  diffSelfPlayGoldenReports,
} from '../src/selling-houses/application/selfPlayGolden';
import {
  buildGeneratedScenarioSummary,
  resolveScenarioOpening,
} from '../src/selling-houses/application/scenarioOpening';
import { advanceDays, executeAction, seedInitialOpportunities } from '../src/selling-houses/domain/engine';
import { asWritableCase, asWritableOpportunity, asWritableGameState, ensureMarketOutcomeState } from '../src/selling-houses/domain/models';
import { sellVisibleRivalForCase } from '../src/selling-houses/domain/rivals/rivalListingEngine';
import { getScenarioSnapshotById, listBuiltInScenarioSummaries } from '../src/selling-houses/domain/scenarioCatalog';

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
  const builtinSummary = listBuiltInScenarioSummaries('standard')[0];

  assert.ok(builtinSummary, 'Expected builtin standard scenario summary');
  assert.equal(builtinSummary.opening.kind, 'scenario', 'Expected builtin scenario summary to carry scenario opening ref');
  if (builtinSummary.opening.kind === 'scenario') {
    assert.equal(builtinSummary.opening.scenarioId, builtinSummary.id, 'Expected builtin opening ref to point to its scenario id');
  }
}

{
  const generatedSummary = buildGeneratedScenarioSummary('standard', 24680, 'standard');

  assert.equal(generatedSummary.opening.kind, 'generated', 'Expected generated summary to carry generated opening ref');
}

{
  const opening = await resolveScenarioOpening({
    openingRef: {
      kind: 'generated',
      difficultyId: 'standard',
      seed: 24680,
      preset: 'standard',
    },
  });

  assert.equal(opening.summary.opening.kind, 'generated', 'Expected generated opening to resolve through opening ref');
  assert.equal(opening.summary.difficultyId, 'standard', 'Expected generated opening difficulty to stay intact');
}

{
  const world = buildWorld();
  const emotional = world.cases[0];
  const urgent = world.cases[1];

  emotional.personality = 'emotional';
  asWritableCase(emotional).trust = 70;
  emotional.heat = 35;
  emotional.windowDays = 9;

  urgent.personality = 'urgent';
  asWritableCase(urgent).urgency = 40;
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

  targetCase.hasCompletedFirstVisit = true;
  asWritableOpportunity(opportunity).stageIndex = 0;
  opportunity.stageLabel = '了解';

  const success = executeAction(world, 'showing', targetCase, null);

  assert.ok(success, 'Expected showing action to execute');
  assert.ok(opportunity.stageIndex >= 2, `Expected showing to advance lead into viewing stage, got ${opportunity.stageIndex}`);
}

{
  const world = buildWorld();
  const targetCase = world.cases[0];
  targetCase.hasCompletedFirstVisit = true;

  const first = executeAction(world, 'weekly-feedback', targetCase, null);
  const second = executeAction(world, 'weekly-feedback', targetCase, null);

  assert.ok(first, 'Expected first weekly-feedback to execute');
  assert.equal(second, false, 'Expected second weekly-feedback on the same day to be blocked');
}

{
  const world = buildWorld();
  const targetCase = world.cases[0];
  targetCase.hasCompletedFirstVisit = true;

  assert.ok(executeAction(world, 'story', targetCase, null), 'Expected first action of the day to execute');
  assert.equal(executeAction(world, 'story', targetCase, null), false, 'Expected repeated story action on the same day to be blocked');
}

{
  const world = buildWorld();
  const targetCase = world.cases[0];
  targetCase.hasCompletedFirstVisit = true;

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

  targetCase.hasCompletedFirstVisit = true;
  asWritableOpportunity(opportunity).stageIndex = 3;
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
      lifecycleStatus: 'closed_by_case',
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
  const world = buildWorld();
  const targetCase = world.cases[0];
  const marketOutcome = ensureMarketOutcomeState(world);
  marketOutcome.releasedSlots = marketOutcome.totalCapacity21d;
  const previousSoldRivals = world.marketShadow.rivalListings.filter((entry) => entry.status === 'sold').length;

  assert.ok(
    sellVisibleRivalForCase(world, targetCase, '验证竞品成交闭环。'),
    'Expected rival sale lifecycle command to close the player case',
  );
  assert.equal(targetCase.status, 'lost_to_rival', 'Expected player case to be marked lost to rival');
  assert.ok(
    world.marketShadow.rivalListings.some((entry) => entry.status === 'sold' && entry.linkedCaseId === targetCase.id),
    'Expected a visible rival listing to be sold for the lost player case',
  );
  assert.ok(
    world.marketShadow.rivalListings.filter((entry) => entry.status === 'sold').length > previousSoldRivals,
    'Expected visible rival sale count to increase',
  );
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
  const world = buildWorld();
  const targetCase = world.cases[0];
  const targetOpportunity = world.opportunities.find((entry) => entry.caseId === targetCase.id);
  assert.ok(targetOpportunity, 'Expected seeded opportunity for aggregate sold-count verification');
  if (!targetOpportunity) {
    throw new Error('Expected seeded opportunity for aggregate sold-count verification');
  }

  asWritableGameState(world).closedDeals = [{
    dealId: 'deal-aggregate-1',
    caseId: targetCase.id,
    customerId: targetOpportunity.customerId,
    sourceRelationId: targetOpportunity.id,
    opportunityId: targetOpportunity.id,
    dayIndex: world.day,
    day: world.day,
    closedAt: new Date().toISOString(),
    dealType: 'self_closed',
    dealPrice: targetCase.askPrice,
    price: targetCase.askPrice,
    closeReadiness: 91,
    closeProbability: 84,
    blockingReasons: [],
    supportingReasons: ['验证自博弈与归档口径'],
  }];
  world.auxiliaryStats.soldCount = 0;
  world.soldCount = 0;
  updateDerivedState(world);

  const finalStats = buildFinalStats(world);
  assert.equal(finalStats.auxiliaryStats.soldCount, 1, 'Expected buildFinalStats to follow formal closed deals');
}

{
  const world = buildWorld();
  const targetCase = world.cases[0];
  const targetOpportunity = world.opportunities.find((entry) => entry.caseId === targetCase.id);
  assert.ok(targetOpportunity, 'Expected seeded opportunity for compatibility verification');
  if (!targetOpportunity) {
    throw new Error('Expected seeded opportunity for compatibility verification');
  }

  asWritableGameState(world).closedDeals = [{
    dealId: 'deal-compat-1',
    caseId: targetCase.id,
    customerId: targetOpportunity.customerId,
    sourceRelationId: targetOpportunity.id,
    opportunityId: targetOpportunity.id,
    dayIndex: world.day,
    day: world.day,
    closedAt: new Date().toISOString(),
    dealType: 'self_closed',
    dealPrice: targetCase.askPrice,
    price: targetCase.askPrice,
    closeReadiness: 94,
    closeProbability: 86,
    blockingReasons: [],
    supportingReasons: ['验证旧存档成交镜像回填'],
  }];
  world.auxiliaryStats.soldCount = 0;
  world.soldCount = 0;

  const normalized = normalizeLoadedState(JSON.parse(JSON.stringify(world)));
  assert.ok(normalized, 'Expected normalizeLoadedState to restore saved world');
  assert.equal(
    normalized?.auxiliaryStats.soldCount,
    1,
    'Expected normalizeLoadedState to rebuild auxiliary sold count from closedDeals',
  );
  assert.equal(
    normalized?.soldCount,
    1,
    'Expected normalizeLoadedState to rebuild legacy soldCount mirror from closedDeals',
  );
}

{
  const previousWindow = (globalThis as { window?: unknown }).window;
  const storage = new Map<string, string>();
  (globalThis as { window?: unknown }).window = {
    localStorage: {
      getItem(key: string) {
        return storage.has(key) ? storage.get(key)! : null;
      },
      setItem(key: string, value: string) {
        storage.set(key, value);
      },
      removeItem(key: string) {
        storage.delete(key);
      },
    },
  };

  try {
    const world = buildWorld();
    const targetCase = world.cases[0];
    const targetOpportunity = world.opportunities.find((entry) => entry.caseId === targetCase.id);
    assert.ok(targetOpportunity, 'Expected seeded opportunity for save/load compatibility verification');
    if (!targetOpportunity) {
      throw new Error('Expected seeded opportunity for save/load compatibility verification');
    }

    asWritableGameState(world).closedDeals = [{
      dealId: 'deal-browser-compat-1',
      caseId: targetCase.id,
      customerId: targetOpportunity.customerId,
      sourceRelationId: targetOpportunity.id,
      opportunityId: targetOpportunity.id,
      dayIndex: world.day,
      day: world.day,
      closedAt: new Date().toISOString(),
      dealType: 'self_closed',
      dealPrice: targetCase.askPrice,
      price: targetCase.askPrice,
      closeReadiness: 95,
      closeProbability: 89,
      blockingReasons: [],
      supportingReasons: ['验证本地保存成交镜像桥接'],
    }];
    world.auxiliaryStats.soldCount = 0;
    world.soldCount = 0;

    saveGameState(world, 'compat@test.ke.com');
    const restored = loadSavedState('compat@test.ke.com');
    assert.ok(restored, 'Expected loadSavedState to restore browser-saved world');
    assert.equal(
      restored?.auxiliaryStats.soldCount,
      1,
      'Expected browser save/load roundtrip to preserve formal sold count bridge',
    );
    assert.equal(
      restored?.soldCount,
      1,
      'Expected browser save/load roundtrip to preserve legacy soldCount mirror',
    );
  } finally {
    if (previousWindow === undefined) {
      delete (globalThis as { window?: unknown }).window;
    } else {
      (globalThis as { window?: unknown }).window = previousWindow;
    }
  }
}

{
  const firstArena = new LocalAdversarialSelfPlayArena({
    scenarioId: 'standard-window-chain',
    seed: 123456,
  });
  const secondArena = new LocalAdversarialSelfPlayArena({
    scenarioId: 'standard-window-chain',
    seed: 123456,
  });
  const firstReport = buildSelfPlayGoldenReport(firstArena.playOneGame());
  const secondReport = buildSelfPlayGoldenReport(secondArena.playOneGame());
  const diff = diffSelfPlayGoldenReports(firstReport, secondReport);

  assert.deepEqual(diff.differences, [], `Expected self-play to be deterministic for same seed, got ${diff.differences.join('; ')}`);
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
