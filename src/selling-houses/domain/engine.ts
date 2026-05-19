import { WEEKLY_ROUTINE } from './constants.js';
import { releaseMarketDealSlotsForDay } from './models.js';
import { recordBudgetChange } from './budget.js';
import type { DailyProcessResultSummary, DailyTickResult, DirtyScopeSet, GameState, TickInvariantAlert, Tone } from './models.js';
import type { InformationSourceRecord } from './world-model/informationSourceTypes.js';
import { addDays, average, clamp, getDayOfWeek, getRoutine } from './utils.js';
import { applyBrokerOwnerTrustDelta } from './trustWriteHelper.js';
import { applyOwnerCasePatienceDelta } from './ownerCaseReadinessHelper.js';
import { evaluateFinalResult } from './resultEvaluation.js';
import { logEvent, recordDomainEvent, updateDerivedState } from './runtimeState.js';
import { getPromotionBudget } from './runtimeStats.js';
import { executeAction, getActionAvailability, spendResources, resolveActionDefinition, refundResources } from './engine/actionResolvers.js';
import { tickCompetition } from './engine/competitionEngine.js';
import { fireScheduledEvents, triggerRandomEvent } from './engine/eventEngine.js';
import { createWeeklyReview, tickCases, tickSeasonality, updateCustomers, updateMarkets } from './engine/marketEngine.js';
import { applyCompanyPressure, tickCompanyPressure } from './company/companyPressureEngine.js';
import { applyDailyMarketEvent, rollDailyMarketEvent } from './market/dailyEventDirector.js';
import { settleMarketSignals } from './market/signalEngine.js';
import { applyRivalPressure, tickRivalListings, tryClaimOpenMarketDealForRivals } from './rivals/rivalListingEngine.js';
import { tickRivalStores } from './rivals/rivalStoreEngine.js';
import { applyCustomerFeedbackToCases, applyRivalPullOnCustomers, progressCustomerDemand, touchCustomersForCase } from './engine/customerEngine.js';
import {
  callSettleNegotiationProcesses,
  callAdvanceProductRunProcesses,
} from './engine/processManagerFacade.js';
import { buildLiveSemanticReceipt } from '../core/world-state/semantic-receipt/models.js';
import {
  adjustCaseOpportunities,
  closeOpportunity,
  computeCustomerFit,
  createOpportunity,
  findBestOpportunity,
  getActiveOpportunities,
  getMarketCell,
  getRandomChannel,
  preferredChannel,
  refreshOpportunityLabel,
  seedInitialOpportunities,
  spawnPassiveLeads,
  tickOpportunities,
} from './engine/opportunityEngine.js';
import { buildExpectations } from './engine/expectationEngine.js';
import { checkForeshadowing, buryNewForeshadowings } from './engine/foreshadowingEngine.js';
import { generateDailyNarrative, updateTopicHistory } from './engine/narrativeEngine.js';
import { createPressureCollectionBuffer, buildPressureReceiptsFromBuffer } from '../core/world-state/competition/pressureBuffer.js';
import {
  buildClockInputFromGameState,
  runBigWorldDayTick,
  applyTickReceiptToRuntime,
  normalizeRuntimeState,
  DEFAULT_COMPACTION_POLICY,
} from './world-model/runtime/index.js';

export {
  adjustCaseOpportunities,
  closeOpportunity,
  computeCustomerFit,
  createOpportunity,
  executeAction,
  findBestOpportunity,
  fireScheduledEvents,
  getActionAvailability,
  getActiveOpportunities,
  getMarketCell,
  getRandomChannel,
  preferredChannel,
  refreshOpportunityLabel,
  refundResources,
  resolveActionDefinition,
  spendResources,
  seedInitialOpportunities,
  spawnPassiveLeads,
  tickCompetition,
  applyCompanyPressure,
  applyDailyMarketEvent,
  applyRivalPressure,
  applyCustomerFeedbackToCases,
  applyRivalPullOnCustomers,
  rollDailyMarketEvent,
  progressCustomerDemand,
  recordDomainEvent,
  settleMarketSignals,
  tickCompanyPressure,
  tickOpportunities,
  tickRivalListings,
  tickRivalStores,
  tickSeasonality,
  triggerRandomEvent,
  touchCustomersForCase,
  updateCustomers,
  updateMarkets,
};

