import { logEvent } from '../runtimeState.js';
import type { Case, GameState, RivalListing, RivalListingArchetype, RivalStore } from '../models.js';
import { loseCaseToRival } from '../caseLifecycle.js';
import { chance, clamp, randomInt } from '../utils.js';
import { getMarketCell } from '../engine/opportunityEngine.js';

type CreateRivalListingOptions = {
  linkedCaseId?: string;
  silent?: boolean;
};

function markCaseLostToVisibleRival(state: GameState, listing: RivalListing) {
  const linkedCase = listing.linkedCaseId
    ? state.cases.find((entry) => entry.id === listing.linkedCaseId)
    : state.cases.find((entry) => entry.status === 'active' && entry.marketCellId === listing.marketCellId);

  if (!linkedCase || linkedCase.status !== 'active') {
    return false;
  }

  const lossEvent = loseCaseToRival(state, linkedCase, `被 ${listing.title} 抢先成交，这套房已经被别人拿走了。`);
  if (!lossEvent) {
    return false;
  }

  logEvent(state, lossEvent.actor, lossEvent.message, 'danger');
  return true;
}

function chooseMarketCellId(state: GameState) {
  const activeCases = state.cases.filter((entry) => entry.status === 'active');
  if (activeCases.length && chance(0.72, state)) {
    return activeCases[randomInt(0, activeCases.length - 1, state)].marketCellId;
  }

  return state.markets[randomInt(0, state.markets.length - 1, state)]?.id || state.markets[0]?.id || '';
}

function chooseStore(state: GameState, archetype?: RivalListingArchetype): RivalStore | null {
  const stores = state.marketShadow.rivalStores;
  if (!stores.length) return null;

  const preferred = archetype?.sourceBias === 'mixed'
    ? stores
    : stores.filter((entry) => entry.type === archetype?.sourceBias);

  const candidates = preferred.length ? preferred : stores;
  return candidates[randomInt(0, candidates.length - 1, state)] || null;
}

function chooseListingArchetype(state: GameState) {
  const archetypes = state.runContext.scenarioSnapshot.world.rivalListingArchetypes || [];
  if (!archetypes.length) return null;
  return archetypes[randomInt(0, archetypes.length - 1, state)];
}

export function createRivalListing(
  state: GameState,
  source: RivalListing['source'] = 'daily_event',
  marketCellId?: string,
  options: CreateRivalListingOptions = {},
) {
  const archetype = chooseListingArchetype(state);
  const store = chooseStore(state, archetype || undefined);
  const targetMarketCellId = marketCellId || chooseMarketCellId(state);
  const cell = getMarketCell(state, targetMarketCellId);
  const sameMarketCases = state.cases.filter((entry) => entry.marketCellId === targetMarketCellId);
  const anchorCase = sameMarketCases.length
    ? sameMarketCases[randomInt(0, sameMarketCases.length - 1, state)]
    : state.cases[randomInt(0, Math.max(0, state.cases.length - 1), state)];
  const askPrice = Math.max(
    100,
    Math.round((anchorCase?.marketPrice || 700) * (1 + randomInt(-4, 3, state) / 100)),
  );
  const titlePrefix = archetype?.titlePrefix || '新入场竞品';
  const district = anchorCase?.district || cell?.name.split('|')[0]?.trim() || '未知商圈';

  const listing: RivalListing = {
    id: `rival-${state.day}-${state.marketShadow.rivalListings.length + 1}-${randomInt(100, 999, state)}`,
    storeId: store?.id || 'unknown-rival-store',
    title: `${district} ${titlePrefix}`,
    district,
    marketCellId: targetMarketCellId,
    linkedCaseId: options.linkedCaseId ?? anchorCase?.id,
    segment: archetype?.segment || '竞品',
    askPrice,
    heat: clamp((archetype?.baseHeat || 56) + randomInt(-6, 8, state), 20, 96),
    freshness: clamp((archetype?.freshness || 62) + randomInt(-8, 8, state), 0, 100),
    storyStrength: clamp((archetype?.storyStrength || 50) + randomInt(-8, 8, state), 0, 100),
    leadSiphonPower: clamp((archetype?.leadSiphonPower || 45) + (store?.leadCapturePower || 40) * 0.12, 0, 100),
    ownerAnchorPower: clamp((archetype?.ownerAnchorPower || 45) + (store?.pricingPressurePower || 40) * 0.12, 0, 100),
    status: 'active',
    daysLeft: randomInt(6, 12, state),
    source,
  };

  state.marketShadow.rivalListings.unshift(listing);
  if (!options.silent) {
    logEvent(state, '竞品房源', `${listing.title} 入场，${store?.name || '外部门店'}开始分流同板块客户。`, 'danger');
  }
  return listing;
}

