/**
 * LLM Input Pack Adapter — compresses runtime context into LLM-ready packs.
 *
 * Lives in runtime/ because it reads DecisionSupportContext (runtime type)
 * and BrokerPOVSnapshot (produced by runtime adapter).
 * Produces core/llm-boundary types (read-only input packs).
 *
 * Pure read-only adapter. Does NOT mutate GameState.
 * Does NOT expose raw GameState to LLM.
 * Does NOT call LLM.
 *
 * Mother model alignment:
 * - Section 7: "LLM should not read raw GameState or invent events."
 * - Section 10: "LLM sees compressed POV, not full GlobalTruth."
 */

import type {
  DecisionSupportContext,
  DecisionSupportSignal,
} from '../decision-support/types.js';
import type {
  BrokerPOVSnapshot,
  CasePOVContext,
} from '../../core/decision/models.js';
import type {
  NarrativeGenerationInputPack,
  DialogueGenerationInputPack,
  StrategyRecommendationInputPack,
  SimulatedReasoningInputPack,
} from '../../core/llm-boundary/inputPacks.js';
import type { NarrativeSignalPack } from '../../core/narrative/models.js';
import { buildNarrativeSignalPackContentHash } from '../../core/narrative/packHash.js';
import type { LlmInputPackRef } from '../../core/llm-boundary/models.js';
import type { ActionDefinition } from '../../domain/models.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function freezeArray<T>(items: readonly T[]): readonly T[] {
  return Object.freeze([...items]) as readonly T[];
}

// ---------------------------------------------------------------------------
// NarrativeGenerationInputPack builder
// ---------------------------------------------------------------------------

/**
 * Builds a NarrativeGenerationInputPack from DecisionSupportContext.
 *
 * Compresses domain events + evaluation snapshots into a narrative-ready
 * context. Does NOT include raw GameState.
 */
export function buildNarrativeInputPack(
  context: DecisionSupportContext,
  povActorId: string = 'broker:current',
  povActorKind: 'broker' | 'owner' | 'customer' | 'manager' = 'broker',
  narrativeFocus: NarrativeGenerationInputPack['narrativeFocus'] = 'daily_summary',
): NarrativeGenerationInputPack {
  const urgentSignals = context.cases.flatMap((c) =>
    c.signals.filter((s) => s.severity === 'urgent'),
  );

  return Object.freeze({
    kind: 'narrative_generation',
    day: context.generatedAtDay,
    eventSummaries: freezeArray(
      context.cases.flatMap((c) =>
        c.signals.map((s) => Object.freeze({
          kind: s.kind,
          label: s.label,
          tone: s.severity === 'urgent' ? 'danger' as const : 'neutral' as const,
          caseId: c.caseId,
        })),
      ),
    ),
    evaluationSnapshotIds: freezeArray(
      context.cases.map((c) => c.assetScore.modelId),
    ),
    povActorId,
    povActorKind,
    dayContext: Object.freeze({
      activeCaseCount: context.cases.length,
      urgentSignalCount: urgentSignals.length,
      recentDecisionCount: context.cases.reduce(
        (sum, c) => sum + c.decisionMoments.length, 0,
      ),
    }),
    narrativeFocus,
  }) as NarrativeGenerationInputPack;
}

// ---------------------------------------------------------------------------
// DialogueGenerationInputPack builder
// ---------------------------------------------------------------------------

/**
 * Builds a DialogueGenerationInputPack from a case context and scene metadata.
 *
 * Compresses actor beliefs and knowledge into a dialogue-ready context.
 * Does NOT include hidden opportunities or customer identities.
 */
export function buildDialogueInputPack(
  caseCtx: DecisionSupportContext['cases'][number],
  sceneType: DialogueGenerationInputPack['scene']['sceneType'],
  speakerActorId: string,
  speakerActorKind: 'broker' | 'owner' | 'customer' | 'manager',
  listenerActorId: string,
  listenerActorKind: 'broker' | 'owner' | 'customer' | 'manager',
  day: number,
): DialogueGenerationInputPack {
  const urgentCount = caseCtx.signals.filter((s) => s.severity === 'urgent').length;

  return Object.freeze({
    kind: 'dialogue_generation',
    day,
    scene: Object.freeze({
      sceneId: `scene:${caseCtx.caseId}:${sceneType}:${day}`,
      sceneType,
      caseId: caseCtx.caseId,
    }),
    speaker: Object.freeze({
      actorId: speakerActorId,
      actorKind: speakerActorKind,
      beliefKeys: freezeArray(['market_heat', 'price_anchor', 'broker_trust']),
      knownFactKeys: freezeArray(
        caseCtx.signals.map((s) => s.id).slice(0, 5),
      ),
    }),
    listener: Object.freeze({
      actorId: listenerActorId,
      actorKind: listenerActorKind,
      inferredBeliefKeys: freezeArray(['seller_sincerity', 'market_heat']),
    }),
    speakerDecisionPosture: urgentCount > 0 ? 'leaning_toward' : 'undecided',
    activeCommitmentSummary: freezeArray([]),
    dialogueConstraints: freezeArray(
      listenerActorKind === 'owner'
        ? ['不暴露客户隐私', '不暴露公司内部压力', '不暴露竞争细节']
        : [],
    ),
  }) as DialogueGenerationInputPack;
}

