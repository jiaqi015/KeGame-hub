import { 
  ACTIONS, OPPORTUNITY_STAGES, BROKER_NAMES, WEEKLY_ROUTINE, MARKET_EVENT_PROBABILITY, MARKET_EVENT_LABELS
} from './constants';
import { 
  clamp, randomInt, wave, chance, average, addDays, pickWeighted,
  getOpportunityPriority, intersections, getCaseById,
  getDayOfWeek, getRoutine
} from './utils';
import type { Case, GameState, Opportunity } from './models';
import { logEvent, updateDerivedState, saveGameState } from '../application/gameState';

export function advanceDays(state: GameState, count: number, onMessage?: (msg: string) => void) {
  if (state.gameOver) {
    onMessage?.("本局已经结算，可以直接再开一局。");
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
  // Capture "Before" metrics
  const beforeD1 = average(state.cases.filter(c => c.status === 'active').map(c => c.d1));
  const beforeD3 = average(state.cases.filter(c => c.status === 'active').map(c => c.d3));
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
  }

  // Generate Report
  updateDerivedState(state); // Sync metrics before reporting
  const afterD1 = average(state.cases.filter(c => c.status === 'active').map(c => c.d1));
  const afterD3 = average(state.cases.filter(c => c.status === 'active').map(c => c.d3));

  const dayEvents = state.eventLog.filter(e => e.day === state.day);
  const majorEvents = dayEvents.filter(e => e.tone === 'success' || e.tone === 'danger' || e.tone === 'accent');
  const randomEvents = dayEvents
    .filter(e => e.actor === '市场' || e.actor === '宏观' || e.actor === '市场竞争')
    .map(e => ({ actor: e.actor, message: e.message, tone: e.tone }));
  const marketNews = randomEvents.map(e => e.message);

  if (state.day >= state.maxDay || !state.cases.some((entry) => entry.status === "active")) {
    finishGame(state, state.day >= state.maxDay ? `${state.maxDay} 天经营周期结束。` : "所有房源都已经结算。", onMessage);
    return;
  }

  state.day += 1;
  state.currentDate = addDays(state.currentDate, 1);

  // Apply Weekly Routine to Max Energy
  const routine = getRoutine(state.day, WEEKLY_ROUTINE);
  state.maxEnergy = routine.energy;
  state.energy = state.maxEnergy;

  // Thursday Selection Logic (房源聚焦)
  state.cases.forEach(c => c.isFocused = false); // Clear focus
  if (getDayOfWeek(state.day) === 4) {
    const activeCases = state.cases.filter(c => c.status === 'active');
    const candidates = [...activeCases].sort((a, b) => b.competitiveness - a.competitiveness);
    const selected = candidates.slice(0, 2);
    selected.forEach(c => {
      c.isFocused = true;
      c.heat = clamp(c.heat + 15, 0, 100);
    });
    if (selected.length > 0) {
      logEvent(state, "房源聚焦", `今日周四，${selected.map(s => s.title).join(' 和 ')} 脱颖而出，流量集中爆发。`, "accent");
    }
  }

  updateDerivedState(state);

  state.currentReport = {
    day: state.day - 1,
    title: `第 ${state.day - 1} 天经营简报`,
    majorEvents: majorEvents.map(e => ({ actor: e.actor, message: e.message, tone: e.tone })),
    metricsDelta: [
      { label: "漏斗健康 (D1)", value: Math.round((afterD1 - beforeD1) * 10) / 10, unit: "pts" },
      { label: "业主意愿 (D3)", value: Math.round((afterD3 - beforeD3) * 10) / 10, unit: "pts" },
      { label: "预算变动", value: state.cash - beforeCash, unit: "万" },
      { label: "声誉增长", value: Math.round(state.reputation - beforeRep), unit: "pts" },
    ],
    marketNews,
    todayPlan: {
      label: routine.label,
      theme: routine.theme,
      energy: state.maxEnergy,
      focusCases: state.cases.filter(c => c.isFocused).map(c => c.title).slice(0, 3),
      priorities: state.priorities.slice(0, 3).map((entry: any) => entry.title),
    },
    randomEvents,
  };

  onMessage?.(`第 ${state.day} 天 (${routine.label}) 开始。精力恢复到 ${state.maxEnergy}，今日主题：${routine.theme}。`);
  logEvent(state, "系统", `第 ${state.day} 天开始 (${routine.label})，主题：${routine.theme}。`, "accent");
}

function updateMarkets(world: GameState) {
  world.markets.forEach((cell, index) => {
    const pulse = wave(world.day, index + 4);
    cell.demandHeat = clamp(cell.demandHeat + pulse * 3 + randomInt(-2, 2, world), 35, 92);
    cell.supplyPressure = clamp(cell.supplyPressure - pulse * 2 + randomInt(-2, 2, world), 30, 88);
    cell.competitivePressure = clamp(cell.competitivePressure + randomInt(-2, 3, world), 36, 92);
    cell.sentiment = clamp(cell.sentiment + (cell.demandHeat - cell.supplyPressure) * 0.06 + randomInt(-2, 2, world), 38, 90);
  });

  world.cases.forEach((caseItem) => {
    if (caseItem.status !== "active") return;
    const cell = getMarketCell(world, caseItem.marketCellId);
    caseItem.marketPrice = Math.max(
      Math.round(caseItem.marketPrice + (cell.demandHeat - cell.supplyPressure) / 18 + randomInt(-3, 3, world)),
      Math.round(caseItem.askPrice * 0.84),
    );
  });
}