export function sellVisibleRivalForCase(state: GameState, caseItem: Case, detail: string) {
  const existingListing = state.marketShadow.rivalListings
    .filter((entry) => entry.status === 'active')
    .find((entry) => entry.linkedCaseId === caseItem.id)
    || state.marketShadow.rivalListings
      .filter((entry) => entry.status === 'active' && entry.marketCellId === caseItem.marketCellId)
      .sort((left, right) => (right.heat + right.leadSiphonPower) - (left.heat + left.leadSiphonPower))[0]
    || createRivalListing(state, 'daily_event', caseItem.marketCellId, {
      linkedCaseId: caseItem.id,
      silent: true,
    });

  existingListing.linkedCaseId = caseItem.id;
  existingListing.status = 'sold';
  existingListing.daysLeft = 0;
  existingListing.freshness = 0;
  existingListing.heat = clamp(existingListing.heat + 10, 0, 100);

  const lossEvent = loseCaseToRival(state, caseItem, detail || `被 ${existingListing.title} 抢先成交，这套房已经被别人拿走了。`);
  if (!lossEvent) {
    return false;
  }

  logEvent(state, lossEvent.actor, lossEvent.message, 'danger');
  logEvent(state, '竞品房源', `${existingListing.title} 抢先成交，你手里对应那套房也被顺势抢走了。`, 'danger');
  return true;
}

export function tickRivalListings(state: GameState) {
  state.marketShadow.rivalListings.forEach((listing) => {
    if (listing.status !== 'active') return;
    listing.daysLeft -= 1;
    listing.freshness = clamp(listing.freshness - randomInt(4, 8, state), 0, 100);
    listing.heat = clamp(listing.heat + randomInt(-3, 4, state) + listing.freshness / 80, 0, 100);

    if (listing.daysLeft <= 0 || listing.freshness <= 8) {
      listing.status = chance(0.55, state) ? 'sold' : 'withdrawn';
      const closedPlayerCase = listing.status === 'sold' ? markCaseLostToVisibleRival(state, listing) : false;
      logEvent(
        state,
        '竞品房源',
        `${listing.title}${listing.status === 'sold' ? '被别家卖掉了' : '从市场上撤出'}，同板块压力重新洗牌。${closedPlayerCase ? ' 你手里对应那套房也被顺势抢走了。' : ''}`,
        listing.status === 'sold' ? 'danger' : 'accent',
      );
    }
  });

  state.marketShadow.rivalListings = state.marketShadow.rivalListings.slice(0, 18);
}

export function applyRivalPressure(state: GameState) {
  const activeRivals = state.marketShadow.rivalListings.filter((entry) => entry.status === 'active');
  if (!activeRivals.length) return;

  state.cases.forEach((caseItem) => {
    if (caseItem.status !== 'active') return;
    const rivals = activeRivals.filter((entry) => entry.marketCellId === caseItem.marketCellId);
    if (!rivals.length) return;

    const nearestPressure = rivals.reduce((sum, listing) => {
      const priceGap = Math.abs(listing.askPrice - caseItem.askPrice) / Math.max(caseItem.askPrice, 1);
      const priceOverlap = clamp(1 - priceGap * 6, 0, 1);
      return sum + priceOverlap * ((listing.leadSiphonPower + listing.ownerAnchorPower + listing.heat) / 3);
    }, 0) / rivals.length;

    if (nearestPressure < 34) return;

    const heatLoss = (nearestPressure / 100) * state.rules.rivalPressureHeatImpact;
    const trustLoss = (nearestPressure / 100) * state.rules.rivalPressureTrustImpact;
    caseItem.heat = clamp(caseItem.heat - heatLoss, 10, 100);
    caseItem.trust = clamp(caseItem.trust - trustLoss, 10, 100);

    state.opportunities
      .filter((entry) => entry.caseId === caseItem.id && entry.status === 'active')
      .forEach((entry) => {
        entry.intent = clamp(entry.intent - nearestPressure / 85, 0, 100);
        entry.confidence = clamp(entry.confidence - nearestPressure / 110, 0, 100);
      });

    if (nearestPressure >= 58 && chance(0.18, state)) {
      const leadRival = rivals.sort((left, right) => right.heat - left.heat)[0];
      logEvent(state, '竞品压制', `${leadRival.title} 正在抢走 ${caseItem.title} 的一部分注意力。`, 'danger');
    }
  });
}
