import { BROKER_NAMES, OPPORTUNITY_STAGES } from '../constants.js';
import { BALANCE } from '../config/balance.js';
import { logEvent, recordDomainEvent } from '../runtimeState.js';
import {
  chance,
  clamp,
  getOpportunityPriority,
  intersections,
  randomInt,
} from '../utils.js';
import type { Case, CustomerProfile, GameState, Opportunity, Tone } from '../models.js';

export const MAX_ACTIVE_OPPORTUNITIES_PER_CASE = BALANCE.opportunities.maxActivePerCase;

function resolveLeadIntel(world: GameState, channelId: string) {
  const leadIntelBalance = BALANCE.opportunities.leadIntel;
  if (channelId === 'open-day' || channelId === 'private' || channelId === 'private-referral' || channelId === 'xiaohongshu') {
    return { leadSource: 'direct' as const, visibility: 'revealed' as const };
  }

  if (channelId === 'recommend') {
    return chance(leadIntelBalance.recommendBrokerShadowChance, world)
      ? { leadSource: 'broker' as const, visibility: 'shadow' as const }
      : { leadSource: 'direct' as const, visibility: 'revealed' as const };
  }

  if (channelId === 'search' || channelId === 'broker-network') {
    return chance(leadIntelBalance.brokerNetworkShadowChance, world)
      ? { leadSource: 'broker' as const, visibility: 'shadow' as const }
      : { leadSource: 'direct' as const, visibility: 'revealed' as const };
  }

  return { leadSource: 'direct' as const, visibility: 'revealed' as const };
}

export function tickOpportunities(world: GameState) {
  const tickBalance = BALANCE.opportunities.tick;
  world.opportunities.forEach((opportunity) => {
    if (opportunity.status !== 'active') return;

    const caseItem = world.cases.find((entry) => entry.id === opportunity.caseId);
    if (!caseItem || caseItem.status !== 'active') {
      closeOpportunity(world, opportunity, 'closed');
      return;
    }

    opportunity.daysLeft -= 1;
    opportunity.stagnationTicks += 1;
    opportunity.lifecycleStatus = opportunity.stagnationTicks >= 3 ? 'stagnated' : 'active';

    const pricePenalty = Math.max(0, caseItem.askPrice - opportunity.budgetMax) / tickBalance.pricePenaltyDivisor;
    opportunity.intent = clamp(
      opportunity.intent
        + (caseItem.heat - tickBalance.intentHeatOffset) / tickBalance.intentHeatScale
        + (caseItem.d1 - tickBalance.intentD1Offset) / tickBalance.intentD1Scale
        + randomInt(tickBalance.intentRandomMin, tickBalance.intentRandomMax, world)
        - pricePenalty,
      8,
      98,
    );
    opportunity.confidence = clamp(
      opportunity.confidence
        + (caseItem.d3 - tickBalance.confidenceD3Offset) / tickBalance.confidenceD3Scale
        + randomInt(tickBalance.confidenceRandomMin, tickBalance.confidenceRandomMax, world),
      10,
      98,
    );

    if (!opportunity.touchedToday) {
      opportunity.intent = clamp(opportunity.intent - tickBalance.untouchedIntentLoss, 0, 100);
    }

    if (
      opportunity.stageIndex < 6
      && opportunity.intent >= tickBalance.stageAdvanceIntentThreshold
      && chance(tickBalance.stageAdvanceChance, world)
    ) {
      opportunity.stageIndex += 1;
      opportunity.stagnationTicks = 0;
      opportunity.history.push({ day: world.day, stage: OPPORTUNITY_STAGES[opportunity.stageIndex] });
      refreshOpportunityLabel(opportunity);
      opportunity.daysLeft = tickBalance.stageAdvanceResetDaysLeft;
      recordDomainEvent(world, {
        kind: 'opportunity_advanced',
        actor: opportunity.customerName,
        title: '客户阶段推进',
        detail: `${opportunity.customerName} 对 ${caseItem.title} 推进到 ${opportunity.stageLabel}。`,
        tone: 'success',
        caseId: caseItem.id,
        opportunityId: opportunity.id,
        customerId: opportunity.customerId,
        payload: {
          stageIndex: opportunity.stageIndex,
          stageLabel: opportunity.stageLabel,
          intent: opportunity.intent,
          confidence: opportunity.confidence,
        },
      });
      logEvent(world, opportunity.customerName, `${opportunity.customerName} 对 ${caseItem.title} 的兴趣升温到 ${opportunity.stageLabel}。`, 'success');
    }

    if (opportunity.stageIndex >= 4 && opportunity.intent >= 75) {
      caseItem.offers = Math.max(caseItem.offers, 1);
    }

    if (opportunity.daysLeft <= 0 || opportunity.intent < tickBalance.lossIntentThreshold) {
      closeOpportunity(world, opportunity, 'lost', `${opportunity.customerName} 对 ${caseItem.title} 的兴趣流失。`, 'danger');
      return;
    }

    opportunity.touchedToday = false;
  });
}

