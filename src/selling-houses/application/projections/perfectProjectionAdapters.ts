/**
 * PerfectProjectionAdapters — bridges DecisionEvidenceEnvelope to all seller product surfaces.
 *
 * Architecture position:
 *   DecisionEvidenceEnvelope (from actorKnowledgeProjection)
 *     → PerfectProjectionAdapters
 *       → operatingProjection view models (risk reminders, case detail, today priority)
 *       → followUpPriority view models (owner/competition/closing reasons)
 *       → myWechat view models (message alerts, copy text)
 *       → bigWorldPOV view models (recommended actions)
 *
 * Each adapter:
 *   - Accepts ActorKnowledgeSnapshot + DecisionEvidenceEnvelope as primary input
 *   - Outputs UI-safe view models with safeRefs, replayKey, sourceRecordIds
 *   - Falls back to "证据不足" when no evidence chain exists
 *   - NEVER reads legacy Case/Opportunity fields directly for recommendation text
 *   - May read legacy fields ONLY for numeric display values (e.g. askPrice, trust level)
 *     but never for generating recommendation/reason text
 *
 * Hard constraints:
 *   - No hidden GlobalTruth reads
 *   - No direct mutation
 *   - Deterministic: same inputs → same outputs
 *   - All evidence chains trace to real source records
 */

import type {
  ActorKnowledgeSnapshot,
  DecisionEvidenceEnvelope,
  ExplanationEnvelope,
  PressureSignal,
  VisibleSourceRef,
} from '../../domain/world-model/actorKnowledgeTypes.js';

import type { Case, GameState, Opportunity } from '../../domain/models.js';
import { isCaseActiveByCanonicalStatus } from '../../domain/caseLifecycleStatusRead.js';
import { isOpportunityActiveByCanonicalState } from '../../domain/opportunityLifecycleStatusRead.js';

// ════════════════════════════════════════════════════════════════════════════
// Shared types for evidence-backed view models
// ════════════════════════════════════════════════════════════════════════════

/**
 * Evidence-backed reason: a recommendation/reminder backed by the explanation envelope.
 *
 * Every UI surface that shows a recommendation or reason uses this type.
 * If no evidence exists, `evidenceAvailable` is false and `displayText` shows "证据不足".
 */
export interface EvidenceBackedReason {
  /** Human-readable text for the recommendation/reminder. */
  readonly displayText: string;
  /** Whether there is real evidence behind this text. */
  readonly evidenceAvailable: boolean;
  /** Safe causal refs for UI display. */
  readonly safeRefs: readonly { readonly refType: string; readonly refId: string; readonly refLabel: string }[];
  /** Replay key for deterministic replay. */
  readonly replayKey: string;
  /** Source record IDs that back this reason. */
  readonly sourceRecordIds: readonly string[];
  /** Confidence in this reason (0-1). */
  readonly confidence: number;
  /**
   * Evidence status discriminator.
   *   backed          — full source→belief→pressure→command chain exists
   *   insufficient    — actorKnowledge exists but no recommendation could be formed
   *   legacyFallback  — no actorKnowledge at all; legacy field heuristic used as last resort
   */
  readonly evidenceStatus: 'backed' | 'insufficient' | 'legacyFallback';
  /** Belief source IDs that contributed to this reason (only when backed). */
  readonly beliefSourceIds?: readonly string[];
  /** Pressure signal IDs that contributed to this reason (only when backed). */
  readonly pressureSignalIds?: readonly string[];
}

/**
 * Evidence-backed risk reminder.
 */
export interface EvidenceBackedRiskReminder {
  /** Category of risk. */
  readonly category: 'owner-risk' | 'competition-risk' | 'closing-opportunity' | 'price-risk' | 'customer-risk';
  /** Human-readable reminder text. */
  readonly displayText: string;
  /** Severity: 'critical' | 'warning' | 'info'. */
  readonly severity: 'critical' | 'warning' | 'info';
  /** Evidence backing. */
  readonly evidence: EvidenceBackedReason;
}

/**
 * EvidenceBackedViewModel — base contract for every evidence-backed product surface.
 *
 * Every UI surface that shows a recommendation or reason extends this.
 * If no evidence exists, `evidenceStatus` is 'insufficient' or 'legacyFallback'.
 *
 * This is the Round 10 "Causal Product Everywhere" contract.
 */
