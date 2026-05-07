import { logEvent } from '../runtimeState.js';
import { BALANCE } from '../config/balance.js';
import type { Case, GameState } from '../models.js';
import { chance, clamp, randomInt } from '../utils.js';
import { applyBrokerOwnerTrustDelta } from '../trustWriteHelper.js';
import { applyOwnerCaseUrgencyDelta } from '../ownerCaseReadinessHelper.js';
import { readCaseRelationBusinessContextFromRuntime } from '../../core/world-state/relationReadProjection.js';
import { getMarketCell } from './opportunityEngine.js';
import { sellVisibleRivalForCase } from '../rivals/rivalListingEngine.js';
import { getRivalOutcomeControl } from './outcomeControlRuntime.js';
import type { PressureReceiptSink } from '../../core/world-state/competition/models.js';

function shouldLoseToRival(world: GameState, caseItem: Case, groupPricePremiumRatio: number) {
  const rivalLossBalance = BALANCE.competition.rivalLoss;
  const { rivalCaseLossScale } = getRivalOutcomeControl(world);
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
  const relationTrust = readCaseRelationBusinessContextFromRuntime(world, caseItem).trustValue;
  const relationshipOpening = relationshipGap >= rivalLossBalance.relationshipOpeningDays
    && relationTrust <= rivalLossBalance.relationshipOpeningTrustThreshold;
  const trustCollapse = relationTrust <= rivalLossBalance.trustCollapseThreshold;
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
    relationTrust <= rivalLossBalance.priceTrapTrustThreshold
    || relationshipGap >= rivalLossBalance.priceTrapRelationshipDays
    || caseItem.windowDays <= rivalLossBalance.priceTrapWindowDays
  );
  const recentlyMaintained = relationshipGap <= rivalLossBalance.recentlyMaintainedDays
    && relationTrust >= rivalLossBalance.recentlyMaintainedTrustThreshold;
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
    rawProbability * world.rules.rivalLossProbabilityScale * rivalCaseLossScale * maintainedGuard,
    rivalLossBalance.probabilityMin,
    rivalLossBalance.probabilityMax,
  );
  caseItem.lastRivalThreatDay = world.day;

  return chance(probability, world);
}

export function resolveCompetitivePressure(world: GameState, caseItem: Case, sink?: PressureReceiptSink) {
  const cell = getMarketCell(world, caseItem.marketCellId);
  if (!cell) return;

  if (cell.competitivePressure > world.rules.competitionPressureThreshold) {
    const heatLoss = randomInt(world.rules.competitionHeatPenaltyMin, world.rules.competitionHeatPenaltyMax, world);
    const trustLoss = chance(world.rules.competitionTrustLossChance, world) ? 1 : 0;
    caseItem.heat = clamp(caseItem.heat - heatLoss, 10, 100);
    applyBrokerOwnerTrustDelta(world, caseItem, -trustLoss, '竞争压力导致信任下降', 10, 100);

    sink?.collectPressure({
      source: 'competition-group',
      caseId: caseItem.id,
      day: world.day,
      dimension: 'heat',
      magnitude: -heatLoss,
      evidence: `${caseItem.title} 所在区域 ${cell.name} 竞争压力 ${Math.round(cell.competitivePressure)}，热度下降。`,
      sourceEntityId: cell.id,
      sourceEntityLabel: cell.name,
      evidenceKind: 'group-price-cutter',
      evidenceStrength: Math.min(100, Math.round(cell.competitivePressure)),
    });
    if (trustLoss > 0) {
      sink?.collectPressure({
        source: 'competition-group',
        caseId: caseItem.id,
        day: world.day,
        dimension: 'trust',
        magnitude: -trustLoss,
        evidence: `${caseItem.title} 所在区域竞品动作频繁，业主信心受损。`,
        sourceEntityId: cell.id,
        sourceEntityLabel: cell.name,
        evidenceKind: 'group-price-cutter',
        evidenceStrength: Math.min(100, Math.round(cell.competitivePressure * 0.6)),
      });
    }

    if (chance(world.rules.competitionLogChance, world)) {
      logEvent(world, '市场竞争', `${caseItem.title} 所在区域竞品动作频繁，这套房的关注度正在被压住。`, 'danger');
    }
  }
}

