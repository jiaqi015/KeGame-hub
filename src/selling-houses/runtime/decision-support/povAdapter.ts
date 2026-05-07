/**
 * POV adapter — derives BrokerPOVSnapshot and OwnerPOVSnapshot from
 * existing DecisionSupportContext, evaluation snapshots, and pressure receipts.
 *
 * Lives in runtime/ because it reads DecisionSupportContext (runtime type).
 * Produces core/decision types (read-only projections).
 *
 * Pure read-only projections. Does NOT mutate GameState.
 * Does NOT execute actions. Does NOT call LLM.
 *
 * Mother model alignment:
 * - Section 1.1: POV reads the world, ActionCommand expresses intent
 * - Section 5: Human Decision Model input/output
 * - Section 9: POV shape (visibleFacts, hiddenOrUnknownFacts, inferredSignals, signalSources)
 */

import type {
  DecisionSupportContext,
  DecisionSupportRecommendationDraft,
  DecisionSupportSignal,
} from './types.js';
import type {
  AssetScoreSnapshot,
  D4ReceiptCoverageReport,
  OwnerDecisionReadinessSnapshot,
} from '../../core/evaluation/models.js';
import type {
  ActionCommandDraft,
  ActorBelief,
  ActorKnowledge,
  AlternativeSet,
  BeliefConflict,
  BeliefConflictKind,
  BeliefConfidence,
  BeliefKind,
  BrokerPOVSnapshot,
  CasePOVContext,
  ChoiceConstraint,
  CommitmentInferredFrom,
  CommitmentOwnerKind,
  CommitmentScope,
  CommitmentState,
  CommitmentStatus,
  CommitmentStrength,
  CommitmentTrace,
  DecisionCommitment,
  DecisionAlternative,
  DecisionMoment,
  DecisionState,
  NoDecisionReadModel,
  OwnerPOVContext,
  OwnerPOVSnapshot,
  PressureReceiptSummary,
  PressureSourceSummary,
  SignalSource,
  SignalTrace,
  SignalTraceSource,
  WaitingState,
} from '../../core/decision/models.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function freezeArray<T>(items: readonly T[]): readonly T[] {
  return Object.freeze([...items]) as readonly T[];
}

function signalSourceFromModelId(modelId: string): SignalSource {
  if (modelId.includes('owner-decision-readiness')) return 'observed';
  if (modelId.includes('asset-score')) return 'inferred';
  if (modelId.includes('opportunity-score')) return 'observed';
  if (modelId.includes('region-open-day-fit')) return 'systemic';
  return 'inferred';
}

// ---------------------------------------------------------------------------
// ActorBelief / SignalTrace builders
// ---------------------------------------------------------------------------

function buildBeliefConfidenceLevel(confidence: number): BeliefConfidence {
  if (confidence >= 0.9) return 'certain';
  if (confidence >= 0.7) return 'confident';
  if (confidence >= 0.4) return 'uncertain';
  return 'speculative';
}

function buildTracesFromFacts(facts: readonly { key: string; label: string; source: SignalSource; confidence: number; asOfDay: number }[]): readonly SignalTrace[] {
  return facts.map((fact) =>
    Object.freeze({
      id: `trace:${fact.key}`,
      source: fact.source as SignalTraceSource,
      originKey: fact.key,
      originLabel: fact.label,
      receivedDay: fact.asOfDay,
      sourceCredibility: fact.confidence,
    }) as SignalTrace,
  );
}

function buildBrokerBeliefs(
  assetScore: AssetScoreSnapshot,
  ownerReadiness: OwnerDecisionReadinessSnapshot,
  day: number,
): readonly ActorBelief[] {
  const beliefs: ActorBelief[] = [];

  // market_heat belief from D1 and heat
  const heatConfidence = assetScore.confidence * 0.9;
  beliefs.push(Object.freeze({
    id: 'belief:market_heat',
    kind: 'market_heat' as BeliefKind,
    label: '市场热度判断',
    value: assetScore.dimensions.d1.score >= 60 ? '市场较热' : assetScore.dimensions.d1.score >= 40 ? '市场一般' : '市场较冷',
    confidence: heatConfidence,
    confidenceLevel: buildBeliefConfidenceLevel(heatConfidence),
    direction: assetScore.dimensions.d1.score >= 50 ? 'positive' : 'negative',
    supportingTraceIds: freezeArray(['trace:d1', 'trace:competitiveness']),
    lastUpdatedDay: day,
    stale: false,
  }) as ActorBelief);

  // broker_trust belief from owner trust
  const trustConfidence = ownerReadiness.confidence * 0.85;
  beliefs.push(Object.freeze({
    id: 'belief:broker_trust',
    kind: 'broker_trust' as BeliefKind,
    label: '业主对经纪人信任度判断',
    value: ownerReadiness.dimensions.trust.score >= 60 ? '信任度较好' : ownerReadiness.dimensions.trust.score >= 40 ? '信任度一般' : '信任度较低',
    confidence: trustConfidence,
    confidenceLevel: buildBeliefConfidenceLevel(trustConfidence),
    direction: ownerReadiness.dimensions.trust.score >= 50 ? 'positive' : 'negative',
    supportingTraceIds: freezeArray(['trace:trust']),
    lastUpdatedDay: day,
    stale: false,
  }) as ActorBelief);

  // price_anchor belief from price gap (computed from askPrice and marketPrice)
  const askPrice = assetScore.inputs.askPrice ?? 0;
  const marketPrice = assetScore.inputs.marketPrice ?? 1;
  const priceGapPct = marketPrice > 0 ? ((askPrice - marketPrice) / marketPrice) * 100 : 0;
  const priceConfidence = assetScore.confidence * 0.8;
  beliefs.push(Object.freeze({
    id: 'belief:price_anchor',
    kind: 'price_anchor' as BeliefKind,
    label: '价格锚点判断',
    value: priceGapPct <= 3 ? '价格合理' : priceGapPct <= 8 ? '价格偏高' : '价格明显偏高',
    confidence: priceConfidence,
    confidenceLevel: buildBeliefConfidenceLevel(priceConfidence),
    direction: priceGapPct <= 5 ? 'neutral' : 'negative',
    supportingTraceIds: freezeArray(['trace:competitiveness']),
    lastUpdatedDay: day,
    stale: false,
  }) as ActorBelief);

  // service_path_confidence from D4 if available
  if (assetScore.dimensions.d4) {
    const spConfidence = 0.75 * 0.9;
    beliefs.push(Object.freeze({
      id: 'belief:service_path_confidence',
      kind: 'service_path_confidence' as BeliefKind,
      label: '服务路径信心',
      value: assetScore.dimensions.d4.score >= 60 ? '服务路径畅通' : assetScore.dimensions.d4.score >= 40 ? '服务路径一般' : '服务路径受阻',
      confidence: spConfidence,
      confidenceLevel: buildBeliefConfidenceLevel(spConfidence),
      direction: assetScore.dimensions.d4.score >= 50 ? 'positive' : 'negative',
      supportingTraceIds: freezeArray(['trace:d4']),
      lastUpdatedDay: day,
      stale: false,
    }) as ActorBelief);
  }

  // buyer_seriousness from late stage opportunities
  const lateStageCount = assetScore.inputs.lateStageOpportunityCount;
  if (lateStageCount > 0) {
    const buyerConf = Math.min(0.85, 0.5 + lateStageCount * 0.1);
    beliefs.push(Object.freeze({
      id: 'belief:buyer_seriousness',
      kind: 'buyer_seriousness' as BeliefKind,
      label: '买家认真度判断',
      value: lateStageCount >= 2 ? '有认真买家' : '有潜在买家',
      confidence: buyerConf,
      confidenceLevel: buildBeliefConfidenceLevel(buyerConf),
      direction: 'positive',
      supportingTraceIds: freezeArray(['trace:owner-readiness']),
      lastUpdatedDay: day,
      stale: false,
    }) as ActorBelief);
  }

  return freezeArray(beliefs);
}