function tickSeasonality(world: GameState) {
  const monthIndex = new Date(world.currentDate).getUTCMonth();
  world.markets.forEach((cell) => {
    const monthlyFactors = Array.isArray(cell.monthlyFactors) ? cell.monthlyFactors : [];
    const seasonalFactor = monthlyFactors[monthIndex] || 0;
    if (!seasonalFactor) {
      return;
    }

    cell.demandHeat = clamp(cell.demandHeat + seasonalFactor * (world.rules.seasonalityImpact / 10), 30, 96);
    cell.sentiment = clamp(cell.sentiment + seasonalFactor * (world.rules.seasonalityImpact / 14), 28, 95);
  });
}

function updateCustomers(world: GameState) {
  world.customers.forEach((customer, index) => {
    customer.activity = clamp(customer.activity + wave(world.day, index + 11) * 4 + randomInt(-3, 3, world), 28, 96);
    customer.urgency = clamp(customer.urgency + randomInt(-2, 3, world), 24, 95);
  });
}

function tickOpportunities(world: GameState) {
  world.opportunities.forEach((opportunity) => {
    if (opportunity.status !== "active") return;

    const caseItem = getCaseById(world, opportunity.caseId);
    if (!caseItem || caseItem.status !== "active") {
      closeOpportunity(world, opportunity, "closed");
      return;
    }

    opportunity.daysLeft -= 1;
    opportunity.stagnationTicks += 1;

    // Redundant check removed to resolve duplicate variable name error

    const pricePenalty = Math.max(0, caseItem.askPrice - opportunity.budgetMax) / 9;
    opportunity.intent = clamp(
      opportunity.intent + (caseItem.heat - 55) / 10 + (caseItem.d1 - 50) / 16 + randomInt(-4, 4, world) - pricePenalty,
      8, 98
    );
    opportunity.confidence = clamp(
      opportunity.confidence + (caseItem.d3 - 50) / 14 + randomInt(-3, 3, world),
      10, 98
    );

    if (!opportunity.touchedToday) {
      opportunity.intent = clamp(opportunity.intent - 4, 0, 100);
    }

    // Aligned to 7-stage model logic
    if (opportunity.stageIndex < 6 && opportunity.intent >= 82 && chance(0.35, world)) {
      opportunity.stageIndex += 1;
      opportunity.stagnationTicks = 0; // Reset stagnation
      opportunity.history.push({ day: world.day, stage: OPPORTUNITY_STAGES[opportunity.stageIndex] });
      refreshOpportunityLabel(opportunity);
      opportunity.daysLeft = 5;
      logEvent(world, opportunity.customerName, `${opportunity.customerName} 对 ${caseItem.title} 的兴趣升温到 ${opportunity.stageLabel}。`, "success");
    }

    if (opportunity.stageIndex >= 4 && opportunity.intent >= 75) {
      caseItem.offers = Math.max(caseItem.offers, 1);
    }

    if (opportunity.daysLeft <= 0 || opportunity.intent < 32) {
      closeOpportunity(world, opportunity, "lost", `${opportunity.customerName} 对 ${caseItem.title} 的兴趣流失。`, "danger");
      return;
    }

    opportunity.touchedToday = false;
  });
}

function tickCases(world: GameState) {
  world.cases.forEach((caseItem) => {
    if (caseItem.status !== "active") return;

    caseItem.openDayCooldown = Math.max(0, caseItem.openDayCooldown - 1);
    caseItem.windowDays -= 1;

    const isPragmatic = caseItem.personality === 'pragmatic';
    const isEmotional = caseItem.personality === 'emotional';
    const isUrgent = caseItem.personality === 'urgent';
    const ownerArchetype = world.runContext.scenarioSnapshot.world.ownerArchetypes.find((entry) => entry.id === caseItem.ownerArchetypeId);
    const priceGapPct = ((caseItem.askPrice - caseItem.marketPrice) / Math.max(caseItem.marketPrice, 1)) * 100;

    if (!caseItem.touchedOwnerToday) {
      const trustLoss = caseItem.urgency > 70
        ? world.rules.urgentOwnerUntouchedTrustLoss
        : world.rules.ownerUntouchedTrustLoss;
      const decayMultiplier = ownerArchetype?.trustDecayMultiplier || 1;
      caseItem.trust -= trustLoss * decayMultiplier;
      if (world.day - caseItem.lastTouchedDay > world.rules.ownerPatienceDecayAfterDays) {
        caseItem.patience = clamp(caseItem.patience - world.rules.ownerPatienceDecayAmount, 0, 100);
      }
    } else {
      caseItem.lastTouchedDay = world.day;
    }

    if (!caseItem.touchedToday) {
      caseItem.heat -= isEmotional ? 4 + (ownerArchetype?.heatSensitivity || 0) : 2;
    }

    if (isPragmatic) {
      if (priceGapPct < 3) {
        caseItem.trust += 2;
      } else if (priceGapPct > 5) {
        caseItem.trust -= 2;
      }
    }

    if (caseItem.askPrice > caseItem.marketPrice * 1.05) {
      caseItem.trust -= isPragmatic ? 3 : 1 + Math.max(0, (ownerArchetype?.priceElasticity || 1) - 1);
      caseItem.heat -= 2;
      caseItem.patience = clamp(caseItem.patience - 1, 0, 100);
    }

    if (isEmotional && caseItem.heat < 40) {
      caseItem.trust -= 3;
    }

    const urgencyGrowth = isUrgent ? 5 : randomInt(2, 3, world);
    caseItem.urgency = clamp(caseItem.urgency + urgencyGrowth + (caseItem.windowDays < 6 ? 2 : 0), 18, 96);

    caseItem.heat = clamp(caseItem.heat, 10, 100);
    caseItem.trust = clamp(caseItem.trust, 10, 100);

    if (caseItem.windowDays <= 0) {
      if (caseItem.trust >= 76 && world.reputation >= 60) {
        caseItem.windowDays = 4;
        caseItem.trust = clamp(caseItem.trust - 6, 0, 100);
        logEvent(world, caseItem.ownerName, `${caseItem.title} 的业主被安抚后又给了 4 天窗口。`, "accent");
      } else {
        withdrawCase(world, caseItem, "窗口耗尽，业主选择撤盘。");
        return;
      }
    }

    caseItem.actionsToday = 0;
    caseItem.touchedToday = false;
    caseItem.touchedOwnerToday = false;
  });
}

