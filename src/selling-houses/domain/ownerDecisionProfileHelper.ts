/**
 * Owner Decision Profile Helper — derives owner behavior flags and
 * behavioral dimensions from 16-type profiling, with legacy personality fallback.
 *
 * Used by dealClosing.ts and other domain consumers that need
 * owner urgency/pragmatism/emotion flags and behavioral dimension scores.
 *
 * Mother model alignment:
 * - Section 5: Human Decision Model — profiling dimensions are authoritative
 * - Section 8: Broker Service Essence — owner type affects negotiation strategy
 *
 * Hard constraints:
 * 1. Pure function — no mutation.
 * 2. No Date.now, no Math.random, no fetch.
 * 3. Deterministic: same input → same output.
 * 4. Frozen output.
 * 5. Profiling dimensions are primary; legacy personality is fallback only.
 * 6. Legacy fallback concentrated here, marked source='legacy-personality-fallback'.
 *
 * B USAGE GUIDE — which fields to use where:
 * ┌─────────────────────────┬───────────────────────────────────────────────────────┐
 * │ B engine file           │ Use these fields instead of bare reads               │
 * ├─────────────────────────┼───────────────────────────────────────────────────────┤
 * │ marketEngine.ts         │ dimensions.timePressure, dimensions.trustDecayMultiplier │
 * │                         │   instead of caseItem.personality === 'urgent'       │
 * │                         │ dimensions.priceSensitivity                          │
 * │                         │   instead of caseItem.personality === 'pragmatic'    │
 * │                         │ dimensions.heatSensitivity                           │
 * │                         │   instead of caseItem.personality === 'emotional'    │
 * ├─────────────────────────┼───────────────────────────────────────────────────────┤
 * │ pricingActionExecutors  │ dimensions.holdStoryTrustDelta                       │
 * │                         │   instead of hardcoded trust loss on hold            │
 * │                         │ dimensions.smallCutTrustDelta                        │
 * │                         │   instead of hardcoded trust loss on small cut       │
 * │                         │ dimensions.deepCutTrustDelta                         │
 * │                         │   instead of hardcoded trust loss on deep cut        │
 * │                         │ dimensions.preferredPricingBias                      │
 * │                         │   for owner pricing tendency                         │
 * ├─────────────────────────┼───────────────────────────────────────────────────────┤
 * │ competitionEngine.ts    │ dimensions.heatSensitivity                           │
 * │                         │   for competition heat impact weighting              │
 * │                         │ dimensions.trustDecayMultiplier                      │
 * │                         │   for competition trust impact weighting             │
 * ├─────────────────────────┼───────────────────────────────────────────────────────┤
 * │ opportunityEngine.ts    │ profile.isUrgent / isPragmatic / isEmotional         │
 * │                         │   instead of caseItem.personality checks             │
 * │                         │ dimensions.communicationNeed                         │
 * │                         │   for opportunity interaction style                  │
 * ├─────────────────────────┼───────────────────────────────────────────────────────┤
 * │ marketingActionExecutors│ dimensions.communicationNeed                         │
 * │                         │   for marketing message style                        │
 * ├─────────────────────────┼───────────────────────────────────────────────────────┤
 * │ localAdversarialSelfPlay│ dimensions.priceSensitivity, dimensions.urgencyBias  │
 * │                         │   instead of caseItem.personality checks             │
 * └─────────────────────────┴───────────────────────────────────────────────────────┘
 *
 * API entry points:
 * - readOwnerDecisionProfile(caseItem) → boolean flags (isUrgent/isPragmatic/isEmotional)
 * - readOwnerBehaviorDimensions(caseItem) → numeric scores (0-100) + trust deltas
 */

import type { Case } from './models.js';
import type { OwnerProfilingMemorySummary } from './ownerProfilingMemoryTypes.js';

// ---------------------------------------------------------------------------
// OwnerDecisionProfile — boolean behavior flags
// ---------------------------------------------------------------------------

export interface OwnerDecisionProfile {
  readonly isUrgent: boolean;
  readonly isPragmatic: boolean;
  readonly isEmotional: boolean;
  /** Source: 'profiling' when 16-type dimensions are available, 'legacy-personality-fallback' otherwise. */
  readonly source: 'profiling' | 'legacy-personality-fallback';
}

/**
 * Derive owner decision profile from 16-type profiling dimensions.
 * Falls back to legacy 4-type personality when profiling is not yet revealed
 * (first-visit not completed) or dimensions are 'unknown'.
 *
 * Mother model: owner behavior comes from profiling dimensions, not bare personality.
 * The legacy personality fallback is a compatibility mirror, not an authoritative source.
 */