function buildOwnerBeliefs(
  assetScore: AssetScoreSnapshot,
  ownerReadiness: OwnerDecisionReadinessSnapshot,
  day: number,
): readonly ActorBelief[] {
  const beliefs: ActorBelief[] = [];

  // Owner can form: price_anchor, broker_trust, market_heat, seller_sincerity

  // price_anchor — owner's own view of their price
  const ownerAskPrice = assetScore.inputs.askPrice ?? 0;
  const ownerMarketPrice = assetScore.inputs.marketPrice ?? 1;
  const ownerPriceGapPct = ownerMarketPrice > 0 ? ((ownerAskPrice - ownerMarketPrice) / ownerMarketPrice) * 100 : 0;
  beliefs.push(Object.freeze({
    id: 'belief:owner_price_anchor',
    kind: 'price_anchor' as BeliefKind,
    label: '我的房源价格判断',
    value: ownerPriceGapPct <= 3 ? '定价合理' : '可能需要调整',
    confidence: 0.7,
    confidenceLevel: 'confident',
    direction: ownerPriceGapPct <= 5 ? 'neutral' : 'negative',
    supportingTraceIds: freezeArray(['trace:d2']),
    lastUpdatedDay: day,
    stale: false,
  }) as ActorBelief);

  // broker_trust — owner's own trust feeling
  beliefs.push(Object.freeze({
    id: 'belief:owner_broker_trust',
    kind: 'broker_trust' as BeliefKind,
    label: '对经纪人的信任感受',
    value: ownerReadiness.dimensions.trust.score >= 60 ? '信任经纪人' : '需要更多沟通',
    confidence: 0.85,
    confidenceLevel: 'confident',
    direction: ownerReadiness.dimensions.trust.score >= 50 ? 'positive' : 'negative',
    supportingTraceIds: freezeArray(['trace:trust']),
    lastUpdatedDay: day,
    stale: false,
  }) as ActorBelief);

  // market_heat — owner's perception
  beliefs.push(Object.freeze({
    id: 'belief:owner_market_heat',
    kind: 'market_heat' as BeliefKind,
    label: '市场热度感受',
    value: assetScore.dimensions.d1.score >= 60 ? '市场活跃' : '市场一般',
    confidence: 0.6,
    confidenceLevel: 'uncertain',
    direction: assetScore.dimensions.d1.score >= 50 ? 'positive' : 'neutral',
    supportingTraceIds: freezeArray(['trace:d1']),
    lastUpdatedDay: day,
    stale: false,
  }) as ActorBelief);

  // seller_sincerity — owner's own sincerity (self-assessment)
  beliefs.push(Object.freeze({
    id: 'belief:owner_seller_sincerity',
    kind: 'seller_sincerity' as BeliefKind,
    label: '自己的卖房诚意',
    value: ownerReadiness.dimensions.urgency.score >= 50 ? '确实想卖' : '还在考虑',
    confidence: 0.9,
    confidenceLevel: 'certain',
    direction: ownerReadiness.dimensions.urgency.score >= 50 ? 'positive' : 'neutral',
    supportingTraceIds: freezeArray(['trace:urgency']),
    lastUpdatedDay: day,
    stale: false,
  }) as ActorBelief);

  return freezeArray(beliefs);
}

function buildBeliefConflicts(
  beliefs: readonly ActorBelief[],
  assetScore: AssetScoreSnapshot,
): readonly BeliefConflict[] {
  const conflicts: BeliefConflict[] = [];

  // Check for stale beliefs
  for (const belief of beliefs) {
    if (belief.stale) {
      conflicts.push(Object.freeze({
        id: `conflict:stale:${belief.id}`,
        kind: 'stale_belief' as BeliefConflictKind,
        description: `${belief.label} 可能已过时`,
        beliefIds: freezeArray([belief.id]),
        severity: 'low',
        decisionImpact: '可能需要更新信息再做决策',
      }) as BeliefConflict);
    }
  }

  // Check for low confidence interpretations
  const lowConfidenceBeliefs = beliefs.filter((b) => b.confidence < 0.5);
  if (lowConfidenceBeliefs.length > 0) {
    conflicts.push(Object.freeze({
      id: 'conflict:low-confidence',
      kind: 'low_confidence_interpretation' as BeliefConflictKind,
      description: `${lowConfidenceBeliefs.length} 个信念置信度较低`,
      beliefIds: freezeArray(lowConfidenceBeliefs.map((b) => b.id)),
      severity: 'medium',
      decisionImpact: '建议收集更多信息再决策',
    }) as BeliefConflict);
  }

  // Check for belief vs fact: price anchor vs market reality
  const priceBelief = beliefs.find((b) => b.kind === 'price_anchor');
  if (priceBelief && priceBelief.direction === 'negative' && assetScore.dimensions.d2.score >= 70) {
    conflicts.push(Object.freeze({
      id: 'conflict:price-vs-quality',
      kind: 'belief_vs_fact' as BeliefConflictKind,
      description: '价格判断与资产质量存在矛盾',
      beliefIds: freezeArray([priceBelief.id]),
      severity: 'medium' as const,
      decisionImpact: '资产质量好但定价偏高，需要价格调整沟通',
    }) as BeliefConflict);
  }

  return freezeArray(conflicts);
}

function buildGlobalKnowledge(
  visibleFacts: readonly { key: string; label: string; value: string | number | boolean; source: SignalSource; confidence: number; asOfDay: number }[],
  hiddenGlobalFacts: readonly { key: string; reason: string }[],
): ActorKnowledge {
  return Object.freeze({
    visibleFacts: freezeArray(visibleFacts),
    inferredSignals: freezeArray([]),
    hiddenGlobalFacts: freezeArray(hiddenGlobalFacts),
    traces: buildTracesFromFacts(visibleFacts),
    beliefs: freezeArray([]),
    beliefConflicts: freezeArray([]),
  });
}

function mapCommitmentStrength(strength: number, status: CommitmentStatus): CommitmentStrength {
  if (status === 'revoked') return 'revoked';
  if (status === 'stale') return 'expired';
  if (strength >= 75) return 'strong';
  if (strength >= 45) return 'tentative';
  return 'conditional';
}

function mapCommitmentRole(owner: CommitmentOwnerKind): DecisionCommitment['actorRole'] {
  if (owner === 'owner') return 'owner';
  if (owner === 'customer') return 'customer';
  return 'broker';
}