export function spawnPassiveLeads(state: GameState) {
  state.cases.forEach((caseItem) => {
    if (caseItem.status !== "active") return;

    // Boost factor for Focused properties on Thursdays
    const focusMultiplier = caseItem.isFocused ? state.rules.passiveLeadFocusedMultiplier : 1.0;

    const baseChance = ((caseItem.heat / 240) + (caseItem.d1 / 600)) * state.rules.passiveLeadBaseMultiplier;
    if (chance(baseChance * focusMultiplier, state)) {
      const channelId = caseItem.isFocused ? "recommend" : getRandomChannel(state);
      createOpportunity(state, caseItem, channelId, 0, false);
    }
  });
}

function triggerRandomEvent(world: GameState) {
  if (!chance(world.rules.randomEventProbability || MARKET_EVENT_PROBABILITY, world)) {
    return;
  }

  const weightedPool = world.runContext.scenarioSnapshot.scenario.randomEventPool || [];
  const selected = pickWeighted(
    weightedPool.length
      ? weightedPool
      : world.runContext.scenarioSnapshot.world.randomEventTemplates.map((template) => ({
          templateId: template.id,
          weight: 1,
        })),
    world,
  );

  if (selected.templateId === 'policy-shift') {
    world.opportunities.forEach((opportunity) => {
      if (opportunity.status === 'active') {
        opportunity.confidence = clamp(opportunity.confidence - 10, 10, 100);
      }
    });
    logEvent(world, "宏观", `【${MARKET_EVENT_LABELS.policyShift}】利率上行预期强化，所有活跃客户的成交置信度同步回落。`, "danger");
    return;
  }

  if (selected.templateId === 'school-boom') {
    const luckyMarket = world.markets[randomInt(0, world.markets.length - 1, world)];
    world.cases
      .filter((caseItem) => caseItem.marketCellId === luckyMarket.id)
      .forEach((caseItem) => {
        caseItem.heat = clamp(caseItem.heat + 18, 0, 100);
        caseItem.trust = clamp(caseItem.trust + 2, 0, 100);
      });
    luckyMarket.sentiment = clamp(luckyMarket.sentiment + 12, 0, 100);
    logEvent(world, "市场", `【${MARKET_EVENT_LABELS.schoolDistrictBoom}】${luckyMarket.name} 传出学区升级消息，区域房源热度被快速点燃。`, "success");
    return;
  }

  world.markets.forEach((market) => {
    market.competitivePressure = clamp(market.competitivePressure + 18, 0, 100);
  });
  world.cases
    .filter((caseItem) => caseItem.status === 'active')
    .forEach((caseItem) => {
      caseItem.heat = clamp(caseItem.heat - 4, 10, 100);
    });
  logEvent(world, "市场", `【${MARKET_EVENT_LABELS.competitorActivity}】周边竞品突然降价，区域竞争压力显著抬升。`, "danger");
}

