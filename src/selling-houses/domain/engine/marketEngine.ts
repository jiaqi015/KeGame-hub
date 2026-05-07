import { logEvent, recordDomainEvent } from '../runtimeState.js';
import { BALANCE } from '../config/balance.js';
import type { GameState } from '../models.js';
import { clamp, randomInt, wave, average } from '../utils.js';
import { applyBrokerOwnerTrustDelta, clampBrokerOwnerTrust } from '../trustWriteHelper.js';
import { applyOwnerCasePatienceDelta, applyOwnerCaseUrgencyDelta } from '../ownerCaseReadinessHelper.js';
import { readOwnerBehaviorDimensions, readOwnerDecisionProfile } from '../ownerDecisionProfileHelper.js';
import { readCaseRelationBusinessContextFromRuntime } from '../../core/world-state/relationReadProjection.js';
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

    // Owner behavior from 16-type profiling (with legacy personality fallback before first visit).
    const ownerDecisionProfile = readOwnerDecisionProfile(caseItem);
    const ownerBehavior = readOwnerBehaviorDimensions(caseItem);
    const relationContext = readCaseRelationBusinessContextFromRuntime(world, caseItem);
    const isUrgent = ownerDecisionProfile.isUrgent || relationContext.urgencyValue >= 72 || ownerBehavior.timePressure >= 72;
    const isPragmatic = ownerDecisionProfile.isPragmatic || ownerBehavior.priceSensitivity >= 68;
    const isEmotional = ownerDecisionProfile.isEmotional || ownerBehavior.communicationNeed >= 68;
    const priceGapPct = ((caseItem.askPrice - caseItem.marketPrice) / Math.max(caseItem.marketPrice, 1)) * 100;

    if (!caseItem.touchedOwnerToday) {
      const relationUrgency = relationContext.urgencyValue;
      const trustLoss = relationUrgency > 70
        ? world.rules.urgentOwnerUntouchedTrustLoss
        : world.rules.ownerUntouchedTrustLoss;
      const decayMultiplier = ownerBehavior.trustDecayMultiplier;
      applyBrokerOwnerTrustDelta(world, caseItem, -(trustLoss * decayMultiplier), '业主未被触达信任衰减', 0, 100);
      if (world.day - (caseItem.lastOwnerTouchedDay ?? caseItem.lastTouchedDay ?? 0) > world.rules.ownerPatienceDecayAfterDays) {
        applyOwnerCasePatienceDelta(world, caseItem, -world.rules.ownerPatienceDecayAmount, '业主未被触达耐心衰减', 0, 100);
      }
    } else {
      caseItem.lastOwnerTouchedDay = world.day;
    }

    if (!caseItem.touchedToday) {
      caseItem.heat -= isEmotional
        ? caseTickBalance.untouchedHeatLossEmotionalBase + Math.round(ownerBehavior.heatSensitivity / 20)
        : caseTickBalance.untouchedHeatLossDefault;
    }

    if (isPragmatic) {
      if (priceGapPct < caseTickBalance.pragmaticPriceGapLowPct) {
        applyBrokerOwnerTrustDelta(world, caseItem, caseTickBalance.pragmaticTightPriceTrustGain, '价格敏感型业主价格紧凑信任增益', 0, 100);
      } else if (priceGapPct > caseTickBalance.pragmaticPriceGapHighPct) {
        applyBrokerOwnerTrustDelta(world, caseItem, -caseTickBalance.pragmaticWidePriceTrustLoss, '价格敏感型业主价格宽松信任损失', 0, 100);
      }
    }

    if (caseItem.askPrice > caseItem.marketPrice * caseTickBalance.overpricedAskRate) {
      const overpricedTrustLoss = isPragmatic
        ? caseTickBalance.overpricedPragmaticTrustLoss
        : caseTickBalance.overpricedElasticityBasePenalty + Math.max(0, Math.round((ownerBehavior.priceSensitivity - 50) / 30));
      applyBrokerOwnerTrustDelta(world, caseItem, -overpricedTrustLoss, '溢价过高信任损失', 0, 100);
      caseItem.heat -= caseTickBalance.overpricedHeatLoss;
      applyOwnerCasePatienceDelta(world, caseItem, -caseTickBalance.overpricedPatienceLoss, '溢价过高耐心损失', 0, 100);
    }

    if (isEmotional && caseItem.heat < caseTickBalance.emotionalLowHeatThreshold) {
      applyBrokerOwnerTrustDelta(world, caseItem, -caseTickBalance.emotionalLowHeatTrustLoss, '热度敏感型业主低热度信任损失', 0, 100);
    }

    const urgencyGrowth = isUrgent
      ? caseTickBalance.urgentGrowthFixed
      : randomInt(caseTickBalance.defaultUrgencyGrowthMin, caseTickBalance.defaultUrgencyGrowthMax, world);
    const urgencyDelta = urgencyGrowth
      + (caseItem.windowDays < caseTickBalance.shortWindowThreshold ? caseTickBalance.shortWindowUrgencyBonus : 0);
    applyOwnerCaseUrgencyDelta(world, caseItem, urgencyDelta, '日度紧迫增长', 18, 96);

    caseItem.heat = clamp(caseItem.heat, 10, 100);
    clampBrokerOwnerTrust(world, caseItem, '边界夹紧', 10, 100);

    if (caseItem.windowDays <= 0) {
      const relationTrust = relationContext.trustValue;
      if (
        relationTrust >= caseTickBalance.renewalTrustThreshold
        && caseItem.ownerSatisfaction !== 'unhappy'
        && caseItem.d3 >= caseTickBalance.renewalD3Threshold
      ) {
        caseItem.windowDays = caseTickBalance.renewalWindowDays;
        applyBrokerOwnerTrustDelta(world, caseItem, -caseTickBalance.renewalTrustLoss, '续期信任损失', 0, 100);
        recordDomainEvent(world, {
          kind: 'window_extended',
          actor: caseItem.ownerName,
          title: '业主继续推进',
          detail: `${caseItem.title} 的业主被安抚后又给了 ${caseTickBalance.renewalWindowDays} 天操作空间。`,
          tone: 'accent',
          caseId: caseItem.id,
          payload: {
            windowDays: caseItem.windowDays,
            trust: relationContext.trustValue,
          },
        });
        logEvent(world, caseItem.ownerName, `${caseItem.title} 的业主被安抚后又给了 4 天操作空间。`, 'accent');
      } else {
        withdrawCase(world, caseItem, '推进窗口已经用完，业主没等到足够明确的客户反馈和成交路径，最终选择核销。');
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
