import { logEvent } from '../runtimeState.js';
import { BALANCE } from '../config/balance.js';
import type { Case, GameState } from '../models.js';
import { chance, clamp, randomInt } from '../utils.js';
import { applyBrokerOwnerTrustDelta } from '../trustWriteHelper.js';
import { applyOwnerCaseUrgencyDelta } from '../ownerCaseReadinessWriteHelper.js';
import { getMarketCell } from './opportunityEngine.js';
import { sellVisibleRivalForCase } from '../rivals/rivalListingEngine.js';
import { evaluateCompetitionRivalCaseLoss } from '../rivals/rivalCaseLossPolicy.js';
import type { PressureReceiptSink } from '../../core/world-state/competition/models.js';
import { isCaseActiveByCanonicalStatus, isCaseSoldByCanonicalStatus } from '../caseLifecycleStatusRead.js';

function shouldLoseToRival(world: GameState, caseItem: Case, groupPricePremiumRatio: number) {
  const evaluation = evaluateCompetitionRivalCaseLoss(world, caseItem, { groupPricePremiumRatio });
  if (!evaluation.allowed) return false;
  caseItem.lastRivalThreatDay = world.day;

  return chance(evaluation.probability, world);
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
    world.cases.filter((entry) => isCaseSoldByCanonicalStatus(world, entry)).map((entry) => entry.id),
  );

  world.competitionGroups.forEach((group) => {
    const members = group.members
      .map((memberId) => world.cases.find((entry) => entry.id === memberId))
      .filter((entry): entry is Case => Boolean(entry));

    const activeMembers = members.filter((entry) => isCaseActiveByCanonicalStatus(world, entry));
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
