import { logEvent } from '../runtimeState.js';
import { getAvailableMarketDealSlots } from '../models.js';
import type { Case, GameState, RivalListing, RivalListingArchetype, RivalStore } from '../models.js';
import type { PressureReceiptSink } from '../../core/world-state/competition/models.js';
import { loseCaseToRival } from '../caseLifecycle.js';
import {
  getRivalOutcomeControl,
  recordActiveRivalListingSample,
  recordFailedRivalClaimRoll,
  recordRivalListingCreated,
  recordRivalListingDelayed,
  recordRivalListingExpired,
  recordRivalListingSold,
  recordRivalListingWithdrawn,
  scaleProbability,
  tryClaimRivalMarketDealSlot,
} from '../engine/outcomeControlRuntime.js';
import { chance, clamp, randomInt } from '../utils.js';
import { applyBrokerOwnerTrustDelta } from '../trustWriteHelper.js';
import { getMarketCell } from '../engine/opportunityEngine.js';
import { applyOpportunityIntentDeltaOnState, applyOpportunityConfidenceDeltaOnState } from '../opportunitySplitHelper.js';
import { isCaseActiveByCanonicalStatus } from '../caseLifecycleStatusRead.js';
import { isOpportunityActiveByCanonicalState } from '../opportunityLifecycleStatusRead.js';

type CreateRivalListingOptions = {
  linkedCaseId?: string;
  silent?: boolean;
  force?: boolean;
};

function markCaseLostToVisibleRival(state: GameState, listing: RivalListing) {
  const linkedCase = listing.linkedCaseId
    ? state.cases.find((entry) => entry.id === listing.linkedCaseId)
    : state.cases.find((entry) => isCaseActiveByCanonicalStatus(state, entry) && entry.marketCellId === listing.marketCellId);

  if (!linkedCase || !isCaseActiveByCanonicalStatus(state, linkedCase)) {
    return false;
  }

  const lossEvent = loseCaseToRival(state, linkedCase, `被 ${listing.title} 抢先成交，这套房已经被别人拿走了。`);
  if (!lossEvent) {
    return false;
  }

  logEvent(state, lossEvent.actor, lossEvent.message, 'danger');
  return true;
}

function getListingStrengthScale(listing: RivalListing) {
  return clamp(
    (listing.heat + listing.leadSiphonPower + listing.ownerAnchorPower) / 240,
    0.65,
    1.35,
  );
}

function getRivalListingClaimChance(state: GameState, listing: RivalListing, baseChance: number) {
  const { rivalDealShareScale, rivalStoreCapabilityScale } = getRivalOutcomeControl(state);
  return scaleProbability(
    baseChance,
    rivalDealShareScale * rivalStoreCapabilityScale * getListingStrengthScale(listing),
  );
}

function chooseMarketCellId(state: GameState) {
  const activeCases = state.cases.filter((entry) => isCaseActiveByCanonicalStatus(state, entry));
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

function shouldMaterializeRivalListing(state: GameState, source: RivalListing['source'], options: CreateRivalListingOptions) {
  if (options.force || source === 'seed') return true;
  const { rivalListingSpawnScale } = getRivalOutcomeControl(state);
  return chance(scaleProbability(state.rules.rivalListingSpawnChance, rivalListingSpawnScale), state);
}

export function createRivalListing(
  state: GameState,
  source: RivalListing['source'] = 'daily_event',
  marketCellId?: string,
  options: CreateRivalListingOptions = {},
) {
  if (!shouldMaterializeRivalListing(state, source, options)) {
    return null;
  }

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

  const { rivalStoreCapabilityScale } = getRivalOutcomeControl(state);
  const leadSiphonPower = clamp(
    ((archetype?.leadSiphonPower || 45) + (store?.leadCapturePower || 40) * 0.12) * rivalStoreCapabilityScale,
    0,
    100,
  );
  const ownerAnchorPower = clamp(
    ((archetype?.ownerAnchorPower || 45) + (store?.pricingPressurePower || 40) * 0.12) * rivalStoreCapabilityScale,
    0,
    100,
  );

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
    leadSiphonPower,
    ownerAnchorPower,
    status: 'active',
    daysLeft: randomInt(6, 12, state),
    source,
  };

  state.marketShadow.rivalListings.unshift(listing);
  recordRivalListingCreated(state, listing);
  if (!options.silent) {
    logEvent(state, '同类房', `${listing.title} 入场，${store?.name || '外部门店'}开始分流同板块客户。`, 'danger');
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
      force: true,
    });

  if (!existingListing) {
    return false;
  }

  const claimResult = tryClaimRivalMarketDealSlot(state, { allowFutureSlot: true });
  if (!claimResult.claimed) {
    return false;
  }
  if (claimResult.waitingForRelease) {
    recordRivalListingDelayed(state);
  }

  existingListing.linkedCaseId = caseItem.id;
  existingListing.status = 'sold';
  existingListing.daysLeft = 0;
  existingListing.freshness = 0;
  existingListing.heat = clamp(existingListing.heat + 10, 0, 100);
  recordRivalListingSold(state, existingListing);

  const lossEvent = loseCaseToRival(state, caseItem, detail || `被 ${existingListing.title} 抢先成交，这套房已经被别人拿走了。`);
  if (!lossEvent) {
    return false;
  }

  logEvent(state, lossEvent.actor, lossEvent.message, 'danger');
  logEvent(state, '同类房', `${existingListing.title} 抢先成交，你手里对应那套房也被顺势抢走了。`, 'danger');
  return true;
}