function createWeeklyReview(world: GameState) {
  const activeOpportunities = world.opportunities.filter((entry) => entry.status === "active").length;
  const averageTrust = average(world.cases.filter((entry) => entry.status === "active").map((entry) => entry.trust));
  const hottestCase = world.cases.filter((entry) => entry.status === "active").sort((left, right) => (right.heat + right.competitiveness) - (left.heat + left.competitiveness))[0];
  const note = hottestCase ? `活跃机会 ${activeOpportunities} 个，平均业主信任 ${Math.round(averageTrust)}。本周最值得继续压资源的是 ${hottestCase.title}。` : `活跃机会 ${activeOpportunities} 个。当前在售盘已经不多，应转入复盘和结算。`;
  const suggestion = averageTrust < 60 ? "下周优先稳关系，别急着拼动作。" : activeOpportunities < 4 ? "下周先补线索，再推带看。" : "下周把高阶段机会压到报价和议价。";
  world.weeklyReviews.unshift({ id: `week-${world.day}`, title: `第 ${Math.ceil(world.day / 7)} 周复盘`, note, suggestion });
  logEvent(world, "系统周结", `生成第 ${Math.ceil(world.day / 7)} 周复盘。`, "accent");
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
  const score = Math.round(world.soldCount * 45 + world.commission * 1.4 + world.reputation - world.withdrawnCount * 12 + world.opportunities.filter((entry) => entry.status === "active").length * 2);
  let title = "还在摸盘的经营者";
  if (score >= 185) title = "能控节奏的成交机器";
  else if (score >= 145) title = "稳健推进的组合经营者";
  else if (score >= 110) title = "开始看懂盘面的维护人";
  const summary = `${reason} 本局共成交 ${world.soldCount} 单，撤盘 ${world.withdrawnCount} 单，累计佣金 ${world.commission} 万，最终声誉 ${Math.round(world.reputation)}。`;
  return {
    title, summary,
    stats: [
      { label: "成交单数", value: `${world.soldCount} 单` },
      { label: "撤盘数量", value: `${world.withdrawnCount} 单` },
      { label: "累计佣金", value: `${world.commission} 万` },
      { label: "最终声誉", value: `${Math.round(world.reputation)}` },
      { label: "最终评分", value: `${score}` },
    ],
  };
}

