import { logEvent } from '../../application/gameState';
import type { GameState } from '../models';
import { clamp, randomInt, wave, average } from '../utils';
import { withdrawCase } from './actionResolvers';
import { getMarketCell } from './opportunityEngine';

export function updateMarkets(world: GameState) {
  world.markets.forEach((cell, index) => {
    const pulse = wave(world.day, index + 4);
    cell.demandHeat = clamp(cell.demandHeat + pulse * 3 + randomInt(-2, 2, world), 35, 92);
    cell.supplyPressure = clamp(cell.supplyPressure - pulse * 2 + randomInt(-2, 2, world), 30, 88);
    cell.competitivePressure = clamp(cell.competitivePressure + randomInt(-2, 3, world), 36, 92);
    cell.sentiment = clamp(cell.sentiment + (cell.demandHeat - cell.supplyPressure) * 0.06 + randomInt(-2, 2, world), 38, 90);
  });

  world.cases.forEach((caseItem) => {
    if (caseItem.status !== 'active') return;
    const cell = getMarketCell(world, caseItem.marketCellId);
    if (!cell) {
      return;
    }
    caseItem.marketPrice = Math.max(
      Math.round(caseItem.marketPrice + (cell.demandHeat - cell.supplyPressure) / 18 + randomInt(-3, 3, world)),
      Math.round(caseItem.askPrice * 0.84),
    );
  });
}

export function tickSeasonality(world: GameState) {
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

export function updateCustomers(world: GameState) {
  world.customers.forEach((customer, index) => {
    customer.activity = clamp(customer.activity + wave(world.day, index + 11) * 4 + randomInt(-3, 3, world), 28, 96);
    customer.urgency = clamp(customer.urgency + randomInt(-2, 3, world), 24, 95);
  });
}

export function tickCases(world: GameState) {
  world.cases.forEach((caseItem) => {
    if (caseItem.status !== 'active') return;

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
      if (world.day - (caseItem.lastOwnerTouchedDay ?? caseItem.lastTouchedDay ?? 0) > world.rules.ownerPatienceDecayAfterDays) {
        caseItem.patience = clamp(caseItem.patience - world.rules.ownerPatienceDecayAmount, 0, 100);
      }
    } else {
      caseItem.lastOwnerTouchedDay = world.day;
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
        logEvent(world, caseItem.ownerName, `${caseItem.title} 的业主被安抚后又给了 4 天窗口。`, 'accent');
      } else {
        withdrawCase(world, caseItem, '窗口耗尽，业主选择撤盘。');
        return;
      }
    }

    caseItem.actionsToday = 0;
    caseItem.touchedToday = false;
    caseItem.touchedOwnerToday = false;
  });
}

export function createWeeklyReview(world: GameState) {
  const activeOpportunities = world.opportunities.filter((entry) => entry.status === 'active').length;
  const averageTrust = average(world.cases.filter((entry) => entry.status === 'active').map((entry) => entry.trust));
  const hottestCase = world.cases
    .filter((entry) => entry.status === 'active')
    .sort((left, right) => (right.heat + right.competitiveness) - (left.heat + left.competitiveness))[0];
  const note = hottestCase
    ? `活跃机会 ${activeOpportunities} 个，平均业主信任 ${Math.round(averageTrust)}。本周最值得继续压资源的是 ${hottestCase.title}。`
    : `活跃机会 ${activeOpportunities} 个。当前在售盘已经不多，应转入复盘和结算。`;
  const suggestion = averageTrust < 60
    ? '下周优先稳关系，别急着拼动作。'
    : activeOpportunities < 4
      ? '下周先补线索，再推带看。'
      : '下周把高阶段机会压到报价和议价。';

  world.weeklyReviews.unshift({
    id: `week-${world.day}`,
    title: `第 ${Math.ceil(world.day / 7)} 周复盘`,
    note,
    suggestion,
  });
  logEvent(world, '系统周结', `生成第 ${Math.ceil(world.day / 7)} 周复盘。`, 'accent');
}