export function tickRivalListings(state: GameState) {
  recordActiveRivalListingSample(
    state,
    state.marketShadow.rivalListings.filter((listing) => listing.status === 'active').length,
  );
  state.marketShadow.rivalListings.forEach((listing) => {
    if (listing.status !== 'active') return;
    listing.daysLeft -= 1;
    listing.freshness = clamp(listing.freshness - randomInt(4, 8, state), 0, 100);
    listing.heat = clamp(listing.heat + randomInt(-3, 4, state) + listing.freshness / 80, 0, 100);

    if (listing.daysLeft <= 0 || listing.freshness <= 8) {
      recordRivalListingExpired(state);
      const claimChance = getRivalListingClaimChance(state, listing, 0.55);
      const claimResult = chance(claimChance, state)
        ? tryClaimRivalMarketDealSlot(state)
        : (recordFailedRivalClaimRoll(state), { claimed: false, blockedByCapacity: false });
      if (claimResult.waitingForRelease) {
        recordRivalListingDelayed(state);
        listing.daysLeft = 1;
        listing.freshness = Math.max(listing.freshness, 12);
        return;
      }
      listing.status = claimResult.claimed ? 'sold' : 'withdrawn';
      if (listing.status === 'sold') {
        recordRivalListingSold(state, listing);
      } else {
        recordRivalListingWithdrawn(state, listing);
        if (claimResult.blockedByCapacity) {
          recordRivalListingDelayed(state);
        }
      }
      const closedPlayerCase = listing.status === 'sold' ? markCaseLostToVisibleRival(state, listing) : false;
      const outcomeText = listing.status === 'sold'
        ? '被别家卖掉了'
        : claimResult.blockedByCapacity
          ? '没抢到本轮市场成交窗口，暂时从市场上撤出'
          : '从市场上撤出';
      logEvent(
        state,
        '同类房',
        `${listing.title}${outcomeText}，同板块压力重新洗牌。${closedPlayerCase ? ' 你手里对应那套房也被顺势抢走了。' : ''}`,
        listing.status === 'sold' ? 'danger' : 'accent',
      );
    }
  });

  state.marketShadow.rivalListings = state.marketShadow.rivalListings.slice(0, 18);
}

export function tryClaimOpenMarketDealForRivals(state: GameState) {
  if (getAvailableMarketDealSlots(state) <= 0) {
    return 0;
  }

  let claimedCount = 0;
  const activeRivals = state.marketShadow.rivalListings
    .filter((entry) => entry.status === 'active')
    .sort((left, right) => {
      const rightScore = right.heat + right.leadSiphonPower + right.ownerAnchorPower;
      const leftScore = left.heat + left.leadSiphonPower + left.ownerAnchorPower;
      return rightScore - leftScore;
    });

  activeRivals.forEach((listing) => {
    if (getAvailableMarketDealSlots(state) <= 0 || listing.status !== 'active') {
      return;
    }

    const claimChance = getRivalListingClaimChance(state, listing, 0.36);
    const claimResult = chance(claimChance, state)
      ? tryClaimRivalMarketDealSlot(state)
      : (recordFailedRivalClaimRoll(state), { claimed: false, blockedByCapacity: false });
    if (!claimResult.claimed) {
      return;
    }

    listing.status = 'sold';
    listing.daysLeft = 0;
    listing.freshness = 0;
    recordRivalListingSold(state, listing);
    const closedPlayerCase = markCaseLostToVisibleRival(state, listing);
    logEvent(
      state,
      '同类房',
      `${listing.title}被别家卖掉了，同板块压力重新洗牌。${closedPlayerCase ? ' 你手里对应那套房也被顺势抢走了。' : ''}`,
      'danger',
    );
    claimedCount += 1;
  });

  return claimedCount;
}

