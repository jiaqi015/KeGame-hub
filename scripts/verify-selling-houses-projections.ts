import assert from 'node:assert/strict';

import { createInitialState, normalizeLoadedState, updateDerivedState } from '../src/selling-houses/application/gameState';
import {
  buildCaseDetailProjection,
  buildDashboardProjection,
  buildMarketProjection,
  buildOpportunityListProjection,
  buildOperatingProjection,
} from '../src/selling-houses/application/projections/operatingProjection';
import { buildMyWechatProjection } from '../src/selling-houses/application/projections/myWechatProjection';
import { buildResultProjection } from '../src/selling-houses/application/projections/resultProjection';
import { buildLeaderboardProjection } from '../src/selling-houses/application/projections/leaderboardProjection';
import { buildWorkspaceShellProjection } from '../src/selling-houses/application/projections/workspaceShellProjection';
import { ProfilePanel } from '../src/selling-houses/ui/features/ProfilePanel';
import { resolveRecommendedActionCard } from '../src/selling-houses/ui/features/Cases';
import { resolveDashboardSelectedDayAfterStateDayChange } from '../src/selling-houses/ui/features/Dashboard';
import { buildMarketIntelProjection } from '../src/selling-houses/ui/features/marketIntel';
import { advanceDays, executeAction, seedInitialOpportunities } from '../src/selling-houses/domain/engine';
import { getScenarioSnapshotById } from '../src/selling-houses/domain/scenarioCatalog';
import { getSlotRemainingCapacity } from '../src/selling-houses/application/todayPlan';
import { renderToStaticMarkup } from 'react-dom/server';

function buildWorld() {
  const snapshot = getScenarioSnapshotById('standard-window-chain');
  assert.ok(snapshot, 'Expected standard-window-chain scenario to exist');
  const world = createInitialState(snapshot, 20260419);
  seedInitialOpportunities(world);
  updateDerivedState(world);
  return world;
}

function countChineseChars(content: string) {
  return (content.match(/[\u4e00-\u9fff]/g) || []).length;
}

function containsInternalMetric(content: string) {
  return /trust|patience|urgency|score|D1|D2|D3/i.test(content);
}

function assertOwnerPriceAnchors(world: ReturnType<typeof buildWorld>) {
  world.cases
    .forEach((caseItem) => {
      assert.ok(
        caseItem.bottomPrice > caseItem.marketPrice,
        `Expected ${caseItem.title} owner bottom price to stay above market price`,
      );
      assert.ok(
        caseItem.askPrice > caseItem.bottomPrice,
        `Expected ${caseItem.title} ask price to stay above owner bottom price`,
      );
    });
}