export function spawnPassiveLeads(state: GameState) {
  const passiveLeadBalance = BALANCE.opportunities.passiveLead;
  if (state.day <= 1 && state.opportunities.length > 0) {
    return;
  }

  state.cases.forEach((caseItem) => {
    if (caseItem.status !== 'active') return;

    const focusMultiplier = caseItem.isFocused ? state.rules.passiveLeadFocusedMultiplier : 1.0;
    const baseChance = (
      (caseItem.heat / passiveLeadBalance.heatDivisor)
      + (caseItem.d1 / passiveLeadBalance.d1Divisor)
    ) * state.rules.passiveLeadBaseMultiplier;

    if (chance(baseChance * focusMultiplier, state)) {
      const channelId = caseItem.isFocused ? 'xiaohongshu' : getRandomChannel(state);
      createOpportunity(state, caseItem, channelId, 0, false);
    }
  });
}

export function createOpportunity(
  world: GameState,
  caseItem: Case | null | undefined,
  channelId: string,
  bonus: number = 0,
  silent: boolean = false,
) {
  const createBalance = BALANCE.opportunities.create;
  if (!caseItem || caseItem.status !== 'active') return null;
  const activeCount = getActiveOpportunities(world, caseItem.id).length;
  if (activeCount >= MAX_ACTIVE_OPPORTUNITIES_PER_CASE) return null;
  const candidates = world.customers.filter((customer) => {
    return customer.targetDistrict === caseItem.district
      && !world.opportunities.some((entry) => entry.caseId === caseItem.id && entry.customerId === customer.id && entry.status === 'active');
  });
  if (!candidates.length) return null;
  const ranked = candidates
    .map((customer) => ({ customer, score: computeCustomerFit(caseItem, customer) }))
    .sort((left, right) => right.score - left.score)
    .slice(0, createBalance.rankedCandidateCount);
  const chosen = ranked[randomInt(0, ranked.length - 1, world)];
  const channel = world.channels.find((entry) => entry.id === channelId) ?? world.channels[0];
  const stageIndex = bonus >= createBalance.bonusStageThreshold ? createBalance.boostedStageIndex : 0;
  const pricePenalty = Math.max(0, caseItem.askPrice - chosen.customer.budgetMax) / createBalance.pricePenaltyDivisor;

  const { leadSource, visibility } = channel.leadSource
    ? {
        leadSource: channel.leadSource,
        visibility: channel.leadSource === 'broker' ? 'shadow' as const : 'revealed' as const,
      }
    : resolveLeadIntel(world, channel.id);

  const opportunity: Opportunity = {
    id: `${caseItem.id}-${chosen.customer.id}-${world.day}-${randomInt(100, 999, world)}`,
    caseId: caseItem.id,
    customerId: chosen.customer.id,
    customerName: chosen.customer.name,
    profile: chosen.customer.profile,
    channelId: channel.id,
    channelName: channel.name,
    fit: Math.round(chosen.score),
    intent: clamp(
      createBalance.intentBase
        + bonus
        + chosen.score * createBalance.fitIntentWeight
        + caseItem.heat * createBalance.heatIntentWeight
        + chosen.customer.activity * createBalance.activityIntentWeight
        + channel.quality * createBalance.channelQualityWeight
        - pricePenalty,
      createBalance.intentMin,
      createBalance.intentMax,
    ),
    confidence: clamp(
      createBalance.confidenceBase
        + chosen.score * createBalance.fitConfidenceWeight
        + caseItem.trust * createBalance.trustConfidenceWeight,
      createBalance.confidenceMin,
      createBalance.confidenceMax,
    ),
    stageIndex,
    stageLabel: OPPORTUNITY_STAGES[stageIndex],
    status: 'active',
    lifecycleStatus: 'active',
    createdDay: world.day,
    daysLeft: stageIndex > 0 ? createBalance.boostedDaysLeft : createBalance.defaultDaysLeft,
    touchedToday: true,
    budgetMax: chosen.customer.budgetMax,
    priceSensitivity: chosen.customer.priceSensitivity,
    stagnationTicks: 0,
    history: [],
    leadSource,
    visibility,
    brokerName: leadSource === 'broker' ? BROKER_NAMES[randomInt(0, BROKER_NAMES.length - 1, world)] : undefined,
  };
  world.opportunities.unshift(opportunity);
  if (!silent) {
    logEvent(
      world,
      leadSource === 'broker' ? '经纪人推介' : channel.name,
      `${chosen.customer.name} 被吸引，${leadSource === 'broker' ? '这似乎是一个来自同行的线索。' : '直接进线。'}`,
      leadSource === 'broker' ? 'accent' : 'success',
    );
  }
  return opportunity;
}