export interface EvidenceBackedViewModel {
  /** Which product surface this view model serves. */
  readonly productSurface: string;
  /** Actor who is viewing this surface. */
  readonly actorId: string;
  /** Day the view model was generated. */
  readonly day: number;
  /** Shared causal refs injected from the envelope. */
  readonly sharedCausalRefs: SharedCausalRefs;
  /** Top-level evidence status for this surface. */
  readonly evidenceStatus: 'backed' | 'insufficient' | 'legacyFallback';
  /** All evidence-backed reasons on this surface. */
  readonly reasons: readonly EvidenceBackedReason[];
}

/**
 * Shared causal refs across all product surfaces.
 * Built once from the DecisionEvidenceEnvelope and injected everywhere.
 */
export interface SharedCausalRefs {
  /** All deduplicated safe refs from the envelope. */
  readonly allRefs: readonly { readonly refType: string; readonly refId: string; readonly refLabel: string }[];
  /** Source record IDs from the envelope. */
  readonly sourceRecordIds: readonly string[];
  /** Replay key from the envelope. */
  readonly replayKey: string;
  /** Confidence of the overall evidence chain. */
  readonly overallConfidence: number;
}

/**
 * PerfectOperatingProjection — evidence-backed case detail additions.
 */
export interface PerfectCaseDetailAdditions {
  /** Evidence-backed action reasons (replaces legacy deriveCaseRecommendations text). */
  readonly actionReasons: readonly EvidenceBackedReason[];
  /** Evidence-backed risk reminders. */
  readonly riskReminders: readonly EvidenceBackedRiskReminder[];
  /** Evidence-backed next step recommendation. */
  readonly nextStepReason: EvidenceBackedReason;
  /** Shared causal refs for cross-surface injection. */
  readonly sharedCausalRefs: SharedCausalRefs;
}

/**
 * PerfectFollowUpPriorityItem — evidence-backed priority item.
 */
export interface PerfectFollowUpPriorityItem {
  /** Case ID. */
  readonly caseId: string;
  /** Case title. */
  readonly caseTitle: string;
  /** Priority type. */
  readonly type: 'owner-risk' | 'competition-risk' | 'closing-opportunity';
  /** Score. */
  readonly score: number;
  /** Evidence-backed reason text. */
  readonly reason: EvidenceBackedReason;
  /** Shared causal refs. */
  readonly sharedCausalRefs: SharedCausalRefs;
}

/**
 * PerfectWechatFact — evidence-backed WeChat alert.
 */
export interface PerfectWechatFact {
  /** Fact type for dispatch. */
  readonly factType: string;
  /** Evidence-backed alert text. */
  readonly alertText: EvidenceBackedReason;
  /** Related case ID. */
  readonly caseId: string;
  /** Related case title. */
  readonly caseTitle: string;
  /** Priority weight for sorting. */
  readonly weight: number;
  /** Shared causal refs. */
  readonly sharedCausalRefs: SharedCausalRefs;
}

// ════════════════════════════════════════════════════════════════════════════
// buildSharedCausalRefs — extract shared refs from envelope
// ════════════════════════════════════════════════════════════════════════════

/**
 * Build shared causal refs from the DecisionEvidenceEnvelope.
 * These refs are injected into ALL product surfaces to prove unified world context.
 */
export function buildSharedCausalRefs(
  envelope: DecisionEvidenceEnvelope,
): SharedCausalRefs {
  const seen = new Set<string>();
  const allRefs: { readonly refType: string; readonly refId: string; readonly refLabel: string }[] = [];

  // Extract from causal refs
  for (const ref of envelope.causalRefs) {
    if (!seen.has(ref.refId)) {
      seen.add(ref.refId);
      allRefs.push(ref);
    }
  }

  // Extract from explanation chain
  for (const link of envelope.explanation.chain) {
    for (const id of link.referencedIds) {
      if (!seen.has(id)) {
        seen.add(id);
        allRefs.push({
          refType: 'source-record',
          refId: id,
          refLabel: link.description.slice(0, 50),
        });
      }
    }
  }

  // Extract from recommended command
  if (envelope.recommendedCommand) {
    for (const id of envelope.recommendedCommand.sourceRecordIds) {
      if (!seen.has(id)) {
        seen.add(id);
        allRefs.push({
          refType: 'source-record',
          refId: id,
          refLabel: envelope.recommendedCommand.command.name,
        });
      }
    }
  }

  return {
    allRefs: allRefs.slice(0, 8),
    sourceRecordIds: [...envelope.visibleSourceRefs.map((s) => s.sourceId)].slice(0, 10),
    replayKey: envelope.replayKey,
    overallConfidence: envelope.explanation.confidence,
  };
}

