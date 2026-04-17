import { WEEKLY_ROUTINE } from './constants';
import { recordBudgetChange } from './budget';
import type { GameState } from './models';
import { addDays, average, clamp, getDayOfWeek, getRoutine } from './utils';
import { logEvent, saveGameState, updateDerivedState } from '../application/gameState';
import { executeAction, getActionAvailability } from './engine/actionResolvers';
import { tickCompetition } from './engine/competitionEngine';
import { fireScheduledEvents, triggerRandomEvent } from './engine/eventEngine';
import { createWeeklyReview, tickCases, tickSeasonality, updateCustomers, updateMarkets } from './engine/marketEngine';
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
} from './engine/opportunityEngine';

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
  tickOpportunities,
  tickSeasonality,
  triggerRandomEvent,
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
  saveGameState(state);
}

function resolveOneDay(state: GameState, onMessage?: (msg: string) => void) {
  const beforeD1 = average(state.cases.filter((entry) => entry.status === 'active').map((entry) => entry.d1));
  const beforeD3 = average(state.cases.filter((entry) => entry.status === 'active').map((entry) => entry.d3));
  const beforeCash = state.cash;
  const beforeRep = state.reputation;

  updateMarkets(state);
  tickSeasonality(state);
  updateCustomers(state);
  tickOpportunities(state);
  tickCompetition(state);
  fireScheduledEvents(state);
  tickCases(state);
  spawnPassiveLeads(state);
  triggerRandomEvent(state);

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
      { label: '推广金变动', value: state.cash - beforeCash, unit: '点' },
      { label: '声誉增长', value: Math.round(state.reputation - beforeRep), unit: 'pts' },
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
  state.finalResult = computeFinalResult(state, reason);
  onMessage?.(state.finalResult.summary);
  saveGameState(state);
}