function assertMyWechatProjectionContracts(world: ReturnType<typeof buildWorld>) {
  const operating = buildOperatingProjection(world);
  const marketIntel = buildMarketIntelProjection(world);
  const projection = buildMyWechatProjection({ state: world, dashboard: operating.dashboard, marketIntel });
  const projectionAgain = buildMyWechatProjection({ state: world, dashboard: operating.dashboard, marketIntel });
  const activeCaseIds = new Set(world.cases.filter((entry) => entry.status === 'active').map((entry) => entry.id));
  const opportunityIds = new Set(world.opportunities.map((entry) => entry.id));
  const matterIds = new Set(world.matters.map((entry) => entry.id));
  const leadCaseId = operating.dashboard.todayPriority.find((entry) => entry.caseId)?.caseId
    || world.cases.find((entry) => entry.status === 'active' && entry.isFocused)?.id
    || world.cases.find((entry) => entry.status === 'active')?.id;
  const firstMessage = projection.messages[0];

  assert.ok(projection.messages.length > 0, 'Expected MyWechat messages');
  assert.ok(firstMessage, 'Expected leading MyWechat message');
  assert.ok(
    firstMessage.targetCaseId === leadCaseId || operating.dashboard.todayPriority.some((entry) => entry.caseId === firstMessage.targetCaseId),
    'Expected first MyWechat message to relate to lead case or today priority',
  );
  assert.ok(
    new Set(projection.messages.map((message) => message.senderRole).filter((role) => ['owner', 'customer', 'district_manager', 'store_manager'].includes(role))).size >= 2,
    'Expected MyWechat messages to include at least two human sender classes',
  );
  assert.ok(
    projection.officialAccounts.some((article) => ['market', 'district', 'competitor', 'method', 'community'].includes(article.tag)),
    'Expected official account market/district/competitor/method intel',
  );
  assert.deepEqual(projectionAgain, projection, 'Expected MyWechat projection to be deterministic');

  projection.messages.forEach((message) => {
    assert.ok(message.sourceTrace, 'Expected every MyWechat message to have sourceTrace');
    assert.notEqual(message.sourceTrace.source, 'system', 'Expected no unexplained system-only message source');
    assert.ok(message.sourceTrace.reason.length > 0, 'Expected sourceTrace reason');
    assert.ok(!containsInternalMetric(message.content), 'Expected message content to hide internal metric words');
    assert.ok(countChineseChars(message.content) >= 24, 'Expected WechatMessage content to be at least 24 Chinese chars');
    assert.ok(message.content.includes('：'), 'Expected human message to include Chinese colon voice marker');
    assert.ok(message.preview.length <= message.content.length, 'Expected preview not to exceed content');
    assert.ok(!message.senderName.includes('店长'), 'Expected WeChat sender name to avoid deprecated store-manager label');
    assert.ok(!message.content.startsWith('店长：'), 'Expected WeChat message voice to avoid deprecated store-manager label');
    if (message.senderRole === 'owner') {
      assert.ok(message.targetCaseId && activeCaseIds.has(message.targetCaseId), 'Expected owner message to point to active valid case');
      assert.ok(message.senderName.endsWith('业主'), 'Expected owner sender display to include owner role');
    }
    if (message.senderRole === 'customer') {
      assert.ok(
        (message.targetOpportunityId && opportunityIds.has(message.targetOpportunityId)) || (message.targetCaseId && activeCaseIds.has(message.targetCaseId)),
        'Expected customer message to point to valid opportunity or case',
      );
    }
    if (message.senderRole === 'district_manager' || message.senderRole === 'store_manager') {
      assert.ok(
        message.sourceTrace.source === 'manager_priority'
          || message.sourceTrace.source === 'matter'
          || message.sourceTrace.source === 'event_store'
          || message.sourceTrace.source === 'action_result',
        'Expected manager message to come from priority, matter, risk event, or action result',
      );
    }
    if (message.targetMatterId) {
      assert.ok(matterIds.has(message.targetMatterId), 'Expected targetMatterId to be valid');
    }
  });

  projection.officialAccounts.forEach((article) => {
    assert.ok(article.sourceTrace, 'Expected every official account article to have sourceTrace');
    assert.ok(article.relatedCaseIds.every((caseId) => activeCaseIds.has(caseId)), 'Expected official account relatedCaseIds to be valid active cases');
    assert.ok(!containsInternalMetric(article.summary), 'Expected article summary to hide internal metric words');
    assert.ok(countChineseChars(article.summary) >= 45, 'Expected official account summary to be at least 45 Chinese chars');
    assert.ok(/[建议先要避免准备沟通判断]/.test(article.summary), 'Expected article summary to include operating action language');
  });

  assert.equal(
    new Set(projection.messages.map((message) => message.id)).size,
    projection.messages.length,
    'Expected stable unique message ids',
  );
  assert.equal(
    new Set(projection.officialAccounts.map((article) => article.id)).size,
    projection.officialAccounts.length,
    'Expected stable unique article ids',
  );
  assert.equal(
    new Set(projection.officialAccounts.map((article) => `${article.accountName}|${article.title}|${article.preview}`)).size,
    projection.officialAccounts.length,
    'Expected official account articles to avoid duplicate visible content',
  );
}

