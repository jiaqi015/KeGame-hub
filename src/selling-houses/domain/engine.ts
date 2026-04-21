import { WEEKLY_ROUTINE } from './constants.js';
import { recordBudgetChange } from './budget.js';
import { settlePendingDealClosings } from './dealClosing.js';
import type { DailyTickResult, DirtyScopeSet, GameState, TickInvariantAlert, Tone } from './models.js';
import { addDays, average, clamp, getDayOfWeek, getRoutine } from './utils.js';
import { evaluateFinalResult } from './resultEvaluation.js';
import { logEvent, updateDerivedState } from './runtimeState.js';
import { getPromotionBudget } from './runtimeStats.js';
import { executeAction, getActionAvailability } from './engine/actionResolvers.js';
import { tickCompetition } from './engine/competitionEngine.js';
import { fireScheduledEvents, triggerRandomEvent } from './engine/eventEngine.js';
import { createWeeklyReview, tickCases, tickSeasonality, updateCustomers, updateMarkets } from './engine/marketEngine.js';
import { applyCompanyPressure, tickCompanyPressure } from './company/companyPressureEngine.js';
import { applyDailyMarketEvent, rollDailyMarketEvent } from './market/dailyEventDirector.js';
import { settleMarketSignals } from './market/signalEngine.js';
import { applyRivalPressure, tickRivalListings } from './rivals/rivalListingEngine.js';
import { tickRivalStores } from './rivals/rivalStoreEngine.js';
import { applyCustomerFeedbackToCases, applyRivalPullOnCustomers, progressCustomerDemand, touchCustomersForCase } from './engine/customerEngine.js';
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

export function advanceDays(state: GameState, count: number, onMessage?: (msg: string) => void) {
  if (state.gameOver) {
    onMessage?.('本局已经结算，可以直接再开一局。');
    return;
  }

  for (let step = 0; step < count; step += 1) {
    if (state.gameOver) break;
    advanceOneDay(state, onMessage);
  }

  updateDerivedState(state);
}

export function advanceOneDay(state: GameState, onMessage?: (msg: string) => void): DailyTickResult | null {
  if (state.gameOver) {
    onMessage?.('本局已经结算，可以直接再开一局。');
    return null;
  }

  return resolveOneDay(state, onMessage);
}

function buildDirtyScopes(state: GameState, settledDay: number, eventStoreStart: number, closedDealStart: number): DirtyScopeSet {
  const emittedEvents = state.eventStore.slice(0, Math.max(0, state.eventStore.length - eventStoreStart));
  const closedDeals = state.closedDeals.slice(0, Math.max(0, state.closedDeals.length - closedDealStart));
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
        message: `${caseItem.title} 的窗口天数已经变成负数。`,
        caseId: caseItem.id,
      });
    }
  });

  return alerts;
}