// ════════════════════════════════════════════════════════════════════════════
// buildNoEvidenceReason — fallback when no evidence chain exists
// ════════════════════════════════════════════════════════════════════════════

function buildNoEvidenceReason(replayKey: string): EvidenceBackedReason {
  return {
    displayText: '证据不足',
    evidenceAvailable: false,
    safeRefs: [],
    replayKey,
    sourceRecordIds: [],
    confidence: 0,
    evidenceStatus: 'insufficient',
  };
}

// ════════════════════════════════════════════════════════════════════════════
// buildEvidenceReason — from explanation envelope
// ════════════════════════════════════════════════════════════════════════════

function buildEvidenceReason(
  summary: string,
  explanation: ExplanationEnvelope,
  sharedRefs: SharedCausalRefs,
  pressureSignalIds?: readonly string[],
  beliefSourceIds?: readonly string[],
): EvidenceBackedReason {
  if (!summary || explanation.chain.length === 0) {
    return buildNoEvidenceReason(sharedRefs.replayKey);
  }

  return {
    displayText: summary,
    evidenceAvailable: true,
    safeRefs: explanation.safeRefs.length > 0
      ? explanation.safeRefs
      : sharedRefs.allRefs.slice(0, 3),
    replayKey: sharedRefs.replayKey,
    sourceRecordIds: sharedRefs.sourceRecordIds.slice(0, 5),
    confidence: explanation.confidence,
    evidenceStatus: 'backed',
    beliefSourceIds,
    pressureSignalIds,
  };
}

/**
 * Build a legacy fallback reason — used when no actorKnowledge exists.
 * This must NEVER claim evidence-backed status.
 */
export function buildLegacyFallbackReason(
  displayText: string,
  replayKey: string,
): EvidenceBackedReason {
  return {
    displayText,
    evidenceAvailable: false,
    safeRefs: [],
    replayKey,
    sourceRecordIds: [],
    confidence: 0,
    evidenceStatus: 'legacyFallback',
  };
}

// ════════════════════════════════════════════════════════════════════════════
// buildPerfectCaseDetailAdditions — evidence-backed case detail
// ════════════════════════════════════════════════════════════════════════════

/**
 * Build evidence-backed additions for CaseDetailProjection.
 *
 * This replaces the legacy pattern where operatingProjection reads
 * case.trust / case.patience / case.priceGapPct to generate reason text.
 * Now, reason text comes from the ExplanationEnvelope chain.
 */
export function buildPerfectCaseDetailAdditions(
  knowledge: ActorKnowledgeSnapshot,
  envelope: DecisionEvidenceEnvelope,
  caseItem: Case,
  state: GameState,
): PerfectCaseDetailAdditions {
  const sharedRefs = buildSharedCausalRefs(envelope);
  const explanation = envelope.explanation;

  // Action reasons: from the evidence envelope's explanation chain
  const actionReasons: EvidenceBackedReason[] = [];

  if (envelope.recommendedCommand) {
    actionReasons.push(buildEvidenceReason(
      explanation.summary,
      explanation,
      sharedRefs,
    ));
  }

  // If there are pressure signals, derive additional reasons from them
  for (const signal of envelope.pressureSignals.slice(0, 2)) {
    const signalReason = buildPressureSignalReason(signal, explanation, sharedRefs);
    if (signalReason) {
      actionReasons.push(signalReason);
    }
  }

  // If no evidence at all, show "证据不足"
  if (actionReasons.length === 0) {
    actionReasons.push(buildNoEvidenceReason(sharedRefs.replayKey));
  }

  // Risk reminders: derived from pressure signals, NOT from legacy fields
  const riskReminders = buildRiskRemindersFromPressure(envelope.pressureSignals, sharedRefs);

  // Next step: from recommended command or fallback
  const nextStepReason = envelope.recommendedCommand
    ? buildEvidenceReason(
      `建议动作：${envelope.recommendedCommand.command.name}`,
      explanation,
      sharedRefs,
    )
    : buildNoEvidenceReason(sharedRefs.replayKey);

  return {
    actionReasons: actionReasons.slice(0, 3),
    riskReminders,
    nextStepReason,
    sharedCausalRefs: sharedRefs,
  };
}

// ════════════════════════════════════════════════════════════════════════════
// buildPerfectFollowUpPriorities — evidence-backed priority items
// ════════════════════════════════════════════════════════════════════════════

/**
 * Build evidence-backed follow-up priority items for a specific case.
 *
 * This replaces the legacy pattern where followUpPriority.ts reads
 * case.trust / case.windowDays / case.competitionGroupIds to generate
 * priority text. Now, priority text comes from the evidence envelope.
 */