function buildDecisionCommitmentsFromStates(
  states: readonly CommitmentState[],
): readonly DecisionCommitment[] {
  return freezeArray(states.map((state) =>
    Object.freeze({
      id: `decision:${state.id}`,
      actorRole: mapCommitmentRole(state.owner),
      description: state.label,
      strength: mapCommitmentStrength(state.strength, state.status),
      scope: `${state.caseId}:${state.scope}`,
      createdDay: state.createdDay,
      expiresAtDay: state.expiryDay,
      revocable: state.revocable,
    }) as DecisionCommitment,
  ));
}

// ---------------------------------------------------------------------------
// ActorKnowledge builders
// ---------------------------------------------------------------------------

function buildBrokerCaseKnowledge(
  assetScore: AssetScoreSnapshot,
  ownerReadiness: OwnerDecisionReadinessSnapshot,
  signalCount: number,
): ActorKnowledge {
  const day = assetScore.day;
  const facts = [
    { key: 'competitiveness', label: '房源竞争力', value: assetScore.score, source: 'inferred' as SignalSource, confidence: assetScore.confidence, asOfDay: day },
    { key: 'd1', label: '需求动量', value: assetScore.dimensions.d1.score, source: 'inferred' as SignalSource, confidence: assetScore.confidence, asOfDay: day },
    { key: 'd2', label: '资产质量', value: assetScore.dimensions.d2.score, source: 'inferred' as SignalSource, confidence: assetScore.confidence, asOfDay: day },
    { key: 'd3', label: '成交条件', value: assetScore.dimensions.d3.score, source: 'inferred' as SignalSource, confidence: assetScore.confidence, asOfDay: day },
    { key: 'owner-readiness', label: '业主配合度', value: ownerReadiness.score, source: 'observed' as SignalSource, confidence: ownerReadiness.confidence, asOfDay: day },
    { key: 'trust', label: '信任', value: ownerReadiness.dimensions.trust.score, source: 'observed' as SignalSource, confidence: ownerReadiness.confidence, asOfDay: day },
    { key: 'urgency', label: '紧迫度', value: ownerReadiness.dimensions.urgency.score, source: 'observed' as SignalSource, confidence: ownerReadiness.confidence, asOfDay: day },
  ];

  if (assetScore.dimensions.d4) {
    facts.push({
      key: 'd4', label: '竞争与服务路径', value: assetScore.dimensions.d4.score,
      source: 'systemic' as SignalSource, confidence: 0.75, asOfDay: day,
    });
  }

  const inferred = [
    ...assetScore.blockers.map((b) => ({
      key: `blocker:${b}`, label: b, direction: 'negative' as const, strength: 70,
      source: 'inferred' as SignalSource, basedOn: freezeArray(['competitiveness', 'd1', 'd2', 'd3']),
    })),
    ...assetScore.topDrivers.map((d) => ({
      key: `driver:${d.label}`, label: d.label,
      direction: (d.contribution === 'positive' ? 'positive' : d.contribution === 'negative' ? 'negative' : 'neutral') as 'positive' | 'negative' | 'neutral',
      strength: typeof d.value === 'number' ? d.value : 50,
      source: 'inferred' as SignalSource, basedOn: freezeArray(['competitiveness']),
    })),
  ];

  const hidden = signalCount === 0
    ? [{ key: 'pressure-detail', reason: '无压力信号数据' }]
    : [];

  const traces = buildTracesFromFacts(facts);
  const beliefs = buildBrokerBeliefs(assetScore, ownerReadiness, day);
  const beliefConflicts = buildBeliefConflicts(beliefs, assetScore);

  return Object.freeze({
    visibleFacts: freezeArray(facts),
    inferredSignals: freezeArray(inferred),
    hiddenGlobalFacts: freezeArray(hidden),
    traces,
    beliefs,
    beliefConflicts,
  });
}

function buildOwnerCaseKnowledge(
  assetScore: AssetScoreSnapshot,
  ownerReadiness: OwnerDecisionReadinessSnapshot,
): ActorKnowledge {
  const day = assetScore.day;
  const facts = [
    { key: 'competitiveness', label: '房源竞争力', value: assetScore.score, source: 'relayed' as SignalSource, confidence: 0.7, asOfDay: day },
    { key: 'd1', label: '客户需求', value: assetScore.dimensions.d1.score, source: 'relayed' as SignalSource, confidence: 0.7, asOfDay: day },
    { key: 'd2', label: '房源质量', value: assetScore.dimensions.d2.score, source: 'self_sourced' as SignalSource, confidence: 0.8, asOfDay: day },
    { key: 'trust', label: '信任关系', value: ownerReadiness.dimensions.trust.score, source: 'observed' as SignalSource, confidence: 0.9, asOfDay: day },
    { key: 'urgency', label: '紧迫感', value: ownerReadiness.dimensions.urgency.score, source: 'self_sourced' as SignalSource, confidence: 0.85, asOfDay: day },
  ];

  const inferred = assetScore.blockers.map((b) => ({
    key: `blocker:${b}`, label: b, direction: 'negative' as const, strength: 60,
    source: 'relayed' as SignalSource, basedOn: freezeArray(['competitiveness']),
  }));

  const hidden = [
    { key: 'd4', reason: '竞争细节对业主不可见' },
    { key: 'opportunity-details', reason: '客户隐私' },
    { key: 'company-pressure', reason: '公司内部压力' },
    { key: 'manager-assessment', reason: '管理层评估' },
    { key: 'rival-details', reason: '竞品具体信息' },
  ];

  const traces = buildTracesFromFacts(facts);
  const beliefs = buildOwnerBeliefs(assetScore, ownerReadiness, day);
  const beliefConflicts = buildBeliefConflicts(beliefs, assetScore);

  return Object.freeze({
    visibleFacts: freezeArray(facts),
    inferredSignals: freezeArray(inferred),
    hiddenGlobalFacts: freezeArray(hidden),
    traces,
    beliefs,
    beliefConflicts,
  });
}

// ---------------------------------------------------------------------------
// DecisionState builder
// ---------------------------------------------------------------------------

function buildDecisionState(
  signalCount: number,
  urgentCount: number,
  enabledDraftCount: number,
): DecisionState {
  let posture: DecisionState['posture'] = 'undecided';
  if (urgentCount > 0) posture = 'leaning_toward';
  if (enabledDraftCount === 0 && signalCount > 0) posture = 'stuck_conflicted';
  if (signalCount === 0) posture = 'waiting';

  const pressureLevel = Math.min(100, urgentCount * 30 + signalCount * 10);
  const confidence = enabledDraftCount > 0 ? 0.7 : signalCount > 0 ? 0.4 : 0.2;

  const blockers: string[] = [];
  if (enabledDraftCount === 0) blockers.push('无可用行动方案');
  if (urgentCount > 0) blockers.push('有紧急信号需要处理');

  return Object.freeze({
    posture,
    pressureLevel,
    confidence,
    blockers: freezeArray(blockers),
    lastUpdatedDay: 0,
  });
}

// ---------------------------------------------------------------------------
// ActionCommandDraft builder
// ---------------------------------------------------------------------------

