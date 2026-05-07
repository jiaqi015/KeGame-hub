/**
 * Canonical content hash for NarrativeSignalPack.
 *
 * Mother model alignment:
 * - Section 18.10: "LLM output cannot be hidden randomness inside core simulation.
 *   For replay, store action commands, seeds/RNG counters, model versions, and any
 *   LLM-derived structured outputs used by simulation."
 *
 * This helper computes a deterministic content-based hash from a NarrativeSignalPack.
 * It is the single authority for packHash computation.
 *
 * Hard constraints:
 * 1. Pure function in core — no domain/runtime imports.
 * 2. No Date.now, no Math.random, no crypto, no global state.
 * 3. Deterministic: same pack content → same hash.
 * 4. Different pack content → different hash (high probability).
 * 5. Hash is NOT packId — it's a content summary.
 */

import type { NarrativeSignalPack } from './models.js';

// ---------------------------------------------------------------------------
// Stable hash helper (djb2 variant)
// ---------------------------------------------------------------------------

function stableHash(input: string): string {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return `phash:${Math.abs(hash).toString(36)}`;
}

// ---------------------------------------------------------------------------
// buildNarrativeSignalPackContentHash: single authority for packHash
// ---------------------------------------------------------------------------

/**
 * Computes a deterministic content-based hash from a NarrativeSignalPack.
 *
 * Hash input covers:
 * - day
 * - generatedForActorId / generatedForActorKind
 * - sourceRefs: sourceType/sourceId/summary
 * - actorVisibleSignals: signalId/signalKind/label/severity/caseId/day/evidenceRefs
 * - pressureHighlights: highlightId/caseId/pressureKind/headline/magnitude/source
 * - consensusMovement: movementId/caseId/opportunityId/fromStage/toStage/direction/reason
 * - beliefConflicts: conflictId/actorId/conflictKind/description/severity
 * - timelineAnchors: day/label/anchorType/caseId
 * - generationConstraints: key boolean fields
 *
 * @param pack - The NarrativeSignalPack to hash
 * @returns A deterministic content-based hash string (format: "phash:...")
 */
export function buildNarrativeSignalPackContentHash(pack: NarrativeSignalPack): string {
  const parts: string[] = [];

  // Core identity
  parts.push(`day=${pack.day}`);
  parts.push(`actor=${pack.generatedForActorId}`);
  parts.push(`actorKind=${pack.generatedForActorKind}`);

  // Source refs
  for (const ref of pack.sourceRefs) {
    parts.push(`src:${ref.sourceType}:${ref.sourceId}:${ref.summary}`);
  }

  // Actor visible signals (most important for content differentiation)
  for (const signal of pack.actorVisibleSignals) {
    const evidenceCount = signal.evidenceRefs.length;
    parts.push(`sig:${signal.signalId}:${signal.signalKind}:${signal.label}:${signal.severity}:${signal.caseId ?? ''}:${signal.day}:${evidenceCount}`);
  }

  // Pressure highlights
  for (const highlight of pack.pressureHighlights) {
    parts.push(`ph:${highlight.highlightId}:${highlight.caseId}:${highlight.pressureKind}:${highlight.headline}:${highlight.magnitude}:${highlight.source}`);
  }

  // Consensus movement
  for (const movement of pack.consensusMovement) {
    parts.push(`cm:${movement.movementId}:${movement.caseId}:${movement.opportunityId}:${movement.fromStage}:${movement.toStage}:${movement.direction}:${movement.reason}`);
  }

  // Belief conflicts
  for (const conflict of pack.beliefConflicts) {
    parts.push(`bc:${conflict.conflictId}:${conflict.actorId}:${conflict.conflictKind}:${conflict.description}:${conflict.severity}`);
  }

  // Timeline anchors
  for (const anchor of pack.timelineAnchors) {
    parts.push(`ta:${anchor.day}:${anchor.label}:${anchor.anchorType}:${anchor.caseId ?? ''}`);
  }

  // Generation constraints (key booleans)
  const gc = pack.generationConstraints;
  parts.push(`gc:${gc.visibleScope}:${gc.requiredEvidenceForFacts}:${gc.canMentionHiddenOpportunities}:${gc.canMentionCompanyPressure}:${gc.canMentionD4Internals}`);

  return stableHash(parts.join('|'));
}