export function buildPerfectFollowUpPriority(
  knowledge: ActorKnowledgeSnapshot,
  envelope: DecisionEvidenceEnvelope,
  caseItem: Case,
  state: GameState,
): PerfectFollowUpPriorityItem {
  const sharedRefs = buildSharedCausalRefs(envelope);
  const explanation = envelope.explanation;

  // Determine priority type from pressure signals
  const ownerPressure = envelope.pressureSignals.find((s) => s.domain === 'owner_readiness');
  const rivalPressure = envelope.pressureSignals.find((s) => s.domain === 'rival_threat');
  const dealPressure = envelope.pressureSignals.find((s) => s.domain === 'deal_closeability');

  let type: PerfectFollowUpPriorityItem['type'];
  let score: number;
  let reasonText: string;

  if (ownerPressure && ownerPressure.magnitude >= 60) {
    type = 'owner-risk';
    score = ownerPressure.magnitude;
    reasonText = ownerPressure.label;
  } else if (rivalPressure && rivalPressure.magnitude >= 50) {
    type = 'competition-risk';
    score = rivalPressure.magnitude;
    reasonText = rivalPressure.label;
  } else if (dealPressure && dealPressure.magnitude >= 40) {
    type = 'closing-opportunity';
    score = dealPressure.magnitude;
    reasonText = dealPressure.label;
  } else {
    // No strong pressure → low priority with evidence不足
    type = 'owner-risk';
    score = 20;
    reasonText = '当前证据不足以判断优先级';
  }

  const reason = reasonText
    ? buildEvidenceReason(reasonText, explanation, sharedRefs)
    : buildNoEvidenceReason(sharedRefs.replayKey);

  return {
    caseId: caseItem.id,
    caseTitle: caseItem.title,
    type,
    score,
    reason,
    sharedCausalRefs: sharedRefs,
  };
}

// ════════════════════════════════════════════════════════════════════════════
// buildPerfectWechatFacts — evidence-backed WeChat alerts
// ════════════════════════════════════════════════════════════════════════════

/**
 * Build evidence-backed WeChat facts for a case.
 *
 * This replaces the legacy pattern where myWechatFacts.ts reads
 * case.urgency / case.windowDays / case.patience / case.trust to generate
 * alert text. Now, alert text comes from the evidence envelope.
 */
export function buildPerfectWechatFacts(
  knowledge: ActorKnowledgeSnapshot,
  envelope: DecisionEvidenceEnvelope,
  caseItem: Case,
  state: GameState,
): PerfectWechatFact[] {
  const sharedRefs = buildSharedCausalRefs(envelope);
  const explanation = envelope.explanation;
  const facts: PerfectWechatFact[] = [];

  // Derive facts from pressure signals
  for (const signal of envelope.pressureSignals) {
    const factType = pressureSignalToWechatFactType(signal);
    const alertText = signal.label
      ? buildEvidenceReason(signal.label, explanation, sharedRefs)
      : buildNoEvidenceReason(sharedRefs.replayKey);

    facts.push({
      factType,
      alertText,
      caseId: caseItem.id,
      caseTitle: caseItem.title,
      weight: signal.magnitude,
      sharedCausalRefs: sharedRefs,
    });
  }

  // If no pressure signals, produce a "证据不足" fact
  if (facts.length === 0) {
    facts.push({
      factType: 'no_evidence',
      alertText: buildNoEvidenceReason(sharedRefs.replayKey),
      caseId: caseItem.id,
      caseTitle: caseItem.title,
      weight: 0,
      sharedCausalRefs: sharedRefs,
    });
  }

  return facts;
}

// ════════════════════════════════════════════════════════════════════════════
// Helper: buildPressureSignalReason
// ════════════════════════════════════════════════════════════════════════════

function buildPressureSignalReason(
  signal: PressureSignal,
  explanation: ExplanationEnvelope,
  sharedRefs: SharedCausalRefs,
): EvidenceBackedReason | null {
  if (!signal.label || signal.magnitude < 30) return null;

  return {
    displayText: signal.label,
    evidenceAvailable: true,
    safeRefs: sharedRefs.allRefs.slice(0, 2),
    replayKey: sharedRefs.replayKey,
    sourceRecordIds: signal.sourceRecordIds.slice(0, 3),
    confidence: explanation.confidence * (signal.magnitude / 100),
    evidenceStatus: 'backed',
    beliefSourceIds: signal.beliefSourceIds,
    pressureSignalIds: [signal.signalId],
  };
}