{
  const world = buildWorld();
  assertOwnerPriceAnchors(world);
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
  world.todayPlan = {
    day: world.day,
    playerItems: [
      { id: 'verify-am-full', day: world.day, linkedActionId: 'open-day', executionMode: 'direct', status: 'planned', slot: 'am' },
      { id: 'verify-pm-full-1', day: world.day, linkedActionId: 'open-day', executionMode: 'direct', status: 'planned', slot: 'pm' },
      { id: 'verify-pm-full-2', day: world.day, linkedActionId: 'open-day', executionMode: 'direct', status: 'planned', slot: 'pm' },
    ],
  };
  updateDerivedState(world);

  const projection = buildOperatingProjection(world);
  assert.equal(
    projection.dashboard.arrangement.candidateItems.length,
    0,
    'Expected arrangement candidates to exclude items that cannot fit any slot',
  );
  assert.equal(
    projection.dashboard.arrangement.slots.am.candidateItems.length + projection.dashboard.arrangement.slots.pm.candidateItems.length,
    0,
    'Expected slot candidate lists to exclude capacity-blocked items',
  );
}

{
  const world = buildWorld();
  world.day = 10;
  world.energy = 4;
  world.maxEnergy = 4;
  const caseItem = world.cases[0];
  assert.ok(caseItem, 'Expected case for internal meeting arrangement verification');
  caseItem.windowDays = 2;
  const opportunity = world.opportunities.find((entry) => entry.caseId === caseItem.id && entry.status === 'active');
  if (opportunity) {
    opportunity.visibility = 'revealed';
    opportunity.daysLeft = 1.2;
    opportunity.stageLabel = '见面沟通';
  }
  updateDerivedState(world);

  const projection = buildOperatingProjection(world);
  const amSlot = projection.dashboard.arrangement.slots.am;
  assert.equal(getSlotRemainingCapacity(world, 'am'), 0, 'Expected Wednesday internal meeting to occupy the morning slot');
  assert.ok(
    amSlot.fixedItems.some((entry) => entry.title.includes('内部判断')),
    'Expected Wednesday morning fixed item to show the internal meeting',
  );
  assert.ok(
    amSlot.fixedItems.every((entry) => !entry.title.includes(caseItem.title) && !entry.detail.includes('正在从')),
    'Expected urgent owner/customer items not to appear as fixed morning arrangements during internal meeting',
  );
  assert.equal(amSlot.candidateItems.length, 0, 'Expected candidate actions not to be assigned to a blocked morning slot');
}

