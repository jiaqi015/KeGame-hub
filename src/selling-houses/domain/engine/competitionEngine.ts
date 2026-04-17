import { logEvent } from '../../application/gameState';
import type { Case, GameState } from '../models';
import { chance, clamp, randomInt } from '../utils';
import { getMarketCell } from './opportunityEngine';

function markLostToRival(world: GameState, caseItem: Case, reason: string) {
  if (caseItem.status !== 'active') {
    return;
  }

  caseItem.status = 'lost_to_rival';
  caseItem.stageLabel = '被竞品截走';
  caseItem.defenseOutcome = 'lost_to_rival';
  caseItem.ownerSatisfaction = caseItem.trust <= 52 ? 'unhappy' : 'regret';
  caseItem.endingType = 'sold_by_other';
  caseItem.endingBucket = 'bad';
  caseItem.trust = clamp(caseItem.trust - 8, 0, 100);
  world.reputation = clamp(world.reputation - 5, 0, 100);

  world.opportunities.forEach((entry) => {
    if (entry.caseId === caseItem.id && entry.status === 'active') {
      entry.status = 'lost';
      entry.stageLabel = '被竞品截走';
    }
  });

  logEvent(world, '竞品截走', `${caseItem.title} ${reason}`, 'danger');
}

function shouldLoseToRival(world: GameState, caseItem: Case, groupPricePremiumRatio: number) {
  const cell = getMarketCell(world, caseItem.marketCellId);
  if (!cell || caseItem.defenseOutcome === 'lost_to_rival') {
    return false;
  }

  const brokerShadowLeads = world.opportunities.filter((entry) => {
    return entry.caseId === caseItem.id
      && entry.status === 'active'
      && entry.leadSource === 'broker'
      && entry.visibility === 'shadow';
  }).length;
  const priceGapRatio = Math.max(0, caseItem.askPrice - caseItem.marketPrice) / Math.max(caseItem.marketPrice, 1);
  const pressureOverLine = Math.max(0, cell.competitivePressure - world.rules.competitionPressureThreshold);
  const vulnerable = caseItem.windowDays <= 3
    || caseItem.trust <= 48
    || caseItem.heat <= 34
    || brokerShadowLeads >= 2;
  const rivalHasOpening = pressureOverLine >= 8
    || groupPricePremiumRatio >= 0.04
    || priceGapRatio >= 0.055
    || brokerShadowLeads > 0;

  if (!vulnerable || !rivalHasOpening) {
    return false;
  }

  const probability = clamp(
    0.06
      + pressureOverLine * 0.012
      + Math.max(0, groupPricePremiumRatio - 0.02) * 2.4
      + Math.max(0, priceGapRatio - 0.035) * 2
      + brokerShadowLeads * 0.04
      + (caseItem.windowDays <= 1 ? 0.08 : 0),
    0.06,
    0.32,
  );

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
      logEvent(world, '市场竞争', `${caseItem.title} 所在区域竞品动作频繁，盘面拉力受压。`, 'danger');
    }
  }
}

export function tickCompetition(world: GameState) {
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

      if (shouldLoseToRival(world, caseItem, premiumRatio)) {
        markLostToRival(world, caseItem, '被隔壁门店抓住价格和窗口空档，最终没守住。');
        return;
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