// ════════════════════════════════════════════════════════════════════════════
// Helper: buildRiskRemindersFromPressure
// ════════════════════════════════════════════════════════════════════════════

function buildRiskRemindersFromPressure(
  pressureSignals: readonly PressureSignal[],
  sharedRefs: SharedCausalRefs,
): EvidenceBackedRiskReminder[] {
  const reminders: EvidenceBackedRiskReminder[] = [];

  for (const signal of pressureSignals) {
    if (signal.magnitude < 40) continue;

    const severity = signal.magnitude >= 70 ? 'critical' : signal.magnitude >= 50 ? 'warning' : 'info';
    const category = pressureDomainToCategory(signal.domain);

    reminders.push({
      category,
      displayText: signal.label,
      severity,
      evidence: {
        displayText: signal.label,
        evidenceAvailable: true,
        safeRefs: sharedRefs.allRefs.slice(0, 2),
        replayKey: sharedRefs.replayKey,
        sourceRecordIds: signal.sourceRecordIds.slice(0, 3),
        confidence: signal.magnitude / 100,
        evidenceStatus: 'backed',
        beliefSourceIds: signal.beliefSourceIds,
        pressureSignalIds: [signal.signalId],
      },
    });
  }

  return reminders;
}

// ════════════════════════════════════════════════════════════════════════════
// Helper: pressureDomainToCategory
// ════════════════════════════════════════════════════════════════════════════

function pressureDomainToCategory(
  domain: string,
): EvidenceBackedRiskReminder['category'] {
  switch (domain) {
    case 'owner_readiness': return 'owner-risk';
    case 'rival_threat': return 'competition-risk';
    case 'deal_closeability': return 'closing-opportunity';
    case 'price_anchor': return 'price-risk';
    case 'customer_seriousness': return 'customer-risk';
    default: return 'owner-risk';
  }
}

// ════════════════════════════════════════════════════════════════════════════
// Helper: pressureSignalToWechatFactType
// ════════════════════════════════════════════════════════════════════════════

function pressureSignalToWechatFactType(signal: PressureSignal): string {
  switch (signal.domain) {
    case 'owner_readiness': return 'owner_urgent';
    case 'price_anchor': return 'owner_price_doubt';
    case 'customer_seriousness': return 'customer_comparing';
    case 'rival_threat': return 'market_competition_risk';
    case 'broker_trust': return 'owner_trust_drop';
    case 'deal_closeability': return 'closing_opportunity';
    case 'service_path': return 'method_suggestion';
    default: return 'market_demand_change';
  }
}

// ════════════════════════════════════════════════════════════════════════════
// buildPerfectDashboardRiskReminders — evidence-backed dashboard risks
// ════════════════════════════════════════════════════════════════════════════

/**
 * Build evidence-backed risk reminders for the dashboard.
 *
 * This replaces the legacy pattern where buildRiskReminders reads
 * case.trust / case.patience / case.urgency to generate text.
 */
export function buildPerfectDashboardRiskReminders(
  state: GameState,
  caseDetails: Array<{
    caseId: string;
    knowledge: ActorKnowledgeSnapshot;
    envelope: DecisionEvidenceEnvelope;
  }>,
): EvidenceBackedRiskReminder[] {
  const reminders: EvidenceBackedRiskReminder[] = [];

  for (const detail of caseDetails) {
    const caseItem = state.cases.find((c) => c.id === detail.caseId);
    if (!caseItem || !isCaseActiveByCanonicalStatus(state, caseItem)) continue;

    const caseReminders = buildRiskRemindersFromPressure(
      detail.envelope.pressureSignals,
      buildSharedCausalRefs(detail.envelope),
    );

    for (const reminder of caseReminders) {
      reminders.push({
        ...reminder,
        displayText: `${caseItem.title}：${reminder.displayText}`,
      });
    }
  }

  // Sort by severity then magnitude
  return reminders
    .sort((a, b) => {
      const sevOrder = { critical: 0, warning: 1, info: 2 };
      return (sevOrder[a.severity] ?? 3) - (sevOrder[b.severity] ?? 3);
    })
    .slice(0, 5);
}

// ════════════════════════════════════════════════════════════════════════════
// Round 10: Evidence-backed view models for remaining product surfaces
// ════════════════════════════════════════════════════════════════════════════

/**
 * Evidence-backed market radar item.
 * Replaces the legacy pattern where marketIntel.ts reads raw rival listing
 * fields to generate signal text. Now, signal text comes from the evidence chain.
 */
