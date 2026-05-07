/**
 * DailySemanticReceiptBundle — read-only semantic receipt summaries.
 *
 * Mother model alignment:
 * - Section 7: "DomainEvents + EvaluationSnapshots + ProcessReceipts + POVSnapshot
 *   -> NarrativeSignalPack -> LLM text generation"
 * - Section 18.10: "LLM output cannot be hidden randomness inside core simulation."
 *
 * These types are pure type definitions in core. They do NOT import domain/runtime.
 *
 * Builder placement:
 * - `buildEmptySemanticReceipt(day)` lives HERE in core — the single authority
 *   for empty bundles, importable by domain without crossing into runtime.
 * - Rich builders (`buildDailySemanticReceipt`, etc.) live in
 *   runtime/simulation/dailySemanticReceipt.ts and re-export the empty builder.
 */

// ---------------------------------------------------------------------------
// InteractionSceneReceiptSummary
// ---------------------------------------------------------------------------

export interface InteractionSceneReceiptSummary {
  readonly sceneCount: number;
  readonly sceneIds: readonly string[];
  readonly sceneTypes: readonly string[];
  /** Per-scene case id at the same index as sceneIds; empty string means no case. */
  readonly caseIds: readonly string[];
  readonly primaryActorIds: readonly string[];
  /** @deprecated Use hasServiceInteractionFlags for per-scene precision. */
  readonly hasServiceInteractionCount: number;
  /** Per-scene boolean: true if the scene at this index has a service interaction. */
  readonly hasServiceInteractionFlags: readonly boolean[];
}

// ---------------------------------------------------------------------------
// NarrativeSignalPackReceiptSummary
// ---------------------------------------------------------------------------

export interface NarrativeSignalPackReceiptSummary {
  readonly packId: string;
  readonly packHash: string;
  readonly sourceRefCount: number;
  readonly evidenceRefCount: number;
  readonly signalCount: number;
  readonly timelineAnchorCount: number;
  readonly actorId: string;
  readonly actorKind: string;
}

// ---------------------------------------------------------------------------
// PressureReceiptSummaryRef
// ---------------------------------------------------------------------------

export interface PressureReceiptSummaryRef {
  readonly available: boolean;
  readonly snapshotCount: number;
  readonly decisionDeltaCount: number;
  readonly inputCount: number;
  readonly day: number;
}

// ---------------------------------------------------------------------------
// ConsensusReceiptSummaryRef
// ---------------------------------------------------------------------------

export interface ConsensusReceiptSummaryRef {
  readonly available: boolean;
  readonly formationCount: number;
  readonly signedCount: number;
  readonly collapsedCount: number;
  readonly blockedCount: number;
  readonly stillPendingCount: number;
  readonly day: number;
}

// ---------------------------------------------------------------------------
// DailySemanticReceiptBundle
// ---------------------------------------------------------------------------

export interface DailySemanticReceiptBundle {
  readonly day: number;
  readonly interactionScenes: InteractionSceneReceiptSummary;
  readonly narrativeSignalPack: NarrativeSignalPackReceiptSummary;
  readonly pressureReceipts: PressureReceiptSummaryRef;
  readonly consensusReceipts: ConsensusReceiptSummaryRef;
  /** Whether the pack is ready for future LLM use (does NOT mean LLM was called). */
  readonly llmReady: boolean;
  /** Lightweight daily decision bridge summary (optional, added by runtime adapter). */
  readonly dailyDecisionBridge?: import('./dailyDecisionBridge.js').DailyDecisionBridgeSummary;
}

// ---------------------------------------------------------------------------
// buildEmptySemanticReceipt: minimal core builder for domain import
// ---------------------------------------------------------------------------

/**
 * Builds an empty DailySemanticReceiptBundle for a given day.
 * Pure function in core so that domain can import without crossing into runtime.
 * Used as fallback when no other semantic receipt data is available.
 */
export function buildEmptySemanticReceipt(day: number): DailySemanticReceiptBundle {
  return Object.freeze({
    day,
    interactionScenes: Object.freeze({
      sceneCount: 0,
      sceneIds: Object.freeze([]),
      sceneTypes: Object.freeze([]),
      caseIds: Object.freeze([]),
      primaryActorIds: Object.freeze([]),
      hasServiceInteractionCount: 0,
      hasServiceInteractionFlags: Object.freeze([]),
    }),
    narrativeSignalPack: Object.freeze({
      packId: `narrative-pack:none:d${day}`,
      packHash: 'none',
      sourceRefCount: 0,
      evidenceRefCount: 0,
      signalCount: 0,
      timelineAnchorCount: 0,
      actorId: 'none',
      actorKind: 'broker',
    }),
    pressureReceipts: Object.freeze({
      available: false,
      snapshotCount: 0,
      decisionDeltaCount: 0,
      inputCount: 0,
      day,
    }),
    consensusReceipts: Object.freeze({
      available: false,
      formationCount: 0,
      signedCount: 0,
      collapsedCount: 0,
      blockedCount: 0,
      stillPendingCount: 0,
      day,
    }),
    llmReady: false,
  });
}

// ---------------------------------------------------------------------------
// Live semantic receipt input shapes (plain objects, no domain import)
// ---------------------------------------------------------------------------

export interface LivePressureReceiptInput {
  readonly snapshotCount: number;
  readonly decisionDeltaCount: number;
  readonly inputCount: number;
  readonly day: number;
}

export interface LiveConsensusReceiptInput {
  readonly formationCount: number;
  readonly signedCount: number;
  readonly collapsedCount: number;
  readonly blockedCount: number;
  readonly stillPendingCount: number;
  readonly day: number;
}

export interface LiveSemanticReceiptInput {
  readonly day: number;
  readonly pressureReceipts?: LivePressureReceiptInput;
  readonly consensusReceipts?: LiveConsensusReceiptInput;
}

// ---------------------------------------------------------------------------
// buildLiveSemanticReceipt: core builder with live data
// ---------------------------------------------------------------------------

/**
 * Builds a DailySemanticReceiptBundle with live pressure and consensus data.
 * Pure function in core so that domain can import without crossing into runtime.
 * InteractionScene and NarrativeSignalPack remain empty in v1.
 */
export function buildLiveSemanticReceipt(input: LiveSemanticReceiptInput): DailySemanticReceiptBundle {
  const empty = buildEmptySemanticReceipt(input.day);

  const pressureReceipts: PressureReceiptSummaryRef = input.pressureReceipts
    ? Object.freeze({
        available: true,
        snapshotCount: input.pressureReceipts.snapshotCount,
        decisionDeltaCount: input.pressureReceipts.decisionDeltaCount,
        inputCount: input.pressureReceipts.inputCount,
        day: input.pressureReceipts.day,
      })
    : empty.pressureReceipts;

  const consensusReceipts: ConsensusReceiptSummaryRef = input.consensusReceipts
    ? Object.freeze({
        available: input.consensusReceipts.formationCount > 0,
        formationCount: input.consensusReceipts.formationCount,
        signedCount: input.consensusReceipts.signedCount,
        collapsedCount: input.consensusReceipts.collapsedCount,
        blockedCount: input.consensusReceipts.blockedCount,
        stillPendingCount: input.consensusReceipts.stillPendingCount,
        day: input.consensusReceipts.day,
      })
    : empty.consensusReceipts;

  return Object.freeze({
    day: input.day,
    interactionScenes: empty.interactionScenes,
    narrativeSignalPack: empty.narrativeSignalPack,
    pressureReceipts,
    consensusReceipts,
    llmReady: false,
  });
}
