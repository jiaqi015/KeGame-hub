import type { Case } from '../../domain/models.js';
import type { OwnerProfilingTone } from '../../domain/ownerProfilingMemoryTypes.js';
import { buildOwnerProfilingMemorySummary } from './ownerProfilingMemory.js';
import type { OwnerProfileProjection } from '../../core/world-state/relationReadProjection.js';
import { readOwnerProfile } from '../../core/world-state/relationReadProjection.js';

export type OwnerPersonaTone = OwnerProfilingTone;

export interface OwnerPersonaProfile {
  isRevealed: boolean;
  /** Authoritative label from 16-type profiling. */
  label: string;
  tone: OwnerPersonaTone;
  communicationLabel: string;
  priceLabel: string;
  paceLabel: string;
  /** Legacy 4-type personality — compatibility mirror only. */
  legacyPersonality: Case['personality'];
  /** Whether this profile was derived from profiling memory vs fallback. */
  source: 'profiling-memory' | 'derived-from-signals' | 'legacy-fallback';
}

/**
 * Build owner persona profile using relation projection boundary.
 *
 * 16-type profiling is the authoritative owner type source.
 * 4-type `personality` is a legacy compatibility mirror.
 * When profiling memory is missing but hasCompletedFirstVisit is true,
 * we derive from signals (ownerProfilingMemory.ts) as a bridge — not from personality.
 */
export function buildOwnerPersonaProfile(caseItem: Case): OwnerPersonaProfile {
  const projection = readOwnerProfile(caseItem);

  if (!projection.isRevealed) {
    return Object.freeze({
      isRevealed: false,
      label: '待面访分型',
      tone: 'neutral',
      communicationLabel: '首次面访后可见',
      priceLabel: '价格边界待确认',
      paceLabel: '节奏待确认',
      legacyPersonality: projection.legacyPersonality,
      source: 'legacy-fallback',
    });
  }

  // Authoritative path: derive from profiling memory or signals
  const profiling = projection.profiling ?? buildOwnerProfilingMemorySummary(caseItem);
  const source: OwnerPersonaProfile['source'] = projection.profiling
    ? 'profiling-memory'
    : 'derived-from-signals';

  const priceAnchor = profiling.dimensions.find((d) => d.key === 'price_anchor')?.valueLabel || '价格待确认';
  const timeWindow = profiling.dimensions.find((d) => d.key === 'time_window')?.valueLabel || '节奏待确认';
  const decisionStyle = profiling.dimensions.find((d) => d.key === 'decision_style')?.valueLabel || '决策待确认';

  return Object.freeze({
    isRevealed: true,
    label: profiling.ownerTypeName,
    tone: profiling.ownerTypeTone,
    communicationLabel: profiling.serviceStrategy.communicationStyle,
    priceLabel: priceAnchor,
    paceLabel: `${timeWindow} · ${decisionStyle}`,
    legacyPersonality: projection.legacyPersonality,
    source,
  });
}
