/**
 * Negotiation Process Bridge
 *
 * R45: Makes the offer/concession sequence readable as a process,
 * not just a stageIndex jump or a one-shot deal price.
 *
 * Design constraints:
 * - Pure functions — no domain/runtime imports
 * - Deterministic: same input → same output
 * - Write functions return frozen objects — no mutation
 * - UI/projection can READ this, but CANNOT CREATE canonical facts from it
 * - stageIndex is derived/projection here, never canonical truth
 *
 * Mother model reference: constitutional §3 (price consensus from offer/concession sequence)
 */

import type {
  PriceTrajectory,
  BuyerOffer,
  OwnerConcession,
  PriceConsensusReadiness,
  PriceConsensusProof,
} from './priceTrajectory.js';

// ---------------------------------------------------------------------------
// NegotiationTurn: one step in the negotiation dance
// ---------------------------------------------------------------------------

export type NegotiationTurnSide = 'buyer' | 'owner';

export interface NegotiationTurn {
  readonly turnId: string;
  readonly day: number;
  readonly side: NegotiationTurnSide;
  readonly price: number;
  readonly conditions: readonly string[];
  readonly confidence: number;
  readonly sourceRecordId: string;
  readonly source: 'canonical' | 'legacy_compatibility_projection';
}

// ---------------------------------------------------------------------------
// NegotiationGap: price gap at a point in time
// ---------------------------------------------------------------------------

export interface NegotiationGap {
  readonly day: number;
  readonly buyerPrice: number;
  readonly ownerPrice: number;
  readonly gap: number;
  readonly gapPct: number;
}

// ---------------------------------------------------------------------------
// NegotiationProcess: the full readable negotiation story
// ---------------------------------------------------------------------------

export interface NegotiationProcess {
  readonly processId: string;
  readonly caseId: string;
  readonly customerId: string;
  readonly ownerId: string;
  readonly turns: readonly NegotiationTurn[];
  readonly gaps: readonly NegotiationGap[];
  readonly convergenceTrend: 'converging' | 'diverging' | 'stalled' | 'no_data';
  readonly source: 'canonical' | 'legacy_compatibility_projection';
  readonly canSign: boolean;
  readonly signBlockers: readonly string[];
}

// ---------------------------------------------------------------------------
// NegotiationExplanation: why can/can't we sign
// ---------------------------------------------------------------------------

export interface NegotiationExplanation {
  readonly summary: string;
  readonly canSign: boolean;
  readonly currentGap: number;
  readonly requiredGap: number;
  readonly buyerLastOffer?: { readonly price: number; readonly day: number; readonly source: string };
  readonly ownerLastConcession?: { readonly price: number; readonly day: number; readonly source: string };
  readonly blockers: readonly string[];
  readonly convergenceSummary: string;
  readonly evidenceQuality: 'canonical' | 'legacy_compatibility_projection' | 'no_evidence';
}

// ---------------------------------------------------------------------------
// buildNegotiationTurnsFromTrajectory
// ---------------------------------------------------------------------------

export function buildNegotiationTurnsFromTrajectory(
  trajectory: PriceTrajectory,
): readonly NegotiationTurn[] {
  const turns: NegotiationTurn[] = [];

  for (const offer of trajectory.offers) {
    turns.push({
      turnId: offer.offerId,
      day: offer.day,
      side: 'buyer',
      price: offer.price,
      conditions: offer.conditions,
      confidence: offer.confidence,
      sourceRecordId: offer.sourceRecordIds[0] ?? 'unknown',
      source: offer.source,
    });
  }

  for (const concession of trajectory.concessions) {
    turns.push({
      turnId: concession.concessionId,
      day: concession.day,
      side: 'owner',
      price: concession.price,
      conditions: concession.conditions,
      confidence: concession.confidence,
      sourceRecordId: concession.sourceRecordIds[0] ?? 'unknown',
      source: concession.source,
    });
  }

  return Object.freeze(turns.sort((a, b) => a.day - b.day));
}

// ---------------------------------------------------------------------------
// buildNegotiationGapsFromTrajectory
// ---------------------------------------------------------------------------

export function buildNegotiationGapsFromTrajectory(
  trajectory: PriceTrajectory,
): readonly NegotiationGap[] {
  const gaps: NegotiationGap[] = [];

  // Use convergenceCurve if available
  if (trajectory.convergenceCurve.length > 0) {
    for (const entry of trajectory.convergenceCurve) {
      // Find the offer and concession prices at this day
      const offerAtDay = trajectory.offers.find(o => o.day <= entry.day);
      const concessionAtDay = trajectory.concessions.find(c => c.day <= entry.day);
      const buyerPrice = offerAtDay?.price ?? 0;
      const ownerPrice = concessionAtDay?.price ?? 0;
      const base = Math.max(buyerPrice, ownerPrice, 1);
      gaps.push({
        day: entry.day,
        buyerPrice,
        ownerPrice,
        gap: entry.gap,
        gapPct: Math.round((entry.gap / base) * 100),
      });
    }
  } else {
    // Fallback: build from offers/concessions
    const lastOffer = trajectory.offers[trajectory.offers.length - 1];
    const lastConcession = trajectory.concessions[trajectory.concessions.length - 1];
    if (lastOffer && lastConcession) {
      const gap = Math.abs(lastOffer.price - lastConcession.price);
      const base = Math.max(lastOffer.price, lastConcession.price, 1);
      gaps.push({
        day: Math.max(lastOffer.day, lastConcession.day),
        buyerPrice: lastOffer.price,
        ownerPrice: lastConcession.price,
        gap,
        gapPct: Math.round((gap / base) * 100),
      });
    }
  }

  return Object.freeze(gaps);
}

// ---------------------------------------------------------------------------
// deriveConvergenceTrend
// ---------------------------------------------------------------------------