function ensureFocusMeetingDayState(state: GameState) {
  if (state.focusMeeting.submissionDay !== state.day) {
    state.focusMeeting = {
      submissionDay: state.day,
      submittedCaseIds: [],
      selectedCaseIds: [],
    };
  }
}

function focusMeetingScore(state: GameState, caseItem: GameState['cases'][number]) {
  const opportunities = state.opportunities
    .filter((entry) => entry.caseId === caseItem.id && entry.status === 'active')
    .sort((left, right) => (right.stageIndex + right.intent / 100) - (left.stageIndex + left.intent / 100));
  const lead = opportunities[0];
  const stageBonus = !lead ? 0 : lead.stageIndex >= 4 ? 180 : lead.stageIndex >= 3 ? 120 : lead.stageIndex >= 2 ? 70 : 30;
  const quoteBonus = !lead ? 0 : (lead.intent >= 70 ? 36 : lead.intent >= 55 ? 24 : 10);
  const pressureBonus = Math.max(0, 8 - caseItem.windowDays) * 8;
  return (
    stageBonus
    + quoteBonus
    + caseItem.competitiveness * 1.3
    + caseItem.heat * 0.9
    + pressureBonus
    + caseItem.offers * 16
  );
}

export function advanceDays(
  state: GameState,
  count: number,
  onMessage?: (msg: string) => void,
  onTickEnrichment?: (state: GameState, result: DailyTickResult) => void,
): DailyTickResult[] {
  if (state.gameOver) {
    onMessage?.('本局已经结算，可以直接再开一局。');
    return [];
  }

  const results: DailyTickResult[] = [];
  for (let step = 0; step < count; step += 1) {
    if (state.gameOver) break;
    const result = advanceOneDay(state, onMessage);
    if (result) {
      onTickEnrichment?.(state, result);
      results.push(result);
    }
  }

  updateDerivedState(state);
  return results;
}

export function advanceOneDay(state: GameState, onMessage?: (msg: string) => void): DailyTickResult | null {
  if (state.gameOver) {
    onMessage?.('本局已经结算，可以直接再开一局。');
    return null;
  }

  return resolveOneDay(state, onMessage);
}

function getNewEntriesAfterUnshift<T>(items: T[], startLength: number): T[] {
  return items.slice(0, Math.max(0, items.length - startLength));
}

function buildDirtyScopes(state: GameState, settledDay: number, eventStoreStart: number, closedDealStart: number): DirtyScopeSet {
  const emittedEvents = getNewEntriesAfterUnshift(state.eventStore, eventStoreStart);
  const closedDeals = getNewEntriesAfterUnshift(state.closedDeals, closedDealStart);
  const caseIds = new Set<string>();
  const opportunityIds = new Set<string>();
  const customerIds = new Set<string>();
  const ownerRefs = new Set<string>();
  const districts = new Set<string>();
  const marketCellIds = new Set<string>();
  const matterIds = new Set<string>();

  const markCase = (caseId?: string) => {
    if (!caseId) return;
    caseIds.add(caseId);
    const caseItem = state.cases.find((entry) => entry.id === caseId);
    if (!caseItem) return;
    ownerRefs.add(caseItem.ownerName);
    districts.add(caseItem.district);
    marketCellIds.add(caseItem.marketCellId);
  };

  const markOpportunity = (opportunityId?: string) => {
    if (!opportunityId) return;
    opportunityIds.add(opportunityId);
    const opportunity = state.opportunities.find((entry) => entry.id === opportunityId);
    if (!opportunity) return;
    customerIds.add(opportunity.customerId);
    markCase(opportunity.caseId);
  };

  emittedEvents.forEach((entry) => {
    markCase(entry.caseId);
    markOpportunity(entry.opportunityId);
    if (entry.customerId) customerIds.add(entry.customerId);
  });
  closedDeals.forEach((entry) => {
    markCase(entry.caseId);
    markOpportunity(entry.sourceRelationId);
    if (entry.customerId) customerIds.add(entry.customerId);
    if (entry.ownerName) ownerRefs.add(entry.ownerName);
  });
  state.matters.forEach((entry) => {
    if (entry.updatedAtDay === settledDay || entry.resolvedAtDay === settledDay) {
      matterIds.add(entry.id);
      markCase(entry.caseId);
      if (entry.kind === 'opportunity') {
        markOpportunity(entry.sourceKey);
      }
    }
  });

  return {
    cases: [...caseIds],
    opportunities: [...opportunityIds],
    customers: [...customerIds],
    owners: [...ownerRefs],
    districts: [...districts],
    marketCells: [...marketCellIds],
    matters: [...matterIds],
    market: emittedEvents.some((entry) => entry.actor === '市场' || entry.actor === '宏观' || entry.actor === '市场竞争'),
    dashboard: emittedEvents.length > 0 || closedDeals.length > 0 || matterIds.size > 0,
    result: closedDeals.length > 0 || state.gameOver,
  };
}

