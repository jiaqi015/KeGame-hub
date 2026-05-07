/**
 * Semantic Receipt Enrichment Bridge v0.
 *
 * Runtime layer bridge that enriches DailyTickResult with InteractionScene
 * and NarrativeSignalPack summaries. Does NOT modify domain engine, gameplay,
 * RNG, tick order, or UI.
 *
 * Mother model alignment:
 * - Section 7: "DomainEvents + EvaluationSnapshots + ProcessReceipts + POVSnapshot
 *   -> NarrativeSignalPack -> LLM text generation"
 * - Section 18.10: "LLM output cannot be hidden randomness inside core simulation."
 * - Section 20.7: "LLM should not read raw GameState. Use deterministic signal extractor first."
 *
 * Hard constraints:
 * 1. Does NOT mutate original DailyTickResult — returns frozen copy.
 * 2. Does NOT modify domain engine behavior.
 * 3. Does NOT affect gameplay, RNG, tick order, or UI.
 * 4. Deterministic: no Date.now, no Math.random.
 * 5. Pure function — no side effects.
 * 6. runtime/simulation can import core (allowed).
 */

import type {
  DailyTickResult,
} from '../../domain/models.js';

import type {
  InteractionScene,
} from '../../core/world-state/interactions/models.js';

import type {
  NarrativeSignalPack,
} from '../../core/narrative/models.js';

import type {
  DailySemanticReceiptBundle,
} from '../../core/world-state/semantic-receipt/models.js';

import {
  buildEmptySemanticReceipt,
} from '../../core/world-state/semantic-receipt/models.js';

import type {
  DailyDecisionBridgeSummary,
} from '../../core/world-state/semantic-receipt/dailyDecisionBridge.js';

import {
  buildEmptyDailyDecisionBridgeSummary,
} from '../../core/world-state/semantic-receipt/dailyDecisionBridge.js';

import {
  buildNarrativeSignalPackContentHash,
} from '../../core/narrative/packHash.js';

import {
  buildDailyDecisionBridgeFromGameState,
} from './dailyDecisionBridgeAdapter.js';

import type {
  GameState,
} from '../../domain/models.js';

// ---------------------------------------------------------------------------
// Enrichment input shapes
// ---------------------------------------------------------------------------

export interface SemanticReceiptEnrichmentInput {
  /** The original DailyTickResult from domain engine. */
  readonly originalResult: DailyTickResult;
  /** Optional InteractionScene[] to enrich with. */
  readonly interactionScenes?: readonly InteractionScene[];
  /** Optional NarrativeSignalPack to enrich with. */
  readonly narrativeSignalPack?: NarrativeSignalPack;
  /** Optional DailyDecisionBridgeSummary to enrich with. */
  readonly dailyDecisionBridge?: DailyDecisionBridgeSummary;
}

// ---------------------------------------------------------------------------
// InteractionScene summary builder
// ---------------------------------------------------------------------------

function buildInteractionSceneSummary(
  scenes: readonly InteractionScene[],
): DailySemanticReceiptBundle['interactionScenes'] {
  const sceneIds: string[] = [];
  const sceneTypes: string[] = [];
  const caseIds: string[] = [];
  const primaryActorIds: string[] = [];
  const hasServiceInteractionFlags: boolean[] = [];
  let hasServiceInteractionCount = 0;

  for (const scene of scenes) {
    sceneIds.push(scene.sceneId);
    sceneTypes.push(scene.sceneType);
    caseIds.push(scene.caseId ?? '');
    primaryActorIds.push(scene.primaryActorId);
    const hasInteraction = !!scene.serviceInteraction;
    hasServiceInteractionFlags.push(hasInteraction);
    if (hasInteraction) hasServiceInteractionCount++;
  }

  return Object.freeze({
    sceneCount: scenes.length,
    sceneIds: Object.freeze([...sceneIds]),
    sceneTypes: Object.freeze([...sceneTypes]),
    caseIds: Object.freeze([...caseIds]),
    primaryActorIds: Object.freeze([...primaryActorIds]),
    hasServiceInteractionCount,
    hasServiceInteractionFlags: Object.freeze([...hasServiceInteractionFlags]),
  });
}

// ---------------------------------------------------------------------------
// NarrativeSignalPack summary builder
// ---------------------------------------------------------------------------

function buildNarrativeSignalPackSummary(
  pack: NarrativeSignalPack | undefined,
  day: number,
): DailySemanticReceiptBundle['narrativeSignalPack'] {
  if (!pack) {
    return Object.freeze({
      packId: `narrative-pack:none:d${day}`,
      packHash: 'none',
      sourceRefCount: 0,
      evidenceRefCount: 0,
      signalCount: 0,
      timelineAnchorCount: 0,
      actorId: 'none',
      actorKind: 'broker',
    });
  }

  const sourceRefCount = (pack.actorVisibleSignals ?? []).length;
  const evidenceRefCount = (pack.actorVisibleSignals ?? []).reduce(
    (sum, s) => sum + (s.evidenceRefs ?? []).length,
    0,
  );

  const packHash = buildNarrativeSignalPackContentHash(pack);

  return Object.freeze({
    packId: pack.packId ?? `narrative-pack:d${day}`,
    packHash,
    sourceRefCount,
    evidenceRefCount,
    signalCount: sourceRefCount,
    timelineAnchorCount: (pack.timelineAnchors ?? []).length,
    actorId: pack.generatedForActorId ?? 'unknown',
    actorKind: pack.generatedForActorKind ?? 'broker',
  });
}