{
  const world = buildWorld();
  world.day = 11;
  world.energy = 3;
  world.maxEnergy = 3;
  const caseItem = world.cases[0];
  assert.ok(caseItem, 'Expected case for Thursday focus meeting verification');
  caseItem.windowDays = 0.2;
  const opportunity = world.opportunities.find((entry) => entry.caseId === caseItem.id && entry.status === 'active');
  if (opportunity) {
    opportunity.visibility = 'revealed';
    opportunity.daysLeft = 0.2;
    opportunity.stageIndex = 4;
    opportunity.stageLabel = '确认客户需求';
  }
  updateDerivedState(world);

  const liveProjection = buildOperatingProjection(world);
  const liveAmFixedItems = liveProjection.dashboard.arrangement.slots.am.fixedItems;
  assert.equal(world.schedule[0]?.title, '周四上午聚焦会', 'Expected Thursday focus meeting to outrank urgent risk reminders');
  assert.equal(getSlotRemainingCapacity(world, 'am'), 0, 'Expected Thursday focus meeting to occupy the morning slot');
  assert.ok(
    liveAmFixedItems.some((entry) => entry.title === '周四上午聚焦会'),
    'Expected live Thursday morning arrangement to show focus meeting',
  );
  assert.ok(
    liveAmFixedItems.every((entry) => !entry.title.includes(caseItem.title) && !entry.detail.includes('正在从')),
    'Expected urgent owner/customer items not to appear as fixed Thursday morning arrangements',
  );

  const staleSave = JSON.parse(JSON.stringify(world));
  staleSave.schedule = [
    {
      key: 'stale-opportunity-risk',
      caseId: caseItem.id,
      title: '确认客户需求',
      badge: '不足 1 天后流失',
      note: '客户正在流失。',
      urgency: 96,
      slot: 'am',
      source: 'risk',
    },
    {
      key: 'stale-owner-risk',
      caseId: caseItem.id,
      title: '业主开始不耐烦',
      badge: '不足 1 天内',
      note: '业主正在催。',
      urgency: 94,
      slot: 'am',
      source: 'risk',
    },
  ];

  const normalized = normalizeLoadedState(staleSave);
  assert.ok(normalized, 'Expected stale saved state to normalize');
  const projection = buildOperatingProjection(normalized);
  const amFixedItems = projection.dashboard.arrangement.slots.am.fixedItems;
  assert.ok(
    normalized.schedule.some((entry) => entry.title === '周四上午聚焦会'),
    'Expected loaded Thursday save to recompute focus meeting schedule',
  );
  assert.ok(
    amFixedItems.some((entry) => entry.title === '周四上午聚焦会'),
    'Expected Thursday morning arrangement to show focus meeting',
  );
  assert.ok(
    amFixedItems.every((entry) => !entry.title.includes(caseItem.title) && !entry.detail.includes('正在流失')),
    'Expected stale risk reminders not to occupy Thursday morning after load',
  );
}

{
  const world = buildWorld();
  const caseItem = world.cases[0];
  assert.ok(caseItem, 'Expected case for arrangement badge formatting verification');
  world.schedule = [{
    key: 'verify-decimal-days-left',
    caseId: caseItem.id,
    title: '客户快流失',
    badge: '0.9199999999999999 天后流失',
    note: '客户还在犹豫',
    urgency: 92,
    slot: 'am',
    source: 'risk',
  }];
  world.matters = [{
    id: 'verify-decimal-matter-detail',
    source: 'negotiation',
    sourceKey: 'verify-decimal-matter-detail',
    caseId: caseItem.id,
    scene: 'negotiation',
    lifecycleCategory: 'negotiate',
    title: '客户进入见面沟通',
    detail: '陈先生新婚客 已进入 见面沟通，0.9199999999999999 天后可能流失。',
    badge: '今日承接',
    stage: 'pending',
    template: 'dialog',
    presentation: 'inline-card',
    kind: 'opportunity',
    openedAtDay: world.day,
  }];

  const fixedItems = buildOperatingProjection(world).dashboard.arrangement.fixedItems;
  const fixedItem = fixedItems[0];
  const matterItem = fixedItems.find((entry) => entry.id === 'fixed-matter-verify-decimal-matter-detail');
  assert.equal(fixedItem?.statusLabel, '不足 1 天后流失', 'Expected arrangement badges to hide long decimal day counts');
  assert.ok(
    matterItem?.detail.includes('不足 1 天后可能流失'),
    'Expected arrangement details to hide long decimal day counts',
  );
}

{
  const selectedDay = resolveDashboardSelectedDayAfterStateDayChange(1, 2, 1);
  assert.equal(selectedDay, 2, 'Expected Dashboard selected day to follow state.day after daily advance even when yesterday is still visible');
  assert.equal(
    resolveDashboardSelectedDayAfterStateDayChange(1, 1, 1),
    1,
    'Expected Dashboard to preserve manual historical selection when state.day has not advanced',
  );
}