export function executeAction(state: GameState, actionId: string, caseItem: any, optionId: string | null = null, onMessage?: (msg: string) => void) {
  const action = ACTIONS.find((entry) => entry.id === actionId);
  if (!action || !caseItem || caseItem.status !== "active") return false;

  const availability = getActionAvailability(state, caseItem, actionId);
  if (!availability.enabled) {
    onMessage?.(availability.reason);
    return false;
  }

  spendResources(state, action.costEnergy, action.costCash);
  caseItem.actionsToday += 1;
  caseItem.touchedToday = true;
  caseItem.lastTouchedDay = state.day;
  caseItem.lastAction = actionId;

  if (actionId === "owner-call") {
    caseItem.touchedOwnerToday = true;
    caseItem.trust = clamp(caseItem.trust + (caseItem.trust < 65 ? 7 : 4), 0, 100);
    caseItem.patience = clamp(caseItem.patience + 8, 0, 100);
    caseItem.windowDays = Math.min(caseItem.windowDays + 1, 14);
    caseItem.urgency = clamp(caseItem.urgency - 4, 0, 100);
    adjustCaseOpportunities(state, caseItem.id, 4, 3);
    logEvent(state, caseItem.ownerName, `${caseItem.title} 的业主被安抚，关系有所回升。`, "success");
    onMessage?.(`${caseItem.title} 已完成一次业主沟通。`);
  }

  if (actionId === "story") {
    caseItem.competitiveness = clamp(caseItem.competitiveness + 8, 0, 100);
    caseItem.heat = clamp(caseItem.heat + 4, 0, 100);
    caseItem.trust = clamp(caseItem.trust + 2, 0, 100);
    caseItem.qualityStory += 1;
    adjustCaseOpportunities(state, caseItem.id, 6, 4);
    logEvent(state, caseItem.maintainerName, `${caseItem.title} 完成一轮卖点重构，带看说辞更完整。`, "accent");
    onMessage?.(`${caseItem.title} 的卖点已经重新整理。`);
  }

  if (actionId === "promote") {
    caseItem.heat = clamp(caseItem.heat + 10, 0, 100);
    state.reputation = clamp(state.reputation + 1, 0, 100);
    createOpportunity(state, caseItem, preferredChannel(caseItem), 10);
    if (caseItem.heat > 72 && chance(0.38, state)) {
      createOpportunity(state, caseItem, "search", 8);
    }
    logEvent(state, "投放", `${caseItem.title} 补了一轮精选流量，盘面热度明显上升。`, "accent");
    onMessage?.(`${caseItem.title} 已投放新流量。`);
  }

  if (actionId === "open-day") {
    caseItem.openDayCooldown = 4;
    caseItem.heat = clamp(caseItem.heat + 16, 0, 100);
    caseItem.trust = clamp(caseItem.trust + 3, 0, 100);
    caseItem.viewings += 1;
    adjustCaseOpportunities(state, caseItem.id, 8, 6);
    createOpportunity(state, caseItem, "open-day", 15);
    createOpportunity(state, caseItem, "open-day", 14);
    logEvent(state, "开放日", `${caseItem.title} 举办了一次开放日，盘面被集中点燃。`, "success");
    onMessage?.(`${caseItem.title} 的开放日结束，接下来适合追带看。`);
  }

  if (actionId === "showing") {
    const opportunity = findBestOpportunity(state, caseItem.id, 0, 2);
    if (!opportunity) {
      refundResources(state, action.costEnergy, action.costCash);
      onMessage?.("当前没有合适的线索可以安排带看。");
      return false;
    }

    caseItem.viewings += 1;
    caseItem.heat = clamp(caseItem.heat + 5, 0, 100);
    opportunity.stageIndex = clamp(opportunity.stageIndex + 1, 0, 4);
    opportunity.intent = clamp(opportunity.intent + 14, 0, 100);
    opportunity.confidence = clamp(opportunity.confidence + 8, 0, 100);
    opportunity.daysLeft = 4;
    opportunity.touchedToday = true;
    
    // Reveal info after showing
    if (opportunity.visibility === 'shadow') {
      opportunity.visibility = 'revealed';
      logEvent(state, opportunity.customerName, `通过线下带看，你看透了 ${opportunity.customerName} 的真实意向。`, "success");
    }

    refreshOpportunityLabel(opportunity);

    if (opportunity.stageIndex >= 3) {
      caseItem.offers = Math.max(caseItem.offers, 1);
      logEvent(state, opportunity.customerName, `${opportunity.customerName} 对 ${caseItem.title} 的带看反馈很好，机会进入 ${opportunity.stageLabel}。`, "success");
    } else {
      logEvent(state, opportunity.customerName, `${caseItem.title} 完成一次带看，机会推进到 ${opportunity.stageLabel}。`, "accent");
    }

    onMessage?.(`${caseItem.title} 的带看已经安排并推进。`);
  }

  if (actionId === "price-talk") {
    caseItem.touchedOwnerToday = true;
    caseItem.lastPriceActionDay = state.day;

    const isUrgent = caseItem.personality === 'urgent';
    const isPragmatic = caseItem.personality === 'pragmatic';
    const isEmotional = caseItem.personality === 'emotional';

    if (optionId === "hold-story") {
      caseItem.trust = clamp(caseItem.trust + (isEmotional ? 4 : isPragmatic ? 1 : 2), 0, 100);
      caseItem.competitiveness = clamp(caseItem.competitiveness + 6, 0, 100);
      caseItem.heat = clamp(caseItem.heat + (isEmotional ? 5 : 3), 0, 100);
      adjustCaseOpportunities(state, caseItem.id, 5, 4);
      logEvent(state, caseItem.ownerName, `${caseItem.title} 这次没有降价，而是先统一了新的卖点说辞。`, "accent");
      onMessage?.(`${caseItem.title} 选择了“保价换话术”的调价方案。`);
    }

    if (optionId === "small-cut") {
      caseItem.askPrice = Math.max(Math.round(caseItem.marketPrice * 0.95), Math.round(caseItem.askPrice * 0.985));
      caseItem.trust = clamp(caseItem.trust + (isPragmatic ? 8 : isUrgent ? 6 : 4), 0, 100);
      caseItem.competitiveness = clamp(caseItem.competitiveness + 9, 0, 100);
      caseItem.heat = clamp(caseItem.heat + 6, 0, 100);
      adjustCaseOpportunities(state, caseItem.id, 8, 6);
      logEvent(state, caseItem.ownerName, `${caseItem.title} 小降 1.5%，换来了更高的成交确定性。`, "success");
      onMessage?.(`${caseItem.title} 已完成小幅调价。`);
    }

    if (optionId === "deep-cut") {
      caseItem.askPrice = Math.max(Math.round(caseItem.marketPrice * 0.92), Math.round(caseItem.askPrice * 0.97));
      caseItem.trust = clamp(caseItem.trust + (isUrgent ? 12 : isPragmatic ? 6 : 7), 0, 100);
      caseItem.competitiveness = clamp(caseItem.competitiveness + 14, 0, 100);
      caseItem.heat = clamp(caseItem.heat + 10, 0, 100);
      adjustCaseOpportunities(state, caseItem.id, 12, 8);
      logEvent(state, caseItem.ownerName, `${caseItem.title} 明降 3%，盘面热度迅速抬升。`, "success");
      onMessage?.(`${caseItem.title} 已切到快速去化模式。`);
    }
  }

  if (actionId === "negotiate") {
    const opportunity = findBestOpportunity(state, caseItem.id, 3);
    if (!opportunity) {
      refundResources(state, action.costEnergy, action.costCash);
      onMessage?.("当前还没有进入报价阶段的客户。");
      return false;
    }

    resolveNegotiation(state, caseItem, opportunity, optionId, onMessage);
  }

  if (actionId === "agent-sync") {
    const opportunity = state.opportunities.find(o => o.caseId === caseItem.id && o.status === 'active' && o.visibility === 'shadow');
    if (!opportunity) {
       refundResources(state, action.costEnergy, action.costCash);
       onMessage?.("当前没有待揭秘的“黑盒”线索。");
       return false;
    }

    opportunity.visibility = 'revealed';
    opportunity.intent = clamp(opportunity.intent + 5, 0, 100);
    logEvent(state, "对线成功", `与 ${opportunity.brokerName} 深度沟通后，${opportunity.customerName} 的意图变得透明。`, "success");
    onMessage?.(`已与 ${opportunity.brokerName} 完成情报交换。`);
  }

  updateDerivedState(state);
  saveGameState(state);
  return true;
}