export function deriveConvergenceTrend(gaps: readonly NegotiationGap[]): NegotiationProcess['convergenceTrend'] {
  if (gaps.length === 0) return 'no_data';
  if (gaps.length === 1) return 'stalled';

  const last = gaps[gaps.length - 1];
  const prev = gaps[gaps.length - 2];

  if (last.gap < prev.gap) return 'converging';
  if (last.gap > prev.gap) return 'diverging';
  return 'stalled';
}

// ---------------------------------------------------------------------------
// buildNegotiationProcessFromTrajectory
// ---------------------------------------------------------------------------

export function buildNegotiationProcessFromTrajectory(input: {
  readonly trajectory: PriceTrajectory;
  readonly readiness: PriceConsensusReadiness;
}): NegotiationProcess {
  const { trajectory, readiness } = input;

  const turns = buildNegotiationTurnsFromTrajectory(trajectory);
  const gaps = buildNegotiationGapsFromTrajectory(trajectory);
  const convergenceTrend = deriveConvergenceTrend(gaps);

  const blockers: string[] = [];
  if (!readiness.ready) {
    blockers.push(...readiness.blockers);
  }
  if (trajectory.source === 'legacy_compatibility_projection') {
    blockers.push('evidence来源是legacy投影，不是真实source record');
  }

  return Object.freeze({
    processId: `nproc:${trajectory.trajectoryId}`,
    caseId: trajectory.caseId,
    customerId: trajectory.customerId,
    ownerId: trajectory.ownerId,
    turns,
    gaps,
    convergenceTrend,
    source: trajectory.source,
    canSign: readiness.ready && blockers.length === 0,
    signBlockers: Object.freeze(blockers),
  });
}

// ---------------------------------------------------------------------------
// buildNegotiationExplanation
// ---------------------------------------------------------------------------

export function buildNegotiationExplanation(input: {
  readonly process: NegotiationProcess;
  readonly readiness: PriceConsensusReadiness;
  readonly proof?: PriceConsensusProof;
}): NegotiationExplanation {
  const { process, readiness, proof } = input;

  const lastGap = process.gaps[process.gaps.length - 1];
  const currentGap = lastGap?.gap ?? Infinity;
  const requiredGap = readiness.requiredGap;

  const buyerLastOffer = process.turns.filter(t => t.side === 'buyer').slice(-1)[0];
  const ownerLastConcession = process.turns.filter(t => t.side === 'owner').slice(-1)[0];

  const convergenceSummary = process.convergenceTrend === 'converging'
    ? '双方价格正在靠近'
    : process.convergenceTrend === 'diverging'
      ? '双方价格正在拉开'
      : process.convergenceTrend === 'stalled'
        ? '价格谈判停滞'
        : '无足够数据判断趋势';

  const evidenceQuality = process.source === 'canonical'
    ? 'canonical'
    : process.source === 'legacy_compatibility_projection'
      ? 'legacy_compatibility_projection'
      : 'no_evidence';

  const summary = process.canSign
    ? `价格共识已达成，差距 ${currentGap} ≤ ${requiredGap}，可以签约。`
    : `价格共识未达成。${process.signBlockers.join('；')}。`;

  return Object.freeze({
    summary,
    canSign: process.canSign,
    currentGap,
    requiredGap,
    buyerLastOffer: buyerLastOffer ? {
      price: buyerLastOffer.price,
      day: buyerLastOffer.day,
      source: buyerLastOffer.sourceRecordId,
    } : undefined,
    ownerLastConcession: ownerLastConcession ? {
      price: ownerLastConcession.price,
      day: ownerLastConcession.day,
      source: ownerLastConcession.sourceRecordId,
    } : undefined,
    blockers: process.signBlockers,
    convergenceSummary,
    evidenceQuality,
  });
}

// ---------------------------------------------------------------------------
// deriveStageFromProcess (projection-only, NOT canonical)
// ---------------------------------------------------------------------------

/**
 * Derive a human-readable stage label from the negotiation process.
 * This is a DISPLAY-ONLY derivation — it does NOT create canonical facts.
 * stageIndex is NEVER set from this function.
 */
export function deriveStageLabelFromProcess(process: NegotiationProcess): string {
  if (process.turns.length === 0) return '尚无出价记录';
  if (process.canSign) return '价格共识已达成';
  if (process.convergenceTrend === 'converging') return '价格正在靠近';
  if (process.convergenceTrend === 'diverging') return '价格分歧扩大';
  if (process.convergenceTrend === 'stalled') return '谈判停滞';
  return '谈判进行中';
}

// ---------------------------------------------------------------------------
// Missing evidence explanation
// ---------------------------------------------------------------------------

export function buildMissingEvidenceExplanation(input: {
  readonly caseId: string;
  readonly hasBuyerOffer: boolean;
  readonly hasOwnerConcession: boolean;
  readonly source: 'canonical' | 'legacy_compatibility_projection' | 'no_evidence';
}): NegotiationExplanation {
  const blockers: string[] = [];
  if (!input.hasBuyerOffer) blockers.push('缺少买家出价source record（需要customer_interaction.offer_submitted + offerPrice）');
  if (!input.hasOwnerConcession) blockers.push('缺少业主让价source record（需要owner_interview.price_discussed + concessionPrice）');
  if (input.source === 'legacy_compatibility_projection') blockers.push('当前证据来源是legacy投影，不是真实source record');

  return Object.freeze({
    summary: blockers.length > 0
      ? `无法签约：${blockers.join('；')}`
      : '证据链完整，可以评估签约条件。',
    canSign: false,
    currentGap: Infinity,
    requiredGap: 5,
    blockers,
    convergenceSummary: '无足够数据判断趋势',
    evidenceQuality: input.source,
  });
}
