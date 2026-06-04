import { describe, it, expect } from 'vitest';
import type { AiArrangementContextPack } from '../aiArrangement/contextPack';
import { buildFallbackAiArrangementProposal } from '../aiArrangement/fallbackPlanner';
import { normalizeAiArrangementProposal } from '../aiArrangement/normalizer';
import { buildAiArrangementDualRuntime } from '../agents/aiArrangementDualRuntime';

function buildMockPack(overrides: Partial<AiArrangementContextPack> = {}): AiArrangementContextPack {
  return {
    packId: 'test-pack',
    day: 1,
    currentSlot: 'am',
    energy: { remaining: 6, planned: 2, fixedReserve: 2 },
    slots: {
      am: { remainingCapacity: 2, fixedCount: 1, plannedCount: 1 },
      pm: { remainingCapacity: 3, fixedCount: 0, plannedCount: 0 },
    },
    plannedItems: [],
    fixedItems: [],
    candidateItems: [
      { itemId: 'item-1', actionId: 'first-visit', caseId: 'case-1', title: '面访天山花园', detail: '首次面访业主', energyCost: 2, durationHours: 1.5, rank: 1 },
      { itemId: 'item-2', actionId: 'showing', caseId: 'case-2', title: '带看虹桥花园', detail: '带客户看房', energyCost: 2, durationHours: 1, rank: 2 },
      { itemId: 'item-3', actionId: 'pricing-advice', caseId: 'case-1', title: '价格沟通', detail: '和业主讨论价格', energyCost: 1, durationHours: 0.5, rank: 3 },
    ],
    wechatSignals: [],
    marketSignals: [],
    constraints: [],
    ...overrides,
  };
}

describe('AI Arrangement Agent Harness', () => {
  describe('Fallback Planner', () => {
    it('should select top candidates within energy budget', () => {
      const pack = buildMockPack();
      const proposal = buildFallbackAiArrangementProposal(pack);
      expect(proposal.drafts.length).toBeLessThanOrEqual(3);
      const totalEnergy = proposal.drafts.reduce((sum, d) => sum + d.energyCost, 0);
      expect(totalEnergy).toBeLessThanOrEqual(pack.energy.remaining);
    });

    it('should not exceed slot capacity', () => {
      const pack = buildMockPack({
        slots: {
          am: { remainingCapacity: 1, fixedCount: 1, plannedCount: 1 },
          pm: { remainingCapacity: 0, fixedCount: 0, plannedCount: 0 },
        },
      });
      const proposal = buildFallbackAiArrangementProposal(pack);
      const amDrafts = proposal.drafts.filter(d => d.slot === 'am');
      expect(amDrafts.length).toBeLessThanOrEqual(1);
    });

    it('should not select disabled items', () => {
      const pack = buildMockPack({
        candidateItems: [
          { itemId: 'item-1', actionId: 'first-visit', title: '面访', detail: '', energyCost: 2, durationHours: 1, disabledReason: '精力不足' },
        ],
      });
      const proposal = buildFallbackAiArrangementProposal(pack);
      expect(proposal.drafts.length).toBe(0);
    });

    it('should return empty drafts when no candidates', () => {
      const pack = buildMockPack({ candidateItems: [] });
      const proposal = buildFallbackAiArrangementProposal(pack);
      expect(proposal.drafts.length).toBe(0);
      expect(proposal.headline).toContain('暂时');
    });
  });

  describe('Normalizer', () => {
    it('should reject unknown itemId', () => {
      const pack = buildMockPack();
      const result = normalizeAiArrangementProposal({
        headline: 'test',
        summary: 'test',
        evidenceLabels: [],
        drafts: [{ itemId: 'unknown-id', slot: 'am', title: 'test', reason: 'test', energyCost: 1, durationHours: 1 }],
      }, pack);
      expect(result.validationNotes).toContain('invalid_item:unknown-id');
      expect(result.proposal.drafts.length).toBe(0);
    });

    it('should reject duplicate itemId', () => {
      const pack = buildMockPack();
      const result = normalizeAiArrangementProposal({
        headline: 'test',
        summary: 'test',
        evidenceLabels: [],
        drafts: [
          { itemId: 'item-1', slot: 'am', title: 'test', reason: 'test', energyCost: 2, durationHours: 1 },
          { itemId: 'item-1', slot: 'am', title: 'test', reason: 'test', energyCost: 2, durationHours: 1 },
        ],
      }, pack);
      expect(result.validationNotes).toContain('duplicate_item:item-1');
      expect(result.proposal.drafts.length).toBe(1);
    });

    it('should reject when energy exceeded', () => {
      const pack = buildMockPack({ energy: { remaining: 1, planned: 0, fixedReserve: 0 } });
      const result = normalizeAiArrangementProposal({
        headline: 'test',
        summary: 'test',
        evidenceLabels: [],
        drafts: [{ itemId: 'item-1', slot: 'am', title: 'test', reason: 'test', energyCost: 2, durationHours: 1 }],
      }, pack);
      expect(result.validationNotes).toContain('exceeds_energy:item-1');
      expect(result.proposal.drafts.length).toBe(0);
    });

    it('should accept valid proposal', () => {
      const pack = buildMockPack();
      const result = normalizeAiArrangementProposal({
        headline: '建议先排：面访天山花园',
        summary: '先把最影响今日节奏的事排进去',
        evidenceLabels: ['可排余量 6 小时'],
        drafts: [{ itemId: 'item-1', slot: 'am', title: '面访天山花园', reason: '首次面访', energyCost: 2, durationHours: 1.5 }],
        confidence: 0.8,
      }, pack);
      expect(result.validationNotes.length).toBe(0);
      expect(result.proposal.drafts.length).toBe(1);
      expect(result.proposal.source).toBe('ai');
    });
  });

  describe('Dual Runtime', () => {
    it('should use fallback when LLM error', () => {
      const pack = buildMockPack();
      const result = buildAiArrangementDualRuntime(pack, { llmError: 'model_not_available' });
      expect(result.arbiterResult.acceptedSource).toBe('rule');
      expect(result.llmProposal).toBeNull();
    });

    it('should use LLM when valid proposal provided', () => {
      const pack = buildMockPack();
      const llmProposal = {
        proposalId: 'llm-test',
        source: 'ai' as const,
        confidence: 0.85,
        headline: 'AI 建议',
        summary: 'AI 生成的安排',
        evidenceLabels: ['AI 分析'],
        drafts: [{ itemId: 'item-1', slot: 'am' as const, title: '面访', reason: 'AI 理由', energyCost: 2, durationHours: 1.5 }],
      };
      const result = buildAiArrangementDualRuntime(pack, { llmProposal });
      expect(result.arbiterResult.acceptedSource).toBe('llm');
      expect(result.llmProposal).not.toBeNull();
    });
  });
});
