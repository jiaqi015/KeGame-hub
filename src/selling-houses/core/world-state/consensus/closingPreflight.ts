/**
 * Closing Preflight — read-only pre-signing evidence check.
 *
 * R46: Before signing, the system should explain:
 * - What evidence exists (buyer offer? owner concession?)
 * - What's missing
 * - How big is the price gap
 * - Is this canonical or legacy-only
 * - Why can/can't we sign
 *
 * Hard constraints:
 * 1. Pure functions — no domain/runtime imports
 * 2. Deterministic: same input → same output
 * 3. Cannot create canonical facts (read-only)
 * 4. Does NOT fabricate offer prices from deal outcomes
 * 5. Player-facing text follows business-language-guide
 *
 * Mother model reference: constitutional §3 (price consensus from offer/concession)
 */

import type {
  PriceTrajectory,
  PriceConsensusReadiness,
} from './priceTrajectory.js';
import {
  buildPriceConsensusReadiness,
} from './priceTrajectory.js';
import type {
  NegotiationProcess,
  NegotiationExplanation,
} from './negotiationProcessBridge.js';
import {
  buildNegotiationProcessFromTrajectory,
  buildNegotiationExplanation,
  buildMissingEvidenceExplanation,
} from './negotiationProcessBridge.js';
import type {
  SourceRecordForEvidence,
  GameStateForEvidence,
  CanonicalTrajectoryResult,
} from './canonicalEvidenceBuilder.js';
import {
  buildCanonicalPriceTrajectoryFromEvidence,
  createEvidenceStateView,
} from './canonicalEvidenceBuilder.js';

// ---------------------------------------------------------------------------
// ClosingPreflightResult: the full preflight output
// ---------------------------------------------------------------------------

export interface ClosingPreflightResult {
  readonly caseId: string;
  readonly customerId: string;
  readonly ownerId: string;
  readonly hasBuyerOffer: boolean;
  readonly hasOwnerConcession: boolean;
  readonly buyerOfferPrice?: number;
  readonly ownerConcessionPrice?: number;
  readonly currentGap: number;
  readonly requiredGap: number;
  readonly evidenceQuality: 'canonical' | 'legacy_compatibility_projection' | 'no_evidence';
  readonly canSign: boolean;
  readonly blockers: readonly string[];
  readonly playerExplanation: string;
  readonly convergenceTrend: 'converging' | 'diverging' | 'stalled' | 'no_data';
  readonly negotiationProcess?: NegotiationProcess;
  readonly negotiationExplanation?: NegotiationExplanation;
}

// ---------------------------------------------------------------------------
// buildClosingPreflight
// ---------------------------------------------------------------------------

/**
 * Build a closing preflight from GameState-like inputs.
 *
 * This is the main entry point. It:
 * 1. Scans pendingSourceRecords for buyer/owner evidence
 * 2. If both exist, builds canonical trajectory + readiness
 * 3. If either missing, returns explicit missing evidence explanation
 * 4. Generates player-facing explanation text
 *
 * Cannot create canonical facts. Read-only.
 */