export interface EvidenceBackedMarketRadarItem {
  readonly signalId: string;
  readonly layer: 'macro' | 'district' | 'competition' | 'listing';
  readonly headline: string;
  readonly evidence: EvidenceBackedReason;
  readonly affectedCaseIds: readonly string[];
  readonly sharedCausalRefs: SharedCausalRefs;
}

/**
 * Evidence-backed customer opportunity insight.
 * Replaces the legacy pattern where opportunity view models read
 * opportunity.intent / stageIndex directly to generate reason text.
 */
export interface EvidenceBackedCustomerInsight {
  readonly customerId: string;
  readonly customerName: string;
  readonly caseId: string;
  readonly insightType: 'comparing' | 'at-risk' | 'price-sensitive' | 'ready-to-close';
  readonly headline: string;
  readonly evidence: EvidenceBackedReason;
  readonly sharedCausalRefs: SharedCausalRefs;
}

/**
 * Evidence-backed dashboard today item.
 * Replaces the legacy pattern where dashboard reads case fields
 * to generate today priority text.
 */
export interface EvidenceBackedTodayItem {
  readonly caseId: string;
  readonly caseTitle: string;
  readonly actionLabel: string;
  readonly evidence: EvidenceBackedReason;
  readonly sharedCausalRefs: SharedCausalRefs;
}

/**
 * Evidence-backed owner profiling insight.
 * Replaces the legacy pattern where owner profiling reads
 * owner.typology / trust / patience directly to generate text.
 */
export interface EvidenceBackedOwnerInsight {
  readonly caseId: string;
  readonly ownerName: string;
  readonly insightType: 'price-pressure' | 'trust-drop' | 'patience-drain' | 'readiness';
  readonly headline: string;
  readonly evidence: EvidenceBackedReason;
  readonly sharedCausalRefs: SharedCausalRefs;
}

/**
 * Evidence-backed focus meeting pitch.
 * Replaces the legacy pattern where focus meeting reads
 * case.competitiveness / d1 / d3 to generate pitch text.
 */
export interface EvidenceBackedFocusPitch {
  readonly caseId: string;
  readonly caseTitle: string;
  readonly pitchLabel: string;
  readonly evidence: EvidenceBackedReason;
  readonly sharedCausalRefs: SharedCausalRefs;
}

/**
 * Evidence-backed leaderboard insight.
 * Replaces the legacy pattern where leaderboard reads
 * raw score fields to generate ranking explanation.
 */
export interface EvidenceBackedLeaderboardInsight {
  readonly metricName: string;
  readonly caseId?: string;
  readonly headline: string;
  readonly evidence: EvidenceBackedReason;
  readonly sharedCausalRefs: SharedCausalRefs;
}

// ════════════════════════════════════════════════════════════════════════════
// buildEvidenceBackedMarketRadar
// ════════════════════════════════════════════════════════════════════════════

/**
 * Build evidence-backed market radar items.
 *
 * This replaces the legacy pattern where marketIntel.ts reads
 * marketShadow.rivalListings / marketSignals directly to generate text.
 * Now, signal text comes from the evidence envelope.
 */
export function buildEvidenceBackedMarketRadar(
  knowledge: ActorKnowledgeSnapshot,
  envelope: DecisionEvidenceEnvelope,
  state: GameState,
): EvidenceBackedMarketRadarItem[] {
  const sharedRefs = buildSharedCausalRefs(envelope);
  const items: EvidenceBackedMarketRadarItem[] = [];

  // Derive market signals from pressure signals (rival_threat, market_heat)
  for (const signal of envelope.pressureSignals) {
    if (signal.domain !== 'rival_threat' && signal.domain !== 'market_heat') continue;

    const affectedCases = state.cases
      .filter((c) => isCaseActiveByCanonicalStatus(state, c))
      .filter((c) => c.marketCellId || c.competitionGroupIds.length > 0)
      .slice(0, 3)
      .map((c) => c.id);

    items.push({
      signalId: signal.signalId,
      layer: signal.domain === 'rival_threat' ? 'competition' : 'macro',
      headline: signal.label,
      evidence: buildEvidenceReason(signal.label, envelope.explanation, sharedRefs,
        [signal.signalId], signal.beliefSourceIds),
      affectedCaseIds: affectedCases,
      sharedCausalRefs: sharedRefs,
    });
  }

  // If no pressure signals, produce an "insufficient" item
  if (items.length === 0) {
    items.push({
      signalId: `insufficient-market-${knowledge.day}`,
      layer: 'macro',
      headline: '市场信号证据不足',
      evidence: buildNoEvidenceReason(sharedRefs.replayKey),
      affectedCaseIds: [],
      sharedCausalRefs: sharedRefs,
    });
  }

  return items.slice(0, 5);
}

