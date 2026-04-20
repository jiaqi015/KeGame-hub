import { logEvent } from '../runtimeState.js';
import { BALANCE } from '../config/balance.js';
import type { Case, GameState } from '../models.js';
import { chance, clamp, randomInt } from '../utils.js';
import { getMarketCell } from './opportunityEngine.js';
import { sellVisibleRivalForCase } from '../rivals/rivalListingEngine.js';

function shouldLoseToRival(world: GameState, caseItem: Case, groupPricePremiumRatio: number) {
  const rivalLossBalance = BALANCE.competition.rivalLoss;
  const cell = getMarketCell(world, caseItem.marketCellId);
  if (!cell || caseItem.defenseOutcome === 'lost_to_rival') {
    return false;
  }

  if (
    Number.isFinite(caseItem.lastRivalThreatDay)
    && world.day - (caseItem.lastRivalThreatDay || 0) < rivalLossBalance.threatCooldownDays
  ) {
    return false;
  }

  const brokerShadowLeads = world.opportunities.filter((entry) => {
    return entry.caseId === caseItem.id
      && entry.status === 'active'
      && entry.leadSource === 'broker'
      && entry.visibility === 'shadow';
  }).length;
  const ownedActiveLeads = world.opportunities.filter((entry) => {
    return entry.caseId === caseItem.id
      && entry.status === 'active'
      && entry.visibility !== 'shadow';
  });
  const ownedQualifiedLeads = ownedActiveLeads.filter((entry) => entry.stageIndex >= 2).length;
  const priceGapRatio = Math.max(0, caseItem.askPrice - caseItem.marketPrice) / Math.max(caseItem.marketPrice, 1);
  const pressureOverLine = Math.max(0, cell.competitivePressure - world.rules.competitionPressureThreshold);
  const relationshipGap = caseItem.lastOwnerTouchedDay <= 0 ? world.day : world.day - caseItem.lastOwnerTouchedDay;
  const urgentOpening = caseItem.windowDays <= 1 || brokerShadowLeads >= 2;
  const relationshipOpening = relationshipGap >= rivalLossBalance.relationshipOpeningDays
    && caseItem.trust <= rivalLossBalance.relationshipOpeningTrustThreshold;
  const trustCollapse = caseItem.trust <= rivalLossBalance.trustCollapseThreshold;
  const coldAndNeglected = caseItem.heat <= rivalLossBalance.coldHeatThreshold
    && relationshipGap >= rivalLossBalance.coldRelationshipDays;
  const pipelineOpening = (
    ownedActiveLeads.length === 0
    || (ownedQualifiedLeads === 0 && caseItem.heat <= rivalLossBalance.pipelineHeatThreshold)
  ) && (
    pressureOverLine >= rivalLossBalance.pipelinePressureThreshold
    || groupPricePremiumRatio >= rivalLossBalance.pipelinePremiumThreshold
    || priceGapRatio >= rivalLossBalance.pipelinePriceGapThreshold
  );
  const priceAndPressureTrap = (
    pressureOverLine >= rivalLossBalance.priceTrapPressureThreshold
    || groupPricePremiumRatio >= rivalLossBalance.priceTrapPremiumThreshold
    || priceGapRatio >= rivalLossBalance.priceTrapPriceGapThreshold
  ) && (
    caseItem.trust <= rivalLossBalance.priceTrapTrustThreshold
    || relationshipGap >= rivalLossBalance.priceTrapRelationshipDays
    || caseItem.windowDays <= rivalLossBalance.priceTrapWindowDays
  );
  const recentlyMaintained = relationshipGap <= rivalLossBalance.recentlyMaintainedDays
    && caseItem.trust >= rivalLossBalance.recentlyMaintainedTrustThreshold;
  const visibleSlip = urgentOpening
    || relationshipOpening
    || trustCollapse
    || coldAndNeglected
    || pipelineOpening
    || priceAndPressureTrap;
  const rivalHasOpening = pressureOverLine >= rivalLossBalance.rivalOpenPressureThreshold
    || groupPricePremiumRatio >= rivalLossBalance.rivalOpenPremiumThreshold
    || priceGapRatio >= rivalLossBalance.rivalOpenPriceGapThreshold
    || brokerShadowLeads >= 2;

  if (!visibleSlip || !rivalHasOpening || (recentlyMaintained && !urgentOpening && !pipelineOpening)) {
    return false;
  }

  const rawProbability = rivalLossBalance.rawProbabilityBase
    + pressureOverLine * rivalLossBalance.rawPressureWeight
    + Math.max(0, groupPricePremiumRatio - rivalLossBalance.rawPremiumOffset) * rivalLossBalance.rawPremiumWeight
    + Math.max(0, priceGapRatio - rivalLossBalance.rawPriceGapOffset) * rivalLossBalance.rawPriceGapWeight
    + brokerShadowLeads * rivalLossBalance.rawBrokerLeadWeight
    + (caseItem.windowDays <= rivalLossBalance.lastWindowThreshold ? rivalLossBalance.rawLastWindowBonus : 0);
  const maintainedGuard = recentlyMaintained && pipelineOpening ? rivalLossBalance.maintainedGuardWhenPipelineOpen : 1;
  const probability = clamp(
    rawProbability * world.rules.rivalLossProbabilityScale * maintainedGuard,
    rivalLossBalance.probabilityMin,
    rivalLossBalance.probabilityMax,
  );
  caseItem.lastRivalThreatDay = world.day;

  return chance(probability, world);
}