export function buildClosingPreflight(input: {
  readonly state: GameStateForEvidence;
  readonly caseId: string;
  readonly customerId: string;
  readonly ownerId: string;
  readonly day: number;
  readonly caseTitle?: string;
  readonly customerName?: string;
  readonly ownerName?: string;
  readonly marketPrice?: number;
  readonly askPrice?: number;
}): ClosingPreflightResult {
  const { state, caseId, customerId, ownerId, day, caseTitle, customerName, ownerName, marketPrice, askPrice } = input;

  // Step 1: Check for buyer offer evidence
  const buyerEvidence = findBuyerOfferEvidence(state, caseId, customerId, day);
  const hasBuyerOffer = buyerEvidence.length > 0;
  const buyerOfferPrice = buyerEvidence[0]?.price;

  // Step 2: Check for owner concession evidence
  const ownerEvidence = findOwnerConcessionEvidence(state, caseId, ownerId, day);
  const hasOwnerConcession = ownerEvidence.length > 0;
  const ownerConcessionPrice = ownerEvidence[0]?.price;

  // Step 3: If both exist, try canonical trajectory
  let canonicalResult: CanonicalTrajectoryResult | undefined;
  let evidenceQuality: ClosingPreflightResult['evidenceQuality'] = 'no_evidence';

  if (hasBuyerOffer && hasOwnerConcession) {
    canonicalResult = buildCanonicalPriceTrajectoryFromEvidence({
      state,
      caseId,
      customerId,
      ownerId,
      opportunityId: `opportunity:${caseId}:${customerId}`,
      day,
    });
    evidenceQuality = canonicalResult.success ? 'canonical' : 'legacy_compatibility_projection';
  } else if (hasBuyerOffer || hasOwnerConcession) {
    evidenceQuality = 'legacy_compatibility_projection';
  }

  // Step 4: Build negotiation process if trajectory exists
  let negotiationProcess: NegotiationProcess | undefined;
  let negotiationExplanation: NegotiationExplanation | undefined;
  let currentGap = Infinity;
  let requiredGap = 5;
  let canSign = false;
  let blockers: string[] = [];
  let convergenceTrend: ClosingPreflightResult['convergenceTrend'] = 'no_data';

  if (canonicalResult?.success && canonicalResult.trajectory) {
    const readiness = buildPriceConsensusReadiness(canonicalResult.trajectory);
    negotiationProcess = buildNegotiationProcessFromTrajectory({
      trajectory: canonicalResult.trajectory,
      readiness,
    });
    negotiationExplanation = buildNegotiationExplanation({
      process: negotiationProcess,
      readiness,
    });
    currentGap = readiness.currentGap;
    requiredGap = readiness.requiredGap;
    canSign = negotiationProcess.canSign;
    blockers = [...negotiationProcess.signBlockers];
    convergenceTrend = negotiationProcess.convergenceTrend;
  } else if (!hasBuyerOffer || !hasOwnerConcession) {
    // Missing evidence — build missing explanation
    const missingExplanation = buildMissingEvidenceExplanation({
      caseId,
      hasBuyerOffer,
      hasOwnerConcession,
      source: evidenceQuality,
    });
    currentGap = missingExplanation.currentGap;
    requiredGap = missingExplanation.requiredGap;
    canSign = false;
    blockers = [...missingExplanation.blockers];
    convergenceTrend = 'no_data';
  }

  // Step 5: Build player-facing explanation
  const playerExplanation = buildPlayerExplanation({
    caseId,
    caseTitle,
    customerName,
    ownerName,
    hasBuyerOffer,
    hasOwnerConcession,
    buyerOfferPrice,
    ownerConcessionPrice,
    currentGap,
    requiredGap,
    evidenceQuality,
    canSign,
    blockers,
    convergenceTrend,
    marketPrice,
    askPrice,
  });

  return Object.freeze({
    caseId,
    customerId,
    ownerId,
    hasBuyerOffer,
    hasOwnerConcession,
    buyerOfferPrice,
    ownerConcessionPrice,
    currentGap,
    requiredGap,
    evidenceQuality,
    canSign,
    blockers: Object.freeze(blockers),
    playerExplanation,
    convergenceTrend,
    negotiationProcess,
    negotiationExplanation,
  });
}

// ---------------------------------------------------------------------------
// Evidence extraction helpers
// ---------------------------------------------------------------------------

function findBuyerOfferEvidence(
  state: GameStateForEvidence,
  caseId: string,
  customerId: string,
  day: number,
): readonly { readonly sourceId: string; readonly price: number; readonly day: number }[] {
  if (!state.pendingSourceRecords) return [];
  const results: { sourceId: string; price: number; day: number }[] = [];
  for (const record of state.pendingSourceRecords) {
    if (record.day > day) continue;
    if (record.sourceKind !== 'customer_interaction') continue;
    const payload = record.payload;
    const subtype = payload.subtype as string | undefined;
    const offerPrice = payload.offerPrice as number | undefined;
    const recordCustomerId = payload.customerId as string | undefined;
    const recordCaseId = payload.caseId as string | undefined;
    if (subtype === 'offer_submitted'
      && offerPrice !== undefined
      && recordCustomerId === customerId
      && (recordCaseId === caseId || recordCaseId === undefined)) {
      results.push({ sourceId: record.sourceId, price: offerPrice, day: record.day });
    }
  }
  return results;
}

