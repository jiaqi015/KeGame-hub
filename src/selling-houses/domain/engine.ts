import { WEEKLY_ROUTINE } from './constants.js';
import { releaseMarketDealSlotsForDay } from './models.js';
import { recordBudgetChange } from './budget.js';
import type { DailyProcessResultSummary, DailyTickResult, DirtyScopeSet, GameState, TickInvariantAlert, Tone } from './models.js';
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
  advanceProductRunProcessesForDay,
  buildNegotiationProcessResultSummary,
  buildProductRunProcessResultSummary,
  settleNegotiationProcessesForDay,
} from '../runtime/simulation/processes/index.js';
import { buildLiveSemanticReceipt } from '../core/world-state/semantic-receipt/models.js';
import { enrichSemanticReceiptWithDecisionBridge } from '../runtime/simulation/semanticReceiptEnrichment.js';
import { buildDailyOperatingLedgerFromTickResult, enrichStateWithDailyOperatingLedger, enrichLedgerWithActionReceipts } from '../runtime/simulation/dailyOperatingLedgerAdapter.js';
import { buildActionReceiptsForDay, buildCommitmentSettlementsForDay } from '../runtime/simulation/actionReceiptAdapter.js';
import { buildProcessRunsFromState, enrichStateWithProcessRuns } from '../runtime/simulation/processRunAdapter.js';
import { buildOwnerDecisionMomentsFromState, enrichStateWithOwnerDecisionMoments } from '../runtime/simulation/ownerDecisionMomentAdapter.js';
import { buildStrategyForksFromState, enrichStateWithStrategyForks } from '../runtime/simulation/strategyForkAdapter.js';
import { buildManagerInterventionFromFocusMeeting, enrichStateWithManagerInterventions } from '../runtime/simulation/managerInterventionAdapter.js';
import { buildNegotiationReplaysFromState, enrichStateWithNegotiationReplays } from '../runtime/simulation/negotiationReplayAdapter.js';
import { buildBusinessOutcomeReviewsFromState, enrichStateWithBusinessOutcomeReviews } from '../runtime/simulation/businessOutcomeReviewAdapter.js';
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

