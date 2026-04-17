import { BROKER_NAMES, OPPORTUNITY_STAGES } from '../constants';
import { logEvent } from '../../application/gameState';
import {
  chance,
  clamp,
  getOpportunityPriority,
  intersections,
  randomInt,
} from '../utils';
import type { GameState, Opportunity } from '../models';

function resolveLeadIntel(world: GameState, channelId: string) {
  if (channelId === 'open-day' || channelId === 'private' || channelId === 'private-referral' || channelId === 'xiaohongshu') {
    return { leadSource: 'direct' as const, visibility: 'revealed' as const };
  }

  if (channelId === 'recommend') {
    return chance(0.35, world)
      ? { leadSource: 'broker' as const, visibility: 'shadow' as const }
      : { leadSource: 'direct' as const, visibility: 'revealed' as const };
  }

  if (channelId === 'search' || channelId === 'broker-network') {
    return chance(0.2, world)
      ? { leadSource: 'broker' as const, visibility: 'shadow' as const }
      : { leadSource: 'direct' as const, visibility: 'revealed' as const };
  }

  return { leadSource: 'direct' as const, visibility: 'revealed' as const };
}

export function tickOpportunities(world: GameState) {
  world.opportunities.forEach((opportunity) => {
    if (opportunity.status !== 'active') return;

    const caseItem = world.cases.find((entry) => entry.id === opportunity.caseId);
    if (!caseItem || caseItem.status !== 'active') {
      closeOpportunity(world, opportunity, 'closed');
      return;
    }

    opportunity.daysLeft -= 1;
    opportunity.stagnationTicks += 1;

    const pricePenalty = Math.max(0, caseItem.askPrice - opportunity.budgetMax) / 9;
    opportunity.intent = clamp(
      opportunity.intent + (caseItem.heat - 55) / 10 + (caseItem.d1 - 50) / 16 + randomInt(-4, 4, world) - pricePenalty,
      8,
      98,
    );
    opportunity.confidence = clamp(
      opportunity.confidence + (caseItem.d3 - 50) / 14 + randomInt(-3, 3, world),
      10,
      98,
    );

    if (!opportunity.touchedToday) {
      opportunity.intent = clamp(opportunity.intent - 4, 0, 100);
    }

    if (opportunity.stageIndex < 6 && opportunity.intent >= 82 && chance(0.35, world)) {
      opportunity.stageIndex += 1;
      opportunity.stagnationTicks = 0;
      opportunity.history.push({ day: world.day, stage: OPPORTUNITY_STAGES[opportunity.stageIndex] });
      refreshOpportunityLabel(opportunity);
      opportunity.daysLeft = 5;
      logEvent(world, opportunity.customerName, `${opportunity.customerName} 对 ${caseItem.title} 的兴趣升温到 ${opportunity.stageLabel}。`, 'success');
    }

    if (opportunity.stageIndex >= 4 && opportunity.intent >= 75) {
      caseItem.offers = Math.max(caseItem.offers, 1);
    }

    if (opportunity.daysLeft <= 0 || opportunity.intent < 32) {
      closeOpportunity(world, opportunity, 'lost', `${opportunity.customerName} 对 ${caseItem.title} 的兴趣流失。`, 'danger');
      return;
    }

    opportunity.touchedToday = false;
  });
}

export function spawnPassiveLeads(state: GameState) {
  state.cases.forEach((caseItem) => {
    if (caseItem.status !== 'active') return;

    const focusMultiplier = caseItem.isFocused ? state.rules.passiveLeadFocusedMultiplier : 1.0;
    const baseChance = ((caseItem.heat / 240) + (caseItem.d1 / 600)) * state.rules.passiveLeadBaseMultiplier;

    if (chance(baseChance * focusMultiplier, state)) {
      const channelId = caseItem.isFocused ? 'xiaohongshu' : getRandomChannel(state);
      createOpportunity(state, caseItem, channelId, 0, false);
    }
  });
}

export function createOpportunity(world: GameState, caseItem: any, channelId: string, bonus: number = 0, silent: boolean = false) {
  if (!caseItem || caseItem.status !== 'active') return null;
  const activeCount = getActiveOpportunities(world, caseItem.id).length;
  if (activeCount >= 4) return null;
  const candidates = world.customers.filter((customer) => {
    return customer.targetDistrict === caseItem.district
      && !world.opportunities.some((entry) => entry.caseId === caseItem.id && entry.customerId === customer.id && entry.status === 'active');
  });
  if (!candidates.length) return null;
  const ranked = candidates
    .map((customer) => ({ customer, score: computeCustomerFit(caseItem, customer) }))
    .sort((left, right) => right.score - left.score)
    .slice(0, 3);
  const chosen = ranked[randomInt(0, ranked.length - 1, world)];
  const channel = world.channels.find((entry) => entry.id === channelId) ?? world.channels[0];
  const stageIndex = bonus >= 14 ? 1 : 0;
  const pricePenalty = Math.max(0, caseItem.askPrice - chosen.customer.budgetMax) / 5;

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
    intent: clamp(46 + bonus + chosen.score * 0.24 + caseItem.heat * 0.14 + chosen.customer.activity * 0.12 + channel.quality * 10 - pricePenalty, 35, 89),
    confidence: clamp(48 + chosen.score * 0.25 + caseItem.trust * 0.16, 30, 92),
    stageIndex,
    stageLabel: OPPORTUNITY_STAGES[stageIndex],
    status: 'active',
    createdDay: world.day,
    daysLeft: stageIndex > 0 ? 4 : 5,
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

export function computeCustomerFit(caseItem: any, customer: any) {
  const layoutScore = customer.layouts.includes(caseItem.layout) ? 18 : 4;
  const districtScore = customer.targetDistrict === caseItem.district ? 18 : 0;
  const budgetCenter = (customer.budgetMin + customer.budgetMax) / 2;
  const priceGap = Math.abs(caseItem.askPrice - budgetCenter);
  const budgetScore = clamp(24 - priceGap / 10, 2, 24);
  const preferenceScore = intersections(caseItem.tags, customer.preferences) * 6;
  return layoutScore + districtScore + budgetScore + preferenceScore + caseItem.competitiveness * 0.16;
}

export function getActiveOpportunities(world: GameState, caseId: string) {
  return world.opportunities.filter((entry) => entry.caseId === caseId && entry.status === 'active');
}

export function getMarketCell(world: GameState, id: string) {
  return world.markets.find((entry) => entry.id === id);
}

export function closeOpportunity(
  world: GameState,
  opportunity: any,
  status: string,
  reason: string = '',
  tone: 'accent' | 'danger' | 'success' = 'accent',
) {
  opportunity.status = status;
  refreshOpportunityLabel(opportunity);
  if (reason) logEvent(world, opportunity.customerName, reason, tone);
}

export function refreshOpportunityLabel(opportunity: any) {
  if (opportunity.status === 'won') {
    opportunity.stageLabel = '成交';
    return;
  }
  if (opportunity.status === 'lost') {
    opportunity.stageLabel = '已流失';
    return;
  }
  if (opportunity.status === 'closed') {
    opportunity.stageLabel = '已收口';
    return;
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

export function preferredChannel(caseItem: any) {
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
