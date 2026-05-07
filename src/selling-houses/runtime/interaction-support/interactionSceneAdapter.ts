/**
 * Runtime InteractionScene Adapter v0 — derives InteractionScene from live legacy state/POV.
 *
 * Mother model alignment:
 * - Section 9 (POV And Interaction Design): GlobalTruth → POVProjection →
 *   ImmersiveInteractionScene → DecisionMoment / Action → Event / Commitment.
 * - Section 19.3 (BrokerServiceInteraction vs Event vs InteractionScene):
 *   InteractionScene = container/context for the call.
 * - Section 19.4 (Interaction Effects): A call can emit independent events
 *   for information delivery, belief update, relation update, and commitment.
 *
 * Hard constraints:
 * 1. Does NOT mutate GameState.
 * 2. Does NOT execute actions.
 * 3. Does NOT call LLM.
 * 4. Deterministic: stable sorting, no Date.now, no Math.random.
 * 5. runtime/ can import domain/core/runtime.
 * 6. All scene IDs are stable and deterministic.
 */

import type {
  InteractionScene,
  InteractionSceneType,
  BrokerServiceInteraction,
  InformationItem,
  InterpretationItem,
  RecommendationItem,
  DecisionFrame,
  CounterpartyQuestion,
  BeliefChange,
  CommitmentChange,
  ExpectedReaction,
} from '../../core/world-state/interactions/models.js';
import { buildInteractionScene } from '../../core/world-state/interactions/models.js';

import type {
  DecisionSupportContext,
  CaseDecisionSupportContext,
  DecisionSupportSignal,
  DecisionSupportRecommendationDraft,
} from '../decision-support/types.js';

import type {
  BrokerPOVSnapshot,
  CasePOVContext,
} from '../../core/decision/models.js';

// ---------------------------------------------------------------------------
// Plain input shapes for scenes without full DecisionSupportContext
// ---------------------------------------------------------------------------

export interface InteractionSceneCaseInput {
  readonly caseId: string;
  readonly title: string;
  readonly ownerName: string;
  readonly maintainerName: string;
  readonly status: string;
  readonly askPrice: number;
  readonly marketPrice: number;
  readonly trust: number;
  readonly urgency: number;
  readonly patience: number;
  readonly competitiveness: number;
  readonly d1: number;
  readonly d2: number;
  readonly d3: number;
  readonly signals: readonly DecisionSupportSignal[];
  readonly recommendationDrafts: readonly DecisionSupportRecommendationDraft[];
  readonly lateStageOpportunityCount: number;
  readonly day: number;
}

// ---------------------------------------------------------------------------
// Scene type mapping from signal kinds
// ---------------------------------------------------------------------------

