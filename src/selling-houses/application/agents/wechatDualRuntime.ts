/**
 * WeChat Dual Runtime v2 — rule + LLM dual mode with arbiter selection.
 *
 * Architecture:
 *   scene → [rule proposal] + [optional real LLM proposal] → arbiter → final proposal
 *
 * Hard constraints:
 * 1. No raw GameState reaches LLM context — only ConversationSceneInputPack.
 * 2. Rule proposal is always available (fallback guarantee).
 * 3. LLM proposal is only created when a real proposal is provided — never simulated.
 * 4. No fetch/network calls in this module.
 * 5. No performance.now / Date.now / Math.random — duration is deterministic from caller.
 * 6. All state is derived from inputs; no global mutable state.
 */

import type { ConversationEffectProposal, ConversationSceneInputPack } from '../../core/world-state/conversation/models.js';
import type {
  AgentProposalEnvelope,
  AgentArbiterResult,
  AgentRunTrace,
} from '../../core/world-state/agents/proposal.js';
import {
  buildAgentProposalEnvelope,
  arbitrateAgentProposals,
  buildAgentRunTrace,
} from '../../core/world-state/agents/proposal.js';
import type { AgentHarnessObservation } from '../../core/world-state/agents/observation.js';
import { buildAgentHarnessObservation } from '../../core/world-state/agents/observation.js';
import type { AgentEvaluationReport } from '../../core/world-state/agents/evaluationReport.js';
import { buildAgentEvaluationReport } from '../../core/world-state/agents/evaluationReport.js';
import type { AgentShadowReport } from '../../core/world-state/agents/shadowReport.js';
import { buildAgentShadowReport } from '../../core/world-state/agents/shadowReport.js';
import type { ConversationEvaluationReport } from '../../core/world-state/agents/conversationEvaluation.js';
import { buildConversationEvaluationReport } from '../../core/world-state/agents/conversationEvaluation.js';
import { resolveAgentToolManifest } from '../../core/world-state/agents/toolRegistry.js';
import type { CaseAgentMeshHarnessReport } from './caseMeshHarness.js';
import { buildCaseAgentMeshPlan } from './caseMesh.js';
import { buildCaseAgentMeshHarnessReport } from './caseMeshHarness.js';
import { buildFallbackConversationEffectProposal } from '../wechatConversation.js';
import { buildWechatAgentRuntime } from './wechatAgentAdapter.js';

// ---------------------------------------------------------------------------
// Forbidden tool claim validator
// ---------------------------------------------------------------------------

interface ForbiddenToolPattern {
  readonly toolId: string;
  readonly patterns: readonly RegExp[];
}

const FORBIDDEN_TOOL_PATTERNS: readonly ForbiddenToolPattern[] = [
  {
    toolId: 'state.writeDirectly',
    patterns: [
      /已经改[了到好完]/,
      /已经调整[了到好]/,
      /已更新状态/,
      /已写入/,
      /已操作[了完]/,
      /状态已[经]?改/,
    ],
  },
  {
    toolId: 'price.changeDirectly',
    patterns: [
      /已经把价[格]?[改调][到了为]/,
      /[已就把]价[格]?[已调改][到了为]/,
      /挂牌价已[经]?[改为]/,
      /价格已[经]?调整为/,
      /[已就把][价挂][下调][降到]了?\s*\d/,
      /已[经]?[下上]调[到了]/,
    ],
  },
  {
    toolId: 'deal.closeDirectly',
    patterns: [
      /已经成交/,
      /已[经]?签约/,
      /已[经]?关闭[了交]/,
      /成交价[格是为]/,
      /已[经]?售出/,
      /已[经]?卖[了出]/,
      /已[经]?过户/,
    ],
  },
];