function buildActionCommandDrafts(
  drafts: readonly DecisionSupportRecommendationDraft[],
  signals: readonly DecisionSupportSignal[],
): readonly ActionCommandDraft[] {
  return freezeArray(
    drafts.map((draft) => {
      const supportingSignals = signals.filter((s) => draft.supportingSignalIds.includes(s.id));
      const rationale = supportingSignals.length > 0
        ? supportingSignals.map((s) => s.label).join('; ')
        : '基于综合评估';

      // Derive belief trace IDs from supporting signals
      const beliefTraceIds = supportingSignals.flatMap((s) => {
        if (s.kind === 'pricing-friction') return ['belief:price_anchor'];
        if (s.kind === 'owner-readiness-low') return ['belief:broker_trust'];
        if (s.kind === 'open-day-fit') return ['belief:market_heat'];
        return [];
      });

      return Object.freeze({
        id: `cmd:${draft.id}`,
        caseId: draft.caseId,
        actionSpecId: draft.actionSpecId,
        legacyActionId: draft.legacyActionId,
        label: draft.actionSpecId,
        priority: draft.priority,
        confidence: draft.confidence,
        enabled: draft.availability.enabled,
        disabledReason: draft.availability.reason,
        supportingSignalKeys: freezeArray(draft.supportingSignalIds),
        decisionMomentIds: freezeArray(draft.decisionMomentIds),
        estimatedEnergyCost: 0,
        estimatedBudgetCost: 0,
        rationale,
        beliefTraceIds: freezeArray(beliefTraceIds),
      }) as ActionCommandDraft;
    }),
  );
}

// ---------------------------------------------------------------------------
// DecisionMoment builder
// ---------------------------------------------------------------------------

function buildDecisionMomentsFromContext(
  context: DecisionSupportContext,
): readonly DecisionMoment[] {
  return freezeArray(
    context.cases.flatMap((c) =>
      c.decisionMoments.map((dm) =>
        Object.freeze({
          id: dm.id,
          label: dm.name,
          trigger: dm.summary,
          urgency: 'medium' as const,
          relatedCaseId: c.caseId,
          relatedSignalKeys: freezeArray(
            c.signals
              .filter((s) => s.decisionMomentIds.includes(dm.id))
              .map((s) => s.id),
          ),
        }) as DecisionMoment,
      ),
    ),
  );
}

// ---------------------------------------------------------------------------
// ChoiceSet builder
// ---------------------------------------------------------------------------

function buildBrokerCaseChoiceSet(
  caseCtx: DecisionSupportContext['cases'][number],
  assetScore: AssetScoreSnapshot,
  ownerReadiness: OwnerDecisionReadinessSnapshot,
  actionCommandDrafts: readonly ActionCommandDraft[],
): AlternativeSet {
  const alternatives: DecisionAlternative[] = [];
  const constraints: ChoiceConstraint[] = [];

  // Map recommendation drafts to alternatives
  for (const draft of caseCtx.recommendationDrafts) {
    const matchingDraft = actionCommandDrafts.find((d) => d.caseId === caseCtx.caseId && d.actionSpecId === draft.actionSpecId);
    alternatives.push(Object.freeze({
      id: `alt:${draft.actionSpecId}:${caseCtx.caseId}`,
      label: draft.actionSpecId,
      description: `推荐动作: ${draft.actionSpecId}`,
      actionCommandDraftId: matchingDraft?.id,
      source: 'broker-framed' as const,
      attractiveness: draft.priority,
      feasible: draft.availability.enabled,
      constraintReason: draft.availability.enabled ? undefined : draft.availability.reason,
      supportingSignalKeys: freezeArray(draft.supportingSignalIds),
      beliefTraceIds: freezeArray(['belief:market_heat', 'belief:price_anchor']),
    }) as DecisionAlternative);
  }

  // Add system-default alternatives
  if (assetScore.blockers.length > 0) {
    alternatives.push(Object.freeze({
      id: `alt:defer:${caseCtx.caseId}`,
      label: '暂缓处理',
      description: `有 ${assetScore.blockers.length} 个阻塞点未解决`,
      source: 'system-default' as const,
      attractiveness: 20,
      feasible: true,
      supportingSignalKeys: freezeArray(assetScore.blockers.map((b) => `blocker:${b}`)),
      beliefTraceIds: freezeArray(['belief:price_anchor']),
    }) as DecisionAlternative);
  }

  alternatives.push(Object.freeze({
    id: `alt:escalate:${caseCtx.caseId}`,
    label: '升级经理',
    description: '请求管理层介入',
    source: 'system-default' as const,
    attractiveness: 10,
    feasible: true,
    supportingSignalKeys: freezeArray([]),
    beliefTraceIds: freezeArray([]),
  }) as DecisionAlternative);

  // Add constraints based on signals and readiness
  if (ownerReadiness.dimensions.trust.score < 40) {
    constraints.push(Object.freeze({
      key: 'low-trust',
      label: '业主信任度低',
      kind: 'trust' as const,
      blocking: true,
      detail: `信任度 ${ownerReadiness.dimensions.trust.score}/100，低于阈值 40`,
    }) as ChoiceConstraint);
  }

  if (ownerReadiness.dimensions.patience.score < 30) {
    constraints.push(Object.freeze({
      key: 'low-patience',
      label: '业主耐心不足',
      kind: 'timing' as const,
      blocking: true,
      detail: `耐心 ${ownerReadiness.dimensions.patience.score}/100，低于阈值 30`,
    }) as ChoiceConstraint);
  }

  if (assetScore.dimensions.d1.score < 40) {
    constraints.push(Object.freeze({
      key: 'weak-demand',
      label: '需求信号弱',
      kind: 'market' as const,
      blocking: false,
      detail: `D1 需求动量 ${assetScore.dimensions.d1.score}/100`,
    }) as ChoiceConstraint);
  }

  const feasibleCount = alternatives.filter((a) => a.feasible).length;
  const draftMappedCount = alternatives.filter((a) => a.actionCommandDraftId).length;

  return Object.freeze({
    alternatives: freezeArray(alternatives),
    source: 'broker-framed' as const,
    constraints: freezeArray(constraints),
    feasibleCount,
    draftMappedCount,
  }) as AlternativeSet;
}