export function readOwnerDecisionProfile(caseItem: Case): OwnerDecisionProfile {
  const profiling = caseItem.ownerProfilingMemory;
  if (profiling && caseItem.hasCompletedFirstVisit) {
    const dims = profiling.dimensions;
    const timeDim = dims.find(d => d.key === 'time_window');
    const priceDim = dims.find(d => d.key === 'price_anchor');
    const expDim = dims.find(d => d.key === 'transaction_experience');
    const timeVal = timeDim?.value;
    const priceVal = priceDim?.value;
    const expVal = expDim?.value;

    // Only use profiling if at least one dimension is known
    if (timeVal !== 'unknown' || priceVal !== 'unknown' || expVal !== 'unknown') {
      return Object.freeze({
        isUrgent: timeVal === 'short',
        isPragmatic: priceVal === 'weak',
        isEmotional: priceVal === 'strong' && timeVal === 'short' && expVal === 'low',
        source: 'profiling',
      });
    }
  }

  // Fallback: legacy 4-type personality (compatibility mirror, not authoritative)
  return deriveLegacyPersonalityFallback(caseItem.personality);
}

/**
 * Pure legacy personality mapping — isolated so the gate can recognize
 * this as a compatibility fallback, not a decision branch.
 */
function deriveLegacyPersonalityFallback(personality: Case['personality']): OwnerDecisionProfile {
  return Object.freeze({
    isUrgent: personality === 'urgent',
    isPragmatic: personality === 'pragmatic',
    isEmotional: personality === 'emotional',
    source: 'legacy-personality-fallback',
  });
}

// ---------------------------------------------------------------------------
// OwnerBehaviorDimensions — numeric behavioral scores (0–100)
// ---------------------------------------------------------------------------

export interface OwnerBehaviorDimensions {
  /** How price-sensitive the owner is. Strong anchor → high. */
  readonly priceSensitivity: number;
  /** How sensitive to market heat / competitive pressure. Low experience → high. */
  readonly heatSensitivity: number;
  /** How pressured by time. Short window → high. */
  readonly timePressure: number;
  /** How much urgency bias the owner has. Short window + low experience → high. */
  readonly urgencyBias: number;
  /** How fast trust decays without attention. 0.5 = resilient, 1.5 = fragile. Profiling-derived. */
  readonly trustDecayMultiplier: number;
  /** Trust delta when owner holds price story (refuses to cut). Negative = trust loss. */
  readonly holdStoryTrustDelta: number;
  /** Trust delta on small price cut suggestion. Negative = trust loss. */
  readonly smallCutTrustDelta: number;
  /** Trust delta on deep price cut suggestion. Negative = trust loss, larger magnitude. */
  readonly deepCutTrustDelta: number;
  /** How much the owner leans toward conservative vs aggressive pricing. 0 = aggressive, 100 = conservative. */
  readonly preferredPricingBias: number;
  /** How much communication / reassurance the owner needs. Guided decision → high. */
  readonly communicationNeed: number;
  readonly source: 'profiling' | 'legacy-personality-fallback';
}

// Dimension-to-behavior mapping constants
const DIMENSION_SCORES = {
  price_anchor: { strong: 78, weak: 30, unknown: 50 },
  time_window: { short: 82, long: 28, unknown: 50 },
  transaction_experience: { high: 25, low: 72, unknown: 50 },
  decision_style: { self_decide: 32, guided_or_joint: 75, unknown: 50 },
} as const;

const LEGACY_PERSONALITY_SCORES: Record<string, OwnerBehaviorDimensions> = {
  urgent: Object.freeze({
    priceSensitivity: 55, heatSensitivity: 60, timePressure: 80,
    urgencyBias: 75, trustDecayMultiplier: 1.35,
    holdStoryTrustDelta: -3, smallCutTrustDelta: -1, deepCutTrustDelta: -6,
    preferredPricingBias: 40,
    communicationNeed: 50, source: 'legacy-personality-fallback',
  }),
  pragmatic: Object.freeze({
    priceSensitivity: 72, heatSensitivity: 40, timePressure: 35,
    urgencyBias: 30, trustDecayMultiplier: 0.8,
    holdStoryTrustDelta: -1, smallCutTrustDelta: -2, deepCutTrustDelta: -4,
    preferredPricingBias: 70,
    communicationNeed: 30, source: 'legacy-personality-fallback',
  }),
  emotional: Object.freeze({
    priceSensitivity: 60, heatSensitivity: 75, timePressure: 50,
    urgencyBias: 55, trustDecayMultiplier: 1.25,
    holdStoryTrustDelta: -4, smallCutTrustDelta: -2, deepCutTrustDelta: -8,
    preferredPricingBias: 45,
    communicationNeed: 78, source: 'legacy-personality-fallback',
  }),
  default: Object.freeze({
    priceSensitivity: 50, heatSensitivity: 50, timePressure: 50,
    urgencyBias: 50, trustDecayMultiplier: 1.0,
    holdStoryTrustDelta: -2, smallCutTrustDelta: -1, deepCutTrustDelta: -5,
    preferredPricingBias: 50,
    communicationNeed: 50, source: 'legacy-personality-fallback',
  }),
};

