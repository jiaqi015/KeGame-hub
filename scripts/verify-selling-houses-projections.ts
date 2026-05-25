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
import { buildWeeklySummaryPresentation } from '../src/selling-houses/application/weeklySummary';
import { ProfilePanel } from '../src/selling-houses/ui/features/ProfilePanel';
import { resolveRecommendedActionCard } from '../src/selling-houses/ui/features/Cases';
import { resolveDashboardSelectedDayAfterStateDayChange } from '../src/selling-houses/ui/features/Dashboard';
import { buildMarketIntelProjection } from '../src/selling-houses/ui/features/marketIntel';
import { advanceDays, executeAction, progressCustomerDemand, seedInitialOpportunities } from '../src/selling-houses/domain/engine';
import { executeGameAction, executeScenarioAction } from '../src/selling-houses/application/gameTransitions';
import { getScenarioSnapshotById } from '../src/selling-houses/domain/scenarioCatalog';
import { getSlotRemainingCapacity, hasTodayPlanDuplicate, markTodayPlanItemCompletedByActionMutable } from '../src/selling-houses/application/todayPlan';
import { getActionTemplate, isScenarioAction } from '../src/selling-houses/domain/actions/templates';
import { ACTION_BY_ID } from '../src/selling-houses/domain/actions/definitions';
import { renderToStaticMarkup } from 'react-dom/server';
import { asWritableCase, asWritableOpportunity } from '../src/selling-houses/domain/models';

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
  const customerIds = new Set(world.customers.map((entry) => entry.id));
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
      assert.ok(message.targetCustomerId && customerIds.has(message.targetCustomerId), 'Expected customer message to carry valid targetCustomerId');
      assert.equal(message.sourceTrace.customerId, message.targetCustomerId, 'Expected customer sourceTrace to preserve customer id');
      assert.ok(
        (message.targetOpportunityId && opportunityIds.has(message.targetOpportunityId)) || (message.targetCaseId && activeCaseIds.has(message.targetCaseId)),
        'Expected customer message to point to valid opportunity or case',
      );
      assert.notEqual(message.primaryCtaLabel, '补客源', 'Expected customer message CTA not to use listing-side lead-fill action');
      assert.notEqual(message.primaryActionId, 'broker-broadcast', 'Expected customer message not to schedule lead-fill action');
      assert.notEqual(message.primaryActionId, 'xiaohongshu-boost', 'Expected customer message not to schedule lead-fill action');
    }
    if (message.targetCustomerId) {
      assert.ok(customerIds.has(message.targetCustomerId), 'Expected customer-targeted message to carry valid targetCustomerId');
      assert.notEqual(message.primaryCtaLabel, '补客源', 'Expected customer-targeted message CTA not to use listing-side lead-fill action');
      assert.notEqual(message.primaryActionId, 'broker-broadcast', 'Expected customer-targeted message not to schedule broker lead-fill action');
      assert.notEqual(message.primaryActionId, 'xiaohongshu-boost', 'Expected customer-targeted message not to schedule public lead-fill action');
      assert.ok(
        !message.targetMatterId || message.targetOpportunityId,
        'Expected customer-targeted matter messages to keep opportunity identity instead of falling back to case-only work',
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

function assertCustomerWorldProjectionContracts(world: ReturnType<typeof buildWorld>) {
  const projection = buildOperatingProjection(world);
  const activeOpportunities = world.opportunities.filter((entry) => entry.status === 'active');
  const activeOpportunityCustomerIds = new Set(activeOpportunities.map((entry) => entry.customerId));
  const customersWithRuntimeRelations = world.customerStates
    .filter((entry) => Object.keys(entry.caseStates).length > 0)
    .map((entry) => entry.customerId);

  assert.ok(world.customers.length >= world.cases.length * 10, 'Expected world customer pool to be at least 10x active case scale');
  assert.ok(world.customers.every((customer) => !/#\d+/.test(customer.name)), 'Expected expanded customers to use real names instead of template # suffixes');
  assert.ok(activeOpportunities.length >= world.cases.filter((entry) => entry.status === 'active').length * 3, 'Expected initial world to expose multiple active customer-case relations per listing');
  assert.ok(projection.opportunities.customers.length >= activeOpportunityCustomerIds.size, 'Expected customer projection to cover all active opportunity customers');
  assert.ok(
    projection.opportunities.customers.some((customer) => customer.relations.length >= 2)
      || customersWithRuntimeRelations.length > activeOpportunityCustomerIds.size,
    'Expected first-class customer projection to be built from customer runtime, not only active opportunity cards',
  );
  projection.opportunities.customers.forEach((customer) => {
    assert.ok(customer.customerId, 'Expected customer row to carry customerId');
    assert.ok(customer.name.length > 0, 'Expected customer row to have display name');
    assert.ok(customer.relations.length > 0, 'Expected customer row to carry case relations');
    customer.relations.forEach((relation) => {
      assert.ok(relation.caseId, 'Expected customer relation to carry case id');
      assert.ok(relation.title.length > 0, 'Expected customer relation to display linked listing title');
      assert.notEqual(relation.nextActionId, 'broker-broadcast', 'Expected customer relation not to recommend listing-side lead-fill action');
      assert.notEqual(relation.nextActionId, 'xiaohongshu-boost', 'Expected customer relation not to recommend public lead-fill action');
    });
  });
}

function assertExternalCompetitionContracts(world: ReturnType<typeof buildWorld>) {
  assert.ok(
    world.marketShadow.rivalListings.length >= world.cases.filter((entry) => entry.status === 'active').length * 2,
    'Expected world to seed multiple external rival listings per active listing',
  );

  progressCustomerDemand(world);
  updateDerivedState(world);

  const targetCase = world.cases.find((entry) => entry.status === 'active');
  assert.ok(targetCase, 'Expected active case for external competition contract');
  if (!targetCase) return;
  targetCase.hasCompletedFirstVisit = true;
  targetCase.stageIndex = Math.max(targetCase.stageIndex, 1);
  targetCase.lastAction = '';
  updateDerivedState(world);

  const externalRivalIds = new Set(world.marketShadow.rivalListings.map((entry) => entry.id));
  const customerRuntimes = world.customerStates
    .map((entry) => entry.caseStates[targetCase.id])
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));

  assert.ok(
    customerRuntimes.some((runtime) => (runtime.competingCaseIds || []).some((id) => externalRivalIds.has(id))),
    'Expected customer comparison runtime to reference external rival listings, not only player-owned cases',
  );
  assert.ok(
    customerRuntimes.every((runtime) => (runtime.competingCaseIds || []).every((id) => externalRivalIds.has(id))),
    'Expected competingCaseIds to avoid treating player-owned cases as external competitors',
  );

  const caseProjection = buildCaseDetailProjection(world, targetCase);
  assert.ok(
    caseProjection.comparisonSummary.rivalListings.length > 0,
    'Expected case projection to expose external rival listing briefs',
  );
  assert.ok(
    caseProjection.comparisonSummary.rivalListings.every((entry) => entry.label === '同类在卖房'),
    'Expected comparison summary listing rows to be external comparable listings',
  );
  assert.ok(
    caseProjection.comparisonSummary.comparingCustomers.some((entry) => /正在拿/.test(entry.detail)),
    'Expected comparison summary to show customers comparing against external rival listings',
  );

  const showingTemplate = getActionTemplate(ACTION_BY_ID.showing);
  assert.ok(showingTemplate, 'Expected showing template to exist');
  if (!showingTemplate) return;
  assert.equal(isScenarioAction('showing'), true, 'Expected showing to render through the scenario flow, not direct three-button execution');
  const strategies = showingTemplate.getStrategies(world, targetCase, ACTION_BY_ID.showing);
  const chosenShowingOption = strategies.find((entry) => entry.id.startsWith('show-customer-'));
  assert.ok(chosenShowingOption, 'Expected showing strategies to bind a concrete opportunity id');
  assert.ok(
    strategies.some((entry) => /^带 .+ 看$/.test(entry.title) || entry.title === '先锁定真实看房客户'),
    'Expected showing scene to choose a concrete customer, not a generic showing style',
  );
  assert.ok(
    strategies.some((entry) => entry.title.includes('对标') || entry.title === '先补齐同类房对比'),
    'Expected showing scene to include external comparable-listing preparation',
  );
  assert.ok(
    strategies.some((entry) => entry.title.includes(targetCase.ownerName)),
    'Expected showing scene to include owner feedback follow-through',
  );
  if (chosenShowingOption) {
    const opportunityId = chosenShowingOption.id.replace('show-customer-', '');
    const targetOpportunity = world.opportunities.find((entry) => entry.id === opportunityId);
    assert.ok(targetOpportunity, 'Expected concrete showing strategy id to resolve to an opportunity');
    if (targetOpportunity) {
      const result = executeScenarioAction(
        world,
        'showing',
        targetCase.id,
        {
          outcome: 'progress',
          title: '验证带看写回目标',
          summary: '验证带看写回目标',
          details: [],
          stateDeltas: [
            { field: 'intent', value: 5, label: '意向' },
            { field: 'confidence', value: 4, label: '信心' },
            { field: 'viewings', value: 1, label: '带看' },
          ],
          nextActionHint: '',
          finalOptionId: chosenShowingOption.id,
        },
        { choices: [{ round: 1, main: chosenShowingOption.id, assist: '' }], feedbacks: [] },
      );
      assert.equal(result.success, true, 'Expected concrete showing scenario execution to succeed');
      const nextTarget = result.nextState.opportunities.find((entry) => entry.id === targetOpportunity.id);
      assert.ok(nextTarget, 'Expected target showing opportunity to remain present after execution');
      assert.equal(nextTarget?.customerId, targetOpportunity.customerId, 'Expected showing execution to keep selected customer identity');
      assert.ok((nextTarget?.stageIndex || 0) >= 2, 'Expected selected showing customer to move into viewing stage');
    }
  }
}

function assertFocusMeetingComparisonContract(world: ReturnType<typeof buildWorld>) {
  const currentDow = ((world.day - 1) % 7) + 1;
  const dayDelta = (4 - currentDow + 7) % 7;
  if (dayDelta > 0) {
    advanceDays(world, dayDelta);
  }
  updateDerivedState(world);

  const candidates = world.cases.filter((entry) => entry.status === 'active').slice(0, 3);
  assert.ok(candidates.length >= 2, 'Expected at least two active cases for focus meeting comparison');
  candidates.forEach((caseItem) => {
    caseItem.hasCompletedFirstVisit = true;
  });
  updateDerivedState(world);
  const submittedCaseIds = candidates.map((entry) => entry.id);
  const externalRivalListingIds = candidates.flatMap((caseItem) =>
    buildCaseDetailProjection(world, caseItem).comparisonSummary.rivalListings.map((entry) =>
      entry.id.replace(`case-${caseItem.id}-rival-listing-`, ''),
    ),
  );
  const comparingCustomerIds = candidates.flatMap((caseItem) =>
    buildCaseDetailProjection(world, caseItem).comparisonSummary.comparingCustomers.map((entry) =>
      entry.id.replace(`case-${caseItem.id}-customer-`, ''),
    ),
  );
  assert.ok(externalRivalListingIds.length > 0, 'Expected focus meeting candidates to carry external rival evidence');
  assert.ok(comparingCustomerIds.length > 0, 'Expected focus meeting candidates to carry comparing customer evidence');

  const result = executeGameAction(
    world,
    'focus-meeting-submit',
    candidates[0].id,
    'customer-signal',
    null,
    undefined,
    {
      submittedCaseIds,
      selectedCaseId: submittedCaseIds[1],
      recommendationMode: 'customer-signal',
      externalRivalListingIds,
      comparingCustomerIds,
    },
  );
  assert.equal(result.success, true, 'Expected focus meeting submit to execute as a multi-candidate process');
  assert.deepEqual(result.nextState.focusMeeting.comparisonCaseIds, submittedCaseIds, 'Expected focus meeting to preserve compared candidate ids');
  assert.equal(result.nextState.focusMeeting.selectedCaseId, submittedCaseIds[1], 'Expected focus meeting to preserve final focused case');
  assert.equal(result.nextState.focusMeeting.recommendationMode, 'customer-signal', 'Expected focus meeting to preserve recommendation mode');
  assert.ok(
    (result.nextState.focusMeeting.externalRivalListingIds || []).length > 0,
    'Expected focus meeting execution to store external rival listing evidence',
  );
  assert.ok(
    (result.nextState.focusMeeting.comparingCustomerIds || []).length > 0,
    'Expected focus meeting execution to store comparing customer evidence',
  );
  const event = result.nextState.eventStore.find((entry) =>
    entry.kind === 'action_executed'
    && entry.caseId === candidates[0].id
    && entry.payload.actionId === 'focus-meeting-submit',
  );
  assert.ok(event, 'Expected focus meeting execution event to be recorded');
  assert.ok(
    /外部竞品/.test(event?.detail || '') || (result.nextState.focusMeeting.externalRivalListingIds || []).length > 0,
    'Expected focus meeting event/state to make external comparison auditable',
  );
}

function assertWeeklySummaryStageChangesAreCausal(world: ReturnType<typeof buildWorld>) {
  const before = structuredClone(world);
  const caseItem = world.cases.find((entry) => entry.status === 'active');
  assert.ok(caseItem, 'Expected active case for weekly summary contract');
  if (!caseItem) return;
  world.eventStore.unshift({
    id: 'verify-weekly-summary-action',
    day: world.day,
    date: world.currentDate,
    kind: 'action_executed',
    actor: '经营动作',
    title: '安排带看',
    detail: `${caseItem.title} 执行了 安排带看。`,
    tone: 'accent',
    caseId: caseItem.id,
    payload: {
      actionId: 'showing',
      settlementTitle: `${caseItem.title} 客户带看已安排`,
    },
  });
  world.eventStore.unshift({
    id: 'verify-weekly-summary-market',
    day: world.day,
    date: world.currentDate,
    kind: 'market_event',
    actor: '市场',
    title: '竞品动作',
    detail: `${caseItem.title} 附近出现更低总价外部竞品。`,
    tone: 'danger',
    caseId: caseItem.id,
    payload: {},
  });
  caseItem.viewings += 1;
  caseItem.heat += 8;
  const summary = buildWeeklySummaryPresentation(before, world, [{
    day: world.day,
    nextDay: world.day + 1,
    report: null,
    emittedEvents: world.eventStore.slice(0, 2),
    closedDeals: [],
    processResults: [],
    settledDayProcessResults: [],
    nextDaySetupProcessResults: [],
    dirtyScopes: {
      cases: [caseItem.id],
      opportunities: [],
      customers: [],
      owners: [],
      districts: [],
      marketCells: [],
      matters: [],
      market: true,
      dashboard: true,
      result: false,
    },
    invariantAlerts: [],
  }]);
  const line = summary.caseStageChanges.find((entry) => entry.title === caseItem.title);
  assert.ok(line, 'Expected weekly summary to include changed case');
  assert.ok(line?.detail.includes('带看链路推进'), 'Expected weekly stage line to name the business movement');
  assert.ok(line?.detail.includes('带看后沉淀客户反馈'), 'Expected weekly stage line to explain the causal action');
  assert.equal(
    line?.detail.includes('未必改名'),
    false,
    'Expected weekly stage line not to use generic repeated phase copy',
  );
}

{
  const world = buildWorld();
  assertOwnerPriceAnchors(world);
  const projection = buildOperatingProjection(world);
  assertCustomerWorldProjectionContracts(world);

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
  assertExternalCompetitionContracts(world);
  assertFocusMeetingComparisonContract(world);
  assertWeeklySummaryStageChangesAreCausal(world);
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
  const activeCaseCount = world.cases.filter((entry) => entry.status === 'active').length;
  assert.equal(
    projection.dashboard.arrangement.candidateItems.length,
    activeCaseCount,
    'Expected arrangement candidates to keep one ranked recommendation per active listing even when today is full',
  );
  assert.equal(
    projection.dashboard.arrangement.candidateItems.every((entry, index) => (
      entry.rank === index + 1
      && entry.isDisabled
      && entry.ctaLabel === '排不下'
      && Boolean(entry.disabledReason)
    )),
    true,
    'Expected full-day arrangement candidates to stay visible as disabled ranked recommendations',
  );
}

{
  const world = buildWorld();
  const caseItem = world.cases[0];
  assert.ok(caseItem, 'Expected case for today plan duplicate verification');
  world.todayPlan = {
    day: world.day,
    playerItems: [{
      id: 'verify-source-a',
      day: world.day,
      sourceMatterId: 'matter-source-a',
      linkedActionId: 'weekly-feedback',
      linkedCaseId: caseItem.id,
      executionMode: 'direct',
      status: 'planned',
    }],
  };

  assert.equal(
    hasTodayPlanDuplicate(world, {
      sourceMatterId: 'matter-source-b',
      linkedActionId: 'weekly-feedback',
      linkedCaseId: caseItem.id,
      executionMode: 'direct',
    }),
    true,
    'Expected today plan duplicate detection to ignore sourceMatterId for executable identity',
  );
}

{
  const world = buildWorld();
  const caseItem = world.cases[0];
  assert.ok(caseItem, 'Expected case for today plan executable identity verification');
  world.todayPlan = {
    day: world.day,
    playerItems: [
      {
        id: 'verify-customer-a-plan',
        day: world.day,
        sourceMatterId: 'matter-source-a',
        linkedActionId: 'invite-customer-negotiation',
        linkedCaseId: caseItem.id,
        linkedCustomerId: 'customer-a',
        linkedOpportunityId: 'opportunity-a',
        executionMode: 'scenario',
        status: 'planned',
      },
      {
        id: 'verify-customer-b-plan',
        day: world.day,
        sourceMatterId: 'matter-source-b',
        linkedActionId: 'invite-customer-negotiation',
        linkedCaseId: caseItem.id,
        linkedCustomerId: 'customer-b',
        linkedOpportunityId: 'opportunity-b',
        executionMode: 'scenario',
        status: 'planned',
      },
    ],
  };

  const completed = markTodayPlanItemCompletedByActionMutable(world, 'invite-customer-negotiation', caseItem.id, {
    linkedCustomerId: 'customer-b',
    linkedOpportunityId: 'opportunity-b',
  });

  assert.equal(completed?.id, 'verify-customer-b-plan', 'Expected today plan completion to use action/case/customer/opportunity identity');
  assert.equal(world.todayPlan.playerItems[0]?.status, 'planned', 'Expected unrelated same-case source matter item to stay planned');
  assert.equal(world.todayPlan.playerItems[1]?.status, 'completed', 'Expected explicitly targeted item to complete');
}

{
  const world = buildWorld();
  const caseItem = world.cases[0];
  assert.ok(caseItem, 'Expected case for direct execution fallback identity verification');
  caseItem.hasCompletedFirstVisit = true;
  world.todayPlan = {
    day: world.day,
    playerItems: [
      {
        id: 'verify-targeted-feedback-plan',
        day: world.day,
        sourceMatterId: 'matter-source-targeted',
        linkedActionId: 'weekly-feedback',
        linkedCaseId: caseItem.id,
        linkedCustomerId: 'customer-targeted',
        linkedOpportunityId: 'opportunity-targeted',
        executionMode: 'direct',
        status: 'planned',
      },
      {
        id: 'verify-case-feedback-plan',
        day: world.day,
        sourceMatterId: 'matter-source-case',
        linkedActionId: 'weekly-feedback',
        linkedCaseId: caseItem.id,
        executionMode: 'direct',
        status: 'planned',
      },
    ],
  };

  const result = executeGameAction(world, 'weekly-feedback', caseItem.id);
  assert.equal(result.success, true, 'Expected direct feedback to execute');
  assert.equal(
    result.nextState.todayPlan.playerItems.find((entry) => entry.id === 'verify-targeted-feedback-plan')?.status,
    'planned',
    'Expected direct fallback completion not to complete a customer-bound item by case/action only',
  );
  assert.equal(
    result.nextState.todayPlan.playerItems.find((entry) => entry.id === 'verify-case-feedback-plan')?.status,
    'completed',
    'Expected direct fallback completion to complete only the unbound same action/case item',
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
  const caseItem = world.cases[0];
  assert.ok(caseItem, 'Expected case for candidate matter linkage verification');
  caseItem.hasCompletedFirstVisit = false;
  world.opportunities = [];
  world.matters = [{
    id: 'verify-unrelated-negotiation-matter',
    source: 'negotiation',
    sourceKey: 'verify-unrelated-opportunity',
    caseId: caseItem.id,
    scene: 'negotiation',
    lifecycleCategory: 'negotiate',
    title: '无关客户事项',
    detail: '这条事项不该挂到首次面访待选卡上。',
    badge: '验证',
    stage: 'pending',
    template: 'dialog',
    presentation: 'detail-page',
    kind: 'opportunity',
    openedAtDay: world.day,
    updatedAtDay: world.day,
  }];

  const projection = buildOperatingProjection(world);
  const candidate = projection.dashboard.arrangement.candidateItems.find((entry) => (
    entry.caseId === caseItem.id && entry.actionId === 'first-visit'
  ));
  assert.ok(candidate, 'Expected first-visit recommendation candidate');
  assert.equal(candidate?.matterId, undefined, 'Expected first-visit candidate not to link an unrelated negotiation matter');
}

{
  const world = buildWorld();
  const caseItem = world.cases[0];
  assert.ok(caseItem, 'Expected case for ambiguous negotiation matter linkage verification');
  caseItem.hasCompletedFirstVisit = true;
  caseItem.viewings = 2;
  caseItem.offers = 1;
  caseItem.stageIndex = 5;
  caseItem.windowDays = 8;
  world.cases
    .filter((entry) => entry.id !== caseItem.id)
    .forEach((entry) => {
      asWritableCase(entry).status = 'withdrawn';
    });
  const baseOpportunity = world.opportunities.find((entry) => entry.caseId === caseItem.id && entry.status === 'active')
    || world.opportunities[0];
  assert.ok(baseOpportunity, 'Expected base opportunity for ambiguous linkage verification');
  world.opportunities = [
    {
      ...baseOpportunity,
      id: 'verify-opportunity-a',
      customerId: 'verify-customer-a',
      customerName: '客户甲',
      caseId: caseItem.id,
      status: 'active',
      lifecycleStatus: 'active',
      visibility: 'revealed',
      intent: 90,
      confidence: 90,
      stageIndex: 5,
      stageLabel: '见面沟通',
      daysLeft: 2,
      pendingClosingEvaluation: true,
    },
    {
      ...baseOpportunity,
      id: 'verify-opportunity-b',
      customerId: 'verify-customer-b',
      customerName: '客户乙',
      caseId: caseItem.id,
      status: 'active',
      lifecycleStatus: 'active',
      visibility: 'revealed',
      intent: 88,
      confidence: 88,
      stageIndex: 5,
      stageLabel: '见面沟通',
      daysLeft: 3,
      pendingClosingEvaluation: true,
    },
  ];
  updateDerivedState(world);
  world.schedule = [];
  world.matters = world.matters.filter((entry) => entry.source === 'negotiation');

  const projection = buildOperatingProjection(world);
  const candidate = projection.dashboard.arrangement.candidateItems.find((entry) => (
    entry.caseId === caseItem.id && entry.actionId === 'invite-customer-negotiation'
  ));
  assert.ok(candidate, 'Expected negotiation recommendation candidate');
  assert.equal(candidate?.matterId, undefined, 'Expected ambiguous same-case negotiation matters not to attach a sourceMatterId');
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
    asWritableOpportunity(opportunity).stageIndex = 4;
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

  asWritableCase(targetCase).urgency = 92;
  targetCase.heat = 36;
  targetCase.askPrice = Math.round(targetCase.marketPrice * 1.12);
  targetCase.priceGapPct = Math.round(((targetCase.askPrice - targetCase.marketPrice) / targetCase.marketPrice) * 1000) / 10;
  targetCase.lastOwnerTouchedDay = Math.max(0, world.day - 4);
  targetOpportunity.visibility = 'revealed';
  asWritableOpportunity(targetOpportunity).stageIndex = 2;
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
  asWritableOpportunity(targetOpportunity).stageIndex = Math.max(targetOpportunity.stageIndex, 2);
  targetOpportunity.intent = Math.max(targetOpportunity.intent, 76);
  updateDerivedState(world);

  const projection = buildOperatingProjection(world);
  assert.ok(
    projection.dashboard.arrangement.fixedItems.some((entry) => entry.label === '插单提示' && entry.title.includes('复看')),
    'Expected weekend second-showing interrupt hook to surface as an arrangement hint',
  );
  assert.ok(
    projection.dashboard.arrangement.fixedItems.every((entry) => entry.conflictHint?.kind !== 'fixed-overlap'),
    'Expected interrupt arrangement not to show a fixed-overlap warning when the slot still has exact capacity',
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
  caseItem.hasCompletedFirstVisit = true;
  asWritableCase(caseItem).trust = 100;
  caseItem.competitiveness = 100;
  opportunity.intent = 100;
  opportunity.confidence = 100;
  asWritableOpportunity(opportunity).stageIndex = 4;
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
