import { logEvent } from '../runtimeState.js';
import type { GameState, InboundOpportunity, MarketSignal } from '../models.js';
import { clamp, randomInt } from '../utils.js';
import { createOpportunity } from '../engine/opportunityEngine.js';
import { createRivalListing } from '../rivals/rivalListingEngine.js';
import { setOpportunityVisibilityOnState, applyOpportunityIntentDeltaOnState } from '../opportunitySplitHelper.js';
import { isCaseActiveByCanonicalStatus } from '../caseLifecycleStatusRead.js';

function activeCaseForInbound(state: GameState) {
  const activeCases = state.cases.filter((entry) => isCaseActiveByCanonicalStatus(state, entry));
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
    message: inbound.message || template?.message || '商圈里出现一条新消息，还需要进一步确认。',
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
  setOpportunityVisibilityOnState(state, opportunity, inbound.source === 'same_company' ? 'shadow' : opportunity.visibility, '内部线索来源');
  opportunity.leadSource = inbound.source === 'same_company' ? 'broker' : opportunity.leadSource; // leadSource is not a canonical field
  applyOpportunityIntentDeltaOnState(state, opportunity, 4, '回流线索提升意向', 0, 100);
  logEvent(state, '客户回流', `${inbound.message || `${opportunity.customerName} 回流到你的线索池。`}`, 'success');
}

function createListingForPlayer(state: GameState, inbound: InboundOpportunity) {
  const marketCellId = String(inbound.payload.marketCellId || activeCaseForInbound(state)?.marketCellId || '');
  const market = state.markets.find((entry) => entry.id === marketCellId);
  const signal: MarketSignal = {
    id: `listing-signal-${state.day}-${randomInt(100, 999, state)}`,
    type: 'seller_intent',
    district: market?.name || '商圈',
    confidence: clamp(Number(inbound.payload.confidence ?? 58 + randomInt(-8, 12, state)), 18, 88),
    title: inbound.title || '新业主消息',
    message: inbound.message || '有业主在打听附近门店，暂时只作为商圈消息观察。',
    expiresInDays: Math.max(1, Number(inbound.payload.expiresInDays) || state.rules.marketSignalDecayDays),
  };

  state.marketShadow.marketSignals.unshift(signal);
  state.marketShadow.marketSignals = state.marketShadow.marketSignals.slice(0, state.rules.marketSignalMaxVisible);
  logEvent(state, '新业主消息', `${signal.title}：${signal.message}`, 'success');
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
