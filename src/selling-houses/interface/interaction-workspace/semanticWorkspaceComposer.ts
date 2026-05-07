/**
 * Semantic Workspace Composer v0 — safe composition from semantic receipts.
 *
 * Bridges DailyTickResult.semanticReceipts into SemanticWorkspaceProjection
 * without reading raw GameState fields.
 *
 * Hard constraints:
 * 1. Only reads: result.day, result.semanticReceipts (or state.day, state.lastDailyTickResult?.semanticReceipts).
 * 2. NEVER reads: state.cases, state.opportunities, state.customers, state.eventStore, state.eventLog, state.rngState.
 * 3. Output is SemanticWorkspaceProjection via semanticReceiptBoundary builder.
 * 4. LLM remains disabled/futureReady. No provider/API/fetch/OpenAI.
 * 5. Pure read-only, no mutation.
 */

import type { DailyTickResult, GameState } from '../../domain/models.js';
import type { DailySemanticReceiptBundle } from '../../core/world-state/semantic-receipt/models.js';
import {
  buildSemanticWorkspaceProjection,
  buildEmptySemanticWorkspaceProjection,
  type SemanticWorkspaceInput,
  type SemanticWorkspaceProjection,
  type SemanticSceneInput,
  type SemanticNarrativePackInput,
  type SemanticPressureInput,
  type SemanticConsensusInput,
  type SemanticEvidenceRefInput,
} from './semanticReceiptBoundary.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildSceneInputsFromReceipt(
  receipt: DailySemanticReceiptBundle,
): readonly SemanticSceneInput[] {
  const scenes: SemanticSceneInput[] = [];
  const isSummary = receipt.interactionScenes;

  for (let i = 0; i < isSummary.sceneCount; i++) {
    scenes.push({
      sceneId: isSummary.sceneIds[i] ?? `scene-${i}`,
      sceneType: isSummary.sceneTypes[i] ?? 'unknown',
      caseId: isSummary.caseIds[i] || undefined,
      povActorId: isSummary.primaryActorIds[i] ?? 'unknown',
      evidenceRefCount: 0,
      resultingEventRefCount: 0,
      commitmentRefCount: 0,
      hasServiceInteraction: isSummary.hasServiceInteractionFlags[i] ?? false,
    });
  }

  return scenes;
}

function buildNarrativePackInputFromReceipt(
  receipt: DailySemanticReceiptBundle,
): SemanticNarrativePackInput | undefined {
  const nsp = receipt.narrativeSignalPack;
  if (!nsp || nsp.signalCount === 0) return undefined;

  return {
    packId: nsp.packId,
    packHash: nsp.packHash,
    sourceRefCount: nsp.sourceRefCount,
    evidenceRefCount: nsp.evidenceRefCount,
    timelineAnchorCount: nsp.timelineAnchorCount,
    actorVisibleSignalCount: nsp.signalCount,
    generationConstraints: {
      requiredEvidenceForFacts: true,
      visibleScope: 'full',
      canMentionHiddenOpportunities: false,
      canMentionCompanyPressure: false,
      canMentionD4Internals: false,
      forbiddenTopicCount: 3,
    },
  };
}

// ---------------------------------------------------------------------------
// Pressure / Consensus helpers
// ---------------------------------------------------------------------------

function buildPressureInputFromReceipt(
  receipt: DailySemanticReceiptBundle,
): SemanticPressureInput {
  const pr = receipt.pressureReceipts;
  return {
    available: pr.available,
    snapshotCount: pr.snapshotCount,
    decisionDeltaCount: pr.decisionDeltaCount,
    inputCount: pr.inputCount,
    day: pr.day,
  };
}

function buildConsensusInputFromReceipt(
  receipt: DailySemanticReceiptBundle,
): SemanticConsensusInput {
  const cr = receipt.consensusReceipts;
  return {
    available: cr.available,
    formationCount: cr.formationCount,
    signedCount: cr.signedCount,
    collapsedCount: cr.collapsedCount,
    blockedCount: cr.blockedCount,
    stillPendingCount: cr.stillPendingCount,
    day: cr.day,
  };
}

function buildEvidenceRefsFromReceipt(
  receipt: DailySemanticReceiptBundle,
): readonly SemanticEvidenceRefInput[] {
  const refs: SemanticEvidenceRefInput[] = [];
  const day = receipt.day;

  // Pressure receipt ref
  refs.push({
    sourceType: 'pressure_receipt',
    sourceId: `pressure-receipt:d${day}`,
    day,
    available: receipt.pressureReceipts.available,
    summary: receipt.pressureReceipts.available
      ? `${receipt.pressureReceipts.snapshotCount} snapshots, ${receipt.pressureReceipts.decisionDeltaCount} deltas`
      : 'No pressure data',
    count: receipt.pressureReceipts.snapshotCount,
  });

  // Consensus receipt ref
  refs.push({
    sourceType: 'consensus_receipt',
    sourceId: `consensus-receipt:d${day}`,
    day,
    available: receipt.consensusReceipts.available,
    summary: receipt.consensusReceipts.available
      ? `${receipt.consensusReceipts.formationCount} formations, ${receipt.consensusReceipts.signedCount} signed`
      : 'No consensus data',
    count: receipt.consensusReceipts.formationCount,
  });

  // Narrative signal pack ref
  const nsp = receipt.narrativeSignalPack;
  refs.push({
    sourceType: 'narrative_signal_pack',
    sourceId: `narrative-pack:d${day}`,
    day,
    available: nsp.signalCount > 0,
    summary: nsp.signalCount > 0
      ? `${nsp.signalCount} signals, ${nsp.evidenceRefCount} evidence refs`
      : 'No narrative signal pack',
    count: nsp.signalCount,
  });

  return refs;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Builds SemanticWorkspaceProjection from a DailyTickResult.
 * Only reads result.day and result.semanticReceipts.
 * Falls back to empty projection if semanticReceipts is absent.
 */
export function buildSemanticWorkspaceProjectionFromDailyTickResult(
  result: DailyTickResult,
): SemanticWorkspaceProjection {
  const receipt = result.semanticReceipts;
  if (!receipt) {
    return buildEmptySemanticWorkspaceProjection(result.day);
  }

  const input: SemanticWorkspaceInput = {
    day: receipt.day ?? result.day,
    scenes: buildSceneInputsFromReceipt(receipt),
    narrativePack: buildNarrativePackInputFromReceipt(receipt),
    pressure: buildPressureInputFromReceipt(receipt),
    consensus: buildConsensusInputFromReceipt(receipt),
    evidenceRefs: buildEvidenceRefsFromReceipt(receipt),
  };

  return buildSemanticWorkspaceProjection(input);
}

/**
 * Builds SemanticWorkspaceProjection from a GameState.
 * Only reads state.day and state.lastDailyTickResult?.semanticReceipts.
 * NEVER reads: state.cases, opportunities, customers, eventStore, eventLog, rngState.
 * Falls back to empty projection if lastDailyTickResult or semanticReceipts is absent.
 */
export function buildSemanticWorkspaceProjectionFromState(
  state: GameState,
): SemanticWorkspaceProjection {
  const result = state.lastDailyTickResult;
  if (!result) {
    return buildEmptySemanticWorkspaceProjection(state.day);
  }
  return buildSemanticWorkspaceProjectionFromDailyTickResult(result);
}
