import { logEvent, recordDomainEvent } from '../runtimeState.js';
import { MARKET_EVENT_LABELS, MARKET_EVENT_PROBABILITY } from '../constants.js';
import type { GameState } from '../models.js';
import { chance, clamp, pickWeighted, randomInt } from '../utils.js';
import { applyBrokerOwnerTrustDelta } from '../trustWriteHelper.js';
import { applyOwnerCaseUrgencyDelta } from '../ownerCaseReadinessWriteHelper.js';
import { applyOpportunityConfidenceDeltaOnState } from '../opportunitySplitHelper.js';
import type { PressureReceiptSink } from '../../core/world-state/competition/models.js';
import { isCaseActiveByCanonicalStatus } from '../caseLifecycleStatusRead.js';
import { isOpportunityActiveByCanonicalState } from '../opportunityLifecycleStatusRead.js';

export function triggerRandomEvent(world: GameState, sink?: PressureReceiptSink) {
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
      if (isOpportunityActiveByCanonicalState(world, opportunity)) {
        const delta = -10;
        applyOpportunityConfidenceDeltaOnState(world, opportunity, delta, '政策利空降低置信度', 10, 100);

        sink?.collectPressure({
          source: 'random-event',
          caseId: opportunity.caseId,
          day: world.day,
          dimension: 'confidence',
          magnitude: delta,
          evidence: '利率上行预期强化，成交置信度回落。',
          sourceEntityId: 'random-event:policy-shift',
          sourceEntityLabel: '宏观政策利空',
          evidenceKind: 'random-event-policy-shift',
          evidenceStrength: 80,
          opportunityIds: [opportunity.id],
        });
      }
    });
    recordDomainEvent(world, {
      kind: 'market_event',
      actor: '宏观',
      title: MARKET_EVENT_LABELS.policyShift,
      detail: '利率上行预期强化，所有活跃客户的成交置信度同步回落。',
      tone: 'danger',
      payload: {
        templateId: selected.templateId,
      },
    });
    logEvent(world, '宏观', `【${MARKET_EVENT_LABELS.policyShift}】利率上行预期强化，所有活跃客户的成交置信度同步回落。`, 'danger');
    return;
  }

  if (selected.templateId === 'school-boom') {
    const luckyMarket = world.markets[randomInt(0, world.markets.length - 1, world)];
    world.cases
      .filter((caseItem) => caseItem.marketCellId === luckyMarket.id)
      .forEach((caseItem) => {
        const heatDelta = 18;
        const trustDelta = 2;
        caseItem.heat = clamp(caseItem.heat + heatDelta, 0, 100);
        applyBrokerOwnerTrustDelta(world, caseItem, trustDelta, '学区升级消息提升信任', 0, 100);

        sink?.collectPressure({
          source: 'random-event',
          caseId: caseItem.id,
          day: world.day,
          dimension: 'heat',
          magnitude: heatDelta,
          evidence: `${luckyMarket.name} 学区升级消息，区域热度被点燃。`,
          sourceEntityId: 'random-event:school-boom',
          sourceEntityLabel: '学区利好',
          evidenceKind: 'random-event-school-boom',
          evidenceStrength: 75,
        });
        sink?.collectPressure({
          source: 'random-event',
          caseId: caseItem.id,
          day: world.day,
          dimension: 'trust',
          magnitude: trustDelta,
          evidence: `${luckyMarket.name} 学区升级消息，业主信心提升。`,
          sourceEntityId: 'random-event:school-boom',
          sourceEntityLabel: '学区利好',
          evidenceKind: 'random-event-school-boom',
          evidenceStrength: 60,
        });
    });
    luckyMarket.sentiment = clamp(luckyMarket.sentiment + 12, 0, 100);
    recordDomainEvent(world, {
      kind: 'market_event',
      actor: '市场',
      title: MARKET_EVENT_LABELS.schoolDistrictBoom,
      detail: `${luckyMarket.name} 传出学区升级消息，区域房源热度被快速点燃。`,
      tone: 'success',
      payload: {
        templateId: selected.templateId,
        marketCellId: luckyMarket.id,
      },
    });
    logEvent(world, '市场', `【${MARKET_EVENT_LABELS.schoolDistrictBoom}】${luckyMarket.name} 传出学区升级消息，区域房源热度被快速点燃。`, 'success');
    return;
  }

  // Default: competitor-activity
  world.markets.forEach((market) => {
    market.competitivePressure = clamp(market.competitivePressure + 18, 0, 100);
  });
  world.cases
    .filter((caseItem) => isCaseActiveByCanonicalStatus(world, caseItem))
    .forEach((caseItem) => {
      const heatDelta = -4;
      caseItem.heat = clamp(caseItem.heat + heatDelta, 10, 100);

      sink?.collectPressure({
        source: 'random-event',
        caseId: caseItem.id,
        day: world.day,
        dimension: 'heat',
        magnitude: heatDelta,
        evidence: '周边竞品突然降价，区域竞争压力抬升。',
        sourceEntityId: 'random-event:competitor-activity',
        sourceEntityLabel: '竞对博弈',
        evidenceKind: 'random-event-competitor-activity',
        evidenceStrength: 70,
      });
    });
  recordDomainEvent(world, {
    kind: 'market_event',
    actor: '市场',
    title: MARKET_EVENT_LABELS.competitorActivity,
    detail: '周边竞品突然降价，区域竞争压力显著抬升。',
    tone: 'danger',
    payload: {
      templateId: selected.templateId,
    },
  });
  logEvent(world, '市场', `【${MARKET_EVENT_LABELS.competitorActivity}】周边竞品突然降价，区域竞争压力显著抬升。`, 'danger');
}