function findOwnerConcessionEvidence(
  state: GameStateForEvidence,
  caseId: string,
  ownerId: string,
  day: number,
): readonly { readonly sourceId: string; readonly price: number; readonly day: number }[] {
  if (!state.pendingSourceRecords) return [];
  const results: { sourceId: string; price: number; day: number }[] = [];
  for (const record of state.pendingSourceRecords) {
    if (record.day > day) continue;
    if (record.sourceKind !== 'owner_interview') continue;
    const payload = record.payload;
    const concessionPrice = payload.concessionPrice as number | undefined;
    const priceMentioned = payload.priceMentioned as number | undefined;
    const recordOwnerId = payload.ownerId as string | undefined;
    const recordCaseId = payload.caseId as string | undefined;
    // Explicit concession
    if (concessionPrice !== undefined && recordOwnerId === ownerId && recordCaseId === caseId) {
      results.push({ sourceId: record.sourceId, price: concessionPrice, day: record.day });
      continue;
    }
    // Fallback: price_discussed with neutral/positive tone
    const subtype = payload.subtype as string | undefined;
    const tone = payload.tone as string | undefined;
    if (subtype === 'price_discussed'
      && priceMentioned !== undefined
      && concessionPrice === undefined
      && (tone === 'neutral' || tone === 'positive')
      && recordOwnerId === ownerId
      && recordCaseId === caseId) {
      results.push({ sourceId: record.sourceId, price: priceMentioned, day: record.day });
    }
  }
  return results;
}

// ---------------------------------------------------------------------------
// Player-facing explanation builder
// ---------------------------------------------------------------------------

interface ExplanationInput {
  readonly caseId: string;
  readonly caseTitle?: string;
  readonly customerName?: string;
  readonly ownerName?: string;
  readonly hasBuyerOffer: boolean;
  readonly hasOwnerConcession: boolean;
  readonly buyerOfferPrice?: number;
  readonly ownerConcessionPrice?: number;
  readonly currentGap: number;
  readonly requiredGap: number;
  readonly evidenceQuality: 'canonical' | 'legacy_compatibility_projection' | 'no_evidence';
  readonly canSign: boolean;
  readonly blockers: readonly string[];
  readonly convergenceTrend: 'converging' | 'diverging' | 'stalled' | 'no_data';
  readonly marketPrice?: number;
  readonly askPrice?: number;
}

function buildPlayerExplanation(input: ExplanationInput): string {
  const {
    caseTitle, customerName, ownerName,
    hasBuyerOffer, hasOwnerConcession,
    buyerOfferPrice, ownerConcessionPrice,
    currentGap, requiredGap,
    evidenceQuality, canSign, blockers, convergenceTrend,
    marketPrice, askPrice,
  } = input;

  const title = caseTitle ?? '这套房';
  const customer = customerName ?? '客户';
  const owner = ownerName ?? '业主';

  // Case 1: Can sign
  if (canSign) {
    const gap = currentGap <= requiredGap ? '差距已经收口' : `差距 ${currentGap} 万，阈值 ${requiredGap} 万`;
    return `${title}：${customer} 出价 ${buyerOfferPrice} 万，${owner} 让到 ${ownerConcessionPrice} 万。${gap}，可以签约。`;
  }

  // Case 2: Missing buyer offer
  if (!hasBuyerOffer) {
    return `${title}：${customer} 还没有正式出价。建议先确认客户的心理价位和付款方式，再和${owner}谈。`;
  }

  // Case 3: Missing owner concession
  if (!hasOwnerConcession) {
    return `${title}：${owner} 还没有明确让价。建议先用带看反馈和竞品成交数据做一次价格沟通，看${owner}是否愿意调整预期。`;
  }

  // Case 4: Both exist but gap too big
  if (hasBuyerOffer && hasOwnerConcession && buyerOfferPrice !== undefined && ownerConcessionPrice !== undefined) {
    const gap = Math.abs(buyerOfferPrice - ownerConcessionPrice);
    const gapLabel = convergenceTrend === 'converging'
      ? '双方价格正在靠近'
      : convergenceTrend === 'diverging'
        ? '价格分歧在扩大'
        : '价格暂时卡住';

    const marketRef = marketPrice ? `市场价 ${marketPrice} 万` : '';
    const askRef = askPrice ? `挂牌价 ${askPrice} 万` : '';
    const refs = [marketRef, askRef].filter(Boolean).join('，');

    return `${title}：${customer} 出价 ${buyerOfferPrice} 万，${owner} 让到 ${ownerConcessionPrice} 万，还差 ${gap} 万。${gapLabel}。${refs ? `（参考：${refs}）` : ''}`;
  }

  // Case 5: Legacy-only
  if (evidenceQuality === 'legacy_compatibility_projection') {
    return `${title}：当前证据来自历史推导，不是真实出价/让价记录。建议先推动${customer}正式出价，再和${owner}沟通。`;
  }

  // Case 6: No evidence
  return `${title}：缺少价格谈判证据。建议先确认${customer}的出价意愿和${owner}的让价空间。`;
}