function resolveNegotiation(state: GameState, caseItem: any, opportunity: any, optionId: string | null, onMessage?: (msg: string) => void) {
  const strategyCfg = {
    hold: { priceFactor: 1, shift: -6, loss: 14, bonusReputation: 0 },
    balanced: { priceFactor: 0.99, shift: 4, loss: 8, bonusReputation: 1 },
    close: { priceFactor: 0.985, shift: 9, loss: 5, bonusReputation: 2 },
  } as Record<string, any>;
  
  const strategy = strategyCfg[optionId || 'balanced'];
  const isUrgent = caseItem.personality === 'urgent';
  const isPragmatic = caseItem.personality === 'pragmatic';
  const isEmotional = caseItem.personality === 'emotional';

  const score = opportunity.intent * 0.46
    + opportunity.confidence * 0.24
    + caseItem.trust * (isUrgent ? 0.25 : 0.18) // Urgent owners are easier to sway in negotiation
    + caseItem.competitiveness * 0.16
    - Math.max(0, caseItem.askPrice - caseItem.marketPrice) * 0.6
    + strategy.shift;

  if (randomInt(0, 100, state) < score) {
    const soldPrice = Math.round(caseItem.askPrice * strategy.priceFactor);
    sellCase(state, caseItem, opportunity, soldPrice, strategy.bonusReputation);
    onMessage?.(`${caseItem.title} 成交了，新的预算也回到你手上。`);
    return;
  }

  opportunity.intent = clamp(opportunity.intent - strategy.loss, 0, 100);
  opportunity.confidence = clamp(opportunity.confidence - 8, 0, 100);
  opportunity.daysLeft = 2;
  opportunity.touchedToday = true;
  const trustHit = strategyCfg[optionId || 'balanced'].priceFactor === 1
    ? (isUrgent ? 1 : isPragmatic ? 4 : 3)
    : optionId === 'close'
      ? (isUrgent ? 0 : isEmotional ? 1 : 2)
      : (isUrgent ? 1 : isPragmatic ? 3 : 2);
  caseItem.trust = clamp(caseItem.trust - trustHit, 0, 100);

  if (opportunity.intent < 35) {
    closeOpportunity(state, opportunity, "lost", `${opportunity.customerName} 在议价桌上转身离场。`, "danger");
  } else {
    logEvent(state, opportunity.customerName, `${caseItem.title} 的议价暂时没有谈拢，桌面仍然留着机会。`, "danger");
  }
}

function sellCase(state: GameState, caseItem: any, opportunity: any, soldPrice: number, reputationBonus: number) {
  caseItem.status = "sold";
  caseItem.soldPrice = soldPrice;
  caseItem.stageLabel = "已成交";
  caseItem.trust = clamp(caseItem.trust + 8, 0, 100);
  caseItem.heat = clamp(caseItem.heat + 6, 0, 100);
  state.soldCount += 1;

  const commission = Math.round(soldPrice * 0.012);
  state.commission += commission;
  state.cash += Math.max(3, Math.round(commission * 0.3));
  state.reputation = clamp(state.reputation + 4 + reputationBonus, 0, 100);

  state.opportunities.forEach((entry) => {
    if (entry.caseId === caseItem.id && entry.status === "active") {
      entry.status = entry.id === opportunity.id ? "won" : "closed";
      refreshOpportunityLabel(entry);
    }
  });

  logEvent(state, caseItem.title, `成功成交，成交价 ${soldPrice} 万，新增佣金 ${commission} 万。`, "success");
}

export function createOpportunity(world: GameState, caseItem: any, channelId: string, bonus: number = 0, silent: boolean = false) {
  if (!caseItem || caseItem.status !== "active") return null;
  const activeCount = getActiveOpportunities(world, caseItem.id).length;
  if (activeCount >= 4) return null;
  const candidates = world.customers.filter((customer) => {
    return customer.targetDistrict === caseItem.district && !world.opportunities.some((entry) => entry.caseId === caseItem.id && entry.customerId === customer.id && entry.status === "active");
  });
  if (!candidates.length) return null;
  const ranked = candidates.map((customer) => ({ customer, score: computeCustomerFit(caseItem, customer) })).sort((left, right) => right.score - left.score).slice(0, 3);
  const chosen = ranked[randomInt(0, ranked.length - 1, world)];
  const channel = world.channels.find((entry) => entry.id === channelId) ?? world.channels[0];
  const stageIndex = bonus >= 14 ? 1 : 0;
  const pricePenalty = Math.max(0, caseItem.askPrice - chosen.customer.budgetMax) / 5;

  const leadSource = (channel.id === 'search' || channel.id === 'recommend') ? 'broker' : 'direct';
  const visibility = leadSource === 'broker' ? 'shadow' : 'revealed';

  const opportunity: Opportunity = {
    id: `${caseItem.id}-${chosen.customer.id}-${world.day}-${randomInt(100, 999, world)}`,
    caseId: caseItem.id, customerId: chosen.customer.id, customerName: chosen.customer.name, profile: chosen.customer.profile, channelId: channel.id, channelName: channel.name, fit: Math.round(chosen.score),
    intent: clamp(46 + bonus + chosen.score * 0.24 + caseItem.heat * 0.14 + chosen.customer.activity * 0.12 + channel.quality * 10 - pricePenalty, 35, 89),
    confidence: clamp(48 + chosen.score * 0.25 + caseItem.trust * 0.16, 30, 92),
    stageIndex, stageLabel: OPPORTUNITY_STAGES[stageIndex], status: "active", daysLeft: stageIndex > 0 ? 4 : 5, touchedToday: true, budgetMax: chosen.customer.budgetMax, priceSensitivity: chosen.customer.priceSensitivity,
    stagnationTicks: 0, history: [],
    leadSource,
    visibility,
    brokerName: leadSource === 'broker' ? BROKER_NAMES[randomInt(0, BROKER_NAMES.length - 1, world)] : undefined
  };
  world.opportunities.unshift(opportunity);
  if (!silent) logEvent(world, leadSource === 'broker' ? "经纪人推介" : channel.name, `${chosen.customer.name} 被吸引，${leadSource === 'broker' ? '这似乎是一个来自同行的线索。' : '直接进线。'}`, leadSource === 'broker' ? "accent" : "success");
  return opportunity;
}

