import { logEvent } from '../runtimeState.js';
import type { DailyEventTemplate, DailyMarketEvent, GameState, InboundOpportunity, WeightedDailyEventRef } from '../models.js';
import { chance, clamp, pickWeighted, randomInt } from '../utils.js';
import { applyInboundOpportunity } from './inboundOpportunityEngine.js';
import { createRivalListing } from '../rivals/rivalListingEngine.js';

function defaultDailyEventPool(templates: DailyEventTemplate[]): WeightedDailyEventRef[] {
  return templates.map((entry) => ({
    templateId: entry.id,
    weight: entry.effectType === 'signal_only' ? 4 : 2,
  }));
}

function pickTargetMarketCellId(state: GameState) {
  const activeCases = state.cases.filter((entry) => entry.status === 'active');
  if (activeCases.length) {
    return activeCases[randomInt(0, activeCases.length - 1, state)].marketCellId;
  }
  return state.markets[randomInt(0, Math.max(0, state.markets.length - 1), state)]?.id || '';
}

function buildInboundFromEvent(state: GameState, event: DailyMarketEvent): InboundOpportunity | null {
  const base = {
    id: `inbound-${event.id}`,
    title: event.title,
    message: event.message,
    payload: {
      marketCellId: event.targetMarketCellId,
    },
  };

  if (event.effectType === 'customer_return') {
    return {
      ...base,
      type: 'customer_to_player',
      source: event.layer === 'company' ? 'same_company' : 'external_company',
    };
  }

  if (event.effectType === 'listing_inbound') {
    return {
      ...base,
      type: 'listing_to_player',
      source: 'seller_referral',
    };
  }

  if (event.effectType === 'signal_only') {
    return {
      ...base,
      type: 'signal_to_player',
      source: 'market_event',
    };
  }

  return null;
}

export function rollDailyMarketEvent(state: GameState) {
  state.marketShadow.dailyMarketEvent = null;

  if (!chance(state.rules.dailyMarketEventProbability, state)) {
    return null;
  }

  const templates = state.runContext.scenarioSnapshot.world.dailyEventTemplates || [];
  if (!templates.length) return null;

  const pool = state.runContext.scenarioSnapshot.scenario.dailyEventPool?.length
    ? state.runContext.scenarioSnapshot.scenario.dailyEventPool
    : defaultDailyEventPool(templates);
  const weightedTemplates = pool
    .map((entry) => {
      const template = templates.find((candidate) => candidate.id === entry.templateId);
      return template ? { ...template, weight: entry.weight } : null;
    })
    .filter((entry): entry is DailyEventTemplate & { weight: number } => Boolean(entry));

  if (!weightedTemplates.length) return null;

  const template = pickWeighted(weightedTemplates, state);
  const event: DailyMarketEvent = {
    id: `${template.id}-${state.day}-${randomInt(100, 999, state)}`,
    day: state.day,
    title: template.title,
    message: template.message,
    tone: template.tone,
    layer: template.layer,
    effectType: template.effectType,
    targetMarketCellId: pickTargetMarketCellId(state),
  };

  state.marketShadow.dailyMarketEvent = event;
  logEvent(state, '商圈动态', `${event.title}：${event.message}`, event.tone);
  return event;
}

export function applyDailyMarketEvent(state: GameState) {
  const event = state.marketShadow.dailyMarketEvent;
  if (!event) return;

  const targetMarket = state.markets.find((entry) => entry.id === event.targetMarketCellId);
  if (event.effectType === 'heat_wave' && targetMarket) {
    targetMarket.demandHeat = clamp(targetMarket.demandHeat + 5, 0, 100);
    targetMarket.sentiment = clamp(targetMarket.sentiment + 4, 0, 100);
    return;
  }

  if (event.effectType === 'rival_listing_inflow') {
    createRivalListing(state, 'daily_event', event.targetMarketCellId);
    return;
  }

  if (event.effectType === 'company_pressure_shift') {
    state.marketShadow.companyPressure.sharedLeadPressure = clamp(
      state.marketShadow.companyPressure.sharedLeadPressure + randomInt(5, 12, state),
      0,
      100,
    );
    state.marketShadow.companyPressure.internalCompetitionHeat = clamp(
      state.marketShadow.companyPressure.internalCompetitionHeat + randomInt(4, 10, state),
      0,
      100,
    );
    return;
  }

  const inbound = buildInboundFromEvent(state, event);
  if (inbound) {
    applyInboundOpportunity(state, inbound);
  }
}