function collectInvariantAlerts(state: GameState): TickInvariantAlert[] {
  const alerts: TickInvariantAlert[] = [];
  const soldCaseIds = new Set(state.closedDeals.map((entry) => entry.caseId));

  state.closedDeals.forEach((deal, index) => {
    const duplicate = state.closedDeals.findIndex((entry) => entry.caseId === deal.caseId) !== index;
    if (duplicate) {
      alerts.push({
        level: 'error',
        code: 'duplicate_closed_deal',
        message: `${deal.caseTitle || deal.caseId} 在同一局里出现了重复成交记录。`,
        caseId: deal.caseId,
        opportunityId: deal.sourceRelationId,
      });
    }
  });

  state.opportunities.forEach((opportunity) => {
    if (opportunity.status === 'active' && soldCaseIds.has(opportunity.caseId)) {
      alerts.push({
        level: 'warning',
        code: 'active_opportunity_after_case_closed',
        message: `${opportunity.customerName} 仍然挂在已成交房源上。`,
        caseId: opportunity.caseId,
        opportunityId: opportunity.id,
      });
    }
    if (opportunity.stageIndex < 0 || opportunity.stageIndex > 6) {
      alerts.push({
        level: 'error',
        code: 'opportunity_stage_out_of_range',
        message: `${opportunity.customerName} 的机会阶段超出合法范围。`,
        caseId: opportunity.caseId,
        opportunityId: opportunity.id,
      });
    }
  });

  state.cases.forEach((caseItem) => {
    if (caseItem.windowDays < 0) {
      alerts.push({
        level: 'warning',
        code: 'negative_window_days',
        message: `${caseItem.title} 的可推进天数已经变成负数。`,
        caseId: caseItem.id,
      });
    }
  });

  return alerts;
}

function groupProcessResultsByTickPhase(processResults: DailyProcessResultSummary[]) {
  return {
    settledDayProcessResults: processResults.filter((entry) => entry.phase === 'settled-day'),
    nextDaySetupProcessResults: processResults.filter((entry) => entry.phase === 'next-day-setup'),
  };
}

// ---------------------------------------------------------------------------
// Process receipt source record builder
// ---------------------------------------------------------------------------

