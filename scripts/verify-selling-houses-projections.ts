import assert from 'node:assert/strict';

import { createInitialState, updateDerivedState } from '../src/selling-houses/application/gameState';
import {
  buildCaseDetailProjection,
  buildDashboardProjection,
  buildMarketProjection,
  buildOpportunityListProjection,
  buildOperatingProjection,
} from '../src/selling-houses/application/projections/operatingProjection';
import { buildResultProjection } from '../src/selling-houses/application/projections/resultProjection';
import { buildLeaderboardProjection } from '../src/selling-houses/application/projections/leaderboardProjection';
import { buildWorkspaceShellProjection } from '../src/selling-houses/application/projections/workspaceShellProjection';
import { ProfilePanel } from '../src/selling-houses/ui/features/ProfilePanel';
import { advanceDays, seedInitialOpportunities } from '../src/selling-houses/domain/engine';
import { getScenarioSnapshotById } from '../src/selling-houses/domain/scenarioCatalog';
import { renderToStaticMarkup } from 'react-dom/server';

function buildWorld() {
  const snapshot = getScenarioSnapshotById('standard-window-chain');
  assert.ok(snapshot, 'Expected standard-window-chain scenario to exist');
  const world = createInitialState(snapshot, 20260419);
  seedInitialOpportunities(world);
  updateDerivedState(world);
  return world;
}

{
  const world = buildWorld();
  const projection = buildOperatingProjection(world);

  assert.ok(projection.dashboard.todayHeadline.length > 0, 'Expected dashboard headline');
  assert.ok(projection.dashboard.weekCalendar.length === 7, 'Expected seven-day calendar projection');
  assert.ok(projection.cases.length === world.cases.length, 'Expected one case projection per case');
  assert.equal(
    projection.opportunities.totalActive,
    world.opportunities.filter((entry) => entry.status === 'active').length,
    'Expected opportunity projection to count active opportunities',
  );
  assert.ok(projection.market.headline.length > 0, 'Expected market headline');
  assert.ok(projection.market.summary.length > 0, 'Expected market summary');
  assert.ok(projection.market.districtBoards.length === world.markets.length, 'Expected market board per district');
}

{
  const world = buildWorld();
  const targetCase = world.cases[0];
  assert.ok(targetCase, 'Expected at least one case');

  targetCase.askPrice = Math.round(targetCase.marketPrice * 1.08);
  updateDerivedState(world);

  const projection = buildCaseDetailProjection(world, targetCase);
  assert.equal(projection.mainProblem, 'price', 'Expected high ask price to project as price main problem');
  assert.ok(projection.currentRiskTags.includes('挂牌价偏高'), 'Expected price risk tag');
  assert.ok(projection.priceSummary.gapToMarket > 0, 'Expected positive gap to market');
}

{
  const world = buildWorld();
  advanceDays(world, 1);
  updateDerivedState(world);

  const dashboard = buildDashboardProjection(world);
  const market = buildMarketProjection(world);
  const opportunities = buildOpportunityListProjection(world);

  assert.ok(dashboard.yesterdayIntel.length > 0, 'Expected yesterday intel after advancing a day');
  assert.ok(market.radarAxes.customerActivity >= 0, 'Expected customer activity radar axis');
  assert.ok(market.summary.length > 0, 'Expected market summary after advancing a day');
  assert.ok(market.radarCards.length === 5, 'Expected radar cards for all market axes');
  assert.ok(opportunities.bucketSummaries.some((entry) => entry.id === 'met'), 'Expected met opportunity bucket');
  assert.ok(opportunities.bucketSummaries.some((entry) => entry.id === 'potential'), 'Expected potential opportunity bucket');
}

{
  const world = buildWorld();
  advanceDays(world, world.maxDay);
  updateDerivedState(world);

  const result = buildResultProjection(world);

  assert.ok(result.hero.title.length > 0, 'Expected result hero title');
  assert.ok(result.settlementNotes.length >= 2, 'Expected result settlement notes');
  assert.ok(result.careerNotes.length === 3, 'Expected three career notes');
}

{
  const world = buildWorld();
  const targetCase = world.cases[0];
  const targetOpportunity = world.opportunities.find((entry) => entry.caseId === targetCase.id);
  assert.ok(targetOpportunity, 'Expected target opportunity for shell projection verification');
  if (!targetOpportunity) {
    throw new Error('Expected target opportunity for shell projection verification');
  }

  world.closedDeals = [{
    dealId: 'deal-shell-1',
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
    closeReadiness: 92,
    closeProbability: 88,
    blockingReasons: [],
    supportingReasons: ['验证工作台口径'],
  }];
  world.auxiliaryStats.soldCount = 0;
  world.soldCount = 0;
  updateDerivedState(world);

  const shell = buildWorkspaceShellProjection(world);
  assert.equal(shell.resourceTiles.auxiliary.value, '1 成交', 'Expected workspace shell to count formal closed deals');
  assert.equal(shell.auxiliaryPanel.stats[0]?.value, '1 套', 'Expected auxiliary panel to count formal closed deals');
  assert.equal(shell.auxiliaryPanel.rules[2]?.value, '已有成交回款', 'Expected shell phase note to follow formal closed deals');

  const profileMarkup = renderToStaticMarkup(ProfilePanel({ state: world, currentUserNickname: 'tester' }));
  assert.ok(profileMarkup.includes('已成交'), 'Expected profile panel to render sold metric');
  assert.ok(profileMarkup.includes('1 套'), 'Expected profile panel to follow formal closed deal count');
}

{
  const leaderboard = buildLeaderboardProjection({
    seasonId: 'season-1',
    totalScore: [
      { accountId: 'acct-1', userId: 'u1', playerName: '顾问甲', value: 220 },
      { playerProfileId: 'profile-2', userId: 'u2', playerName: '顾问乙', value: 185 },
    ],
    bestScore: [
      { accountId: 'acct-1', userId: 'u1', playerName: '顾问甲', value: 92 },
      { userId: 'u3', playerName: '顾问丙', value: 88 },
    ],
    playCount: [
      { playerProfileId: 'profile-2', userId: 'u2', playerName: '顾问乙', value: 8 },
      { accountId: 'acct-1', userId: 'u1', playerName: '顾问甲', value: 6 },
    ],
  });

  assert.equal(leaderboard.tabs.length, 3, 'Expected three leaderboard tabs');
  assert.ok(leaderboard.tabs.every((tab) => tab.summary.length > 0), 'Expected leaderboard tab summaries');
  assert.ok(leaderboard.highlights.length === 3, 'Expected three leaderboard highlight cards');
  assert.equal(leaderboard.tabs[0]?.entries[0]?.ownerKey, 'acct-1', 'Expected projection to prefer canonical owner key over legacy userId');
}

console.log('selling-houses projection verification passed');