export function fireScheduledEvents(world: GameState, sink?: PressureReceiptSink) {
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
        const trustDelta = (event.trustDelta || 0) * scale;
        const heatDelta = (event.heatDelta || 0) * scale;
        const urgencyDelta = (event.urgencyDelta || 0) * scale;
        applyBrokerOwnerTrustDelta(world, caseItem, trustDelta, '脚本事件影响信任', 0, 100);
        caseItem.heat = clamp(caseItem.heat + heatDelta, 0, 100);
        applyOwnerCaseUrgencyDelta(world, caseItem, urgencyDelta, '脚本事件影响紧迫', 0, 100);
        caseItem.askPrice = Math.max(caseItem.bottomPrice, Math.round(caseItem.askPrice + (event.askPriceDelta || 0) * scale));
        caseItem.windowDays = Math.max(1, caseItem.windowDays + (event.windowDaysDelta || 0));

        if (trustDelta !== 0) {
          sink?.collectPressure({
            source: 'scripted-event',
            caseId: caseItem.id,
            day: world.day,
            dimension: 'trust',
            magnitude: Math.round(trustDelta * 100) / 100,
            evidence: `【${event.title}】${event.message}`,
            sourceEntityId: `scripted-event:${event.id}`,
            sourceEntityLabel: event.title,
            evidenceKind: 'scripted-event-effect',
            evidenceStrength: Math.min(100, Math.round(Math.abs(trustDelta) * 5)),
          });
        }
        if (heatDelta !== 0) {
          sink?.collectPressure({
            source: 'scripted-event',
            caseId: caseItem.id,
            day: world.day,
            dimension: 'heat',
            magnitude: Math.round(heatDelta * 100) / 100,
            evidence: `【${event.title}】${event.message}`,
            sourceEntityId: `scripted-event:${event.id}`,
            sourceEntityLabel: event.title,
            evidenceKind: 'scripted-event-effect',
            evidenceStrength: Math.min(100, Math.round(Math.abs(heatDelta) * 5)),
          });
        }
        if (urgencyDelta !== 0) {
          sink?.collectPressure({
            source: 'scripted-event',
            caseId: caseItem.id,
            day: world.day,
            dimension: 'urgency',
            magnitude: Math.round(urgencyDelta * 100) / 100,
            evidence: `【${event.title}】${event.message}`,
            sourceEntityId: `scripted-event:${event.id}`,
            sourceEntityLabel: event.title,
            evidenceKind: 'scripted-event-effect',
            evidenceStrength: Math.min(100, Math.round(Math.abs(urgencyDelta) * 5)),
          });
        }
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
      const confDelta = event.confidenceDelta * scale;
      world.opportunities
        .filter((entry) => isOpportunityActiveByCanonicalState(world, entry))
        .forEach((entry) => {
          applyOpportunityConfidenceDeltaOnState(world, entry, confDelta, `脚本事件影响置信度:${event.title}`, 0, 100);

          sink?.collectPressure({
            source: 'scripted-event',
            caseId: entry.caseId,
            day: world.day,
            dimension: 'confidence',
            magnitude: Math.round(confDelta * 100) / 100,
            evidence: `【${event.title}】${event.message}`,
            sourceEntityId: `scripted-event:${event.id}`,
            sourceEntityLabel: event.title,
            evidenceKind: 'scripted-event-effect',
            evidenceStrength: Math.min(100, Math.round(Math.abs(confDelta) * 5)),
            opportunityIds: [entry.id],
          });
        });
    }

    recordDomainEvent(world, {
      kind: 'market_event',
      actor: event.actor,
      title: event.title,
      detail: event.message,
      tone: event.tone,
      caseId: event.targetCaseId,
      payload: {
        targetMarketCellId: event.targetMarketCellId,
        trustDelta: event.trustDelta,
        heatDelta: event.heatDelta,
        urgencyDelta: event.urgencyDelta,
        askPriceDelta: event.askPriceDelta,
        windowDaysDelta: event.windowDaysDelta,
        confidenceDelta: event.confidenceDelta,
      },
    });
    logEvent(world, event.actor, `【${event.title}】${event.message}`, event.tone);
  });
}