export function applyRivalPressure(state: GameState, sink?: PressureReceiptSink) {
  const { rivalOwnerPressureScale } = getRivalOutcomeControl(state);
  const activeRivals = state.marketShadow.rivalListings.filter((entry) => entry.status === 'active');
  if (!activeRivals.length) return;

  state.cases.forEach((caseItem) => {
    if (!isCaseActiveByCanonicalStatus(state, caseItem)) return;
    const rivals = activeRivals.filter((entry) => entry.marketCellId === caseItem.marketCellId);
    if (!rivals.length) return;

    const nearestPressure = rivals.reduce((sum, listing) => {
      const priceGap = Math.abs(listing.askPrice - caseItem.askPrice) / Math.max(caseItem.askPrice, 1);
      const priceOverlap = clamp(1 - priceGap * 6, 0, 1);
      return sum + priceOverlap * ((listing.leadSiphonPower + listing.ownerAnchorPower + listing.heat) / 3);
    }, 0) / rivals.length;

    const adjustedPressure = nearestPressure * rivalOwnerPressureScale;
    if (adjustedPressure < 34) return;

    const leadRival = rivals.reduce((best, listing) => listing.heat > best.heat ? listing : best, rivals[0]);
    const rivalLabel = `${leadRival.district} ${leadRival.segment}`;

    const heatDelta = -(adjustedPressure / 100) * state.rules.rivalPressureHeatImpact;
    const trustDelta = -(adjustedPressure / 100) * state.rules.rivalPressureTrustImpact;
    caseItem.heat = clamp(caseItem.heat + heatDelta, 10, 100);
    applyBrokerOwnerTrustDelta(state, caseItem, trustDelta, '竞品压力影响信任', 10, 100);

    sink?.collectPressure({
      source: 'rival-pressure',
      caseId: caseItem.id,
      day: state.day,
      dimension: 'heat',
      magnitude: Math.round(heatDelta * 100) / 100,
      evidence: `${caseItem.title} 被 ${rivalLabel} 等 ${rivals.length} 个竞品压制，热度下降。`,
      sourceEntityId: leadRival.id,
      sourceEntityLabel: rivalLabel,
      evidenceKind: 'rival-price-overlap',
      evidenceStrength: Math.min(100, Math.round(adjustedPressure)),
    });
    sink?.collectPressure({
      source: 'rival-pressure',
      caseId: caseItem.id,
      day: state.day,
      dimension: 'trust',
      magnitude: Math.round(trustDelta * 100) / 100,
      evidence: `${caseItem.title} 被竞品持续压制，业主信心下降。`,
      sourceEntityId: leadRival.id,
      sourceEntityLabel: rivalLabel,
      evidenceKind: 'rival-owner-anchor',
      evidenceStrength: Math.min(100, Math.round(adjustedPressure * 0.8)),
    });

    state.opportunities
      .filter((entry) => entry.caseId === caseItem.id && isOpportunityActiveByCanonicalState(state, entry))
      .forEach((entry) => {
        const intentDelta = -adjustedPressure / 85;
        const confidenceDelta = -adjustedPressure / 110;
        applyOpportunityIntentDeltaOnState(state, entry, intentDelta, '竞品压力降低意向', 0, 100);
        applyOpportunityConfidenceDeltaOnState(state, entry, confidenceDelta, '竞品压力降低信心', 0, 100);

        sink?.collectPressure({
          source: 'rival-pressure',
          caseId: caseItem.id,
          day: state.day,
          dimension: 'intent',
          magnitude: Math.round(intentDelta * 100) / 100,
          evidence: `${entry.customerName} 对 ${caseItem.title} 的意向被竞品分流。`,
          sourceEntityId: leadRival.id,
          sourceEntityLabel: rivalLabel,
          evidenceKind: 'rival-lead-siphon',
          evidenceStrength: Math.min(100, Math.round(adjustedPressure * 0.7)),
          opportunityIds: [entry.id],
        });
      });

    if (adjustedPressure >= 58 && chance(scaleProbability(0.18, rivalOwnerPressureScale, 0.85), state)) {
      logEvent(state, '竞品压制', `${leadRival.title} 正在抢走 ${caseItem.title} 的一部分注意力。`, 'danger');
    }
  });
}