export function computeCustomerFit(caseItem: any, customer: any) {
  const layoutScore = customer.layouts.includes(caseItem.layout) ? 18 : 4;
  const districtScore = customer.targetDistrict === caseItem.district ? 18 : 0;
  const budgetCenter = (customer.budgetMin + customer.budgetMax) / 2;
  const priceGap = Math.abs(caseItem.askPrice - budgetCenter);
  const budgetScore = clamp(24 - priceGap / 10, 2, 24);
  const preferenceScore = intersections(caseItem.tags, customer.preferences) * 6;
  return layoutScore + districtScore + budgetScore + preferenceScore + caseItem.competitiveness * 0.16;
}

export function getActiveOpportunities(world: GameState, caseId: string) {
  return world.opportunities.filter((entry) => entry.caseId === caseId && entry.status === "active");
}

export function getMarketCell(world: GameState, id: string) {
  return world.markets.find(m => m.id === id);
}

export function closeOpportunity(
  world: GameState,
  opportunity: any,
  status: string,
  reason: string = "",
  tone: 'accent' | 'danger' | 'success' = 'accent',
) {
  opportunity.status = status;
  refreshOpportunityLabel(opportunity);
  if (reason) logEvent(world, opportunity.customerName, reason, tone);
}

export function refreshOpportunityLabel(opportunity: any) {
  if (opportunity.status === "won") { opportunity.stageLabel = "成交"; return; }
  if (opportunity.status === "lost") { opportunity.stageLabel = "已流失"; return; }
  if (opportunity.status === "closed") { opportunity.stageLabel = "已收口"; return; }
  opportunity.stageLabel = OPPORTUNITY_STAGES[clamp(opportunity.stageIndex, 0, OPPORTUNITY_STAGES.length - 1)];
}



export function withdrawCase(world: GameState, caseItem: any, reason: string) {
  caseItem.status = "withdrawn";
  caseItem.stageLabel = "已撤盘";
  world.withdrawnCount += 1;
  world.reputation = clamp(world.reputation - 3, 0, 100);
  world.opportunities.forEach((entry) => {
    if (entry.caseId === caseItem.id && entry.status === "active") {
      entry.status = "closed";
      refreshOpportunityLabel(entry);
    }
  });
  logEvent(world, caseItem.ownerName, `${caseItem.title} ${reason}`, "danger");
}

export function seedInitialOpportunities(world: GameState) {
  world.cases.forEach((caseItem, index) => {
    createOpportunity(world, caseItem, world.channels[index % world.channels.length].id, 8 + index * 2, true);
    if (caseItem.heat >= 60 || caseItem.trust >= 70) {
      createOpportunity(world, caseItem, world.channels[(index + 1) % world.channels.length].id, 14, true);
    }
  });
}

function adjustCaseOpportunities(state: GameState, caseId: string, intentDelta: number, confidenceDelta: number) {
  getActiveOpportunities(state, caseId).forEach((entry) => {
    entry.intent = clamp(entry.intent + intentDelta, 0, 100);
    entry.confidence = clamp(entry.confidence + confidenceDelta, 0, 100);
    entry.touchedToday = true;
  });
}

function spendResources(state: GameState, energy: number, cash: number) {
  state.energy = clamp(state.energy - energy, 0, state.maxEnergy);
  state.cash = Math.max(0, state.cash - cash);
}

function refundResources(state: GameState, energy: number, cash: number) {
  state.energy = clamp(state.energy + energy, 0, state.maxEnergy);
  state.cash += cash;
}

export function findBestOpportunity(state: GameState, caseId: string, minStage: number = 0, maxStage: number = 4) {
  return state.opportunities
    .filter((entry) => entry.caseId === caseId && entry.status === "active" && entry.stageIndex >= minStage && entry.stageIndex <= maxStage)
    .sort((left, right) => getOpportunityPriority(right) - getOpportunityPriority(left))[0];
}

function preferredChannel(caseItem: any) {
  if (caseItem.heat < 55) {
    return "recommend";
  }
  if (caseItem.competitiveness > 70) {
    return "search";
  }
  return "private";
}

function getRandomChannel(world: GameState) {
  const candidates = ["search", "recommend", "private"];
  return candidates[randomInt(0, candidates.length - 1, world)];
}

export function getActionAvailability(state: GameState, caseItem: any, actionId: string) {
  if (state.gameOver) {
    return { enabled: false, reason: "本局已经结束。" };
  }
  if (!caseItem || caseItem.status !== "active") {
    return { enabled: false, reason: "这个盘已经不能再操作。" };
  }

  const action = ACTIONS.find((entry) => entry.id === actionId);
  if (!action) return { enabled: false, reason: "未知动作。" };
  
  if (state.energy < action.costEnergy) {
    return { enabled: false, reason: "精力不够了，先结束今天吧。" };
  }
  if (state.cash < action.costCash) {
    return { enabled: false, reason: "预算不足，先成交或者少花一点。" };
  }

  if (actionId === "open-day" && caseItem.openDayCooldown > 0) {
    return { enabled: false, reason: `开放日还要冷却 ${caseItem.openDayCooldown} 天。` };
  }
  if (actionId === "showing" && !findBestOpportunity(state, caseItem.id, 0, 2)) {
    return { enabled: false, reason: "还没有足够成熟的线索能安排带看。" };
  }
  if (actionId === "negotiate" && !findBestOpportunity(state, caseItem.id, 3)) {
    return { enabled: false, reason: "还没有进入报价阶段的客户。" };
  }

  return { enabled: true, reason: "" };
}