function buildOwnerCaseChoiceSet(
  caseCtx: DecisionSupportContext['cases'][number],
  assetScore: AssetScoreSnapshot,
  ownerReadiness: OwnerDecisionReadinessSnapshot,
): AlternativeSet {
  const alternatives: DecisionAlternative[] = [];
  const constraints: ChoiceConstraint[] = [];

  // Owner-visible alternatives only
  alternatives.push(Object.freeze({
    id: `alt:wait:${caseCtx.caseId}`,
    label: '继续等待',
    description: '继续等待更好的市场条件或买家',
    source: 'self' as const,
    attractiveness: 40,
    feasible: true,
    supportingSignalKeys: freezeArray([]),
    beliefTraceIds: freezeArray(['belief:owner_market_heat', 'belief:owner_price_anchor']),
  }) as DecisionAlternative);

  alternatives.push(Object.freeze({
    id: `alt:price-communicate:${caseCtx.caseId}`,
    label: '接受调价沟通',
    description: '与经纪人讨论价格调整方案',
    source: 'broker-framed' as const,
    attractiveness: 30,
    feasible: ownerReadiness.dimensions.trust.score >= 30,
    constraintReason: ownerReadiness.dimensions.trust.score < 30 ? '信任度不足' : undefined,
    supportingSignalKeys: freezeArray(['pricing-friction']),
    beliefTraceIds: freezeArray(['belief:owner_broker_trust', 'belief:owner_price_anchor']),
  }) as DecisionAlternative);

  if (caseCtx.decisionMoments.some((dm) => dm.name.includes('open-day'))) {
    alternatives.push(Object.freeze({
      id: `alt:open-day:${caseCtx.caseId}`,
      label: '参加开放日',
      description: '参加社区开放日活动',
      source: 'broker-framed' as const,
      attractiveness: 50,
      feasible: true,
      supportingSignalKeys: freezeArray(['open-day-fit']),
      beliefTraceIds: freezeArray(['belief:owner_market_heat']),
    }) as DecisionAlternative);
  }

  if (caseCtx.recommendationDrafts.some((d) => d.actionSpecId.includes('sincerity'))) {
    alternatives.push(Object.freeze({
      id: `alt:sincerity:${caseCtx.caseId}`,
      label: '接受诚意卖',
      description: '参与诚意卖活动，明确出售意向和价格底线',
      source: 'broker-framed' as const,
      attractiveness: 45,
      feasible: ownerReadiness.dimensions.urgency.score >= 40,
      constraintReason: ownerReadiness.dimensions.urgency.score < 40 ? '紧迫度不足' : undefined,
      supportingSignalKeys: freezeArray([]),
      beliefTraceIds: freezeArray(['belief:owner_seller_sincerity']),
    }) as DecisionAlternative);
  }

  alternatives.push(Object.freeze({
    id: `alt:consider-offers:${caseCtx.caseId}`,
    label: '考虑报价',
    description: '认真考虑现有买家报价',
    source: 'inferred-from-pressure' as const,
    attractiveness: 35,
    feasible: caseCtx.opportunityScores.length > 0,
    constraintReason: caseCtx.opportunityScores.length === 0 ? '暂无报价' : undefined,
    supportingSignalKeys: freezeArray([]),
    beliefTraceIds: freezeArray(['belief:owner_price_anchor']),
  }) as DecisionAlternative);

  alternatives.push(Object.freeze({
    id: `alt:withdraw:${caseCtx.caseId}`,
    label: '撤回房源',
    description: '暂时或永久撤回房源',
    source: 'system-default' as const,
    attractiveness: 5,
    feasible: true,
    supportingSignalKeys: freezeArray([]),
    beliefTraceIds: freezeArray([]),
  }) as DecisionAlternative);

  // Owner-specific constraints
  if (ownerReadiness.dimensions.trust.score < 30) {
    constraints.push(Object.freeze({
      key: 'low-broker-trust',
      label: '对经纪人信任不足',
      kind: 'trust' as const,
      blocking: true,
      detail: `信任度 ${ownerReadiness.dimensions.trust.score}/100`,
    }) as ChoiceConstraint);
  }

  const feasibleCount = alternatives.filter((a) => a.feasible).length;
  const draftMappedCount = 0; // Owner doesn't see ActionCommandDrafts

  return Object.freeze({
    alternatives: freezeArray(alternatives),
    source: 'self' as const,
    constraints: freezeArray(constraints),
    feasibleCount,
    draftMappedCount,
  }) as AlternativeSet;
}

// ---------------------------------------------------------------------------
// WaitingState builder
// ---------------------------------------------------------------------------

function buildWaitingState(
  caseCtx: DecisionSupportContext['cases'][number],
  assetScore: AssetScoreSnapshot,
  ownerReadiness: OwnerDecisionReadinessSnapshot,
  choiceSet: AlternativeSet,
): WaitingState {
  const signalCount = caseCtx.signals.length;
  const urgentCount = caseCtx.signals.filter((s) => s.severity === 'urgent').length;
  const enabledDraftCount = caseCtx.recommendationDrafts.filter((d) => d.availability.enabled).length;

  // Determine waiting posture from signals and readiness
  let posture: WaitingState['posture'] = 'not_waiting';
  let reason = '';
  let triggerToAct: string | undefined;
  const beliefTraceIds: string[] = [];

  if (enabledDraftCount === 0 && signalCount > 0) {
    posture = 'stuck_conflicted';
    reason = '有信号但无可行方案';
    triggerToAct = '出现可行行动方案';
    beliefTraceIds.push('belief:price_anchor', 'belief:broker_trust');
  } else if (signalCount === 0) {
    posture = 'wait_observe';
    reason = '暂无明显信号，持续观察';
    triggerToAct = '出现新的市场信号或客户反馈';
    beliefTraceIds.push('belief:market_heat');
  } else if (ownerReadiness.dimensions.patience.score < 30 && ownerReadiness.dimensions.urgency.score < 40) {
    posture = 'wait_for_family';
    reason = '业主耐心和紧迫度都低，可能在等待家庭意见';
    triggerToAct = '家庭决策参与者达成共识';
    beliefTraceIds.push('belief:broker_trust');
  } else if (assetScore.dimensions.d1.score < 40 && assetScore.dimensions.d2.score >= 60) {
    posture = 'wait_for_market_signal';
    reason = '资产质量好但需求信号弱，等待市场变化';
    triggerToAct = '出现新的买家兴趣或市场热度提升';
    beliefTraceIds.push('belief:market_heat', 'belief:price_anchor');
  } else if (urgentCount === 0 && ownerReadiness.dimensions.patience.score >= 60) {
    posture = 'wait_for_better_offer';
    reason = '无紧急信号，业主有耐心等待更好条件';
    triggerToAct = '出现更高意向的买家报价';
    beliefTraceIds.push('belief:price_anchor', 'belief:buyer_seriousness');
  } else if (choiceSet.constraints.some((c) => c.blocking)) {
    posture = 'avoid_decision';
    reason = '存在阻塞性约束，回避决策';
    triggerToAct = '约束条件解除';
    beliefTraceIds.push('belief:broker_trust');
  }

  // Accumulated pressure: higher when waiting longer with more signals
  const accumulatedPressure = Math.min(100,
    signalCount * 10 + urgentCount * 20 + (100 - ownerReadiness.dimensions.patience.score) * 0.5
  );

  return Object.freeze({
    posture,
    reason,
    triggerToAct,
    accumulatedPressure: Math.round(accumulatedPressure),
    beliefTraceIds: freezeArray(beliefTraceIds),
  }) as WaitingState;
}

// ---------------------------------------------------------------------------
// CommitmentState builder
// ---------------------------------------------------------------------------