// ---------------------------------------------------------------------------
// Public API: enrichDailyTickResultWithSemanticReceipts
// ---------------------------------------------------------------------------

/**
 * Enriches a DailyTickResult with InteractionScene and NarrativeSignalPack summaries.
 *
 * Returns a frozen copy of the original result with enriched semanticReceipts.
 * Does NOT mutate the original result.
 * Does NOT modify domain engine behavior.
 * Does NOT affect gameplay, RNG, tick order, or UI.
 *
 * @param input - The enrichment input containing original result and optional enrichments
 * @returns A frozen copy of DailyTickResult with enriched semanticReceipts
 */
export function enrichDailyTickResultWithSemanticReceipts(
  input: SemanticReceiptEnrichmentInput,
): DailyTickResult {
  const { originalResult, interactionScenes, narrativeSignalPack } = input;
  const day = originalResult.day;

  // Build or preserve existing semantic receipts
  const existingSemantic = originalResult.semanticReceipts;
  const baseSemantic = existingSemantic ?? buildEmptySemanticReceipt(day);

  // Build enriched summaries
  const enrichedInteractionScenes = interactionScenes
    ? buildInteractionSceneSummary(interactionScenes)
    : baseSemantic.interactionScenes;

  const enrichedNarrativeSignalPack = narrativeSignalPack
    ? buildNarrativeSignalPackSummary(narrativeSignalPack, day)
    : baseSemantic.narrativeSignalPack;

  // Determine llmReady: true when both scenes and pack have data
  const llmReady = enrichedInteractionScenes.sceneCount > 0
    && enrichedNarrativeSignalPack.signalCount > 0;

  // Build enriched semantic receipt bundle
  const enrichedSemantic: DailySemanticReceiptBundle = Object.freeze({
    day,
    interactionScenes: enrichedInteractionScenes,
    narrativeSignalPack: enrichedNarrativeSignalPack,
    pressureReceipts: baseSemantic.pressureReceipts,
    consensusReceipts: baseSemantic.consensusReceipts,
    llmReady,
    dailyDecisionBridge: input.dailyDecisionBridge ?? baseSemantic.dailyDecisionBridge,
  });

  // Return frozen copy of original result with enriched semantic receipts
  return Object.freeze({
    ...originalResult,
    semanticReceipts: enrichedSemantic,
  });
}

// ---------------------------------------------------------------------------
// Public API: enrichDailyTickResultWithInteractionScenes
// ---------------------------------------------------------------------------

/**
 * Convenience: enriches a DailyTickResult with InteractionScene summaries only.
 * NarrativeSignalPack remains as-is (empty if not already present).
 */
export function enrichDailyTickResultWithInteractionScenes(
  originalResult: DailyTickResult,
  interactionScenes: readonly InteractionScene[],
): DailyTickResult {
  return enrichDailyTickResultWithSemanticReceipts({
    originalResult,
    interactionScenes,
  });
}

// ---------------------------------------------------------------------------
// Public API: enrichDailyTickResultWithNarrativeSignalPack
// ---------------------------------------------------------------------------

/**
 * Convenience: enriches a DailyTickResult with NarrativeSignalPack summary only.
 * InteractionScenes remains as-is (empty if not already present).
 */
export function enrichDailyTickResultWithNarrativeSignalPack(
  originalResult: DailyTickResult,
  narrativeSignalPack: NarrativeSignalPack,
): DailyTickResult {
  return enrichDailyTickResultWithSemanticReceipts({
    originalResult,
    narrativeSignalPack,
  });
}

// ---------------------------------------------------------------------------
// Public API: enrichDailyTickResultWithDailyDecisionBridge
// ---------------------------------------------------------------------------

/**
 * Convenience: enriches a DailyTickResult with DailyDecisionBridgeSummary only.
 * InteractionScenes and NarrativeSignalPack remain as-is.
 */
export function enrichDailyTickResultWithDailyDecisionBridge(
  originalResult: DailyTickResult,
  dailyDecisionBridge: DailyDecisionBridgeSummary,
): DailyTickResult {
  return enrichDailyTickResultWithSemanticReceipts({
    originalResult,
    dailyDecisionBridge,
  });
}

// ---------------------------------------------------------------------------
// Public API: enrichSemanticReceiptWithDecisionBridge
// ---------------------------------------------------------------------------

/**
 * Builds a DailyDecisionBridgeSummary from GameState and attaches it
 * to an existing DailySemanticReceiptBundle.
 *
 * This is the narrow runtime hook that engine.ts calls after building
 * the base semantic receipt. It reads GameState only through the
 * established decision-support adapter boundary, not raw fields.
 *
 * Does NOT mutate the original receipt — returns a frozen copy.
 * Does NOT alter gameplay, RNG, tick order, or UI.
 * Deterministic: same state → same bridge.
 *
 * @param state - GameState (read-only through adapter boundary)
 * @param baseReceipt - existing DailySemanticReceiptBundle to enrich
 * @returns frozen copy of baseReceipt with dailyDecisionBridge attached
 */
export function enrichSemanticReceiptWithDecisionBridge(
  state: GameState,
  baseReceipt: DailySemanticReceiptBundle,
): DailySemanticReceiptBundle {
  const bridge = buildDailyDecisionBridgeFromGameState(state);

  return Object.freeze({
    ...baseReceipt,
    dailyDecisionBridge: bridge,
  });
}