function buildProcessReceiptSourceRecords(
  state: GameState,
  result: DailyProcessResultSummary,
): InformationSourceRecord<'process_receipt'>[] {
  if (result.processedCount === 0) return [];

  const day = result.day;
  const firstProductRun = result.productRunIds.length > 0
    ? state.productRuns.find((run) => run.id === result.productRunIds[0])
    : undefined;
  const processType = result.managerId === 'negotiation-process-manager'
    ? 'negotiation'
    : firstProductRun?.productType === 'sincere-sale'
      ? 'sincerity_sale'
      : 'open_day';
  const hasDeal = result.closedDealIds.length > 0;
  const subtype = hasDeal
    ? 'deal_signed'
    : result.managerId === 'negotiation-process-manager'
      ? 'negotiation_progressed'
      : processType === 'sincerity_sale'
        ? 'sincerity_sale_completed'
        : 'open_day_completed';
  const caseIds = result.opportunityIds.slice(0, 5);
  const productCaseIds = result.productRunIds.flatMap((runId) => (
    state.productRuns.find((run) => run.id === runId)?.targetIds ?? []
  ));
  const relatedCaseIds = caseIds.length > 0 ? caseIds : productCaseIds.slice(0, 5);

  return [{
    sourceId: `isr-pr-${day}-${result.managerId}`,
    sourceKind: 'process_receipt',
    payload: {
      subtype,
      summary: `${processType} 流程处理: ${result.processedCount}项, ${result.resolvedCount}项解决`,
      processType,
      processId: `process-${result.managerId}-${day}`,
      caseIds: relatedCaseIds,
      customerIds: [],
      brokerIds: ['player-broker'],
      outcome: hasDeal ? 'deal_signed' : result.resolvedCount > 0 ? 'completed' : 'progressed',
      metrics: {
        processedCount: result.processedCount,
        resolvedCount: result.resolvedCount,
        closedDealCount: result.closedDealIds.length,
      },
    },
    day,
    phase: result.phase === 'next-day-setup' ? 'morning' : 'evening',
    entityRefs: relatedCaseIds.length > 0
      ? relatedCaseIds.map((id) => ({ id, kind: 'case' as const }))
      : result.productRunIds.slice(0, 5).map((id) => ({ id, kind: 'process' as const })),
    actorRefs: [{ id: 'player-broker', role: 'player_broker' as const }],
    visibility: { scope: 'player_only', baseDelayDays: 0 },
    confidence: hasDeal ? 1.0 : 0.85,
    delayDays: 0,
    replayKey: `rk-pr-${state.runContext.runSeed}-${day}-${result.managerId}`,
    origin: 'process_run',
  } as InformationSourceRecord<'process_receipt'>];
}

// ---------------------------------------------------------------------------
// BigWorldRuntime — tick the autonomous world movement substrate
// ---------------------------------------------------------------------------

/**
 * Tick the big world runtime: run 8 phases, produce causal events, update summaries.
 * Reads from GameState, produces a receipt, applies receipt back to GameState.
 * The receipt only writes to bigWorldRuntime / worldCausalEvents — never to
 * case trust/patience/opportunity status directly.
 */
function tickBigWorldRuntime(state: GameState): void {
  const clockInput = buildClockInputFromGameState(state);
  const existingRuntime = normalizeRuntimeState(state.bigWorldRuntime, DEFAULT_COMPACTION_POLICY);
  state.bigWorldRuntime = existingRuntime;
  const existingCausalEvents = Array.isArray(state.worldCausalEvents) ? state.worldCausalEvents : [];

  const receipt = runBigWorldDayTick(clockInput, existingRuntime, existingCausalEvents);

  // Apply receipt to runtime state (mutates in place)
  state.bigWorldRuntime = applyTickReceiptToRuntime(state.bigWorldRuntime, receipt);

  // Append causal events to the world causal ledger
  if (receipt.causalEventsToAppend.length > 0) {
    const prev = Array.isArray(state.worldCausalEvents) ? state.worldCausalEvents : [];
    state.worldCausalEvents = [...prev, ...receipt.causalEventsToAppend];
  }

  // Clear consumed source records (they've been ingested by the tick)
  state.pendingSourceRecords = [];
}