// ---------------------------------------------------------------------------
// StrategyRecommendationInputPack builder
// ---------------------------------------------------------------------------

/**
 * Builds a StrategyRecommendationInputPack from BrokerPOVSnapshot.
 *
 * Compresses case summaries, action availability, and resource constraints
 * into a strategy-ready context. Does NOT include raw GameState.
 */
export function buildStrategyInputPack(
  pov: BrokerPOVSnapshot,
  allowedActions: readonly ActionDefinition[],
): StrategyRecommendationInputPack {
  const caseSummary = pov.cases.map((c) =>
    Object.freeze({
      caseId: c.caseId,
      competitiveness: c.assetScore.score,
      d1: c.assetScore.d1,
      d2: c.assetScore.d2,
      d3: c.assetScore.d3,
      ownerReadiness: c.ownerReadiness.score,
      signalCount: c.signals.length,
      urgentSignalCount: c.signals.filter((s) => s.severity === 'urgent').length,
      topBlockers: freezeArray(c.assetScore.blockers.slice(0, 3)),
      waitingPosture: c.waitingState?.posture ?? 'not_waiting',
    }),
  );

  const allowed = allowedActions.map((a) =>
    Object.freeze({
      actionId: a.id,
      label: a.name,
      energyCost: a.costEnergy,
      promotionBudgetCost: a.costPromotionBudget,
      enabled: true,
    }),
  );

  return Object.freeze({
    kind: 'strategy_recommendation',
    day: pov.day,
    actorId: pov.actorId,
    caseSummary: freezeArray(caseSummary),
    allowedActions: freezeArray(allowed),
    resources: Object.freeze({
      energy: pov.energy,
      maxEnergy: 100,
      promotionBudget: pov.promotionBudget,
    }),
    pressureSummary: Object.freeze({
      available: pov.pressureSummary.available,
      coverage: pov.pressureSummary.coverage,
      headline: pov.pressureSummary.headline,
    }),
    activeDecisionMoments: freezeArray(
      pov.decisionMoments.map((dm) => dm.label),
    ),
  }) as StrategyRecommendationInputPack;
}

// ---------------------------------------------------------------------------
// SimulatedReasoningInputPack builder
// ---------------------------------------------------------------------------

/**
 * Builds a SimulatedReasoningInputPack from a case's POV context.
 *
 * Compresses decision state, choice set, commitments, and beliefs
 * into a reasoning-ready context. Does NOT include raw GameState.
 */
export function buildSimulatedReasoningInputPack(
  casePOV: CasePOVContext,
  actorId: string,
  actorKind: 'broker' | 'owner' | 'customer' | 'manager',
  allowedActionIds: readonly string[],
  pressureCoverage: number,
  day: number,
): SimulatedReasoningInputPack {
  return Object.freeze({
    kind: 'simulated_reasoning',
    day,
    caseId: casePOV.caseId,
    actorId,
    actorKind,
    decisionState: Object.freeze({
      posture: casePOV.decisionState.posture,
      pressureLevel: casePOV.decisionState.pressureLevel,
      confidence: casePOV.decisionState.confidence,
      blockers: freezeArray(casePOV.decisionState.blockers),
    }),
    choiceSet: Object.freeze({
      alternativeCount: casePOV.choiceSet.alternatives.length,
      feasibleCount: casePOV.choiceSet.feasibleCount,
      blockingConstraintCount: casePOV.choiceSet.constraints.filter((c) => c.blocking).length,
      alternatives: freezeArray(
        casePOV.choiceSet.alternatives.map((a) =>
          Object.freeze({
            id: a.id,
            label: a.label,
            attractiveness: a.attractiveness,
            feasible: a.feasible,
          }),
        ),
      ),
    }),
    commitmentSummary: Object.freeze({
      // commitment-status-read: not case/opportunity lifecycle
      activeCount: casePOV.commitmentStates.filter((c) => c.status === 'active').length,
      staleCount: casePOV.commitmentStates.filter((c) => c.status === 'stale').length,
      strongestCommitmentLabel: casePOV.commitmentStates
        .slice()
        .sort((a, b) => b.strength - a.strength)[0]?.label,
    }),
    beliefs: freezeArray(
      casePOV.knowledge.beliefs.map((b) =>
        Object.freeze({
          kind: b.kind,
          label: b.label,
          value: b.value,
          confidence: b.confidence,
          direction: b.direction,
        }),
      ),
    ),
    waitingPosture: casePOV.waitingState
      ? Object.freeze({
        posture: casePOV.waitingState.posture,
        reason: casePOV.waitingState.reason,
        accumulatedPressure: casePOV.waitingState.accumulatedPressure,
      })
      : undefined,
    availableActionIds: freezeArray(allowedActionIds),
    pressureSummary: Object.freeze({
      available: pressureCoverage > 0,
      coverage: pressureCoverage,
    }),
  }) as SimulatedReasoningInputPack;
}

