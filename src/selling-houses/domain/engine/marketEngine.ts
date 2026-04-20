import { logEvent, recordDomainEvent } from '../runtimeState.js';
import { BALANCE } from '../config/balance.js';
import type { GameState } from '../models.js';
import { clamp, randomInt, wave, average } from '../utils.js';
import { withdrawCase } from './actionResolvers.js';
import { getMarketCell } from './opportunityEngine.js';

export function updateMarkets(world: GameState) {
  const marketPulseBalance = BALANCE.market.marketPulse;
  world.markets.forEach((cell, index) => {
    const pulse = wave(world.day, index + 4);
    cell.demandHeat = clamp(
      cell.demandHeat + pulse * marketPulseBalance.demandPulseScale + randomInt(marketPulseBalance.demandRandomMin, marketPulseBalance.demandRandomMax, world),
      35,
      92,
    );
    cell.supplyPressure = clamp(
      cell.supplyPressure - pulse * marketPulseBalance.supplyPulseScale + randomInt(marketPulseBalance.supplyRandomMin, marketPulseBalance.supplyRandomMax, world),
      30,
      88,
    );
    cell.competitivePressure = clamp(
      cell.competitivePressure + randomInt(marketPulseBalance.pressureRandomMin, marketPulseBalance.pressureRandomMax, world),
      36,
      92,
    );
    cell.sentiment = clamp(
      cell.sentiment
        + (cell.demandHeat - cell.supplyPressure) * marketPulseBalance.sentimentSpreadWeight
        + randomInt(marketPulseBalance.sentimentRandomMin, marketPulseBalance.sentimentRandomMax, world),
      38,
      90,
    );
  });

  world.cases.forEach((caseItem) => {
    if (caseItem.status !== 'active') return;
    const cell = getMarketCell(world, caseItem.marketCellId);
    if (!cell) {
      return;
    }
    caseItem.marketPrice = Math.max(
      Math.round(
        caseItem.marketPrice
          + (cell.demandHeat - cell.supplyPressure) / marketPulseBalance.marketPriceSpreadDivisor
          + randomInt(marketPulseBalance.marketPriceRandomMin, marketPulseBalance.marketPriceRandomMax, world),
      ),
      Math.round(caseItem.askPrice * marketPulseBalance.marketPriceFloorRate),
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
  const customerPulseBalance = BALANCE.market.customerPulse;
  world.customers.forEach((customer, index) => {
    customer.activity = clamp(
      customer.activity
        + wave(world.day, index + 11) * customerPulseBalance.activityWaveScale
        + randomInt(customerPulseBalance.activityRandomMin, customerPulseBalance.activityRandomMax, world),
      28,
      96,
    );
    customer.urgency = clamp(
      customer.urgency + randomInt(customerPulseBalance.urgencyRandomMin, customerPulseBalance.urgencyRandomMax, world),
      24,
      95,
    );
  });
}

export function tickCases(world: GameState) {
  const caseTickBalance = BALANCE.market.caseTick;
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
      caseItem.heat -= isEmotional
        ? caseTickBalance.untouchedHeatLossEmotionalBase + (ownerArchetype?.heatSensitivity || 0)
        : caseTickBalance.untouchedHeatLossDefault;
    }

    if (isPragmatic) {
      if (priceGapPct < caseTickBalance.pragmaticPriceGapLowPct) {
        caseItem.trust += caseTickBalance.pragmaticTightPriceTrustGain;
      } else if (priceGapPct > caseTickBalance.pragmaticPriceGapHighPct) {
        caseItem.trust -= caseTickBalance.pragmaticWidePriceTrustLoss;
      }
    }

    if (caseItem.askPrice > caseItem.marketPrice * caseTickBalance.overpricedAskRate) {
      caseItem.trust -= isPragmatic
        ? caseTickBalance.overpricedPragmaticTrustLoss
        : caseTickBalance.overpricedElasticityBasePenalty + Math.max(0, (ownerArchetype?.priceElasticity || 1) - 1);
      caseItem.heat -= caseTickBalance.overpricedHeatLoss;
      caseItem.patience = clamp(caseItem.patience - caseTickBalance.overpricedPatienceLoss, 0, 100);
    }

    if (isEmotional && caseItem.heat < caseTickBalance.emotionalLowHeatThreshold) {
      caseItem.trust -= caseTickBalance.emotionalLowHeatTrustLoss;
    }

    const urgencyGrowth = isUrgent
      ? caseTickBalance.urgentGrowthFixed
      : randomInt(caseTickBalance.defaultUrgencyGrowthMin, caseTickBalance.defaultUrgencyGrowthMax, world);
    caseItem.urgency = clamp(
      caseItem.urgency
        + urgencyGrowth
        + (caseItem.windowDays < caseTickBalance.shortWindowThreshold ? caseTickBalance.shortWindowUrgencyBonus : 0),
      18,
      96,
    );

    caseItem.heat = clamp(caseItem.heat, 10, 100);
    caseItem.trust = clamp(caseItem.trust, 10, 100);

    if (caseItem.windowDays <= 0) {
      if (
        caseItem.trust >= caseTickBalance.renewalTrustThreshold
        && caseItem.ownerSatisfaction !== 'unhappy'
        && caseItem.d3 >= caseTickBalance.renewalD3Threshold
      ) {
        caseItem.windowDays = caseTickBalance.renewalWindowDays;
        caseItem.trust = clamp(caseItem.trust - caseTickBalance.renewalTrustLoss, 0, 100);
        recordDomainEvent(world, {
          kind: 'window_extended',
          actor: caseItem.ownerName,
          title: '业主续窗',
          detail: `${caseItem.title} 的业主被安抚后又给了 ${caseTickBalance.renewalWindowDays} 天窗口。`,
          tone: 'accent',
          caseId: caseItem.id,
          payload: {
            windowDays: caseItem.windowDays,
            trust: caseItem.trust,
          },
        });
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
    ? `活跃机会 ${activeOpportunities} 个，平均业主信任 ${Math.round(averageTrust)}。本周热度最高的房源是 ${hottestCase.title}。`
    : `活跃机会 ${activeOpportunities} 个。当前在售盘已经不多，应转入复盘和结算。`;
  const suggestion = averageTrust < 60
    ? '平均业主信任偏低，关系压力更明显。'
    : activeOpportunities < 4
      ? '活跃机会数量偏少，准客池厚度不足。'
      : '已经走到后段的客户较多，最后几步怎么推进会更关键。';

  world.weeklyReviews.unshift({
    id: `week-${world.day}`,
    title: `第 ${Math.ceil(world.day / 7)} 周复盘`,
    note,
    suggestion,
  });
  logEvent(world, '系统周结', `生成第 ${Math.ceil(world.day / 7)} 周复盘。`, 'accent');
}