// ════════════════════════════════════════════════════════════════════════════
// buildEvidenceBackedCustomerInsights
// ════════════════════════════════════════════════════════════════════════════

/**
 * Build evidence-backed customer opportunity insights.
 *
 * This replaces the legacy pattern where opportunity view models read
 * opportunity.intent / stageIndex to generate reason text.
 */
export function buildEvidenceBackedCustomerInsights(
  knowledge: ActorKnowledgeSnapshot,
  envelope: DecisionEvidenceEnvelope,
  caseId: string,
  state: GameState,
): EvidenceBackedCustomerInsight[] {
  const sharedRefs = buildSharedCausalRefs(envelope);
  const insights: EvidenceBackedCustomerInsight[] = [];

  // Derive customer insights from pressure signals (customer_seriousness, deal_closeability)
  for (const signal of envelope.pressureSignals) {
    if (signal.domain !== 'customer_seriousness' && signal.domain !== 'deal_closeability') continue;

    const opps = state.opportunities.filter((o) => o.caseId === caseId && isOpportunityActiveByCanonicalState(state, o));
    const opp = opps[0];
    if (!opp) continue;

    const insightType: EvidenceBackedCustomerInsight['insightType'] =
      signal.domain === 'deal_closeability' ? 'ready-to-close' :
      signal.magnitude >= 60 ? 'comparing' : 'at-risk';

    insights.push({
      customerId: opp.customerId,
      customerName: opp.customerName,
      caseId,
      insightType,
      headline: signal.label,
      evidence: buildEvidenceReason(signal.label, envelope.explanation, sharedRefs,
        [signal.signalId], signal.beliefSourceIds),
      sharedCausalRefs: sharedRefs,
    });
  }

  // If no signals, produce an "insufficient" item
  if (insights.length === 0) {
    const opp = state.opportunities.find((o) => o.caseId === caseId && isOpportunityActiveByCanonicalState(state, o));
    if (opp) {
      insights.push({
        customerId: opp.customerId,
        customerName: opp.customerName,
        caseId,
        insightType: 'comparing',
        headline: '客户意向证据不足',
        evidence: buildNoEvidenceReason(sharedRefs.replayKey),
        sharedCausalRefs: sharedRefs,
      });
    }
  }

  return insights.slice(0, 3);
}

// ════════════════════════════════════════════════════════════════════════════
// buildEvidenceBackedTodayItems
// ════════════════════════════════════════════════════════════════════════════

/**
 * Build evidence-backed dashboard today items.
 *
 * This replaces the legacy pattern where dashboard reads case fields
 * to generate today priority text.
 */
export function buildEvidenceBackedTodayItems(
  state: GameState,
  caseDetails: Array<{
    caseId: string;
    knowledge: ActorKnowledgeSnapshot;
    envelope: DecisionEvidenceEnvelope;
  }>,
): EvidenceBackedTodayItem[] {
  const items: EvidenceBackedTodayItem[] = [];

  for (const detail of caseDetails) {
    const caseItem = state.cases.find((c) => c.id === detail.caseId);
    if (!caseItem || !isCaseActiveByCanonicalStatus(state, caseItem)) continue;

    const sharedRefs = buildSharedCausalRefs(detail.envelope);
    const envelope = detail.envelope;

    if (envelope.recommendedCommand) {
      items.push({
        caseId: caseItem.id,
        caseTitle: caseItem.title,
        actionLabel: envelope.recommendedCommand.command.name,
        evidence: buildEvidenceReason(
          envelope.explanation.summary,
          envelope.explanation,
          sharedRefs,
          envelope.recommendedCommand.pressureSignalIds,
          envelope.recommendedCommand.beliefSourceIds,
        ),
        sharedCausalRefs: sharedRefs,
      });
    } else {
      items.push({
        caseId: caseItem.id,
        caseTitle: caseItem.title,
        actionLabel: '证据不足',
        evidence: buildNoEvidenceReason(sharedRefs.replayKey),
        sharedCausalRefs: sharedRefs,
      });
    }
  }

  return items.slice(0, 5);
}

// ════════════════════════════════════════════════════════════════════════════
// buildEvidenceBackedOwnerInsights
// ════════════════════════════════════════════════════════════════════════════

/**
 * Build evidence-backed owner profiling insights.
 *
 * This replaces the legacy pattern where owner profiling reads
 * owner.typology / trust / patience to generate text.
 */