function buildCommitmentStates(
  caseCtx: DecisionSupportContext['cases'][number],
  assetScore: AssetScoreSnapshot,
  ownerReadiness: OwnerDecisionReadinessSnapshot,
  choiceSet: AlternativeSet,
  waitingState: WaitingState,
  beliefs: readonly ActorBelief[],
  day: number,
): readonly CommitmentState[] {
  const commitments: CommitmentState[] = [];

  // Infer owner selling commitment from readiness
  const ownerUrgency = ownerReadiness.dimensions.urgency.score;
  const ownerPatience = ownerReadiness.dimensions.patience.score;
  const ownerTrust = ownerReadiness.dimensions.trust.score;

  if (ownerUrgency >= 50 && ownerPatience < 50) {
    const strength = Math.min(100, Math.round(ownerUrgency * 0.6 + (100 - ownerPatience) * 0.4));
    const credibility = Math.min(1, ownerTrust / 100 + 0.3);
    commitments.push(Object.freeze({
      id: `commit:owner:selling:${caseCtx.caseId}`,
      owner: 'owner' as CommitmentOwnerKind,
      scope: 'price_adjustment' as CommitmentScope,
      label: '业主有出售意愿',
      status: 'active' as CommitmentStatus,
      strength,
      credibility: Math.min(1, credibility),
      createdDay: day,
      revocable: true,
      inferredFrom: 'owner_readiness' as CommitmentInferredFrom,
      traces: freezeArray([
        Object.freeze({
          id: `trace:commit:owner:selling:${caseCtx.caseId}:0`,
          commitmentId: `commit:owner:selling:${caseCtx.caseId}`,
          status: 'active' as CommitmentStatus,
          inferredFrom: 'owner_readiness' as CommitmentInferredFrom,
          reason: `紧迫度 ${ownerUrgency}/100, 耐心 ${ownerPatience}/100`,
          day,
          strength,
        }) as CommitmentTrace,
      ]),
      supportingBeliefIds: freezeArray(['belief:owner_seller_sincerity', 'belief:owner_broker_trust']),
      relatedAlternativeIds: freezeArray(choiceSet.alternatives
        .filter((a) => a.source === 'self' || a.source === 'broker-framed')
        .map((a) => a.id)),
      caseId: caseCtx.caseId,
    }) as CommitmentState);
  } else if (ownerUrgency < 40) {
    commitments.push(Object.freeze({
      id: `commit:owner:wait:${caseCtx.caseId}`,
      owner: 'owner' as CommitmentOwnerKind,
      scope: 'wait' as CommitmentScope,
      label: '业主倾向等待',
      status: 'weak' as CommitmentStatus,
      strength: Math.round(30 + (100 - ownerUrgency) * 0.3),
      credibility: 0.5,
      createdDay: day,
      revocable: true,
      inferredFrom: 'owner_readiness' as CommitmentInferredFrom,
      traces: freezeArray([
        Object.freeze({
          id: `trace:commit:owner:wait:${caseCtx.caseId}:0`,
          commitmentId: `commit:owner:wait:${caseCtx.caseId}`,
          status: 'weak' as CommitmentStatus,
          inferredFrom: 'owner_readiness' as CommitmentInferredFrom,
          reason: `紧迫度低 ${ownerUrgency}/100`,
          day,
          strength: Math.round(30 + (100 - ownerUrgency) * 0.3),
        }) as CommitmentTrace,
      ]),
      supportingBeliefIds: freezeArray(['belief:owner_market_heat']),
      relatedAlternativeIds: freezeArray(choiceSet.alternatives
        .filter((a) => a.label.includes('等待'))
        .map((a) => a.id)),
      caseId: caseCtx.caseId,
    }) as CommitmentState);
  }

  // Infer broker service commitment from enabled drafts
  const enabledDrafts = caseCtx.recommendationDrafts.filter((d) => d.availability.enabled);
  if (enabledDrafts.length > 0) {
    const topDraft = enabledDrafts.reduce((best, d) => d.priority > best.priority ? d : best, enabledDrafts[0]);
    commitments.push(Object.freeze({
      id: `commit:broker:service:${caseCtx.caseId}`,
      owner: 'broker' as CommitmentOwnerKind,
      scope: mapActionSpecToScope(topDraft.actionSpecId),
      label: `经纪人推荐: ${topDraft.actionSpecId}`,
      status: 'active' as CommitmentStatus,
      strength: Math.round(topDraft.priority * 0.8),
      credibility: topDraft.confidence,
      createdDay: day,
      revocable: true,
      inferredFrom: 'choice_set' as CommitmentInferredFrom,
      traces: freezeArray([
        Object.freeze({
          id: `trace:commit:broker:service:${caseCtx.caseId}:0`,
          commitmentId: `commit:broker:service:${caseCtx.caseId}`,
          status: 'active' as CommitmentStatus,
          inferredFrom: 'choice_set' as CommitmentInferredFrom,
          reason: `推荐方案 ${topDraft.actionSpecId}, 优先级 ${topDraft.priority}`,
          day,
          strength: Math.round(topDraft.priority * 0.8),
        }) as CommitmentTrace,
      ]),
      supportingBeliefIds: freezeArray(['belief:market_heat', 'belief:price_anchor']),
      relatedAlternativeIds: freezeArray(choiceSet.alternatives
        .filter((a) => a.actionCommandDraftId)
        .map((a) => a.id)),
      caseId: caseCtx.caseId,
    }) as CommitmentState);
  }

  // Infer waiting commitment from waiting posture
  if (waitingState.posture !== 'not_waiting') {
    const waitingStrength = Math.round(waitingState.accumulatedPressure * 0.6);
    commitments.push(Object.freeze({
      id: `commit:wait:${caseCtx.caseId}`,
      owner: 'broker' as CommitmentOwnerKind,
      scope: 'wait' as CommitmentScope,
      label: `等待中: ${waitingState.reason}`,
      status: waitingStrength > 60 ? 'stale' as CommitmentStatus : 'weak' as CommitmentStatus,
      strength: waitingStrength,
      credibility: 0.4,
      createdDay: day,
      expiryDay: day + 7,
      expiryReason: '等待过久可能导致机会流失',
      revocable: true,
      inferredFrom: 'waiting_posture' as CommitmentInferredFrom,
      traces: freezeArray([
        Object.freeze({
          id: `trace:commit:wait:${caseCtx.caseId}:0`,
          commitmentId: `commit:wait:${caseCtx.caseId}`,
          status: waitingStrength > 60 ? 'stale' as CommitmentStatus : 'weak' as CommitmentStatus,
          inferredFrom: 'waiting_posture' as CommitmentInferredFrom,
          reason: waitingState.reason,
          day,
          strength: waitingStrength,
        }) as CommitmentTrace,
      ]),
      supportingBeliefIds: freezeArray(waitingState.beliefTraceIds),
      relatedAlternativeIds: freezeArray([]),
      caseId: caseCtx.caseId,
    }) as CommitmentState);
  }

  // Check for opportunity-stage based commitments
  const lateStageOpps = caseCtx.opportunityScores.filter((o) => o.inputs.stageIndex >= 3);
  for (const opp of lateStageOpps) {
    commitments.push(Object.freeze({
      id: `commit:customer:offer:${opp.inputs.opportunityId}`,
      owner: 'customer' as CommitmentOwnerKind,
      scope: 'offer' as CommitmentScope,
      label: `客户意向: ${opp.subjectRef.label}`,
      status: opp.inputs.stageIndex >= 5 ? 'active' as CommitmentStatus : 'weak' as CommitmentStatus,
      strength: Math.round(opp.score * 0.7),
      credibility: opp.confidence,
      createdDay: day,
      revocable: true,
      inferredFrom: 'opportunity_stage' as CommitmentInferredFrom,
      traces: freezeArray([
        Object.freeze({
          id: `trace:commit:customer:offer:${opp.inputs.opportunityId}:0`,
          commitmentId: `commit:customer:offer:${opp.inputs.opportunityId}`,
          status: opp.inputs.stageIndex >= 5 ? 'active' as CommitmentStatus : 'weak' as CommitmentStatus,
          inferredFrom: 'opportunity_stage' as CommitmentInferredFrom,
          reason: `阶段 ${opp.inputs.stageIndex}, 分数 ${opp.score}`,
          day,
          strength: Math.round(opp.score * 0.7),
        }) as CommitmentTrace,
      ]),
      supportingBeliefIds: freezeArray(['belief:buyer_seriousness']),
      relatedAlternativeIds: freezeArray([]),
      caseId: caseCtx.caseId,
    }) as CommitmentState);
  }

  return freezeArray(commitments);
}

