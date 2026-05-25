/**
 * CloseProbability Pure Kernel — deterministic probability computation
 * with explicit inputs, weights, and WeightExplanation trace.
 *
 * Extracted from dealClosing.ts inline math.
 * No Date.now/Math.random/network/LLM. Same inputs → same output.
 *
 * Constitutional chain: this kernel provides the "Consensus/Contract" layer
 * with explainable probability truth, not a hidden formula.
 */

import type { WeightExplanation } from './priceTrajectory.js';

// ---------------------------------------------------------------------------
// Input types
// ---------------------------------------------------------------------------

export interface CloseProbabilityInputs {
  readonly customerIntent: number;
  readonly customerConfidence: number;
  readonly ownerTrust: number;
  readonly ownerIsUrgent: boolean;
  readonly caseCompetitiveness: number;
  readonly askPricePenalty: number; // max(0, askPrice - marketPrice)
  readonly strategyShift: number;
  readonly scalingFactor: number; // playerDealClosingScale
  readonly trustGate: number;
  readonly priceExceedsBudget: boolean;
  readonly marketCapacityBlocked: boolean;
  readonly playerCapacityBlocked: boolean;
  readonly brokerCustomerTrust: number;
  readonly brokerCustomerFamiliarity: number;
  readonly brokerCustomerInfluence: number;
  readonly brokerCustomerRelationSource: 'relation' | 'legacy-customer-runtime-fallback';
  readonly brokerCustomerRelationId: string;
}

export interface CloseProbabilityWeights {
  readonly intentWeight: number;
  readonly confidenceWeight: number;
  readonly defaultTrustWeight: number;
  readonly urgentTrustWeight: number;
  readonly competitivenessWeight: number;
  readonly askPricePenaltyWeight: number;
  readonly brokerCustomerInfluenceWeight: number;
  readonly brokerCustomerTrustWeight: number;
}

export interface CloseProbabilityResult {
  readonly rawScore: number;
  readonly rawProbability: number;
  readonly boundedProbability: number;
  readonly closeReadiness: number;
  readonly isBlocked: boolean;
  readonly blockingCategories: readonly CloseProbabilityBlockCategory[];
  readonly weightExplanations: readonly WeightExplanation[];
}

export type CloseProbabilityBlockCategory =
  | 'price_budget'
  | 'relation_trust'
  | 'market_capacity'
  | 'player_capacity'
  | 'evidence_weak';

// ---------------------------------------------------------------------------
// Default weights
// ---------------------------------------------------------------------------

export function buildDefaultCloseProbabilityWeights(): CloseProbabilityWeights {
  return {
    intentWeight: 0.46,
    confidenceWeight: 0.24,
    defaultTrustWeight: 0.18,
    urgentTrustWeight: 0.25,
    competitivenessWeight: 0.16,
    askPricePenaltyWeight: 0.6,
    brokerCustomerInfluenceWeight: 0.04,
    brokerCustomerTrustWeight: 0.06,
  };
}

// ---------------------------------------------------------------------------
// Pure kernel
// ---------------------------------------------------------------------------