export function buildEvidenceBackedOwnerInsights(
  knowledge: ActorKnowledgeSnapshot,
  envelope: DecisionEvidenceEnvelope,
  caseItem: Case,
): EvidenceBackedOwnerInsight[] {
  const sharedRefs = buildSharedCausalRefs(envelope);
  const insights: EvidenceBackedOwnerInsight[] = [];

  // Derive owner insights from pressure signals (owner_readiness, price_anchor, broker_trust)
  for (const signal of envelope.pressureSignals) {
    if (signal.domain !== 'owner_readiness' && signal.domain !== 'price_anchor' && signal.domain !== 'broker_trust') continue;

    const insightType: EvidenceBackedOwnerInsight['insightType'] =
      signal.domain === 'broker_trust' ? 'trust-drop' :
      signal.domain === 'price_anchor' ? 'price-pressure' :
      signal.magnitude >= 60 ? 'patience-drain' : 'readiness';

    insights.push({
      caseId: caseItem.id,
      ownerName: caseItem.ownerName,
      insightType,
      headline: signal.label,
      evidence: buildEvidenceReason(signal.label, envelope.explanation, sharedRefs,
        [signal.signalId], signal.beliefSourceIds),
      sharedCausalRefs: sharedRefs,
    });
  }

  // If no signals, produce an "insufficient" item
  if (insights.length === 0) {
    insights.push({
      caseId: caseItem.id,
      ownerName: caseItem.ownerName,
      insightType: 'readiness',
      headline: '业主意向证据不足',
      evidence: buildNoEvidenceReason(sharedRefs.replayKey),
      sharedCausalRefs: sharedRefs,
    });
  }

  return insights.slice(0, 3);
}

// ════════════════════════════════════════════════════════════════════════════
// buildEvidenceBackedFocusPitches
// ════════════════════════════════════════════════════════════════════════════

/**
 * Build evidence-backed focus meeting pitches.
 *
 * This replaces the legacy pattern where focus meeting reads
 * case.competitiveness / d1 / d3 to generate pitch text.
 */
export function buildEvidenceBackedFocusPitches(
  knowledge: ActorKnowledgeSnapshot,
  envelope: DecisionEvidenceEnvelope,
  caseItem: Case,
): EvidenceBackedFocusPitch {
  const sharedRefs = buildSharedCausalRefs(envelope);

  // Find the most relevant pressure signal for the pitch
  const sortedSignals = [...envelope.pressureSignals].sort((a, b) => b.magnitude - a.magnitude);
  const topSignal = sortedSignals[0];

  if (topSignal) {
    return {
      caseId: caseItem.id,
      caseTitle: caseItem.title,
      pitchLabel: topSignal.label,
      evidence: buildEvidenceReason(topSignal.label, envelope.explanation, sharedRefs,
        [topSignal.signalId], topSignal.beliefSourceIds),
      sharedCausalRefs: sharedRefs,
    };
  }

  return {
    caseId: caseItem.id,
    caseTitle: caseItem.title,
    pitchLabel: '聚焦会推荐证据不足',
    evidence: buildNoEvidenceReason(sharedRefs.replayKey),
    sharedCausalRefs: sharedRefs,
  };
}

// ════════════════════════════════════════════════════════════════════════════
// buildEvidenceBackedLeaderboardInsights
// ════════════════════════════════════════════════════════════════════════════

/**
 * Build evidence-backed leaderboard insights.
 *
 * This replaces the legacy pattern where leaderboard reads
 * raw score fields to generate ranking explanation.
 */
export function buildEvidenceBackedLeaderboardInsights(
  knowledge: ActorKnowledgeSnapshot,
  envelope: DecisionEvidenceEnvelope,
  metricName: string,
  caseId?: string,
): EvidenceBackedLeaderboardInsight {
  const sharedRefs = buildSharedCausalRefs(envelope);

  // Find the most relevant pressure signal
  const topSignal = envelope.pressureSignals[0];

  if (topSignal) {
    return {
      metricName,
      caseId,
      headline: topSignal.label,
      evidence: buildEvidenceReason(topSignal.label, envelope.explanation, sharedRefs,
        [topSignal.signalId], topSignal.beliefSourceIds),
      sharedCausalRefs: sharedRefs,
    };
  }

  return {
    metricName,
    caseId,
    headline: '排行判断证据不足',
    evidence: buildNoEvidenceReason(sharedRefs.replayKey),
    sharedCausalRefs: sharedRefs,
  };
}