function mapActionSpecToScope(actionSpecId: string): CommitmentScope {
  if (actionSpecId.includes('pricing') || actionSpecId.includes('price')) return 'price_adjustment';
  if (actionSpecId.includes('open-day')) return 'open_day_participation';
  if (actionSpecId.includes('sincerity')) return 'sincerity_sale';
  if (actionSpecId.includes('showing')) return 'showing';
  if (actionSpecId.includes('revisit')) return 'revisit';
  if (actionSpecId.includes('offer') || actionSpecId.includes('negotiation')) return 'negotiation';
  if (actionSpecId.includes('withdraw')) return 'withdraw';
  return 'showing'; // default
}

// ---------------------------------------------------------------------------
// NoDecisionReadModel builder
// ---------------------------------------------------------------------------

function buildNoDecisionReadModel(
  caseCtx: DecisionSupportContext['cases'][number],
  waitingState: WaitingState,
  choiceSet: AlternativeSet,
  commitmentStates: readonly CommitmentState[],
  day: number,
): NoDecisionReadModel | undefined {
  // Only produce NoDecisionReadModel when posture indicates waiting/avoiding/stuck
  if (waitingState.posture === 'not_waiting') return undefined;

  const blockingConstraints = choiceSet.constraints
    .filter((c) => c.blocking)
    .map((c) => c.label);

  const consideredAlternativeIds = choiceSet.alternatives
    .filter((a) => a.feasible)
    .map((a) => a.id);

  // Determine exit condition from posture and constraints
  let exitCondition = '';
  switch (waitingState.posture) {
    case 'wait_observe':
      exitCondition = '出现新的市场信号或客户反馈';
      break;
    case 'wait_for_better_offer':
      exitCondition = '出现更高意向的买家报价';
      break;
    case 'wait_for_family':
      exitCondition = '家庭决策参与者达成共识';
      break;
    case 'wait_for_market_signal':
      exitCondition = '市场热度提升或新的买家兴趣出现';
      break;
    case 'avoid_decision':
      exitCondition = `约束条件解除: ${blockingConstraints.join(', ') || '未知约束'}`;
      break;
    case 'stuck_conflicted':
      exitCondition = '出现可行行动方案或阻塞点解决';
      break;
    default:
      exitCondition = '需要更多信息';
  }

  // Next review day: sooner when pressure is high
  const pressureDays = waitingState.accumulatedPressure > 60 ? 1
    : waitingState.accumulatedPressure > 30 ? 3
    : 7;
  const nextReviewDay = day + pressureDays;

  return Object.freeze({
    posture: waitingState.posture,
    consideredAlternativeIds: freezeArray(consideredAlternativeIds),
    blockingConstraints: freezeArray(blockingConstraints),
    exitCondition,
    nextReviewDay,
    accumulatedPressure: waitingState.accumulatedPressure,
    beliefTraceIds: freezeArray(waitingState.beliefTraceIds),
  }) as NoDecisionReadModel;
}

// ---------------------------------------------------------------------------
// PressureReceiptSummary builder
// ---------------------------------------------------------------------------

export function buildPressureReceiptSummary(
  coverage: D4ReceiptCoverageReport | null | undefined,
  day: number,
): PressureReceiptSummary {
  if (!coverage) {
    return Object.freeze({
      available: false,
      day,
      coverage: 0,
      maxConfidence: 0,
      wiredCount: 0,
      wiredTotal: 0,
      sources: freezeArray([]),
      headline: '无压力数据',
    });
  }

  const sources: PressureSourceSummary[] = coverage.sources.map((s) =>
    Object.freeze({ source: s.source, category: s.category, present: s.present }) as PressureSourceSummary,
  );

  const headline = coverage.coverage >= 1.0
    ? '压力数据完整'
    : coverage.coverage >= 0.5
      ? `压力数据部分覆盖 (${Math.round(coverage.coverage * 100)}%)`
      : `压力数据不足 (${Math.round(coverage.coverage * 100)}%)`;

  return Object.freeze({
    available: true,
    day,
    coverage: coverage.coverage,
    maxConfidence: coverage.maxConfidence,
    wiredCount: coverage.wiredCount,
    wiredTotal: coverage.wiredTotal,
    sources: freezeArray(sources),
    headline,
  });
}

// ---------------------------------------------------------------------------
// CasePOVContext builder
// ---------------------------------------------------------------------------

function buildCasePOVContext(
  caseCtx: DecisionSupportContext['cases'][number],
  assetScore: AssetScoreSnapshot,
  ownerReadiness: OwnerDecisionReadinessSnapshot,
): CasePOVContext {
  const knowledge = buildBrokerCaseKnowledge(assetScore, ownerReadiness, caseCtx.signals.length);
  const urgentCount = caseCtx.signals.filter((s) => s.severity === 'urgent').length;
  const enabledDraftCount = caseCtx.recommendationDrafts.filter((d) => d.availability.enabled).length;
  const decisionState = buildDecisionState(caseCtx.signals.length, urgentCount, enabledDraftCount);

  return Object.freeze({
    caseId: caseCtx.caseId,
    title: caseCtx.title,
    status: caseCtx.status,
    assetScore: Object.freeze({
      score: assetScore.score,
      d1: assetScore.dimensions.d1.score,
      d2: assetScore.dimensions.d2.score,
      d3: assetScore.dimensions.d3.score,
      d4: assetScore.dimensions.d4?.score,
      blockers: freezeArray(assetScore.blockers),
      topDriverLabels: freezeArray(assetScore.topDrivers.map((d) => d.label)),
    }),
    ownerReadiness: Object.freeze({
      score: ownerReadiness.score,
      trust: ownerReadiness.dimensions.trust.score,
      urgency: ownerReadiness.dimensions.urgency.score,
      patience: ownerReadiness.dimensions.patience.score,
    }),
    opportunityCount: caseCtx.opportunityScores.length,
    lateStageOpportunityCount: caseCtx.opportunityScores.filter((o) => o.inputs.stageIndex >= 3).length,
    signals: freezeArray(caseCtx.signals.map((s) => Object.freeze({
      key: s.id, label: s.label, severity: s.severity, score: s.score,
    }))),
    recommendationDrafts: freezeArray(caseCtx.recommendationDrafts.map((d) => Object.freeze({
      id: d.id, actionSpecId: d.actionSpecId, label: d.actionSpecId,
      enabled: d.availability.enabled, priority: d.priority,
    }))),
    decisionMoments: freezeArray(caseCtx.decisionMoments.map((dm) => Object.freeze({
      id: dm.id, label: dm.name, urgency: 'medium',
    }))),
    knowledge,
    decisionState: Object.freeze({ ...decisionState, lastUpdatedDay: caseCtx.assetScore.day }),
    commitments: freezeArray([]),
  }) as CasePOVContext;
}

