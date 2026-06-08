import { describe, expect, it } from 'vitest';
import {
  DEFAULT_AGENT_TOOL_DEFINITIONS,
  resolveAgentToolManifest,
  validateAgentPromptToolReferences,
} from '../agents/toolRegistry.js';
import {
  buildAgentHarnessObservation,
  summarizeAgentHarnessObservation,
} from '../agents/observation.js';
import {
  arbitrateAgentProposals,
  buildAgentProposalEnvelope,
  buildAgentArbiterResult,
  buildAgentRunTrace,
} from '../agents/proposal.js';

describe('agent harness kernel', () => {
  it('resolves channel-specific toolsets and keeps forbidden mutation tools visible as guardrails', () => {
    const manifest = resolveAgentToolManifest({
      channel: 'wechat',
      mode: 'hybrid',
      enabledToolsets: ['case-read', 'memory-read', 'dialogue-proposal'],
      disabledToolsets: ['scenario-simulation'],
    });

    expect(manifest.availableTools.map((tool) => tool.toolId)).toEqual([
      'case.getFullContext',
      'memory.retrieve',
      'dialogue.proposeEffect',
    ]);
    expect(manifest.forbiddenTools.map((tool) => tool.toolId)).toEqual([
      'state.writeDirectly',
      'price.changeDirectly',
      'deal.closeDirectly',
    ]);
    expect(manifest.promptLines.join('\n')).toContain('可用工具 case-read');
    expect(manifest.promptLines.join('\n')).toContain('禁止工具');
  });

  it('validates that prompts only reference tools in the resolved manifest', () => {
    const manifest = resolveAgentToolManifest({
      channel: 'wechat',
      mode: 'hybrid',
      enabledToolsets: ['case-read', 'dialogue-proposal'],
    });

    const validation = validateAgentPromptToolReferences({
      manifest,
      referencedToolIds: ['case.getFullContext', 'dialogue.proposeEffect', 'world.tickDirectly'],
    });

    expect(validation.ok).toBe(false);
    expect(validation.unknownToolIds).toEqual(['world.tickDirectly']);
  });

  it('builds a replayable observation that connects context, tools, proposals, and arbiter decision', () => {
    const ruleProposal = buildAgentProposalEnvelope({
      proposalId: 'rule:scene-1',
      agentId: 'wechat:owner:shaonvshi',
      channel: 'wechat',
      mode: 'rule',
      source: 'rule',
      confidence: 0.72,
      proposal: { summary: '规则兜底' },
      evidenceRefs: ['case-1'],
      memoryRefs: ['memory-1'],
      inputPackRef: 'scene-1',
      createdAtDay: 7,
    });
    const arbiterResult = buildAgentArbiterResult({
      acceptedSource: 'rule',
      finalProposal: ruleProposal.proposal,
      reason: 'rule-only mode: no LLM proposal available',
      bounded: true,
    });
    const trace = buildAgentRunTrace({
      traceId: 'trace:scene-1',
      agentId: 'wechat:owner:shaonvshi',
      channel: 'wechat',
      day: 7,
      visibleRefs: ['msg-1', 'case-1'],
      memoryFactIds: ['memory-1'],
      pressure: ['业主催促感偏强'],
      uncertainty: ['客户反馈待确认'],
      ruleSource: 'rule',
      llmSource: null,
      arbiterDecision: arbiterResult.reason,
      acceptedSource: 'rule',
      ruleConfidence: 0.72,
      llmConfidence: null,
      validationNotes: ['fallback_without_agent_trace'],
    });
    const toolManifest = resolveAgentToolManifest({ channel: 'wechat', mode: 'hybrid' });

    const observation = buildAgentHarnessObservation({
      observationId: 'obs-1',
      runId: 'run-1',
      trace,
      contextPackRef: 'case-context:case-1:7',
      contextBudgetSummary: '市场信号 5/7；已压缩',
      toolManifest,
      ruleProposal,
      llmProposal: null,
      arbiterResult,
      normalizationNotes: ['next_step_actionId_normalized:x->deep-diagnosis'],
    });

    expect(observation.context.contextPackRef).toBe('case-context:case-1:7');
    expect(observation.tools.availableToolIds).toContain('case.getFullContext');
    expect(observation.proposals.ruleProposalId).toBe('rule:scene-1');
    expect(observation.arbiter.acceptedSource).toBe('rule');
    expect(observation.replay.acceptedProposalId).toBe('rule:scene-1');
    expect(summarizeAgentHarnessObservation(observation)).toContain('wechat');
    expect(summarizeAgentHarnessObservation(observation)).toContain('rule');
  });

  it('prefers valid LLM proposals even when rule confidence is higher', () => {
    const ruleProposal = buildAgentProposalEnvelope({
      proposalId: 'rule:scene-llm-first',
      agentId: 'wechat:owner:shaonvshi',
      channel: 'wechat',
      mode: 'rule',
      source: 'rule',
      confidence: 0.92,
      proposal: { summary: '规则兜底' },
    });
    const llmProposal = buildAgentProposalEnvelope({
      proposalId: 'llm:scene-llm-first',
      agentId: 'wechat:owner:shaonvshi',
      channel: 'wechat',
      mode: 'hybrid',
      source: 'llm',
      confidence: 0.35,
      proposal: { summary: 'LLM 草稿' },
    });

    const result = arbitrateAgentProposals({
      ruleProposal,
      llmProposal,
      validateLlmProposal: () => ({ ok: true, bounded: true }),
    });

    expect(result.acceptedSource).toBe('llm');
    expect(result.finalProposal).toEqual(llmProposal.proposal);
    expect(result.rejectedReasons).toEqual([]);
    expect(result.reason).toContain('LLM-first accepted valid proposal');
  });

  it('keeps the default tool registry broad enough for scenario and world-engine agents', () => {
    const toolsets = new Set(DEFAULT_AGENT_TOOL_DEFINITIONS.map((tool) => tool.toolsetId));

    expect(toolsets).toContain('scenario-simulation');
    expect(toolsets).toContain('world-engine');
    expect(toolsets).toContain('dialogue-proposal');
  });
});