export function computeCustomerFit(caseItem: Case, customer: CustomerProfile) {
  const fitBalance = BALANCE.opportunities.fit;
  const layoutScore = customer.layouts.includes(caseItem.layout) ? fitBalance.layoutMatch : fitBalance.layoutMismatch;
  const districtScore = customer.targetDistrict === caseItem.district ? fitBalance.districtMatch : fitBalance.districtMismatch;
  const budgetCenter = (customer.budgetMin + customer.budgetMax) / 2;
  const priceGap = Math.abs(caseItem.askPrice - budgetCenter);
  const budgetScore = clamp(
    fitBalance.budgetBase - priceGap / fitBalance.budgetDivisor,
    fitBalance.budgetMin,
    fitBalance.budgetMax,
  );
  const preferenceScore = intersections(caseItem.tags, customer.preferences) * fitBalance.preferenceIntersectionWeight;
  return layoutScore + districtScore + budgetScore + preferenceScore + caseItem.competitiveness * fitBalance.competitivenessWeight;
}

export function getActiveOpportunities(world: GameState, caseId: string) {
  return world.opportunities.filter((entry) => entry.caseId === caseId && entry.status === 'active');
}

export function getMarketCell(world: GameState, id: string) {
  return world.markets.find((entry) => entry.id === id);
}

export function closeOpportunity(
  world: GameState,
  opportunity: Opportunity,
  status: Opportunity['status'],
  reason: string = '',
  tone: Tone = 'accent',
) {
  opportunity.status = status;
  refreshOpportunityLabel(opportunity);
  recordDomainEvent(world, {
    kind: 'opportunity_closed',
    actor: opportunity.customerName,
    title: '客户机会结束',
    detail: reason || `${opportunity.customerName} 对这套房的机会状态更新为 ${status}。`,
    tone,
    caseId: opportunity.caseId,
    opportunityId: opportunity.id,
    customerId: opportunity.customerId,
    payload: {
      status,
      stageIndex: opportunity.stageIndex,
      stageLabel: opportunity.stageLabel,
    },
  });
  if (reason) logEvent(world, opportunity.customerName, reason, tone);
}

export function refreshOpportunityLabel(opportunity: Opportunity) {
  if (opportunity.status === 'won') {
    opportunity.lifecycleStatus = 'closed_by_deal';
    opportunity.stageLabel = '已成交';
    return;
  }
  if (opportunity.status === 'lost') {
    opportunity.lifecycleStatus = 'lost';
    opportunity.stageLabel = '已流失';
    return;
  }
  if (opportunity.status === 'closed') {
    opportunity.lifecycleStatus = 'closed_by_case';
    opportunity.stageLabel = '已关闭';
    return;
  }
  if (opportunity.lifecycleStatus !== 'stagnated') {
    opportunity.lifecycleStatus = 'active';
  }
  opportunity.stageLabel = OPPORTUNITY_STAGES[clamp(opportunity.stageIndex, 0, OPPORTUNITY_STAGES.length - 1)];
}

export function seedInitialOpportunities(world: GameState) {
  world.cases.forEach((caseItem, index) => {
    createOpportunity(world, caseItem, world.channels[index % world.channels.length].id, 8 + index * 2, true);
    if (caseItem.heat >= 60 || caseItem.trust >= 70) {
      createOpportunity(world, caseItem, world.channels[(index + 1) % world.channels.length].id, 14, true);
    }
  });
}

export function adjustCaseOpportunities(state: GameState, caseId: string, intentDelta: number, confidenceDelta: number) {
  getActiveOpportunities(state, caseId).forEach((entry) => {
    entry.intent = clamp(entry.intent + intentDelta, 0, 100);
    entry.confidence = clamp(entry.confidence + confidenceDelta, 0, 100);
    entry.touchedToday = true;
  });
}

export function findBestOpportunity(state: GameState, caseId: string, minStage: number = 0, maxStage: number = 4) {
  return state.opportunities
    .filter((entry) => entry.caseId === caseId && entry.status === 'active' && entry.stageIndex >= minStage && entry.stageIndex <= maxStage)
    .sort((left, right) => getOpportunityPriority(right) - getOpportunityPriority(left))[0];
}

export function preferredChannel(caseItem: Case) {
  if (caseItem.trust >= 68 && caseItem.qualityStory >= 1) {
    return 'private-referral';
  }
  if (caseItem.heat < 55) {
    return 'xiaohongshu';
  }
  if (caseItem.competitiveness > 70) {
    return 'broker-network';
  }
  return 'private-referral';
}

export function getRandomChannel(world: GameState) {
  const candidates = ['xiaohongshu', 'broker-network', 'private-referral'];
  return candidates[randomInt(0, candidates.length - 1, world)];
}
