import { WEEKLY_ROUTINE } from './constants.js';
import { recordBudgetChange } from './budget.js';
import type { GameState, Tone } from './models.js';
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
    resolveOneDay(state, onMessage);
  }

  updateDerivedState(state);
}

function resolveOneDay(state: GameState, onMessage?: (msg: string) => void) {
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

  if (state.day >= state.maxDay || !state.cases.some((entry) => entry.status === 'active')) {
    finishGame(state, state.day >= state.maxDay ? `${state.maxDay} 天经营周期结束。` : '所有房源都已经结算。', onMessage);
    return;
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

  onMessage?.(`第 ${state.day} 天 (${routine.label}) 开始。精力恢复到 ${state.maxEnergy}，今日主题：${routine.theme}。`);
  logEvent(state, '系统', `第 ${state.day} 天开始 (${routine.label})，主题：${routine.theme}。`, 'accent');
}

function finishGame(state: GameState, reason: string, onMessage?: (msg: string) => void) {
  if (state.gameOver) return;
  updateDerivedState(state);
  state.gameOver = true;
  state.finalResult = evaluateFinalResult(state, reason);
  onMessage?.(state.finalResult.summary);
}