function resolveOneDay(state: GameState, onMessage?: (msg: string) => void): DailyTickResult {
  const settledDay = state.day;
  const eventStoreStart = state.eventStore.length;
  const closedDealStart = state.closedDeals.length;
  const beforeScore = average(state.cases.map((entry) => entry.competitiveness));
  const beforeD1 = average(state.cases.filter((entry) => entry.status === 'active').map((entry) => entry.d1));
  const beforeD3 = average(state.cases.filter((entry) => entry.status === 'active').map((entry) => entry.d3));
  const beforeCash = getPromotionBudget(state);
  const beforeTrust = average(state.cases.filter((entry) => entry.status === 'active').map((entry) => entry.trust));
  const beforeDanger = state.cases.filter((entry) => entry.status === 'active' && (entry.storylineState === 'critical' || entry.storylineState === 'sliding')).length;

  const expectations = buildExpectations(state);
  const processResults: DailyProcessResultSummary[] = [];
  const pressureBuffer = createPressureCollectionBuffer(settledDay);

  releaseMarketDealSlotsForDay(state, settledDay);
  updateMarkets(state);
  tickSeasonality(state);
  rollDailyMarketEvent(state);
  applyDailyMarketEvent(state);
  tickRivalStores(state);
  tickRivalListings(state);
  applyRivalPressure(state, pressureBuffer);
  tickCompanyPressure(state);
  applyCompanyPressure(state, pressureBuffer);
  updateCustomers(state);
  progressCustomerDemand(state);
  applyRivalPullOnCustomers(state, pressureBuffer);
  tickOpportunities(state);
  applyCustomerFeedbackToCases(state, pressureBuffer);
  tickCompetition(state, pressureBuffer);
  fireScheduledEvents(state, pressureBuffer);
  const negotiationResult = callSettleNegotiationProcesses(state);
  processResults.push(negotiationResult);
  // Emit process_receipt source records from negotiation settlement
  const negotiationReceipts = buildProcessReceiptSourceRecords(state, negotiationResult);
  if (negotiationReceipts.length > 0) {
    if (!state.pendingSourceRecords) state.pendingSourceRecords = [];
    state.pendingSourceRecords.push(...negotiationReceipts);
  }
  if (state.day >= state.maxDay - 7) {
    tryClaimOpenMarketDealForRivals(state);
  }
  tickCases(state);
  spawnPassiveLeads(state);
  triggerRandomEvent(state, pressureBuffer);
  settleMarketSignals(state);

  if (state.day % 7 === 0) {
    createWeeklyReview(state);
    if (state.rules.weeklyBudgetAllowance > 0) {
      recordBudgetChange(state, {
        amount: state.rules.weeklyBudgetAllowance,
        kind: 'weekly-allocation',
        title: '周度拨付',
        detail: `系统按周补给推广金 ${state.rules.weeklyBudgetAllowance} 点。`,
      });
      logEvent(state, '系统资金', `周度推广金已到账 +${state.rules.weeklyBudgetAllowance} 点。`, 'accent');
    }
  }

  // BigWorld runtime: tick autonomous world movement substrate
  // Produces causal events + summaries. Writes only to bigWorldRuntime / worldCausalEvents.
  tickBigWorldRuntime(state);

  updateDerivedState(state);
  const afterScore = average(state.cases.map((entry) => entry.competitiveness));
  const afterD1 = average(state.cases.filter((entry) => entry.status === 'active').map((entry) => entry.d1));
  const afterD3 = average(state.cases.filter((entry) => entry.status === 'active').map((entry) => entry.d3));
  const afterTrust = average(state.cases.filter((entry) => entry.status === 'active').map((entry) => entry.trust));
  const afterDanger = state.cases.filter((entry) => entry.status === 'active' && (entry.storylineState === 'critical' || entry.storylineState === 'sliding')).length;

  const settledDomainEvents = getNewEntriesAfterUnshift(state.eventStore, eventStoreStart)
    .filter((entry) => entry.day === settledDay);
  const dayEvents = state.eventLog.filter((entry) => entry.day === settledDay);
  const majorEvents = dayEvents.filter((entry) => entry.tone === 'success' || entry.tone === 'danger' || entry.tone === 'accent');
  const randomEvents = dayEvents
    .filter((entry) => entry.actor === '市场' || entry.actor === '宏观' || entry.actor === '市场竞争')
    .map((entry) => ({ actor: entry.actor, message: entry.message, tone: entry.tone }));
  const marketNews = randomEvents.map((entry) => entry.message);

  const pressureReceipts = buildPressureReceiptsFromBuffer(pressureBuffer);

  const semanticReceipts = buildLiveSemanticReceipt({
    day: settledDay,
    pressureReceipts: pressureReceipts
      ? {
          snapshotCount: pressureReceipts.snapshots.length,
          decisionDeltaCount: pressureReceipts.decisionDeltas.length,
          inputCount: pressureReceipts.inputCount,
          day: pressureReceipts.day,
        }
      : undefined,
    consensusReceipts: {
      formationCount: processResults
        .filter((entry) => entry.managerId === 'negotiation-process-manager')
        .reduce((sum, entry) => sum + entry.processedCount, 0),
      signedCount: processResults
        .filter((entry) => entry.managerId === 'negotiation-process-manager')
        .reduce((sum, entry) => sum + entry.closedDealIds.length, 0),
      collapsedCount: 0,
      blockedCount: 0,
      stillPendingCount: processResults
        .filter((entry) => entry.managerId === 'negotiation-process-manager')
        .reduce((sum, entry) => sum + Math.max(0, entry.processedCount - entry.resolvedCount), 0),
      day: settledDay,
    },
  });

  // Runtime enrichment (ledger, process runs, owner moments, etc.) is now handled
  // by the application layer AFTER advanceOneDay returns. This enforces the
  // domain→runtime layer boundary: domain produces raw facts, runtime enriches.

  const buildTickResult = (): DailyTickResult => {
    const processResultGroups = groupProcessResultsByTickPhase(processResults);

    return {
      day: settledDay,
      nextDay: state.day,
      report: state.currentReport,
      emittedEvents: getNewEntriesAfterUnshift(state.eventStore, eventStoreStart),
      closedDeals: getNewEntriesAfterUnshift(state.closedDeals, closedDealStart),
      processResults,
      settledDayProcessResults: processResultGroups.settledDayProcessResults,
      nextDaySetupProcessResults: processResultGroups.nextDaySetupProcessResults,
      dirtyScopes: buildDirtyScopes(state, settledDay, eventStoreStart, closedDealStart),
      invariantAlerts: collectInvariantAlerts(state),
      pressureReceipts,
      semanticReceipts,
    };
  };

  if (state.day >= state.maxDay || !state.cases.some((entry) => entry.status === 'active')) {
    finishGame(state, state.day >= state.maxDay ? `${state.maxDay} 天经营周期结束。` : '所有房源都已经结算。', onMessage);
    const result = buildTickResult();
    state.lastDailyTickResult = result;
    return result;
  }

  state.day += 1;
  state.currentDate = addDays(state.currentDate, 1);
  const productRunProcessResult = callAdvanceProductRunProcesses(state);
  processResults.push(productRunProcessResult);
  const productRunReceipts = buildProcessReceiptSourceRecords(state, productRunProcessResult);
  if (productRunReceipts.length > 0) {
    if (!state.pendingSourceRecords) state.pendingSourceRecords = [];
    state.pendingSourceRecords.push(...productRunReceipts);
  }
  state.todayPlan = {
    day: state.day,
    playerItems: [],
  };

  const routine = getRoutine(state.day, WEEKLY_ROUTINE);
  state.maxEnergy = routine.energy;
  state.energy = state.maxEnergy;

  state.cases.forEach((entry) => {
    entry.isFocused = false;
  });

  if (getDayOfWeek(settledDay) === 4) {
    const submittedCases = (state.focusMeeting.submissionDay === settledDay
      ? state.focusMeeting.submittedCaseIds
      : [])
      .map((caseId) => state.cases.find((entry) => entry.id === caseId))
      .filter((entry): entry is GameState['cases'][number] => Boolean(entry) && entry.status === 'active');
    const selected = submittedCases
      .sort((left, right) => focusMeetingScore(state, right) - focusMeetingScore(state, left))
      .slice(0, 2);
    state.focusMeeting.selectedCaseIds = selected.map((entry) => entry.id);
    selected.forEach((entry) => {
      entry.isFocused = true;
      entry.heat = clamp(entry.heat + 12, 0, 100);
      applyBrokerOwnerTrustDelta(state, entry, 4, '周四聚焦会入选');
      applyOwnerCasePatienceDelta(state, entry, 3, '周四聚焦会入选', 0, 100);
      entry.touchedToday = true;
      entry.touchedOwnerToday = true;
      entry.lastTouchedDay = state.day;
      entry.lastOwnerTouchedDay = state.day;
    });
    if (selected.length > 0) {
      logEvent(state, '周四聚焦会', `${selected.map((entry) => entry.title).join('、')} 通过周四聚焦会入选，业主信心和流量同步抬升。`, 'accent');

      // Organization intervention receipt: manager_message → worldCausalEvents
      // Focus meeting selection is an org-level outcome that must have a receipt.
      // Pushed to pendingSourceRecords; ingested by next tick's tickBigWorldRuntime.
      const runSeed = state.runContext.runSeed;
      const focusManagerRecord: InformationSourceRecord<'manager_message'> = {
        sourceId: `isr-mm-focus-${settledDay}-${runSeed}`,
        sourceKind: 'manager_message',
        day: settledDay,
        phase: 'evening',
        entityRefs: selected.map((entry) => ({ id: entry.id, kind: 'case' as const })),
        actorRefs: [{ id: 'manager', role: 'manager' as const }],
        visibility: { scope: 'broker_chain', baseDelayDays: 0 },
        confidence: 0.95,
        delayDays: 0,
        replayKey: `rk-mm-focus-${settledDay}-${runSeed}`,
        origin: 'daily_settlement',
        payload: {
          subtype: 'focus_case_selected',
          summary: `周四聚焦会选出 ${selected.length} 套房源重点推进`,
          managerId: 'manager',
          targetBrokerId: 'player-broker',
          caseIds: selected.map((entry) => entry.id),
          priority: 80,
          instruction: `聚焦会选定 ${selected.map((entry) => entry.title).join('、')}，集中资源推进`,
        },
      };
      if (!state.pendingSourceRecords) state.pendingSourceRecords = [];
      state.pendingSourceRecords.push(focusManagerRecord);
    } else {
      logEvent(state, '周四聚焦会', '本周四暂无有效提报，聚焦资源未能落地。', 'danger');
    }
  }

  if (getDayOfWeek(state.day) === 4) {
    ensureFocusMeetingDayState(state);
    logEvent(state, '周四聚焦会', '周四上午开始聚焦会提报，今日最多提报 3 套房。', 'accent');
  } else {
    state.focusMeeting = {
      submissionDay: null,
      submittedCaseIds: [],
      selectedCaseIds: [],
    };
  }

  updateDerivedState(state);

  state.currentReport = {
    day: state.day - 1,
    title: `第 ${state.day - 1} 天经营简报`,
    majorEvents: majorEvents.map((entry) => ({ actor: entry.actor, message: entry.message, tone: entry.tone })),
    metricsDelta: [
      { label: '昨日总分', value: Math.round(afterScore), unit: '分', displayMode: 'absolute' },
      { label: '总分变化', value: Math.round((afterScore - beforeScore) * 10) / 10, unit: '分' },
      { label: '客户线变化', value: Math.round((afterD1 - beforeD1) * 10) / 10, unit: '分' },
      { label: '业主配合变化', value: Math.round((afterD3 - beforeD3) * 10) / 10, unit: '分' },
      { label: '业主信任变化', value: Math.round((afterTrust - beforeTrust) * 10) / 10, unit: '分' },
      { label: '高危房源变化', value: afterDanger - beforeDanger, unit: '套' },
      { label: '推广金变动', value: getPromotionBudget(state) - beforeCash, unit: '点' },
    ],
    marketNews,
    todayPlan: {
      label: routine.label,
      theme: routine.theme,
      energy: state.maxEnergy,
      focusCases: state.cases.filter((entry) => entry.isFocused).map((entry) => entry.title).slice(0, 3),
      priorities: state.priorities.slice(0, 3).map((entry: { title: string }) => entry.title),
    },
    randomEvents,
  };

  const resolvedHooks = checkForeshadowing(state.foreshadowingStore, state.eventStore, settledDay);
  const dailyNarrative = generateDailyNarrative({
    events: settledDomainEvents,
    expectations,
    resolvedHooks,
    state: {
      day: settledDay,
      rngState: state.rngState,
      rngCalls: state.rngCalls,
    },
  });

  updateTopicHistory(state, dailyNarrative.eventsUsed);
  buryNewForeshadowings(state, dailyNarrative.newHooks);

  state.currentReport.narrativeLog = dailyNarrative;

  const result = buildTickResult();
  result.report = state.currentReport;
  result.nextDay = state.day;
  state.lastDailyTickResult = result;

  onMessage?.(`第 ${state.day} 天 (${routine.label}) 开始。精力恢复到 ${state.maxEnergy}，今日主题：${routine.theme}。`);
  logEvent(state, '系统', `第 ${state.day} 天开始 (${routine.label})，主题：${routine.theme}。`, 'accent');
  return result;
}

function finishGame(state: GameState, reason: string, onMessage?: (msg: string) => void) {
  if (state.gameOver) return;
  updateDerivedState(state);
  state.currentReport = null;
  state.gameOver = true;
  state.finalResult = evaluateFinalResult(state, reason);
  onMessage?.(state.finalResult.summary);
}
