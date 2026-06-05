import { describe, it, expect } from 'vitest';
import type { AiArrangementContextPack } from '../aiArrangement/contextPack';
import { buildReasonedProposal } from '../aiArrangement/reasoningEngine';

function item(id: string, energyCost: number, slot?: 'am' | 'pm', rank?: number) {
  return { itemId: id, actionId: `action-${id}`, title: `任务${id}`, detail: `详情${id}`, energyCost, durationHours: 1, slot, rank };
}

function buildPack(overrides: Partial<AiArrangementContextPack> = {}): AiArrangementContextPack {
  return {
    packId: 'test', day: 1, currentSlot: 'am',
    energy: { remaining: 6, planned: 2, fixedReserve: 2 },
    slots: { am: { remainingCapacity: 3, fixedCount: 1, plannedCount: 1 }, pm: { remainingCapacity: 3, fixedCount: 0, plannedCount: 0 } },
    plannedItems: [], fixedItems: [],
    candidateItems: [item('default', 2)],
    wechatSignals: [], marketSignals: [], constraints: [],
    ...overrides,
  };
}

describe('AI Arrangement Reasoning Engine', () => {
  it('should return no-decision proposal when no candidates', () => {
    const pack = buildPack({ candidateItems: [] });
    const proposal = buildReasonedProposal(pack);
    expect(proposal.drafts.length).toBe(0);
    expect(proposal.headline).toContain('暂时');
  });

  it('should return no-decision proposal when energy is 0', () => {
    const pack = buildPack({ energy: { remaining: 0, planned: 8, fixedReserve: 2 } });
    const proposal = buildReasonedProposal(pack);
    expect(proposal.drafts.length).toBe(0);
  });

  it('should generate evidence labels from signals', () => {
    const pack = buildPack({
      wechatSignals: [{ messageId: 'm1', senderName: '王姐', senderRole: 'owner', content: '催', urgency: 'high' }],
      marketSignals: [{ signalId: 's1', title: '市场', message: '下行' }],
    });
    const proposal = buildReasonedProposal(pack);
    expect(proposal.evidenceLabels.length).toBeGreaterThan(2);
  });

  it('should rank high-risk items higher', () => {
    const pack = buildPack({
      candidateItems: [
        { ...item('low-risk', 1, undefined, 5), riskLevel: 'low' },
        { ...item('high-risk', 1, undefined, 10), riskLevel: 'high' },
      ],
    });
    const proposal = buildReasonedProposal(pack);
    expect(proposal.drafts[0]?.itemId).toBe('high-risk');
  });

  it('should respect slot capacity', () => {
    const pack = buildPack({
      slots: { am: { remainingCapacity: 1, fixedCount: 2, plannedCount: 1 }, pm: { remainingCapacity: 2, fixedCount: 0, plannedCount: 0 } },
      candidateItems: [item('a', 1, 'am'), item('b', 1, 'am'), item('c', 1, 'pm')],
    });
    const proposal = buildReasonedProposal(pack);
    const amDrafts = proposal.drafts.filter(d => d.slot === 'am');
    expect(amDrafts.length).toBeLessThanOrEqual(1);
  });

  it('should respect energy budget', () => {
    const pack = buildPack({
      energy: { remaining: 2, planned: 6, fixedReserve: 2 },
      candidateItems: [item('a', 3), item('b', 2)],
    });
    const proposal = buildReasonedProposal(pack);
    const totalEnergy = proposal.drafts.reduce((s, d) => s + d.energyCost, 0);
    expect(totalEnergy).toBeLessThanOrEqual(2);
  });
});