// ---------------------------------------------------------------------------
// OwnerPOVContext builder
// ---------------------------------------------------------------------------

function buildOwnerPOVContext(
  caseCtx: DecisionSupportContext['cases'][number],
  assetScore: AssetScoreSnapshot,
  ownerReadiness: OwnerDecisionReadinessSnapshot,
): OwnerPOVContext {
  const knowledge = buildOwnerCaseKnowledge(assetScore, ownerReadiness);
  const urgentCount = caseCtx.signals.filter((s) => s.severity === 'urgent').length;
  const enabledDraftCount = caseCtx.recommendationDrafts.filter((d) => d.availability.enabled).length;
  const decisionState = buildDecisionState(caseCtx.signals.length, urgentCount, enabledDraftCount);

  const ownerVisibleSignalKeys = new Set([
    'owner-discovery-missing', 'owner-readiness-low', 'pricing-friction', 'open-day-fit',
  ]);

  const visibleSignals = caseCtx.signals
    .filter((s) => ownerVisibleSignalKeys.has(s.kind))
    .map((s) => Object.freeze({ key: s.id, label: s.label, severity: s.severity }));

  const choiceSet = buildOwnerCaseChoiceSet(caseCtx, assetScore, ownerReadiness);
  const waitingState = buildWaitingState(caseCtx, assetScore, ownerReadiness, choiceSet);
  const allCommitmentStates = buildCommitmentStates(caseCtx, assetScore, ownerReadiness, choiceSet, waitingState, knowledge.beliefs, caseCtx.assetScore.day);
  // Owner only sees owner-relevant commitments (not customer/broker/manager internal)
  const commitmentStates = allCommitmentStates.filter((c) => c.owner === 'owner');
  const noDecision = buildNoDecisionReadModel(caseCtx, waitingState, choiceSet, commitmentStates, caseCtx.assetScore.day);
  const commitments = buildDecisionCommitmentsFromStates(commitmentStates);

  return Object.freeze({
    caseId: caseCtx.caseId,
    title: caseCtx.title,
    status: caseCtx.status,
    assetScore: Object.freeze({
      score: assetScore.score,
      d1: assetScore.dimensions.d1.score,
      d2: assetScore.dimensions.d2.score,
      d3: assetScore.dimensions.d3.score,
    }),
    ownerReadiness: Object.freeze({
      score: ownerReadiness.score,
      trust: ownerReadiness.dimensions.trust.score,
      urgency: ownerReadiness.dimensions.urgency.score,
      patience: ownerReadiness.dimensions.patience.score,
    }),
    visibleSignals: freezeArray(visibleSignals),
    knowledge,
    decisionState: Object.freeze({ ...decisionState, lastUpdatedDay: caseCtx.assetScore.day }),
    commitments,
    choiceSet,
    waitingState,
    commitmentStates,
    noDecision,
  }) as OwnerPOVContext;
}

// ---------------------------------------------------------------------------
// BrokerPOVSnapshot builder
// ---------------------------------------------------------------------------

export function buildBrokerPOVSnapshot(
  context: DecisionSupportContext,
  coverage?: D4ReceiptCoverageReport | null,
): BrokerPOVSnapshot {
  const pressureSummary = buildPressureReceiptSummary(coverage, context.generatedAtDay);

  const cases: CasePOVContext[] = context.cases.map((c) =>
    buildCasePOVContext(c, c.assetScore, c.ownerReadiness),
  );

  const actionCommandDrafts = buildActionCommandDrafts(
    context.cases.flatMap((c) => c.recommendationDrafts),
    context.cases.flatMap((c) => c.signals),
  );

  const decisionMoments = buildDecisionMomentsFromContext(context);

  const casesWithChoiceSets: CasePOVContext[] = cases.map((casePOV, index) => {
    const caseCtx = context.cases[index];
    const choiceSet = buildBrokerCaseChoiceSet(caseCtx, caseCtx.assetScore, caseCtx.ownerReadiness, actionCommandDrafts);
    const waitingState = buildWaitingState(caseCtx, caseCtx.assetScore, caseCtx.ownerReadiness, choiceSet);
    const commitmentStates = buildCommitmentStates(caseCtx, caseCtx.assetScore, caseCtx.ownerReadiness, choiceSet, waitingState, casePOV.knowledge.beliefs, caseCtx.assetScore.day);
    const noDecision = buildNoDecisionReadModel(caseCtx, waitingState, choiceSet, commitmentStates, caseCtx.assetScore.day);
    const commitments = buildDecisionCommitmentsFromStates(commitmentStates);
    return Object.freeze({
      ...casePOV,
      commitments,
      choiceSet,
      waitingState,
      commitmentStates,
      noDecision,
    }) as CasePOVContext;
  });

  const globalFacts = [
    { key: 'active-case-count', label: '活跃房源数', value: context.cases.length, source: 'observed' as SignalSource, confidence: 1.0, asOfDay: context.generatedAtDay },
    { key: 'pressure-coverage', label: '压力数据覆盖', value: pressureSummary.coverage, source: 'systemic' as SignalSource, confidence: pressureSummary.maxConfidence, asOfDay: context.generatedAtDay },
  ];

  const globalHidden = [];
  if (!pressureSummary.available) globalHidden.push({ key: 'pressure-receipts', reason: '压力回执数据不可用' });
  if (pressureSummary.coverage < 1.0) globalHidden.push({ key: 'full-pressure-coverage', reason: `仅覆盖 ${pressureSummary.wiredCount}/${pressureSummary.wiredTotal} 个已接入信号源` });

  return Object.freeze({
    role: 'broker',
    readOnly: true,
    day: context.generatedAtDay,
    actorId: 'broker:current',
    cases: freezeArray(casesWithChoiceSets),
    pressureSummary,
    actionCommandDrafts,
    decisionMoments,
    energy: 100,
    promotionBudget: 0,
    globalKnowledge: buildGlobalKnowledge(globalFacts, globalHidden),
  }) as BrokerPOVSnapshot;
}

// ---------------------------------------------------------------------------
// OwnerPOVSnapshot builder
// ---------------------------------------------------------------------------

export function buildOwnerPOVSnapshot(
  context: DecisionSupportContext,
): OwnerPOVSnapshot {
  const cases: OwnerPOVContext[] = context.cases.map((c) =>
    buildOwnerPOVContext(c, c.assetScore, c.ownerReadiness),
  );

  const globalFacts = [
    { key: 'listing-count', label: '我的房源数', value: context.cases.length, source: 'self_sourced' as SignalSource, confidence: 1.0, asOfDay: context.generatedAtDay },
  ];

  const globalHidden = [
    { key: 'opportunity-pipeline', reason: '客户信息对业主不完全透明' },
    { key: 'company-strategy', reason: '公司内部策略' },
    { key: 'broker-workload', reason: '经纪人工作量' },
    { key: 'competition-internals', reason: '竞争细节不可见' },
  ];

  return Object.freeze({
    role: 'owner',
    readOnly: true,
    day: context.generatedAtDay,
    cases: freezeArray(cases),
    knowledge: buildGlobalKnowledge(globalFacts, globalHidden),
  }) as OwnerPOVSnapshot;
}