function resolveOneDay(state: GameState, onMessage?: (msg: string) => void): DailyTickResult {
  const settledDay = state.day;
  const eventStoreStart = state.eventStore.length;
  const closedDealStart = state.closedDeals.length;
  const beforeD1 = average(state.cases.filter((entry) => entry.status === 'active').map((entry) => entry.d1));
  const beforeD3 = average(state.cases.filter((entry) => entry.status === 'active').map((entry) => entry.d3));
  const beforeCash = getPromotionBudget(state);
  const beforeTrust = average(state.cases.filter((entry) => entry.status === 'active').map((entry) => entry.trust));
  const beforeDanger = state.cases.filter((entry) => entry.status === 'active' && (entry.storylineState === 'critical' || entry.storylineState === 'sliding')).length;

  updateMarkets(state);
  tickSeasonality(state);
  rollDailyMarketEvent(state);
  applyDailyMarketEvent(state);
  tickRivalStores(state);
  tickRivalListings(state);
  applyRivalPressure(state);
  tickCompanyPressure(state);
  applyCompanyPressure(state);
  updateCustomers(state);
  progressCustomerDemand(state);
  applyRivalPullOnCustomers(state);
  tickOpportunities(state);
  applyCustomerFeedbackToCases(state);
  tickCompetition(state);
  fireScheduledEvents(state);
  settlePendingDealClosings(state);
  tickCases(state);
  spawnPassiveLeads(state);
  triggerRandomEvent(state);
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
  const afterD1 = average(state.cases.filter((entry) => entry.status === 'active').map((entry) => entry.d1));
  const afterD3 = average(state.cases.filter((entry) => entry.status === 'active').map((entry) => entry.d3));
  const afterTrust = average(state.cases.filter((entry) => entry.status === 'active').map((entry) => entry.trust));
  const afterDanger = state.cases.filter((entry) => entry.status === 'active' && (entry.storylineState === 'critical' || entry.storylineState === 'sliding')).length;

  const dayEvents = state.eventLog.filter((entry) => entry.day === state.day);
  const majorEvents = dayEvents.filter((entry) => entry.tone === 'success' || entry.tone === 'danger' || entry.tone === 'accent');
  const randomEvents = dayEvents
    .filter((entry) => entry.actor === '市场' || entry.actor === '宏观' || entry.actor === '市场竞争')
    .map((entry) => ({ actor: entry.actor, message: entry.message, tone: entry.tone }));
  const marketNews = randomEvents.map((entry) => entry.message);

  const buildTickResult = (): DailyTickResult => ({
    day: settledDay,
    nextDay: state.day,
    report: state.currentReport,
    emittedEvents: state.eventStore.slice(0, Math.max(0, state.eventStore.length - eventStoreStart)),
    closedDeals: state.closedDeals.slice(0, Math.max(0, state.closedDeals.length - closedDealStart)),
    dirtyScopes: buildDirtyScopes(state, settledDay, eventStoreStart, closedDealStart),
    invariantAlerts: collectInvariantAlerts(state),
  });

  if (state.day >= state.maxDay || !state.cases.some((entry) => entry.status === 'active')) {
    finishGame(state, state.day >= state.maxDay ? `${state.maxDay} 天经营周期结束。` : '所有房源都已经结算。', onMessage);
    const result = buildTickResult();
    state.lastDailyTickResult = result;
    return result;
  }

  state.day += 1;
  state.currentDate = addDays(state.currentDate, 1);

  const routine = getRoutine(state.day, WEEKLY_ROUTINE);
  state.maxEnergy = routine.energy;
  state.energy = state.maxEnergy;

  state.cases.forEach((entry) => {
    entry.isFocused = false;
  });

  if (getDayOfWeek(state.day) === 4) {
    const activeCases = state.cases.filter((entry) => entry.status === 'active');
    const candidates = [...activeCases].sort((left, right) => right.competitiveness - left.competitiveness);
    const selected = candidates.slice(0, 2);
    selected.forEach((entry) => {
      entry.isFocused = true;
      entry.heat = clamp(entry.heat + 15, 0, 100);
    });
    if (selected.length > 0) {
      logEvent(state, '房源聚焦', `今日周四，${selected.map((entry) => entry.title).join(' 和 ')} 脱颖而出，流量集中爆发。`, 'accent');
    }
  }

  updateDerivedState(state);

  state.currentReport = {
    day: state.day - 1,
    title: `第 ${state.day - 1} 天经营简报`,
    majorEvents: majorEvents.map((entry) => ({ actor: entry.actor, message: entry.message, tone: entry.tone })),
    metricsDelta: [
      { label: '漏斗健康 (D1)', value: Math.round((afterD1 - beforeD1) * 10) / 10, unit: 'pts' },
      { label: '业主意愿 (D3)', value: Math.round((afterD3 - beforeD3) * 10) / 10, unit: 'pts' },
      { label: '平均业主信任', value: Math.round((afterTrust - beforeTrust) * 10) / 10, unit: 'pts' },
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