export function advanceDays(state: GameState, count: number, onMessage?: (msg: string) => void): DailyTickResult[] {
  if (state.gameOver) {
    onMessage?.('本局已经结算，可以直接再开一局。');
    return [];
  }

  const results: DailyTickResult[] = [];
  for (let step = 0; step < count; step += 1) {
    if (state.gameOver) break;
    const result = advanceOneDay(state, onMessage);
    if (result) {
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
  const negotiationResult = settleNegotiationProcessesForDay(state);
  processResults.push(buildNegotiationProcessResultSummary(negotiationResult, { day: settledDay }));
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
      formationCount: negotiationResult.consensusReceipts.formations.length,
      signedCount: negotiationResult.consensusReceipts.signedCount,
      collapsedCount: negotiationResult.consensusReceipts.collapsedCount,
      blockedCount: negotiationResult.consensusReceipts.blockedCount,
      stillPendingCount: negotiationResult.consensusReceipts.stillPendingCount,
      day: settledDay,
    },
  });

  // Non-invasive bridge hook: enrich semantic receipt with daily decision bridge.
  // Reads GameState only through established decision-support adapter boundaries
  // (buildDecisionSupportContextFromLegacyState → buildBrokerPOVSnapshot).
  // Does NOT alter rngCalls, cases, opportunities, closedDeals, eventStore,
  // eventLog, or processResults. Preserves existing pressureReceipts and
  // consensusReceipts. Deterministic: same state → same bridge.
  const enrichedSemanticReceipts = enrichSemanticReceiptWithDecisionBridge(state, semanticReceipts);

  // Non-invasive ledger hook: build per-day operating ledger from tick data.
  // Reads only the already-computed enriched semantic receipt and dirty scopes.
  // Does NOT alter rngCalls, cases, opportunities, closedDeals, eventStore,
  // eventLog, or processResults. Upserts by day (no duplicates).
  // Same state → same ledger entry (deterministic).
  const activeCaseIdsAtEnd = state.cases
    .filter((entry) => entry.status === 'active')
    .map((entry) => entry.id)
    .sort();
  const settledDayDirtyScopes = buildDirtyScopes(state, settledDay, eventStoreStart, closedDealStart);
  const settledDayClosedDeals = getNewEntriesAfterUnshift(state.closedDeals, closedDealStart);
  const settledDayEmittedEvents = getNewEntriesAfterUnshift(state.eventStore, eventStoreStart);
  const isGameOver = state.gameOver;

  const ledgerDayEntry = buildDailyOperatingLedgerFromTickResult(
    {
      day: settledDay,
      nextDay: state.day,
      report: state.currentReport,
      emittedEvents: settledDayEmittedEvents,
      closedDeals: settledDayClosedDeals,
      processResults,
      settledDayProcessResults: [],
      nextDaySetupProcessResults: [],
      dirtyScopes: settledDayDirtyScopes,
      invariantAlerts: collectInvariantAlerts(state),
      pressureReceipts,
      semanticReceipts: enrichedSemanticReceipts,
    },
    activeCaseIdsAtEnd,
    isGameOver,
  );

  // Enrich ledger with action receipt and commitment settlement evidence.
  // Reads from already-computed state arrays. Does NOT alter gameplay.
  const dayActionReceipts = buildActionReceiptsForDay(state, settledDay);
  const dayCommitmentSettlements = buildCommitmentSettlementsForDay(state, settledDay);
  const enrichedLedger = enrichLedgerWithActionReceipts(
    ledgerDayEntry,
    dayActionReceipts,
    dayCommitmentSettlements,
  );
  enrichStateWithDailyOperatingLedger(state, enrichedLedger);

  // Non-invasive ProcessRun hook: aggregate action receipts into multi-day process runs.
  // Reads from already-computed actionReceiptHistory. Does NOT alter gameplay.
  // Upsert by runId (no duplicates). Deterministic: same state → same runs.
  try {
    const processRuns = buildProcessRunsFromState(state);
    enrichStateWithProcessRuns(state, processRuns);
  } catch {
    // ProcessRun enrichment is non-invasive — swallow errors silently
  }

  // Non-invasive OwnerDecisionMoment hook: identify owner decision nodes.
  // Reads from already-computed receipt/settlement/run history. Does NOT alter gameplay.
  // Upsert by momentId (no duplicates). Deterministic: same state → same moments.
  try {
    const ownerMoments = buildOwnerDecisionMomentsFromState(state);
    enrichStateWithOwnerDecisionMoments(state, ownerMoments);
  } catch {
    // OwnerDecisionMoment enrichment is non-invasive — swallow errors silently
  }

  // Non-invasive ManagerIntervention hook: generate manager intervention receipt
  // when focus meeting selects cases. Reads only from FocusMeetingState.
  // Does NOT alter rngCalls, cases, opportunities, closedDeals, eventStore.
  try {
    const managerReceipt = buildManagerInterventionFromFocusMeeting(state);
    if (managerReceipt) {
      enrichStateWithManagerInterventions(state, [managerReceipt]);
    }
  } catch {
    // ManagerIntervention enrichment is non-invasive — swallow errors silently
  }

  // Non-invasive StrategyFork hook: generate read-only fork branch summaries.
  // Reads from already-computed receipt/run history. Does NOT alter gameplay.
  // Does NOT pollute main world. Deterministic: same state → same forks.
  try {
    const forks = buildStrategyForksFromState(state);
    enrichStateWithStrategyForks(state, forks);
  } catch {
    // StrategyFork enrichment is non-invasive — swallow errors silently
  }

  // Non-invasive NegotiationReplay hook: generate replay summaries from
  // consensus_to_contract ProcessRuns. Does NOT re-roll dice.
  // Does NOT alter gameplay. Deterministic: same state → same replays.
  try {
    const replays = buildNegotiationReplaysFromState(state);
    enrichStateWithNegotiationReplays(state, replays);
  } catch {
    // NegotiationReplay enrichment is non-invasive — swallow errors silently
  }

  // Non-invasive BusinessOutcomeReview hook: generate structured reviews
  // from ended ProcessRuns. Does NOT create ContractFact.
  // Does NOT alter gameplay. Deterministic: same state → same reviews.
  try {
    const reviews = buildBusinessOutcomeReviewsFromState(state);
    enrichStateWithBusinessOutcomeReviews(state, reviews);
  } catch {
    // BusinessOutcomeReview enrichment is non-invasive — swallow errors silently
  }

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
      semanticReceipts: enrichedSemanticReceipts,
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
  processResults.push(buildProductRunProcessResultSummary(advanceProductRunProcessesForDay(state), { day: state.day }));
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