export function resolveCompetitivePressure(world: GameState, caseItem: Case) {
  const cell = getMarketCell(world, caseItem.marketCellId);
  if (!cell) return;

  if (cell.competitivePressure > world.rules.competitionPressureThreshold) {
    const heatLoss = randomInt(world.rules.competitionHeatPenaltyMin, world.rules.competitionHeatPenaltyMax, world);
    const trustLoss = chance(world.rules.competitionTrustLossChance, world) ? 1 : 0;
    caseItem.heat = clamp(caseItem.heat - heatLoss, 10, 100);
    caseItem.trust = clamp(caseItem.trust - trustLoss, 10, 100);

    if (chance(world.rules.competitionLogChance, world)) {
      logEvent(world, '市场竞争', `${caseItem.title} 所在区域竞品动作频繁，这套房的关注度正在被压住。`, 'danger');
    }
  }
}

export function tickCompetition(world: GameState) {
  const groupEffectsBalance = BALANCE.competition.groupEffects;
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
      const premiumPenalty = premiumRatio * 100 * group.priceElasticity * groupEffectsBalance.premiumPenaltyWeight;

      if (premiumPenalty > 0.8) {
        caseItem.heat = clamp(caseItem.heat - premiumPenalty, 10, 100);
      }

      if (shouldLoseToRival(world, caseItem, premiumRatio)) {
        sellVisibleRivalForCase(world, caseItem, '被隔壁门店抓住价格和窗口空档，最终没守住。');
        return;
      }

      recentPriceCutters
        .filter((entry) => entry.id !== caseItem.id)
        .forEach((entry) => {
          caseItem.heat = clamp(caseItem.heat - group.priceElasticity * groupEffectsBalance.recentPriceCutterHeatLossWeight, 10, 100);
          caseItem.trust = clamp(caseItem.trust - group.priceElasticity * groupEffectsBalance.recentPriceCutterTrustLossWeight, 10, 100);
          logEvent(world, '竞品联动', `${entry.title} 降价后，${caseItem.title} 的价格压力也被同步放大。`, 'danger');
        });

      if (members.some((entry) => entry.id !== caseItem.id && activeSoldIds.has(entry.id))) {
        caseItem.heat = clamp(caseItem.heat - group.customerSpillover * groupEffectsBalance.soldSpilloverHeatWeight, 10, 100);
        caseItem.urgency = clamp(caseItem.urgency + group.customerSpillover * groupEffectsBalance.soldSpilloverUrgencyWeight, 0, 100);
      }
    });
  });

  world.cases.forEach((caseItem) => {
    caseItem.lastAskPrice = caseItem.askPrice;
  });
}