export function computeCloseProbability(
  inputs: CloseProbabilityInputs,
  weights: CloseProbabilityWeights,
): CloseProbabilityResult {
  // 1. Weighted score computation
  const trustWeight = inputs.ownerIsUrgent ? weights.urgentTrustWeight : weights.defaultTrustWeight;
  const intentContribution = inputs.customerIntent * weights.intentWeight;
  const confidenceContribution = inputs.customerConfidence * weights.confidenceWeight;
  const trustContribution = inputs.ownerTrust * trustWeight;
  const competitivenessContribution = inputs.caseCompetitiveness * weights.competitivenessWeight;
  const penaltyContribution = inputs.askPricePenalty * weights.askPricePenaltyWeight;
  const bcrInfluenceContribution = inputs.brokerCustomerInfluence * weights.brokerCustomerInfluenceWeight;
  const bcrTrustContribution = inputs.brokerCustomerTrust * weights.brokerCustomerTrustWeight;

  const rawScore =
    intentContribution
    + confidenceContribution
    + trustContribution
    + competitivenessContribution
    - penaltyContribution
    + bcrInfluenceContribution
    + bcrTrustContribution
    + inputs.strategyShift;

  const rawProbability = clamp(
    Math.round(rawScore * inputs.scalingFactor),
    0,
    95,
  );

  // 2. Blocking checks
  const blockingCategories: CloseProbabilityBlockCategory[] = [];
  if (inputs.priceExceedsBudget) blockingCategories.push('price_budget');
  if (inputs.ownerTrust < inputs.trustGate) blockingCategories.push('relation_trust');
  if (inputs.marketCapacityBlocked) blockingCategories.push('market_capacity');
  if (inputs.playerCapacityBlocked) blockingCategories.push('player_capacity');

  const isBlocked = blockingCategories.length > 0;
  const boundedProbability = isBlocked ? 0 : rawProbability;

  // Evidence weakness: no hard blockers but below threshold
  if (!isBlocked && rawProbability < 50) {
    blockingCategories.push('evidence_weak');
  }

  // 3. Close readiness (separate metric from probability)
  const closeReadiness = clamp(
    Math.round(
      inputs.customerIntent * 0.34
      + inputs.customerConfidence * 0.26
      + inputs.ownerTrust * 0.2
      + inputs.caseCompetitiveness * 0.12
      + Math.max(0, 100 - inputs.askPricePenalty * 0.25) * 0.08
    ),
    0,
    100,
  );

  // 4. Weight explanations
  const weightExplanations: WeightExplanation[] = [
    {
      factor: 'customer_intent',
      weight: weights.intentWeight,
      derivedFrom: {
        sourceKind: 'market_signal',
        sourceIds: [`${inputs.customerIntent}`],
      },
    },
    {
      factor: 'customer_confidence',
      weight: weights.confidenceWeight,
      derivedFrom: {
        sourceKind: 'market_signal',
        sourceIds: [`${inputs.customerConfidence}`],
      },
    },
    {
      factor: 'owner_trust',
      weight: trustWeight,
      derivedFrom: {
        sourceKind: inputs.ownerIsUrgent ? 'archetype_default' : 'historical_distribution',
        sourceIds: [`${inputs.ownerTrust}`, inputs.ownerIsUrgent ? 'urgent' : 'default'],
      },
    },
    {
      factor: 'competitiveness',
      weight: weights.competitivenessWeight,
      derivedFrom: {
        sourceKind: 'market_signal',
        sourceIds: [`${inputs.caseCompetitiveness}`],
      },
    },
    {
      factor: 'ask_price_penalty',
      weight: -weights.askPricePenaltyWeight,
      derivedFrom: {
        sourceKind: 'market_signal',
        sourceIds: [`${inputs.askPricePenalty}`],
      },
    },
    {
      factor: 'broker_customer_influence',
      weight: weights.brokerCustomerInfluenceWeight,
      derivedFrom: {
        sourceKind: inputs.brokerCustomerRelationSource === 'relation' ? 'historical_distribution' : 'archetype_default',
        sourceIds: [inputs.brokerCustomerRelationId],
      },
    },
    {
      factor: 'broker_customer_trust',
      weight: weights.brokerCustomerTrustWeight,
      derivedFrom: {
        sourceKind: inputs.brokerCustomerRelationSource === 'relation' ? 'historical_distribution' : 'archetype_default',
        sourceIds: [inputs.brokerCustomerRelationId],
      },
    },
    {
      factor: 'strategy_shift',
      weight: 1,
      derivedFrom: {
        sourceKind: 'archetype_default',
        sourceIds: [`${inputs.strategyShift}`],
      },
    },
  ];

  return Object.freeze({
    rawScore,
    rawProbability,
    boundedProbability,
    closeReadiness,
    isBlocked,
    blockingCategories: Object.freeze(blockingCategories),
    weightExplanations: Object.freeze(weightExplanations),
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}