function mapSignalToSceneType(signal: DecisionSupportSignal): InteractionSceneType | null {
  switch (signal.kind) {
    case 'owner-discovery-missing':
    case 'owner-readiness-low':
      return 'owner_call';
    case 'pricing-friction':
      return 'price_report';
    case 'open-day-fit':
      return 'showing';
    case 'opportunity-close-ready':
      return 'offer_negotiation';
    case 'lead-pipeline-thin':
      return 'customer_follow_up';
    case 'asset-positioning-gap':
      return 'price_report';
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Deterministic scene ID builder
// ---------------------------------------------------------------------------

function buildSceneId(sceneType: InteractionSceneType, caseId: string, day: number, index: number): string {
  return `scene:${sceneType}:${caseId}:d${day}:${index}`;
}

function buildInteractionId(sceneId: string): string {
  return `interaction:${sceneId}`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

// ---------------------------------------------------------------------------
// Stable sort helpers (no Date.now, no Math.random)
// ---------------------------------------------------------------------------

function sortBySeverityThenScore(signals: readonly DecisionSupportSignal[]): readonly DecisionSupportSignal[] {
  const severityOrder: Record<string, number> = { urgent: 0, decision: 1, watch: 2, info: 3 };
  return [...signals].sort((a, b) => {
    const sa = severityOrder[a.severity] ?? 99;
    const sb = severityOrder[b.severity] ?? 99;
    if (sa !== sb) return sa - sb;
    return (b.score ?? 0) - (a.score ?? 0);
  });
}

function sortByPriority(drafts: readonly DecisionSupportRecommendationDraft[]): readonly DecisionSupportRecommendationDraft[] {
  return [...drafts].sort((a, b) => b.priority - a.priority);
}

// ---------------------------------------------------------------------------
// Service interaction builder
// ---------------------------------------------------------------------------

function buildServiceInteraction(
  sceneId: string,
  caseInput: InteractionSceneCaseInput,
  sceneType: InteractionSceneType,
): BrokerServiceInteraction {
  const infoItems: InformationItem[] = [];
  const interpItems: InterpretationItem[] = [];
  const questions: CounterpartyQuestion[] = [];
  const beliefChanges: BeliefChange[] = [];
  const commitmentChanges: CommitmentChange[] = [];
  let recommendation: RecommendationItem | undefined;
  let decisionFrame: DecisionFrame | undefined;
  const counterpartyId = caseInput.ownerName || `owner:${caseInput.caseId}`;

  // Build information collected based on scene type
  switch (sceneType) {
    case 'owner_call':
      infoItems.push({
        id: `${sceneId}:info:trust`,
        kind: 'observation',
        label: `业主信任度 ${caseInput.trust}`,
        source: 'observed',
        confidence: 0.9,
        relatedFactRef: `fact:trust:${caseInput.caseId}`,
      });
      infoItems.push({
        id: `${sceneId}:info:urgency`,
        kind: 'observation',
        label: `业主紧迫度 ${caseInput.urgency}`,
        source: 'observed',
        confidence: 0.85,
        relatedFactRef: `fact:urgency:${caseInput.caseId}`,
      });
      interpItems.push({
        id: `${sceneId}:interp:readiness`,
        topic: '业主配合度',
        interpretation: caseInput.trust >= 60 ? '业主配合度较好' : '需要加强信任建设',
        credibility: 0.8,
        basedOnRefs: [`fact:trust:${caseInput.caseId}`],
      });
      questions.push({
        id: `${sceneId}:q:market`,
        question: '市场现在怎么样？',
        topic: 'market_heat',
        revealsLackOf: 'information',
      });
      beliefChanges.push({
        actorId: counterpartyId,
        beliefKind: 'broker_trust',
        previousConfidence: clamp((caseInput.trust - 10) / 100, 0, 1),
        newConfidence: clamp(caseInput.trust / 100, 0, 1),
        direction: caseInput.trust >= 50 ? 'strengthened' : 'weakened',
        reason: '经纪人通过业主沟通更新信任与配合判断',
      });
      commitmentChanges.push({
        actorId: counterpartyId,
        commitmentType: 'timeline_agreement',
        action: caseInput.urgency >= 55 ? 'strengthened' : 'created',
        strength: clamp(Math.round(caseInput.urgency * 0.7 + caseInput.trust * 0.3), 0, 100),
        reason: '业主沟通形成下一步跟进或等待节奏',
      });
      break;

    case 'price_report':
      infoItems.push({
        id: `${sceneId}:info:price`,
        kind: 'fact',
        label: `挂牌价 ${caseInput.askPrice}万，市场价 ${caseInput.marketPrice}万`,
        source: 'observed',
        confidence: 0.95,
        relatedFactRef: `fact:price:${caseInput.caseId}`,
      });
      const priceGap = caseInput.marketPrice > 0
        ? Math.round(((caseInput.askPrice - caseInput.marketPrice) / caseInput.marketPrice) * 100)
        : 0;
      interpItems.push({
        id: `${sceneId}:interp:price`,
        topic: '价格定位',
        interpretation: priceGap <= 3 ? '价格合理' : priceGap <= 8 ? '价格偏高' : '价格明显偏高',
        credibility: 0.85,
        basedOnRefs: [`fact:price:${caseInput.caseId}`],
      });
      decisionFrame = {
        id: `${sceneId}:frame:price`,
        frameType: 'price_anchor',
        label: '价格调整建议',
        description: priceGap > 5 ? '建议与业主沟通价格调整' : '当前价格定位合理',
        anchorValue: caseInput.marketPrice,
        relatedFactRefs: [`fact:price:${caseInput.caseId}`],
      };
      beliefChanges.push({
        actorId: counterpartyId,
        beliefKind: 'price_anchor',
        previousConfidence: clamp(0.35 + Math.abs(priceGap) / 100, 0, 1),
        newConfidence: clamp(0.55 + Math.abs(priceGap) / 80, 0, 1),
        direction: priceGap > 5 ? 'weakened' : 'strengthened',
        reason: priceGap > 5 ? '市场价证据削弱原价格锚点' : '市场价证据支持当前价格锚点',
      });
      commitmentChanges.push({
        actorId: counterpartyId,
        commitmentType: 'price_hold',
        action: priceGap > 5 ? 'weakened' : 'strengthened',
        strength: clamp(priceGap > 5 ? 100 - priceGap * 6 : 70 + (5 - priceGap) * 4, 0, 100),
        reason: priceGap > 5 ? '价格报告推动重新讨论价格承诺' : '价格报告增强维持当前价格的信心',
      });
      break;

    case 'showing':
      infoItems.push({
        id: `${sceneId}:info:d2`,
        kind: 'observation',
        label: `资产质量 D2=${caseInput.d2}`,
        source: 'observed',
        confidence: 0.8,
        relatedFactRef: `fact:d2:${caseInput.caseId}`,
      });
      interpItems.push({
        id: `${sceneId}:interp:fit`,
        topic: '开放日适配度',
        interpretation: caseInput.d2 >= 60 ? '适合安排开放日' : '开放日效果可能有限',
        credibility: 0.7,
        basedOnRefs: [`fact:d2:${caseInput.caseId}`],
      });
      beliefChanges.push({
        actorId: caseInput.maintainerName || 'broker:current',
        beliefKind: 'service_path_confidence',
        previousConfidence: 0.45,
        newConfidence: clamp(caseInput.d2 / 100, 0, 1),
        direction: caseInput.d2 >= 60 ? 'strengthened' : 'weakened',
        reason: '带看/开放日场景更新服务路径信心',
      });
      commitmentChanges.push({
        actorId: caseInput.maintainerName || 'broker:current',
        commitmentType: 'showing_willingness',
        action: caseInput.d2 >= 60 ? 'created' : 'weakened',
        strength: clamp(caseInput.d2, 0, 100),
        reason: '资产质量影响是否继续组织带看或开放日',
      });
      break;

    case 'offer_negotiation':
      infoItems.push({
        id: `${sceneId}:info:opp`,
        kind: 'signal',
        label: `${caseInput.lateStageOpportunityCount} 个高意向客户`,
        source: 'inferred',
        confidence: 0.75,
        relatedFactRef: `fact:opportunity:${caseInput.caseId}`,
      });
      recommendation = {
        id: `${sceneId}:rec:close`,
        label: '推进成交',
        reasoning: '客户意向高，建议推进谈判',
        confidence: 0.7,
        expectedOutcome: '促成交易',
      };
      beliefChanges.push({
        actorId: caseInput.maintainerName || 'broker:current',
        beliefKind: 'buyer_seriousness',
        previousConfidence: 0.45,
        newConfidence: clamp(0.55 + caseInput.lateStageOpportunityCount * 0.12, 0, 1),
        direction: 'strengthened',
        reason: '高阶段机会使买家认真度判断增强',
      });
      commitmentChanges.push({
        actorId: caseInput.maintainerName || 'broker:current',
        commitmentType: 'offer_readiness',
        action: 'strengthened',
        strength: clamp(55 + caseInput.lateStageOpportunityCount * 15, 0, 100),
        reason: '高意向客户进入谈判窗口',
      });
      break;

    case 'focus_meeting':
      infoItems.push({
        id: `${sceneId}:info:signals`,
        kind: 'signal',
        label: `${caseInput.signals.length} 个信号需要讨论`,
        source: 'systemic',
        confidence: 0.9,
      });
      interpItems.push({
        id: `${sceneId}:interp:priority`,
        topic: '聚焦优先级',
        interpretation: caseInput.signals.filter((s) => s.severity === 'urgent').length > 0
          ? '有紧急事项需要优先处理'
          : '常规聚焦讨论',
        credibility: 0.85,
        basedOnRefs: [],
      });
      beliefChanges.push({
        actorId: caseInput.maintainerName || 'broker:current',
        beliefKind: 'market_heat',
        previousConfidence: 0.45,
        newConfidence: caseInput.signals.length > 0 ? 0.7 : 0.5,
        direction: caseInput.signals.length > 0 ? 'strengthened' : 'unchanged',
        reason: '聚焦会汇总信号后更新运营优先级判断',
      });
      break;

    case 'manager_review':
      infoItems.push({
        id: `${sceneId}:info:comp`,
        kind: 'observation',
        label: `竞争力 ${caseInput.competitiveness}`,
        source: 'observed',
        confidence: 0.9,
        relatedFactRef: `fact:competitiveness:${caseInput.caseId}`,
      });
      decisionFrame = {
        id: `${sceneId}:frame:review`,
        frameType: 'risk_warning',
        label: '管理层评估',
        description: caseInput.competitiveness < 50 ? '竞争力不足，需要关注' : '竞争力正常',
        relatedFactRefs: [`fact:competitiveness:${caseInput.caseId}`],
      };
      beliefChanges.push({
        actorId: caseInput.maintainerName || 'broker:current',
        beliefKind: 'market_heat',
        previousConfidence: 0.5,
        newConfidence: clamp(caseInput.competitiveness / 100, 0, 1),
        direction: caseInput.competitiveness >= 50 ? 'strengthened' : 'weakened',
        reason: '管理层评估更新案源竞争力判断',
      });
      break;

    case 'customer_follow_up':
      infoItems.push({
        id: `${sceneId}:info:d1`,
        kind: 'signal',
        label: `需求动量 D1=${caseInput.d1}`,
        source: 'inferred',
        confidence: 0.7,
        relatedFactRef: `fact:d1:${caseInput.caseId}`,
      });
      questions.push({
        id: `${sceneId}:q:need`,
        question: '客户有什么具体需求？',
        topic: 'buyer_seriousness',
        revealsLackOf: 'information',
      });
      beliefChanges.push({
        actorId: caseInput.maintainerName || 'broker:current',
        beliefKind: 'buyer_seriousness',
        previousConfidence: 0.4,
        newConfidence: clamp(caseInput.d1 / 100, 0, 1),
        direction: caseInput.d1 >= 50 ? 'strengthened' : 'weakened',
        reason: '客户跟进根据需求动量更新买家认真度',
      });
      break;

    case 'buyer_broker_recommendation':
      infoItems.push({
        id: `${sceneId}:info:d3`,
        kind: 'observation',
        label: `成交条件 D3=${caseInput.d3}`,
        source: 'observed',
        confidence: 0.75,
        relatedFactRef: `fact:d3:${caseInput.caseId}`,
      });
      recommendation = {
        id: `${sceneId}:rec:recommend`,
        label: '推荐房源',
        reasoning: '房源条件匹配客户需求',
        confidence: 0.65,
        expectedOutcome: '安排带看',
      };
      commitmentChanges.push({
        actorId: caseInput.maintainerName || 'broker:current',
        commitmentType: 'service_exclusivity',
        action: caseInput.d3 >= 60 ? 'strengthened' : 'created',
        strength: clamp(caseInput.d3, 0, 100),
        reason: '买方经纪推荐场景形成服务路径承诺',
      });
      break;
  }

  return Object.freeze({
    interactionId: buildInteractionId(sceneId),
    sceneId,
    brokerId: caseInput.maintainerName || 'broker:current',
    day: caseInput.day,
    rawInformationCollected: Object.freeze(infoItems),
    interpretationProvided: Object.freeze(interpItems),
    recommendationMade: recommendation,
    decisionFrameCreated: decisionFrame,
    counterpartyQuestions: Object.freeze(questions),
    actorBeliefChanged: Object.freeze(beliefChanges),
    actorCommitmentChanged: Object.freeze(commitmentChanges),
  });
}

// ---------------------------------------------------------------------------
// Build scenes from a single case input
// ---------------------------------------------------------------------------

function buildScenesForCase(
  caseInput: InteractionSceneCaseInput,
  sceneTypeFilter?: InteractionSceneType,
): readonly InteractionScene[] {
  const scenes: InteractionScene[] = [];
  const sortedSignals = sortBySeverityThenScore(caseInput.signals);

  // Group signals by scene type
  const signalsByType = new Map<InteractionSceneType, DecisionSupportSignal[]>();
  for (const signal of sortedSignals) {
    const sceneType = mapSignalToSceneType(signal);
    if (!sceneType) continue;
    if (sceneTypeFilter && sceneType !== sceneTypeFilter) continue;
    const arr = signalsByType.get(sceneType) ?? [];
    arr.push(signal);
    signalsByType.set(sceneType, arr);
  }

  // Derive scene type from case state if no signals
  if (signalsByType.size === 0 && !sceneTypeFilter) {
    // Default scene based on case state
    let defaultType: InteractionSceneType = 'owner_call';
    if (caseInput.lateStageOpportunityCount > 0) defaultType = 'offer_negotiation';
    else if (caseInput.patience < 30) defaultType = 'owner_call';
    else if (caseInput.d1 < 40) defaultType = 'customer_follow_up';

    signalsByType.set(defaultType, []);
  }

  let index = 0;
  for (const [sceneType, signals] of signalsByType) {
    const sceneId = buildSceneId(sceneType, caseInput.caseId, caseInput.day, index);
    const serviceInteraction = buildServiceInteraction(sceneId, caseInput, sceneType);

    // Build visible fact refs from case data
    const visibleFactRefs: string[] = [
      `fact:trust:${caseInput.caseId}`,
      `fact:urgency:${caseInput.caseId}`,
      `fact:patience:${caseInput.caseId}`,
      `fact:competitiveness:${caseInput.caseId}`,
      `fact:price:${caseInput.caseId}`,
    ];

    // Build inferred signal refs from signals
    const inferredSignalRefs = signals.map((s) => `signal:${s.id}`);

    // Build available action refs from recommendation drafts
    const availableActionRefs = sortByPriority(caseInput.recommendationDrafts)
      .slice(0, 3)
      .map((d) => `action:${d.actionSpecId}:${caseInput.caseId}`);

    // Build expected reaction based on owner trust
    const expectedReaction: ExpectedReaction = caseInput.trust >= 60
      ? { reactionType: 'accept', confidence: 0.7, reasoning: '业主信任度较高' }
      : caseInput.trust >= 40
        ? { reactionType: 'counter', confidence: 0.5, reasoning: '业主信任度一般，可能需要多次沟通' }
        : { reactionType: 'reject', confidence: 0.6, reasoning: '业主信任度低，可能拒绝建议' };

    // Build pressure refs from urgent signals
    const pressureRefs = signals
      .filter((s) => s.severity === 'urgent' || s.severity === 'decision')
      .map((s) => `pressure:${s.id}`);

    const resultingEventRefs = serviceInteraction.actorBeliefChanged.map((change, changeIndex) =>
      `event:belief:${change.beliefKind}:${caseInput.caseId}:${index}:${changeIndex}`,
    );
    const commitmentRefs = serviceInteraction.actorCommitmentChanged.map((change, changeIndex) =>
      `commitment:${change.commitmentType}:${caseInput.caseId}:${index}:${changeIndex}`,
    );

    const scene = buildInteractionScene({
      sceneId,
      sceneType,
      day: caseInput.day,
      actorIds: [caseInput.maintainerName || 'broker:current', caseInput.ownerName],
      primaryActorId: caseInput.maintainerName || 'broker:current',
      counterpartyActorIds: [caseInput.ownerName],
      caseId: caseInput.caseId,
      povActorId: caseInput.maintainerName || 'broker:current',
      visibleFactRefs,
      inferredSignalRefs,
      pressureRefs,
      availableActionRefs,
      expectedCounterpartyReaction: expectedReaction,
      resultingEventRefs,
      commitmentRefs,
      serviceInteraction,
    });

    scenes.push(scene);
    index++;
  }

  return Object.freeze(scenes);
}

// ---------------------------------------------------------------------------
// Public API: buildInteractionScenesForCase
// ---------------------------------------------------------------------------

export function buildInteractionScenesForCase(
  caseInput: InteractionSceneCaseInput,
  sceneTypeFilter?: InteractionSceneType,
): readonly InteractionScene[] {
  return buildScenesForCase(caseInput, sceneTypeFilter);
}

// ---------------------------------------------------------------------------
// Public API: buildInteractionScenesFromDecisionContext
// ---------------------------------------------------------------------------

export function buildInteractionScenesFromDecisionContext(
  context: DecisionSupportContext,
): readonly InteractionScene[] {
  const allScenes: InteractionScene[] = [];

  for (const caseCtx of context.cases) {
    const caseInput: InteractionSceneCaseInput = {
      caseId: caseCtx.caseId,
      title: caseCtx.title,
      ownerName: 'owner', // not available in DecisionSupportContext
      maintainerName: 'broker:current',
      status: caseCtx.status,
      askPrice: caseCtx.assetScore.inputs.askPrice ?? 0,
      marketPrice: caseCtx.assetScore.inputs.marketPrice ?? 0,
      trust: caseCtx.ownerReadiness.dimensions.trust.score,
      urgency: caseCtx.ownerReadiness.dimensions.urgency.score,
      patience: caseCtx.ownerReadiness.dimensions.patience.score,
      competitiveness: caseCtx.assetScore.score,
      d1: caseCtx.assetScore.dimensions.d1.score,
      d2: caseCtx.assetScore.dimensions.d2.score,
      d3: caseCtx.assetScore.dimensions.d3.score,
      signals: caseCtx.signals,
      recommendationDrafts: caseCtx.recommendationDrafts,
      lateStageOpportunityCount: caseCtx.opportunityScores.filter((o) => o.inputs.stageIndex >= 3).length,
      day: context.generatedAtDay,
    };

    allScenes.push(...buildScenesForCase(caseInput));
  }

  // Stable sort: by day descending, then by scene type, then by caseId
  const sceneTypeOrder: Record<InteractionSceneType, number> = {
    owner_call: 0,
    price_report: 1,
    offer_negotiation: 2,
    showing: 3,
    focus_meeting: 4,
    customer_follow_up: 5,
    manager_review: 6,
    buyer_broker_recommendation: 7,
  };

  return Object.freeze(
    allScenes.sort((a, b) => {
      if (a.day !== b.day) return b.day - a.day;
      const ta = sceneTypeOrder[a.sceneType] ?? 99;
      const tb = sceneTypeOrder[b.sceneType] ?? 99;
      if (ta !== tb) return ta - tb;
      return (a.caseId ?? '').localeCompare(b.caseId ?? '');
    }),
  );
}

// ---------------------------------------------------------------------------
// Public API: buildInteractionScenesFromPOV
// ---------------------------------------------------------------------------

export function buildInteractionScenesFromPOV(
  pov: BrokerPOVSnapshot,
): readonly InteractionScene[] {
  const allScenes: InteractionScene[] = [];

  for (const casePOV of pov.cases) {
    const caseInput: InteractionSceneCaseInput = {
      caseId: casePOV.caseId,
      title: casePOV.title,
      ownerName: 'owner',
      maintainerName: pov.actorId,
      status: casePOV.status,
      askPrice: casePOV.assetScore.score, // approximation
      marketPrice: 0,
      trust: casePOV.ownerReadiness.trust,
      urgency: casePOV.ownerReadiness.urgency,
      patience: casePOV.ownerReadiness.patience,
      competitiveness: casePOV.assetScore.score,
      d1: casePOV.assetScore.d1,
      d2: casePOV.assetScore.d2,
      d3: casePOV.assetScore.d3,
      signals: [], // POV doesn't have raw signals
      recommendationDrafts: [], // POV doesn't have raw drafts
      lateStageOpportunityCount: casePOV.lateStageOpportunityCount,
      day: pov.day,
    };

    allScenes.push(...buildScenesForCase(caseInput));
  }

  return Object.freeze(allScenes);
}