function resolveCompetitivePressure(world: GameState, caseItem: Case) {
  const cell = getMarketCell(world, caseItem.marketCellId);
  if (!cell) return;

  if (cell.competitivePressure > world.rules.competitionPressureThreshold) {
    const heatLoss = randomInt(world.rules.competitionHeatPenaltyMin, world.rules.competitionHeatPenaltyMax, world);
    const trustLoss = chance(world.rules.competitionTrustLossChance, world) ? 1 : 0;
    caseItem.heat = clamp(caseItem.heat - heatLoss, 10, 100);
    caseItem.trust = clamp(caseItem.trust - trustLoss, 10, 100);

    if (chance(world.rules.competitionLogChance, world)) {
      logEvent(world, "市场竞争", `${caseItem.title} 所在区域竞品动作频繁，盘面拉力受压。`, "danger");
    }
  }
}

function tickCompetition(world: GameState) {
  const activeSoldIds = new Set(
    world.cases.filter((entry) => entry.status === 'sold').map((entry) => entry.id),
  );

  world.competitionGroups.forEach((group) => {
    const members = group.members
      .map((memberId) => world.cases.find((entry) => entry.id === memberId))
      .filter((entry): entry is Case => Boolean(entry));

    const activeMembers = members.filter((entry) => entry.status === 'active');
    if (!activeMembers.length) {
      return;
    }

    const cheapestAsk = Math.min(...activeMembers.map((entry) => entry.askPrice));
    const recentPriceCutters = activeMembers.filter((entry) => entry.askPrice < entry.lastAskPrice);

    activeMembers.forEach((caseItem) => {
      resolveCompetitivePressure(world, caseItem);

      const premiumRatio = Math.max(0, caseItem.askPrice - cheapestAsk) / Math.max(cheapestAsk, 1);
      const premiumPenalty = premiumRatio * 100 * group.priceElasticity * 0.22;

      if (premiumPenalty > 0.8) {
        caseItem.heat = clamp(caseItem.heat - premiumPenalty, 10, 100);
      }

      recentPriceCutters
        .filter((entry) => entry.id !== caseItem.id)
        .forEach((entry) => {
          caseItem.heat = clamp(caseItem.heat - group.priceElasticity * 1.4, 10, 100);
          caseItem.trust = clamp(caseItem.trust - group.priceElasticity * 0.35, 10, 100);
          logEvent(world, '竞品联动', `${entry.title} 降价后，${caseItem.title} 的价格压力也被同步放大。`, 'danger');
        });

      if (members.some((entry) => entry.id !== caseItem.id && activeSoldIds.has(entry.id))) {
        caseItem.heat = clamp(caseItem.heat - group.customerSpillover * 6, 10, 100);
        caseItem.urgency = clamp(caseItem.urgency + group.customerSpillover * 8, 0, 100);
      }
    });
  });

  world.cases.forEach((caseItem) => {
    caseItem.lastAskPrice = caseItem.askPrice;
  });
}

function fireScheduledEvents(world: GameState) {
  const todaysEvents = world.scheduledEvents.filter((entry) => entry.day === world.day);
  if (!todaysEvents.length) {
    return;
  }

  world.scheduledEvents = world.scheduledEvents.filter((entry) => entry.day !== world.day);

  todaysEvents.forEach((event) => {
    const scale = world.rules.scriptedEventImpactScale;
    if (event.targetCaseId) {
      const caseItem = world.cases.find((entry) => entry.id === event.targetCaseId);
      if (caseItem) {
        caseItem.trust = clamp(caseItem.trust + (event.trustDelta || 0) * scale, 0, 100);
        caseItem.heat = clamp(caseItem.heat + (event.heatDelta || 0) * scale, 0, 100);
        caseItem.urgency = clamp(caseItem.urgency + (event.urgencyDelta || 0) * scale, 0, 100);
        caseItem.askPrice = Math.max(caseItem.bottomPrice, Math.round(caseItem.askPrice + (event.askPriceDelta || 0) * scale));
        caseItem.windowDays = Math.max(1, caseItem.windowDays + (event.windowDaysDelta || 0));
      }
    }

    if (event.targetMarketCellId) {
      const market = world.markets.find((entry) => entry.id === event.targetMarketCellId);
      if (market) {
        market.sentiment = clamp(market.sentiment + (event.sentimentDelta || 0) * scale, 0, 100);
        market.demandHeat = clamp(market.demandHeat + (event.demandHeatDelta || 0) * scale, 0, 100);
        market.competitivePressure = clamp(market.competitivePressure + (event.competitionPressureDelta || 0) * scale, 0, 100);
      }
    }

    if (event.confidenceDelta) {
      world.opportunities
        .filter((entry) => entry.status === 'active')
        .forEach((entry) => {
          entry.confidence = clamp(entry.confidence + event.confidenceDelta * scale, 0, 100);
        });
    }

    logEvent(world, event.actor, `【${event.title}】${event.message}`, event.tone);
  });
}