export function tickCompetition(world: GameState, sink?: PressureReceiptSink) {
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
      resolveCompetitivePressure(world, caseItem, sink);

      const premiumRatio = Math.max(0, caseItem.askPrice - cheapestAsk) / Math.max(cheapestAsk, 1);
      const premiumPenalty = premiumRatio * 100 * group.priceElasticity * groupEffectsBalance.premiumPenaltyWeight;

      if (premiumPenalty > 0.8) {
        caseItem.heat = clamp(caseItem.heat - premiumPenalty, 10, 100);

        sink?.collectPressure({
          source: 'competition-group',
          caseId: caseItem.id,
          day: world.day,
          dimension: 'heat',
          magnitude: Math.round(-premiumPenalty * 100) / 100,
          evidence: `${caseItem.title} 在 ${group.name} 中报价偏高（溢价 ${Math.round(premiumRatio * 100)}%），热度被压制。`,
          sourceEntityId: group.id,
          sourceEntityLabel: group.name,
          evidenceKind: 'group-premium-penalty',
          evidenceStrength: Math.min(100, Math.round(premiumPenalty * 5)),
        });
      }

      if (shouldLoseToRival(world, caseItem, premiumRatio)) {
        sellVisibleRivalForCase(world, caseItem, '被隔壁门店抓住价格和推进空档，最终没守住。');

        sink?.collectPressure({
          source: 'competition-rival-loss',
          caseId: caseItem.id,
          day: world.day,
          dimension: 'heat',
          magnitude: -100,
          evidence: `${caseItem.title} 被 ${group.name} 中的竞对抢先成交。`,
          sourceEntityId: group.id,
          sourceEntityLabel: group.name,
          evidenceKind: 'rival-loss-window',
          evidenceStrength: 100,
        });
        return;
      }

      recentPriceCutters
        .filter((entry) => entry.id !== caseItem.id)
        .forEach((entry) => {
          const heatLoss = group.priceElasticity * groupEffectsBalance.recentPriceCutterHeatLossWeight;
          const trustLoss = group.priceElasticity * groupEffectsBalance.recentPriceCutterTrustLossWeight;
          caseItem.heat = clamp(caseItem.heat - heatLoss, 10, 100);
          applyBrokerOwnerTrustDelta(world, caseItem, -trustLoss, '竞争组价格下调导致信任下降', 10, 100);

          sink?.collectPressure({
            source: 'competition-group',
            caseId: caseItem.id,
            day: world.day,
            dimension: 'heat',
            magnitude: Math.round(-heatLoss * 100) / 100,
            evidence: `${entry.title} 降价后，${caseItem.title} 的价格压力被同步放大。`,
            sourceEntityId: group.id,
            sourceEntityLabel: group.name,
            evidenceKind: 'group-price-cutter',
            evidenceStrength: Math.min(100, Math.round(heatLoss * 10)),
          });
          sink?.collectPressure({
            source: 'competition-group',
            caseId: caseItem.id,
            day: world.day,
            dimension: 'trust',
            magnitude: Math.round(-trustLoss * 100) / 100,
            evidence: `${entry.title} 降价后，${caseItem.title} 的业主信心受到联动影响。`,
            sourceEntityId: group.id,
            sourceEntityLabel: group.name,
            evidenceKind: 'group-price-cutter',
            evidenceStrength: Math.min(100, Math.round(trustLoss * 10)),
          });
          logEvent(world, '竞品联动', `${entry.title} 降价后，${caseItem.title} 的价格压力也被同步放大。`, 'danger');
        });

      if (members.some((entry) => entry.id !== caseItem.id && activeSoldIds.has(entry.id))) {
        const heatLoss = group.customerSpillover * groupEffectsBalance.soldSpilloverHeatWeight;
        const urgencyGain = group.customerSpillover * groupEffectsBalance.soldSpilloverUrgencyWeight;
        caseItem.heat = clamp(caseItem.heat - heatLoss, 10, 100);
        applyOwnerCaseUrgencyDelta(world, caseItem, urgencyGain, '竞争组成交溢出紧迫感上升', 0, 100);

        sink?.collectPressure({
          source: 'competition-group',
          caseId: caseItem.id,
          day: world.day,
          dimension: 'heat',
          magnitude: Math.round(-heatLoss * 100) / 100,
          evidence: `${group.name} 中已有房源成交，${caseItem.title} 客户注意力被分流。`,
          sourceEntityId: group.id,
          sourceEntityLabel: group.name,
          evidenceKind: 'group-sold-spillover',
          evidenceStrength: Math.min(100, Math.round(heatLoss * 8)),
        });
        sink?.collectPressure({
          source: 'competition-group',
          caseId: caseItem.id,
          day: world.day,
          dimension: 'urgency',
          magnitude: Math.round(urgencyGain * 100) / 100,
          evidence: `${group.name} 中已有房源成交，${caseItem.title} 紧迫感上升。`,
          sourceEntityId: group.id,
          sourceEntityLabel: group.name,
          evidenceKind: 'group-sold-spillover',
          evidenceStrength: Math.min(100, Math.round(urgencyGain * 8)),
        });
      }
    });
  });

  world.cases.forEach((caseItem) => {
    caseItem.lastAskPrice = caseItem.askPrice;
  });
}