{
  const world = buildWorld();
  const targetCase = world.cases[0];
  const targetOpportunity = world.opportunities.find((entry) => entry.caseId === targetCase.id && entry.visibility !== 'shadow');
  assert.ok(targetCase, 'Expected case for MyWechat projection verification');
  assert.ok(targetOpportunity, 'Expected revealed opportunity for MyWechat projection verification');
  if (!targetOpportunity) {
    throw new Error('Expected revealed opportunity for MyWechat projection verification');
  }

  targetCase.urgency = 92;
  targetCase.heat = 36;
  targetCase.askPrice = Math.round(targetCase.marketPrice * 1.12);
  targetCase.priceGapPct = Math.round(((targetCase.askPrice - targetCase.marketPrice) / targetCase.marketPrice) * 1000) / 10;
  targetCase.lastOwnerTouchedDay = Math.max(0, world.day - 4);
  targetOpportunity.visibility = 'revealed';
  targetOpportunity.stageIndex = 2;
  targetOpportunity.intent = 86;
  targetOpportunity.priceSensitivity = 82;
  targetOpportunity.daysLeft = 1;
  const customerState = world.customerStates.find((entry) => entry.customerId === targetOpportunity.customerId);
  if (customerState) {
    customerState.status = 'comparing';
    customerState.churnRisk = 76;
    customerState.activeCaseIds = Array.from(new Set([...customerState.activeCaseIds, targetCase.id]));
    customerState.caseStates[targetCase.id] = {
      caseId: targetCase.id,
      fit: targetOpportunity.fit,
      interest: 86,
      confidence: 72,
      stageIndex: 2,
      interactions: 2,
      lastActiveDay: world.day,
      viewed: true,
      offered: false,
      selected: true,
      competingCaseIds: [world.cases[1]?.id].filter(Boolean) as string[],
    };
  }
  world.marketShadow.marketSignals.push({
    id: 'verify-wechat-signal',
    type: 'rival_activity',
    district: targetCase.district,
    confidence: 88,
    title: `${targetCase.district} 同类房开始抢客户`,
    message: `${targetCase.community} 同类房新增，客户更容易拿价格和装修做比较。`,
    expiresInDays: 2,
  });
  updateDerivedState(world);

  assertMyWechatProjectionContracts(world);

  const projection = buildMyWechatProjection({
    state: world,
    dashboard: buildOperatingProjection(world).dashboard,
    marketIntel: buildMarketIntelProjection(world),
  });
  assert.ok(
    projection.messages.some((message) => message.sourceTrace.factType.startsWith('owner_') && message.targetCaseId === targetCase.id),
    'Expected owner fact/message to respond to owner urgency, heat, or price gap changes',
  );
  assert.ok(
    projection.messages.some((message) => message.sourceTrace.factType.startsWith('customer_') && message.targetOpportunityId === targetOpportunity.id),
    'Expected customer fact/message to respond to churn, intent, or comparing changes',
  );
  assert.ok(
    projection.officialAccounts.some((article) => article.relatedCaseIds.includes(targetCase.id)),
    'Expected marketShadow/marketIntel changes to create related official account article',
  );
}

{
  const world = buildWorld();
  world.cases = [];
  world.opportunities = [];
  world.matters = [];
  updateDerivedState(world);

  const projection = buildMyWechatProjection({ state: world });
  assert.equal(projection.messages.length, 0, 'Expected no fake owner messages without active cases');
  assert.ok(projection.emptyState, 'Expected empty state without active cases');
}

{
  const blockedPrimary = { action: { id: 'primary-action' }, availability: { enabled: false } };
  const enabledFallback = { action: { id: 'fallback-action' }, availability: { enabled: true } };

  assert.equal(
    resolveRecommendedActionCard([blockedPrimary, enabledFallback], 'primary-action')?.action.id,
    'fallback-action',
    'Expected disabled primary action to fall back to an enabled action card',
  );
  assert.equal(
    resolveRecommendedActionCard([blockedPrimary], 'primary-action'),
    null,
    'Expected no recommended action when all action cards are blocked',
  );
}

