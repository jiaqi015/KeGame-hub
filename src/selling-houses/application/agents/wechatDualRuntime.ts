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
import { buildFallbackConversationEffectProposal } from '../wechatConversation.js';
import { buildWechatAgentRuntime } from './wechatAgentAdapter.js';

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
}

// ---------------------------------------------------------------------------
// Dual runtime result
// ---------------------------------------------------------------------------

export interface WechatDualRuntimeResult {
  readonly ruleProposal: AgentProposalEnvelope<ConversationEffectProposal>;
  readonly llmProposal: AgentProposalEnvelope<ConversationEffectProposal> | null;
  readonly arbiterResult: AgentArbiterResult<ConversationEffectProposal>;
  readonly trace: AgentRunTrace;
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

  // Step 3: Arbitrate with WeChat delta validator
  const arbiterResult = arbitrateAgentProposals<ConversationEffectProposal>({
    ruleProposal,
    llmProposal: llmEnvelope,
    validateLlmProposal: validateWechatDeltaBounds,
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
  });

  return {
    ruleProposal,
    llmProposal: llmEnvelope,
    arbiterResult: finalArbiterResult,
    trace,
  };
}