function computeFinalResult(world: GameState, reason: string) {
  const activeOpportunityCount = world.opportunities.filter((entry) => entry.status === 'active').length;
  const spentPromotion = world.budgetLedger
    .filter((entry) => entry.kind === 'action-spend')
    .reduce((sum, entry) => sum + Math.abs(entry.amount), 0);
  const weeklyPromotion = world.budgetLedger
    .filter((entry) => entry.kind === 'weekly-allocation')
    .reduce((sum, entry) => sum + entry.amount, 0);
  const rebatePromotion = world.budgetLedger
    .filter((entry) => entry.kind === 'sale-rebate')
    .reduce((sum, entry) => sum + entry.amount, 0);
  const promotionUsage = new Map<string, { spend: number; count: number }>();
  world.budgetLedger
    .filter((entry) => entry.kind === 'action-spend')
    .forEach((entry) => {
      const actionName = entry.title.replace(/^执行\s*/, '');
      const current = promotionUsage.get(actionName) || { spend: 0, count: 0 };
      current.spend += Math.abs(entry.amount);
      current.count += 1;
      promotionUsage.set(actionName, current);
    });
  const topPromotion = [...promotionUsage.entries()].sort((left, right) => right[1].spend - left[1].spend)[0];
  const xiaohongshuCount = world.eventLog.filter((entry) => entry.actor === '小红书推广').length;
  const brokerPromotionCount = world.eventLog.filter((entry) => entry.actor === '经纪人投放').length;
  const privateReferralCount = world.eventLog.filter((entry) => entry.actor === '私域转介绍').length;
  const soldCases = world.cases.filter((entry) => entry.status === 'sold');
  const bestCase = soldCases.sort((left, right) => (right.soldPrice || 0) - (left.soldPrice || 0))[0]
    || [...world.cases].sort((left, right) => right.competitiveness - left.competitiveness)[0];
  const riskCase = world.cases.find((entry) => entry.status === 'withdrawn')
    || [...world.cases]
      .filter((entry) => entry.status !== 'sold')
      .sort((left, right) => (left.trust + left.windowDays * 4) - (right.trust + right.windowDays * 4))[0];
  const scoreBreakdown = [
    { label: '成交奖励', value: world.soldCount * 45 },
    { label: '佣金贡献', value: Math.round(world.commission * 1.4) },
    { label: '声誉结余', value: Math.round(world.reputation) },
    { label: '撤盘惩罚', value: -world.withdrawnCount * 12 },
    { label: '存量线索', value: activeOpportunityCount * 2 },
  ];
  const score = scoreBreakdown.reduce((sum, entry) => sum + entry.value, 0);
  let title = '还在摸盘的经营者';
  if (score >= 185) title = '能控节奏的成交机器';
  else if (score >= 145) title = '稳健推进的组合经营者';
  else if (score >= 110) title = '开始看懂盘面的资产顾问';
  const summary = `${reason} 本局共成交 ${world.soldCount} 单，撤盘 ${world.withdrawnCount} 单，累计佣金 ${world.commission} 万，最终声誉 ${Math.round(world.reputation)}。`;
  const highlights: string[] = [];
  const improvements: string[] = [];

  if (world.soldCount >= 3) {
    highlights.push('成交收口做得不错，说明你没有只会补量，也能把后段客户压到结果。');
  } else if (world.soldCount >= 1) {
    highlights.push('至少完成了成交闭环，说明节奏里已经有可复制的动作链。');
  }

  if (world.withdrawnCount === 0) {
    highlights.push('这局没有出现撤盘，业主关系和窗口管理比较稳。');
  } else if (world.withdrawnCount >= 2) {
    improvements.push('撤盘偏多，说明你对窗口盘和关系脆弱盘的优先级还不够狠。');
  }

  if (world.cash >= 8) {
    highlights.push('推广金留得比较从容，资源使用没有失控。');
  } else if (world.cash <= 2) {
    improvements.push('推广金几乎打空，说明推广动作和收口动作之间还缺更强的预算纪律。');
  }

  if (activeOpportunityCount >= 4) {
    highlights.push('局末仍保有不少活跃线索，漏斗厚度是在线的。');
  } else if (activeOpportunityCount <= 1 && world.soldCount < 2) {
    improvements.push('局末线索池偏薄，前中段的补量还不够稳定。');
  }

  if (world.reputation < 55) {
    improvements.push('最终声誉偏低，说明部分动作虽然有效，但没有让业主和市场都买账。');
  }

  if (highlights.length === 0) {
    highlights.push('至少把整局完整跑完了，说明你已经开始建立自己的经营节奏。');
  }

  if (improvements.length === 0) {
    improvements.push('下一步可以继续优化资源排序，把好盘和急盘拆得更开。');
  }

  const promotionNotes: string[] = [];
  if (spentPromotion > 0) {
    promotionNotes.push(`本局累计投入推广金 ${spentPromotion} 点，系统周度补给 ${weeklyPromotion} 点，成交返投 ${rebatePromotion} 点。`);
  } else {
    promotionNotes.push('这局几乎没怎么动推广金，说明你主要靠自然线索和经营推进在打。');
  }
  if (topPromotion) {
    promotionNotes.push(`${topPromotion[0]} 是你这局最常用的推广动作，一共做了 ${topPromotion[1].count} 次，投入 ${topPromotion[1].spend} 点。`);
  }
  if (brokerPromotionCount > 0) {
    promotionNotes.push(`你做过 ${brokerPromotionCount} 次经纪人投放，这类动作更适合配合后续“需求确认”，否则待确认客户容易堆积。`);
  } else if (xiaohongshuCount > 0 && privateReferralCount === 0) {
    promotionNotes.push('你更依赖公开客群补量，下一局可以试着更早接入私域转介绍，换更整齐的客资质量。');
  } else if (privateReferralCount > 0 && xiaohongshuCount === 0) {
    promotionNotes.push('你这局更偏向高质量关系链打法，适合继续配合精修卖点，把高信任盘打深。');
  }

  const coachNotes: string[] = [];
  if (bestCase) {
    coachNotes.push(
      bestCase.status === 'sold'
        ? `${bestCase.title} 是这局最成功的一套盘，最终收在 ${bestCase.soldPrice} 万，说明这类盘型的打法你已经有感觉了。`
        : `${bestCase.title} 到局末仍是你盘面最好的牌，说明这类盘更适合你当前的经营节奏。`,
    );
  }
  if (riskCase) {
    coachNotes.push(
      riskCase.status === 'withdrawn'
        ? `${riskCase.title} 最终撤盘，复盘时重点看它前中段是不是被更强的盘抢走了资源。`
        : `${riskCase.title} 到局末仍没完全收口，下次可以更早判断它到底该补量、稳关系，还是直接缩资源。`,
    );
  }
  if (world.cases.filter((entry) => entry.qualityStory > 0).length === 0) {
    coachNotes.push('这局几乎没怎么用精修卖点，后面可以更早把“货盘讲法”做扎实，再去承接推广流量。');
  } else if (world.cases.filter((entry) => entry.qualityStory > 0).length >= 2) {
    coachNotes.push('你有意识地先修讲法再做推进，这是对的，后面可以继续强化“先搭产品，再放流量”的节奏。');
  }

  const nextRunAdvice: string[] = [];
  if (world.withdrawnCount > 0) {
    nextRunAdvice.push('下一局开场先圈出窗口最短的两套盘，前 3 天优先保盘，不要平均用力。');
  }
  if (activeOpportunityCount <= 1) {
    nextRunAdvice.push('下一局中段要更主动补池子，别等线索快干了才开始做小红书或经纪人投放。');
  }
  if (world.cash <= 2) {
    nextRunAdvice.push('推广金要留给最值得推的盘，不是每套盘都值得花钱补量。');
  }
  if (world.cases.some((entry) => entry.status !== 'sold' && entry.trust < 55)) {
    nextRunAdvice.push('关系脆弱的盘要更早做业主沟通，不然你会被迫用更贵的推广动作去救火。');
  }
  if (nextRunAdvice.length === 0) {
    nextRunAdvice.push('下一局可以尝试更激进一点，把最强的两套盘拉开资源差，练真正的主次排序。');
  }

  return {
    title,
    summary,
    reason,
    score,
    scoreBreakdown,
    highlights,
    improvements,
    promotionNotes,
    coachNotes,
    nextRunAdvice,
    stats: [
      { label: '经营天数', value: `${Math.min(world.day, world.maxDay)} / ${world.maxDay} 天` },
      { label: '成交单数', value: `${world.soldCount} 单` },
      { label: '撤盘数量', value: `${world.withdrawnCount} 单` },
      { label: '累计佣金', value: `${world.commission} 万` },
      { label: '最终声誉', value: `${Math.round(world.reputation)}` },
      { label: '剩余推广金', value: `${world.cash} 点` },
      { label: '最终评分', value: `${score}` },
    ],
  };
}