{
  const world = buildWorld();
  world.day = 5;
  const firstCase = world.cases[0];
  const secondCase = world.cases[1];
  assert.ok(firstCase && secondCase, 'Expected cases for weekday rhythm verification');
  secondCase.community = firstCase.community;
  secondCase.marketCellId = firstCase.marketCellId;
  world.selectedCaseId = firstCase.id;
  updateDerivedState(world);

  const projection = buildOperatingProjection(world);
  assert.ok(
    projection.dashboard.weekCalendar[0]?.detail.includes('找带看') || projection.dashboard.weekCalendar[0]?.detail.includes('周末前'),
    'Expected Friday calendar to explain prospecting/booking rhythm',
  );
  assert.ok(
    projection.dashboard.arrangement.fixedItems.some((entry) => entry.label === '插单提示' && entry.title.includes('开放日')),
    'Expected Friday open-day interrupt hook to surface as an arrangement hint',
  );
  assert.ok(
    projection.dashboard.todayPriority.some((entry) => entry.detail.includes('蓄客预约拍') || entry.detail.includes('周末前')),
    'Expected today priority copy to include weekday rhythm reason',
  );
}

{
  const world = buildWorld();
  world.day = 6;
  const targetCase = world.cases[0];
  const targetOpportunity = world.opportunities.find((entry) => entry.caseId === targetCase.id);
  assert.ok(targetOpportunity, 'Expected opportunity for weekend interrupt verification');
  if (!targetOpportunity) {
    throw new Error('Expected opportunity for weekend interrupt verification');
  }
  targetOpportunity.visibility = 'revealed';
  targetOpportunity.stageIndex = Math.max(targetOpportunity.stageIndex, 2);
  targetOpportunity.intent = Math.max(targetOpportunity.intent, 76);
  updateDerivedState(world);

  const projection = buildOperatingProjection(world);
  assert.ok(
    projection.dashboard.arrangement.fixedItems.some((entry) => entry.label === '插单提示' && entry.title.includes('复看')),
    'Expected weekend second-showing interrupt hook to surface as an arrangement hint',
  );
  assert.ok(
    projection.dashboard.arrangement.fixedItems.some((entry) => entry.conflictHint),
    'Expected interrupt arrangement to expose a minimal conflict hint',
  );
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
  const caseItem = world.cases[0];
  assert.ok(caseItem, 'Expected case for projection dirty scope verification');
  const opportunity = world.opportunities.find((entry) => entry.caseId === caseItem.id && entry.status === 'active');
  assert.ok(opportunity, 'Expected active opportunity for projection dirty scope verification');
  if (!opportunity) {
    throw new Error('Expected active opportunity for projection dirty scope verification');
  }

  caseItem.askPrice = caseItem.marketPrice;
  caseItem.trust = 100;
  caseItem.competitiveness = 100;
  opportunity.intent = 100;
  opportunity.confidence = 100;
  opportunity.stageIndex = 4;
  opportunity.daysLeft = 3;
  updateDerivedState(world);

  assert.equal(
    executeAction(world, 'invite-customer-negotiation', caseItem, 'close'),
    true,
    'Expected negotiation action to execute before projection dirty scope verification',
  );

  advanceDays(world, 1);
  updateDerivedState(world);

  const shell = buildWorkspaceShellProjection(world);

  assert.ok(
    shell.sidebar.journal.brief.includes(caseItem.district) || shell.sidebar.journal.brief.includes('影响到'),
    'Expected shell journal brief to reflect dirty scope context after daily settlement',
  );
}

{
  const world = buildWorld();
  advanceDays(world, world.maxDay);
  updateDerivedState(world);

  const result = buildResultProjection(world);

  assert.ok(result.hero.title.length > 0, 'Expected result hero title');
  assert.ok(result.summaryCards.length === 6, 'Expected six result summary cards');
  assert.ok(result.tierGroups.length === 3, 'Expected result tier groups');
  assert.ok(result.scoreBreakdown.length > 0, 'Expected result score breakdown');
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
