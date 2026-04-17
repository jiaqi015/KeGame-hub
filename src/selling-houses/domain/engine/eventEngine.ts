import { logEvent } from '../../application/gameState';
import { MARKET_EVENT_LABELS, MARKET_EVENT_PROBABILITY } from '../constants';
import type { GameState } from '../models';
import { chance, clamp, pickWeighted, randomInt } from '../utils';

export function triggerRandomEvent(world: GameState) {
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

  if (!selected) {
    return;
  }

  if (selected.templateId === 'policy-shift') {
    world.opportunities.forEach((opportunity) => {
      if (opportunity.status === 'active') {
        opportunity.confidence = clamp(opportunity.confidence - 10, 10, 100);
      }
    });
    logEvent(world, '宏观', `【${MARKET_EVENT_LABELS.policyShift}】利率上行预期强化，所有活跃客户的成交置信度同步回落。`, 'danger');
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
    logEvent(world, '市场', `【${MARKET_EVENT_LABELS.schoolDistrictBoom}】${luckyMarket.name} 传出学区升级消息，区域房源热度被快速点燃。`, 'success');
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
  logEvent(world, '市场', `【${MARKET_EVENT_LABELS.competitorActivity}】周边竞品突然降价，区域竞争压力显著抬升。`, 'danger');
}

export function fireScheduledEvents(world: GameState) {
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
