import { logEvent, seedCase } from '../../application/gameState';
import { instantiateScenarioCases } from '../generator';
import type { GameState, InboundOpportunity, MarketSignal, ScenarioCase } from '../models';
import { clamp, randomInt } from '../utils';
import { createOpportunity } from '../engine/opportunityEngine';
import { createRivalListing } from '../rivals/rivalListingEngine';

function activeCaseForInbound(state: GameState) {
  const activeCases = state.cases.filter((entry) => entry.status === 'active');
  if (!activeCases.length) return null;
  return activeCases[randomInt(0, activeCases.length - 1, state)];
}

function createSignal(state: GameState, inbound: InboundOpportunity) {
  const caseItem = activeCaseForInbound(state);
  const templates = state.runContext.scenarioSnapshot.world.signalTemplates || [];
  const template = templates[randomInt(0, Math.max(0, templates.length - 1), state)];
  const signal: MarketSignal = {
    id: `signal-${state.day}-${randomInt(100, 999, state)}`,
    type: inbound.payload.type === 'buyer_demand' || inbound.payload.type === 'seller_intent' || inbound.payload.type === 'rival_activity'
      ? inbound.payload.type
      : template?.type || 'rival_activity',
    district: String(inbound.payload.district || caseItem?.district || '商圈'),
    confidence: clamp(Number(inbound.payload.confidence ?? 48 + randomInt(-8, 14, state)), 18, 88),
    title: inbound.title || template?.title || '市场信号',
    message: inbound.message || template?.message || '商圈里出现一条新风声，还需要进一步验证。',
    expiresInDays: Math.max(1, Number(inbound.payload.expiresInDays) || state.rules.marketSignalDecayDays),
  };

  state.marketShadow.marketSignals.unshift(signal);
  state.marketShadow.marketSignals = state.marketShadow.marketSignals.slice(0, state.rules.marketSignalMaxVisible);
  logEvent(state, '商圈信号', `${signal.title}：${signal.message}`, 'accent');
}

function createCustomerOpportunity(state: GameState, inbound: InboundOpportunity) {
  const caseItem = activeCaseForInbound(state);
  if (!caseItem) return;
  const channelId = inbound.source === 'same_company'
    ? 'broker-network'
    : inbound.source === 'seller_referral'
      ? 'private-referral'
      : 'xiaohongshu';
  const opportunity = createOpportunity(state, caseItem, channelId, Number(inbound.payload.bonus) || 10, true);
  if (!opportunity) return;
  opportunity.visibility = inbound.source === 'same_company' ? 'shadow' : opportunity.visibility;
  opportunity.leadSource = inbound.source === 'same_company' ? 'broker' : opportunity.leadSource;
  opportunity.intent = clamp(opportunity.intent + 4, 0, 100);
  logEvent(state, '客户回流', `${inbound.message || `${opportunity.customerName} 回流到你的线索池。`}`, 'success');
}

function createListingForPlayer(state: GameState, inbound: InboundOpportunity) {
  const world = state.runContext.scenarioSnapshot.world;
  const usedIds = new Set(state.cases.map((entry) => entry.housePrototypeId));
  const available = world.housePrototypes.filter((entry) => !usedIds.has(entry.id));
  const prototype = available.length
    ? available[randomInt(0, available.length - 1, state)]
    : world.housePrototypes[randomInt(0, Math.max(0, world.housePrototypes.length - 1), state)];
  const ownerArchetype = world.ownerArchetypes[randomInt(0, Math.max(0, world.ownerArchetypes.length - 1), state)];
  if (!prototype || !ownerArchetype) return;

  const scenarioCase: ScenarioCase = {
    id: `inbound-${state.day}-${prototype.id}-${randomInt(100, 999, state)}`,
    housePrototypeId: prototype.id,
    ownerArchetypeId: ownerArchetype.id,
    ownerName: String(inbound.payload.ownerName || '新业主'),
    ownerMood: String(inbound.payload.ownerMood || '通过熟人关系找到你，想看看是否值得交给你运营'),
    maintainerName: String(inbound.payload.maintainerName || '你'),
    askPrice: Math.round(prototype.marketPrice * (1 + randomInt(0, 5, state) / 100)),
    bottomPrice: prototype.bottomPrice,
    initialTrust: clamp(Number(inbound.payload.initialTrust ?? 56 + randomInt(-4, 8, state)), 35, 80),
    initialPatience: clamp(Number(inbound.payload.initialPatience ?? 48 + randomInt(-6, 8, state)), 25, 80),
    initialHeat: clamp(Number(inbound.payload.initialHeat ?? 48 + randomInt(-6, 10, state)), 25, 85),
    initialUrgency: clamp(Number(inbound.payload.initialUrgency ?? 58 + randomInt(-6, 12, state)), 30, 92),
    windowDays: clamp(Number(inbound.payload.windowDays ?? 8 + randomInt(-2, 4, state)), 4, 16),
    goalTier: 'normal',
  };

  const snapshot = {
    ...state.runContext.scenarioSnapshot,
    scenario: {
      ...state.runContext.scenarioSnapshot.scenario,
      cases: [scenarioCase],
      competitionGroups: [],
    },
  };
  const newCase = seedCase(instantiateScenarioCases(snapshot, state)[0]);
  state.cases.push(newCase);
  logEvent(state, '新房源入场', inbound.message || `${newCase.title} 找到你，希望你接手运营。`, 'success');
}

export function applyInboundOpportunity(state: GameState, inbound: InboundOpportunity) {
  if (inbound.type === 'customer_to_player') {
    createCustomerOpportunity(state, inbound);
  } else if (inbound.type === 'listing_to_player') {
    createListingForPlayer(state, inbound);
  } else if (inbound.type === 'rival_listing_to_market') {
    createRivalListing(state, 'inbound', String(inbound.payload.marketCellId || ''));
  } else {
    createSignal(state, inbound);
  }

  state.marketShadow.inboundQueue.unshift(inbound);
  state.marketShadow.inboundQueue = state.marketShadow.inboundQueue.slice(0, 16);
}