function dimValue(profiling: OwnerProfilingMemorySummary, key: 'price_anchor' | 'time_window' | 'transaction_experience' | 'decision_style'): string {
  return profiling.dimensions.find((d) => d.key === key)?.value ?? 'unknown';
}

function scoreFor(key: keyof typeof DIMENSION_SCORES, value: string): number {
  const map = DIMENSION_SCORES[key];
  return (map as Record<string, number>)[value] ?? 50;
}

/**
 * Derive numeric behavioral dimensions from 16-type profiling.
 * When profiling is not available, falls back to legacy personality scores.
 *
 * Each dimension is a 0–100 score, frozen output, deterministic.
 * B can use these directly in business logic formulas.
 */
export function readOwnerBehaviorDimensions(caseItem: Case): OwnerBehaviorDimensions {
  const profiling = caseItem.ownerProfilingMemory;
  if (profiling && caseItem.hasCompletedFirstVisit) {
    const priceVal = dimValue(profiling, 'price_anchor');
    const timeVal = dimValue(profiling, 'time_window');
    const expVal = dimValue(profiling, 'transaction_experience');
    const decVal = dimValue(profiling, 'decision_style');

    if (priceVal !== 'unknown' || timeVal !== 'unknown' || expVal !== 'unknown' || decVal !== 'unknown') {
      const priceScore = scoreFor('price_anchor', priceVal);
      const timeScore = scoreFor('time_window', timeVal);
      const expScore = scoreFor('transaction_experience', expVal);
      const decScore = scoreFor('decision_style', decVal);

      // urgencyBias: time pressure amplified by inexperience
      const urgencyBias = Math.round(timeScore * 0.6 + expScore * 0.25 + decScore * 0.15);
      // trustDecayMultiplier: 0.5 (resilient) to 1.5 (fragile), derived from profiling
      const rawDecay = (timeScore * 0.4 + priceScore * 0.35 + expScore * 0.25) / 100;
      const trustDecayMultiplier = Math.round((0.5 + rawDecay) * 100) / 100;
      // preferredPricingBias: strong anchor + low experience → conservative (high)
      const preferredPricingBias = Math.round(priceScore * 0.6 + expScore * 0.25 + (100 - decScore) * 0.15);

      // Trust deltas for pricing strategy interactions:
      // Strong anchor + low experience → larger trust loss on price suggestions
      // holdStoryTrustDelta: trust loss when owner refuses to cut (story-based hold)
      const holdStoryTrustDelta = -Math.round(2 + (priceScore / 100) * 2 + (expScore / 100) * 1);
      // smallCutTrustDelta: trust loss on small price cut suggestion
      const smallCutTrustDelta = -Math.round(1 + (priceScore / 100) * 1.5);
      // deepCutTrustDelta: trust loss on deep price cut (2x+ small cut)
      const deepCutTrustDelta = -Math.round(3 + (priceScore / 100) * 3 + (expScore / 100) * 2);

      return Object.freeze({
        priceSensitivity: priceScore,
        heatSensitivity: Math.round((expScore * 0.6 + priceScore * 0.4)),
        timePressure: timeScore,
        urgencyBias,
        trustDecayMultiplier,
        holdStoryTrustDelta,
        smallCutTrustDelta,
        deepCutTrustDelta,
        preferredPricingBias,
        communicationNeed: Math.round((decScore * 0.6 + expScore * 0.4)),
        source: 'profiling',
      });
    }
  }

  // Fallback: legacy personality scores
  return LEGACY_PERSONALITY_SCORES[caseItem.personality ?? 'default']
    ?? LEGACY_PERSONALITY_SCORES.default;
}