// ---------------------------------------------------------------------------
// NarrativeSignalPack → NarrativeGenerationInputPack bridge
// ---------------------------------------------------------------------------

/**
 * Builds a NarrativeGenerationInputPack from a NarrativeSignalPack.
 *
 * This bridges the richer signal pack (from runtime/narrative-support)
 * to the compressed LLM-ready input pack. The signal pack is the source
 * of truth; the input pack is what LLM actually reads.
 *
 * Pure function. No side effects.
 */
export function buildNarrativeGenerationInputPackFromSignalPack(
  pack: NarrativeSignalPack,
  narrativeFocus: NarrativeGenerationInputPack['narrativeFocus'] = 'daily_summary',
): NarrativeGenerationInputPack {
  return Object.freeze({
    kind: 'narrative_generation',
    day: pack.day,
    eventSummaries: freezeArray(
      pack.sourceRefs
        .filter((r) => r.sourceType === 'event')
        .map((r) => Object.freeze({
          kind: r.sourceId.split(':')[0] ?? 'unknown',
          label: r.summary,
          tone: 'neutral' as const,
        })),
    ),
    evaluationSnapshotIds: freezeArray(
      pack.sourceRefs
        .filter((r) => r.sourceType === 'evaluation_snapshot')
        .map((r) => r.sourceId),
    ),
    povActorId: pack.generatedForActorId,
    povActorKind: pack.generatedForActorKind,
    dayContext: Object.freeze({
      activeCaseCount: pack.actorVisibleSignals
        .map((s) => s.caseId)
        .filter((v, i, a) => a.indexOf(v) === i)
        .filter(Boolean).length,
      urgentSignalCount: pack.actorVisibleSignals
        .filter((s) => s.severity === 'urgent').length,
      recentDecisionCount: pack.timelineAnchors
        .filter((a) => a.anchorType === 'decision').length,
    }),
    narrativeFocus,
  }) as NarrativeGenerationInputPack;
}

/**
 * Builds an LlmInputPackRef from a NarrativeSignalPack.
 *
 * This is the reference that LLM output proposals cite as their source.
 * Contains pack hash for replay and source IDs.
 *
 * Pure function. No side effects.
 */
export function buildLlmInputPackRefFromSignalPack(
  pack: NarrativeSignalPack,
): LlmInputPackRef {
  const snapshotIds = pack.sourceRefs
    .filter((r) => r.sourceType === 'evaluation_snapshot')
    .map((r) => r.sourceId);
  const receiptIds = [
    ...pack.sourceRefs.filter((r) => r.sourceType === 'pressure_receipt').map((r) => r.sourceId),
    ...pack.sourceRefs.filter((r) => r.sourceType === 'consensus_receipt').map((r) => r.sourceId),
  ];

  const summaryParts: string[] = [];
  if (pack.actorVisibleSignals.length > 0) summaryParts.push(`${pack.actorVisibleSignals.length} signals`);
  if (pack.beliefConflicts.length > 0) summaryParts.push(`${pack.beliefConflicts.length} belief conflicts`);
  if (pack.pressureHighlights.length > 0) summaryParts.push(`${pack.pressureHighlights.length} pressure highlights`);
  if (pack.consensusMovement.length > 0) summaryParts.push(`${pack.consensusMovement.length} consensus movements`);

  const packHash = buildNarrativeSignalPackContentHash(pack);

  return Object.freeze({
    packKind: 'narrative_signal_pack',
    packHash,
    packedAtDay: pack.day,
    sourceSnapshotIds: freezeArray(snapshotIds),
    sourceReceiptIds: freezeArray(receiptIds),
    summary: summaryParts.length > 0
      ? `NarrativeSignalPack: ${summaryParts.join(', ')}`
      : 'NarrativeSignalPack: no signals',
  }) as LlmInputPackRef;
}

// ---------------------------------------------------------------------------
// buildDisabledLlmState — no-LLM fallback
// ---------------------------------------------------------------------------

/**
 * Builds a disabled LLM state. When no LLM is configured, this returns
 * empty advisory data that does not affect UI, engine, or tests.
 *
 * Pure function. No side effects.
 */
export function buildDisabledLlmState(): {
  readonly enabled: false;
  readonly reason: string;
  readonly narrativePack: null;
  readonly strategyPack: null;
  readonly reasoningPack: null;
} {
  return Object.freeze({
    enabled: false as const,
    reason: 'LLM 未配置或已禁用',
    narrativePack: null,
    strategyPack: null,
    reasoningPack: null,
  });
}

/**
 * Checks if the LLM state is disabled.
 */
export function isLlmStateDisabled(
  state: { readonly enabled: boolean },
): state is { readonly enabled: false; readonly reason: string } {
  return !state.enabled;
}