export function validateProposalDoesNotClaimForbiddenTools(proposal: ConversationEffectProposal): {
  ok: boolean;
  reason?: string;
  bounded?: boolean;
} {
  const text = `${proposal.summary} ${proposal.recipientReply}`;
  const violations: string[] = [];

  for (const { toolId, patterns } of FORBIDDEN_TOOL_PATTERNS) {
    for (const pattern of patterns) {
      if (pattern.test(text)) {
        violations.push(`${toolId} claimed: "${text.match(pattern)?.[0]}"`);
        break; // one match per tool is enough
      }
    }
  }

  if (violations.length > 0) {
    return {
      ok: false,
      reason: `proposal_claims_forbidden_action: ${violations.join('; ')}`,
      bounded: true,
    };
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// WeChat delta bounds validator (injected into generic arbiter)
// ---------------------------------------------------------------------------

const WECHAT_DELTA_BOUNDS = {
  trustDelta: { min: -5, max: 6 },
  patienceDelta: { min: -5, max: 6 },
  urgencyDelta: { min: -6, max: 6 },
  priceFlexibilityDelta: { min: -6, max: 10 },
  customerIntentDelta: { min: -8, max: 8 },
  customerConfidenceDelta: { min: -8, max: 8 },
} as const;

function validateWechatDeltaBounds(proposal: ConversationEffectProposal): {
  ok: boolean;
  reason?: string;
  bounded?: boolean;
} {
  const violations: string[] = [];
  for (const [key, bounds] of Object.entries(WECHAT_DELTA_BOUNDS)) {
    const value = (proposal as unknown as Record<string, unknown>)[key];
    if (typeof value === 'number' && (value < bounds.min || value > bounds.max)) {
      violations.push(`${key}=${value} outside [${bounds.min},${bounds.max}]`);
    }
  }
  if (violations.length > 0) {
    return { ok: false, reason: `delta_out_of_bounds: ${violations.join('; ')}`, bounded: true };
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Dual runtime configuration
// ---------------------------------------------------------------------------

export interface WechatDualRuntimeOptions {
  readonly llmProposal?: ConversationEffectProposal | null;
  readonly llmError?: string | null;
  readonly durationUs?: number | null;
  readonly modelId?: string;
  readonly provider?: string;
}

// ---------------------------------------------------------------------------
// Dual runtime result
// ---------------------------------------------------------------------------

export interface WechatDualRuntimeResult {
  readonly ruleProposal: AgentProposalEnvelope<ConversationEffectProposal>;
  readonly llmProposal: AgentProposalEnvelope<ConversationEffectProposal> | null;
  readonly arbiterResult: AgentArbiterResult<ConversationEffectProposal>;
  readonly trace: AgentRunTrace;
  readonly observation: AgentHarnessObservation;
  readonly shadowReport: AgentShadowReport;
  readonly evaluationReport: AgentEvaluationReport;
  readonly meshReport: CaseAgentMeshHarnessReport | null;
}

// ---------------------------------------------------------------------------
// buildWechatDualRuntime: main entry point
// ---------------------------------------------------------------------------

export function buildWechatDualRuntime(
  scene: ConversationSceneInputPack,
  options?: WechatDualRuntimeOptions,
): WechatDualRuntimeResult {
  const llmError = options?.llmError ?? null;
  const durationUs = options?.durationUs ?? null;
  const modelId = options?.modelId;
  const provider = options?.provider;

  // Step 1: Build rule proposal (always available)
  const agent = buildWechatAgentRuntime(scene);
  const ruleEffectProposal = buildFallbackConversationEffectProposal(scene);
  const ruleProposal = buildAgentProposalEnvelope<ConversationEffectProposal>({
    proposalId: `rule:${scene.sceneId}`,
    agentId: agent.profile.agentId,
    channel: 'wechat',
    mode: 'rule',
    source: 'rule',
    confidence: ruleEffectProposal.confidence,
    proposal: ruleEffectProposal,
    evidenceRefs: scene.caseContext ? [scene.caseContext.caseId] : [],
    memoryRefs: (scene.agentMemory || []).map((fact) => fact.factId),
    inputPackRef: scene.sceneId,
    createdAtDay: scene.day,
  });

  // Step 2: Build LLM proposal only when a real proposal is provided and no error
  let llmEnvelope: AgentProposalEnvelope<ConversationEffectProposal> | null = null;
  const hasRealLlmProposal = !llmError && options?.llmProposal != null;

  if (hasRealLlmProposal) {
    llmEnvelope = buildAgentProposalEnvelope<ConversationEffectProposal>({
      proposalId: `llm:${scene.sceneId}`,
      agentId: agent.profile.agentId,
      channel: 'wechat',
      mode: 'hybrid',
      source: 'llm',
      confidence: options.llmProposal!.confidence,
      proposal: options.llmProposal!,
      evidenceRefs: scene.caseContext ? [scene.caseContext.caseId] : [],
      memoryRefs: (scene.agentMemory || []).map((fact) => fact.factId),
      inputPackRef: scene.sceneId,
      createdAtDay: scene.day,
    });
  }

  // Step 3: Arbitrate with composed validators (delta bounds + forbidden tool claims)
  const arbiterResult = arbitrateAgentProposals<ConversationEffectProposal>({
    ruleProposal,
    llmProposal: llmEnvelope,
    validateLlmProposal: (proposal) => {
      const deltaResult = validateWechatDeltaBounds(proposal);
      if (!deltaResult.ok) return deltaResult;
      return validateProposalDoesNotClaimForbiddenTools(proposal);
    },
  });

  // Step 4: If LLM errored, annotate the arbiter result
  let finalArbiterResult = arbiterResult;
  if (llmError && arbiterResult.acceptedSource === 'rule') {
    finalArbiterResult = {
      ...arbiterResult,
      reason: `LLM error: ${llmError}; ${arbiterResult.reason}`,
      rejectedReasons: ['llm_error', ...arbiterResult.rejectedReasons],
    };
  }

  // Step 5: Build trace
  const trace = buildAgentRunTrace({
    traceId: `trace:${scene.sceneId}`,
    agentId: agent.profile.agentId,
    channel: 'wechat',
    day: scene.day,
    visibleRefs: [
      scene.sourceMessageId,
      scene.caseContext?.caseId,
      scene.opportunityContext?.opportunityId,
    ].filter((v): v is string => Boolean(v)),
    memoryFactIds: (scene.agentMemory || []).map((fact) => fact.factId),
    pressure: agent.perception.pressure,
    uncertainty: agent.perception.uncertainty,
    ruleSource: ruleProposal.source,
    llmSource: llmEnvelope?.source ?? null,
    arbiterDecision: finalArbiterResult.reason,
    acceptedSource: finalArbiterResult.acceptedSource,
    ruleConfidence: ruleProposal.confidence,
    llmConfidence: llmEnvelope?.confidence ?? null,
    durationUs,
    validationNotes: finalArbiterResult.validationNotes,
    modelId,
    provider,
    llmError: llmError ?? undefined,
  });

  const toolManifest = resolveAgentToolManifest({ channel: 'wechat', mode: 'hybrid' });
  const observation = buildAgentHarnessObservation({
    observationId: `observation:${scene.sceneId}`,
    runId: scene.runId,
    trace,
    contextPackRef: scene.caseContextPack?.packId,
    contextBudgetSummary: scene.caseContextPack?.contextBudget.summary,
    toolManifest,
    ruleProposal,
    llmProposal: llmEnvelope,
    arbiterResult: finalArbiterResult,
  });
  const shadowReport = buildAgentShadowReport(observation);
  const evaluationReport = buildWechatEvaluationReport(scene, finalArbiterResult, observation, shadowReport);
  const meshReport = scene.caseContextPack
    ? buildCaseAgentMeshHarnessReport(buildCaseAgentMeshPlan({
        scene,
        caseContextPack: scene.caseContextPack,
      }))
    : null;

  return {
    ruleProposal,
    llmProposal: llmEnvelope,
    arbiterResult: finalArbiterResult,
    trace,
    observation,
    shadowReport,
    evaluationReport,
    meshReport,
  };
}

function buildWechatEvaluationReport(
  scene: ConversationSceneInputPack,
  arbiterResult: AgentArbiterResult<ConversationEffectProposal>,
  observation: AgentHarnessObservation,
  shadowReport: AgentShadowReport,
): AgentEvaluationReport {
  const baseReport = buildAgentEvaluationReport(observation, shadowReport);
  const conversationReport = buildConversationEvaluationReport({
    conversationKey: scene.conversationKey,
    channel: 'wechat',
    day: scene.day,
    actorLabel: scene.sourceMessage.senderName,
    sourceMessage: {
      content: scene.sourceMessage.content,
      primaryCtaLabel: scene.sourceMessage.primaryCtaLabel,
    },
    playerText: scene.playerText,
    recipientReply: arbiterResult.finalProposal.recipientReply,
    summary: arbiterResult.finalProposal.summary,
    intentKinds: arbiterResult.finalProposal.intentKinds,
    riskKinds: arbiterResult.finalProposal.riskKinds,
    evidenceUse: arbiterResult.finalProposal.evidenceUse,
    nextStep: arbiterResult.finalProposal.nextStep ?? null,
    trustDelta: arbiterResult.finalProposal.trustDelta,
    patienceDelta: arbiterResult.finalProposal.patienceDelta,
    urgencyDelta: arbiterResult.finalProposal.urgencyDelta,
    priceFlexibilityDelta: arbiterResult.finalProposal.priceFlexibilityDelta,
    customerIntentDelta: arbiterResult.finalProposal.customerIntentDelta,
    customerConfidenceDelta: arbiterResult.finalProposal.customerConfidenceDelta,
  });

  const shouldEscalateConversationReview = conversationReport.status === 'review' && shadowReport.status !== 'no-shadow';

  return Object.freeze({
    ...baseReport,
    status: baseReport.status === 'review' || shouldEscalateConversationReview ? 'review' : baseReport.status,
    signals: Object.freeze([
      ...baseReport.signals,
      `conversation:score:${conversationReport.score}`,
      `conversation:status:${conversationReport.status}`,
      `conversation:verdict:${conversationReport.verdict}`,
      ...conversationReport.signals.map((signal) => `conversation:${signal}`),
    ]),
    summary: `${baseReport.summary} 微信回合：${conversationReport.summary}`,
  });
}
